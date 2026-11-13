// Files shared by every frontend: config, database, auth, email, i18n, deploy.
export const V = {
  raiko: '^1.0.2', typescript: '5.6.3', bunTypes: '1.1.13', nodeTypes: '22.9.0', tsx: '4.19.2', esbuild: '0.24.0', vite: '5.4.11', terser: '5.36.0',
  kastor: '0.2.0', prisma: '5.22.0', drizzle: '0.38.3', drizzleKit: '0.30.1', betterSqlite: '11.7.0', pg: '8.13.1', postgresJs: '3.4.5',
  glyphfox: '1.3.0', lucide: '0.469.0', heroicons: '2.2.0', motion: '11.15.0', nodemailer: '6.9.16',
}
export const LOCALES = { en: 'English', 'pt-BR': 'Portugues', es: 'Espanol', fr: 'Francais', de: 'Deutsch' }
const T = {
  en: { title: 'Welcome to Raiko', subtitle: 'Edit app/page.tsx and save to reload.', docs: 'Read the docs', count: 'Clicked {count} times' },
  'pt-BR': { title: 'Bem vindo ao Raiko', subtitle: 'Edite app/page.tsx e salve para recarregar.', docs: 'Ler a documentacao', count: 'Clicou {count} vezes' },
  es: { title: 'Bienvenido a Raiko', subtitle: 'Edita app/page.tsx y guarda para recargar.', docs: 'Leer la documentacion', count: 'Pulsado {count} veces' },
  fr: { title: 'Bienvenue sur Raiko', subtitle: 'Modifiez app/page.tsx et enregistrez pour recharger.', docs: 'Lire la documentation', count: 'Clique {count} fois' },
  de: { title: 'Willkommen bei Raiko', subtitle: 'Bearbeite app/page.tsx und speichere zum Neuladen.', docs: 'Dokumentation lesen', count: '{count} mal geklickt' },
}

export const isVite = (o) => o.frontend !== 'raiko'
export const run = (o, s) => (o.pm === 'npm' ? `npm run ${s}` : `${o.pm} ${o.pm === 'yarn' ? '' : 'run '}${s}`.replace('  ', ' '))
export const exec = (o, s) => (o.pm === 'bun' ? `bunx ${s}` : o.pm === 'pnpm' ? `pnpm dlx ${s}` : `npx ${s}`)
const json = (v) => JSON.stringify(v, null, 2) + '\n'

export function dbFiles(o) {
  const f = {}
  const sqlite = o.db === 'sqlite'
  if (o.orm === 'kastor') {
    f['db/schema.ts'] = `import { table, t } from 'kastor-orm'

export const users = table('users', {
  id: t.id(),
  email: t.string(255).unique(),
  name: t.string().nullable(),
  role: t.enum([${Object.keys(o.roles).map((r) => `'${r}'`).join(', ')}, 'user']).default('user'),
  passwordHash: t.string().nullable(),
  totpSecret: t.string().nullable(),
  createdAt: t.datetime().defaultNow(),
})

export const posts = table('posts', {
  id: t.id(),
  title: t.string(200),
  body: t.text().nullable(),
  published: t.boolean().default(false),
  createdAt: t.datetime().defaultNow(),
})

export const schema = { users, posts }
`
    f['db/index.ts'] = sqlite
      ? `import { kastor } from 'kastor-orm'
import { sqlite } from 'kastor-orm/sqlite'
import { schema } from './schema'

// bun:sqlite on Bun, better-sqlite3 on Node
const Database = (globalThis as any).Bun ? (await import('bun:sqlite' as string)).Database : (await import('better-sqlite3' as string)).default
export const db = kastor({ adapter: sqlite(new Database(process.env.DATABASE_URL ?? 'app.db')), schema })
`
      : `import pg from 'pg'
import { kastor } from 'kastor-orm'
import { postgres } from 'kastor-orm/postgres'
import { schema } from './schema'

export const db = kastor({ adapter: postgres(new pg.Pool({ connectionString: process.env.DATABASE_URL })), schema })
`
  }
  if (o.orm === 'prisma') {
    f['prisma/schema.prisma'] = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "${sqlite ? 'sqlite' : 'postgresql'}"
  url      = env("DATABASE_URL")
}

model User {
  id           Int      @id @default(autoincrement())
  email        String   @unique
  name         String?
  role         String   @default("user")
  passwordHash String?
  totpSecret   String?
  createdAt    DateTime @default(now())
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  body      String?
  published Boolean  @default(false)
  createdAt DateTime @default(now())
}
`
    f['db/index.ts'] = `import { PrismaClient } from '@prisma/client'

const g = globalThis as unknown as { prisma?: PrismaClient }
export const prisma = (g.prisma ??= new PrismaClient())
// same names as the other templates, so the rest of the app does not care which ORM you picked
export const db = { users: prisma.user, posts: prisma.post }
`
  }
  if (o.orm === 'drizzle') {
    f['db/schema.ts'] = sqlite
      ? `import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name'),
  role: text('role').notNull().default('user'),
  passwordHash: text('password_hash'),
  totpSecret: text('totp_secret'),
})

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  body: text('body'),
  published: integer('published', { mode: 'boolean' }).notNull().default(false),
})
`
      : `import { pgTable, serial, text, boolean } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  role: text('role').notNull().default('user'),
  passwordHash: text('password_hash'),
  totpSecret: text('totp_secret'),
})

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body'),
  published: boolean('published').notNull().default(false),
})
`
    f['db/index.ts'] = sqlite
      ? `import * as schema from './schema'

const bun = !!(globalThis as any).Bun
const url = process.env.DATABASE_URL ?? 'app.db'
export const db = bun
  ? (await import('drizzle-orm/bun-sqlite')).drizzle(new (await import('bun:sqlite' as string)).Database(url), { schema })
  : (await import('drizzle-orm/better-sqlite3' as string)).drizzle(new (await import('better-sqlite3' as string)).default(url), { schema })
export { schema }
`
      : `import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

export const db = drizzle(postgres(process.env.DATABASE_URL!), { schema })
export { schema }
`
    f['drizzle.config.ts'] = `import { defineConfig } from 'drizzle-kit'

export default defineConfig({ schema: './db/schema.ts', out: './db/migrations', dialect: '${sqlite ? 'sqlite' : 'postgresql'}', dbCredentials: { url: process.env.DATABASE_URL ?? 'app.db' } })
`
  }
  return f
}

/** The single config file the user edits later: auth, 2FA, email, i18n, admin roles. */
export function configFile(o) {
  const lines = [`/**
 * Everything the installer asked lives here. Change it any time.
 * Secrets come from .env (copy .env.example).
 */
import { defineConfig } from './shared/config'

export default defineConfig({
  name: ${JSON.stringify(o.name)},
  url: process.env.APP_URL ?? 'http://localhost:3000',
`]
  lines.push(`  auth: {
    enabled: ${o.auth.length > 0},
    providers: ${JSON.stringify(o.auth)},
    /** TOTP two factor (Google Authenticator, Authy, 1Password) */
    twoFactor: ${o.twofa},
  },
  email: {
    /** resend | postmark | sendgrid | smtp | console */
    provider: ${JSON.stringify(o.email === 'none' ? 'console' : o.email)},
    from: process.env.MAIL_FROM ?? 'hello@example.com',
  },
  i18n: {
    enabled: ${o.i18n},
    locales: ${JSON.stringify(o.i18n ? Object.keys(LOCALES) : ['en'])},
    default: 'en',
  },
  admin: {
    enabled: ${o.admin},
    path: '/admin',
    /**
     * Permissions per role and resource. Actions: list, read, create, update, delete.
     * '*' allows all five. A role missing here cannot open the admin at all.
     */
    roles: ${JSON.stringify(o.roles, null, 2).replace(/\n/g, '\n    ')},
  },
})
`)
  return lines.join('')
}

export function sharedFiles(o) {
  return {
    'shared/config.ts': `export type Action = 'list' | 'read' | 'create' | 'update' | 'delete'
export interface AppConfig {
  name: string
  url: string
  auth: { enabled: boolean; providers: string[]; twoFactor: boolean }
  email: { provider: 'resend' | 'postmark' | 'sendgrid' | 'smtp' | 'console'; from: string }
  i18n: { enabled: boolean; locales: string[]; default: string }
  admin: { enabled: boolean; path: string; roles: Record<string, Record<string, Action[] | '*'>> }
}
export const defineConfig = (c: AppConfig) => c
`,
    'shared/schemas.ts': `/**
 * Shared between backend and frontend: one schema, validated on the server,
 * typed on the client.
 */
import { t, type Static } from 'raiko.js'

export const NewPost = t.Object({
  title: t.String({ minLength: 1, maxLength: 200 }),
  body: t.Optional(t.String({ maxLength: 10_000 })),
})
export type NewPost = Static<typeof NewPost>

export const ChatMessage = t.Object({ text: t.String({ minLength: 1, maxLength: 500 }) })
export type ChatMessage = Static<typeof ChatMessage>
`,
  }
}

/** Server pieces used by both kinds of templates. Returns code to paste into the server entry. */
export function serverPieces(o) {
  const imports = [`import { Raiko, isMain } from 'raiko.js'`, `import { cors, secureHeaders, logger, rateLimit, health, openapi } from 'raiko.js/plugins'`, `import config from '${o.serverDepth}raiko.config'`]
  const uses = [`  .use(logger())`, `  .use(secureHeaders({ hsts: process.env.NODE_ENV === 'production' }))`, `  .use(cors({ origin: [config.url], credentials: true }))`, `  .use(rateLimit({ max: 300, window: 60_000 }))`, `  .use(health())`]
  if (o.orm !== 'none') imports.push(`import { db } from '${o.serverDepth}db'`)
  if (o.auth.length) {
    imports.push(`import { auth } from '${o.serverDepth}server/auth'`)
    uses.push(`  .use(auth.plugin)`)
  }
  if (o.email !== 'none' || o.auth.length) {
    imports.push(`import { mailer } from '${o.serverDepth}emails'`)
    uses.push(`  .use(process.env.NODE_ENV !== 'production' ? mailer.preview() : new Raiko())`)
  }
  if (o.i18n) {
    imports.push(`import { i18n } from '${o.serverDepth}locales'`)
    uses.push(`  .use(i18n.plugin())`)
  }
  if (o.admin) {
    imports.push(`import { adminPanel } from '${o.serverDepth}server/admin'`)
    uses.push(`  .use(adminPanel)`)
  }
  return { imports, uses }
}

export function authFiles(o) {
  if (!o.auth.length) return {}
  const providers = o.auth.filter((p) => p !== 'credentials').map((p) => `${p[0].toUpperCase()}${p.slice(1).replace('github', 'itHub').replace(/^ithub/, 'itHub')}`)
  const names = { github: 'GitHub', google: 'Google', discord: 'Discord', gitlab: 'GitLab' }
  const imports = ['raikoAuth', ...o.auth.map((p) => (p === 'credentials' ? 'Credentials' : names[p])), ...(o.auth.includes('credentials') ? ['verifyPassword'] : [])]
  const list = o.auth.map((p) =>
    p === 'credentials'
      ? `    Credentials({
      async authorize({ email, password }) {
${o.orm !== 'none' ? `        const user = await db.users.findUnique({ where: { email: String(email) } })
        if (!user?.passwordHash || !(await verifyPassword(String(password), user.passwordHash))) return null
        return { id: String(user.id), email: user.email, name: user.name, role: user.role }` : `        // no database picked: replace this with your own user lookup
        if (email === 'demo@raiko.dev' && password === 'raiko-demo') return { id: '1', email: 'demo@raiko.dev', role: 'admin' }
        return null`}
      },
    }),`
      : `    ${names[p]}({ clientId: process.env.${p.toUpperCase()}_CLIENT_ID!, clientSecret: process.env.${p.toUpperCase()}_CLIENT_SECRET! }),`,
  )
  void providers
  return {
    'server/auth.ts': `import { ${imports.join(', ')} } from 'raiko.js/auth'
${o.orm !== 'none' ? "import { db } from '../db'\n" : ''}import config from '../raiko.config'

export const auth = raikoAuth({
  // a missing secret in production would let anyone forge sessions, so it refuses to start
  // the fallback exists only while developing; anywhere else a missing secret refuses to start,
  // because a known secret would let anyone forge an admin session
  // the installer wrote a random AUTH_SECRET to .env; a missing one refuses to start,
  // because a known secret would let anyone forge an admin session
  secret:
    process.env.AUTH_SECRET ||
    (() => {
      throw new Error('AUTH_SECRET is not set. Generate one with: npx raiko secret')
    })(),
  url: config.url,
  pages: { signIn: '/login', twoFactor: '/login/2fa' },
  providers: [
${list.join('\n')}
  ],${o.twofa ? `
  twoFactor: config.auth.twoFactor
    ? {
        // return the user's TOTP secret when they turned 2FA on
        getSecret: async (user) => ${o.orm !== 'none' ? `(await db.users.findUnique({ where: { id: Number(user.id) } }))?.totpSecret ?? null` : 'null'},
      }
    : undefined,` : ''}
})
`,
  }
}

export function emailFiles(o) {
  if (o.email === 'none' && !o.auth.length) return {}
  const transport = { resend: `resend({ apiKey: process.env.RESEND_API_KEY! })`, postmark: `postmark({ serverToken: process.env.POSTMARK_TOKEN! })`, sendgrid: `sendgrid({ apiKey: process.env.SENDGRID_API_KEY! })`, smtp: `smtp({ host: process.env.SMTP_HOST!, port: Number(process.env.SMTP_PORT ?? 587), user: process.env.SMTP_USER, pass: process.env.SMTP_PASS })`, none: `consoleTransport()` }[o.email]
  const fn = { resend: 'resend', postmark: 'postmark', sendgrid: 'sendgrid', smtp: 'smtp', none: 'consoleTransport' }[o.email]
  return {
    'emails/welcome.tsx': `/** @jsxImportSource raiko.js */
/** Preview it at /_raiko/mail/welcome while running the dev server. */
export default function Welcome({ name }: { name: string }) {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '520px', margin: '0 auto', padding: '32px' }}>
      <h1 style={{ fontSize: '22px' }}>Welcome, {name}</h1>
      <p>Your account is ready.</p>
      <a href="https://example.com" style={{ background: '#ffd23f', color: '#0a0a0b', padding: '10px 18px', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>Open the app</a>
    </div>
  )
}
Welcome.subject = (p: { name: string }) => \`Welcome, \${p.name}\`
Welcome.preview = { name: 'Ana' }
`,
    'emails/index.ts': `import { createMailer, ${fn}${fn !== 'consoleTransport' ? ', consoleTransport' : ''} } from 'raiko.js/mail'
import config from '../raiko.config'
import Welcome from './welcome'

export const mailer = createMailer({
  from: config.email.from,
  // print emails in development, send them in production
  transport: process.env.NODE_ENV === 'production' ? ${transport} : consoleTransport(),
  templates: { welcome: Welcome },
})
`,
  }
}

export function i18nFiles(o) {
  if (!o.i18n) return {}
  const f = {}
  for (const l of Object.keys(LOCALES)) f[`locales/${l}.ts`] = `export default ${JSON.stringify(T[l], null, 2)} as const\n`
  f['locales/index.ts'] = `import { createI18n } from 'raiko.js/i18n'
${Object.keys(LOCALES).map((l) => `import ${l.replace('-', '')} from './${l}'`).join('\n')}

export const i18n = createI18n({ ${Object.keys(LOCALES).map((l) => (l.includes('-') ? `'${l}': ${l.replace('-', '')}` : l)).join(', ')} }, { fallback: 'en', cookie: 'locale' })
`
  return f
}

export function adminFiles(o) {
  if (!o.admin) return {}
  const adapter = o.orm === 'drizzle' ? `drizzleAdapter(db, schema.users, { id: schema.users.id, searchable: [schema.users.email] })` : `modelAdapter(db.users, { searchable: ['email', 'name'] })`
  const adapter2 = o.orm === 'drizzle' ? `drizzleAdapter(db, schema.posts, { id: schema.posts.id, searchable: [schema.posts.title] })` : `modelAdapter(db.posts, { searchable: ['title'] })`
  const perm = (res) => `Object.fromEntries(Object.entries(config.admin.roles).map(([role, r]) => [role, r.${res} ?? []]))`
  return {
    'server/admin.ts': `import { admin, ${o.orm === 'drizzle' ? 'drizzleAdapter' : 'modelAdapter'} } from 'raiko.js/admin'
import { db${o.orm === 'drizzle' ? ', schema' : ''} } from '../db'
import config from '../raiko.config'

/** Permissions come from raiko.config.ts, edit them there. */
export const adminPanel = admin({
  path: config.admin.path,
  title: \`\${config.name} admin\`,
  ${o.auth.length ? `auth: ({ auth }: any) => auth?.user?.role ?? null,` : `// no auth picked: everyone is admin in development, nobody in production
  auth: () => (process.env.NODE_ENV === 'production' ? null : 'admin'),`}
  signIn: '/login',
  resources: {
    users: { adapter: ${adapter}, fields: ['id', 'email', 'name', 'role'], hidden: ['passwordHash', 'totpSecret'], permissions: ${perm('users')} },
    posts: { adapter: ${adapter2}, fields: ['id', 'title', 'published'], permissions: ${perm('posts')} },
  },
})
`,
  }
}

export function deployFiles(o) {
  const f = {}
  const out = isVite(o) ? 'dist' : 'public'
  if (o.deploy === 'vercel') {
    f['api/index.ts'] = `import app from '../${isVite(o) ? 'server/index' : 'server'}'\n\nexport default { fetch: app.fetch }\n`
    f['vercel.json'] = json({
      $schema: 'https://openapi.vercel.sh/vercel.json',
      buildCommand: isVite(o) ? 'npx raiko manifest && npx vite build' : 'npx raiko manifest',
      outputDirectory: out,
      rewrites: isVite(o) ? [{ source: '/(api|auth|admin|docs|_raiko|health)(.*)', destination: '/api' }, { source: '/(.*)', destination: '/index.html' }] : [{ source: '/(.*)', destination: '/api' }],
    })
  }
  if (o.deploy === 'cloudflare') {
    f['worker.ts'] = `import app from './${isVite(o) ? 'server/index' : 'server'}'\n\nexport default { fetch: app.fetch }\n`
    f['wrangler.toml'] = `name = ${JSON.stringify(o.name)}\nmain = "worker.ts"\n# 2025-04-01 or later fills process.env from vars and secrets: npx wrangler secret put AUTH_SECRET\ncompatibility_date = "2025-04-01"\ncompatibility_flags = ["nodejs_compat"]\n\n[vars]\nNODE_ENV = "production"\n\n[assets]\ndirectory = "./${out}"\n${isVite(o) ? 'not_found_handling = "single-page-application"\n' : ''}`
  }
  if (o.deploy === 'docker' || o.deploy === 'node') {
    const assets = isVite(o) ? 'dist' : 'public'
    f['Dockerfile'] = `# small production image, Bun runtime, runs as a non root user
FROM oven/bun:1.1-alpine AS build
WORKDIR /app
COPY package.json ./
RUN bun install
COPY . .
RUN bun run build && rm -rf node_modules && bun install --production

FROM oven/bun:1.1-alpine
WORKDIR /app
ENV NODE_ENV=production
# only what runs: no source, no .env files, no local databases
COPY --from=build --chown=bun:bun /app/package.json ./
COPY --from=build --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/.raiko/out ./.raiko/out
COPY --from=build --chown=bun:bun /app/${assets} ./${assets}
USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]
`
    f['.dockerignore'] = 'node_modules\n.git\n.env\n.env.*\n!.env.example\n*.db\n*.db-journal\n*.sqlite\n.raiko\ndist\n*.log\n.vercel\n.wrangler\n'
  }
  return f
}

export function envExample(o) {
  const l = ['APP_URL=http://localhost:3000', 'PORT=3000']
  if (o.orm !== 'none') l.push(o.db === 'sqlite' ? (o.orm === 'prisma' ? 'DATABASE_URL=file:./app.db' : 'DATABASE_URL=app.db') : 'DATABASE_URL=postgres://user:pass@localhost:5432/app')
  if (o.auth.length) l.push('# generate with: npx raiko secret', 'AUTH_SECRET=')
  for (const p of o.auth.filter((p) => p !== 'credentials')) l.push(`${p.toUpperCase()}_CLIENT_ID=`, `${p.toUpperCase()}_CLIENT_SECRET=`)
  if (o.email !== 'none') l.push('MAIL_FROM=hello@example.com')
  if (o.email === 'resend') l.push('RESEND_API_KEY=')
  if (o.email === 'postmark') l.push('POSTMARK_TOKEN=')
  if (o.email === 'sendgrid') l.push('SENDGRID_API_KEY=')
  if (o.email === 'smtp') l.push('SMTP_HOST=', 'SMTP_PORT=587', 'SMTP_USER=', 'SMTP_PASS=')
  return l.join('\n') + '\n'
}

export function gitignore() {
  return 'node_modules\ndist\n.raiko\n.env\n.env.*\n!.env.example\n*.log\n*.db\n.vercel\n.wrangler\n.DS_Store\n'
}
