/**
 * Vite plugin: run your Raiko backend inside the Vite dev server, so React,
 * Vue, Svelte, Solid, Preact or Angular (Analog) share one port with the API.
 * In production `raiko build` serves the built frontend with SPA fallback.
 *
 *   // vite.config.ts
 *   plugins: [react(), raiko({ entry: './server/index.ts' })]
 */
import type { Plugin, ViteDevServer } from 'vite'

export interface RaikoViteOptions {
  /** module that default exports the Raiko app */
  entry: string
  /** paths the backend owns in dev, default ['/api', '/auth', '/docs', '/_raiko', '/ws'] */
  paths?: string[]
  /** mangle and obfuscate the client bundle in production, default true */
  obfuscate?: boolean
}

export function raiko(o: RaikoViteOptions): Plugin {
  const owned = o.paths ?? ['/api', '/auth', '/docs', '/_raiko', '/ws']
  const mine = (url = '') => owned.some((p) => url === p || url.startsWith(p + '/') || url.startsWith(p + '?'))
  return {
    name: 'raiko',
    config(_, env) {
      if (env.command !== 'build' || o.obfuscate === false) return
      return {
        build: {
          sourcemap: false,
          minify: 'terser',
          terserOptions: { compress: { passes: 3, drop_console: true, drop_debugger: true }, mangle: { toplevel: true }, format: { comments: false } },
        },
      }
    },
    async configureServer(server: ViteDevServer) {
      const { toRequest, writeResponse } = await import('../adapters/node')
      const load = async () => (await server.ssrLoadModule(o.entry)).default
      server.middlewares.use(async (req, res, next) => {
        if (!mine(req.url)) return next()
        try {
          const app = await load()
          await writeResponse(res, await app.fetch(toRequest(req)))
        } catch (e) {
          server.ssrFixStacktrace(e as Error)
          next(e)
        }
      })
      server.httpServer?.on('upgrade', async (req, socket, head) => {
        if (!mine(req.url) || req.headers['sec-websocket-protocol'] === 'vite-hmr') return
        const app = await load()
        const { createNodeServer } = await import('../adapters/node')
        createNodeServer(app).emit('upgrade', req, socket, head)
      })
    },
  }
}
export default raiko
