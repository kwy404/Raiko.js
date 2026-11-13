/**
 * Typed client. Paths, params, body and response types come from your app:
 *
 *   const api = client<typeof app>('http://localhost:3000')
 *   const { data, error } = await api.get('/users/:id', { params: { id: '1' } })
 *   const chat = api.ws('/chat')
 */
import { RaikoClientSocket, type SocketOptions } from './socket'

export { RaikoClientSocket }
export type { SocketOptions }

type AnyApp = { '~routes': Record<string, any> }
type Routes<A> = A extends AnyApp ? A['~routes'] : Record<string, any>
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options'
type PathsFor<R, M extends Method> = { [P in keyof R]: M extends keyof R[P] ? P : never }[keyof R] & string
type Entry<R, P extends keyof R, M> = M extends keyof R[P] ? R[P][M] : never
type IsEmpty<T> = [keyof T] extends [never] ? true : false
type OkCodes = 200 | 201 | 202 | 204
type Ok<Res> = Res extends Record<number, unknown> ? Res[Extract<keyof Res, OkCodes>] : unknown
type Err<Res> = Res extends Record<number, unknown> ? { [K in Exclude<keyof Res, OkCodes>]: { status: K; value: Res[K] } }[Exclude<keyof Res, OkCodes>] : never

export type RequestOptions<E> = {
  query?: E extends { query: infer Q } ? Partial<Q> : Record<string, unknown>
  headers?: Record<string, string>
  signal?: AbortSignal
  timeout?: number
  retry?: number
} & (E extends { params: infer P } ? (IsEmpty<P> extends true ? { params?: P } : { params: P }) : { params?: Record<string, string> }) &
  (E extends { body: infer B } ? (unknown extends B ? { body?: unknown } : { body: B }) : { body?: unknown })

export interface ClientResult<D, E> {
  data: D | null
  error: E | { status: number; value: unknown } | null
  status: number
  headers: Headers
  response: Response | null
}

export interface ClientConfig {
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
  /** ms before a request is aborted, default 30000 */
  timeout?: number
  /** retries on network errors and 5xx for idempotent methods, default 0 */
  retry?: number
  credentials?: RequestCredentials
  fetch?: typeof fetch
  onRequest?: (url: string, init: RequestInit) => void | RequestInit | Promise<void | RequestInit>
  onResponse?: (res: Response) => void | Promise<void>
  onError?: (err: unknown) => void
}

const IDEMPOTENT = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function fillPath(path: string, params: Record<string, unknown> = {}): string {
  return (
    path
      // one pass, so values that contain ':' or '*' are never substituted again
      .replace(/:(\w+)\??|\*(\w*)/g, (m, p, w) =>
        m[0] === ':' ? (params[p] === undefined ? '' : encodeSegment(String(params[p]))) : String(params[w || '*'] ?? '').split('/').map(encodeSegment).join('/'),
      )
      .replace(/\/+/g, '/')
      .replace(/(.)\/$/, '$1') || '/'
  )
}

/** "." and ".." (even percent encoded) are path navigation in every URL parser, so they are refused */
const encodeSegment = (v: string) => {
  if (v === '.' || v === '..') throw new TypeError(`error[RK0901]: "${v}" is not a valid path parameter\n  = help: it would move the request to a different endpoint`)
  return encodeURIComponent(v)
}

export function buildQuery(q?: Record<string, unknown>): string {
  if (!q) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) for (const x of v) sp.append(k, String(x))
    else sp.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export function client<A extends AnyApp = AnyApp>(baseUrl: string, config: ClientConfig = {}) {
  type R = Routes<A>
  const base = baseUrl.replace(/\/$/, '')
  const doFetch = config.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))

  async function send(method: string, path: string, o: any = {}): Promise<ClientResult<any, any>> {
    const url = base + fillPath(path, o.params) + buildQuery(o.query)
    const extra = typeof config.headers === 'function' ? await config.headers() : config.headers
    const headers: Record<string, string> = { accept: 'application/json', ...extra, ...o.headers }
    let body: BodyInit | undefined
    if (o.body !== undefined) {
      const b = o.body
      if (b instanceof FormData || b instanceof Blob || typeof b === 'string' || b instanceof URLSearchParams) body = b
      else {
        body = JSON.stringify(b)
        headers['content-type'] ??= 'application/json'
      }
    }
    let init: RequestInit = { method, headers, body, credentials: config.credentials }
    const changed = await config.onRequest?.(url, init)
    if (changed) init = changed
    const retries = o.retry ?? config.retry ?? 0
    for (let attempt = 0; ; attempt++) {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), o.timeout ?? config.timeout ?? 30_000)
      o.signal?.addEventListener('abort', () => ac.abort())
      try {
        const res = await doFetch(url, { ...init, signal: ac.signal })
        clearTimeout(timer)
        if (res.status >= 500 && attempt < retries && IDEMPOTENT.has(method)) {
          await sleep(2 ** attempt * 200)
          continue
        }
        await config.onResponse?.(res)
        const type = res.headers.get('content-type') ?? ''
        const value = res.status === 204 ? null : type.includes('json') ? await res.json() : type.startsWith('text/') ? await res.text() : await res.blob()
        return res.ok
          ? { data: value, error: null, status: res.status, headers: res.headers, response: res }
          : { data: null, error: { status: res.status, value }, status: res.status, headers: res.headers, response: res }
      } catch (err) {
        clearTimeout(timer)
        if (attempt < retries && IDEMPOTENT.has(method)) {
          await sleep(2 ** attempt * 200)
          continue
        }
        config.onError?.(err)
        const value = (err as Error).name === 'AbortError' ? 'timeout' : String(err)
        return { data: null, error: { status: 0, value }, status: 0, headers: new Headers(), response: null }
      }
    }
  }

  type Call<M extends Method> = <P extends PathsFor<R, M>>(
    path: P,
    ...opts: IsEmpty<Entry<R, P, M>['params']> extends true ? [RequestOptions<Entry<R, P, M>>?] : [RequestOptions<Entry<R, P, M>>]
  ) => Promise<ClientResult<Ok<Entry<R, P, M>['response']>, Err<Entry<R, P, M>['response']>>>

  const make = <M extends Method>(m: M): Call<M> => ((path: string, o?: unknown) => send(m.toUpperCase(), path, o)) as Call<M>

  return {
    get: make('get'),
    post: make('post'),
    put: make('put'),
    patch: make('patch'),
    delete: make('delete'),
    options: make('options'),
    /** Open a WebSocket. Reconnects, queues messages and handles encryption by itself. */
    ws<In = unknown, Out = unknown>(path: string, o: SocketOptions & { params?: Record<string, string>; query?: Record<string, unknown> } = {}) {
      const origin = base.startsWith('http') ? base : (typeof location !== 'undefined' ? location.origin : '') + base
      return new RaikoClientSocket<In, Out>(origin.replace(/^http/, 'ws') + fillPath(path, o.params) + buildQuery(o.query), o)
    },
  }
}

export type RaikoClient<A extends AnyApp> = ReturnType<typeof client<A>>
