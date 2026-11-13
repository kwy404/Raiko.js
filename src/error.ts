import type { Issue } from './schema'

/** HTTP error that renders as RFC 9457 problem+json. */
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown
  readonly headers?: Record<string, string>

  constructor(status: number, message?: string, opts: { code?: string; details?: unknown; headers?: Record<string, string> } = {}) {
    super(message ?? STATUS_TEXT[status] ?? 'Error')
    this.name = 'HttpError'
    this.status = status
    this.code = opts.code ?? (STATUS_TEXT[status] ?? 'error').toLowerCase().replace(/\s+/g, '_')
    this.details = opts.details
    this.headers = opts.headers
  }

  toJSON() {
    return {
      type: `https://httpstatuses.io/${this.status}`,
      title: STATUS_TEXT[this.status] ?? 'Error',
      status: this.status,
      code: this.code,
      detail: this.message,
      ...(this.details !== undefined ? { errors: this.details } : {}),
    }
  }

  toResponse(): Response {
    return new Response(JSON.stringify(this.toJSON()), {
      status: this.status,
      headers: { 'content-type': 'application/problem+json', ...this.headers },
    })
  }
}

export class ValidationError extends HttpError {
  readonly issues: Issue[]
  readonly on: string
  constructor(on: string, issues: Issue[]) {
    const first = issues[0]
    const where = first && first.path.length ? `${on}.${first.path.join('.')}` : on
    super(422, first ? `${where}: ${first.message}` : `Invalid ${on}`, { code: 'validation', details: issues.map((i) => ({ ...i, on })) })
    this.name = 'ValidationError'
    this.issues = issues
    this.on = on
  }
}

export const NotFound = (msg?: string) => new HttpError(404, msg)
export const BadRequest = (msg?: string) => new HttpError(400, msg)
export const Unauthorized = (msg?: string) => new HttpError(401, msg)
export const Forbidden = (msg?: string) => new HttpError(403, msg)
export const Conflict = (msg?: string) => new HttpError(409, msg)
export const TooManyRequests = (msg?: string, retryAfter?: number) =>
  new HttpError(429, msg, retryAfter ? { headers: { 'retry-after': String(retryAfter) } } : {})

export const STATUS_TEXT: Record<number, string> = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found',
  303: 'See Other', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
  406: 'Not Acceptable', 408: 'Request Timeout', 409: 'Conflict', 410: 'Gone', 411: 'Length Required',
  413: 'Payload Too Large', 415: 'Unsupported Media Type', 418: "I'm a teapot", 422: 'Unprocessable Content',
  429: 'Too Many Requests', 500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway',
  503: 'Service Unavailable', 504: 'Gateway Timeout',
}
