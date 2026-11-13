// In process throughput: the framework's own fetch handler, no network. Same three routes everywhere.
import { Raiko } from '../src'
import { Elysia } from 'elysia'
import { Hono } from 'hono'

const raiko = new Raiko()
  .get('/', 'Hi')
  .get('/user/:id', ({ params }) => ({ id: params.id, name: 'Ana' }))
  .post('/json', ({ body }) => body)
const elysia = new Elysia()
  .get('/', 'Hi')
  .get('/user/:id', ({ params }) => ({ id: params.id, name: 'Ana' }))
  .post('/json', ({ body }) => body)
const hono = new Hono()
  .get('/', (c) => c.text('Hi'))
  .get('/user/:id', (c) => c.json({ id: c.req.param('id'), name: 'Ana' }))
  .post('/json', async (c) => c.json(await c.req.json()))

const apps: Record<string, (r: Request) => Response | Promise<Response>> = {
  'raiko.js': (r) => raiko.fetch(r),
  elysia: (r) => elysia.handle(r),
  hono: (r) => hono.fetch(r),
}
const cases: [string, () => Request][] = [
  ['text', () => new Request('http://localhost/')],
  ['params + json', () => new Request('http://localhost/user/42')],
  ['json body', () => new Request('http://localhost/json', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"hello":"world","n":[1,2,3]}' })],
]

const N = Number(process.env.N ?? 200_000)
const results: Record<string, Record<string, number>> = {}
for (const [name, make] of cases) {
  results[name] = {}
  for (const [fw, handle] of Object.entries(apps)) {
    // sanity: every framework must answer correctly
    const check = await handle(make())
    if (check.status !== 200) throw new Error(`${fw} ${name} -> ${check.status}`)
    await check.arrayBuffer()
    for (let i = 0; i < 20_000; i++) await (await handle(make())).arrayBuffer()
    const runs: number[] = []
    for (let r = 0; r < 3; r++) {
      const t0 = performance.now()
      for (let i = 0; i < N; i++) await (await handle(make())).arrayBuffer()
      runs.push(N / ((performance.now() - t0) / 1000))
    }
    results[name][fw] = Math.round(runs.sort((a, b) => a - b)[1]!)
  }
}
console.log(JSON.stringify({ runtime: `bun ${Bun.version}`, cpu: navigator.hardwareConcurrency, n: N, results }, null, 2))
