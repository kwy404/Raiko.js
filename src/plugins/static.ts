/** Serve files from a folder with ETag, Range and cache headers. */
import { stat, readFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { resolve, sep, extname, join } from 'node:path'
import { Raiko } from '../app'

export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.pdf': 'application/pdf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.wasm': 'application/wasm', '.map': 'application/json', '.webmanifest': 'application/manifest+json',
}

export interface StaticOptions {
  dir: string
  prefix?: string
  /** Cache-Control max-age in seconds. Hashed file names get immutable automatically. */
  maxAge?: number
  /** Serve index.html for unknown paths (single page apps). */
  spa?: boolean
  index?: string
}

export function staticFiles(o: StaticOptions) {
  const root = resolve(o.dir)
  const prefix = o.prefix && o.prefix !== '/' ? o.prefix.replace(/\/$/, '') : ''
  const index = o.index ?? 'index.html'

  const serve = async (request: Request, rel: string): Promise<Response | undefined> => {
    let file = resolve(root, '.' + rel)
    if (file !== root && !file.startsWith(root + sep)) return undefined
    let s = await stat(file).catch(() => null)
    if (s?.isDirectory()) {
      file = join(file, index)
      s = await stat(file).catch(() => null)
    }
    if (!s?.isFile()) return undefined
    const etag = `W/"${s.size.toString(16)}-${Math.floor(s.mtimeMs).toString(16)}"`
    const immutable = /[.-][0-9a-f]{8,}\./i.test(file)
    const headers: Record<string, string> = {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      etag,
      'last-modified': s.mtime.toUTCString(),
      'accept-ranges': 'bytes',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : `public, max-age=${o.maxAge ?? 0}`,
    }
    if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
    if (range) {
      const start = range[1] ? Number(range[1]) : Math.max(0, s.size - Number(range[2]))
      const end = range[1] && range[2] ? Math.min(Number(range[2]), s.size - 1) : s.size - 1
      if (start > end || start >= s.size)
        return new Response(null, { status: 416, headers: { 'content-range': `bytes */${s.size}` } })
      const body = Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream
      return new Response(body, { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${s.size}`, 'content-length': String(end - start + 1) } })
    }
    if (request.method === 'HEAD') return new Response(null, { headers: { ...headers, 'content-length': String(s.size) } })
    const body = s.size < 1024 * 1024 ? await readFile(file) : (Readable.toWeb(createReadStream(file)) as unknown as ReadableStream)
    return new Response(body as BodyInit, { headers: { ...headers, 'content-length': String(s.size) } })
  }

  return new Raiko({ name: `raiko:static:${root}` }).onRequest(async ({ request, path }) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return
    if (prefix && path !== prefix && !path.startsWith(prefix + '/')) return
    let rel = path.slice(prefix.length) || '/'
    try {
      rel = decodeURIComponent(rel)
    } catch {
      return
    }
    if (rel.includes('\0')) return
    const res = await serve(request, rel)
    if (res) return res
    if (o.spa && !extname(rel) && (request.headers.get('accept') ?? '').includes('text/html')) return serve(request, '/' + index)
  })
}
