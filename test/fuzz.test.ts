/**
 * Property based tests. Each property runs RUNS random cases (default 5000).
 * FUZZ_RUNS=100000 bun test test/fuzz.test.ts runs the full suite (over 1.5 million cases).
 */
import { describe, expect, it } from 'bun:test'
import fc from 'fast-check'
import { Router } from '../src/router'
import { t, validateSync } from '../src/schema'
import { escapeHtml, renderToString, jsx } from '../src/jsx/runtime'
import { parseCookies, serializeCookie, sign, unsign } from '../src/cookie'
import { parseQuery } from '../src/body'
import { splitUrl } from '../src/app'
import { encodeFrame, FrameDecoder } from '../src/adapters/node-ws'
import { encrypt, decrypt, createKeyPair, deriveKeys } from '../src/ws/crypto'
import { signJwt, verifyJwt, hashPassword, verifyPassword } from '../src/auth/jwt'
import { base32Decode, base32Encode, hotp } from '../src/auth/totp'
import { fillPath, buildQuery } from '../src/client'

const RUNS = Number(process.env.FUZZ_RUNS ?? 5000)
const opts = { numRuns: RUNS }
const seg = fc.stringMatching(/^[a-z0-9_-]{1,8}$/)

/** Reference router: every route compiled to a regex, first most specific wins. */
function reference(routes: string[], path: string): string | null {
  const score = (r: string) => r.split('/').map((s) => (s.startsWith('*') ? 0 : s.startsWith(':') ? 1 : 2))
  const sorted = [...routes].sort((a, b) => {
    const sa = score(a), sb = score(b)
    for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
      const x = sa[i] ?? -1, y = sb[i] ?? -1
      if (x !== y) return y - x
    }
    return 0
  })
  for (const r of sorted) {
    const re = new RegExp('^' + r.replace(/\/\*$/, '(?:/.*)?').replace(/:\w+/g, '[^/]+') + '$')
    if (re.test(path)) return r
  }
  return null
}

describe('fuzz: router', () => {
  it('static routes always match themselves', () => {
    fc.assert(fc.property(fc.array(fc.array(seg, { minLength: 1, maxLength: 5 }), { minLength: 1, maxLength: 30 }), (paths) => {
      const r = new Router<string>()
      const uniq = [...new Set(paths.map((p) => '/' + p.join('/')))]
      for (const p of uniq) r.add('GET', p, p)
      for (const p of uniq) expect(r.find('GET', p)?.store).toBe(p)
    }), opts)
  })
  it('params capture exactly the segment', () => {
    fc.assert(fc.property(seg, fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes('/') && !s.includes('%')), (prefix, value) => {
      const r = new Router<number>()
      r.add('GET', `/${prefix}/:id`, 1)
      expect(r.find('GET', `/${prefix}/${value}`)?.params.id).toBe(value)
    }), opts)
  })
  it('agrees with a regex reference router on mixed trees', () => {
    const pattern = fc.array(fc.oneof(seg, fc.constant(':p'), fc.constant(':q')), { minLength: 1, maxLength: 4 })
    fc.assert(fc.property(fc.array(pattern, { minLength: 1, maxLength: 12 }), fc.array(fc.array(fc.oneof(seg, fc.constantFrom('a', 'b', 'x')), { minLength: 1, maxLength: 4 }), { maxLength: 10 }), (patterns, probes) => {
      const r = new Router<string>()
      const routes: string[] = []
      for (const p of patterns) {
        // a param name is fixed per position, like real apps
        const route = '/' + p.map((s, i) => (s.startsWith(':') ? `:p${i}` : s)).join('/')
        if (routes.includes(route)) continue
        r.add('GET', route, route)
        routes.push(route)
      }
      for (const probe of probes) {
        const path = '/' + probe.join('/')
        const got = r.find('GET', path)?.store ?? null
        const want = reference(routes, path)
        if ((got === null) !== (want === null)) throw new Error(`${path}: router=${got} reference=${want} routes=${routes}`)
      }
    }), { numRuns: Math.ceil(RUNS / 2) })
  })
  it('splitUrl matches URL()', () => {
    fc.assert(fc.property(fc.webUrl({ withQueryParameters: true, withFragments: true }), (u) => {
      const url = new URL(u)
      const s = splitUrl(url.href)
      expect(s.path).toBe(url.pathname)
      expect(s.search).toBe(url.search.slice(1))
    }), opts)
  })
})

describe('fuzz: schema', () => {
  it('numbers round trip through coercion', () => {
    fc.assert(fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (n) => {
      const r = validateSync(t.Number(), String(n), { coerce: true })
      expect(r.ok && Object.is(r.value, Number(String(n)))).toBe(true)
    }), opts)
  })
  it('never accepts non numeric strings as numbers', () => {
    fc.assert(fc.property(fc.string().filter((s) => s.trim() === '' || Number.isNaN(Number(s)) || !Number.isFinite(Number(s))), (s) => {
      expect(validateSync(t.Number(), s, { coerce: true }).ok).toBe(false)
    }), opts)
  })
  it('valid objects pass, output only has declared keys', () => {
    const S = t.Object({ a: t.String(), b: t.Integer(), c: t.Optional(t.Boolean()) })
    fc.assert(fc.property(fc.record({ a: fc.string(), b: fc.integer(), c: fc.option(fc.boolean(), { nil: undefined }) }), fc.dictionary(fc.string(), fc.anything()), (v, extra) => {
      const r = validateSync(S, { ...extra, ...v })
      expect(r.ok).toBe(true)
      if (r.ok) for (const k of Object.keys(r.value)) expect(['a', 'b', 'c']).toContain(k)
    }), opts)
  })
  it('never throws on any input', () => {
    const S = t.Object({ a: t.Array(t.Union([t.String({ format: 'email' }), t.Number({ minimum: 0 })])), b: t.Record(t.Nullable(t.Integer())) })
    fc.assert(fc.property(fc.anything(), (v) => {
      validateSync(S, v)
      validateSync(S, v, { coerce: true })
    }), opts)
  })
})

describe('fuzz: html escaping', () => {
  it('text never produces tags', () => {
    fc.assert(fc.property(fc.string(), (s) => {
      const out = escapeHtml(s)
      expect(out).not.toMatch(/[<>"']/)
      expect(out.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')).toBe(s)
    }), opts)
  })
  it('attributes cannot break out', async () => {
    await fc.assert(fc.asyncProperty(fc.string(), fc.string(), async (v, child) => {
      const html = await renderToString(jsx('a', { title: v, children: child }))
      expect(html.startsWith('<a title="')).toBe(true)
      expect(html.slice(10).indexOf('"')).toBe(html.indexOf('">') - 10)
      expect((html.match(/</g) ?? []).length).toBe(2)
    }), opts)
  })
})

describe('fuzz: cookies, query, client paths', () => {
  it('serialize then parse returns the value', () => {
    fc.assert(fc.property(fc.stringMatching(/^[A-Za-z0-9_-]{1,16}$/), fc.string(), (name, value) => {
      const header = serializeCookie(name, value).split(';')[0]!
      expect(parseCookies(header)[name]).toBe(value)
    }), opts)
  })
  it('parseQuery agrees with URLSearchParams', () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.string({ minLength: 1 }), fc.string())), (pairs) => {
      const sp = new URLSearchParams(pairs)
      const q = parseQuery(sp.toString())
      for (const k of new Set(pairs.map((p) => p[0]))) {
        const all = sp.getAll(k)
        const key = k.endsWith('[]') ? k.slice(0, -2) : k
        const got = q[key]
        if (!k.endsWith('[]') && !pairs.some((p) => p[0] === key + '[]')) expect(Array.isArray(got) ? got : [got]).toEqual(all)
      }
    }), opts)
  })
  it('client fillPath and buildQuery round trip', () => {
    fc.assert(fc.property(fc.string({ minLength: 1 }).filter((x) => x !== '.' && x !== '..'), fc.dictionary(fc.string({ minLength: 1 }), fc.string()), (id, q) => {
      const p = fillPath('/users/:id', { id })
      expect(decodeURIComponent(p.slice(7))).toBe(id)
      const back = new URLSearchParams(buildQuery(q).slice(1))
      for (const [k, v] of Object.entries(q)) expect(back.get(k)).toBe(v)
    }), opts)
  })
})

describe('fuzz: websocket framing', () => {
  it('any message survives any chunking', () => {
    fc.assert(fc.property(fc.array(fc.oneof(fc.string(), fc.uint8Array({ maxLength: 70000 })), { minLength: 1, maxLength: 5 }), fc.array(fc.integer({ min: 1, max: 4000 }), { minLength: 1, maxLength: 20 }), (msgs, cuts) => {
      const got: (string | Uint8Array)[] = []
      const d = new FrameDecoder(1 << 24, { message: (op, b) => got.push(op === 1 ? b.toString('utf8') : new Uint8Array(b)), ping() {}, pong() {}, close() {}, error: (c, r) => { throw new Error(`${c} ${r}`) } }, false)
      const all = Buffer.concat(msgs.map((m) => (typeof m === 'string' ? encodeFrame(1, Buffer.from(m)) : encodeFrame(2, m))))
      let off = 0, i = 0
      while (off < all.length) {
        const n = cuts[i++ % cuts.length]!
        d.push(all.subarray(off, off + n))
        off += n
      }
      expect(got.length).toBe(msgs.length)
      msgs.forEach((m, k) => expect(typeof m === 'string' ? got[k] : Buffer.from(got[k] as Uint8Array).equals(Buffer.from(m))).toBe(typeof m === 'string' ? m : true))
    }), { numRuns: Math.ceil(RUNS / 10) })
  })
  it('garbage never crashes the decoder', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 512 }), (bytes) => {
      const d = new FrameDecoder(1024, { message() {}, ping() {}, pong() {}, close() {}, error() {} })
      d.push(Buffer.from(bytes))
    }), opts)
  })
})

describe('fuzz: crypto', () => {
  it('AES-GCM round trip for any JSON value', async () => {
    const a = await createKeyPair(), b = await createKeyPair()
    const client = await deriveKeys(a, b.publicKey, 'client'), server = await deriveKeys(b, a.publicKey, 'server')
    await fc.assert(fc.asyncProperty(fc.jsonValue(), async (v) => {
      const frame = await encrypt(client, v)
      expect(await decrypt(server, frame)).toEqual(JSON.parse(JSON.stringify(v)))
      // the same frame twice is a replay, and a frame never decrypts in the other direction
      await expect(decrypt(server, frame)).rejects.toThrow()
      await expect(decrypt(client, frame)).rejects.toThrow()
    }), { numRuns: Math.ceil(RUNS / 5) })
  })
  it('tampered signed values are rejected', async () => {
    await fc.assert(fc.asyncProperty(fc.string(), fc.integer({ min: 0, max: 200 }), async (v, pos) => {
      const s = await sign(v, 'secret-secret')
      expect(await unsign(s, 'secret-secret')).toBe(v)
      const i = pos % s.length
      const flipped = s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1)
      if (flipped !== s && i > s.lastIndexOf('.')) expect(await unsign(flipped, 'secret-secret')).toBeNull()
    }), { numRuns: Math.ceil(RUNS / 5) })
  })
  it('jwt round trip and wrong secret', async () => {
    // exp, nbf and iat are time claims with their own rules, tested on their own below
    const RESERVED = new Set(['exp', 'nbf', 'iat'])
    await fc.assert(fc.asyncProperty(fc.dictionary(fc.stringMatching(/^[a-z]{1,6}$/).filter((k) => !RESERVED.has(k)), fc.oneof(fc.string(), fc.integer())), async (claims) => {
      const tok = await signJwt(claims, 'a-very-long-secret-value')
      expect(await verifyJwt(tok, 'a-very-long-secret-value')).toMatchObject(claims)
      expect(await verifyJwt(tok, 'another-long-secret-value')).toBeNull()
    }), { numRuns: Math.ceil(RUNS / 5) })
  })
  it('base32 round trip', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 64 }), (b) => {
      const back = base32Decode(base32Encode(b))
      expect(Buffer.from(back).equals(Buffer.from(b))).toBe(true)
    }), opts)
  })
})

describe('jwt time claims', () => {
  it('rejects expired and not yet valid tokens, accepts current ones', async () => {
    const now = Math.floor(Date.now() / 1000)
    const secret = 'a-very-long-secret-value'
    expect(await verifyJwt(await signJwt({ exp: 0 }, secret), secret)).toBeNull()
    expect(await verifyJwt(await signJwt({ exp: now - 1 }, secret), secret)).toBeNull()
    expect(await verifyJwt(await signJwt({ nbf: now + 60 }, secret), secret)).toBeNull()
    expect(await verifyJwt(await signJwt({ exp: now + 60, nbf: now - 1 }, secret), secret)).toMatchObject({ exp: now + 60 })
  })
})

describe('known vectors', () => {
  it('HOTP matches RFC 4226 appendix D', async () => {
    const secret = new TextEncoder().encode('12345678901234567890')
    const want = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489']
    for (let i = 0; i < 10; i++) expect(await hotp(secret, i)).toBe(want[i]!)
  })
  it('passwords hash and verify', async () => {
    const h = await hashPassword('correct horse', 1000)
    expect(await verifyPassword('correct horse', h)).toBe(true)
    expect(await verifyPassword('wrong', h)).toBe(false)
  })
})
