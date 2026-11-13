import { Connection } from './connection'
import { isTSchema, validate, validateSync, type AnySchema } from '../schema'
import { ValidationError } from '../error'
import { toResponse } from '../response'
import { handleError } from '../pipeline'
import type { BaseContext } from '../context'
import type { RawSocket, WsRoute } from './types'
import type { AnyRaiko } from '../app'

/** Returned by an upgrade on Bun and Node, where the runtime answers the handshake itself. */
export const UPGRADED = new Response(null, { status: 200, headers: { 'x-raiko': 'upgraded' } })

async function check(on: string, schema: AnySchema | undefined, value: unknown) {
  if (!schema) return value
  const r = isTSchema(schema) ? validateSync(schema, value, { coerce: true }) : await validate(schema, value, { coerce: true })
  if (!r.ok) throw new ValidationError(on, r.issues)
  return r.value
}

/** Run hooks and validation for a WebSocket route, then hand it to the runtime. */
export async function upgradeWebSocket(app: AnyRaiko, route: WsRoute, ctx: BaseContext): Promise<Response | undefined> {
  const h = route.handlers
  try {
    for (const fn of route.hooks.transform ?? []) await fn(ctx)
    for (const fn of route.hooks.derive ?? []) Object.assign(ctx, (await fn(ctx)) ?? {})
    if (h.params) ctx.params = (await check('params', h.params, ctx.params)) as Record<string, string>
    if (h.query) ctx.query = (await check('query', h.query, ctx.query)) as Record<string, string>
    if (h.headers) ctx.headers = (await check('headers', h.headers, ctx.headers)) as Record<string, string>
    for (const fn of route.hooks.resolve ?? []) Object.assign(ctx, (await fn(ctx)) ?? {})
    for (const fn of route.hooks.beforeHandle ?? []) {
      const r = await fn(ctx)
      if (r !== undefined) return toResponse(r, ctx.set)
    }
    if (h.beforeUpgrade) {
      const r = await h.beforeUpgrade(ctx as never)
      if (r !== undefined) return toResponse(r, ctx.set)
    }
  } catch (e) {
    return handleError(e, route.hooks.error ?? [], ctx.request, ctx.path, ctx.set, ctx.store)
  }

  const make = (raw: RawSocket) => new Connection(raw, route, ctx)

  if (app.upgrader) return app.upgrader(ctx.request, route, ctx)

  const g = globalThis as any
  // Deno
  if (g.Deno?.upgradeWebSocket) {
    const { socket, response } = g.Deno.upgradeWebSocket(ctx.request)
    attachStandard(socket, make)
    return response
  }
  // Cloudflare Workers
  if (typeof g.WebSocketPair === 'function') {
    const pair = new g.WebSocketPair()
    const [client, server] = Object.values(pair) as [any, any]
    server.accept()
    attachStandard(server, make, true)
    return new Response(null, { status: 101, webSocket: client } as ResponseInit)
  }
  return new Response('WebSocket is not supported by this runtime adapter. Start the app with app.listen().', {
    status: 426,
    headers: { upgrade: 'websocket' },
  })
}

/** Wire a WHATWG WebSocket (Deno, Workers) to a Connection. */
function attachStandard(socket: any, make: (raw: RawSocket) => Connection, alreadyOpen = false) {
  socket.binaryType = 'arraybuffer'
  const conn = make({
    send: (d) => socket.send(d),
    close: (c, r) => socket.close(c, r),
  })
  const open = () => conn.opened()
  if (alreadyOpen) queueMicrotask(open)
  else socket.addEventListener('open', open)
  socket.addEventListener('message', (e: MessageEvent) =>
    conn.received(typeof e.data === 'string' ? e.data : new Uint8Array(e.data as ArrayBuffer)),
  )
  socket.addEventListener('close', (e: CloseEvent) => conn.closed(e.code, e.reason))
}

export { Connection }
