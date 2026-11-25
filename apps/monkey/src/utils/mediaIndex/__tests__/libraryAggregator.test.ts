// @vitest-environment jsdom
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
})
