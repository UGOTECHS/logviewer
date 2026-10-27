import { lineText } from './lineText'
import { Family, INCIDENT_CATEGORY, type Incident, type ParsedFile } from './types'

export type Scope =
  | { kind: 'raw' }
  | { kind: 'app' }
  | { kind: 'seg'; id: number }
  | { kind: 'proc'; id: number }
  | { kind: 'group'; id: number }
  | { kind: 'incident'; id: number; context: number }
  | { kind: 'incidents'; context: number }
  | { kind: 'around'; line: number; context: number }

export interface TextFilter {
  pattern: string
  regex: boolean
  caseSensitive: boolean
}

export interface FilterSpec {
  scope: Scope
  /** bit i set = level i visible */
  levelMask: number
  /** bit i set = family i visible (applies to attributed lines only) */
  familyMask: number
  tagIds?: number[]
  /** incident categories to show when scope is 'incidents' */
  incidentCategories?: ('crash' | 'kill' | 'managed' | 'java')[]
  /** restrict incidents to the selected packages */
  selectedPackagesOnly?: boolean
  text?: TextFilter
}

export const ALL_LEVELS = 0b111111
export const DEFAULT_FAMILY_MASK = (1 << Family.Managed) | (1 << Family.Native) | (1 << Family.Dialog) | (1 << Family.StepTrace) | (1 << Family.Sdk) | (1 << Family.System) | (1 << Family.Other)

function* scopeLines(file: ParsedFile, scope: Scope, spec: FilterSpec): Generator<number> {
  const { meta, cols } = file
  switch (scope.kind) {
    case 'raw':
      for (let i = 0; i < cols.count; i++) yield i
      return
    case 'app':
      for (let i = 0; i < cols.count; i++) if (cols.procId[i] >= 0) yield i
      return
    case 'seg': {
      const s = meta.segments[scope.id]
      if (!s) return
      for (let i = s.firstLine; i <= s.lastLine; i++) yield i
      return
    }
    case 'proc': {
      const p = meta.processes[scope.id]
      if (!p) return
      for (const i of p.lines) yield i
      return
    }
    case 'group': {
      const g = meta.groups[scope.id]
      if (!g) return
      const lines = meta.processes[g.procId].lines
      for (let k = g.procRange[0]; k < g.procRange[1]; k++) yield lines[k]
      return
    }
    case 'incident': {
      const inc = meta.incidents[scope.id]
      if (!inc) return
      yield* incidentLines(file, inc, scope.context)
      return
    }
    case 'around': {
      const from = Math.max(0, scope.line - scope.context)
      const to = Math.min(cols.count - 1, scope.line + scope.context)
      for (let i = from; i <= to; i++) yield i
      return
    }
    case 'incidents': {
      const cats = new Set(spec.incidentCategories ?? ['crash', 'kill', 'managed', 'java'])
      const sel = new Set(meta.selectedPackages)
      const seen = new Set<number>()
      for (const inc of meta.incidents) {
        if (!cats.has(INCIDENT_CATEGORY[inc.kind])) continue
        if (spec.selectedPackagesOnly && !sel.has(inc.pkg)) continue
        for (const i of incidentLines(file, inc, scope.context)) {
          if (!seen.has(i)) {
            seen.add(i)
            yield i
          }
        }
      }
      return
    }
  }
}

function* incidentLines(file: ParsedFile, inc: Incident, context: number): Generator<number> {
  const from = Math.max(0, inc.stackRange[0] - context)
  const to = Math.min(file.cols.count - 1, inc.stackRange[1] + context)
  for (let i = from; i <= to; i++) yield i
}

export function makeMatcher(text?: TextFilter): ((s: string) => boolean) | null {
  if (!text || text.pattern === '') return null
  if (text.regex) {
    try {
      const re = new RegExp(text.pattern, text.caseSensitive ? '' : 'i')
      return (s) => re.test(s)
    } catch {
      return () => false
    }
  }
  if (text.caseSensitive) return (s) => s.includes(text.pattern)
  const needle = text.pattern.toLowerCase()
  return (s) => s.toLowerCase().includes(needle)
}

/** Resolve a filter to the sorted list of visible line indices. */
export function runQuery(file: ParsedFile, spec: FilterSpec): Uint32Array {
  const { cols, bytes } = file
  const out: number[] = []
  const tagSet = spec.tagIds && spec.tagIds.length > 0 ? new Set(spec.tagIds) : null
  const match = makeMatcher(spec.text)
  // Context views (incident blocks, lines around a line) show every line, whatever its family.
  const incidentScope = spec.scope.kind === 'incident' || spec.scope.kind === 'incidents' || spec.scope.kind === 'around'
  const unscoped = spec.scope.kind === 'raw' || spec.scope.kind === 'seg' || incidentScope
  for (const i of scopeLines(file, spec.scope, spec)) {
    if (!((spec.levelMask >> cols.level[i]) & 1)) continue
    if (!incidentScope && cols.procId[i] >= 0 && !((spec.familyMask >> cols.family[i]) & 1)) continue
    if (!unscoped && cols.procId[i] < 0) continue
    if (tagSet && !tagSet.has(cols.tagId[i])) continue
    if (match && !match(lineText(bytes, cols, i))) continue
    out.push(i)
  }
  if (spec.scope.kind === 'incidents') out.sort((a, b) => a - b)
  return Uint32Array.from(out)
}
