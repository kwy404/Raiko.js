/**
 * `t`: a tiny schema builder with full TypeScript inference, coercion for
 * string sources (query, params, headers, form fields), precise error paths
 * and JSON Schema output for OpenAPI.
 *
 * Any Standard Schema v1 validator (Zod 3.24+, Valibot 1, ArkType 2) is also
 * accepted wherever a `t` schema is.
 */

export interface Issue {
  path: (string | number)[]
  message: string
  expected?: string
  received?: unknown
}

export type Result<T> = { ok: true; value: T } | { ok: false; issues: Issue[] }

export interface ParseOptions {
  /** convert strings to numbers / booleans / arrays where the schema asks for it */
  coerce?: boolean
}

export interface TSchema<Out = unknown> {
  readonly kind: string
  readonly _out?: Out
  readonly optional?: boolean
  readonly json: Record<string, unknown>
  parse(value: unknown, path: (string | number)[], opts: ParseOptions, issues: Issue[]): Out
}

/** Standard Schema v1 interface (https://standardschema.dev) */
export interface StandardSchemaV1<I = unknown, O = I> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (
      value: unknown,
    ) =>
      | { value: O; issues?: undefined }
      | { issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }> }
      | Promise<
          | { value: O; issues?: undefined }
          | { issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }> }
        >
    readonly types?: { readonly input: I; readonly output: O }
  }
}

export type AnySchema = TSchema<any> | StandardSchemaV1<any, any>

export type Static<S> = S extends TSchema<infer O>
  ? O
  : S extends StandardSchemaV1<any, infer O>
    ? O
    : unknown

const FAIL = Symbol('fail')
type Fail = typeof FAIL

function typeName(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

function make<O>(
  kind: string,
  json: Record<string, unknown>,
  parse: TSchema<O>['parse'],
  extra: Partial<TSchema<O>> = {},
): TSchema<O> {
  return { kind, json, parse, ...extra }
}

function issue(issues: Issue[], path: (string | number)[], message: string, expected?: string, received?: unknown) {
  issues.push({ path: [...path], message, expected, received })
  return FAIL as never
}

interface StringOpts {
  minLength?: number
  maxLength?: number
  pattern?: RegExp | string
  format?: 'email' | 'uuid' | 'url' | 'date' | 'date-time' | 'ipv4' | 'slug'
  default?: string
  description?: string
  trim?: boolean
}

const FORMATS: Record<NonNullable<StringOpts['format']>, RegExp> = {
  // parts cannot overlap, so matching is linear (no ReDoS); length is capped below
  email: /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  url: /^https?:\/\/[^\s/$.?#].[^\s]*$/i,
  date: /^\d{4}-\d{2}-\d{2}$/,
  'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/,
  ipv4: /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$/,
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
}

interface NumberOpts {
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  multipleOf?: number
  default?: number
  description?: string
}

function strictNumber(v: string): number | Fail {
  const s = v.trim()
  if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return FAIL
  const n = Number(s)
  return Number.isFinite(n) ? n : FAIL
}

type Simplify<T> = { [K in keyof T]: T[K] } & {}
type OptionalKeys<P> = { [K in keyof P]: P[K] extends { optional: true } ? K : never }[keyof P]
type RequiredKeys<P> = Exclude<keyof P, OptionalKeys<P>>
type ObjectOut<P extends Record<string, AnySchema>> = Simplify<
  { [K in RequiredKeys<P>]: Static<P[K]> } & { [K in OptionalKeys<P>]?: Static<P[K]> }
>

export const t = {
  String(o: StringOpts = {}): TSchema<string> {
    const json: Record<string, unknown> = { type: 'string' }
    if (o.minLength !== undefined) json.minLength = o.minLength
    if (o.maxLength !== undefined) json.maxLength = o.maxLength
    if (o.pattern) json.pattern = typeof o.pattern === 'string' ? o.pattern : o.pattern.source
    if (o.format) json.format = o.format
    if (o.default !== undefined) json.default = o.default
    if (o.description) json.description = o.description
    const re = o.pattern ? (typeof o.pattern === 'string' ? new RegExp(o.pattern) : o.pattern) : null
    return make('string', json, (v, path, _opts, issues) => {
      if (v === undefined && o.default !== undefined) v = o.default
      if (typeof v !== 'string') return issue(issues, path, `Expected string, received ${typeName(v)}`, 'string', v)
      if (o.trim) v = v.trim()
      const s = v as string
      if (o.minLength !== undefined && s.length < o.minLength)
        return issue(issues, path, `Expected at least ${o.minLength} characters`, 'string', s)
      if (o.maxLength !== undefined && s.length > o.maxLength)
        return issue(issues, path, `Expected at most ${o.maxLength} characters`, 'string', s)
      if (re && !re.test(s)) return issue(issues, path, `Expected to match ${re.source}`, 'string', s)
      if (o.format && (s.length > 2048 || (o.format === 'email' && s.length > 254) || !FORMATS[o.format].test(s)))
        return issue(issues, path, `Expected a valid ${o.format}`, o.format, s)
      return s
    })
  },

  Number(o: NumberOpts = {}): TSchema<number> {
    return numberLike('number', o, false)
  },

  Integer(o: NumberOpts = {}): TSchema<number> {
    return numberLike('integer', o, true)
  },

  Boolean(o: { default?: boolean; description?: string } = {}): TSchema<boolean> {
    const json: Record<string, unknown> = { type: 'boolean' }
    if (o.default !== undefined) json.default = o.default
    return make('boolean', json, (v, path, opts, issues) => {
      if (v === undefined && o.default !== undefined) return o.default
      if (opts.coerce && typeof v === 'string') {
        if (v === 'true' || v === '1' || v === 'on' || v === '') return true
        if (v === 'false' || v === '0' || v === 'off') return false
      }
      if (typeof v !== 'boolean') return issue(issues, path, `Expected boolean, received ${typeName(v)}`, 'boolean', v)
      return v
    })
  },

  Literal<const L extends string | number | boolean | null>(value: L): TSchema<L> {
    return make('literal', { const: value }, (v, path, opts, issues) => {
      if (opts.coerce && typeof v === 'string' && typeof value !== 'string') {
        if (String(value) === v) return value
      }
      if (v !== value) return issue(issues, path, `Expected ${JSON.stringify(value)}`, JSON.stringify(value), v)
      return value
    })
  },

  Enum<const E extends readonly (string | number)[]>(values: E): TSchema<E[number]> {
    return make('enum', { enum: [...values] }, (v, path, opts, issues) => {
      if (values.includes(v as never)) return v as E[number]
      if (opts.coerce && typeof v === 'string') {
        const n = strictNumber(v)
        if (n !== FAIL && values.includes(n as never)) return n as E[number]
      }
      return issue(issues, path, `Expected one of ${values.map((x) => JSON.stringify(x)).join(', ')}`, 'enum', v)
    })
  },

  Null(): TSchema<null> {
    return make('null', { type: 'null' }, (v, path, _o, issues) =>
      v === null ? null : issue(issues, path, `Expected null, received ${typeName(v)}`, 'null', v),
    )
  },

  Any(): TSchema<any> {
    return make('any', {}, (v) => v)
  },

  Unknown(): TSchema<unknown> {
    return make('unknown', {}, (v) => v)
  },

  Date(): TSchema<Date> {
    return make('date', { type: 'string', format: 'date-time' }, (v, path, _o, issues) => {
      const d = v instanceof Date ? v : typeof v === 'string' || typeof v === 'number' ? new Date(v) : null
      if (!d || Number.isNaN(d.getTime())) return issue(issues, path, 'Expected a valid date', 'date', v)
      return d
    })
  },

  File(o: { maxSize?: number; type?: string | string[] } = {}): TSchema<File> {
    const types = o.type ? (Array.isArray(o.type) ? o.type : [o.type]) : null
    return make('file', { type: 'string', format: 'binary' }, (v, path, _o, issues) => {
      if (typeof Blob === 'undefined' || !(v instanceof Blob))
        return issue(issues, path, `Expected file, received ${typeName(v)}`, 'file', typeName(v))
      if (o.maxSize !== undefined && v.size > o.maxSize)
        return issue(issues, path, `File larger than ${o.maxSize} bytes`, 'file', v.size)
      if (types && !types.some((tp) => (tp.endsWith('/*') ? v.type.startsWith(tp.slice(0, -1)) : v.type === tp)))
        return issue(issues, path, `Expected file of type ${types.join(', ')}`, 'file', v.type)
      return v as File
    })
  },

  Array<S extends AnySchema>(item: S, o: { minItems?: number; maxItems?: number; uniqueItems?: boolean } = {}) {
    const json: Record<string, unknown> = { type: 'array', items: toJsonSchema(item) }
    if (o.minItems !== undefined) json.minItems = o.minItems
    if (o.maxItems !== undefined) json.maxItems = o.maxItems
    if (o.uniqueItems) json.uniqueItems = true
    return make<Static<S>[]>('array', json, (v, path, opts, issues) => {
      if (opts.coerce && !Array.isArray(v) && v !== undefined) v = [v]
      if (!Array.isArray(v)) return issue(issues, path, `Expected array, received ${typeName(v)}`, 'array', v)
      if (o.minItems !== undefined && v.length < o.minItems)
        return issue(issues, path, `Expected at least ${o.minItems} items`, 'array', v.length)
      if (o.maxItems !== undefined && v.length > o.maxItems)
        return issue(issues, path, `Expected at most ${o.maxItems} items`, 'array', v.length)
      const before = issues.length
      const out = v.map((x, i) => runSync(item, x, [...path, i], opts, issues))
      if (issues.length > before) return FAIL as never
      if (o.uniqueItems && new Set(out.map((x) => JSON.stringify(x))).size !== out.length)
        return issue(issues, path, 'Expected unique items', 'array', v)
      return out as Static<S>[]
    })
  },

  Tuple<const S extends readonly AnySchema[]>(items: S) {
    return make<{ [K in keyof S]: Static<S[K]> }>(
      'tuple',
      { type: 'array', prefixItems: items.map(toJsonSchema), minItems: items.length, maxItems: items.length },
      (v, path, opts, issues) => {
        if (!Array.isArray(v) || v.length !== items.length)
          return issue(issues, path, `Expected tuple of ${items.length} items`, 'tuple', v)
        const before = issues.length
        const out = items.map((s, i) => runSync(s, v[i], [...path, i], opts, issues))
        return (issues.length > before ? FAIL : out) as never
      },
    )
  },

  Object<P extends Record<string, AnySchema>>(
    props: P,
    o: { additionalProperties?: boolean; strict?: boolean; description?: string } = {},
  ): TSchema<ObjectOut<P>> & { props: P } {
    const required = Object.keys(props).filter((k) => !(props[k] as TSchema).optional)
    const json: Record<string, unknown> = {
      type: 'object',
      properties: Object.fromEntries(Object.entries(props).map(([k, s]) => [k, toJsonSchema(s)])),
    }
    if (required.length) json.required = required
    if (o.strict) json.additionalProperties = false
    if (o.description) json.description = o.description
    const keys = Object.keys(props)
    const schema = make<ObjectOut<P>>('object', json, (v, path, opts, issues) => {
      if (typeof v !== 'object' || v === null || Array.isArray(v))
        return issue(issues, path, `Expected object, received ${typeName(v)}`, 'object', v)
      const src = v as Record<string, unknown>
      const out: Record<string, unknown> = o.additionalProperties ? { ...src } : {}
      const before = issues.length
      for (const k of keys) {
        const s = props[k]!
        const val = src[k]
        if (val === undefined && (s as TSchema).optional) continue
        const r = runSync(s, val, [...path, k], opts, issues)
        if (r !== undefined) out[k] = r
      }
      if (o.strict) {
        for (const k of Object.keys(src))
          if (!(k in props)) issue(issues, [...path, k], `Unknown property "${k}"`, 'never', src[k])
      }
      return (issues.length > before ? FAIL : out) as never
    })
    return Object.assign(schema, { props })
  },

  Record<V extends AnySchema>(value: V) {
    return make<Record<string, Static<V>>>(
      'record',
      { type: 'object', additionalProperties: toJsonSchema(value) },
      (v, path, opts, issues) => {
        if (typeof v !== 'object' || v === null || Array.isArray(v))
          return issue(issues, path, `Expected object, received ${typeName(v)}`, 'object', v)
        const before = issues.length
        const out: Record<string, unknown> = {}
        for (const [k, x] of Object.entries(v)) out[k] = runSync(value, x, [...path, k], opts, issues)
        return (issues.length > before ? FAIL : out) as never
      },
    )
  },

  Union<const S extends readonly AnySchema[]>(options: S): TSchema<Static<S[number]>> {
    return make('union', { anyOf: options.map(toJsonSchema) }, (v, path, opts, issues) => {
      // try without coercion first so exact matches win, then with coercion
      for (const pass of opts.coerce ? [false, true] : [false]) {
        for (const s of options) {
          const tmp: Issue[] = []
          const r = runSync(s, v, path, { ...opts, coerce: pass }, tmp)
          if (tmp.length === 0) return r
        }
      }
      return issue(issues, path, 'Value did not match any allowed type', 'union', v)
    })
  },

  Optional<S extends AnySchema>(s: S): TSchema<Static<S> | undefined> & { optional: true } {
    return {
      kind: 'optional',
      optional: true,
      json: toJsonSchema(s),
      parse: (v, path, opts, issues) => (v === undefined ? undefined : runSync(s, v, path, opts, issues)),
    }
  },

  Nullable<S extends AnySchema>(s: S): TSchema<Static<S> | null> {
    return make('nullable', { anyOf: [toJsonSchema(s), { type: 'null' }] }, (v, path, opts, issues) =>
      v === null ? null : runSync(s, v, path, opts, issues),
    )
  },

  /** Run a transform after successful validation. */
  Transform<S extends AnySchema, R>(s: S, fn: (v: Static<S>) => R): TSchema<R> {
    return make('transform', toJsonSchema(s), (v, path, opts, issues) => {
      const before = issues.length
      const r = runSync(s, v, path, opts, issues)
      return (issues.length > before ? FAIL : fn(r as Static<S>)) as R
    })
  },

  /** Add a custom check with its own message. */
  Refine<S extends AnySchema>(s: S, check: (v: Static<S>) => boolean, message = 'Invalid value'): TSchema<Static<S>> {
    return make('refine', toJsonSchema(s), (v, path, opts, issues) => {
      const before = issues.length
      const r = runSync(s, v, path, opts, issues)
      if (issues.length > before) return FAIL as never
      return check(r as Static<S>) ? (r as Static<S>) : issue(issues, path, message, 'refine', v)
    })
  },

  /** Numeric string in params/query, e.g. `/users/:id` with `t.Numeric()` */
  Numeric(o: NumberOpts = {}): TSchema<number> {
    const inner = numberLike('number', o, false)
    return make('numeric', inner.json, (v, path, opts, issues) => inner.parse(v, path, { ...opts, coerce: true }, issues))
  },
}

function numberLike(kind: 'number' | 'integer', o: NumberOpts, int: boolean): TSchema<number> {
  const json: Record<string, unknown> = { type: kind, ...o }
  return make(kind, json, (v, path, opts, issues) => {
    if (v === undefined && o.default !== undefined) return o.default
    if (opts.coerce && typeof v === 'string') {
      const n = strictNumber(v)
      if (n === FAIL) return issue(issues, path, `Expected ${kind}, received "${v}"`, kind, v)
      v = n
    }
    if (typeof v !== 'number' || Number.isNaN(v))
      return issue(issues, path, `Expected ${kind}, received ${typeName(v)}`, kind, v)
    if (!Number.isFinite(v)) return issue(issues, path, `Expected a finite ${kind}`, kind, v)
    if (int && !Number.isInteger(v)) return issue(issues, path, 'Expected integer', 'integer', v)
    if (o.minimum !== undefined && v < o.minimum) return issue(issues, path, `Expected >= ${o.minimum}`, kind, v)
    if (o.maximum !== undefined && v > o.maximum) return issue(issues, path, `Expected <= ${o.maximum}`, kind, v)
    if (o.exclusiveMinimum !== undefined && v <= o.exclusiveMinimum)
      return issue(issues, path, `Expected > ${o.exclusiveMinimum}`, kind, v)
    if (o.exclusiveMaximum !== undefined && v >= o.exclusiveMaximum)
      return issue(issues, path, `Expected < ${o.exclusiveMaximum}`, kind, v)
    if (o.multipleOf !== undefined && Math.abs(v / o.multipleOf - Math.round(v / o.multipleOf)) > 1e-9)
      return issue(issues, path, `Expected a multiple of ${o.multipleOf}`, kind, v)
    return v
  })
}

export function isStandardSchema(s: unknown): s is StandardSchemaV1 {
  return typeof s === 'object' && s !== null && '~standard' in s
}

export function isTSchema(s: unknown): s is TSchema {
  return typeof s === 'object' && s !== null && typeof (s as TSchema).parse === 'function' && 'json' in s
}

function runSync(s: AnySchema, v: unknown, path: (string | number)[], opts: ParseOptions, issues: Issue[]): any {
  if (isTSchema(s)) return s.parse(v, path, opts, issues)
  const r = (s as StandardSchemaV1)['~standard'].validate(v)
  if (r instanceof Promise) throw new Error('Async Standard Schema cannot be nested inside t schemas')
  if (r.issues) {
    for (const i of r.issues)
      issues.push({
        path: [...path, ...(i.path ?? []).map((p) => (typeof p === 'object' ? String(p.key) : String(p)))],
        message: i.message,
      })
    return FAIL
  }
  return r.value
}

/** Validate any supported schema. Async Standard Schemas are supported at the top level. */
export async function validate<S extends AnySchema>(
  s: S,
  value: unknown,
  opts: ParseOptions = {},
): Promise<Result<Static<S>>> {
  if (isStandardSchema(s) && !isTSchema(s)) {
    if (opts.coerce) value = coerceForStandard(value)
    const r = await s['~standard'].validate(value)
    if (r.issues)
      return {
        ok: false,
        issues: r.issues.map((i) => ({
          path: (i.path ?? []).map((p) => (typeof p === 'object' ? String(p.key) : String(p))),
          message: i.message,
        })),
      }
    return { ok: true, value: r.value as Static<S> }
  }
  return validateSync(s as TSchema, value, opts) as Result<Static<S>>
}

export function validateSync<S extends TSchema>(s: S, value: unknown, opts: ParseOptions = {}): Result<Static<S>> {
  const issues: Issue[] = []
  const out = s.parse(value, [], opts, issues)
  return issues.length ? { ok: false, issues } : { ok: true, value: out as Static<S> }
}

/** Foreign validators cannot coerce, so give them numbers/booleans from obvious strings. */
function coerceForStandard(v: unknown): unknown {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return v
  return v
}

export function toJsonSchema(s: AnySchema): Record<string, unknown> {
  if (isTSchema(s)) return s.json
  const std = s as unknown as { toJSONSchema?: () => Record<string, unknown> }
  if (typeof std.toJSONSchema === 'function') {
    try {
      return std.toJSONSchema()
    } catch {
      /* ignore */
    }
  }
  return {}
}
