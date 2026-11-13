# Changelog

## 1.0.4

- Fixed: interactive Voodoo.js content inside a page that streams (a `loading.tsx` above it) never got the Voodoo script, so `v-data` blocks stayed static and showed their raw text. The script is now added at the end of the stream when the streamed content needs it.
- Every starter page has a counter that proves the page is interactive, written the way each framework does it: Voodoo.js in Raiko Pages, state in React, Preact, Vue and Svelte, signals in Solid.
- The template test suite now opens each generated app in a real browser, clicks the counter and checks that the backend answers.
- The Angular template is paused (the installer explains it) until its starter page renders in the browser test.

## 1.0.3

- Fixed: with a routes manifest (the default in generated apps), files in `public/` were not served, so stylesheets, the favicon and page scripts returned 404. `public/` is now served whenever it exists.
- New starter page in every template (Raiko Pages, React, Vue, Svelte, Solid, Preact, Angular): the file to edit, deploy and docs buttons, links to the API, docs, admin and email previews you picked, and a live check that the backend answers.
- Installer: Esc, Backspace or the left arrow goes back to the previous question with your answers kept; choices no longer redraw in the wrong place on narrow terminals; a key legend under each question.
- Docs: a getting started section with the address to open (3000 for Raiko Pages, 5173 for Vite frontends), how to change the port, open it on a phone, and what to do when the port is busy.

## 1.0.2

- `raiko dev` and `raiko start` start the server themselves and print where to open it (Local and Network URLs), so a project whose entry never called `listen()` no longer sits silent. A busy port fails with error RK0706 and the port to try.
- `isMain()` compares paths the same way on Windows, macOS and Linux.
- The CLI runs Vite, tsx, esbuild, Vercel and Wrangler through `bunx` when Bun is installed, so projects work on machines without Node. Arguments like `--port 5174` reach Vite with their values.
- `bun run dev` in this repository starts an example app.
- Website: language menu, toasts and tooltips from Monsoon, no sideways scroll at any width, 44 px touch targets, working mobile menu.

## 1.0.1

- Client: `RaikoClientSocket` accepts a `WebSocket` implementation, so the client works on Node 20 with the ws package (the server never needed one).
- App router: layouts without a `<head>` now get the page title and meta tags.
- Performance: the client IP and the URL path are read only when a handler uses them; JSON responses go through the runtime's native `Response.json`.
- Benchmarks: competitors live in `bench/package.json`, so the package has no dependency on them.
- Website: new design.

## 1.0.0

First release.

- Core: radix router with a static fast path, typed context, lifecycle hooks with local and global scope, plugins, groups, mount, `t` schemas with coercion and Standard Schema support, RFC 9457 errors.
- Responses: JSON, text, TSX, SSE from generators, streams, files, `status()` typed per code.
- App router: page, layout, loading, error, not-found, forbidden, unauthorized, route and socket files; metadata, actions, revalidate, middleware, locales, protected pages, sitemap and robots, dev overlay and DevTools.
- Components: Link, Image, Script, Head, JsonLd, SkipLink, Form.
- WebSockets on Bun, Node (own RFC 6455), Deno and Workers; rooms; validation; ECDH and AES-GCM encryption with replay protection; WebRTC P2P.
- Auth: OAuth with PKCE, credentials with PBKDF2, TOTP 2FA, JWT sessions.
- Admin panel with permissions per role and action, adapters for Kastor, Prisma and Drizzle.
- Email with TSX templates, preview, and Resend, Postmark, SendGrid and SMTP transports.
- i18n with typed keys and plurals.
- Plugins: cors, secureHeaders, rateLimit, csrf, logger, requestId, compress, etag, responseCache, health, staticFiles, openapi.
- Typed client, React and Vue hooks, Vite plugin, `raiko` CLI, `create-raiko` with 11 tested templates.
- Performance: compiled fast paths per route, context free constant routes, Bun native routes, cluster mode.
