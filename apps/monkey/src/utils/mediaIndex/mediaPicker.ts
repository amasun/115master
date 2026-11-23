import type { CacheValue } from '@115master/shared'
import type { UnifiedMediaMeta } from './types'
import type { JavInfo } from '@/utils/jav/jav'
import { image as imageUtil } from '@115master/utils'
import { actressFaceDB } from '@/utils/actressFaceDB'
import { normalizeActressName } from '@/utils/actressNameMatcher'
import { javCache } from '@/utils/cache/javCache'
import { performerFaceCache } from '@/utils/cache/performerFaceCache'
import { createJavInfoSources } from '@/utils/jav'
import { normalizeAvNumber } from '@/utils/jav/jav'
import { GMRequest } from '@/utils/request/gmRequest'
import { actorProfileCache, fetchActorProfile } from './actorProfileFetcher'

export interface ImageCandidateItem {
  id: string
  url: string
  referer?: string
  sourceLabel: string
  kindHint?: 'landscape' | 'portrait'
}

export const MAX_UPLOAD_IMAGE_BYTES = 20 * 1024 * 1024
const FETCH_TIMEOUT_MS = 8000
const MIN_IMAGE_BYTES = 500
const gm = new GMRequest()

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

function appendCandidate(
  list: ImageCandidateItem[],
  seenUrls: Set<string>,
  url: string | undefined,
  sourceLabel: string,
  referer?: string,
  kindHint?: 'landscape' | 'portrait',
) {
  const trimmed = url?.trim()
  if (!trimmed || seenUrls.has(trimmed))
    return
  seenUrls.add(trimmed)
  list.push({
    id: `${sourceLabel}:${trimmed}`,
    url: trimmed,
    referer,
    sourceLabel,
    kindHint,
  })
}

function collectInfoCovers(
  info: JavInfo,
  list: ImageCandidateItem[],
  seenUrls: Set<string>,
) {
  const source = info.source || '未知源'
  appendCandidate(list, seenUrls, info.cover?.url, `${source} · 封面`, info.cover?.referer ?? info.detailUrl, 'landscape')
  appendCandidate(list, seenUrls, info.coverSingle?.url, `${source} · 竖版`, info.coverSingle?.referer ?? info.detailUrl, 'portrait')
  info.coverFallbacks?.forEach((item, index) => {
    appendCandidate(list, seenUrls, item.url, `${source} · 备用${index + 1}`, item.referer ?? info.detailUrl)
  })
}

/** 收集本地元数据与 javCache 中同番号全部来源的封面候选 */
export async function collectLocalCoverCandidates(
  avNumber: string | undefined,
  meta: UnifiedMediaMeta | null,
): Promise<ImageCandidateItem[]> {
  const list: ImageCandidateItem[] = []
  const seenUrls = new Set<string>()

  if (meta) {
    const metaSource = meta.source || '当前元数据'
    appendCandidate(list, seenUrls, meta.coverUrl, `${metaSource} · 主封面`, meta.coverReferer ?? meta.detailUrl, 'landscape')
    appendCandidate(list, seenUrls, meta.posterUrl, `${metaSource} · 竖版`, meta.coverReferer ?? meta.detailUrl, 'portrait')
    meta.coverFallbacks?.forEach((item, index) => {
      appendCandidate(list, seenUrls, item.url, `${metaSource} · 候选${index + 1}`, item.referer ?? meta.detailUrl)
    })
  }

  const targetAv = avNumber ? normalizeAvNumber(avNumber) : ''
  if (!targetAv)
    return list

  try {
    await javCache.storage.iterate<CacheValue<JavInfo> | null, void>((entry: CacheValue<JavInfo> | null) => {
      const info = entry?.value
      if (!info?.avNumber)
        return
      if (normalizeAvNumber(info.avNumber) !== targetAv)
        return
      collectInfoCovers(info, list, seenUrls)
    })
  }
  catch {
    // 忽略本地缓存遍历异常
  }

  return list
}

/** 按需联网探测该番号在更多刮削源中的封面候选 */
export async function probeRemoteCoverCandidates(
  avNumber: string,
  existingUrls: Set<string>,
  signal?: AbortSignal,
): Promise<ImageCandidateItem[]> {
  const normalized = normalizeAvNumber(avNumber)
  if (!normalized)
    return []

  const sources = createJavInfoSources(avNumber)
  const list: ImageCandidateItem[] = []
  const seenUrls = new Set(existingUrls)

  await Promise.allSettled(
    sources.map(async (source) => {
      if (signal?.aborted)
        return
      const info = await source.getInfo(avNumber)
      if (!info || signal?.aborted)
        return
      collectInfoCovers(info, list, seenUrls)
    }),
  )

  return list
}

/** 收集本地头像库、演员资料缓存、MissAV 缓存及作品元数据中的头像候选 */
export async function collectLocalAvatarCandidates(
  actor: { key: string, name: string, aliases?: string[], avatarUrl?: string },
  metaMap: Map<string, UnifiedMediaMeta>,
): Promise<ImageCandidateItem[]> {
  const list: ImageCandidateItem[] = []
  const seenUrls = new Set<string>()
  const names = Array.from(new Set([actor.name, ...(actor.aliases ?? [])].map(item => item.trim()).filter(Boolean)))
  const targetNormalized = new Set(names.map(item => normalizeActressName(item)).filter(Boolean))
  if (actor.key)
    targetNormalized.add(actor.key)

  const gfriends = await actressFaceDB.findActressAll(names).catch(() => [])
  gfriends.forEach((item) => {
    appendCandidate(list, seenUrls, item.url, `gfriends · ${item.folder}`, undefined, 'portrait')
  })

  for (const key of targetNormalized) {
    const profileCached = await actorProfileCache.get(key).catch(() => null)
    if (profileCached?.value?.avatarUrl) {
      appendCandidate(
        list,
        seenUrls,
        profileCached.value.avatarUrl,
        'JavBus',
        profileCached.value.profileUrl,
        'portrait',
      )
    }
  }

  for (const name of names) {
    const missAv = await performerFaceCache.getByName(name).catch(() => null)
    if (missAv?.actor.face) {
      appendCandidate(
        list,
        seenUrls,
        missAv.actor.face,
        'MissAV',
        missAv.actor.faceReferer,
        'portrait',
      )
    }
  }

  appendCandidate(list, seenUrls, actor.avatarUrl, '刮削源头像', undefined, 'portrait')

  metaMap.forEach((meta) => {
    meta.actors.forEach((item) => {
      const normalized = normalizeActressName(item.name)
      if (!item.avatarUrl)
        return
      if (!names.includes(item.name.trim()) && (!normalized || !targetNormalized.has(normalized)))
        return
      appendCandidate(
        list,
        seenUrls,
        item.avatarUrl,
        `${meta.source || '刮削源'} · 头像`,
        item.avatarReferer ?? meta.detailUrl,
        'portrait',
      )
    })
  })

  return list
}

/** 联网从 JavBus 补充拉取演员最新头像候选 */
export async function probeRemoteAvatarCandidates(
  actor: { name: string, aliases?: string[] },
  existingUrls: Set<string>,
): Promise<ImageCandidateItem[]> {
  const list: ImageCandidateItem[] = []
  const seenUrls = new Set(existingUrls)
  const profile = await fetchActorProfile(actor.name, {
    aliases: actor.aliases,
    forceRefresh: true,
  }).catch(() => null)

  if (profile?.avatarUrl)
    appendCandidate(list, seenUrls, profile.avatarUrl, 'JavBus · 在线', profile.profileUrl, 'portrait')

  return list
}

/** 通过防盗链代理或直连拉取候选图片 Blob */
export async function fetchCandidateBlob(
  candidate: Pick<ImageCandidateItem, 'url' | 'referer'>,
  signal?: AbortSignal,
): Promise<Blob> {
  if (signal?.aborted)
    throw signal.reason ?? new DOMException('请求已取消', 'AbortError')

  try {
    const response = await gm.get(candidate.url, {
      headers: candidate.referer ? { Referer: candidate.referer } : {},
      responseType: 'blob',
      signal,
      timeout: FETCH_TIMEOUT_MS,
      cookiePartition: getCookiePartition(candidate.referer),
    })
    if (response.ok) {
      const blob = await response.blob()
      if (blob.size >= MIN_IMAGE_BYTES && (!blob.type || blob.type.startsWith('image/')))
        return blob
    }
  }
  catch (error) {
    if (signal?.aborted)
      throw error
  }

  if (!candidate.referer && typeof fetch === 'function') {
    const res = await fetch(candidate.url, { signal, referrerPolicy: 'no-referrer' })
    if (res.ok) {
      const blob = await res.blob()
      if (blob.size >= MIN_IMAGE_BYTES && (!blob.type || blob.type.startsWith('image/')))
        return blob
    }
  }

  throw new Error('图片加载失败')
}

/** 校验用户上传的本地图片文件 */
export function validateUploadImageFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!file.type || !file.type.startsWith('image/'))
    return '请选择有效的图片文件（JPG / PNG / WebP 等）'
  if (file.size <= 0)
    return '图片文件为空'
  if (file.size > MAX_UPLOAD_IMAGE_BYTES)
    return '图片体积不能超过 20MB'
  return null
}

/** 将自定义封面压缩为海报墙缩略图（480px WebP）与详情页高清图（1440px WebP） */
export async function compressCustomCover(blob: Blob): Promise<{ thumbBlob: Blob, fullBlob: Blob }> {
  const [thumbBlob, fullBlob] = await Promise.all([
    imageUtil.compress(blob, {
      maxWidth: 480,
      maxHeight: 480,
      quality: 0.75,
      type: 'image/webp',
    }).catch(() => blob),
    imageUtil.compress(blob, {
      maxWidth: 1440,
      maxHeight: 1440,
      quality: 0.82,
      type: 'image/webp',
    }).catch(() => blob),
  ])

  return { thumbBlob, fullBlob }
}

/** 将自定义演员头像压缩为 480px WebP */
export async function compressCustomAvatar(blob: Blob): Promise<Blob> {
  return imageUtil.compress(blob, {
    maxWidth: 480,
    maxHeight: 480,
    quality: 0.8,
    type: 'image/webp',
  }).catch(() => blob)
}
