import { useState } from 'react'
import { PRESET_PACKAGES } from '../../parser/config'
import type { LogFileMeta } from '../../parser/types'
import { useStore } from '../../store/useStore'

/** Multi-select of the packages discovered in a file; changing it rebuilds the process tree in the worker. */
export function PackagePicker({ fileId, meta, compact = false }: { fileId: number; meta: LogFileMeta; compact?: boolean }) {
  const reselect = useStore((s) => s.reselectPackages)
  const busy = useStore((s) => s.files.find((f) => f.id === fileId)?.phase !== undefined)
  const [showAll, setShowAll] = useState(false)
  const selected = new Set(meta.selectedPackages)
  const candidates = meta.packages.filter((p) => showAll || p.appTagLines > 0 || p.crashCount > 0 || selected.has(p.pkg) || PRESET_PACKAGES.includes(p.pkg))
  const toggle = (pkg: string) => {
    const next = new Set(selected)
    if (next.has(pkg)) next.delete(pkg)
    else next.add(pkg)
    if (next.size === 0) return
    void reselect(fileId, [...next])
  }
  return (
    <div className={compact ? 'pkg-picker compact' : 'pkg-picker'}>
      <div className="pkg-head">
        <span className="muted">App package{selected.size > 1 ? 's' : ''} ({selected.size} selected{busy ? ', rebuilding…' : ''})</span>
        <button className="link" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'show app packages only' : `show all ${meta.packages.length} packages`}
        </button>
      </div>
      <div className="pkg-list">
        {candidates.map((p) => (
          <label key={p.pkg} className={selected.has(p.pkg) ? 'pkg on' : 'pkg'} title={`${p.pids.length} pid(s)`}>
            <input type="checkbox" checked={selected.has(p.pkg)} onChange={() => toggle(p.pkg)} disabled={busy} />
            <span className="mono">{p.pkg}</span>
            <span className="muted">
              {p.startProcCount} starts · {p.crashCount} crashes{p.appTagLines > 0 ? ` · ${p.appTagLines.toLocaleString('en-US')} app lines` : ''}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
