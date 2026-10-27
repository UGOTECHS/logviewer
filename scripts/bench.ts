/* Parse a local log file and print timings and counts. Usage: npm run bench -- /path/to/dump.txt [package] */
import { readFileSync } from 'node:fs'
import { parseLogBytes } from '../src/parser/parseFile'
import { FAMILY_NAMES, Family } from '../src/parser/types'

const path = process.argv[2]
if (!path) {
  console.error('usage: bench <file> [package]')
  process.exit(1)
}
const pkg = process.argv[3]
const bytes = new Uint8Array(readFileSync(path))
const t0 = performance.now()
const phases: Record<string, number> = {}
let last = t0
let lastPhase = 'start'
const file = parseLogBytes(bytes, path.split('/').pop(), pkg ? { packages: [pkg] } : {}, (phase) => {
  const now = performance.now()
  if (phase !== lastPhase) {
    phases[lastPhase] = (phases[lastPhase] ?? 0) + (now - last)
    lastPhase = phase
    last = now
  }
})
phases[lastPhase] = (phases[lastPhase] ?? 0) + (performance.now() - last)
const total = performance.now() - t0
const m = file.meta

console.log(`file: ${m.name}  bytes: ${m.byteLength}  lines: ${m.lineCount}  unparsed: ${m.unparsedLines}  time: ${total.toFixed(0)} ms`)
console.log('phases:', Object.entries(phases).map(([k, v]) => `${k} ${v.toFixed(0)}ms`).join(', '))
console.log(`segments: ${m.segments.length}`)
for (const s of m.segments) console.log(`  #${s.id} ${s.boundary.padEnd(10)} lines ${s.firstLine}-${s.lastLine} ${new Date(s.startTs).toISOString().slice(0, 19)}..${new Date(s.endTs).toISOString().slice(11, 19)} ss=${s.systemServerPid ?? '-'} boot=${s.bootConfirmed ? 'y' : 'n'} clock=${s.clockUnset ? 'unset' : 'ok'} mixed=${s.mixedOrder ? 'y' : 'n'} procs=${s.procIds.length}`)
console.log('packages (top 8):')
for (const p of m.packages.slice(0, 8)) console.log(`  ${p.pkg.padEnd(40)} starts=${p.startProcCount} crashes=${p.crashCount} appTagLines=${p.appTagLines} pids=${p.pids.length}`)
console.log('selected:', m.selectedPackages.join(', '))
const byEnd: Record<string, number> = {}
for (const p of m.processes) byEnd[p.endReason ?? '?'] = (byEnd[p.endReason ?? '?'] ?? 0) + 1
console.log(`instances: ${m.processes.length}`, byEnd)
const txns = m.groups.filter((g) => g.kind === 'txn')
const byStatus: Record<string, number> = {}
for (const t of txns) if (t.kind === 'txn') byStatus[t.status] = (byStatus[t.status] ?? 0) + 1
console.log(`transactions: ${txns.length} completed=${txns.filter((t) => t.kind === 'txn' && t.completed).length}`, byStatus)
console.log(`idle groups: ${m.groups.length - txns.length}`)
console.log('families:', FAMILY_NAMES.map((n, i) => `${n}=${m.stats.byFamily[i]}`).join(' '), ` echo=${m.stats.byFamily[Family.Echo]}`)
console.log('incidents:', m.incidents.length, m.stats.incidentsByKind)
const appInc = m.incidents.filter((i) => m.selectedPackages.includes(i.pkg))
console.log(`incidents for selected packages: ${appInc.length}`)
const first = txns.slice(0, 3)
for (const t of first) if (t.kind === 'txn') console.log(`  txn#${t.id} proc ${t.procId} ${t.function} amount=${t.amountMinor} status=${t.status} rc=${t.responseCode} stan=${t.receipt.stan} rrn=${t.receipt.rrn} card=${t.receipt.card} entry=${t.entryMode} scheme=${t.scheme} dur=${(t.durationMs / 1000).toFixed(1)}s milestones=${t.milestones.length} step=${t.stepTrace?.index}`)
const crash = m.incidents.find((i) => i.kind === 'fatal-exception' && m.selectedPackages.includes(i.pkg))
if (crash) console.log('first app crash:', { pid: crash.pid, type: crash.exceptionType, msg: crash.message.slice(0, 80), stack: crash.stackRange, linked: crash.linkedIds, txn: crash.txnId, dialog: crash.lastDialog })

console.log('transactions with status error/other:')
for (const t of txns) if (t.kind === 'txn' && (t.status === 'error' || t.status === 'other')) console.log(`  txn#${t.id} ${t.function} amount=${t.amountMinor} usResult=${t.usResult} completed=${t.completed} rc=${t.responseCode} ir=${t.iResultCode} result=${t.receipt.result} kinds=${[...new Set(t.milestones.map((m) => m.kind))].join(',')}`)
const appDied = m.incidents.filter((i) => i.kind === 'process-died' && m.selectedPackages.includes(i.pkg))
console.log(`app process-died incidents: ${appDied.length}; reasons:`, Object.entries(appDied.reduce<Record<string, number>>((acc, i) => { const r = /has died: (\S+)/.exec(i.message)?.[1] ?? '?'; acc[r] = (acc[r] ?? 0) + 1; return acc }, {})).map(([k, v]) => `${k}=${v}`).join(' '))
