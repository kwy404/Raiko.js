/**
 * Radix tree router.
 *
 * Supports static segments, named params (`:id`), optional params (`:id?`)
 * and a trailing wildcard (`*`). Priority on lookup: static, then param,
 * then wildcard, with backtracking so the most specific route always wins.
 */

export interface Match<T> {
  store: T
  params: Record<string, string>
}

interface ParamChild<T> {
  name: string
  node: Node<T>
}

class Node<T> {
  /** static children keyed by the full segment text */
  statics: Map<string, Node<T>> | null = null
  param: ParamChild<T> | null = null
  /** paramName of the wildcard, '*' by default */
  wildcard: { name: string; store: T } | null = null
  store: T | null = null
  hasStore = false
}

function splitPath(path: string): string[] {
  const out: string[] = []
  let start = 1
  for (let i = 1; i <= path.length; i++) {
    if (i === path.length || path.charCodeAt(i) === 47) {
      out.push(path.slice(start, i))
      start = i + 1
    }
  }
  return out
}

export function normalizePath(path: string): string {
  if (!path || path[0] !== '/') path = '/' + (path || '')
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  return path
}

/** Expand optional params into every concrete path they describe. */
export function expandOptional(path: string): string[] {
  const segs = normalizePath(path) === '/' ? [] : splitPath(normalizePath(path))
  let results: string[][] = [[]]
  for (const seg of segs) {
    if (seg.length > 1 && seg[0] === ':' && seg.endsWith('?')) {
      const clean = seg.slice(0, -1)
      results = results.flatMap((r) => [r, [...r, clean]])
    } else {
      results = results.map((r) => [...r, seg])
    }
  }
  const uniq = new Set(results.map((r) => '/' + r.join('/')))
  return [...uniq]
}

export class Router<T> {
  private roots = new Map<string, Node<T>>()
  /** fast path for fully static routes */
  /** static routes resolve to a prebuilt match: no allocation per request */
  private staticMap = new Map<string, Map<string, Match<T>>>()
  readonly routes: { method: string; path: string }[] = []

  add(method: string, path: string, store: T): void {
    for (const p of expandOptional(path)) this.insert(method, p, store)
    this.routes.push({ method, path: normalizePath(path) })
  }

  private insert(method: string, path: string, store: T): void {
    if (!/[:*]/.test(path)) {
      let m = this.staticMap.get(method)
      if (!m) this.staticMap.set(method, (m = new Map()))
      m.set(path, { store, params: EMPTY_PARAMS as Record<string, string> })
    }
    let node = this.roots.get(method)
    if (!node) this.roots.set(method, (node = new Node<T>()))
    const segs = path === '/' ? [] : splitPath(path)
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!
      if (seg[0] === '*') {
        if (i !== segs.length - 1) throw new Error(`error[RK0105]: a wildcard must be the last segment\n  --> ${path}\n   = help: move * to the end, like /files/*`)
        node.wildcard = { name: seg.length > 1 ? seg.slice(1) : '*', store }
        return
      }
      if (seg[0] === ':') {
        const name = seg.slice(1)
        if (!name) throw new Error(`error[RK0106]: a param needs a name\n  --> ${path}\n   = help: write :id instead of :`)
        if (node.param && node.param.name !== name)
          throw new Error(
            `error[RK0104]: two routes use different param names at the same position\n  --> ${path}\n   = note: ':${node.param.name}' is already declared there, this route uses ':${name}'\n   = help: use ':${node.param.name}' in both routes, or move one of them`,
          )
        if (!node.param) node.param = { name, node: new Node<T>() }
        node = node.param.node
        continue
      }
      if (!node.statics) node.statics = new Map()
      let next = node.statics.get(seg)
      if (!next) node.statics.set(seg, (next = new Node<T>()))
      node = next
    }
    node.store = store
    node.hasStore = true
  }

  find(method: string, path: string): Match<T> | null {
    const st = this.staticMap.get(method)?.get(path)
    if (st !== undefined) return st
    const root = this.roots.get(method)
    if (!root) return null
    const segs = path === '/' ? [] : splitPath(path)
    const params: Record<string, string> = {}
    const store = this.walk(root, segs, 0, params)
    return store === NOT_FOUND ? null : { store: store as T, params }
  }

  private walk(node: Node<T>, segs: string[], i: number, params: Record<string, string>): T | typeof NOT_FOUND {
    if (i === segs.length) {
      if (node.hasStore) return node.store as T
      if (node.wildcard) {
        params[node.wildcard.name] = ''
        return node.wildcard.store
      }
      return NOT_FOUND
    }
    const seg = segs[i]!
    const s = node.statics?.get(seg)
    if (s) {
      const r = this.walk(s, segs, i + 1, params)
      if (r !== NOT_FOUND) return r
    }
    if (node.param && seg !== '') {
      const r = this.walk(node.param.node, segs, i + 1, params)
      if (r !== NOT_FOUND) {
        params[node.param.name] = safeDecode(seg)
        return r
      }
    }
    if (node.wildcard) {
      params[node.wildcard.name] = safeDecode(segs.slice(i).join('/'))
      return node.wildcard.store
    }
    return NOT_FOUND
  }

  /** Methods that have a route matching this path (for 405 + Allow). */
  allowed(path: string): string[] {
    const out: string[] = []
    for (const m of this.roots.keys()) if (this.find(m, path)) out.push(m)
    return out
  }
}

const NOT_FOUND = Symbol('not-found')
/** shared by every static match; frozen so a handler cannot leak state into the next request */
const EMPTY_PARAMS = Object.freeze(Object.create(null))

export function safeDecode(s: string): string {
  if (s.indexOf('%') === -1) return s
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
