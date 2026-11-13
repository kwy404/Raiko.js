/** CORS, secure headers, CSRF, rate limit, body limit and timeout. */
import { Raiko } from '../app'
import { HttpError } from '../error'

export interface CorsOptions {
  origin?: string | string[] | RegExp | ((origin: string) => boolean)
  methods?: string[]
  headers?: string[]
  exposeHeaders?: string[]
  credentials?: boolean
  maxAge?: number
}

export function cors(o: CorsOptions = {}) {
  if (o.credentials && (o.origin === undefined || o.origin === '*'))
    throw new Error("error[RK0403]: cors({ credentials: true }) needs an explicit origin list\n  = help: cors({ origin: ['https://app.example'], credentials: true }); a wildcard with credentials lets any site read your users' data")
  const allow = (origin: string) => {
    const x = o.origin ?? '*'
    if (x === '*') return true
    if (typeof x === 'string') return x === origin
    if (Array.isArray(x)) return x.includes(origin)
    if (x instanceof RegExp) return x.test(origin)
    return x(origin)
  }
  const methods = (o.methods ?? ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']).join(', ')
  const headersFor = (origin: string | null): Record<string, string> => {
    const h: Record<string, string> = {}
    if (!origin) return h
    if (!allow(origin)) return h
    h['access-control-allow-origin'] = o.origin === undefined || o.origin === '*' ? (o.credentials ? origin : '*') : origin
    if (h['access-control-allow-origin'] !== '*') h.vary = 'Origin'
    if (o.credentials) h['access-control-allow-credentials'] = 'true'
    if (o.exposeHeaders) h['access-control-expose-headers'] = o.exposeHeaders.join(', ')
    return h
  }
  return new Raiko({ name: 'raiko:cors' })
    .onRequest(({ request, set }) => {
      const origin = request.headers.get('origin')
      Object.assign(set.headers, headersFor(origin))
      if (request.method === 'OPTIONS' && request.headers.has('access-control-request-method')) {
        const h = new Headers(headersFor(origin))
        h.set('access-control-allow-methods', methods)
        h.set('access-control-allow-headers', o.headers?.join(', ') ?? request.headers.get('access-control-request-headers') ?? '*')
        h.set('access-control-max-age', String(o.maxAge ?? 600))
        return new Response(null, { status: 204, headers: h })
      }
    })
}

/** Sensible security headers, Helmet style. */
export function secureHeaders(o: { csp?: string | false; hsts?: boolean } = {}) {
  const h: Record<string, string> = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'cross-origin-opener-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  }
  if (o.hsts !== false) h['strict-transport-security'] = 'max-age=31536000; includeSubDomains'
  if (o.csp) h['content-security-policy'] = o.csp
  return new Raiko({ name: 'raiko:secure-headers' }).onRequest(({ set }) => void Object.assign(set.headers, h))
}

export interface RateLimitOptions {
  /** requests allowed per window, default 100 */
  max?: number
  /** window in ms, default 60_000 */
  window?: number
  /** who is counted, default the client IP */
  key?: (request: Request, ip?: string) => string
  /**
   * Trust X-Forwarded-For / CF-Connecting-IP when the runtime gives no client IP.
   * Only turn it on behind a proxy that overwrites those headers (Cloudflare, Vercel, nginx).
   */
  trustProxy?: boolean
  /** swap in Redis or anything else */
  store?: { hit(key: string, windowMs: number): Promise<{ count: number; reset: number }> | { count: number; reset: number } }
}

export function memoryStore() {
  const map = new Map<string, { count: number; reset: number }>()
  let sweeps = 0
  return {
    hit(key: string, windowMs: number) {
      const now = Date.now()
      if (++sweeps % 1000 === 0) for (const [k, v] of map) if (v.reset <= now) map.delete(k)
      let e = map.get(key)
      if (!e && map.size >= 100_000) {
        for (const [k, v] of map) if (v.reset <= now) map.delete(k)
        if (map.size >= 100_000) map.delete(map.keys().next().value!)
      }
      if (!e || e.reset <= now) map.set(key, (e = { count: 0, reset: now + windowMs }))
      e.count++
      return e
    },
  }
}

/** Fixed window rate limit with standard RateLimit headers. */
export function rateLimit(o: RateLimitOptions = {}) {
  const max = o.max ?? 100
  const win = o.window ?? 60_000
  const store = o.store ?? memoryStore()
  return new Raiko({ name: 'raiko:rate-limit' }).onBeforeHandle(async (ctx) => {
    const h = ctx.request.headers
    const proxied = o.trustProxy ? h.get('cf-connecting-ip') ?? h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() : undefined
    // without a trusted IP every unknown client shares one bucket: safe, never bypassable
    const key = o.key ? o.key(ctx.request, ctx.ip) : ctx.ip ?? proxied ?? 'unknown-client'
    const { count, reset } = await store.hit(key, win)
    const left = Math.max(0, max - count)
    const secs = Math.ceil((reset - Date.now()) / 1000)
    ctx.set.headers['ratelimit-limit'] = String(max)
    ctx.set.headers['ratelimit-remaining'] = String(left)
    ctx.set.headers['ratelimit-reset'] = String(secs)
    if (count > max) throw new HttpError(429, 'Too many requests, slow down', { headers: { 'retry-after': String(secs) } })
  }, 'global')
}

/** Rejects cross site form posts by checking Origin, no tokens needed. */
export function csrf(o: { origins?: string[] } = {}) {
  return new Raiko({ name: 'raiko:csrf' }).onBeforeHandle(({ request }) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
    const origin = request.headers.get('origin')
    const site = request.headers.get('sec-fetch-site')
    if (site === 'same-origin' || site === 'none') return
    const self = new URL(request.url).origin
    if (origin && (origin === self || o.origins?.includes(origin))) return
    if (!origin && !site) return
    throw new HttpError(403, 'Cross site request blocked', { code: 'csrf' })
  }, 'global')
}
