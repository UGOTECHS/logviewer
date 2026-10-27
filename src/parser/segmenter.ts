import { SEGMENT } from './config'
import { Flag, type BootSegment, type LineColumns, type StringTables } from './types'
import { lineMessage } from './lineText'

const REBOOT_TAG = 'art_apex'
const REBOOT_MSG = 'Device is not fsverity-enabled'
const BOOT_COMPLETED_MSG = 'sys.boot_completed=0'

/**
 * Split the file into boot segments. A new segment starts at the ART boot marker or at a sustained backwards
 * time jump (a dump-window seam). Short segments merge into their successor and are flagged `mixedOrder`.
 */
export type SegmentConfig = typeof SEGMENT

export function segment(bytes: Uint8Array, cols: LineColumns, strings: StringTables, overrides: Partial<SegmentConfig> = {}): BootSegment[] {
  const cfg: SegmentConfig = { ...SEGMENT, ...overrides }
  const n = cols.count
  const rebootTag = strings.tags.indexOf(REBOOT_TAG)
  const dlogTag = strings.tags.indexOf('DLOG')
  const amTag = strings.tags.indexOf('ActivityManager')
  const boundaries: { line: number; kind: 'reboot' | 'time-jump' }[] = []
  let segMax = -Infinity
  const jump = cfg.timeJumpMs

  for (let i = 0; i < n; i++) {
    if (cols.flags[i] & Flag.Unparsed) continue
    const ts = cols.ts[i]
    if (cols.tagId[i] === rebootTag && lineMessage(bytes, cols, i).startsWith(REBOOT_MSG)) {
      boundaries.push({ line: i, kind: 'reboot' })
      segMax = ts
      continue
    }
    if (ts < segMax - jump) {
      let sustained = true
      for (let k = 1; k <= cfg.sustainLines && i + k < n; k++) {
        if (!(cols.flags[i + k] & Flag.Unparsed) && cols.ts[i + k] >= segMax - jump) {
          sustained = false
          break
        }
      }
      if (sustained) {
        boundaries.push({ line: i, kind: 'time-jump' })
        segMax = ts
        continue
      }
      cols.flags[i] |= Flag.OutOfOrder
      continue
    }
    if (ts > segMax) segMax = ts
    else if (ts < segMax - 1000) cols.flags[i] |= Flag.OutOfOrder
  }

  // Build raw segments from boundaries.
  const raw: BootSegment[] = []
  let first = 0
  let kind: BootSegment['boundary'] = 'file-start'
  for (const b of boundaries) {
    if (b.line === 0) {
      kind = b.kind
      continue
    }
    raw.push(make(raw.length, first, b.line - 1, kind))
    first = b.line
    kind = b.kind
  }
  if (n > 0) raw.push(make(raw.length, first, n - 1, kind))

  // Merge runts into the following segment (or the preceding one for the last).
  const segments: BootSegment[] = []
  let carry: BootSegment | null = null
  for (const s of raw) {
    if (carry) {
      s.firstLine = carry.firstLine
      s.mixedOrder = true
      if (carry.boundary === 'file-start') s.boundary = 'file-start'
      carry = null
    }
    if (s.lastLine - s.firstLine + 1 < cfg.minLines && s !== raw[raw.length - 1]) {
      carry = s
      continue
    }
    segments.push(s)
  }
  if (carry) {
    const prev = segments[segments.length - 1]
    if (prev) {
      prev.lastLine = carry.lastLine
      prev.mixedOrder = true
    } else segments.push(carry)
  }

  // Fill per-segment facts and the segId column.
  segments.forEach((s, id) => {
    s.id = id
    let min = Infinity
    let max = -Infinity
    for (let i = s.firstLine; i <= s.lastLine; i++) {
      cols.segId[i] = id
      if (cols.flags[i] & Flag.Unparsed) continue
      const ts = cols.ts[i]
      if (ts < min) min = ts
      if (ts > max) max = ts
      if (s.systemServerPid === undefined && cols.tagId[i] === amTag) s.systemServerPid = cols.pid[i]
      if (!s.bootConfirmed && cols.tagId[i] === dlogTag && lineMessage(bytes, cols, i).startsWith(BOOT_COMPLETED_MSG)) s.bootConfirmed = true
    }
    s.startTs = min === Infinity ? 0 : min
    s.endTs = max === -Infinity ? 0 : max
    s.clockUnset = s.startTs > 0 && s.startTs % 86_400_000 < cfg.clockUnsetWindowMs
  })
  return segments
}

function make(id: number, first: number, last: number, boundary: BootSegment['boundary']): BootSegment {
  return { id, firstLine: first, lastLine: last, startTs: 0, endTs: 0, boundary, bootConfirmed: false, clockUnset: false, mixedOrder: false, procIds: [] }
}
