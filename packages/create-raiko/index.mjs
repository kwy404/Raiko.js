#!/usr/bin/env node
// create-raiko: bun create raiko | npm create raiko@latest | pnpm create raiko
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { select, multiselect, text, confirm, spin, col, BACK } from './prompt.mjs'
import { generate, FRONTENDS, CSS, ICONS, run } from './templates.mjs'

const argv = process.argv.slice(2)
const flag = (n) => {
  const i = argv.indexOf(`--${n}`)
  if (i === -1) return undefined
  const v = argv[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}
const yes = argv.includes('--yes') || argv.includes('-y')
const ask = async (name, fn, def) => (flag(name) !== undefined ? parse(flag(name)) : yes ? def : fn())
const parse = (v) => (v === 'true' ? true : v === 'false' ? false : v)
const list = (v) => (Array.isArray(v) ? v : v === 'none' || v === '' ? [] : String(v).split(','))

const ua = process.env.npm_config_user_agent ?? ''
const detectedPm = ua.startsWith('bun') || process.versions.bun ? 'bun' : ua.startsWith('pnpm') ? 'pnpm' : ua.startsWith('yarn') ? 'yarn' : 'npm'

const ACTIONS = ['list', 'read', 'create', 'update', 'delete']
const RESOURCES = ['users', 'posts']
const ROLE_PRESETS = {
  admin: { users: '*', posts: '*' },
  editor: { users: ['read'], posts: ['list', 'read', 'create', 'update'] },
  support: { users: ['read', 'update'], posts: ['read'] },
  viewer: { users: [], posts: ['list', 'read'] },
}

// compact banner on narrow terminals so nothing wraps
console.log(
  (process.stdout.columns || 80) >= 56
    ? `\n  ${col.y('  /\\_/\\   ')}  ${col.b('raiko')}${col.d('.js')}\n  ${col.y(' ( o.o )  ')}  ${col.d('backend and frontend in one file tree')}\n  ${col.y('  > ^ <   ')}  ${col.d('every runtime. strikes first.')}\n`
    : `\n  ${col.y('( o.o )')} ${col.b('raiko')}${col.d('.js')}\n`,
)

const positional = argv.find((a, i) => !a.startsWith('-') && !(argv[i - 1] ?? '').startsWith('--'))
const interactive = !yes && !!(process.stdin.isTTY && process.stdout.isTTY)

// npm package name rules: the name also lands in generated code, so nothing else is allowed
const nameError = (n) => {
  if (!/^[a-z0-9][a-z0-9._-]{0,213}$/.test(basename(n)))
    return `${col.r('error[RK0803]')}: "${basename(n).replace(/[^\x20-\x7e]/g, '?')}" is not a valid project name\n  = help: lowercase letters, digits, dot, dash and underscore, like my-app`
  const d = resolve(n)
  if (existsSync(d) && readdirSync(d).length && !argv.includes('--force')) return `${col.r('error[RK0801]')}: folder ${n} is not empty\n  = help: pick another name or pass --force`
  return null
}

const NO_DB = 'none'
const steps = [
  { key: 'name', def: () => positional ?? 'raiko-app', given: () => positional, validate: nameError, ask: (a, back) => text('Project name', a.name ?? 'raiko-app', back) },
  { key: 'template', def: () => 'full', ask: (a, back) => select('Template', [{ value: 'full', label: 'Full', hint: 'pages, API, chat, everything below' }, { value: 'minimal', label: 'Minimal', hint: 'one page and one API route' }], a.template ?? 'full', back) },
  {
    key: 'frontend',
    def: () => 'raiko',
    validate: (v) => (v === 'angular' ? `${col.r('error[RK0804]')}: the Angular template is paused while it gets fixed\n  = help: pick raiko, react, vue, svelte, solid or preact` : null),
    ask: (a, back) => select('Frontend', FRONTENDS, a.frontend ?? 'raiko', back) },
  {
    key: 'css',
    def: () => 'monsoon',
    validate: (v, a) => (v === 'stylex' && a.frontend !== 'react' ? `${col.r('error[RK0802]')}: StyleX needs the React frontend\n  = help: pick React, or another CSS option` : null),
    ask: (a, back) => {
      const opts = CSS.filter((c) => !c.only || c.only.includes(a.frontend))
      return select('CSS', opts, opts.some((o) => o.value === a.css) ? a.css : 'monsoon', back)
    },
  },
  {
    key: 'icons',
    def: () => 'glyphfox',
    ask: (a, back) => {
      const opts = ICONS.filter((c) => !c.only || c.only.includes(a.frontend))
      return select('Icons', opts, opts.some((o) => o.value === a.icons) ? a.icons : 'glyphfox', back)
    },
  },
  { key: 'motion', def: () => false, ask: (a, back) => confirm('Animations with Motion (formerly Framer Motion)?', a.motion ?? false, back) },
  { key: 'orm', def: () => NO_DB, ask: (a, back) => select('Database ORM', [{ value: 'kastor', label: 'Kastor', hint: 'TypeScript ORM, no codegen' }, { value: 'prisma', label: 'Prisma' }, { value: 'drizzle', label: 'Drizzle' }, { value: NO_DB, label: 'No database' }], a.orm ?? NO_DB, back) },
  { key: 'db', when: (a) => a.orm !== NO_DB, skip: NO_DB, def: () => 'sqlite', ask: (a, back) => select('Database', [{ value: 'sqlite', label: 'SQLite', hint: 'a file, no server needed' }, { value: 'postgres', label: 'PostgreSQL' }], a.db && a.db !== NO_DB ? a.db : 'sqlite', back) },
  { key: 'auth', list: true, def: () => [], ask: (a, back) => multiselect('Sign in methods', [{ value: 'credentials', label: 'Email and password' }, { value: 'github', label: 'GitHub' }, { value: 'google', label: 'Google' }, { value: 'discord', label: 'Discord' }, { value: 'gitlab', label: 'GitLab' }], a.auth ?? ['credentials'], back) },
  { key: 'twofa', when: (a) => a.auth.length > 0, skip: false, def: () => false, ask: (a, back) => confirm('Two factor auth with Google Authenticator (TOTP)?', a.twofa ?? true, back) },
  { key: 'email', def: () => 'none', ask: (a, back) => select('Email provider', [{ value: 'resend', label: 'Resend' }, { value: 'postmark', label: 'Postmark' }, { value: 'sendgrid', label: 'SendGrid' }, { value: 'smtp', label: 'SMTP', hint: 'any server, via nodemailer' }, { value: 'none', label: 'None for now', hint: 'emails print in the terminal' }], a.email ?? 'none', back) },
  { key: 'i18n', def: () => false, ask: (a, back) => confirm('Translations (en, pt-BR, es, fr, de)?', a.i18n ?? false, back) },
  { key: 'admin', when: (a) => a.orm !== NO_DB, skip: false, def: () => true, ask: (a, back) => confirm('Admin panel at /admin?', a.admin ?? true, back) },
  { key: 'roles', list: true, when: (a) => a.admin, skip: [], def: () => ['editor'], ask: (a, back) => multiselect('Admin roles (admin always has full access)', [{ value: 'editor', label: 'editor', hint: 'manage posts, read users' }, { value: 'support', label: 'support', hint: 'fix users, cannot list or delete' }, { value: 'viewer', label: 'viewer', hint: 'read only' }], a.roles ?? ['editor'], back) },
  { key: 'cookies', def: () => 'none', ask: (a, back) => select('Cookie consent banner (cookieowl)', [{ value: 'none', label: 'None' }, { value: 'lgpd', label: 'LGPD', hint: 'Brazil, Portuguese texts' }, { value: 'gdpr', label: 'GDPR', hint: 'Europe, visitor language' }], a.cookies ?? 'none', back) },
  { key: 'pwa', def: () => false, ask: (a, back) => confirm('Installable app with offline support (installkite)?', a.pwa ?? false, back) },
  { key: 'deploy', def: () => 'docker', ask: (a, back) => select('Deploy target', [{ value: 'vercel', label: 'Vercel' }, { value: 'cloudflare', label: 'Cloudflare Workers' }, { value: 'docker', label: 'Docker', hint: 'Fly, Railway, Render, any VPS' }, { value: 'node', label: 'Plain server', hint: 'bun or node on your machine' }], a.deploy ?? 'docker', back) },
  { key: 'pm', def: () => detectedPm, ask: (a, back) => select('Package manager', [{ value: detectedPm, label: detectedPm, hint: 'detected' }, ...['bun', 'npm', 'pnpm', 'yarn'].filter((p) => p !== detectedPm).map((p) => ({ value: p, label: p }))], a.pm ?? detectedPm, back) },
  { key: 'install', def: () => !argv.includes('--no-install'), ask: (a, back) => confirm('Install dependencies now?', a.install ?? true, back) },
  { key: 'git', def: () => !argv.includes('--no-git'), ask: (a, back) => confirm('Initialize a git repository?', a.git ?? true, back) },
]

// Walk the steps. Esc, Backspace or the left arrow goes back to the last question that was asked;
// steps answered by flags or skipped by an earlier answer are not revisited.
const a = {}
const history = []
for (let i = 0; i < steps.length; ) {
  const s = steps[i]
  if (s.when && !s.when(a)) {
    a[s.key] = s.skip
    i++
    continue
  }
  const fixed = s.given ? s.given() : flag(s.key)
  if (fixed !== undefined || !interactive) {
    const v = fixed !== undefined ? (s.list ? list(parse(fixed)) : parse(fixed)) : s.def(a)
    const err = s.validate?.(v, a)
    if (err) {
      console.error(`\n  ${err}\n`)
      process.exit(1)
    }
    a[s.key] = v
    i++
    continue
  }
  const v = await s.ask(a, history.length > 0)
  if (v === BACK) {
    i = history.pop()
    continue
  }
  const err = s.validate?.(v, a)
  if (err) {
    console.log(`  ${err}`)
    continue
  }
  a[s.key] = v
  history.push(i)
  i++
}

const { name, template, frontend, css, icons, motion, orm, db, auth, twofa, email, i18n, admin, cookies, pwa, deploy, pm, install, git } = a
const dir = resolve(name)
const roles = { admin: ROLE_PRESETS.admin }
for (const r of a.roles ?? []) if (ROLE_PRESETS[r]) roles[r] = ROLE_PRESETS[r]

const o = { name: basename(dir), template, frontend, css, icons, motion, orm, db, auth, twofa, email, i18n, admin, roles, cookies, pwa, deploy, pm }
if (flag('dry') !== undefined) {
  console.log(JSON.stringify(o, null, 2))
  process.exit(0)
}

const files = generate(o)
await spin(`writing ${Object.keys(files).length} files`, async () => {
  for (const [p, content] of Object.entries(files)) {
    const full = join(dir, p)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
})

// a real random secret, only in the local .env (gitignored, dockerignored), never in code
writeFileSync(join(dir, '.env'), files['.env.example'].replace(/^AUTH_SECRET=$/m, `AUTH_SECRET=${randomBytes(48).toString('base64url')}`))

if (admin) {
  console.log(`\n  ${col.b('Admin permissions')} ${col.d('(edit them in raiko.config.ts)')}\n`)
  const w = Math.max(...Object.keys(roles).map((r) => r.length), 4)
  console.log(`  ${'role'.padEnd(w)}  ${RESOURCES.map((r) => r.padEnd(34)).join('')}`)
  for (const [role, res] of Object.entries(roles)) {
    const cells = RESOURCES.map((r) => {
      const a = res[r] ?? []
      const s = a === '*' ? 'all' : ACTIONS.map((x) => (a.includes(x) ? x : col.d('-'.repeat(x.length)))).join(' ')
      return s + ' '.repeat(Math.max(1, 34 - (a === '*' ? 3 : ACTIONS.join(' ').length)))
    })
    console.log(`  ${col.y(role.padEnd(w))}  ${cells.join('')}`)
  }
  console.log(`\n  ${col.d('a role can read or update a row without being able to list the table')}`)
}

if (install) {
  const r = await spin(`installing with ${pm}`, async () => spawnSync(pm, ['install'], { cwd: dir, stdio: 'pipe', shell: process.platform === 'win32' }))
  if (r.status) {
    console.log(col.r(String(r.stderr ?? '').slice(-2000)))
    console.log(`  ${col.r('install failed')}: run ${col.y(`cd ${name} && ${pm} install`)} to see why`)
  }
}
if (pwa && install) {
  await spin('creating PWA files with installkite', async () =>
    spawnSync(pm === 'bun' ? 'bunx' : 'npx', ['installkite', 'init', '--yes'], { cwd: join(dir, frontend === 'raiko' ? 'public' : 'web/public'), stdio: 'pipe', shell: process.platform === 'win32' }),
  )
}
if (git && spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0) {
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  spawnSync('git', ['add', '-A'], { cwd: dir })
  spawnSync('git', ['-c', 'user.name=raiko', '-c', 'user.email=raiko@localhost', 'commit', '-q', '-m', 'Initial commit from create-raiko'], { cwd: dir })
}

console.log(`
  ${col.g('done.')} next:

    cd ${name}
    ${install ? '' : `${pm} install\n    `}${run(o, 'dev')}
${orm !== 'none' ? `    ${run(o, 'db:migrate')}   ${col.d('create the tables')}\n` : ''}
  ${col.d('docs')}     https://kwy404.github.io/Raiko.js/docs/
  ${col.d('deploy')}   ${run(o, 'deploy')}
`)
