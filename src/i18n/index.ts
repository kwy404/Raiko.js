/**
 * i18n with typed keys, plurals (Intl.PluralRules), interpolation and
 * locale detection from the URL, a cookie or Accept-Language.
 *
 *   const i18n = createI18n({ en, pt: ptBR, es }, { fallback: 'en' })
 *   i18n.t('pt', 'cart.items', { count: 3 })
 */
import { Raiko } from '../app'

type Dict = { [k: string]: string | Dict }
type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never
type Prev = [never, 0, 1, 2, 3, 4, 5]
type Plural = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'
/** 'cart.items_one' also allows 'cart.items', the plural base */
type WithBase<K> = K extends `${infer B}_${Plural}` ? B | K : K
export type Keys<T, D extends number = 5> = [D] extends [never] ? never : T extends string ? never : { [K in keyof T & string]: T[K] extends string ? K : Join<K, Keys<T[K], Prev[D]>> }[keyof T & string]

export function createI18n<const L extends Record<string, Dict>>(dicts: L, o: { fallback: keyof L & string; cookie?: string }) {
  type Locale = keyof L & string
  type Key = WithBase<Keys<L[typeof o.fallback]>>
  const locales = Object.keys(dicts) as Locale[]
  const lookup = (d: Dict | undefined, key: string): string | undefined => {
    let cur: string | Dict | undefined = d
    for (const part of key.split('.')) cur = typeof cur === 'object' ? cur[part] : undefined
    return typeof cur === 'string' ? cur : undefined
  }

  /** {name} interpolation; plurals with keys like items_one / items_other */
  const t = (locale: string, key: Key & string, vars: Record<string, string | number> = {}): string => {
    const l = (locales.includes(locale as Locale) ? locale : o.fallback) as Locale
    let s: string | undefined
    if (typeof vars.count === 'number') {
      const cat = new Intl.PluralRules(l).select(vars.count)
      s = lookup(dicts[l], `${key}_${cat}`) ?? lookup(dicts[o.fallback], `${key}_${cat}`) ?? lookup(dicts[l], `${key}_other`)
    }
    s ??= lookup(dicts[l], key) ?? lookup(dicts[o.fallback], key)
    if (s === undefined) return key
    return s.replace(/\{(\w+)\}/g, (_, n) => (vars[n] === undefined ? `{${n}}` : typeof vars[n] === 'number' ? new Intl.NumberFormat(l).format(vars[n] as number) : String(vars[n])))
  }

  /** Best locale for a request: /pt/... prefix, then cookie, then Accept-Language. */
  const detect = (request: Request, cookieHeader?: string | null): Locale => {
    const first = new URL(request.url).pathname.split('/')[1]
    if (first && locales.includes(first as Locale)) return first as Locale
    const c = o.cookie ? new RegExp(`(?:^|;\\s*)${o.cookie}=([^;]+)`).exec(cookieHeader ?? request.headers.get('cookie') ?? '')?.[1] : undefined
    if (c && locales.includes(c as Locale)) return c as Locale
    for (const part of (request.headers.get('accept-language') ?? '').split(',')) {
      const tag = part.split(';')[0]!.trim()
      const hit = locales.find((l) => l.toLowerCase() === tag.toLowerCase()) ?? locales.find((l) => l.split('-')[0] === tag.split('-')[0])
      if (hit) return hit
    }
    return o.fallback
  }

  /** Adds `locale` and `t(key, vars)` to every request context. */
  const plugin = () =>
    new Raiko({ name: 'raiko:i18n' }).derive(({ request }) => {
      const locale = detect(request)
      return { locale, t: (key: Key, vars?: Record<string, string | number>) => t(locale, key, vars) }
    }, 'global')

  return { t, detect, plugin, locales }
}
