// The starter page every template opens on: same design, same steps, framework specific markup.
import { isVite } from './templates-common.mjs'

export const WELCOME_CSS = `/* Starter page. Delete this file and its import when you build your own UI. */
.rk-welcome { --bg: #ffffff; --fg: #0a0a0a; --muted: #5c5c5c; --line: #e5e5e5; --soft: #f4f4f5; --accent: #c99400; --code: #f4f4f5;
  min-height: 100vh; display: grid; grid-template-rows: 1fr auto; background: var(--bg); color: var(--fg);
  font-family: "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased;
  background-image: radial-gradient(circle at 50% -10%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 45%);
  padding-left: max(20px, env(safe-area-inset-left, 0px)); padding-right: max(20px, env(safe-area-inset-right, 0px)) }
@media (prefers-color-scheme: dark) { .rk-welcome { --bg: #000000; --fg: #ededed; --muted: #a1a1a1; --line: #262626; --soft: #111111; --accent: #ffd23f; --code: #1a1a1a } }
.rk-welcome * { box-sizing: border-box }
.rk-main { width: 100%; max-width: 560px; margin: 0 auto; padding: 96px 0 48px; display: flex; flex-direction: column; gap: 32px }
.rk-logo { display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 700; letter-spacing: -0.03em }
.rk-logo svg { width: 34px; height: 34px }
.rk-logo span { color: var(--muted); font-weight: 500 }
.rk-steps { margin: 0; padding-left: 20px; list-style: decimal; font: 14px/1.9 "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted) }
.rk-steps li { padding-left: 6px } .rk-steps li::marker { color: var(--muted) }
.rk-steps code { font: inherit; color: var(--fg); background: var(--code); padding: 2px 6px; border-radius: 5px; font-weight: 600 }
.rk-ctas { display: flex; gap: 12px; flex-wrap: wrap }
.rk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 46px; padding: 0 20px; border-radius: 999px; font-size: 15px; font-weight: 500; text-decoration: none; border: 1px solid var(--line); color: var(--fg); background: transparent; transition: background .15s, border-color .15s }
.rk-btn:hover { background: var(--soft) } .rk-btn.solid { background: var(--fg); color: var(--bg); border-color: var(--fg) } .rk-btn.solid:hover { opacity: .88 }
.rk-btn svg { width: 16px; height: 16px }
.rk-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 14px; overflow: hidden }
.rk-card { background: var(--bg); padding: 16px 18px; text-decoration: none; color: var(--fg); display: block; transition: background .15s }
.rk-card:hover { background: var(--soft) } .rk-card b { display: block; font-size: 14px; font-weight: 600 } .rk-card small { color: var(--muted); font-size: 13px }
.rk-status { display: flex; align-items: center; gap: 8px; font: 13px "Geist Mono", ui-monospace, monospace; color: var(--muted) }
.rk-dot { width: 8px; height: 8px; border-radius: 50%; background: #9ca3af } .rk-dot.ok { background: #22c55e; box-shadow: 0 0 0 4px rgba(34,197,94,.18) } .rk-dot.bad { background: #ef4444 }
.rk-foot { display: flex; gap: 22px; flex-wrap: wrap; justify-content: center; padding: 28px 0 36px; font-size: 14px }
.rk-foot a { color: var(--muted); text-decoration: none; display: inline-flex; align-items: center; gap: 6px } .rk-foot a:hover { color: var(--fg); text-decoration: underline; text-underline-offset: 4px }
.rk-welcome :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
@media (max-width: 520px) { .rk-main { padding-top: 56px } .rk-cards { grid-template-columns: 1fr } .rk-ctas .rk-btn { flex: 1 1 100% } }
`

export const BOLT = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="currentColor"/><path d="M36 10 18 36h12l-3 18 19-28H34l2-16z" fill="#ffd23f"/></svg>'
const ARROW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>'

/** Everything the page shows, built from the installer answers. */
export function welcomeData(o) {
  const file = { raiko: 'app/page.tsx', react: 'web/src/App.tsx', preact: 'web/src/App.tsx', solid: 'web/src/App.tsx', vue: 'web/src/App.vue', svelte: 'web/src/App.svelte', angular: 'web/src/app.component.ts' }[o.frontend]
  const cards = [
    { href: '/api/hello?name=Raiko', title: 'API route', desc: isVite(o) ? 'server/index.ts' : 'app/api/hello/route.ts' },
    { href: '/docs', title: 'API docs', desc: 'OpenAPI, generated from your schemas' },
  ]
  if (o.template === 'full' && !isVite(o)) cards.push({ href: '/chat', title: 'Chat demo', desc: 'encrypted WebSocket, open two tabs' })
  if (o.auth.length) cards.push({ href: isVite(o) ? '/auth/session' : '/login', title: 'Sign in', desc: o.twofa ? 'with Google Authenticator 2FA' : o.auth.join(', ') })
  if (o.admin) cards.push({ href: '/admin', title: 'Admin', desc: 'roles in raiko.config.ts' })
  if (o.email !== 'none' || o.auth.length) cards.push({ href: '/_raiko/mail', title: 'Email previews', desc: 'templates in emails/' })
  if (cards.length % 2) cards.push({ href: '/health', title: 'Health check', desc: 'for your load balancer' })
  return {
    file,
    cards,
    deploy: 'https://kwy404.github.io/Raiko.js/docs/#deploy',
    deployLabel: { vercel: 'Deploy to Vercel', cloudflare: 'Deploy to Cloudflare', docker: 'Deploy with Docker', node: 'Deploy now' }[o.deploy] ?? 'Deploy now',
    deployCmd: o.deploy === 'node' ? 'build' : 'deploy',
    docs: 'https://kwy404.github.io/Raiko.js/docs/',
    foot: [
      { href: 'https://kwy404.github.io/Raiko.js/docs/', label: 'Learn' },
      { href: 'https://github.com/kwy404/Raiko.js/tree/main/examples', label: 'Examples' },
      { href: 'https://kwy404.github.io/Raiko.js/', label: 'Go to raiko.js' },
    ],
    ARROW,
  }
}

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Icon element for the "deploy" button in the icon library the person picked. */
function iconFor(o) {
  const fw = o.frontend
  if (o.icons === 'glyphfox' && ['react', 'preact', 'solid', 'vue', 'svelte'].includes(fw)) return { imp: `import { RocketIcon } from 'glyphfox/${fw}'`, tag: fw === 'vue' ? '<RocketIcon :size="16" />' : '<RocketIcon size={16} />' }
  if (o.icons === 'lucide') {
    const pkg = { react: 'lucide-react', preact: 'lucide-preact', solid: 'lucide-solid', vue: 'lucide-vue-next', svelte: 'lucide-svelte' }[fw]
    if (pkg) return { imp: `import { Rocket } from '${pkg}'`, tag: fw === 'vue' ? '<Rocket :size="16" />' : '<Rocket size={16} />' }
  }
  if (o.icons === 'heroicons' && (fw === 'react' || fw === 'vue')) return { imp: `import { RocketLaunchIcon } from '@heroicons/${fw}/24/outline'`, tag: fw === 'vue' ? '<RocketLaunchIcon style="width:16px;height:16px" />' : '<RocketLaunchIcon width={16} height={16} />' }
  return { imp: '', tag: '' }
}

/** The page in JSX (React, Preact, Solid). `cls` is className for React, class for the others. */
function jsxPage(o, w, cls) {
  const ic = iconFor(o)
  const cards = w.cards.map((c) => `          <a ${cls}="rk-card" href="${c.href}"><b>${c.title}</b><small>${esc(c.desc)}</small></a>`).join('\n')
  const foot = w.foot.map((f) => `        <a href="${f.href}">${f.label}</a>`).join('\n')
  return { ic, body: `    <div ${cls}="rk-welcome">
      <main ${cls}="rk-main">
        <div ${cls}="rk-logo"><span ${cls}="rk-mark" dangerouslySetInnerHTML={{ __html: BOLT }} />raiko<span>.js</span></div>
        <ol ${cls}="rk-steps">
          <li>Get started by editing <code>${w.file}</code>.</li>
          <li>Save and see your changes instantly.</li>
        </ol>
        <div ${cls}="rk-ctas">
          <a ${cls}="rk-btn solid" href="${w.deploy}">${ic.tag ? ic.tag + ' ' : ''}${w.deployLabel}</a>
          <a ${cls}="rk-btn" href="${w.docs}">Read the docs</a>
        </div>
        <div ${cls}="rk-cards">
${cards}
        </div>
        <p ${cls}="rk-status"><span ${cls}={'rk-dot ' + STATUS_CLASS} />{STATUS_TEXT}</p>
      </main>
      <footer ${cls}="rk-foot">
${foot}
      </footer>
    </div>` }
}

export function welcomeFiles(o) {
  const w = welcomeData(o)
  const f = {}
  const fw = o.frontend
  const boltConst = `const BOLT = ${JSON.stringify(BOLT.replace('fill="currentColor"', 'fill="#0a0a0a"'))}`
  if (fw === 'raiko') {
    const icon = o.icons === 'glyphfox' ? ["import { toSvg } from 'glyphfox'", "toSvg('rocket', { size: 16 })"] : o.icons === 'lucide' ? ["import { Rocket } from 'lucide-static'", 'Rocket'] : null
    const cards = w.cards.map((c) => `          <a class="rk-card" href="${c.href}"><b>${c.title}</b><small>${esc(c.desc)}</small></a>`).join('\n')
    f['public/welcome.css'] = WELCOME_CSS
    f['app/page.tsx'] = `import { raw } from 'raiko.js'
${icon ? icon[0] + '\n' : ''}
${boltConst}

/** The starter page. It is a server component: it runs on the server and ships no JavaScript. */
export default async function Home() {
  const renderedAt = new Date().toLocaleTimeString()
  return (
    <div class="rk-welcome" data-animate>
      <main class="rk-main">
        <div class="rk-logo">{raw(BOLT)}raiko<span>.js</span></div>
        <ol class="rk-steps">
          <li>Get started by editing <code>${w.file}</code>.</li>
          <li>Save and see your changes instantly.</li>
        </ol>
        <div class="rk-ctas">
          <a class="rk-btn solid" href="${w.deploy}">${icon ? `{raw(${icon[1]})} ` : ''}${w.deployLabel}</a>
          <a class="rk-btn" href="${w.docs}">Read the docs</a>
        </div>
        <div class="rk-cards">
${cards}
        </div>
        <p class="rk-status"><span class="rk-dot ok"></span>Server rendered at {renderedAt}</p>
      </main>
      <footer class="rk-foot">
${w.foot.map((x) => `        <a href="${x.href}">${x.label}</a>`).join('\n')}
      </footer>
    </div>
  )
}
`
    return f
  }
  f['web/src/welcome.css'] = WELCOME_CSS
  const status = `api.get('/api/hello', { query: { name: 'Raiko' } })`
  if (fw === 'react' || fw === 'preact') {
    const R = fw === 'react'
    const { ic, body } = jsxPage(o, w, R ? 'className' : 'class')
    const sx = o.css === 'stylex'
    f['web/src/App.tsx'] = `import { useEffect, useState } from '${R ? 'react' : 'preact/hooks'}'
${o.motion && R ? "import { motion } from 'motion/react'\n" : ''}${sx ? "import * as stylex from '@stylexjs/stylex'\n" : ''}${ic.imp ? ic.imp + '\n' : ''}import { api } from './api'

${boltConst}
${sx ? "const s = stylex.create({ num: { fontVariantNumeric: 'tabular-nums' } })\n" : ''}
/** The starter page. Replace it with your app. */
export default function App() {
  const [api_, setApi] = useState<'wait' | 'ok' | 'bad'>('wait')
  const [msg, setMsg] = useState('Checking the API...')
  useEffect(() => {
    ${status}.then((r) => {
      setApi(r.data ? 'ok' : 'bad')
      setMsg(r.data ? \`API says hello to \${r.data.hello}\` : 'The API did not answer: is the server running?')
    })
  }, [])
  const STATUS_CLASS = api_ === 'wait' ? '' : api_
  const STATUS_TEXT = ${sx ? '<span {...stylex.props(s.num)}>{msg}</span>' : 'msg'}
  return (
${o.motion && R ? body.replace('<main className="rk-main">', '<motion.main className="rk-main" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>').replace('      </main>', '      </motion.main>') : body}
  )
}
`
  }
  if (fw === 'solid') {
    const { ic, body } = jsxPage(o, w, 'class')
    f['web/src/App.tsx'] = `import { createSignal, onMount } from 'solid-js'
${ic.imp ? ic.imp + '\n' : ''}import { api } from './api'

${boltConst}

/** The starter page. Replace it with your app. */
export default function App() {
  const [state, setState] = createSignal<'wait' | 'ok' | 'bad'>('wait')
  const [msg, setMsg] = createSignal('Checking the API...')
  onMount(() =>
    ${status}.then((r) => {
      setState(r.data ? 'ok' : 'bad')
      setMsg(r.data ? \`API says hello to \${r.data.hello}\` : 'The API did not answer: is the server running?')
    }),
  )
  return (
${body.replace("dangerouslySetInnerHTML={{ __html: BOLT }}", 'innerHTML={BOLT}').replace("{'rk-dot ' + STATUS_CLASS}", "{'rk-dot ' + (state() === 'wait' ? '' : state())}").replace('{STATUS_TEXT}', '{msg()}')}
  )
}
`
  }
  const cardsT = (open, close) => w.cards.map((c) => `      ${open}<a class="rk-card" href="${c.href}"><b>${c.title}</b><small>${esc(c.desc)}</small></a>${close}`).join('\n')
  const footT = w.foot.map((x) => `    <a href="${x.href}">${x.label}</a>`).join('\n')
  if (fw === 'vue') {
    const ic = iconFor(o)
    f['web/src/App.vue'] = `<script setup lang="ts">
import { onMounted, ref } from 'vue'
${ic.imp ? ic.imp + '\n' : ''}import { api } from './api'

${boltConst}
const state = ref<'wait' | 'ok' | 'bad'>('wait')
const msg = ref('Checking the API...')
onMounted(async () => {
  const r = await ${status}
  state.value = r.data ? 'ok' : 'bad'
  msg.value = r.data ? \`API says hello to \${r.data.hello}\` : 'The API did not answer: is the server running?'
})
</script>

<!-- The starter page. Replace it with your app. -->
<template>
  <div class="rk-welcome">
    <main class="rk-main">
      <div class="rk-logo"><span v-html="BOLT"></span>raiko<span>.js</span></div>
      <ol class="rk-steps">
        <li>Get started by editing <code>${w.file}</code>.</li>
        <li>Save and see your changes instantly.</li>
      </ol>
      <div class="rk-ctas">
        <a class="rk-btn solid" href="${w.deploy}">${ic.tag ? ic.tag + ' ' : ''}${w.deployLabel}</a>
        <a class="rk-btn" href="${w.docs}">Read the docs</a>
      </div>
      <div class="rk-cards">
${cardsT('', '')}
      </div>
      <p class="rk-status"><span :class="['rk-dot', state === 'wait' ? '' : state]"></span>{{ msg }}</p>
    </main>
    <footer class="rk-foot">
${footT}
    </footer>
  </div>
</template>
`
  }
  if (fw === 'svelte') {
    const ic = iconFor(o)
    f['web/src/App.svelte'] = `<script lang="ts">
${ic.imp ? '  ' + ic.imp + '\n' : ''}  import { api } from './api'

  ${boltConst}
  let state = $state<'wait' | 'ok' | 'bad'>('wait')
  let msg = $state('Checking the API...')
  ${status}.then((r) => {
    state = r.data ? 'ok' : 'bad'
    msg = r.data ? \`API says hello to \${r.data.hello}\` : 'The API did not answer: is the server running?'
  })
</script>

<!-- The starter page. Replace it with your app. -->
<div class="rk-welcome">
  <main class="rk-main">
    <div class="rk-logo">{@html BOLT}raiko<span>.js</span></div>
    <ol class="rk-steps">
      <li>Get started by editing <code>${w.file}</code>.</li>
      <li>Save and see your changes instantly.</li>
    </ol>
    <div class="rk-ctas">
      <a class="rk-btn solid" href="${w.deploy}">${ic.tag ? ic.tag + ' ' : ''}${w.deployLabel}</a>
      <a class="rk-btn" href="${w.docs}">Read the docs</a>
    </div>
    <div class="rk-cards">
${cardsT('', '')}
    </div>
    <p class="rk-status"><span class="rk-dot {state === 'wait' ? '' : state}"></span>{msg}</p>
  </main>
  <footer class="rk-foot">
${footT}
  </footer>
</div>
`
  }
  if (fw === 'angular') {
    f['web/src/app.component.ts'] = `import { Component, signal } from '@angular/core'
import { DomSanitizer } from '@angular/platform-browser'
import { api } from './api'

${boltConst}

/** The starter page. Replace it with your app. */
@Component({
  selector: 'app-root',
  standalone: true,
  template: \`
    <div class="rk-welcome">
      <main class="rk-main">
        <div class="rk-logo"><span [innerHTML]="bolt"></span>raiko<span>.js</span></div>
        <ol class="rk-steps">
          <li>Get started by editing <code>${w.file}</code>.</li>
          <li>Save and see your changes instantly.</li>
        </ol>
        <div class="rk-ctas">
          <a class="rk-btn solid" href="${w.deploy}">${w.deployLabel}</a>
          <a class="rk-btn" href="${w.docs}">Read the docs</a>
        </div>
        <div class="rk-cards">
${w.cards.map((c) => `          <a class="rk-card" href="${c.href}"><b>${c.title}</b><small>${esc(c.desc)}</small></a>`).join('\n')}
        </div>
        <p class="rk-status"><span class="rk-dot" [class.ok]="state() === 'ok'" [class.bad]="state() === 'bad'"></span>{{ msg() }}</p>
      </main>
      <footer class="rk-foot">
${w.foot.map((x) => `        <a href="${x.href}">${x.label}</a>`).join('\n')}
      </footer>
    </div>
  \`,
})
export class AppComponent {
  state = signal<'wait' | 'ok' | 'bad'>('wait')
  msg = signal('Checking the API...')
  bolt
  constructor(sanitizer: DomSanitizer) {
    this.bolt = sanitizer.bypassSecurityTrustHtml(BOLT)
    ${status}.then((r) => {
      this.state.set(r.data ? 'ok' : 'bad')
      this.msg.set(r.data ? \`API says hello to \${r.data.hello}\` : 'The API did not answer: is the server running?')
    })
  }
}
`
  }
  return f
}
