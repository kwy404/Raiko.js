<div align="center">

<a href="https://kwy404.github.io/Raiko.js/">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cdn.jsdelivr.net/gh/kwy404/Raiko.js@main/assets/banner-dark.svg">
    <img src="https://cdn.jsdelivr.net/gh/kwy404/Raiko.js@main/assets/banner.svg" alt="Raiko.js: backend and frontend in one file tree, every runtime" width="820">
  </picture>
</a>

### Backend e frontend na mesma árvore de arquivos. Em qualquer runtime.

**Um framework TypeScript com app router no estilo do Next.js, server components, API tipada, WebSockets criptografados, autenticação com 2FA, painel admin e envio de email. Roda em Bun, Node, Deno, Cloudflare Workers e Vercel.**

[![npm](https://img.shields.io/npm/v/raiko.js?color=FFD23F&labelColor=0a0a0b&label=npm)](https://www.npmjs.com/package/raiko.js)
[![CI](https://github.com/kwy404/Raiko.js/actions/workflows/ci.yml/badge.svg)](https://github.com/kwy404/Raiko.js/actions/workflows/ci.yml)
[![downloads](https://img.shields.io/npm/dm/raiko.js?color=FFD23F&labelColor=0a0a0b)](https://www.npmjs.com/package/raiko.js)
[![license](https://img.shields.io/badge/license-MIT-FFD23F?labelColor=0a0a0b)](LICENSE)
[![types](https://img.shields.io/badge/TypeScript-strict-3178C6?labelColor=0a0a0b)](https://kwy404.github.io/Raiko.js/docs/)

**[Site](https://kwy404.github.io/Raiko.js/) · [Documentação](https://kwy404.github.io/Raiko.js/docs/) · [Benchmarks](#benchmarks) · [Comparação](#comparação) · [GitHub](https://github.com/kwy404/Raiko.js) · [Read in English](README.md) · [Leer en Español](README.es.md)**

</div>

## Comece com um comando

**1. Crie o projeto.** O instalador pergunta o que você quer (frontend, CSS, banco, login, e-mail, deploy) e escreve um app que já funciona.

```bash
npx create-raiko@latest my-app
# ou
bun create raiko my-app
```

Use as setas para mover, Enter para escolher, Espaço para marcar itens numa lista e Esc para voltar à pergunta anterior.

**2. Suba o servidor de desenvolvimento.**

```bash
cd my-app
npm run dev        # ou: bun run dev
```

**3. Abra o endereço que o terminal mostra.**

```
  raiko.js 1.0.3 dev

  - Local:    http://localhost:3000
  - Network:  http://192.168.0.10:3000

  ready in 240 ms  (save a file to reload)
```

| Você escolheu | Abra | O que roda ali |
| --- | --- | --- |
| Raiko Pages (o padrão) | http://localhost:3000 | páginas, API, sockets e admin num servidor só |
| React, Vue, Svelte, Solid ou Preact | http://localhost:5173 | o Vite, com o backend do Raiko dentro dele na mesma porta |

Você verá a página inicial com os próximos passos. Edite o arquivo que ela indica (`app/page.tsx`, ou `web/src/App.tsx` nos templates com Vite), salve e a página recarrega.

Endereços úteis num app novo: `/api/hello` (uma rota de API), `/docs` (documentação da API gerada pelos seus schemas), `/health` e, se você escolheu, `/admin`, `/login` e `/_raiko/mail` (prévia dos e-mails).

**Abrir no celular.** Use o endereço Network com o celular no mesmo Wi-Fi.

**Usar outra porta.** `PORT=4000 npm run dev` (Raiko Pages) ou `npm run dev -- --port 4000` (templates com Vite).

**Porta ocupada.** Aparece `error[RK0706]: port 3000 is already in use`. Pare o outro servidor ou use outra porta como acima.

**Produção.** `npm run build` e depois `npm run start` sobem o mesmo app com `NODE_ENV=production`, na porta de `PORT` (3000 por padrão).

## O tour de 30 segundos

Uma API com validação, tipos e documentação OpenAPI a partir de um único schema:

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

Uma página é um server component assíncrono. Ela lê o banco de dados e não envia nenhum JavaScript, a menos que você peça:

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

O client conhece cada rota, parâmetro, body e resposta:

```ts
import { client } from 'raiko.js/client'
import type { App } from './server'

const api = client<App>('https://api.example.com')
const { data, error } = await api.post('/users', { body: { email: 'ana@raiko.dev', name: 'Ana' } })
//      ^ { id: number; email: string; name: string }    error.status is 422 with the exact field
```

## Conteúdo

- [Por que Raiko](#por-que-raiko)
- [Rotas e handlers](#rotas-e-handlers)
- [Validação](#validação)
- [Hooks de ciclo de vida](#hooks-de-ciclo-de-vida)
- [Estado, decorators e plugins](#estado-decorators-e-plugins)
- [Respostas e streaming](#respostas-e-streaming)
- [App router](#app-router)
- [Páginas protegidas](#páginas-protegidas)
- [Componentes](#componentes)
- [Client tipado e hooks](#client-tipado-e-hooks)
- [WebSockets](#websockets)
- [Autenticação e 2FA](#autenticação-e-2fa)
- [Painel admin](#painel-admin)
- [Email](#email)
- [Traduções](#traduções)
- [Plugins embutidos](#plugins-embutidos)
- [Erros que mostram a correção](#erros-que-mostram-a-correção)
- [Qualquer frontend](#qualquer-frontend)
- [Deploy](#deploy)
- [Segurança](#segurança)
- [Benchmarks](#benchmarks)
- [Comparação](#comparação)
- [Problemas do Next.js que ele resolve](#problemas-do-nextjs-que-ele-resolve)
- [Testes](#testes)

## Por que Raiko

| | |
| --- | --- |
| **App router como no Next.js** | Arquivos `page`, `layout`, `loading`, `error`, `not-found`, `forbidden`, `unauthorized`, `route` e `socket`, metadata, form actions e ISR. |
| **Server components sem React** | TSX assíncrono renderizado em string ou em stream com `<Suspense>`. Zero JavaScript no cliente por padrão. |
| **Interatividade sem build** | Coloque `v-data` e `v-on:click` no seu TSX e o Voodoo.js é adicionado só naquela página. |
| **Tipos do servidor ao cliente** | Params, query, body e cada status de resposta chegam ao `client<App>()`. Sem geração de código. |
| **WebSockets em todo runtime** | Bun, Node (implementação própria do RFC 6455, sem dependências), Deno e Workers, com salas e validação. |
| **Mensagens criptografadas** | `encrypt: true` adiciona troca de chaves ECDH e AES-GCM, com uma chave por direção e proteção contra replay. |
| **P2P** | Sinalização WebRTC e um client mesh para data channels e mídia. |
| **Autenticação** | OAuth com PKCE (GitHub, Google, Discord, GitLab, qualquer OAuth 2), credenciais com PBKDF2, 2FA via TOTP, sessões JWT assinadas. |
| **Painel admin** | CRUD, busca, ordenação e paginação com permissões por papel e por ação, para Kastor, Prisma e Drizzle. |
| **Email** | Templates em TSX com preview ao vivo, enviados via Resend, Postmark, SendGrid ou SMTP. |
| **Erros como os do Rust** | Todo erro tem código, arquivo e linha, o trecho do código-fonte e uma linha `help:`. |
| **Rápido** | Caminhos rápidos compilados por rota e o router nativo do Bun. Veja os [benchmarks](#benchmarks). |
| **Testado para quebrar** | 107 testes, mais de 3,4 milhões de checagens de propriedades geradas, duas auditorias de segurança, 11 templates testados de ponta a ponta. |

## Rotas e handlers

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

O router é uma radix tree com um hash map na frente para caminhos estáticos, com backtracking para que a rota mais específica vença, além de `HEAD`, `OPTIONS` e `405` com header `Allow` automáticos.

## Validação

`t` cria schemas com inferência completa, converte strings vindas de params, query e formulários, e informa o caminho exato de cada problema:

```ts
import { t } from 'raiko.js'

const User = t.Object({
  email: t.String({ format: 'email' }),
  age: t.Optional(t.Integer({ minimum: 13 })),
  tags: t.Array(t.String(), { maxItems: 10 }),
  role: t.Enum(['user', 'admin']),
})
```

Zod, Valibot e ArkType também funcionam, via Standard Schema: use-os em qualquer lugar onde caberia um schema `t`.

Uma validação que falha responde `422` com problem details no formato RFC 9457:

```json
{ "status": 422, "detail": "body.email: Expected a valid email", "errors": [{ "path": ["email"], "on": "body" }] }
```

## Hooks de ciclo de vida

`onRequest`, `onParse`, `onTransform`, `derive`, validação, `resolve`, `onBeforeHandle`, handler, `onAfterHandle`, `mapResponse`, `onAfterResponse` e `onError`. Um hook vale para as rotas registradas depois dele. Passe `'global'` para aplicá-lo também ao app que usa o seu plugin.

```ts
app
  .derive(({ headers }) => ({ token: headers.authorization?.slice(7) }))
  .onBeforeHandle(({ token }) => (token ? undefined : new Response('Unauthorized', { status: 401 })))
  .get('/me', ({ token }) => ({ token }))
```

## Estado, decorators e plugins

```ts
const db = new Raiko({ name: 'db' }).decorate('db', createDb()).state('hits', 0)

const app = new Raiko()
  .use(db)                                 // deduplicated by name
  .get('/hits', ({ store }) => ++store.hits)
  .get('/users', ({ db }) => db.users.findMany())
```

## Respostas e streaming

Retorne qualquer coisa: objetos viram JSON, strings viram texto, JSX vira HTML, generators viram Server Sent Events, e `Blob`, `File`, `ReadableStream` e `Response` passam direto. `status(201, body)` define o código e tipa o client por status.

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

As páginas recebem `params` e `searchParams`, exportam `metadata` ou `generateMetadata`, `revalidate` para renderização em cache e `actions` para formulários (`<Form action="like">` envia para `?/like`). Dentro de qualquer componente: `headers()`, `cookies()`, `usePathname()`, `useParams()`, `useSearchParams()`, `currentUser()`, `notFound()`, `redirect()`, `forbidden()`, `unauthorized()`.

`sitemap.xml` e `robots.txt` são gerados a partir das suas páginas. Em desenvolvimento, toda página ganha um overlay de erros, um selo de DevTools (rota, params, tempo de renderização, cache) e um verificador de acessibilidade.

## Páginas protegidas

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

Usuários deslogados vão para `/login?callbackUrl=...` (ou para o seu `unauthorized.tsx`). Usuários sem o papel recebem `forbidden.tsx` com status 403.

## Componentes

`<Link>` com prefetch, `<Image>` com `srcset`, lazy loading e redimensionamento via sharp quando ele está instalado, `<Script>` com estratégias de carregamento, `<Head>`, `<JsonLd>`, `<SkipLink>` e `<Form>`.

```tsx
import { Image, Link, JsonLd } from 'raiko.js/components'

<Image src="/hero.png" alt="Product screenshot" width={1200} height={630} priority />
```

## Client tipado e hooks

```ts
const api = client<App>('', { retry: 2, timeout: 10_000, headers: () => ({ authorization: `Bearer ${token}` }) })
```

Hooks para React e Vue com queries, mutations e sockets:

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

O client do navegador reconecta com backoff, enfileira mensagens enquanto está offline e cuida da troca de chaves. Com `encrypt: true`, as chaves são negociadas com ECDH P-256, cada direção recebe sua própria chave AES-GCM 256 derivada via HKDF, e os nonces são contadores de frames, então frames repetidos, fora de ordem ou refletidos são recusados. Tudo isso roda por cima do TLS (`wss://`); o objetivo é manter o conteúdo das mensagens longe de proxies e logs, não do próprio navegador do usuário.

P2P com WebRTC:

```ts
import { signaling } from 'raiko.js/p2p'
app.use(signaling({ path: '/p2p/:room' }))

// browser
import { joinRoom } from 'raiko.js/p2p/client'
const room = joinRoom(api.ws('/p2p/lobby'))
room.on('message', (from, data) => console.log(from, data))
room.send({ hi: true })
```

## Autenticação e 2FA

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

O OAuth usa PKCE e um state assinado. As senhas usam PBKDF2 SHA-256 com 210.000 iterações. O TOTP funciona com Google Authenticator, Authy e 1Password, permite cinco tentativas por login e recusa códigos reutilizados. `generateTotpSecret()`, `totpUri()` e `recoveryCodes()` ajudam a montar a tela de configuração.

## Painel admin

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

Cada ação (`list`, `read`, `create`, `update`, `delete`) é verificada separadamente, então um papel de suporte pode corrigir um usuário sem conseguir listar ou excluir usuários. `modelAdapter` funciona com Kastor e Prisma, `drizzleAdapter` com Drizzle.

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

Uma versão em texto puro é gerada para cada email. Os templates também podem retornar HTML do React Email, do Vue ou qualquer string.

## Traduções

```ts
import { createI18n } from 'raiko.js/i18n'

const i18n = createI18n({ en, 'pt-BR': ptBR }, { fallback: 'en', cookie: 'locale' })
i18n.t('pt-BR', 'cart.items', { count: 3 })   // "3 itens", plurals with Intl.PluralRules
```

As chaves são tipadas a partir do seu dicionário de fallback. A detecção de idioma lê o prefixo da URL, um cookie e o `Accept-Language`.

## Plugins embutidos

Em `raiko.js/plugins`: `cors`, `secureHeaders`, `rateLimit`, `csrf`, `logger`, `requestId`, `compress`, `etag`, `responseCache`, `health`, `staticFiles` e `openapi` (OpenAPI 3.1 com página de documentação em `/docs`).

## Erros que mostram a correção

```
error[RK0104]: two routes use different param names at the same position
  --> app/blog/[slug]/page.tsx
   |
 3 |   app/blog/[id]/page.tsx
   |            ^^^^ already declared as [slug]
   |
   = help: rename the folder to [slug], or move one of the pages
```

Todo erro com código (`RK0100` em diante) tem uma página na [referência de erros](https://kwy404.github.io/Raiko.js/docs/errors.html).

## Qualquer frontend

As Raiko Pages são renderizadas no servidor. Para uma single page app, o plugin do Vite roda o backend dentro do dev server do Vite, então React, Vue, Svelte, Solid ou Preact dividem a mesma porta com a API:

```ts
// vite.config.ts
import react from '@vitejs/plugin-react'
import { raiko } from 'raiko.js/vite'

export default { plugins: [react(), raiko({ entry: './server/index.ts' })] }
```

Os builds de produção são minificados e ofuscados, sem source maps. Ofuscação dificulta a leitura, mas não a impede: segredos e regras ficam no servidor.

## Deploy

| Destino | Como |
| --- | --- |
| Bun, Node, Deno | `app.listen(3000)`, ou `raiko build` e depois `raiko start` |
| Vários núcleos | `app.listen(3000, { cluster: true })`: um processo por núcleo na mesma porta |
| Vercel | `export default { fetch: app.fetch }` em `api/index.ts` (o instalador cria esse arquivo) |
| Cloudflare Workers | `export default { fetch: app.fetch }`, `wrangler deploy` |
| Docker | o instalador gera um `Dockerfile` multi stage que não roda como root |

`raiko deploy` escolhe o destino com base no seu projeto.

## Segurança

Padrões que aguentam ataques, cada um coberto por um teste:

- O HTML é escapado em todo lugar, e nomes de atributos e tags são validados.
- O parsing de query, cookies e formulários usa objetos com protótipo nulo (sem prototype pollution).
- Arquivos estáticos e o endpoint de imagens recusam path traversal.
- Cookies podem ser assinados, e as assinaturas têm uma única codificação canônica.
- `cors({ credentials: true })` se recusa a rodar sem uma lista explícita de origens.
- Redirecionamentos depois do login e depois de form actions ficam no seu site.
- Os limites de body valem para uploads chunked e multipart.
- Erros de validação de resposta nunca enviam dados do servidor ao cliente.
- Os caches nunca servem a resposta de um usuário para outro.
- O rate limiter não confia em `X-Forwarded-For`, a menos que você diga para confiar.

Duas auditorias independentes encontraram 21 problemas antes desta versão. Todos foram corrigidos, e cada um tem um teste que reproduz o ataque. Reporte vulnerabilidades pelo [SECURITY.md](SECURITY.md).

## Benchmarks

Requisições por segundo, quanto maior, melhor. As mesmas três rotas em todos os frameworks, no Bun, sobre HTTP real com autocannon (64 conexões, pipelining 4), mediana de três rodadas.

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

Observações honestas: a máquina tem uma única vCPU, então o gerador de carga e o servidor disputam o mesmo núcleo e os números ficam comprimidos. Nas rotas estáticas, Raiko e Elysia respondem direto do router nativo do Bun sem executar JavaScript, então empatam no teto. Rode `bun bench/http.ts` no seu próprio hardware.

## Comparação

| | Raiko.js | Elysia | Next.js | Hono |
| --- | --- | --- | --- | --- |
| Runtimes | Bun, Node, Deno, Workers, Vercel | Foco no Bun | Node, Vercel | Todos |
| App router, layouts, loading, error | Sim | Não | Sim | Não |
| Server components | Sim, sem precisar de React | Não | Sim | Só JSX |
| Client tipado | Sim | Sim (Eden) | Server actions | Sim (RPC) |
| WebSockets em todo runtime | Sim | Bun | Não | Depende do adapter |
| Mensagens WebSocket criptografadas | Sim | Não | Não | Não |
| Autenticação com OAuth e 2FA | Embutida | Plugins | NextAuth | Middleware |
| Painel admin com permissões | Embutido | Não | Não | Não |
| Templates de email com preview | Embutidos | Não | Não | Não |
| Tamanho do ecossistema | Novo | Crescendo | Enorme | Grande |

## Problemas do Next.js que ele resolve

- **Um processo só para páginas e API.** Sem backend separado, sem tipos duplicados.
- **Sem React obrigatório no servidor.** Páginas são funções assíncronas simples que retornam TSX.
- **WebSockets de verdade.** O Next.js não tem servidor WebSocket, e o Raiko tem um em todo runtime.
- **Cache previsível.** Só páginas que exportam `revalidate` vão para o cache, nunca requisições personalizadas.
- **Roda em qualquer lugar.** O mesmo app faz deploy em Bun, Node, Deno, Workers e Vercel sem um projeto de adapter.
- **Erros que dão para resolver.** Erros com código e a correção, não um stack trace minificado.
- **Autenticação, admin e email inclusos.** O que todo produto precisa não vira um monte de bibliotecas separadas para integrar.

## Testes

```ts
const res = await app.request('/users', { json: { email: 'a@b.co', name: 'Ana' } })
expect(res.status).toBe(201)
```

Sem servidor, sem porta: `app.request()` e `app.fetch()` executam o ciclo de vida completo em memória.

## Mais projetos de kwy404

| Projeto | O que faz |
| --- | --- |
| [Voodoo.js](https://github.com/kwy404/Voodoo.js) | JSX em HTML puro sem etapa de build, usado para interatividade nas Raiko Pages |
| [Monsoon](https://github.com/kwy404/monsoon) | CSS utility first sem etapa de build, com um tema a partir de uma única cor |
| [glyphfox](https://github.com/kwy404/glyphfox) | Ícones com morphing para todos os frameworks |
| [Kastor](https://github.com/kwy404/kastor) | O ORM TypeScript para quase todos os bancos de dados |
| [a11ymedic](https://github.com/kwy404/a11ymedic) | Verificador de acessibilidade que explica a correção |
| [cookieowl](https://github.com/kwy404/cookieowl) | Consentimento de cookies para LGPD e GDPR que bloqueia rastreadores de verdade |
| [installkite](https://github.com/kwy404/installkite) | Torna qualquer site instalável e capaz de funcionar offline |
| [edgegoat](https://github.com/kwy404/edgegoat) | Entradas de teste de casos extremos para JavaScript |

## Autor

Criado por **Alexandre Kohler** ([GitHub](https://github.com/kwy404)).

## Licença

[MIT](LICENSE)
