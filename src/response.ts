import { isNode, renderStream, renderToString, hasSuspense, RAW, type RawHtml } from './jsx/runtime'
import { isStatusResponse } from './context'
import type { SetOptions } from './types'

const SSE = Symbol.for('raiko.sse')

export interface SseEvent {
  [SSE]: true
  data: unknown
  event?: string
  id?: string
  retry?: number
}

/** Mark a value yielded by a generator as a named Server Sent Event. */
export function sse(data: unknown, opts: { event?: string; id?: string; retry?: number } = {}): SseEvent {
  return { [SSE]: true, data, ...opts }
}

function isSse(v: unknown): v is SseEvent {
  return typeof v === 'object' && v !== null && (v as SseEvent)[SSE] === true
}

function formatSse(v: unknown): string {
  const ev = isSse(v) ? v : { data: v }
  let out = ''
  if ('event' in ev && ev.event) out += `event: ${ev.event}\n`
  if ('id' in ev && ev.id) out += `id: ${ev.id}\n`
  if ('retry' in ev && ev.retry) out += `retry: ${ev.retry}\n`
  const data = typeof ev.data === 'string' ? ev.data : JSON.stringify(ev.data)
  for (const line of String(data).split('\n')) out += `data: ${line}\n`
  return out + '\n'
}

function isAsyncIterable(v: any): v is AsyncIterable<unknown> {
  return v !== null && typeof v === 'object' && typeof v[Symbol.asyncIterator] === 'function'
}

function isGenerator(v: any): v is Generator {
  return v !== null && typeof v === 'object' && typeof v.next === 'function' && typeof v[Symbol.iterator] === 'function'
}

function withHeaders(set: SetOptions, cookies: string[] | undefined, type?: string): Headers {
  const h = new Headers(set.headers)
  if (type && !h.has('content-type')) h.set('content-type', type)
  if (cookies) for (const c of cookies) h.append('set-cookie', c)
  return h
}

const TEXT = { headers: { 'content-type': 'text/plain; charset=utf-8' } }
const JSON_INIT = { headers: { 'content-type': 'application/json' } }

/**
 * Fast path for the common case: no custom status, headers or cookies.
 * Returns null when the slow path is needed.
 */
export function fastResponse(value: unknown): Response | null {
  switch (typeof value) {
    case 'string':
      return new Response(value, TEXT)
    case 'object':
      if (value === null || value instanceof Response || isNode(value)) return value instanceof Response ? value : null
      if (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype) {
        if ((value as Record<symbol, unknown>)[Symbol.for('raiko.status')] || (value as Record<symbol, unknown>)[Symbol.for('raiko.raw')] || (value as Record<symbol, unknown>)[SSE]) return null
        // native serializer straight into the body: no intermediate string on Bun
        return Response.json(value)
      }
      return null
    case 'number':
    case 'boolean':
      return new Response(String(value), JSON_INIT)
  }
  return null
}

/** Convert anything a handler returns into a Response. */
export async function toResponse(value: unknown, set: SetOptions, cookies?: string[]): Promise<Response> {
  if (value instanceof Response) {
    const extra = Object.keys(set.headers).length > 0 || (cookies && cookies.length)
    if (!extra) return value
    const h = new Headers(value.headers)
    for (const [k, v] of Object.entries(set.headers)) if (!h.has(k)) h.set(k, v)
    if (cookies) for (const c of cookies) h.append('set-cookie', c)
    return new Response(value.body, { status: value.status, statusText: value.statusText, headers: h })
  }

  if (isStatusResponse(value)) {
    set.status = value.code
    return toResponse(value.body, set, cookies)
  }

  let status = set.status
  if (value === undefined || value === null) {
    if (status === 200) status = 204
    return new Response(null, { status, headers: withHeaders(set, cookies) })
  }

  switch (typeof value) {
    case 'string':
      return new Response(value, { status, headers: withHeaders(set, cookies, 'text/plain; charset=utf-8') })
    case 'number':
    case 'boolean':
    case 'bigint':
      return new Response(String(value), { status, headers: withHeaders(set, cookies, 'application/json') })
  }

  if (isNode(value)) {
    const headers = withHeaders(set, cookies, 'text/html; charset=utf-8')
    if (hasSuspense(value)) return new Response(await renderStream(value), { status, headers })
    return new Response(await renderToString(value), { status, headers })
  }
  if ((value as RawHtml)[RAW])
    return new Response((value as RawHtml).html, { status, headers: withHeaders(set, cookies, 'text/html; charset=utf-8') })

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    const h = withHeaders(set, cookies, value.type || 'application/octet-stream')
    if (!h.has('content-length')) h.set('content-length', String(value.size))
    if (typeof File !== 'undefined' && value instanceof File && value.name && !h.has('content-disposition'))
      h.set('content-disposition', `inline; filename="${value.name.replace(/"/g, '')}"`)
    return new Response(value, { status, headers: h })
  }
  if (value instanceof ReadableStream)
    return new Response(value, { status, headers: withHeaders(set, cookies, 'application/octet-stream') })
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value))
    return new Response(value as BodyInit, { status, headers: withHeaders(set, cookies, 'application/octet-stream') })

  if (isAsyncIterable(value) || isGenerator(value)) {
    const it = value as AsyncIterable<unknown> | Iterable<unknown>
    const enc = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of it as AsyncIterable<unknown>) controller.enqueue(enc.encode(formatSse(chunk)))
          controller.close()
        } catch (e) {
          controller.enqueue(enc.encode(formatSse(sse({ message: (e as Error).message }, { event: 'error' }))))
          controller.close()
        }
      },
    })
    const h = withHeaders(set, cookies, 'text/event-stream; charset=utf-8')
    if (!h.has('cache-control')) h.set('cache-control', 'no-cache')
    return new Response(stream, { status, headers: h })
  }

  if (value instanceof Error) throw value

  return new Response(JSON.stringify(value), { status, headers: withHeaders(set, cookies, 'application/json') })
}
