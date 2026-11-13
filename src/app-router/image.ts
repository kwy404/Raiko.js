/** /_raiko/image: resizes local images with sharp when installed, caches in memory. */
import { readFile } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import { HttpError } from '../error'
import type { BaseContext } from '../context'

const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml' }

export function imageHandler(publicDir: string): (ctx: any) => Promise<Response> {
  const cache = new Map<string, { body: Uint8Array; type: string }>()
  let sharp: any = undefined
  return async (ctx: BaseContext): Promise<Response> => {
    const q = ctx.query as Record<string, string>
    const url = q.url ?? ''
    const w = Math.min(4096, Math.max(16, Number(q.w) || 0))
    const quality = Math.min(100, Math.max(1, Number(q.q) || 75))
    if (!url.startsWith('/') || url.includes('\0')) throw new HttpError(400, 'Only local images are allowed')
    const file = resolve(publicDir, '.' + decodeURIComponent(url))
    if (!file.startsWith(publicDir + sep)) throw new HttpError(400, 'Invalid image path')
    const type = TYPES[extname(file).toLowerCase()]
    if (!type) throw new HttpError(415, 'Unsupported image type')
    const accept = ctx.request.headers.get('accept') ?? ''
    const out = accept.includes('image/avif') ? 'avif' : accept.includes('image/webp') ? 'webp' : null
    const key = `${file}|${w}|${quality}|${out}`
    let hit = cache.get(key)
    if (!hit) {
      const input = await readFile(file).catch(() => null)
      if (!input) throw new HttpError(404, 'Image not found')
      if (sharp === undefined) sharp = await import('sharp' as string).then((m) => m.default ?? m, () => null)
      if (sharp && type !== 'image/svg+xml' && type !== 'image/gif') {
        let img = sharp(input).resize({ width: w, withoutEnlargement: true })
        img = out ? img.toFormat(out, { quality }) : img
        hit = { body: new Uint8Array(await img.toBuffer()), type: out ? `image/${out}` : type }
      } else hit = { body: new Uint8Array(input), type }
      if (cache.size > 500) cache.delete(cache.keys().next().value!)
      cache.set(key, hit)
    }
    return new Response(hit.body as BodyInit, {
      headers: { 'content-type': hit.type, 'cache-control': 'public, max-age=31536000, immutable', vary: 'accept' },
    })
  }
}
