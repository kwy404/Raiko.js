import { describe, expect, it } from 'bun:test'
import { Raiko, t } from '../src'
import { raikoAuth, Credentials, hashPassword, verifyPassword, generateTotpSecret, totp, totpUri, safeCallback } from '../src/auth'
import { admin, memoryAdapter } from '../src/admin'
import { createMailer, htmlToText } from '../src/mail'
import { createI18n } from '../src/i18n'
import { cors, rateLimit, secureHeaders, csrf } from '../src/plugins/security'
import { requestId, health, etag, responseCache } from '../src/plugins/ops'
import { openapi } from '../src/plugins/openapi'
import { client } from '../src/client'
import { jsx } from '../src/jsx/runtime'

const cookieOf = (r: Response, name: string) => r.headers.getSetCookie().find((c) => c.startsWith(name + '='))?.split(';')[0]

describe('auth', async () => {
  const pass = await hashPassword('hunter22', 1000)
  const secret = generateTotpSecret()
  const users = [{ id: '1', email: 'ana@x.io', pass, totp: null as string | null }, { id: '2', email: 'bob@x.io', pass, totp: secret }]
  const auth = raikoAuth({
    secret: 'x'.repeat(40),
    providers: [Credentials({ authorize: async ({ email, password }) => {
      const u = users.find((x) => x.email === email)
      return u && (await verifyPassword(String(password), u.pass)) ? { id: u.id, email: u.email } : null
    } })],
    twoFactor: { getSecret: (u) => users.find((x) => x.id === u.id)?.totp ?? null },
  })
  const app = new Raiko().use(auth.plugin).get('/me', ({ auth: a }: any) => a.user, { beforeHandle: auth.protect })

  it('credentials sign in sets a session', async () => {
    expect((await app.request('/me')).status).toBe(401)
    const r = await app.request('/auth/signin/credentials', { json: { email: 'ana@x.io', password: 'hunter22', callbackUrl: '/me' } })
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe('/me')
    const me = await app.request('/me', { headers: { cookie: cookieOf(r, 'raiko.session')! } })
    expect(await me.json()).toEqual({ id: '1', email: 'ana@x.io' })
  })
  it('wrong password is 401, open redirects are blocked', async () => {
    expect((await app.request('/auth/signin/credentials', { json: { email: 'ana@x.io', password: 'nope' } })).status).toBe(401)
    expect(safeCallback('//evil.com')).toBe('/')
    expect(safeCallback('https://evil.com')).toBe('/')
    expect(safeCallback('/ok?x=1')).toBe('/ok?x=1')
  })
  it('2FA: password then TOTP code', async () => {
    const r = await app.request('/auth/signin/credentials', { json: { email: 'bob@x.io', password: 'hunter22' } })
    expect(r.headers.get('location')).toBe('/auth/2fa')
    const pending = cookieOf(r, 'raiko.2fa')!
    expect(cookieOf(r, 'raiko.session')).toBeUndefined()
    expect((await app.request('/auth/2fa', { json: { code: '000000' }, headers: { cookie: pending } })).status).toBe(401)
    const ok = await app.request('/auth/2fa', { json: { code: await totp(secret) }, headers: { cookie: pending } })
    expect(ok.status).toBe(303)
    expect(cookieOf(ok, 'raiko.session')).toBeTruthy()
    expect(totpUri({ secret, account: 'bob', issuer: 'Raiko' })).toStartWith('otpauth://totp/Raiko%3Abob?secret=')
  })
  it('refuses short secrets with a coded error', () => {
    expect(() => raikoAuth({ secret: 'short', providers: [] })).toThrow('RK0400')
  })
})

describe('admin permissions', () => {
  const rows = [{ id: 1, email: 'a@a.io', name: 'A', password: 'hash' }, { id: 2, email: 'b@b.io', name: 'B', password: 'hash' }]
  const app = new Raiko().use(admin({
    auth: ({ headers }: any) => headers['x-role'] ?? null,
    resources: { users: { adapter: memoryAdapter(rows), fields: ['id', 'email', 'name'], hidden: ['password'], schema: t.Object({ email: t.String({ format: 'email' }), name: t.Optional(t.String()) }), permissions: { admin: '*', support: ['read', 'update'], viewer: ['list'] } } },
  }))
  const as = (role: string | null, path: string, init: RequestInit = {}) => app.request(path, { ...init, headers: role ? { 'x-role': role } : {} })

  it('signed out users go to sign in', async () => {
    expect((await as(null, '/admin')).status).toBe(302)
  })
  it('list depends on role', async () => {
    const a = await as('admin', '/admin/users?q=b@b')
    expect(a.status).toBe(200)
    const body = await a.text()
    expect(body).toContain('b@b.io')
    expect(body).not.toContain('a@a.io')
    expect(body).not.toContain('hash')
    expect((await as('support', '/admin/users')).status).toBe(403)
    expect((await as('viewer', '/admin/users')).status).toBe(200)
  })
  it('support can edit but not list or delete', async () => {
    expect((await as('support', '/admin/users/1')).status).toBe(200)
    const f = new FormData()
    f.set('email', 'new@a.io')
    expect((await as('support', '/admin/users/1', { method: 'POST', body: f })).status).toBe(303)
    expect(rows[0]!.email).toBe('new@a.io')
    expect((await as('support', '/admin/users/1/delete', { method: 'POST' })).status).toBe(403)
    expect((await as('viewer', '/admin/users/1')).status).toBe(403)
  })
  it('validates and protects readonly fields', async () => {
    const f = new FormData()
    f.set('email', 'not-an-email')
    expect((await as('admin', '/admin/users/1', { method: 'POST', body: f })).status).toBe(422)
    const g = new FormData()
    g.set('id', '999')
    g.set('email', 'x@x.io')
    await as('admin', '/admin/users/1', { method: 'POST', body: g })
    expect(rows[0]!.id).toBe(1)
  })
  it('bad permission names fail at boot', () => {
    expect(() => admin({ auth: () => null, resources: { x: { adapter: memoryAdapter(), permissions: { a: ['lst' as any] } } } })).toThrow('RK0601')
  })
})

describe('mail', () => {
  const Welcome = Object.assign((p: { name: string }) => jsx('div', { children: [jsx('h1', { children: `Hi ${p.name}` }), jsx('a', { href: 'https://x.io', children: 'Open' })] }), { subject: (p: { name: string }) => `Welcome ${p.name}`, preview: { name: 'Ana' } })
  const sent: any[] = []
  const mailer = createMailer({ from: 'a@x.io', transport: { name: 'mem', send: async (m) => (sent.push(m), { id: '1' }) }, templates: { welcome: Welcome } })
  it('renders tsx templates to html and text', async () => {
    await mailer.send({ to: 'b@x.io', template: 'welcome', props: { name: 'Bob' } })
    expect(sent[0].subject).toBe('Welcome Bob')
    expect(sent[0].html).toContain('<h1>Hi Bob</h1>')
    expect(sent[0].text).toBe('Hi Bob\nOpen (https://x.io)')
  })
  it('preview routes', async () => {
    const app = new Raiko().use(mailer.preview())
    expect(await (await app.request('/_raiko/mail')).text()).toContain('welcome')
    const r = await app.request('/_raiko/mail/welcome')
    expect(r.headers.get('x-email-subject')).toBe('Welcome Ana')
  })
  it('htmlToText', () => expect(htmlToText('<p>a&amp;b</p><ul><li>x</li></ul>')).toBe('a&b\n- x'))
})

describe('i18n', () => {
  const i18n = createI18n({ en: { cart: { items_one: '{count} item', items_other: '{count} items' }, hi: 'Hi {name}' }, 'pt-BR': { cart: { items_one: '{count} item', items_other: '{count} itens' }, hi: 'Oi {name}' } }, { fallback: 'en' })
  it('plurals, interpolation, fallback, detection', () => {
    expect(i18n.t('pt-BR', 'cart.items', { count: 1000 })).toBe('1.000 itens')
    expect(i18n.t('en', 'cart.items', { count: 1 })).toBe('1 item')
    expect(i18n.t('fr', 'hi', { name: 'Ana' })).toBe('Hi Ana')
    expect(i18n.detect(new Request('http://x/a', { headers: { 'accept-language': 'pt;q=0.9,en;q=0.8' } }))).toBe('pt-BR')
    expect(i18n.detect(new Request('http://x/pt-BR/a'))).toBe('pt-BR')
  })
})

describe('plugins', () => {
  it('cors, including on errors and preflight', async () => {
    const app = new Raiko().use(cors({ origin: ['https://a.io'], credentials: true })).get('/x', 'ok').get('/err', () => { throw new Error('x') })
    const r = await app.request('/x', { headers: { origin: 'https://a.io' } })
    expect(r.headers.get('access-control-allow-origin')).toBe('https://a.io')
    expect((await app.request('/err', { headers: { origin: 'https://a.io' } })).headers.get('access-control-allow-origin')).toBe('https://a.io')
    expect((await app.request('/x', { headers: { origin: 'https://evil.io' } })).headers.get('access-control-allow-origin')).toBeNull()
    const pre = await app.request('/x', { method: 'OPTIONS', headers: { origin: 'https://a.io', 'access-control-request-method': 'POST' } })
    expect(pre.status).toBe(204)
  })
  it('rate limit', async () => {
    const app = new Raiko().use(rateLimit({ max: 2, key: () => 'k' })).get('/', 'ok')
    expect((await app.request('/')).status).toBe(200)
    expect((await app.request('/')).headers.get('ratelimit-remaining')).toBe('0')
    const r = await app.request('/')
    expect(r.status).toBe(429)
    expect(r.headers.get('retry-after')).toBeTruthy()
  })
  it('secure headers, csrf, request id, health, etag, cache', async () => {
    let calls = 0
    const app = new Raiko().use(secureHeaders()).use(csrf()).use(requestId()).use(health()).use(responseCache({ ttl: 60 })).use(etag())
      .get('/c', () => ({ n: ++calls })).post('/p', 'ok')
    const r = await app.request('/c')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(await (await app.request('/c')).json()).toEqual({ n: 1 })
    expect((await app.request('/p', { method: 'POST', headers: { origin: 'https://evil.io' } })).status).toBe(403)
    expect((await app.request('/p', { method: 'POST', headers: { origin: 'http://localhost' } })).status).toBe(200)
    expect((await (await app.request('/health')).json()).status).toBe('ok')
  })
  it('timeout returns 504', async () => {
    const app = new Raiko({ timeout: 10 }).get('/', () => new Promise((r) => setTimeout(() => r('late'), 100)))
    expect((await app.request('/')).status).toBe(504)
  })
})

describe('openapi and typed client', () => {
  const app = new Raiko()
    .get('/users/:id', ({ params }) => ({ id: params.id, name: 'Ana' }), { detail: { summary: 'Get user' } })
    .post('/users', ({ body, status }) => status(201, body), { body: t.Object({ name: t.String() }) })
    .use(openapi({ title: 'Test' }))
  it('documents routes', async () => {
    const doc = await (await app.request('/docs/json')).json()
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.paths['/users/{id}'].get.summary).toBe('Get user')
    expect(doc.paths['/users'].post.requestBody.content['application/json'].schema.required).toEqual(['name'])
    expect(await (await app.request('/docs')).text()).toContain('api-reference')
  })
  it('client calls the app with types', async () => {
    const api = client<typeof app>('http://localhost', { fetch: ((u: string, i: RequestInit) => app.fetch(new Request(u, i))) as typeof fetch })
    const a = await api.get('/users/:id', { params: { id: '7' } })
    expect(a.data?.name).toBe('Ana')
    expect(a.data?.id).toBe('7')
    const b = await api.post('/users', { body: { name: 'Bob' } })
    expect(b.status).toBe(201)
    // compile time checks: openapi() must not erase the route table
    // @ts-expect-error params are required for /users/:id
    void (() => api.get('/users/:id'))
    // @ts-expect-error unknown path
    void (() => api.get('/nope'))
    // @ts-expect-error body must match the schema
    void (() => api.post('/users', { body: { name: 1 } }))
    const c = await api.post('/users', { body: { name: 1 as any } })
    expect(c.error?.status).toBe(422)
  })
})
