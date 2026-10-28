import { lineText } from '../../parser/lineText'
import { FAMILY_NAMES, Flag, LEVEL_CHARS } from '../../parser/types'
import { useStore } from '../../store/useStore'
import { fmtDateTime } from '../common/format'
import type { ReadyFile } from './ReadLogsScreen'

export function LineDetail({ file }: { file: ReadyFile }) {
  const selectedLine = useStore((s) => s.selectedLine)
  const selectLine = useStore((s) => s.selectLine)
  const jumpTo = useStore((s) => s.jumpTo)
  const view = useStore((s) => s.view)
  if (selectedLine === null || view.fileId !== file.id) return null
  const { cols, bytes, meta } = file
  const i = selectedLine
  if (i >= cols.count) return null
  const text = lineText(bytes, cols, i)
  const proc = cols.procId[i] >= 0 ? meta.processes[cols.procId[i]] : null
  const group = cols.groupId[i] >= 0 ? meta.groups[cols.groupId[i]] : null
  const seg = meta.segments[cols.segId[i]]
  return (
    <div className="linedetail">
      <div className="linedetail-head">
        <span>
          line {(i + 1).toLocaleString('en-US')} · {fmtDateTime(cols.ts[i])} · {LEVEL_CHARS[cols.level[i]]}/{meta.strings.tags[cols.tagId[i]]} · pid {cols.pid[i]} · {FAMILY_NAMES[cols.family[i]]}
          {cols.flags[i] & Flag.OutOfOrder ? ' · out of order' : ''}
          {cols.flags[i] & Flag.Unparsed ? ' · unparsed' : ''}
        </span>
        <span className="spacer" />
        <span className="muted">show:</span>
        <button className="link" title="25 raw lines before and after, every process" onClick={() => jumpTo({ fileId: file.id, scope: { kind: 'around', line: i, context: 25 } }, i)}>
          ±25 lines
        </button>
        {group && (
          <button className="link" onClick={() => jumpTo({ fileId: file.id, scope: { kind: 'group', id: group.id } }, i)}>
            {group.kind === 'txn' ? 'transaction' : 'group'}
          </button>
        )}
        {proc && (
          <button className="link" onClick={() => jumpTo({ fileId: file.id, scope: { kind: 'proc', id: proc.id } }, i)}>
            process
          </button>
        )}
        {seg && (
          <button className="link" onClick={() => jumpTo({ fileId: file.id, scope: { kind: 'seg', id: seg.id } }, i)}>
            segment
          </button>
        )}
        <button className="link" onClick={() => jumpTo({ fileId: file.id, scope: { kind: 'raw' } }, i)}>
          raw file
        </button>
        <span className="muted">·</span>
        <button className="link" onClick={() => void navigator.clipboard?.writeText(text)}>
          copy
        </button>
        <button className="link" onClick={() => selectLine(null)} title="Esc">
          close
        </button>
      </div>
      <pre className="linedetail-body">{text.replace(/\t/g, '\n')}</pre>
    </div>
  )
}
