<div align="center">

<a href="https://kwy404.github.io/Raiko.js/">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cdn.jsdelivr.net/gh/kwy404/Raiko.js@main/assets/banner-dark.svg">
    <img src="https://cdn.jsdelivr.net/gh/kwy404/Raiko.js@main/assets/banner.svg" alt="Raiko.js: backend and frontend in one file tree, every runtime" width="820">
  </picture>
</a>

### Backend and frontend in one file tree. Every runtime.

**A TypeScript framework with a Next.js style app router, server components, a typed API, encrypted WebSockets, auth with 2FA, an admin panel and email. Runs on Bun, Node, Deno, Cloudflare Workers and Vercel.**

[![npm](https://img.shields.io/npm/v/raiko.js?color=FFD23F&labelColor=0a0a0b&label=npm)](https://www.npmjs.com/package/raiko.js)
[![CI](https://github.com/kwy404/Raiko.js/actions/workflows/ci.yml/badge.svg)](https://github.com/kwy404/Raiko.js/actions/workflows/ci.yml)
[![downloads](https://img.shields.io/npm/dm/raiko.js?color=FFD23F&labelColor=0a0a0b)](https://www.npmjs.com/package/raiko.js)
[![license](https://img.shields.io/badge/license-MIT-FFD23F?labelColor=0a0a0b)](LICENSE)
[![types](https://img.shields.io/badge/TypeScript-strict-3178C6?labelColor=0a0a0b)](https://kwy404.github.io/Raiko.js/docs/)

**[Website](https://kwy404.github.io/Raiko.js/) · [Docs](https://kwy404.github.io/Raiko.js/docs/) · [Benchmarks](#benchmarks) · [Compare](#how-it-compares) · [GitHub](https://github.com/kwy404/Raiko.js) · [Leia em Português](README.pt-BR.md) · [Leer en Español](README.es.md)**

</div>

## Start in one command

**1. Create the project.** The installer asks what you want (frontend, CSS, database, sign in, email, deploy) and writes an app that already works.

```bash
npx create-raiko@latest my-app
# or
bun create raiko my-app
```

Use the arrow keys to move, Enter to choose, Space to mark items in a list, and Esc to go back to the previous question.

**2. Start the dev server.**

```bash
cd my-app
npm run dev        # or: bun run dev
```

**3. Open the address the terminal prints.**

```
  raiko.js 1.0.3 dev

  - Local:    http://localhost:3000
  - Network:  http://192.168.0.10:3000

  ready in 240 ms  (save a file to reload)
```

| You picked | Open | What runs there |
| --- | --- | --- |
| Raiko Pages (the default) | http://localhost:3000 | pages, API, sockets, admin, one server |
| React, Vue, Svelte, Solid or Preact | http://localhost:5173 | Vite, with the Raiko backend inside it on the same port |

You will see the starter page with the next steps. Edit the file it names (`app/page.tsx`, or `web/src/App.tsx` for Vite templates), save, and the page reloads.

Useful addresses in a new app: `/api/hello` (an API route), `/docs` (API docs generated from your schemas), `/health`, and, when you picked them, `/admin`, `/login` and `/_raiko/mail` (email previews).

**Open it on your phone.** Use the Network address while the phone is on the same Wi-Fi.

**Use another port.** `PORT=4000 npm run dev` (Raiko Pages) or `npm run dev -- --port 4000` (Vite templates).

**Port already in use.** You will see `error[RK0706]: port 3000 is already in use`. Stop the other server or pick another port as above.

**Production.** `npm run build` then `npm run start` serves the same app with `NODE_ENV=production`, on the port in `PORT` (3000 by default).

## The 30 second tour

An API with validation, types and OpenAPI docs from one schema:

```ts
import { Raiko, t } from 'raiko.js'

const app = new Raiko()
  .get('/', 'Hello')
  .get('/users/:id', ({ params }) => ({ id: params.id }))
  .post('/users', ({ body, status }) => status(201, { id: 1, ...body }), {
    body: t.Object({ email: t.String({ format: 'email' }), name: t.String({ minLength: 2 }) }),
  })

app.listen(3000)
export default app
```

A page is an async server component. It reads the database and ships no JavaScript unless you ask for it:

```tsx
// app/blog/[slug]/page.tsx
import { notFound } from 'raiko.js/server'
import { db } from '../../../db'

export const revalidate = 60
export async function generateMetadata({ params }) {
  return { title: params.slug }
}

export default async function Post({ params }) {
  const post = await db.posts.findUnique({ where: { slug: params.slug } })
  if (!post) notFound()
  return <article><h1>{post.title}</h1><p>{post.body}</p></article>
}
```

The client knows every route, param, body and response:

```ts
import { client } from 'raiko.js/client'
import type { App } from './server'

const api = client<App>('https://api.example.com')
const { data, error } = await api.post('/users', { body: { email: 'ana@raiko.dev', name: 'Ana' } })
//      ^ { id: number; email: string; name: string }    error.status is 422 with the exact field
```

## Contents

- [Why Raiko](#why-raiko)
- [Routing and handlers](#routing-and-handlers)
- [Validation](#validation)
- [Lifecycle hooks](#lifecycle-hooks)
- [State, decorators and plugins](#state-decorators-and-plugins)
- [Responses and streaming](#responses-and-streaming)
- [App router](#app-router)
- [Protected pages](#protected-pages)
- [Components](#components)
- [Typed client and hooks](#typed-client-and-hooks)
- [WebSockets](#websockets)
- [Auth and 2FA](#auth-and-2fa)
- [Admin panel](#admin-panel)
- [Email](#email)
- [Translations](#translations)
- [Built in plugins](#built-in-plugins)
- [Errors that tell you the fix](#errors-that-tell-you-the-fix)
- [Any frontend](#any-frontend)
- [Deploy](#deploy)
- [Security](#security)
- [Benchmarks](#benchmarks)
- [How it compares](#how-it-compares)
- [Next.js pain points it solves](#nextjs-pain-points-it-solves)
- [Testing](#testing)

## Why Raiko

| | |
| --- | --- |
| **App router like Next.js** | `page`, `layout`, `loading`, `error`, `not-found`, `forbidden`, `unauthorized`, `route` and `socket` files, metadata, form actions and ISR. |
| **Server components without React** | Async TSX rendered to a string or a stream with `<Suspense>`. Zero client JavaScript by default. |
| **Interactivity without a build** | Put `v-data` and `v-on:click` in your TSX and Voodoo.js is added to that page only. |
| **Types from server to client** | Params, query, body and every response status flow into `client<App>()`. No codegen. |
| **WebSockets on every runtime** | Bun, Node (its own RFC 6455 implementation, no dependency), Deno and Workers, with rooms and validation. |
| **Encrypted messages** | `encrypt: true` adds ECDH key exchange and AES-GCM with one key per direction and replay protection. |
| **P2P** | WebRTC signaling and a mesh client for data channels and media. |
| **Auth** | OAuth with PKCE (GitHub, Google, Discord, GitLab, any OAuth 2), credentials with PBKDF2, TOTP 2FA, signed JWT sessions. |
| **Admin panel** | CRUD, search, sort and pagination with permissions per role and action, for Kastor, Prisma and Drizzle. |
| **Email** | Templates in TSX with a live preview, sent through Resend, Postmark, SendGrid or SMTP. |
| **Errors like Rust** | Every error has a code, the file and line, the source frame and a `help:` line. |
| **Fast** | Compiled fast paths per route and Bun's native router. See [benchmarks](#benchmarks). |
| **Tested to break** | 107 tests, over 3.4 million generated property checks, two security audits, 11 templates end to end. |

## Routing and handlers

```ts
new Raiko()
  .get('/', 'static text')                       // constant: served by Bun's native router, no JS per request
  .get('/users/:id', ({ params }) => params.id)  // params are typed from the path
  .get('/files/*', ({ params }) => params['*'])  // wildcard
  .get('/archive/:year?', ({ params }) => params.year ?? 'all')
  .group('/v1', (v1) => v1.get('/health', 'ok'))
  .all('/echo', ({ request }) => request.method)
  .route('PROPFIND', '/dav', () => 'custom method')
  .mount('/legacy', otherFetchHandler)           // mount Hono, another app, any fetch handler
```

The router is a radix tree with a hash map in front for static paths, backtracking so the most specific route wins, automatic `HEAD`, `OPTIONS`, and `405` with an `Allow` header.

## Validation

`t` builds schemas with full inference, coerces strings from params, query and forms, and reports the exact path of every problem:

```ts
import { t } from 'raiko.js'

const User = t.Object({
  email: t.String({ format: 'email' }),
  age: t.Optional(t.Integer({ minimum: 13 })),
  tags: t.Array(t.String(), { maxItems: 10 }),
  role: t.Enum(['user', 'admin']),
})
```

Zod, Valibot and ArkType work too, through Standard Schema: pass them wherever a `t` schema goes.

A failed validation answers `422` with RFC 9457 problem details:

```json
{ "status": 422, "detail": "body.email: Expected a valid email", "errors": [{ "path": ["email"], "on": "body" }] }
```

## Lifecycle hooks

`onRequest`, `onParse`, `onTransform`, `derive`, validation, `resolve`, `onBeforeHandle`, handler, `onAfterHandle`, `mapResponse`, `onAfterResponse` and `onError`. A hook applies to the routes registered after it. Pass `'global'` to also apply it to the app that uses your plugin.

```ts
app
  .derive(({ headers }) => ({ token: headers.authorization?.slice(7) }))
  .onBeforeHandle(({ token }) => (token ? undefined : new Response('Unauthorized', { status: 401 })))
  .get('/me', ({ token }) => ({ token }))
```

## State, decorators and plugins

```ts
const db = new Raiko({ name: 'db' }).decorate('db', createDb()).state('hits', 0)

const app = new Raiko()
  .use(db)                                 // deduplicated by name
  .get('/hits', ({ store }) => ++store.hits)
  .get('/users', ({ db }) => db.users.findMany())
```

## Responses and streaming

Return anything: objects become JSON, strings become text, JSX becomes HTML, generators become Server Sent Events, `Blob`, `File`, `ReadableStream` and `Response` pass through. `status(201, body)` sets the code and types the client per status.

```ts
import { sse } from 'raiko.js'

app.get('/ticks', async function* () {
  for (let i = 0; i < 5; i++) yield sse({ i }, { event: 'tick' })
})
```

## App router

```
app/
  layout.tsx            root layout, metadata
  page.tsx              /
  loading.tsx           streamed fallback while pages load
  error.tsx             error boundary
  not-found.tsx         404
  forbidden.tsx         403
  blog/[slug]/page.tsx  /blog/:slug
  docs/[...path]/page.tsx
  (marketing)/about/page.tsx   route group, not in the URL
  api/users/route.ts    export GET, POST...
  chat/socket.ts        WebSocket
middleware.ts
```

```ts
import { Raiko } from 'raiko.js'
import { appRouter } from 'raiko.js/app'

const app = new Raiko().use(await appRouter({ dir: './app' }))
```

Pages get `params` and `searchParams`, export `metadata` or `generateMetadata`, `revalidate` for cached rendering, and `actions` for forms (`<Form action="like">` posts to `?/like`). Inside any component: `headers()`, `cookies()`, `usePathname()`, `useParams()`, `useSearchParams()`, `currentUser()`, `notFound()`, `redirect()`, `forbidden()`, `unauthorized()`.

`sitemap.xml` and `robots.txt` are generated from your pages. In development every page gets an error overlay, a DevTools badge (route, params, render time, cache) and an accessibility checker.

## Protected pages

```tsx
// app/dashboard/page.tsx
export const auth = true                 // signed in users only
export default function Dashboard() { ... }

// app/admin/layout.tsx
export const roles = ['admin']           // every page under app/admin
```

```ts
appRouter({ getUser: async (ctx) => (await auth.getSession(ctx.request))?.user })
```

Signed out users go to `/login?callbackUrl=...` (or your `unauthorized.tsx`). Users without the role get `forbidden.tsx` with status 403.

## Components

`<Link>` with prefetch, `<Image>` with `srcset`, lazy loading and resizing through sharp when it is installed, `<Script>` with loading strategies, `<Head>`, `<JsonLd>`, `<SkipLink>` and `<Form>`.

```tsx
import { Image, Link, JsonLd } from 'raiko.js/components'

<Image src="/hero.png" alt="Product screenshot" width={1200} height={630} priority />
```

## Typed client and hooks

```ts
const api = client<App>('', { retry: 2, timeout: 10_000, headers: () => ({ authorization: `Bearer ${token}` }) })
```

React and Vue hooks for queries, mutations and sockets:

```tsx
import { useQuery, useSocket } from 'raiko.js/react'   // or 'raiko.js/vue'

const users = useQuery(() => api.get('/users'), { key: 'users' })
const chat = useSocket(() => api.ws('/chat'), (msg) => setMessages((m) => [...m, msg]))
```

## WebSockets

```ts
app.ws('/chat/:room', {
  body: t.Object({ text: t.String({ maxLength: 500 }) }),
  encrypt: true,
  open: (ws) => ws.subscribe(ws.data.params.room),
  message: (ws, msg) => ws.publish(ws.data.params.room, { from: ws.id, text: msg.text }),
})
```

The browser client reconnects with backoff, queues messages while offline and handles the key exchange. With `encrypt: true`, keys are agreed with ECDH P-256, each direction gets its own AES-GCM 256 key from HKDF, and nonces are frame counters, so replayed, reordered or reflected frames are refused. This runs on top of TLS (`wss://`); it keeps message content away from proxies and logs, not from the user's own browser.

P2P with WebRTC:

```ts
import { signaling } from 'raiko.js/p2p'
app.use(signaling({ path: '/p2p/:room' }))

// browser
import { joinRoom } from 'raiko.js/p2p/client'
const room = joinRoom(api.ws('/p2p/lobby'))
room.on('message', (from, data) => console.log(from, data))
room.send({ hi: true })
```

## Auth and 2FA

```ts
import { raikoAuth, GitHub, Google, Credentials, verifyPassword } from 'raiko.js/auth'

export const auth = raikoAuth({
  secret: process.env.AUTH_SECRET!,
  providers: [
    GitHub({ clientId, clientSecret }),
    Credentials({ authorize: async ({ email, password }) => /* your lookup */ null }),
  ],
  twoFactor: { getSecret: (user) => user.totpSecret },
})

app.use(auth.plugin).get('/me', ({ auth }) => auth?.user, { beforeHandle: auth.protect })
```

OAuth uses PKCE and a signed state. Passwords use PBKDF2 SHA-256 with 210,000 iterations. TOTP works with Google Authenticator, Authy and 1Password, allows five tries per sign in and refuses a reused code. `generateTotpSecret()`, `totpUri()` and `recoveryCodes()` help you build the setup screen.

## Admin panel

```ts
import { admin, modelAdapter } from 'raiko.js/admin'

app.use(admin({
  auth: ({ auth }) => auth?.user.role ?? null,
  resources: {
    users: {
      adapter: modelAdapter(db.users, { searchable: ['email'] }),
      fields: ['id', 'email', 'name', 'role'],
      hidden: ['passwordHash'],
      permissions: { admin: '*', support: ['read', 'update'], viewer: ['list'] },
    },
  },
}))
```

Each action (`list`, `read`, `create`, `update`, `delete`) is checked on its own, so a support role can fix a user without being able to list or delete them. `modelAdapter` works with Kastor and Prisma, `drizzleAdapter` with Drizzle.

## Email

```tsx
// emails/welcome.tsx
/** @jsxImportSource raiko.js */
export default function Welcome({ name }: { name: string }) {
  return <h1>Welcome, {name}</h1>
}
Welcome.subject = (p) => `Welcome, ${p.name}`
Welcome.preview = { name: 'Ana' }
```

```ts
import { createMailer, resend } from 'raiko.js/mail'

const mailer = createMailer({ from: 'hi@my.app', transport: resend({ apiKey }), templates: { welcome: Welcome } })
await mailer.send({ to: 'ana@x.io', template: 'welcome', props: { name: 'Ana' } })
app.use(mailer.preview())   // /_raiko/mail lists and renders every template
```

A plain text version is generated for every email. Templates can also return HTML from React Email, Vue or any string.

## Translations

```ts
import { createI18n } from 'raiko.js/i18n'

const i18n = createI18n({ en, 'pt-BR': ptBR }, { fallback: 'en', cookie: 'locale' })
i18n.t('pt-BR', 'cart.items', { count: 3 })   // "3 itens", plurals with Intl.PluralRules
```

Keys are typed from your fallback dictionary. Locale detection reads the URL prefix, a cookie and `Accept-Language`.

## Built in plugins

From `raiko.js/plugins`: `cors`, `secureHeaders`, `rateLimit`, `csrf`, `logger`, `requestId`, `compress`, `etag`, `responseCache`, `health`, `staticFiles` and `openapi` (OpenAPI 3.1 with a docs page at `/docs`).

## Errors that tell you the fix

```
error[RK0104]: two routes use different param names at the same position
  --> app/blog/[slug]/page.tsx
   |
 3 |   app/blog/[id]/page.tsx
   |            ^^^^ already declared as [slug]
   |
   = help: rename the folder to [slug], or move one of the pages
```

Every coded error (`RK0100` and up) has a page in the [error reference](https://kwy404.github.io/Raiko.js/docs/errors.html).

## Any frontend

Raiko Pages render on the server. For a single page app, the Vite plugin runs the backend inside the Vite dev server, so React, Vue, Svelte, Solid or Preact share one port with the API:

```ts
// vite.config.ts
import react from '@vitejs/plugin-react'
import { raiko } from 'raiko.js/vite'

export default { plugins: [react(), raiko({ entry: './server/index.ts' })] }
```

Production builds are minified and mangled, with no source maps. Obfuscation slows down reading, it does not stop it: secrets and rules stay on the server.

## Deploy

| Target | How |
| --- | --- |
| Bun, Node, Deno | `app.listen(3000)`, or `raiko build` then `raiko start` |
| Many cores | `app.listen(3000, { cluster: true })`: one process per core on the same port |
| Vercel | `export default { fetch: app.fetch }` in `api/index.ts` (the installer writes it) |
| Cloudflare Workers | `export default { fetch: app.fetch }`, `wrangler deploy` |
| Docker | the installer writes a non root, multi stage `Dockerfile` |

`raiko deploy` picks the target from your project.

## Security

Defaults that hold under attack, each one backed by a test:

- HTML is escaped everywhere, attribute and tag names are validated.
- Query, cookie and form parsing use null prototype objects (no prototype pollution).
- Static files and the image endpoint refuse path traversal.
- Cookies can be signed, signatures have one canonical encoding.
- `cors({ credentials: true })` refuses to run without an explicit origin list.
- Redirects after sign in and after form actions stay on your site.
- Body limits apply to chunked and multipart uploads.
- Response validation errors never send server data to the client.
- Caches never serve one user's response to another.
- The rate limiter does not trust `X-Forwarded-For` unless you say so.

Two independent audits found 21 issues before this release. All are fixed, and each has a test that reproduces the attack. Report a vulnerability through [SECURITY.md](SECURITY.md).

## Benchmarks

Requests per second, higher is better. The same three routes in every framework, on Bun, over real HTTP with autocannon (64 connections, pipelining 4), median of three rounds.

<!-- bench:start -->
| Server rendered page | Raiko.js (Bun) | Raiko.js (Node) | Next.js 15 (Node) |
| --- | ---: | ---: | ---: |
| req/s | 8,910 | 3,737 | 155 |

| Route | Raiko.js | Elysia 1.4 | Hono 4.13 |
| --- | ---: | ---: | ---: |
| text | 99,040 | 83,192 | 63,920 |
| params + json | 66,943 | 75,723 | 60,477 |
| json body | 51,136 | 53,168 | 47,029 |

AMD EPYC 9J45, 1 vCPU, 1.9 GB RAM, Linux 6.8, Bun 1.4.4, Node 22.23. autocannon -c 64 -p 4, median of 3 rounds.
<!-- bench:end -->

Honest notes: the machine has one vCPU, so the load generator and the server share it and the numbers are compressed. On static routes, Raiko and Elysia both answer from Bun's native router without running JavaScript, so they tie at the ceiling. Run `bun bench/http.ts` on your own hardware.

## How it compares

| | Raiko.js | Elysia | Next.js | Hono |
| --- | --- | --- | --- | --- |
| Runtimes | Bun, Node, Deno, Workers, Vercel | Bun first | Node, Vercel | All |
| App router, layouts, loading, error | Yes | No | Yes | No |
| Server components | Yes, no React needed | No | Yes | JSX only |
| Typed client | Yes | Yes (Eden) | Server actions | Yes (RPC) |
| WebSockets on every runtime | Yes | Bun | No | Per adapter |
| Encrypted WebSocket messages | Yes | No | No | No |
| Auth with OAuth and 2FA | Built in | Plugins | NextAuth | Middleware |
| Admin panel with permissions | Built in | No | No | No |
| Email templates with preview | Built in | No | No | No |
| Ecosystem size | New | Growing | Huge | Large |

## Next.js pain points it solves

- **One process for pages and the API.** No separate backend, no duplicated types.
- **No React required on the server.** Pages are plain async functions that return TSX.
- **Real WebSockets.** Next.js has no WebSocket server, and Raiko has one on every runtime.
- **Predictable caching.** Only pages that export `revalidate` are cached, never personalized requests.
- **Runs anywhere.** The same app deploys to Bun, Node, Deno, Workers and Vercel without an adapter project.
- **Errors you can act on.** Coded errors with the fix, not a minified stack trace.
- **Auth, admin and email included.** The things every product needs are not separate libraries to wire.

## Testing

```ts
const res = await app.request('/users', { json: { email: 'a@b.co', name: 'Ana' } })
expect(res.status).toBe(201)
```

No server, no port: `app.request()` and `app.fetch()` run the full lifecycle in memory.

## More projects by kwy404

| Project | What it does |
| --- | --- |
| [Voodoo.js](https://github.com/kwy404/Voodoo.js) | JSX in plain HTML with no build step, used for interactivity in Raiko Pages |
| [Monsoon](https://github.com/kwy404/monsoon) | Utility first CSS with no build step, a theme from one color |
| [glyphfox](https://github.com/kwy404/glyphfox) | Morphable icons for every framework |
| [Kastor](https://github.com/kwy404/kastor) | The TypeScript ORM for almost every database |
| [a11ymedic](https://github.com/kwy404/a11ymedic) | Accessibility checker that explains the fix |
| [cookieowl](https://github.com/kwy404/cookieowl) | Cookie consent for LGPD and GDPR that really blocks trackers |
| [installkite](https://github.com/kwy404/installkite) | Make any website installable and offline capable |
| [edgegoat](https://github.com/kwy404/edgegoat) | Edge case test inputs for JavaScript |

## Author

Created by **Alexandre Kohler** ([GitHub](https://github.com/kwy404)).

## License

[MIT](LICENSE)
