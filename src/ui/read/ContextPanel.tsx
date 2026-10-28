import { FAMILY_NAMES, LEVEL_CHARS, type Incident, type ProcessInstance, type Transaction } from '../../parser/types'
import { downloadBlob, useStore } from '../../store/useStore'
import { PackagePicker } from '../common/PackagePicker'
import { fmtAmount, fmtCount, fmtDateTime, fmtDuration, fmtTime } from '../common/format'
import type { ReadyFile } from './ReadLogsScreen'
import { groupLabel, incidentLabel, procEnd, txnResult, txnSummaryText, txnTitle } from './labels'
import { groupIncidents } from '../../parser/incidentGroups'

export function ContextPanel({ file }: { file: ReadyFile }) {
  const selection = useStore((s) => s.selection)
  if (!selection || selection.fileId !== file.id) return <FilePanel file={file} />
  const sc = selection.scope
  const m = file.meta
  switch (sc.kind) {
    case 'group': {
      const g = m.groups[sc.id]
      if (!g) return null
      return g.kind === 'txn' ? <TransactionPanel file={file} t={g} /> : <ProcessPanel file={file} p={m.processes[g.procId]} />
    }
    case 'proc':
      return <ProcessPanel file={file} p={m.processes[sc.id]} />
    case 'incident':
      return <IncidentPanel file={file} inc={m.incidents[sc.id]} />
    case 'incidents':
      return <IncidentList file={file} />
    case 'seg': {
      const s = m.segments[sc.id]
      return (
        <div className="panel">
          <h3>Boot segment #{s.id + 1}</h3>
          <dl>
            <dt>boundary</dt>
            <dd>{s.boundary === 'reboot' ? 'reboot (ART marker)' : s.boundary === 'time-jump' ? 'dump seam (time jump)' : 'start of file'}</dd>
            <dt>time</dt>
            <dd>
              {fmtDateTime(s.startTs)} → {fmtDateTime(s.endTs)}
            </dd>
            <dt>lines</dt>
            <dd>
              {fmtCount(s.firstLine + 1)}–{fmtCount(s.lastLine + 1)}
            </dd>
            <dt>system_server</dt>
            <dd>{s.systemServerPid ?? '—'}</dd>
            <dt>flags</dt>
            <dd>
              {s.bootConfirmed ? 'boot confirmed · ' : ''}
              {s.clockUnset ? 'clock not set yet · ' : ''}
              {s.mixedOrder ? 'merged short segment' : ''}
            </dd>
          </dl>
          <h4>Processes</h4>
          <ProcLinks file={file} ids={s.procIds} />
        </div>
      )
    }
    default:
      return <FilePanel file={file} />
  }
}

function FilePanel({ file }: { file: ReadyFile }) {
  const m = file.meta
  return (
    <div className="panel">
      <h3 className="mono">{m.name}</h3>
      <dl>
        <dt>size</dt>
        <dd>
          {fmtCount(m.lineCount)} lines · {(m.byteLength / 1048576).toFixed(1)} MB
        </dd>
        <dt>time span</dt>
        <dd>
          {fmtDateTime(m.firstTs)} → {fmtDateTime(m.lastTs)}
        </dd>
        {m.serial && (
          <>
            <dt>serial</dt>
            <dd>{m.serial}</dd>
          </>
        )}
        <dt>app lines</dt>
        <dd>{fmtCount(m.stats.appLines)}</dd>
      </dl>
      <PackagePicker fileId={file.id} meta={m} compact />
      <h4>Families</h4>
      <table className="kv">
        <tbody>
          {FAMILY_NAMES.map((n, i) =>
            m.stats.byFamily[i] > 0 ? (
              <tr key={n}>
                <td>{n}</td>
                <td className="num">{fmtCount(m.stats.byFamily[i])}</td>
              </tr>
            ) : null,
          )}
        </tbody>
      </table>
      <h4>Levels</h4>
      <table className="kv">
        <tbody>
          {LEVEL_CHARS.map((c, i) =>
            m.stats.byLevel[i] > 0 ? (
              <tr key={c}>
                <td>{c}</td>
                <td className="num">{fmtCount(m.stats.byLevel[i])}</td>
              </tr>
            ) : null,
          )}
        </tbody>
      </table>
    </div>
  )
}

function ProcLinks({ file, ids }: { file: ReadyFile; ids: number[] }) {
  const select = useStore((s) => s.select)
  return (
    <ul className="links">
      {ids.map((id) => {
        const p = file.meta.processes[id]
        return (
          <li key={id}>
            <button className="link" onClick={() => select({ fileId: file.id, scope: { kind: 'proc', id } })}>
              pid {p.pid} · {p.pkg} · {fmtTime(p.startTs, false)} · {procEnd(p)}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function ProcessPanel({ file, p }: { file: ReadyFile; p: ProcessInstance }) {
  const select = useStore((s) => s.select)
  const m = file.meta
  return (
    <div className="panel">
      <h3>Process pid {p.pid}</h3>
      <dl>
        <dt>package</dt>
        <dd className="mono">{p.pkg}</dd>
        <dt>version</dt>
        <dd>{p.version ?? '—'}</dd>
        <dt>started</dt>
        <dd>
          {fmtDateTime(p.startTs)} · {p.startReason}
          {p.component ? ` · ${p.component.split('/').pop()}` : ''}
        </dd>
        <dt>ended</dt>
        <dd className={p.endReason === 'crash' ? 'bad' : ''}>
          {fmtDateTime(p.endTs)} · {procEnd(p)}
        </dd>
        <dt>lines</dt>
        <dd>
          {fmtCount(p.lines.length)} · {p.errorCount} at E/F
        </dd>
        <dt>families</dt>
        <dd>{FAMILY_NAMES.map((n, i) => (p.counts[i] ? `${n} ${fmtCount(p.counts[i])}` : null)).filter(Boolean).join(' · ')}</dd>
        {p.stepTraceGuid && (
          <>
            <dt>launch id</dt>
            <dd className="mono">{p.stepTraceGuid}</dd>
          </>
        )}
      </dl>
      {p.incidentIds.length > 0 && (
        <>
          <h4>Incidents</h4>
          <ul className="links">
            {groupIncidents(p.incidentIds.map((id) => m.incidents[id])).map((g) => (
              <li key={g.inc.id}>
                <button className={`link ${g.inc.kind === 'fatal-exception' ? 'bad' : ''}`} onClick={() => select({ fileId: file.id, scope: { kind: 'incident', id: g.inc.id, context: 3 } })}>
                  {incidentLabel(g.inc)}
                  {g.count > 1 ? ` ×${g.count}` : ''}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <h4>Timeline</h4>
      <ul className="links">
        {p.groupIds.map((gid) => {
          const g = m.groups[gid]
          return (
            <li key={gid}>
              <button className={`link ${g.kind === 'txn' ? 'txn ' + g.status : 'muted'}`} onClick={() => select({ fileId: file.id, scope: { kind: 'group', id: gid } })}>
                {fmtTime(g.startTs, false)} · {groupLabel(g)}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function TransactionPanel({ file, t }: { file: ReadyFile; t: Transaction }) {
  const jumpTo = useStore((s) => s.jumpTo)
  const select = useStore((s) => s.select)
  const m = file.meta
  const p = m.processes[t.procId]
  const r = t.receipt
  const exportJson = () => downloadBlob(new Blob([JSON.stringify({ file: m.name, serial: m.serial, pid: p.pid, version: p.version, ...t, milestones: t.milestones.map((x) => ({ ...x, time: fmtTime(x.ts) })) }, null, 2)], { type: 'application/json' }), `txn-${m.serial ?? 'log'}-${fmtTime(t.startTs, false).replace(/:/g, '')}-${t.function}.json`)
  return (
    <div className="panel">
      <h3>
        {txnTitle(t)} <span className={`status ${t.status}`}>{txnResult(t)}</span>
      </h3>
      <dl>
        <dt>started</dt>
        <dd>
          {fmtDateTime(t.startTs)} · {fmtDuration(t.durationMs)}
        </dd>
        <dt>process</dt>
        <dd>
          <button className="link" onClick={() => select({ fileId: file.id, scope: { kind: 'proc', id: p.id } })}>
            pid {p.pid}
          </button>{' '}
          {p.version ? `· v${p.version}` : ''}
        </dd>
        <dt>merchant</dt>
        <dd>
          {t.merchant ?? '—'} · {t.eftProcessor ?? '—'}
          {t.ecrInitiated ? ` · ECR (${t.ecrFunction})` : ''}
        </dd>
        <dt>amount</dt>
        <dd>
          {fmtAmount(t.amountMinor)}
          {r.total ? ` · total ${r.total}` : ''}
        </dd>
        <dt>card</dt>
        <dd>
          {[t.entryMode?.replace(/^EM_/, ''), t.scheme, t.accountType, r.card].filter(Boolean).join(' · ') || '—'}
        </dd>
        <dt>result</dt>
        <dd>
          {[t.responseCode !== undefined ? `response ${t.responseCode}` : null, t.iResultCode !== undefined ? `iResultCode ${t.iResultCode}` : null, t.usResult !== undefined ? `usResult ${t.usResult}` : null, r.result].filter(Boolean).join(' · ') || '—'}
        </dd>
        <dt>ids</dt>
        <dd>
          {[r.stan ? `STAN ${r.stan}` : null, r.rrn ? `RRN ${r.rrn}` : null, r.authId ? `auth ${r.authId}` : null, r.terminalId ? `TID ${r.terminalId}` : null, r.merchantId ? `MID ${r.merchantId}` : null].filter(Boolean).join(' · ') || '—'}
        </dd>
        {t.stepTrace && (
          <>
            <dt>timing</dt>
            <dd>
              read {t.stepTrace.readingCardS}s · host {t.stepTrace.hostS}s · db {t.stepTrace.dbMs}ms · approval {t.stepTrace.approvalS}s · mem {t.stepTrace.memoryMb}MB
            </dd>
          </>
        )}
        {t.errorCount > 0 && (
          <>
            <dt>errors</dt>
            <dd>{t.errorCount} lines at E/F</dd>
          </>
        )}
      </dl>
      {t.incidentIds.length > 0 && (
        <ul className="links">
          {t.incidentIds.map((id) => (
            <li key={id}>
              <button className="link bad" onClick={() => select({ fileId: file.id, scope: { kind: 'incident', id, context: 3 } })}>
                {incidentLabel(m.incidents[id])}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h4>Milestones</h4>
      <ol className="timeline">
        {t.milestones.map((ms, k) => (
          <li key={k} className={`ms-${ms.kind}`}>
            <button className="link" onClick={() => jumpTo({ fileId: file.id, scope: { kind: 'group', id: t.id } }, ms.line)} title={ms.text}>
              <span className="rel">+{((ms.ts - t.startTs) / 1000).toFixed(1)}s</span> <span className="kind">{ms.kind}</span> <span className="text">{ms.text}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="row">
        <button onClick={() => void navigator.clipboard?.writeText(txnSummaryText(m, t))} title="Copy a plain-text summary for a ticket">
          Copy summary
        </button>
        <button onClick={exportJson}>Export JSON</button>
      </div>
    </div>
  )
}

function IncidentPanel({ file, inc }: { file: ReadyFile; inc: Incident }) {
  const select = useStore((s) => s.select)
  const filters = useStore((s) => s.filters)
  const setFilters = useStore((s) => s.setFilters)
  const m = file.meta
  const t = inc.txnId !== undefined ? (m.groups[inc.txnId] as Transaction) : null
  return (
    <div className="panel">
      <h3 className={inc.kind === 'fatal-exception' || inc.kind === 'native-crash' || inc.kind === 'anr' ? 'bad' : ''}>{inc.kind}</h3>
      <dl>
        <dt>time</dt>
        <dd>{fmtDateTime(inc.ts)}</dd>
        <dt>process</dt>
        <dd>
          {inc.procId >= 0 ? (
            <button className="link" onClick={() => select({ fileId: file.id, scope: { kind: 'proc', id: inc.procId } })}>
              pid {inc.pid}
            </button>
          ) : (
            `pid ${inc.pid}`
          )}{' '}
          · <span className="mono">{inc.pkg}</span>
        </dd>
        {inc.thread && (
          <>
            <dt>thread</dt>
            <dd>{inc.thread}</dd>
          </>
        )}
        {inc.exceptionType && (
          <>
            <dt>exception</dt>
            <dd className="mono">{inc.exceptionType}</dd>
          </>
        )}
        <dt>message</dt>
        <dd className="wrap">{inc.message}</dd>
        <dt>stack</dt>
        <dd>
          lines {fmtCount(inc.stackRange[0] + 1)}–{fmtCount(inc.stackRange[1] + 1)}
        </dd>
        {t && (
          <>
            <dt>transaction</dt>
            <dd>
              <button className="link" onClick={() => select({ fileId: file.id, scope: { kind: 'group', id: t.id } })}>
                {txnTitle(t)} · {txnResult(t)}
              </button>
            </dd>
          </>
        )}
        {inc.lastDialog && (
          <>
            <dt>last dialog</dt>
            <dd>{inc.lastDialog}</dd>
          </>
        )}
      </dl>
      <label className="switch">
        context lines{' '}
        <input
          type="number"
          min={0}
          max={200}
          value={filters.incidentContext}
          onChange={(e) => {
            const context = Math.max(0, Math.min(200, Number(e.target.value) || 0))
            setFilters({ incidentContext: context })
            select({ fileId: file.id, scope: { kind: 'incident', id: inc.id, context } })
          }}
        />
      </label>
      {inc.linkedIds.length > 0 && (
        <>
          <h4>Linked</h4>
          <ul className="links">
            {inc.linkedIds.map((id) => (
              <li key={id}>
                <button className="link" onClick={() => select({ fileId: file.id, scope: { kind: 'incident', id, context: filters.incidentContext } })}>
                  {incidentLabel(m.incidents[id])}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function IncidentList({ file }: { file: ReadyFile }) {
  const select = useStore((s) => s.select)
  const filters = useStore((s) => s.filters)
  const m = file.meta
  const sel = new Set(m.selectedPackages)
  const list = m.incidents.filter((i) => !filters.selectedPackagesOnly || sel.has(i.pkg))
  return (
    <div className="panel">
      <h3>Incidents ({list.length})</h3>
      <p className="muted">Crashes and exceptions are logged by the system, not by the app. Click one to see its block with context.</p>
      <p className="muted small">Identical incidents are grouped (×N); crashes come first.</p>
      <ul className="links">
        {groupIncidents(list).map((g) => (
          <li key={g.inc.id}>
            <button className={`link ${g.inc.kind === 'fatal-exception' || g.inc.kind === 'native-crash' ? 'bad' : ''}`} onClick={() => select({ fileId: file.id, scope: { kind: 'incident', id: g.inc.id, context: filters.incidentContext } })}>
              {incidentLabel(g.inc)}
              {g.count > 1 ? ` ×${g.count}` : ''}
              {g.inc.pkg !== m.selectedPackages[0] && sel.size !== 1 ? ` · ${g.inc.pkg}` : ''}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
