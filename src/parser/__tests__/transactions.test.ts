import { describe, expect, it } from 'vitest'
import { parseFixture, txns } from './helpers'
import { parseStepTrace } from '../transactions'

describe('transactions', () => {
  const file = parseFixture('basic.log')
  const list = txns(file)

  it('finds four transactions in order', () => {
    expect(list.map((t) => [t.function, t.amountMinor, t.status])).toEqual([
      ['Purchase', 1250, 'approved'],
      ['Purchase', 4000, 'declined'],
      ['Purchase', 500, 'cancelled'],
      ['Purchase', 700, 'orphan'],
    ])
  })

  it('collects the facts of an approved purchase, taking the first receipt copy', () => {
    const t = list[0]
    expect(t.merchant).toBe(1)
    expect(t.eftProcessor).toBe('libWPAY')
    expect(t.entryMode).toBe('EM_CONTACTLESS_ISO')
    expect(t.scheme).toBe('VISA CARD')
    expect(t.accountType).toBe('CRD')
    expect(t.responseCode).toBe('00')
    expect(t.iResultCode).toBe(0)
    expect(t.usResult).toBe(0)
    expect(t.completed).toBe(true)
    expect(t.receipt).toEqual({ stan: '000123', rrn: '000000000123', card: '************0001 (C)', amount: 'PURCHASE AU$ 12.50', total: 'AU$ 12.50', result: 'APPROVED 00' })
    expect(t.stepTrace?.index).toBe(1)
    expect(t.stepTrace?.hostS).toBe(2)
    expect(t.durationMs).toBe(8600)
    expect(t.ecrInitiated).toBe(false)
    const kinds = t.milestones.map((m) => m.kind)
    expect(kinds).toEqual(['dialog', 'entryMode', 'scheme', 'cardData', 'account', 'hostSend', 'hostRecv', 'emvComplete', 'dialog', 'print', 'receipt', 'receipt', 'processTrans', 'completed', 'stepTrace'])
    expect(t.procRange).toEqual([14, 40])
    expect(file.cols.groupId[t.startLine]).toBe(t.id)
    expect(file.cols.groupId[t.endLine]).toBe(t.id)
  })

  it('marks ECR-initiated and declined transactions', () => {
    const t = list[1]
    expect(t.ecrInitiated).toBe(true)
    expect(t.ecrFunction).toBe('Purchase')
    expect(t.responseCode).toBe('91')
    expect(t.receipt.result).toBe('DECLINED 91')
  })

  it('closes an orphan transaction with the crash of its process', () => {
    const t = list[3]
    expect(t.endReason).toBe('crash')
    expect(t.incidentIds.length).toBeGreaterThan(0)
  })

  it('creates labelled idle groups between transactions', () => {
    const idle = file.meta.groups.filter((g) => g.kind === 'idle')
    expect(idle.map((g) => g.kind === 'idle' && g.label)).toEqual(['logon', 'idle', 'startup'])
    expect(idle[0].kind === 'idle' && idle[0].errorCount).toBe(4)
  })

  it('parses a step trace line', () => {
    const st = parseStepTrace('[0123456789abcdef0123456789abcdef] Index: 0, time: 11:00:40, entry mode: insert, reading card: 0.6s, processing to host: 2.0s, db duration: 1245.0ms, render receipts : {0.2, 0.2}, showing approval: 0.3s, card: Visa, app Memory: 176.6MB, app Memory with shared: 236.9MB, device free Memory: 371MB')!
    expect(st.index).toBe(0)
    expect(st.entryMode).toBe('insert')
    expect(st.dbMs).toBe(1245)
    expect(st.card).toBe('Visa')
    expect(st.deviceFreeMb).toBe(371)
  })
})
