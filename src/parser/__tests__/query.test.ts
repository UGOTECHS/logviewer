import { describe, expect, it } from 'vitest'
import { parseFixture, txns } from './helpers'
import { ALL_LEVELS, DEFAULT_FAMILY_MASK, runQuery } from '../query'
import { Family } from '../types'

describe('query', () => {
  const file = parseFixture('basic.log')
  const base = { levelMask: ALL_LEVELS, familyMask: DEFAULT_FAMILY_MASK }

  it('hides echo and runtime lines by default and shows them when asked', () => {
    const app = runQuery(file, { ...base, scope: { kind: 'app' } })
    expect([...app]).not.toContain(22)
    expect([...app]).not.toContain(1)
    const all = runQuery(file, { ...base, familyMask: 0b111111111, scope: { kind: 'app' } })
    expect([...all]).toContain(22)
    expect([...all]).toContain(1)
    expect(all.length).toBe(file.meta.stats.appLines)
  })

  it('scopes to a group and filters by level, tag and text', () => {
    const t = txns(file)[0]
    const lines = runQuery(file, { ...base, scope: { kind: 'group', id: t.id } })
    expect(lines[0]).toBe(t.startLine)
    expect(lines[lines.length - 1]).toBe(t.endLine)
    const errors = runQuery(file, { ...base, familyMask: 0b111111111, levelMask: 1 << 4, scope: { kind: 'app' } })
    expect(errors.length).toBe(file.meta.processes[0].errorCount + 0)
    const dialogTag = file.meta.strings.tags.indexOf('PAYMENTAPP_DIALOG')
    const dialogs = runQuery(file, { ...base, tagIds: [dialogTag], scope: { kind: 'app' } })
    expect(dialogs.length).toBe(file.meta.processes[0].counts[Family.Dialog])
    const stan = runQuery(file, { ...base, scope: { kind: 'raw' }, text: { pattern: 'stan r: 000\\d+', regex: true, caseSensitive: false } })
    expect(stan.length).toBe(2)
    const plain = runQuery(file, { ...base, scope: { kind: 'raw' }, text: { pattern: 'STAN R: 000123', regex: false, caseSensitive: true } })
    expect(plain.length).toBe(1)
  })

  it('returns incident lines with context', () => {
    const crash = file.meta.incidents.find((i) => i.kind === 'fatal-exception' && i.pkg === 'com.xcr.singleapp.wpay')!
    const lines = runQuery(file, { ...base, scope: { kind: 'incident', id: crash.id, context: 1 } })
    expect([...lines]).toEqual([50, 51, 52, 53, 54, 55, 56])
    const crashes = runQuery(file, { ...base, scope: { kind: 'incidents', context: 0 }, incidentCategories: ['crash'], selectedPackagesOnly: true })
    expect([...crashes]).toEqual([51, 52, 53, 54, 55])
  })
})
