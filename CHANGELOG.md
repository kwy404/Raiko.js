# Changelog

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
