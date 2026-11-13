# create-raiko

Create a [Raiko.js](https://kwy404.github.io/Raiko.js/) app.

```bash
npx create-raiko@latest my-app
# or
bun create raiko my-app
# or
pnpm create raiko my-app
```

It asks for the frontend (Raiko Pages with Voodoo.js, React, Vue, Svelte, Solid, Preact, Angular), CSS (Monsoon, Tailwind, StyleX, UnoCSS), icons (glyphfox, Lucide, Heroicons), animations (Motion), database (Kastor, Prisma, Drizzle on SQLite or PostgreSQL), sign in (email and password, GitHub, Google, Discord, GitLab), two factor auth, email (Resend, Postmark, SendGrid, SMTP), translations (en, pt-BR, es, fr, de), admin roles with permissions per action, a cookie banner (cookieowl, LGPD or GDPR), an installable app (installkite) and the deploy target (Vercel, Cloudflare Workers, Docker, plain server).

Every answer is also a flag, for scripts and CI:

```bash
npx create-raiko@latest my-app --yes --frontend react --css tailwind --orm kastor --db sqlite \
  --auth credentials,github --twofa true --admin true --roles editor --deploy vercel
```

A random `AUTH_SECRET` is written to `.env` (never to code). MIT License.
