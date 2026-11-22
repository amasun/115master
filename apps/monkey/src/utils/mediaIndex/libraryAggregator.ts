import type {
  FacetCount,
  IndexedVideo,
  IndexedVideoLabel,
  LibraryEntry,
  LibraryFileItem,
  LibraryFilterState,
  UnifiedMediaMeta,
} from './types'
import type { MarkerDoc } from '@/utils/markers/types'
import { normalizeAvNumber } from '@/utils/jav/jav'

export interface YearFacetCount {
  year: number
  count: number
}

export interface LibraryIndex {
  entries: LibraryEntry[]
  entryMap: Map<string, LibraryEntry>
  byActor: Map<string, Set<string>>
  byGenre: Map<string, Set<string>>
  byYear: Map<number, Set<string>>
  byDirector: Map<string, Set<string>>
  actors: FacetCount[]
  genres: FacetCount[]
  years: YearFacetCount[]
  directors: FacetCount[]
  query: (filter: LibraryFilterState) => LibraryEntry[]
}

function addToIndex<K>(map: Map<K, Set<string>>, key: K, mediaKey: string) {
  const existing = map.get(key)
  if (existing) {
    existing.add(mediaKey)
    return
  }
  map.set(key, new Set([mediaKey]))
}

function toFacetCounts(map: Map<string, Set<string>>): FacetCount[] {
  return Array.from(map.entries())
    .map(([name, keys]) => ({ name, count: keys.size }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'))
}

function intersectSets(sets: Array<Set<string> | undefined>): Set<string> | null {
  if (sets.length === 0)
    return null
  if (sets.some(set => !set || set.size === 0))
    return new Set()

  const valid = sets.filter((set): set is Set<string> => Boolean(set))
  valid.sort((a, b) => a.size - b.size)

  const [first, ...rest] = valid
  const result = new Set<string>()
  first.forEach((key) => {
    if (rest.every(set => set.has(key)))
      result.add(key)
  })
  return result
}

function countDocMarkers(doc?: MarkerDoc): number {
  if (!doc?.markers?.length)
    return 0
  return doc.markers.filter(marker => !marker.deleted).length
}

function resolveMediaKey(video: IndexedVideo): string {
  if (video.avNumber) {
    const normalized = normalizeAvNumber(video.avNumber)
    if (normalized)
      return `jav:${normalized}`
  }
  return `file:${video.fid}`
}

function toLibraryFile(video: IndexedVideo): LibraryFileItem {
  return {
    fid: video.fid,
    cid: video.cid,
    pickCode: video.pickCode,
    ...(video.sha1 ? { sha1: video.sha1 } : {}),
    name: video.name,
    size: video.size,
    duration: video.duration,
    mtime: video.mtime,
    ...(video.starred ? { starred: true } : {}),
    ...(video.labels?.length ? { labels: video.labels } : {}),
  }
}

function collectDriveLabels(files: LibraryFileItem[]): IndexedVideoLabel[] {
  const labels: IndexedVideoLabel[] = []
  const seen = new Set<string>()
  files.forEach((file) => {
    file.labels?.forEach((label) => {
      const key = label.id || label.name
      if (!key || seen.has(key))
        return
      seen.add(key)
      labels.push(label)
    })
  })
  return labels
}

/** 聚合网盘视频文件、统一元数据与本地打点计数 */
export function aggregateLibraryEntries(
  videos: IndexedVideo[],
  metaMap: Map<string, UnifiedMediaMeta>,
  markerDocs: Record<string, MarkerDoc>,
): LibraryEntry[] {
  const groups = new Map<string, { videos: IndexedVideo[], externalId?: string }>()

  videos.forEach((video) => {
    const mediaKey = resolveMediaKey(video)
    const group = groups.get(mediaKey)
    if (group) {
      group.videos.push(video)
      if (!group.externalId && video.avNumber)
        group.externalId = video.avNumber
      return
    }
    groups.set(mediaKey, {
      videos: [video],
      externalId: video.avNumber ?? undefined,
    })
  })

  return Array.from(groups.entries()).map(([mediaKey, group]) => {
    const sortedVideos = [...group.videos].sort((a, b) => b.mtime - a.mtime || b.size - a.size)
    const files = sortedVideos.map(toLibraryFile)
    const meta = metaMap.get(mediaKey) ?? null
    const externalId = meta?.externalId ?? group.externalId
    const kind = meta?.kind ?? (externalId ? 'jav' : 'unknown')
    const latestMtime = files.reduce((max, file) => Math.max(max, file.mtime), 0)
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    const maxDuration = files.reduce((max, file) => Math.max(max, file.duration), 0)
    const markerCount = files.reduce((sum, file) => sum + countDocMarkers(markerDocs[file.pickCode]), 0)
    const starred = files.some(file => Boolean(file.starred))
    const driveLabels = collectDriveLabels(files)

    return {
      mediaKey,
      kind,
      externalId,
      meta,
      files,
      latestMtime,
      markerCount,
      totalSize,
      maxDuration,
      starred,
      driveLabels,
    }
  })
}

function matchesKeyword(entry: LibraryEntry, keyword: string): boolean {
  if (entry.externalId?.toLowerCase().includes(keyword))
    return true
  if (entry.meta?.title.toLowerCase().includes(keyword))
    return true
  if (entry.files.some(file => file.name.toLowerCase().includes(keyword)))
    return true
  if (entry.meta?.actors.some(actor => actor.name.toLowerCase().includes(keyword)))
    return true
  if (entry.meta?.genres.some(genre => genre.toLowerCase().includes(keyword)))
    return true
  if (entry.meta?.directors.some(director => director.toLowerCase().includes(keyword)))
    return true
  if (entry.driveLabels.some(label => label.name.toLowerCase().includes(keyword)))
    return true
  return false
}

function getEntryDurationSeconds(entry: LibraryEntry): number {
  if (entry.maxDuration > 0)
    return entry.maxDuration
  return (entry.meta?.duration ?? 0) * 60
}

function getEntryDisplayTitle(entry: LibraryEntry): string {
  return entry.meta?.title || entry.externalId || entry.files[0]?.name || ''
}

function compareEntries(a: LibraryEntry, b: LibraryEntry, filter: LibraryFilterState): number {
  const factor = filter.sortAsc ? 1 : -1

  if (filter.sortBy === 'releaseDate') {
    const da = a.meta?.releaseDate ?? ''
    const db = b.meta?.releaseDate ?? ''
    if (!da && !db)
      return (a.latestMtime - b.latestMtime) * factor
    if (!da)
      return 1
    if (!db)
      return -1
    if (da !== db)
      return da.localeCompare(db) * factor
  }

  if (filter.sortBy === 'duration') {
    const diff = getEntryDurationSeconds(a) - getEntryDurationSeconds(b)
    if (diff !== 0)
      return diff * factor
  }

  if (filter.sortBy === 'size') {
    const diff = a.totalSize - b.totalSize
    if (diff !== 0)
      return diff * factor
  }

  if (filter.sortBy === 'title') {
    const diff = getEntryDisplayTitle(a).localeCompare(getEntryDisplayTitle(b), 'zh-CN')
    if (diff !== 0)
      return diff * factor
  }

  const mtimeDiff = a.latestMtime - b.latestMtime
  if (mtimeDiff !== 0)
    return mtimeDiff * factor

  return a.mediaKey.localeCompare(b.mediaKey)
}

/** 构建内存倒排索引与毫秒级查询接口 */
export function buildLibraryIndex(entries: LibraryEntry[]): LibraryIndex {
  const entryMap = new Map<string, LibraryEntry>()
  const byActor = new Map<string, Set<string>>()
  const byGenre = new Map<string, Set<string>>()
  const byYear = new Map<number, Set<string>>()
  const byDirector = new Map<string, Set<string>>()

  entries.forEach((entry) => {
    entryMap.set(entry.mediaKey, entry)
    if (!entry.meta)
      return

    entry.meta.actors.forEach(actor => addToIndex(byActor, actor.name, entry.mediaKey))
    entry.meta.genres.forEach(genre => addToIndex(byGenre, genre, entry.mediaKey))
    entry.meta.directors.forEach(director => addToIndex(byDirector, director, entry.mediaKey))
    if (entry.meta.year)
      addToIndex(byYear, entry.meta.year, entry.mediaKey)
  })

  const actors = toFacetCounts(byActor)
  const genres = toFacetCounts(byGenre)
  const directors = toFacetCounts(byDirector)
  const years = Array.from(byYear.entries())
    .map(([year, keys]) => ({ year, count: keys.size }))
    .sort((a, b) => b.year - a.year)

  function query(filter: LibraryFilterState): LibraryEntry[] {
    const facetSets: Array<Set<string> | undefined> = []
    if (filter.actor)
      facetSets.push(byActor.get(filter.actor))
    if (filter.genre)
      facetSets.push(byGenre.get(filter.genre))
    if (filter.director)
      facetSets.push(byDirector.get(filter.director))
    if (filter.year !== undefined)
      facetSets.push(byYear.get(filter.year))

    const candidateKeys = intersectSets(facetSets)
    const candidates = candidateKeys
      ? Array.from(candidateKeys).map(key => entryMap.get(key)).filter((item): item is LibraryEntry => Boolean(item))
      : entries

    const keyword = filter.keyword.trim().toLowerCase()
    const filtered = candidates.filter((entry) => {
      if ((filter.view === 'marked' || filter.onlyMarked) && entry.markerCount <= 0)
        return false
      if (filter.scrapeStatus === 'scraped' && entry.meta === null)
        return false
      if (filter.scrapeStatus === 'unscraped' && entry.meta !== null)
        return false
      if (keyword && !matchesKeyword(entry, keyword))
        return false
      return true
    })

    return filtered.sort((a, b) => compareEntries(a, b, filter))
  }

  return {
    entries,
    entryMap,
    byActor,
    byGenre,
    byYear,
    byDirector,
    actors,
    genres,
    years,
    directors,
    query,
  }
}
