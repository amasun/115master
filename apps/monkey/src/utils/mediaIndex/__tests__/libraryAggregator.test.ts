import type { IndexedVideo, LibraryFilterState, UnifiedMediaMeta } from '../types'
import type { MarkerDoc } from '@/utils/markers/types'
import type { ActorWorksCacheEntry } from '@/utils/superSearch'
import { describe, expect, it, vi } from 'vitest'

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
  javCache: { get: vi.fn(), set: vi.fn() },
}))

const { aggregateLibraryEntries, buildLibraryIndex } = await import('../libraryAggregator')

function createFilter(overrides: Partial<LibraryFilterState> = {}): LibraryFilterState {
  return {
    view: 'all',
    keyword: '',
    scrapeStatus: 'all',
    onlyStarred: false,
    onlyMarked: false,
    sortBy: 'mtime',
    sortAsc: false,
    ...overrides,
  }
}

function createMeta(overrides: Partial<UnifiedMediaMeta> = {}): UnifiedMediaMeta {
  return {
    mediaKey: 'jav:SSIS001',
    kind: 'jav',
    externalId: 'SSIS-001',
    title: '作品一',
    directors: ['导演甲'],
    actors: [{ name: '演员A' }, { name: '演员B' }],
    genres: ['剧情', '高清'],
    year: 2024,
    releaseDate: '2024-05-01',
    duration: 120,
    source: 'JavLibrary',
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }
}

describe('libraryAggregator', () => {
  it('聚合多版本文件并保留可选 sha1、星标、去重文字标签与有效打点计数', () => {
    const videos: IndexedVideo[] = [
      {
        fid: 'f1',
        cid: 'c1',
        pickCode: 'pc1',
        sha1: 'sha1-v1',
        name: 'SSIS-001.mp4',
        size: 1000,
        duration: 7200,
        mtime: 100,
        avNumber: 'SSIS-001',
        starred: true,
        labels: [
          { id: 'l1', name: '收藏', color: '#ff0000' },
          { id: 'l2', name: '4K原盘' },
        ],
      },
      {
        fid: 'f2',
        cid: 'c2',
        pickCode: 'pc2',
        name: 'ssis001-C.mkv',
        size: 2500,
        duration: 7300,
        mtime: 300,
        avNumber: 'ssis-001',
        labels: [
          { id: 'l2', name: '4K原盘' },
          { id: 'l3', name: '中字' },
        ],
      },
      {
        fid: 'f3',
        cid: 'c3',
        pickCode: 'pc3',
        sha1: 'sha1-unknown',
        name: '家庭录像.mp4',
        size: 500,
        duration: 600,
        mtime: 200,
        avNumber: null,
      },
    ]

    const metaMap = new Map<string, UnifiedMediaMeta>([
      ['jav:SSIS001', createMeta()],
    ])

    const markerDocs: Record<string, MarkerDoc> = {
      pc1: {
        v: 1,
        pickCode: 'pc1',
        updatedAt: 1,
        markers: [
          { id: 'm1', time: 60, label: '高光1', createdAt: 1, updatedAt: 1 },
          { id: 'm2', time: 120, label: '已删除', createdAt: 1, updatedAt: 1, deleted: true },
        ],
      },
      pc2: {
        v: 1,
        pickCode: 'pc2',
        updatedAt: 2,
        markers: [
          { id: 'm3', time: 300, label: '高光2', createdAt: 2, updatedAt: 2 },
        ],
      },
    }

    const entries = aggregateLibraryEntries(videos, metaMap, markerDocs)
    expect(entries).toHaveLength(2)

    const javEntry = entries.find(item => item.mediaKey === 'jav:SSIS001')
    expect(javEntry).toBeDefined()
    expect(javEntry?.files).toHaveLength(2)
    expect(javEntry?.files[0]?.pickCode).toBe('pc2')
    expect(javEntry?.files[0]?.sha1).toBeUndefined()
    expect(javEntry?.files[1]?.sha1).toBe('sha1-v1')
    expect(javEntry?.latestMtime).toBe(300)
    expect(javEntry?.totalSize).toBe(3500)
    expect(javEntry?.maxDuration).toBe(7300)
    expect(javEntry?.markerCount).toBe(2)
    expect(javEntry?.starred).toBe(true)
    expect(javEntry?.driveLabels).toEqual([
      { id: 'l2', name: '4K原盘' },
      { id: 'l3', name: '中字' },
      { id: 'l1', name: '收藏', color: '#ff0000' },
    ])

    const unknownEntry = entries.find(item => item.mediaKey === 'file:f3')
    expect(unknownEntry?.meta).toBeNull()
    expect(unknownEntry?.kind).toBe('unknown')
    expect(unknownEntry?.starred).toBe(false)
    expect(unknownEntry?.driveLabels).toEqual([])
    expect(unknownEntry?.files[0]?.sha1).toBe('sha1-unknown')
  })

  it('支持倒排索引多维交集筛选、标签/关键词检索与多字段排序', () => {
    const entries = aggregateLibraryEntries(
      [
        {
          fid: 'f1',
          cid: 'c1',
          pickCode: 'pc1',
          sha1: 's1',
          name: 'SSIS-001.mp4',
          size: 2000,
          duration: 3600,
          mtime: 100,
          avNumber: 'SSIS-001',
          starred: true,
          labels: [{ id: 't1', name: '珍藏标签' }],
        },
        {
          fid: 'f2',
          cid: 'c1',
          pickCode: 'pc2',
          sha1: 's2',
          name: 'ABP-100.mp4',
          size: 4000,
          duration: 5400,
          mtime: 300,
          avNumber: 'ABP-100',
        },
        {
          fid: 'f3',
          cid: 'c1',
          pickCode: 'pc3',
          sha1: 's3',
          name: 'MIDV-200.mp4',
          size: 1000,
          duration: 1800,
          mtime: 200,
          avNumber: 'MIDV-200',
        },
      ],
      new Map([
        ['jav:SSIS001', createMeta()],
        [
          'jav:ABP100',
          createMeta({
            mediaKey: 'jav:ABP100',
            externalId: 'ABP-100',
            title: '作品二',
            directors: ['导演乙'],
            actors: [{ name: '演员A' }],
            genres: ['校园'],
            year: 2023,
            releaseDate: '2023-01-10',
          }),
        ],
      ]),
      {
        pc2: {
          v: 1,
          pickCode: 'pc2',
          updatedAt: 1,
          markers: [{ id: 'm1', time: 10, label: '点', createdAt: 1, updatedAt: 1 }],
        },
      },
    )

    const index = buildLibraryIndex(entries)

    expect(index.actors).toEqual([
      { name: '演员A', count: 2 },
      { name: '演员B', count: 1 },
    ])
    expect(index.years).toEqual([
      { year: 2024, count: 1 },
      { year: 2023, count: 1 },
    ])

    // 交集过滤：演员A + 题材校园 -> 仅 ABP-100
    expect(index.query(createFilter({ actor: '演员A', genre: '校园' })).map(i => i.mediaKey))
      .toEqual(['jav:ABP100'])

    // 刮削状态过滤
    expect(index.query(createFilter({ scrapeStatus: 'unscraped' })).map(i => i.mediaKey))
      .toEqual(['jav:MIDV200'])

    // 有打点过滤
    expect(index.query(createFilter({ view: 'marked' })).map(i => i.mediaKey))
      .toEqual(['jav:ABP100'])

    // 星标收藏视图与 115 网盘标签过滤
    expect(index.driveLabels).toEqual([{ id: 't1', name: '珍藏标签', count: 1 }])
    expect(index.query(createFilter({ view: 'starred' })).map(i => i.mediaKey))
      .toEqual(['jav:SSIS001'])
    expect(index.query(createFilter({ onlyStarred: true })).map(i => i.mediaKey))
      .toEqual(['jav:SSIS001'])
    expect(index.query(createFilter({ driveLabel: 't1' })).map(i => i.mediaKey))
      .toEqual(['jav:SSIS001'])

    // 关键词匹配导演与 115 文字标签
    expect(index.query(createFilter({ keyword: '导演乙' })).map(i => i.mediaKey))
      .toEqual(['jav:ABP100'])
    expect(index.query(createFilter({ keyword: '珍藏标签' })).map(i => i.mediaKey))
      .toEqual(['jav:SSIS001'])

    // 按大小升序排序
    expect(index.query(createFilter({ sortBy: 'size', sortAsc: true })).map(i => i.mediaKey))
      .toEqual(['jav:MIDV200', 'jav:SSIS001', 'jav:ABP100'])

    // 按发行日期降序：未刮削排在末尾
    expect(index.query(createFilter({ sortBy: 'releaseDate', sortAsc: false })).map(i => i.mediaKey))
      .toEqual(['jav:SSIS001', 'jav:ABP100', 'jav:MIDV200'])
  })

  it('合并繁简与日文异体演员名，并复用 actor_works_v1 关联未刮削作品', () => {
    const entries = aggregateLibraryEntries(
      [
        {
          fid: 'f1',
          cid: 'c1',
          pickCode: 'pc1',
          name: 'SSIS-101.mp4',
          size: 1000,
          duration: 3600,
          mtime: 100,
          avNumber: 'SSIS-101',
        },
        {
          fid: 'f2',
          cid: 'c1',
          pickCode: 'pc2',
          name: 'SSIS-102.mp4',
          size: 2000,
          duration: 3600,
          mtime: 200,
          avNumber: 'SSIS-102',
        },
        {
          fid: 'f3',
          cid: 'c1',
          pickCode: 'pc3',
          name: 'SSIS-103.mp4',
          size: 3000,
          duration: 3600,
          mtime: 300,
          avNumber: 'SSIS-103',
        },
      ],
      new Map([
        [
          'jav:SSIS101',
          createMeta({
            mediaKey: 'jav:SSIS101',
            externalId: 'SSIS-101',
            actors: [{ name: '橋本有菜', avatarUrl: 'https://img.example/ar.jpg' }],
          }),
        ],
        [
          'jav:SSIS102',
          createMeta({
            mediaKey: 'jav:SSIS102',
            externalId: 'SSIS-102',
            actors: [{ name: '桥本有菜' }],
          }),
        ],
      ]),
      {
        pc2: {
          v: 1,
          pickCode: 'pc2',
          updatedAt: 1,
          markers: [{ id: 'm1', time: 15, label: '点', createdAt: 1, updatedAt: 1 }],
        },
      },
    )

    const actorWorks: ActorWorksCacheEntry[] = [
      {
        actorKey: '桥本有菜',
        name: '桥本有菜',
        aliases: ['橋本ありな', '新ありな'],
        source: 'javbus',
        profileUrl: 'https://javbus.example/star/ar',
        avNumbers: ['SSIS-102', 'SSIS-103', 'SSIS-999'],
        fetchedPages: 1,
        hasMore: false,
        cachedAt: 1_700_000_000_000,
      },
    ]

    const index = buildLibraryIndex(entries, actorWorks)

    expect(index.actors).toEqual([
      { name: '桥本有菜', count: 3 },
    ])
    expect(index.actorStats).toEqual([
      {
        key: '桥本有菜',
        name: '桥本有菜',
        count: 3,
        aliases: expect.arrayContaining(['橋本有菜', '橋本ありな', '新ありな']),
        scrapedCount: 2,
        markedCount: 1,
        totalSize: 6000,
        latestMtime: 300,
        avatarUrl: 'https://img.example/ar.jpg',
      },
    ])

    // 通过任意繁体名或别名筛选均命中全部 3 部（含未刮削的 SSIS-103）
    expect(index.query(createFilter({ actor: '橋本有菜' })).map(i => i.mediaKey))
      .toEqual(['jav:SSIS103', 'jav:SSIS102', 'jav:SSIS101'])
    expect(index.query(createFilter({ actor: '橋本ありな' })).map(i => i.mediaKey))
      .toEqual(['jav:SSIS103', 'jav:SSIS102', 'jav:SSIS101'])

    // 通过关键字搜别名也可以命中未刮削作品 SSIS-103
    expect(index.query(createFilter({ keyword: '新ありな' })).map(i => i.mediaKey))
      .toEqual(['jav:SSIS103', 'jav:SSIS102', 'jav:SSIS101'])
  })
})
