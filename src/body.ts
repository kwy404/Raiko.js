import { HttpError } from './error'

export type BodyParser = (request: Request, contentType: string) => unknown | Promise<unknown>

/** Collapse FormData into an object. Repeated keys become arrays. */
export function formToObject(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null)
  form.forEach((value, key) => {
    const k = key.endsWith('[]') ? key.slice(0, -2) : key
    if (k in out) {
      const prev = out[k]
      out[k] = Array.isArray(prev) ? [...prev, value] : [prev, value]
    } else out[k] = key.endsWith('[]') ? [value] : value
  })
  return out
}

/**
 * Parse the request body by content type. Returns undefined for requests
 * without a body. Throws a 400 HttpError for malformed JSON.
 */
export async function parseBody(request: Request, limit: number): Promise<unknown> {
  // decide from headers: touching request.body would create a stream and slow the native parsers
  const len = request.headers.get('content-length')
  // requests built in memory carry no length header: only then look at the stream
  if (len === null && !request.headers.has('transfer-encoding') && !request.body) return undefined
  if (len !== null && Number(len) > limit) throw new HttpError(413, `Body larger than ${limit} bytes`)
  const type = (request.headers.get('content-type') ?? '').toLowerCase()

  if (type.startsWith('multipart/form-data')) {
    if (!request.body) return undefined
    // count bytes as they arrive: chunked uploads have no content-length to check up front
    let size = 0
    const limited = request.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, c) {
          size += chunk.byteLength
          if (size > limit) c.error(new HttpError(413, `Body larger than ${limit} bytes`))
          else c.enqueue(chunk)
        },
      }),
    )
    try {
      return formToObject(await new Response(limited, { headers: { 'content-type': request.headers.get('content-type')! } }).formData())
    } catch (e) {
      if (size > limit) throw new HttpError(413, `Body larger than ${limit} bytes`)
      throw new HttpError(400, 'Malformed multipart body', { code: 'parse' })
    }
  }

  const known = len !== null && Number(len) <= limit
  // known length and JSON: the runtime's native parser, the fastest path there is
  if (known && (type.startsWith('application/json') || type.endsWith('+json'))) {
    if (len === '0') return undefined
    try {
      return await request.json()
    } catch {
      throw new HttpError(400, 'Malformed JSON body', { code: 'parse' })
    }
  }
  // known small length: let the runtime read it natively, much faster than chunk by chunk
  const text = known ? await request.text() : await readLimited(request, limit)
  if (text === '') return undefined
  if (type.startsWith('application/json') || type.endsWith('+json')) {
    try {
      return JSON.parse(text)
    } catch {
      throw new HttpError(400, 'Malformed JSON body', { code: 'parse' })
    }
  }
  if (type.startsWith('application/x-www-form-urlencoded')) {
    const out: Record<string, unknown> = Object.create(null)
    new URLSearchParams(text).forEach((v, k) => {
      const key = k.endsWith('[]') ? k.slice(0, -2) : k
      if (key in out) out[key] = ([] as unknown[]).concat(out[key], v)
      else out[key] = k.endsWith('[]') ? [v] : v
    })
    return out
  }
  return text
}

async function readLimited(request: Request, limit: number): Promise<string> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel().catch(() => {})
      throw new HttpError(413, `Body larger than ${limit} bytes`)
    }
    chunks.push(value)
  }
  if (chunks.length === 1) return new TextDecoder().decode(chunks[0])
  const all = new Uint8Array(size)
  let off = 0
  for (const c of chunks) {
    all.set(c, off)
    off += c.byteLength
  }
  return new TextDecoder().decode(all)
}

/** Parse a query string into an object. Repeated keys become arrays. */
export function parseQuery(search: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = Object.create(null)
  if (!search) return out
  for (const pair of search.split('&')) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    const rawK = eq === -1 ? pair : pair.slice(0, eq)
    const rawV = eq === -1 ? '' : pair.slice(eq + 1)
    let k = decode(rawK)
    const v = decode(rawV)
    const forceArray = k.endsWith('[]')
    if (forceArray) k = k.slice(0, -2)
    const prev = out[k]
    if (prev === undefined) out[k] = forceArray ? [v] : v
    else out[k] = Array.isArray(prev) ? [...prev, v] : [prev, v]
  }
  return out
}

function decode(s: string): string {
  if (s.indexOf('+') !== -1) s = s.replace(/\+/g, ' ')
  if (s.indexOf('%') === -1) return s
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
