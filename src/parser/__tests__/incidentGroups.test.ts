import { describe, expect, it } from 'vitest'
import { parseFixture } from './helpers'
import { groupIncidents } from '../incidentGroups'
import { runQuery, ALL_LEVELS, DEFAULT_FAMILY_MASK } from '../query'

describe('incident grouping and around scope', () => {
  const file = parseFixture('basic.log')

  it('puts crashes first and collapses identical incidents', () => {
    const groups = groupIncidents(file.meta.incidents)
    expect(groups[0].inc.kind).toBe('fatal-exception')
    const twice = groupIncidents([file.meta.incidents[0], file.meta.incidents[0]])
    expect(twice).toHaveLength(1)
    expect(twice[0].count).toBe(2)
  })

  it('returns raw context lines around a line', () => {
    const lines = runQuery(file, { scope: { kind: 'around', line: 10, context: 2 }, levelMask: ALL_LEVELS, familyMask: DEFAULT_FAMILY_MASK })
    expect([...lines]).toEqual([8, 9, 10, 11, 12])
    const edge = runQuery(file, { scope: { kind: 'around', line: 0, context: 3 }, levelMask: ALL_LEVELS, familyMask: DEFAULT_FAMILY_MASK })
    expect([...edge]).toEqual([0, 1, 2, 3])
  })
})
