import type { ActorWorksCacheEntry } from './types'
import { CacheCore } from '@115master/shared'
import { normalizeActressName } from '@/utils/actressNameMatcher'
import { STORE_NAME } from '@/utils/cache/const'
import { appLogger } from '@/utils/logger'

const ACTOR_WORKS_STORE_NAME = 'actor_works_v1'

/** 演员作品缓存有效期（7 天） */
export const ACTOR_WORKS_TTL_MS = 7 * 24 * 60 * 60 * 1000

class ActorWorksCache extends CacheCore<ActorWorksCacheEntry> {
  constructor() {
    super({
      name: STORE_NAME,
      storeName: ACTOR_WORKS_STORE_NAME,
      enableQuotaManagement: false,
      logger: appLogger.sub('ActorWorksCache'),
    })
  }
}

const cache = new ActorWorksCache()

/** 统一规范化演员缓存主键（繁简与日文汉字归一化） */
export function normalizeActorKey(name: string): string {
  return normalizeActressName(name)
}

/** 读取未过期的演员作品表缓存 */
export async function getCachedActorWorks(
  actorName: string,
  now = Date.now(),
): Promise<ActorWorksCacheEntry | null> {
  const key = normalizeActorKey(actorName)
  if (!key)
    return null

  const cached = await cache.get(key)
  if (!cached)
    return null

  if (now - cached.value.cachedAt >= ACTOR_WORKS_TTL_MS) {
    await cache.remove(key)
    return null
  }

  return cached.value
}

/** 保存演员作品表，并为所有已知别名建立索引映射 */
export async function saveActorWorks(entry: ActorWorksCacheEntry): Promise<void> {
  const keys = new Set<string>()
  const primary = normalizeActorKey(entry.actorKey) || normalizeActorKey(entry.name)
  if (primary)
    keys.add(primary)

  for (const alias of entry.aliases) {
    const aliasKey = normalizeActorKey(alias)
    if (aliasKey)
      keys.add(aliasKey)
  }

  if (keys.size === 0)
    return

  await Promise.all(Array.from(keys, key => cache.set(key, entry)))
}

/** 移除指定演员的作品缓存 */
export async function removeCachedActorWorks(actorName: string): Promise<void> {
  const key = normalizeActorKey(actorName)
  if (!key)
    return
  await cache.remove(key)
}
