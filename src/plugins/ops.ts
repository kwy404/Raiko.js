/** Logger, request id, compression, ETag, response cache and health check. */
import { Raiko } from '../app'

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** One line per request: method, path, status, time. Colors in a TTY, JSON with `json: true`. */
export function logger(o: { json?: boolean; skip?: (path: string) => boolean; write?: (line: string) => void } = {}) {
  const write = o.write ?? ((l: string) => console.log(l))
  const tty = typeof process !== 'undefined' && process.stdout?.isTTY && !o.json
  const color = (s: number) => (s >= 500 ? 31 : s >= 400 ? 33 : s >= 300 ? 36 : 32)
  return new Raiko({ name: 'raiko:logger' })
    .derive(() => ({ startedAt: now() }), 'global')
    .onAfterResponse(({ request, path, response, startedAt }: any) => {
      if (o.skip?.(path)) return
      const ms = (now() - startedAt).toFixed(2)
      const s = response.status
      if (o.json) write(JSON.stringify({ t: new Date().toISOString(), method: request.method, path, status: s, ms: Number(ms), id: request.headers.get('x-request-id') ?? undefined }))
      else write(tty ? `\x1b[2m${request.method}\x1b[0m ${path} \x1b[${color(s)}m${s}\x1b[0m \x1b[2m${ms}ms\x1b[0m` : `${request.method} ${path} ${s} ${ms}ms`)
    }, 'global')
}

/** Reuses an incoming X-Request-Id or creates one, and echoes it back. */
export function requestId(o: { header?: string } = {}) {
  const h = o.header ?? 'x-request-id'
  return new Raiko({ name: 'raiko:request-id' }).derive(({ request, set }) => {
    const incoming = request.headers.get(h)
    const id = incoming && /^[\w.-]{1,128}$/.test(incoming) ? incoming : crypto.randomUUID()
    set.headers[h] = id
    return { requestId: id }
  }, 'global')
}

/** gzip / deflate with the built in CompressionStream. Skips small and already compressed bodies. */
export function compress(o: { threshold?: number } = {}) {
  const threshold = o.threshold ?? 1024
  const type = /^(text\/|application\/(json|javascript|xml|problem\+json)|image\/svg)/
  return new Raiko({ name: 'raiko:compress' }).onAfterHandle(async (ctx: any) => {
    const { toResponse } = await import('../response')
    const res: Response = ctx.response instanceof Response ? ctx.response : await toResponse(ctx.response, ctx.set)
    const accept = ctx.request.headers.get('accept-encoding') ?? ''
    const enc = accept.includes('gzip') ? 'gzip' : accept.includes('deflate') ? 'deflate' : null
    const len = Number(res.headers.get('content-length') ?? threshold)
    if (!enc || !res.body || res.headers.has('content-encoding') || !type.test(res.headers.get('content-type') ?? '') || len < threshold || typeof CompressionStream === 'undefined')
      return res
    const h = new Headers(res.headers)
    h.set('content-encoding', enc)
    h.delete('content-length')
    h.append('vary', 'Accept-Encoding')
    return new Response(res.body.pipeThrough(new CompressionStream(enc) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>), { status: res.status, headers: h })
  }, 'global')
}

/** Weak ETag from a SHA-1 of the body, answers 304 when it matches. */
export function etag() {
  return new Raiko({ name: 'raiko:etag' }).onAfterHandle(async (ctx: any) => {
    if (ctx.request.method !== 'GET') return
    const { toResponse } = await import('../response')
    const res: Response = ctx.response instanceof Response ? ctx.response : await toResponse(ctx.response, ctx.set)
    if (res.status !== 200 || !res.body || res.headers.has('etag') || (res.headers.get('content-type') ?? '').includes('event-stream')) return res
    const buf = await res.arrayBuffer()
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', buf)).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
    const tag = `W/"${hash}"`
    const h = new Headers(res.headers)
    h.set('etag', tag)
    if (ctx.request.headers.get('if-none-match') === tag) return new Response(null, { status: 304, headers: h })
    return new Response(buf, { status: 200, headers: h })
  }, 'global')
}

/** In memory GET cache. `ttl` in seconds. Use per route with `cache.wrap`. */
export function responseCache(o: { ttl?: number; max?: number } = {}) {
  const ttl = (o.ttl ?? 60) * 1000
  const max = o.max ?? 1000
  const store = new Map<string, { body: ArrayBuffer; status: number; headers: [string, string][]; until: number }>()
  return new Raiko({ name: 'raiko:cache' })
    .onBeforeHandle(({ request }) => {
      // personalized requests are never served from or written to the shared cache
      if (request.method !== 'GET' || request.headers.has('cookie') || request.headers.has('authorization')) return
      const hit = store.get(request.url)
      if (!hit || hit.until < Date.now()) return
      return new Response(hit.body, { status: hit.status, headers: [...hit.headers, ['x-cache', 'HIT']] })
    }, 'global')
    .onAfterHandle(async (ctx: any) => {
      if (ctx.request.method !== 'GET' || ctx.request.headers.has('cookie') || ctx.request.headers.has('authorization')) return
      const { toResponse } = await import('../response')
      const res: Response = ctx.response instanceof Response ? ctx.response : await toResponse(ctx.response, ctx.set)
      const cc = res.headers.get('cache-control') ?? ''
      if (res.status !== 200 || res.headers.get('x-cache') === 'HIT' || res.headers.has('set-cookie') || /private|no-store/.test(cc) || (res.headers.get('content-type') ?? '').includes('event-stream')) return res
      const body = await res.arrayBuffer()
      if (store.size >= max) store.delete(store.keys().next().value!)
      store.set(ctx.request.url, { body, status: 200, headers: [...res.headers], until: Date.now() + ttl })
      return new Response(body, { status: 200, headers: res.headers })
    }, 'global')
}

/** GET /health with uptime and optional checks (database, cache...). */
export function health(o: { path?: string; checks?: Record<string, () => unknown | Promise<unknown>> } = {}) {
  const started = Date.now()
  return new Raiko({ name: 'raiko:health' }).get(o.path ?? '/health', async ({ set }) => {
    const results: Record<string, 'ok' | string> = {}
    let ok = true
    for (const [name, fn] of Object.entries(o.checks ?? {})) {
      try {
        await fn()
        results[name] = 'ok'
      } catch (e) {
        ok = false
        results[name] = (e as Error).message
      }
    }
    if (!ok) set.status = 503
    return { status: ok ? 'ok' : 'degraded', uptime: Math.round((Date.now() - started) / 1000), checks: results }
  })
}
