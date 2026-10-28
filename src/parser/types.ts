/** Shared data model for the parser, the worker and the UI. */

export const LEVEL_CHARS = ['V', 'D', 'I', 'W', 'E', 'F'] as const
export type Level = 0 | 1 | 2 | 3 | 4 | 5

export const Family = {
  Other: 0,
  Managed: 1,
  Native: 2,
  Echo: 3,
  Dialog: 4,
  StepTrace: 5,
  Sdk: 6,
  Runtime: 7,
  System: 8,
} as const
export type FamilyId = (typeof Family)[keyof typeof Family]
export const FAMILY_NAMES = ['other', 'managed', 'native', 'echo', 'dialog', 'step trace', 'sdk', 'runtime', 'system'] as const
export const FAMILY_COUNT = FAMILY_NAMES.length

export const Flag = {
  TabFlattened: 1,
  Unparsed: 2,
  OutOfOrder: 4,
} as const

/** One slot per line. Offsets are character offsets inside the decoded line (prefixes are ASCII). */
export interface LineColumns {
  count: number
  lineStart: Uint32Array
  lineLen: Uint32Array
  ts: Float64Array
  level: Uint8Array
  tagId: Uint16Array
  pid: Uint32Array
  msgStart: Uint16Array
  payloadStart: Uint16Array
  family: Uint8Array
  flags: Uint8Array
  srcFileId: Uint16Array
  srcLine: Uint32Array
  versionId: Uint8Array
  segId: Uint16Array
  procId: Int32Array
  groupId: Int32Array
}

export interface StringTables {
  tags: string[]
  srcFiles: string[]
  versions: string[]
}

export type SegmentBoundary = 'file-start' | 'reboot' | 'time-jump'

export interface BootSegment {
  id: number
  firstLine: number
  lastLine: number
  startTs: number
  endTs: number
  boundary: SegmentBoundary
  bootConfirmed: boolean
  systemServerPid?: number
  clockUnset: boolean
  mixedOrder: boolean
  procIds: number[]
}

export type StartReason = 'activity' | 'broadcast' | 'service' | 'content provider' | 'other' | 'inferred'
export type EndReason = 'killed' | 'died' | 'crash' | 'superseded' | 'segment-end' | 'eof'

export interface ProcessInstance {
  id: number
  segId: number
  pid: number
  pkg: string
  uid?: string
  version?: string
  startLine?: number
  startReason: StartReason
  component?: string
  endLine?: number
  endReason?: EndReason
  endDetail?: string
  startTs: number
  endTs: number
  /** Sorted indices of every line attributed to this instance (own pid + system lines about it). */
  lines: Uint32Array
  groupIds: number[]
  incidentIds: number[]
  stepTraceGuid?: string
  counts: number[] // by family
  errorCount: number
}

export type MilestoneKind =
  | 'dialog'
  | 'ecrFunction'
  | 'entryMode'
  | 'scheme'
  | 'account'
  | 'cardData'
  | 'cancel'
  | 'pin'
  | 'signature'
  | 'hostSend'
  | 'hostRecv'
  | 'emvComplete'
  | 'processTrans'
  | 'completed'
  | 'receipt'
  | 'print'
  | 'stepTrace'
  | 'timeout'
  | 'reversal'
  | 'logon'
  | 'settlement'
  | 'end'

export interface Milestone {
  line: number
  ts: number
  kind: MilestoneKind
  text: string
}

export type TxnStatus = 'approved' | 'declined' | 'cancelled' | 'error' | 'orphan' | 'other'

export interface StepTrace {
  guid: string
  index: number
  entryMode?: string
  readingCardS?: number
  hostS?: number
  dbMs?: number
  renderReceipts?: string
  approvalS?: number
  card?: string
  memoryMb?: number
  memorySharedMb?: number
  deviceFreeMb?: number
  raw: string
}

export interface Receipt {
  merchantId?: string
  terminalId?: string
  dateTime?: string
  stan?: string
  rrn?: string
  aid?: string
  card?: string
  authId?: string
  amount?: string
  total?: string
  result?: string
}

export interface Transaction {
  kind: 'txn'
  id: number
  procId: number
  startLine: number
  endLine: number
  /** [from, to) range inside ProcessInstance.lines */
  procRange: [number, number]
  startTs: number
  endTs: number
  durationMs: number
  function: string
  amountMinor?: number
  merchant?: number
  eftProcessor?: string
  ecrInitiated: boolean
  ecrFunction?: string
  usResult?: number
  completed: boolean
  responseCode?: string
  iResultCode?: number
  status: TxnStatus
  endReason: 'end' | EndReason
  entryMode?: string
  scheme?: string
  accountType?: string
  receipt: Receipt
  stepTrace?: StepTrace
  milestones: Milestone[]
  errorCount: number
  incidentIds: number[]
}

export type IdleLabel = 'startup' | 'logon' | 'settlement' | 'param download' | 'log upload' | 'shutdown' | 'idle'

export interface IdleGroup {
  kind: 'idle'
  id: number
  procId: number
  startLine: number
  endLine: number
  procRange: [number, number]
  startTs: number
  endTs: number
  label: IdleLabel
  lineCount: number
  errorCount: number
}

export type Group = Transaction | IdleGroup

export type IncidentKind =
  | 'fatal-exception'
  | 'native-crash'
  | 'anr'
  | 'killed-crash'
  | 'process-died'
  | 'force-removed'
  | 'lmk-kill'
  | 'managed-unhandled'
  | 'managed-exception'
  | 'java-exception'
  | 'sdk-exception'

export const INCIDENT_CATEGORY: Record<IncidentKind, 'crash' | 'kill' | 'managed' | 'java'> = {
  'fatal-exception': 'crash',
  'native-crash': 'crash',
  anr: 'crash',
  'killed-crash': 'kill',
  'process-died': 'kill',
  'force-removed': 'kill',
  'lmk-kill': 'kill',
  'managed-unhandled': 'managed',
  'managed-exception': 'managed',
  'java-exception': 'java',
  'sdk-exception': 'java',
}

export interface Incident {
  id: number
  segId: number
  procId: number // -1 when the pid belongs to no selected package instance
  pid: number
  pkg: string
  line: number
  ts: number
  kind: IncidentKind
  thread?: string
  exceptionType?: string
  message: string
  stackRange: [number, number]
  txnId?: number
  lastDialog?: string
  linkedIds: number[]
}

export interface PackageInfo {
  pkg: string
  startProcCount: number
  pids: number[]
  crashCount: number
  appTagLines: number
}

export interface FileStats {
  byFamily: number[]
  byLevel: number[]
  byTag: [string, number][]
  incidentsByKind: Partial<Record<IncidentKind, number>>
  appLines: number
}

export interface LogFileMeta {
  id: number
  name: string
  serial?: string
  dumpTs?: number
  origin: 'local' | 'remote' | 'url'
  byteLength: number
  lineCount: number
  unparsedLines: number
  firstTs: number
  lastTs: number
  packages: PackageInfo[]
  selectedPackages: string[]
  segments: BootSegment[]
  processes: ProcessInstance[]
  groups: Group[]
  incidents: Incident[]
  strings: StringTables
  stats: FileStats
}

export interface ParsedFile {
  meta: LogFileMeta
  cols: LineColumns
  bytes: Uint8Array
}

export interface ParseOptions {
  /** Packages to build process instances for; empty = auto (preset ∩ discovered, else the busiest app package). */
  packages?: string[]
  /** Additional preset packages treated as "app" packages for the auto selection. */
  presetPackages?: string[]
  /** Segmenter threshold overrides (tests). */
  segment?: { timeJumpMs?: number; sustainLines?: number; minLines?: number; clockUnsetWindowMs?: number }
}
