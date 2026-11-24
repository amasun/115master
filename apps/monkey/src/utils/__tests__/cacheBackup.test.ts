import type { MarkerDoc } from '@/utils/markers/types'
import type { VideoIndexSnapshot } from '@/utils/superSearch/types'
import { describe, expect, it, vi } from 'vitest'

vi.mock('$', () => ({
  GM_getValue: vi.fn(() => ({})),
  GM_setValue: vi.fn(),
}))

vi.mock('@/utils/request/gmRequest', () => ({
  GMRequest: class {},
}))

vi.mock('@/utils/driveFolderPath', () => ({
  folderPathResolver: {
    reloadFromStorage: vi.fn(),
  },
}))

vi.mock('@/utils/mediaIndex/actorProfileFetcher', () => ({
  actorProfileCache: {
    storage: { iterate: vi.fn() },
    get: vi.fn(),
    set: vi.fn(),
  },
}))

const {
  CACHE_BACKUP_SCHEMA_VERSION,
  mergeMarkerDocs,
  mergeVideoIndexSnapshots,
  parseCacheBackup,
  summarizeCacheBackup,
} = await import('../cacheBackup')

function makeSnapshot(partial: Partial<VideoIndexSnapshot> = {}): VideoIndexSnapshot {
  return {
    schemaVersion: 1,
    rootCids: ['0'],
    lastFullSyncAt: 1000,
    lastSyncAt: 1000,
    items: [],
    ...partial,
  }
}

describe('cacheBackup', () => {
  it('parseCacheBackup validates JSON, schemaVersion, and data object', () => {
    expect(() => parseCacheBackup('not-json')).toThrow('备份文件不是有效的 JSON 格式')
    expect(() => parseCacheBackup(JSON.stringify({ schemaVersion: 99, data: {} }))).toThrow('不支持的备份版本')
    expect(() => parseCacheBackup(JSON.stringify({ schemaVersion: 1 }))).toThrow('缺少 data 字段')

    const payload = parseCacheBackup(JSON.stringify({
      schemaVersion: CACHE_BACKUP_SCHEMA_VERSION,
      exportedAt: 12345,
      data: {
        videoIndex: makeSnapshot({ items: [{ fid: '1', cid: '0', pickCode: 'pc1', name: 'SSIS-001.mp4', avNumber: 'SSIS-001', size: 10, duration: 100, mtime: 500 }] }),
        javMeta: { 'SSIS-001': { avNumber: 'SSIS-001', title: 'Test' } },
      },
    }))

    expect(summarizeCacheBackup(payload)).toEqual({
      videoCount: 1,
      javMetaCount: 1,
      actorWorksCount: 0,
      actorProfileCount: 0,
      markerDocCount: 0,
      folderPathCount: 0,
      hasUserSettings: false,
      libraryPrefCount: 0,
    })
  })

  it('mergeVideoIndexSnapshots unions items and prefers newer snapshot on fid conflict', () => {
    const local = makeSnapshot({
      rootCids: ['0'],
      lastFullSyncAt: 1000,
      lastSyncAt: 1500,
      items: [
        { fid: '1', cid: '0', pickCode: 'pc1', name: 'OLD.mp4', avNumber: null, size: 100, duration: 60, mtime: 100 },
        { fid: '2', cid: '0', pickCode: 'pc2', name: 'LOCAL.mp4', avNumber: null, size: 200, duration: 60, mtime: 300 },
      ],
    })
    const incoming = makeSnapshot({
      rootCids: ['0', '99'],
      lastFullSyncAt: 1200,
      lastSyncAt: 2000,
      items: [
        { fid: '1', cid: '0', pickCode: 'pc1', name: 'NEW.mp4', avNumber: null, size: 100, duration: 60, mtime: 400 },
        { fid: '3', cid: '99', pickCode: 'pc3', name: 'INCOMING.mp4', avNumber: null, size: 300, duration: 60, mtime: 200 },
      ],
    })

    const merged = mergeVideoIndexSnapshots(local, incoming, 'merge')
    expect(merged.rootCids).toEqual(['0', '99'])
    expect(merged.lastSyncAt).toBe(2000)
    expect(merged.items.map(i => `${i.fid}:${i.name}`)).toEqual([
      '1:NEW.mp4',
      '2:LOCAL.mp4',
      '3:INCOMING.mp4',
    ])
  })

  it('mergeMarkerDocs merges markers by id and keeps newer updatedAt', () => {
    const local: MarkerDoc = {
      v: 1,
      pickCode: 'pc1',
      fileId: 'f1',
      fileName: 'SSIS-001.mp4',
      duration: 3600,
      updatedAt: 1000,
      markers: [
        { id: 'm1', time: 10, label: 'old', createdAt: 500, updatedAt: 500 },
        { id: 'm2', time: 20, label: 'local-only', createdAt: 600, updatedAt: 600 },
      ],
    }
    const incoming: MarkerDoc = {
      v: 1,
      pickCode: 'pc1',
      fileId: 'f1',
      fileName: 'SSIS-001.mp4',
      duration: 3600,
      updatedAt: 2000,
      markers: [
        { id: 'm1', time: 10, label: 'updated', createdAt: 500, updatedAt: 1500 },
        { id: 'm3', time: 30, label: 'incoming-only', createdAt: 700, updatedAt: 700 },
      ],
    }

    const merged = mergeMarkerDocs(local, incoming, 'merge')
    expect(merged.updatedAt).toBe(2000)
    expect(merged.markers.map(m => `${m.id}:${m.label}`)).toEqual([
      'm1:updated',
      'm2:local-only',
      'm3:incoming-only',
    ])
  })
})
