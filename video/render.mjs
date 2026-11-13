import { chromium } from 'playwright'
import fs from 'fs'
const FPS = 30, DUR = 42.5, F = Math.round(FPS * DUR)
fs.mkdirSync('/v/frames', { recursive: true })
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } })
p.on('pageerror', (e) => console.log('ERR', e.message))
await p.goto('file:///v/scene.html', { waitUntil: 'load' })
await p.evaluate(() => window.ready)
const stage = await p.$('#stage')
const t0 = Date.now()
for (let i = 0; i < F; i++) {
  const f = `/v/frames/f${String(i).padStart(4, '0')}.jpg`
  if (fs.existsSync(f)) continue
  await p.evaluate((t) => window.render(t), i / FPS)
  await stage.screenshot({ path: f, type: 'jpeg', quality: 90 })
  if (i % 150 === 0) console.log(i, Math.round((Date.now() - t0) / 1000) + 's')
}
await b.close()
console.log('frames ok')
