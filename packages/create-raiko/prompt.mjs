// Tiny interactive prompts with arrow keys, no dependencies.
import readline from 'node:readline'

const tty = process.stdin.isTTY && process.stdout.isTTY
const esc = (n) => `\x1b[${n}m`
export const col = { y: (s) => `${esc(33)}${s}${esc(0)}`, d: (s) => `${esc(2)}${s}${esc(0)}`, g: (s) => `${esc(32)}${s}${esc(0)}`, b: (s) => `${esc(1)}${s}${esc(0)}`, r: (s) => `${esc(31)}${s}${esc(0)}`, c: (s) => `${esc(36)}${s}${esc(0)}` }

function keys(onKey) {
  readline.emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  const h = (_, k) => {
    if (k?.ctrl && k.name === 'c') {
      process.stdout.write('\x1b[?25h\n')
      process.exit(130)
    }
    onKey(k ?? {})
  }
  process.stdin.on('keypress', h)
  return () => {
    process.stdin.off('keypress', h)
    process.stdin.setRawMode(false)
    process.stdin.pause()
  }
}

/** Single choice. options: [{ value, label, hint }] */
export function select(question, options, initial = 0) {
  if (!tty) return Promise.resolve(options[initial].value)
  return new Promise((resolve) => {
    let i = initial
    const draw = (first) => {
      if (!first) process.stdout.write(`\x1b[${options.length}A`)
      for (const [n, o] of options.entries())
        process.stdout.write(`\x1b[2K  ${n === i ? col.y('>') : ' '} ${n === i ? col.b(o.label) : o.label}${o.hint ? '  ' + col.d(o.hint) : ''}\n`)
    }
    process.stdout.write(`\x1b[?25l${col.c('?')} ${col.b(question)} ${col.d('(arrows, enter)')}\n`)
    draw(true)
    const stop = keys((k) => {
      if (k.name === 'up') i = (i - 1 + options.length) % options.length
      else if (k.name === 'down' || k.name === 'tab') i = (i + 1) % options.length
      else if (k.name === 'return') {
        stop()
        process.stdout.write(`\x1b[${options.length + 1}A\x1b[0J${col.g('+')} ${question} ${col.y(options[i].label)}\n\x1b[?25h`)
        return resolve(options[i].value)
      } else return
      draw(false)
    })
  })
}

/** Multiple choice with space. */
export function multiselect(question, options, initial = []) {
  if (!tty) return Promise.resolve(initial)
  return new Promise((resolve) => {
    let i = 0
    const on = new Set(initial)
    const draw = (first) => {
      if (!first) process.stdout.write(`\x1b[${options.length}A`)
      for (const [n, o] of options.entries())
        process.stdout.write(`\x1b[2K  ${n === i ? col.y('>') : ' '} ${on.has(o.value) ? col.g('[x]') : col.d('[ ]')} ${o.label}${o.hint ? '  ' + col.d(o.hint) : ''}\n`)
    }
    process.stdout.write(`\x1b[?25l${col.c('?')} ${col.b(question)} ${col.d('(space to toggle, enter)')}\n`)
    draw(true)
    const stop = keys((k) => {
      if (k.name === 'up') i = (i - 1 + options.length) % options.length
      else if (k.name === 'down') i = (i + 1) % options.length
      else if (k.name === 'space') on.has(options[i].value) ? on.delete(options[i].value) : on.add(options[i].value)
      else if (k.name === 'return') {
        stop()
        const picked = options.filter((o) => on.has(o.value))
        process.stdout.write(`\x1b[${options.length + 1}A\x1b[0J${col.g('+')} ${question} ${col.y(picked.map((o) => o.label).join(', ') || 'none')}\n\x1b[?25h`)
        return resolve(picked.map((o) => o.value))
      } else return
      draw(false)
    })
  })
}

export function text(question, initial = '') {
  if (!tty) return Promise.resolve(initial)
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(`${col.c('?')} ${col.b(question)} ${col.d(`(${initial})`)} `, (a) => {
      rl.close()
      resolve(a.trim() || initial)
    })
  })
}

export const confirm = (question, initial = true) =>
  select(question, initial ? [{ value: true, label: 'Yes' }, { value: false, label: 'No' }] : [{ value: false, label: 'No' }, { value: true, label: 'Yes' }])

/** Little animated mascot while something runs. */
export async function spin(label, fn) {
  if (!tty) return fn()
  const frames = ['(=^.^=)  ', '(=^.^=)~ ', '(=^-^=)~~', '(=^.^=) ~']
  let n = 0
  const t = setInterval(() => process.stdout.write(`\r\x1b[2K  ${col.y(frames[n++ % frames.length])} ${label}`), 120)
  try {
    const r = await fn()
    clearInterval(t)
    process.stdout.write(`\r\x1b[2K  ${col.g('ok')} ${label}\n`)
    return r
  } catch (e) {
    clearInterval(t)
    process.stdout.write(`\r\x1b[2K  ${col.r('failed')} ${label}\n`)
    throw e
  }
}
