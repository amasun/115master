import type { CacheValue } from '@115master/shared'
import type { FolderPathInfo } from '@/utils/driveFolderPath'
import type { JavInfo } from '@/utils/jav/jav'
import type { MarkerDoc } from '@/utils/markers/types'
import type { ActorProfile } from '@/utils/mediaIndex/actorProfileFetcher'
import type { ActorWorksCacheEntry, IndexedVideo, VideoIndexSnapshot } from '@/utils/superSearch/types'
import type { Settings } from '@/utils/userSettings'
import { javCache } from '@/utils/cache/javCache'
import { markerStore } from '@/utils/cache/markerStore'
import { folderPathResolver } from '@/utils/driveFolderPath'
import { actorProfileCache } from '@/utils/mediaIndex/actorProfileFetcher'
import { getAllCachedActorWorks, saveActorWorks } from '@/utils/superSearch/actorWorksStore'
import { loadVideoIndexSnapshot, saveVideoIndexSnapshot } from '@/utils/superSearch/videoIndexStore'
import { userSettings } from '@/utils/userSettings'

export const CACHE_BACKUP_SCHEMA_VERSION = 1

export type ImportCacheMode = 'merge' | 'overwrite'

export interface CacheBackupData {
  videoIndex?: VideoIndexSnapshot | null
  javMeta?: Record<string, JavInfo>
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
  actorWorksCount: number
  actorProfileCount: number
  markerDocCount: number
  folderPathCount: number
  hasUserSettings: boolean
  libraryPrefCount: number
}

const FOLDER_PATH_STORAGE_KEY = '115Master_folder_path_cache_v1'
const MAX_FOLDER_PATH_ENTRIES = 2000

const LIBRARY_PREF_KEYS = [
  '115Master_library_hidden_actors',
  '115Master_library_favorite_actors',
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
export function summarizeCacheBackup(payload: CacheBackupPayload): CacheBackupStats {
  const { data } = payload
  return {
    videoCount: data.videoIndex?.items?.length ?? 0,
    javMetaCount: data.javMeta ? Object.keys(data.javMeta).length : 0,
    actorWorksCount: data.actorWorks?.length ?? 0,
    actorProfileCount: data.actorProfiles ? Object.keys(data.actorProfiles).length : 0,
    markerDocCount: data.markers ? Object.keys(data.markers).length : 0,
    folderPathCount: data.folderPaths?.length ?? 0,
    hasUserSettings: Boolean(data.userSettings && Object.keys(data.userSettings).length > 0),
    libraryPrefCount: data.libraryPrefs ? Object.keys(data.libraryPrefs).length : 0,
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
  const [videoIndex, javMeta, actorWorks, actorProfiles, markers] = await Promise.all([
    loadVideoIndexSnapshot(),
    readAllJavMetaRecord(),
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

function formatBackupFilename(timestamp: number): string {
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  const datePart = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  const timePart = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `115master-cache-backup-${datePart}-${timePart}.json`
}

/** 触发浏览器下载备份 JSON 文件 */
export function downloadCacheBackupFile(payload: CacheBackupPayload): { filename: string, sizeBytes: number } {
  const json = JSON.stringify(payload)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const filename = formatBackupFilename(payload.exportedAt)
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
