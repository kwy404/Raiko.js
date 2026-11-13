/** Browser and server WebSocket client: reconnect with backoff, offline queue, rooms, encryption. */
import { createKeyPair, deriveKeys, encrypt, decrypt, type SessionKeys } from '../ws/crypto'

export interface SocketOptions {
  /** reconnect after unexpected closes, default true */
  reconnect?: boolean
  /** max delay between attempts in ms, default 10000 */
  maxDelay?: number
  /**
   * The server is not Raiko (no hello message): ready as soon as it opens.
   * Never set this for Raiko servers, queued messages would skip the encryption check.
   */
  raw?: boolean
  protocols?: string | string[]
}

type Events<In> = {
  open: () => void
  message: (data: In) => void
  close: (code: number, reason: string) => void
  error: (err: unknown) => void
  reconnecting: (attempt: number) => void
}

export class RaikoClientSocket<In = unknown, Out = unknown> {
  private ws: WebSocket | null = null
  private queue: unknown[] = []
  private listeners: { [K in keyof Events<In>]: Set<Events<In>[K]> } = { open: new Set(), message: new Set(), close: new Set(), error: new Set(), reconnecting: new Set() }
  private attempt = 0
  private manual = false
  private key: SessionKeys | null = null
  private encrypted = false
  private ready = false
  private chain: Promise<void> = Promise.resolve()

  constructor(readonly url: string, private readonly o: SocketOptions = {}) {
    this.connect()
  }

  /** true when the socket is open (and the key exchange is done, if encrypted) */
  get isOpen(): boolean {
    return this.ready
  }

  private connect() {
    const ws = new WebSocket(this.url, this.o.protocols)
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    this.ready = false
    this.key = null
    this.encrypted = false
    // a server with encryption speaks first; without it, the socket is ready on open
    let helloTimer: ReturnType<typeof setTimeout> | undefined = undefined
    ws.onopen = () => {
      // a Raiko server always says hello first; nothing is sent until it does
      if (this.o.raw) this.markReady()
    }
    ws.onmessage = (e) => {
      this.chain = this.chain.then(async () => {
        if (this.o.raw) {
          const v = typeof e.data === 'string' ? parse(e.data) : new Uint8Array(e.data as ArrayBuffer)
          for (const f of this.listeners.message) f(v as In)
          return
        }
        if (typeof e.data === 'string' && !this.ready) {
          const m = parse(e.data) as { $raiko?: string; key?: string } | null
          if (m && typeof m === 'object' && m.$raiko === 'hello' && !m.key) {
            clearTimeout(helloTimer)
            this.markReady()
            return
          }
          if (m && typeof m === 'object' && m.$raiko === 'hello' && m.key) {
            clearTimeout(helloTimer)
            this.encrypted = true
            const pair = await createKeyPair()
            this.key = await deriveKeys(pair, m.key, 'client')
            ws.send(JSON.stringify({ $raiko: 'key', key: pair.publicKey }))
            this.markReady()
            return
          }
          // anything else before hello is not from a Raiko server: drop it
          return
        }
        // an encrypted socket never accepts plain text after the key exchange
        if (this.key && typeof e.data === 'string') throw new Error('Plain text frame on an encrypted socket')
        let value: unknown
        if (this.key && typeof e.data !== 'string') value = await decrypt(this.key, new Uint8Array(e.data as ArrayBuffer))
        else value = typeof e.data === 'string' ? parse(e.data) : new Uint8Array(e.data as ArrayBuffer)
        if (value && typeof value === 'object' && (value as { $raiko?: string }).$raiko === 'error') {
          for (const f of this.listeners.error) f(value)
          return
        }
        for (const f of this.listeners.message) f(value as In)
      }).catch((err) => {
        for (const f of this.listeners.error) f(err)
      })
    }
    ws.onerror = (e) => {
      for (const f of this.listeners.error) f(e)
    }
    ws.onclose = (e) => {
      clearTimeout(helloTimer)
      this.ready = false
      for (const f of this.listeners.close) f(e.code, e.reason)
      if (this.manual || this.o.reconnect === false || e.code === 1008) return
      const delay = Math.min(this.o.maxDelay ?? 10_000, 2 ** this.attempt * 250) * (0.5 + Math.random() / 2)
      this.attempt++
      for (const f of this.listeners.reconnecting) f(this.attempt)
      setTimeout(() => this.connect(), delay)
    }
  }

  private markReady() {
    if (this.ready) return
    this.ready = true
    this.attempt = 0
    for (const f of this.listeners.open) f()
    for (const m of this.queue.splice(0)) this.send(m as Out)
  }

  /** Send a value. Objects become JSON. Queued while offline. */
  send(data: Out): void {
    if (!this.ready || !this.ws || this.ws.readyState !== 1) {
      this.queue.push(data)
      return
    }
    const ws = this.ws
    if (this.key) {
      const key = this.key
      this.chain = this.chain.then(async () => ws.send((await encrypt(key, data)) as unknown as ArrayBuffer), () => {})
      return
    }
    ws.send(data instanceof Uint8Array ? data : typeof data === 'string' ? data : JSON.stringify(data))
  }

  on<K extends keyof Events<In>>(event: K, fn: Events<In>[K]): () => void {
    this.listeners[event].add(fn)
    return () => this.listeners[event].delete(fn)
  }

  /** Resolve with the next message that passes `filter`. */
  next(filter: (m: In) => boolean = () => true, timeout = 10_000): Promise<In> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => (off(), reject(new Error('timeout'))), timeout)
      const off = this.on('message', (m) => {
        if (!filter(m)) return
        clearTimeout(t)
        off()
        resolve(m)
      })
    })
  }

  close(code = 1000, reason = ''): void {
    this.manual = true
    this.ws?.close(code, reason)
  }
}

function parse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}
