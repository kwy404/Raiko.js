// Filled from bench/results.json by `bun run bench`. Rendered as plain DOM (the container has v-pre).
window.RK_BENCH = {"machine":"AMD EPYC 9J45, 1 vCPU, 1.9 GB RAM, Linux 6.8, Bun 1.4.4, Node 22.23. autocannon -c 64 -p 4, median of 3 rounds.","groups":[{"title":"Server rendered page (50 items)","rows":[["Raiko.js (Bun)",8910,"req/s"],["Raiko.js (Node)",3737,"req/s"],["Next.js 15 (Node)",155,"req/s"]]},{"title":"HTTP: text","rows":[["Raiko.js",99040,"req/s"],["Elysia 1.4",83192,"req/s"],["Hono 4.13",63920,"req/s"]]},{"title":"HTTP: params + json","rows":[["Raiko.js",66943,"req/s"],["Elysia 1.4",75723,"req/s"],["Hono 4.13",60477,"req/s"]]},{"title":"HTTP: json body","rows":[["Raiko.js",51136,"req/s"],["Elysia 1.4",53168,"req/s"],["Hono 4.13",47029,"req/s"]]}]}
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('bars')
  if (!root) return
  for (const g of window.RK_BENCH.groups) {
    const max = Math.max(...g.rows.map((r) => r[1]))
    const card = document.createElement('div')
    card.className = 'bar-card'
    const h = document.createElement('h3')
    h.textContent = g.title
    card.appendChild(h)
    for (const [name, value, unit] of g.rows.slice().sort((a, b) => b[1] - a[1])) {
      const row = document.createElement('div')
      row.className = 'bar' + (name === 'Raiko.js' ? ' me' : '')
      const label = document.createElement('b')
      label.textContent = name
      const track = document.createElement('div')
      track.className = 'track'
      const fill = document.createElement('div')
      fill.className = 'fill'
      fill.style.width = Math.max(2, (value / max) * 100) + '%'
      track.appendChild(fill)
      const v = document.createElement('span')
      v.className = 'v'
      v.textContent = value >= 1e6 ? (value / 1e6).toFixed(2) + 'M' : value >= 1e3 ? Math.round(value / 1e3) + 'k' : String(value)
      v.title = `${value.toLocaleString()} ${unit || 'req/s'}`
      row.append(label, track, v)
      card.appendChild(row)
    }
    root.appendChild(card)
  }
  const note = document.createElement('p')
  note.className = 'note'
  note.textContent = window.RK_BENCH.machine
  root.after(note)
})
