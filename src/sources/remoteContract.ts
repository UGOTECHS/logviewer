/**
 * The ONLY place that knows the log server's REST shape (from the "Logs" Postman collection):
 *   GET {base}api/files/{serial}            → list of the dumps uploaded by that terminal
 *   GET {base}api/files/{serial}/{fileName} → the zip itself
 * Both carry the API key in the `X-API-KEY` header. The server may also require a secret key; its header
 * name is configurable because the collection does not show it. Keys are never stored in this repo.
 */

export const DEFAULT_BASE_URL = 'https://logging.project-jump-start.com/'
export const DEFAULT_API_KEY_HEADER = 'X-API-KEY'
export const DEFAULT_SECRET_KEY_HEADER = 'X-SECRET-KEY'

export interface RemoteLogEntry {
  name: string
  size?: number
  uploadedAt?: string
  url?: string
}

export interface RemoteAuth {
  apiKey: string
  secretKey?: string
  apiKeyHeader?: string
  secretKeyHeader?: string
}

export function normalizeBase(base: string): string {
  const b = base.trim()
  return b.endsWith('/') ? b : b + '/'
}

export function listUrl(base: string, serial: string): string {
  return new URL(`api/files/${encodeURIComponent(serial.trim())}`, normalizeBase(base)).toString()
}

export function downloadUrl(base: string, serial: string, entry: RemoteLogEntry): string {
  if (entry.url) return new URL(entry.url, normalizeBase(base)).toString()
  return new URL(`api/files/${encodeURIComponent(serial.trim())}/${encodeURIComponent(entry.name)}`, normalizeBase(base)).toString()
}

export function authHeaders(auth: RemoteAuth): Record<string, string> {
  const h: Record<string, string> = {}
  if (auth.apiKey) h[auth.apiKeyHeader?.trim() || DEFAULT_API_KEY_HEADER] = auth.apiKey
  if (auth.secretKey) h[auth.secretKeyHeader?.trim() || DEFAULT_SECRET_KEY_HEADER] = auth.secretKey
  return h
}

/**
 * The list response shape is not documented. Accepts a bare array or `{files|items|data: […]}` whose
 * elements are file names or objects with `name|fileName|filename|file`, `size|length|fileSize`,
 * `uploadedAt|createdAt|lastModified|date` and `url|downloadUrl`.
 */
export function toEntries(json: unknown): RemoteLogEntry[] {
  const obj = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : null
  const list = Array.isArray(json) ? json : obj ? (obj.files ?? obj.items ?? obj.data ?? obj.result ?? obj.logs) : null
  if (!Array.isArray(list)) return []
  return list
    .map((x): RemoteLogEntry | null => {
      if (typeof x === 'string') return { name: x.split('/').pop() ?? x, url: x.includes('/') ? x : undefined }
      if (typeof x === 'object' && x !== null) {
        const o = x as Record<string, unknown>
        const name = (o.name ?? o.fileName ?? o.filename ?? o.file) as string | undefined
        if (typeof name !== 'string') return null
        const size = o.size ?? o.length ?? o.fileSize
        const uploadedAt = o.uploadedAt ?? o.createdAt ?? o.lastModified ?? o.date ?? o.created
        const url = o.url ?? o.downloadUrl
        return {
          name,
          size: typeof size === 'number' ? size : typeof size === 'string' && /^\d+$/.test(size) ? Number(size) : undefined,
          uploadedAt: typeof uploadedAt === 'string' ? uploadedAt : undefined,
          url: typeof url === 'string' ? url : undefined,
        }
      }
      return null
    })
    .filter((x): x is RemoteLogEntry => x !== null)
}
