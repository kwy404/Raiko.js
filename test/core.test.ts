import { describe, expect, it } from 'bun:test'
import { Raiko, t, HttpError, sse } from '../src'

const json = (r: Response) => r.json() as Promise<any>

describe('routing', () => {
  const app = new Raiko()
    .get('/', 'home')
    .get('/users/:id', ({ params }) => params.id)
    .get('/files/*', ({ params }) => params['*'])
    .get('/opt/:a?', ({ params }) => params.a ?? 'none')
    .post('/users', ({ body }) => body)
    .get('/users/me', 'me')

  it('static and params', async () => {
    expect(await (await app.request('/')).text()).toBe('home')
    expect(await (await app.request('/users/42')).text()).toBe('42')
    expect(await (await app.request('/users/me')).text()).toBe('me')
    expect(await (await app.request('/users/a%20b')).text()).toBe('a b')
  })
  it('wildcard and optional', async () => {
    expect(await (await app.request('/files/a/b/c.txt')).text()).toBe('a/b/c.txt')
    expect(await (await app.request('/opt')).text()).toBe('none')
    expect(await (await app.request('/opt/x')).text()).toBe('x')
  })
  it('trailing slash and query string', async () => {
    expect(await (await app.request('/users/7/?x=1')).text()).toBe('7')
  })
  it('404 problem json', async () => {
    const r = await app.request('/nope')
    expect(r.status).toBe(404)
    expect(r.headers.get('content-type')).toBe('application/problem+json')
    expect((await json(r)).status).toBe(404)
  })
  it('405 with Allow, HEAD and OPTIONS', async () => {
    const r = await app.request('/users', { method: 'DELETE' })
    expect(r.status).toBe(405)
    expect(r.headers.get('allow')).toBe('POST')
    const h = await app.request('/', { method: 'HEAD' })
    expect(h.status).toBe(200)
    expect(await h.text()).toBe('')
    const o = await app.request('/users', { method: 'OPTIONS' })
    expect(o.status).toBe(204)
    expect(o.headers.get('allow')).toContain('POST')
  })
  it('json body', async () => {
    expect(await json(await app.request('/users', { json: { a: 1 } }))).toEqual({ a: 1 })
  })
  it('malformed json is 400', async () => {
    const r = await app.request('/users', { method: 'POST', body: '{bad', headers: { 'content-type': 'application/json' } })
    expect(r.status).toBe(400)
  })
})

describe('validation', () => {
  const app = new Raiko()
    .get('/n/:id', ({ params }) => ({ id: params.id, type: typeof params.id }), { params: t.Object({ id: t.Numeric() }) })
    .get('/q', ({ query }) => query, {
      query: t.Object({ page: t.Integer({ minimum: 1, default: 1 }), tags: t.Optional(t.Array(t.String())), on: t.Optional(t.Boolean()) }),
    })
    .post('/u', ({ body }) => body, {
      body: t.Object({ name: t.String({ minLength: 2 }), email: t.String({ format: 'email' }), age: t.Optional(t.Integer()) }),
    })

  it('coerces params and query', async () => {
    expect(await json(await app.request('/n/5'))).toEqual({ id: 5, type: 'number' })
    expect(await json(await app.request('/q?page=3&tags=a&tags=b&on=true'))).toEqual({ page: 3, tags: ['a', 'b'], on: true })
    expect(await json(await app.request('/q'))).toEqual({ page: 1 })
  })
  it('rejects with path and 422', async () => {
    const r = await app.request('/n/abc')
    expect(r.status).toBe(422)
    const b = await app.request('/u', { json: { name: 'A', email: 'x' } })
    expect(b.status).toBe(422)
    const body = await json(b)
    expect(body.detail).toContain('body.name')
    expect(body.errors.length).toBe(2)
  })
  it('accepts valid body and strips unknown keys', async () => {
    const r = await app.request('/u', { json: { name: 'Ana', email: 'a@b.co', extra: 1 } })
    expect(await json(r)).toEqual({ name: 'Ana', email: 'a@b.co' })
  })
  it('form data', async () => {
    const f = new FormData()
    f.set('name', 'Bob')
    f.set('email', 'b@b.co')
    f.set('age', '30')
    expect(await json(await app.request('/u', { method: 'POST', body: f }))).toEqual({ name: 'Bob', email: 'b@b.co', age: 30 })
  })
})

describe('lifecycle', () => {
  it('runs hooks in order and short circuits', async () => {
    const log: string[] = []
    const app = new Raiko()
      .onRequest(() => void log.push('request'))
      .onTransform(() => void log.push('transform'))
      .derive(() => (log.push('derive'), { user: 'ana' }))
      .onBeforeHandle(({ headers }) => (headers['x-block'] ? 'blocked' : undefined))
      .onAfterHandle(({ response }) => (typeof response === 'string' ? response.toUpperCase() : undefined))
      .get('/', ({ user }) => (log.push('handler'), `hi ${user}`))
    expect(await (await app.request('/')).text()).toBe('HI ANA')
    expect(log).toEqual(['request', 'transform', 'derive', 'handler'])
    expect(await (await app.request('/', { headers: { 'x-block': '1' } })).text()).toBe('BLOCKED')
  })
  it('hooks only apply to later routes', async () => {
    const app = new Raiko().get('/a', 'a').onBeforeHandle(() => 'guarded').get('/b', 'b')
    expect(await (await app.request('/a')).text()).toBe('a')
    expect(await (await app.request('/b')).text()).toBe('guarded')
  })
  it('custom errors and onError', async () => {
    const app = new Raiko()
      .onError(({ code, error }) => (code === 'UNKNOWN' ? { oops: error.message } : undefined))
      .get('/boom', () => {
        throw new Error('kaboom')
      })
      .get('/teapot', () => {
        throw new HttpError(418, 'short and stout')
      })
    const r = await app.request('/boom')
    expect(r.status).toBe(500)
    expect(await json(r)).toEqual({ oops: 'kaboom' })
    const t2 = await app.request('/teapot')
    expect(t2.status).toBe(418)
    expect((await json(t2)).detail).toBe('short and stout')
  })
  it('custom 404', async () => {
    const app = new Raiko().notFound(({ path }) => `nothing at ${path}`)
    const r = await app.request('/x')
    expect(r.status).toBe(404)
    expect(await r.text()).toBe('nothing at /x')
  })
})

describe('state and plugins', () => {
  it('decorate, state, group, use with prefix and dedupe', async () => {
    let installs = 0
    const plugin = () => {
      installs++
      return new Raiko({ name: 'counter' }).state('count', 0).get('/inc', ({ store }) => ++store.count)
    }
    const api = new Raiko({ prefix: '/api' }).use(plugin()).use(plugin())
    const app = new Raiko()
      .decorate('db', { find: (id: string) => ({ id }) })
      .use(api)
      .group('/v1', (g) => g.get('/item/:id', ({ db, params }) => db.find(params.id)))
    expect(installs).toBe(2)
    expect(await (await app.request('/api/inc')).text()).toBe('1')
    expect(await (await app.request('/api/inc')).text()).toBe('2')
    expect(await json(await app.request('/v1/item/9'))).toEqual({ id: '9' })
  })
  it('local hooks of a plugin do not leak, global ones do', async () => {
    const auth = new Raiko().onBeforeHandle(() => 'local').onBeforeHandle(() => undefined, 'global').get('/in', 'in')
    const auth2 = new Raiko().onBeforeHandle(() => 'global!', 'global')
    const app = new Raiko().use(auth).get('/out', 'out').use(auth2).get('/after', 'after')
    expect(await (await app.request('/in')).text()).toBe('local')
    expect(await (await app.request('/out')).text()).toBe('out')
    expect(await (await app.request('/after')).text()).toBe('global!')
  })
  it('mount any fetch handler', async () => {
    const app = new Raiko().mount('/ext', (req) => new Response(new URL(req.url).pathname))
    expect(await (await app.request('/ext/a/b')).text()).toBe('/a/b')
  })
})

describe('responses', () => {
  it('maps every return type', async () => {
    const app = new Raiko()
      .get('/obj', { a: 1 })
      .get('/num', 42)
      .get('/null', () => null)
      .get('/blob', () => new Blob(['x'], { type: 'text/csv' }))
      .get('/status', ({ status }) => status(201, { ok: true }))
      .get('/redirect', ({ redirect }) => redirect('/obj'))
      .get('/cookie', ({ cookie }) => (cookie.set('a', 'b'), 'ok'))
      .get('/sse', function* () {
        yield 'one'
        yield sse({ n: 2 }, { event: 'num', id: '2' })
      })
    expect(await json(await app.request('/obj'))).toEqual({ a: 1 })
    expect((await app.request('/num')).headers.get('content-type')).toBe('application/json')
    expect((await app.request('/null')).status).toBe(204)
    expect((await app.request('/blob')).headers.get('content-type')).toBe('text/csv')
    const s = await app.request('/status')
    expect(s.status).toBe(201)
    expect(await json(s)).toEqual({ ok: true })
    const r = await app.request('/redirect')
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe('/obj')
    expect((await app.request('/cookie')).headers.get('set-cookie')).toContain('a=b')
    expect(await (await app.request('/sse')).text()).toBe('data: one\n\nevent: num\nid: 2\ndata: {"n":2}\n\n')
  })
  it('signed cookies reject tampering', async () => {
    const app = new Raiko({ cookie: { secrets: 's3cret' } })
      .get('/set', async ({ cookie }) => (await cookie.setSigned('sid', 'user1'), 'ok'))
      .get('/get', async ({ cookie }) => (await cookie.getSigned('sid')) ?? 'invalid')
    const set = (await app.request('/set')).headers.get('set-cookie')!
    const value = decodeURIComponent(set.split(';')[0]!.split('=').slice(1).join('='))
    expect(await (await app.request('/get', { headers: { cookie: `sid=${encodeURIComponent(value)}` } })).text()).toBe('user1')
    expect(await (await app.request('/get', { headers: { cookie: `sid=user2.${value.split('.')[1]}` } })).text()).toBe('invalid')
  })
  it('validates responses', async () => {
    const app = new Raiko().get('/', () => ({ id: 'x' }) as any, { response: t.Object({ id: t.Number() }) })
    expect((await app.request('/')).status).toBe(500)
  })
})
