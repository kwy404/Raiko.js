/**
 * Cookies: read from the request, write with `cookie.set()`.
 * Signed cookies use HMAC SHA-256 through WebCrypto, so they work on every runtime.
 */

export interface CookieOptions {
  domain?: string
  path?: string
  maxAge?: number
  expires?: Date
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
  partitioned?: boolean
}

export function parseCookies(header: string | null): Record<string, string> {
  // null prototype: names like __proto__ or valueOf are plain keys
  const out: Record<string, string> = Object.create(null)
  if (!header) return out
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (!name || name in out) continue
    let value = part.slice(eq + 1).trim()
    if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') value = value.slice(1, -1)
    try {
      out[name] = decodeURIComponent(value)
    } catch {
      out[name] = value
    }
  }
  return out
}

const NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

export function serializeCookie(name: string, value: string, o: CookieOptions = {}): string {
  if (!NAME_RE.test(name)) throw new TypeError(`Invalid cookie name: ${name}`)
  let s = `${name}=${encodeURIComponent(value)}`
  if (o.maxAge !== undefined) s += `; Max-Age=${Math.floor(o.maxAge)}`
  if (o.expires) s += `; Expires=${o.expires.toUTCString()}`
  if (o.domain) s += `; Domain=${o.domain}`
  s += `; Path=${o.path ?? '/'}`
  if (o.httpOnly) s += '; HttpOnly'
  if (o.secure || o.sameSite === 'None' || o.partitioned) s += '; Secure'
  if (o.sameSite) s += `; SameSite=${o.sameSite}`
  if (o.partitioned) s += '; Partitioned'
  return s
}

const enc = new TextEncoder()
const keyCache = new Map<string, Promise<CryptoKey>>()

function hmacKey(secret: string) {
  let k = keyCache.get(secret)
  if (!k) {
    k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
    keyCache.set(secret, k)
  }
  return k
}

export function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function sign(value: string, secret: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(value))
  return `${value}.${b64url(sig)}`
}

/** Returns the original value, or null when the signature does not match any secret. */
export async function unsign(signed: string, secrets: string | string[]): Promise<string | null> {
  const dot = signed.lastIndexOf('.')
  if (dot < 0) return null
  const value = signed.slice(0, dot)
  let sig: Uint8Array
  try {
    sig = fromB64url(signed.slice(dot + 1))
  } catch {
    return null
  }
  // only the canonical encoding is valid, so a signature has exactly one spelling
  if (b64url(sig) !== signed.slice(dot + 1)) return null
  for (const secret of Array.isArray(secrets) ? secrets : [secrets]) {
    if (await crypto.subtle.verify('HMAC', await hmacKey(secret), sig, enc.encode(value))) return value
  }
  return null
}

export class Cookies {
  private parsed: Record<string, string> | null = null
  /** Set-Cookie values queued for the response */
  readonly outgoing: string[] = []

  constructor(
    private readonly header: string | null,
    private readonly secrets?: string | string[],
  ) {}

  private all() {
    return (this.parsed ??= parseCookies(this.header))
  }

  get(name: string): string | undefined {
    return this.all()[name]
  }

  has(name: string): boolean {
    return name in this.all()
  }

  entries(): Record<string, string> {
    return Object.assign(Object.create(null), this.all())
  }

  set(name: string, value: string, opts: CookieOptions = {}): void {
    this.all()[name] = value
    this.outgoing.push(serializeCookie(name, value, { httpOnly: true, sameSite: 'Lax', ...opts }))
  }

  delete(name: string, opts: Pick<CookieOptions, 'path' | 'domain'> = {}): void {
    delete this.all()[name]
    this.outgoing.push(serializeCookie(name, '', { ...opts, maxAge: 0, expires: new Date(0) }))
  }

  /** Read a signed cookie. Null when missing or tampered with. */
  async getSigned(name: string): Promise<string | null> {
    const v = this.get(name)
    if (v === undefined) return null
    return unsign(v, this.requireSecrets())
  }

  async setSigned(name: string, value: string, opts: CookieOptions = {}): Promise<void> {
    const secrets = this.requireSecrets()
    this.set(name, await sign(value, Array.isArray(secrets) ? secrets[0]! : secrets), opts)
  }

  private requireSecrets() {
    if (!this.secrets || (Array.isArray(this.secrets) && !this.secrets.length))
      throw new Error('Signed cookies need a secret: new Raiko({ cookie: { secrets: "..." } })')
    return this.secrets
  }
}
