/** TOTP two factor auth (RFC 6238 / RFC 4226), compatible with Google Authenticator. */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '')
  const out: number[] = []
  let bits = 0, value = 0
  for (const c of clean) {
    const i = B32.indexOf(c)
    if (i === -1) throw new Error('error[RK0402]: invalid base32 character in TOTP secret')
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

/** 20 random bytes, base32: what authenticator apps expect. */
export const generateTotpSecret = (): string => base32Encode(crypto.getRandomValues(new Uint8Array(20)))

/** otpauth:// URI. Render it as a QR code for the user to scan. */
export function totpUri(o: { secret: string; account: string; issuer: string; digits?: number; period?: number }): string {
  const label = encodeURIComponent(`${o.issuer}:${o.account}`)
  const q = new URLSearchParams({ secret: o.secret, issuer: o.issuer, algorithm: 'SHA1', digits: String(o.digits ?? 6), period: String(o.period ?? 30) })
  return `otpauth://totp/${label}?${q}`
}

export async function hotp(secret: Uint8Array, counter: number, digits = 6): Promise<string> {
  const msg = new Uint8Array(8)
  let c = counter
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 255
    c = Math.floor(c / 256)
  }
  const key = await crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg))
  const off = h[h.length - 1]! & 15
  const code = ((h[off]! & 127) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!
  return String(code % 10 ** digits).padStart(digits, '0')
}

export async function totp(secret: string, o: { time?: number; period?: number; digits?: number } = {}): Promise<string> {
  const step = Math.floor((o.time ?? Date.now()) / 1000 / (o.period ?? 30))
  return hotp(base32Decode(secret), step, o.digits)
}

/** Accepts the current code and `window` steps before and after (clock drift). */
export async function verifyTotp(secret: string, code: string, o: { window?: number; time?: number; period?: number; digits?: number } = {}): Promise<boolean> {
  if (!/^\d{6,8}$/.test(code.trim())) return false
  const period = o.period ?? 30
  const now = o.time ?? Date.now()
  const w = o.window ?? 1
  const bytes = base32Decode(secret)
  const step = Math.floor(now / 1000 / period)
  let ok = false
  for (let i = -w; i <= w; i++) if ((await hotp(bytes, step + i, o.digits)) === code.trim()) ok = true
  return ok
}

/** Like verifyTotp, but returns the matched time step (for replay protection) or null. */
export async function totpStep(secret: string, code: string, o: { window?: number; time?: number; period?: number; digits?: number } = {}): Promise<number | null> {
  if (!/^\d{6,8}$/.test(code.trim())) return null
  const period = o.period ?? 30
  const w = o.window ?? 1
  const bytes = base32Decode(secret)
  const step = Math.floor((o.time ?? Date.now()) / 1000 / period)
  let found: number | null = null
  for (let i = -w; i <= w; i++) if ((await hotp(bytes, step + i, o.digits)) === code.trim()) found = step + i
  return found
}

/** One time recovery codes like "k7f2-9xqa". Store their hashes, show the plain ones once. */
export function recoveryCodes(count = 10): string[] {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: count }, () => {
    const b = crypto.getRandomValues(new Uint8Array(8))
    const s = Array.from(b, (x) => a[x % a.length]).join('')
    return `${s.slice(0, 4)}-${s.slice(4)}`
  })
}
