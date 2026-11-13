window.POST = {
  pt: `Eu usava 6 ferramentas para fazer 1 app: Next.js no frontend, Express ou Elysia na API, NextAuth para login, Socket.io para tempo real, um painel admin à parte e o Nodemailer para e-mail.

Dois deploys, tipos duplicados, WebSocket que só funcionava bem num runtime e autenticação montada à mão em todo projeto.

Então eu criei o Raiko.js, um framework TypeScript open source em que backend e frontend vivem na mesma árvore de arquivos:

- App router no estilo Next.js, com server components que não mandam JavaScript por padrão
- API tipada de ponta a ponta, com um cliente que conhece cada rota
- WebSocket com criptografia AES-GCM em Bun, Node, Deno e Cloudflare
- Login com OAuth e 2FA, painel admin com permissão por ação e e-mails em TSX
- Erros no estilo Rust: código, arquivo, linha e como corrigir

Medi com honestidade: a mesma página renderizada no servidor foi 24 vezes mais rápida que no Next.js 15, rodando os dois no mesmo Node. Contra o Elysia, na API pura, ele ganha numa rota, empata em outra e perde na terceira. Está tudo publicado, com o código do benchmark para qualquer um rodar.

Antes de lançar, rodei mais de 3,4 milhões de verificações automáticas e duas auditorias de segurança. Elas encontraram 21 falhas, e as 21 foram corrigidas antes do lançamento.

Para começar:
npx create-raiko@latest meu-app

Site e documentação: https://kwy404.github.io/Raiko.js/
Código: https://github.com/kwy404/Raiko.js
npm: https://www.npmjs.com/package/raiko.js

Qual das 6 ferramentas você trocaria primeiro?

#typescript #javascript #opensource #webdev #nodejs #bun`,
  en: `I used 6 tools to build 1 app: Next.js on the frontend, Express or Elysia for the API, NextAuth for sign in, Socket.io for real time, a separate admin panel and Nodemailer for email.

Two deploys, duplicated types, WebSockets that only worked well on one runtime, and auth wired by hand in every project.

So I built Raiko.js, an open source TypeScript framework where backend and frontend live in one file tree:

- A Next.js style app router, with server components that ship no JavaScript by default
- An API typed end to end, with a client that knows every route
- WebSockets with AES-GCM encryption on Bun, Node, Deno and Cloudflare
- OAuth and 2FA sign in, an admin panel with permissions per action, and emails in TSX
- Errors like Rust: a code, the file, the line and how to fix it

I measured it honestly: the same server rendered page was 24 times faster than Next.js 15, with both running on the same Node. Against Elysia on raw API routes, it wins one, ties one and loses one. Everything is published, with the benchmark code so anyone can run it.

Before launch I ran over 3.4 million automated checks and two security audits. They found 21 issues, and all 21 were fixed before release.

Get started:
npx create-raiko@latest my-app

Website and docs: https://kwy404.github.io/Raiko.js/
Code: https://github.com/kwy404/Raiko.js
npm: https://www.npmjs.com/package/raiko.js

Which of the 6 tools would you replace first?

#typescript #javascript #opensource #webdev #nodejs #bun`,
}
