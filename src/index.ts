export { Raiko, joinPath } from './app'
export type { RaikoConfig, Plugin, AnyRaiko, HookScope } from './app'
export { t, validate, validateSync, toJsonSchema } from './schema'
export type { Static, TSchema, AnySchema, Issue, StandardSchemaV1 } from './schema'
export { HttpError, ValidationError, NotFound, BadRequest, Unauthorized, Forbidden, Conflict, TooManyRequests } from './error'
export { sse } from './response'
export { Cookies, sign, unsign, parseCookies, serializeCookie } from './cookie'
export type { CookieOptions } from './cookie'
export { Router } from './router'
export { raw, renderToString, renderToStream, Suspense, Fragment, h, escapeHtml } from './jsx/runtime'
export type { Child, Component } from './jsx/runtime'
export type { Context, RouteSchema, StatusResponse, ErrorContext, ParamsOf } from './types'
export type { RaikoSocket } from './ws/types'

import { Raiko, type RaikoConfig } from './app'
/** Shorthand: `const app = raiko()` */
export const raiko = (config?: RaikoConfig) => new Raiko(config)
export default Raiko

/** True when this module is the program entry: `if (isMain(import.meta.url)) app.listen(3000)` */
export function isMain(url: string): boolean {
  const g = globalThis as any
  // under `raiko dev` and `raiko start` the CLI starts the server itself
  if (g.process?.env?.RAIKO_RUNNER === '1') return false
  // one spelling for every OS: forward slashes, no leading slash before a drive letter, no extension
  const norm = (s: string) => {
    const p = decodeURIComponent(s).replace(/\\/g, '/').replace(/^\/([A-Za-z]:)/, '$1').replace(/\.(m|c)?(t|j)sx?$/, '')
    return /^[A-Za-z]:/.test(p) ? p.toLowerCase() : p
  }
  const file = norm(new URL(url).pathname)
  const main: string | undefined = g.Bun?.main ?? g.process?.argv?.[1]
  if (!main) return false
  const m = norm(main)
  return m === file || file.endsWith('/' + m.replace(/^\.?\//, ''))
}
