import { classify } from './classifier'
import { detectIncidents } from './incidents'
import { buildInstances, discover, selectPackages, type Identity } from './registry'
import { segment } from './segmenter'
import { computeStats } from './stats'
import { tokenize } from './tokenizer'
import { buildAllGroups } from './transactions'
import type { BootSegment, LineColumns, LogFileMeta, ParseOptions, ParsedFile, StringTables } from './types'

export type Progress = (phase: string, done: number, total: number) => void

const ZIP_NAME_RE = /(\d{6,})_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})_(\d{3})/

export function parseDumpName(name: string): { serial?: string; dumpTs?: number } {
  const m = ZIP_NAME_RE.exec(name)
  if (!m) return {}
  return { serial: m[1], dumpTs: Date.UTC(+m[2], +m[3] - 1, +m[4], +m[5], +m[6], +m[7], +m[8]) }
}

/** Intermediate state kept by the worker so a package re-selection does not re-tokenize. */
export interface Tokenized {
  bytes: Uint8Array
  cols: LineColumns
  strings: StringTables
  segments: BootSegment[]
  identity: Identity
  unparsedLines: number
}

export function tokenizeAndSegment(bytes: Uint8Array, options: ParseOptions = {}, onProgress?: Progress): Tokenized {
  const { cols, strings, unparsedLines } = tokenize(bytes, (d, t) => onProgress?.('tokenize', d, t))
  onProgress?.('segment', 0, 1)
  const segments = segment(bytes, cols, strings, options.segment)
  onProgress?.('discover', 0, 1)
  const identity = discover(bytes, cols, strings, segments)
  return { bytes, cols, strings, segments, identity, unparsedLines }
}

/** Build instances, groups, incidents and stats for a package selection on already tokenized data. */
export function analyse(tok: Tokenized, name: string, origin: LogFileMeta['origin'], options: ParseOptions = {}, onProgress?: Progress): ParsedFile {
  const { bytes, cols, strings, segments, identity } = tok
  // Reset selection-dependent columns.
  cols.procId.fill(-1)
  cols.groupId.fill(-1)
  cols.family.fill(0)
  cols.payloadStart.set(cols.msgStart)
  cols.srcFileId.fill(0)
  cols.srcLine.fill(0)
  cols.versionId.fill(0)
  for (const s of segments) s.procIds = []

  const selected = selectPackages(identity.packages, options)
  onProgress?.('instances', 0, 1)
  const processes = buildInstances(cols, strings, segments, identity, selected)
  onProgress?.('classify', 0, 1)
  classify(bytes, cols, strings, segments, processes, identity)
  onProgress?.('transactions', 0, 1)
  const groups = buildAllGroups(bytes, cols, processes)
  onProgress?.('incidents', 0, 1)
  const incidents = detectIncidents(bytes, cols, strings, processes, groups, identity)
  const stats = computeStats(cols, strings, incidents)

  let firstTs = Infinity
  let lastTs = -Infinity
  for (const s of segments) {
    if (s.startTs && s.startTs < firstTs) firstTs = s.startTs
    if (s.endTs > lastTs) lastTs = s.endTs
  }
  const meta: LogFileMeta = {
    id: -1,
    name,
    ...parseDumpName(name),
    origin,
    byteLength: bytes.byteLength,
    lineCount: cols.count,
    unparsedLines: tok.unparsedLines,
    firstTs: firstTs === Infinity ? 0 : firstTs,
    lastTs: lastTs === -Infinity ? 0 : lastTs,
    packages: identity.packages,
    selectedPackages: selected,
    segments,
    processes,
    groups,
    incidents,
    strings,
    stats,
  }
  return { meta, cols, bytes }
}

/** One-shot convenience for tests and the bench script. */
export function parseLogBytes(bytes: Uint8Array, name = 'log.txt', options: ParseOptions = {}, onProgress?: Progress): ParsedFile {
  return analyse(tokenizeAndSegment(bytes, options, onProgress), name, 'local', options, onProgress)
}

export function parseLogText(text: string, name = 'log.txt', options: ParseOptions = {}): ParsedFile {
  return parseLogBytes(new TextEncoder().encode(text), name, options)
}
