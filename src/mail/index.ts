/**
 * Email: templates in TSX (or any function returning HTML, so React Email,
 * Vue or plain strings work too), live preview at /_raiko/mail, and
 * transports for Resend, Postmark, SendGrid, SMTP and the console.
 */
import { Raiko } from '../app'
import { renderToString, isNode, escapeHtml, type Child } from '../jsx/runtime'
import { HttpError } from '../error'

export interface Message {
  from: string
  to: string | string[]
  subject: string
  html: string
  text: string
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string
  headers?: Record<string, string>
  attachments?: { filename: string; content: Uint8Array | string; contentType?: string }[]
}

export interface Transport {
  name: string
  send(m: Message): Promise<{ id?: string }>
}

/** A template: a component (or function) plus a subject and sample props for the preview. */
export interface Template<P = any> {
  (props: P): Child | string | Promise<Child | string>
  subject?: string | ((props: P) => string)
  preview?: P
}

const list = (v?: string | string[]) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])
const b64 = (c: Uint8Array | string) => (typeof c === 'string' ? btoa(unescape(encodeURIComponent(c))) : btoa(String.fromCharCode(...c)))

async function post(url: string, headers: Record<string, string>, body: unknown, name: string) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  if (!r.ok) throw new HttpError(502, `${name} refused the email: ${r.status} ${await r.text().catch(() => '')}`, { code: 'mail' })
  return r.json().catch(() => ({})) as Promise<any>
}

export const resend = (o: { apiKey: string }): Transport => ({
  name: 'resend',
  async send(m) {
    const r = await post('https://api.resend.com/emails', { authorization: `Bearer ${o.apiKey}` }, {
      from: m.from, to: list(m.to), cc: list(m.cc), bcc: list(m.bcc), reply_to: m.replyTo, subject: m.subject, html: m.html, text: m.text, headers: m.headers,
      attachments: m.attachments?.map((a) => ({ filename: a.filename, content: b64(a.content) })),
    }, 'Resend')
    return { id: r.id }
  },
})

export const postmark = (o: { serverToken: string; stream?: string }): Transport => ({
  name: 'postmark',
  async send(m) {
    const r = await post('https://api.postmarkapp.com/email', { 'x-postmark-server-token': o.serverToken, accept: 'application/json' }, {
      From: m.from, To: list(m.to)!.join(','), Cc: list(m.cc)?.join(','), Bcc: list(m.bcc)?.join(','), ReplyTo: m.replyTo, Subject: m.subject,
      HtmlBody: m.html, TextBody: m.text, MessageStream: o.stream ?? 'outbound',
      Attachments: m.attachments?.map((a) => ({ Name: a.filename, Content: b64(a.content), ContentType: a.contentType ?? 'application/octet-stream' })),
    }, 'Postmark')
    return { id: r.MessageID }
  },
})

export const sendgrid = (o: { apiKey: string }): Transport => ({
  name: 'sendgrid',
  async send(m) {
    await post('https://api.sendgrid.com/v3/mail/send', { authorization: `Bearer ${o.apiKey}` }, {
      personalizations: [{ to: list(m.to)!.map((email) => ({ email })), cc: list(m.cc)?.map((email) => ({ email })), bcc: list(m.bcc)?.map((email) => ({ email })) }],
      from: { email: m.from }, reply_to: m.replyTo ? { email: m.replyTo } : undefined, subject: m.subject,
      content: [{ type: 'text/plain', value: m.text }, { type: 'text/html', value: m.html }],
      attachments: m.attachments?.map((a) => ({ filename: a.filename, content: b64(a.content), type: a.contentType })),
    }, 'SendGrid')
    return {}
  },
})

/** SMTP through nodemailer (install it: bun add nodemailer). */
export const smtp = (o: { host: string; port?: number; secure?: boolean; user?: string; pass?: string }): Transport => {
  let t: any
  return {
    name: 'smtp',
    async send(m) {
      if (!t) {
        const nm = await import('nodemailer' as string).catch(() => {
          throw new Error('error[RK0501]: the smtp transport needs nodemailer\n  = help: bun add nodemailer')
        })
        t = (nm.default ?? nm).createTransport({ host: o.host, port: o.port ?? 587, secure: o.secure ?? o.port === 465, auth: o.user ? { user: o.user, pass: o.pass } : undefined })
      }
      const r = await t.sendMail({ ...m, to: list(m.to), cc: list(m.cc), bcc: list(m.bcc) })
      return { id: r.messageId }
    },
  }
}

/** Prints emails instead of sending them. The default in development. */
export const consoleTransport = (): Transport => ({
  name: 'console',
  async send(m) {
    console.log(`\n[raiko mail] to: ${list(m.to)!.join(', ')}\nsubject: ${m.subject}\n\n${m.text}\n`)
    return { id: `console-${Date.now()}` }
  },
})

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<(br|\/p|\/div|\/h\d|\/tr|\/li)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function createMailer<T extends Record<string, Template>>(o: { from: string; transport?: Transport; templates?: T }) {
  const transport = o.transport ?? consoleTransport()
  const templates = (o.templates ?? {}) as T

  const render = async <K extends keyof T>(name: K, props: Parameters<T[K]>[0]) => {
    const tpl = templates[name]
    if (!tpl) throw new Error(`error[RK0502]: unknown email template "${String(name)}"\n  = help: add it to createMailer({ templates })`)
    const out = (await (tpl(props) as Promise<unknown>)) as Child | string
    const body = typeof out === 'string' ? out : await renderToString(out)
    const html = /<html[\s>]/i.test(body) ? body : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body>${body}</body></html>`
    const subject = typeof tpl.subject === 'function' ? tpl.subject(props) : tpl.subject ?? String(name)
    return { html, text: htmlToText(html), subject }
  }

  return {
    transport,
    render,
    /** Send a template by name, or raw html. */
    async send<K extends keyof T>(
      m: Omit<Message, 'from' | 'html' | 'text' | 'subject'> & { from?: string; subject?: string } & ({ template: K; props: Parameters<T[K]>[0] } | { html: string | Child; text?: string; template?: never }),
    ) {
      let html: string, text: string, subject = m.subject
      if ('template' in m && m.template !== undefined) {
        const r = await render(m.template, (m as { props: Parameters<T[K]>[0] }).props)
        html = r.html
        text = r.text
        subject ??= r.subject
      } else {
        const h = (m as { html: string | Child }).html
        html = typeof h === 'string' ? h : isNode(h) ? await renderToString(h) : String(h)
        text = (m as { text?: string }).text ?? htmlToText(html)
      }
      if (!subject) throw new Error('error[RK0503]: email without a subject\n  = help: pass subject, or set Template.subject')
      const { template: _t, props: _p, html: _h, text: _x, ...rest } = m as any
      return transport.send({ ...rest, from: m.from ?? o.from, subject, html, text })
    },
    /** Dev preview: GET /_raiko/mail lists templates, /_raiko/mail/:name renders one. */
    preview(prefix = '/_raiko/mail') {
      return new Raiko({ name: 'raiko:mail-preview', prefix })
        .get('/', () => {
          const rows = Object.keys(templates).map((n) => `<li><a href="${prefix}/${encodeURIComponent(n)}">${escapeHtml(n)}</a> <a class="m" href="${prefix}/${encodeURIComponent(n)}?format=text">text</a></li>`).join('')
          return new Response(`<!doctype html><meta charset="utf-8"><title>Email templates</title><style>body{background:#0a0a0b;color:#ededed;font:15px system-ui;padding:40px}a{color:#ffd23f}.m{color:#a1a1aa;margin-left:8px}</style><h1>Email templates</h1><ul>${rows}</ul>`, { headers: { 'content-type': 'text/html; charset=utf-8' } })
        })
        .get('/:name', async ({ params, query }) => {
          const tpl = templates[params.name]
          if (!tpl) throw new HttpError(404, `No template "${params.name}"`)
          const r = await render(params.name as keyof T, (tpl.preview ?? {}) as never)
          if (query.format === 'text') return r.text
          return new Response(r.html, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-email-subject': r.subject } })
        })
    },
  }
}
