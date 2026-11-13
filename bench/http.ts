// Real HTTP benchmark: each framework serves the same routes on Bun, autocannon hits them over TCP.
// Frameworks run one at a time; each route gets a warmup then a measured run. Median of rounds.
import { spawn } from 'node:child_process'

const FRAMEWORKS = ['raiko.js', 'elysia', 'hono']
const ALL_ROUTES: [string, string, Record<string, unknown>][] = [
  ['text', '/', {}],
  ['params + json', '/user/42', {}],
  ['json body', '/json', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"hello":"world","n":[1,2,3]}' }],
]
const ROUTES = ALL_ROUTES.filter(([n]) => !process.env.ONLY || n === process.env.ONLY)
const ROUNDS = Number(process.env.ROUNDS ?? 3)
const SECONDS = Number(process.env.SECONDS ?? 6)

const server = (fw: string, port: number) =>
  spawn(process.execPath, ['bench/server.ts', fw, String(port)], { stdio: ['ignore', 'pipe', 'inherit'] })

async function ready(port: number) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return
    } catch {}
    await Bun.sleep(100)
  }
  throw new Error('server did not start')
}

function cannon(url: string, opts: Record<string, unknown>, seconds: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = ['bench/node_modules/autocannon/autocannon.js', '-j', '-c', '64', '-p', '4', '-d', String(seconds)]
    if (opts.method) args.push('-m', String(opts.method))
    for (const [k, v] of Object.entries((opts.headers as Record<string, string>) ?? {})) args.push('-H', `${k}=${v}`)
    if (opts.body) args.push('-b', String(opts.body))
    args.push(url)
    const p = spawn('node', args, { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.on('close', () => {
      try {
        const j = JSON.parse(out)
        if (j.non2xx) return reject(new Error(`${url}: ${j.non2xx} non 2xx responses`))
        resolve(j.requests.average)
      } catch (e) {
        reject(e)
      }
    })
  })
}

const results: Record<string, Record<string, number[]>> = {}
for (let round = 0; round < ROUNDS; round++) {
  for (const fw of FRAMEWORKS) {
    const port = 4100 + round * 10 + FRAMEWORKS.indexOf(fw)
    const s = server(fw, port)
    await ready(port)
    for (const [name, path, opts] of ROUTES) {
      await cannon(`http://127.0.0.1:${port}${path}`, opts, 2)
      const rps = await cannon(`http://127.0.0.1:${port}${path}`, opts, SECONDS)
      ;((results[name] ??= {})[fw] ??= []).push(Math.round(rps))
      console.error(`round ${round + 1} ${fw.padEnd(9)} ${name.padEnd(14)} ${Math.round(rps)} req/s`)
    }
    s.kill()
    await Bun.sleep(300)
  }
}
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!
const out = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([f, a]) => [f, median(a)]))]))
console.log(JSON.stringify({ kind: 'http', runtime: `bun ${Bun.version}`, client: 'autocannon -c 64 -p 4', rounds: ROUNDS, seconds: SECONDS, results: out }, null, 2))
