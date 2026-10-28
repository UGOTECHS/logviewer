import { FAMILY_COUNT, type FileStats, type Incident, type LineColumns, type StringTables } from './types'

export function computeStats(cols: LineColumns, strings: StringTables, incidents: Incident[]): FileStats {
  const byFamily = new Array<number>(FAMILY_COUNT).fill(0)
  const byLevel = new Array<number>(6).fill(0)
  const tagCounts = new Uint32Array(strings.tags.length)
  let appLines = 0
  for (let i = 0; i < cols.count; i++) {
    byLevel[cols.level[i]]++
    tagCounts[cols.tagId[i]]++
    if (cols.procId[i] >= 0) {
      appLines++
      byFamily[cols.family[i]]++
    }
  }
  const byTag: [string, number][] = []
  for (let t = 1; t < strings.tags.length; t++) byTag.push([strings.tags[t], tagCounts[t]])
  byTag.sort((a, b) => b[1] - a[1])
  const incidentsByKind: FileStats['incidentsByKind'] = {}
  for (const inc of incidents) incidentsByKind[inc.kind] = (incidentsByKind[inc.kind] ?? 0) + 1
  return { byFamily, byLevel, byTag: byTag.slice(0, 200), incidentsByKind, appLines }
}
