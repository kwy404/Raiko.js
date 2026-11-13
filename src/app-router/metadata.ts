import { escapeHtml as e } from '../jsx/runtime'

export interface Metadata {
  title?: string | { default: string; template?: string; absolute?: string }
  description?: string
  keywords?: string[]
  authors?: { name: string; url?: string }[]
  canonical?: string
  robots?: string | { index?: boolean; follow?: boolean }
  themeColor?: string
  icons?: { icon?: string; apple?: string }
  openGraph?: { title?: string; description?: string; url?: string; siteName?: string; images?: (string | { url: string; width?: number; height?: number; alt?: string })[]; type?: string; locale?: string }
  twitter?: { card?: 'summary' | 'summary_large_image'; title?: string; description?: string; images?: string[]; creator?: string }
  alternates?: { languages?: Record<string, string> }
  other?: Record<string, string>
}

/** Merge layout metadata (outer first) with page metadata, resolving title templates. */
export function mergeMetadata(chain: Metadata[]): Metadata {
  let template: string | undefined
  const out: Metadata = {}
  for (const m of chain) {
    const { title, ...rest } = m
    Object.assign(out, rest)
    if (title === undefined) continue
    if (typeof title === 'string') out.title = template ? template.replace('%s', title) : title
    else {
      out.title = title.absolute ?? (template && title.default ? template.replace('%s', title.default) : title.default)
      if (title.template) template = title.template
    }
  }
  return out
}

export function metadataToHtml(m: Metadata): string {
  const tags: string[] = []
  const meta = (name: string, content?: string, attr = 'name') =>
    content !== undefined && tags.push(`<meta ${attr}="${e(name)}" content="${e(content)}">`)
  if (typeof m.title === 'string') tags.push(`<title>${e(m.title)}</title>`)
  meta('description', m.description)
  if (m.keywords?.length) meta('keywords', m.keywords.join(', '))
  for (const a of m.authors ?? []) meta('author', a.name)
  if (m.canonical) tags.push(`<link rel="canonical" href="${e(m.canonical)}">`)
  if (m.robots) meta('robots', typeof m.robots === 'string' ? m.robots : `${m.robots.index === false ? 'noindex' : 'index'}, ${m.robots.follow === false ? 'nofollow' : 'follow'}`)
  meta('theme-color', m.themeColor)
  if (m.icons?.icon) tags.push(`<link rel="icon" href="${e(m.icons.icon)}">`)
  if (m.icons?.apple) tags.push(`<link rel="apple-touch-icon" href="${e(m.icons.apple)}">`)
  const og = m.openGraph
  if (og) {
    meta('og:title', og.title ?? (typeof m.title === 'string' ? m.title : undefined), 'property')
    meta('og:description', og.description ?? m.description, 'property')
    meta('og:url', og.url, 'property')
    meta('og:site_name', og.siteName, 'property')
    meta('og:type', og.type ?? 'website', 'property')
    meta('og:locale', og.locale, 'property')
    for (const img of og.images ?? []) {
      const i = typeof img === 'string' ? { url: img } : img
      meta('og:image', i.url, 'property')
      if (i.width) meta('og:image:width', String(i.width), 'property')
      if (i.height) meta('og:image:height', String(i.height), 'property')
      if (i.alt) meta('og:image:alt', i.alt, 'property')
    }
  }
  const tw = m.twitter
  if (tw) {
    meta('twitter:card', tw.card ?? 'summary_large_image')
    meta('twitter:title', tw.title)
    meta('twitter:description', tw.description)
    meta('twitter:creator', tw.creator)
    for (const i of tw.images ?? []) meta('twitter:image', i)
  }
  for (const [lang, href] of Object.entries(m.alternates?.languages ?? {}))
    tags.push(`<link rel="alternate" hreflang="${e(lang)}" href="${e(href)}">`)
  for (const [k, v] of Object.entries(m.other ?? {})) meta(k, v)
  return tags.join('')
}
