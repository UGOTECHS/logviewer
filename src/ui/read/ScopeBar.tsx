import type { Scope } from '../../parser/query'
import { useStore } from '../../store/useStore'
import { fmtTime } from '../common/format'
import type { ReadyFile } from './ReadLogsScreen'
import { groupLabel, incidentLabel } from './labels'

interface Crumb {
  label: string
  scope?: Scope
}

/** Breadcrumb of the current scope (file › segment › process › transaction) with a relative-time toggle. */
export function ScopeBar({ file }: { file: ReadyFile }) {
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const filters = useStore((s) => s.filters)
  const setFilters = useStore((s) => s.setFilters)
  const m = file.meta
  const crumbs: Crumb[] = [{ label: m.name.length > 40 ? '…' + m.name.slice(-38) : m.name, scope: { kind: 'app' } }]
  const sc = selection?.fileId === file.id ? selection.scope : { kind: 'app' as const }
  const segCrumb = (segId: number): Crumb => {
    const s = m.segments[segId]
    return { label: `segment #${segId + 1} · ${fmtTime(s.startTs, false)}`, scope: { kind: 'seg', id: segId } }
  }
  const procCrumb = (procId: number): Crumb => {
    const p = m.processes[procId]
    return { label: `pid ${p.pid}${p.version ? ' · v' + p.version.replace(/^QA_/, '') : ''}`, scope: { kind: 'proc', id: procId } }
  }
  switch (sc.kind) {
    case 'raw':
      crumbs.push({ label: 'raw file' })
      break
    case 'seg':
      crumbs.push(segCrumb(sc.id))
      break
    case 'proc':
      crumbs.push(segCrumb(m.processes[sc.id].segId), procCrumb(sc.id))
      break
    case 'group': {
      const g = m.groups[sc.id]
      if (g) crumbs.push(segCrumb(m.processes[g.procId].segId), procCrumb(g.procId), { label: groupLabel(g) })
      break
    }
    case 'incident': {
      const inc = m.incidents[sc.id]
      if (inc) {
        if (inc.procId >= 0) crumbs.push(segCrumb(m.processes[inc.procId].segId), procCrumb(inc.procId))
        crumbs.push({ label: 'incidents', scope: { kind: 'incidents', context: filters.incidentContext } }, { label: incidentLabel(inc) })
      }
      break
    }
    case 'incidents':
      crumbs.push({ label: 'incidents' })
      break
    case 'around':
      crumbs.push({ label: `lines around ${(sc.line + 1).toLocaleString('en-US')} (±${sc.context})` })
      break
  }
  const isTxn = sc.kind === 'group' && m.groups[sc.id]?.kind === 'txn'
  return (
    <div className="scopebar">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        return (
          <span key={i} className="crumb-wrap">
            {i > 0 && <span className="crumb-sep">›</span>}
            {c.scope && !last ? (
              <button className="crumb link" onClick={() => select({ fileId: file.id, scope: c.scope! })}>
                {c.label}
              </button>
            ) : (
              <span className={last ? 'crumb current' : 'crumb'}>{c.label}</span>
            )}
          </span>
        )
      })}
      <span className="spacer" />
      {isTxn && (
        <label className="switch" title="Show times relative to the start of this transaction">
          <input type="checkbox" checked={filters.relativeTime} onChange={(e) => setFilters({ relativeTime: e.target.checked })} /> relative time
        </label>
      )}
    </div>
  )
}
