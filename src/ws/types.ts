import type { AnySchema, Static } from '../schema'
import type { Context, RouteSchema, Singleton } from '../types'

/** The minimum every runtime socket can do. Adapters wrap their socket in this. */
export interface RawSocket {
  send(data: string | Uint8Array): void
  close(code?: number, reason?: string): void
}

export interface RaikoSocket<Data = unknown> {
  /** unique id for this connection */
  readonly id: string
  /** request context captured at upgrade time: params, query, store, decorators, derive */
  readonly data: Data
  /** true when this connection encrypts its messages */
  readonly encrypted: boolean
  /** Send a value. Objects are sent as JSON, Uint8Array as binary. */
  send(data: unknown): void
  close(code?: number, reason?: string): void
  subscribe(topic: string): void
  unsubscribe(topic: string): void
  isSubscribed(topic: string): boolean
  /** Send to everyone in the topic except this socket. */
  publish(topic: string, data: unknown): number
  readonly topics: ReadonlySet<string>
}

type MessageOf<S> = S extends AnySchema ? Static<S> : unknown

export interface WsHandlers<Path extends string, S extends RouteSchema, G extends Singleton> {
  query?: S['query']
  params?: S['params']
  headers?: S['headers']
  /** validates every incoming message; invalid messages get an error frame */
  body?: AnySchema
  /** end to end AES-GCM encryption of every message, keys exchanged with ECDH */
  encrypt?: boolean
  /** max incoming message size in bytes, default 1 MB */
  maxPayload?: number
  /** Return anything (or throw) to refuse the upgrade, e.g. failed auth. */
  beforeUpgrade?: (ctx: Context<Path, S, G>) => unknown
  open?: (ws: RaikoSocket<Context<Path, S, G>>) => unknown
  message?: (ws: RaikoSocket<Context<Path, S, G>>, message: any) => unknown
  close?: (ws: RaikoSocket<Context<Path, S, G>>, code: number, reason: string) => unknown
}

export interface WsRoute {
  path: string
  handlers: WsHandlers<string, any, any>
  hooks: Record<string, ((ctx: any) => unknown)[]>
}

export type { MessageOf }
