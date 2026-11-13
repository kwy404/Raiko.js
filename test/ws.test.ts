import { afterAll, describe, expect, it } from 'bun:test'
import { Raiko, t } from '../src'
import { RaikoClientSocket } from '../src/client/socket'

const app = new Raiko()
  .ws('/echo', { message: (ws, m) => ws.send({ echo: m }) })
  .ws('/secret', { encrypt: true, message: (ws, m) => ws.send({ got: m, enc: ws.encrypted }) })
  .ws('/room/:name', {
    open: (ws) => ws.subscribe(ws.data.params.name),
    message: (ws, m) => ws.publish(ws.data.params.name, m),
  })
  .ws('/typed', { body: t.Object({ n: t.Number() }), message: (ws, m) => ws.send(m.n * 2) })
  .ws('/guarded', { beforeUpgrade: ({ query }) => (query.token === 'ok' ? undefined : new Response('no', { status: 401 })), open: (ws) => ws.send('in') })

const server = await app.listen(0)
const url = server.url.replace('http', 'ws')
afterAll(() => server.stop())

describe('websocket (bun)', () => {
  it('echoes json', async () => {
    const s = new RaikoClientSocket(`${url}/echo`)
    const p = s.next()
    s.send({ hi: 1 })
    expect(await p).toEqual({ echo: { hi: 1 } })
    s.close()
  })
  it('encrypts end to end', async () => {
    const s = new RaikoClientSocket(`${url}/secret`)
    const p = s.next()
    s.send({ card: '4242' })
    expect(await p).toEqual({ got: { card: '4242' }, enc: true })
    s.close()
  })
  it('rooms publish to others only', async () => {
    const a = new RaikoClientSocket(`${url}/room/x`)
    const b = new RaikoClientSocket(`${url}/room/x`)
    await new Promise((r) => b.on('open', () => r(null)))
    await new Promise((r) => (a.isOpen ? r(null) : a.on('open', () => r(null))))
    const got = b.next()
    a.send('hello room')
    expect(await got).toBe('hello room')
    a.close()
    b.close()
  })
  it('validates messages', async () => {
    const s = new RaikoClientSocket(`${url}/typed`)
    const errors: unknown[] = []
    s.on('error', (e) => errors.push(e))
    s.send({ n: 'x' })
    s.send({ n: 21 })
    expect(await s.next()).toBe(42)
    expect((errors[0] as any).code).toBe('validation')
    s.close()
  })
  it('refuses upgrade from beforeUpgrade', async () => {
    const r = await fetch(`${server.url}/guarded`, { headers: { upgrade: 'websocket', connection: 'upgrade', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', 'sec-websocket-version': '13' } })
    expect(r.status).toBe(401)
    const s = new RaikoClientSocket(`${url}/guarded?token=ok`)
    expect(await s.next()).toBe('in')
    s.close()
  })
})

import { signaling } from '../src/p2p'
describe('p2p signaling', () => {
  it('introduces peers and relays signals', async () => {
    const sig = await new Raiko().use(signaling()).listen(0)
    const u = sig.url.replace('http', 'ws')
    const a = new RaikoClientSocket<any>(`${u}/p2p/r1`)
    const wa = await a.next((m) => m.type === 'welcome')
    const b = new RaikoClientSocket<any>(`${u}/p2p/r1`)
    const wb = await b.next((m) => m.type === 'welcome')
    expect(wb.peers).toEqual([wa.id])
    const got = b.next((m) => m.type === 'signal')
    a.send({ type: 'signal', to: wb.id, data: { description: 'offer' } })
    expect(await got).toEqual({ type: 'signal', from: wa.id, data: { description: 'offer' } })
    const left = b.next((m) => m.type === 'leave')
    a.close()
    expect((await left).id).toBe(wa.id)
    b.close()
    await sig.stop()
  })
})
