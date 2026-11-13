import { createKeyPair, decrypt, deriveKeys, encrypt, type KeyPair, type SessionKeys } from './crypto'
import { getHub } from './hub'
import { isTSchema, validate, validateSync } from '../schema'
import type { RaikoSocket, RawSocket, WsRoute } from './types'

let counter = 0
const nextId = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

/**
 * One WebSocket connection, independent of the runtime. Adapters call
 * `opened`, `received` and `closed`; this class runs the user handlers,
 * the optional encryption handshake and topic membership.
 */
export class Connection implements RaikoSocket<any> {
  readonly id = nextId()
  readonly topics = new Set<string>()
  readonly encrypted: boolean
  private key: SessionKeys | null = null
  private handshakeTimer: ReturnType<typeof setTimeout> | undefined
  private pair: KeyPair | null = null
  /** outgoing messages waiting for the key exchange */
  private outbox: unknown[] = []
  /** keeps message handling in order even with async decryption */
  private chain: Promise<void> = Promise.resolve()
  private sendChain: Promise<void> = Promise.resolve()
  private isClosed = false

  constructor(
    private readonly raw: RawSocket,
    private readonly route: WsRoute,
    readonly data: any,
  ) {
    this.encrypted = route.handlers.encrypt === true
  }

  // ------------------------------------------------------------- adapter events

  opened(): void {
    if (this.encrypted) {
      this.chain = this.chain.then(async () => {
        this.pair = await createKeyPair()
        this.raw.send(JSON.stringify({ $raiko: 'hello', v: 2, key: this.pair.publicKey }))
        // a client that never finishes the key exchange is dropped
        this.handshakeTimer = setTimeout(() => !this.key && this.close(1002, 'Key exchange timeout'), 10_000)
        ;(this.handshakeTimer as { unref?: () => void }).unref?.()
      })
      return
    }
    // tell Raiko clients the socket is ready and unencrypted
    this.raw.send(JSON.stringify({ $raiko: 'hello', v: 1 }))
    this.run(() => this.route.handlers.open?.(this))
  }

  received(message: string | Uint8Array): void {
    if (typeof message !== 'string' && !(message instanceof Uint8Array)) return
    const max = this.route.handlers.maxPayload ?? 1024 * 1024
    const size = typeof message === 'string' ? message.length : message.byteLength
    if (size > max) return this.close(1009, 'Message too big')
    this.chain = this.chain.then(() => this.handle(message)).catch((e) => this.fail(e))
  }

  closed(code: number, reason: string): void {
    if (this.isClosed) return
    this.isClosed = true
    clearTimeout(this.handshakeTimer)
    this.outbox.length = 0
    const hub = getHub()
    for (const t of this.topics) hub.unsubscribe(t, this)
    this.topics.clear()
    this.run(() => this.route.handlers.close?.(this, code, reason))
  }

  // ------------------------------------------------------------- protocol

  private async handle(message: string | Uint8Array): Promise<void> {
    if (this.encrypted) {
      if (!this.key) {
        if (typeof message !== 'string') return this.close(1002, 'Expected key exchange')
        const m = safeJson(message) as { $raiko?: string; key?: string } | null
        if (typeof m !== 'object' || m === null || m.$raiko !== 'key' || typeof m.key !== 'string' || !this.pair) return this.close(1002, 'Expected key exchange')
        try {
          this.key = await deriveKeys(this.pair, m.key, 'server')
        } catch {
          return this.close(1002, 'Invalid key')
        }
        clearTimeout(this.handshakeTimer)
        this.pair = null
        await this.run(() => this.route.handlers.open?.(this))
        for (const queued of this.outbox.splice(0)) this.send(queued)
        return
      }
      if (typeof message === 'string') return this.close(1003, 'Plain text frame on an encrypted socket')
      let value: unknown
      try {
        value = await decrypt(this.key, message)
      } catch {
        return this.close(1007, 'Could not decrypt message')
      }
      return this.deliver(value)
    }
    if (typeof message !== 'string') return this.deliver(message)
    const parsed = safeJson(message)
    return this.deliver(parsed === NOT_JSON ? message : parsed)
  }

  private async deliver(value: unknown): Promise<void> {
    const schema = this.route.handlers.body
    if (schema) {
      const r = isTSchema(schema) ? validateSync(schema, value) : await validate(schema, value)
      if (!r.ok) {
        this.send({ $raiko: 'error', code: 'validation', issues: r.issues })
        return
      }
      value = r.value
    }
    await this.run(() => this.route.handlers.message?.(this, value))
  }

  private async run(fn: () => unknown): Promise<void> {
    try {
      await fn()
    } catch (e) {
      this.fail(e)
    }
  }

  private fail(e: unknown) {
    console.error('[raiko] WebSocket handler failed:', e)
    // before the key exchange there is no safe channel to report on: close instead of queueing
    if (this.encrypted && !this.key) return this.close(1011, 'Internal error')
    this.send({ $raiko: 'error', code: 'internal', message: 'Internal error' })
  }

  // ------------------------------------------------------------- public API

  send(data: unknown): void {
    if (this.isClosed) return
    if (this.encrypted) {
      if (!this.key) {
        if (this.outbox.length >= 256) return this.close(1008, 'Too many messages before the key exchange')
        this.outbox.push(data)
        return
      }
      const key = this.key
      // frames must leave in counter order, so encryption is chained
      this.sendChain = this.sendChain.then(async () => {
        const frame = await encrypt(key, data)
        if (!this.isClosed) this.raw.send(frame)
      }, () => {})
      return
    }
    if (data instanceof Uint8Array) this.raw.send(data)
    else if (data instanceof ArrayBuffer) this.raw.send(new Uint8Array(data))
    else this.raw.send(typeof data === 'string' ? data : JSON.stringify(data))
  }

  close(code = 1000, reason = ''): void {
    try {
      this.raw.close(code, reason)
    } finally {
      this.closed(code, reason)
    }
  }

  subscribe(topic: string): void {
    this.topics.add(topic)
    getHub().subscribe(topic, this)
  }

  unsubscribe(topic: string): void {
    this.topics.delete(topic)
    getHub().unsubscribe(topic, this)
  }

  isSubscribed(topic: string): boolean {
    return this.topics.has(topic)
  }

  publish(topic: string, data: unknown): number {
    return getHub().publish(topic, data, this)
  }
}

const NOT_JSON = Symbol('not-json')

function safeJson(s: string): unknown {
  const c = s.charCodeAt(0)
  // only objects, arrays, strings, numbers, true/false/null look like JSON
  if (!(c === 123 || c === 91 || c === 34 || c === 45 || (c >= 48 && c <= 57) || c === 116 || c === 102 || c === 110))
    return NOT_JSON
  try {
    return JSON.parse(s)
  } catch {
    return NOT_JSON
  }
}
