import { describe, expect, it } from 'vitest'
import { parseFixture } from './helpers'
import { parseDumpName } from '../parseFile'

describe('package discovery and selection', () => {
  it('lists every package with counts and auto-selects the preset app packages', () => {
    const { meta } = parseFixture('basic.log')
    const wpay = meta.packages.find((p) => p.pkg === 'com.xcr.singleapp.wpay')!
    expect(wpay.startProcCount).toBe(1)
    expect(wpay.crashCount).toBe(1)
    expect(wpay.appTagLines).toBeGreaterThan(20)
    const sdt = meta.packages.find((p) => p.pkg === 'com.pax.paxsdt')!
    expect(sdt.crashCount).toBe(1)
    expect(sdt.startProcCount).toBe(0)
    expect(meta.selectedPackages).toEqual(['com.xcr.singleapp.wpay', 'com.xcr.singleapp.certification.sek'])
    expect(meta.processes.map((p) => [p.pid, p.pkg, p.startReason, p.endReason])).toEqual([
      [1200, 'com.xcr.singleapp.wpay', 'activity', 'crash'],
      [1400, 'com.xcr.singleapp.certification.sek', 'inferred', 'killed'],
    ])
    expect(meta.processes[0].version).toBe('QA_9.9.9')
    expect(meta.processes[1].version).toBe('QA_1.2.27.48.1')
  })

  it('rebuilds instances for an explicit selection', () => {
    const { meta } = parseFixture('basic.log', { packages: ['com.pax.paxsdt'] })
    expect(meta.selectedPackages).toEqual(['com.pax.paxsdt'])
    expect(meta.processes).toHaveLength(1)
    expect(meta.processes[0].pid).toBe(1300)
    expect(meta.processes[0].startReason).toBe('inferred')
    expect(meta.processes[0].endReason).toBe('eof')
    expect(meta.groups).toHaveLength(1)
  })

  it('parses serial and dump time from the dump file name', () => {
    expect(parseDumpName('52001844_2026-10-22_105347_139.zip')).toEqual({ serial: '52001844', dumpTs: Date.UTC(2026, 9, 22, 10, 53, 47, 139) })
    expect(parseDumpName('paxLog.log')).toEqual({})
  })
})
