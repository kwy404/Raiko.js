#!/usr/bin/env node
// create-raiko: bun create raiko | npm create raiko@latest | pnpm create raiko
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { select, multiselect, text, confirm, spin, col } from './prompt.mjs'
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

console.log(`
  ${col.y('  /\\_/\\   ')}  ${col.b('raiko')}${col.d('.js')}
  ${col.y(' ( o.o )  ')}  ${col.d('backend and frontend in one file tree')}
  ${col.y('  > ^ <   ')}  ${col.d('every runtime. strikes first.')}
`)

const positional = argv.find((a, i) => !a.startsWith('-') && !(argv[i - 1] ?? '').startsWith('--'))
const name = positional ?? (yes ? 'raiko-app' : await text('Project name', 'raiko-app'))
// npm package name rules: the name also lands in generated code, so nothing else is allowed
if (!/^[a-z0-9][a-z0-9._-]{0,213}$/.test(basename(name))) {
  console.error(`\n  ${col.r('error[RK0803]')}: "${basename(name).replace(/[^\x20-\x7e]/g, '?')}" is not a valid project name\n  = help: lowercase letters, digits, dot, dash and underscore, like my-app\n`)
  process.exit(1)
}
const dir = resolve(name)
if (existsSync(dir) && readdirSync(dir).length && !argv.includes('--force')) {
  console.error(`\n  ${col.r('error[RK0801]')}: folder ${name} is not empty\n  = help: pick another name or pass --force\n`)
  process.exit(1)
}

const template = await ask('template', () => select('Template', [{ value: 'full', label: 'Full', hint: 'pages, API, chat over WebSocket, everything you pick below' }, { value: 'minimal', label: 'Minimal', hint: 'one page and one API route' }]), 'full')
const frontend = await ask('frontend', () => select('Frontend', FRONTENDS), 'raiko')
const css = await ask('css', () => select('CSS', CSS.filter((c) => !c.only || c.only.includes(frontend))), 'monsoon')
if (css === 'stylex' && frontend !== 'react') {
  console.error(`  ${col.r('error[RK0802]')}: StyleX needs the React frontend\n  = help: pick --frontend react, or another CSS option`)
  process.exit(1)
}
const icons = await ask('icons', () => select('Icons', ICONS.filter((c) => !c.only || c.only.includes(frontend))), 'glyphfox')
const motion = await ask('motion', () => confirm('Animations with Motion (formerly Framer Motion)?', false), false)
const orm = await ask('orm', () => select('Database ORM', [{ value: 'kastor', label: 'Kastor', hint: 'TypeScript ORM, no codegen' }, { value: 'prisma', label: 'Prisma' }, { value: 'drizzle', label: 'Drizzle' }, { value: 'none', label: 'No database' }]), 'none')
const db = orm === 'none' ? 'none' : await ask('db', () => select('Database', [{ value: 'sqlite', label: 'SQLite', hint: 'a file, no server needed' }, { value: 'postgres', label: 'PostgreSQL' }]), 'sqlite')
const auth = list(await ask('auth', () => multiselect('Sign in methods', [{ value: 'credentials', label: 'Email and password' }, { value: 'github', label: 'GitHub' }, { value: 'google', label: 'Google' }, { value: 'discord', label: 'Discord' }, { value: 'gitlab', label: 'GitLab' }], ['credentials']), []))
const twofa = auth.length ? await ask('twofa', () => confirm('Two factor auth with Google Authenticator (TOTP)?', true), false) : false
const email = await ask('email', () => select('Email provider', [{ value: 'resend', label: 'Resend' }, { value: 'postmark', label: 'Postmark' }, { value: 'sendgrid', label: 'SendGrid' }, { value: 'smtp', label: 'SMTP', hint: 'any server, via nodemailer' }, { value: 'none', label: 'None for now', hint: 'emails print in the terminal' }]), 'none')
const i18n = await ask('i18n', () => confirm('Translations (en, pt-BR, es, fr, de)?', false), false)
const admin = orm === 'none' ? false : await ask('admin', () => confirm('Admin panel at /admin?', true), true)

let roles = { admin: ROLE_PRESETS.admin }
if (admin) {
  const picked = list(await ask('roles', () => multiselect('Admin roles (admin always has full access)', [{ value: 'editor', label: 'editor', hint: 'manage posts, read users' }, { value: 'support', label: 'support', hint: 'read and fix users, cannot list or delete' }, { value: 'viewer', label: 'viewer', hint: 'read only' }], ['editor']), 'editor'))
  for (const r of picked) if (ROLE_PRESETS[r]) roles[r] = ROLE_PRESETS[r]
}
const cookies = await ask('cookies', () => select('Cookie consent banner (cookieowl)', [{ value: 'none', label: 'None' }, { value: 'lgpd', label: 'LGPD', hint: 'Brazil, Portuguese texts' }, { value: 'gdpr', label: 'GDPR', hint: 'Europe, visitor language' }]), 'none')
const pwa = await ask('pwa', () => confirm('Installable app with offline support (installkite)?', false), false)
const deploy = await ask('deploy', () => select('Deploy target', [{ value: 'vercel', label: 'Vercel' }, { value: 'cloudflare', label: 'Cloudflare Workers' }, { value: 'docker', label: 'Docker', hint: 'Fly, Railway, Render, any VPS' }, { value: 'node', label: 'Plain server', hint: 'bun or node on your machine' }]), 'docker')
const pm = await ask('pm', () => select('Package manager', [{ value: detectedPm, label: detectedPm, hint: 'detected' }, ...['bun', 'npm', 'pnpm', 'yarn'].filter((p) => p !== detectedPm).map((p) => ({ value: p, label: p }))]), detectedPm)
const install = await ask('install', () => confirm('Install dependencies now?', true), !argv.includes('--no-install'))
const git = await ask('git', () => confirm('Initialize a git repository?', true), !argv.includes('--no-git'))

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
