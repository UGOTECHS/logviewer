import { useStore, type LoadedFile } from '../../store/useStore'
import { Sidebar } from './Sidebar'
import { FilterBar } from './FilterBar'
import { LogTable } from './LogTable'
import { LineDetail } from './LineDetail'
import { ContextPanel } from './ContextPanel'
import { ScopeBar } from './ScopeBar'
import { DropZone } from '../getlogs/GetLogsScreen'

export function ReadLogsScreen() {
  const files = useStore((s) => s.files)
  const selection = useStore((s) => s.selection)
  const setScreen = useStore((s) => s.setScreen)
  const ready = files.filter((f): f is LoadedFile & { meta: NonNullable<LoadedFile['meta']>; cols: NonNullable<LoadedFile['cols']>; bytes: NonNullable<LoadedFile['bytes']> } => f.status === 'ready' && !!f.meta && !!f.cols && !!f.bytes)
  const file = ready.find((f) => f.id === selection?.fileId) ?? ready[0]
  if (!file) {
    return (
      <div className="empty">
        <DropZone />
        <p>
          …or <button className="link" onClick={() => setScreen('get')}>fetch one from the log server</button>
        </p>
      </div>
    )
  }
  return (
    <div className="read-screen">
      <Sidebar files={ready} />
      <div className="center">
        <ScopeBar file={file} />
        <FilterBar file={file} />
        <LogTable file={file} />
        <LineDetail file={file} />
      </div>
      <aside className="side">
        <ContextPanel file={file} />
      </aside>
    </div>
  )
}

export type ReadyFile = LoadedFile & { meta: NonNullable<LoadedFile['meta']>; cols: NonNullable<LoadedFile['cols']>; bytes: NonNullable<LoadedFile['bytes']> }
