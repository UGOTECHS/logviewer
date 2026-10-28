import { create } from 'zustand'
import { ALL_LEVELS, type FilterSpec, type Scope } from '../parser/query'
import { Family, type LineColumns, type LogFileMeta } from '../parser/types'
import { parserClient } from '../worker/workerClient'
import { readLocalFiles, readUrl, type SourceFile } from '../sources/LocalSource'
import { createRemoteSource, RemoteError } from '../sources/RemoteSource'
import type { RemoteLogEntry } from '../sources/remoteContract'
import { activeServer, loadSettings, saveSettings, type Settings } from './settings'
import { parseDumpName } from '../parser/parseFile'

export type Screen = 'get' | 'read' | 'overview'

export interface LoadedFile {
  id: number
  name: string
  status: 'loading' | 'ready' | 'error'
  phase?: string
  progress?: number
  error?: string
  meta?: LogFileMeta
  cols?: LineColumns
  bytes?: Uint8Array
}

export interface Filters {
  levels: number // bitmask
  families: number // bitmask of families explicitly toggled off? no: visible families
  tagIds: number[]
  text: string
  regex: boolean
  caseSensitive: boolean
  hideEcho: boolean
  showRuntime: boolean
  showSystem: boolean
  incidentCategories: ('crash' | 'kill' | 'managed' | 'java')[]
  incidentContext: number
  selectedPackagesOnly: boolean
  /** filter: show only matching lines; highlight: show the scope and mark matches */
  searchMode: 'filter' | 'highlight'
  /** show times relative to the start of the scoped transaction */
  relativeTime: boolean
}

export interface Selection {
  fileId: number
  scope: Scope
}

interface State {
  screen: Screen
  files: LoadedFile[]
  selection: Selection | null
  filters: Filters
  view: { lines: Uint32Array; matches: Uint32Array | null; fileId: number; pending: boolean; reqId: number }
  selectedLine: number | null
  scrollTo: { fileId: number; line: number; nonce: number } | null
  settings: Settings
  remote: { entries: RemoteLogEntry[]; busy: boolean; error?: string; hint?: string }
  setScreen: (s: Screen) => void
  addLocalFiles: (files: Iterable<File>) => Promise<void>
  addSources: (sources: SourceFile[], origin: LogFileMeta['origin']) => Promise<void>
  loadUrl: (url: string) => Promise<void>
  removeFile: (id: number) => void
  reselectPackages: (fileId: number, packages: string[]) => Promise<void>
  select: (sel: Selection | null) => void
  /** Select a scope and scroll the table to a line once the query has run. */
  jumpTo: (sel: Selection, line: number) => void
  clearScrollTo: () => void
  /** Move the selection to the next (1) or previous (-1) search match in highlight mode. */
  nextMatch: (dir: 1 | -1) => void
  selectLine: (line: number | null) => void
  setFilters: (patch: Partial<Filters>) => void
  updateSettings: (patch: Partial<Settings> | ((s: Settings) => Settings)) => void
  remoteList: () => Promise<void>
  remoteDownload: (entries: RemoteLogEntry[]) => Promise<void>
  exportVisible: () => Promise<void>
}

const settings = loadSettings()
let nextFileId = 1
let queryTimer: ReturnType<typeof setTimeout> | null = null

export const ALL_FAMILIES = 0b111111111

export function familyMask(f: Filters): number {
  let mask = ALL_FAMILIES
  if (f.hideEcho) mask &= ~(1 << Family.Echo)
  if (!f.showRuntime) mask &= ~(1 << Family.Runtime)
  if (!f.showSystem) mask &= ~(1 << Family.System)
  return mask & f.families
}

export function toSpec(sel: Selection, f: Filters): FilterSpec {
  return {
    scope: sel.scope,
    levelMask: f.levels,
    familyMask: familyMask(f),
    tagIds: f.tagIds,
    incidentCategories: f.incidentCategories,
    selectedPackagesOnly: f.selectedPackagesOnly,
    text: f.text ? { pattern: f.text, regex: f.regex, caseSensitive: f.caseSensitive } : undefined,
  }
}

export const useStore = create<State>((set, get) => {
  const scheduleQuery = () => {
    if (queryTimer) clearTimeout(queryTimer)
    queryTimer = setTimeout(runQueryNow, 120)
  }
  const runQueryNow = async () => {
    const { selection, filters, files } = get()
    if (!selection) return
    const file = files.find((f) => f.id === selection.fileId)
    if (!file || file.status !== 'ready') return
    const reqId = get().view.reqId + 1
    set({ view: { ...get().view, pending: true, reqId } })
    try {
      const spec = toSpec(selection, filters)
      let lines: Uint32Array
      let matches: Uint32Array | null = null
      if (filters.searchMode === 'highlight' && spec.text) {
        ;[lines, matches] = await Promise.all([parserClient().query(selection.fileId, { ...spec, text: undefined }), parserClient().query(selection.fileId, spec)])
      } else lines = await parserClient().query(selection.fileId, spec)
      if (get().view.reqId !== reqId) return
      set({ view: { lines, matches, fileId: selection.fileId, pending: false, reqId } })
    } catch {
      if (get().view.reqId === reqId) set({ view: { ...get().view, pending: false } })
    }
  }

  const addSources = async (sources: SourceFile[], origin: LogFileMeta['origin']) => {
    const { settings } = get()
    for (const src of sources) {
      const id = nextFileId++
      set({ files: [...get().files, { id, name: src.name, status: 'loading', phase: 'reading', progress: 0 }] })
      const patch = (p: Partial<LoadedFile>) => set({ files: get().files.map((f) => (f.id === id ? { ...f, ...p } : f)) })
      try {
        const res = await parserClient().parse(id, src.name, origin, src.bytes, { packages: settings.packages }, (phase, done, total) => patch({ phase, progress: total ? done / total : 0 }))
        patch({ status: 'ready', meta: res.meta, cols: res.cols, bytes: res.bytes, name: res.meta.name, phase: undefined, progress: 1 })
        if (!get().selection) {
          set({ selection: { fileId: id, scope: { kind: 'app' } }, screen: 'overview' })
          scheduleQuery()
        }
      } catch (e) {
        patch({ status: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  return {
    screen: 'get',
    files: [],
    selection: null,
    filters: {
      levels: ALL_LEVELS,
      families: ALL_FAMILIES,
      tagIds: [],
      text: '',
      regex: false,
      caseSensitive: false,
      hideEcho: settings.ui.hideEcho,
      showRuntime: settings.ui.showRuntime,
      showSystem: settings.ui.showSystem,
      incidentCategories: ['crash', 'kill', 'managed', 'java'],
      incidentContext: 3,
      selectedPackagesOnly: true,
      searchMode: settings.ui.searchMode,
      relativeTime: false,
    },
    view: { lines: new Uint32Array(0), matches: null, fileId: -1, pending: false, reqId: 0 },
    selectedLine: null,
    scrollTo: null,
    settings,
    remote: { entries: [], busy: false },

    setScreen: (screen) => set({ screen }),
    addLocalFiles: async (files) => addSources(await readLocalFiles(files), 'local'),
    addSources,
    loadUrl: async (url) => {
      const id = nextFileId++
      set({ files: [...get().files, { id, name: url, status: 'loading', phase: 'downloading', progress: 0 }] })
      try {
        const src = await readUrl(url)
        set({ files: get().files.filter((f) => f.id !== id) })
        await addSources([src], 'url')
      } catch (e) {
        set({ files: get().files.map((f) => (f.id === id ? { ...f, status: 'error', error: e instanceof Error ? e.message : String(e) } : f)) })
      }
    },
    removeFile: (id) => {
      parserClient().drop(id)
      const files = get().files.filter((f) => f.id !== id)
      const selection = get().selection?.fileId === id ? null : get().selection
      set({ files, selection, view: { lines: new Uint32Array(0), matches: null, fileId: -1, pending: false, reqId: get().view.reqId }, selectedLine: null })
      if (!selection) {
        const next = files.find((f) => f.status === 'ready')
        if (next) {
          set({ selection: { fileId: next.id, scope: { kind: 'app' } } })
          scheduleQuery()
        }
      }
    },
    reselectPackages: async (fileId, packages) => {
      const patch = (p: Partial<LoadedFile>) => set({ files: get().files.map((f) => (f.id === fileId ? { ...f, ...p } : f)) })
      patch({ phase: 'instances', progress: 0 })
      try {
        const res = await parserClient().reselect(fileId, packages, (phase) => patch({ phase }))
        patch({ meta: res.meta, cols: res.cols, phase: undefined, progress: 1 })
        get().updateSettings({ packages })
        const sel = get().selection
        if (sel?.fileId === fileId) set({ selection: { fileId, scope: { kind: 'app' } }, selectedLine: null })
        scheduleQuery()
      } catch (e) {
        patch({ phase: undefined, error: e instanceof Error ? e.message : String(e) })
      }
    },
    select: (selection) => {
      set({ selection, selectedLine: null })
      if (selection) scheduleQuery()
      else set({ view: { lines: new Uint32Array(0), matches: null, fileId: -1, pending: false, reqId: get().view.reqId } })
    },
    jumpTo: (selection, line) => {
      set({ selection, selectedLine: line, scrollTo: { fileId: selection.fileId, line, nonce: Date.now() } })
      scheduleQuery()
    },
    clearScrollTo: () => set({ scrollTo: null }),
    nextMatch: (dir) => {
      const { view, selectedLine, selection } = get()
      if (!selection || !view.matches || view.matches.length === 0) return
      const m = view.matches
      let idx: number
      if (selectedLine === null) idx = dir === 1 ? 0 : m.length - 1
      else {
        // first match strictly after (or before) the selected line, wrapping around
        let lo = 0
        let hi = m.length
        while (lo < hi) {
          const mid = (lo + hi) >> 1
          if (m[mid] <= selectedLine) lo = mid + 1
          else hi = mid
        }
        idx = dir === 1 ? (lo >= m.length ? 0 : lo) : lo - 1 - (lo > 0 && m[lo - 1] === selectedLine ? 1 : 0)
        if (idx < 0) idx = m.length - 1
      }
      const line = m[idx]
      set({ selectedLine: line, scrollTo: { fileId: selection.fileId, line, nonce: Date.now() } })
    },
    selectLine: (selectedLine) => set({ selectedLine }),
    setFilters: (patch) => {
      const filters = { ...get().filters, ...patch }
      set({ filters })
      if ('hideEcho' in patch || 'showRuntime' in patch || 'showSystem' in patch || 'searchMode' in patch) get().updateSettings((s) => ({ ...s, ui: { ...s.ui, hideEcho: filters.hideEcho, showRuntime: filters.showRuntime, showSystem: filters.showSystem, searchMode: filters.searchMode } }))
      scheduleQuery()
    },
    updateSettings: (patch) => {
      const next = typeof patch === 'function' ? patch(get().settings) : { ...get().settings, ...patch }
      set({ settings: next })
      saveSettings(next)
    },
    remoteList: async () => {
      const { settings } = get()
      set({ remote: { entries: [], busy: true } })
      try {
        const src = createRemoteSource(remoteSettings(settings))
        let entries = await src.list(settings.remote.serial.trim())
        // The list endpoint takes no date range; narrow it here on the upload date or the dump date in the name.
        const { from, to } = settings.remote
        if (from || to) {
          entries = entries.filter((e) => {
            const d = e.uploadedAt?.slice(0, 10) ?? (parseDumpName(e.name).dumpTs !== undefined ? new Date(parseDumpName(e.name).dumpTs!).toISOString().slice(0, 10) : undefined)
            if (!d) return true
            return (!from || d >= from) && (!to || d <= to)
          })
        }
        set({ remote: { entries, busy: false } })
      } catch (e) {
        set({ remote: { entries: [], busy: false, error: e instanceof Error ? e.message : String(e), hint: e instanceof RemoteError ? e.hint : undefined } })
      }
    },
    remoteDownload: async (entries) => {
      const { settings } = get()
      set({ remote: { ...get().remote, busy: true, error: undefined } })
      try {
        const src = createRemoteSource(remoteSettings(settings))
        const sources: SourceFile[] = []
        for (const e of entries) sources.push({ name: e.name, bytes: await src.download(settings.remote.serial.trim(), e) })
        set({ remote: { ...get().remote, busy: false } })
        await addSources(sources, 'remote')
      } catch (e) {
        set({ remote: { ...get().remote, busy: false, error: e instanceof Error ? e.message : String(e), hint: e instanceof RemoteError ? e.hint : undefined } })
      }
    },
    exportVisible: async () => {
      const { view, files } = get()
      const file = files.find((f) => f.id === view.fileId)
      if (!file || view.lines.length === 0) return
      const bytes = await parserClient().exportLines(view.fileId, view.lines)
      downloadBlob(new Blob([bytes as BlobPart], { type: 'text/plain' }), `${file.name.replace(/[^\w.-]+/g, '_')}.filtered.txt`)
    },
  }
})

function remoteSettings(s: Settings) {
  const srv = activeServer(s)
  return { baseUrl: srv.baseUrl, apiKey: srv.apiKey, secretKey: srv.secretKey, apiKeyHeader: srv.apiKeyHeader, secretKeyHeader: srv.secretKeyHeader }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
