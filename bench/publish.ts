// Writes measured numbers into site/bench.js and between the bench markers of every README.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const http = JSON.parse(readFileSync('bench/http-results.json', 'utf8'))
const ssr = existsSync('bench/ssr-results.json') ? JSON.parse(readFileSync('bench/ssr-results.json', 'utf8')) : null
const machine = 'AMD EPYC 9J45, 1 vCPU, 1.9 GB RAM, Linux 6.8, Bun 1.4.4, Node 22.23. autocannon -c 64 -p 4, median of 3 rounds.'
const NAMES: Record<string, string> = { 'raiko.js': 'Raiko.js', elysia: 'Elysia 1.4', hono: 'Hono 4.13', next: 'Next.js 15 (Node)', raiko: 'Raiko.js (Bun)', 'raiko-node': 'Raiko.js (Node)' }

const groups = Object.entries(http.results as Record<string, Record<string, number>>).map(([title, r]) => ({
  title: `HTTP: ${title}`,
  rows: Object.entries(r).map(([k, v]) => [NAMES[k] ?? k, v, 'req/s']),
}))
if (ssr) groups.unshift({ title: 'Server rendered page (50 items)', rows: Object.entries(ssr.results as Record<string, number>).map(([k, v]) => [NAMES[k] ?? k, v, 'req/s']) })
if (existsSync('site/bench.js')) writeFileSync('site/bench.js', readFileSync('site/bench.js', 'utf8').replace(/^window\.RK_BENCH = .*$/m, `window.RK_BENCH = ${JSON.stringify({ machine, groups })}`))

const fmt = (n: number) => n.toLocaleString('en-US')
let table = ''
if (ssr) {
  table += `| Server rendered page | ${Object.keys(ssr.results).map((k) => NAMES[k] ?? k).join(' | ')} |\n| --- | ${Object.keys(ssr.results).map(() => '---:').join(' | ')} |\n| req/s | ${Object.values(ssr.results as Record<string, number>).map(fmt).join(' | ')} |\n\n`
}
const fws = Object.keys(Object.values(http.results)[0] as object)
table += `| Route | ${fws.map((f) => NAMES[f] ?? f).join(' | ')} |\n| --- | ${fws.map(() => '---:').join(' | ')} |\n`
for (const [route, r] of Object.entries(http.results as Record<string, Record<string, number>>)) table += `| ${route} | ${fws.map((f) => fmt(r[f]!)).join(' | ')} |\n`
table += `\n${machine}\n`
for (const f of ['README.md', 'README.pt-BR.md', 'README.es.md']) {
  if (!existsSync(f)) continue
  const s = readFileSync(f, 'utf8').replace(/(<!-- bench:start -->)[\s\S]*?(<!-- bench:end -->)/, `$1\n${table}$2`)
  writeFileSync(f, s)
}
console.log(table)
