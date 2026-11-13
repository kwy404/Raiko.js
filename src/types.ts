import type { AnySchema, Static } from './schema'
import type { Cookies } from './cookie'

/** Turns '/users/:id/posts/:postId?' into { id: string; postId?: string } */
export type ParamsOf<P extends string> = P extends `${string}:${infer Rest}`
  ? Rest extends `${infer Name}/${infer Tail}`
    ? ParamName<Name> & ParamsOf<`/${Tail}`>
    : ParamName<Rest>
  : P extends `${string}*${infer W}`
    ? { [K in W extends '' ? '*' : W]: string }
    : {}

type ParamName<N extends string> = N extends `${infer X}?` ? { [K in X]?: string } : { [K in N]: string }

export type Prettify<T> = { [K in keyof T]: T[K] } & {}

export type MaybePromise<T> = T | Promise<T>

/** Join two path pieces at the type level, same rules as the runtime. */
export type JoinPath<A extends string, B extends string> = A extends ''
  ? B
  : B extends '/'
    ? A
    : `${A}${B}`

export interface Singleton {
  decorator: Record<string, unknown>
  store: Record<string, unknown>
  derive: Record<string, unknown>
}

export interface RouteSchema {
  body?: AnySchema
  query?: AnySchema
  params?: AnySchema
  headers?: AnySchema
  cookie?: AnySchema
  response?: AnySchema | Record<number, AnySchema>
}

export interface SetOptions {
  status: number
  headers: Record<string, string>
}

type Out<S, Fallback> = S extends AnySchema ? Static<S> : Fallback

export type Context<
  Path extends string = string,
  S extends RouteSchema = {},
  G extends Singleton = { decorator: {}; store: {}; derive: {} },
> = Prettify<
  {
    request: Request
    /** pathname without query string */
    path: string
    method: string
    params: Out<S['params'], Prettify<ParamsOf<Path>>>
    query: Out<S['query'], Record<string, string | undefined>>
    body: Out<S['body'], unknown>
    headers: Out<S['headers'], Record<string, string | undefined>>
    cookie: Cookies
    set: SetOptions
    store: G['store']
    /** Client address when the runtime exposes it. */
    ip: string | undefined
    /** Redirect, 302 by default. */
    redirect(url: string, status?: 301 | 302 | 303 | 307 | 308): Response
    /** Respond with a specific status code and body. */
    status<const C extends number, B = undefined>(code: C, body?: B): StatusResponse<C, B>
  } & G['decorator'] &
    G['derive']
>

export const STATUS_MARK = Symbol.for('raiko.status')

export interface StatusResponse<C extends number = number, B = unknown> {
  [STATUS_MARK]: true
  code: C
  body: B
}

export type Handler<Path extends string, S extends RouteSchema, G extends Singleton, R = unknown> = (
  ctx: Context<Path, S, G>,
) => R

export interface RouteDetail {
  summary?: string
  description?: string
  tags?: string[]
  deprecated?: boolean
  hide?: boolean
  operationId?: string
  security?: Record<string, string[]>[]
}

export interface Hooks<Path extends string = string, S extends RouteSchema = {}, G extends Singleton = Singleton> {
  beforeHandle?: Handler<Path, S, G> | Handler<Path, S, G>[]
  afterHandle?: AfterHandler<G> | AfterHandler<G>[]
  error?: ErrorHandler<G> | ErrorHandler<G>[]
}

export type AfterHandler<G extends Singleton = Singleton> = (ctx: Context<string, {}, G> & { response: unknown }) => unknown

export interface ErrorContext<G extends Singleton = Singleton> {
  error: Error & { status?: number }
  code: 'NOT_FOUND' | 'VALIDATION' | 'PARSE' | 'METHOD_NOT_ALLOWED' | 'HTTP' | 'UNKNOWN'
  request: Request
  path: string
  set: SetOptions
  store: G['store']
}

export type ErrorHandler<G extends Singleton = Singleton> = (ctx: ErrorContext<G>) => unknown

export type RouteOptions<Path extends string, S extends RouteSchema, G extends Singleton> = S &
  Hooks<Path, S, G> & { detail?: RouteDetail }

/** Unwrap what a handler returns into the types the client sees, per status. */
export type ResponseOf<R> =
  Awaited<R> extends infer A
    ? A extends StatusResponse<infer C, infer B>
      ? { [K in C]: B }
      : A extends Response
        ? { 200: unknown }
        : { 200: A }
    : never

/** Route registry used by the typed client. */
export type RouteEntry<S extends RouteSchema, Params, R> = {
  body: Out<S['body'], unknown>
  query: Out<S['query'], Record<string, string | undefined>>
  params: Out<S['params'], Params>
  response: ResponseOf<R>
}
