import type { FilterSpec } from '../parser/query'
import type { LineColumns, LogFileMeta, ParseOptions } from '../parser/types'
import type { WorkerRequest, WorkerResponse } from './protocol'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type ProgressHandler = (phase: string, done: number, total: number) => void

interface Pending {
  resolve: (value: WorkerResponse) => void
  reject: (err: Error) => void
  onProgress?: ProgressHandler
}

/** Promise wrapper around the parser worker. One worker per app; requests are matched by id. */
export class ParserClient {
  private worker: Worker
  private pending = new Map<number, Pending>()
  private nextId = 1

  constructor() {
    this.worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data
      const p = this.pending.get(msg.reqId)
      if (!p) return
      if (msg.type === 'progress') {
        p.onProgress?.(msg.phase, msg.done, msg.total)
        return
      }
      this.pending.delete(msg.reqId)
      if (msg.type === 'error') p.reject(new Error(msg.message))
      else p.resolve(msg)
    }
    this.worker.onerror = (ev) => {
      for (const p of this.pending.values()) p.reject(new Error(ev.message || 'worker error'))
      this.pending.clear()
    }
  }

  private send(req: DistributiveOmit<WorkerRequest, 'reqId'>, transfer: Transferable[] = [], onProgress?: ProgressHandler): Promise<WorkerResponse> {
    const reqId = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject, onProgress })
      this.worker.postMessage({ ...req, reqId } as WorkerRequest, transfer)
    })
  }

  async parse(fileId: number, name: string, origin: LogFileMeta['origin'], bytes: Uint8Array, options: ParseOptions, onProgress?: ProgressHandler) {
    const res = await this.send({ type: 'parse', fileId, name, origin, bytes, options }, [bytes.buffer as ArrayBuffer], onProgress)
    if (res.type !== 'parsed' || !res.bytes) throw new Error('unexpected worker reply')
    return { meta: res.meta, cols: res.cols, bytes: res.bytes }
  }

  async reselect(fileId: number, packages: string[], onProgress?: ProgressHandler): Promise<{ meta: LogFileMeta; cols: LineColumns }> {
    const res = await this.send({ type: 'reselect', fileId, packages }, [], onProgress)
    if (res.type !== 'parsed') throw new Error('unexpected worker reply')
    return { meta: res.meta, cols: res.cols }
  }

  async query(fileId: number, spec: FilterSpec): Promise<Uint32Array> {
    const res = await this.send({ type: 'query', fileId, spec })
    if (res.type !== 'query-result') throw new Error('unexpected worker reply')
    return res.lines
  }

  async exportLines(fileId: number, lines: Uint32Array): Promise<Uint8Array> {
    const res = await this.send({ type: 'export', fileId, lines: lines.slice() })
    if (res.type !== 'export-result') throw new Error('unexpected worker reply')
    return res.bytes
  }

  drop(fileId: number) {
    void this.send({ type: 'drop', fileId })
  }
}

let shared: ParserClient | null = null
export function parserClient(): ParserClient {
  if (!shared) shared = new ParserClient()
  return shared
}
