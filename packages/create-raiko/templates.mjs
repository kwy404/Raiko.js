// Generates every file of a new project from the installer answers.
import { welcomeFiles } from './welcome.mjs'
import { V, LOCALES, isVite, run, exec, dbFiles, configFile, sharedFiles, serverPieces, authFiles, emailFiles, i18nFiles, adminFiles, deployFiles, envExample, gitignore } from './templates-common.mjs'

const json = (v) => JSON.stringify(v, null, 2) + '\n'
const MONSOON = 'https://cdn.jsdelivr.net/npm/monsooncss@0.2.0/dist/monsoon.min.css'
const COOKIEOWL = (o) => (o.cookies && o.cookies !== 'none' ? `<script src="https://cdn.jsdelivr.net/npm/cookieowl@0.2.0/dist/cookieowl.js" data-preset="${o.cookies}" data-accent="#ffd23f" data-policy-url="/privacy" defer></script>` : '')
const PWA = (o) => (o.pwa ? `<link rel="manifest" href="/manifest.webmanifest" /><script src="/installkite.js" data-sw="/sw.js" data-install="auto" defer></script>` : '')
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0a0a0b"/><path d="M14 46 22 14l10 14 10-14 8 32-18-8z" fill="#ffd23f"/><path d="M36 22l-6 12h6l-4 12 10-16h-6l4-8z" fill="#0a0a0b"/></svg>`

export const FRONTENDS = [
  { value: 'raiko', label: 'Raiko Pages + Voodoo.js', hint: 'server components, app router, zero JS by default' },
  { value: 'react', label: 'React', hint: 'Vite' },
  { value: 'vue', label: 'Vue', hint: 'Vite' },
  { value: 'svelte', label: 'Svelte', hint: 'Vite' },
  { value: 'solid', label: 'Solid', hint: 'Vite' },
  { value: 'preact', label: 'Preact', hint: 'Vite' },
]
export const CSS = [
  { value: 'monsoon', label: 'Monsoon', hint: 'no build step, theme from one color' },
  { value: 'tailwind', label: 'Tailwind CSS', hint: 'v4' },
  { value: 'stylex', label: 'StyleX', hint: 'by Meta, React only', only: ['react'] },
  { value: 'unocss', label: 'UnoCSS' },
  { value: 'none', label: 'Plain CSS' },
]
export const ICONS = [
  { value: 'glyphfox', label: 'glyphfox', hint: 'morphable icons, every framework' },
  { value: 'lucide', label: 'Lucide' },
  { value: 'heroicons', label: 'Heroicons', hint: 'React and Vue', only: ['react', 'vue'] },
  { value: 'none', label: 'None' },
]

const ext = { react: 'tsx', preact: 'tsx', solid: 'tsx', vue: 'vue', svelte: 'svelte', angular: 'ts' }

// ---------------------------------------------------------------- raiko pages

function raikoPages(o) {
  const f = {}
  const css = o.css === 'monsoon' ? `<link rel="stylesheet" href="${MONSOON}" />` : o.css === 'none' ? '<link rel="stylesheet" href="/styles.css" />' : `<link rel="stylesheet" href="/${o.css === 'unocss' ? 'uno' : 'styles'}.css" />`
  const icon = o.icons === 'glyphfox' ? `import { toSvg } from 'glyphfox'\nimport { raw } from 'raiko.js'\n` : o.icons === 'lucide' ? `import { Zap } from 'lucide-static'\nimport { raw } from 'raiko.js'\n` : ''
  const iconEl = o.icons === 'glyphfox' ? `{raw(toSvg('zap', { size: 28, color: '#ffd23f' }))}` : o.icons === 'lucide' ? `{raw(Zap)}` : ''
  const t = (k, en) => (o.i18n ? `{t('${k}')}` : en)
  f['app/layout.tsx'] = `import type { Metadata } from 'raiko.js/app'
import { SkipLink } from 'raiko.js/components'

export const metadata: Metadata = {
  title: { default: ${JSON.stringify(o.name)}, template: '%s | ${o.name}' },
  description: 'Built with Raiko.js',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({ children }: { children?: any }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        ${css}${o.motion ? `\n        <script type="module" src="/motion.js"></script>` : ''}${COOKIEOWL(o) ? `\n        ${COOKIEOWL(o)}` : ''}${PWA(o) ? `\n        ${PWA(o)}` : ''}
      </head>
      <body class="${o.css === 'monsoon' || o.css === 'tailwind' || o.css === 'unocss' ? 'min-h-screen bg-background text-foreground antialiased' : ''}">
        <SkipLink />
        <div id="main">{children}</div>${o.pwa ? `\n        <button data-installkite-install hidden>Install the app</button>` : ''}
      </body>
    </html>
  )
}
`
  f['app/page.tsx'] = `${icon}${o.i18n ? "import { i18n } from '../locales'\nimport { headers } from 'raiko.js/server'\n" : ''}
/** A server component: it runs on the server, can be async and read the database. */
export default async function Home() {
${o.i18n ? "  const locale = i18n.detect(new Request('http://x', { headers: headers() }))\n  const t = (k: any) => i18n.t(locale, k)\n" : ''}  const started = new Date().toLocaleTimeString()
  return (
    <main class="mx-auto max-w-2xl p-8 space-y-6" style="font-family: ui-sans-serif, system-ui; padding: 48px">
      <h1 class="text-4xl font-bold">${iconEl} ${t('title', `Welcome to ${o.name}`)}</h1>
      <p class="text-muted-foreground">${t('subtitle', 'Edit app/page.tsx and save to reload.')}</p>
      <p class="text-muted-foreground">Rendered on the server at {started}.</p>
      {/* interactivity with Voodoo.js: no build, no hydration */}
      <div v-data="{ count: 0 }">
        <button class="btn btn-primary" v-on:click="count++">Clicked {'{ count }'} times</button>
      </div>
      <p><a class="link" href="https://kwy404.github.io/Raiko.js/docs/">${t('docs', 'Read the docs')}</a>${o.template === 'full' ? ` . <a class="link" href="/chat">Chat demo</a>` : ''}${o.admin ? ' . <a class="link" href="/admin">Admin</a>' : ''}</p>
    </main>
  )
}
`
  f['app/not-found.tsx'] = `export default function NotFound() {
  return (
    <main style="display:grid;place-items:center;min-height:80vh;font-family:system-ui">
      <div><h1 style="font-size:48px;margin:0">404</h1><p>This page could not be found. <a href="/">Go home</a></p></div>
    </main>
  )
}
`
  f['app/error.tsx'] = `export default function ErrorPage({ error }: { error: Error }) {
  return (
    <main style="display:grid;place-items:center;min-height:80vh;font-family:system-ui">
      <div><h1>Something went wrong</h1><p>We were told about it. Try again in a moment.</p></div>
    </main>
  )
}
`
  f['app/api/hello/route.ts'] = `/** API routes live next to pages: GET /api/hello?name=Ana */
export const GET = ({ query }: { query: Record<string, string | undefined> }) => ({ hello: query.name ?? 'world', at: new Date().toISOString() })
`
  if (o.template === 'full') {
    f['app/loading.tsx'] = `export default function Loading() {\n  return <p style="padding:48px">Loading...</p>\n}\n`
    f['app/chat/socket.ts'] = `import { ChatMessage } from '../../shared/schemas'

/** WebSocket at /chat. Messages are validated, encrypted end to end, and broadcast to the room. */
export default {
  body: ChatMessage,
  encrypt: true,
  open(ws: any) {
    ws.subscribe('lobby')
  },
  message(ws: any, msg: { text: string }) {
    const out = { id: ws.id.slice(-4), text: msg.text, at: Date.now() }
    ws.send(out)
    ws.publish('lobby', out)
  },
}
`
    f['app/chat/page.tsx'] = `export const metadata = { title: 'Chat' }

export default function Chat() {
  return (
    <main style="max-width:640px;margin:0 auto;padding:48px;font-family:system-ui">
      <h1>Chat</h1>
      <p class="text-muted-foreground">Open this page in two tabs. Messages are encrypted with AES-GCM.</p>
      <ul id="log"></ul>
      <form id="f"><input id="m" placeholder="Say something" autocomplete="off" /> <button class="btn btn-primary">Send</button></form>
      <script type="module" src="/chat.js"></script>
    </main>
  )
}
`
    f['public/chat.js'] = `// Browser client: reconnects, queues while offline, handles encryption.
import { RaikoClientSocket } from 'https://esm.sh/raiko.js@1/client'

const ws = new RaikoClientSocket(location.origin.replace(/^http/, 'ws') + '/chat')
const log = document.getElementById('log')
ws.on('message', (m) => {
  const li = document.createElement('li')
  li.textContent = m.id + ': ' + m.text
  log.appendChild(li)
})
document.getElementById('f').addEventListener('submit', (e) => {
  e.preventDefault()
  const input = document.getElementById('m')
  if (input.value) ws.send({ text: input.value })
  input.value = ''
})
`
    f['middleware.ts'] = `/** Runs before every page and API route. Return a Response to stop the request. */
export default function middleware(ctx: { path: string; set: { headers: Record<string, string> } }) {
  ctx.set.headers['x-powered-by'] = 'Raiko.js'
}
export const config = { matcher: '^/(?!_raiko)' }
`
  }
  if (o.auth.length) {
    f['app/dashboard/page.tsx'] = `import { currentUser } from 'raiko.js/server'

export const metadata = { title: 'Dashboard' }
/** Only signed in users. Use \`export const roles = ['admin']\` to require a role. */
export const auth = true

export default function Dashboard() {
  const user = currentUser()
  return (
    <main style="max-width:720px;margin:0 auto;padding:48px;font-family:system-ui">
      <h1>Hello, {String(user?.name ?? user?.email ?? 'there')}</h1>
      <form method="post" action="/auth/signout"><button class="btn">Sign out</button></form>
    </main>
  )
}
`
    f['app/forbidden.tsx'] = `export default function Forbidden() {
  return (
    <main style="display:grid;place-items:center;min-height:80vh;font-family:system-ui">
      <div><h1>403</h1><p>You do not have access to this page. <a href="/">Go home</a></p></div>
    </main>
  )
}
`
    f['app/login/page.tsx'] = `export const metadata = { title: 'Sign in' }

export default function Login({ searchParams }: { searchParams: Record<string, string> }) {
  return (
    <main style="max-width:380px;margin:10vh auto;font-family:system-ui">
      <h1>Sign in</h1>
${o.auth.includes('credentials') ? `      <form method="post" action="/auth/signin/credentials">
        <input type="hidden" name="callbackUrl" value={searchParams.callbackUrl ?? '/'} />
        <p><input name="email" type="email" placeholder="Email" required /></p>
        <p><input name="password" type="password" placeholder="Password" required /></p>
        <button class="btn btn-primary">Sign in</button>
      </form>
` : ''}${o.auth.filter((p) => p !== 'credentials').map((p) => `      <p><a class="btn" href="/auth/signin/${p}">Continue with ${p[0].toUpperCase() + p.slice(1)}</a></p>`).join('\n')}
    </main>
  )
}
`
    if (o.twofa)
      f['app/login/2fa/page.tsx'] = `export const metadata = { title: 'Two factor code' }

export default function TwoFactor() {
  return (
    <main style="max-width:380px;margin:10vh auto;font-family:system-ui">
      <h1>Enter your code</h1>
      <p>Open Google Authenticator (or Authy, 1Password) and type the 6 digit code.</p>
      <form method="post" action="/auth/2fa">
        <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required />
        <button class="btn btn-primary">Verify</button>
      </form>
    </main>
  )
}
`
  }
  if (o.cookies && o.cookies !== 'none')
    f['app/privacy/page.tsx'] = `export const metadata = { title: '${o.cookies === 'lgpd' ? 'Privacidade' : 'Privacy'}' }

/** Write your real policy here. cookieowl links to this page from the banner. */
export default function Privacy() {
  return (
    <main style="max-width:720px;margin:0 auto;padding:48px;font-family:system-ui">
      <h1>${o.cookies === 'lgpd' ? 'Politica de privacidade' : 'Privacy policy'}</h1>
      <p>${o.cookies === 'lgpd' ? 'Explique quais dados voce coleta, por que, por quanto tempo e como a pessoa pede a exclusao (LGPD, art. 18).' : 'Explain what data you collect, why, for how long and how people ask for deletion (GDPR, art. 17).'}</p>
      <p><a href="#" data-cookieowl-open>${o.cookies === 'lgpd' ? 'Preferencias de cookies' : 'Cookie settings'}</a></p>
    </main>
  )
}
`
  if (o.css === 'none') f['public/styles.css'] = `:root{color-scheme:dark}body{margin:0;background:#0a0a0b;color:#ededed;font-family:ui-sans-serif,system-ui}a{color:#ffd23f}.btn{background:#18181b;color:#ededed;border:1px solid #27272a;border-radius:6px;padding:8px 14px;cursor:pointer}.btn-primary{background:#ffd23f;color:#0a0a0b;border:0}\n`
  if (o.css === 'tailwind') f['app/globals.css'] = `@import "tailwindcss";\n@source "../app";\n\n@theme {\n  --color-background: #0a0a0b;\n  --color-foreground: #ededed;\n  --color-muted-foreground: #a1a1aa;\n}\n\n.btn { @apply rounded-md px-4 py-2 font-semibold; }\n.btn-primary { @apply bg-yellow-300 text-black; }\n`
  if (o.css === 'unocss') f['uno.config.ts'] = `import { defineConfig, presetUno } from 'unocss'\n\nexport default defineConfig({\n  presets: [presetUno()],\n  shortcuts: { btn: 'rounded-md px-4 py-2 font-semibold', 'btn-primary': 'bg-yellow-300 text-black', 'bg-background': 'bg-[#0a0a0b]', 'text-foreground': 'text-[#ededed]', 'text-muted-foreground': 'text-zinc-400' },\n})\n`
  if (o.motion) f['public/motion.js'] = `// Motion (motion.dev): animate anything with data-animate
import { animate, inView } from 'https://cdn.jsdelivr.net/npm/motion@${V.motion}/+esm'

inView('[data-animate], h1', (el) => {
  animate(el, { opacity: [0, 1], y: [12, 0] }, { duration: 0.5 })
})
`
  const { imports, uses } = serverPieces({ ...o, serverDepth: './' })
  f['server.ts'] = `${imports.join('\n')}
import { appRouter } from 'raiko.js/app'
import manifest from './.raiko/manifest'

/** The whole app: plugins first, then the app/ folder (pages, API routes, sockets). */
const app = new Raiko()
${uses.join('\n')}
  .use(await appRouter({
    manifest,
    locales: ${o.i18n ? 'config.i18n.locales' : 'undefined'},${o.auth.length ? `
    // pages that export \`auth = true\` or \`roles = [...]\` need a signed in user
    getUser: async (ctx) => (await auth.getSession(ctx.request))?.user ?? null,` : ''}
  }))
  .use(openapi({ title: config.name }))

export default app

if (isMain(import.meta.url)) {
  const server = await app.listen(Number(process.env.PORT ?? 3000))
  console.log(\`  ready on \${server.url}\`)
}
`
  return f
}

// ---------------------------------------------------------------- vite frameworks

function viteApp(o) {
  const f = {}
  const fw = o.frontend
  const { imports, uses } = serverPieces({ ...o, serverDepth: '../' })
  f['server/index.ts'] = `${imports.join('\n')}
import { t } from 'raiko.js'
import { staticFiles } from 'raiko.js/plugins'
import { ChatMessage, NewPost } from '../shared/schemas'

/** Backend: API, WebSockets, auth. In production it also serves the built frontend. */
const app = new Raiko()
${uses.join('\n')}
  .group('/api', (api) =>
    api
      .get('/hello', ({ query }) => ({ hello: query.name ?? 'world', at: new Date().toISOString() }), { query: t.Object({ name: t.Optional(t.String()) }) })
      .post('/posts', ({ body, status }) => status(201, { id: Date.now(), ...body }), { body: NewPost }),
  )
  .ws('/ws/chat', {
    body: ChatMessage,
    encrypt: true,
    open: (ws) => ws.subscribe('lobby'),
    message(ws, msg) {
      const out = { id: ws.id.slice(-4), text: msg.text, at: Date.now() }
      ws.send(out)
      ws.publish('lobby', out)
    },
  })
  .use(openapi({ title: config.name }))
  .use(process.env.NODE_ENV === 'production' ? staticFiles({ dir: 'dist', spa: true }) : new Raiko())

export default app
export type App = typeof app

if (isMain(import.meta.url)) {
  const server = await app.listen(Number(process.env.PORT ?? 3000))
  console.log(\`  ready on \${server.url}\`)
}
`
  f['web/src/api.ts'] = `/** Typed client: paths, params, bodies and responses come from server/index.ts. */
import { client } from 'raiko.js/client'
import type { App } from '../../server'

export const api = client<App>('')
`
  const cssImport = o.css === 'tailwind' ? `import './styles.css'\n` : o.css === 'unocss' ? `import 'virtual:uno.css'\n` : o.css === 'none' ? `import './styles.css'\n` : ''
  if (o.css === 'tailwind') f['web/src/styles.css'] = `@import "tailwindcss";\n`
  if (o.css === 'none') f['web/src/styles.css'] = `:root{color-scheme:dark}body{margin:0;background:#0a0a0b;color:#ededed;font-family:ui-sans-serif,system-ui}a{color:#ffd23f}button{background:#ffd23f;color:#0a0a0b;border:0;border-radius:6px;padding:8px 14px;font-weight:600;cursor:pointer}\n`
  if (o.css === 'unocss') f['uno.config.ts'] = `import { defineConfig, presetUno } from 'unocss'\n\nexport default defineConfig({ presets: [presetUno()] })\n`
  f['web/index.html'] = `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${o.name.replace(/[<>&"]/g, '')}</title>
    <meta name="description" content="Built with Raiko.js" />
    <link rel="icon" href="/favicon.svg" />${o.css === 'monsoon' ? `\n    <link rel="stylesheet" href="${MONSOON}" />` : ''}${COOKIEOWL(o) ? `\n    ${COOKIEOWL(o)}` : ''}${PWA(o) ? `\n    ${PWA(o)}` : ''}
  </head>
  <body class="bg-background text-foreground">
    ${fw === 'angular' ? '<app-root></app-root>' : '<div id="app"></div>'}
    <script type="module" src="/src/main.ts${fw === 'react' || fw === 'preact' || fw === 'solid' ? 'x' : ''}"></script>
  </body>
</html>
`
  f['web/public/favicon.svg'] = FAVICON
  const plugin = { react: ["import react from '@vitejs/plugin-react'", 'react()'], vue: ["import vue from '@vitejs/plugin-vue'", 'vue()'], svelte: ["import { svelte } from '@sveltejs/vite-plugin-svelte'", 'svelte()'], solid: ["import solid from 'vite-plugin-solid'", 'solid()'], preact: ["import preact from '@preact/preset-vite'", 'preact()'], angular: ["import angular from '@analogjs/vite-plugin-angular'", "angular({ tsconfig: 'tsconfig.app.json' })"] }[fw]
  const extra = []
  if (o.css === 'tailwind') extra.push(["import tailwind from '@tailwindcss/vite'", 'tailwind()'])
  if (o.css === 'unocss') extra.push(["import uno from 'unocss/vite'", 'uno()'])
  if (o.css === 'stylex') extra.push(["import stylex from 'vite-plugin-stylex'", 'stylex()'])
  f['vite.config.ts'] = `import { defineConfig } from 'vite'
${[plugin, ...extra].map((p) => p[0]).join('\n')}
import { raiko } from 'raiko.js/vite'

export default defineConfig({
  root: 'web',
  build: { outDir: '../dist', emptyOutDir: true },
  // the backend runs inside the Vite dev server: one port, hot reload for both
  plugins: [${[plugin, ...extra].map((p) => p[1]).join(', ')}, raiko({ entry: './server/index.ts', paths: ['/api', '/auth', '/admin', '/docs', '/_raiko', '/ws', '/health'] })],
})
`
  const hello = `Welcome to ${o.name}`
  if (fw === 'react' || fw === 'preact') {
    const R = fw === 'react'
    const iconImp = o.icons === 'glyphfox' ? `import { ZapIcon } from 'glyphfox/${fw}'\n` : o.icons === 'lucide' ? `import { Zap } from 'lucide-${fw}'\n` : o.icons === 'heroicons' ? `import { BoltIcon } from '@heroicons/react/24/solid'\n` : ''
    const iconEl = o.icons === 'glyphfox' ? '<ZapIcon size={28} /> ' : o.icons === 'lucide' ? '<Zap size={28} /> ' : o.icons === 'heroicons' ? '<BoltIcon width={28} /> ' : ''
    const sx = o.css === 'stylex'
    f['web/src/main.tsx'] = R
      ? `import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\n${cssImport}import App from './App'\n\ncreateRoot(document.getElementById('app')!).render(<StrictMode><App /></StrictMode>)\n`
      : `import { render } from 'preact'\n${cssImport}import App from './App'\n\nrender(<App />, document.getElementById('app')!)\n`
    f['web/src/App.tsx'] = `${R ? "import { useState } from 'react'\nimport { useQuery, useSocket } from 'raiko.js/react'" : "import { useState } from 'preact/hooks'"}
${o.motion && R ? "import { motion } from 'motion/react'\n" : ''}${sx ? "import * as stylex from '@stylexjs/stylex'\n" : ''}${iconImp}import { api } from './api'
${sx ? `
const s = stylex.create({
  main: { maxWidth: 640, margin: '0 auto', padding: 48, fontFamily: 'system-ui' },
  button: { background: '#ffd23f', color: '#0a0a0b', border: 0, borderRadius: 6, padding: '8px 14px', fontWeight: 600 },
})
` : ''}
export default function App() {
  const [count, setCount] = useState(0)
${R ? `  const hello = useQuery(() => api.get('/api/hello', { query: { name: 'Raiko' } }))
  const [messages, setMessages] = useState<{ id: string; text: string }[]>([])
  const chat = useSocket(() => api.ws<{ id: string; text: string }, { text: string }>('/ws/chat'), (m) => setMessages((all) => [...all, m]))` : `  const [hello, setHello] = useState<string>('...')
  api.get('/api/hello').then((r) => setHello(r.data?.hello ?? 'error'))`}
  const H = ${o.motion && R ? 'motion.h1' : "'h1'"}
  return (
    <main ${sx ? '{...stylex.props(s.main)}' : 'className="mx-auto max-w-2xl p-12 space-y-4"'}>
      <H${o.motion && R ? ' initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}' : ''}>${iconEl}${hello}</H>
      <p>API says: {${R ? "hello.loading ? '...' : hello.data?.hello" : 'hello'}}</p>
      <button ${sx ? '{...stylex.props(s.button)}' : 'className="btn btn-primary"'} onClick={() => setCount(count + 1)}>Clicked {count} times</button>
${R ? `      <p>Chat {chat.connected ? 'online (encrypted)' : 'connecting'}</p>
      <button onClick={() => chat.send({ text: 'hi from React' })}>Send hi</button>
      <ul>{messages.map((m, i) => <li key={i}>{m.id}: {m.text}</li>)}</ul>` : ''}
    </main>
  )
}
`
  }
  if (fw === 'vue') {
    f['web/src/main.ts'] = `import { createApp } from 'vue'\n${cssImport}import App from './App.vue'\n\ncreateApp(App).mount('#app')\n`
    f['web/src/App.vue'] = `<script setup lang="ts">
import { ref } from 'vue'
import { useQuery, useSocket } from 'raiko.js/vue'
${o.icons === 'glyphfox' ? "import { ZapIcon } from 'glyphfox/vue'\n" : o.icons === 'lucide' ? "import { Zap } from 'lucide-vue-next'\n" : o.icons === 'heroicons' ? "import { BoltIcon } from '@heroicons/vue/24/solid'\n" : ''}import { api } from './api'

const count = ref(0)
const hello = useQuery(() => api.get('/api/hello', { query: { name: 'Raiko' } }))
const messages = ref<{ id: string; text: string }[]>([])
const chat = useSocket(() => api.ws<{ id: string; text: string }, { text: string }>('/ws/chat'), (m) => messages.value.push(m))
</script>

<template>
  <main class="mx-auto max-w-2xl p-12 space-y-4">
    <h1>${o.icons === 'glyphfox' ? '<ZapIcon :size="28" /> ' : o.icons === 'lucide' ? '<Zap :size="28" /> ' : o.icons === 'heroicons' ? '<BoltIcon style="width:28px" /> ' : ''}${hello}</h1>
    <p>API says: {{ hello.loading.value ? '...' : hello.data.value?.hello }}</p>
    <button class="btn btn-primary" @click="count++">Clicked {{ count }} times</button>
    <p>Chat {{ chat.connected.value ? 'online (encrypted)' : 'connecting' }}</p>
    <button @click="chat.send({ text: 'hi from Vue' })">Send hi</button>
    <ul><li v-for="(m, i) in messages" :key="i">{{ m.id }}: {{ m.text }}</li></ul>
  </main>
</template>
`
    f['web/src/env.d.ts'] = `declare module '*.vue' {\n  import type { DefineComponent } from 'vue'\n  const c: DefineComponent\n  export default c\n}\n`
  }
  if (fw === 'svelte') {
    f['web/src/main.ts'] = `import { mount } from 'svelte'\n${cssImport}import App from './App.svelte'\n\nmount(App, { target: document.getElementById('app')! })\n`
    f['web/src/App.svelte'] = `<script lang="ts">
  import { api } from './api'
${o.icons === 'glyphfox' ? "  import { ZapIcon } from 'glyphfox/svelte'\n" : o.icons === 'lucide' ? "  import { Zap } from 'lucide-svelte'\n" : ''}  let count = $state(0)
  let hello = $state('...')
  let messages = $state<{ id: string; text: string }[]>([])
  api.get('/api/hello', { query: { name: 'Raiko' } }).then((r) => (hello = r.data?.hello ?? 'error'))
  const chat = api.ws<{ id: string; text: string }, { text: string }>('/ws/chat')
  chat.on('message', (m) => (messages = [...messages, m]))
</script>

<main class="mx-auto max-w-2xl p-12 space-y-4">
  <h1>${o.icons === 'glyphfox' ? '<ZapIcon size={28} /> ' : o.icons === 'lucide' ? '<Zap size={28} /> ' : ''}${hello}</h1>
  <p>API says: {hello}</p>
  <button class="btn btn-primary" onclick={() => count++}>Clicked {count} times</button>
  <button onclick={() => chat.send({ text: 'hi from Svelte' })}>Send hi</button>
  <ul>{#each messages as m}<li>{m.id}: {m.text}</li>{/each}</ul>
</main>
`
    f['web/src/env.d.ts'] = `declare module '*.svelte' {\n  const c: any\n  export default c\n}\n`
  }
  if (fw === 'solid') {
    f['web/src/main.tsx'] = `import { render } from 'solid-js/web'\n${cssImport}import App from './App'\n\nrender(() => <App />, document.getElementById('app')!)\n`
    f['web/src/App.tsx'] = `import { createResource, createSignal, For } from 'solid-js'
${o.icons === 'glyphfox' ? "import { ZapIcon } from 'glyphfox/solid'\n" : o.icons === 'lucide' ? "import { Zap } from 'lucide-solid'\n" : ''}import { api } from './api'

export default function App() {
  const [count, setCount] = createSignal(0)
  const [hello] = createResource(async () => (await api.get('/api/hello', { query: { name: 'Raiko' } })).data?.hello)
  const [messages, setMessages] = createSignal<{ id: string; text: string }[]>([])
  const chat = api.ws<{ id: string; text: string }, { text: string }>('/ws/chat')
  chat.on('message', (m) => setMessages([...messages(), m]))
  return (
    <main class="mx-auto max-w-2xl p-12 space-y-4">
      <h1>${o.icons === 'glyphfox' ? '<ZapIcon size={28} /> ' : o.icons === 'lucide' ? '<Zap size={28} /> ' : ''}${hello}</h1>
      <p>API says: {hello() ?? '...'}</p>
      <button class="btn btn-primary" onClick={() => setCount(count() + 1)}>Clicked {count()} times</button>
      <button onClick={() => chat.send({ text: 'hi from Solid' })}>Send hi</button>
      <ul><For each={messages()}>{(m) => <li>{m.id}: {m.text}</li>}</For></ul>
    </main>
  )
}
`
  }
  if (fw === 'angular') {
    f['web/src/main.ts'] = `import '@angular/compiler'\nimport 'zone.js'\n${cssImport}import { bootstrapApplication } from '@angular/platform-browser'\nimport { AppComponent } from './app.component'\n\nbootstrapApplication(AppComponent).catch((e) => console.error(e))\n`
    f['web/src/app.component.ts'] = `import { Component, signal } from '@angular/core'
import { api } from './api'

@Component({
  selector: 'app-root',
  standalone: true,
  template: \`
    <main class="mx-auto max-w-2xl p-12 space-y-4">
      <h1>${hello}</h1>
      <p>API says: {{ hello() }}</p>
      <button class="btn btn-primary" (click)="count.set(count() + 1)">Clicked {{ count() }} times</button>
      <button (click)="send()">Send hi</button>
      <ul>@for (m of messages(); track $index) { <li>{{ m.id }}: {{ m.text }}</li> }</ul>
    </main>
  \`,
})
export class AppComponent {
  count = signal(0)
  hello = signal('...')
  messages = signal<{ id: string; text: string }[]>([])
  chat = api.ws<{ id: string; text: string }, { text: string }>('/ws/chat')
  constructor() {
    api.get('/api/hello', { query: { name: 'Raiko' } }).then((r) => this.hello.set(r.data?.hello ?? 'error'))
    this.chat.on('message', (m) => this.messages.set([...this.messages(), m]))
  }
  send() {
    this.chat.send({ text: 'hi from Angular' })
  }
}
`
    f['tsconfig.app.json'] = json({ extends: './tsconfig.json', compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false, jsx: undefined }, files: ['web/src/main.ts'], include: ['web/src/**/*.ts'] })
  }
  return f
}

// ---------------------------------------------------------------- package.json and readme

function packageJson(o) {
  const scripts_extra = {}
  const deps = { 'raiko.js': V.raiko }
  // Angular's compiler only supports TypeScript below 5.6
  const dev = { typescript: o.frontend === 'angular' ? '5.5.4' : V.typescript, '@types/node': V.nodeTypes }
  if (o.pm === 'bun') dev['@types/bun'] = V.bunTypes
  else Object.assign(dev, { tsx: V.tsx, esbuild: V.esbuild })
  const fw = o.frontend
  if (isVite(o)) Object.assign(dev, { vite: V.vite, terser: V.terser })
  const F = {
    react: [{ react: '18.3.1', 'react-dom': '18.3.1' }, { '@vitejs/plugin-react': '4.3.4', '@types/react': '18.3.12', '@types/react-dom': '18.3.1' }],
    preact: [{ preact: '10.25.4' }, { '@preact/preset-vite': '2.9.3' }],
    vue: [{ vue: '3.5.13' }, { '@vitejs/plugin-vue': '5.2.1' }],
    svelte: [{ svelte: '5.16.0' }, { '@sveltejs/vite-plugin-svelte': '4.0.4' }],
    solid: [{ 'solid-js': '1.9.3' }, { 'vite-plugin-solid': '2.11.0' }],
    angular: [{ '@angular/core': '18.2.13', '@angular/common': '18.2.13', '@angular/compiler': '18.2.13', '@angular/platform-browser': '18.2.13', rxjs: '7.8.1', 'zone.js': '0.14.10', tslib: '2.8.1' }, { '@analogjs/vite-plugin-angular': '1.10.3', '@angular/compiler-cli': '18.2.13', '@angular-devkit/build-angular': '18.2.12' }],
  }[fw]
  if (F) Object.assign(deps, F[0]), Object.assign(dev, F[1])
  if (o.css === 'tailwind') Object.assign(dev, isVite(o) ? { tailwindcss: '4.1.11', '@tailwindcss/vite': '4.1.11' } : { tailwindcss: '4.1.11', '@tailwindcss/cli': '4.1.11' })
  if (o.css === 'unocss') Object.assign(dev, isVite(o) ? { unocss: '0.65.1' } : { unocss: '0.65.1', '@unocss/cli': '0.65.1' })
  if (o.css === 'stylex') Object.assign(deps, { '@stylexjs/stylex': '0.9.3' }), Object.assign(dev, { 'vite-plugin-stylex': '0.13.0' })
  if (o.css === 'monsoon' && isVite(o)) deps.monsooncss = '0.2.0'
  if (o.icons === 'glyphfox') deps.glyphfox = V.glyphfox
  if (o.icons === 'lucide') deps[{ raiko: 'lucide-static', react: 'lucide-react', preact: 'lucide-preact', vue: 'lucide-vue-next', svelte: 'lucide-svelte', solid: 'lucide-solid', angular: 'lucide-static' }[fw]] = V.lucide
  if (o.icons === 'heroicons') deps[fw === 'vue' ? '@heroicons/vue' : '@heroicons/react'] = V.heroicons
  if (o.motion && fw === 'react') deps.motion = V.motion
  if (o.orm === 'kastor') deps['kastor-orm'] = V.kastor
  if (o.orm === 'prisma') deps['@prisma/client'] = V.prisma, (dev.prisma = V.prisma)
  if (o.orm === 'drizzle') deps['drizzle-orm'] = V.drizzle, (dev['drizzle-kit'] = V.drizzleKit)
  if (o.orm !== 'none' && o.db === 'sqlite' && o.pm !== 'bun') deps['better-sqlite3'] = V.betterSqlite
  if (o.orm === 'kastor' && o.db === 'postgres') deps.pg = V.pg
  if (o.orm === 'drizzle' && o.db === 'postgres') deps.postgres = V.postgresJs
  if (o.email === 'smtp') deps.nodemailer = V.nodemailer
  if (o.pwa) Object.assign(dev, { installkite: '0.2.0' }), (scripts_extra.pwa = 'installkite build')
  const entry = isVite(o) ? 'server/index.ts' : 'server.ts'
  const cssDev = !isVite(o) && o.css === 'tailwind' ? 'tailwindcss -i app/globals.css -o public/styles.css' : !isVite(o) && o.css === 'unocss' ? 'unocss "app/**/*.tsx" -o public/uno.css' : null
  const scripts = {
    dev: cssDev ? `${cssDev} && raiko dev ${entry}` : `raiko dev${isVite(o) ? '' : ' ' + entry}`,
    build: `${cssDev ? `${cssDev} --minify && ` : ''}raiko build ${entry}`,
    start: 'raiko start',
    typecheck: 'tsc --noEmit',
    test: o.pm === 'bun' ? 'bun test' : 'node --test',
    deploy: `raiko deploy ${o.deploy === 'node' ? 'docker' : o.deploy}`,
  }
  Object.assign(scripts, scripts_extra)
  if (o.orm === 'kastor') scripts['db:migrate'] = 'kastor migrate dev'
  if (o.orm === 'prisma') Object.assign(scripts, { 'db:migrate': 'prisma migrate dev', postinstall: 'prisma generate' })
  if (o.orm === 'drizzle') scripts['db:migrate'] = 'drizzle-kit push'
  return json({ name: o.name, version: '0.1.0', private: true, type: 'module', scripts, dependencies: deps, devDependencies: dev, raiko: { frontend: fw, css: o.css, orm: o.orm, deploy: o.deploy } })
}

function tsconfig(o) {
  const jsx = { react: ['react-jsx', 'react'], preact: ['react-jsx', 'preact'], solid: ['preserve', 'solid-js'] }[o.frontend] ?? ['react-jsx', 'raiko.js']
  return json({
    compilerOptions: {
      target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM', 'DOM.Iterable'], strict: true, noUncheckedIndexedAccess: true,
      skipLibCheck: true, noEmit: true, allowImportingTsExtensions: false, resolveJsonModule: true, isolatedModules: true, verbatimModuleSyntax: false,
      jsx: jsx[0], jsxImportSource: jsx[1], types: o.pm === 'bun' ? ['bun', 'node'] : ['node'],
    },
    include: ['**/*.ts', '**/*.tsx', ...(o.frontend === 'vue' ? ['**/*.vue'] : [])],
    exclude: ['node_modules', 'dist', '.raiko/out'],
  })
}

function readme(o) {
  const roles = Object.entries(o.roles).map(([r, res]) => `| ${r} | ${Object.entries(res).map(([k, v]) => `${k}: ${v === '*' ? 'all' : v.join(', ') || 'none'}`).join('<br>')} |`).join('\n')
  return `# ${o.name}

Made with [Raiko.js](https://kwy404.github.io/Raiko.js/).

\`\`\`bash
${run(o, 'dev')}        # http://localhost:${isVite(o) ? '5173' : '3000'}
${run(o, 'build')}      # production build
${run(o, 'start')}      # run the build
${run(o, 'deploy')}     # ${o.deploy}
\`\`\`

## What is inside

| | |
| --- | --- |
| Frontend | ${FRONTENDS.find((x) => x.value === o.frontend).label} |
| CSS | ${CSS.find((x) => x.value === o.css).label} |
| Database | ${o.orm === 'none' ? 'none' : `${o.orm} on ${o.db}`} |
| Auth | ${o.auth.length ? o.auth.join(', ') + (o.twofa ? ' + TOTP 2FA' : '') : 'none'} |
| Email | ${o.email === 'none' ? 'console only' : o.email} (preview at /_raiko/mail) |
| i18n | ${o.i18n ? Object.keys(LOCALES).join(', ') : 'off'} |
| Admin | ${o.admin ? '/admin' : 'off'} |
| API docs | /docs (OpenAPI 3.1) |
| Deploy | ${o.deploy} |

Change any of it in \`raiko.config.ts\`.
${o.admin ? `
## Admin permissions

| Role | Allowed |
| --- | --- |
${roles}
` : ''}
## Folders

\`\`\`
${isVite(o) ? 'web/        frontend (' + o.frontend + ')\nserver/     backend: API, WebSockets, auth' : 'app/        pages, layouts, API routes and sockets\nserver.ts   plugins and startup'}
shared/     schemas used by both sides
${o.orm !== 'none' ? 'db/         database schema and client\n' : ''}${o.email !== 'none' || o.auth.length ? 'emails/     email templates in TSX\n' : ''}${o.i18n ? 'locales/    translations\n' : ''}\`\`\`
`
}

export function generate(input) {
  // the name lands in code, TOML and HTML: keep only npm name characters, whatever the caller passed
  const o = { ...input, name: String(input.name).toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/^[._-]+/, '').slice(0, 214) || 'raiko-app' }
  const files = {
    'package.json': packageJson(o),
    'tsconfig.json': tsconfig(o),
    '.gitignore': gitignore(),
    '.env.example': envExample(o),
    'README.md': readme(o),
    'raiko.config.ts': configFile(o),
    ...sharedFiles(o),
    ...(isVite(o) ? viteApp(o) : raikoPages(o)),
    ...dbFiles(o),
    ...authFiles(o),
    ...emailFiles(o),
    ...i18nFiles(o),
    ...adminFiles(o),
    ...deployFiles(o),
  }
  // the starter page that teaches the first steps, the same design in every framework
  Object.assign(files, welcomeFiles(o))
  for (const main of ['web/src/main.tsx', 'web/src/main.ts']) {
    if (files[main]) files[main] = files[main].replace(/^(import [^\n]*\n)(?!import)/m, "$1import './welcome.css'\n")
  }
  if (!isVite(o)) {
    files['app/layout.tsx'] = files['app/layout.tsx'].replace('<meta name="viewport" content="width=device-width, initial-scale=1" />', '<meta name="viewport" content="width=device-width, initial-scale=1" />\n        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;600&display=swap" />\n        <link rel="stylesheet" href="/welcome.css" />')
  } else {
    files['web/index.html'] = files['web/index.html'].replace('<link rel="icon" href="/favicon.svg" />', '<link rel="icon" href="/favicon.svg" />\n    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;600&display=swap" />')
  }
  if (!isVite(o)) {
    files['public/favicon.svg'] = FAVICON
    files['.raiko/manifest.ts'] = '// replaced by `raiko dev` and `raiko build`\nexport default {}\n'
  }
  return files
}
export { run, exec }
