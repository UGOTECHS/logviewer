/** Timestamps are stored as the terminal's naive local clock in UTC epoch ms, so always format with UTC getters. */
export function fmtTime(ts: number, withMs = true): string {
  if (!ts) return '—'
  const iso = new Date(ts).toISOString()
  return withMs ? iso.slice(11, 23) : iso.slice(11, 19)
}

export function fmtDate(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toISOString().slice(0, 10)
}

export function fmtDateTime(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toISOString().slice(0, 19).replace('T', ' ')
}

export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`
  return `${Math.floor(ms / 3_600_000)} h ${Math.floor((ms % 3_600_000) / 60_000)} min`
}

export function fmtGap(ms: number): string {
  if (ms <= 0) return ''
  if (ms < 1000) return `+${ms}ms`
  if (ms < 60_000) return `+${(ms / 1000).toFixed(1)}s`
  return `+${fmtDuration(ms)}`
}

export function fmtAmount(minor: number | undefined): string {
  if (minor === undefined) return '—'
  return (minor / 100).toFixed(2)
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function fmtCount(n: number): string {
  return n.toLocaleString('en-US')
}
