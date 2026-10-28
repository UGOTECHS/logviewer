import type { Group, Incident, LogFileMeta, ProcessInstance, Transaction } from '../../parser/types'
import { fmtAmount, fmtDateTime, fmtDuration, fmtTime } from '../common/format'

export function txnTitle(t: Transaction): string {
  const amount = t.amountMinor !== undefined && t.amountMinor > 0 ? ` ${fmtAmount(t.amountMinor)}` : ''
  return `${t.function}${amount}`
}

export function txnResult(t: Transaction): string {
  switch (t.status) {
    case 'approved':
      return `approved${t.responseCode ? ' ' + t.responseCode : ''}`
    case 'declined':
      return `declined${t.responseCode ? ' ' + t.responseCode : ''}`
    case 'cancelled':
      return 'cancelled'
    case 'error':
      return `failed (usResult ${t.usResult})`
    case 'orphan':
      return `no end (${t.endReason})`
    default:
      return t.usResult !== undefined ? `ended (usResult ${t.usResult})` : 'ended'
  }
}

export function groupLabel(g: Group): string {
  if (g.kind === 'txn') return `${txnTitle(g)} · ${txnResult(g)} · ${fmtDuration(g.durationMs)}`
  return `${g.label} · ${fmtDuration(g.endTs - g.startTs)} · ${g.lineCount} lines`
}

export function procLabel(p: ProcessInstance): string {
  const v = p.version ? ` · v${p.version.replace(/^QA_/, '')}` : ''
  return `pid ${p.pid}${v} · ${fmtTime(p.startTs, false)}–${fmtTime(p.endTs, false)}`
}

export function procEnd(p: ProcessInstance): string {
  switch (p.endReason) {
    case 'crash':
      return 'crashed'
    case 'killed':
      return `killed (${p.endDetail ?? ''})`
    case 'died':
      return `died (${p.endDetail ?? ''})`
    case 'superseded':
      return 'pid reused'
    case 'segment-end':
      return 'still running at the end of the segment'
    case 'eof':
      return 'still running at the end of the file'
    default:
      return '—'
  }
}

export function incidentLabel(i: Incident): string {
  const type = i.exceptionType ? i.exceptionType.replace(/^(java\.lang\.|System\.)/, '') : i.kind
  return `${fmtTime(i.ts, false)} · pid ${i.pid} · ${i.kind} · ${type}`
}

/** Plain-text summary of a transaction, ready to paste into a ticket. */
export function txnSummaryText(meta: LogFileMeta, t: Transaction): string {
  const p = meta.processes[t.procId]
  const r = t.receipt
  const line = (label: string, parts: (string | undefined | null | false)[]) => {
    const v = parts.filter(Boolean).join(' · ')
    return v ? `${label}: ${v}` : null
  }
  return [
    `${txnTitle(t)} — ${txnResult(t)}`,
    `${fmtDateTime(t.startTs)} (${fmtDuration(t.durationMs)}) · pid ${p.pid}${p.version ? ' · v' + p.version : ''} · merchant ${t.merchant ?? '?'} · ${t.eftProcessor ?? '?'}${t.ecrInitiated ? ` · ECR ${t.ecrFunction ?? ''}` : ''}`,
    line('Card', [t.entryMode?.replace(/^EM_/, ''), t.scheme, t.accountType, r.card]),
    line('Result', [t.responseCode !== undefined && `response ${t.responseCode}`, t.iResultCode !== undefined && `iResultCode ${t.iResultCode}`, t.usResult !== undefined && `usResult ${t.usResult}`, r.result]),
    line('Ids', [r.stan && `STAN ${r.stan}`, r.rrn && `RRN ${r.rrn}`, r.authId && `auth ${r.authId}`, r.terminalId && `TID ${r.terminalId}`, r.merchantId && `MID ${r.merchantId}`]),
    t.stepTrace ? `Timing: read ${t.stepTrace.readingCardS}s · host ${t.stepTrace.hostS}s · db ${t.stepTrace.dbMs}ms · approval ${t.stepTrace.approvalS}s · mem ${t.stepTrace.memoryMb}MB` : null,
    t.errorCount ? `Errors: ${t.errorCount} line(s) at E/F` : null,
    `File: ${meta.name}${meta.serial ? ` (serial ${meta.serial})` : ''} · lines ${(t.startLine + 1).toLocaleString('en-US')}–${(t.endLine + 1).toLocaleString('en-US')}`,
  ]
    .filter(Boolean)
    .join('\n')
}
