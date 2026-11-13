import { parseQuery } from './body'
import { Cookies } from './cookie'
import { STATUS_MARK, type SetOptions, type StatusResponse } from './types'

/**
 * Base request context. Query, headers and cookies are parsed lazily, so a
 * handler that never reads them never pays for them. Each app subclasses
 * this once and puts its decorators and store on the prototype.
 */
export class BaseContext {
  // every field is assigned in the constructor, always in the same order:
  // one hidden class for every request, which the JIT optimizes best
  declare request: Request
  declare private _path: string | undefined
  declare params: Record<string, any>
  declare body: unknown
  /** a value, or a function the runtime gives us: asking Bun for the IP is a syscall, so only on read */
  declare private _ip: string | undefined | (() => string | undefined)
  /** filled by `store` on the per-app prototype */
  declare store: Record<string, unknown>
  /** cookie secrets, set on the per-app prototype */
  declare _secrets: string | string[] | undefined
  declare private _search: string
  /** created on first access: most handlers never touch these */
  declare private _set: SetOptions | undefined
  declare private _query: Record<string, unknown> | undefined
  declare private _headers: Record<string, string> | undefined
  declare private _cookie: Cookies | undefined

  constructor(request: Request, path: string, search: string, params: Record<string, string>, ip?: string | (() => string | undefined)) {
    this.request = request
    this._path = path
    this.params = params
    this.body = undefined
    this._ip = ip
    this._search = search
    this._set = undefined
    this._query = undefined
    this._headers = undefined
    this._cookie = undefined
  }

  /** pathname without query string; parsed from the URL only when read */
  get path(): string {
    if (this._path === undefined) {
      const url = this.request.url
      const start = url.indexOf('/', url.indexOf('://') + 3)
      const q = url.indexOf('?', start)
      this._path = start === -1 ? '/' : url.slice(start, q === -1 ? undefined : q)
      if (this._search === undefined) this._search = q === -1 ? '' : url.slice(q + 1)
    }
    return this._path
  }
  set path(v: string) {
    this._path = v
  }

  get ip(): string | undefined {
    if (typeof this._ip === 'function') this._ip = this._ip()
    return this._ip
  }
  set ip(v: string | undefined) {
    this._ip = v
  }

  get method(): string {
    return this.request.method
  }

  get set(): SetOptions {
    return (this._set ??= { status: 200, headers: {} })
  }
  set set(v: SetOptions) {
    this._set = v
  }
  /** true when a hook or handler changed status or headers */
  get touchedSet(): SetOptions | undefined {
    return this._set
  }

  get query(): Record<string, any> {
    if (this._query) return this._query
    if (this._search === undefined) void this.path
    return (this._query = parseQuery(this._search))
  }
  set query(v: Record<string, any>) {
    this._query = v
  }

  get headers(): Record<string, any> {
    if (!this._headers) {
      const h: Record<string, string> = {}
      this.request.headers.forEach((v, k) => (h[k] = v))
      this._headers = h
    }
    return this._headers
  }
  set headers(v: Record<string, any>) {
    this._headers = v
  }

  get cookie(): Cookies {
    return (this._cookie ??= new Cookies(this.request.headers.get('cookie'), this._secrets))
  }

  /** true once anything touched cookies, used to emit Set-Cookie */
  get hasCookieWrites(): boolean {
    return this._cookie !== undefined && this._cookie.outgoing.length > 0
  }

  /** Bound on first access, so it still works when destructured: `({ redirect }) => redirect('/')` */
  get redirect(): (url: string, status?: 301 | 302 | 303 | 307 | 308) => Response {
    const fn = (url: string, status: 301 | 302 | 303 | 307 | 308 = 302): Response => {
      const headers = new Headers(this._set?.headers)
      headers.set('location', url)
      return new Response(null, { status, headers })
    }
    Object.defineProperty(this, 'redirect', { value: fn })
    return fn
  }

  status<const C extends number, B = undefined>(code: C, body?: B): StatusResponse<C, B> {
    return { [STATUS_MARK]: true, code, body: body as B }
  }
}

export function isStatusResponse(v: unknown): v is StatusResponse {
  return typeof v === 'object' && v !== null && (v as StatusResponse)[STATUS_MARK] === true
}
