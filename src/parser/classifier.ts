import { DIALOG_TAG, ECHO_PREFIX, MANAGED_TAGS, NATIVE_TAG, SDK_TAGS, STEP_TRACE_TAG, SYSTEM_TAGS } from './config'
import { lineMessage } from './lineText'
import { KILLING_RE, LMK_ANY_RE, type Identity } from './registry'
import { Family, type FamilyId, type BootSegment, type LineColumns, type ProcessInstance, type StringTables } from './types'

const MANAGED_RE = /^v(\S+) (?:[A-Za-z]:\\[^ ]*\\)?([\w.-]+\.cs):(\d+) ?/
const NATIVE_RE = /^\|\.\.\\(.+?):(\d+) \| /
const STEP_GUID_RE = /^\[([0-9a-f]{32})\]/

function intern(list: string[], index: Map<string, number>, value: string): number {
  let id = index.get(value)
  if (id === undefined) {
    id = list.length
    list.push(value)
    index.set(value, id)
  }
  return id
}

/**
 * Attribute lines to process instances, classify each attributed line into a family and parse the managed /
 * native prefixes. Fills `procId`, `family`, `payloadStart`, `srcFileId`, `srcLine`, `versionId` and each
 * instance's `lines`, `counts`, `version`, `stepTraceGuid`, `endTs`.
 */
export function classify(bytes: Uint8Array, cols: LineColumns, strings: StringTables, segments: BootSegment[], instances: ProcessInstance[], identity: Identity): void {
  const tags = strings.tags
  const tagKind = new Uint8Array(tags.length) // 0 other, 1 managed, 2 native, 3 dialog, 4 steptrace, 5 sdk, 6 system
  tags.forEach((t, i) => {
    if (MANAGED_TAGS.has(t)) tagKind[i] = 1
    else if (t === NATIVE_TAG) tagKind[i] = 2
    else if (t === DIALOG_TAG) tagKind[i] = 3
    else if (t === STEP_TRACE_TAG) tagKind[i] = 4
    else if (SDK_TAGS.has(t)) tagKind[i] = 5
    else if (SYSTEM_TAGS.has(t)) tagKind[i] = 6
  })
  const lmkTag = tags.indexOf('lowmemorykiller')
  const srcIndex = new Map<string, number>(strings.srcFiles.map((s, i) => [s, i]))
  const verIndex = new Map<string, number>(strings.versions.map((s, i) => [s, i]))
  const lineCounts = new Uint32Array(instances.length)

  // Pass 1: attribution + classification.
  const bySeg = new Map<number, ProcessInstance[]>()
  for (const inst of instances) {
    const list = bySeg.get(inst.segId) ?? []
    list.push(inst)
    bySeg.set(inst.segId, list)
  }
  for (const seg of segments) {
    const list = (bySeg.get(seg.id) ?? []).sort((a, b) => a.startLine! - b.startLine!)
    let next = 0
    const cur = new Map<number, ProcessInstance>()
    const byPkg = new Map<string, ProcessInstance>()
    for (let i = seg.firstLine; i <= seg.lastLine; i++) {
      while (next < list.length && list[next].startLine! <= i) {
        cur.set(list[next].pid, list[next])
        byPkg.set(list[next].pkg, list[next])
        next++
      }
      const pid = cols.pid[i]
      const kind = tagKind[cols.tagId[i]]
      let inst = cur.get(pid)
      let family: FamilyId = Family.Other
      if (inst) {
        switch (kind) {
          case 1: {
            family = Family.Managed
            const msg = lineMessage(bytes, cols, i)
            const m = MANAGED_RE.exec(msg)
            if (m) {
              const vid = intern(strings.versions, verIndex, m[1])
              cols.versionId[i] = vid
              cols.srcFileId[i] = intern(strings.srcFiles, srcIndex, m[2])
              cols.srcLine[i] = +m[3]
              cols.payloadStart[i] = cols.msgStart[i] + m[0].length
              if (!inst.version) inst.version = m[1]
            }
            break
          }
          case 2: {
            family = Family.Native
            const msg = lineMessage(bytes, cols, i)
            const m = NATIVE_RE.exec(msg)
            if (m) {
              cols.srcFileId[i] = intern(strings.srcFiles, srcIndex, m[1])
              cols.srcLine[i] = +m[2]
              cols.payloadStart[i] = cols.msgStart[i] + m[0].length
              if (m[1].endsWith('TCP.cpp') && msg.startsWith(ECHO_PREFIX, m[0].length)) family = Family.Echo
            }
            break
          }
          case 3:
            family = Family.Dialog
            break
          case 4: {
            family = Family.StepTrace
            if (!inst.stepTraceGuid) {
              const m = STEP_GUID_RE.exec(lineMessage(bytes, cols, i))
              if (m) inst.stepTraceGuid = m[1]
            }
            break
          }
          case 5:
            family = Family.Sdk
            break
          default:
            family = Family.Runtime
        }
      } else if (kind === 6) {
        // System lines about one of our instances (ActivityManager, ActivityTaskManager, lowmemorykiller, AndroidRuntime of other pids).
        const ev = identity.byLine.get(i)
        if (ev) {
          inst = ev.pid ? cur.get(ev.pid) : byPkg.get(ev.pkg)
          if (inst && inst.pkg !== ev.pkg) inst = undefined
        } else if (cols.tagId[i] === lmkTag) {
          const m = LMK_ANY_RE.exec(lineMessage(bytes, cols, i))
          if (m) inst = cur.get(+m[2])
        } else {
          const msg = lineMessage(bytes, cols, i)
          const m = KILLING_RE.exec(msg)
          if (m) inst = cur.get(+m[1])
        }
        if (inst) family = Family.System
      }
      if (inst) {
        cols.procId[i] = inst.id
        cols.family[i] = family
        lineCounts[inst.id]++
        inst.counts[family]++
        if (cols.level[i] >= 4) inst.errorCount++
        if (family !== Family.System && cols.ts[i] > inst.endTs) inst.endTs = cols.ts[i]
      }
    }
  }

  // Pass 2: per-instance line lists.
  for (const inst of instances) inst.lines = new Uint32Array(lineCounts[inst.id])
  const fill = new Uint32Array(instances.length)
  for (let i = 0; i < cols.count; i++) {
    const p = cols.procId[i]
    if (p >= 0) instances[p].lines[fill[p]++] = i
  }
}
