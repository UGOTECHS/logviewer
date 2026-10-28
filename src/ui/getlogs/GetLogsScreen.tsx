import { useRef, useState, type DragEvent } from 'react'
import { useStore } from '../../store/useStore'
import { activeServer, newServerId, type ServerProfile } from '../../store/settings'
import { PackagePicker } from '../common/PackagePicker'
import { fmtBytes, fmtCount, fmtDateTime } from '../common/format'

export function GetLogsScreen() {
  const files = useStore((s) => s.files)
  return (
    <div className="get-screen">
      <section className="card">
        <h2>Local file</h2>
        <DropZone />
        <UrlLoader />
      </section>
      <section className="card">
        <h2>Terminal log server</h2>
        <RemotePanel />
      </section>
      {files.length > 0 && (
        <section className="card wide">
          <h2>Loaded files</h2>
          <FileList />
        </section>
      )}
      <p className="privacy">Everything runs in your browser. Log contents never leave this page; the only network calls are the ones you trigger on this screen.</p>
    </div>
  )
}

export function DropZone() {
  const addLocalFiles = useStore((s) => s.addLocalFiles)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOver(false)
    if (e.dataTransfer.files.length) void addLocalFiles(e.dataTransfer.files)
  }
  return (
    <div
      className={over ? 'dropzone over' : 'dropzone'}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onClick={() => input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
    >
      <strong>Drop a logcat dump here, or click to choose</strong>
      <span>
        .zip as uploaded by the terminal (<code>{'{serial}_{date}.zip'}</code>), or the raw .txt / .log. Several files at once are fine. You can also drop files anywhere in the app.
      </span>
      <input
        ref={input}
        type="file"
        multiple
        accept=".zip,.txt,.log,application/zip,text/plain"
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void addLocalFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function UrlLoader() {
  const loadUrl = useStore((s) => s.loadUrl)
  const [url, setUrl] = useState('')
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault()
        if (url.trim()) void loadUrl(url.trim())
      }}
    >
      <input type="url" placeholder="…or a URL of a .zip / .txt (same origin or CORS-enabled)" value={url} onChange={(e) => setUrl(e.target.value)} />
      <button type="submit" disabled={!url.trim()}>
        Load URL
      </button>
    </form>
  )
}

function RemotePanel() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const remote = useStore((s) => s.remote)
  const remoteList = useStore((s) => s.remoteList)
  const remoteDownload = useStore((s) => s.remoteDownload)
  const r = settings.remote
  const srv = activeServer(settings)
  const setRemote = (patch: Partial<typeof r>) => updateSettings((s) => ({ ...s, remote: { ...s.remote, ...patch } }))
  const setServer = (patch: Partial<ServerProfile>) => updateSettings((s) => ({ ...s, remote: { ...s.remote, servers: s.remote.servers.map((x) => (x.id === srv.id ? { ...x, ...patch } : x)) } }))
  const addServer = () => {
    const id = newServerId()
    updateSettings((s) => ({ ...s, remote: { ...s.remote, serverId: id, servers: [...s.remote.servers, { id, name: `Server ${s.remote.servers.length + 1}`, baseUrl: '', apiKeyHeader: 'API-KEY', secretKeyHeader: 'API-SECRET', apiKey: '', secretKey: '' }] } }))
    setAdvanced(true)
  }
  const removeServer = () => {
    if (r.servers.length <= 1) return
    updateSettings((s) => {
      const servers = s.remote.servers.filter((x) => x.id !== srv.id)
      return { ...s, remote: { ...s.remote, servers, serverId: servers[0].id } }
    })
  }
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [advanced, setAdvanced] = useState(false)
  const canList = !!r.serial.trim() && !!srv.baseUrl && !!srv.apiKey

  return (
    <div className="remote">
      <form
        className="remote-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (canList) void remoteList()
        }}
      >
        <label>
          Server
          <select value={srv.id} onChange={(e) => setRemote({ serverId: e.target.value })}>
            {r.servers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Terminal serial (S/N)
          <input value={r.serial} onChange={(e) => setRemote({ serial: e.target.value })} placeholder="e.g. 0868324404" autoComplete="off" />
        </label>
        <label>
          {srv.apiKeyHeader || 'API key'}
          <input type="password" value={srv.apiKey} onChange={(e) => setServer({ apiKey: e.target.value })} autoComplete="off" placeholder="API key" />
        </label>
        <label>
          {srv.secretKeyHeader || 'Secret key'}
          <input type="password" value={srv.secretKey} onChange={(e) => setServer({ secretKey: e.target.value })} autoComplete="off" placeholder="secret key (if required)" />
        </label>
        <button type="submit" className="primary" disabled={remote.busy || !canList} title={canList ? 'List the dumps uploaded by this terminal' : 'Enter the serial, the server URL and the API key first'}>
          {remote.busy ? 'Working…' : 'List files'}
        </button>
      </form>
      <div className="row compact">
        <label className="inline">
          <input type="checkbox" checked={r.rememberKeys} onChange={(e) => setRemote({ rememberKeys: e.target.checked })} /> remember the keys on this device
        </label>
        <label className="inline">
          From <input type="date" value={r.from} onChange={(e) => setRemote({ from: e.target.value })} />
        </label>
        <label className="inline">
          To <input type="date" value={r.to} onChange={(e) => setRemote({ to: e.target.value })} />
        </label>
        <button className="link" onClick={() => setAdvanced(!advanced)}>
          {advanced ? 'hide server settings' : 'server settings'}
        </button>
      </div>
      {advanced && (
        <div className="server-settings">
          <div className="row compact">
            <label>
              Name
              <input value={srv.name} onChange={(e) => setServer({ name: e.target.value })} />
            </label>
            <label className="grow">
              Base URL
              <input value={srv.baseUrl} onChange={(e) => setServer({ baseUrl: e.target.value })} placeholder="https://logging.example.com/" />
            </label>
            <label>
              API key header
              <input value={srv.apiKeyHeader} onChange={(e) => setServer({ apiKeyHeader: e.target.value })} />
            </label>
            <label>
              Secret key header
              <input value={srv.secretKeyHeader} onChange={(e) => setServer({ secretKeyHeader: e.target.value })} />
            </label>
          </div>
          <div className="row compact">
            <button onClick={addServer}>Add server</button>
            <button onClick={removeServer} disabled={r.servers.length <= 1}>
              Remove this server
            </button>
            <span className="muted small">
              Requests: <code>GET {srv.baseUrl || '{base}'}api/files/{'{serial}'}</code> and <code>…/{'{serial}'}/{'{file}'}</code> with the two headers above.
            </span>
          </div>
        </div>
      )}
      {remote.error && (
        <div className="error-box">
          <div>{remote.error}</div>
          {remote.hint && <div className="hint">{remote.hint}</div>}
        </div>
      )}
      {remote.entries.length > 0 && (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={checked.size === remote.entries.length} onChange={(e) => setChecked(e.target.checked ? new Set(remote.entries.map((x) => x.name)) : new Set())} />
                </th>
                <th>File</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {remote.entries.map((e) => (
                <tr key={e.name}>
                  <td>
                    <input
                      type="checkbox"
                      checked={checked.has(e.name)}
                      onChange={(ev) => {
                        const next = new Set(checked)
                        if (ev.target.checked) next.add(e.name)
                        else next.delete(e.name)
                        setChecked(next)
                      }}
                    />
                  </td>
                  <td className="mono">{e.name}</td>
                  <td>{e.size !== undefined ? fmtBytes(e.size) : '—'}</td>
                  <td>{e.uploadedAt ?? '—'}</td>
                  <td>
                    <button onClick={() => void remoteDownload([e])} disabled={remote.busy}>
                      Load
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {checked.size > 0 && (
            <button onClick={() => void remoteDownload(remote.entries.filter((e) => checked.has(e.name)))} disabled={remote.busy}>
              Load {checked.size} selected
            </button>
          )}
        </>
      )}
      {remote.entries.length === 0 && !remote.error && !remote.busy && <p className="muted small">Enter the terminal serial and your keys, then list the dumps the terminal uploaded and load one. Keys stay in this browser.</p>}
    </div>
  )
}

function FileList() {
  const files = useStore((s) => s.files)
  const removeFile = useStore((s) => s.removeFile)
  const select = useStore((s) => s.select)
  const setScreen = useStore((s) => s.setScreen)
  return (
    <div className="file-list">
      {files.map((f) => (
        <div key={f.id} className={`file-item ${f.status}`}>
          <div className="file-head">
            <strong className="mono">{f.name}</strong>
            {f.status === 'loading' && (
              <span className="muted">
                {f.phase} {f.progress !== undefined ? `${Math.round(f.progress * 100)}%` : ''}
              </span>
            )}
            {f.status === 'error' && <span className="chip-error">{f.error}</span>}
            {f.status === 'ready' && f.meta && (
              <span className="muted">
                {fmtBytes(f.meta.byteLength)} · {fmtCount(f.meta.lineCount)} lines · {fmtDateTime(f.meta.firstTs)} → {fmtDateTime(f.meta.lastTs)} · {f.meta.segments.length} boot segments · {f.meta.processes.length} app processes · {f.meta.incidents.filter((i) => f.meta!.selectedPackages.includes(i.pkg) && i.kind === 'fatal-exception').length} app crashes
                {f.meta.serial && ` · serial ${f.meta.serial}`}
              </span>
            )}
            <span className="spacer" />
            {f.status === 'ready' && (
              <>
                <button
                  onClick={() => {
                    select({ fileId: f.id, scope: { kind: 'app' } })
                    setScreen('overview')
                  }}
                >
                  Overview
                </button>
                <button
                  onClick={() => {
                    select({ fileId: f.id, scope: { kind: 'app' } })
                    setScreen('read')
                  }}
                >
                  Read
                </button>
              </>
            )}
            <button onClick={() => removeFile(f.id)}>Remove</button>
          </div>
          {f.status === 'ready' && f.meta && <PackagePicker fileId={f.id} meta={f.meta} />}
        </div>
      ))}
    </div>
  )
}
