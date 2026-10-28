import { useEffect, useRef, useState } from 'react'
import { FAMILY_NAMES, Family, LEVEL_CHARS } from '../../parser/types'
import { useStore } from '../../store/useStore'
import { fmtCount } from '../common/format'
import type { ReadyFile } from './ReadLogsScreen'

const FAMILY_CHIPS: { id: number; label: string }[] = [
  { id: Family.Managed, label: 'managed' },
  { id: Family.Native, label: 'native' },
  { id: Family.Dialog, label: 'dialog' },
  { id: Family.StepTrace, label: 'step trace' },
  { id: Family.Sdk, label: 'sdk' },
]

function matchPosition(matches: Uint32Array | null, line: number | null): number {
  if (!matches || line === null) return 0
  let lo = 0
  let hi = matches.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (matches[mid] < line) lo = mid + 1
    else hi = mid
  }
  return lo < matches.length && matches[lo] === line ? lo + 1 : 0
}

export function FilterBar({ file }: { file: ReadyFile }) {
  const filters = useStore((s) => s.filters)
  const setFilters = useStore((s) => s.setFilters)
  const view = useStore((s) => s.view)
  const selection = useStore((s) => s.selection)
  const selectedLine = useStore((s) => s.selectedLine)
  const selectLine = useStore((s) => s.selectLine)
  const nextMatch = useStore((s) => s.nextMatch)
  const exportVisible = useStore((s) => s.exportVisible)
  const [text, setText] = useState(filters.text)
  const [tagsOpen, setTagsOpen] = useState(false)
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      if (text !== filters.text) setFilters({ text })
    }, 200)
    return () => clearTimeout(t)
  }, [text, filters.text, setFilters])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      const typing = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT'
      if (e.key === '/' && !typing) {
        e.preventDefault()
        search.current?.focus()
      } else if (e.key === 'Escape') {
        if (el === search.current) search.current?.blur()
        else if (!typing) selectLine(null)
      } else if (!typing && filters.searchMode === 'highlight' && (e.key === 'n' || e.key === 'p')) {
        e.preventDefault()
        nextMatch(e.key === 'n' ? 1 : -1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filters.searchMode, nextMatch, selectLine])

  const levels = LEVEL_CHARS.map((c, i) => ({ c, i, n: file.meta.stats.byLevel[i] })).filter((l) => l.n > 0)
  const sc = selection?.scope.kind
  const isIncidents = sc === 'incidents' || sc === 'incident'
  const isRawContext = sc === 'raw' || sc === 'seg' || sc === 'around' || isIncidents
  const tagIds = new Set(filters.tagIds)
  const topTags = file.meta.stats.byTag.slice(0, 60)
  const highlight = filters.searchMode === 'highlight'
  const pos = matchPosition(view.matches, selectedLine)

  return (
    <div className="filterbar">
      <div className="filter-group search">
        <input
          ref={search}
          placeholder="search…  ( / to focus )"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && highlight) nextMatch(e.shiftKey ? -1 : 1)
          }}
        />
        {text && (
          <button className="clear" title="Clear search" onClick={() => setText('')}>
            ×
          </button>
        )}
        <span className="seg" title="filter: only matching lines · highlight: all lines, matches marked">
          <button className={!highlight ? 'on' : ''} onClick={() => setFilters({ searchMode: 'filter' })}>
            filter
          </button>
          <button className={highlight ? 'on' : ''} onClick={() => setFilters({ searchMode: 'highlight' })}>
            highlight
          </button>
        </span>
        {highlight && filters.text && (
          <span className="matchnav">
            <button onClick={() => nextMatch(-1)} title="previous match (p)" disabled={!view.matches?.length}>
              ↑
            </button>
            <button onClick={() => nextMatch(1)} title="next match (n)" disabled={!view.matches?.length}>
              ↓
            </button>
            <span className="muted">
              {pos ? `${fmtCount(pos)} / ` : ''}
              {fmtCount(view.matches?.length ?? 0)} match{(view.matches?.length ?? 0) === 1 ? '' : 'es'}
            </span>
          </span>
        )}
        <label className="switch" title="Regular expression">
          <input type="checkbox" checked={filters.regex} onChange={(e) => setFilters({ regex: e.target.checked })} /> .*
        </label>
        <label className="switch" title="Case sensitive">
          <input type="checkbox" checked={filters.caseSensitive} onChange={(e) => setFilters({ caseSensitive: e.target.checked })} /> Aa
        </label>
      </div>
      <div className="filter-group" title="Levels">
        {levels.map((l) => (
          <button key={l.c} className={(filters.levels >> l.i) & 1 ? `lvl lvl-${l.c} on` : `lvl lvl-${l.c}`} onClick={() => setFilters({ levels: filters.levels ^ (1 << l.i) })} title={`${fmtCount(l.n)} lines`}>
            {l.c}
          </button>
        ))}
      </div>
      {!isRawContext && (
        <div className="filter-group" title="Line families (app lines only)">
          {FAMILY_CHIPS.map((f) => (
            <button key={f.id} className={(filters.families >> f.id) & 1 ? `chipbtn fam-${f.id} on` : `chipbtn fam-${f.id}`} onClick={() => setFilters({ families: filters.families ^ (1 << f.id) })} title={FAMILY_NAMES[f.id]}>
              {f.label}
            </button>
          ))}
          <label className="switch" title="Native lines that merely echo a managed line to the POS">
            <input type="checkbox" checked={filters.hideEcho} onChange={(e) => setFilters({ hideEcho: e.target.checked })} /> hide echo
          </label>
          <label className="switch" title="ART / SELinux / crash output of the app's pid">
            <input type="checkbox" checked={filters.showRuntime} onChange={(e) => setFilters({ showRuntime: e.target.checked })} /> runtime
          </label>
          <label className="switch" title="ActivityManager and lowmemorykiller lines about the app">
            <input type="checkbox" checked={filters.showSystem} onChange={(e) => setFilters({ showSystem: e.target.checked })} /> system
          </label>
        </div>
      )}
      <div className="filter-group tags">
        <button className={tagIds.size ? 'chipbtn on' : 'chipbtn'} onClick={() => setTagsOpen(!tagsOpen)}>
          tags{tagIds.size ? ` (${tagIds.size})` : ''}
        </button>
        {tagsOpen && (
          <div className="popover">
            <div className="popover-head">
              <span>Show only these tags</span>
              <button className="link" onClick={() => setFilters({ tagIds: [] })}>
                clear
              </button>
              <button className="link" onClick={() => setTagsOpen(false)}>
                close
              </button>
            </div>
            <div className="popover-body">
              {topTags.map(([tag, n]) => {
                const id = file.meta.strings.tags.indexOf(tag)
                return (
                  <label key={tag}>
                    <input
                      type="checkbox"
                      checked={tagIds.has(id)}
                      onChange={(e) => {
                        const next = new Set(tagIds)
                        if (e.target.checked) next.add(id)
                        else next.delete(id)
                        setFilters({ tagIds: [...next] })
                      }}
                    />
                    <span className="mono">{tag}</span> <span className="muted">{fmtCount(n)}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </div>
      {isIncidents && (
        <div className="filter-group" title="Incident categories">
          {(['crash', 'kill', 'managed', 'java'] as const).map((c) => (
            <button
              key={c}
              className={filters.incidentCategories.includes(c) ? 'chipbtn on' : 'chipbtn'}
              onClick={() => setFilters({ incidentCategories: filters.incidentCategories.includes(c) ? filters.incidentCategories.filter((x) => x !== c) : [...filters.incidentCategories, c] })}
            >
              {c === 'crash' ? 'crashes' : c === 'kill' ? 'kills & deaths' : c === 'managed' ? 'managed exceptions' : 'java/sdk exceptions'}
            </button>
          ))}
          <label className="switch">
            <input type="checkbox" checked={filters.selectedPackagesOnly} onChange={(e) => setFilters({ selectedPackagesOnly: e.target.checked })} /> selected packages only
          </label>
        </div>
      )}
      <div className="filter-group right">
        <span className="muted">{view.pending ? 'filtering…' : `${fmtCount(view.lines.length)} lines`}</span>
        <button onClick={() => void exportVisible()} disabled={view.lines.length === 0} title="Download the visible lines as text">
          Export lines
        </button>
      </div>
    </div>
  )
}
