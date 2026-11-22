import type { CacheValue } from '@115master/shared'
import type {
  MediaActor,
  MediaCoverCandidate,
  MediaPreview,
  UnifiedMediaMeta,
} from './types'
import type { JavInfo } from '@/utils/jav/jav'
import { format, image as imageUtil } from '@115master/utils'
import { javCache } from '@/utils/cache/javCache'
import { createJavInfoSources } from '@/utils/jav'
import { normalizeAvNumber } from '@/utils/jav/jav'
import { loadJavInfo } from '@/utils/jav/loadInfo'
import { appLogger } from '@/utils/logger'
import { GMRequest } from '@/utils/request/gmRequest'
import { posterThumbCache } from './videoIndexStore'

const logger = appLogger.sub('ScraperRegistry')
const gm = new GMRequest()
const THUMB_REQUEST_TIMEOUT_MS = 6000
const MIN_THUMB_BYTES = 1500

export interface PosterThumbResource {
  url: string
  dispose: () => void
}

function getCookiePartition(referer?: string) {
  if (!referer)
    return undefined
  try {
    const url = new URL(referer)
    url.hostname = url.hostname.replace(/^www\./i, '')
    return { topLevelSite: url.origin }
  }
  catch {
    return undefined
  }
}

function collectCoverCandidates(info: JavInfo): MediaCoverCandidate[] {
  const seen = new Set<string>()
  return [info.cover, info.coverSingle, ...(info.coverFallbacks ?? [])]
    .filter((item): item is NonNullable<JavInfo['cover']> => Boolean(item?.url))
    .filter((item) => {
      const key = `${item.url}\u0000${item.referer ?? ''}`
      if (seen.has(key))
        return false
      seen.add(key)
      return true
    })
    .map(item => ({
      url: item.url,
      referer: item.referer ?? info.detailUrl,
    }))
}

function mapActors(info: JavInfo): MediaActor[] {
  return (info.actors ?? [])
    .filter(actor => Boolean(actor.name?.trim()))
    .map(actor => ({
      name: actor.name.trim(),
      url: actor.url,
      avatarUrl: actor.face,
      avatarReferer: actor.faceReferer ?? info.detailUrl,
    }))
}

function mapPreviews(info: JavInfo): MediaPreview[] | undefined {
  const previews = (info.preview ?? [])
    .filter(item => Boolean(item.thumbnail || item.raw))
    .map(item => ({
      thumbnail: item.thumbnail,
      raw: item.raw,
    }))
  return previews.length ? previews : undefined
}

/** 将 JavInfo 转换为统一媒体元数据模型 */
export function javInfoToUnifiedMeta(
  avNumber: string,
  info: JavInfo,
  updatedAt = Date.now(),
): UnifiedMediaMeta {
  const externalId = (info.avNumber || avNumber).trim().toUpperCase()
  const normalized = normalizeAvNumber(externalId)
  const covers = collectCoverCandidates(info)
  const releaseDate = format.date(info.date) || undefined
  const parsedYear = releaseDate ? Number(releaseDate.slice(0, 4)) : Number.NaN

  return {
    mediaKey: `jav:${normalized}`,
    kind: 'jav',
    externalId,
    title: info.title?.trim() || externalId,
    coverUrl: covers[0]?.url,
    coverReferer: covers[0]?.referer ?? info.detailUrl,
    coverFallbacks: covers.slice(1),
    previews: mapPreviews(info),
    releaseDate,
    year: Number.isFinite(parsedYear) && parsedYear > 1900 ? parsedYear : undefined,
    duration: info.duration,
    rating: info.score,
    directors: (info.director ?? []).map(d => d.name.trim()).filter(Boolean),
    actors: mapActors(info),
    genres: (info.category ?? []).map(c => c.name.trim()).filter(Boolean),
    source: info.source,
    detailUrl: info.detailUrl,
    updatedAt,
  }
}

/** 从 JavInfo / UnifiedMediaMeta 中提取海报缩略图候选列表 */
export function getCoverCandidates(meta: UnifiedMediaMeta | null | undefined): MediaCoverCandidate[] {
  if (!meta)
    return []
  const primary = meta.coverUrl
    ? [{ url: meta.coverUrl, referer: meta.coverReferer ?? meta.detailUrl }]
    : []
  return [...primary, ...(meta.coverFallbacks ?? [])]
}

/** 一次性读取本地 javCache 中已有的全部番号元数据（0 外部网络请求） */
export async function readAllCachedJavMeta(): Promise<Map<string, UnifiedMediaMeta>> {
  const result = new Map<string, UnifiedMediaMeta>()
  const fromFusion = new Set<string>()

  try {
    await javCache.storage.iterate<CacheValue<JavInfo>, void>((entry: CacheValue<JavInfo> | null, key: string) => {
      const info = entry?.value
      if (!info?.avNumber)
        return
      if (!info.title && !info.cover?.url && !info.coverSingle?.url)
        return

      const meta = javInfoToUnifiedMeta(info.avNumber, info, entry?.updatedAt || Date.now())
      const isFusion = key.startsWith('Fusion:')

      if (isFusion) {
        result.set(meta.mediaKey, meta)
        fromFusion.add(meta.mediaKey)
        return
      }

      if (!fromFusion.has(meta.mediaKey) && !result.has(meta.mediaKey))
        result.set(meta.mediaKey, meta)
    })
  }
  catch (error) {
    logger.warn('读取本地番号元数据缓存失败', error)
  }

  return result
}

/** 联网刮削单个番号元数据 */
export async function scrapeJavMeta(avNumber: string): Promise<UnifiedMediaMeta | null> {
  const sources = createJavInfoSources(avNumber)
  const info = await loadJavInfo(avNumber, sources)
  if (!info)
    return null
  return javInfoToUnifiedMeta(avNumber, info)
}

function createBlobResource(blob: Blob): PosterThumbResource {
  const url = URL.createObjectURL(blob)
  return {
    url,
    dispose: () => URL.revokeObjectURL(url),
  }
}

/** 按需加载海报墙封面缩略图（优先读本地 WebP 永久缓存，未命中则压缩后持久化） */
export async function loadPosterThumbUrl(
  mediaKey: string,
  candidates: MediaCoverCandidate[],
  signal: AbortSignal,
): Promise<PosterThumbResource | null> {
  if (signal.aborted)
    throw signal.reason ?? new DOMException('请求已取消', 'AbortError')

  const cached = await posterThumbCache.get(mediaKey)
  if (signal.aborted)
    throw signal.reason ?? new DOMException('请求已取消', 'AbortError')

  if (cached?.value instanceof Blob && cached.value.size > 0)
    return createBlobResource(cached.value)

  for (const candidate of candidates) {
    if (signal.aborted)
      throw signal.reason ?? new DOMException('请求已取消', 'AbortError')

    try {
      const response = await gm.get(candidate.url, {
        headers: candidate.referer ? { Referer: candidate.referer } : {},
        responseType: 'blob',
        signal,
        timeout: THUMB_REQUEST_TIMEOUT_MS,
        cookiePartition: getCookiePartition(candidate.referer),
      })
      if (!response.ok)
        continue

      const original = await response.blob()
      if (signal.aborted)
        throw signal.reason ?? new DOMException('请求已取消', 'AbortError')
      if (original.size < MIN_THUMB_BYTES)
        continue
      if (original.type && !original.type.startsWith('image/'))
        continue

      const compressed = await imageUtil.compress(original, {
        maxWidth: 480,
        maxHeight: 480,
        quality: 0.78,
        type: 'image/webp',
      }).catch(() => original)

      if (signal.aborted)
        throw signal.reason ?? new DOMException('请求已取消', 'AbortError')

      await posterThumbCache.set(mediaKey, compressed)
      return createBlobResource(compressed)
    }
    catch (error) {
      if (signal.aborted)
        throw error
    }
  }

  return null
}
