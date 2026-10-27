import { readFileSync } from 'node:fs'
import { parseLogBytes } from '../parseFile'
import type { ParseOptions, ParsedFile, Transaction } from '../types'

export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../__fixtures__/${name}`, import.meta.url)))
}

export function parseFixture(name: string, options: ParseOptions = {}): ParsedFile {
  return parseLogBytes(fixture(name), name, { segment: { minLines: 3 }, ...options })
}

export function txns(file: ParsedFile): Transaction[] {
  return file.meta.groups.filter((g): g is Transaction => g.kind === 'txn')
}
