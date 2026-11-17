import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { calculateVideoCoverTimes, getVideoCover, useSmartVideoCover } from '../index'

const cacheStore = new Map<string, { value: unknown }>()
const seekCalls: number[] = []
let blobCounter = 0

vi.mock('@/utils/cache', () => ({
  videoCoverCache: {
    get: vi.fn(async (key: string) => cacheStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      cacheStore.set(key, { value })
    }),
  },
}))

vi.mock('@/utils/drive115Instance', () => ({
  drive115: {
    video: {
      getM3u8: vi.fn(async () => [{ quality: 1, url: 'https://example.com/test.m3u8' }]),
    },
  },
}))

vi.mock('@/utils/clipper/m3u8Clipper', () => ({
  M3U8ClipperNew: class {
    open = vi.fn(async () => {})
    destroy = vi.fn()
    seek = vi.fn(async (time: number) => {
      seekCalls.push(time)
      return {
        frameTime: time,
        videoFrame: {
          displayWidth: 320,
          displayHeight: 180,
          close: vi.fn(),
        },
      }
    })
  },
}))

const visibilityRef = ref(false)
vi.mock('@vueuse/core', () => ({
  useElementVisibility: () => visibilityRef,
  useScroll: () => ({ isScrolling: ref(false) }),
}))

describe('useVideoCover', () => {
  beforeEach(() => {
    cacheStore.clear()
    seekCalls.length = 0
    blobCounter = 0
    visibilityRef.value = false

    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({})))
    vi.stubGlobal('OffscreenCanvas', class {
      getContext = () => ({ drawImage: vi.fn() })
      convertToBlob = async () => new Blob(['frame'])
    })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => `blob:test-${++blobCounter}`),
      revokeObjectURL: vi.fn(),
    })
  })

  it('按张数独立计算时间点，6 张不复用 8 张的时间点', () => {
    const times8 = calculateVideoCoverTimes(1000, 8)
    const times6 = calculateVideoCoverTimes(1000, 6)

    expect(times8).toHaveLength(8)
    expect(times6).toHaveLength(6)
    expect(times6).not.toEqual(times8.slice(0, 6))
    // 1000s: offset=200, range=600 -> 8张步长75, 6张步长100
    expect(times8).toEqual([200, 275, 350, 425, 500, 575, 650, 725])
    expect(times6).toEqual([200, 300, 400, 500, 600, 700])
  })

  it('部分命中缓存时仅补截缺失帧并保持顺序', async () => {
    cacheStore.set('sha1_200', {
      value: {
        blob: new Blob(['cached-200']),
        width: 320,
        height: 180,
        frameTime: 200,
        seekTime: 200,
      },
    })
    cacheStore.set('sha1_400', {
      value: {
        blob: new Blob(['cached-400']),
        width: 320,
        height: 180,
        frameTime: 400,
        seekTime: 400,
      },
    })

    const result = await getVideoCover('sha1', 'pick', [200, 300, 400])

    expect(seekCalls).toEqual([300])
    expect(result.map(item => item.seekTime)).toEqual([200, 300, 400])
    expect(cacheStore.has('sha1_300')).toBe(true)
  })

  it('修改截图张数后实时清理旧图并按新张数重新截图', async () => {
    const scope = effectScope()
    const options = ref({
      sha1: 'sha2',
      pickCode: 'pick2',
      coverNum: 8,
      duration: 1000,
    })

    const hook = scope.run(() => useSmartVideoCover(options, {
      elementRef: ref(),
    }))!

    visibilityRef.value = true
    await vi.waitFor(() => {
      expect(hook.videoCover.isReady).toBe(true)
    })
    expect(hook.videoCover.state).toHaveLength(8)

    seekCalls.length = 0
    options.value = {
      ...options.value,
      coverNum: 6,
    }
    await nextTick()

    await vi.waitFor(() => {
      expect(hook.videoCover.isReady).toBe(true)
      expect(hook.videoCover.state).toHaveLength(6)
    })

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(8)
    // 200 和 500 与 8 张重合会命中缓存，其余 4 帧（300, 400, 600, 700）按 6 张时间点新截
    expect(seekCalls).toEqual([300, 400, 600, 700])
    scope.stop()
  })
})
