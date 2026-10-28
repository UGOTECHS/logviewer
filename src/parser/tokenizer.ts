import { Flag, LEVEL_CHARS, type LineColumns, type StringTables } from './types'

const LINE_RE = /^\[(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\]\.(\d{3}) ([VDIWEF])\/(.*?)\( *(\d+)\): /

export interface TokenizeResult {
  cols: LineColumns
  strings: StringTables
  unparsedLines: number
}

function allocate(n: number): LineColumns {
  return {
    count: n,
    lineStart: new Uint32Array(n),
    lineLen: new Uint32Array(n),
    ts: new Float64Array(n),
    level: new Uint8Array(n),
    tagId: new Uint16Array(n),
    pid: new Uint32Array(n),
    msgStart: new Uint16Array(n),
    payloadStart: new Uint16Array(n),
    family: new Uint8Array(n),
    flags: new Uint8Array(n),
    srcFileId: new Uint16Array(n),
    srcLine: new Uint32Array(n),
    versionId: new Uint8Array(n),
    segId: new Uint16Array(n),
    procId: new Int32Array(n).fill(-1),
    groupId: new Int32Array(n).fill(-1),
  }
}

/** Count lines (a trailing newline does not add an empty line). */
function countLines(bytes: Uint8Array): number {
  let n = 0
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 10) n++
  if (bytes.length > 0 && bytes[bytes.length - 1] !== 10) n++
  return n
}

/**
 * Split the file into lines and parse the logcat prefix of each.
 * Lines that do not match keep their text, get `Flag.Unparsed`, tag 0 and the timestamp of the previous line.
 */
export function tokenize(bytes: Uint8Array, onProgress?: (done: number, total: number) => void): TokenizeResult {
  const total = countLines(bytes)
  const cols = allocate(total)
  const tags: string[] = ['']
  const tagIndex = new Map<string, number>([['', 0]])
  const strings: StringTables = { tags, srcFiles: [''], versions: [''] }
  const decoder = new TextDecoder('utf-8', { fatal: false })
  let unparsed = 0
  let lastTs = 0

  let i = 0
  let pos = 0
  const len = bytes.length
  while (pos < len && i < total) {
    let end = bytes.indexOf(10, pos)
    if (end === -1) end = len
    let lineEnd = end
    if (lineEnd > pos && bytes[lineEnd - 1] === 13) lineEnd--
    cols.lineStart[i] = pos
    cols.lineLen[i] = lineEnd - pos
    // The prefix is ASCII, so only decode what the regex needs plus a margin for long tags.
    const headLen = Math.min(lineEnd - pos, 96)
    const head = decoder.decode(bytes.subarray(pos, pos + headLen))
    const m = LINE_RE.exec(head)
    if (m) {
      const ts = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7])
      cols.ts[i] = ts
      lastTs = ts
      cols.level[i] = LEVEL_CHARS.indexOf(m[8] as (typeof LEVEL_CHARS)[number])
      const tag = m[9].trimEnd()
      let id = tagIndex.get(tag)
      if (id === undefined) {
        id = tags.length
        tags.push(tag)
        tagIndex.set(tag, id)
      }
      cols.tagId[i] = id
      cols.pid[i] = +m[10]
      cols.msgStart[i] = m[0].length
      cols.payloadStart[i] = m[0].length
    } else {
      cols.ts[i] = lastTs
      cols.flags[i] |= Flag.Unparsed
      unparsed++
    }
    // Tab-flattened multi-line messages (the app replaces "\n" with "\t").
    for (let p = pos; p < lineEnd; p++) {
      if (bytes[p] === 9) {
        cols.flags[i] |= Flag.TabFlattened
        break
      }
    }
    i++
    pos = end + 1
    if (onProgress && (i & 0x3fff) === 0) onProgress(i, total)
  }
  cols.count = i
  onProgress?.(i, total)
  return { cols, strings, unparsedLines: unparsed }
}
