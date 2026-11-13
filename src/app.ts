import { Router, normalizePath } from './router'
import { BaseContext } from './context'
import { HttpError } from './error'
import { handleError, compileRunner, type CompiledRoute } from './pipeline'
import type {
  AfterHandler,
  Context,
  ErrorHandler,
  JoinPath,
  MaybePromise,
  ParamsOf,
  Prettify,
  RouteEntry,
  RouteOptions,
  RouteSchema,
  Singleton,
} from './types'
import type { WsRoute, WsHandlers } from './ws/types'

type Fn = (ctx: any) => unknown
type HookName =
  | 'parse'
  | 'transform'
  | 'derive'
  | 'resolve'
  | 'beforeHandle'
  | 'afterHandle'
  | 'mapResponse'
  | 'afterResponse'
  | 'error'

type HookSet = Record<HookName, Fn[]>

const emptyHooks = (): HookSet => ({
  parse: [],
  transform: [],
  derive: [],
  resolve: [],
  beforeHandle: [],
  afterHandle: [],
  mapResponse: [],
  afterResponse: [],
  error: [],
})

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

/** Where a hook applies: this instance only, or also the parent that uses it. */
export type HookScope = 'local' | 'global'

interface RouteRecord {
  method: string
  path: string
  handler: Fn
  options: RouteOptions<any, any, any>
  hooks: HookSet
}

export interface RaikoConfig {
  /** Path prefix for every route of this instance. */
  prefix?: string
  /** Plugin name, used to deduplicate `use()` of the same plugin. */
  name?: string
  /** Max request body size in bytes. Default 10 MB. */
  bodyLimit?: number
  cookie?: { secrets?: string | string[] }
  /** Treat '/a/' and '/a' as the same route. Default true. */
  ignoreTrailingSlash?: boolean
  /** Answer 504 when a handler takes longer than this many ms. Off by default. */
  timeout?: number
}

export type AnyRaiko = Raiko<any, any, any>

/** A plugin is either another Raiko instance or a function that extends one. */
export type Plugin<In extends AnyRaiko = AnyRaiko, Out extends AnyRaiko = AnyRaiko> = (app: In) => Out

export class Raiko<
  const Prefix extends string = '',
  G extends Singleton = { decorator: {}; store: {}; derive: {} },
  Routes extends Record<string, any> = {},
> {
  readonly config: Required<Omit<RaikoConfig, 'name' | 'cookie'>> & Pick<RaikoConfig, 'name' | 'cookie'>
  readonly records: RouteRecord[] = []
  readonly wsRoutes: WsRoute[] = []
  /** hooks that apply to routes registered after them on this instance */
  private hooks: HookSet = emptyHooks()
  /** hooks that also leak into the parent on `use()` */
  private globalHooks: HookSet = emptyHooks()
  private onRequestHooks: Fn[] = []
  private notFoundHandler: Fn | null = null
  private decorators: Record<string, unknown> = {}
  readonly store: G['store'] = {} as G['store']
  private usedPlugins = new Set<string>()
  private startHooks: Fn[] = []
  private stopHooks: Fn[] = []

  private compiled: {
    router: Router<CompiledRoute>
    ws: Router<WsRoute>
    Ctx: typeof BaseContext
    list: CompiledRoute[]
  } | null = null

  /** Set by runtime adapters so the handler can upgrade WebSockets. */
  upgrader: ((request: Request, route: WsRoute, ctx: BaseContext) => Response | undefined | Promise<Response | undefined>) | null =
    null

  /** Type only: the route table read by the typed client. */
  declare readonly '~routes': Routes
  declare readonly '~singleton': G

  constructor(config: RaikoConfig = {}) {
    this.config = {
      prefix: config.prefix ? normalizePath(config.prefix) : '',
      bodyLimit: config.bodyLimit ?? 10 * 1024 * 1024,
      timeout: config.timeout ?? 0,
      ignoreTrailingSlash: config.ignoreTrailingSlash ?? true,
      name: config.name,
      cookie: config.cookie,
    }
    this.fetch = this.fetch.bind(this)
  }

  // ---------------------------------------------------------------- routes

  private add(method: string, path: string, handler: unknown, options: RouteOptions<any, any, any> = {}): any {
    if (this.compiled) throw new Error(`Cannot add route ${method} ${path} after the app started handling requests`)
    const full = joinPath(this.config.prefix, path)
    const fn: Fn = typeof handler === 'function' ? (handler as Fn) : () => handler
    if (typeof handler !== 'function') (fn as Fn & { constant?: unknown }).constant = { value: handler }
    this.records.push({ method, path: full, handler: fn, options, hooks: cloneHooks(this.hooks) })
    return this
  }

  get<const P extends string, const S extends RouteSchema = {}, R = unknown>(
    path: P,
    handler: ((ctx: Context<JoinPath<Prefix, P>, S, G>) => R) | Exclude<R, Function>,
    options?: RouteOptions<JoinPath<Prefix, P>, S, G>,
  ): Raiko<Prefix, G, Routes & AddRoute<JoinPath<Prefix, P>, 'get', S, R>> {
    return this.add('GET', path, handler, options)
  }

  post<const P extends string, const S extends RouteSchema = {}, R = unknown>(
    path: P,
    handler: ((ctx: Context<JoinPath<Prefix, P>, S, G>) => R) | Exclude<R, Function>,
    options?: RouteOptions<JoinPath<Prefix, P>, S, G>,
  ): Raiko<Prefix, G, Routes & AddRoute<JoinPath<Prefix, P>, 'post', S, R>> {
    return this.add('POST', path, handler, options)
  }

  put<const P extends string, const S extends RouteSchema = {}, R = unknown>(
    path: P,
    handler: ((ctx: Context<JoinPath<Prefix, P>, S, G>) => R) | Exclude<R, Function>,
    options?: RouteOptions<JoinPath<Prefix, P>, S, G>,
  ): Raiko<Prefix, G, Routes & AddRoute<JoinPath<Prefix, P>, 'put', S, R>> {
    return this.add('PUT', path, handler, options)
  }

  patch<const P extends string, const S extends RouteSchema = {}, R = unknown>(
    path: P,
    handler: ((ctx: Context<JoinPath<Prefix, P>, S, G>) => R) | Exclude<R, Function>,
    options?: RouteOptions<JoinPath<Prefix, P>, S, G>,
  ): Raiko<Prefix, G, Routes & AddRoute<JoinPath<Prefix, P>, 'patch', S, R>> {
    return this.add('PATCH', path, handler, options)
  }

  delete<const P extends string, const S extends RouteSchema = {}, R = unknown>(
    path: P,
    handler: ((ctx: Context<JoinPath<Prefix, P>, S, G>) => R) | Exclude<R, Function>,
    options?: RouteOptions<JoinPath<Prefix, P>, S, G>,
  ): Raiko<Prefix, G, Routes & AddRoute<JoinPath<Prefix, P>, 'delete', S, R>> {
    return this.add('DELETE', path, handler, options)
  }

  options<const P extends string, const S extends RouteSchema = {}, R = unknown>(
    path: P,
    handler: ((ctx: Context<JoinPath<Prefix, P>, S, G>) => R) | Exclude<R, Function>,
    options?: RouteOptions<JoinPath<Prefix, P>, S, G>,
  ): Raiko<Prefix, G, Routes & AddRoute<JoinPath<Prefix, P>, 'options', S, R>> {
    return this.add('OPTIONS', path, handler, options)
  }

  /** Every method. */
  all<const P extends string, const S extends RouteSchema = {}, R = unknown>(
    path: P,
    handler: ((ctx: Context<JoinPath<Prefix, P>, S, G>) => R) | Exclude<R, Function>,
    options?: RouteOptions<JoinPath<Prefix, P>, S, G>,
  ): Raiko<Prefix, G, Routes & AddRoute<JoinPath<Prefix, P>, 'get' | 'post' | 'put' | 'patch' | 'delete', S, R>> {
    for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) this.add(m, path, handler, options)
    return this as any
  }

  /** Any custom method, e.g. `route('PROPFIND', '/dav', fn)`. */
  route(method: string, path: string, handler: Fn, options?: RouteOptions<any, any, G>): this {
    return this.add(method.toUpperCase(), path, handler, options)
  }

  /** WebSocket route. Works on Bun, Node, Deno, Cloudflare Workers. */
  ws<const P extends string, const S extends RouteSchema = {}>(
    path: P,
    handlers: WsHandlers<JoinPath<Prefix, P>, S, G>,
  ): this {
    if (this.compiled) throw new Error(`Cannot add WebSocket route ${path} after the app started`)
    this.wsRoutes.push({ path: joinPath(this.config.prefix, path), handlers: handlers as any, hooks: cloneHooks(this.hooks) })
    return this
  }

  /** Group routes under a prefix. Hooks added inside stay inside. */
  group<const P extends string, R extends AnyRaiko>(
    prefix: P,
    build: (app: Raiko<JoinPath<Prefix, P>, G, {}>) => R,
  ): Raiko<Prefix, G, Routes & R['~routes']> {
    const child = new Raiko<JoinPath<Prefix, P>, G, {}>({
      ...this.config,
      prefix: joinPath(this.config.prefix, prefix),
    })
    child.hooks = cloneHooks(this.hooks)
    child.decorators = this.decorators
    ;(child as any).store = this.store
    const built = build(child)
    for (const r of built.records) this.records.push(r)
    for (const w of built.wsRoutes) this.wsRoutes.push(w)
    return this as any
  }

  // ---------------------------------------------------------------- state

  /** Add a value to every context, e.g. a database client. */
  decorate<const N extends string, V>(
    name: N,
    value: V,
  ): Raiko<Prefix, { decorator: Prettify<G['decorator'] & { [K in N]: V }>; store: G['store']; derive: G['derive'] }, Routes>
  decorate<const D extends Record<string, unknown>>(
    values: D,
  ): Raiko<Prefix, { decorator: Prettify<G['decorator'] & D>; store: G['store']; derive: G['derive'] }, Routes>
  decorate(name: string | Record<string, unknown>, value?: unknown): any {
    if (typeof name === 'string') this.decorators[name] = value
    else Object.assign(this.decorators, name)
    return this
  }

  /** Shared mutable state, available as `ctx.store`. */
  state<const N extends string, V>(
    name: N,
    value: V,
  ): Raiko<Prefix, { decorator: G['decorator']; store: Prettify<G['store'] & { [K in N]: V }>; derive: G['derive'] }, Routes>
  state<const D extends Record<string, unknown>>(
    values: D,
  ): Raiko<Prefix, { decorator: G['decorator']; store: Prettify<G['store'] & D>; derive: G['derive'] }, Routes>
  state(name: string | Record<string, unknown>, value?: unknown): any {
    if (typeof name === 'string') (this.store as Record<string, unknown>)[name] = value
    else Object.assign(this.store as object, name)
    return this
  }

  /** Compute extra context per request, before validation. */
  derive<D extends Record<string, unknown>>(
    fn: (ctx: Context<string, {}, G>) => MaybePromise<D>,
    scope: HookScope = 'local',
  ): Raiko<Prefix, { decorator: G['decorator']; store: G['store']; derive: Prettify<G['derive'] & Awaited<D>> }, Routes> {
    return this.hook('derive', fn, scope) as any
  }

  /** Like derive, but runs after validation so it can trust params, query and body. */
  resolve<D extends Record<string, unknown>>(
    fn: (ctx: Context<string, {}, G>) => MaybePromise<D>,
    scope: HookScope = 'local',
  ): Raiko<Prefix, { decorator: G['decorator']; store: G['store']; derive: Prettify<G['derive'] & Awaited<D>> }, Routes> {
    return this.hook('resolve', fn, scope) as any
  }

  // ---------------------------------------------------------------- hooks

  private hook(name: HookName, fn: Fn | Fn[], scope: HookScope): this {
    for (const f of asArray(fn)) {
      this.hooks[name].push(f)
      if (scope === 'global') this.globalHooks[name].push(f)
    }
    return this
  }

  /** Runs before routing. Return a Response (or any value) to answer early. */
  onRequest(fn: (ctx: { request: Request; path: string; set: { status: number; headers: Record<string, string> }; store: G['store'] }) => unknown): this {
    this.onRequestHooks.push(fn)
    return this
  }
  /** Custom body parser. Return undefined to fall through to the default. */
  onParse(fn: (ctx: Context<string, {}, G>) => unknown, scope: HookScope = 'local') {
    return this.hook('parse', fn, scope)
  }
  onTransform(fn: (ctx: Context<string, {}, G>) => unknown, scope: HookScope = 'local') {
    return this.hook('transform', fn, scope)
  }
  /** Return anything to skip the handler (auth guards, caches). */
  onBeforeHandle(fn: (ctx: Context<string, {}, G>) => unknown, scope: HookScope = 'local') {
    return this.hook('beforeHandle', fn, scope)
  }
  /** Return a value to replace the response. */
  onAfterHandle(fn: AfterHandler<G>, scope: HookScope = 'local') {
    return this.hook('afterHandle', fn, scope)
  }
  /** Return a Response to take over serialization. */
  mapResponse(fn: AfterHandler<G>, scope: HookScope = 'local') {
    return this.hook('mapResponse', fn, scope)
  }
  /** Runs after the response is created. Good for logging and metrics. */
  onAfterResponse(fn: (ctx: Context<string, {}, G> & { response: Response }) => unknown, scope: HookScope = 'local') {
    return this.hook('afterResponse', fn, scope)
  }
  onError(fn: ErrorHandler<G>, scope: HookScope = 'local') {
    return this.hook('error', fn, scope)
  }
  /** Custom 404. Runs when no route matches. */
  notFound(fn: (ctx: { request: Request; path: string; set: { status: number; headers: Record<string, string> } }) => unknown): this {
    this.notFoundHandler = fn
    return this
  }
  onStart(fn: (app: this) => unknown): this {
    this.startHooks.push(fn)
    return this
  }
  onStop(fn: (app: this) => unknown): this {
    this.stopHooks.push(fn)
    return this
  }

  // ---------------------------------------------------------------- plugins

  /**
   * Use a plugin: another Raiko instance (its routes, state and global hooks
   * are merged in) or a function that receives this app.
   */
  use<P extends AnyRaiko>(
    plugin: P | ((app: this) => P) | Promise<{ default: P }>,
  ): Raiko<
    Prefix,
    {
      decorator: Prettify<G['decorator'] & P['~singleton']['decorator']>
      store: Prettify<G['store'] & P['~singleton']['store']>
      derive: Prettify<G['derive'] & P['~singleton']['derive']>
    },
    Routes & SafeRoutes<P['~routes']>
  > {
    if (plugin instanceof Promise) throw new Error('Await lazy plugins before use(): app.use(await import("./x"))')
    if (typeof plugin === 'function') {
      const out = (plugin as (a: this) => P)(this)
      return (out ?? this) as any
    }
    const child = plugin as AnyRaiko
    const name = child.config.name
    if (name) {
      if (this.usedPlugins.has(name)) return this as any
      this.usedPlugins.add(name)
    }
    for (const n of child.usedPlugins) this.usedPlugins.add(n)
    Object.assign(this.decorators, child.decorators)
    Object.assign(this.store as object, child.store)
    this.onRequestHooks.push(...child.onRequestHooks)
    this.startHooks.push(...child.startHooks)
    this.stopHooks.push(...child.stopHooks)
    const parentHooks = this.hooks
    for (const r of child.records)
      this.records.push({ ...r, path: joinPath(this.config.prefix, r.path), hooks: mergeHooks(parentHooks, r.hooks) })
    for (const w of child.wsRoutes)
      this.wsRoutes.push({ ...w, path: joinPath(this.config.prefix, w.path), hooks: mergeHooks(parentHooks, w.hooks as HookSet) })
    for (const k of Object.keys(child.globalHooks) as HookName[]) {
      this.hooks[k].push(...child.globalHooks[k])
      this.globalHooks[k].push(...child.globalHooks[k])
    }
    if (child.notFoundHandler && !this.notFoundHandler) this.notFoundHandler = child.notFoundHandler
    return this as any
  }

  /** Mount any fetch handler (Hono, another framework, a static server) under a prefix. */
  mount(prefix: string, handler: { fetch: (req: Request) => MaybePromise<Response> } | ((req: Request) => MaybePromise<Response>)): this {
    const fetchFn = typeof handler === 'function' ? handler : handler.fetch.bind(handler)
    const base = joinPath(this.config.prefix, prefix)
    const forward = (ctx: BaseContext) => {
      const url = new URL(ctx.request.url)
      url.pathname = url.pathname.slice(base.length) || '/'
      return fetchFn(new Request(url, ctx.request))
    }
    for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
      this.records.push({ method: m, path: base, handler: forward, options: {}, hooks: emptyHooks() })
      this.records.push({ method: m, path: base + '/*', handler: forward, options: {}, hooks: emptyHooks() })
    }
    return this
  }

  // ---------------------------------------------------------------- runtime

  /** Freeze the route table. Called automatically on the first request. */
  compile(): this {
    if (this.compiled) return this
    const router = new Router<CompiledRoute>()
    const list: CompiledRoute[] = []
    for (const r of this.records) {
      const o = r.options
      const h = r.hooks
      const route: CompiledRoute = {
        method: r.method,
        path: r.path,
        handler: r.handler,
        schema: { body: o.body, query: o.query, params: o.params, headers: o.headers, cookie: o.cookie, response: o.response },
        parse: h.parse,
        transform: h.transform,
        derive: h.derive,
        resolve: h.resolve,
        beforeHandle: [...h.beforeHandle, ...asArray(o.beforeHandle as Fn | Fn[])],
        afterHandle: [...h.afterHandle, ...asArray(o.afterHandle as Fn | Fn[])],
        mapResponse: h.mapResponse,
        afterResponse: h.afterResponse,
        error: [...asArray(o.error as Fn | Fn[]), ...h.error],
        bodyLimit: this.config.bodyLimit,
      }
      route.run = compileRunner(route, this.onRequestHooks.length > 0)
      router.add(r.method, r.path, route)
      list.push(route)
    }
    const ws = new Router<WsRoute>()
    for (const w of this.wsRoutes) ws.add('WS', w.path, w)

    const Ctx = class extends BaseContext {}
    Object.assign(Ctx.prototype, this.decorators)
    Object.defineProperty(Ctx.prototype, 'store', { value: this.store, writable: false })
    Object.defineProperty(Ctx.prototype, '_secrets', { value: this.config.cookie?.secrets })
    this.compiled = { router, ws, Ctx, list }
    return this
  }

  /**
   * The fetch handler. Pass it to Bun.serve, Deno.serve, Workers, Vercel...
   * Returns a Response directly when nothing needs to wait, which skips a
   * Promise per request on the hot path.
   */
  fetch(request: Request, info?: { ip?: string | (() => string | undefined) }): Response | Promise<Response> {
    const { router, Ctx } = this.compiled ?? this.compile().compiled!
    const { path: rawPath, search } = splitUrl(request.url)
    let path = rawPath
    if (this.config.ignoreTrailingSlash && path.length > 1 && path.charCodeAt(path.length - 1) === 47) path = path.slice(0, -1)
    if (this.onRequestHooks.length || this.wsRoutes.length || this.config.timeout) return this.slowFetch(request, path, search, info)
    try {
      const method = request.method
      const match = router.find(method, path)
      if (!match) return this.slowFetch(request, path, search, info)
      if (match.store.noContext && !match.store.afterResponse.length) return match.store.run!(undefined as never)
      const ctx = new Ctx(request, path, search, match.params, info?.ip)
      const res = match.store.run!(ctx)
      if (match.store.afterResponse.length) {
        if (res instanceof Promise) return res.then((r) => (queueAfter(match.store.afterResponse, ctx, r), r))
        queueAfter(match.store.afterResponse, ctx, res)
      }
      return res
    } catch (err) {
      return handleError(err, this.hooks.error, request, path, { status: 200, headers: {} }, this.store)
    }
  }

  /**
   * Routes for Bun's native router (`Bun.serve({ routes })`, written in Zig).
   * Constant routes become static responses that run no JavaScript at all;
   * routes with params skip the JS router. Anything Bun cannot express
   * (wildcards, optional params, request hooks) stays on `fetch`.
   */
  nativeRoutes(ipOf?: (req: Request) => string | undefined): Record<string, Record<string, unknown>> {
    const { Ctx, list } = this.compiled ?? this.compile().compiled!
    if (this.onRequestHooks.length || this.config.timeout) return {}
    const out: Record<string, Record<string, unknown>> = {}
    for (const route of list) {
      if (/[*?]/.test(route.path) || !route.run) continue
      const methods = (out[route.path] ??= {})
      const run = route.run
      const after = route.afterResponse
      if (route.noContext && !after.length) {
        // Bun clones a static Response per request in native code
        methods[route.method] = run(undefined as never)
        continue
      }
      methods[route.method] = (req: Request & { params?: Record<string, string> }) => {
        // path and query are parsed only if the handler reads them
        const ctx = new Ctx(req, undefined as never, undefined as never, req.params ?? {}, ipOf ? () => ipOf(req) : undefined)
        const res = run(ctx)
        if (after.length) {
          if (res instanceof Promise) return res.then((r) => (queueAfter(after, ctx, r), r))
          queueAfter(after, ctx, res)
        }
        return res
      }
    }
    return out
  }

  /** Full path: onRequest hooks, WebSocket upgrades, HEAD, 404/405, timeouts. */
  private async slowFetch(request: Request, path: string, search: string, info?: { ip?: string | (() => string | undefined) }): Promise<Response> {
    const { router, ws, Ctx } = this.compiled!
    const set = { status: 200, headers: {} as Record<string, string> }
    try {
      for (const fn of this.onRequestHooks) {
        const r = await fn({ request, path, set, store: this.store })
        if (r !== undefined) {
          const { toResponse } = await import('./response')
          return await toResponse(r, set)
        }
      }

      if (this.wsRoutes.length && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
        const m = ws.find('WS', path)
        if (m) {
          const ctx = new Ctx(request, path, search, m.params, info?.ip)
          const { upgradeWebSocket } = await import('./ws/upgrade')
          const res = await upgradeWebSocket(this, m.store, ctx)
          if (res) return res
        }
      }

      const method = request.method
      let match = router.find(method, path)
      let isHead = false
      if (!match && method === 'HEAD') {
        match = router.find('GET', path)
        isHead = true
      }
      if (!match) return await this.miss(request, path, set, router)

      const ctx = new Ctx(request, path, search, match.params, info?.ip)
      // hooks that ran before routing may have set headers (CORS, rate limit): hand them over
      if (this.onRequestHooks.length) ctx.set = set
      const run = match.store.run!
      const res = await (this.config.timeout ? withTimeout(Promise.resolve(run(ctx)), this.config.timeout) : run(ctx))
      const after = match.store.afterResponse
      if (after.length) queueAfter(after, ctx, res)
      return isHead ? new Response(null, { status: res.status, headers: res.headers }) : res
    } catch (err) {
      return handleError(err, this.hooks.error, request, path, set, this.store)
    }
  }

  private async miss(request: Request, path: string, set: { status: number; headers: Record<string, string> }, router: Router<CompiledRoute>): Promise<Response> {
    const allowed = router.allowed(path)
    if (request.method === 'OPTIONS' && allowed.length) {
      return new Response(null, { status: 204, headers: { allow: [...allowed, 'OPTIONS'].join(', ') } })
    }
    if (allowed.length) {
      const err = new HttpError(405, `${request.method} is not allowed on ${path}`, {
        headers: { allow: allowed.join(', ') },
      })
      set.headers.allow = allowed.join(', ')
      return handleError(err, this.hooks.error, request, path, set, this.store)
    }
    if (this.notFoundHandler) {
      set.status = 404
      const { toResponse } = await import('./response')
      return toResponse(await this.notFoundHandler({ request, path, set }), set)
    }
    return handleError(new HttpError(404, `No route for ${request.method} ${path}`), this.hooks.error, request, path, set, this.store)
  }

  /**
   * Test helper: run a request without a server.
   * `await app.request('/users/1')`, `await app.request('/users', { method: 'POST', json: {...} })`
   */
  request(path: string, init: RequestInit & { json?: unknown; query?: Record<string, string | number> } = {}): Promise<Response> {
    const { json, query, ...rest } = init
    let url = path.startsWith('http') ? path : `http://localhost${path.startsWith('/') ? '' : '/'}${path}`
    if (query) {
      const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()
      url += (url.includes('?') ? '&' : '?') + qs
    }
    if (json !== undefined) {
      rest.body = JSON.stringify(json)
      rest.headers = { 'content-type': 'application/json', ...(rest.headers as Record<string, string>) }
      rest.method ??= 'POST'
    }
    return Promise.resolve(this.fetch(new Request(url, rest)))
  }

  /** Alias kept for people coming from Elysia. */
  handle(request: Request): Promise<Response> {
    return Promise.resolve(this.fetch(request))
  }

  /**
   * Start a server on the current runtime (Bun, Node or Deno).
   * `cluster: true` runs one process per CPU core on the same port.
   */
  async listen(port: number | string = 3000, opts: { hostname?: string; onListen?: (url: string) => void; native?: boolean; cluster?: boolean | number } = {}) {
    const { serve } = await import('./adapters/serve')
    for (const fn of this.startHooks) await fn(this)
    return serve(this, Number(port), opts)
  }

  async stop(): Promise<void> {
    for (const fn of this.stopHooks) await fn(this)
  }

  /** Publish to every WebSocket subscribed to a topic. */
  publish(topic: string, data: unknown): number {
    // late import keeps the core free of WebSocket code until used
    const hub = (globalThis as any).__raikoHub as import('./ws/hub').Hub | undefined
    return hub ? hub.publish(topic, data) : 0
  }

  /** List of routes, handy for debugging and docs. */
  get routes(): { method: string; path: string; detail?: unknown; schema: RouteSchema }[] {
    return this.records.map((r) => ({
      method: r.method,
      path: r.path,
      detail: r.options.detail,
      schema: { body: r.options.body, query: r.options.query, params: r.options.params, headers: r.options.headers, response: r.options.response },
    }))
  }
}

type IsAny<T> = 0 extends 1 & T ? true : false
/** A plugin typed as "any app" must not erase the route table of the app that uses it. */
type SafeRoutes<R> = IsAny<R> extends true ? {} : string extends keyof R ? {} : R

/** Route table entry added by `get`, `post`, ... for the typed client. */
export type AddRoute<P extends string, M extends string, S extends RouteSchema, R> = {
  [K in P]: { [X in M]: RouteEntry<S, Prettify<ParamsOf<P>>, R> }
}

function cloneHooks(h: HookSet): HookSet {
  const out = emptyHooks()
  for (const k of Object.keys(h) as HookName[]) out[k] = [...h[k]]
  return out
}

function mergeHooks(parent: HookSet, child: HookSet): HookSet {
  const out = emptyHooks()
  for (const k of Object.keys(out) as HookName[]) {
    const seen = new Set<Fn>()
    for (const f of [...parent[k], ...child[k]]) if (!seen.has(f)) (seen.add(f), out[k].push(f))
  }
  return out
}

export function joinPath(prefix: string, path: string): string {
  const p = normalizePath(path)
  if (!prefix) return p
  return p === '/' ? normalizePath(prefix) : normalizePath(prefix) + p
}

/** Pull path and query out of a URL string without building a URL object. */
export function splitUrl(url: string): { path: string; search: string } {
  let start = url.indexOf('://')
  start = start === -1 ? 0 : url.indexOf('/', start + 3)
  if (start === -1) return { path: '/', search: '' }
  let q = url.indexOf('?', start)
  const hash = url.indexOf('#', start)
  if (hash !== -1 && q > hash) q = -1
  const end = q !== -1 ? q : hash !== -1 ? hash : url.length
  const path = url.slice(start, end) || '/'
  const search = q === -1 ? '' : url.slice(q + 1, hash > q ? hash : url.length)
  return { path, search }
}

function withTimeout(p: Promise<Response>, ms: number): Promise<Response> {
  let timer: ReturnType<typeof setTimeout>
  const t = new Promise<Response>((r) => {
    timer = setTimeout(() => r(new HttpError(504, `Request took longer than ${ms}ms`).toResponse()), ms)
  })
  return Promise.race([p, t]).finally(() => clearTimeout(timer))
}

function queueAfter(fns: Fn[], ctx: BaseContext, response: Response) {
  ;(ctx as any).response = response
  queueMicrotask(async () => {
    for (const fn of fns) {
      try {
        await fn(ctx)
      } catch (e) {
        console.error('[raiko] onAfterResponse failed:', e)
      }
    }
  })
}
