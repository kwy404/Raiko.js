/** `app.listen()` on whatever runtime is running: Bun, Deno or Node. */
import { Connection } from '../ws/connection'
import { UPGRADED } from '../ws/upgrade'
import type { AnyRaiko } from '../app'
import type { WsRoute } from '../ws/types'

export interface Listening {
  port: number
  url: string
  stop(): Promise<void>
}

export async function serve(
  app: AnyRaiko,
  port: number,
  opts: { hostname?: string; onListen?: (url: string) => void; native?: boolean; cluster?: boolean | number },
): Promise<Listening> {
  const g = globalThis as any
  const hostname = opts.hostname ?? '0.0.0.0'
  app.compile()
  let result: Listening

  // cluster: one process per core sharing the port (SO_REUSEPORT on Bun, node:cluster on Node)
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 1
  const workers = opts.cluster === true ? cores : typeof opts.cluster === 'number' ? opts.cluster : 1
  const isWorker = g.process?.env?.RAIKO_WORKER === '1'
  if (workers > 1 && !g.Bun && !g.Deno) {
    const cluster = (await import('node:cluster')).default
    if (cluster.isPrimary) {
      for (let i = 0; i < workers; i++) cluster.fork({ RAIKO_WORKER: '1' })
      cluster.on('exit', (w, code) => code !== 0 && cluster.fork({ RAIKO_WORKER: '1' }))
      const url = `http://localhost:${port}`
      opts.onListen?.(url)
      return { port, url, stop: async () => void (await Promise.all(Object.values(cluster.workers ?? {}).map((w) => w?.kill()))) }
    }
  }
  const children: { kill(): void }[] = []
  if (workers > 1 && g.Bun && !isWorker) {
    for (let i = 1; i < workers; i++)
      children.push(g.Bun.spawn([process.execPath, ...process.argv.slice(1)], { env: { ...process.env, RAIKO_WORKER: '1' }, stdio: ['inherit', 'inherit', 'inherit'] }))
  }

  if (g.Bun) {
    type Data = { conn: Connection; route: WsRoute; ctx: unknown }
    let server: any
    app.upgrader = (request, route, ctx) => {
      const ok = server.upgrade(request, { data: { route, ctx } })
      return ok ? UPGRADED : new Response('Upgrade failed', { status: 400 })
    }
    server = g.Bun.serve({
      port,
      hostname,
      reusePort: workers > 1 || isWorker,
      // native Zig router for every route it can express; the rest falls through to fetch
      ...(opts.native === false ? {} : { routes: app.nativeRoutes((req) => server?.requestIP?.(req)?.address) }),
      fetch(req: Request, srv: any) {
        const res = app.fetch(req, { ip: () => srv.requestIP?.(req)?.address })
        if (res === UPGRADED) return undefined
        return res instanceof Promise ? res.then((r) => (r === UPGRADED ? undefined : r)) : res
      },
      websocket: {
        maxPayloadLength: 16 * 1024 * 1024,
        open(ws: any) {
          const d = ws.data as Data
          d.conn = new Connection({ send: (m) => ws.send(m), close: (c, r) => ws.close(c, r) }, d.route, d.ctx)
          d.conn.opened()
        },
        message(ws: any, m: string | Buffer) {
          ;(ws.data as Data).conn.received(typeof m === 'string' ? m : new Uint8Array(m))
        },
        close(ws: any, code: number, reason: string) {
          ;(ws.data as Data).conn?.closed(code, reason)
        },
      },
    })
    result = {
      port: server.port,
      url: `http://localhost:${server.port}`,
      stop: async () => {
        for (const c of children) c.kill()
        server.stop(true)
      },
    }
  } else if (g.Deno?.serve) {
    const server = g.Deno.serve({ port, hostname, onListen() {} }, (req: Request, info: any) =>
      app.fetch(req, { ip: info?.remoteAddr?.hostname }),
    )
    result = { port, url: `http://localhost:${port}`, stop: () => server.shutdown() }
  } else {
    const { createNodeServer } = await import('./node')
    const server = createNodeServer(app)
    await new Promise<void>((r) => server.listen(port, hostname, r))
    const real = (server.address() as { port: number }).port
    result = {
      port: real,
      url: `http://localhost:${real}`,
      stop: () => new Promise<void>((r) => (server.closeAllConnections?.(), server.close(() => r()))),
    }
  }
  const stop = result.stop
  result.stop = async () => {
    await stop()
    await app.stop()
  }
  opts.onListen?.(result.url)
  return result
}
