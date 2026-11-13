// Opens a generated app in Chromium: no page errors, the counter reacts, the status line is filled.
import { chromium } from 'playwright'
const [url] = process.argv.slice(2)
const b = await chromium.launch()
const p = await b.newPage()
const errors = []
const consoleErrors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 300)))
await p.goto(url, { waitUntil: 'load', timeout: 30000 })
// frameworks boot at different speeds: wait for the counter instead of a fixed time
await p.waitForSelector('.rk-try button', { timeout: 15000 }).catch(() => {})
const btn = p.locator('.rk-try button')
const before = (await btn.count()) ? await btn.textContent() : null
if (before) {
  await btn.click()
  await btn.click()
  await p.waitForTimeout(400)
}
const after = before ? await btn.textContent() : null
await p.waitForFunction(() => !/Checking/.test(document.querySelector('.rk-status')?.textContent ?? 'Checking'), null, { timeout: 10000 }).catch(() => {})
const status = await p.evaluate(() => document.querySelector('.rk-status')?.textContent ?? null)
const body = await p.evaluate(() => document.body.innerHTML.slice(0, 400))
await b.close()
console.log(JSON.stringify({ before, after, status, errors, consoleErrors, body: before ? undefined : body }))
