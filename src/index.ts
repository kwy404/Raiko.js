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
  const file = decodeURIComponent(new URL(url).pathname)
  if (g.Bun) return g.Bun.main === file
  const a: string | undefined = g.process?.argv?.[1]
  if (!a) return false
  const strip = (s: string) => s.replace(/\\/g, '/').replace(/\.(m|c)?(t|j)sx?$/, '')
  return strip(file) === strip(a) || strip(file).endsWith('/' + strip(a).replace(/^\.?\//, ''))
}
