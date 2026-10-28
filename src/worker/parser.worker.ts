import { unzipSync } from 'fflate'
import { analyse, tokenizeAndSegment, type Tokenized } from '../parser/parseFile'
import { runQuery } from '../parser/query'
import { lineText } from '../parser/lineText'
import type { ParsedFile } from '../parser/types'
import { cloneColumns, columnBuffers, type WorkerRequest, type WorkerResponse } from './protocol'

interface Entry {
  tok: Tokenized
  parsed: ParsedFile
  name: string
  origin: ParsedFile['meta']['origin']
}

const files = new Map<number, Entry>()
const post = (msg: WorkerResponse, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer)

/** Unwrap a zip (first/largest .txt or .log entry) or return the bytes unchanged. */
function unwrap(bytes: Uint8Array, name: string): { bytes: Uint8Array; name: string } {
  const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4
  if (!isZip) return { bytes, name }
  const entries = unzipSync(bytes)
  let best: { name: string; data: Uint8Array } | null = null
  for (const [entryName, data] of Object.entries(entries)) {
    if (entryName.endsWith('/')) continue
    const textLike = /\.(txt|log)$/i.test(entryName)
    if (!best || (textLike && !/\.(txt|log)$/i.test(best.name)) || (textLike === /\.(txt|log)$/i.test(best.name) && data.length > best.data.length)) best = { name: entryName, data }
  }
  if (!best) throw new Error(`${name}: the zip contains no file`)
  return { bytes: best.data, name: best.name.split('/').pop() ?? best.name }
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data
  try {
    switch (req.type) {
      case 'parse': {
        const unwrapped = unwrap(req.bytes, req.name)
        const displayName = req.name.toLowerCase().endsWith('.zip') ? `${req.name} › ${unwrapped.name}` : req.name
        const progress = (phase: string, done: number, total: number) => post({ type: 'progress', reqId: req.reqId, fileId: req.fileId, phase, done, total })
        const tok = tokenizeAndSegment(unwrapped.bytes, req.options, progress)
        const parsed = analyse(tok, displayName, req.origin, req.options, progress)
        parsed.meta.id = req.fileId
        files.set(req.fileId, { tok, parsed, name: displayName, origin: req.origin })
        const cols = cloneColumns(parsed.cols)
        const bytes = parsed.bytes.slice()
        post({ type: 'parsed', reqId: req.reqId, fileId: req.fileId, meta: parsed.meta, cols, bytes }, [...columnBuffers(cols), bytes.buffer as ArrayBuffer])
        break
      }
      case 'reselect': {
        const entry = files.get(req.fileId)
        if (!entry) throw new Error('file not loaded')
        const progress = (phase: string, done: number, total: number) => post({ type: 'progress', reqId: req.reqId, fileId: req.fileId, phase, done, total })
        entry.parsed = analyse(entry.tok, entry.name, entry.origin, { packages: req.packages }, progress)
        entry.parsed.meta.id = req.fileId
        const cols = cloneColumns(entry.parsed.cols)
        post({ type: 'parsed', reqId: req.reqId, fileId: req.fileId, meta: entry.parsed.meta, cols }, columnBuffers(cols))
        break
      }
      case 'query': {
        const entry = files.get(req.fileId)
        if (!entry) throw new Error('file not loaded')
        const lines = runQuery(entry.parsed, req.spec)
        post({ type: 'query-result', reqId: req.reqId, fileId: req.fileId, lines }, [lines.buffer as ArrayBuffer])
        break
      }
      case 'export': {
        const entry = files.get(req.fileId)
        if (!entry) throw new Error('file not loaded')
        const { bytes, cols } = entry.parsed
        const parts: string[] = []
        for (const i of req.lines) parts.push(lineText(bytes, cols, i))
        const out = new TextEncoder().encode(parts.join('\n') + '\n')
        post({ type: 'export-result', reqId: req.reqId, fileId: req.fileId, bytes: out }, [out.buffer as ArrayBuffer])
        break
      }
      case 'drop':
        files.delete(req.fileId)
        post({ type: 'done', reqId: req.reqId })
        break
    }
  } catch (e) {
    post({ type: 'error', reqId: req.reqId, message: e instanceof Error ? e.message : String(e) })
  }
}
