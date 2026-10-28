import { useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { lineText } from '../../parser/lineText'
import { Family, Flag, LEVEL_CHARS } from '../../parser/types'
import { useStore } from '../../store/useStore'
import { fmtGap, fmtTime } from '../common/format'
import type { ReadyFile } from './ReadLogsScreen'
import { makeHighlighter } from './search'

const FAMILY_SHORT = ['', 'M', 'N', 'E', 'D', 'T', 'S', 'R', 'Y']
const FAMILY_TITLE = ['', 'managed (C#)', 'native (LOGF)', 'echo of a managed line', 'dialog shown', 'transaction step trace', 'PAX SDK', 'Android runtime', 'system line about this process']
const ROW = 22

export function LogTable({ file }: { file: ReadyFile }) {
  const view = useStore((s) => s.view)
  const selection = useStore((s) => s.selection)
  const filters = useStore((s) => s.filters)
  const selectedLine = useStore((s) => s.selectedLine)
  const selectLine = useStore((s) => s.selectLine)
  const scrollTo = useStore((s) => s.scrollTo)
  const clearScrollTo = useStore((s) => s.clearScrollTo)
  const parent = useRef<HTMLDivElement>(null)
  const lines = useMemo(() => (view.fileId === file.id ? view.lines : new Uint32Array(0)), [view.fileId, view.lines, file.id])
  const matchSet = useMemo(() => (view.matches ? new Set(view.matches) : null), [view.matches])
  const highlighter = useMemo(() => makeHighlighter(filters.text, filters.regex, filters.caseSensitive), [filters.text, filters.regex, filters.caseSensitive])
  const virtualizer = useVirtualizer({ count: lines.length, getScrollElement: () => parent.current, estimateSize: () => ROW, overscan: 30 })

  const { cols, bytes, meta } = file
  const relBase = useMemo(() => {
    if (!filters.relativeTime || !selection || selection.fileId !== file.id || selection.scope.kind !== 'group') return null
    const g = meta.groups[selection.scope.id]
    return g ? g.startTs : null
  }, [filters.relativeTime, selection, file.id, meta.groups])

  useEffect(() => {
    if (!scrollTo || scrollTo.fileId !== file.id || view.pending || view.fileId !== file.id || lines.length === 0) return
    let lo = 0
    let hi = lines.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (lines[mid] < scrollTo.line) lo = mid + 1
      else hi = mid
    }
    virtualizer.scrollToIndex(lo, { align: 'center' })
    clearScrollTo()
  }, [scrollTo, file.id, lines, virtualizer, view.pending, view.fileId, clearScrollTo])

  const items = virtualizer.getVirtualItems()
  return (
    <div className="logtable" ref={parent}>
      <div className="logtable-head">
        <span className="c-time">{relBase !== null ? 'time (relative)' : 'time'}</span>
        <span className="c-gap">Δt</span>
        <span className="c-lvl"></span>
        <span className="c-fam"></span>
        <span className="c-tag">tag</span>
        <span className="c-src">source</span>
        <span className="c-msg">message</span>
      </div>
      {lines.length === 0 ? (
        <div className="empty muted">{view.pending ? 'filtering…' : 'no lines match'}</div>
      ) : (
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {items.map((v) => {
            const i = lines[v.index]
            const prev = v.index > 0 ? lines[v.index - 1] : -1
            const ts = cols.ts[i]
            const gap = prev >= 0 ? ts - cols.ts[prev] : 0
            const newDay = relBase === null && (prev < 0 || Math.floor(ts / 86_400_000) !== Math.floor(cols.ts[prev] / 86_400_000))
            const text = lineText(bytes, cols, i)
            const fam = cols.family[i]
            const unparsed = cols.flags[i] & Flag.Unparsed
            const msg = unparsed ? text : text.slice(cols.payloadStart[i]).replace(/\t/g, ' ⏎ ')
            const src = cols.srcLine[i] > 0 ? `${meta.strings.srcFiles[cols.srcFileId[i]]}:${cols.srcLine[i]}` : ''
            const lvl = LEVEL_CHARS[cols.level[i]]
            const isMatch = matchSet ? matchSet.has(i) : false
            const parts = highlighter && (isMatch || !matchSet) ? highlighter(msg) : null
            return (
              <div
                key={v.key}
                className={`logrow lvl-${lvl} fam-${fam} ${selectedLine === i ? 'selected' : ''} ${gap > 2000 ? 'gap' : ''} ${cols.procId[i] < 0 ? 'foreign' : ''} ${isMatch ? 'match' : ''}`}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: ROW, transform: `translateY(${v.start}px)` }}
                onClick={() => selectLine(i)}
                onDoubleClick={() => void navigator.clipboard?.writeText(text)}
                title={`line ${i + 1} · pid ${cols.pid[i]}${cols.flags[i] & Flag.OutOfOrder ? ' · out of order' : ''} · double-click copies the line`}
              >
                <span className="c-time">
                  {relBase !== null ? (
                    <span className="rel">{`${ts - relBase < 0 ? '-' : '+'}${(Math.abs(ts - relBase) / 1000).toFixed(3)}s`}</span>
                  ) : (
                    <>
                      {newDay ? <span className="day">{new Date(ts).toISOString().slice(5, 10)} </span> : null}
                      {fmtTime(ts)}
                    </>
                  )}
                </span>
                <span className="c-gap">{fmtGap(gap)}</span>
                <span className={`c-lvl badge-${lvl}`}>{lvl}</span>
                <span className={`c-fam fam-badge fam-${fam}`} title={FAMILY_TITLE[fam]}>
                  {FAMILY_SHORT[fam]}
                </span>
                <span className="c-tag mono">{unparsed ? '' : meta.strings.tags[cols.tagId[i]]}</span>
                <span className="c-src mono">{src}</span>
                <span className={`c-msg ${fam === Family.Echo ? 'muted' : ''}`}>{parts ? parts.map((p, k) => (p.hit ? <mark key={k}>{p.text}</mark> : <span key={k}>{p.text}</span>)) : msg}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
