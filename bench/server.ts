// One framework per process, same three routes, listening on the given port.
const [fw, portArg] = process.argv.slice(2)
const port = Number(portArg)
if (fw === 'raiko.js') {
  const { Raiko } = await import('../src')
  await new Raiko()
    .get('/', 'Hi')
    .get('/user/:id', ({ params }) => ({ id: params.id, name: 'Ana' }))
    .post('/json', ({ body }) => body)
    .listen(port, { hostname: '127.0.0.1' })
} else if (fw === 'elysia') {
  const { Elysia } = await import('./node_modules/elysia/dist/index.mjs').catch(() => import('elysia'))
  new Elysia()
    .get('/', 'Hi')
    .get('/user/:id', ({ params }) => ({ id: params.id, name: 'Ana' }))
    .post('/json', ({ body }) => body)
    .listen({ port, hostname: '127.0.0.1' })
} else if (fw === 'hono') {
  const { Hono } = await import('./node_modules/hono/dist/index.js').catch(() => import('hono'))
  const app = new Hono()
    .get('/', (c) => c.text('Hi'))
    .get('/user/:id', (c) => c.json({ id: c.req.param('id'), name: 'Ana' }))
    .post('/json', async (c) => c.json(await c.req.json()))
  Bun.serve({ port, hostname: '127.0.0.1', fetch: app.fetch })
}
