/** Data adapters for the admin panel: Kastor and Prisma models, Drizzle tables, memory. */

export interface ListQuery {
  page: number
  perPage: number
  search?: string
  sort?: { field: string; dir: 'asc' | 'desc' }
}

export interface Adapter<Row = Record<string, unknown>> {
  list(q: ListQuery): Promise<{ rows: Row[]; total: number }>
  get(id: string): Promise<Row | null>
  create(data: Partial<Row>): Promise<Row>
  update(id: string, data: Partial<Row>): Promise<Row>
  delete(id: string): Promise<void>
}

const num = (id: string) => (/^\d+$/.test(id) ? Number(id) : id)

/** Works with Kastor (kastor-orm) and Prisma models: `modelAdapter(db.users, { searchable: ['email'] })` */
export function modelAdapter(model: any, o: { id?: string; searchable?: string[]; numericId?: boolean } = {}): Adapter {
  const idf = o.id ?? 'id'
  const id = (v: string) => (o.numericId === false ? v : num(v))
  const where = (s?: string) => (s && o.searchable?.length ? { OR: o.searchable.map((f) => ({ [f]: { contains: s } })) } : undefined)
  return {
    async list(q) {
      const w = where(q.search)
      const [rows, total] = await Promise.all([
        model.findMany({ where: w, take: q.perPage, skip: (q.page - 1) * q.perPage, orderBy: q.sort ? { [q.sort.field]: q.sort.dir } : { [idf]: 'desc' } }),
        model.count({ where: w }),
      ])
      return { rows, total: Number(total) }
    },
    get: (v) => model.findUnique({ where: { [idf]: id(v) } }),
    create: (data) => model.create({ data }),
    update: (v, data) => model.update({ where: { [idf]: id(v) }, data }),
    async delete(v) {
      await model.delete({ where: { [idf]: id(v) } })
    },
  }
}

/** Drizzle: `drizzleAdapter(db, users, { id: users.id, searchable: [users.email] })` */
export function drizzleAdapter(db: any, table: any, o: { id: any; searchable?: any[] }): Adapter {
  let d: any
  const ops = async () => (d ??= await import('drizzle-orm' as string))
  return {
    async list(q) {
      const { or, sql, desc, asc } = await ops()
      // the value is a bound parameter; escaping % and _ stops expensive wildcard searches
      const term = q.search?.replace(/[\\%_]/g, (m) => '\\' + m)
      const w = term && o.searchable?.length ? or(...o.searchable.map((c: any) => sql`${c} like ${`%${term}%`} escape '\\'`)) : undefined
      const col = q.sort ? table[q.sort.field] : o.id
      const rows = await db.select().from(table).where(w).orderBy(q.sort?.dir === 'asc' ? asc(col) : desc(col)).limit(q.perPage).offset((q.page - 1) * q.perPage)
      const [{ n }] = await db.select({ n: sql`count(*)` }).from(table).where(w)
      return { rows, total: Number(n) }
    },
    async get(v) {
      const { eq } = await ops()
      return (await db.select().from(table).where(eq(o.id, num(v))).limit(1))[0] ?? null
    },
    async create(data) {
      return (await db.insert(table).values(data).returning())[0]
    },
    async update(v, data) {
      const { eq } = await ops()
      return (await db.update(table).set(data).where(eq(o.id, num(v))).returning())[0]
    },
    async delete(v) {
      const { eq } = await ops()
      await db.delete(table).where(eq(o.id, num(v)))
    },
  }
}

/** In memory rows, for prototypes and tests. */
export function memoryAdapter<Row extends Record<string, unknown>>(rows: Row[] = [], o: { id?: string } = {}): Adapter<Row> {
  const idf = o.id ?? 'id'
  let next = rows.reduce((m, r) => Math.max(m, Number(r[idf]) || 0), 0) + 1
  const find = (v: string) => rows.findIndex((r) => String(r[idf]) === v)
  return {
    async list(q) {
      let out = rows
      if (q.search) {
        const s = q.search.toLowerCase()
        out = out.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(s)))
      }
      if (q.sort) {
        const { field, dir } = q.sort
        out = [...out].sort((a, b) => (String(a[field]) < String(b[field]) ? -1 : 1) * (dir === 'asc' ? 1 : -1))
      }
      return { rows: out.slice((q.page - 1) * q.perPage, q.page * q.perPage), total: out.length }
    },
    async get(v) {
      return rows[find(v)] ?? null
    },
    async create(data) {
      const row = { [idf]: next++, ...data } as Row
      rows.push(row)
      return row
    },
    async update(v, data) {
      const i = find(v)
      if (i === -1) throw new Error('not found')
      rows[i] = { ...rows[i]!, ...data }
      return rows[i]!
    },
    async delete(v) {
      const i = find(v)
      if (i !== -1) rows.splice(i, 1)
    },
  }
}
