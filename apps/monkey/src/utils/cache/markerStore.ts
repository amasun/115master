import type { MarkerDoc } from '@/utils/markers/types'
import { CacheCore } from '@115master/shared'
import { appLogger } from '@/utils/logger'
import { STORE_NAME } from './const'

/** 打点存储 storeName */
const STORE_PREFIX = 'markers'

/**
 * 播放器打点本地存储管理器
 */
export class MarkerStore extends CacheCore<MarkerDoc> {
  /** 日志 */
  protected logger = appLogger.sub('MarkerStore')

  /** 构造函数 */
  constructor() {
    super({
      name: STORE_NAME,
      storeName: STORE_PREFIX,
      enableQuotaManagement: false,
      logger: appLogger.sub('MarkerStore'),
    })
  }

  /**
   * 重写 set 以保证底层存储写入失败时抛出错误，不被 CacheCore 吞掉
   */
  override async set(key: string, value: MarkerDoc): Promise<void> {
    const now = Date.now()
    const existingCache = await this.storage.getItem<{ createdAt?: number }>(key)
    const cacheValue = {
      value,
      createdAt: existingCache?.createdAt || now,
      updatedAt: now,
      version: this.storageOptions.version,
    }
    await this.storage.setItem(key, cacheValue)
  }

  /**
   * 获取指定视频的打点文档
   * @param pickCode 115 提取码
   */
  async getDoc(pickCode: string): Promise<MarkerDoc | null> {
    try {
      if (!pickCode)
        return null
      const item = await this.get(pickCode)
      return item?.value ?? null
    }
    catch (error) {
      this.logger.error('获取打点文档失败', error)
      return null
    }
  }

  /**
   * 保存打点文档
   * @param doc 打点文档
   */
  async saveDoc(doc: MarkerDoc): Promise<void> {
    if (!doc?.pickCode)
      return
    try {
      await this.set(doc.pickCode, doc)
    }
    catch (error) {
      this.logger.error('保存打点文档失败', error)
      throw error
    }
  }

  /**
   * 获取所有视频的打点文档
   */
  async getAllDocs(): Promise<Record<string, MarkerDoc>> {
    try {
      const result: Record<string, MarkerDoc> = {}
      await this.storage.iterate<{ value?: MarkerDoc }, void>((item: { value?: MarkerDoc } | null, key: string) => {
        if (item?.value?.pickCode) {
          result[item.value.pickCode] = item.value
        }
        else if (item?.value) {
          result[key] = item.value
        }
      })
      return result
    }
    catch (error) {
      this.logger.error('获取全部打点文档失败', error)
      return {}
    }
  }

  /**
   * 替换全部打点文档（导入时使用）
   * 先写入全部新文档，再删除不在新集合里的旧 key，任何一步失败都要抛出
   * @param docs 打点文档集合
   */
  async replaceAll(docs: Record<string, MarkerDoc> | MarkerDoc[]): Promise<void> {
    try {
      const list = Array.isArray(docs) ? docs : Object.values(docs)
      const newKeys = new Set<string>()

      // 1. 先写入全部新文档
      for (const doc of list) {
        if (doc?.pickCode) {
          await this.saveDoc(doc)
          newKeys.add(doc.pickCode)
        }
      }

      /** 2. 收集不在新集合里的旧 key 并逐一删除 */
      const oldKeysToDelete: string[] = []
      await this.storage.iterate<unknown, void>((_val: unknown, key: string) => {
        if (!newKeys.has(key))
          oldKeysToDelete.push(key)
      })

      for (const key of oldKeysToDelete)
        await this.remove(key)
    }
    catch (error) {
      this.logger.error('替换全部打点文档失败', error)
      throw error
    }
  }
}

/** 播放器打点存储单例 */
export const markerStore = new MarkerStore()
