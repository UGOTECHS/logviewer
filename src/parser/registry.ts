import { PRESET_PACKAGES, STRONG_APP_TAGS } from './config'
import { lineMessage } from './lineText'
import type { BootSegment, LineColumns, PackageInfo, ParseOptions, ProcessInstance, StartReason, StringTables } from './types'
import { FAMILY_COUNT } from './types'

export const START_PROC_RE = /^Start proc (\d+):([\w.]+)\/(\w+) for ([\w ]+?) \{([^}]*)\}/
export const KILLING_RE = /^Killing (\d+):([\w.]+)\/\S+ \(adj -?\d+\): (.*)$/
export const DIED_RE = /^Process ([\w.]+) \(pid (\d+)\) has died(?::\s*(.*))?$/
export const FORCE_REMOVE_RE = /^Force removing ActivityRecord\{\S+ u\d+ ([\w.]+)\/\S+ t\d+ f?\}: app died/
export const CRASH_PROC_RE = /^Process: ([\w.]+), PID: (\d+)/
export const LMK_RE = /^Kill(?:ing)? '([\w.]+)' \((\d+)\)/
/** Any lowmemorykiller line naming a process, including the harmless `Kill ignore …` ones (context only). */
export const LMK_ANY_RE = /'([\w.]+)' \((\d+)\)/

export type IdentityKind = 'start' | 'kill' | 'died' | 'force' | 'crashproc' | 'lmk'

export interface IdentityEvent {
  line: number
  seg: number
  kind: IdentityKind
  pkg: string
  pid: number // 0 when unknown (force-removed)
  uid?: string
  reason?: string
  component?: string
}

export const UNKNOWN_PKG = '(unknown)'

export interface Identity {
  events: IdentityEvent[]
  /** line index → event */
  byLine: Map<number, IdentityEvent>
  /** `${seg}:${pid}` → package */
  pidPkg: Map<string, string>
  packages: PackageInfo[]
}

/** Collect every line that ties a pid to a package, plus per-package counts. Independent of the selection. */
export function discover(bytes: Uint8Array, cols: LineColumns, strings: StringTables, segments: BootSegment[]): Identity {
  const tags = strings.tags
  const amTag = tags.indexOf('ActivityManager')
  const atmTag = tags.indexOf('ActivityTaskManager')
  const artTag = tags.indexOf('AndroidRuntime')
  const lmkTag = tags.indexOf('lowmemorykiller')
  const strongTagIds = new Set<number>()
  tags.forEach((t, i) => {
    if (STRONG_APP_TAGS.has(t)) strongTagIds.add(i)
  })

  const events: IdentityEvent[] = []
  const byLine = new Map<number, IdentityEvent>()
  const pidPkg = new Map<string, string>()
  const pkgs = new Map<string, PackageInfo>()
  const pkgPids = new Map<string, Set<number>>()
  const info = (pkg: string): PackageInfo => {
    let p = pkgs.get(pkg)
    if (!p) {
      p = { pkg, startProcCount: 0, pids: [], crashCount: 0, appTagLines: 0 }
      pkgs.set(pkg, p)
      pkgPids.set(pkg, new Set())
    }
    return p
  }
  const push = (e: IdentityEvent) => {
    events.push(e)
    byLine.set(e.line, e)
    if (e.pid) {
      pidPkg.set(`${e.seg}:${e.pid}`, e.pkg)
      pkgPids.get(e.pkg)?.add(e.pid)
    }
  }

  for (const seg of segments) {
    for (let i = seg.firstLine; i <= seg.lastLine; i++) {
      const t = cols.tagId[i]
      if (t === amTag) {
        const msg = lineMessage(bytes, cols, i)
        let m = START_PROC_RE.exec(msg)
        if (m) {
          info(m[2]).startProcCount++
          push({ line: i, seg: seg.id, kind: 'start', pkg: m[2], pid: +m[1], uid: m[3], reason: m[4], component: m[5] })
          continue
        }
        m = KILLING_RE.exec(msg)
        if (m) {
          info(m[2])
          push({ line: i, seg: seg.id, kind: 'kill', pkg: m[2], pid: +m[1], reason: m[3] })
          continue
        }
        m = DIED_RE.exec(msg)
        if (m) {
          info(m[1])
          push({ line: i, seg: seg.id, kind: 'died', pkg: m[1], pid: +m[2], reason: m[3] })
        }
      } else if (t === atmTag) {
        const m = FORCE_REMOVE_RE.exec(lineMessage(bytes, cols, i))
        if (m) {
          info(m[1])
          push({ line: i, seg: seg.id, kind: 'force', pkg: m[1], pid: 0, reason: 'app died' })
        }
      } else if (t === artTag) {
        const m = CRASH_PROC_RE.exec(lineMessage(bytes, cols, i))
        if (m) {
          info(m[1]).crashCount++
          push({ line: i, seg: seg.id, kind: 'crashproc', pkg: m[1], pid: +m[2] })
        }
      } else if (t === lmkTag) {
        const m = LMK_RE.exec(lineMessage(bytes, cols, i))
        if (m && m[0].startsWith('Killing')) {
          info(m[1])
          push({ line: i, seg: seg.id, kind: 'lmk', pkg: m[1], pid: +m[2], reason: 'low memory' })
        }
      }
    }
  }

  // Strong app-tag lines, attributed through the pid→package map (events may come later in the segment).
  for (const seg of segments) {
    for (let i = seg.firstLine; i <= seg.lastLine; i++) {
      if (!strongTagIds.has(cols.tagId[i])) continue
      const pkg = pidPkg.get(`${seg.id}:${cols.pid[i]}`) ?? UNKNOWN_PKG
      const p = info(pkg)
      p.appTagLines++
      pkgPids.get(pkg)!.add(cols.pid[i])
    }
  }

  const packages = [...pkgs.values()].map((p) => ({ ...p, pids: [...pkgPids.get(p.pkg)!].sort((a, b) => a - b) }))
  packages.sort((a, b) => b.appTagLines - a.appTagLines || b.startProcCount - a.startProcCount || a.pkg.localeCompare(b.pkg))
  return { events, byLine, pidPkg, packages }
}

/** Decide which packages to build instances for. */
export function selectPackages(packages: PackageInfo[], options: ParseOptions = {}): string[] {
  if (options.packages && options.packages.length > 0) return options.packages
  const presets = new Set([...PRESET_PACKAGES, ...(options.presetPackages ?? [])])
  const discovered = new Set(packages.map((p) => p.pkg))
  const chosen = [...presets].filter((p) => discovered.has(p))
  if (chosen.length > 0) return chosen
  const busiest = packages.find((p) => p.appTagLines > 0 && p.pkg !== UNKNOWN_PKG)
  return busiest ? [busiest.pkg] : []
}

function startReason(reason: string | undefined): StartReason {
  switch (reason) {
    case 'activity':
    case 'broadcast':
    case 'service':
    case 'content provider':
      return reason
    default:
      return 'other'
  }
}

/**
 * Build process instances for the selected packages, segment by segment. Instances are returned sorted by
 * segment and start line; a pid owns its instance from `startLine` until the next instance of the same pid.
 */
export function buildInstances(
  cols: LineColumns,
  strings: StringTables,
  segments: BootSegment[],
  identity: Identity,
  selected: string[],
): ProcessInstance[] {
  const selectedSet = new Set(selected)
  const assumeUnknownIsApp = selected.some((p) => PRESET_PACKAGES.includes(p)) || selectedSet.has(UNKNOWN_PKG)
  const strongTagIds = new Set<number>()
  strings.tags.forEach((t, i) => {
    if (STRONG_APP_TAGS.has(t)) strongTagIds.add(i)
  })
  const instances: ProcessInstance[] = []
  const lastSeg = segments.length - 1

  const create = (seg: BootSegment, pid: number, pkg: string, line: number, reason: StartReason, ev?: IdentityEvent): ProcessInstance => {
    const inst: ProcessInstance = {
      id: instances.length,
      segId: seg.id,
      pid,
      pkg,
      uid: ev?.uid,
      startLine: line,
      startReason: reason,
      component: ev?.component,
      startTs: cols.ts[line],
      endTs: cols.ts[line],
      lines: new Uint32Array(0),
      groupIds: [],
      incidentIds: [],
      counts: new Array(FAMILY_COUNT).fill(0),
      errorCount: 0,
    }
    instances.push(inst)
    seg.procIds.push(inst.id)
    return inst
  }
  const close = (inst: ProcessInstance, line: number, reason: ProcessInstance['endReason'], detail?: string) => {
    inst.endLine = line
    inst.endReason = reason
    inst.endDetail = detail
    inst.endTs = Math.max(inst.endTs, cols.ts[line])
  }

  for (const seg of segments) {
    seg.procIds = []
    const open = new Map<number, ProcessInstance>()
    const crashed = new Set<number>()
    for (let i = seg.firstLine; i <= seg.lastLine; i++) {
      const ev = identity.byLine.get(i)
      if (ev) {
        if (!selectedSet.has(ev.pkg)) continue
        if (ev.kind === 'start') {
          const prev = open.get(ev.pid)
          if (prev) close(prev, i - 1, 'superseded')
          open.set(ev.pid, create(seg, ev.pid, ev.pkg, i, startReason(ev.reason), ev))
        } else if (ev.kind === 'kill' || ev.kind === 'died' || ev.kind === 'lmk') {
          const inst = open.get(ev.pid)
          if (inst) {
            const isCrash = crashed.has(ev.pid) || ev.reason === 'crash'
            close(inst, i, isCrash ? 'crash' : ev.kind === 'died' ? 'died' : 'killed', ev.reason)
            open.delete(ev.pid)
            crashed.delete(ev.pid)
          }
        } else if (ev.kind === 'force') {
          for (const [pid, inst] of open) {
            if (inst.pkg === ev.pkg) {
              close(inst, i, crashed.has(pid) ? 'crash' : 'died', ev.reason)
              open.delete(pid)
              crashed.delete(pid)
              break
            }
          }
        } else if (ev.kind === 'crashproc') {
          crashed.add(ev.pid)
          if (!open.has(ev.pid)) open.set(ev.pid, create(seg, ev.pid, ev.pkg, Math.max(seg.firstLine, i - 1), 'inferred'))
        }
        continue
      }
      if (strongTagIds.has(cols.tagId[i])) {
        const pid = cols.pid[i]
        if (open.has(pid)) continue
        const known = identity.pidPkg.get(`${seg.id}:${pid}`)
        const pkg = known ?? UNKNOWN_PKG
        if (known ? !selectedSet.has(known) : !assumeUnknownIsApp) continue
        // Lines of a pid that was already closed in this segment stay with the closed instance.
        if (instances.some((x) => x.segId === seg.id && x.pid === pid)) continue
        open.set(pid, create(seg, pid, pkg, i, 'inferred'))
      }
    }
    for (const inst of open.values()) close(inst, seg.lastLine, seg.id === lastSeg ? 'eof' : 'segment-end')
  }
  return instances
}
