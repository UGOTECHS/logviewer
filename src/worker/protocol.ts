import type { FilterSpec } from '../parser/query'
import type { LineColumns, LogFileMeta, ParseOptions } from '../parser/types'

export type WorkerRequest =
  | { type: 'parse'; reqId: number; fileId: number; name: string; origin: LogFileMeta['origin']; bytes: Uint8Array; options: ParseOptions }
  | { type: 'reselect'; reqId: number; fileId: number; packages: string[] }
  | { type: 'query'; reqId: number; fileId: number; spec: FilterSpec }
  | { type: 'export'; reqId: number; fileId: number; lines: Uint32Array }
  | { type: 'drop'; reqId: number; fileId: number }

export type WorkerResponse =
  | { type: 'progress'; reqId: number; fileId: number; phase: string; done: number; total: number }
  | { type: 'parsed'; reqId: number; fileId: number; meta: LogFileMeta; cols: LineColumns; bytes?: Uint8Array }
  | { type: 'query-result'; reqId: number; fileId: number; lines: Uint32Array }
  | { type: 'export-result'; reqId: number; fileId: number; bytes: Uint8Array }
  | { type: 'done'; reqId: number }
  | { type: 'error'; reqId: number; message: string }

export function columnBuffers(cols: LineColumns): ArrayBuffer[] {
  const out: ArrayBuffer[] = []
  for (const v of Object.values(cols)) if (ArrayBuffer.isView(v)) out.push(v.buffer as ArrayBuffer)
  return out
}

export function cloneColumns(cols: LineColumns): LineColumns {
  const out = { ...cols } as Record<string, unknown>
  for (const [k, v] of Object.entries(cols)) if (ArrayBuffer.isView(v)) out[k] = (v as Uint8Array).slice()
  return out as unknown as LineColumns
}
