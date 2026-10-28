import { describe, expect, it } from 'vitest'
import { parseFixture, txns } from './helpers'

describe('incidents', () => {
  const file = parseFixture('basic.log')
  const inc = file.meta.incidents
  const byKind = (k: string) => inc.filter((i) => i.kind === k)

  it('detects the app crash block and links it to the kill and death lines', () => {
    const crash = byKind('fatal-exception').find((i) => i.pkg === 'com.xcr.singleapp.wpay')!
    expect(crash.pid).toBe(1200)
    expect(crash.thread).toBe('main')
    expect(crash.exceptionType).toBe('System.NullReferenceException')
    expect(crash.message).toBe('Object reference not set to an instance of an object')
    expect(crash.stackRange).toEqual([51, 55])
    expect(crash.procId).toBe(0)
    expect(crash.txnId).toBe(txns(file)[3].id)
    expect(crash.lastDialog).toBe('RequestCardDialog')
    const linked = crash.linkedIds.map((id) => inc[id].kind).sort()
    expect(linked).toEqual(['force-removed', 'killed-crash', 'process-died'])
    expect(file.meta.processes[0].endReason).toBe('crash')
    expect(file.meta.processes[0].incidentIds).toContain(crash.id)
  })

  it('keeps crashes of other packages without attributing them to the app', () => {
    const other = byKind('fatal-exception').find((i) => i.pkg === 'com.pax.paxsdt')!
    expect(other.pid).toBe(1300)
    expect(other.procId).toBe(-1)
    expect(other.exceptionType).toBe('java.lang.NullPointerException')
    expect(other.stackRange).toEqual([59, 62])
  })

  it('detects managed, java and sdk exceptions and ignores lowmemorykiller "Kill ignore"', () => {
    expect(byKind('managed-unhandled')).toHaveLength(1)
    const managed = byKind('managed-exception')
    expect(managed).toHaveLength(1)
    expect(managed[0].exceptionType).toBe('System.Threading.Tasks.TaskCanceledException')
    const java = byKind('java-exception')
    expect(java).toHaveLength(1)
    expect(java[0].exceptionType).toBe('java.lang.IllegalStateException')
    expect(java[0].stackRange).toEqual([8, 10])
    const sdk = byKind('sdk-exception')
    expect(sdk).toHaveLength(1)
    expect(sdk[0].exceptionType).toBe('com.pax.api.MiscException')
    expect(byKind('lmk-kill')).toHaveLength(0)
    expect(file.meta.stats.incidentsByKind['fatal-exception']).toBe(2)
  })
})
