import { CacheCore } from '@115master/shared'
import { STORE_NAME } from '@/utils/cache/const'
import { appLogger } from '@/utils/logger'
import {
  clearVideoIndexSnapshot,
  loadVideoIndexSnapshot,
  saveVideoIndexSnapshot,
} from '@/utils/superSearch'

const POSTER_THUMB_STORE_NAME = 'library_poster_thumb_v1'
const SCRAPE_MISS_STORE_NAME = 'library_scrape_miss_v1'
const CUSTOM_MEDIA_STORE_NAME = 'library_custom_media_v1'
export const DEFAULT_SCRAPE_MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface ScrapeMissEntry {
  avNumber: string
  missedAt: number
  expiresAt: number
}

export interface CustomCoverRecord {
  kind: 'cover'
  mediaKey: string
  thumbBlob: Blob
  fullBlob: Blob
  sourceLabel: string
  updatedAt: number
}

export interface CustomAvatarRecord {
  kind: 'avatar'
  actorKey: string
  blob: Blob
  sourceLabel: string
  updatedAt: number
}

export type CustomMediaRecord = CustomCoverRecord | CustomAvatarRecord

class PosterThumbCache extends CacheCore<Blob> {
  constructor() {
    super({
      name: STORE_NAME,
      storeName: POSTER_THUMB_STORE_NAME,
      enableQuotaManagement: false,
      logger: appLogger.sub('PosterThumbCache'),
    })
  }
}

class ScrapeMissCache extends CacheCore<ScrapeMissEntry> {
  constructor() {
    super({
      name: STORE_NAME,
      storeName: SCRAPE_MISS_STORE_NAME,
      enableQuotaManagement: false,
      logger: appLogger.sub('ScrapeMissCache'),
    })
  }
}

class CustomMediaCache extends CacheCore<CustomMediaRecord> {
  constructor() {
    super({
      name: STORE_NAME,
      storeName: CUSTOM_MEDIA_STORE_NAME,
      enableQuotaManagement: false,
      logger: appLogger.sub('CustomMediaCache'),
    })
  }
}

export const posterThumbCache = new PosterThumbCache()
export const scrapeMissCache = new ScrapeMissCache()
export const customMediaCache = new CustomMediaCache()

function customCoverKey(mediaKey: string): string {
  return `cover:${mediaKey}`
}

function customAvatarKey(actorKey: string): string {
  return `avatar:${actorKey}`
}

export async function getCustomCover(mediaKey: string): Promise<CustomCoverRecord | null> {
  try {
    const cached = await customMediaCache.get(customCoverKey(mediaKey))
    const value = cached?.value
    if (!value || value.kind !== 'cover')
      return null
    return value
  }
  catch {
    return null
  }
}

export async function saveCustomCover(record: CustomCoverRecord): Promise<void> {
  await customMediaCache.set(customCoverKey(record.mediaKey), record)
  await posterThumbCache.set(record.mediaKey, record.thumbBlob)
}

export async function removeCustomCover(mediaKey: string): Promise<void> {
  await customMediaCache.remove(customCoverKey(mediaKey))
  await posterThumbCache.remove(mediaKey)
}

export async function getCustomAvatar(actorKey: string): Promise<CustomAvatarRecord | null> {
  try {
    const cached = await customMediaCache.get(customAvatarKey(actorKey))
    const value = cached?.value
    if (!value || value.kind !== 'avatar')
      return null
    return value
  }
  catch {
    return null
  }
}

export async function saveCustomAvatar(record: CustomAvatarRecord): Promise<void> {
  await customMediaCache.set(customAvatarKey(record.actorKey), record)
}

export async function removeCustomAvatar(actorKey: string): Promise<void> {
  await customMediaCache.remove(customAvatarKey(actorKey))
}

export async function readAllCustomMediaKeys(): Promise<{
  coverKeys: Set<string>
  avatars: Map<string, CustomAvatarRecord>
}> {
  const coverKeys = new Set<string>()
  const avatars = new Map<string, CustomAvatarRecord>()
  try {
    await customMediaCache.storage.iterate<{ value?: CustomMediaRecord } | null, void>(
      (entry: { value?: CustomMediaRecord } | null) => {
        const value = entry?.value
        if (!value)
          return
        if (value.kind === 'cover' && value.mediaKey) {
          coverKeys.add(value.mediaKey)
          return
        }
        if (value.kind === 'avatar' && value.actorKey)
          avatars.set(value.actorKey, value)
      },
    )
  }
  catch {
    // 忽略自定义媒体索引遍历异常
  }
  return { coverKeys, avatars }
}

export async function isScrapeMissed(mediaKey: string, now = Date.now()): Promise<boolean> {
  try {
    const cached = await scrapeMissCache.get(mediaKey)
    if (!cached?.value)
      return false
    if (cached.value.expiresAt <= now) {
      void scrapeMissCache.remove(mediaKey)
      return false
    }
    return true
  }
  catch {
    return false
  }
}

export async function markScrapeMissed(
  mediaKey: string,
  avNumber: string,
  ttlMs = DEFAULT_SCRAPE_MISS_TTL_MS,
  now = Date.now(),
): Promise<void> {
  try {
    await scrapeMissCache.set(mediaKey, {
      avNumber,
      missedAt: now,
      expiresAt: now + ttlMs,
    })
  }
  catch {
    // 忽略负缓存写入异常
  }
}

export async function clearScrapeMissed(mediaKey: string): Promise<void> {
  try {
    await scrapeMissCache.remove(mediaKey)
  }
  catch {
    // 忽略负缓存清理异常
  }
}

export async function readActiveScrapeMissKeys(now = Date.now()): Promise<Set<string>> {
  const active = new Set<string>()
  const expired: string[] = []
  try {
    await scrapeMissCache.storage.iterate<{ value?: ScrapeMissEntry } | null, void>(
      (entry: { value?: ScrapeMissEntry } | null, key: string) => {
        const value = entry?.value
        if (!value)
          return
        if (value.expiresAt > now)
          active.add(key)
        else
          expired.push(key)
      },
    )
    expired.forEach(key => void scrapeMissCache.remove(key))
  }
  catch {
    // 忽略负缓存遍历异常
  }
  return active
}

export {
  clearVideoIndexSnapshot,
  loadVideoIndexSnapshot,
  saveVideoIndexSnapshot,
}

/** 向浏览器申请持久化存储权限，失败时静默降级 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist)
      return false
    const persisted = await navigator.storage.persisted?.()
    if (persisted)
      return true
    return await navigator.storage.persist()
  }
  catch {
    return false
  }
}
