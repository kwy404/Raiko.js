// Runs before Voodoo starts (both are defer, this one comes second in the page).
const saved = (() => { try { return localStorage.getItem('rk-lang') } catch { return null } })()
const guess = (navigator.language || 'en').toLowerCase().startsWith('pt') ? 'pt' : (navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'en'
V.data({
  T: window.RK_T,
  ICONS: window.RK_ICONS || [],
  lang: saved || guess,
  tab: 0,
  copied: false,
  setLang(l) { this.lang = l; document.documentElement.lang = l === 'pt' ? 'pt-BR' : l; try { localStorage.setItem('rk-lang', l) } catch {} },
  copy() { navigator.clipboard?.writeText('bun create raiko'); this.copied = true; setTimeout(() => (this.copied = false), 1500) },
})
// tiny syntax highlighter for the code samples
const KW = /\b(import|from|export|default|const|let|await|async|return|new|function|if|else|type)\b/g
document.querySelectorAll('pre[data-hl]').forEach((pre) => {
  let s = pre.textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const parts = []
  s = s.replace(/(\/\/[^\n]*)|('[^'\n]*'|`[^`]*`)/g, (m, c) => (parts.push(c ? `<span class="c">${m}</span>` : `<span class="s">${m}</span>`), `\u0000${parts.length - 1}\u0000`))
  s = s.replace(KW, '<span class="k">$1</span>').replace(/\b(\d+)\b/g, '<span class="n">$1</span>').replace(/\b(t)\.(\w+)/g, '<span class="t">$1.$2</span>').replace(/\.(\w+)\(/g, '.<span class="f">$1</span>(')
  pre.innerHTML = s.replace(/\u0000(\d+)\u0000/g, (_, i) => parts[+i])
})
