/**
 * RFC 6455 WebSocket server for Node, with no dependencies.
 * Handles the handshake, masking, fragmentation, ping/pong and the close
 * handshake. Used by the Node adapter so `app.ws()` works on Node too.
 */
import { createHash } from 'node:crypto'
import type { Duplex } from 'node:stream'
import type { RawSocket } from '../ws/types'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

export interface NodeWsEvents {
  message(data: string | Uint8Array): void
  close(code: number, reason: string): void
}

export function acceptKey(key: string): string {
  return createHash('sha1').update(key + GUID).digest('base64')
}

/** Answer the HTTP upgrade. Returns false when the request is not a valid handshake. */
export function handshake(socket: Duplex, headers: Record<string, string | string[] | undefined>): boolean {
  const key = headers['sec-websocket-key']
  const version = headers['sec-websocket-version']
  if (typeof key !== 'string' || !/^[A-Za-z0-9+/]{22}==$/.test(key) || version !== '13') {
    socket.end('HTTP/1.1 400 Bad Request\r\nconnection: close\r\n\r\n')
    return false
  }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`,
  )
  return true
}

/** Encode one server frame (never masked, per the spec). */
export function encodeFrame(opcode: number, payload: Uint8Array, fin = true): Buffer {
  const len = payload.byteLength
  const head = len < 126 ? 2 : len < 65536 ? 4 : 10
  const out = Buffer.allocUnsafe(head + len)
  out[0] = (fin ? 0x80 : 0) | opcode
  if (len < 126) out[1] = len
  else if (len < 65536) {
    out[1] = 126
    out.writeUInt16BE(len, 2)
  } else {
    out[1] = 127
    out.writeUInt32BE(Math.floor(len / 2 ** 32), 2)
    out.writeUInt32BE(len >>> 0, 6)
  }
  out.set(payload, head)
  return out
}

/**
 * Incremental frame decoder. Feed it bytes, it emits complete messages.
 * Exported for the fuzz tests.
 */
export class FrameDecoder {
  private buf: Buffer = Buffer.alloc(0)
  private fragments: Buffer[] = []
  private fragmentOpcode = 0
  private fragmentSize = 0

  constructor(
    private readonly maxPayload: number,
    private readonly on: {
      message(opcode: 1 | 2, data: Buffer): void
      ping(data: Buffer): void
      pong(data: Buffer): void
      close(code: number, reason: string): void
      error(code: number, reason: string): void
    },
    /** clients must mask; set false to decode server frames in tests */
    private readonly requireMask = true,
  ) {}

  push(chunk: Buffer): void {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk
    while (this.step()) {}
  }

  private step(): boolean {
    const b = this.buf
    if (b.length < 2) return false
    const fin = (b[0]! & 0x80) !== 0
    const rsv = b[0]! & 0x70
    const opcode = b[0]! & 0x0f
    const masked = (b[1]! & 0x80) !== 0
    let len = b[1]! & 0x7f
    let off = 2
    if (rsv) return this.fail(1002, 'Reserved bits set')
    if (this.requireMask && !masked) return this.fail(1002, 'Client frames must be masked')
    if (len === 126) {
      if (b.length < 4) return false
      len = b.readUInt16BE(2)
      off = 4
    } else if (len === 127) {
      if (b.length < 10) return false
      const hi = b.readUInt32BE(2)
      if (hi > 0x1fffff) return this.fail(1009, 'Message too big')
      len = hi * 2 ** 32 + b.readUInt32BE(6)
      off = 10
    }
    const isControl = opcode >= 8
    if (isControl && (len > 125 || !fin)) return this.fail(1002, 'Invalid control frame')
    if (len > this.maxPayload || this.fragmentSize + len > this.maxPayload) return this.fail(1009, 'Message too big')
    const maskLen = masked ? 4 : 0
    if (b.length < off + maskLen + len) return false
    const payload = Buffer.from(b.subarray(off + maskLen, off + maskLen + len))
    if (masked) {
      const m0 = b[off]!, m1 = b[off + 1]!, m2 = b[off + 2]!, m3 = b[off + 3]!
      for (let i = 0; i < payload.length; i++) payload[i]! ^= i % 4 === 0 ? m0 : i % 4 === 1 ? m1 : i % 4 === 2 ? m2 : m3
    }
    this.buf = b.subarray(off + maskLen + len)

    switch (opcode) {
      case 0x0: {
        if (!this.fragmentOpcode) return this.fail(1002, 'Unexpected continuation frame')
        this.fragments.push(payload)
        this.fragmentSize += payload.length
        if (fin) {
          const all = Buffer.concat(this.fragments)
          const op = this.fragmentOpcode as 1 | 2
          this.fragments = []
          this.fragmentOpcode = 0
          this.fragmentSize = 0
          return this.emit(op, all)
        }
        return true
      }
      case 0x1:
      case 0x2:
        if (this.fragmentOpcode) return this.fail(1002, 'Expected continuation frame')
        if (fin) return this.emit(opcode, payload)
        this.fragmentOpcode = opcode
        this.fragments = [payload]
        this.fragmentSize = payload.length
        return true
      case 0x8: {
        if (payload.length === 1) return this.fail(1002, 'Invalid close payload')
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005
        const reason = payload.length > 2 ? payload.subarray(2).toString('utf8') : ''
        this.on.close(code, reason)
        return false
      }
      case 0x9:
        this.on.ping(payload)
        return true
      case 0xa:
        this.on.pong(payload)
        return true
      default:
        return this.fail(1002, `Unknown opcode ${opcode}`)
    }
  }

  private emit(opcode: 1 | 2, data: Buffer): boolean {
    if (opcode === 1 && !isValidUtf8(data)) return this.fail(1007, 'Invalid UTF-8')
    this.on.message(opcode, data)
    return true
  }

  private fail(code: number, reason: string): false {
    this.buf = Buffer.alloc(0)
    this.on.error(code, reason)
    return false
  }
}

const fatalDecoder = new TextDecoder('utf-8', { fatal: true })
function isValidUtf8(b: Buffer): boolean {
  try {
    fatalDecoder.decode(b)
    return true
  } catch {
    return false
  }
}

/** Turn an upgraded Node socket into a RawSocket and stream its events. */
export function wrapNodeSocket(socket: Duplex, maxPayload: number, events: NodeWsEvents, head?: Buffer): RawSocket {
  let closed = false
  let closeSent = false
  const sendClose = (code: number, reason: string) => {
    if (closeSent) return
    closeSent = true
    const r = Buffer.from(reason.slice(0, 120))
    const p = Buffer.allocUnsafe(2 + r.length)
    p.writeUInt16BE(code, 0)
    r.copy(p, 2)
    socket.write(encodeFrame(0x8, p))
  }
  const finish = (code: number, reason: string) => {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    events.close(code, reason)
    socket.end()
    setTimeout(() => socket.destroy(), 1000).unref?.()
  }
  let alive = true
  const decoder = new FrameDecoder(maxPayload, {
    message: (op, data) => events.message(op === 1 ? data.toString('utf8') : new Uint8Array(data)),
    ping: (d) => socket.write(encodeFrame(0xa, d)),
    pong: () => (alive = true),
    close: (code, reason) => {
      sendClose(code === 1005 ? 1000 : code, '')
      finish(code, reason)
    },
    error: (code, reason) => {
      sendClose(code, reason)
      finish(code, reason)
    },
  })
  // ping every 30s, drop dead peers
  const heartbeat = setInterval(() => {
    if (!alive) return finish(1006, 'Ping timeout')
    alive = false
    socket.write(encodeFrame(0x9, Buffer.alloc(0)))
  }, 30_000)
  heartbeat.unref?.()

  socket.on('data', (c: Buffer) => decoder.push(c))
  socket.on('close', () => finish(1006, ''))
  socket.on('error', () => finish(1006, ''))
  if (head && head.length) queueMicrotask(() => decoder.push(head))

  return {
    send(data) {
      if (closed) return
      socket.write(typeof data === 'string' ? encodeFrame(0x1, Buffer.from(data)) : encodeFrame(0x2, data))
    },
    close(code = 1000, reason = '') {
      sendClose(code, reason)
      finish(code, reason)
    },
  }
}
