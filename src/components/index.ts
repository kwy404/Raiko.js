/** Built in components: <Link>, <Image>, <Script>, <Head>, <Form>. */
import { jsx, raw, renderToString, Fragment, type Child } from '../jsx/runtime'
import { als } from '../server/request-store'

type Props = Record<string, any> & { children?: Child }

/** Anchor with optional prefetch on hover. External links get rel="noopener noreferrer". */
export function Link({ href, prefetch = true, children, ...rest }: Props & { href: string; prefetch?: boolean }) {
  const external = /^https?:\/\//.test(href)
  return jsx('a', {
    href,
    ...(external ? { rel: 'noopener noreferrer', target: rest.target ?? '_blank' } : {}),
    ...(prefetch && !external ? { 'data-rk-prefetch': true } : {}),
    ...rest,
    children,
  })
}

const WIDTHS = [384, 640, 828, 1080, 1200, 1920, 2560]

/**
 * Responsive image: width and height are required (no layout shift), lazy by
 * default, `priority` for the hero image. Local images go through the
 * /_raiko/image endpoint, which resizes with sharp when it is installed.
 */
export function Image({
  src,
  alt,
  width,
  height,
  priority = false,
  quality = 75,
  sizes,
  unoptimized = false,
  ...rest
}: Props & { src: string; alt: string; width: number; height: number; priority?: boolean; quality?: number; sizes?: string; unoptimized?: boolean }) {
  if (alt === undefined) throw new Error('error[RK0301]: <Image> needs an alt text\n  = help: use alt="" for decorative images')
  const local = src.startsWith('/') && !src.startsWith('//')
  const url = (w: number) => `/_raiko/image?url=${encodeURIComponent(src)}&w=${w}&q=${quality}`
  const widths = WIDTHS.filter((w) => w <= width * 2)
  return jsx('img', {
    src: local && !unoptimized ? url(width) : src,
    ...(local && !unoptimized && widths.length ? { srcset: widths.map((w) => `${url(w)} ${w}w`).join(', '), sizes: sizes ?? `(max-width: ${width}px) 100vw, ${width}px` } : {}),
    alt,
    width,
    height,
    loading: priority ? 'eager' : 'lazy',
    decoding: priority ? 'sync' : 'async',
    ...(priority ? { fetchpriority: 'high' } : {}),
    style: { ...(rest.style ?? {}), maxWidth: '100%', height: 'auto' },
    ...rest,
  })
}

/** Script with a loading strategy: beforeInteractive (blocking), afterInteractive (defer), lazyOnload (async). */
export function Script({ src, strategy = 'afterInteractive', children, ...rest }: Props & { src?: string; strategy?: 'beforeInteractive' | 'afterInteractive' | 'lazyOnload' }) {
  const mode = strategy === 'afterInteractive' ? { defer: true } : strategy === 'lazyOnload' ? { async: true } : {}
  return jsx('script', { src, ...mode, ...rest, children })
}

/** Put tags in the document <head> from anywhere in the tree. */
export async function Head({ children }: { children?: Child }) {
  const s = als.getStore()
  if (s) s.head.push(await renderToString(children))
  return null
}

/** Structured data for search engines: <JsonLd data={{ '@type': 'Article', headline: '...' }} /> */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = JSON.stringify(Array.isArray(data) ? data : { '@context': 'https://schema.org', ...data }).replace(/</g, '\\u003c')
  return jsx('script', { type: 'application/ld+json', dangerouslySetInnerHTML: { __html: json } })
}

/** "Skip to content" link for keyboard and screen reader users. Put it first in <body>. */
export function SkipLink({ href = '#main', children = 'Skip to content' }: { href?: string; children?: Child }) {
  return jsx(Fragment, {
    children: [
      jsx('style', { children: '.rk-skip{position:absolute;left:-9999px;top:8px;z-index:9999;background:#ffd23f;color:#0a0a0b;padding:8px 12px;border-radius:6px}.rk-skip:focus{left:8px}' }),
      jsx('a', { href, class: 'rk-skip', children }),
    ],
  })
}

/** Form bound to a page action: <Form action="create"> posts to ?/create. */
export function Form({ action, children, ...rest }: Props & { action?: string }) {
  return jsx('form', { method: 'post', action: action ? `?/${action}` : undefined, ...rest, children })
}

/** Tiny client script for <Link prefetch>. Injected once per page by the app router. */
export const PREFETCH_SCRIPT = raw(
  `<script>(()=>{const s=new Set;addEventListener("pointerover",e=>{const a=e.target.closest&&e.target.closest("a[data-rk-prefetch]");if(!a||s.has(a.href))return;s.add(a.href);const l=document.createElement("link");l.rel="prefetch";l.href=a.href;document.head.appendChild(l)},{passive:true})})()</script>`,
)
