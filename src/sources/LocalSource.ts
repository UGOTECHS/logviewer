export interface SourceFile {
  name: string
  bytes: Uint8Array
}

export async function readLocalFiles(files: Iterable<File>): Promise<SourceFile[]> {
  const out: SourceFile[] = []
  for (const f of files) out.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })
  return out
}

/** Fetch a dump by URL (same origin, or a server that allows CORS). */
export async function readUrl(url: string): Promise<SourceFile> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} while loading ${url}`)
  const name = decodeURIComponent(new URL(url, location.href).pathname.split('/').pop() || 'remote.log')
  return { name, bytes: new Uint8Array(await res.arrayBuffer()) }
}
