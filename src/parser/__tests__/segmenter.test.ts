import { describe, expect, it } from 'vitest'
import { parseFixture } from './helpers'
import { Flag } from '../types'

describe('segmenter + registry across reboots', () => {
  const file = parseFixture('pid-reuse.log')
  const { meta, cols } = file

  it('splits on the ART boot marker and on a sustained backwards time jump', () => {
    expect(meta.segments.map((s) => s.boundary)).toEqual(['file-start', 'reboot', 'time-jump'])
    expect(meta.segments[1].bootConfirmed).toBe(true)
    expect(meta.segments[1].systemServerPid).toBe(601)
    expect(meta.segments[2].clockUnset).toBe(true)
    expect(meta.segments[0].clockUnset).toBe(false)
  })

  it('does not split on a short out-of-order line but flags it', () => {
    const lag = 3
    expect(cols.segId[lag]).toBe(0)
    expect(cols.flags[lag] & Flag.OutOfOrder).toBeTruthy()
  })

  it('keeps one instance per boot for a reused pid', () => {
    const p1200 = meta.processes.filter((p) => p.pid === 1200)
    expect(p1200).toHaveLength(2)
    expect(p1200[0].segId).toBe(0)
    expect(p1200[0].startReason).toBe('broadcast')
    expect(p1200[0].endReason).toBe('segment-end')
    expect(p1200[1].segId).toBe(1)
    expect(p1200[1].startReason).toBe('activity')
    expect(p1200[1].endReason).toBe('killed')
    expect(p1200[1].endDetail).toBe('stop com.xcr.singleapp.wpay')
    expect([...p1200[0].lines]).toEqual([0, 1, 2, 4, 5, 6, 7])
    expect([...p1200[1].lines]).toEqual([10, 11, 12, 13])
    const p1300 = meta.processes.find((p) => p.pid === 1300)!
    expect(p1300.segId).toBe(2)
    expect(p1300.endReason).toBe('eof')
    expect(p1300.startReason).toBe('service')
  })

  it('labels the idle group of the upload-only process', () => {
    const g = meta.groups.filter((x) => x.procId === 0)
    expect(g).toHaveLength(1)
    expect(g[0].kind).toBe('idle')
    if (g[0].kind === 'idle') expect(g[0].label).toBe('log upload')
  })
})
