import { useState, type ReactNode } from 'react'
import type { Scope } from '../../parser/query'
import type { Group, ProcessInstance } from '../../parser/types'
import { useStore } from '../../store/useStore'
import { fmtCount, fmtTime } from '../common/format'
import type { ReadyFile } from './ReadLogsScreen'
import { groupLabel, procEnd, procLabel } from './labels'

function sameScope(a: Scope, b: Scope): boolean {
  if (a.kind !== b.kind) return false
  if ('id' in a && 'id' in b) return a.id === b.id
  return true
}

const procText = (p: ProcessInstance) => `pid ${p.pid} ${p.version ?? ''} ${p.pkg} ${p.startReason} ${procEnd(p)} ${fmtTime(p.startTs, false)}`.toLowerCase()
const groupText = (g: Group) => `${groupLabel(g)} ${g.kind === 'txn' ? `${g.status} ${g.receipt.stan ?? ''} ${g.receipt.rrn ?? ''} ${g.receipt.card ?? ''}` : ''} ${fmtTime(g.startTs, false)}`.toLowerCase()

export function Sidebar({ files }: { files: ReadyFile[] }) {
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const hideIdle = useStore((s) => s.settings.ui.hideIdle)
  const updateSettings = useStore((s) => s.updateSettings)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const q = filter.trim().toLowerCase()
  const matches = (s: string) => q === '' || s.includes(q)
  const toggle = (key: string) => {
    const next = new Set(collapsed)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setCollapsed(next)
  }
  const isOpen = (key: string, def: boolean) => (q ? true : collapsed.has(key) ? !def : def)
  const node = (opts: { key: string; depth: number; label: ReactNode; title?: string; scope?: Scope; fileId: number; badge?: ReactNode; open?: boolean; children?: ReactNode; cls?: string }) => {
    const active = !!opts.scope && selection?.fileId === opts.fileId && sameScope(selection.scope, opts.scope)
    const expandable = opts.children !== undefined
    const open = expandable && isOpen(opts.key, opts.open ?? true)
    return (
      <div key={opts.key} className="tree-node">
        <div className={`tree-row depth-${opts.depth} ${active ? 'active' : ''} ${opts.cls ?? ''}`} title={opts.title}>
          {expandable ? (
            <button className="twisty" onClick={() => toggle(opts.key)} aria-label={open ? 'collapse' : 'expand'}>
              {open ? '▾' : '▸'}
            </button>
          ) : (
            <span className="twisty" />
          )}
          <button className="tree-label" onClick={() => (opts.scope ? select({ fileId: opts.fileId, scope: opts.scope }) : toggle(opts.key))}>
            {opts.label}
          </button>
          {opts.badge}
        </div>
        {open && <div className="tree-children">{opts.children}</div>}
      </div>
    )
  }

  return (
    <nav className="sidebar">
      <div className="tree-tools">
        <input placeholder="filter tree: pid, function, STAN, time…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <label className="switch" title="Hide the idle periods between transactions">
          <input type="checkbox" checked={hideIdle} onChange={(e) => updateSettings((s) => ({ ...s, ui: { ...s.ui, hideIdle: e.target.checked } }))} /> hide idle
        </label>
      </div>
      {files.map((f) => {
        const m = f.meta
        const sel = new Set(m.selectedPackages)
        const incidents = m.incidents.filter((i) => sel.has(i.pkg))
        const crashes = incidents.filter((i) => i.kind === 'fatal-exception' || i.kind === 'native-crash' || i.kind === 'anr').length
        return node({
          key: `f${f.id}`,
          depth: 0,
          fileId: f.id,
          label: <span className="mono">{m.name}</span>,
          title: `${fmtCount(m.lineCount)} lines`,
          cls: 'file',
          children: (
            <>
              {!q && node({ key: `f${f.id}-app`, depth: 1, fileId: f.id, scope: { kind: 'app' }, label: 'All app lines', badge: <span className="count">{fmtCount(m.stats.appLines)}</span> })}
              {!q && node({ key: `f${f.id}-raw`, depth: 1, fileId: f.id, scope: { kind: 'raw' }, label: 'Raw file', badge: <span className="count">{fmtCount(m.lineCount)}</span> })}
              {(!q || 'incidents crashes'.includes(q)) &&
                node({
                  key: `f${f.id}-inc`,
                  depth: 1,
                  fileId: f.id,
                  scope: { kind: 'incidents', context: 3 },
                  label: (
                    <>
                      {crashes > 0 && <span className="dot crash" />}Incidents
                    </>
                  ),
                  badge: (
                    <span className={crashes ? 'count bad' : 'count'}>
                      {crashes ? `${crashes} crash${crashes > 1 ? 'es' : ''} · ` : ''}
                      {incidents.length}
                    </span>
                  ),
                })}
              {m.segments.map((s) => {
                const procs = s.procIds
                  .map((pid) => m.processes[pid])
                  .map((p) => {
                    const own = matches(procText(p))
                    const groups = p.groupIds.map((gid) => m.groups[gid]).filter((g) => (!hideIdle || g.kind === 'txn') && (own || matches(groupText(g))))
                    return { p, groups, show: own || groups.length > 0 }
                  })
                  .filter((x) => x.show)
                if (q && procs.length === 0) return null
                return node({
                  key: `f${f.id}-s${s.id}`,
                  depth: 1,
                  fileId: f.id,
                  scope: { kind: 'seg', id: s.id },
                  open: s.procIds.length > 0,
                  label: (
                    <>
                      <span className="muted">#{s.id + 1}</span> {fmtTime(s.startTs, false)}–{fmtTime(s.endTs, false)} <span className="muted">· {s.boundary === 'reboot' ? 'reboot' : s.boundary === 'time-jump' ? 'dump seam' : 'start'}</span>
                    </>
                  ),
                  title: `${new Date(s.startTs).toISOString().slice(0, 10)} · lines ${s.firstLine + 1}–${s.lastLine + 1}${s.systemServerPid ? ` · system_server ${s.systemServerPid}` : ''}`,
                  badge: (
                    <>
                      {s.clockUnset && <span className="flag">clock?</span>}
                      {s.mixedOrder && <span className="flag">mixed</span>}
                      <span className="count">{s.procIds.length} proc</span>
                    </>
                  ),
                  children: procs.map(({ p, groups }) => {
                    const pInc = p.incidentIds.length
                    const txnCount = p.groupIds.filter((g) => m.groups[g].kind === 'txn').length
                    return node({
                      key: `f${f.id}-p${p.id}`,
                      depth: 2,
                      fileId: f.id,
                      scope: { kind: 'proc', id: p.id },
                      open: selection?.fileId === f.id && selection.scope.kind === 'group' && m.groups[selection.scope.id]?.procId === p.id,
                      label: (
                        <>
                          {p.endReason === 'crash' && <span className="dot crash" />}
                          {procLabel(p)}
                        </>
                      ),
                      title: `${p.pkg} · ${p.startReason}${p.component ? ' ' + p.component : ''} · ${procEnd(p)}`,
                      cls: p.endReason === 'crash' ? 'crashed' : '',
                      badge: (
                        <>
                          {pInc > 0 && p.endReason !== 'crash' && <span className="flag">{pInc} inc</span>}
                          <span className="count">{txnCount} txn</span>
                        </>
                      ),
                      children: groups.map((g) =>
                        node({
                          key: `f${f.id}-g${g.id}`,
                          depth: 3,
                          fileId: f.id,
                          scope: { kind: 'group', id: g.id },
                          cls: g.kind === 'txn' ? `txn ${g.status}` : 'idle',
                          label:
                            g.kind === 'txn' ? (
                              <>
                                <span className={`dot ${g.status}`} />
                                {fmtTime(g.startTs, false)} · {groupLabel(g)}
                              </>
                            ) : (
                              <span className="muted">{groupLabel(g)}</span>
                            ),
                          badge: g.kind === 'txn' && g.incidentIds.length > 0 ? <span className="flag bad">!</span> : undefined,
                        }),
                      ),
                    })
                  }),
                })
              })}
            </>
          ),
        })
      })}
    </nav>
  )
}
