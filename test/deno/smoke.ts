// The built package on Deno: HTTP, validation and WebSocket through Deno.upgradeWebSocket.
import { Raiko, t } from '../../dist/index.js'
import { RaikoClientSocket } from '../../dist/client/index.js'

const app = new Raiko()
  .get('/', 'hello deno')
  .get('/u/:id', ({ params }: any) => ({ id: params.id }), { params: t.Object({ id: t.Numeric() }) })
  .ws('/ws', { message: (ws: any, m: unknown) => ws.send({ echo: m }) })
  .ws('/enc', { encrypt: true, message: (ws: any, m: unknown) => ws.send({ got: m, enc: ws.encrypted }) })

const server = await app.listen(8787, { hostname: '127.0.0.1' })
const assert = (ok: boolean, msg: string) => {
  if (!ok) throw new Error(msg)
  console.log('ok', msg)
}
try {
  assert((await (await fetch('http://127.0.0.1:8787/')).text()) === 'hello deno', 'text')
  assert((await (await fetch('http://127.0.0.1:8787/u/7')).json()).id === 7, 'params coerce')
  assert((await fetch('http://127.0.0.1:8787/u/x')).status === 422, 'validation')
  const s = new RaikoClientSocket('ws://127.0.0.1:8787/ws')
  const p = s.next()
  s.send({ hi: 1 })
  assert(JSON.stringify(await p) === '{"echo":{"hi":1}}', 'websocket')
  s.close()
  const e = new RaikoClientSocket('ws://127.0.0.1:8787/enc')
  const pe = e.next()
  e.send({ secret: 1 })
  assert(JSON.stringify(await pe) === '{"got":{"secret":1},"enc":true}', 'encrypted websocket')
  e.close()
} finally {
  await server.stop()
}
