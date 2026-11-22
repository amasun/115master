import type { JavInfo } from '@/utils/jav/jav'
import { describe, expect, it, vi } from 'vitest'

const { iterateMock } = vi.hoisted(() => ({
  iterateMock: vi.fn(),
}))

vi.mock('@/utils/logger', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    sub: () => logger,
  }
  return { appLogger: logger }
})
vi.mock('@/utils/request/gmRequest', () => ({
  GMRequest: class {},
}))
vi.mock('@/utils/cache/javCache', () => ({
  javCache: {
    get: vi.fn(),
    set: vi.fn(),
    storage: {
      iterate: iterateMock,
    },
  },
}))
vi.mock('../videoIndexStore', () => ({
  posterThumbCache: { get: vi.fn(), set: vi.fn() },
  videoIndexStore: { getSnapshot: vi.fn(), saveSnapshot: vi.fn() },
  requestPersistentStorage: vi.fn(),
}))

const { JAV_SOURCE } = await import('@/utils/jav/jav')
const { getCoverCandidates, javInfoToUnifiedMeta, readAllCachedJavMeta } = await import('../scraperRegistry')

describe('scraperRegistry', () => {
  it('正确将 JavInfo 转换为 UnifiedMediaMeta 并保留剧照与封面候选', () => {
    const info: JavInfo = {
      source: JAV_SOURCE.JAVLIBRARY,
      baseUrl: 'https://javlibrary.example',
      detailUrl: 'https://javlibrary.example/v/ssis001',
      searchUrl: 'https://javlibrary.example/search/SSIS-001',
      avNumber: 'ssis-001',
      title: '测试影片标题',
      date: Date.UTC(2024, 4, 15),
      duration: 120,
      score: 4.5,
      director: [{ name: '导演A' }],
      actors: [
        { name: '演员甲', face: 'https://img.example/a.jpg', url: 'https://javlibrary.example/star/a' },
      ],
      category: [{ name: '单人作品' }, { name: '4K' }],
      cover: { url: 'https://img.example/cover.jpg', referer: 'https://javlibrary.example/' },
      coverSingle: { url: 'https://img.example/cover-single.jpg' },
      coverFallbacks: [
        { url: 'https://img.example/cover.jpg', referer: 'https://javlibrary.example/' },
        { url: 'https://backup.example/cover.jpg', referer: 'https://javbus.example/' },
      ],
      preview: [
        { thumbnail: 'https://img.example/p1-thumb.jpg', raw: 'https://img.example/p1.jpg' },
        {},
      ],
    }

    const meta = javInfoToUnifiedMeta('SSIS-001', info, 123456)
    expect(meta.mediaKey).toBe('jav:SSIS001')
    expect(meta.externalId).toBe('SSIS-001')
    expect(meta.year).toBe(2024)
    expect(meta.releaseDate).toBe('2024-05-15')
    expect(meta.coverUrl).toBe('https://img.example/cover.jpg')
    expect(meta.previews).toEqual([
      { thumbnail: 'https://img.example/p1-thumb.jpg', raw: 'https://img.example/p1.jpg' },
    ])
    expect(meta.directors).toEqual(['导演A'])
    expect(meta.genres).toEqual(['单人作品', '4K'])
    expect(meta.actors).toEqual([
      {
        name: '演员甲',
        url: 'https://javlibrary.example/star/a',
        avatarUrl: 'https://img.example/a.jpg',
        avatarReferer: 'https://javlibrary.example/v/ssis001',
      },
    ])

    const candidates = getCoverCandidates(meta)
    expect(candidates).toHaveLength(3)
    expect(candidates[0]?.url).toBe('https://img.example/cover.jpg')
    expect(candidates[2]?.url).toBe('https://backup.example/cover.jpg')
  })

  it('读取本地 javCache 时优先采用 Fusion 融合缓存并过滤残缺数据', async () => {
    const entries: Array<[string, { value: JavInfo, updatedAt: number }]> = [
      [
        'JavDB:SSIS-001',
        {
          updatedAt: 100,
          value: {
            source: JAV_SOURCE.JAVDB,
            baseUrl: 'https://javdb.example',
            detailUrl: 'https://javdb.example/v/1',
            searchUrl: '',
            avNumber: 'SSIS-001',
            title: 'JavDB 标题',
            cover: { url: 'https://javdb.example/1.jpg' },
          },
        },
      ],
      [
        'Fusion:SSIS-001',
        {
          updatedAt: 200,
          value: {
            source: JAV_SOURCE.JAVLIBRARY,
            baseUrl: 'https://javlibrary.example',
            detailUrl: 'https://javlibrary.example/v/1',
            searchUrl: '',
            avNumber: 'SSIS-001',
            title: 'Fusion 融合标题',
            cover: { url: 'https://javlibrary.example/1.jpg' },
          },
        },
      ],
      [
        'JavBus:INVALID-001',
        {
          updatedAt: 300,
          value: {
            source: JAV_SOURCE.JAVBUS,
            baseUrl: 'https://javbus.example',
            detailUrl: '',
            searchUrl: '',
            avNumber: 'INVALID-001',
          },
        },
      ],
    ]

    iterateMock.mockImplementation(async (callback: (value: unknown, key: string) => void) => {
      entries.forEach(([key, val]) => callback(val, key))
    })

    const map = await readAllCachedJavMeta()
    expect(map.size).toBe(1)
    expect(map.get('jav:SSIS001')?.title).toBe('Fusion 融合标题')
    expect(map.get('jav:SSIS001')?.source).toBe('JavLibrary')
  })
})
