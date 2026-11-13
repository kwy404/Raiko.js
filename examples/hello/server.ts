// The example behind `bun run dev` in this repository: a page, an API route and a WebSocket.
import { Raiko, isMain } from '../../src'
import { appRouter } from '../../src/app-router'
import { logger } from '../../src/plugins'

const app = new Raiko()
  .use(logger())
  .use(await appRouter({ dir: new URL('./app', import.meta.url).pathname }))

export default app

if (isMain(import.meta.url)) {
  const s = await app.listen(Number(process.env.PORT ?? 3000))
  console.log(`\n  ready on ${s.url}\n  page   ${s.url}/\n  api    ${s.url}/api/time\n  socket ${s.url.replace('http', 'ws')}/chat\n`)
}
