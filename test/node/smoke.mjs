// Runs the built package on plain Node: HTTP, validation, cookies, SSE, WebSocket (own RFC 6455), encryption, rooms.
import assert from 'node:assert/strict'
import { Raiko, t } from '../../dist/index.js'
import { RaikoClientSocket } from '../../dist/client/index.js'
import { cors } from '../../dist/plugins/index.js'

const app = new Raiko()
  .use(cors())
  .get('/', 'hello node')
  .get('/u/:id', ({ params }) => ({ id: params.id }), { params: t.Object({ id: t.Numeric() }) })
  .post('/echo', ({ body }) => body)
  .get('/stream', async function* () { yield 1; yield 2 })
  .ws('/ws', { message: (ws, m) => ws.send({ echo: m }) })
  .ws('/enc', { encrypt: true, message: (ws, m) => ws.send({ got: m, enc: ws.encrypted }) })
  .ws('/room', { open: (ws) => ws.subscribe('r'), message: (ws, m) => ws.publish('r', m) })

const server = await app.listen(0, { hostname: '127.0.0.1' })
const base = server.url.replace('localhost', '127.0.0.1')
const ws = base.replace('http', 'ws')
let passed = 0
const ok = (name) => (passed++, console.log('ok', name))

try {
  assert.equal(await (await fetch(base)).text(), 'hello node'); ok('text')
  assert.deepEqual(await (await fetch(`${base}/u/5`)).json(), { id: 5 }); ok('params coerce')
  assert.equal((await fetch(`${base}/u/x`)).status, 422); ok('validation')
  assert.deepEqual(await (await fetch(`${base}/echo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":[1,2]}' })).json(), { a: [1, 2] }); ok('json body')
  assert.equal(await (await fetch(`${base}/stream`)).text(), 'data: 1\n\ndata: 2\n\n'); ok('sse')
  assert.equal((await fetch(base, { headers: { origin: 'https://x.io' } })).headers.get('access-control-allow-origin'), '*'); ok('cors')

  const s = new RaikoClientSocket(`${ws}/ws`)
  const p = s.next(); s.send({ hi: 1 })
  assert.deepEqual(await p, { echo: { hi: 1 } }); s.close(); ok('websocket')

  const e = new RaikoClientSocket(`${ws}/enc`)
  const pe = e.next(); e.send({ secret: 'x'.repeat(70000) })
  assert.deepEqual(await pe, { got: { secret: 'x'.repeat(70000) }, enc: true }); e.close(); ok('encrypted websocket, 64 bit frame length')

  const a = new RaikoClientSocket(`${ws}/room`), b = new RaikoClientSocket(`${ws}/room`)
  await new Promise((r) => b.on('open', r)); await new Promise((r) => (a.isOpen ? r() : a.on('open', r)))
  const pb = b.next(); a.send('hey')
  assert.equal(await pb, 'hey'); a.close(); b.close(); ok('rooms')
  console.log(`\n${passed} passed on Node ${process.version}`)
} finally {
  await server.stop()
}
