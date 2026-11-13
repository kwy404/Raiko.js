// Builds site/docs from the three READMEs plus the error code reference. Run: bun site/build-docs.ts
import { marked } from 'marked'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const out = new URL('./docs/', import.meta.url)
mkdirSync(out, { recursive: true })

const slug = (s: string) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const LANGS = [
  { file: 'README.md', page: 'index.html', lang: 'en', label: 'English', title: 'Documentation' },
  { file: 'README.pt-BR.md', page: 'pt.html', lang: 'pt-BR', label: 'Português', title: 'Documentação' },
  { file: 'README.es.md', page: 'es.html', lang: 'es', label: 'Español', title: 'Documentación' },
]

const ERRORS: [string, string, string][] = [
  ['RK0100', 'The app directory does not exist.', 'Create app/page.tsx, or pass appRouter({ dir }).'],
  ['RK0101', 'A folder name uses brackets in an unknown way.', 'Use [param], [...param] or [[...param]].'],
  ['RK0102', 'A folder has two files of the same kind, like page.tsx and page.ts.', 'Keep one of them.'],
  ['RK0103', 'A folder has both page and route files.', 'A folder is a page or an API route: move one.'],
  ['RK0104', 'Two routes use different param names at the same position.', 'Use the same name in both routes.'],
  ['RK0105', 'A wildcard is not the last path segment.', 'Move * to the end, like /files/*.'],
  ['RK0106', 'A param has no name.', 'Write :id instead of :.'],
  ['RK0110', 'A page exports auth or roles, but appRouter has no getUser.', 'Pass appRouter({ getUser }).'],
  ['RK0201', 'headers(), cookies() or another request helper ran outside a request.', 'Call it inside a page, layout, route or component.'],
  ['RK0301', '<Image> has no alt text.', 'Describe the image, or use alt="" for decoration.'],
  ['RK0400', 'The auth secret is shorter than 32 characters.', 'Run npx raiko secret and put it in AUTH_SECRET.'],
  ['RK0402', 'A TOTP secret has characters outside base32.', 'Use generateTotpSecret() to create secrets.'],
  ['RK0403', 'cors({ credentials: true }) has no explicit origin list.', 'Pass origin: ["https://your.app"].'],
  ['RK0501', 'The SMTP transport needs nodemailer.', 'bun add nodemailer'],
  ['RK0502', 'An email template name is not registered.', 'Add it to createMailer({ templates }).'],
  ['RK0503', 'An email has no subject.', 'Pass subject, or set Template.subject.'],
  ['RK0601', 'An admin permission uses an unknown action.', 'Use list, read, create, update, delete or *.'],
  ['RK0701', 'raiko start found no build.', 'Run raiko build first.'],
  ['RK0702', 'raiko deploy found no target.', 'Run raiko deploy vercel, cloudflare or docker.'],
  ['RK0703', 'raiko deploy got an unknown target.', 'Use vercel, cloudflare or docker.'],
  ['RK0801', 'The project folder is not empty.', 'Pick another name, or pass --force.'],
  ['RK0802', 'StyleX was picked without React.', 'Use --frontend react, or another CSS option.'],
  ['RK0803', 'The project name is not a valid npm name.', 'Use lowercase letters, digits, dot, dash and underscore.'],
  ['RK0901', 'A client path param is "." or "..".', 'Those would move the request to another endpoint: validate the value.'],
]

const page = (lang: string, title: string, nav: string, body: string, langs: string) => `<!doctype html>
<html lang="${lang}" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | Raiko.js</title><meta name="description" content="Raiko.js documentation: app router, server components, typed API, WebSockets, auth, admin, email.">
<link rel="icon" href="../logo.svg"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600;800&family=Geist+Mono&display=swap">
<link rel="stylesheet" href="../base.css"><link rel="stylesheet" href="docs.css"></head>
<body><a class="skip" href="#doc">Skip to content</a>
<header class="nav"><div class="wrap"><a class="brand" href="../"><img src="../logo.svg" width="28" height="28" alt=""><span class="wm">raiko<span>.js</span></span></a>
<div class="sp"></div>${langs}<a class="ghost" style="display:inline-flex;align-items:center;text-decoration:none" href="https://github.com/kwy404/Raiko.js">GitHub</a></div></header>
<div class="docs"><aside><nav aria-label="Sections">${nav}<a href="errors.html">Error codes</a></nav></aside><main id="doc" class="md">${body}</main></div></body></html>`

const langLinks = (current: string) => LANGS.map((l) => `<a class="ghost lang${l.page === current ? ' on' : ''}" href="${l.page}" style="display:inline-flex;align-items:center;text-decoration:none">${l.lang.slice(0, 2).toUpperCase()}</a>`).join('')

for (const l of LANGS) {
  let md: string
  try {
    md = readFileSync(new URL(l.file, root), 'utf8')
  } catch {
    continue
  }
  md = md.replace(/^<div align="center">[\s\S]*?<\/div>\n/, '')
  const heads: string[] = []
  const renderer = new marked.Renderer()
  renderer.heading = ({ tokens, depth }) => {
    const text = marked.Parser.parseInline(tokens)
    const id = slug(text)
    if (depth === 2) heads.push(`<a href="#${id}">${text}</a>`)
    return `<h${depth} id="${id}">${text}</h${depth}>`
  }
  const body = `<h1>${l.title}</h1>` + (marked.parse(md, { renderer, async: false }) as string)
  writeFileSync(new URL(l.page, out), page(l.lang, l.title, heads.join(''), body, langLinks(l.page)))
}

const rows = ERRORS.map(([c, what, fix]) => `<tr id="${c}"><td><code>${c}</code></td><td>${esc(what)}</td><td>${esc(fix)}</td></tr>`).join('')
writeFileSync(new URL('errors.html', out), page('en', 'Error codes', '<a href="index.html">Back to the docs</a>', `<h1>Error codes</h1><p>Every error Raiko can raise for a mistake in your code has a code, a help line and an entry here.</p><div class="scroll"><table class="tbl"><thead><tr><th>Code</th><th>What happened</th><th>Fix</th></tr></thead><tbody>${rows}</tbody></table></div>`, langLinks('')))
console.log('docs ok')
