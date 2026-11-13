// Same server rendered page (async data, 50 items, layout with metadata) in Next.js 15 (next start) and Raiko Pages.
import { spawn } from 'node:child_process'

const SECONDS = Number(process.env.SECONDS ?? 6)
const ROUNDS = Number(process.env.ROUNDS ?? 3)
const servers: Record<string, () => ReturnType<typeof spawn>> = {
  next: () => spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', '4300', '-H', '127.0.0.1'], { cwd: 'bench/ssr/next', stdio: 'ignore', env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' } }),
  raiko: () => spawn(process.execPath, ['bench/ssr/raiko/server.ts'], { stdio: 'ignore', env: { ...process.env, NODE_ENV: 'production' } }),
}
const ports: Record<string, number> = { next: 4300, raiko: 4301 }

async function ready(port: number) {
  for (let i = 0; i < 200; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`)
      const html = await r.text()
      if (r.ok && html.includes('Item 49')) return
    } catch {}
    await Bun.sleep(150)
  }
  throw new Error(`server on ${port} did not render the page`)
}
const cannon = (url: string, s: number) =>
  new Promise<number>((resolve, reject) => {
    const p = spawn('node', ['bench/node_modules/autocannon/autocannon.js', '-j', '-c', '32', '-d', String(s), url], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.on('close', () => {
      try {
        const j = JSON.parse(out)
        if (j.non2xx) return reject(new Error(`${j.non2xx} non 2xx`))
        resolve(Math.round(j.requests.average))
      } catch (e) {
        reject(e)
      }
    })
  })

const runs: Record<string, number[]> = {}
for (let r = 0; r < ROUNDS; r++) {
  for (const name of Object.keys(servers)) {
    const proc = servers[name]!()
    await ready(ports[name]!)
    await cannon(`http://127.0.0.1:${ports[name]}/`, 2)
    const v = await cannon(`http://127.0.0.1:${ports[name]}/`, SECONDS)
    ;(runs[name] ??= []).push(v)
    console.error(`round ${r + 1} ${name} ${v} req/s`)
    proc.kill()
    await Bun.sleep(500)
  }
}
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!
console.log(JSON.stringify({ kind: 'ssr', results: { raiko: median(runs.raiko!), next: median(runs.next!) } }, null, 2))
