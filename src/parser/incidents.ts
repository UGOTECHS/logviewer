import { INCIDENT } from './config'
import { lineMessage, linePayload } from './lineText'
import { CRASH_PROC_RE, DIED_RE, FORCE_REMOVE_RE, KILLING_RE, LMK_RE, UNKNOWN_PKG, type Identity } from './registry'
import { Family, type Group, type Incident, type IncidentKind, type LineColumns, type ProcessInstance, type StringTables } from './types'

const JAVA_EXC_RE = /^([\w.$]+(?:Exception|Error|Throwable)[\w.$]*)(?::\s?(.*))?$/
const MONO_EXC_RE = /^android\.runtime\.JavaProxyThrowable: \[([\w.`+]+)\]: ?(.*)$/
const ANY_EXC_RE = /\b([\w.]+(?:Exception|Error))\b/
const ANR_RE = /^ANR in ([\w.:/]+)/
const SIGNAL_RE = /^Fatal signal (\d+) \((\w+)\)/
const TOMBSTONE_PID_RE = /^pid: (\d+), tid: (\d+), name: (\S+)\s+>>> (\S+) <<</

const isStackLine = (s: string) => s.startsWith('\tat ') || s.startsWith('   at ') || s.startsWith('  at ') || s.startsWith('Caused by:') || s.startsWith('\t...') || s.startsWith('  --- End of') || s.startsWith(' --- End of')

/**
 * Detect crashes and exceptions logged by the system or the runtime, for every package. Attribution to process
 * instances and transactions uses the `procId` / `groupId` columns, so this runs after classification.
 */
export function detectIncidents(bytes: Uint8Array, cols: LineColumns, strings: StringTables, instances: ProcessInstance[], groups: Group[], identity: Identity): Incident[] {
  const tags = strings.tags
  const id = (name: string) => tags.indexOf(name)
  const artTag = id('AndroidRuntime')
  const amTag = id('ActivityManager')
  const atmTag = id('ActivityTaskManager')
  const lmkTag = id('lowmemorykiller')
  const syserrTag = id('System.err')
  const libcTag = id('libc')
  const debugTag = id('DEBUG')
  const neptuneTag = id('Neptune')
  const paxTag = id('PaxSmartDevice')
  const xerrorTag = id('XERROR')
  const n = cols.count
  const incidents: Incident[] = []
  const consumed = new Uint8Array(n) // lines already inside a block

  /** Last index of a contiguous stack block for (tag, pid) starting after `from`; skips lines of other pids. */
  const collect = (from: number, tag: number, pid: number, maxGap = 60): number => {
    let last = from
    let gap = 0
    for (let j = from + 1; j < n && gap < maxGap; j++) {
      if (cols.tagId[j] !== tag || cols.pid[j] !== pid) {
        gap++
        continue
      }
      if (!isStackLine(lineMessage(bytes, cols, j))) break
      last = j
      gap = 0
    }
    return last
  }
  const pkgOf = (i: number, pid: number): string => {
    const p = cols.procId[i]
    if (p >= 0) return instances[p].pkg
    return identity.pidPkg.get(`${cols.segId[i]}:${pid}`) ?? UNKNOWN_PKG
  }
  const add = (i: number, pid: number, kind: IncidentKind, message: string, extra: Partial<Incident> = {}): Incident => {
    const inc: Incident = {
      id: incidents.length,
      segId: cols.segId[i],
      procId: cols.procId[i],
      pid,
      pkg: extra.pkg ?? pkgOf(i, pid),
      line: i,
      ts: cols.ts[i],
      kind,
      message: message.length > 300 ? message.slice(0, 297) + '…' : message,
      stackRange: [i, i],
      linkedIds: [],
      ...extra,
    }
    for (let j = inc.stackRange[0]; j <= inc.stackRange[1]; j++) if (cols.tagId[j] === cols.tagId[i] && cols.pid[j] === cols.pid[i]) consumed[j] = 1
    incidents.push(inc)
    return inc
  }

  for (let i = 0; i < n; i++) {
    if (consumed[i]) continue
    const t = cols.tagId[i]
    const pid = cols.pid[i]
    if (t === artTag) {
      const msg = lineMessage(bytes, cols, i)
      if (!msg.startsWith('FATAL EXCEPTION')) continue
      const thread = msg.slice('FATAL EXCEPTION:'.length).trim()
      let j = i + 1
      let pkg: string | undefined
      let crashPid = pid
      if (j < n && cols.tagId[j] === t && cols.pid[j] === pid) {
        const m = CRASH_PROC_RE.exec(lineMessage(bytes, cols, j))
        if (m) {
          pkg = m[1]
          crashPid = +m[2]
          j++
        }
      }
      let exceptionType: string | undefined
      let message = msg
      if (j < n && cols.tagId[j] === t && cols.pid[j] === pid) {
        const ex = lineMessage(bytes, cols, j)
        const mono = MONO_EXC_RE.exec(ex)
        const java = JAVA_EXC_RE.exec(ex)
        if (mono) {
          exceptionType = mono[1]
          message = mono[2] || ex
        } else if (java) {
          exceptionType = java[1]
          message = java[2] ?? ex
        } else message = ex
      }
      const last = collect(j, t, pid)
      add(i, crashPid, 'fatal-exception', message, { pkg: pkg ?? pkgOf(i, pid), thread, exceptionType, stackRange: [i, last] })
      i = last
    } else if (t === amTag) {
      const msg = lineMessage(bytes, cols, i)
      let m = KILLING_RE.exec(msg)
      if (m) {
        if (m[3] === 'crash') add(i, +m[1], 'killed-crash', msg, { pkg: m[2] })
        continue
      }
      m = DIED_RE.exec(msg)
      if (m) {
        add(i, +m[2], 'process-died', msg, { pkg: m[1] })
        continue
      }
      m = ANR_RE.exec(msg)
      if (m) {
        let reason = ''
        let anrPid = 0
        for (let j = i + 1; j < Math.min(n, i + 6); j++) {
          if (cols.tagId[j] !== t) continue
          const l = lineMessage(bytes, cols, j)
          const pm = /^PID: (\d+)/.exec(l)
          if (pm) anrPid = +pm[1]
          const rm = /^Reason: (.*)/.exec(l)
          if (rm) reason = rm[1]
        }
        add(i, anrPid, 'anr', reason || msg, { pkg: m[1].split('/')[0] })
      }
    } else if (t === atmTag) {
      const msg = lineMessage(bytes, cols, i)
      const m = FORCE_REMOVE_RE.exec(msg)
      if (m) {
        const p = cols.procId[i]
        add(i, p >= 0 ? instances[p].pid : 0, 'force-removed', msg, { pkg: m[1] })
      }
    } else if (t === lmkTag) {
      const msg = lineMessage(bytes, cols, i)
      const m = LMK_RE.exec(msg)
      if (m && msg.startsWith('Killing')) add(i, +m[2], 'lmk-kill', msg, { pkg: m[1] })
    } else if (t === libcTag) {
      const msg = lineMessage(bytes, cols, i)
      const m = SIGNAL_RE.exec(msg)
      if (m) add(i, pid, 'native-crash', msg, { exceptionType: m[2] })
    } else if (t === debugTag) {
      const msg = lineMessage(bytes, cols, i)
      if (!msg.startsWith('*** *** ***')) continue
      let crashPid = 0
      let pkg: string | undefined
      let last = i
      for (let j = i + 1; j < Math.min(n, i + 400); j++) {
        if (cols.tagId[j] !== t || cols.pid[j] !== pid) continue
        const l = lineMessage(bytes, cols, j)
        if (l.startsWith('*** *** ***')) break
        last = j
        const pm = TOMBSTONE_PID_RE.exec(l)
        if (pm) {
          crashPid = +pm[1]
          pkg = pm[4]
        }
      }
      add(i, crashPid, 'native-crash', 'native crash (tombstone)', { pkg: pkg ?? UNKNOWN_PKG, stackRange: [i, last] })
      i = last
    } else if (t === xerrorTag && cols.procId[i] >= 0) {
      const p = linePayload(bytes, cols, i)
      if (p.includes('UnhandledExceptionHandler:') || p.includes('CurrentDomainOnUnhandledException:')) {
        add(i, pid, 'managed-unhandled', p.replace(/\t/g, ' | '), { exceptionType: ANY_EXC_RE.exec(p)?.[1] })
      } else {
        const m = ANY_EXC_RE.exec(p)
        if (m) add(i, pid, 'managed-exception', p.replace(/\t/g, ' | '), { exceptionType: m[1] })
      }
    } else if (t === syserrTag && cols.procId[i] >= 0) {
      const msg = lineMessage(bytes, cols, i)
      const m = JAVA_EXC_RE.exec(msg)
      if (!m || isStackLine(msg)) continue
      const last = collect(i, t, pid)
      add(i, pid, 'java-exception', m[2] ?? msg, { exceptionType: m[1], stackRange: [i, last] })
      i = last
    } else if (t === neptuneTag && cols.procId[i] >= 0) {
      const msg = lineMessage(bytes, cols, i)
      if (msg.startsWith('CatchException:')) {
        const body = msg.slice(15).trim()
        add(i, pid, 'sdk-exception', body, { exceptionType: ANY_EXC_RE.exec(body)?.[1] })
      }
    } else if (t === paxTag && cols.procId[i] >= 0) {
      const msg = lineMessage(bytes, cols, i)
      if (isStackLine(msg) || !/Exception/.test(msg)) continue
      const last = collect(i, t, pid)
      add(i, pid, 'sdk-exception', msg.replace(/\t/g, ' | '), { exceptionType: ANY_EXC_RE.exec(msg)?.[1], stackRange: [i, last] })
      i = last
    }
  }

  // Attribution: open transaction and last dialog; link crash → kill/death of the same pid within the window.
  for (const inc of incidents) {
    if (inc.procId < 0) continue
    const inst = instances[inc.procId]
    inst.incidentIds.push(inc.id)
    const g = cols.groupId[inc.line]
    if (g >= 0 && groups[g]?.kind === 'txn') {
      inc.txnId = g
      groups[g].incidentIds.push(inc.id)
    }
    // last dialog before the incident inside the instance
    const lines = inst.lines
    let lo = 0
    let hi = lines.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (lines[mid] < inc.line) lo = mid + 1
      else hi = mid
    }
    for (let k = lo - 1; k >= 0 && k > lo - 2000; k--) {
      const li = lines[k]
      if (cols.family[li] === Family.Dialog) {
        inc.lastDialog = lineMessage(bytes, cols, li).replace(/^CloudBanking\.\w+\./, '')
        break
      }
    }
  }
  const crashKinds = new Set<IncidentKind>(['fatal-exception', 'native-crash', 'anr'])
  const endKinds = new Set<IncidentKind>(['killed-crash', 'process-died', 'force-removed', 'lmk-kill'])
  for (let a = 0; a < incidents.length; a++) {
    const x = incidents[a]
    if (!crashKinds.has(x.kind)) continue
    for (let b = a + 1; b < incidents.length; b++) {
      const y = incidents[b]
      if (y.ts - x.ts > INCIDENT.linkWindowMs) break
      if (!endKinds.has(y.kind) || y.pid !== x.pid || y.segId !== x.segId) continue
      x.linkedIds.push(y.id)
      y.linkedIds.push(x.id)
    }
  }
  return incidents
}
