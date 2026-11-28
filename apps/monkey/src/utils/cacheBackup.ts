import type { CacheValue } from '@115master/shared'
import type { ArchiveBlobDescriptor, ArchiveBlobInput, CacheBackupArchiveManifest } from './cacheBackupArchive'
import type { FolderPathInfo } from '@/utils/driveFolderPath'
import type { JavInfo } from '@/utils/jav/jav'
import type { MarkerDoc } from '@/utils/markers/types'
import type { ActorProfile } from '@/utils/mediaIndex/actorProfileFetcher'
import type { UnifiedMediaMeta } from '@/utils/mediaIndex/types'
import type { CustomAvatarRecord, CustomCoverRecord, CustomMediaRecord, ScrapeMissEntry } from '@/utils/mediaIndex/videoIndexStore'
import type { ActorWorksCacheEntry, IndexedVideo, VideoIndexSnapshot } from '@/utils/superSearch/types'
import type { Settings } from '@/utils/userSettings'
import { javCache } from '@/utils/cache/javCache'
import { markerStore } from '@/utils/cache/markerStore'
import { folderPathResolver } from '@/utils/driveFolderPath'
import { normalizeAvNumber } from '@/utils/jav/jav'
import { actorProfileCache } from '@/utils/mediaIndex/actorProfileFetcher'
import { cinemaCache } from '@/utils/mediaIndex/cinemaScraper'
import { aggregateLibraryEntries } from '@/utils/mediaIndex/libraryAggregator'
import {
  customMediaCache,
  posterThumbCache,
  saveCustomAvatar,
  saveCustomCover,
  scrapeMissCache,
} from '@/utils/mediaIndex/videoIndexStore'
import { getAllCachedActorWorks, saveActorWorks } from '@/utils/superSearch/actorWorksStore'
import { loadVideoIndexSnapshot, saveVideoIndexSnapshot } from '@/utils/superSearch/videoIndexStore'
import { userSettings } from '@/utils/userSettings'
import {
  ARCHIVE_MAGIC,
  encodeBackupArchive,
  isBackupArchiveBuffer,
  peekBackupArchive,
  readArchiveBlob,
} from './cacheBackupArchive'

export const CACHE_BACKUP_SCHEMA_VERSION = 1

export type ImportCacheMode = 'merge' | 'overwrite'

export interface CacheBackupData {
  videoIndex?: VideoIndexSnapshot | null
  javMeta?: Record<string, JavInfo>
  cinemaMeta?: Record<string, UnifiedMediaMeta>
  scrapeMisses?: Record<string, ScrapeMissEntry>
  actorWorks?: ActorWorksCacheEntry[]
  actorProfiles?: Record<string, ActorProfile>
  markers?: Record<string, MarkerDoc>
  folderPaths?: FolderPathInfo[]
  userSettings?: Partial<Settings>
  libraryPrefs?: Record<string, string>
}

export interface CacheBackupPayload {
  schemaVersion: 1
  exportedAt: number
  appVersion?: string
  data: CacheBackupData
}

export interface CacheBackupStats {
  videoCount: number
  javMetaCount: number
  cinemaMetaCount: number
  scrapeMissCount: number
  actorWorksCount: number
  actorProfileCount: number
  markerDocCount: number
  folderPathCount: number
  hasUserSettings: boolean
  libraryPrefCount: number
  customCoverCount: number
  customAvatarCount: number
  posterThumbCount: number
}

const FOLDER_PATH_STORAGE_KEY = '115Master_folder_path_cache_v1'
const MAX_FOLDER_PATH_ENTRIES = 20000

const LIBRARY_PREF_KEYS = [
  '115Master_library_hidden_actors',
  '115Master_library_favorite_actors',
  '115Master_library_actor_notes_v1',
  '115Master_library_media_notes_v1',
  '115Master_library_ad_max_duration_sec',
  '115Master_library_ad_max_size_mb',
  '115Master_library_ad_match_mode',
  '115Master_library_hide_ad_videos',
  '115Master_library_view',
  '115Master_library_sort_by',
  '115Master_library_sort_order',
  '115Master_cleanup_dup_page_size',
  '115Master_cleanup_junk_page_size',
  '115Master_library_collection_meta_v1',
  '115Master_library_ungrouped_collections_v1',
  '115Master_library_manual_av_bindings_v1',
] as const

const LIBRARY_PREF_KEY_SET = new Set<string>(LIBRARY_PREF_KEYS)

/** 合并网盘视频索引快照 */
export function mergeVideoIndexSnapshots(
  local: VideoIndexSnapshot | null,
  incoming: VideoIndexSnapshot,
  mode: ImportCacheMode,
): VideoIndexSnapshot {
  if (mode === 'overwrite' || !local) {
    return {
      ...incoming,
      items: [...incoming.items].sort((a, b) => b.mtime - a.mtime),
    }
  }

  const byFid = new Map<string, IndexedVideo>()
  const preferIncomingOnTie = incoming.lastSyncAt >= local.lastSyncAt

  for (const item of local.items)
    byFid.set(item.fid, item)

  for (const item of incoming.items) {
    if (!byFid.has(item.fid) || preferIncomingOnTie)
      byFid.set(item.fid, item)
  }

  const rootCids = Array.from(new Set([...local.rootCids, ...incoming.rootCids]))
  const items = Array.from(byFid.values()).sort((a, b) => b.mtime - a.mtime)

  return {
    schemaVersion: 1,
    rootCids: rootCids.length > 0 ? rootCids : ['0'],
    lastFullSyncAt: Math.max(local.lastFullSyncAt, incoming.lastFullSyncAt),
    lastSyncAt: Math.max(local.lastSyncAt, incoming.lastSyncAt),
    ...(incoming.avRuleVersion ?? local.avRuleVersion
      ? { avRuleVersion: Math.max(incoming.avRuleVersion ?? 0, local.avRuleVersion ?? 0) }
      : {}),
    items,
  }
}

/** 合并单个视频的打点文档 */
export function mergeMarkerDocs(
  local: MarkerDoc | null,
  incoming: MarkerDoc,
  mode: ImportCacheMode,
): MarkerDoc {
  if (mode === 'overwrite' || !local)
    return incoming

  const byId = new Map(local.markers.map(marker => [marker.id, marker]))
  for (const marker of incoming.markers) {
    const existing = byId.get(marker.id)
    if (!existing) {
      byId.set(marker.id, marker)
      continue
    }
    const existingAt = existing.updatedAt ?? 0
    const incomingAt = marker.updatedAt ?? 0
    if (incomingAt >= existingAt)
      byId.set(marker.id, marker)
  }

  return {
    ...local,
    ...incoming,
    markers: Array.from(byId.values()).sort((a, b) => a.time - b.time),
    updatedAt: Math.max(local.updatedAt ?? 0, incoming.updatedAt ?? 0),
  }
}

/** 统计备份文件内各类数据条数 */
export function summarizeCacheBackup(
  payload: Pick<CacheBackupPayload, 'data'>,
  blobs: readonly Pick<ArchiveBlobDescriptor, 'kind'>[] = [],
): CacheBackupStats {
  const { data } = payload
  let customCoverCount = 0
  let customAvatarCount = 0
  let posterThumbCount = 0
  for (const blob of blobs) {
    if (blob.kind === 'customCoverThumb')
      customCoverCount += 1
    else if (blob.kind === 'customAvatar')
      customAvatarCount += 1
    else if (blob.kind === 'posterThumb')
      posterThumbCount += 1
  }

  return {
    videoCount: data.videoIndex?.items?.length ?? 0,
    javMetaCount: data.javMeta ? Object.keys(data.javMeta).length : 0,
    cinemaMetaCount: data.cinemaMeta ? Object.keys(data.cinemaMeta).length : 0,
    scrapeMissCount: data.scrapeMisses ? Object.keys(data.scrapeMisses).length : 0,
    actorWorksCount: data.actorWorks?.length ?? 0,
    actorProfileCount: data.actorProfiles ? Object.keys(data.actorProfiles).length : 0,
    markerDocCount: data.markers ? Object.keys(data.markers).length : 0,
    folderPathCount: data.folderPaths?.length ?? 0,
    hasUserSettings: Boolean(data.userSettings && Object.keys(data.userSettings).length > 0),
    libraryPrefCount: data.libraryPrefs ? Object.keys(data.libraryPrefs).length : 0,
    customCoverCount,
    customAvatarCount,
    posterThumbCount,
  }
}

/** 解析并校验备份 JSON 字符串 */
export function parseCacheBackup(rawText: string): CacheBackupPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  }
  catch {
    throw new Error('备份文件不是有效的 JSON 格式')
  }

  if (!parsed || typeof parsed !== 'object')
    throw new Error('备份文件结构无效')

  const record = parsed as Partial<CacheBackupPayload>
  if (record.schemaVersion !== CACHE_BACKUP_SCHEMA_VERSION)
    throw new Error(`不支持的备份版本：${String(record.schemaVersion ?? '未知')}`)

  if (!record.data || typeof record.data !== 'object')
    throw new Error('备份文件缺少 data 字段')

  return {
    schemaVersion: CACHE_BACKUP_SCHEMA_VERSION,
    exportedAt: typeof record.exportedAt === 'number' ? record.exportedAt : Date.now(),
    ...(typeof record.appVersion === 'string' ? { appVersion: record.appVersion } : {}),
    data: record.data,
  }
}

async function readAllJavMetaRecord(): Promise<Record<string, JavInfo>> {
  const result: Record<string, JavInfo> = {}
  await javCache.storage.iterate<CacheValue<JavInfo> | null, void>((entry: CacheValue<JavInfo> | null, key: string) => {
    if (entry?.value)
      result[key] = entry.value
  })
  return result
}

async function readAllCinemaMetaRecord(): Promise<Record<string, UnifiedMediaMeta>> {
  const result: Record<string, UnifiedMediaMeta> = {}
  await cinemaCache.storage.iterate<CacheValue<UnifiedMediaMeta> | null, void>((entry: CacheValue<UnifiedMediaMeta> | null, key: string) => {
    if (entry?.value)
      result[key] = entry.value
  })
  return result
}

async function readAllScrapeMissRecord(): Promise<Record<string, ScrapeMissEntry>> {
  const result: Record<string, ScrapeMissEntry> = {}
  const now = Date.now()
  await scrapeMissCache.storage.iterate<CacheValue<ScrapeMissEntry> | null, void>((entry: CacheValue<ScrapeMissEntry> | null, key: string) => {
    if (entry?.value && entry.value.expiresAt > now)
      result[key] = entry.value
  })
  return result
}

async function readAllActorProfilesRecord(): Promise<Record<string, ActorProfile>> {
  const result: Record<string, ActorProfile> = {}
  await actorProfileCache.storage.iterate<CacheValue<ActorProfile> | null, void>((entry: CacheValue<ActorProfile> | null, key: string) => {
    if (entry?.value)
      result[key] = entry.value
  })
  return result
}

function readFolderPathsFromStorage(): FolderPathInfo[] {
  if (typeof localStorage === 'undefined')
    return []
  try {
    const raw = localStorage.getItem(FOLDER_PATH_STORAGE_KEY)
    if (!raw)
      return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as FolderPathInfo[]) : []
  }
  catch {
    return []
  }
}

function readLibraryPrefsFromStorage(): Record<string, string> {
  if (typeof localStorage === 'undefined')
    return {}
  const result: Record<string, string> = {}
  for (const key of LIBRARY_PREF_KEYS) {
    const val = localStorage.getItem(key)
    if (val !== null)
      result[key] = val
  }
  return result
}

/** 导出当前设备上的全部影视库与脚本缓存数据 */
export async function exportCacheBackup(): Promise<{ payload: CacheBackupPayload, stats: CacheBackupStats }> {
  const [videoIndex, javMeta, cinemaMeta, scrapeMisses, actorWorks, actorProfiles, markers] = await Promise.all([
    loadVideoIndexSnapshot(),
    readAllJavMetaRecord(),
    readAllCinemaMetaRecord(),
    readAllScrapeMissRecord(),
    getAllCachedActorWorks(),
    readAllActorProfilesRecord(),
    markerStore.getAllDocs(),
  ])

  const folderPaths = readFolderPathsFromStorage()
  const libraryPrefs = readLibraryPrefsFromStorage()

  const payload: CacheBackupPayload = {
    schemaVersion: CACHE_BACKUP_SCHEMA_VERSION,
    exportedAt: Date.now(),
    ...(typeof __115MASTER_VERSION__ === 'string' ? { appVersion: __115MASTER_VERSION__ } : {}),
    data: {
      videoIndex,
      javMeta,
      cinemaMeta,
      scrapeMisses,
      actorWorks,
      actorProfiles,
      markers,
      folderPaths,
      userSettings: { ...userSettings.value },
      libraryPrefs,
    },
  }

  return {
    payload,
    stats: summarizeCacheBackup(payload),
  }
}

function formatBackupFilename(timestamp: number, ext: 'json' | '115bak' = '115bak'): string {
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  const datePart = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  const timePart = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `115master-cache-backup-${datePart}-${timePart}.${ext}`
}

function triggerBlobDownload(blob: Blob, filename: string): { filename: string, sizeBytes: number } {
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)

  return { filename, sizeBytes: blob.size }
}

/** 触发浏览器下载备份 JSON 文件 */
export function downloadCacheBackupFile(payload: CacheBackupPayload): { filename: string, sizeBytes: number } {
  const json = JSON.stringify(payload)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  return triggerBlobDownload(blob, formatBackupFilename(payload.exportedAt, 'json'))
}

/** 触发浏览器下载 .115bak 单文件归档 */
export function downloadCacheArchiveFile(blob: Blob, filename: string): { filename: string, sizeBytes: number } {
  return triggerBlobDownload(blob, filename)
}

/** 导出包含文字缓存与可选图片资源的单个 .115bak 二进制归档 */
export async function exportCacheArchive(options: {
  includeCustomMedia?: boolean
  includePosterThumbs?: boolean
  onProgress?: (text: string) => void
} = {}): Promise<{ blob: Blob, filename: string, sizeBytes: number, stats: CacheBackupStats }> {
  const includeCustomMedia = options.includeCustomMedia !== false
  const includePosterThumbs = options.includePosterThumbs === true

  options.onProgress?.('正在收集索引与刮削元数据…')
  const { payload } = await exportCacheBackup()
  const blobInputs: ArchiveBlobInput[] = []
  const customCoverKeys = new Set<string>()

  if (includeCustomMedia) {
    options.onProgress?.('正在收集自定义封面与头像…')
    await customMediaCache.storage.iterate<CacheValue<CustomMediaRecord> | null, void>((entry: CacheValue<CustomMediaRecord> | null) => {
      const record = entry?.value
      if (!record)
        return
      if (record.kind === 'cover' && record.mediaKey) {
        customCoverKeys.add(record.mediaKey)
        if (record.thumbBlob instanceof Blob && record.thumbBlob.size > 0) {
          blobInputs.push({
            kind: 'customCoverThumb',
            key: record.mediaKey,
            blob: record.thumbBlob,
            sourceLabel: record.sourceLabel,
            updatedAt: record.updatedAt,
          })
        }
        if (record.fullBlob instanceof Blob && record.fullBlob.size > 0) {
          blobInputs.push({
            kind: 'customCoverFull',
            key: record.mediaKey,
            blob: record.fullBlob,
            sourceLabel: record.sourceLabel,
            updatedAt: record.updatedAt,
          })
        }
        return
      }
      if (record.kind === 'avatar' && record.actorKey && record.blob instanceof Blob && record.blob.size > 0) {
        blobInputs.push({
          kind: 'customAvatar',
          key: record.actorKey,
          blob: record.blob,
          sourceLabel: record.sourceLabel,
          updatedAt: record.updatedAt,
        })
      }
    })
  }

  if (includePosterThumbs) {
    options.onProgress?.('正在收集海报墙缩略图缓存…')
    await posterThumbCache.storage.iterate<CacheValue<Blob> | null, void>((entry: CacheValue<Blob> | null, key: string) => {
      const val = entry?.value
      if (!(val instanceof Blob) || val.size <= 0)
        return
      if (customCoverKeys.has(key))
        return
      blobInputs.push({
        kind: 'posterThumb',
        key,
        blob: val,
      })
    })
  }

  options.onProgress?.(`正在打包归档（${blobInputs.length} 个图片资源）…`)
  const blob = await encodeBackupArchive(
    {
      exportedAt: payload.exportedAt,
      appVersion: payload.appVersion,
      data: payload.data,
    },
    blobInputs,
  )

  const descriptorSummary = blobInputs.map(item => ({ kind: item.kind }))
  const stats = summarizeCacheBackup(payload, descriptorSummary)
  const filename = formatBackupFilename(payload.exportedAt, '115bak')

  return {
    blob,
    filename,
    sizeBytes: blob.size,
    stats,
  }
}

export type InspectedBackupFile
  = | {
    format: 'json'
    payload: CacheBackupPayload
    stats: CacheBackupStats
  }
  | {
    format: 'archive'
    file: Blob
    manifest: CacheBackupArchiveManifest<CacheBackupData>
    blobSectionOffset: number
    stats: CacheBackupStats
  }

/** 识别并预览 .115bak 或旧版 .json 备份文件 */
export async function inspectBackupFile(file: Blob): Promise<InspectedBackupFile> {
  const headerSlice = file.slice(0, ARCHIVE_MAGIC.length)
  const headerBytes = new Uint8Array(await headerSlice.arrayBuffer())
  if (isBackupArchiveBuffer(headerBytes)) {
    const { manifest, blobSectionOffset } = await peekBackupArchive<CacheBackupData>(file)
    const stats = summarizeCacheBackup({ data: manifest.data }, manifest.blobs)
    return {
      format: 'archive',
      file,
      manifest,
      blobSectionOffset,
      stats,
    }
  }

  const text = await file.text()
  const payload = parseCacheBackup(text)
  return {
    format: 'json',
    payload,
    stats: summarizeCacheBackup(payload),
  }
}

/** 将备份数据注入当前设备缓存（默认合并保留较新记录） */
export async function importCacheBackup(
  payload: CacheBackupPayload,
  options: { mode?: ImportCacheMode } = {},
): Promise<CacheBackupStats> {
  const mode = options.mode ?? 'merge'
  const { data } = payload

  if (data.videoIndex && Array.isArray(data.videoIndex.items)) {
    const localSnapshot = await loadVideoIndexSnapshot()
    const mergedSnapshot = mergeVideoIndexSnapshots(localSnapshot, data.videoIndex, mode)
    await saveVideoIndexSnapshot(mergedSnapshot)
  }

  if (data.javMeta && typeof data.javMeta === 'object') {
    const entries = Object.entries(data.javMeta)
    for (let i = 0; i < entries.length; i += 50) {
      const batch = entries.slice(i, i + 50)
      await Promise.all(
        batch.map(async ([key, info]) => {
          if (!info)
            return
          if (mode === 'merge') {
            const existing = await javCache.get(key)
            if (existing?.value)
              return
          }
          await javCache.set(key, info)
        }),
      )
    }
  }

  if (data.cinemaMeta && typeof data.cinemaMeta === 'object') {
    const entries = Object.entries(data.cinemaMeta)
    for (let i = 0; i < entries.length; i += 50) {
      const batch = entries.slice(i, i + 50)
      await Promise.all(
        batch.map(async ([key, meta]) => {
          if (!meta)
            return
          if (mode === 'merge') {
            const existing = await cinemaCache.get(key)
            if (existing?.value && (existing.value.updatedAt ?? 0) >= (meta.updatedAt ?? 0))
              return
          }
          await cinemaCache.set(key, meta)
        }),
      )
    }
  }

  if (data.scrapeMisses && typeof data.scrapeMisses === 'object') {
    const now = Date.now()
    const entries = Object.entries(data.scrapeMisses)
    for (let i = 0; i < entries.length; i += 50) {
      const batch = entries.slice(i, i + 50)
      await Promise.all(
        batch.map(async ([key, miss]) => {
          if (!miss || miss.expiresAt <= now)
            return
          if (mode === 'merge') {
            const existing = await scrapeMissCache.get(key)
            if (existing?.value && existing.value.missedAt >= miss.missedAt)
              return
          }
          await scrapeMissCache.set(key, miss)
        }),
      )
    }
  }

  if (Array.isArray(data.actorWorks)) {
    for (let i = 0; i < data.actorWorks.length; i += 25) {
      const batch = data.actorWorks.slice(i, i + 25)
      await Promise.all(batch.map(entry => saveActorWorks(entry)))
    }
  }

  if (data.actorProfiles && typeof data.actorProfiles === 'object') {
    const entries = Object.entries(data.actorProfiles)
    for (let i = 0; i < entries.length; i += 25) {
      const batch = entries.slice(i, i + 25)
      await Promise.all(
        batch.map(async ([key, profile]) => {
          if (!profile)
            return
          if (mode === 'merge') {
            const existing = await actorProfileCache.get(key)
            if (existing?.value && (existing.value.updatedAt ?? 0) >= (profile.updatedAt ?? 0))
              return
          }
          await actorProfileCache.set(key, profile)
        }),
      )
    }
  }

  if (data.markers && typeof data.markers === 'object') {
    const entries = Object.entries(data.markers)
    for (let i = 0; i < entries.length; i += 25) {
      const batch = entries.slice(i, i + 25)
      await Promise.all(
        batch.map(async ([pickCode, doc]) => {
          if (!doc)
            return
          const localDoc = mode === 'merge' ? await markerStore.getDoc(pickCode) : null
          const mergedDoc = mergeMarkerDocs(localDoc, doc, mode)
          await markerStore.saveDoc(mergedDoc)
        }),
      )
    }
  }

  if (Array.isArray(data.folderPaths) && typeof localStorage !== 'undefined') {
    const existing = mode === 'merge' ? readFolderPathsFromStorage() : []
    const byCid = new Map<string, FolderPathInfo>()
    for (const item of existing) {
      if (item?.cid)
        byCid.set(item.cid, item)
    }
    for (const item of data.folderPaths) {
      if (!item?.cid)
        continue
      const prev = byCid.get(item.cid)
      if (!prev || (item.updatedAt ?? 0) >= (prev.updatedAt ?? 0))
        byCid.set(item.cid, item)
    }
    const mergedPaths = Array.from(byCid.values())
      .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))
      .slice(-MAX_FOLDER_PATH_ENTRIES)
    localStorage.setItem(FOLDER_PATH_STORAGE_KEY, JSON.stringify(mergedPaths))
    folderPathResolver.reloadFromStorage()
  }

  if (data.userSettings && typeof data.userSettings === 'object') {
    const target = userSettings.value as unknown as Record<string, unknown>
    for (const [key, value] of Object.entries(data.userSettings)) {
      if (Object.prototype.hasOwnProperty.call(target, key) && value !== undefined)
        target[key] = value
    }
  }

  if (data.libraryPrefs && typeof data.libraryPrefs === 'object' && typeof localStorage !== 'undefined') {
    for (const [key, value] of Object.entries(data.libraryPrefs)) {
      if (LIBRARY_PREF_KEY_SET.has(key) && typeof value === 'string')
        localStorage.setItem(key, value)
    }
  }

  return summarizeCacheBackup(payload)
}

/** 将已解析的 .115bak 或 .json 备份导入当前设备 */
export async function importInspectedBackup(
  inspected: InspectedBackupFile,
  options: {
    mode?: ImportCacheMode
    onProgress?: (text: string) => void
  } = {},
): Promise<CacheBackupStats> {
  const mode = options.mode ?? 'merge'
  if (inspected.format === 'json') {
    options.onProgress?.('正在写入索引与元数据…')
    return importCacheBackup(inspected.payload, { mode })
  }

  const { file, manifest, blobSectionOffset } = inspected
  options.onProgress?.('正在写入索引与刮削元数据…')
  await importCacheBackup(
    {
      schemaVersion: CACHE_BACKUP_SCHEMA_VERSION,
      exportedAt: manifest.exportedAt,
      appVersion: manifest.appVersion,
      data: manifest.data,
    },
    { mode },
  )

  const coverParts = new Map<string, {
    thumb?: ArchiveBlobDescriptor
    full?: ArchiveBlobDescriptor
  }>()
  const avatars: ArchiveBlobDescriptor[] = []
  const posterThumbs: ArchiveBlobDescriptor[] = []

  for (const descriptor of manifest.blobs) {
    if (descriptor.kind === 'customCoverThumb' || descriptor.kind === 'customCoverFull') {
      const pair = coverParts.get(descriptor.key) ?? {}
      if (descriptor.kind === 'customCoverThumb')
        pair.thumb = descriptor
      else
        pair.full = descriptor
      coverParts.set(descriptor.key, pair)
      continue
    }
    if (descriptor.kind === 'customAvatar') {
      avatars.push(descriptor)
      continue
    }
    if (descriptor.kind === 'posterThumb')
      posterThumbs.push(descriptor)
  }

  const coverEntries = Array.from(coverParts.entries())
  if (coverEntries.length > 0) {
    options.onProgress?.(`正在恢复自定义封面（${coverEntries.length} 部）…`)
    for (let i = 0; i < coverEntries.length; i += 20) {
      const batch = coverEntries.slice(i, i + 20)
      await Promise.all(
        batch.map(async ([mediaKey, pair]) => {
          const thumbDesc = pair.thumb ?? pair.full
          const fullDesc = pair.full ?? pair.thumb
          if (!thumbDesc || !fullDesc)
            return
          if (mode === 'merge') {
            const existing = await customMediaCache.get(`cover:${mediaKey}`)
            if (existing?.value)
              return
          }
          const record: CustomCoverRecord = {
            kind: 'cover',
            mediaKey,
            thumbBlob: readArchiveBlob(file, blobSectionOffset, thumbDesc),
            fullBlob: readArchiveBlob(file, blobSectionOffset, fullDesc),
            sourceLabel: fullDesc.sourceLabel ?? thumbDesc.sourceLabel ?? '备份导入',
            updatedAt: fullDesc.updatedAt ?? thumbDesc.updatedAt ?? Date.now(),
          }
          await saveCustomCover(record)
        }),
      )
    }
  }

  if (avatars.length > 0) {
    options.onProgress?.(`正在恢复自定义头像（${avatars.length} 个）…`)
    for (let i = 0; i < avatars.length; i += 25) {
      const batch = avatars.slice(i, i + 25)
      await Promise.all(
        batch.map(async (desc) => {
          if (mode === 'merge') {
            const existing = await customMediaCache.get(`avatar:${desc.key}`)
            if (existing?.value)
              return
          }
          const record: CustomAvatarRecord = {
            kind: 'avatar',
            actorKey: desc.key,
            blob: readArchiveBlob(file, blobSectionOffset, desc),
            sourceLabel: desc.sourceLabel ?? '备份导入',
            updatedAt: desc.updatedAt ?? Date.now(),
          }
          await saveCustomAvatar(record)
        }),
      )
    }
  }

  if (posterThumbs.length > 0) {
    const batchSize = 40
    for (let i = 0; i < posterThumbs.length; i += batchSize) {
      options.onProgress?.(`正在恢复海报缩略图（${Math.min(i + batchSize, posterThumbs.length)} / ${posterThumbs.length}）…`)
      const batch = posterThumbs.slice(i, i + batchSize)
      await Promise.all(
        batch.map(async (desc) => {
          if (mode === 'merge') {
            const existing = await posterThumbCache.get(desc.key)
            if (existing?.value)
              return
          }
          const blob = readArchiveBlob(file, blobSectionOffset, desc)
          await posterThumbCache.set(desc.key, blob)
        }),
      )
    }
  }

  return summarizeCacheBackup({ data: manifest.data }, manifest.blobs)
}

export interface OrphanCachePruneResult {
  removedJavMeta: number
  removedCinemaMeta: number
  removedScrapeMisses: number
  removedPosterThumbs: number
  totalRemoved: number
  freedBytes: number
}

function safeReadJsonObject<T extends Record<string, unknown>>(storageKey: string): T | undefined {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw)
      return undefined
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : undefined
  }
  catch {
    return undefined
  }
}

function safeReadStringArray(storageKey: string): string[] | undefined {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw)
      return undefined
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : undefined
  }
  catch {
    return undefined
  }
}

function estimateJsonBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length
  }
  catch {
    return 0
  }
}

/** 比对当前本地视频索引，清理已删除影片残留的孤立刮削缓存与缩略图 */
export async function pruneOrphanScrapeCache(
  onProgress?: (text: string) => void,
): Promise<OrphanCachePruneResult> {
  onProgress?.('正在读取本地视频索引…')
  const snapshot = await loadVideoIndexSnapshot(true)
  if (!snapshot || snapshot.items.length === 0)
    throw new Error('当前尚未建立本地视频索引，已跳过清理以防误删缓存')

  const manualBindings = safeReadJsonObject<Record<string, string>>('115Master_library_manual_av_bindings_v1')
  const customCollections = safeReadJsonObject<Record<string, never>>('115Master_library_collection_meta_v1')
  const ungroupedCids = safeReadStringArray('115Master_library_ungrouped_collections_v1')
  const entries = aggregateLibraryEntries(snapshot.items, new Map(), {}, {
    manualAvBindings: manualBindings,
    customCollections,
    ungroupedCids: ungroupedCids ? new Set(ungroupedCids) : undefined,
  })

  const activeMediaKeys = new Set<string>()
  const activeAvNumbers = new Set<string>()
  const addAvKey = (raw?: string | null) => {
    if (!raw)
      return
    const trimmed = raw.trim()
    if (!trimmed)
      return
    activeAvNumbers.add(trimmed.toUpperCase())
    const normalized = normalizeAvNumber(trimmed)
    if (normalized)
      activeAvNumbers.add(normalized)
  }

  for (const entry of entries) {
    activeMediaKeys.add(entry.mediaKey)
    addAvKey(entry.externalId)
  }
  for (const video of snapshot.items)
    addAvKey(video.avNumber)
  if (manualBindings) {
    for (const av of Object.values(manualBindings))
      addAvKey(av)
  }

  let freedBytes = 0

  onProgress?.('正在检查孤立 JAV 刮削缓存…')
  const orphanJavKeys: string[] = []
  await javCache.storage.iterate<CacheValue<JavInfo> | null, void>((entry: CacheValue<JavInfo> | null, key: string) => {
    if (!entry?.value)
      return
    const suffix = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key
    const rawAv = entry.value.avNumber || suffix
    const normalized = normalizeAvNumber(rawAv) || rawAv.trim().toUpperCase()
    if (normalized && !activeAvNumbers.has(normalized)) {
      orphanJavKeys.push(key)
      freedBytes += estimateJsonBytes(entry.value)
    }
  })
  await Promise.all(orphanJavKeys.map(key => javCache.remove(key)))

  onProgress?.('正在检查孤立院线刮削缓存…')
  const orphanCinemaKeys: string[] = []
  await cinemaCache.storage.iterate<CacheValue<UnifiedMediaMeta> | null, void>((entry: CacheValue<UnifiedMediaMeta> | null, key: string) => {
    if (!entry?.value)
      return
    const mediaKey = entry.value.mediaKey || key
    if (!activeMediaKeys.has(mediaKey)) {
      orphanCinemaKeys.push(key)
      freedBytes += estimateJsonBytes(entry.value)
    }
  })
  await Promise.all(orphanCinemaKeys.map(key => cinemaCache.remove(key)))

  onProgress?.('正在检查孤立未命中记录…')
  const orphanMissKeys: string[] = []
  await scrapeMissCache.storage.iterate<CacheValue<ScrapeMissEntry> | null, void>((entry: CacheValue<ScrapeMissEntry> | null, key: string) => {
    if (!entry?.value)
      return
    if (!activeMediaKeys.has(key)) {
      orphanMissKeys.push(key)
      freedBytes += estimateJsonBytes(entry.value)
    }
  })
  await Promise.all(orphanMissKeys.map(key => scrapeMissCache.remove(key)))

  onProgress?.('正在检查孤立海报缩略图…')
  const orphanThumbKeys: string[] = []
  await posterThumbCache.storage.iterate<CacheValue<Blob> | null, void>((entry: CacheValue<Blob> | null, key: string) => {
    if (!entry?.value)
      return
    if (!activeMediaKeys.has(key)) {
      orphanThumbKeys.push(key)
      freedBytes += entry.value.size
    }
  })
  await Promise.all(orphanThumbKeys.map(key => posterThumbCache.remove(key)))

  const totalRemoved = orphanJavKeys.length + orphanCinemaKeys.length + orphanMissKeys.length + orphanThumbKeys.length
  return {
    removedJavMeta: orphanJavKeys.length,
    removedCinemaMeta: orphanCinemaKeys.length,
    removedScrapeMisses: orphanMissKeys.length,
    removedPosterThumbs: orphanThumbKeys.length,
    totalRemoved,
    freedBytes,
  }
}
