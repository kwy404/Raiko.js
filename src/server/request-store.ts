/** Request scoped helpers with Next.js names. Call them anywhere during a request. */
import { AsyncLocalStorage } from 'node:async_hooks'
import { HttpError } from '../error'
import type { Cookies } from '../cookie'

export interface RequestStore {
  request: Request
  pathname: string
  params: Record<string, string | string[]>
  searchParams: URLSearchParams
  cookies: Cookies
  head: string[]
  status: number
  headers: Record<string, string>
  locale?: string
  /** the signed in user, from appRouter({ getUser }) */
  user?: PageUser | null
}

export interface PageUser {
  id?: string
  role?: string
  roles?: string[]
  [k: string]: unknown
}

export const als = new AsyncLocalStorage<RequestStore>()

function store(name: string): RequestStore {
  const s = als.getStore()
  if (!s)
    throw new Error(
      `error[RK0201]: ${name}() was called outside of a request\n  = help: call it inside a page, layout, route handler or component\n  = docs: https://kwy404.github.io/Raiko.js/errors#RK0201`,
    )
  return s
}

export const headers = (): Headers => store('headers').request.headers
export const cookies = (): Cookies => store('cookies').cookies
export const usePathname = (): string => store('usePathname').pathname
export const useParams = <T extends Record<string, string | string[]> = Record<string, string>>(): T =>
  store('useParams').params as T
export const useSearchParams = (): URLSearchParams => store('useSearchParams').searchParams
export const useRequest = (): Request => store('useRequest').request
export const useLocale = (): string | undefined => store('useLocale').locale
export const setStatus = (code: number): void => void (store('setStatus').status = code)
export const setHeader = (name: string, value: string): void =>
  void (store('setHeader').headers[name.toLowerCase()] = value)

export class RedirectSignal extends HttpError {
  constructor(readonly location: string, status: number) {
    super(status, `Redirect to ${location}`, { headers: { location } })
  }
}

/** The signed in user (or null) for the current request. */
export const currentUser = <U extends PageUser = PageUser>(): U | null => (store('currentUser').user as U | null) ?? null

/** Stop rendering: sign in required. Shows unauthorized.tsx, or redirects to the sign in page. */
export function unauthorized(message = 'Sign in to see this page'): never {
  throw new HttpError(401, message)
}

/** Stop rendering: signed in, but not allowed. Shows the nearest forbidden.tsx. */
export function forbidden(message = 'You do not have access to this page'): never {
  throw new HttpError(403, message)
}

/** Stop rendering and show the nearest not-found.tsx. */
export function notFound(message = 'This page could not be found'): never {
  throw new HttpError(404, message)
}

/** Stop rendering and redirect. 307 by default, like Next.js. */
export function redirect(location: string, status: 301 | 302 | 303 | 307 | 308 = 307): never {
  throw new RedirectSignal(location, status)
}

export const permanentRedirect = (location: string): never => redirect(location, 308)
