/** Rust style error page for development: code, location, source frame, help. */
import { existsSync, readFileSync } from 'node:fs'
import { escapeHtml as e } from '../jsx/runtime'

interface Frame {
  file: string
  line: number
  col: number
}

export function firstUserFrame(stack = ''): Frame | null {
  for (const l of stack.split('\n')) {
    const m = /\(?((?:file:\/\/)?\/[^():]+):(\d+):(\d+)\)?/.exec(l)
    if (!m || m[1]!.includes('node_modules') || m[1]!.includes('/raiko.js/')) continue
    return { file: m[1]!.replace('file://', ''), line: Number(m[2]), col: Number(m[3]) }
  }
  return null
}

export function codeFrame(f: Frame, context = 3): string {
  if (!existsSync(f.file)) return ''
  const lines = readFileSync(f.file, 'utf8').split('\n')
  const start = Math.max(0, f.line - 1 - context)
  const end = Math.min(lines.length, f.line + context)
  const w = String(end).length
  let out = ''
  for (let i = start; i < end; i++) {
    const n = String(i + 1).padStart(w)
    out += `${n} | ${lines[i]}\n`
    if (i + 1 === f.line) out += `${' '.repeat(w)} | ${' '.repeat(Math.max(0, f.col - 1))}^^^\n`
  }
  return out
}

/** Plain text version, the same format the terminal shows. */
export function formatError(err: Error): string {
  const code = /^error\[(RK\d{4})\]/.exec(err.message)?.[1]
  const frame = firstUserFrame(err.stack)
  let out = code ? err.message : `error: ${err.name}: ${err.message}`
  if (frame) out += `\n  --> ${frame.file}:${frame.line}:${frame.col}\n${codeFrame(frame)}`
  return out
}

export function devErrorPage(err: Error, req: Request): string {
  const text = formatError(err)
  return `<!doctype html><html><head><meta charset="utf-8"><title>Error: ${e(err.message.split('\n')[0]!)}</title>
<style>body{margin:0;background:#0a0a0b;color:#ededed;font:14px/1.6 "Geist Mono",ui-monospace,monospace;padding:48px}
.c{max-width:960px;margin:auto}.t{color:#ff5f56;font-weight:700}.m{color:#a1a1aa}pre{background:#111113;border:1px solid #27272a;border-radius:8px;padding:20px;overflow:auto;white-space:pre-wrap}
.r{display:inline-block;background:#ffd23f;color:#0a0a0b;border-radius:4px;padding:0 8px;font-weight:700;margin-bottom:16px}</style></head>
<body><div class="c"><span class="r">raiko dev</span><div class="t">${e(req.method)} ${e(new URL(req.url).pathname)}</div>
<pre>${e(text)}</pre><p class="m">Stack</p><pre class="m">${e(err.stack ?? '')}</pre></div></body></html>`
}

/** Full screen overlay shown inside the page, like the Next.js error overlay. */
export function devOverlay(err: Error, req: Request): string {
  const text = formatError(err)
  return `<div id="rk-overlay" style="position:fixed;inset:0;z-index:2147483647;background:rgba(10,10,11,.92);backdrop-filter:blur(4px);color:#ededed;font:13px/1.6 ui-monospace,monospace;overflow:auto;padding:5vh 4vw">
<div style="max-width:960px;margin:auto;background:#111113;border:1px solid #3f1d1d;border-radius:12px;padding:24px">
<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px"><span style="background:#ff5f56;color:#0a0a0b;border-radius:4px;padding:0 8px;font-weight:700">Unhandled error</span><span style="color:#a1a1aa">${e(req.method)} ${e(new URL(req.url).pathname)}</span><button onclick="this.closest('#rk-overlay').remove()" style="margin-left:auto;background:#18181b;color:#ededed;border:1px solid #27272a;border-radius:6px;padding:2px 10px;cursor:pointer">Close (Esc)</button></div>
<pre style="white-space:pre-wrap;margin:0">${e(text)}</pre>
<details style="margin-top:12px;color:#71717a"><summary>Stack</summary><pre style="white-space:pre-wrap">${e(err.stack ?? '')}</pre></details></div></div>
<script>addEventListener('keydown',function(k){if(k.key==='Escape'){var o=document.getElementById('rk-overlay');o&&o.remove()}})</script>`
}

/** Small badge with a panel: route, params, timing, cache, metadata. Development only. */
export function devToolsHtml(info: Record<string, unknown>): string {
  const data = e(JSON.stringify(info))
  return `<div id="rk-devtools" data-info="${data}" style="position:fixed;left:12px;bottom:12px;z-index:2147483646;font:12px ui-monospace,monospace">
<button id="rk-dt-b" style="background:#0a0a0b;color:#ffd23f;border:1px solid #27272a;border-radius:999px;padding:6px 12px;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.4)">raiko ${e(String(info.ms))}ms</button>
<div id="rk-dt-p" hidden style="margin-bottom:8px;background:#0a0a0b;color:#ededed;border:1px solid #27272a;border-radius:10px;padding:12px;min-width:280px;max-width:420px"></div></div>
<script>(function(){var r=document.getElementById('rk-devtools'),p=document.getElementById('rk-dt-p'),i=JSON.parse(r.dataset.info),h='';for(var k in i){h+='<div style="display:flex;gap:12px;justify-content:space-between;padding:2px 0"><span style="color:#71717a">'+k+'</span><span>'+String(JSON.stringify(i[k])).replace(/</g,'&lt;')+'</span></div>'}
h+='<div style="display:flex;gap:12px;justify-content:space-between;padding:2px 0"><span style="color:#71717a">voodoo</span><span>'+(window.V?'loaded':'not used')+'</span></div><div style="margin-top:8px;display:flex;gap:8px"><a href="/docs" style="color:#ffd23f">API docs</a><a href="/_raiko/mail" style="color:#ffd23f">Emails</a><a href="/admin" style="color:#ffd23f">Admin</a></div>';
p.innerHTML=h;r.insertBefore(p,r.firstChild);document.getElementById('rk-dt-b').onclick=function(){p.hidden=!p.hidden}})()</script>`
}
