<div align="center">

<a href="https://kwy404.github.io/Raiko.js/">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cdn.jsdelivr.net/gh/kwy404/Raiko.js@main/assets/banner-dark.svg">
    <img src="https://cdn.jsdelivr.net/gh/kwy404/Raiko.js@main/assets/banner.svg" alt="Raiko.js: backend and frontend in one file tree, every runtime" width="820">
  </picture>
</a>

### Backend y frontend en un solo árbol de archivos. En cualquier runtime.

**Un framework de TypeScript con un app router al estilo de Next.js, server components, una API tipada, WebSockets cifrados, autenticación con 2FA, un panel de administración y envío de correos. Funciona en Bun, Node, Deno, Cloudflare Workers y Vercel.**

[![npm](https://img.shields.io/npm/v/raiko.js?color=FFD23F&labelColor=0a0a0b&label=npm)](https://www.npmjs.com/package/raiko.js)
[![CI](https://github.com/kwy404/Raiko.js/actions/workflows/ci.yml/badge.svg)](https://github.com/kwy404/Raiko.js/actions/workflows/ci.yml)
[![downloads](https://img.shields.io/npm/dm/raiko.js?color=FFD23F&labelColor=0a0a0b)](https://www.npmjs.com/package/raiko.js)
[![license](https://img.shields.io/badge/license-MIT-FFD23F?labelColor=0a0a0b)](LICENSE)
[![types](https://img.shields.io/badge/TypeScript-strict-3178C6?labelColor=0a0a0b)](https://kwy404.github.io/Raiko.js/docs/)

**[Sitio web](https://kwy404.github.io/Raiko.js/) · [Documentación](https://kwy404.github.io/Raiko.js/docs/) · [Benchmarks](#benchmarks) · [Comparación](#cómo-se-compara) · [GitHub](https://github.com/kwy404/Raiko.js) · [Read in English](README.md) · [Leia em Português](README.pt-BR.md)**

</div>

## Empieza con un comando

**1. Crea el proyecto.** El instalador pregunta lo que quieres (frontend, CSS, base de datos, login, email, deploy) y escribe una app que ya funciona.

```bash
npx create-raiko@latest my-app
# o
bun create raiko my-app
```

Usa las flechas para moverte, Enter para elegir, Espacio para marcar elementos de una lista y Esc para volver a la pregunta anterior.

**2. Arranca el servidor de desarrollo.**

```bash
cd my-app
npm run dev        # o: bun run dev
```

**3. Abre la dirección que muestra la terminal.**

```
  raiko.js 1.0.3 dev

  - Local:    http://localhost:3000
  - Network:  http://192.168.0.10:3000

  ready in 240 ms  (save a file to reload)
```

| Elegiste | Abre | Qué corre ahí |
| --- | --- | --- |
| Raiko Pages (por defecto) | http://localhost:3000 | páginas, API, sockets y admin en un solo servidor |
| React, Vue, Svelte, Solid o Preact | http://localhost:5173 | Vite, con el backend de Raiko dentro en el mismo puerto |

Verás la página inicial con los siguientes pasos. Edita el archivo que indica (`app/page.tsx`, o `web/src/App.tsx` en las plantillas con Vite), guarda y la página se recarga.

Direcciones útiles en una app nueva: `/api/hello` (una ruta de API), `/docs` (documentación de la API generada desde tus esquemas), `/health` y, si los elegiste, `/admin`, `/login` y `/_raiko/mail` (vista previa de emails).

**Abrir en el celular.** Usa la dirección Network con el celular en el mismo Wi-Fi.

**Usar otro puerto.** `PORT=4000 npm run dev` (Raiko Pages) o `npm run dev -- --port 4000` (plantillas con Vite).

**Puerto ocupado.** Verás `error[RK0706]: port 3000 is already in use`. Detén el otro servidor o usa otro puerto como arriba.

**Producción.** `npm run build` y luego `npm run start` sirven la misma app con `NODE_ENV=production`, en el puerto de `PORT` (3000 por defecto).

## El recorrido de 30 segundos

Una API con validación, tipos y documentación OpenAPI a partir de un solo esquema:

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

Una página es un server component asíncrono. Lee la base de datos y no envía nada de JavaScript a menos que lo pidas:

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

El cliente conoce cada ruta, parámetro, body y respuesta:

```ts
import { client } from 'raiko.js/client'
import type { App } from './server'

const api = client<App>('https://api.example.com')
const { data, error } = await api.post('/users', { body: { email: 'ana@raiko.dev', name: 'Ana' } })
//      ^ { id: number; email: string; name: string }    error.status is 422 with the exact field
```

## Contenido

- [Por qué Raiko](#por-qué-raiko)
- [Rutas y handlers](#rutas-y-handlers)
- [Validación](#validación)
- [Hooks del ciclo de vida](#hooks-del-ciclo-de-vida)
- [Estado, decoradores y plugins](#estado-decoradores-y-plugins)
- [Respuestas y streaming](#respuestas-y-streaming)
- [App router](#app-router)
- [Páginas protegidas](#páginas-protegidas)
- [Componentes](#componentes)
- [Cliente tipado y hooks](#cliente-tipado-y-hooks)
- [WebSockets](#websockets)
- [Auth y 2FA](#auth-y-2fa)
- [Panel de administración](#panel-de-administración)
- [Correo electrónico](#correo-electrónico)
- [Traducciones](#traducciones)
- [Plugins incluidos](#plugins-incluidos)
- [Errores que te dicen cómo arreglarlos](#errores-que-te-dicen-cómo-arreglarlos)
- [Cualquier frontend](#cualquier-frontend)
- [Despliegue](#despliegue)
- [Seguridad](#seguridad)
- [Benchmarks](#benchmarks)
- [Cómo se compara](#cómo-se-compara)
- [Problemas de Next.js que resuelve](#problemas-de-nextjs-que-resuelve)
- [Pruebas](#pruebas)

## Por qué Raiko

| | |
| --- | --- |
| **App router como en Next.js** | Archivos `page`, `layout`, `loading`, `error`, `not-found`, `forbidden`, `unauthorized`, `route` y `socket`, metadata, form actions e ISR. |
| **Server components sin React** | TSX asíncrono renderizado a un string o a un stream con `<Suspense>`. Cero JavaScript en el cliente por defecto. |
| **Interactividad sin build** | Pon `v-data` y `v-on:click` en tu TSX y Voodoo.js se agrega solo a esa página. |
| **Tipos del servidor al cliente** | Params, query, body y cada status de respuesta llegan a `client<App>()`. Sin generación de código. |
| **WebSockets en cualquier runtime** | Bun, Node (con su propia implementación de RFC 6455, sin dependencias), Deno y Workers, con salas y validación. |
| **Mensajes cifrados** | `encrypt: true` agrega intercambio de claves ECDH y AES-GCM, con una clave por dirección y protección contra replay. |
| **P2P** | Señalización WebRTC y un cliente mesh para data channels y medios. |
| **Auth** | OAuth con PKCE (GitHub, Google, Discord, GitLab, cualquier OAuth 2), credenciales con PBKDF2, 2FA con TOTP, sesiones JWT firmadas. |
| **Panel de administración** | CRUD, búsqueda, ordenamiento y paginación con permisos por rol y por acción, para Kastor, Prisma y Drizzle. |
| **Correo electrónico** | Plantillas en TSX con vista previa en vivo, enviadas por Resend, Postmark, SendGrid o SMTP. |
| **Errores al estilo Rust** | Cada error tiene un código, el archivo y la línea, el fragmento de código fuente y una línea `help:`. |
| **Rápido** | Rutas rápidas compiladas para cada ruta y el router nativo de Bun. Mira los [benchmarks](#benchmarks). |
| **Probado para romperse** | 107 tests, más de 3,4 millones de verificaciones de propiedades generadas, dos auditorías de seguridad, 11 plantillas probadas de punta a punta. |

## Rutas y handlers

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

El router es un árbol radix con un hash map al frente para las rutas estáticas, con backtracking para que gane la ruta más específica, y con `HEAD`, `OPTIONS` y `405` automáticos con el header `Allow`.

## Validación

`t` construye esquemas con inferencia completa, convierte los strings que llegan de params, query y formularios, y reporta la ruta exacta de cada problema:

```ts
import { t } from 'raiko.js'

const User = t.Object({
  email: t.String({ format: 'email' }),
  age: t.Optional(t.Integer({ minimum: 13 })),
  tags: t.Array(t.String(), { maxItems: 10 }),
  role: t.Enum(['user', 'admin']),
})
```

Zod, Valibot y ArkType también funcionan, gracias a Standard Schema: pásalos en cualquier lugar donde iría un esquema `t`.

Cuando la validación falla, la respuesta es un `422` con problem details según RFC 9457:

```json
{ "status": 422, "detail": "body.email: Expected a valid email", "errors": [{ "path": ["email"], "on": "body" }] }
```

## Hooks del ciclo de vida

`onRequest`, `onParse`, `onTransform`, `derive`, validación, `resolve`, `onBeforeHandle`, handler, `onAfterHandle`, `mapResponse`, `onAfterResponse` y `onError`. Un hook se aplica a las rutas registradas después de él. Pasa `'global'` para que también se aplique a la app que use tu plugin.

```ts
app
  .derive(({ headers }) => ({ token: headers.authorization?.slice(7) }))
  .onBeforeHandle(({ token }) => (token ? undefined : new Response('Unauthorized', { status: 401 })))
  .get('/me', ({ token }) => ({ token }))
```

## Estado, decoradores y plugins

```ts
const db = new Raiko({ name: 'db' }).decorate('db', createDb()).state('hits', 0)

const app = new Raiko()
  .use(db)                                 // deduplicated by name
  .get('/hits', ({ store }) => ++store.hits)
  .get('/users', ({ db }) => db.users.findMany())
```

## Respuestas y streaming

Devuelve lo que quieras: los objetos se convierten en JSON, los strings en texto, el JSX en HTML, los generadores en Server Sent Events, y `Blob`, `File`, `ReadableStream` y `Response` pasan tal cual. `status(201, body)` define el código y tipa el cliente según cada status.

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

Las páginas reciben `params` y `searchParams`, exportan `metadata` o `generateMetadata`, `revalidate` para el renderizado en caché y `actions` para formularios (`<Form action="like">` envía a `?/like`). Dentro de cualquier componente: `headers()`, `cookies()`, `usePathname()`, `useParams()`, `useSearchParams()`, `currentUser()`, `notFound()`, `redirect()`, `forbidden()`, `unauthorized()`.

`sitemap.xml` y `robots.txt` se generan a partir de tus páginas. En desarrollo, cada página tiene un overlay de errores, un badge de DevTools (ruta, params, tiempo de renderizado, caché) y un verificador de accesibilidad.

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

Los usuarios sin sesión van a `/login?callbackUrl=...` (o a tu `unauthorized.tsx`). Los usuarios sin el rol reciben `forbidden.tsx` con status 403.

## Componentes

`<Link>` con prefetch, `<Image>` con `srcset`, carga diferida y redimensionamiento con sharp cuando está instalado, `<Script>` con estrategias de carga, `<Head>`, `<JsonLd>`, `<SkipLink>` y `<Form>`.

```tsx
import { Image, Link, JsonLd } from 'raiko.js/components'

<Image src="/hero.png" alt="Product screenshot" width={1200} height={630} priority />
```

## Cliente tipado y hooks

```ts
const api = client<App>('', { retry: 2, timeout: 10_000, headers: () => ({ authorization: `Bearer ${token}` }) })
```

Hooks de React y Vue para queries, mutations y sockets:

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

El cliente del navegador se reconecta con backoff, encola los mensajes mientras no hay conexión y se encarga del intercambio de claves. Con `encrypt: true`, las claves se acuerdan con ECDH P-256, cada dirección obtiene su propia clave AES-GCM 256 derivada con HKDF y los nonces son contadores de frames, así que se rechazan los frames repetidos, reordenados o reflejados. Todo esto corre sobre TLS (`wss://`): mantiene el contenido de los mensajes fuera del alcance de proxies y logs, pero no del propio navegador del usuario.

P2P con WebRTC:

```ts
import { signaling } from 'raiko.js/p2p'
app.use(signaling({ path: '/p2p/:room' }))

// browser
import { joinRoom } from 'raiko.js/p2p/client'
const room = joinRoom(api.ws('/p2p/lobby'))
room.on('message', (from, data) => console.log(from, data))
room.send({ hi: true })
```

## Auth y 2FA

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

OAuth usa PKCE y un state firmado. Las contraseñas usan PBKDF2 SHA-256 con 210.000 iteraciones. TOTP funciona con Google Authenticator, Authy y 1Password, permite cinco intentos por inicio de sesión y rechaza un código ya usado. `generateTotpSecret()`, `totpUri()` y `recoveryCodes()` te ayudan a construir la pantalla de configuración.

## Panel de administración

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

Cada acción (`list`, `read`, `create`, `update`, `delete`) se verifica por separado, así que un rol de soporte puede corregir un usuario sin poder listarlo ni eliminarlo. `modelAdapter` funciona con Kastor y Prisma, y `drizzleAdapter` con Drizzle.

## Correo electrónico

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

Para cada correo se genera una versión en texto plano. Las plantillas también pueden devolver HTML de React Email, Vue o cualquier string.

## Traducciones

```ts
import { createI18n } from 'raiko.js/i18n'

const i18n = createI18n({ en, 'pt-BR': ptBR }, { fallback: 'en', cookie: 'locale' })
i18n.t('pt-BR', 'cart.items', { count: 3 })   // "3 itens", plurals with Intl.PluralRules
```

Las claves se tipan a partir de tu diccionario de respaldo. La detección del idioma lee el prefijo de la URL, una cookie y `Accept-Language`.

## Plugins incluidos

Desde `raiko.js/plugins`: `cors`, `secureHeaders`, `rateLimit`, `csrf`, `logger`, `requestId`, `compress`, `etag`, `responseCache`, `health`, `staticFiles` y `openapi` (OpenAPI 3.1 con una página de documentación en `/docs`).

## Errores que te dicen cómo arreglarlos

```
error[RK0104]: two routes use different param names at the same position
  --> app/blog/[slug]/page.tsx
   |
 3 |   app/blog/[id]/page.tsx
   |            ^^^^ already declared as [slug]
   |
   = help: rename the folder to [slug], or move one of the pages
```

Cada error con código (`RK0100` en adelante) tiene su página en la [referencia de errores](https://kwy404.github.io/Raiko.js/docs/errors.html).

## Cualquier frontend

Las Raiko Pages se renderizan en el servidor. Para una single page app, el plugin de Vite ejecuta el backend dentro del servidor de desarrollo de Vite, así React, Vue, Svelte, Solid o Preact comparten un solo puerto con la API:

```ts
// vite.config.ts
import react from '@vitejs/plugin-react'
import { raiko } from 'raiko.js/vite'

export default { plugins: [react(), raiko({ entry: './server/index.ts' })] }
```

Los builds de producción salen minificados y ofuscados, sin source maps. La ofuscación hace más lenta la lectura del código, pero no la impide: los secretos y las reglas se quedan en el servidor.

## Despliegue

| Destino | Cómo |
| --- | --- |
| Bun, Node, Deno | `app.listen(3000)`, o `raiko build` y luego `raiko start` |
| Varios núcleos | `app.listen(3000, { cluster: true })`: un proceso por núcleo en el mismo puerto |
| Vercel | `export default { fetch: app.fetch }` en `api/index.ts` (el instalador lo escribe) |
| Cloudflare Workers | `export default { fetch: app.fetch }`, `wrangler deploy` |
| Docker | el instalador escribe un `Dockerfile` multi stage que no corre como root |

`raiko deploy` elige el destino según tu proyecto.

## Seguridad

Valores por defecto que resisten ataques, cada uno respaldado por un test:

- El HTML se escapa en todas partes, y los nombres de atributos y etiquetas se validan.
- El parseo de query, cookies y formularios usa objetos con prototipo null (sin prototype pollution).
- Los archivos estáticos y el endpoint de imágenes rechazan path traversal.
- Las cookies se pueden firmar, y las firmas tienen una única codificación canónica.
- `cors({ credentials: true })` se niega a funcionar sin una lista explícita de orígenes.
- Las redirecciones después del inicio de sesión y de las form actions se quedan en tu sitio.
- Los límites de body se aplican a las subidas chunked y multipart.
- Los errores de validación de respuestas nunca envían datos del servidor al cliente.
- La caché nunca le sirve a un usuario la respuesta de otro.
- El rate limiter no confía en `X-Forwarded-For` a menos que se lo indiques.

Dos auditorías independientes encontraron 21 problemas antes de esta versión. Todos están corregidos, y cada uno tiene un test que reproduce el ataque. Reporta una vulnerabilidad a través de [SECURITY.md](SECURITY.md).

## Benchmarks

Requests por segundo, más es mejor. Las mismas tres rutas en cada framework, sobre Bun, por HTTP real con autocannon (64 conexiones, pipelining 4), mediana de tres rondas.

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

Notas honestas: la máquina tiene una sola vCPU, así que el generador de carga y el servidor la comparten y los números quedan comprimidos. En las rutas estáticas, Raiko y Elysia responden desde el router nativo de Bun sin ejecutar JavaScript, por lo que empatan en el techo. Ejecuta `bun bench/http.ts` en tu propio hardware.

## Cómo se compara

| | Raiko.js | Elysia | Next.js | Hono |
| --- | --- | --- | --- | --- |
| Runtimes | Bun, Node, Deno, Workers, Vercel | Bun primero | Node, Vercel | Todos |
| App router, layouts, loading, error | Sí | No | Sí | No |
| Server components | Sí, sin necesidad de React | No | Sí | Solo JSX |
| Cliente tipado | Sí | Sí (Eden) | Server actions | Sí (RPC) |
| WebSockets en cualquier runtime | Sí | Bun | No | Según el adaptador |
| Mensajes de WebSocket cifrados | Sí | No | No | No |
| Auth con OAuth y 2FA | Incluido | Plugins | NextAuth | Middleware |
| Panel de administración con permisos | Incluido | No | No | No |
| Plantillas de correo con vista previa | Incluido | No | No | No |
| Tamaño del ecosistema | Nuevo | En crecimiento | Enorme | Grande |

## Problemas de Next.js que resuelve

- **Un solo proceso para las páginas y la API.** Sin backend aparte, sin tipos duplicados.
- **No necesitas React en el servidor.** Las páginas son funciones asíncronas comunes que devuelven TSX.
- **WebSockets de verdad.** Next.js no tiene servidor de WebSockets, y Raiko tiene uno en cada runtime.
- **Caché predecible.** Solo se guardan en caché las páginas que exportan `revalidate`, nunca las requests personalizadas.
- **Funciona en cualquier lado.** La misma app se despliega en Bun, Node, Deno, Workers y Vercel sin un proyecto adaptador.
- **Errores con los que puedes hacer algo.** Errores con código y su solución, no un stack trace minificado.
- **Auth, administración y correo incluidos.** Lo que todo producto necesita no son librerías separadas que tengas que conectar.

## Pruebas

```ts
const res = await app.request('/users', { json: { email: 'a@b.co', name: 'Ana' } })
expect(res.status).toBe(201)
```

Sin servidor, sin puerto: `app.request()` y `app.fetch()` ejecutan el ciclo de vida completo en memoria.

## Más proyectos de kwy404

| Proyecto | Qué hace |
| --- | --- |
| [Voodoo.js](https://github.com/kwy404/Voodoo.js) | JSX en HTML plano sin paso de build, usado para la interactividad en Raiko Pages |
| [Monsoon](https://github.com/kwy404/monsoon) | CSS utility first sin paso de build, un tema a partir de un solo color |
| [glyphfox](https://github.com/kwy404/glyphfox) | Íconos transformables para cualquier framework |
| [Kastor](https://github.com/kwy404/kastor) | El ORM de TypeScript para casi cualquier base de datos |
| [a11ymedic](https://github.com/kwy404/a11ymedic) | Verificador de accesibilidad que explica cómo arreglar cada problema |
| [cookieowl](https://github.com/kwy404/cookieowl) | Consentimiento de cookies para LGPD y GDPR que de verdad bloquea los trackers |
| [installkite](https://github.com/kwy404/installkite) | Haz que cualquier sitio web sea instalable y funcione sin conexión |
| [edgegoat](https://github.com/kwy404/edgegoat) | Entradas de prueba para casos límite en JavaScript |

## Autor

Creado por **Alexandre Kohler** ([GitHub](https://github.com/kwy404)).

## Licencia

[MIT](LICENSE)
