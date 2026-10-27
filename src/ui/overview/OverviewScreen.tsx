import { useMemo, useState } from 'react'
import type { Incident, ProcessInstance, Transaction, TxnStatus } from '../../parser/types'
import { DropZone } from '../getlogs/GetLogsScreen'
import { procEnd } from '../read/labels'
import { downloadBlob, useStore, type LoadedFile } from '../../store/useStore'
import { fmtAmount, fmtDateTime, fmtDuration } from '../common/format'
import { txnResult } from '../read/labels'

interface TxnRow {
  fileId: number
  file: string
  serial?: string
  seg: number
  pid: number
  version?: string
  t: Transaction
}
interface IncRow {
  fileId: number
  file: string
  version?: string
  i: Incident
  txn?: Transaction
}

type Dir = 'asc' | 'desc'

function useSort<T>(rows: T[], initial: string, get: (r: T, k: string) => string | number | undefined) {
  const [key, setKey] = useState<string>(initial)
  const [dir, setDir] = useState<Dir>('asc')
  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const x = get(a, key)
      const y = get(b, key)
      if (x === y) return 0
      if (x === undefined) return 1
      if (y === undefined) return -1
      return (x < y ? -1 : 1) * (dir === 'asc' ? 1 : -1)
    })
    return copy
  }, [rows, key, dir, get])
  const onSort = (k: string) => {
    if (k === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else {
      setKey(k)
      setDir('asc')
    }
  }
  const th = (k: string, label: string) => (
    <th onClick={() => onSort(k)} className="sortable">
      {label}
      {key === k ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )
  return { sorted, th }
}

function csv(rows: (string | number | undefined)[][]): string {
  return rows.map((r) => r.map((v) => (v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(',')).join('\n') + '\n'
}

export function OverviewScreen() {
  const files = useStore((s) => s.files)
  const select = useStore((s) => s.select)
  const setScreen = useStore((s) => s.setScreen)
  const [allPackages, setAllPackages] = useState(false)
  const [statusFilter, setStatusFilter] = useState<Set<TxnStatus>>(new Set())
  const ready = files.filter((f): f is LoadedFile & { meta: NonNullable<LoadedFile['meta']> } => f.status === 'ready' && !!f.meta)

  const txns = useMemo<TxnRow[]>(() => {
    const out: TxnRow[] = []
    for (const f of ready) {
      for (const g of f.meta.groups) {
        if (g.kind !== 'txn') continue
        const p = f.meta.processes[g.procId]
        out.push({ fileId: f.id, file: f.meta.name, serial: f.meta.serial, seg: p.segId, pid: p.pid, version: p.version, t: g })
      }
    }
    return out
  }, [ready])
  const incidents = useMemo<IncRow[]>(() => {
    const out: IncRow[] = []
    for (const f of ready) {
      const sel = new Set(f.meta.selectedPackages)
      for (const i of f.meta.incidents) {
        if (!allPackages && !sel.has(i.pkg)) continue
        const p = i.procId >= 0 ? f.meta.processes[i.procId] : undefined
        out.push({ fileId: f.id, file: f.meta.name, version: p?.version, i, txn: i.txnId !== undefined ? (f.meta.groups[i.txnId] as Transaction) : undefined })
      }
    }
    return out
  }, [ready, allPackages])

  const txnsShown = useMemo(() => (statusFilter.size ? txns.filter((r) => statusFilter.has(r.t.status)) : txns), [txns, statusFilter])
  const procs = useMemo<ProcRow[]>(() => {
    const out: ProcRow[] = []
    for (const f of ready) for (const p of f.meta.processes) out.push({ fileId: f.id, file: f.meta.name, p, txns: p.groupIds.filter((g) => f.meta.groups[g].kind === 'txn').length })
    return out
  }, [ready])
  const txnSort = useSort<TxnRow>(txnsShown, 'start', (r, k) => {
    switch (k) {
      case 'start':
        return r.t.startTs
      case 'file':
        return r.file
      case 'pid':
        return r.pid
      case 'function':
        return r.t.function
      case 'amount':
        return r.t.amountMinor
      case 'status':
        return r.t.status
      case 'duration':
        return r.t.durationMs
      case 'stan':
        return r.t.receipt.stan
      case 'rrn':
        return r.t.receipt.rrn
      case 'entry':
        return r.t.entryMode
      case 'scheme':
        return r.t.scheme
      case 'version':
        return r.version
      default:
        return undefined
    }
  })
  const incSort = useSort<IncRow>(incidents, 'time', (r, k) => {
    switch (k) {
      case 'time':
        return r.i.ts
      case 'file':
        return r.file
      case 'pid':
        return r.i.pid
      case 'kind':
        return r.i.kind
      case 'type':
        return r.i.exceptionType
      case 'pkg':
        return r.i.pkg
      case 'version':
        return r.version
      default:
        return undefined
    }
  })

  const procSort = useSort<ProcRow>(procs, 'start', (r, k) => {
    switch (k) {
      case 'start':
        return r.p.startTs
      case 'file':
        return r.file
      case 'pid':
        return r.p.pid
      case 'version':
        return r.p.version
      case 'end':
        return r.p.endReason
      case 'txns':
        return r.txns
      case 'inc':
        return r.p.incidentIds.length
      case 'lines':
        return r.p.lines.length
      default:
        return undefined
    }
  })
  if (ready.length === 0) {
    return (
      <div className="empty">
        <DropZone />
        <p>
          …or <button className="link" onClick={() => setScreen('get')}>fetch one from the log server</button>
        </p>
      </div>
    )
  }
  const toggleStatus = (...st: TxnStatus[]) => {
    const next = new Set(statusFilter)
    const allOn = st.every((x) => next.has(x))
    for (const x of st) if (allOn) next.delete(x)
    else next.add(x)
    setStatusFilter(next)
  }
  const tileOn = (...st: TxnStatus[]) => (statusFilter.size === 0 ? '' : st.every((x) => statusFilter.has(x)) ? 'on' : 'off')
  const byStatus = (s: Transaction['status']) => txns.filter((r) => r.t.status === s).length
  const durations = txns.map((r) => r.t.durationMs).sort((a, b) => a - b)
  const pct = (p: number) => (durations.length ? durations[Math.min(durations.length - 1, Math.floor((durations.length - 1) * p))] : 0)
  const crashes = incidents.filter((r) => r.i.kind === 'fatal-exception' || r.i.kind === 'native-crash' || r.i.kind === 'anr').length
  const open = (fileId: number, scope: Parameters<typeof select>[0] extends infer S ? (S extends { scope: infer X } ? X : never) : never) => {
    select({ fileId, scope })
    setScreen('read')
  }

  return (
    <div className="overview">
      <div className="tiles">
        <Tile label="transactions" value={txns.length} cls={statusFilter.size ? 'off' : ''} onClick={() => setStatusFilter(new Set())} />
        <Tile label="approved" value={byStatus('approved')} cls={`ok ${tileOn('approved')}`} onClick={() => toggleStatus('approved')} />
        <Tile label="declined" value={byStatus('declined')} cls={`warn ${tileOn('declined')}`} onClick={() => toggleStatus('declined')} />
        <Tile label="cancelled" value={byStatus('cancelled')} cls={tileOn('cancelled')} onClick={() => toggleStatus('cancelled')} />
        <Tile label="failed / incomplete" value={byStatus('error') + byStatus('orphan') + byStatus('other')} cls={`bad ${tileOn('error', 'orphan', 'other')}`} onClick={() => toggleStatus('error', 'orphan', 'other')} />
        <Tile label="p50 duration" value={fmtDuration(pct(0.5))} />
        <Tile label="p95 duration" value={fmtDuration(pct(0.95))} />
        <Tile label="crashes" value={crashes} cls={crashes ? 'bad' : ''} />
        <Tile label="incidents" value={incidents.length} />
      </div>

      <section>
        <div className="section-head">
          <h2>Transactions</h2>
          {statusFilter.size > 0 && (
            <button className="link" onClick={() => setStatusFilter(new Set())}>
              showing {txnsShown.length} of {txns.length} · clear filter
            </button>
          )}
          <span className="muted small">click a tile to filter · click a row to open it</span>
          <button
            onClick={() =>
              downloadBlob(
                new Blob([csv([['file', 'serial', 'segment', 'pid', 'version', 'start', 'function', 'amount', 'status', 'response', 'duration_ms', 'stan', 'rrn', 'auth', 'entry', 'scheme', 'card', 'ecr'], ...txnSort.sorted.map((r) => [r.file, r.serial, r.seg + 1, r.pid, r.version, fmtDateTime(r.t.startTs), r.t.function, fmtAmount(r.t.amountMinor), r.t.status, r.t.responseCode, r.t.durationMs, r.t.receipt.stan, r.t.receipt.rrn, r.t.receipt.authId, r.t.entryMode, r.t.scheme, r.t.receipt.card, r.t.ecrInitiated ? 'yes' : ''])])], { type: 'text/csv' }),
                'transactions.csv',
              )
            }
          >
            Export CSV
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {txnSort.th('start', 'start')}
                {ready.length > 1 && txnSort.th('file', 'file')}
                {txnSort.th('pid', 'pid')}
                {txnSort.th('version', 'version')}
                {txnSort.th('function', 'function')}
                {txnSort.th('amount', 'amount')}
                {txnSort.th('status', 'result')}
                {txnSort.th('duration', 'duration')}
                {txnSort.th('stan', 'STAN')}
                {txnSort.th('rrn', 'RRN')}
                {txnSort.th('entry', 'entry')}
                {txnSort.th('scheme', 'scheme')}
                <th>card</th>
                <th>ECR</th>
              </tr>
            </thead>
            <tbody>
              {txnSort.sorted.map((r) => (
                <tr key={`${r.fileId}-${r.t.id}`} className={`row-${r.t.status}`} onClick={() => open(r.fileId, { kind: 'group', id: r.t.id })}>
                  <td className="mono">{fmtDateTime(r.t.startTs)}</td>
                  {ready.length > 1 && <td className="mono small">{r.file}</td>}
                  <td>{r.pid}</td>
                  <td>{r.version?.replace(/^QA_/, '')}</td>
                  <td>{r.t.function}</td>
                  <td className="num">{fmtAmount(r.t.amountMinor)}</td>
                  <td>
                    <span className={`status ${r.t.status}`}>{txnResult(r.t)}</span>
                  </td>
                  <td className="num">{fmtDuration(r.t.durationMs)}</td>
                  <td className="mono">{r.t.receipt.stan}</td>
                  <td className="mono">{r.t.receipt.rrn}</td>
                  <td>{r.t.entryMode?.replace(/^EM_/, '')}</td>
                  <td>{r.t.scheme}</td>
                  <td className="mono">{r.t.receipt.card}</td>
                  <td>{r.t.ecrInitiated ? 'yes' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Incidents</h2>
          <label className="switch">
            <input type="checkbox" checked={allPackages} onChange={(e) => setAllPackages(e.target.checked)} /> all packages
          </label>
          <button onClick={() => downloadBlob(new Blob([csv([['file', 'time', 'pid', 'package', 'version', 'kind', 'thread', 'exception', 'message', 'transaction', 'last_dialog'], ...incSort.sorted.map((r) => [r.file, fmtDateTime(r.i.ts), r.i.pid, r.i.pkg, r.version, r.i.kind, r.i.thread, r.i.exceptionType, r.i.message, r.txn ? `${r.txn.function} ${txnResult(r.txn)}` : '', r.i.lastDialog])])], { type: 'text/csv' }), 'incidents.csv')}>
            Export CSV
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {incSort.th('time', 'time')}
                {ready.length > 1 && incSort.th('file', 'file')}
                {incSort.th('pid', 'pid')}
                {allPackages && incSort.th('pkg', 'package')}
                {incSort.th('version', 'version')}
                {incSort.th('kind', 'kind')}
                {incSort.th('type', 'exception')}
                <th>message</th>
                <th>transaction</th>
                <th>last dialog</th>
              </tr>
            </thead>
            <tbody>
              {incSort.sorted.map((r) => (
                <tr key={`${r.fileId}-${r.i.id}`} className={r.i.kind === 'fatal-exception' || r.i.kind === 'native-crash' || r.i.kind === 'anr' ? 'row-bad' : ''} onClick={() => open(r.fileId, { kind: 'incident', id: r.i.id, context: 3 })}>
                  <td className="mono">{fmtDateTime(r.i.ts)}</td>
                  {ready.length > 1 && <td className="mono small">{r.file}</td>}
                  <td>{r.i.pid}</td>
                  {allPackages && <td className="mono small">{r.i.pkg}</td>}
                  <td>{r.version?.replace(/^QA_/, '')}</td>
                  <td>{r.i.kind}</td>
                  <td className="mono small">{r.i.exceptionType}</td>
                  <td className="small wrap">{r.i.message.slice(0, 160)}</td>
                  <td className="small">{r.txn ? `${r.txn.function} · ${txnResult(r.txn)}` : ''}</td>
                  <td className="small">{r.i.lastDialog}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Processes</h2>
          <span className="muted small">one row per app process instance (boot segment + pid)</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {procSort.th('start', 'started')}
                {ready.length > 1 && procSort.th('file', 'file')}
                <th>segment</th>
                {procSort.th('pid', 'pid')}
                {procSort.th('version', 'version')}
                <th>package</th>
                <th>start reason</th>
                <th>ended</th>
                {procSort.th('end', 'end reason')}
                {procSort.th('txns', 'txns')}
                {procSort.th('inc', 'incidents')}
                {procSort.th('lines', 'lines')}
              </tr>
            </thead>
            <tbody>
              {procSort.sorted.map((r) => (
                <tr key={`${r.fileId}-${r.p.id}`} className={r.p.endReason === 'crash' ? 'row-bad' : ''} onClick={() => open(r.fileId, { kind: 'proc', id: r.p.id })}>
                  <td className="mono">{fmtDateTime(r.p.startTs)}</td>
                  {ready.length > 1 && <td className="mono small">{r.file}</td>}
                  <td>#{r.p.segId + 1}</td>
                  <td>{r.p.pid}</td>
                  <td>{r.p.version?.replace(/^QA_/, '')}</td>
                  <td className="mono small">{r.p.pkg}</td>
                  <td className="small">
                    {r.p.startReason}
                    {r.p.component ? ` · ${r.p.component.split('/').pop()}` : ''}
                  </td>
                  <td className="mono">{fmtDateTime(r.p.endTs)}</td>
                  <td className={`small ${r.p.endReason === 'crash' ? 'bad' : ''}`}>{procEnd(r.p)}</td>
                  <td className="num">{r.txns}</td>
                  <td className="num">{r.p.incidentIds.length}</td>
                  <td className="num">{r.p.lines.length.toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

interface ProcRow {
  fileId: number
  file: string
  p: ProcessInstance
  txns: number
}

function Tile({ label, value, cls = '', onClick }: { label: string; value: number | string; cls?: string; onClick?: () => void }) {
  return (
    <div className={`tile ${cls} ${onClick ? 'clickable' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      <div className="tile-value">{value}</div>
      <div className="tile-label">{label}</div>
    </div>
  )
}
