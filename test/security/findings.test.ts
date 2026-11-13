/**
 * Security audit proofs. Each test asserts the SAFE behavior, so a failing
 * test demonstrates a confirmed vulnerability.
 */
import { describe, expect, it } from 'bun:test'
import { Raiko, t } from '../../src'
import { raikoAuth, Credentials, hashPassword, verifyPassword, generateTotpSecret, totp } from '../../src/auth'
import { admin, memoryAdapter } from '../../src/admin'
import { cors, rateLimit } from '../../src/plugins/security'
import { responseCache } from '../../src/plugins/ops'
import { appRouter } from '../../src/app-router'
import { fillPath } from '../../src/client'
import { jsx } from '../../src/jsx/runtime'
import { cookies } from '../../src/server/request-store'

const cookieOf = (r: Response, name: string) => r.headers.getSetCookie().find((c) => c.startsWith(name + '='))?.split(';')[0]
const form = (o: Record<string, string>) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() })

describe('auth', async () => {
  const pass = await hashPassword('hunter22', 1000)
  const secret = generateTotpSecret()
  const users = [{ id: '1', email: 'ana@x.io', totp: null as string | null }, { id: '2', email: 'bob@x.io', totp: secret }]
  const auth = raikoAuth({
    secret: 'x'.repeat(40),
    providers: [Credentials({ authorize: async ({ email, password }) => {
      const u = users.find((x) => x.email === email)
      return u && (await verifyPassword(String(password), pass)) ? { id: u.id, email: u.email } : null
    } })],
    twoFactor: { getSecret: (u) => users.find((x) => x.id === u.id)?.totp ?? null },
  })
  const app = new Raiko().use(auth.plugin)

  it('callbackUrl with a tab must not redirect off site (open redirect)', async () => {
    const r = await app.request('/auth/signin/credentials', form({ email: 'ana@x.io', password: 'hunter22', callbackUrl: '/\t/evil.example' }))
    const loc = r.headers.get('location')!
    // browsers strip tab/newline while parsing URLs, so "/\t/evil" becomes "//evil"
    expect(new URL(loc, 'https://app.example').host).toBe('app.example')
  })

  it('2FA pending token must not allow unlimited guesses, and codes must be single use', async () => {
    const login = await app.request('/auth/signin/credentials', form({ email: 'bob@x.io', password: 'hunter22' }))
    const pending = cookieOf(login, 'raiko.2fa')!
    let rejected = 0
    for (let i = 0; i < 20; i++) {
      const r = await app.request('/auth/2fa', { ...form({ code: String(100000 + i) }), headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: pending } })
      if (r.status === 401) rejected++
    }
    const code = await totp(secret)
    const ok1 = await app.request('/auth/2fa', { ...form({ code }), headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: pending } })
    // the same pending token after 20 wrong guesses still works -> brute force of the 6 digit code
    expect(rejected === 20 && ok1.status === 303).toBe(false)
  })
})

describe('cors', () => {
  it('credentials: true without an origin list must not reflect any origin', async () => {
    // refused at setup with a coded error, so the unsafe config can never run
    expect(() => cors({ credentials: true })).toThrow('RK0403')
    const app = new Raiko().use(cors({ origin: ['https://app.example'], credentials: true })).get('/me', () => ({ secret: 1 }))
    const r = await app.request('/me', { headers: { origin: 'https://evil.example' } })
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('body limit', () => {
  it('multipart bodies without content-length must respect bodyLimit', async () => {
    const app = new Raiko({ bodyLimit: 1024 }).post('/up', ({ body }: any) => String(body.f).length)
    const boundary = 'X'
    const big = 'a'.repeat(2 * 1024 * 1024)
    const payload = `--${boundary}\r\nContent-Disposition: form-data; name="f"\r\n\r\n${big}\r\n--${boundary}--\r\n`
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(payload)); c.close() } })
    const r = await app.fetch(new Request('http://localhost/up', { method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, body: stream, duplex: 'half' } as RequestInit))
    expect(r.status).toBe(413)
  })
})

describe('error responses', () => {
  it('response schema failures must not echo server data to the client', async () => {
    const app = new Raiko().get('/user', () => ({ id: 1, passwordHash: 'pbkdf2$SECRET' }), { response: t.Object({ id: t.Number() }, { strict: true }) })
    const r = await app.request('/user')
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('pbkdf2$SECRET')
  })
})

describe('ReDoS', () => {
  it('format: email must validate a 40 KB string quickly', async () => {
    const app = new Raiko().post('/s', ({ body }) => body, { body: t.Object({ email: t.String({ format: 'email' }) }) })
    const t0 = performance.now()
    await app.request('/s', { json: { email: 'a@' + '.'.repeat(40_000) + '@' } })
    expect(performance.now() - t0).toBeLessThan(200)
  })
})

describe('rate limit', () => {
  it('must not trust a client supplied X-Forwarded-For when no ip is known', async () => {
    const app = new Raiko().use(rateLimit({ max: 2 })).get('/', () => 'ok')
    let ok = 0
    for (let i = 0; i < 10; i++) {
      const r = await app.fetch(new Request('http://localhost/', { headers: { 'x-forwarded-for': `10.0.0.${i}` } }))
      if (r.status === 200) ok++
    }
    expect(ok).toBeLessThanOrEqual(2)
  })
})

describe('responseCache', () => {
  it('must not serve one user\'s authenticated response to another (or skip protect)', async () => {
    const protect = ({ request }: any) => (request.headers.get('authorization') === 'Bearer alice' ? undefined : new Response('no', { status: 401 }))
    const app = new Raiko().use(responseCache()).get('/me', () => ({ user: 'alice', ssn: '123' }), { beforeHandle: protect })
    expect((await app.request('/me', { headers: { authorization: 'Bearer alice' } })).status).toBe(200)
    const anon = await app.request('/me')
    expect(anon.status).toBe(401)
  })
})

describe('app router', async () => {
  const Page = () => jsx('p', { children: `hello ${cookies().get('user') ?? 'anon'}` })
  const Admin = () => jsx('p', { children: 'admin area' })
  const app = new Raiko().use(await appRouter({
    dev: false,
    locales: ['en', 'fr'],
    manifest: {
      'page.tsx': { default: Page, revalidate: 60 },
      'admin/page.tsx': { default: Admin },
      'middleware.ts': { default: () => new Response('forbidden', { status: 403 }), config: { matcher: '^/admin' } },
    },
  }))

  it('middleware matcher must also protect the locale prefixed copy of a page', async () => {
    expect((await app.request('/admin')).status).toBe(403)
    expect((await app.request('/en/admin')).status).toBe(403)
  })

  it('revalidate cache must not serve a personalized page to another user', async () => {
    await app.request('/?x=1', { headers: { cookie: 'user=alice' } })
    const other = await (await app.request('/?x=1')).text()
    expect(other).not.toContain('alice')
  })
})

describe('admin', () => {
  it('create must not write hidden or undeclared fields', async () => {
    const rows: any[] = [{ id: 1, email: 'a@x.io', role: 'user', apiToken: 't1' }]
    const app = new Raiko().use(admin({
      auth: () => 'support',
      resources: { users: { adapter: memoryAdapter(rows), hidden: ['apiToken'], permissions: { support: ['list', 'create'] } } },
    }))
    await app.request('/admin/users/new', form({ email: 'm@x.io', role: 'admin', apiToken: 'attacker' }))
    const created = rows.find((r) => r.email === 'm@x.io')
    expect(created?.role === 'admin' || created?.apiToken === 'attacker').toBe(false)
  })
})

describe('client', () => {
  it('a param value must not be able to change the endpoint path', () => {
    expect(() => fillPath('/users/:id/delete', { id: '..' })).toThrow('RK0901')
    expect(() => fillPath('/users/:id/delete', { id: '.' })).toThrow('RK0901')
    expect(new URL(fillPath('/users/:id/delete', { id: '../x' }), 'https://api.example').pathname).toBe('/users/..%2Fx/delete')
  })
})
