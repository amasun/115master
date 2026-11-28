// @vitest-environment jsdom
import type { UnifiedMediaMeta } from '../types'
import type { IndexedVideo } from '@/utils/superSearch'
import { describe, expect, it } from 'vitest'
import { analyzeDuplicateGroups } from '../deduplicator'
import { aggregateLibraryEntries, buildLibraryIndex } from '../libraryAggregator'

function makeVideo(overrides: Partial<IndexedVideo> & { fid: string, cid: string, name: string }): IndexedVideo {
  return {
    pickCode: `pc-${overrides.fid}`,
    avNumber: null,
    size: 500 * 1024 * 1024,
    duration: 1800,
    mtime: 1_700_000_000,
    ...overrides,
  }
}

describe('libraryAggregator auto collection', () => {
  it('aggregates >= 2 unnumbered non-cinema videos in the same folder into a collection', () => {
    const videos = [
      makeVideo({ fid: '1', cid: 'dir-100', name: 'part1.mp4', mtime: 100 }),
      makeVideo({ fid: '2', cid: 'dir-100', name: 'part2.mp4', mtime: 200 }),
    ]

    const entries = aggregateLibraryEntries(videos, new Map(), {}, {
      folderNameLookup: cid => (cid === 'dir-100' ? '旅行Vlog合集' : undefined),
    })

    expect(entries).toHaveLength(1)
    expect(entries[0].mediaKey).toBe('collection:dir-100')
    expect(entries[0].kind).toBe('collection')
    expect(entries[0].meta?.title).toBe('旅行Vlog合集')
    expect(entries[0].files).toHaveLength(2)
  })

  it('does not aggregate if any video in the folder has an avNumber', () => {
    const videos = [
      makeVideo({ fid: '1', cid: 'dir-200', name: 'SSIS-001.mp4', avNumber: 'SSIS-001' }),
      makeVideo({ fid: '2', cid: 'dir-200', name: 'bonus.mp4' }),
    ]

    const entries = aggregateLibraryEntries(videos, new Map(), {})
    expect(entries.map(e => e.mediaKey).sort()).toEqual(['file:2', 'jav:SSIS001'])
  })

  it('does not aggregate single unnumbered video, root cid, excludedRootCids, protected folders, cinema, or ungrouped cids', () => {
    const videos = [
      makeVideo({ fid: '1', cid: 'dir-single', name: 'solo.mp4' }),
      makeVideo({ fid: '2', cid: '0', name: 'root1.mp4' }),
      makeVideo({ fid: '3', cid: '0', name: 'root2.mp4' }),
      makeVideo({ fid: '4', cid: 'dir-root', name: 'scanroot1.mp4' }),
      makeVideo({ fid: '5', cid: 'dir-root', name: 'scanroot2.mp4' }),
      makeVideo({ fid: '6', cid: 'dir-protected', name: 'dl1.mp4' }),
      makeVideo({ fid: '7', cid: 'dir-protected', name: 'dl2.mp4' }),
      makeVideo({ fid: '8', cid: 'dir-cinema', name: 'Movie.2024.mp4', libraryCategory: 'cinema' }),
      makeVideo({ fid: '9', cid: 'dir-cinema', name: 'Movie2.2024.mp4', libraryCategory: 'cinema' }),
      makeVideo({ fid: '10', cid: 'dir-ungrouped', name: 'u1.mp4' }),
      makeVideo({ fid: '11', cid: 'dir-ungrouped', name: 'u2.mp4' }),
    ]

    const entries = aggregateLibraryEntries(videos, new Map(), {}, {
      excludedRootCids: new Set(['dir-root']),
      ungroupedCids: new Set(['dir-ungrouped']),
      folderNameLookup: cid => (cid === 'dir-protected' ? '云下载' : undefined),
    })

    expect(entries.some(e => e.kind === 'collection')).toBe(false)
  })

  it('applies custom collection metadata and excludes collections from avNumber duplicate groups', () => {
    const videos = [
      makeVideo({ fid: '1', cid: 'dir-custom', name: 'clip-a.mp4', sha1: 'aaa' }),
      makeVideo({ fid: '2', cid: 'dir-custom', name: 'clip-b.mp4', sha1: 'bbb' }),
    ]

    const entries = aggregateLibraryEntries(videos, new Map(), {}, {
      customCollections: {
        'dir-custom': {
          cid: 'dir-custom',
          title: '自定义标题',
          overview: '简介内容',
          genres: ['旅行', '精选'],
          actors: ['摄影师A'],
          updatedAt: 999,
        },
      },
    })

    expect(entries[0].meta?.title).toBe('自定义标题')
    expect(entries[0].meta?.overview).toBe('简介内容')
    expect(entries[0].meta?.genres).toEqual(['旅行', '精选'])
    expect(entries[0].meta?.actors.map(a => a.name)).toEqual(['摄影师A'])

    const dupGroups = analyzeDuplicateGroups(videos, entries)
    expect(dupGroups).toHaveLength(0)
  })

  it('isolates all works, cinema, and custom sections by view', () => {
    const videos = [
      makeVideo({ fid: '1', cid: 'dir-av', name: 'SSIS-001.mp4', avNumber: 'SSIS-001' }),
      makeVideo({ fid: '2', cid: 'dir-cin', name: 'Dune.2021.1080p.mp4', libraryCategory: 'cinema' }),
      makeVideo({ fid: '3', cid: 'dir-sec', name: 'Doc1.mp4', sectionId: 'sec_doc', customScrapeMode: 'folder_collection' }),
      makeVideo({ fid: '4', cid: 'dir-sec', name: 'Doc2.mp4', sectionId: 'sec_doc', customScrapeMode: 'folder_collection' }),
      makeVideo({ fid: '5', cid: 'dir-raw', name: 'Personal.mp4', sectionId: 'sec_raw', customScrapeMode: 'none' }),
    ]

    const entries = aggregateLibraryEntries(videos, new Map(), {})
    const index = buildLibraryIndex(entries)
    const baseFilter = {
      keyword: '',
      scrapeStatus: 'all' as const,
      onlyStarred: false,
      onlyMarked: false,
      sortBy: 'mtime' as const,
      sortAsc: false,
    }

    expect(index.query({ ...baseFilter, view: 'all' }).map(e => e.mediaKey)).toEqual(['jav:SSIS001'])
    expect(index.query({ ...baseFilter, view: 'cinema' }).map(e => e.mediaKey)).toEqual(['movie:dune:2021'])
    expect(index.query({ ...baseFilter, view: 'section:sec_doc' }).map(e => e.mediaKey)).toEqual(['collection:dir-sec'])
    expect(index.query({ ...baseFilter, view: 'section:sec_raw' }).map(e => e.mediaKey)).toEqual(['sec:sec_raw:file:5'])
  })

  it('supports manualAvBindings on unnumbered and misidentified files and restores when cleared', () => {
    const videos = [
      makeVideo({ fid: '10', cid: 'dir-1', name: 'mystery-video.mp4' }),
      makeVideo({ fid: '20', cid: 'dir-2', name: 'WRONG-001.mp4', avNumber: 'WRONG-001' }),
    ]

    const makeMeta = (mediaKey: string, externalId: string, title: string): UnifiedMediaMeta => ({
      mediaKey,
      kind: 'jav',
      externalId,
      title,
      directors: [],
      actors: [],
      genres: [],
      source: 'JavBus',
      updatedAt: 1000,
    })

    const metaMap = new Map<string, UnifiedMediaMeta>([
      ['jav:SSIS001', makeMeta('jav:SSIS001', 'SSIS-001', '正确作品一')],
      ['jav:WRONG001', makeMeta('jav:WRONG001', 'WRONG-001', '误识别旧缓存')],
      ['jav:ABP100', makeMeta('jav:ABP100', 'ABP-100', '正确作品二')],
    ])

    const boundEntries = aggregateLibraryEntries(videos, metaMap, {}, {
      manualAvBindings: {
        'file:10': 'SSIS-001',
        'jav:WRONG001': 'abp-100',
      },
    })

    const fileEntry = boundEntries.find(e => e.mediaKey === 'file:10')
    expect(fileEntry?.kind).toBe('jav')
    expect(fileEntry?.externalId).toBe('SSIS-001')
    expect(fileEntry?.meta?.title).toBe('正确作品一')
    expect(fileEntry?.meta?.mediaKey).toBe('file:10')

    const correctedEntry = boundEntries.find(e => e.mediaKey === 'jav:WRONG001')
    expect(correctedEntry?.kind).toBe('jav')
    expect(correctedEntry?.externalId).toBe('ABP-100')
    expect(correctedEntry?.meta?.title).toBe('正确作品二')
    expect(correctedEntry?.meta?.mediaKey).toBe('jav:WRONG001')

    const restoredEntries = aggregateLibraryEntries(videos, metaMap, {})
    const restoredFile = restoredEntries.find(e => e.mediaKey === 'file:10')
    expect(restoredFile?.kind).toBe('unknown')
    expect(restoredFile?.externalId).toBeUndefined()
    expect(restoredFile?.meta).toBeNull()

    const restoredWrong = restoredEntries.find(e => e.mediaKey === 'jav:WRONG001')
    expect(restoredWrong?.externalId).toBe('WRONG-001')
    expect(restoredWrong?.meta?.title).toBe('误识别旧缓存')
  })

  it('recognizes LTX demosaiced videos and supports onlyLtx filtering', async () => {
    const { aggregateLibraryEntries, buildLibraryIndex } = await import('../libraryAggregator')
    const { isLtxFileName } = await import('../deduplicator')

    expect(isLtxFileName('www.98T.la@IPX-811_LTX_restored.mp4')).toBe(true)
    expect(isLtxFileName('SSIS-001.LTX.mp4')).toBe(true)
    expect(isLtxFileName('SSIS-001-LTXv2.mp4')).toBe(true)
    expect(isLtxFileName('SSIS-001.mp4')).toBe(false)

    const entries = aggregateLibraryEntries([
      makeVideo({ fid: 'f1', cid: 'dir1', avNumber: 'IPX-811', name: 'IPX-811_LTX_restored.mp4' }),
      makeVideo({ fid: 'f2', cid: 'dir1', avNumber: 'SSIS-001', name: 'SSIS-001.mp4' }),
    ], new Map(), {})

    expect(entries.find(e => e.mediaKey === 'jav:IPX811')?.isLtx).toBe(true)
    expect(entries.find(e => e.mediaKey === 'jav:SSIS001')?.isLtx).toBeUndefined()

    const index = buildLibraryIndex(entries)
    const filtered = index.query({
      view: 'all',
      keyword: '',
      scrapeStatus: 'all',
      onlyStarred: false,
      onlyMarked: false,
      onlyLtx: true,
      sortBy: 'mtime',
      sortAsc: false,
    })

    expect(filtered.map(e => e.mediaKey)).toEqual(['jav:IPX811'])
  })

  it('detects 5-tier uncensored/cracked sources (ltx, lada, native, cracked, censored) with studio-vs-filename/label conflict rules', async () => {
    const { aggregateLibraryEntries, buildLibraryIndex } = await import('../libraryAggregator')

    const entries = aggregateLibraryEntries([
      makeVideo({ fid: 'u1', cid: 'd1', avNumber: 'IPX-811', name: 'IPX-811_LTX_restored.mp4' }),
      makeVideo({ fid: 'u2', cid: 'd1', avNumber: 'SSIS-002', name: 'SSIS-002_LADA.mp4' }),
      makeVideo({ fid: 'u2b', cid: 'd1', avNumber: 'SSIS-003', name: 'SSIS-003_restored.mp4' }),
      makeVideo({ fid: 'u3', cid: 'd1', avNumber: 'FC2-PPV-1234567', name: 'FC2-PPV-1234567.mp4' }),
      makeVideo({ fid: 'u3b', cid: 'd1', avNumber: 'FC2-PPV-7654321', name: 'FC2-PPV-7654321-UC.mp4' }),
      makeVideo({ fid: 'u4', cid: 'd1', avNumber: 'ABP-100', name: 'ABP-100-去码破坏版.mp4' }),
      makeVideo({ fid: 'u5', cid: 'd1', avNumber: 'MIDV-100', name: 'MIDV-100-无码破解.mp4' }),
      makeVideo({ fid: 'u5b', cid: 'd1', avNumber: 'MIDV-101', name: 'MIDV-101-无码流出.mp4' }),
      makeVideo({ fid: 'u6', cid: 'd1', avNumber: 'STARS-100', name: 'STARS-100-UC.mp4' }),
      makeVideo({ fid: 'u7', cid: 'd1', avNumber: 'MIDE-100', name: 'MIDE-100.mp4', labels: [{ id: 't1', name: '无码收藏' }] }),
      makeVideo({ fid: 'c1', cid: 'd1', avNumber: 'JUQ-100', name: 'JUQ-100.mp4' }),
      makeVideo({ fid: 'm1', cid: 'd2', libraryCategory: 'cinema', name: 'The Godfather Restored.mkv' }),
    ], new Map(), {})

    expect(entries.find(e => e.mediaKey === 'jav:IPX811')?.uncensoredKind).toBe('ltx')
    expect(entries.find(e => e.mediaKey === 'jav:SSIS002')?.uncensoredKind).toBe('lada')
    expect(entries.find(e => e.mediaKey === 'jav:SSIS003')?.uncensoredKind).toBe('lada')
    expect(entries.find(e => e.mediaKey === 'jav:FC2PPV1234567')?.uncensoredKind).toBe('native')
    expect(entries.find(e => e.mediaKey === 'jav:FC2PPV7654321')?.uncensoredKind).toBe('native')
    expect(entries.find(e => e.mediaKey === 'jav:ABP100')?.uncensoredKind).toBe('cracked')
    expect(entries.find(e => e.mediaKey === 'jav:MIDV100')?.uncensoredKind).toBe('cracked')
    expect(entries.find(e => e.mediaKey === 'jav:MIDV101')?.uncensoredKind).toBe('cracked')
    expect(entries.find(e => e.mediaKey === 'jav:STARS100')?.uncensoredKind).toBe('cracked')
    expect(entries.find(e => e.mediaKey === 'jav:MIDE100')?.uncensoredKind).toBe('cracked')
    expect(entries.find(e => e.mediaKey === 'jav:JUQ100')?.uncensoredKind).toBeUndefined()
    expect(entries.find(e => e.kind === 'movie')?.uncensoredKind).toBeUndefined()

    const index = buildLibraryIndex(entries)
    const filtered = index.query({
      view: 'all',
      keyword: '',
      scrapeStatus: 'all',
      onlyStarred: false,
      onlyMarked: false,
      onlyUncensored: true,
      sortBy: 'mtime',
      sortAsc: false,
    })

    expect(filtered).toHaveLength(10)
    expect(filtered.some(e => e.mediaKey === 'jav:JUQ100')).toBe(false)

    expect(index.byUncensored.get('ltx')?.has('jav:IPX811')).toBe(true)
    expect(index.byUncensored.get('native')?.has('jav:FC2PPV1234567')).toBe(true)
    expect(index.byUncensored.get('native')?.has('jav:FC2PPV7654321')).toBe(true)
    expect(index.byUncensored.get('cracked')?.has('jav:MIDE100')).toBe(true)

    const byKind = index.query({
      view: 'all',
      keyword: '',
      scrapeStatus: 'all',
      onlyStarred: false,
      onlyMarked: false,
      uncensoredKind: 'ltx',
      sortBy: 'mtime',
      sortAsc: false,
    })
    expect(byKind.map(e => e.mediaKey)).toEqual(['jav:IPX811'])

    const byKeywordUncensored = index.query({
      view: 'all',
      keyword: '无码',
      scrapeStatus: 'all',
      onlyStarred: false,
      onlyMarked: false,
      sortBy: 'mtime',
      sortAsc: false,
    })
    expect(byKeywordUncensored).toHaveLength(10)

    const byKeywordLtx = index.query({
      view: 'all',
      keyword: 'ltx',
      scrapeStatus: 'all',
      onlyStarred: false,
      onlyMarked: false,
      sortBy: 'mtime',
      sortAsc: false,
    })
    expect(byKeywordLtx.map(e => e.mediaKey)).toEqual(['jav:IPX811'])
  })

  it('matches mediaNotes and actorNotes in library keyword search', async () => {
    const { aggregateLibraryEntries, buildLibraryIndex } = await import('../libraryAggregator')

    const entries = aggregateLibraryEntries([
      makeVideo({ fid: 'n1', cid: 'd1', avNumber: 'SSIS-900', name: 'SSIS-900.mp4' }),
    ], new Map([
      ['jav:SSIS900', {
        mediaKey: 'jav:SSIS900',
        kind: 'jav',
        externalId: 'SSIS-900',
        title: '测试影片',
        actors: [{ name: '三上悠亚' }],
        genres: [],
        directors: [],
        source: 'javbus',
        updatedAt: Date.now(),
      }],
    ]), {})

    const index = buildLibraryIndex(entries)
    const byMediaNote = index.query({
      view: 'all',
      keyword: '经典二刷',
      scrapeStatus: 'all',
      onlyStarred: false,
      onlyMarked: false,
      sortBy: 'mtime',
      sortAsc: false,
    }, {
      mediaNotes: { 'jav:SSIS900': '经典二刷收藏' },
    })
    expect(byMediaNote.map(e => e.mediaKey)).toEqual(['jav:SSIS900'])

    const byActorNote = index.query({
      view: 'all',
      keyword: '鬼头桃菜',
      scrapeStatus: 'all',
      onlyStarred: false,
      onlyMarked: false,
      sortBy: 'mtime',
      sortAsc: false,
    }, {
      actorNotes: { 三上悠亚: '曾用名：鬼头桃菜' },
    })
    expect(byActorNote.map(e => e.mediaKey)).toEqual(['jav:SSIS900'])
  })
})
