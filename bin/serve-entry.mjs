// Started by `raiko dev` and `raiko start`: imports the app entry and makes sure it is listening,
// then prints where to open it. Works whether or not the entry calls listen() itself.
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { networkInterfaces } from 'node:os'
import { readFileSync } from 'node:fs'

const t0 = performance.now()
const [file, mode = 'dev'] = process.argv.slice(2)
const port = Number(process.env.PORT ?? 3000)
const tty = process.stdout.isTTY
const c = (n, s) => (tty ? `\x1b[${n}m${s}\x1b[0m` : s)

process.env.RAIKO_RUNNER = '1'
const mod = await import(pathToFileURL(resolve(file)).href)
const app = mod.default ?? mod.app
let url = globalThis.__raikoListening
if (!url) {
  if (!app || typeof app.listen !== 'function') {
    console.error(`\n  ${c(31, 'error[RK0705]')}: ${file} does not export the app\n  = help: end the file with \`export default app\`\n`)
    process.exit(1)
  }
  try {
    url = (await app.listen(port)).url
  } catch (e) {
    if (e && (e.code === 'EADDRINUSE' || /in use|EADDRINUSE/i.test(String(e.message)))) {
      console.error(`\n  ${c(31, 'error[RK0706]')}: port ${port} is already in use\n  = help: stop the other server, or run with PORT=${port + 1}\n`)
      process.exit(1)
    }
    throw e
  }
}
let version = ''
try {
  version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
} catch {}
const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address

console.log(`
  ${c(33, 'raiko.js')} ${version} ${c(2, mode)}

  - Local:    ${c(36, url.replace('0.0.0.0', 'localhost'))}${lan ? `\n  - Network:  ${c(36, `http://${lan}:${new URL(url).port}`)}` : ''}

  ${c(32, 'ready')} in ${Math.round(performance.now() - t0)} ms${mode === 'dev' ? c(2, '  (save a file to reload)') : ''}
`)
