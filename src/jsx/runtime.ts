/**
 * Raiko JSX runtime. Server side only: elements are plain objects that render
 * to escaped HTML strings or streams. Async components and <Suspense> are
 * supported.
 *
 * tsconfig: { "jsx": "react-jsx", "jsxImportSource": "raiko.js" }
 */

export const RAIKO_NODE = Symbol.for('raiko.node')
export const RAW = Symbol.for('raiko.raw')
export const Fragment = Symbol.for('raiko.fragment')

export type Child =
  | RaikoNode
  | RawHtml
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | Promise<Child>
  | Child[]

export interface RaikoNode {
  [RAIKO_NODE]: true
  type: string | symbol | Component<any>
  props: Record<string, any>
}

export interface RawHtml {
  [RAW]: true
  html: string
}

export type Component<P = {}> = (props: P & { children?: Child }) => Child

export function jsx(type: RaikoNode['type'], props: Record<string, any> | null, key?: unknown): RaikoNode {
  const p = props ?? {}
  if (key !== undefined) p.key = key
  return { [RAIKO_NODE]: true, type, props: p }
}
export const jsxs = jsx
export const jsxDEV = jsx

/** Classic createElement signature, for `jsxFactory: "h"` users. */
export function h(type: RaikoNode['type'], props: Record<string, any> | null, ...children: Child[]): RaikoNode {
  const p = { ...(props ?? {}) }
  if (children.length) p.children = children.length === 1 ? children[0] : children
  return jsx(type, p)
}

export function isNode(v: unknown): v is RaikoNode {
  return typeof v === 'object' && v !== null && (v as RaikoNode)[RAIKO_NODE] === true
}

/** Mark a string as trusted HTML. Never pass user input here. */
export function raw(html: string): RawHtml {
  return { [RAW]: true, html }
}

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
])

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const ESC_RE = /[&<>"']/g

export function escapeHtml(s: string): string {
  return ESC_RE.test(s) ? ((ESC_RE.lastIndex = 0), s.replace(ESC_RE, (c) => ESC[c]!)) : s
}

const ATTR_ALIAS: Record<string, string> = { className: 'class', htmlFor: 'for', httpEquiv: 'http-equiv' }
const VALID_ATTR = /^[^\s"'>/=\u0000-\u001f]+$/
const VALID_TAG = /^[a-zA-Z][a-zA-Z0-9-]*$/

function styleToString(style: Record<string, string | number | null | undefined>): string {
  let out = ''
  for (const k in style) {
    const v = style[k]
    if (v === null || v === undefined || v === '') continue
    const prop = k.startsWith('--') ? k : k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
    out += `${prop}:${v};`
  }
  return out
}

function renderAttrs(props: Record<string, any>): string {
  let out = ''
  for (const key in props) {
    if (key === 'children' || key === 'key' || key === 'dangerouslySetInnerHTML') continue
    let v = props[key]
    if (v === undefined || v === null || v === false || typeof v === 'function') continue
    const name = ATTR_ALIAS[key] ?? key
    if (!VALID_ATTR.test(name)) continue
    if (v === true) {
      out += ' ' + name
      continue
    }
    if (name === 'style' && typeof v === 'object') v = styleToString(v)
    else if (name === 'class' && Array.isArray(v)) v = v.filter(Boolean).join(' ')
    else if (name === 'class' && typeof v === 'object') v = Object.keys(v).filter((k) => v[k]).join(' ')
    out += ` ${name}="${escapeHtml(String(v))}"`
  }
  return out
}

interface Ctx {
  /** streaming mode collects suspended boundaries here */
  suspended?: { id: number; content: Child }[]
  nextId: number
  nonce?: string
}

/** Render to a string. Awaits every async component. */
export async function renderToString(node: Child): Promise<string> {
  const ctx: Ctx = { nextId: 0 }
  const parts: string[] = []
  await renderInto(node, ctx, parts)
  return parts.join('')
}

async function renderInto(node: Child, ctx: Ctx, out: string[]): Promise<void> {
  if (node === null || node === undefined || node === false || node === true) return
  if (typeof node === 'string') return void out.push(escapeHtml(node))
  if (typeof node === 'number' || typeof node === 'bigint') return void out.push(String(node))
  if (node instanceof Promise) return renderInto((await (node as Promise<unknown>)) as Child, ctx, out)
  if (Array.isArray(node)) {
    for (const c of node) await renderInto(c, ctx, out)
    return
  }
  if ((node as RawHtml)[RAW]) return void out.push((node as RawHtml).html)
  if (!isNode(node)) return void out.push(escapeHtml(String(node)))

  const { type, props } = node
  if (type === Fragment) return renderInto(props.children, ctx, out)
  if (type === Suspense) {
    if (!ctx.suspended) return renderInto(props.children, ctx, out)
    const id = ctx.nextId++
    out.push(`<div id="rk-s-${id}" style="display:contents">`)
    await renderInto(props.fallback, ctx, out)
    out.push('</div>')
    ctx.suspended.push({ id, content: props.children })
    return
  }
  if (typeof type === 'function') return renderInto(type(props), ctx, out)
  if (typeof type !== 'string' || !VALID_TAG.test(type)) throw new Error(`Invalid element type: ${String(type)}`)

  if (type === 'html') out.push('<!doctype html>')
  out.push(`<${type}${renderAttrs(props)}>`)
  if (VOID.has(type)) return
  const inner = props.dangerouslySetInnerHTML?.__html
  if (typeof inner === 'string') out.push(inner)
  else if ((type === 'script' || type === 'style') && typeof props.children === 'string')
    out.push(props.children.replace(/<\/(script|style)/gi, '<\\/$1'))
  else await renderInto(props.children, ctx, out)
  out.push(`</${type}>`)
}

/**
 * <Suspense fallback={...}>: when streamed, the fallback ships first and the
 * real content arrives later in the same response, swapped in place.
 */
export function Suspense(props: { fallback?: Child; children?: Child }): Child {
  return props.children
}

const SWAP =
  'function rkSwap(i){var t=document.getElementById("rk-t-"+i),s=document.getElementById("rk-s-"+i);if(t&&s){s.replaceWith(t.content.cloneNode(true));t.remove()}}'

export interface StreamOptions {
  nonce?: string
  transformShell?: (html: string) => string | Promise<string>
  /** HTML to show in place of a boundary that threw. Default: nothing. */
  onError?: (error: unknown) => string | Promise<string>
}

/**
 * Stream HTML: the shell first, then each <Suspense> boundary as it resolves.
 * The shell renders before this resolves, so errors there throw normally.
 */
export async function renderStream(node: Child, opts: StreamOptions = {}): Promise<ReadableStream<Uint8Array>> {
  const enc = new TextEncoder()
  const ctx: Ctx = { nextId: 0, suspended: [], nonce: opts.nonce }
  const shell: string[] = []
  await renderInto(node, ctx, shell)
  const head = opts.transformShell ? await opts.transformShell(shell.join('')) : shell.join('')
  const nonce = opts.nonce ? ` nonce="${escapeHtml(opts.nonce)}"` : ''
  return new ReadableStream({
    async start(controller) {
      controller.enqueue(enc.encode(head))
      let first = true
      const pending = new Map<number, Promise<{ id: number; html: string }>>()
      const queue = () => {
        for (const b of ctx.suspended!.splice(0)) {
          pending.set(
            b.id,
            (async () => {
              const parts: string[] = []
              try {
                await renderInto(b.content, ctx, parts)
                return { id: b.id, html: parts.join('') }
              } catch (e) {
                return { id: b.id, html: opts.onError ? await opts.onError(e) : '' }
              }
            })(),
          )
        }
      }
      queue()
      while (pending.size) {
        const { id, html } = await Promise.race(pending.values())
        pending.delete(id)
        queue()
        const script = first ? SWAP : ''
        first = false
        controller.enqueue(enc.encode(`<template id="rk-t-${id}">${html}</template><script${nonce}>${script}rkSwap(${id})</script>`))
      }
      controller.close()
    },
  })
}

/** Sync wrapper kept for compatibility: errors in the shell become a stream error. */
export function renderToStream(node: Child, opts: StreamOptions = {}): ReadableStream<Uint8Array> {
  const p = renderStream(node, opts)
  return new ReadableStream({
    async start(c) {
      try {
        const r = (await p).getReader()
        for (;;) {
          const { done, value } = await r.read()
          if (done) break
          c.enqueue(value)
        }
        c.close()
      } catch (e) {
        c.error(e)
      }
    },
  })
}

/** Run a component tree and report whether it contains <Suspense>. */
export function hasSuspense(node: Child): boolean {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(hasSuspense)
  if (!isNode(node)) return false
  if (node.type === Suspense) return true
  return hasSuspense(node.props.children)
}

type Attrs = Record<string, any> & { children?: Child }

export declare namespace JSX {
  type Element = RaikoNode
  /** lets components return arrays, strings, null or a Promise (async server components) */
  type ElementType = string | ((props: any) => Child | Promise<Child>)
  interface ElementChildrenAttribute {
    children: {}
  }
  interface IntrinsicAttributes {
    key?: string | number
  }
  interface IntrinsicElements {
    [name: string]: Attrs
  }
}
