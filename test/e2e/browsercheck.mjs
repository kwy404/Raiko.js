// Opens a generated app in Chromium: no page errors, the counter reacts, the status line is filled.
import { chromium } from 'playwright'
const [url] = process.argv.slice(2)
const b = await chromium.launch()
const p = await b.newPage()
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
await p.goto(url, { waitUntil: 'load', timeout: 30000 })
await p.waitForTimeout(2500)
const btn = p.locator('.rk-try button')
const before = (await btn.count()) ? await btn.textContent() : null
if (before) {
  await btn.click()
  await btn.click()
  await p.waitForTimeout(400)
}
const after = before ? await btn.textContent() : null
const status = await p.evaluate(() => document.querySelector('.rk-status')?.textContent ?? null)
await b.close()
console.log(JSON.stringify({ before, after, status, errors }))
