/** OAuth 2 providers. Add your own with `OAuth({...})`. */

export interface AuthUser {
  id: string
  name?: string | null
  email?: string | null
  image?: string | null
  [k: string]: unknown
}

export interface OAuthProvider {
  type: 'oauth'
  id: string
  name: string
  clientId: string
  clientSecret: string
  authorizeUrl: string
  tokenUrl: string
  userinfoUrl: string
  scope: string
  profile(raw: any, token: string): AuthUser | Promise<AuthUser>
}

export interface CredentialsProvider {
  type: 'credentials'
  id: string
  name: string
  /** return the user, or null to refuse the sign in */
  authorize(input: Record<string, unknown>, request: Request): AuthUser | null | Promise<AuthUser | null>
}

export type Provider = OAuthProvider | CredentialsProvider

type Keys = { clientId: string; clientSecret: string; scope?: string }

export const OAuth = (p: Omit<OAuthProvider, 'type'>): OAuthProvider => ({ type: 'oauth', ...p })

export const GitHub = (k: Keys) =>
  OAuth({
    id: 'github', name: 'GitHub', ...k, scope: k.scope ?? 'read:user user:email',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userinfoUrl: 'https://api.github.com/user',
    async profile(u, token) {
      let email = u.email
      if (!email) {
        const r = await fetch('https://api.github.com/user/emails', { headers: { authorization: `Bearer ${token}`, 'user-agent': 'raiko-auth' } })
        const list = r.ok ? ((await r.json()) as { email: string; primary: boolean; verified: boolean }[]) : []
        email = list.find((e) => e.primary && e.verified)?.email ?? null
      }
      return { id: String(u.id), name: u.name ?? u.login, email, image: u.avatar_url }
    },
  })

export const Google = (k: Keys) =>
  OAuth({
    id: 'google', name: 'Google', ...k, scope: k.scope ?? 'openid email profile',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    profile: (u) => ({ id: u.sub, name: u.name, email: u.email_verified ? u.email : null, image: u.picture }),
  })

export const Discord = (k: Keys) =>
  OAuth({
    id: 'discord', name: 'Discord', ...k, scope: k.scope ?? 'identify email',
    authorizeUrl: 'https://discord.com/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    userinfoUrl: 'https://discord.com/api/users/@me',
    profile: (u) => ({ id: u.id, name: u.global_name ?? u.username, email: u.verified ? u.email : null, image: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png` : null }),
  })

export const GitLab = (k: Keys) =>
  OAuth({
    id: 'gitlab', name: 'GitLab', ...k, scope: k.scope ?? 'read_user',
    authorizeUrl: 'https://gitlab.com/oauth/authorize',
    tokenUrl: 'https://gitlab.com/oauth/token',
    userinfoUrl: 'https://gitlab.com/api/v4/user',
    profile: (u) => ({ id: String(u.id), name: u.name, email: u.email, image: u.avatar_url }),
  })

export const Credentials = (o: { name?: string; authorize: CredentialsProvider['authorize'] }): CredentialsProvider => ({
  type: 'credentials',
  id: 'credentials',
  name: o.name ?? 'Email',
  authorize: o.authorize,
})
