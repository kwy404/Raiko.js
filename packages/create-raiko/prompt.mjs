// Interactive prompts with arrow keys, no dependencies.
// Every prompt resolves to its value, or to BACK when the person presses Esc, Backspace or the left arrow.
import readline from 'node:readline'

export const BACK = Symbol('back')
const tty = !!(process.stdin.isTTY && process.stdout.isTTY)
const esc = (n) => (s) => (tty ? `\x1b[${n}m${s}\x1b[0m` : s)
export const col = { y: esc(33), d: esc(2), g: esc(32), b: esc(1), r: esc(31), c: esc(36) }

const visible = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')
/** Cut a line to the terminal width so it never wraps: a wrapped line would break the redraw. */
function fit(s) {
  const width = Math.max(20, (process.stdout.columns || 80) - 1)
  if (visible(s).length <= width) return s
  let out = ''
  let n = 0
  for (const part of s.split(/(\x1b\[[0-9;]*m)/)) {
    if (part.startsWith('\x1b[')) {
      out += part
      continue
    }
    for (const ch of part) {
      if (n >= width - 1) return out + '\x1b[0m' + (tty ? '…' : '...')
      out += ch
      n++
    }
  }
  return out
}

/** Draw a block of lines in place: move up over the previous block, clear it, write the new one. */
function painter() {
  let last = 0
  return {
    draw(lines) {
      let out = ''
      if (last) out += `\x1b[${last}A\r`
      out += '\x1b[0J' + lines.map(fit).join('\n') + '\n'
      process.stdout.write(out)
      last = lines.length
    },
    clear() {
      if (last) process.stdout.write(`\x1b[${last}A\r\x1b[0J`)
      last = 0
    },
  }
}

function keys(onKey) {
  readline.emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  const h = (str, k = {}) => {
    if (k.ctrl && k.name === 'c') {
      process.stdout.write('\x1b[?25h\n')
      process.exit(130)
    }
    onKey(k, str)
  }
  process.stdin.on('keypress', h)
  process.stdout.write('\x1b[?25l')
  return () => {
    process.stdin.off('keypress', h)
    process.stdin.setRawMode(false)
    process.stdin.pause()
    process.stdout.write('\x1b[?25h')
  }
}

const isBack = (k) => k.name === 'escape' || k.name === 'left' || k.name === 'backspace'
const legend = (multi, canBack) =>
  col.d(`  ${multi ? 'space to mark, ' : ''}arrows to move, enter to ${multi ? 'confirm' : 'choose'}${canBack ? ', esc to go back' : ''}`)
const done = (question, answer) => fit(`${col.g("+")} ${question} ${col.y(answer)}`)

/** Single choice. options: [{ value, label, hint }]. `initial` is a value or an index. */
export function select(question, options, initial = 0, canBack = true) {
  let i = typeof initial === 'number' ? initial : Math.max(0, options.findIndex((o) => o.value === initial))
  if (!tty) return Promise.resolve(options[i].value)
  return new Promise((resolve) => {
    const p = painter()
    const render = () =>
      p.draw([
        `${col.c('?')} ${col.b(question)}`,
        ...options.map((o, n) => `  ${n === i ? col.y('>') : ' '} ${n === i ? col.b(o.label) : o.label}${o.hint ? '  ' + col.d(o.hint) : ''}`),
        legend(false, canBack),
      ])
    render()
    const stop = keys((k, str) => {
      if (k.name === 'up' || k.name === 'k') i = (i - 1 + options.length) % options.length
      else if (k.name === 'down' || k.name === 'j' || k.name === 'tab') i = (i + 1) % options.length
      else if (str && /^[1-9]$/.test(str) && Number(str) <= options.length) i = Number(str) - 1
      else if (k.name === 'return' || k.name === 'enter' || k.name === 'right') {
        stop()
        p.clear()
        process.stdout.write(done(question, options[i].label) + '\n')
        return resolve(options[i].value)
      } else if (canBack && isBack(k)) {
        stop()
        p.clear()
        return resolve(BACK)
      } else return
      render()
    })
  })
}

/** Multiple choice: space marks, enter confirms. */
export function multiselect(question, options, initial = [], canBack = true) {
  const on = new Set(initial)
  if (!tty) return Promise.resolve([...on])
  return new Promise((resolve) => {
    let i = 0
    const p = painter()
    const render = () =>
      p.draw([
        `${col.c('?')} ${col.b(question)}`,
        ...options.map((o, n) => `  ${n === i ? col.y('>') : ' '} ${on.has(o.value) ? col.g('[x]') : col.d('[ ]')} ${n === i ? col.b(o.label) : o.label}${o.hint ? '  ' + col.d(o.hint) : ''}`),
        legend(true, canBack),
      ])
    render()
    const stop = keys((k, str) => {
      const o = options[i]
      if (k.name === 'up' || k.name === 'k') i = (i - 1 + options.length) % options.length
      else if (k.name === 'down' || k.name === 'j' || k.name === 'tab') i = (i + 1) % options.length
      else if (k.name === 'space' || str === 'x') on.has(o.value) ? on.delete(o.value) : on.add(o.value)
      else if (str === 'a') options.every((x) => on.has(x.value)) ? on.clear() : options.forEach((x) => on.add(x.value))
      else if (k.name === 'return' || k.name === 'enter') {
        stop()
        p.clear()
        const picked = options.filter((x) => on.has(x.value))
        process.stdout.write(done(question, picked.map((x) => x.label).join(', ') || 'none') + '\n')
        return resolve(picked.map((x) => x.value))
      } else if (canBack && (k.name === 'escape' || k.name === 'left' || k.name === 'backspace')) {
        stop()
        p.clear()
        return resolve(BACK)
      } else return
      render()
    })
  })
}

/** Text input with a default. Esc goes back; Backspace on an empty field also goes back. */
export function text(question, initial = '', canBack = true) {
  if (!tty) return Promise.resolve(initial)
  return new Promise((resolve) => {
    let value = ''
    const p = painter()
    const render = () => p.draw([`${col.c('?')} ${col.b(question)} ${value ? value : col.d(initial)}${tty ? '\x1b[7m \x1b[0m' : ''}`, col.d(`  type and press enter${canBack ? ', esc to go back' : ''}`)])
    render()
    const stop = keys((k, str) => {
      if (k.name === 'return' || k.name === 'enter') {
        stop()
        p.clear()
        const v = value.trim() || initial
        process.stdout.write(done(question, v) + '\n')
        return resolve(v)
      }
      if (canBack && (k.name === 'escape' || (k.name === 'backspace' && !value))) {
        stop()
        p.clear()
        return resolve(BACK)
      }
      if (k.name === 'backspace') value = value.slice(0, -1)
      else if (str && !k.ctrl && !k.meta && str.length === 1 && str >= ' ') value += str
      else return
      render()
    })
  })
}

export const confirm = (question, initial = true, canBack = true) =>
  select(question, [{ value: true, label: 'Yes' }, { value: false, label: 'No' }], initial ? 0 : 1, canBack)

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
