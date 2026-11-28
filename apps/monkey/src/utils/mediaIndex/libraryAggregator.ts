import type { AdVideoDetectOptions } from './junkScanner'
import type {
  ActorFacetStat,
  CollectionCustomMeta,
  DriveLabelFacetCount,
  FacetCount,
  IndexedVideo,
  IndexedVideoLabel,
  LibraryEntry,
  LibraryFileItem,
  LibraryFilterState,
  UncensoredKind,
  UnifiedMediaMeta,
} from './types'
import type { MarkerDoc } from '@/utils/markers/types'
import type { ActorWorksCacheEntry } from '@/utils/superSearch'
import { cleanActorName, normalizeActressName } from '@/utils/actressNameMatcher'
import { normalizeAvNumber } from '@/utils/jav/jav'
import { isEpisodicSeriesFilename, parseCinemaTitle } from './cinemaTitleParser'
import { detectEntryUncensoredKind, isLtxFileName } from './deduplicator'
import { isAdLibraryEntry } from './junkScanner'
import { normalizeManualAvNumber } from './manualMatchStore'
import { PROTECTED_FOLDER_NAMES } from './safeDelete'

export interface AggregateLibraryOptions {
  /** 用户配置的扫描根目录 CID，避免将整颗扫描根文件夹聚合为单一合集 */
  excludedRootCids?: ReadonlySet<string>
  /** 用户手动拆分为独立视频的目录 CID */
  ungroupedCids?: ReadonlySet<string>
  /** 用户自定义的合集元数据（按 cid 索引） */
  customCollections?: Readonly<Record<string, CollectionCustomMeta>>
  /** 用户手动指定的番号绑定映射（mediaKey -> avNumber） */
  manualAvBindings?: Readonly<Record<string, string>>
  /** 目录名称反查函数（优先从本地目录路径缓存读取） */
  folderNameLookup?: (cid: string) => string | undefined
}

export interface YearFacetCount {
  year: number
  count: number
}

export interface LibraryQueryOptions {
  excludeKeys?: ReadonlySet<string>
  hideAdVideos?: boolean
  adFilterOptions?: AdVideoDetectOptions
  mediaNotes?: Readonly<Record<string, string>>
  actorNotes?: Readonly<Record<string, string>>
}

export interface LibraryIndex {
  entries: LibraryEntry[]
  entryMap: Map<string, LibraryEntry>
  byActor: Map<string, Set<string>>
  byGenre: Map<string, Set<string>>
  byYear: Map<number, Set<string>>
  byDirector: Map<string, Set<string>>
  byPublisher: Map<string, Set<string>>
  byUncensored: Map<UncensoredKind, Set<string>>
  byDriveLabel: Map<string, Set<string>>
  actors: FacetCount[]
  actorStats: ActorFacetStat[]
  genres: FacetCount[]
  years: YearFacetCount[]
  directors: FacetCount[]
  publishers: FacetCount[]
  driveLabels: DriveLabelFacetCount[]
  query: (filter: LibraryFilterState, options?: LibraryQueryOptions) => LibraryEntry[]
}

function addToIndex<K>(map: Map<K, Set<string>>, key: K, mediaKey: string) {
  const existing = map.get(key)
  if (existing) {
    existing.add(mediaKey)
    return
  }
  map.set(key, new Set([mediaKey]))
}

function addSetValue<K, V>(map: Map<K, Set<V>>, key: K, value: V) {
  const existing = map.get(key)
  if (existing) {
    existing.add(value)
    return
  }
  map.set(key, new Set([value]))
}

function normalizeNameKey(name: string): string {
  return normalizeActressName(name) || name.trim().toLowerCase()
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

interface SeriesCollectionInfo {
  scopedKey: string
  title: string
  season: number
  episode: number
}

function resolveSeriesCollectionInfo(
  video: IndexedVideo,
  options?: AggregateLibraryOptions,
): SeriesCollectionInfo | null {
  if (video.libraryCategory === 'cinema' || video.customScrapeMode === 'cinema' || video.customScrapeMode === 'none')
    return null
  if (!isEpisodicSeriesFilename(video.name))
    return null

  const folderName = video.cid && video.cid !== '0' ? options?.folderNameLookup?.(video.cid) : undefined
  const parsed = parseCinemaTitle(video.name, folderName)
  if (parsed.mediaType !== 'tv' || !parsed.normalizedKey)
    return null

  const sectionPrefix = video.sectionId ? `sec:${video.sectionId}:` : ''
  return {
    scopedKey: `${sectionPrefix}collection:series:${parsed.normalizedKey}`,
    title: parsed.title,
    season: parsed.season ?? 0,
    episode: parsed.episode ?? 0,
  }
}

function resolveAutoCollectionCids(
  videos: IndexedVideo[],
  options?: AggregateLibraryOptions,
): Set<string> {
  const stats = new Map<string, { total: number, hasAvNumber: boolean, hasFolderCollectionSection: boolean }>()

  for (const video of videos) {
    if (video.libraryCategory === 'cinema' || video.customScrapeMode === 'none')
      continue
    if (video.sectionId && video.customScrapeMode !== 'folder_collection')
      continue
    const cid = video.cid?.trim()
    if (!cid || cid === '0')
      continue
    if (options?.excludedRootCids?.has(cid) || options?.ungroupedCids?.has(cid))
      continue

    const hasAv = !isEpisodicSeriesFilename(video.name) && Boolean(video.avNumber && normalizeAvNumber(video.avNumber))
    const isSectionFolderCollection = video.customScrapeMode === 'folder_collection'
    const current = stats.get(cid)
    if (current) {
      current.total += 1
      if (hasAv && !isSectionFolderCollection)
        current.hasAvNumber = true
      if (isSectionFolderCollection)
        current.hasFolderCollectionSection = true
    }
    else {
      stats.set(cid, {
        total: 1,
        hasAvNumber: isSectionFolderCollection ? false : hasAv,
        hasFolderCollectionSection: isSectionFolderCollection,
      })
    }
  }

  const result = new Set<string>()
  stats.forEach((stat, cid) => {
    if (stat.total < 2 || stat.hasAvNumber)
      return
    if (!stat.hasFolderCollectionSection) {
      const folderName = options?.folderNameLookup?.(cid)?.trim().toLowerCase()
      if (folderName && PROTECTED_FOLDER_NAMES.has(folderName))
        return
    }
    result.add(cid)
  })
  return result
}

function resolveMediaKey(
  video: IndexedVideo,
  collectionCids: ReadonlySet<string>,
  seriesCounts: ReadonlyMap<string, number>,
  options?: AggregateLibraryOptions,
): string {
  const sectionPrefix = video.sectionId ? `sec:${video.sectionId}:` : ''
  const folderName = video.cid && video.cid !== '0' ? options?.folderNameLookup?.(video.cid) : undefined
  const isEpisodic = isEpisodicSeriesFilename(video.name)
  const seriesInfo = isEpisodic ? resolveSeriesCollectionInfo(video, options) : null

  if (video.sectionId) {
    if (video.customScrapeMode === 'folder_collection') {
      if (seriesInfo && (seriesCounts.get(seriesInfo.scopedKey) ?? 0) >= 2)
        return seriesInfo.scopedKey
      if (video.cid && collectionCids.has(video.cid))
        return `collection:${video.cid}`
      return `${sectionPrefix}file:${video.fid}`
    }
    if (video.customScrapeMode === 'none')
      return `${sectionPrefix}file:${video.fid}`
    if (video.customScrapeMode === 'cinema') {
      const parsed = parseCinemaTitle(video.name, folderName)
      return parsed.mediaType === 'movie' && parsed.year
        ? `${sectionPrefix}movie:${parsed.normalizedKey}:${parsed.year}`
        : `${sectionPrefix}${parsed.mediaType}:${parsed.normalizedKey}`
    }
    if (seriesInfo && (seriesCounts.get(seriesInfo.scopedKey) ?? 0) >= 2)
      return seriesInfo.scopedKey
    if (!isEpisodic && video.avNumber) {
      const normalized = normalizeAvNumber(video.avNumber)
      if (normalized)
        return `${sectionPrefix}jav:${normalized}`
    }
    return `${sectionPrefix}file:${video.fid}`
  }

  if (video.libraryCategory === 'cinema') {
    const parsed = parseCinemaTitle(video.name, folderName)
    return parsed.mediaType === 'movie' && parsed.year
      ? `movie:${parsed.normalizedKey}:${parsed.year}`
      : `${parsed.mediaType}:${parsed.normalizedKey}`
  }
  if (seriesInfo && (seriesCounts.get(seriesInfo.scopedKey) ?? 0) >= 2)
    return seriesInfo.scopedKey
  if (!isEpisodic && video.avNumber) {
    const normalized = normalizeAvNumber(video.avNumber)
    if (normalized)
      return `jav:${normalized}`
  }
  if (video.cid && collectionCids.has(video.cid))
    return `collection:${video.cid}`
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

function buildCollectionMeta(
  collectionId: string,
  latestMtime: number,
  options?: AggregateLibraryOptions,
  fallbackTitle?: string,
): UnifiedMediaMeta {
  const custom = options?.customCollections?.[collectionId]
  const folderName = !collectionId.startsWith('series:') ? options?.folderNameLookup?.(collectionId)?.trim() : undefined
  const title = custom?.title?.trim() || fallbackTitle?.trim() || folderName || `合集 #${collectionId}`
  const overview = custom?.overview?.trim() || undefined
  const genres = custom?.genres ?? []
  const actors = (custom?.actors ?? []).map(name => ({ name }))

  return {
    mediaKey: `collection:${collectionId}`,
    kind: 'collection',
    externalId: collectionId,
    title,
    ...(overview ? { overview } : {}),
    directors: [],
    actors,
    genres,
    source: 'collection',
    updatedAt: custom?.updatedAt ?? latestMtime,
  }
}

/** 聚合网盘视频文件、统一元数据与本地打点计数 */
export function aggregateLibraryEntries(
  videos: IndexedVideo[],
  metaMap: Map<string, UnifiedMediaMeta>,
  markerDocs: Record<string, MarkerDoc>,
  options?: AggregateLibraryOptions,
): LibraryEntry[] {
  const collectionCids = resolveAutoCollectionCids(videos, options)
  const seriesCounts = new Map<string, number>()
  const seriesTitleMap = new Map<string, string>()
  const seriesEpisodeMap = new Map<string, { season: number, episode: number }>()

  for (const video of videos) {
    const info = resolveSeriesCollectionInfo(video, options)
    if (!info)
      continue
    seriesCounts.set(info.scopedKey, (seriesCounts.get(info.scopedKey) ?? 0) + 1)
    if (!seriesTitleMap.has(info.scopedKey))
      seriesTitleMap.set(info.scopedKey, info.title)
    seriesEpisodeMap.set(video.fid, { season: info.season, episode: info.episode })
  }

  const groups = new Map<string, {
    videos: IndexedVideo[]
    externalId?: string
    sectionId?: string
    customScrapeMode?: IndexedVideo['customScrapeMode']
  }>()

  videos.forEach((video) => {
    const mediaKey = resolveMediaKey(video, collectionCids, seriesCounts, options)
    const isEpisodic = isEpisodicSeriesFilename(video.name)
    const avId = isEpisodic ? undefined : (video.avNumber ?? undefined)
    const group = groups.get(mediaKey)
    if (group) {
      group.videos.push(video)
      if (!group.externalId && avId)
        group.externalId = avId
      if (!group.sectionId && video.sectionId) {
        group.sectionId = video.sectionId
        group.customScrapeMode = video.customScrapeMode
      }
      return
    }
    groups.set(mediaKey, {
      videos: [video],
      externalId: avId,
      ...(video.sectionId ? { sectionId: video.sectionId, customScrapeMode: video.customScrapeMode } : {}),
    })
  })

  return Array.from(groups.entries()).map(([mediaKey, group]) => {
    const unprefixedKey = mediaKey.startsWith('sec:')
      ? mediaKey.slice(mediaKey.indexOf(':', 4) + 1)
      : mediaKey
    const isCollection = unprefixedKey.startsWith('collection:')
    const isSeriesCollection = unprefixedKey.startsWith('collection:series:')
    const sortedVideos = [...group.videos].sort((a, b) => {
      if (isSeriesCollection) {
        const ea = seriesEpisodeMap.get(a.fid)
        const eb = seriesEpisodeMap.get(b.fid)
        if (ea && eb) {
          if (ea.season !== eb.season)
            return ea.season - eb.season
          if (ea.episode !== eb.episode)
            return ea.episode - eb.episode
        }
        return a.name.localeCompare(b.name, 'zh-CN')
      }
      return b.mtime - a.mtime || b.size - a.size
    })
    const files = sortedVideos.map(toLibraryFile)
    const latestMtime = files.reduce((max, file) => Math.max(max, file.mtime), 0)
    const isCinemaEntry = unprefixedKey.startsWith('movie:') || unprefixedKey.startsWith('tv:')
    const rawManualAv = !isCollection && !isCinemaEntry
      ? options?.manualAvBindings?.[mediaKey]
      : undefined
    const manualAv = rawManualAv ? normalizeManualAvNumber(rawManualAv) || undefined : undefined
    const manualAvKey = manualAv ? normalizeAvNumber(manualAv) : ''
    const rawMeta = isCollection
      ? buildCollectionMeta(
          unprefixedKey.slice('collection:'.length),
          latestMtime,
          options,
          seriesTitleMap.get(mediaKey),
        )
      : manualAv
        ? (manualAvKey ? (metaMap.get(`jav:${manualAvKey}`) ?? null) : null)
        : (metaMap.get(mediaKey) ?? metaMap.get(unprefixedKey) ?? null)
    const meta = !isCollection && manualAv && rawMeta && rawMeta.mediaKey !== mediaKey
      ? { ...rawMeta, mediaKey }
      : rawMeta
    const externalId = isCollection
      ? undefined
      : manualAv
        ? (meta?.externalId ?? manualAv)
        : (meta?.externalId ?? group.externalId)
    const kind = isCollection
      ? 'collection'
      : unprefixedKey.startsWith('movie:')
        ? 'movie'
        : unprefixedKey.startsWith('tv:')
          ? 'tv'
          : (meta?.kind ?? (externalId ? 'jav' : 'unknown'))
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    const maxDuration = files.reduce((max, file) => Math.max(max, file.duration), 0)
    const markerCount = files.reduce((sum, file) => sum + countDocMarkers(markerDocs[file.pickCode]), 0)
    const starred = files.some(file => Boolean(file.starred))
    const driveLabels = collectDriveLabels(files)
    const uncensoredKind = detectEntryUncensoredKind({
      kind,
      externalId,
      files,
      meta,
      driveLabels,
    })
    const isLtx = uncensoredKind === 'ltx' || files.some(file => isLtxFileName(file.name))

    return {
      mediaKey,
      kind,
      externalId,
      ...(group.sectionId ? { sectionId: group.sectionId } : {}),
      ...(group.customScrapeMode ? { customScrapeMode: group.customScrapeMode } : {}),
      meta,
      files,
      latestMtime,
      markerCount,
      totalSize,
      maxDuration,
      starred,
      ...(isLtx ? { isLtx } : {}),
      ...(uncensoredKind ? { uncensoredKind } : {}),
      driveLabels,
    }
  })
}

function matchesActorText(rawName: string, keyword: string, normalizedKeyword: string): boolean {
  if (rawName.toLowerCase().includes(keyword))
    return true
  return Boolean(normalizedKeyword) && normalizeActressName(rawName).includes(normalizedKeyword)
}

function matchesKeyword(
  entry: LibraryEntry,
  keyword: string,
  normalizedKeyword: string,
  extraActorNames?: Set<string>,
  options?: LibraryQueryOptions,
): boolean {
  if (entry.externalId?.toLowerCase().includes(keyword))
    return true
  if (entry.meta?.title.toLowerCase().includes(keyword))
    return true
  if (options?.mediaNotes?.[entry.mediaKey]?.toLowerCase().includes(keyword))
    return true
  if (entry.files.some(file => file.name.toLowerCase().includes(keyword)))
    return true
  if (entry.meta?.actors.some((actor) => {
    if (matchesActorText(actor.name, keyword, normalizedKeyword))
      return true
    const actorKey = normalizeActressName(actor.name)
    return Boolean(actorKey && options?.actorNotes?.[actorKey]?.toLowerCase().includes(keyword))
  })) {
    return true
  }
  if (extraActorNames && Array.from(extraActorNames).some(name => matchesActorText(name, keyword, normalizedKeyword)))
    return true
  if (entry.meta?.genres.some(genre => genre.toLowerCase().includes(keyword)))
    return true
  if (entry.meta?.directors.some(director => director.toLowerCase().includes(keyword)))
    return true
  if (entry.meta?.publisher?.toLowerCase().includes(keyword))
    return true
  if (entry.meta?.studio?.toLowerCase().includes(keyword))
    return true
  if (entry.driveLabels.some(label => label.name.toLowerCase().includes(keyword)))
    return true
  if (entry.uncensoredKind && getUncensoredSearchTerms(entry.uncensoredKind).some(term => term.includes(keyword)))
    return true
  return false
}

const UNCENSORED_SEARCH_TERMS: Record<UncensoredKind, readonly string[]> = {
  ltx: ['ltx', '无码', '無碼', '去码', '去碼', '高级去码', 'uncensored', 'demosaic'],
  lada: ['lada', 'restored', '无码', '無碼', '去码', '去碼', 'uncensored', 'demosaic'],
  native: ['无码', '無碼', '原生无码', '原生無碼', '步兵', 'uncensored'],
  cracked: ['破解', '无码', '無碼', '去码', '去碼', '破坏版', '破壞版', '流出', '无码流出', '無碼流出', 'leaked', 'demosaic', 'uncensored'],
}

function getUncensoredSearchTerms(kind: UncensoredKind): readonly string[] {
  return UNCENSORED_SEARCH_TERMS[kind]
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

  if (filter.sortBy === 'rating') {
    const ra = a.meta?.rating && a.meta.rating > 0 ? a.meta.rating : 0
    const rb = b.meta?.rating && b.meta.rating > 0 ? b.meta.rating : 0
    if (ra === 0 && rb === 0)
      return (a.latestMtime - b.latestMtime) * factor
    if (ra === 0)
      return 1
    if (rb === 0)
      return -1
    if (ra !== rb)
      return (ra - rb) * factor
    const ca = a.meta?.ratingCount ?? 0
    const cb = b.meta?.ratingCount ?? 0
    if (ca !== cb)
      return (ca - cb) * factor
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

function pickActorDisplayName(
  key: string,
  preferredNames: Map<string, string>,
  nameCounts: Map<string, number> | undefined,
): string {
  const preferred = preferredNames.get(key)
  if (preferred)
    return preferred

  if (!nameCounts || nameCounts.size === 0)
    return key

  return Array.from(nameCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))[0]?.[0] ?? key
}

/** 构建内存倒排索引与毫秒级查询接口（支持演员繁简/别名归一化并复用超级搜索演员反查缓存） */
export function buildLibraryIndex(
  entries: LibraryEntry[],
  actorWorks: ActorWorksCacheEntry[] = [],
): LibraryIndex {
  const entryMap = new Map<string, LibraryEntry>()
  const entryByAvKey = new Map<string, string>()
  const aliasToCanonical = new Map<string, string>()
  const preferredNames = new Map<string, string>()
  const knownAliases = new Map<string, Set<string>>()

  actorWorks.forEach((item) => {
    const cleanedKeyInput = cleanActorName(item.actorKey || item.name)
    const canonicalKey = normalizeNameKey(cleanedKeyInput)
    if (!canonicalKey)
      return

    const cleanedItemName = cleanActorName(item.name)
    if (cleanedItemName && !preferredNames.has(canonicalKey))
      preferredNames.set(canonicalKey, cleanedItemName)

    aliasToCanonical.set(canonicalKey, canonicalKey)
    const names = [cleanedItemName, ...item.aliases.map(alias => cleanActorName(alias))].filter(Boolean)
    names.forEach((name) => {
      addSetValue(knownAliases, canonicalKey, name)
      const norm = normalizeNameKey(name)
      if (norm && !aliasToCanonical.has(norm))
        aliasToCanonical.set(norm, canonicalKey)
    })
  })

  function resolveActorKey(name: string): string {
    const norm = normalizeNameKey(name)
    if (!norm)
      return ''
    return aliasToCanonical.get(norm) ?? norm
  }

  const byActorKey = new Map<string, Set<string>>()
  const nameCountsByKey = new Map<string, Map<string, number>>()
  const rawAliasesByKey = new Map<string, Set<string>>()
  const avatarByKey = new Map<string, string>()
  const sexVotesByKey = new Map<string, { female: number, male: number }>()
  const actorKeysByMedia = new Map<string, Set<string>>()

  const byGenre = new Map<string, Set<string>>()
  const byYear = new Map<number, Set<string>>()
  const byDirector = new Map<string, Set<string>>()
  const byPublisher = new Map<string, Set<string>>()
  const byUncensored = new Map<UncensoredKind, Set<string>>()
  const byDriveLabel = new Map<string, Set<string>>()
  const driveLabelMeta = new Map<string, { id: string, name: string, color?: string }>()

  entries.forEach((entry) => {
    entryMap.set(entry.mediaKey, entry)
    if (entry.mediaKey.startsWith('jav:'))
      entryByAvKey.set(entry.mediaKey.slice(4), entry.mediaKey)
    if (entry.externalId) {
      const normalizedAv = normalizeAvNumber(entry.externalId)
      if (normalizedAv)
        entryByAvKey.set(normalizedAv, entry.mediaKey)
    }

    entry.driveLabels.forEach((label) => {
      const key = label.id || label.name
      if (!key)
        return
      addToIndex(byDriveLabel, key, entry.mediaKey)
      if (!driveLabelMeta.has(key)) {
        driveLabelMeta.set(key, {
          id: key,
          name: label.name || key,
          ...(label.color ? { color: label.color } : {}),
        })
      }
    })

    if (entry.uncensoredKind)
      addToIndex(byUncensored, entry.uncensoredKind, entry.mediaKey)

    if (!entry.meta)
      return

    if (entry.kind !== 'movie' && entry.kind !== 'tv') {
      entry.meta.actors.forEach((actor) => {
        const rawName = cleanActorName(actor.name)
        if (!rawName)
          return
        const key = resolveActorKey(rawName)
        if (!key)
          return

        addToIndex(byActorKey, key, entry.mediaKey)
        addSetValue(actorKeysByMedia, entry.mediaKey, key)
        addSetValue(rawAliasesByKey, key, rawName)

        const counts = nameCountsByKey.get(key) ?? new Map<string, number>()
        counts.set(rawName, (counts.get(rawName) ?? 0) + 1)
        nameCountsByKey.set(key, counts)

        if (actor.avatarUrl && !avatarByKey.has(key))
          avatarByKey.set(key, actor.avatarUrl)

        if (actor.sex === 1 || actor.sex === 0) {
          const votes = sexVotesByKey.get(key) ?? { female: 0, male: 0 }
          if (actor.sex === 1)
            votes.female += 1
          else
            votes.male += 1
          sexVotesByKey.set(key, votes)
        }
      })
    }

    entry.meta.genres.forEach(genre => addToIndex(byGenre, genre, entry.mediaKey))
    entry.meta.directors.forEach(director => addToIndex(byDirector, director, entry.mediaKey))
    const publisherName = (entry.meta.publisher || entry.meta.studio)?.trim()
    if (publisherName)
      addToIndex(byPublisher, publisherName, entry.mediaKey)
    if (entry.meta.year)
      addToIndex(byYear, entry.meta.year, entry.mediaKey)
  })

  actorWorks.forEach((item) => {
    const canonicalKey = resolveActorKey(cleanActorName(item.actorKey || item.name))
    if (!canonicalKey)
      return

    const actorNames = [cleanActorName(item.name), ...item.aliases.map(name => cleanActorName(name))].filter(Boolean)
    item.avNumbers.forEach((av) => {
      const avKey = normalizeAvNumber(av)
      const mediaKey = avKey ? entryByAvKey.get(avKey) : undefined
      if (!mediaKey)
        return

      addToIndex(byActorKey, canonicalKey, mediaKey)
      addSetValue(actorKeysByMedia, mediaKey, canonicalKey)
      actorNames.forEach((name) => {
        addSetValue(rawAliasesByKey, canonicalKey, name)
      })
    })
  })

  const byActor = new Map<string, Set<string>>()
  const allNamesByKey = new Map<string, string[]>()
  const actorStats: ActorFacetStat[] = Array.from(byActorKey.entries()).map(([key, keys]) => {
    const displayName = pickActorDisplayName(key, preferredNames, nameCountsByKey.get(key))
    byActor.set(displayName, keys)

    const aliasSet = new Set<string>()
    rawAliasesByKey.get(key)?.forEach((alias) => {
      if (alias !== displayName)
        aliasSet.add(alias)
    })
    knownAliases.get(key)?.forEach((alias) => {
      if (alias !== displayName)
        aliasSet.add(alias)
    })
    const aliases = Array.from(aliasSet)
    allNamesByKey.set(key, [displayName, ...aliases])

    let scrapedCount = 0
    let markedCount = 0
    let totalSize = 0
    let latestMtime = 0
    keys.forEach((mediaKey) => {
      const item = entryMap.get(mediaKey)
      if (!item)
        return
      if (item.meta !== null)
        scrapedCount += 1
      if (item.markerCount > 0)
        markedCount += 1
      totalSize += item.totalSize
      if (item.latestMtime > latestMtime)
        latestMtime = item.latestMtime
    })

    const votes = sexVotesByKey.get(key)
    const resolvedSex: 0 | 1 | undefined = votes
      ? (votes.female >= votes.male ? 1 : 0)
      : undefined

    return {
      key,
      name: displayName,
      count: keys.size,
      aliases,
      scrapedCount,
      markedCount,
      totalSize,
      latestMtime,
      ...(avatarByKey.get(key) ? { avatarUrl: avatarByKey.get(key) } : {}),
      ...(resolvedSex !== undefined ? { sex: resolvedSex } : {}),
    }
  }).sort((a, b) => b.count - a.count || b.latestMtime - a.latestMtime || a.name.localeCompare(b.name, 'zh-CN'))

  function getMediaActorSearchNames(mediaKey: string): Set<string> | undefined {
    const keys = actorKeysByMedia.get(mediaKey)
    if (!keys || keys.size === 0)
      return undefined
    const names = new Set<string>()
    keys.forEach((key) => {
      allNamesByKey.get(key)?.forEach(name => names.add(name))
    })
    return names
  }

  const actors: FacetCount[] = actorStats.map(stat => ({ name: stat.name, count: stat.count }))
  const genres = toFacetCounts(byGenre)
  const directors = toFacetCounts(byDirector)
  const publishers = toFacetCounts(byPublisher)
  const years = Array.from(byYear.entries())
    .map(([year, keys]) => ({ year, count: keys.size }))
    .sort((a, b) => b.year - a.year)
  const driveLabels: DriveLabelFacetCount[] = Array.from(byDriveLabel.entries())
    .map(([key, keys]) => {
      const meta = driveLabelMeta.get(key)
      return {
        id: key,
        name: meta?.name ?? key,
        ...(meta?.color ? { color: meta.color } : {}),
        count: keys.size,
      }
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'))

  function query(filter: LibraryFilterState, options?: LibraryQueryOptions): LibraryEntry[] {
    const facetSets: Array<Set<string> | undefined> = []
    if (filter.actor)
      facetSets.push(byActor.get(filter.actor) ?? byActorKey.get(resolveActorKey(filter.actor)))
    if (filter.genre)
      facetSets.push(byGenre.get(filter.genre))
    if (filter.director)
      facetSets.push(byDirector.get(filter.director))
    if (filter.publisher)
      facetSets.push(byPublisher.get(filter.publisher))
    if (filter.year !== undefined)
      facetSets.push(byYear.get(filter.year))
    if (filter.driveLabel)
      facetSets.push(byDriveLabel.get(filter.driveLabel))
    if (filter.uncensoredKind)
      facetSets.push(byUncensored.get(filter.uncensoredKind))
    if (filter.onlyLtx)
      facetSets.push(byUncensored.get('ltx'))

    const candidateKeys = intersectSets(facetSets)
    const candidates = candidateKeys
      ? Array.from(candidateKeys).map(key => entryMap.get(key)).filter((item): item is LibraryEntry => Boolean(item))
      : entries

    const keyword = filter.keyword.trim().toLowerCase()
    const normalizedKeyword = normalizeActressName(filter.keyword)
    const filtered = candidates.filter((entry) => {
      if (options?.excludeKeys?.has(entry.mediaKey))
        return false
      if (options?.hideAdVideos && isAdLibraryEntry(entry, options.adFilterOptions))
        return false
      if (filter.view === 'all' && (entry.kind === 'movie' || entry.kind === 'tv' || Boolean(entry.sectionId)))
        return false
      if (filter.view === 'cinema' && (Boolean(entry.sectionId) || (entry.kind !== 'movie' && entry.kind !== 'tv')))
        return false
      if (filter.view.startsWith('section:')) {
        const targetSectionId = filter.view.slice('section:'.length)
        if (entry.sectionId !== targetSectionId)
          return false
      }
      if ((filter.view === 'starred' || filter.onlyStarred) && !entry.starred)
        return false
      if ((filter.view === 'marked' || filter.onlyMarked) && entry.markerCount <= 0)
        return false
      if (filter.onlyLtx && !entry.isLtx)
        return false
      if (filter.onlyUncensored && !entry.uncensoredKind)
        return false
      if (filter.scrapeStatus === 'scraped' && entry.meta === null)
        return false
      if (filter.scrapeStatus === 'unscraped' && entry.meta !== null)
        return false
      if (keyword && !matchesKeyword(entry, keyword, normalizedKeyword, getMediaActorSearchNames(entry.mediaKey), options))
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
    byPublisher,
    byUncensored,
    byDriveLabel,
    actors,
    actorStats,
    genres,
    years,
    directors,
    publishers,
    driveLabels,
    query,
  }
}
