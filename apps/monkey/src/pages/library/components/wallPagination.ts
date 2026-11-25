import type { LibraryEntry, LibrarySortBy, LibraryView } from '@/utils/mediaIndex'

export const WALL_PAGE_SIZE_OPTIONS = [24, 48, 60, 96, 120] as const
export const DEFAULT_WALL_PAGE_SIZE = 48
export const RECENT_30_DAYS_SEC = 30 * 24 * 60 * 60

export interface WallSection {
  key: string
  title?: string
  count?: number
  badge?: string
  entries: LibraryEntry[]
}

export function normalizeWallPageSize(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (WALL_PAGE_SIZE_OPTIONS.includes(num as (typeof WALL_PAGE_SIZE_OPTIONS)[number]))
    return num
  return DEFAULT_WALL_PAGE_SIZE
}

export function getWallTotalPages(totalItems: number, pageSize: number): number {
  const safeSize = pageSize > 0 ? pageSize : DEFAULT_WALL_PAGE_SIZE
  return Math.max(1, Math.ceil(Math.max(0, totalItems) / safeSize))
}

export function clampWallPage(page: number, totalItems: number, pageSize: number): number {
  const totalPages = getWallTotalPages(totalItems, pageSize)
  const parsed = Number.isFinite(page) ? Math.floor(page) : 1
  return Math.min(totalPages, Math.max(1, parsed))
}

export function sliceWallPage<T>(items: readonly T[], page: number, pageSize: number): T[] {
  if (items.length === 0)
    return []
  const safeSize = pageSize > 0 ? pageSize : DEFAULT_WALL_PAGE_SIZE
  const safePage = clampWallPage(page, items.length, safeSize)
  const start = (safePage - 1) * safeSize
  return items.slice(start, start + safeSize)
}

export function buildWallPageSections(options: {
  allEntries: readonly LibraryEntry[]
  pageEntries: readonly LibraryEntry[]
  view: LibraryView
  sortBy: LibrarySortBy
  sortAsc: boolean
  nowSec?: number
}): WallSection[] {
  if (options.pageEntries.length === 0)
    return []

  if (options.view !== 'all' || options.sortBy !== 'mtime')
    return [{ key: 'section:all', entries: [...options.pageEntries] }]

  const cutoffSec = (options.nowSec ?? Math.floor(Date.now() / 1000)) - RECENT_30_DAYS_SEC
  const totalRecentCount = options.allEntries.filter(entry => entry.latestMtime >= cutoffSec).length
  if (totalRecentCount === 0)
    return [{ key: 'section:all', entries: [...options.pageEntries] }]

  const totalOlderCount = options.allEntries.length - totalRecentCount
  const pageRecent = options.pageEntries.filter(entry => entry.latestMtime >= cutoffSec)
  const pageOlder = options.pageEntries.filter(entry => entry.latestMtime < cutoffSec)

  const recentSection: WallSection[] = pageRecent.length > 0
    ? [{
        key: 'section:recent30',
        title: '最近 30 天入库',
        count: totalRecentCount,
        badge: '近 30 天',
        entries: pageRecent,
      }]
    : []

  const olderSection: WallSection[] = pageOlder.length > 0
    ? [{
        key: 'section:older',
        title: '更早入库',
        count: totalOlderCount,
        entries: pageOlder,
      }]
    : []

  return options.sortAsc
    ? [...olderSection, ...recentSection]
    : [...recentSection, ...olderSection]
}
