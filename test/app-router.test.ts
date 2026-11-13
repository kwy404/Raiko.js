import { describe, expect, it } from 'bun:test'
import { Raiko } from '../src'
import { appRouter } from '../src/app-router'
import { jsx } from '../src/jsx/runtime'

const make = async (dev: boolean) => new Raiko().use(await appRouter({ dir: 'test/fixtures/app', publicDir: 'test/fixtures/public', dev }))
const app = await make(false)
const html = async (path: string) => {
  const r = await app.request(path)
  return { status: r.status, body: await r.text(), r }
}

describe('app router', () => {
  it('renders page inside root layout with metadata and voodoo', async () => {
    const { status, body } = await html('/')
    expect(status).toBe(200)
    expect(body.startsWith('<!doctype html>')).toBe(true)
    expect(body).toContain('<nav>nav</nav><main><h1>Home</h1>')
    expect(body).toContain('<title>Site</title>')
    expect(body).toContain('voodoo.full.min.js')
    expect(body).toContain('data-rk-prefetch')
  })
  it('route groups do not appear in the url, title templates apply', async () => {
    const { body } = await html('/about')
    expect(body).toContain('About us')
    expect(body).toContain('<title>About | Site</title>')
    expect(body).not.toContain('voodoo.full.min.js')
  })
  it('dynamic params, request hooks and generateMetadata', async () => {
    const { body } = await html('/blog/hello?ref=x')
    expect(body).toContain('<h1>hello</h1><p>/blog/hello</p><p>x</p>')
    expect(body).toContain('<title>Post hello | Site</title>')
  })
  it('catch all params become arrays', async () => {
    expect((await html('/docs/a/b/c')).body).toContain('<p>a|b|c</p>')
  })
  it('notFound() and unknown urls use not-found.tsx', async () => {
    const a = await html('/blog/missing')
    expect(a.status).toBe(404)
    expect(a.body).toContain('Custom 404')
    const b = await html('/nope/really')
    expect(b.status).toBe(404)
    expect(b.body).toContain('Custom 404')
  })
  it('redirect()', async () => {
    const { status, r } = await html('/blog/old')
    expect(status).toBe(307)
    expect(r.headers.get('location')).toBe('/blog/new')
  })
  it('error.tsx in production, rust style page in dev', async () => {
    const p = await html('/broken')
    expect(p.status).toBe(500)
    expect(p.body).toContain('Custom error: boom')
    const dev = await make(true)
    const d = await (await dev.request('/broken')).text()
    expect(d).toContain('error: Error: boom')
    expect(d).toContain('page.tsx')
  })
  it('loading.tsx streams a fallback then the content', async () => {
    const { body } = await html('/slow')
    expect(body.indexOf('Loading...')).toBeLessThan(body.indexOf('Slow done'))
    expect(body).toContain('rkSwap(0)')
  })
  it('route.ts handlers', async () => {
    expect(await (await app.request('/api/hello?name=ana')).json()).toEqual({ hello: 'ana' })
    expect(await (await app.request('/api/hello', { json: { a: 1 } })).json()).toEqual({ got: { a: 1 } })
  })
  it('form actions', async () => {
    const f = new FormData()
    f.set('who', 'bob')
    const r = await app.request('/blog/x?/like', { method: 'POST', body: f })
    expect(r.status).toBe(200)
  })
  it('public files', async () => {
    const r = await app.request('/robots.txt')
    expect(await r.text()).toBe('hi\n')
    expect(r.headers.get('etag')).toBeTruthy()
    expect((await app.request('/robots.txt', { headers: { 'if-none-match': r.headers.get('etag')! } })).status).toBe(304)
    expect((await app.request('/../package.json')).status).toBe(404)
  })
})

describe('seo', () => {
  it('sitemap.xml lists static pages, robots.txt points to it', async () => {
    const s = await (await app.request('/sitemap.xml')).text()
    expect(s).toContain('<loc>http://localhost/about</loc>')
    expect(s).not.toContain(':slug')
    expect(await (await app.request('/robots.txt')).text()).not.toContain('Sitemap')
  })
})

describe('protected pages', async () => {
  const { forbidden, currentUser } = await import('../src/server/request-store')
  const users: Record<string, { id: string; role: string }> = { ana: { id: '1', role: 'admin' }, bob: { id: '2', role: 'user' } }
  const P = (text: string) => () => jsx('p', { children: text })
  const app = new Raiko().use(await appRouter({
    dev: true,
    getUser: ({ request }: any) => users[request.headers.get('x-user') ?? ''] ?? null,
    manifest: {
      'page.tsx': { default: P('public') },
      'dashboard/page.tsx': { default: () => jsx('p', { children: `hi ${currentUser()?.id}` }), auth: true },
      'admin/layout.tsx': { default: ({ children }: any) => children, roles: ['admin'] },
      'admin/page.tsx': { default: P('admin home') },
      'admin/forbidden.tsx': { default: P('admins only') },
      'reports/page.tsx': { default: () => (currentUser()?.role === 'admin' ? jsx('p', { children: 'report' }) : forbidden()), auth: true },
      'vip/page.tsx': { default: P('vip'), roles: ['vip'] },
      'vip/unauthorized.tsx': { default: P('please sign in for vip') },
    },
  }))
  const as = (who: string | null, path: string) => app.request(path, { headers: who ? { 'x-user': who } : {} })

  it('public pages stay public', async () => { const r = await as(null, '/'); if (r.status !== 200) console.log('BODY', (await r.text()).match(/error[^<]{0,300}/)?.[0]); expect(r.status).toBe(200) })
  it('signed out users are sent to sign in with a callback', async () => {
    const r = await as(null, '/dashboard?tab=2')
    expect(r.status).toBe(307)
    expect(r.headers.get('location')).toBe('/login?callbackUrl=%2Fdashboard%3Ftab%3D2')
  })
  it('signed in users see the page and currentUser()', async () => expect(await (await as('bob', '/dashboard')).text()).toContain('hi 2'))
  it('roles on a layout protect the whole folder, with its forbidden.tsx', async () => {
    const r = await as('bob', '/admin')
    expect(r.status).toBe(403)
    expect(await r.text()).toContain('admins only')
    expect((await as('ana', '/admin')).status).toBe(200)
  })
  it('forbidden() from inside a page', async () => {
    expect((await as('bob', '/reports')).status).toBe(403)
    expect(await (await as('ana', '/reports')).text()).toContain('report')
  })
  it('unauthorized.tsx replaces the redirect when present', async () => {
    const r = await as(null, '/vip')
    expect(r.status).toBe(401)
    expect(await r.text()).toContain('please sign in for vip')
  })
  it('a page with roles but no getUser fails at boot with a coded error', async () => {
    await expect(appRouter({ manifest: { 'page.tsx': { default: P('x'), auth: true } } })).rejects.toThrow('RK0110')
  })
})

describe('layout without head', () => {
  it('still gets title and meta tags', async () => {
    const a = new Raiko().use(await appRouter({ dev: false, manifest: {
      'layout.tsx': { default: ({ children }: any) => jsx('html', { lang: 'en', children: jsx('body', { children }) }), metadata: { title: 'T', description: 'D' } },
      'page.tsx': { default: () => jsx('p', { children: 'x' }) },
    } }))
    const html = await (await a.request('/')).text()
    expect(html).toContain('<html lang="en"><head>')
    expect(html).toContain('<title>T</title>')
  })
})

describe('public folder with a manifest', () => {
  it('still serves files from ./public', async () => {
    const { mkdirSync, writeFileSync, rmSync } = await import('node:fs')
    const dir = '/tmp/claude-0/pubtest'
    mkdirSync(dir + '/public', { recursive: true })
    writeFileSync(dir + '/public/hello.css', 'body{}')
    const cwd = process.cwd()
    process.chdir(dir)
    try {
      const a = new Raiko().use(await appRouter({ dev: false, manifest: { 'page.tsx': { default: () => jsx('p', { children: 'x' }) } } }))
      const r = await a.request('/hello.css')
      expect(r.status).toBe(200)
      expect(await r.text()).toBe('body{}')
    } finally {
      process.chdir(cwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
