import type { CacheValue } from '@115master/shared'
import type { JavInfo } from '@/utils/jav/jav'
import { javCache } from '@/utils/cache/javCache'
import { normalizeAvNumber } from '@/utils/jav/jav'
import { appLogger } from '@/utils/logger'

const logger = appLogger.sub('JavCacheReader')

/** 评估一条 JavInfo 的元数据完整度，用于同番号多来源去重时择优保留 */
function scoreJavInfo(info: JavInfo): number {
  return (info.actors?.length ?? 0) * 4
    + (info.category?.length ?? 0) * 2
    + (info.title ? 3 : 0)
    + (info.cover?.url ? 2 : 0)
    + (info.director?.length ?? 0)
}

/**
 * 读取本地 javCache 中全部已缓存的作品元数据，按标准化番号聚合为 Map
 */
export async function loadAllCachedJavInfo(): Promise<Map<string, JavInfo>> {
  const result = new Map<string, JavInfo>()
  try {
    await javCache.storage.iterate<CacheValue<JavInfo> | null, void>((entry: CacheValue<JavInfo> | null) => {
      const info = entry?.value
      if (!info || !info.avNumber)
        return
      const key = normalizeAvNumber(info.avNumber)
      if (!key)
        return
      const existing = result.get(key)
      if (!existing || scoreJavInfo(info) > scoreJavInfo(existing)) {
        result.set(key, info)
      }
    })
  }
  catch (error) {
    logger.warn('读取 javCache 失败，将仅使用文件名与番号匹配', error)
  }
  return result
}
