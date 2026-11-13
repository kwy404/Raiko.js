/**
 * Message encryption for WebSockets: ECDH P-256 key agreement, HKDF SHA-256,
 * AES-GCM 256. Pure WebCrypto, shared by the server and the browser client.
 *
 * Frame layout: [8 byte counter][ciphertext + 16 byte tag], nonce = counter, one key per direction
 * Plaintext layout: [1 byte kind: 0 = JSON text, 1 = raw bytes][payload]
 */

import { b64url, fromB64url } from '../cookie'

export interface KeyPair {
  keys: CryptoKeyPair
  publicKey: string
}

/** One key per direction, so a frame can never be reflected back to its sender. */
export interface SessionKeys {
  send: CryptoKey
  receive: CryptoKey
  /** next counter to send, and the next one expected: replays and reordering are refused */
  sendSeq: number
  receiveSeq: number
}

export async function createKeyPair(): Promise<KeyPair> {
  const keys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])) as CryptoKeyPair
  const raw = await crypto.subtle.exportKey('raw', keys.publicKey)
  return { keys, publicKey: b64url(raw) }
}

export async function deriveKeys(own: KeyPair, peerPublic: string, role: 'server' | 'client'): Promise<SessionKeys> {
  const peer = await crypto.subtle.importKey('raw', fromB64url(peerPublic) as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, own.keys.privateKey, 256)
  const hkdf = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
  const make = (info: string) =>
    crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(info) }, hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const [c2s, s2c] = await Promise.all([make('raiko-ws-v2 client to server'), make('raiko-ws-v2 server to client')])
  return role === 'server' ? { send: s2c, receive: c2s, sendSeq: 0, receiveSeq: 0 } : { send: c2s, receive: s2c, sendSeq: 0, receiveSeq: 0 }
}

/** The nonce is the frame counter, unique per key, so it can never repeat. */
function nonce(seq: number): Uint8Array {
  const iv = new Uint8Array(12)
  new DataView(iv.buffer).setBigUint64(4, BigInt(seq))
  return iv
}

/** Frame: [8 byte counter][ciphertext + tag]. Plaintext: [kind: 0 JSON, 1 bytes][payload]. */
export async function encrypt(k: SessionKeys, value: unknown): Promise<Uint8Array> {
  const isBytes = value instanceof Uint8Array
  const payload = isBytes ? value : new TextEncoder().encode(JSON.stringify(value === undefined ? null : value))
  const plain = new Uint8Array(payload.byteLength + 1)
  plain[0] = isBytes ? 1 : 0
  plain.set(payload, 1)
  const seq = k.sendSeq++
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce(seq) as BufferSource }, k.send, plain))
  const out = new Uint8Array(8 + ct.byteLength)
  new DataView(out.buffer).setBigUint64(0, BigInt(seq))
  out.set(ct, 8)
  return out
}

export async function decrypt(k: SessionKeys, frame: Uint8Array): Promise<unknown> {
  if (frame.byteLength < 8 + 16 + 1) throw new Error('Encrypted frame too short')
  const seq = Number(new DataView(frame.buffer, frame.byteOffset, 8).getBigUint64(0))
  if (seq !== k.receiveSeq) throw new Error('Replayed or out of order frame')
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce(seq) as BufferSource }, k.receive, frame.subarray(8)))
  k.receiveSeq++
  const body = plain.subarray(1)
  return plain[0] === 1 ? body.slice() : JSON.parse(new TextDecoder().decode(body))
}
