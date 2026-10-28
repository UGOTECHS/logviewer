import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteError, RestRemoteSource } from '../RemoteSource'
import { authHeaders, downloadUrl, listUrl, toEntries } from '../remoteContract'

const settings = { baseUrl: 'https://logging.example.com', apiKey: 'key123', secretKey: 'sec456' }

describe('remote contract', () => {
  it('builds the list and download URLs from the Postman collection shape', () => {
    expect(listUrl('https://logging.example.com/', ' 0868324404 ')).toBe('https://logging.example.com/api/files/0868324404')
    expect(downloadUrl('https://logging.example.com', '90546932', { name: 'TERM_2026-10-27_log.zip' })).toBe('https://logging.example.com/api/files/90546932/TERM_2026-10-27_log.zip')
    expect(downloadUrl('https://logging.example.com', '1', { name: 'x.zip', url: '/dl/x.zip' })).toBe('https://logging.example.com/dl/x.zip')
  })

  it('sends the API key and the secret key headers', () => {
    expect(authHeaders(settings)).toEqual({ 'X-API-KEY': 'key123', 'X-SECRET-KEY': 'sec456' })
    expect(authHeaders({ apiKey: 'k', secretKey: 's', secretKeyHeader: 'X-API-SECRET' })).toEqual({ 'X-API-KEY': 'k', 'X-API-SECRET': 's' })
    expect(authHeaders({ apiKey: 'k' })).toEqual({ 'X-API-KEY': 'k' })
  })

  it('accepts several list response shapes', () => {
    expect(toEntries(['a.zip', 'dir/b.zip'])).toEqual([{ name: 'a.zip', url: undefined }, { name: 'b.zip', url: 'dir/b.zip' }])
    expect(toEntries({ files: [{ fileName: 'c.zip', fileSize: '12', lastModified: '2026-10-27T01:02:03Z' }] })).toEqual([{ name: 'c.zip', size: 12, uploadedAt: '2026-10-27T01:02:03Z', url: undefined }])
    expect(toEntries({ nope: 1 })).toEqual([])
  })
})

describe('RestRemoteSource', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists and downloads with the configured headers', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/files/123')) return new Response(JSON.stringify([{ name: 'b.zip', uploadedAt: '2026-01-02' }, { name: 'a.zip', uploadedAt: '2026-01-03' }]), { status: 200 })
      if (url.endsWith('/api/files/123/a.zip')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const src = new RestRemoteSource(settings)
    const list = await src.list('123')
    expect(list.map((e) => e.name)).toEqual(['a.zip', 'b.zip'])
    expect(fetchMock.mock.calls[0][0]).toBe('https://logging.example.com/api/files/123')
    expect((fetchMock.mock.calls[0] as unknown[])[1]).toEqual({ headers: { 'X-API-KEY': 'key123', 'X-SECRET-KEY': 'sec456' } })
    const bytes = await src.download('123', list[0])
    expect([...bytes]).toEqual([1, 2, 3])
  })

  it('explains auth failures and network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })))
    await expect(new RestRemoteSource(settings).list('1')).rejects.toThrow(/rejected the API key/)
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    const err = await new RestRemoteSource(settings).list('1').catch((e) => e as RemoteError)
    expect(err).toBeInstanceOf(RemoteError)
    expect((err as RemoteError).hint).toMatch(/Access-Control-Allow-Origin/)
  })
})
