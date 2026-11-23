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
import { createJavInfoSources, isFd2PpvAvNumber } from '@/utils/jav'
import { Jav, normalizeAvNumber } from '@/utils/jav/jav'
import { loadJavInfo } from '@/utils/jav/loadInfo'
import { appLogger } from '@/utils/logger'
import { GMRequest } from '@/utils/request/gmRequest'
import { getCustomCover, posterThumbCache } from './videoIndexStore'

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
      ...(actor.sex !== undefined ? { sex: actor.sex } : {}),
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
    posterUrl: info.coverSingle?.url,
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

function scoreJavInfo(info: JavInfo, isFusion: boolean): number {
  return (info.actors?.length ?? 0) * 4
    + (info.category?.length ?? 0) * 2
    + (info.title ? 3 : 0)
    + (info.cover?.url || info.coverSingle?.url ? 2 : 0)
    + (info.director?.length ?? 0)
    + (isFusion ? 0.5 : 0)
}

/** 一次性读取本地 javCache 中已有的全部番号元数据（0 外部网络请求） */
export async function readAllCachedJavMeta(): Promise<Map<string, UnifiedMediaMeta>> {
  const result = new Map<string, UnifiedMediaMeta>()
  const scoreMap = new Map<string, number>()

  try {
    await javCache.storage.iterate<CacheValue<JavInfo>, void>((entry: CacheValue<JavInfo> | null, key: string) => {
      const info = entry?.value
      if (!info?.avNumber)
        return
      if (!info.title && !info.cover?.url && !info.coverSingle?.url && !info.actors?.length)
        return

      const meta = javInfoToUnifiedMeta(info.avNumber, info, entry?.updatedAt || Date.now())
      const score = scoreJavInfo(info, key.startsWith('Fusion:'))
      const prevScore = scoreMap.get(meta.mediaKey)

      if (prevScore === undefined || score > prevScore) {
        result.set(meta.mediaKey, meta)
        scoreMap.set(meta.mediaKey, score)
      }
    })
  }
  catch (error) {
    logger.warn('读取本地番号元数据缓存失败', error)
  }

  return result
}

export type ScrapeResult
  = | { status: 'ok', meta: UnifiedMediaMeta }
    | { status: 'not_found' }
    | { status: 'rate_limited', reason: string }
    | { status: 'challenge', reason: string }
    | { status: 'network_error', reason: string }

function classifySourceError(error: unknown): 'not_found' | 'rate_limited' | 'challenge' | 'network_error' {
  if (error instanceof Jav.NotFound)
    return 'not_found'
  const text = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
  if (/\b429\b|too many requests|rate.?limit|频繁|限流/.test(text))
    return 'rate_limited'
  if (/cloudflare|just a moment|turnstile|captcha|challenge|\b403\b|\b503\b|人机验证/.test(text))
    return 'challenge'
  return 'network_error'
}

/** 联网刮削单个番号元数据并返回结构化结果（用于熔断保护与空结果负缓存） */
export async function scrapeJavMetaDetailed(avNumber: string): Promise<ScrapeResult> {
  const sources = createJavInfoSources(avNumber)
  let rateLimitedReason = ''
  let challengeReason = ''
  let networkErrorReason = ''
  let timedOutCount = 0

  const info = await loadJavInfo(avNumber, sources, {
    onSourceError: (source, error) => {
      const kind = classifySourceError(error)
      const message = error instanceof Error ? error.message : String(error ?? '')
      if (kind === 'rate_limited' && !rateLimitedReason)
        rateLimitedReason = `${source}: ${message || 'HTTP 429'}`
      else if (kind === 'challenge' && !challengeReason)
        challengeReason = `${source}: ${message || 'Cloudflare 校验'}`
      else if (kind === 'network_error' && !networkErrorReason)
        networkErrorReason = `${source}: ${message || '网络异常'}`
    },
    onSourceTimeout: () => {
      timedOutCount += 1
    },
  })

  if (info)
    return { status: 'ok', meta: javInfoToUnifiedMeta(avNumber, info) }
  if (challengeReason)
    return { status: 'challenge', reason: challengeReason }
  if (rateLimitedReason)
    return { status: 'rate_limited', reason: rateLimitedReason }
  if (networkErrorReason || timedOutCount > 0)
    return { status: 'network_error', reason: networkErrorReason || '请求超时' }
  return { status: 'not_found' }
}

/** 联网刮削单个番号元数据 */
export async function scrapeJavMeta(avNumber: string): Promise<UnifiedMediaMeta | null> {
  const result = await scrapeJavMetaDetailed(avNumber)
  return result.status === 'ok' ? result.meta : null
}

function createBlobResource(blob: Blob): PosterThumbResource {
  const url = URL.createObjectURL(blob)
  return {
    url,
    dispose: () => URL.revokeObjectURL(url),
  }
}

/** 加载用户手动设置的自定义高清封面 */
export async function loadCustomFullCoverUrl(mediaKey: string): Promise<PosterThumbResource | null> {
  const custom = await getCustomCover(mediaKey)
  if (!custom)
    return null
  const blob = custom.fullBlob instanceof Blob && custom.fullBlob.size > 0
    ? custom.fullBlob
    : custom.thumbBlob
  if (!(blob instanceof Blob) || blob.size === 0)
    return null
  return createBlobResource(blob)
}

/** 按需加载海报墙封面缩略图（优先读自定义封面与本地 WebP 永久缓存，未命中则压缩后持久化） */
export async function loadPosterThumbUrl(
  mediaKey: string,
  candidates: MediaCoverCandidate[],
  signal: AbortSignal,
): Promise<PosterThumbResource | null> {
  if (signal.aborted)
    throw signal.reason ?? new DOMException('请求已取消', 'AbortError')

  const custom = await getCustomCover(mediaKey)
  if (signal.aborted)
    throw signal.reason ?? new DOMException('请求已取消', 'AbortError')
  if (custom?.thumbBlob instanceof Blob && custom.thumbBlob.size > 0)
    return createBlobResource(custom.thumbBlob)

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
        quality: 0.75,
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

/** 竖版海报模式下是否应取高清横版双页封套的右半正面区域 */
export function shouldCropRightHalfForPortrait(
  naturalWidth: number,
  naturalHeight: number,
  externalId?: string,
): boolean {
  if (naturalHeight <= 0 || naturalWidth <= 0)
    return false
  if (externalId && isFd2PpvAvNumber(externalId))
    return false
  return naturalWidth / naturalHeight >= 1.15
}
