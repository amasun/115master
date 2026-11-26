// @vitest-environment jsdom
import type { VideoIndexSnapshot } from '@/utils/superSearch/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, VideoIndexSnapshot>()

vi.mock('$', () => ({
  unsafeWindow: window,
}))

vi.mock('@/utils/superSearch/videoIndexStore', () => ({
  loadVideoIndexSnapshot: vi.fn(async () => storage.get('snapshot') ?? null),
  saveVideoIndexSnapshot: vi.fn(async (snap: VideoIndexSnapshot) => {
    storage.set('snapshot', snap)
  }),
}))

const {
  extractDeletedFidsFromRequestBody,
  installNativeDeleteCapture,
  isNativeDeleteRequest,
  NATIVE_DELETE_SYNC_STORAGE_KEY,
  removeFidsFromVideoIndex,
} = await import('../nativeDeleteSync')

describe('nativeDeleteSync', () => {
  beforeEach(() => {
    storage.clear()
    localStorage.clear()
  })

  it('recognizes 115 /rb/delete request URLs', () => {
    expect(isNativeDeleteRequest('https://webapi.115.com/rb/delete')).toBe(true)
    expect(isNativeDeleteRequest('/rb/delete?aid=1')).toBe(true)
    expect(isNativeDeleteRequest('https://webapi.115.com/files?cid=0')).toBe(false)
    expect(isNativeDeleteRequest('https://example.com/rb/delete')).toBe(false)
  })

  it('extracts deleted fids from URLSearchParams, form string, JSON, FormData, and query string', () => {
    const usp = new URLSearchParams({ 'pid': '10', 'fid[0]': 'f1', 'fid[1]': 'f2' })
    expect(extractDeletedFidsFromRequestBody(usp)).toEqual(['f1', 'f2'])

    expect(extractDeletedFidsFromRequestBody('pid=10&fid%5B0%5D=f3&fid%5B1%5D=f4,f5')).toEqual(['f3', 'f4', 'f5'])
    expect(extractDeletedFidsFromRequestBody(JSON.stringify({ fid: ['f6', 'f7'], pid: '0' }))).toEqual(['f6', 'f7'])

    const fd = new FormData()
    fd.append('fid[0]', 'f8')
    fd.append('fid[1]', 'f9')
    expect(extractDeletedFidsFromRequestBody(fd)).toEqual(['f8', 'f9'])

    expect(extractDeletedFidsFromRequestBody(undefined, 'https://webapi.115.com/rb/delete?fid=f10')).toEqual(['f10'])
  })

  it('removes deleted fids and children of deleted cids from snapshot and writes sync signal', async () => {
    storage.set('snapshot', {
      schemaVersion: 1,
      lastSyncAt: 1000,
      lastFullSyncAt: 1000,
      rootCids: ['0'],
      items: [
        { fid: 'f1', cid: 'c1', pickCode: 'p1', name: 'a.mp4', avNumber: 'SSIS-001', size: 10, duration: 10, mtime: 1 },
        { fid: 'f2', cid: 'c2', pickCode: 'p2', name: 'b.mp4', avNumber: 'SSIS-002', size: 10, duration: 10, mtime: 1 },
        { fid: 'f3', cid: 'c3', pickCode: 'p3', name: 'c.mp4', avNumber: 'SSIS-003', size: 10, duration: 10, mtime: 1 },
      ],
    })

    const removed = await removeFidsFromVideoIndex(['f1', 'c2'])
    expect(removed).toBe(2)
    expect(storage.get('snapshot')?.items.map(item => item.fid)).toEqual(['f3'])
    expect(localStorage.getItem(NATIVE_DELETE_SYNC_STORAGE_KEY)).toContain('f1')
  })

  it('intercepts successful fetch /rb/delete calls without altering the native response', async () => {
    storage.set('snapshot', {
      schemaVersion: 1,
      lastSyncAt: 1000,
      lastFullSyncAt: 1000,
      rootCids: ['0'],
      items: [
        { fid: 'f100', cid: 'c1', pickCode: 'p1', name: 'a.mp4', avNumber: 'ABP-100', size: 10, duration: 10, mtime: 1 },
        { fid: 'f200', cid: 'c1', pickCode: 'p2', name: 'b.mp4', avNumber: 'ABP-200', size: 10, duration: 10, mtime: 1 },
      ],
    })

    const mockWin = {
      fetch: vi.fn().mockImplementation(async (url: string) => {
        const ok = url.includes('ok=1')
        return new Response(JSON.stringify({ state: ok }), { status: 200 })
      }),
    } as unknown as Window & typeof globalThis

    installNativeDeleteCapture(mockWin)

    const failedRes = await mockWin.fetch('https://webapi.115.com/rb/delete?ok=0', {
      method: 'POST',
      body: new URLSearchParams({ 'fid[0]': 'f100' }),
    })
    expect(await failedRes.json()).toEqual({ state: false })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(storage.get('snapshot')?.items).toHaveLength(2)

    const okRes = await mockWin.fetch('https://webapi.115.com/rb/delete?ok=1', {
      method: 'POST',
      body: new URLSearchParams({ 'fid[0]': 'f100' }),
    })
    expect(await okRes.json()).toEqual({ state: true })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(storage.get('snapshot')?.items.map(item => item.fid)).toEqual(['f200'])
  })
})
