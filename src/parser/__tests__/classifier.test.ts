import { describe, expect, it } from 'vitest'
import { parseFixture } from './helpers'
import { Family } from '../types'
import { linePayload } from '../lineText'

describe('classifier', () => {
  const file = parseFixture('basic.log')
  const { meta, cols, bytes } = file
  const fam = (i: number) => cols.family[i]

  it('classifies managed, native, echo, dialog, step trace, sdk, runtime and system lines', () => {
    expect(fam(2)).toBe(Family.Managed)
    expect(meta.strings.srcFiles[cols.srcFileId[2]]).toBe('MainShellActivity.cs')
    expect(cols.srcLine[2]).toBe(82)
    expect(linePayload(bytes, cols, 2)).toBe('Power Failure: fAutoStart = False')
    expect(meta.strings.versions[cols.versionId[2]]).toBe('QA_9.9.9')
    expect(fam(3)).toBe(Family.Native)
    expect(meta.strings.srcFiles[cols.srcFileId[3]]).toBe('Gateway.c')
    expect(cols.srcLine[3]).toBe(462)
    expect(linePayload(bytes, cols, 3)).toBe('LoadGatewayLibrary ----')
    expect(fam(22)).toBe(Family.Echo)
    expect(fam(23)).toBe(Family.Native)
    expect(fam(4)).toBe(Family.Dialog)
    expect(fam(38)).toBe(Family.StepTrace)
    expect(fam(11)).toBe(Family.Sdk)
    expect(fam(1)).toBe(Family.Runtime)
    expect(fam(8)).toBe(Family.Runtime)
    expect(fam(0)).toBe(Family.System)
    expect(cols.procId[0]).toBe(0)
    expect(fam(12)).toBe(Family.System)
    expect(cols.procId[12]).toBe(0)
  })

  it('reduces Windows paths to the file name', () => {
    expect(meta.strings.srcFiles[cols.srcFileId[63]]).toBe('MainShellActivity.cs')
    expect(cols.srcLine[63]).toBe(79)
    expect(linePayload(bytes, cols, 63)).toBe('Power Failure: fAutoStart = False')
  })

  it('leaves other packages unattributed', () => {
    expect(cols.procId[61]).toBe(-1)
    expect(fam(61)).toBe(Family.Other)
  })

  it('counts per instance', () => {
    const p = meta.processes[0]
    expect(p.counts[Family.Echo]).toBe(1)
    expect(p.counts[Family.Managed]).toBeGreaterThan(30)
    expect(p.stepTraceGuid).toBe('0123456789abcdef0123456789abcdef')
    expect(p.errorCount).toBeGreaterThanOrEqual(8)
  })
})
