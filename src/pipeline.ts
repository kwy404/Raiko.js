import { parseBody } from './body'
import { HttpError, ValidationError } from './error'
import { isTSchema, validate, validateSync, type AnySchema } from './schema'
import { toResponse, fastResponse } from './response'
import type { BaseContext } from './context'
import type { ErrorContext, RouteSchema, SetOptions } from './types'

type Fn = (ctx: any) => unknown

/** Everything a single route needs at request time, already flattened. */
export interface CompiledRoute {
  method: string
  path: string
  handler: Fn
  schema: RouteSchema
  parse: Fn[]
  transform: Fn[]
  derive: Fn[]
  resolve: Fn[]
  beforeHandle: Fn[]
  afterHandle: Fn[]
  mapResponse: Fn[]
  afterResponse: Fn[]
  error: Fn[]
  bodyLimit: number
  /** chosen at compile time by compileRunner */
  run?: (ctx: BaseContext) => Response | Promise<Response>
  /** the runner never reads the context, so none is created */
  noContext?: boolean
}

const NO_BODY = new Set(['GET', 'HEAD', 'OPTIONS'])

async function check(on: string, schema: AnySchema | undefined, value: unknown, coerce: boolean): Promise<unknown> {
  if (!schema) return value
  const r = isTSchema(schema) ? validateSync(schema, value, { coerce }) : await validate(schema, value, { coerce })
  if (!r.ok) throw new ValidationError(on, r.issues)
  return r.value
}

const isPromise = (v: unknown): v is Promise<unknown> => typeof (v as Promise<unknown>)?.then === 'function'

/**
 * Pick the cheapest runner for a route once, at compile time. A route with no
 * hooks, no schema and no body to parse skips the lifecycle entirely and maps
 * its value with shared, preallocated response options.
 */
export function compileRunner(route: CompiledRoute, hasRequestHooks = false): (ctx: BaseContext) => Response | Promise<Response> {
  const s = route.schema
  const bare =
    !s.body && !s.query && !s.params && !s.headers && !s.cookie && !s.response &&
    !route.parse.length && !route.transform.length && !route.derive.length && !route.resolve.length &&
    !route.beforeHandle.length && !route.afterHandle.length && !route.mapResponse.length
  if (!bare) return (ctx) => runRoute(route, ctx)
  const handler = route.handler
  const finish = (value: unknown, ctx: BaseContext): Response | Promise<Response> => {
    if (ctx.touchedSet === undefined && !ctx.hasCookieWrites) {
      const fast = fastResponse(value)
      if (fast) return fast
    }
    return toResponse(value, ctx.set, ctx.hasCookieWrites ? ctx.cookie.outgoing : undefined)
  }
  const needsBody = route.method !== 'GET' && route.method !== 'HEAD' && route.method !== 'OPTIONS'
  if (needsBody) {
    // no hooks and no schema: parse, call, map, nothing else
    const limit = route.bodyLimit
    return async (ctx) => {
      try {
        ctx.body = await parseBody(ctx.request, limit)
        const v = handler(ctx)
        return finish(isPromise(v) ? await v : v, ctx)
      } catch (e) {
        return handleError(e, route.error, ctx.request, ctx.path, ctx.set, ctx.store)
      }
    }
  }
  // `.get('/', 'Hi')`: the value never changes, so the context is never read
  const constant = (handler as Fn & { constant?: { value: unknown } }).constant
  // onRequest hooks (CORS, rate limit) add headers, so they need the normal path
  if (constant && !hasRequestHooks && (typeof constant.value === 'string' || (typeof constant.value === 'object' && constant.value !== null && fastResponse(constant.value)))) {
    const v = constant.value
    route.noContext = true
    if (typeof v === 'string') {
      const init = { headers: { 'content-type': 'text/plain; charset=utf-8' } }
      return () => new Response(v, init)
    }
    const json = JSON.stringify(v)
    const init = { headers: { 'content-type': 'application/json' } }
    return () => new Response(json, init)
  }
  return (ctx) => {
    try {
      const v = handler(ctx)
      return isPromise(v)
        ? v.then((x) => finish(x, ctx), (e) => handleError(e, route.error, ctx.request, ctx.path, ctx.set, ctx.store))
        : finish(v, ctx)
    } catch (e) {
      return handleError(e, route.error, ctx.request, ctx.path, ctx.set, ctx.store)
    }
  }
}

/** Run one route through the full lifecycle and return a Response. */
export async function runRoute(route: CompiledRoute, ctx: BaseContext): Promise<Response> {
  try {
    if (!NO_BODY.has(ctx.method)) {
      let parsed: unknown = undefined
      for (const p of route.parse) {
        parsed = await p(ctx)
        if (parsed !== undefined) break
      }
      ctx.body = parsed !== undefined ? parsed : await parseBody(ctx.request, route.bodyLimit)
    }

    for (const fn of route.transform) await fn(ctx)
    for (const fn of route.derive) {
      const extra = await fn(ctx)
      if (extra && typeof extra === 'object') Object.assign(ctx, extra)
    }

    const s = route.schema
    if (s.params) ctx.params = (await check('params', s.params, ctx.params, true)) as Record<string, string>
    if (s.query) ctx.query = (await check('query', s.query, ctx.query, true)) as Record<string, string>
    if (s.headers) ctx.headers = (await check('headers', s.headers, ctx.headers, true)) as Record<string, string>
    if (s.cookie) await check('cookie', s.cookie, ctx.cookie.entries(), true)
    if (s.body) ctx.body = await check('body', s.body, ctx.body, isMultipartOrForm(ctx.request))

    for (const fn of route.resolve) {
      const extra = await fn(ctx)
      if (extra && typeof extra === 'object') Object.assign(ctx, extra)
    }

    let value: unknown = undefined
    for (const fn of route.beforeHandle) {
      const r = await fn(ctx)
      if (r !== undefined) {
        value = r
        break
      }
    }
    if (value === undefined) value = await route.handler(ctx)

    for (const fn of route.afterHandle) {
      ;(ctx as any).response = value
      const r = await fn(ctx)
      if (r !== undefined) value = r
    }

    if (s.response) value = await checkResponse(s.response, value, ctx.set)

    for (const fn of route.mapResponse) {
      ;(ctx as any).response = value
      const r = await fn(ctx)
      if (r instanceof Response) return r
    }
    if (ctx.touchedSet === undefined && !ctx.hasCookieWrites) {
      const fast = fastResponse(value)
      if (fast) return fast
    }
    return await toResponse(value, ctx.set, ctx.hasCookieWrites ? ctx.cookie.outgoing : undefined)
  } catch (err) {
    return handleError(err, route.error, ctx.request, ctx.path, ctx.set, ctx.store)
  }
}

function isMultipartOrForm(req: Request): boolean {
  const t = req.headers.get('content-type') ?? ''
  return t.startsWith('multipart/form-data') || t.startsWith('application/x-www-form-urlencoded')
}

async function checkResponse(schema: NonNullable<RouteSchema['response']>, value: unknown, set: SetOptions) {
  if (value instanceof Response) return value
  const statusBody =
    typeof value === 'object' && value !== null && Symbol.for('raiko.status') in value
      ? (value as { code: number; body: unknown })
      : null
  const code = statusBody ? statusBody.code : set.status
  const body = statusBody ? statusBody.body : value
  const target = isTSchema(schema) || '~standard' in (schema as object) ? schema : (schema as Record<number, AnySchema>)[code]
  if (!target) return value
  const r = await validate(target as AnySchema, body)
  if (!r.ok) {
    // the issues contain server data (maybe secrets), so they go to the log, never to the client
    console.error('[raiko] response did not match its schema:', JSON.stringify(r.issues).slice(0, 2000))
    throw new HttpError(500, 'Internal Server Error', { code: 'response_validation' })
  }
  return statusBody ? { ...statusBody, body: r.value } : r.value
}

export function errorCode(err: unknown): ErrorContext['code'] {
  if (err instanceof ValidationError) return 'VALIDATION'
  if (err instanceof HttpError) {
    if (err.status === 404) return 'NOT_FOUND'
    if (err.status === 405) return 'METHOD_NOT_ALLOWED'
    if (err.code === 'parse') return 'PARSE'
    return 'HTTP'
  }
  return 'UNKNOWN'
}

/** Give each error hook a chance to answer, then fall back to problem+json. */
export async function handleError(
  err: unknown,
  hooks: Fn[],
  request: Request,
  path: string,
  set: SetOptions,
  store: Record<string, unknown>,
): Promise<Response> {
  const error = err instanceof Error ? err : new Error(String(err))
  const code = errorCode(error)
  if (error instanceof HttpError && set.status === 200) set.status = error.status
  if (!(error instanceof HttpError)) set.status = set.status === 200 ? 500 : set.status
  for (const fn of hooks) {
    try {
      const r = await fn({ error, code, request, path, set, store })
      if (r !== undefined) return await toResponse(r, set)
    } catch (inner) {
      if (inner !== error) return withSetHeaders(new HttpError(500).toResponse(), set)
    }
  }
  if (!(error instanceof HttpError) && typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') console.error(error)
  return withSetHeaders(error instanceof HttpError ? error.toResponse() : new HttpError(500, 'Internal Server Error').toResponse(), set)
}

/** Keep headers set by hooks (CORS, rate limit) on error responses too. */
function withSetHeaders(res: Response, set: SetOptions): Response {
  for (const [k, v] of Object.entries(set.headers)) if (!res.headers.has(k)) res.headers.set(k, v)
  return res
}
