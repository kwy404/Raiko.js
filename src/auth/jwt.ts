/** HS256 JWT on WebCrypto. Works on every runtime. */
import { b64url, fromB64url } from '../cookie'

const enc = new TextEncoder()
const dec = new TextDecoder()
const keys = new Map<string, Promise<CryptoKey>>()
const key = (s: string) => {
  let k = keys.get(s)
  if (!k) keys.set(s, (k = crypto.subtle.importKey('raw', enc.encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])))
  return k
}

export interface JwtPayload {
  sub?: string
  exp?: number
  iat?: number
  nbf?: number
  [k: string]: unknown
}

export async function signJwt(payload: JwtPayload, secret: string, expiresIn?: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const body = { iat: now, ...(expiresIn ? { exp: now + expiresIn } : {}), ...payload }
  const data = `${b64url(enc.encode('{"alg":"HS256","typ":"JWT"}'))}.${b64url(enc.encode(JSON.stringify(body)))}`
  return `${data}.${b64url(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(data)))}`
}

/** The payload, or null when invalid, expired or not yet valid. */
export async function verifyJwt<T extends JwtPayload = JwtPayload>(token: string, secret: string): Promise<T | null> {
  const p = token.split('.')
  if (p.length !== 3) return null
  try {
    if (JSON.parse(dec.decode(fromB64url(p[0]!))).alg !== 'HS256') return null
    if (!(await crypto.subtle.verify('HMAC', await key(secret), fromB64url(p[2]!) as BufferSource, enc.encode(`${p[0]}.${p[1]}`)))) return null
    const body = JSON.parse(dec.decode(fromB64url(p[1]!))) as T
    const now = Math.floor(Date.now() / 1000)
    if (typeof body.exp === 'number' && body.exp <= now) return null
    if (typeof body.nbf === 'number' && body.nbf > now) return null
    return body
  } catch {
    return null
  }
}

/** PBKDF2 SHA-256, 210k iterations (OWASP 2023). Format: pbkdf2$iter$salt$hash */
export async function hashPassword(password: string, iterations = 210_000): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const bits = await pbkdf2(password, salt, iterations)
  return `pbkdf2$${iterations}$${b64url(salt)}$${b64url(bits)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, iter, salt, hash] = stored.split('$')
  if (alg !== 'pbkdf2' || !iter || !salt || !hash) return false
  const bits = new Uint8Array(await pbkdf2(password, fromB64url(salt), Number(iter)))
  const want = fromB64url(hash)
  if (bits.length !== want.length) return false
  let diff = 0
  for (let i = 0; i < bits.length; i++) diff |= bits[i]! ^ want[i]!
  return diff === 0
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, base, 256)
}
