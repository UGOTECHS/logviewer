import type { LineColumns } from './types'

const decoder = new TextDecoder('utf-8', { fatal: false })

/** Full raw text of line `i`. */
export function lineText(bytes: Uint8Array, cols: LineColumns, i: number): string {
  const start = cols.lineStart[i]
  return decoder.decode(bytes.subarray(start, start + cols.lineLen[i]))
}

/** Message part (after `TAG( pid): `). */
export function lineMessage(bytes: Uint8Array, cols: LineColumns, i: number): string {
  return lineText(bytes, cols, i).slice(cols.msgStart[i])
}

/** Payload part: the message without the managed `v… File.cs:n ` or native `|..\File.cpp:n | ` prefix. */
export function linePayload(bytes: Uint8Array, cols: LineColumns, i: number): string {
  return lineText(bytes, cols, i).slice(cols.payloadStart[i])
}

export function decodeRange(bytes: Uint8Array, start: number, end: number): string {
  return decoder.decode(bytes.subarray(start, end))
}
