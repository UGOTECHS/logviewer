import { describe, expect, it } from 'vitest'
import { tokenize } from '../tokenizer'
import { Flag } from '../types'
import { lineMessage, lineText } from '../lineText'

const enc = (s: string) => new TextEncoder().encode(s)

describe('tokenizer', () => {
  it('parses the logcat prefix of each line shape', () => {
    const text = [
      '[2026-10-22 11:00:23].931 W/XWARN   ( 4616): vQA_1.3.25.7 ShellClient.cs:208 [FBTRACE] ShellClient: transaction start | merchant=1',
      '[2026-10-22 10:53:23].552 W/LOGF    ( 4616): |..\\Gateway.c:462 | LoadGatewayLibrary ----',
      '[2026-10-22 11:00:25].767 W/PAYMENTAPP_DIALOG( 4616): CloudBanking.ShellUI.RequestCardDialog',
      '[2026-10-22 10:53:07].773 E/MPUSH - ( 2368): heartbeat timeout times=2',
    ].join('\n')
    const bytes = enc(text)
    const { cols, strings, unparsedLines } = tokenize(bytes)
    expect(cols.count).toBe(4)
    expect(unparsedLines).toBe(0)
    expect(cols.ts[0]).toBe(Date.UTC(2026, 9, 22, 11, 0, 23, 931))
    expect(cols.level[0]).toBe(3)
    expect(cols.level[3]).toBe(4)
    expect(strings.tags[cols.tagId[0]]).toBe('XWARN')
    expect(strings.tags[cols.tagId[2]]).toBe('PAYMENTAPP_DIALOG')
    expect(strings.tags[cols.tagId[3]]).toBe('MPUSH -')
    expect(cols.pid[0]).toBe(4616)
    expect(cols.pid[3]).toBe(2368)
    expect(lineMessage(bytes, cols, 1)).toBe('|..\\Gateway.c:462 | LoadGatewayLibrary ----')
    expect(lineText(bytes, cols, 2)).toBe(text.split('\n')[2])
  })

  it('keeps unparsable and tab-flattened lines and tolerates CRLF and a missing final newline', () => {
    const text = '[2026-10-22 11:00:23].931 W/XINFOR  ( 4616): vQA_1 A.cs:1 line one\tline two\r\ngarbage without prefix\r\n[2026-10-22 11:00:24].000 E/XERROR  ( 4616): vQA_1 B.cs:2 end'
    const bytes = enc(text)
    const { cols, unparsedLines } = tokenize(bytes)
    expect(cols.count).toBe(3)
    expect(unparsedLines).toBe(1)
    expect(cols.flags[0] & Flag.TabFlattened).toBeTruthy()
    expect(cols.flags[1] & Flag.Unparsed).toBeTruthy()
    expect(cols.ts[1]).toBe(cols.ts[0])
    expect(lineText(bytes, cols, 1)).toBe('garbage without prefix')
    expect(lineMessage(bytes, cols, 2)).toBe('vQA_1 B.cs:2 end')
  })

  it('handles a very long line', () => {
    const long = '[2026-10-22 11:00:23].931 W/LOGF    ( 4616): |..\\X.cpp:1 | ' + 'x'.repeat(4100)
    const { cols } = tokenize(enc(long))
    expect(cols.lineLen[0]).toBe(long.length)
  })
})
