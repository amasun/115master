import { CacheCore } from '@115master/shared'
import { STORE_NAME } from '@/utils/cache/const'
import { appLogger } from '@/utils/logger'
import {
  clearVideoIndexSnapshot,
  loadVideoIndexSnapshot,
  saveVideoIndexSnapshot,
} from '@/utils/superSearch'

const POSTER_THUMB_STORE_NAME = 'library_poster_thumb_v1'

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

export const posterThumbCache = new PosterThumbCache()
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
