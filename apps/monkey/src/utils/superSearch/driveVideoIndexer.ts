import type { Share } from '@115master/drive115'
import type { IndexedVideo, IndexedVideoLabel, IndexProgress, VideoIndexSnapshot } from './types'
import { drive115 } from '@/utils/drive115Instance'
import { folderPathResolver } from '@/utils/driveFolderPath'
import { appLogger } from '@/utils/logger'
import { parseMediaIdentity } from '@/utils/mediaIdentity'
import { loadVideoIndexSnapshot, saveVideoIndexSnapshot } from './videoIndexStore'

const logger = appLogger.sub('DriveVideoIndexer')

/** 115 单页最大拉取条数 */
const PAGE_LIMIT = 1150
/** 页间节流延迟（ms），降低连续翻页触发风控风险 */
const DEFAULT_PAGE_DELAY_MS = 200

export interface SyncVideoIndexOptions {
  /** 要扫描的根目录 cid 列表，默认全盘 ['0'] */
  rootCids?: string[]
  /** 同步模式：incremental 仅拉取比上次更新的文件，full 全量重建 */
  mode?: 'full' | 'incremental'
  /** 取消信号 */
  signal?: AbortSignal
  /** 进度回调 */
  onProgress?: (progress: IndexProgress) => void
  /** 页间节流时间（测试可传 0） */
  pageDelayMs?: number
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0)
    return Promise.resolve()
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('同步已取消', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(signal?.reason ?? new DOMException('同步已取消', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** 兼容 115 /files 不同接口形态的原始文件项 */
interface RawDriveFileItem {
  fc?: number | string
  fid?: string
  cid?: string
  pid?: string
  pc?: string
  sha?: string
  n?: string
  s?: number | string
  t?: number | string
  tu?: number | string
  tp?: number | string
  te?: number | string
  play_long?: number | string
  m?: number | string
  is_m?: number | string
  fl?: unknown
}

/** 115 文件标签原始结构 */
interface RawDriveLabelItem {
  id?: unknown
  name?: unknown
  color?: unknown
}

/** 解析 115 网盘文件文字标签列表，并按 id 去重 */
function parseDriveLabels(rawFl: unknown): IndexedVideoLabel[] {
  if (!Array.isArray(rawFl))
    return []

  const labels: IndexedVideoLabel[] = []
  const seenIds = new Set<string>()

  for (const item of rawFl) {
    if (typeof item !== 'object' || item === null)
      continue
    const raw = item as RawDriveLabelItem
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (!name)
      continue

    const id = raw.id !== undefined && raw.id !== null && String(raw.id).trim()
      ? String(raw.id).trim()
      : name
    if (seenIds.has(id))
      continue
    seenIds.add(id)

    const color = typeof raw.color === 'string' && raw.color.trim() ? raw.color.trim() : undefined
    labels.push(color ? { id, name, color } : { id, name })
  }

  return labels
}

/** 解析 115 文件时间戳（支持秒/毫秒数字或日期字符串，统一转为秒级时间戳） */
function parseDriveTimestamp(value: number | string | undefined): number {
  if (value === undefined || value === null || value === '')
    return 0

  const num = typeof value === 'number' ? value : Number(value)
  if (Number.isFinite(num) && num > 0)
    return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num)

  if (typeof value === 'string') {
    const parsed = Date.parse(value.trim().replace(' ', 'T'))
    if (Number.isFinite(parsed) && parsed > 0)
      return Math.floor(parsed / 1000)
  }

  return 0
}

/** 将 115 文件项转换为轻量的 IndexedVideo 记录 */
export function toIndexedVideo(item: Share.Entity.FilesItem | RawDriveFileItem): IndexedVideo | null {
  const raw: RawDriveFileItem = item
  if (raw.fc === 0 || raw.fc === '0')
    return null
  if (!raw.fid || !raw.pc || !raw.n)
    return null

  const cid = String(raw.pid || raw.cid || '0')
  const folder = cid !== '0' ? folderPathResolver.getCached(cid) : null
  const identity = parseMediaIdentity(raw.n, folder)
  const size = typeof raw.s === 'number' ? raw.s : Number(raw.s) || 0
  /** tp(user_ptime) / t 为文件自身的入库/创建时间，不受移动目录影响，与同步排序字段 o: 'user_ptime' 保持一致；te / tu 仅作缺失兜底 */
  const mtime = parseDriveTimestamp(raw.tp)
    || parseDriveTimestamp(raw.t)
    || parseDriveTimestamp(raw.te)
    || parseDriveTimestamp(raw.tu)
  const sha1 = typeof raw.sha === 'string' ? raw.sha.trim() : ''
  const starred = raw.m === 1 || raw.m === '1' || raw.is_m === 1 || raw.is_m === '1'
  const labels = parseDriveLabels(raw.fl)

  return {
    fid: String(raw.fid),
    cid,
    pickCode: String(raw.pc),
    ...(sha1 ? { sha1 } : {}),
    name: raw.n,
    avNumber: identity.avNumber,
    ...(identity.platform !== 'unknown' ? { platform: identity.platform } : {}),
    ...(identity.creator ? { creator: identity.creator } : {}),
    size,
    duration: Number(raw.play_long) || 0,
    mtime,
    ...(starred ? { starred: true } : {}),
    ...(labels.length > 0 ? { labels } : {}),
  }
}

/**
 * 同步 115 网盘视频索引
 * @description 使用 show_dir=0 & type=4 穿透任意层级子目录，扁平分页拉取视频文件。
 */
export async function syncDriveVideoIndex(
  options: SyncVideoIndexOptions = {},
): Promise<VideoIndexSnapshot> {
  const existing = await loadVideoIndexSnapshot()
  const rootCids = options.rootCids?.length
    ? options.rootCids
    : (existing?.rootCids.length ? existing.rootCids : ['0'])
  const canIncremental = options.mode === 'incremental' && Boolean(existing && existing.items.length > 0)
  const mode: 'full' | 'incremental' = canIncremental ? 'incremental' : 'full'
  const lastSyncSec = canIncremental && existing ? Math.floor(existing.lastSyncAt / 1000) : 0
  const cutoffSec = lastSyncSec > 0 ? Math.max(0, lastSyncSec - 300) : 0
  const delayMs = options.pageDelayMs ?? DEFAULT_PAGE_DELAY_MS

  logger.info('开始同步网盘视频索引', { mode, rootCids })

  const byFid = new Map<string, IndexedVideo>()
  const existingFids = new Set<string>()
  if (mode === 'incremental' && existing) {
    for (const item of existing.items) {
      byFid.set(item.fid, item)
      existingFids.add(item.fid)
    }
  }

  let pages = 0
  let fetched = 0
  let total = 0

  for (const rootCid of rootCids) {
    let offset = 0
    let dirTotal = 0
    while (true) {
      if (options.signal?.aborted) {
        throw options.signal.reason ?? new DOMException('同步已取消', 'AbortError')
      }

      const res = await drive115.file.getFilesWithFallback(
        {
          aid: 1,
          cid: rootCid,
          offset,
          limit: PAGE_LIMIT,
          show_dir: 0,
          type: 4,
          format: 'json',
          r_all: 1,
          o: 'user_ptime',
          asc: 0,
          custom_order: 1,
          cur: 0,
          natsort: 0,
        },
        options.signal,
      )

      const list = Array.isArray(res.data) ? res.data : []
      pages += 1
      if (offset === 0) {
        const resCount = Number(res.count)
        dirTotal = resCount > 0 ? resCount : 0
        total += dirTotal > 0 ? dirTotal : list.length
      }

      let lastValidRecord: IndexedVideo | null = null
      for (const raw of list) {
        const record = toIndexedVideo(raw)
        if (!record)
          continue
        byFid.set(record.fid, record)
        lastValidRecord = record
        fetched += 1
      }

      const isTimeDesc = (!res.order || res.order === 'user_ptime' || res.order === 'user_utime')
        && Number(res.is_asc) !== 1
      const hitOlder = mode === 'incremental'
        && cutoffSec > 0
        && isTimeDesc
        && lastValidRecord !== null
        && existingFids.has(lastValidRecord.fid)
        && lastValidRecord.mtime > 0
        && lastValidRecord.mtime < cutoffSec

      options.onProgress?.({
        pages,
        fetched,
        total,
        mode,
      })

      if (hitOlder || list.length === 0)
        break

      offset += list.length
      if (dirTotal > 0 ? offset >= dirTotal : list.length < PAGE_LIMIT)
        break

      await sleep(delayMs, options.signal)
    }
  }

  const now = Date.now()
  const items = Array.from(byFid.values()).sort((a, b) => b.mtime - a.mtime)
  const snapshot: VideoIndexSnapshot = {
    schemaVersion: 1,
    rootCids,
    lastFullSyncAt: mode === 'full' ? now : (existing?.lastFullSyncAt ?? now),
    lastSyncAt: now,
    items,
  }

  await saveVideoIndexSnapshot(snapshot)
  logger.info('网盘视频索引同步完成', { mode, count: items.length, pages })
  return snapshot
}
