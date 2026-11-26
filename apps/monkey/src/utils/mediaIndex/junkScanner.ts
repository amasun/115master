import type { IndexedVideo, LibraryEntry } from './types'
import { drive115 } from '@/utils/drive115Instance'

export type JunkCategory = 'web' | 'textMagnet' | 'executable' | 'adVideo'
export type AdVideoMatchMode = 'and' | 'or'

export interface AdVideoDetectOptions {
  maxDurationSec?: number
  maxSizeMB?: number
  matchMode?: AdVideoMatchMode
  excludeStarred?: boolean
}

export type AdVideoCandidate = Pick<IndexedVideo, 'name' | 'size' | 'duration' | 'starred'>

export interface JunkFileItem {
  fid: string
  cid: string
  pickCode?: string
  name: string
  size: number
  duration?: number
  mtime: number
  suffix: string
  category: JunkCategory
  reason: string
  isVideo: boolean
}

export const JUNK_EXTENSION_GROUPS = {
  web: ['html', 'htm', 'mht', 'mhtml', 'url', 'lnk'],
  textMagnet: ['txt', 'magnet', 'torrent', 'chm'],
  executable: ['apk', 'exe', 'bat', 'cmd'],
} as const

export const DEFAULT_LIBRARY_AD_MAX_DURATION_SEC = 90
export const DEFAULT_LIBRARY_AD_MAX_SIZE_MB = 50
export const DEFAULT_LIBRARY_AD_MATCH_MODE: AdVideoMatchMode = 'and'
export const AD_DURATION_MIN_SEC = 10
export const AD_DURATION_MAX_SEC = 600
export const AD_SIZE_MIN_MB = 1
export const AD_SIZE_MAX_MB = 500

export type JunkScannerDriveApi = Pick<typeof drive115.file, 'getFilesWithFallback' | 'searchFiles'>

const PAGE_LIMIT = 200
const DEFAULT_MAX_AD_DURATION_SEC = 60
const DEFAULT_MAX_AD_SIZE_MB = 50
const AD_KEYWORD_RE = /宣传|广告|推广|澳门|赌场|葡京|最新地址|永久地址|防走丢|app下载|扫码|网址|导航/i

function clampThreshold(value: unknown, min: number, max: number, fallback: number): number {
  if (value === null || value === undefined || typeof value === 'boolean')
    return fallback
  if (typeof value === 'string' && value.trim() === '')
    return fallback

  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num))
    return fallback

  return Math.min(max, Math.max(min, Math.round(num)))
}

/** 规范化广告短视频时长上限（秒） */
export function clampAdMaxDurationSec(
  value: unknown,
  fallback = DEFAULT_LIBRARY_AD_MAX_DURATION_SEC,
): number {
  return clampThreshold(value, AD_DURATION_MIN_SEC, AD_DURATION_MAX_SEC, fallback)
}

/** 规范化广告短视频体积上限（MB） */
export function clampAdMaxSizeMB(
  value: unknown,
  fallback = DEFAULT_LIBRARY_AD_MAX_SIZE_MB,
): number {
  return clampThreshold(value, AD_SIZE_MIN_MB, AD_SIZE_MAX_MB, fallback)
}

/** 规范化广告短视频时长与体积的匹配逻辑（and / or） */
export function normalizeAdMatchMode(
  value: unknown,
  fallback: AdVideoMatchMode = DEFAULT_LIBRARY_AD_MATCH_MODE,
): AdVideoMatchMode {
  if (value === 'or' || value === 'and')
    return value
  return fallback
}

/** 判断单个视频是否为疑似广告/推广短视频 */
export function isAdVideo(
  video: AdVideoCandidate,
  options?: AdVideoDetectOptions,
): boolean {
  const maxDurationSec = typeof options?.maxDurationSec === 'number' && Number.isFinite(options.maxDurationSec) && options.maxDurationSec > 0
    ? options.maxDurationSec
    : DEFAULT_MAX_AD_DURATION_SEC
  const maxSizeMB = typeof options?.maxSizeMB === 'number' && Number.isFinite(options.maxSizeMB) && options.maxSizeMB > 0
    ? options.maxSizeMB
    : DEFAULT_MAX_AD_SIZE_MB
  const matchMode = normalizeAdMatchMode(options?.matchMode, 'and')
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  const excludeStarred = options?.excludeStarred ?? true

  if (excludeStarred && video.starred)
    return false

  const isShort = video.duration > 0 && video.duration <= maxDurationSec
  const isSmall = video.size > 0 && video.size <= maxSizeBytes
  const matchedThreshold = matchMode === 'or' ? (isShort || isSmall) : (isShort && isSmall)

  if (matchedThreshold)
    return true

  return AD_KEYWORD_RE.test(video.name) && video.size <= maxSizeBytes
}

/** 判断整条影视库条目是否全部由疑似广告视频构成 */
export function isAdLibraryEntry(
  entry: Pick<LibraryEntry, 'files'>,
  options?: AdVideoDetectOptions,
): boolean {
  return entry.files.length > 0 && entry.files.every(file => isAdVideo(file, options))
}

function extractExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1)
    return ''
  return name.slice(dot + 1).toLowerCase()
}

function classifyExtension(suffix: string): JunkCategory {
  const lower = suffix.toLowerCase()
  if ((JUNK_EXTENSION_GROUPS.web as readonly string[]).includes(lower))
    return 'web'
  if ((JUNK_EXTENSION_GROUPS.executable as readonly string[]).includes(lower))
    return 'executable'
  return 'textMagnet'
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted)
    throw signal.reason ?? new DOMException('扫描已取消', 'AbortError')
}

function delayWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0)
    return Promise.resolve()

  return new Promise((resolve, reject) => {
    throwIfAborted(signal)

    let timer: ReturnType<typeof setTimeout> | undefined

    const onAbort = () => {
      if (timer !== undefined)
        clearTimeout(timer)
      reject(signal?.reason ?? new DOMException('扫描已取消', 'AbortError'))
    }

    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * 从本地视频索引中识别疑似广告/推广短视频
 */
export function detectAdVideos(
  videos: IndexedVideo[],
  options?: AdVideoDetectOptions,
): JunkFileItem[] {
  return videos
    .filter(video => isAdVideo(video, options))
    .map((video): JunkFileItem => {
      const hasAdKeyword = AD_KEYWORD_RE.test(video.name)
      const sizeMB = (video.size / (1024 * 1024)).toFixed(1)
      const reason = hasAdKeyword
        ? '文件名含推广/广告关键词'
        : `疑似广告短视频 (${video.duration}s, ${sizeMB}MB)`

      return {
        fid: video.fid,
        cid: video.cid,
        pickCode: video.pickCode,
        name: video.name,
        size: video.size,
        duration: video.duration,
        mtime: video.mtime,
        suffix: extractExtension(video.name),
        category: 'adVideo',
        reason,
        isVideo: true,
      }
    })
}

interface RawJunkDriveItem {
  fc?: number | string
  fid?: string | number
  pid?: string | number
  cid?: string | number
  pc?: string
  n?: string
  s?: number | string
  t?: number | string
  tu?: number | string
  ico?: string
  iv?: number | string
  play_long?: number | string
}

type DriveFilesItem = Awaited<ReturnType<JunkScannerDriveApi['getFilesWithFallback']>>['data'][number] | RawJunkDriveItem

function toJunkFileItem(
  item: DriveFilesItem,
  category: JunkCategory,
  reason: string,
  expectedSuffix?: string,
): JunkFileItem | null {
  const raw = item as RawJunkDriveItem
  if (raw.fc === 0 || raw.fc === '0')
    return null
  const fid = raw.fid !== undefined && raw.fid !== null ? String(raw.fid).trim() : ''
  const name = typeof raw.n === 'string' ? raw.n : ''
  if (!fid || !name)
    return null

  const suffix = (raw.ico || extractExtension(name)).toLowerCase()
  if (expectedSuffix && suffix !== expectedSuffix && !name.toLowerCase().endsWith(`.${expectedSuffix}`))
    return null

  const size = typeof raw.s === 'number' ? raw.s : Number(raw.s) || 0
  const mtime = Number(raw.tu || raw.t) || 0
  const cid = raw.pid !== undefined && raw.pid !== null
    ? String(raw.pid)
    : raw.cid !== undefined && raw.cid !== null
      ? String(raw.cid)
      : '0'
  const duration = Number(raw.play_long)

  return {
    fid,
    cid,
    pickCode: raw.pc || undefined,
    name,
    size,
    duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
    mtime,
    suffix,
    category,
    reason,
    isVideo: raw.iv === 1 || raw.iv === '1',
  }
}

function isAbortLikeError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted)
    return true
  return error instanceof DOMException && error.name === 'AbortError'
}

function extractRawFid(item: DriveFilesItem): string {
  const raw = item as RawJunkDriveItem
  return raw.fid !== undefined && raw.fid !== null ? String(raw.fid).trim() : ''
}

function collectPageJunkItems(
  list: DriveFilesItem[],
  seenRawFids: Set<string>,
  byFid: Map<string, JunkFileItem>,
  category: JunkCategory,
  reason: string,
  expectedSuffix?: string,
): { pageAdded: JunkFileItem[], sawNewRawFid: boolean } {
  const pageAdded: JunkFileItem[] = []
  let sawNewRawFid = false

  for (const raw of list) {
    const rawFid = extractRawFid(raw)
    if (rawFid && !seenRawFids.has(rawFid)) {
      seenRawFids.add(rawFid)
      sawNewRawFid = true
    }

    const mapped = toJunkFileItem(raw, category, reason, expectedSuffix)
    if (mapped && !byFid.has(mapped.fid)) {
      byFid.set(mapped.fid, mapped)
      pageAdded.push(mapped)
    }
  }

  return { pageAdded, sawNewRawFid }
}

/**
 * 按指定后缀列表（及可选磁力关键词搜索）扫描网盘垃圾文件
 */
export async function scanDriveJunkFiles(options: {
  rootCid?: string
  suffixes: string[]
  includeMagnetSearch?: boolean
  signal?: AbortSignal
  pageDelayMs?: number
  onBatch?: (added: JunkFileItem[]) => void
  onProgress?: (p: {
    scannedSuffixes: number
    totalSuffixes: number
    currentLabel: string
    found: number
  }) => void
  driveApi?: JunkScannerDriveApi
}): Promise<JunkFileItem[]> {
  const api = options.driveApi ?? drive115.file
  const rootCid = options.rootCid ?? '0'
  const pageDelayMs = options.pageDelayMs ?? 300
  const suffixes = Array.from(new Set(
    options.suffixes
      .map(s => s.trim().replace(/^\./, '').toLowerCase())
      .filter(Boolean),
  ))

  const totalSuffixes = suffixes.length + (options.includeMagnetSearch ? 1 : 0)
  const byFid = new Map<string, JunkFileItem>()
  let scannedSuffixes = 0
  let succeededTasks = 0
  let firstError: unknown

  for (const suffix of suffixes) {
    throwIfAborted(options.signal)
    let offset = 0
    let suffixSucceeded = false

    try {
      let useFallbackListing = false
      const seenRawFids = new Set<string>()
      while (true) {
        throwIfAborted(options.signal)

        let list: DriveFilesItem[] = []
        if (!useFallbackListing) {
          try {
            const searchRes = await api.searchFiles(
              {
                aid: 1,
                cid: rootCid,
                search_value: `.${suffix}`,
                suffix,
                offset,
                limit: PAGE_LIMIT,
                fc: 2,
                show_dir: 0,
                format: 'json',
              },
              options.signal,
            )
            list = Array.isArray(searchRes.data) ? searchRes.data : []
            if (offset === 0 && list.length === 0)
              useFallbackListing = true
          }
          catch (searchError) {
            if (isAbortLikeError(searchError, options.signal))
              throw searchError
            useFallbackListing = true
          }
        }

        if (useFallbackListing) {
          const fallbackRes = await api.getFilesWithFallback(
            {
              aid: 1,
              cid: rootCid,
              offset,
              limit: PAGE_LIMIT,
              show_dir: 0,
              suffix,
              r_all: 1,
              o: 'user_ptime',
              asc: 0,
              custom_order: 1,
              format: 'json',
              cur: 0,
              natsort: 0,
            },
            options.signal,
          )
          list = Array.isArray(fallbackRes.data) ? fallbackRes.data : []
        }

        const category = classifyExtension(suffix)
        const { pageAdded, sawNewRawFid } = collectPageJunkItems(
          list,
          seenRawFids,
          byFid,
          category,
          `匹配后缀 .${suffix}`,
          suffix,
        )
        if (pageAdded.length > 0)
          options.onBatch?.(pageAdded)

        suffixSucceeded = true

        if (list.length < PAGE_LIMIT || (list.length > 0 && !sawNewRawFid))
          break

        options.onProgress?.({
          scannedSuffixes,
          totalSuffixes,
          currentLabel: `.${suffix}`,
          found: byFid.size,
        })

        offset += PAGE_LIMIT
        await delayWithAbort(pageDelayMs, options.signal)
      }
    }
    catch (error) {
      if (isAbortLikeError(error, options.signal))
        throw error
      if (firstError === undefined)
        firstError = error
    }

    if (suffixSucceeded)
      succeededTasks += 1

    scannedSuffixes += 1
    options.onProgress?.({
      scannedSuffixes,
      totalSuffixes,
      currentLabel: `.${suffix}`,
      found: byFid.size,
    })

    if (scannedSuffixes < totalSuffixes)
      await delayWithAbort(pageDelayMs, options.signal)
  }

  if (options.includeMagnetSearch) {
    throwIfAborted(options.signal)
    let offset = 0
    let magnetSucceeded = false

    try {
      const seenRawFids = new Set<string>()
      while (true) {
        throwIfAborted(options.signal)

        const res = await api.searchFiles(
          {
            aid: 1,
            cid: rootCid,
            search_value: 'magnet',
            offset,
            limit: PAGE_LIMIT,
            fc: 2,
            show_dir: 0,
            format: 'json',
          },
          options.signal,
        )

        const list = Array.isArray(res.data) ? res.data : []
        const { pageAdded, sawNewRawFid } = collectPageJunkItems(
          list,
          seenRawFids,
          byFid,
          'textMagnet',
          '匹配磁力关键词搜索',
        )
        if (pageAdded.length > 0)
          options.onBatch?.(pageAdded)

        magnetSucceeded = true

        if (list.length < PAGE_LIMIT || (list.length > 0 && !sawNewRawFid))
          break

        options.onProgress?.({
          scannedSuffixes,
          totalSuffixes,
          currentLabel: 'magnet 搜索',
          found: byFid.size,
        })

        offset += PAGE_LIMIT
        await delayWithAbort(pageDelayMs, options.signal)
      }
    }
    catch (error) {
      if (isAbortLikeError(error, options.signal))
        throw error
      if (firstError === undefined)
        firstError = error
    }

    if (magnetSucceeded)
      succeededTasks += 1

    scannedSuffixes += 1
    options.onProgress?.({
      scannedSuffixes,
      totalSuffixes,
      currentLabel: 'magnet 搜索',
      found: byFid.size,
    })
  }

  if (totalSuffixes > 0 && succeededTasks === 0 && firstError !== undefined)
    throw firstError

  return Array.from(byFid.values())
}
