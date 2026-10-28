import { authHeaders, downloadUrl, listUrl, toEntries, type RemoteAuth, type RemoteLogEntry } from './remoteContract'

export interface RemoteSource {
  list(serial: string): Promise<RemoteLogEntry[]>
  download(serial: string, entry: RemoteLogEntry): Promise<Uint8Array>
}

export interface RemoteSettings extends RemoteAuth {
  baseUrl: string
}

export class RemoteError extends Error {
  constructor(
    message: string,
    public readonly hint?: string,
  ) {
    super(message)
  }
}

function explain(e: unknown, origin: string, headerNames: string[]): RemoteError {
  if (e instanceof RemoteError) return e
  if (e instanceof TypeError) {
    return new RemoteError('The browser could not reach the server (network error or CORS).', `The log server must allow cross-origin requests from ${origin} and the ${headerNames.join(' / ')} header(s): Access-Control-Allow-Origin and Access-Control-Allow-Headers.`)
  }
  return new RemoteError(e instanceof Error ? e.message : String(e))
}

export class RestRemoteSource implements RemoteSource {
  constructor(private settings: RemoteSettings) {}

  private headers(): Record<string, string> {
    return authHeaders(this.settings)
  }

  private wrap(e: unknown): RemoteError {
    return explain(e, typeof location !== 'undefined' ? location.origin : 'this site', Object.keys(this.headers()))
  }

  async list(serial: string): Promise<RemoteLogEntry[]> {
    if (!serial.trim()) throw new RemoteError('Enter the terminal serial number (S/N) first.')
    try {
      const res = await fetch(listUrl(this.settings.baseUrl, serial), { headers: this.headers() })
      if (res.status === 401 || res.status === 403) throw new RemoteError(`The server rejected the API key / secret (HTTP ${res.status}).`)
      if (res.status === 404) throw new RemoteError(`No files found for serial ${serial.trim()} (HTTP 404).`)
      if (!res.ok) throw new RemoteError(`List request failed: HTTP ${res.status}.`)
      const entries = toEntries(await res.json())
      return entries.sort((a, b) => (b.uploadedAt ?? b.name).localeCompare(a.uploadedAt ?? a.name))
    } catch (e) {
      throw this.wrap(e)
    }
  }

  async download(serial: string, entry: RemoteLogEntry): Promise<Uint8Array> {
    try {
      const res = await fetch(downloadUrl(this.settings.baseUrl, serial, entry), { headers: this.headers() })
      if (res.status === 401 || res.status === 403) throw new RemoteError(`The server rejected the API key / secret (HTTP ${res.status}).`)
      if (!res.ok) throw new RemoteError(`Download of ${entry.name} failed: HTTP ${res.status}.`)
      return new Uint8Array(await res.arrayBuffer())
    } catch (e) {
      throw this.wrap(e)
    }
  }
}

export function createRemoteSource(settings: RemoteSettings): RemoteSource {
  return new RestRemoteSource(settings)
}
