import { Component, useEffect, useState, type ReactNode } from 'react'
import { useStore, type Screen } from './store/useStore'
import { GetLogsScreen } from './ui/getlogs/GetLogsScreen'
import { ReadLogsScreen } from './ui/read/ReadLogsScreen'
import { OverviewScreen } from './ui/overview/OverviewScreen'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="error-box">
          <h2>Something went wrong</h2>
          <pre>{this.state.error.message}</pre>
          <button onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      )
    }
    return this.props.children
  }
}

const TABS: { id: Screen; label: string }[] = [
  { id: 'get', label: 'Get logs' },
  { id: 'read', label: 'Read logs' },
  { id: 'overview', label: 'Overview' },
]

export function App() {
  const screen = useStore((s) => s.screen)
  const setScreen = useStore((s) => s.setScreen)
  const files = useStore((s) => s.files)
  const removeFile = useStore((s) => s.removeFile)
  const select = useStore((s) => s.select)
  const selection = useStore((s) => s.selection)
  const addLocalFiles = useStore((s) => s.addLocalFiles)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const onLeave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      depth = 0
      setDragging(false)
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer?.files.length) void addLocalFiles(e.dataTransfer.files)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [addLocalFiles])
  const loading = files.filter((f) => f.status === 'loading')
  const unparsed = files.filter((f) => f.status === 'ready' && (f.meta?.unparsedLines ?? 0) > 0)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" title="Everything stays in your browser; no log content is sent anywhere.">
          WPay Log Viewer
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={screen === t.id ? 'tab active' : 'tab'} onClick={() => setScreen(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="file-chips">
          {files.map((f) => (
            <span key={f.id} className={`chip ${f.status} ${selection?.fileId === f.id ? 'current' : ''}`} title={f.error ?? f.name}>
              <button
                className="chip-name"
                onClick={() => {
                  if (f.status === 'ready') {
                    select({ fileId: f.id, scope: { kind: 'app' } })
                    setScreen('read')
                  }
                }}
              >
                {f.name.length > 42 ? '…' + f.name.slice(-40) : f.name}
              </button>
              {f.status === 'loading' && <span className="chip-progress">{f.phase} {f.progress !== undefined && f.phase === 'tokenize' ? `${Math.round(f.progress * 100)}%` : ''}</span>}
              {f.status === 'error' && <span className="chip-error">error</span>}
              <button className="chip-close" title="Remove" onClick={() => removeFile(f.id)}>
                ×
              </button>
            </span>
          ))}
        </div>
      </header>
      {loading.length > 0 && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${Math.round((loading[0].progress ?? 0) * 100)}%` }} />
        </div>
      )}
      {unparsed.length > 0 && (
        <div className="banner">
          {unparsed.map((f) => (
            <span key={f.id}>
              {f.name}: {f.meta!.unparsedLines} line(s) did not match the logcat format and are shown unparsed.{' '}
            </span>
          ))}
        </div>
      )}
      {dragging && <div className="drop-overlay">Drop to load the file{files.length ? ' alongside the loaded ones' : ''}</div>}
      <main className="screen">
        <ErrorBoundary>
          {screen === 'get' && <GetLogsScreen />}
          {screen === 'read' && <ReadLogsScreen />}
          {screen === 'overview' && <OverviewScreen />}
        </ErrorBoundary>
      </main>
    </div>
  )
}
