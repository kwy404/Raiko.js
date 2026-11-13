/**
 * Admin panel: CRUD for every resource, search, sort, pagination and
 * permissions per role and action. Server rendered, works without JS.
 *
 *   app.use(admin({
 *     auth: ({ auth }) => auth?.user.role ?? null,
 *     resources: {
 *       users: { adapter: modelAdapter(db.users, { searchable: ['email'] }), fields: ['id', 'email', 'name'],
 *                permissions: { admin: '*', support: ['list', 'read', 'update'] } },
 *     },
 *   }))
 */
import { Raiko } from '../app'
import { HttpError } from '../error'
import { escapeHtml as e } from '../jsx/runtime'
import { isTSchema, validate, type AnySchema } from '../schema'
import type { Adapter } from './adapters'

export * from './adapters'

export type Action = 'list' | 'read' | 'create' | 'update' | 'delete'
export const ACTIONS: Action[] = ['list', 'read', 'create', 'update', 'delete']

export interface Resource {
  adapter: Adapter
  label?: string
  /** columns shown in the table and the form, default: keys of the first row */
  fields?: string[]
  /** fields that can never be edited, default ['id', 'createdAt', 'updatedAt'] */
  readonly?: string[]
  /** fields never shown (password hashes, tokens) */
  hidden?: string[]
  /** validates create and update */
  schema?: AnySchema
  /** role -> allowed actions; '*' means all five */
  permissions: Record<string, Action[] | '*'>
}

export interface AdminOptions {
  path?: string
  title?: string
  /** return the current role, or null when not signed in */
  auth: (ctx: any) => string | null | Promise<string | null>
  /** where to send signed out users, default /auth/signin */
  signIn?: string
  resources: Record<string, Resource>
  perPage?: number
}

export function can(r: Resource, role: string | null, action: Action): boolean {
  if (!role) return false
  const p = r.permissions[role]
  return p === '*' || (Array.isArray(p) && p.includes(action))
}

export function admin(o: AdminOptions) {
  const base = o.path ?? '/admin'
  const perPage = o.perPage ?? 25
  const title = o.title ?? 'Admin'
  for (const [name, r] of Object.entries(o.resources))
    for (const [role, acts] of Object.entries(r.permissions))
      if (acts !== '*' && acts.some((a) => !ACTIONS.includes(a)))
        throw new Error(`error[RK0601]: unknown permission in admin resource "${name}" for role "${role}"\n  = help: use ${ACTIONS.join(', ')} or '*'`)

  const page = (role: string, body: string, current?: string) => {
    const nav = Object.entries(o.resources)
      .filter(([, r]) => can(r, role, 'list') || can(r, role, 'create'))
      .map(([n, r]) => `<a href="${base}/${n}" class="${n === current ? 'on' : ''}">${e(r.label ?? n)}</a>`)
      .join('')
    return new Response(
      `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/monsooncss@0.2.0/dist/monsoon.min.css">
<style>:root{--seed:#ffd23f}body{margin:0;background:#0a0a0b;color:#ededed;font:14px/1.5 ui-sans-serif,system-ui}a{color:inherit}
.l{display:grid;grid-template-columns:220px 1fr;min-height:100vh}aside{border-right:1px solid #1f1f23;padding:20px}aside b{display:block;margin-bottom:16px}
aside a{display:block;padding:6px 10px;border-radius:6px;text-decoration:none;color:#a1a1aa}aside a.on,aside a:hover{background:#18181b;color:#fff}
main{padding:28px;overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #1f1f23;white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis}
th a{text-decoration:none;color:#a1a1aa}.bar{display:flex;gap:8px;align-items:center;margin-bottom:16px}.sp{flex:1}
input,textarea,select{background:#111113;border:1px solid #27272a;color:#ededed;border-radius:6px;padding:7px 10px;font:inherit;width:100%}
.b{background:#ffd23f;color:#0a0a0b;border:0;border-radius:6px;padding:7px 14px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}
.g{background:#18181b;color:#ededed}.d{background:#3f1d1d;color:#fca5a5}label{display:block;margin:12px 0 4px;color:#a1a1aa}.m{color:#71717a}
@media(max-width:720px){.l{grid-template-columns:1fr}aside{border-right:0;border-bottom:1px solid #1f1f23}}</style></head>
<body><div class="l"><aside><b>${e(title)}</b>${nav}</aside><main>${body}</main></div></body></html>`,
      { headers: { 'content-type': 'text/html; charset=utf-8' } },
    )
  }

  const resource = (name: string) => {
    const r = o.resources[name]
    if (!r) throw new HttpError(404, `No admin resource "${name}"`)
    return r
  }
  const guard = (r: Resource, role: string | null, action: Action) => {
    if (!can(r, role, action)) throw new HttpError(403, `Your role cannot ${action} this resource`, { code: 'admin_forbidden' })
  }
  const visible = (r: Resource, row: Record<string, unknown> | undefined) =>
    (r.fields ?? Object.keys(row ?? {})).filter((f) => !(r.hidden ?? []).includes(f))
  const editable = (r: Resource, fields: string[]) =>
    fields.filter((f) => !(r.readonly ?? ['id', 'createdAt', 'updatedAt']).includes(f) && !(r.hidden ?? []).includes(f))
  const cell = (v: unknown) => (v === null || v === undefined ? '<span class="m">null</span>' : e(typeof v === 'object' ? JSON.stringify(v) : String(v)))

  const clean = async (r: Resource, body: unknown, fields: string[]) => {
    const src = (body ?? {}) as Record<string, unknown>
    const data: Record<string, unknown> = {}
    for (const f of editable(r, fields)) if (f in src) data[f] = src[f] === '' ? null : src[f]
    if (!r.schema) return data
    const v = await validate(r.schema, data, { coerce: true })
    if (!v.ok) throw new HttpError(422, v.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), { code: 'validation', details: v.issues })
    return v.value as Record<string, unknown>
  }

  const form = (r: Resource, fields: string[], row: Record<string, unknown> = {}, action: string) =>
    `<form method="post" action="${action}">${editable(r, fields)
      .map((f) => `<label for="f-${e(f)}">${e(f)}</label><input id="f-${e(f)}" name="${e(f)}" value="${row[f] === undefined || row[f] === null ? '' : e(String(row[f]))}">`)
      .join('')}<p><button class="b" type="submit">Save</button></p></form>`

  return new Raiko({ name: 'raiko:admin', prefix: base })
    .derive(async (ctx) => ({ adminRole: await o.auth(ctx) }))
    .onBeforeHandle(({ adminRole, redirect }: any) => (adminRole ? undefined : redirect(`${o.signIn ?? '/auth/signin'}?callbackUrl=${encodeURIComponent(base)}`)))
    .get('/', ({ adminRole }: any) => {
      const cards = Object.entries(o.resources)
        .filter(([, r]) => can(r, adminRole, 'list'))
        .map(([n, r]) => `<p><a class="b g" href="${base}/${n}">${e(r.label ?? n)}</a></p>`)
        .join('')
      return page(adminRole, `<h1>${e(title)}</h1>${cards || '<p class="m">Your role has no resources.</p>'}`)
    })
    .get('/:resource', async ({ params, query, adminRole }: any) => {
      const r = resource(params.resource)
      guard(r, adminRole, 'list')
      const p = Math.max(1, Number(query.page) || 1)
      const sortField = typeof query.sort === 'string' ? query.sort.replace(/^-/, '') : undefined
      // only declared, visible columns can be sorted, checked before anything reaches the database
      if (sortField && (!r.fields || !visible(r, undefined).includes(sortField))) throw new HttpError(400, 'Cannot sort by that column')
      const search = typeof query.q === 'string' && query.q ? query.q.slice(0, 200) : undefined
      const { rows, total } = await r.adapter.list({ page: Math.min(p, 100_000), perPage, search, sort: sortField ? { field: sortField, dir: query.sort.startsWith('-') ? 'desc' : 'asc' } : undefined })
      const fields = visible(r, rows[0])
      const link = (row: Record<string, unknown>) => `${base}/${params.resource}/${encodeURIComponent(String(row.id))}`
      const head = fields.map((f) => `<th><a href="?sort=${query.sort === f ? '-' : ''}${e(f)}${query.q ? `&q=${encodeURIComponent(query.q)}` : ''}">${e(f)}</a></th>`).join('')
      const body = rows.map((row) => `<tr>${fields.map((f, i) => `<td>${i === 0 && can(r, adminRole, 'read') ? `<a href="${link(row)}">${cell(row[f])}</a>` : cell(row[f])}</td>`).join('')}</tr>`).join('')
      const pages = Math.max(1, Math.ceil(total / perPage))
      const nav = `<p class="m">${total} rows. Page ${p} of ${pages}. ${p > 1 ? `<a href="?page=${p - 1}">Previous</a>` : ''} ${p < pages ? `<a href="?page=${p + 1}">Next</a>` : ''}</p>`
      return page(
        adminRole,
        `<div class="bar"><h1 class="sp">${e(r.label ?? params.resource)}</h1>${can(r, adminRole, 'create') ? `<a class="b" href="${base}/${params.resource}/new">New</a>` : ''}</div>
<form class="bar"><input name="q" placeholder="Search" value="${e(query.q ?? '')}"><button class="b g">Search</button></form>
<table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td class="m">Nothing here yet.</td></tr>`}</tbody></table>${nav}`,
        params.resource,
      )
    })
    .get('/:resource/new', ({ params, adminRole }: any) => {
      const r = resource(params.resource)
      guard(r, adminRole, 'create')
      return page(adminRole, `<h1>New ${e(r.label ?? params.resource)}</h1>${form(r, r.fields ?? [], {}, `${base}/${params.resource}/new`)}`, params.resource)
    })
    .post('/:resource/new', async ({ params, body, adminRole, redirect }: any) => {
      const r = resource(params.resource)
      guard(r, adminRole, 'create')
      // only declared fields can be written: never trust the keys the browser sends
      if (!r.fields) throw new HttpError(403, 'Declare fields on this resource to allow create', { code: 'admin_fields' })
      const row = await r.adapter.create(await clean(r, body, r.fields))
      return redirect(`${base}/${params.resource}/${encodeURIComponent(String(row.id))}`, 303)
    })
    .get('/:resource/:id', async ({ params, adminRole }: any) => {
      const r = resource(params.resource)
      guard(r, adminRole, 'read')
      const row = await r.adapter.get(params.id)
      if (!row) throw new HttpError(404, 'Row not found')
      const fields = visible(r, row)
      const url = `${base}/${params.resource}/${encodeURIComponent(params.id)}`
      const body = can(r, adminRole, 'update')
        ? form(r, fields, row, url)
        : `<table>${fields.map((f) => `<tr><th>${e(f)}</th><td>${cell(row[f])}</td></tr>`).join('')}</table>`
      const del = can(r, adminRole, 'delete') ? `<form method="post" action="${url}/delete"><button class="b d">Delete</button></form>` : ''
      return page(adminRole, `<div class="bar"><h1 class="sp">${e(r.label ?? params.resource)} ${e(params.id)}</h1>${del}</div>${body}`, params.resource)
    })
    .post('/:resource/:id', async ({ params, body, adminRole, redirect }: any) => {
      const r = resource(params.resource)
      guard(r, adminRole, 'update')
      const row = await r.adapter.get(params.id)
      if (!row) throw new HttpError(404, 'Row not found')
      await r.adapter.update(params.id, await clean(r, body, visible(r, row)))
      return redirect(`${base}/${params.resource}/${encodeURIComponent(params.id)}`, 303)
    })
    .post('/:resource/:id/delete', async ({ params, adminRole, redirect }: any) => {
      const r = resource(params.resource)
      guard(r, adminRole, 'delete')
      await r.adapter.delete(params.id)
      return redirect(`${base}/${params.resource}`, 303)
    })
}
