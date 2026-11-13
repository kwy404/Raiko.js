// Runs before Voodoo walks the page (both scripts are defer, this one is second).
for (const el of document.querySelectorAll('[data-i]')) el.insertAdjacentHTML('afterbegin', window.RK_ICON[el.dataset.i] || '')

// Monsoon's toast manager (monsoon.js); silently skipped if the script did not load
const toast = (title, o = {}) => window.Monsoon?.toast?.(title, { position: 'bottom-center', duration: 2200, ...o })
// close language menus when clicking elsewhere
addEventListener('click', (e) => {
  for (const d of document.querySelectorAll('details.dropdown[open]')) if (!d.contains(e.target)) d.open = false
})

const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k, v) => { try { localStorage.setItem(k, v) } catch {} }
const nav = (navigator.language || 'en').toLowerCase()
const lang = read('rk-lang') || (nav.startsWith('pt') ? 'pt' : nav.startsWith('es') ? 'es' : 'en')
document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang

V.data({
  T: window.RK_T,
  lang,
  tab: 0,
  menu: false,
  copied: false,
  setLang(l) {
    this.lang = l
    document.documentElement.lang = l === 'pt' ? 'pt-BR' : l
    write('rk-lang', l)
    for (const d of document.querySelectorAll('details.dropdown[open]')) d.open = false
    toast({ en: 'English', es: 'Español', pt: 'Português' }[l])
  },
  toggleTheme() {
    const dark = (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')) === 'dark'
    document.documentElement.dataset.theme = dark ? 'light' : 'dark'
    write('rk-theme', dark ? 'light' : 'dark')
    drawRays()
    toast(dark ? this.T[this.lang].toast.light : this.T[this.lang].toast.dark)
  },
  copy(text) {
    const done = () => {
      this.copied = true
      setTimeout(() => (this.copied = false), 1500)
      toast(this.T[this.lang].toast.copied, { description: text, tone: 'success' })
    }
    navigator.clipboard?.writeText(text).then(done, () => toast(this.T[this.lang].toast.failed, { description: this.T[this.lang].toast.failedHelp, tone: 'danger' }))
  },
})

// minimal highlighter for the code samples
const KW = /\b(import|from|export|default|const|let|await|async|return|new|function|if|else)\b/g
for (const pre of document.querySelectorAll('pre[data-hl]')) {
  let s = pre.textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const parts = []
  // placeholders use private use characters, never digits, so the number rule cannot touch them
  s = s.replace(/(\/\/[^\n]*)|('[^'\n]*'|`[^`]*`)/g, (m, c) => (parts.push(c ? `<span class="c">${m}</span>` : `<span class="s">${m}</span>`), String.fromCharCode(0xe000 + parts.length - 1)))
  s = s.replace(KW, '<span class="k">$1</span>').replace(/\b(\d+)\b/g, '<span class="n">$1</span>').replace(/\bt\.(\w+)/g, '<span class="t">t.$1</span>').replace(/\.(\w+)\(/g, '.<span class="f">$1</span>(')
  pre.innerHTML = s.replace(/[\ue000-\ue0ff]/g, (ch) => parts[ch.charCodeAt(0) - 0xe000])
}

// hero illustration: beams of light converging on the Raiko bolt, drawn once (and on resize/theme change)
function drawRays() {
  const c = document.getElementById('rays')
  if (!c) return
  const r = c.getBoundingClientRect()
  const dpr = Math.min(2, devicePixelRatio || 1)
  c.width = r.width * dpr
  c.height = r.height * dpr
  const g = c.getContext('2d')
  g.scale(dpr, dpr)
  const css = getComputedStyle(document.documentElement)
  const accent = css.getPropertyValue('--accent').trim() || '#ffd23f'
  const line = css.getPropertyValue('--line-2').trim() || '#2e2e2e'
  const w = r.width, h = r.height, cx = w / 2, cy = h * 1.08
  // fan of beams from below the fold
  for (let i = -18; i <= 18; i++) {
    const a = -Math.PI / 2 + i * 0.075
    g.strokeStyle = line
    g.globalAlpha = 0.55 - Math.abs(i) * 0.022
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(cx + Math.cos(a) * h * 1.6, cy + Math.sin(a) * h * 1.6)
    g.stroke()
  }
  // glow
  g.globalAlpha = 1
  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, h * 0.9)
  glow.addColorStop(0, accent + '55')
  glow.addColorStop(1, accent + '00')
  g.fillStyle = glow
  g.fillRect(0, 0, w, h)
  // the bolt, as a thin outline rising from the horizon
  const s = Math.min(w, h) * 0.0016 + 0.25
  const pts = [[13, 2], [4, 14], [11, 14], [10, 22], [19, 10], [12, 10], [13, 2]]
  g.save()
  g.translate(cx - 12 * s * 9, h - 26 * s * 9)
  g.scale(s * 9, s * 9)
  g.lineWidth = 1 / (s * 9)
  g.strokeStyle = accent
  g.globalAlpha = 0.35
  g.beginPath()
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.stroke()
  g.restore()
}
drawRays()
let rt
addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawRays, 120) })
