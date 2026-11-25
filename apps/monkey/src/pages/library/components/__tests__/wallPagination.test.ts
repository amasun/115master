import type { LibraryEntry } from '@/utils/mediaIndex'
import { describe, expect, it } from 'vitest'
import {
  buildWallPageSections,
  clampWallPage,
  DEFAULT_WALL_PAGE_SIZE,
  getWallTotalPages,
  normalizeWallPageSize,
  RECENT_30_DAYS_SEC,
  sliceWallPage,
} from '../wallPagination'

function createEntry(id: number, latestMtime: number): LibraryEntry {
  return {
    mediaKey: `jav:TEST-${id}`,
    kind: 'jav',
    externalId: `TEST-${id}`,
    files: [],
    meta: null,
    latestMtime,
    maxDuration: 0,
    totalSize: 0,
    starred: false,
    markerCount: 0,
    driveLabels: [],
  }
}

describe('wallPagination', () => {
  it('normalizes wall page size to supported presets', () => {
    expect(normalizeWallPageSize(24)).toBe(24)
    expect(normalizeWallPageSize('96')).toBe(96)
    expect(normalizeWallPageSize(120)).toBe(120)
    expect(normalizeWallPageSize(15)).toBe(DEFAULT_WALL_PAGE_SIZE)
    expect(normalizeWallPageSize(Number.NaN)).toBe(DEFAULT_WALL_PAGE_SIZE)
    expect(normalizeWallPageSize(undefined)).toBe(DEFAULT_WALL_PAGE_SIZE)
  })

  it('computes total pages and clamps current page safely', () => {
    expect(getWallTotalPages(0, 48)).toBe(1)
    expect(getWallTotalPages(48, 48)).toBe(1)
    expect(getWallTotalPages(49, 48)).toBe(2)
    expect(clampWallPage(0, 100, 48)).toBe(1)
    expect(clampWallPage(99, 100, 48)).toBe(3)
    expect(clampWallPage(2.8, 100, 48)).toBe(2)
  })

  it('slices items for the requested page and clamps out-of-range pages', () => {
    const items = Array.from({ length: 10 }, (_, idx) => idx + 1)
    expect(sliceWallPage(items, 1, 4)).toEqual([1, 2, 3, 4])
    expect(sliceWallPage(items, 2, 4)).toEqual([5, 6, 7, 8])
    expect(sliceWallPage(items, 3, 4)).toEqual([9, 10])
    expect(sliceWallPage(items, 5, 4)).toEqual([9, 10])
    expect(sliceWallPage([], 1, 4)).toEqual([])
  })

  it('builds recent-30-days and older sections on paginated mtime view', () => {
    const nowSec = 1_800_000_000
    const recent1 = createEntry(1, nowSec - 100)
    const recent2 = createEntry(2, nowSec - 200)
    const older1 = createEntry(3, nowSec - RECENT_30_DAYS_SEC - 100)
    const older2 = createEntry(4, nowSec - RECENT_30_DAYS_SEC - 200)
    const all = [recent1, recent2, older1, older2]

    const mixedPage = buildWallPageSections({
      allEntries: all,
      pageEntries: [recent2, older1],
      view: 'all',
      sortBy: 'mtime',
      sortAsc: false,
      nowSec,
    })
    expect(mixedPage).toHaveLength(2)
    expect(mixedPage[0]).toMatchObject({
      key: 'section:recent30',
      title: '最近 30 天入库',
      count: 2,
      badge: '近 30 天',
      entries: [recent2],
    })
    expect(mixedPage[1]).toMatchObject({
      key: 'section:older',
      title: '更早入库',
      count: 2,
      entries: [older1],
    })

    const ascPage = buildWallPageSections({
      allEntries: [older2, older1, recent2, recent1],
      pageEntries: [older1, recent2],
      view: 'all',
      sortBy: 'mtime',
      sortAsc: true,
      nowSec,
    })
    expect(ascPage.map(section => section.key)).toEqual(['section:older', 'section:recent30'])

    const nonMtime = buildWallPageSections({
      allEntries: all,
      pageEntries: [recent1, older1],
      view: 'all',
      sortBy: 'title',
      sortAsc: false,
      nowSec,
    })
    expect(nonMtime).toEqual([{ key: 'section:all', entries: [recent1, older1] }])
  })
})
