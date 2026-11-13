/** Walk the app directory and turn folders into routes, Next.js style. */
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

export const SPECIAL = ['page', 'layout', 'loading', 'error', 'not-found', 'forbidden', 'unauthorized', 'route', 'socket'] as const
export type Special = (typeof SPECIAL)[number]
const EXT = ['.tsx', '.ts', '.jsx', '.js', '.mjs']

export interface Segment {
  /** url path for this folder, e.g. /blog/:slug */
  path: string
  files: Partial<Record<Special, string>>
  /** catch all param names, so pages get arrays like Next.js */
  catchAll: string[]
  /** ancestor folders including this one, outer first */
  chain: Segment[]
}

export function folderToSegment(name: string): { seg: string | null; catchAll?: string } {
  if (name.startsWith('(') && name.endsWith(')')) return { seg: null }
  let m = /^\[\[\.\.\.(\w+)\]\]$/.exec(name) ?? /^\[\.\.\.(\w+)\]$/.exec(name)
  if (m) return { seg: `*${m[1]}`, catchAll: m[1] }
  m = /^\[(\w+)\]$/.exec(name)
  if (m) return { seg: `:${m[1]}` }
  if (/[[\]]/.test(name))
    throw new Error(`error[RK0101]: invalid folder name "${name}"\n  = help: use [param], [...param] or [[...param]]`)
  return { seg: name }
}

/** List every file under dir as posix relative paths. */
export function listFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (abs: string) => {
    for (const f of readdirSync(abs)) {
      if (f.startsWith('.') || f === 'node_modules') continue
      const child = join(abs, f)
      if (statSync(child).isDirectory()) walk(child)
      else out.push(relative(dir, child).split('\\').join('/'))
    }
  }
  walk(dir)
  return out.sort()
}

const fileInfo = (f: string) => {
  const slash = f.lastIndexOf('/')
  const base = f.slice(slash + 1)
  const dot = base.lastIndexOf('.')
  return { dir: slash === -1 ? '' : f.slice(0, slash), name: dot === -1 ? base : base.slice(0, dot), ext: dot === -1 ? '' : base.slice(dot) }
}

/** Build the route tree from relative file paths (from disk or a build manifest). */
export function scanFiles(files: string[]): Segment[] {
  const byDir = new Map<string, Partial<Record<Special, string>>>()
  byDir.set('', {})
  for (const f of files) {
    const { dir, name, ext } = fileInfo(f)
    if (!EXT.includes(ext) || !(SPECIAL as readonly string[]).includes(name)) continue
    if (dir.split('/').some((p) => p.startsWith('_'))) continue
    const parts = dir ? dir.split('/') : []
    for (let i = 0; i <= parts.length; i++) if (!byDir.has(parts.slice(0, i).join('/'))) byDir.set(parts.slice(0, i).join('/'), {})
    const files2 = byDir.get(dir)!
    if (files2[name as Special])
      throw new Error(`error[RK0102]: two ${name} files in app/${dir}\n  = help: keep only one of ${name}.tsx / ${name}.ts`)
    files2[name as Special] = f
  }
  const segs = new Map<string, Segment>()
  for (const dir of [...byDir.keys()].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))) {
    const files2 = byDir.get(dir)!
    if (files2.page && files2.route)
      throw new Error(`error[RK0103]: app/${dir} has both page and route\n  = help: a folder is either a page or an API route, move one of them`)
    if (dir === '') {
      const root: Segment = { path: '/', files: files2, catchAll: [], chain: [] }
      root.chain = [root]
      segs.set('', root)
      continue
    }
    const parentDir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : ''
    const parent = segs.get(parentDir)!
    const { seg, catchAll } = folderToSegment(dir.slice(dir.lastIndexOf('/') + 1))
    const path = seg === null ? parent.path : `${parent.path === '/' ? '' : parent.path}/${seg}`
    const s: Segment = { path, files: files2, catchAll: catchAll ? [...parent.catchAll, catchAll] : parent.catchAll, chain: [] }
    s.chain = [...parent.chain, s]
    segs.set(dir, s)
  }
  return [...segs.values()]
}

export const scanApp = (dir: string): Segment[] => scanFiles(listFiles(dir))
