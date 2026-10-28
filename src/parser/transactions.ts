import { TXN } from './config'
import { lineMessage, linePayload } from './lineText'
import { Family, type Group, type IdleGroup, type IdleLabel, type LineColumns, type Milestone, type MilestoneKind, type ProcessInstance, type Receipt, type StepTrace, type Transaction } from './types'

const TXN_START = '[FBTRACE] ShellClient: transaction start |'
const TXN_RETURNED = '[FBTRACE] ShellClient: ProcessTrans returned |'
const TXN_COMPLETED = '[FBTRACE] ShellClient: transaction completed |'
const TXN_END = '[FBTRACE] ShellClient: transaction end |'
const ECR_FUNCTION_RE = /^FUNCTION=(\w+)/
const RECEIPT_RE = /^PrintDualTextCallback: L: (.*?) R: (.*)$/
const KV = (s: string, key: string): string | undefined => new RegExp(`(?:^|[ |])${key}=([^ |]+)`).exec(s)?.[1]

export function parseStepTrace(msg: string): StepTrace | undefined {
  const guid = /^\[([0-9a-f]{32})\] Index: (\d+)/.exec(msg)
  if (!guid) return undefined
  const num = (re: RegExp) => {
    const m = re.exec(msg)
    return m ? Number(m[1]) : undefined
  }
  const str = (re: RegExp) => re.exec(msg)?.[1]?.trim()
  return {
    guid: guid[1],
    index: +guid[2],
    entryMode: str(/entry mode: (\w*)/),
    readingCardS: num(/reading card: ([\d.]+)s/),
    hostS: num(/processing to host: ([\d.]+)s/),
    dbMs: num(/db duration: ([\d.]+)ms/),
    renderReceipts: str(/render receipts : \{([^}]*)\}/),
    approvalS: num(/showing approval: ([\d.]+)s/),
    card: str(/, card: ([^,]*),/),
    memoryMb: num(/app Memory: ([\d.]+)MB/),
    memorySharedMb: num(/app Memory with shared: ([\d.]+)MB/),
    deviceFreeMb: num(/device free Memory: (\d+)MB/),
    raw: msg,
  }
}

function receiptKey(label: string): keyof Receipt | undefined {
  const l = label.trim()
  if (l === 'Merchant ID') return 'merchantId'
  if (l === 'Terminal ID') return 'terminalId'
  if (l === 'Date/Time') return 'dateTime'
  if (l === 'STAN') return 'stan'
  if (l === 'RRN') return 'rrn'
  if (l === 'AID:' || l === 'AID') return 'aid'
  if (l === 'CARD:' || l === 'CARD') return 'card'
  if (l === 'AUTH ID') return 'authId'
  if (/^TOTAL\b/.test(l)) return 'total'
  if (/^(APPROVED|DECLINED|CANCELLED|SIGNATURE)/.test(l)) return 'result'
  if (/^(PURCHASE|PREAUTH|PRE AUTH|REFUND|CASH ?OUT|MOTO|COMPLETION|VOID)\b/.test(l)) return 'amount'
  return undefined
}

function idleLabel(hints: Set<string>, isFirst: boolean, isLast: boolean, inst: ProcessInstance): IdleLabel {
  if (hints.has('settlement')) return 'settlement'
  if (hints.has('logon')) return 'logon'
  if (hints.has('param')) return 'param download'
  if (hints.has('upload')) return 'log upload'
  if (isFirst && hints.has('startup')) return 'startup'
  if (isLast && (inst.endReason === 'killed' || inst.endReason === 'died' || inst.endReason === 'crash')) return 'shutdown'
  return 'idle'
}

/**
 * Walk one instance's lines, open/close transactions on the ShellClient markers, collect facts and milestones,
 * and turn the gaps into idle groups. Returns the groups in line order and fills `groupId` for every line.
 */
export function buildGroups(bytes: Uint8Array, cols: LineColumns, inst: ProcessInstance, nextId: () => number): Group[] {
  const groups: Group[] = []
  const lines = inst.lines
  let open: Transaction | null = null
  let openFrom = 0
  let idleFrom = 0
  let idleHints = new Set<string>()
  let idleErrors = 0
  let lastEcr: { ts: number; fn: string } | null = null
  let lastClosed: Transaction | null = null

  const milestone = (t: Transaction, line: number, kind: MilestoneKind, text: string) => {
    t.milestones.push({ line, ts: cols.ts[line], kind, text: text.length > 160 ? text.slice(0, 157) + '…' : text })
  }
  const flushIdle = (to: number, isLast: boolean) => {
    if (to <= idleFrom) return
    const first = lines[idleFrom]
    const last = lines[to - 1]
    const g: IdleGroup = {
      kind: 'idle',
      id: nextId(),
      procId: inst.id,
      startLine: first,
      endLine: last,
      procRange: [idleFrom, to],
      startTs: cols.ts[first],
      endTs: cols.ts[last],
      label: idleLabel(idleHints, groups.length === 0, isLast, inst),
      lineCount: to - idleFrom,
      errorCount: idleErrors,
    }
    groups.push(g)
    for (let k = idleFrom; k < to; k++) cols.groupId[lines[k]] = g.id
    idleHints = new Set()
    idleErrors = 0
  }
  const closeTxn = (t: Transaction, to: number, endReason: Transaction['endReason']) => {
    const last = lines[to - 1]
    t.endLine = last
    t.procRange = [openFrom, to]
    t.endTs = cols.ts[last]
    t.durationMs = Math.max(0, t.endTs - t.startTs)
    t.endReason = endReason
    t.status = statusOf(t)
    for (let k = openFrom; k < to; k++) cols.groupId[lines[k]] = t.id
    groups.push(t)
    lastClosed = t
    open = null
    idleFrom = to
  }

  for (let k = 0; k < lines.length; k++) {
    const i = lines[k]
    const fam = cols.family[i]
    const isError = cols.level[i] >= 4
    if (fam === Family.Managed) {
      const p = linePayload(bytes, cols, i)
      if (p.startsWith(TXN_START)) {
        if (open) closeTxn(open, k, 'superseded')
        flushIdle(k, false)
        const amount = KV(p, 'amount')
        const merchant = KV(p, 'merchant')
        const t: Transaction = {
          kind: 'txn',
          id: nextId(),
          procId: inst.id,
          startLine: i,
          endLine: i,
          procRange: [k, k + 1],
          startTs: cols.ts[i],
          endTs: cols.ts[i],
          durationMs: 0,
          function: KV(p, 'function') ?? 'unknown',
          amountMinor: amount !== undefined ? Number(amount) : undefined,
          merchant: merchant !== undefined ? Number(merchant) : undefined,
          eftProcessor: KV(p, 'eftProcessor'),
          ecrInitiated: false,
          completed: false,
          status: 'other',
          endReason: 'end',
          receipt: {},
          milestones: [],
          errorCount: 0,
          incidentIds: [],
        }
        if (lastEcr && t.startTs - lastEcr.ts <= TXN.ecrWindowMs) {
          t.ecrInitiated = true
          t.ecrFunction = lastEcr.fn
        }
        lastEcr = null
        open = t
        openFrom = k
        continue
      }
      if (open) {
        const t = open
        if (isError) t.errorCount++
        if (p.startsWith(TXN_RETURNED)) {
          const r = KV(p, 'usResult')
          if (r !== undefined) t.usResult = Number(r)
          milestone(t, i, 'processTrans', p)
        } else if (p.startsWith(TXN_COMPLETED)) {
          t.completed = true
          const r = KV(p, 'usResult')
          if (r !== undefined) t.usResult = Number(r)
          milestone(t, i, 'completed', p)
        } else if (p.startsWith(TXN_END)) {
          closeTxn(t, k + 1, 'end')
        } else if (p.startsWith('Entry Mode: ')) {
          t.entryMode = p.slice(12).trim()
          milestone(t, i, 'entryMode', t.entryMode)
        } else if (p.startsWith('Scheme Card: ')) {
          const scheme = p.slice(13).trim()
          // Swiped cards log "tag 50/9F12 not present or invalid" here; that is not a scheme.
          if (!/not present|invalid/i.test(scheme)) {
            t.scheme = scheme
            milestone(t, i, 'scheme', scheme)
          }
        } else if (p.startsWith('PCE_ACCOUNT_SELECTED=')) {
          t.accountType = p.slice(21).trim()
          milestone(t, i, 'account', p)
        } else if (p.startsWith('PCE_CARD_DATA:')) milestone(t, i, 'cardData', p)
        else if (p.startsWith('PCE_CANCEL_PRESSED')) milestone(t, i, 'cancel', p)
        else if (p.startsWith('PCE_PIN_KEY')) milestone(t, i, 'pin', p)
        else if (p.startsWith('PCE_SIGNATURE_KEY')) milestone(t, i, 'signature', p)
        else if (p.startsWith('PCE_REVERSAL_STARTED')) milestone(t, i, 'reversal', p)
        else if (p.startsWith('[FBTRACE] send: calling ProcessNormalFunction')) milestone(t, i, 'hostSend', p)
        else if (p.startsWith('[FBTRACE] send: ProcessNormalFunction returned')) {
          const rc = KV(p, 'resultCode')
          if (rc !== undefined && t.iResultCode === undefined) t.iResultCode = Number(rc)
          milestone(t, i, 'hostRecv', p)
        } else if (p.startsWith('[CDO] EMV complete returned')) {
          const rc = KV(p, 'responseCode')
          if (rc !== undefined) t.responseCode = rc
          const ir = KV(p, 'iResultCode')
          if (ir !== undefined) t.iResultCode = Number(ir)
          milestone(t, i, 'emvComplete', p)
        } else if (p.startsWith('PrintDualTextCallback: ')) {
          const m = RECEIPT_RE.exec(p)
          if (m) {
            const key = receiptKey(m[1])
            if (key && t.receipt[key] === undefined) {
              t.receipt[key] = key === 'result' ? `${m[1].trim()} ${m[2].trim()}` : key === 'amount' ? `${m[1].trim()} ${m[2].trim()}` : m[2].trim()
              if (key === 'result' || key === 'total') milestone(t, i, 'receipt', `${m[1].trim()} ${m[2].trim()}`)
            }
          }
        } else if (p.startsWith('Payment screen timed out')) milestone(t, i, 'timeout', p)
        else if (p.startsWith('PCE_LOGON_STARTED')) milestone(t, i, 'logon', p)
        else if (p.startsWith('PCE_SETTLEMENT_STARTED')) milestone(t, i, 'settlement', p)
      } else {
        if (isError) idleErrors++
        const m = ECR_FUNCTION_RE.exec(p)
        if (m) lastEcr = { ts: cols.ts[i], fn: m[1] }
        if (p.startsWith('PCE_LOGON_STARTED')) idleHints.add('logon')
        else if (p.startsWith('PCE_SETTLEMENT_STARTED')) idleHints.add('settlement')
        else if (p.includes('DownloadParamService') || p.includes('TMS')) idleHints.add('param')
        else if (p.includes('UploadLogs') || p.includes('has been uploaded')) idleHints.add('upload')
        else if (p.startsWith('Power Failure') || p.includes('App background image applied')) idleHints.add('startup')
      }
      continue
    }
    if (open) {
      const t = open
      if (isError) t.errorCount++
      if (fam === Family.Dialog) milestone(t, i, 'dialog', lineMessage(bytes, cols, i).replace(/^CloudBanking\.\w+\./, ''))
      else if (fam === Family.StepTrace) {
        const st = parseStepTrace(lineMessage(bytes, cols, i))
        if (st) {
          t.stepTrace = st
          milestone(t, i, 'stepTrace', `step trace #${st.index}`)
        }
      } else if (fam === Family.Native && cols.srcLine[i] > 0) {
        const p = linePayload(bytes, cols, i)
        if (p.startsWith('Start GatewayPrinting')) milestone(t, i, 'print', p)
      }
    } else {
      if (isError) idleErrors++
      if (fam === Family.Dialog) {
        const d = lineMessage(bytes, cols, i)
        if (d.endsWith('LogonDialog')) idleHints.add('logon')
      } else if (fam === Family.StepTrace && lastClosed) {
        const lc: Transaction = lastClosed
        if (cols.ts[i] - lc.endTs <= TXN.stepTraceWindowMs) {
          const st = parseStepTrace(lineMessage(bytes, cols, i))
          if (st && !lc.stepTrace) lc.stepTrace = st
        }
      }
    }
  }
  if (open) closeTxn(open, lines.length, inst.endReason ?? 'eof')
  flushIdle(lines.length, true)
  return groups
}

export function statusOf(t: Transaction): Transaction['status'] {
  const cancelled = t.milestones.some((m) => m.kind === 'cancel')
  if (t.endReason !== 'end') return 'orphan'
  if (t.completed) {
    if (t.responseCode === '00' || t.receipt.result?.startsWith('APPROVED') || (t.responseCode === undefined && t.usResult === 0 && !t.receipt.result?.startsWith('DECLINED'))) return 'approved'
    return 'declined'
  }
  if (cancelled) return 'cancelled'
  if (t.usResult !== undefined && t.usResult !== 0) return 'error'
  if (t.receipt.result?.startsWith('DECLINED')) return 'declined'
  if (t.receipt.result?.startsWith('APPROVED')) return 'approved'
  return 'other'
}

/** Run buildGroups over every instance. Group ids are global per file and index into the returned array. */
export function buildAllGroups(bytes: Uint8Array, cols: LineColumns, instances: ProcessInstance[]): Group[] {
  const groups: Group[] = []
  let counter = 0
  for (const inst of instances) {
    for (const g of buildGroups(bytes, cols, inst, () => counter++)) {
      inst.groupIds.push(g.id)
      groups[g.id] = g
    }
  }
  return groups
}

export type { Milestone }
