import type { IndexedVideo, VideoIndexSnapshot } from './types'
import { CacheCore } from '@115master/shared'
import { STORE_NAME } from '@/utils/cache/const'
import { normalizeAvNumber } from '@/utils/jav/jav'
import { appLogger } from '@/utils/logger'

const VIDEO_INDEX_STORE_NAME = 'video_index_v1'
const SNAPSHOT_KEY = 'snapshot'

/**
 * 网盘视频索引持久化存储
 * @description 关闭配额自动淘汰，避免几 MB 的单键快照被 LRU 误删。
 */
class VideoIndexCache extends CacheCore<VideoIndexSnapshot> {
  constructor() {
    super({
      name: STORE_NAME,
      storeName: VIDEO_INDEX_STORE_NAME,
      enableQuotaManagement: false,
      logger: appLogger.sub('VideoIndexCache'),
    })
  }
}

const cache = new VideoIndexCache()

let memorySnapshot: VideoIndexSnapshot | null = null
let memoryByAv: Map<string, IndexedVideo[]> | null = null

/** 按标准化番号构建内存查找表 */
export function buildAvNumberMap(items: IndexedVideo[]): Map<string, IndexedVideo[]> {
  const map = new Map<string, IndexedVideo[]>()
  for (const item of items) {
    if (!item.avNumber)
      continue
    const key = normalizeAvNumber(item.avNumber)
    if (!key)
      continue
    const list = map.get(key)
    if (list)
      list.push(item)
    else
      map.set(key, [item])
  }
  return map
}

/** 读取网盘视频索引快照（优先命中内存） */
export async function loadVideoIndexSnapshot(): Promise<VideoIndexSnapshot | null> {
  if (memorySnapshot)
    return memorySnapshot

  const entry = await cache.get(SNAPSHOT_KEY)
  if (!entry || entry.value.schemaVersion !== 1)
    return null

  memorySnapshot = entry.value
  memoryByAv = buildAvNumberMap(entry.value.items)
  return memorySnapshot
}

/** 保存网盘视频索引快照并刷新内存索引 */
export async function saveVideoIndexSnapshot(snapshot: VideoIndexSnapshot): Promise<void> {
  await cache.set(SNAPSHOT_KEY, snapshot)
  memorySnapshot = snapshot
  memoryByAv = buildAvNumberMap(snapshot.items)
}

/** 清空网盘视频索引快照 */
export async function clearVideoIndexSnapshot(): Promise<void> {
  await cache.remove(SNAPSHOT_KEY)
  memorySnapshot = null
  memoryByAv = null
}

/** 获取当前内存中的番号查找表 */
export function getMemoryAvNumberMap(): Map<string, IndexedVideo[]> {
  if (memoryByAv)
    return memoryByAv
  if (!memorySnapshot)
    return new Map()
  memoryByAv = buildAvNumberMap(memorySnapshot.items)
  return memoryByAv
}
