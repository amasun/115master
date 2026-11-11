import type { ComputedRef, MaybeRef, Ref } from 'vue'
import type {
  CreateDocMeta,
  Marker,
  MarkerDoc,
  UpdateMarkerPatch,
} from '@/utils/markers'
import { computed, shallowRef, toValue, watch } from 'vue'
import { useToast } from '@/components/Toast'
import { markerStore } from '@/utils/cache/markerStore'
import { appLogger } from '@/utils/logger'
import {
  addMarker,
  createDoc,
  pruneTombstones,
  removeMarker,
  updateMarker,
  visibleMarkers,
} from '@/utils/markers'

/** 日志记录器 */
const logger = appLogger.sub('useDataMarkers')

/** 文件信息源类型 */
export type MarkerFileInfoSource
  = | { state?: { pick_code?: string, file_id?: string, file_name?: string, play_long?: string | number } }
    | (() => { pickCode?: string, fileId?: string, fileName?: string, duration?: number })

/** Hook 返回值接口 */
export interface UseDataMarkersReturn {
  /** 当前可见打点列表 */
  markers: ComputedRef<Marker[]>
  /** 当前打点文档 */
  currentDoc: Ref<MarkerDoc | null>
  /** 是否正在加载 */
  loading: Ref<boolean>
  /** 新增打点 */
  add: (time: number, label?: string) => Promise<void>
  /** 更新打点 */
  update: (id: string, patch: UpdateMarkerPatch) => Promise<void>
  /** 删除打点 */
  remove: (id: string) => Promise<void>
  /** 刷新重新加载 */
  reload: () => Promise<void>
}

/** 提取文档元信息 */
function extractMeta(pickCode: string, fileInfo?: MarkerFileInfoSource): CreateDocMeta {
  if (typeof fileInfo === 'function') {
    const res = fileInfo()
    if (res.pickCode && res.pickCode !== pickCode) {
      return { pickCode }
    }
    return {
      pickCode,
      ...(res.fileId !== undefined ? { fileId: res.fileId } : {}),
      ...(res.fileName !== undefined ? { fileName: res.fileName } : {}),
      ...(res.duration !== undefined ? { duration: res.duration } : {}),
    }
  }

  if (fileInfo && 'state' in fileInfo && fileInfo.state) {
    const state = fileInfo.state
    if (state.pick_code && state.pick_code !== pickCode) {
      return { pickCode }
    }
    const duration = state.play_long !== undefined ? Number(state.play_long) : undefined
    return {
      pickCode,
      ...(state.file_id ? { fileId: state.file_id } : {}),
      ...(state.file_name ? { fileName: state.file_name } : {}),
      ...(duration && Number.isFinite(duration) ? { duration } : {}),
    }
  }

  return { pickCode }
}

/**
 * 视频打点数据管理 Hook
 * @param pickCode 视频提取码响应式引用
 * @param fileInfo 文件信息数据源
 */
export function useDataMarkers(
  pickCode: MaybeRef<string | undefined>,
  fileInfo?: MarkerFileInfoSource,
): UseDataMarkersReturn {
  const currentDoc = shallowRef<MarkerDoc | null>(null)
  const loading = shallowRef(false)
  let loadSequence = 0
  let currentLoadPromise: Promise<void> | null = null
  let loadFailed = false

  /** 可见打点列表 */
  const markers = computed(() => {
    return currentDoc.value ? visibleMarkers(currentDoc.value) : []
  })

  /** 加载打点文档（带序列号防竞态） */
  async function loadDoc(code: string | undefined): Promise<void> {
    const sequence = ++loadSequence
    // 切换开始时立即把 currentDoc 置空（界面不再显示上一个视频的刻度）
    currentDoc.value = null
    loadFailed = false

    if (!code) {
      loading.value = false
      currentLoadPromise = null
      return
    }

    loading.value = true
    const p = (async () => {
      try {
        const doc = await markerStore.getDoc(code)
        if (sequence !== loadSequence) {
          return
        }
        currentDoc.value = doc
        loadFailed = false
      }
      catch (error) {
        if (sequence !== loadSequence) {
          return
        }
        currentDoc.value = null
        loadFailed = true
        logger.error('加载打点文档失败', error)
      }
      finally {
        if (sequence === loadSequence) {
          loading.value = false
        }
      }
    })()

    currentLoadPromise = p
    await p
  }

  /**
   * 确保当前视频打点加载完成
   * 若初始处于加载失败状态，重试一次 getDoc，仍失败则抛错放弃操作
   */
  async function ensureLoaded(initialCode: string): Promise<boolean> {
    if (currentLoadPromise) {
      try {
        await currentLoadPromise
      }
      catch {
        // 异常已在 loadDoc 中捕获并记录状态
      }
    }

    /** await 之后再次核对当前活跃提取码 */
    const activeCode = toValue(pickCode)
    if (activeCode !== initialCode) {
      return false
    }

    // getDoc 失败状态：重试一次，仍失败则放弃本次操作并抛错
    if (loadFailed) {
      try {
        loading.value = true
        const doc = await markerStore.getDoc(initialCode)
        const currentActive = toValue(pickCode)
        if (currentActive !== initialCode) {
          return false
        }
        currentDoc.value = doc
        loadFailed = false
      }
      catch (err) {
        logger.error('重试加载打点文档失败', err)
        try {
          useToast().error('读取打点数据失败，无法保存')
        }
        catch {
          // Toast 降级
        }
        throw err
      }
      finally {
        loading.value = false
      }
    }

    return true
  }

  /** 持久化保存打点文档 */
  async function saveDoc(doc: MarkerDoc): Promise<void> {
    const activeCode = toValue(pickCode)
    if (!activeCode || doc.pickCode !== activeCode) {
      logger.warn('当前视频提取码与打点文档不匹配，跳过保存', {
        activeCode,
        docCode: doc.pickCode,
      })
      return
    }

    const previousDoc = currentDoc.value
    const pruned = pruneTombstones(doc, Date.now())
    currentDoc.value = pruned

    try {
      await markerStore.saveDoc(pruned)
    }
    catch (error) {
      // 保存失败时回滚恢复为保存前的文档
      currentDoc.value = previousDoc
      logger.error('保存打点文档失败', error)
      try {
        useToast().error(error instanceof Error ? error.message : '保存打点失败')
      }
      catch {
        // 无 ToastContainer 时降级静默
      }
      throw error
    }
  }

  /** 新增打点 */
  async function add(time: number, label?: string): Promise<void> {
    const code = toValue(pickCode)
    if (!code) {
      return
    }

    const ok = await ensureLoaded(code)
    if (!ok) {
      return
    }

    const now = Date.now()
    let doc = currentDoc.value
    if (!doc || doc.pickCode !== code) {
      doc = createDoc(extractMeta(code, fileInfo), now)
    }

    const updated = addMarker(doc, { time, label }, now)
    await saveDoc(updated)
  }

  /** 更新打点 */
  async function update(id: string, patch: UpdateMarkerPatch): Promise<void> {
    const code = toValue(pickCode)
    if (!code) {
      return
    }

    const ok = await ensureLoaded(code)
    if (!ok || !currentDoc.value || currentDoc.value.pickCode !== code) {
      return
    }

    const now = Date.now()
    const updated = updateMarker(currentDoc.value, id, patch, now)
    if (updated === currentDoc.value) {
      return
    }
    await saveDoc(updated)
  }

  /** 删除打点（写入墓碑） */
  async function remove(id: string): Promise<void> {
    const code = toValue(pickCode)
    if (!code) {
      return
    }

    const ok = await ensureLoaded(code)
    if (!ok || !currentDoc.value || currentDoc.value.pickCode !== code) {
      return
    }

    const now = Date.now()
    const updated = removeMarker(currentDoc.value, id, now)
    if (updated === currentDoc.value) {
      return
    }
    await saveDoc(updated)
  }

  /** 监听 pickCode 变更自动加载 */
  watch(
    () => toValue(pickCode),
    (newCode) => {
      void loadDoc(newCode)
    },
    { immediate: true },
  )

  return {
    markers,
    currentDoc,
    loading,
    add,
    update,
    remove,
    reload: () => loadDoc(toValue(pickCode)),
  }
}
