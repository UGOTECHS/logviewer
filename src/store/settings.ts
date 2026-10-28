import { DEFAULT_BASE_URL } from '../sources/remoteContract'

const KEY = 'logviewer.settings.v2'
const LEGACY_KEY = 'logviewer.settings.v1'

/** One log server: where it is and which headers carry the credentials. Keys are stored only when `rememberKeys` is on. */
export interface ServerProfile {
  id: string
  name: string
  baseUrl: string
  apiKeyHeader: string
  secretKeyHeader: string
  apiKey: string
  secretKey: string
}

export interface Settings {
  remote: { servers: ServerProfile[]; serverId: string; rememberKeys: boolean; serial: string; from: string; to: string }
  packages: string[] // last explicit package selection; empty = auto
  ui: { hideEcho: boolean; showRuntime: boolean; showSystem: boolean; hideIdle: boolean; searchMode: 'filter' | 'highlight' }
}

export const DEFAULT_SERVERS: ServerProfile[] = [
  { id: 'wpay', name: 'WPay log server', baseUrl: DEFAULT_BASE_URL, apiKeyHeader: 'X-API-KEY', secretKeyHeader: 'X-API-SECRET', apiKey: '', secretKey: '' },
  { id: 'other', name: 'Other server (API-KEY / API-SECRET)', baseUrl: '', apiKeyHeader: 'API-KEY', secretKeyHeader: 'API-SECRET', apiKey: '', secretKey: '' },
]

export const defaultSettings: Settings = {
  remote: { servers: DEFAULT_SERVERS, serverId: 'wpay', rememberKeys: false, serial: '', from: '', to: '' },
  packages: [],
  ui: { hideEcho: true, showRuntime: false, showSystem: true, hideIdle: false, searchMode: 'filter' },
}

export function activeServer(s: Settings): ServerProfile {
  return s.remote.servers.find((x) => x.id === s.remote.serverId) ?? s.remote.servers[0] ?? DEFAULT_SERVERS[0]
}

export function newServerId(): string {
  return `srv-${Date.now().toString(36)}`
}

function normalize(parsed: Partial<Settings> | null): Settings {
  const base = structuredClone(defaultSettings)
  if (!parsed) return base
  const remote = parsed.remote as Partial<Settings['remote']> & { baseUrl?: string; apiKey?: string; secretKey?: string; apiKeyHeader?: string; secretKeyHeader?: string; rememberKey?: boolean }
  let servers = Array.isArray(remote?.servers) && remote.servers.length > 0 ? remote.servers.map((x) => ({ ...DEFAULT_SERVERS[0], ...x })) : base.remote.servers
  // v1 settings had a single connection; carry it into the first profile.
  if (remote && !Array.isArray(remote.servers) && (remote.baseUrl || remote.apiKey)) {
    servers = servers.map((x, i) => (i === 0 ? { ...x, baseUrl: remote.baseUrl || x.baseUrl, apiKey: remote.apiKey ?? '', secretKey: remote.secretKey ?? '', apiKeyHeader: remote.apiKeyHeader || x.apiKeyHeader, secretKeyHeader: remote.secretKeyHeader || x.secretKeyHeader } : x))
  }
  return {
    remote: {
      servers,
      serverId: typeof remote?.serverId === 'string' && servers.some((x) => x.id === remote.serverId) ? remote.serverId : servers[0].id,
      rememberKeys: remote?.rememberKeys ?? remote?.rememberKey ?? false,
      serial: remote?.serial ?? '',
      from: remote?.from ?? '',
      to: remote?.to ?? '',
    },
    packages: parsed.packages ?? [],
    ui: { ...base.ui, ...parsed.ui },
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY)
    return normalize(raw ? (JSON.parse(raw) as Partial<Settings>) : null)
  } catch {
    return structuredClone(defaultSettings)
  }
}

export function saveSettings(s: Settings): void {
  try {
    const servers = s.remote.servers.map((x) => (s.remote.rememberKeys ? x : { ...x, apiKey: '', secretKey: '' }))
    localStorage.setItem(KEY, JSON.stringify({ ...s, remote: { ...s.remote, servers } }))
  } catch {
    /* storage unavailable: settings stay in memory */
  }
}
