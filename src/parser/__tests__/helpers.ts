import { parseLogBytes } from '../parseFile'
import type { ParseOptions, ParsedFile, Transaction } from '../types'
import { FIXTURES } from './fixtures'

export function fixture(name: string): Uint8Array {
  const text = FIXTURES[name]
  if (text === undefined) throw new Error(`unknown fixture ${name}`)
  return new TextEncoder().encode(text + '\n')
}

export function parseFixture(name: string, options: ParseOptions = {}): ParsedFile {
  return parseLogBytes(fixture(name), name, { segment: { minLines: 3 }, ...options })
}

export function txns(file: ParsedFile): Transaction[] {
  return file.meta.groups.filter((g): g is Transaction => g.kind === 'txn')
}
