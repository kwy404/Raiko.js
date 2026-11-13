/** OpenAPI 3.1 document generated from route schemas, plus a docs page. */
import { Raiko, type AnyRaiko } from '../app'
import { toJsonSchema, type AnySchema } from '../schema'
import { isTSchema } from '../schema'

export interface OpenApiOptions {
  path?: string
  title?: string
  version?: string
  description?: string
  servers?: { url: string; description?: string }[]
}

function objectParams(schema: AnySchema | undefined, where: 'path' | 'query' | 'header') {
  if (!schema) return []
  const json = toJsonSchema(schema) as { properties?: Record<string, unknown>; required?: string[] }
  return Object.entries(json.properties ?? {}).map(([name, s]) => ({ name, in: where, required: where === 'path' || (json.required ?? []).includes(name), schema: s }))
}

export function buildOpenApi(app: AnyRaiko, o: OpenApiOptions = {}) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const r of app.routes) {
    const detail = (r.detail ?? {}) as Record<string, unknown>
    if (detail.hide || r.path.startsWith('/_raiko') || r.method === 'HEAD') continue
    const p = r.path.replace(/:(\w+)\??/g, '{$1}').replace(/\*(\w*)/, (_, n) => `{${n || 'wildcard'}}`)
    const declared = new Set(objectParams(r.schema.params, 'path').map((x) => x.name))
    const pathParams = [...r.path.matchAll(/:(\w+)/g)].map((m) => m[1]!).filter((n) => !declared.has(n)).map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } }))
    const responses: Record<string, unknown> = {}
    const res = r.schema.response
    if (res && (isTSchema(res) || '~standard' in (res as object))) responses['200'] = { description: 'OK', content: { 'application/json': { schema: toJsonSchema(res as AnySchema) } } }
    else if (res) for (const [code, s] of Object.entries(res as Record<string, AnySchema>)) responses[code] = { description: code, content: { 'application/json': { schema: toJsonSchema(s) } } }
    else responses['200'] = { description: 'OK' }
    if (r.schema.body || r.schema.params || r.schema.query) responses['422'] = { description: 'Validation failed', content: { 'application/problem+json': {} } }
    ;(paths[p] ??= {})[r.method.toLowerCase()] = {
      ...detail,
      parameters: [...pathParams, ...objectParams(r.schema.params, 'path'), ...objectParams(r.schema.query, 'query'), ...objectParams(r.schema.headers, 'header')],
      ...(r.schema.body ? { requestBody: { required: true, content: { 'application/json': { schema: toJsonSchema(r.schema.body) } } } } : {}),
      responses,
    }
  }
  return {
    openapi: '3.1.0',
    info: { title: o.title ?? 'Raiko API', version: o.version ?? '1.0.0', ...(o.description ? { description: o.description } : {}) },
    ...(o.servers ? { servers: o.servers } : {}),
    paths,
  }
}

/** GET /docs (Scalar UI) and /docs/json. Add it last so it sees every route. */
export function openapi(o: OpenApiOptions = {}) {
  const path = o.path ?? '/docs'
  return <A extends AnyRaiko>(app: A): A => {
    let doc: unknown
    return (app as AnyRaiko).use(
      new Raiko({ name: 'raiko:openapi' })
        .get(`${path}/json`, () => (doc ??= buildOpenApi(app, o)), { detail: { hide: true } })
        .get(
          path,
          () =>
            new Response(
              `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${o.title ?? 'API'} docs</title></head><body><script id="api-reference" data-url="${path}/json" data-configuration='{"theme":"deepSpace","darkMode":true}'></script><script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.25.70"></script></body></html>`,
              { headers: { 'content-type': 'text/html; charset=utf-8' } },
            ),
          { detail: { hide: true } },
        ),
    ) as A
  }
}
