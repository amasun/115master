import type { Share } from '@115master/drive115'
import type { IndexedVideo, IndexProgress, VideoIndexSnapshot } from './types'
import { drive115 } from '@/utils/drive115Instance'
import { getAvNumber } from '@/utils/getNumber'
import { appLogger } from '@/utils/logger'
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

/** 将 115 文件项转换为轻量的 IndexedVideo 记录 */
export function toIndexedVideo(item: Share.Entity.FilesItem): IndexedVideo | null {
  if (item.fc !== 1 || !item.fid || !item.pc)
    return null

  const avNumber = getAvNumber(item.n) || null
  const size = typeof item.s === 'number' ? item.s : Number(item.s) || 0
  const mtime = Number(item.tu || item.t) || 0

  return {
    fid: String(item.fid),
    cid: String(item.pid || '0'),
    pickCode: String(item.pc),
    name: item.n,
    avNumber,
    size,
    duration: Number(item.play_long) || 0,
    mtime,
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
  const delayMs = options.pageDelayMs ?? DEFAULT_PAGE_DELAY_MS

  logger.info('开始同步网盘视频索引', { mode, rootCids })

  const byFid = new Map<string, IndexedVideo>()
  if (mode === 'incremental' && existing) {
    for (const item of existing.items) {
      byFid.set(item.fid, item)
    }
  }

  let pages = 0
  let fetched = 0
  let total = 0

  for (const rootCid of rootCids) {
    let offset = 0
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
          cur: 1,
          natsort: 0,
        },
        options.signal,
      )

      const list = Array.isArray(res.data) ? res.data : []
      pages += 1
      if (offset === 0) {
        total += Number(res.count) || list.length
      }

      let hitOlder = false
      for (const raw of list) {
        const record = toIndexedVideo(raw)
        if (!record)
          continue
        if (mode === 'incremental' && lastSyncSec > 0 && record.mtime > 0 && record.mtime < lastSyncSec) {
          hitOlder = true
          break
        }
        byFid.set(record.fid, record)
        fetched += 1
      }

      options.onProgress?.({
        pages,
        fetched,
        total,
        mode,
      })

      if (hitOlder || list.length < PAGE_LIMIT)
        break

      offset += PAGE_LIMIT
      if (total > 0 && offset >= total)
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
