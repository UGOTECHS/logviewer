import type { Incident, IncidentKind } from './types'

const SEVERITY: Record<IncidentKind, number> = {
  'fatal-exception': 0,
  'native-crash': 0,
  anr: 0,
  'killed-crash': 1,
  'process-died': 2,
  'force-removed': 2,
  'lmk-kill': 2,
  'managed-unhandled': 3,
  'managed-exception': 4,
  'java-exception': 5,
  'sdk-exception': 6,
}

export interface IncidentGroup {
  /** first occurrence */
  inc: Incident
  count: number
  ids: number[]
}

export function incidentSeverity(kind: IncidentKind): number {
  return SEVERITY[kind]
}

/** Collapse identical incidents (same kind, exception type and message) and order the groups by severity, then time. */
export function groupIncidents(list: Incident[]): IncidentGroup[] {
  const groups = new Map<string, IncidentGroup>()
  for (const inc of list) {
    const key = `${inc.kind}|${inc.exceptionType ?? ''}|${inc.message}`
    const g = groups.get(key)
    if (g) {
      g.count++
      g.ids.push(inc.id)
    } else groups.set(key, { inc, count: 1, ids: [inc.id] })
  }
  return [...groups.values()].sort((a, b) => SEVERITY[a.inc.kind] - SEVERITY[b.inc.kind] || a.inc.ts - b.inc.ts)
}
