/**
 * Raiko Auth: OAuth (PKCE + state), credentials, TOTP 2FA, JWT cookie sessions.
 *
 *   const auth = raikoAuth({ secret, providers: [GitHub({...}), Credentials({...})] })
 *   app.use(auth.plugin).get('/me', ({ auth }) => auth?.user, { beforeHandle: auth.protect })
 */
import { Raiko } from '../app'
import { HttpError } from '../error'
import { b64url } from '../cookie'
import { signJwt, verifyJwt } from './jwt'
import { totpStep } from './totp'
import type { AuthUser, Provider, OAuthProvider } from './providers'

export * from './providers'
export * from './jwt'
export * from './totp'

export interface Session {
  user: AuthUser
  provider: string
  expires: string
}

export interface AuthConfig {
  /** at least 32 random characters, keep it in an env variable */
  secret: string
  providers: Provider[]
  /** default /auth */
  basePath?: string
  /** session lifetime in seconds, default 30 days */
  maxAge?: number
  /** public URL of the app, needed behind proxies for OAuth redirect URIs */
  url?: string
  pages?: { signIn?: string; twoFactor?: string; error?: string }
  twoFactor?: {
    /** return the user's TOTP secret when 2FA is on for them, null otherwise */
    getSecret(user: AuthUser): string | null | Promise<string | null>
  }
  callbacks?: {
    /** return false to refuse, or a new user object to store in the session */
    signIn?(o: { user: AuthUser; provider: string }): boolean | AuthUser | Promise<boolean | AuthUser>
    session?(s: Session): Session | Promise<Session>
  }
}

const COOKIE = 'raiko.session'
const PENDING = 'raiko.2fa'
const FLOW = 'raiko.oauth'

/** Only allow redirects to paths on this site. Blocks open redirects. */
export function safeCallback(url: unknown, fallback = '/'): string {
  // control characters and backslashes are stripped or rewritten by browsers, so "/\t/evil" becomes "//evil"
  if (typeof url !== 'string' || !url.startsWith('/') || /[\x00-\x1f\x7f\\]/.test(url) || url.startsWith('//')) return fallback
  try {
    const u = new URL(url, 'https://raiko.invalid')
    return u.host === 'raiko.invalid' ? u.pathname + u.search + u.hash : fallback
  } catch {
    return fallback
  }
}

async function sha256b64(s: string) {
  return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
}

export function raikoAuth(config: AuthConfig) {
  if (!config.secret || config.secret.length < 32)
    throw new Error('error[RK0400]: auth secret must have at least 32 characters\n  = help: run `npx raiko secret` and put it in AUTH_SECRET')
  const base = config.basePath ?? '/auth'
  const maxAge = config.maxAge ?? 60 * 60 * 24 * 30
  const providers = new Map(config.providers.map((p) => [p.id, p]))
  // behind a TLS proxy request.url is http, so trust the configured public URL too
  const secure = (req: Request) => new URL(req.url).protocol === 'https:' || (config.url ?? '').startsWith('https:')
  // 2FA: at most 5 tries per pending sign in, and each TOTP step works once per user
  const attempts = new Map<string, number>()
  const usedStep = new Map<string, number>()
  const trim = (m: Map<string, number>) => {
    if (m.size > 50_000) m.delete(m.keys().next().value!)
  }
  const origin = (req: Request) => config.url ?? new URL(req.url).origin

  const readSession = async (token: string | undefined): Promise<Session | null> => {
    if (!token) return null
    const p = await verifyJwt<{ session: Session }>(token, config.secret)
    return p?.session ?? null
  }

  /** Finish a sign in: run callbacks, 2FA if needed, then set the session cookie. */
  const complete = async (ctx: any, user: AuthUser, provider: string, callbackUrl: string, passed2fa = false): Promise<Response> => {
    const ok = config.callbacks?.signIn ? await config.callbacks.signIn({ user, provider }) : true
    if (ok === false) return ctx.redirect(`${config.pages?.error ?? base + '/error'}?error=AccessDenied`, 303)
    if (typeof ok === 'object') user = ok
    if (!passed2fa && config.twoFactor && (await config.twoFactor.getSecret(user))) {
      const jti = b64url(crypto.getRandomValues(new Uint8Array(16)))
      ctx.cookie.set(PENDING, await signJwt({ user, provider, callbackUrl, jti }, config.secret, 300), { secure: secure(ctx.request), maxAge: 300 })
      return ctx.redirect(config.pages?.twoFactor ?? `${base}/2fa`, 303)
    }
    let session: Session = { user, provider, expires: new Date(Date.now() + maxAge * 1000).toISOString() }
    if (config.callbacks?.session) session = await config.callbacks.session(session)
    ctx.cookie.set(COOKIE, await signJwt({ sub: user.id, session }, config.secret, maxAge), { secure: secure(ctx.request), maxAge, sameSite: 'Lax' })
    return ctx.redirect(callbackUrl, 303)
  }

  const plugin = new Raiko({ name: 'raiko:auth', prefix: base })
    .derive(async ({ cookie }) => ({ auth: await readSession(cookie.get(COOKIE)) }), 'global')
    .get('/session', ({ auth }) => auth ?? null)
    .get('/providers', () => config.providers.map((p) => ({ id: p.id, name: p.name, type: p.type })))
    .get('/signin/:provider', async (ctx) => {
      const p = providers.get(ctx.params.provider)
      if (!p || p.type !== 'oauth') throw new HttpError(404, `Unknown provider "${ctx.params.provider}"`)
      const state = b64url(crypto.getRandomValues(new Uint8Array(24)))
      const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)))
      const callbackUrl = safeCallback(ctx.query.callbackUrl)
      ctx.cookie.set(FLOW, await signJwt({ state, verifier, callbackUrl }, config.secret, 600), { secure: secure(ctx.request), maxAge: 600 })
      const u = new URL(p.authorizeUrl)
      u.search = new URLSearchParams({
        client_id: p.clientId,
        redirect_uri: `${origin(ctx.request)}${base}/callback/${p.id}`,
        response_type: 'code',
        scope: p.scope,
        state,
        code_challenge: await sha256b64(verifier),
        code_challenge_method: 'S256',
      }).toString()
      return ctx.redirect(u.toString(), 302)
    })
    .get('/callback/:provider', async (ctx) => {
      const p = providers.get(ctx.params.provider) as OAuthProvider | undefined
      if (!p || p.type !== 'oauth') throw new HttpError(404, 'Unknown provider')
      const flow = await verifyJwt<{ state: string; verifier: string; callbackUrl: string }>(ctx.cookie.get(FLOW) ?? '', config.secret)
      ctx.cookie.delete(FLOW)
      if (!flow || flow.state !== ctx.query.state || typeof ctx.query.code !== 'string')
        throw new HttpError(400, 'OAuth state mismatch, start the sign in again', { code: 'oauth_state' })
      const tokenRes = await fetch(p.tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: ctx.query.code,
          redirect_uri: `${origin(ctx.request)}${base}/callback/${p.id}`,
          client_id: p.clientId,
          client_secret: p.clientSecret,
          code_verifier: flow.verifier,
        }),
      })
      const tok = (await tokenRes.json().catch(() => ({}))) as { access_token?: string }
      if (!tok.access_token) throw new HttpError(502, `${p.name} did not return an access token`, { code: 'oauth_token' })
      const infoRes = await fetch(p.userinfoUrl, { headers: { authorization: `Bearer ${tok.access_token}`, accept: 'application/json', 'user-agent': 'raiko-auth' } })
      if (!infoRes.ok) throw new HttpError(502, `${p.name} user info failed`, { code: 'oauth_profile' })
      const user = await p.profile(await infoRes.json(), tok.access_token)
      return complete(ctx, user, p.id, flow.callbackUrl)
    })
    .post('/signin/credentials', async (ctx) => {
      const p = providers.get('credentials')
      if (!p || p.type !== 'credentials') throw new HttpError(404, 'Credentials sign in is not enabled')
      const input = (ctx.body ?? {}) as Record<string, unknown>
      const user = await p.authorize(input, ctx.request)
      if (!user) throw new HttpError(401, 'Invalid email or password', { code: 'credentials' })
      return complete(ctx, user, 'credentials', safeCallback(input.callbackUrl))
    })
    .post('/2fa', async (ctx) => {
      const pending = await verifyJwt<{ user: AuthUser; provider: string; callbackUrl: string; jti: string }>(ctx.cookie.get(PENDING) ?? '', config.secret)
      if (!pending || !config.twoFactor || !pending.jti) throw new HttpError(400, 'No sign in waiting for a code', { code: '2fa_expired' })
      const tries = attempts.get(pending.jti) ?? 0
      if (tries >= 5) {
        ctx.cookie.delete(PENDING)
        throw new HttpError(429, 'Too many wrong codes, sign in again', { code: '2fa_locked' })
      }
      const secret = await config.twoFactor.getSecret(pending.user)
      const code = String((ctx.body as Record<string, unknown> | undefined)?.code ?? '')
      const step = secret ? await totpStep(secret, code) : null
      if (step === null || step <= (usedStep.get(pending.user.id) ?? -1)) {
        attempts.set(pending.jti, tries + 1)
        trim(attempts)
        throw new HttpError(401, 'Wrong or expired code', { code: '2fa_invalid' })
      }
      usedStep.set(pending.user.id, step)
      trim(usedStep)
      attempts.set(pending.jti, 99)
      ctx.cookie.delete(PENDING)
      return complete(ctx, pending.user, pending.provider, pending.callbackUrl, true)
    })
    .post('/signout', (ctx) => {
      ctx.cookie.delete(COOKIE)
      return ctx.redirect(safeCallback((ctx.body as Record<string, unknown> | undefined)?.callbackUrl), 303)
    })

  return {
    plugin,
    /** beforeHandle guard: 401 when there is no session */
    protect: ({ auth }: { auth?: Session | null }) => {
      if (!auth) throw new HttpError(401, 'Sign in required')
    },
    /** read the session from any request */
    getSession: (request: Request) => readSession(/(?:^|;\s*)raiko\.session=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1]),
  }
}
