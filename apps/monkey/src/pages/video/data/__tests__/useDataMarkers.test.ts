import type { MarkerDoc } from '@/utils/markers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useDataMarkers } from '../useDataMarkers'

// Mock useToast
const mockToastError = vi.fn()
vi.mock('@/components/Toast', () => ({
  useToast: () => ({
    error: mockToastError,
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}))

// Mock markerStore
const mockGetDoc = vi.fn()
const mockSaveDoc = vi.fn()
vi.mock('@/utils/cache/markerStore', () => ({
  markerStore: {
    getDoc: (...args: unknown[]) => mockGetDoc(...args),
    saveDoc: (...args: unknown[]) => mockSaveDoc(...args),
  },
}))

describe('useDataMarkers', () => {
  let scope: ReturnType<typeof effectScope>

  beforeEach(() => {
    vi.clearAllMocks()
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
  })

  it('根据 pickCode 自动加载打点文档并计算可见打点', async () => {
    const doc: MarkerDoc = {
      v: 1,
      pickCode: 'video-1',
      fileId: 'fid-1',
      fileName: 'test.mp4',
      duration: 120,
      updatedAt: 1000,
      markers: [
        { id: 'm1', time: 10, label: '点1', createdAt: 1000, updatedAt: 1000 },
        { id: 'm2', time: 5, label: '点0', createdAt: 1000, updatedAt: 1000 },
        { id: 'm3', time: 20, label: '已删除', createdAt: 1000, updatedAt: 1000, deleted: true },
      ],
    }
    mockGetDoc.mockResolvedValueOnce(doc)

    const pickCode = ref('video-1')
    let hook!: ReturnType<typeof useDataMarkers>
    scope.run(() => {
      hook = useDataMarkers(pickCode)
    })

    expect(mockGetDoc).toHaveBeenCalledWith('video-1')
    await vi.waitFor(() => {
      expect(hook.markers.value.length).toBe(2)
    })

    // 按时间升序排序，且过滤墓碑
    expect(hook.markers.value[0].id).toBe('m2')
    expect(hook.markers.value[1].id).toBe('m1')
  })

  it('处理加载竞态：快速切换视频时不被迟到的旧响应覆盖', async () => {
    let resolveFirst!: (val: MarkerDoc | null) => void
    const firstPromise = new Promise<MarkerDoc | null>((resolve) => {
      resolveFirst = resolve
    })

    const secondDoc: MarkerDoc = {
      v: 1,
      pickCode: 'video-2',
      updatedAt: 2000,
      markers: [
        { id: 'm-v2', time: 15, label: '视频2打点', createdAt: 2000, updatedAt: 2000 },
      ],
    }

    mockGetDoc.mockImplementation((code: string) => {
      if (code === 'video-1') {
        return firstPromise
      }
      if (code === 'video-2') {
        return Promise.resolve(secondDoc)
      }
      return Promise.resolve(null)
    })

    const pickCode = ref('video-1')
    let hook!: ReturnType<typeof useDataMarkers>
    scope.run(() => {
      hook = useDataMarkers(pickCode)
    })

    // 切换到 video-2
    pickCode.value = 'video-2'
    await nextTick()

    // 等待 video-2 加载完成
    await vi.waitFor(() => {
      expect(hook.currentDoc.value?.pickCode).toBe('video-2')
    })

    // 此时 video-1 迟到响应
    const firstDoc: MarkerDoc = {
      v: 1,
      pickCode: 'video-1',
      updatedAt: 1000,
      markers: [
        { id: 'm-v1', time: 5, label: '视频1打点', createdAt: 1000, updatedAt: 1000 },
      ],
    }
    resolveFirst(firstDoc)
    await nextTick()

    // 仍然应为 video-2 的打点
    expect(hook.currentDoc.value?.pickCode).toBe('video-2')
    expect(hook.markers.value[0].id).toBe('m-v2')
  })

  it('首次打点自动创建文档并持久化到 markerStore', async () => {
    mockGetDoc.mockResolvedValueOnce(null)
    mockSaveDoc.mockResolvedValue(undefined)

    const pickCode = ref('video-new')
    const fileInfo = {
      state: {
        file_id: 'fid-100',
        file_name: 'demo.mp4',
        play_long: '3600',
      },
    }

    let hook!: ReturnType<typeof useDataMarkers>
    scope.run(() => {
      hook = useDataMarkers(pickCode, fileInfo)
    })

    await vi.waitFor(() => {
      expect(hook.loading.value).toBe(false)
    })

    await hook.add(60, '精彩瞬间')

    expect(mockSaveDoc).toHaveBeenCalledTimes(1)
    const savedDoc = mockSaveDoc.mock.calls[0][0] as MarkerDoc
    expect(savedDoc.pickCode).toBe('video-new')
    expect(savedDoc.fileId).toBe('fid-100')
    expect(savedDoc.fileName).toBe('demo.mp4')
    expect(savedDoc.duration).toBe(3600)
    expect(savedDoc.markers.length).toBe(1)
    expect(savedDoc.markers[0].time).toBe(60)
    expect(savedDoc.markers[0].label).toBe('精彩瞬间')

    expect(hook.markers.value.length).toBe(1)
    expect(hook.markers.value[0].label).toBe('精彩瞬间')
  })

  it('支持修改打点和软删除打点并保存', async () => {
    const initialDoc: MarkerDoc = {
      v: 1,
      pickCode: 'video-1',
      updatedAt: 1000,
      markers: [
        { id: 'm1', time: 10, label: '旧备注', createdAt: 1000, updatedAt: 1000 },
      ],
    }
    mockGetDoc.mockResolvedValueOnce(initialDoc)
    mockSaveDoc.mockResolvedValue(undefined)

    const pickCode = ref('video-1')
    let hook!: ReturnType<typeof useDataMarkers>
    scope.run(() => {
      hook = useDataMarkers(pickCode)
    })

    await vi.waitFor(() => {
      expect(hook.markers.value.length).toBe(1)
    })

    // 修改打点
    await hook.update('m1', { label: '新备注', time: 15 })
    expect(mockSaveDoc).toHaveBeenCalledTimes(1)
    expect(hook.markers.value[0].label).toBe('新备注')
    expect(hook.markers.value[0].time).toBe(15)

    // 删除打点
    await hook.remove('m1')
    expect(mockSaveDoc).toHaveBeenCalledTimes(2)
    // 软删除后可见打点列表为空
    expect(hook.markers.value.length).toBe(0)
    // 内部文档保留墓碑
    const lastSavedDoc = mockSaveDoc.mock.calls[1][0] as MarkerDoc
    expect(lastSavedDoc.markers[0].deleted).toBe(true)
  })

  it('保存前自动清理超过 30 天的过期墓碑', async () => {
    const expiredTime = Date.now() - 35 * 24 * 60 * 60 * 1000
    const initialDoc: MarkerDoc = {
      v: 1,
      pickCode: 'video-1',
      updatedAt: 1000,
      markers: [
        { id: 'active', time: 10, label: '存活打点', createdAt: 1000, updatedAt: 1000 },
        { id: 'expired-tombstone', time: 20, label: '过期墓碑', createdAt: 1000, updatedAt: expiredTime, deleted: true },
      ],
    }
    mockGetDoc.mockResolvedValueOnce(initialDoc)
    mockSaveDoc.mockResolvedValue(undefined)

    const pickCode = ref('video-1')
    let hook!: ReturnType<typeof useDataMarkers>
    scope.run(() => {
      hook = useDataMarkers(pickCode)
    })

    await vi.waitFor(() => {
      expect(hook.markers.value.length).toBe(1)
    })

    await hook.add(30, '新增打点')

    expect(mockSaveDoc).toHaveBeenCalledTimes(1)
    const saved = mockSaveDoc.mock.calls[0][0] as MarkerDoc
    // 过期墓碑应被 prune 清理
    expect(saved.markers.some(m => m.id === 'expired-tombstone')).toBe(false)
    expect(saved.markers.some(m => m.id === 'active')).toBe(true)
  })

  it('保存失败时不静默，抛出错误并触发 toast 提示', async () => {
    mockGetDoc.mockResolvedValueOnce(null)
    mockSaveDoc.mockRejectedValueOnce(new Error('Disk full error'))

    const pickCode = ref('video-1')
    let hook!: ReturnType<typeof useDataMarkers>
    scope.run(() => {
      hook = useDataMarkers(pickCode)
    })

    await vi.waitFor(() => {
      expect(hook.loading.value).toBe(false)
    })

    await expect(hook.add(10, '失败测试')).rejects.toThrow('Disk full error')
    expect(mockToastError).toHaveBeenCalledWith('Disk full error')
  })

  it('切换视频后不会将旧视频的打点保存到新视频', async () => {
    const doc1: MarkerDoc = {
      v: 1,
      pickCode: 'video-1',
      updatedAt: 1000,
      markers: [{ id: 'm1', time: 10, label: '点1', createdAt: 1000, updatedAt: 1000 }],
    }
    mockGetDoc.mockResolvedValueOnce(doc1)
    mockSaveDoc.mockResolvedValue(undefined)

    const pickCode = ref('video-1')
    let hook!: ReturnType<typeof useDataMarkers>
    scope.run(() => {
      hook = useDataMarkers(pickCode)
    })

    await vi.waitFor(() => {
      expect(hook.markers.value.length).toBe(1)
    })

    // 突然切换到 video-2
    pickCode.value = 'video-2'

    // 此时尝试更新针对旧 doc 的 id
    await hook.update('m1', { label: '旧视频不应写入' })

    // 不应调用 saveDoc 保存到新视频
    expect(mockSaveDoc).not.toHaveBeenCalled()
  })
})
