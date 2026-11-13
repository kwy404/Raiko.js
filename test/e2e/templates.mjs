// End to end: generate a project per combination, install, typecheck, build, boot and hit it.
// node test/e2e/templates.mjs [filter]
import { spawnSync, spawn } from 'node:child_process'
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const TGZ = process.env.RAIKO_TGZ
const BUN = process.env.BUN ?? 'bun'
const root = process.env.E2E_DIR ?? '/tmp/raiko-e2e'
const filter = process.argv[2]
const combos = [
  { id: 'pages-full', cookies: 'lgpd', frontend: 'raiko', css: 'monsoon', orm: 'kastor', db: 'sqlite', auth: 'credentials', twofa: true, email: 'resend', i18n: true, admin: true, roles: 'editor,support', icons: 'glyphfox', motion: true, deploy: 'vercel' },
  { id: 'pages-min', template: 'minimal', frontend: 'raiko', css: 'none', orm: 'none', auth: 'none', email: 'none', icons: 'none', deploy: 'docker' },
  { id: 'pages-tailwind-drizzle', frontend: 'raiko', css: 'tailwind', orm: 'drizzle', db: 'sqlite', auth: 'credentials,github', twofa: false, email: 'smtp', admin: true, roles: 'viewer', icons: 'lucide', deploy: 'cloudflare' },
  { id: 'pages-uno-prisma', frontend: 'raiko', css: 'unocss', orm: 'prisma', db: 'sqlite', auth: 'google', twofa: true, email: 'postmark', admin: true, roles: 'editor', icons: 'glyphfox', deploy: 'node' },
  { id: 'react', cookies: 'gdpr', frontend: 'react', css: 'tailwind', orm: 'kastor', db: 'sqlite', auth: 'credentials', twofa: true, email: 'resend', i18n: true, admin: true, roles: 'editor', icons: 'lucide', motion: true, deploy: 'vercel' },
  { id: 'react-stylex', frontend: 'react', css: 'stylex', orm: 'none', auth: 'none', email: 'none', icons: 'heroicons', deploy: 'docker' },
  { id: 'vue', frontend: 'vue', css: 'monsoon', orm: 'drizzle', db: 'sqlite', auth: 'github', email: 'sendgrid', admin: true, roles: 'viewer', icons: 'glyphfox', deploy: 'cloudflare' },
  { id: 'svelte', frontend: 'svelte', css: 'unocss', orm: 'none', auth: 'none', email: 'none', icons: 'lucide', deploy: 'docker' },
  { id: 'solid', frontend: 'solid', css: 'none', orm: 'none', auth: 'credentials', email: 'none', icons: 'glyphfox', deploy: 'vercel' },
  { id: 'preact', frontend: 'preact', css: 'tailwind', orm: 'none', auth: 'none', email: 'none', icons: 'lucide', deploy: 'node' },
  { id: 'angular', frontend: 'angular', css: 'monsoon', orm: 'none', auth: 'none', email: 'none', icons: 'none', deploy: 'docker' },
].filter((c) => !filter || c.id.includes(filter))

const sh = (cmd, args, cwd, env = {}) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, timeout: 600_000 })
  return { ok: r.status === 0, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

async function boot(cwd, entry, env) {
  const port = 4000 + Math.floor(Math.random() * 2000)
  const p = spawn(BUN, [entry], { cwd, env: { ...process.env, PORT: String(port), ...env }, stdio: 'pipe' })
  let log = ''
  p.stdout.on('data', (d) => (log += d))
  p.stderr.on('data', (d) => (log += d))
  // up to 60s: a busy CI machine can take a while to boot a big template
  for (let i = 0; i < 400; i++) {
    await new Promise((r) => setTimeout(r, 150))
    try {
      await fetch(`http://127.0.0.1:${port}/health`)
      return { url: `http://127.0.0.1:${port}`, stop: () => p.kill(), log: () => log }
    } catch {}
  }
  p.kill()
  throw new Error('server did not start\n' + log)
}

mkdirSync(root, { recursive: true })
const results = []
for (const c of combos) {
  const dir = join(root, c.id)
  rmSync(dir, { recursive: true, force: true })
  const steps = []
  const step = (name, r) => {
    steps.push(`${r.ok ? 'ok  ' : 'FAIL'} ${name}`)
    if (!r.ok) throw new Error(`${name}\n${r.out.slice(-3000)}`)
  }
  try {
    const flags = Object.entries({ template: 'full', twofa: false, i18n: false, admin: false, motion: false, db: 'sqlite', ...c }).filter(([k]) => k !== 'id').flatMap(([k, v]) => [`--${k}`, String(v)])
    step('generate', sh('node', [join(process.cwd(), 'packages/create-raiko/index.mjs'), c.id, '--yes', '--pm', 'bun', '--install', 'false', '--git', 'false', ...flags], root))
    // without RAIKO_TGZ the project installs raiko.js from the npm registry, like a real user
    if (TGZ) {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      pkg.dependencies['raiko.js'] = `file:${TGZ}`
      writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
    }
    step('install', sh(BUN, ['install'], dir))
    const vite = c.frontend !== 'raiko'
    if (!vite) step('manifest', sh(BUN, ['x', 'raiko', 'manifest'], dir))
    if (c.orm === 'prisma') step('prisma generate', sh(BUN, ['x', 'prisma', 'generate'], dir))
    step('typecheck', sh(BUN, ['x', 'tsc', '--noEmit'], dir))
    if (vite) step('vite build', sh(BUN, ['x', 'vite', 'build'], dir, { NODE_ENV: 'production' }))
    const s = await boot(dir, vite ? 'server/index.ts' : 'server.ts', { NODE_ENV: vite ? 'production' : 'development', AUTH_SECRET: 'x'.repeat(48), DATABASE_URL: c.orm === 'prisma' ? 'file:./e2e.db' : 'e2e.db' })
    try {
      const get = async (p, init) => fetch(s.url + p, { redirect: 'manual', ...init })
      const home = await get('/')
      const body = await home.text()
      step(`GET / ${home.status}`, { ok: home.status === 200 && body.includes(vite ? '<div id="app">' : '</html>') || (c.frontend === 'angular' && body.includes('app-root')), out: body.slice(0, 500) + s.log() })
      const hello = await get(vite ? '/api/hello?name=e2e' : '/api/hello?name=e2e')
      step(`GET /api/hello ${hello.status}`, { ok: hello.status === 200 && (await hello.json()).hello === 'e2e', out: s.log() })
      // files in public/ must be served (stylesheets, favicon, scripts)
      for (const f of vite ? ['/favicon.svg'] : ['/favicon.svg', '/welcome.css']) {
        const r = await get(f)
        step(`GET ${f} ${r.status}`, { ok: r.status === 200, out: s.log() })
      }
      // a real browser: no JavaScript errors, the counter reacts, Vite apps reach the API
      if (process.env.BROWSER_CHECK) {
        // async on purpose: a blocking call would stop this process from reading the server's
        // log pipe, the pipe fills up and the server dies on its next write
        const r = await new Promise((done) => {
          // BROWSER_CHECK=native runs Playwright installed next to the tests (CI); a folder path runs it in Docker
          const d = process.env.BROWSER_CHECK === 'native'
            ? spawn('node', [join(process.cwd(), 'test/e2e/browsercheck.mjs'), s.url + '/'])
            : spawn('docker', ['run', '--rm', '--network', 'host', '-v', `${process.env.BROWSER_CHECK}:/s`, '-v', `${process.env.PW_MODULES}:/s/node_modules:ro`, '-w', '/s', 'mcr.microsoft.com/playwright:v1.64.1-noble', 'node', 'browsercheck.mjs', s.url + '/'])
          let stdout = '', stderr = ''
          d.stdout.on('data', (x) => (stdout += x))
          d.stderr.on('data', (x) => (stderr += x))
          const t = setTimeout(() => d.kill(), 120000)
          d.on('close', () => (clearTimeout(t), done({ stdout, stderr })))
        })
        let res = {}
        try {
          res = JSON.parse((r.stdout || '').trim().split('\n').pop())
        } catch {}
        const okCounter = /Clicked\s*2\s*times/.test(res.after || '')
        const okStatus = vite ? /API says hello/.test(res.status || '') : /Server rendered/.test(res.status || '')
        step(`browser: ${(res.after || 'no counter').replace(/\s+/g, ' ').trim()}, ${res.status || 'no status'}`, { ok: okCounter && okStatus && !(res.errors || []).length, out: JSON.stringify(res, null, 1) + (r.stderr || '').slice(-800) })
      }
      const docs = await get('/docs/json')
      step(`GET /docs/json ${docs.status}`, { ok: docs.status === 200, out: s.log() })
      const nf = await get('/definitely-missing', { headers: { accept: 'text/html' } })
      step(`404 ${nf.status}`, { ok: vite ? nf.status === 200 : nf.status === 404, out: s.log() })
      if (c.admin) {
        const a = await get('/admin')
        step(`GET /admin ${a.status}`, { ok: [200, 302].includes(a.status), out: s.log() })
      }
      if (c.auth && c.auth !== 'none') {
        const ses = await get('/auth/session')
        step(`GET /auth/session ${ses.status}`, { ok: ses.status === 200 || ses.status === 204, out: s.log() })
      }
      if (!vite && c.email && c.email !== 'none') {
        const m = await get('/_raiko/mail/welcome')
        step(`email preview ${m.status}`, { ok: m.status === 200, out: s.log() })
      }
    } finally {
      s.stop()
    }
    // the commands people actually type: dev, then build and start
    const waitFor = async (url, ms = 60000) => {
      const end = Date.now() + ms
      while (Date.now() < end) {
        try {
          const r = await fetch(url)
          if (r.status < 500) return r.status
        } catch {}
        await new Promise((r) => setTimeout(r, 300))
      }
      return 0
    }
    const devPort = 4700 + Math.floor(Math.random() * 300)
    const dev = spawn(BUN, ['run', 'dev', '--port', String(devPort)], { cwd: dir, env: { ...process.env, PORT: String(devPort), AUTH_SECRET: 'x'.repeat(48), DATABASE_URL: c.orm === 'prisma' ? 'file:./e2e.db' : 'e2e.db' }, stdio: 'pipe' })
    let devLog = ''
    dev.stdout.on('data', (d) => (devLog += d))
    dev.stderr.on('data', (d) => (devLog += d))
    const devStatus = await waitFor(vite ? `http://localhost:${devPort}/` : `http://127.0.0.1:${devPort}/`)
    dev.kill()
    step(`bun run dev -> ${devStatus}`, { ok: devStatus === 200 && (vite || /Local:\s+http:\/\/localhost/.test(devLog)), out: devLog.slice(-1500) })
    step('raiko build', sh(BUN, ['x', 'raiko', 'build'], dir, { NODE_ENV: 'production' }))
    const startPort = 5200 + Math.floor(Math.random() * 300)
    const start = spawn(BUN, ['x', 'raiko', 'start'], { cwd: dir, env: { ...process.env, PORT: String(startPort), AUTH_SECRET: 'x'.repeat(48), DATABASE_URL: c.orm === 'prisma' ? 'file:./e2e.db' : 'e2e.db' }, stdio: 'pipe' })
    let startLog = ''
    start.stdout.on('data', (d) => (startLog += d))
    start.stderr.on('data', (d) => (startLog += d))
    const startStatus = await waitFor(`http://127.0.0.1:${startPort}/health`)
    const home = startStatus === 200 ? (await fetch(`http://127.0.0.1:${startPort}/`, { headers: { accept: 'text/html' } })).status : 0
    start.kill()
    step(`raiko start -> health ${startStatus}, home ${home}`, { ok: startStatus === 200 && home === 200, out: startLog.slice(-1500) })
    results.push({ id: c.id, ok: true, steps })
  } catch (e) {
    results.push({ id: c.id, ok: false, steps, error: String(e.message ?? e) })
  }
  const r = results.at(-1)
  console.log(`\n${r.ok ? 'PASS' : 'FAIL'} ${c.id}\n  ${r.steps.join('\n  ')}${r.error ? '\n' + r.error.slice(0, 2500) : ''}`)
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} templates passed`)
process.exit(results.every((r) => r.ok) ? 0 : 1)
