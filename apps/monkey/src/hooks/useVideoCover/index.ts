import type { Ref } from 'vue'
import { Core } from '@115master/drive115'

import { image as imageUtil } from '@115master/utils'
import { useElementVisibility, useScroll } from '@vueuse/core'
import { computed, onUnmounted, reactive, watch } from 'vue'
import { FRIENDLY_ERROR_MESSAGE } from '@/constants'
import { videoCoverCache } from '@/utils/cache'
import { M3U8ClipperNew } from '@/utils/clipper/m3u8Clipper'
import { drive115 } from '@/utils/drive115Instance'
import { Scheduler, SchedulerError, TaskStatus } from '@/utils/scheduler'

/** 最大宽度 */
const MAX_WIDTH = 1280

/** 最大高度 */
const MAX_HEIGHT = 1280

/** 视频封面调度器 */
const videoCoverScheduler = new Scheduler<VideoCover[]>({
  maxConcurrent: 3,
})

/** 视频封面基础数据 */
interface VideoCoverBase {
  /** 宽度 */
  width: number
  /** 高度 */
  height: number
  /** 帧实际时间（秒） */
  frameTime: number
  /** 跳转时间（秒） */
  seekTime: number
}

/**
 * 视频封面原始数据
 */
export type VideoCoverRaw = VideoCoverBase & {
  /** 图片 blob */
  blob: Blob
}

/**
 * 视频封面数据
 */
export type VideoCover = VideoCoverBase & {
  /** 图片 blob URL */
  img: string
}

/**
 * 视频封面选项
 */
export interface VideoCoverOptions {
  /** sha1 */
  sha1: string
  /** 文件提取码 */
  pickCode: string
  /** 数量 */
  coverNum: number
  /** 持续时间 */
  duration: number
}

/**
 * 智能加载配置
 */
export interface SmartLoadConfig {
  /** 元素可见性检测的根元素 */
  elementRef: Ref<HTMLElement | undefined>
  /** 额外的可见性条件（如父容器可见性） */
  additionalVisible?: Ref<boolean>
  /** 滚动容器（用于优化可见性检测和滚动防抖） */
  scrollTarget?: Ref<HTMLElement | undefined> | HTMLElement
  /** 可见性检测的阈值 */
  threshold?: number
  /** 根边距 */
  rootMargin?: string
}

/**
 * 生成任务ID
 */
function generateTaskId(options: VideoCoverOptions): string {
  return `cover_${options.sha1}_${options.pickCode}_${options.coverNum}_${options.duration}`
}

/**
 * 获取缓存键
 */
const getCacheKey = (sha1: string, time: number): string => `${sha1}_${time}`

/**
 * 计算视频封面时间点
 * @param duration 视频时长
 * @param coverNum 封面数量
 * @returns 视频封面时间点数组
 */
export function calculateVideoCoverTimes(duration: number, coverNum: number): number[] {
  /** 偏移量 */
  const offset = duration / 5
  /** 获取最小时间 */
  const minTime = offset
  /** 获取最大时间 */
  const maxTime = duration - offset
  /** 范围 */
  const range = maxTime - minTime

  // 计算时间
  return Array.from({ length: coverNum }, (_, i) =>
    Math.floor(minTime + (range / coverNum) * i))
}

/**
 * 将数据转换为可显示数据
 */
function toDisplayableData(rawData: VideoCoverRaw): VideoCover {
  return {
    img: URL.createObjectURL(rawData.blob),
    ...rawData,
  }
}

/**
 * 生成单个视频封面原始数据
 */
async function generateVideoCoverRaw(clipper: M3U8ClipperNew, time: number): Promise<VideoCoverRaw> {
  /** 获取截图 */
  const result = await clipper.seek(time, true)
  if (!result) {
    throw new Error('no clipper result')
  }

  /** 缩放 */
  const resize = imageUtil.resize(
    result.videoFrame.displayWidth,
    result.videoFrame.displayHeight,
    MAX_WIDTH,
    MAX_HEIGHT,
  )

  /** 使用 OffscreenCanvas */
  const canvas = new OffscreenCanvas(resize.width, resize.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('no canvas context')
  }

  // 绘制
  ctx.drawImage(
    await createImageBitmap(result.videoFrame, {
      resizeQuality: 'pixelated',
      resizeWidth: resize.width,
      resizeHeight: resize.height,
    }),
    0,
    0,
    resize.width,
    resize.height,
  )

  /** 转换成 blob */
  const blob = await canvas.convertToBlob({
    type: 'image/webp',
    quality: 0.9,
  })

  // 关闭
  result.videoFrame.close()

  /** 缓存 blob 数据 */
  const raw: VideoCoverRaw = {
    blob,
    width: resize.width,
    height: resize.height,
    frameTime: result.frameTime,
    seekTime: time,
  }
  return raw
}

/**
 * 批量读取缓存中的原始视频封面
 */
async function readCachedCovers(sha1: string, times: number[]): Promise<Array<VideoCoverRaw | null>> {
  return Promise.all(
    times.map(async (time) => {
      const cache = await videoCoverCache.get(getCacheKey(sha1, time))
      return cache ? cache.value : null
    }),
  )
}

/**
 * 从缓存获取视频封面（仅当全部时间点都命中缓存时返回）
 */
async function getVideoCoversFromCache(sha1: string, times: number[]): Promise<VideoCover[]> {
  const cached = await readCachedCovers(sha1, times)
  if (cached.includes(null)) {
    return []
  }
  return cached.filter((item): item is VideoCoverRaw => item !== null).map(toDisplayableData)
}

/**
 * 获取视频封面（优先复用已命中的缓存帧，仅补截缺失时间点）
 */
export async function getVideoCover(sha1: string, pickCode: string, times: number[]): Promise<VideoCover[]> {
  const cached = await readCachedCovers(sha1, times)
  if (cached.every((item): item is VideoCoverRaw => item !== null)) {
    return cached.map(toDisplayableData)
  }

  /** 获取 m3u8 列表 */
  const m3u8List = await drive115.video.getM3u8(pickCode)

  /** 获取源 */
  const source = m3u8List.sort((a, b) => a.quality - b.quality)[0]
  if (!source) {
    throw new Error('source is null')
  }

  /** 创建 clipper */
  const clipper = new M3U8ClipperNew({
    url: source.url,
  })

  try {
    // 打开 clipper
    await clipper.open()

    /** 仅截取未命中缓存的时间点，已命中的直接复用 */
    const rawList = await Promise.all(
      times.map(async (time, index) => {
        const hit = cached[index]
        if (hit) {
          return hit
        }
        const raw = await generateVideoCoverRaw(clipper, time)
        videoCoverCache.set(getCacheKey(sha1, time), raw)
        return raw
      }),
    )

    return rawList.map(toDisplayableData)
  }
  finally {
    clipper.destroy()
  }
}

/**
 * 清理 blob URL
 */
function cleanupBlobUrl(covers: string[]): void {
  covers.forEach((cover) => {
    if (cover.startsWith('blob:')) {
      URL.revokeObjectURL(cover)
    }
  })
}

/**
 * 智能视频封面 Hook
 * @description 带滚动加载
 */
export function useSmartVideoCover(options: Ref<VideoCoverOptions>, config: SmartLoadConfig) {
  /** 数据 */
  const videoCover = reactive<{
    isReady: boolean
    isLoading: boolean
    error: unknown
    state: VideoCover[]
  }>({
    isReady: false,
    isLoading: false,
    error: undefined,
    state: [],
  })

  /** 任务ID */
  const taskId = computed(() => generateTaskId(options.value))

  /** 时间点 */
  const times = computed(() =>
    calculateVideoCoverTimes(options.value.duration, options.value.coverNum),
  )

  /** 可见性 */
  const visibility = useElementVisibility(config.elementRef, {
    threshold: config.threshold ?? 0,
    rootMargin: config.rootMargin ?? '0%',
    scrollTarget: config.scrollTarget,
  })

  /** 清理当前已生成的封面资源 */
  const revokeCurrentState = () => {
    cleanupBlobUrl(
      videoCover.state
        .map(item => item?.img)
        .filter((item): item is string => item !== undefined),
    )
  }

  /** 添加任务 */
  const addTask = (
    id: string,
    sha1: string,
    pickCode: string,
    targetTimes: number[],
  ) => {
    return videoCoverScheduler.add(
      () => {
        return getVideoCover(sha1, pickCode, targetTimes)
      },
      {
        id,
        immediate: true,
      },
    )
  }

  /** 取消任务 */
  const cancelTask = (id = taskId.value) => {
    const task = videoCoverScheduler.get(id)
    if (task && task.status === TaskStatus.Pending) {
      videoCoverScheduler.cancel(id)
    }
  }

  /**
   * 获取数据
   */
  const getData = async (id: string, currentOptions: VideoCoverOptions, targetTimes: number[]) => {
    if (videoCover.isReady || videoCover.error || taskId.value !== id) {
      return
    }

    const task = videoCoverScheduler.get(id)
    if (task) {
      return
    }
    videoCover.isLoading = true
    try {
      const data = await addTask(id, currentOptions.sha1, currentOptions.pickCode, targetTimes)
      if (taskId.value !== id) {
        cleanupBlobUrl(data.map(item => item.img))
        return
      }
      videoCover.state = data
      videoCover.isReady = true
    }
    catch (error) {
      if (taskId.value !== id || error instanceof SchedulerError.TaskCancelled) {
        return
      }
      if (
        error instanceof Core.Drive115Error
        && error.code === Core.Drive115ErrorCode.NotFoundM3u8File
      ) {
        videoCover.error
          = FRIENDLY_ERROR_MESSAGE.CANNOT_VIDEO_COVER_WITHOUT_TRANSCODING
        return
      }
      videoCover.error = error
    }
    finally {
      if (taskId.value === id) {
        videoCover.isLoading = false
      }
    }
  }

  /** 从缓存获取数据 */
  const getDataByCache = async (id: string, currentOptions: VideoCoverOptions, targetTimes: number[]) => {
    if (videoCover.isReady || videoCover.error || taskId.value !== id) {
      return
    }

    videoCover.isLoading = true
    try {
      const data = await getVideoCoversFromCache(currentOptions.sha1, targetTimes)
      if (taskId.value !== id) {
        cleanupBlobUrl(data.map(item => item.img))
        return
      }
      if (data.length > 0) {
        videoCover.state = data
        videoCover.isLoading = false
        videoCover.isReady = true
      }
    }
    catch (error) {
      if (taskId.value === id) {
        videoCover.error = error
      }
    }
    finally {
      if (taskId.value === id) {
        videoCover.isLoading = false
      }
    }
  }

  /** 加载当前可见项 */
  const loadVisible = async (scrolling: boolean) => {
    const id = taskId.value
    const currentOptions = options.value
    const targetTimes = times.value
    if (scrolling) {
      getDataByCache(id, currentOptions, targetTimes)
      return
    }
    await getDataByCache(id, currentOptions, targetTimes)
    getData(id, currentOptions, targetTimes)
  }

  /** 滚动 */
  const { isScrolling } = useScroll(config.scrollTarget, {
    throttle: 1000 / 60,
    idle: 100,
    onStop: async () => {
      if (visibility.value) {
        await loadVisible(false)
      }
    },
  })

  /** 监听可见性 */
  watch(visibility, async (value) => {
    if (value) {
      await loadVisible(isScrolling.value)
    }
    else {
      cancelTask()
    }
  })

  /** 监听参数变化（如切换截图张数），重置并按新参数重新加载 */
  watch(taskId, async (_newId, oldId) => {
    videoCoverScheduler.remove(oldId)
    revokeCurrentState()
    videoCover.state = []
    videoCover.isReady = false
    videoCover.error = undefined
    videoCover.isLoading = false
    if (visibility.value) {
      await loadVisible(isScrolling.value)
    }
  })

  /** 卸载 */
  onUnmounted(() => {
    videoCoverScheduler.remove(taskId.value)
    revokeCurrentState()
  })

  return {
    videoCover,
  }
}
