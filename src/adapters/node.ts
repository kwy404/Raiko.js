/** Node adapter: node:http to fetch, streamed responses, WebSocket upgrades. */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { Readable, type Duplex } from 'node:stream'
import { handshake, wrapNodeSocket } from './node-ws'
import { Connection } from '../ws/connection'
import { UPGRADED } from '../ws/upgrade'
import type { AnyRaiko } from '../app'

const pending = new WeakMap<Request, { socket: Duplex; head: Buffer; headers: IncomingMessage['headers'] }>()

export function toRequest(req: IncomingMessage): Request {
  const proto = (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http'
  const url = new URL(req.url ?? '/', `${proto}://${req.headers.host ?? 'localhost'}`)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue
    if (Array.isArray(v)) for (const x of v) headers.append(k, x)
    else headers.set(k, v)
  }
  const method = req.method ?? 'GET'
  const hasBody = method !== 'GET' && method !== 'HEAD'
  return new Request(url, {
    method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream) : undefined,
    ...(hasBody ? { duplex: 'half' } : {}),
  } as RequestInit)
}

export async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((v, k) => k !== 'set-cookie' && res.setHeader(k, v))
  const cookies = response.headers.getSetCookie?.() ?? []
  if (cookies.length) res.setHeader('set-cookie', cookies)
  if (!response.body) return void res.end()
  const reader = response.body.getReader()
  res.on('close', () => reader.cancel().catch(() => {}))
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!res.write(value)) await new Promise<void>((r) => res.once('drain', r))
  }
  res.end()
}

export function createNodeServer(app: AnyRaiko): Server {
  app.upgrader = (request, route, ctx) => {
    const p = pending.get(request)
    if (!p) return new Response('Upgrade Required', { status: 426 })
    if (!handshake(p.socket, p.headers)) return UPGRADED
    let conn: Connection
    const raw = wrapNodeSocket(
      p.socket,
      route.handlers.maxPayload ?? 1024 * 1024,
      { message: (d) => conn.received(d), close: (c, r) => conn.closed(c, r) },
      p.head,
    )
    conn = new Connection(raw, route, ctx)
    conn.opened()
    return UPGRADED
  }

  const server = createServer(async (req, res) => {
    try {
      await writeResponse(res, await app.fetch(toRequest(req), { ip: req.socket.remoteAddress }))
    } catch (e) {
      console.error('[raiko] request failed:', e)
      if (!res.headersSent) res.statusCode = 500
      res.end()
    }
  })

  server.on('upgrade', async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    try {
      const request = toRequest(req)
      pending.set(request, { socket, head, headers: req.headers })
      const response = await app.fetch(request, { ip: req.socket.remoteAddress })
      if (response === UPGRADED) return
      const body = Buffer.from(await response.arrayBuffer())
      let h = `HTTP/1.1 ${response.status} Error\r\n`
      response.headers.forEach((v, k) => (h += `${k}: ${v}\r\n`))
      socket.end(Buffer.concat([Buffer.from(h + `content-length: ${body.length}\r\nconnection: close\r\n\r\n`), body]))
    } catch {
      socket.destroy()
    }
  })
  return server
}
