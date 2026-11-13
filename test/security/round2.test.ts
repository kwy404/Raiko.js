/**
 * Second security audit. Each test asserts the SAFE behavior, so a failing
 * test demonstrates a confirmed vulnerability.
 */
import { describe, expect, it } from 'bun:test'
import { Raiko } from '../../src'
import { raikoAuth } from '../../src/auth'
import { signJwt } from '../../src/auth/jwt'
import { admin, memoryAdapter } from '../../src/admin'
import { appRouter } from '../../src/app-router'
import { jsx } from '../../src/jsx/runtime'
import { Connection } from '../../src/ws/connection'
import { createKeyPair, deriveKeys, encrypt } from '../../src/ws/crypto'
// @ts-ignore plain .mjs
import { generate } from '../../packages/create-raiko/templates.mjs'

const baseOpts = { name: 'app', template: 'full', frontend: 'raiko', css: 'monsoon', icons: 'glyphfox', motion: false, orm: 'kastor', db: 'postgres', auth: ['credentials'], twofa: false, email: 'none', i18n: false, admin: true, roles: { admin: { users: '*', posts: '*' } }, cookies: 'none', pwa: false, deploy: 'cloudflare', pm: 'bun' }
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))

describe('generated app (create-raiko)', () => {
  it('server/auth.ts must not fall back to a public, hard coded session secret', async () => {
    const files = generate(baseOpts) as Record<string, string>
    const authTs = files['server/auth.ts']!
    const fallback = /'(dev-only-secret[^']*)'/.exec(authTs)?.[1]
    if (fallback) {
      // the fallback is used whenever NODE_ENV !== 'production': always on Workers with
      // compatibility_date 2024-11-01 (process.env is empty there), and on `bun server.ts`
      const auth = raikoAuth({ secret: fallback, providers: [] })
      const rows = [{ id: 1, email: 'a@x.io', role: 'admin' }]
      // same auth function the template writes to server/admin.ts
      const app = new Raiko().use(auth.plugin).use(admin({ auth: ({ auth }: any) => auth?.user?.role ?? null, resources: { users: { adapter: memoryAdapter(rows), permissions: { admin: '*' } } } }))
      const forged = await signJwt({ sub: '1', session: { user: { id: '1', role: 'admin' }, provider: 'credentials', expires: '2999-01-01' } }, fallback, 3600)
      const r = await app.request('/admin/users', { headers: { cookie: `raiko.session=${forged}` } })
      expect(r.status).not.toBe(200) // forged admin session accepted
    }
    expect(fallback).toBeUndefined()
  })

  it('project name must not be able to inject code into generated files', () => {
    const files = generate({ ...baseOpts, name: "x',x:globalThis.pwned=1,y:'" }) as Record<string, string>
    expect(files['app/layout.tsx']).not.toContain("x',x:globalThis.pwned=1,y:'")
  })

  it('Dockerfile must not run as root and .dockerignore must exclude .env.* and local databases', () => {
    const files = generate({ ...baseOpts, db: 'sqlite', deploy: 'docker' }) as Record<string, string>
    expect(files['Dockerfile']).toMatch(/^USER /m)
    expect(files['.dockerignore']).toContain('.env.*')
    expect(files['.dockerignore']).toMatch(/\*\.db/)
  })
})

describe('app router form actions', async () => {
  const P = (p: any) => jsx('p', { children: JSON.stringify(p.actionData ?? null) })
  const app = new Raiko().use(await appRouter({ dev: false, manifest: {
    'page.tsx': { default: P, actions: { default: () => undefined } },
    'docs/[...slug]/page.tsx': { default: P, actions: { default: () => undefined } },
    '[...rest]/page.tsx': { default: P, actions: { default: () => undefined } },
  } }))
  const post = (path: string) => app.fetch(new Request('http://app.example' + path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=1' }))

  it('?/name must only dispatch to own action names, not Object.prototype', async () => {
    for (const n of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) expect((await post('/?/' + n)).status).toBe(404)
  })

  it('redirect after an action must stay on site (POST //evil.example)', async () => {
    for (const p of ['//evil.example', '/\\evil.example']) {
      const loc = (await post(p)).headers.get('location')!
      expect(new URL(loc, 'https://app.example').host).toBe('app.example')
    }
  })
})

describe('encrypted websocket', () => {
  const setup = (handlers: Record<string, any> = {}) => {
    const sent: (string | Uint8Array)[] = []
    let closed: number | null = null
    const raw = { send: (d: string | Uint8Array) => void sent.push(d), close: (c?: number) => void (closed = c ?? 1000) }
    const conn = new Connection(raw, { path: '/', handlers: { encrypt: true, ...handlers }, hooks: {} }, {})
    return { conn, sent, closed: () => closed, outbox: () => (conn as any).outbox.length as number }
  }
  const handshake = async (s: ReturnType<typeof setup>) => {
    s.conn.opened()
    await tick()
    const hello = JSON.parse(s.sent[0] as string)
    const pair = await createKeyPair()
    const key = await deriveKeys(pair, hello.key, 'client')
    s.conn.received(JSON.stringify({ $raiko: 'key', key: pair.publicKey }))
    await tick()
    return key
  }

  it('an invalid key message must close the socket, not queue errors forever', async () => {
    const s = setup()
    const err = console.error
    console.error = () => {}
    s.conn.opened()
    await tick()
    for (let i = 0; i < 200; i++) s.conn.received(JSON.stringify({ $raiko: 'key', key: 'AAAA' }))
    await tick(100)
    console.error = err
    // the socket stays open and every bad key pushes an error into the pre-handshake outbox
    expect(s.closed() !== null || s.outbox() === 0).toBe(true)
  })

  it('a replayed or reflected frame must not be delivered twice', async () => {
    const got: unknown[] = []
    const s = setup({ message: (ws: any, m: unknown) => { got.push(m); if ((m as any).echo) ws.send({ transfer: 100 }) } })
    const key = await handshake(s)
    const frame = await encrypt(key, { echo: true, transfer: 100 })
    s.conn.received(frame)
    s.conn.received(frame) // replay
    await tick()
    const fromServer = s.sent.find((d) => d instanceof Uint8Array) as Uint8Array
    s.conn.received(fromServer) // reflection: server frame accepted as a client message
    await tick()
    expect(got.length).toBe(1)
  })
})

describe('client socket', () => {
  class FakeWS {
    static last: FakeWS
    readyState = 1
    sent: unknown[] = []
    binaryType = ''
    onopen?: () => void; onmessage?: (e: { data: unknown }) => void; onclose?: (e: any) => void; onerror?: (e: any) => void
    constructor() { FakeWS.last = this }
    send(d: unknown) { this.sent.push(d) }
    close() {}
  }
  const withFake = async (fn: () => Promise<void>) => {
    const g = globalThis as any
    const prev = g.WebSocket
    g.WebSocket = FakeWS
    try { await fn() } finally { g.WebSocket = prev }
  }

  it('after the key exchange, a plaintext frame must not be delivered as a message', () => withFake(async () => {
    const { RaikoClientSocket } = await import('../../src/client/socket')
    const c = new RaikoClientSocket('ws://x', { reconnect: false })
    const got: unknown[] = []
    c.on('message', (m) => got.push(m))
    const server = await createKeyPair()
    FakeWS.last.onopen!()
    FakeWS.last.onmessage!({ data: JSON.stringify({ $raiko: 'hello', v: 1, key: server.publicKey }) })
    await tick()
    FakeWS.last.onmessage!({ data: JSON.stringify({ from: 'admin', text: 'injected' }) })
    await tick()
    expect(got).toEqual([])
  }))

  it('messages queued before a slow encrypted hello must never be sent in plaintext', () => withFake(async () => {
    const { RaikoClientSocket } = await import('../../src/client/socket')
    const c = new RaikoClientSocket('ws://x', { reconnect: false })
    c.send({ card: '4111 1111 1111 1111' } as never)
    FakeWS.last.onopen!()
    await tick(3100) // server is slow to generate its key pair
    const server = await createKeyPair()
    FakeWS.last.onmessage!({ data: JSON.stringify({ $raiko: 'hello', v: 1, key: server.publicKey }) })
    await tick()
    expect(FakeWS.last.sent.some((d) => typeof d === 'string' && d.includes('4111'))).toBe(false)
  }), 6000)
})
