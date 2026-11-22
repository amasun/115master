<template>
  <div class="bg-base-100 text-base-content min-h-screen pb-20">
    <!-- 未初始化加载态 -->
    <div
      v-if="(store.initializing || store.indexing) && !entry"
      class="flex min-h-screen flex-col items-center justify-center gap-3"
    >
      <Icon :name="I.LOADING" class="text-primary animate-spin text-3xl" />
      <p class="text-base-content/65 text-sm">
        正在加载影视库资料...
      </p>
    </div>

    <!-- 未找到作品 -->
    <div
      v-else-if="!entry"
      class="flex min-h-screen flex-col items-center justify-center gap-4 px-4"
    >
      <Empty description="未在本地索引中找到该作品" size="lg" />
      <Button variant="soft" class="rounded-full" @click="goBackToLibrary">
        返回影视库
      </Button>
    </div>

    <!-- 详情内容 -->
    <template v-else>
      <!-- 沉浸式模糊背景头部 -->
      <section class="border-base-content/8 relative overflow-hidden border-b">
        <div
          v-if="heroImageSrc"
          class="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center opacity-25 blur-3xl"
          :style="{ backgroundImage: `url(${heroImageSrc})` }"
        />
        <div class="from-base-100/70 via-base-100/85 to-base-100 pointer-events-none absolute inset-0 bg-gradient-to-b" />

        <div class="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-5 pb-8 sm:px-8">
          <!-- 顶部操作栏 -->
          <div class="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="glass-floating"
              size="sm"
              class="gap-1.5 rounded-full px-3.5"
              @click="goBackToLibrary"
            >
              <Icon :name="I.BACK_DIR" class="text-base" />
              <span>返回海报墙</span>
            </Button>

            <div class="flex flex-wrap items-center gap-2">
              <Button
                variant="glass-floating"
                size="sm"
                class="gap-1.5 rounded-full px-3.5 text-xs"
                :disabled="isScraping"
                @click="handleRescrape()"
              >
                <Icon :name="isScraping ? I.LOADING : I.RESTART" class="text-sm" :class="isScraping && 'animate-spin'" />
                <span>{{ isScraping ? '刮削中...' : '重新刮削' }}</span>
              </Button>
              <Button
                variant="glass-floating"
                size="sm"
                class="gap-1.5 rounded-full px-3.5 text-xs"
                @click="toggleManualAv"
              >
                <Icon :name="I.RENAME" class="text-sm" />
                <span>指定番号</span>
              </Button>
              <a
                v-if="entry.meta?.detailUrl"
                :href="entry.meta.detailUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="btn btn-ghost btn-sm rounded-full text-xs"
              >
                原站详情
              </a>
            </div>
          </div>

          <!-- 手动指定番号面板 -->
          <form
            v-if="showManualAv"
            class="ui-glass-surface flex flex-wrap items-center gap-2 rounded-2xl p-3"
            @submit.prevent="handleManualScrape"
          >
            <input
              v-model="manualAvInput"
              type="text"
              placeholder="输入正确的番号（例如 SSIS-001）"
              class="input input-sm input-bordered bg-base-100/80 min-w-48 flex-1 rounded-full font-mono text-xs"
            >
            <Button
              type="submit"
              color="primary"
              size="sm"
              class="rounded-full px-4 text-xs"
              :disabled="!manualAvInput.trim() || isScraping"
            >
              重新匹配
            </Button>
            <span v-if="scrapeHint" class="text-warning text-xs">{{ scrapeHint }}</span>
          </form>

          <!-- 主封面与核心元数据 -->
          <div class="flex flex-col gap-6 md:flex-row md:items-start">
            <!-- 主封面（WebP 缩略图瞬时占位 + 高清原图异步升级） -->
            <div class="bg-base-300/70 relative aspect-[3/2] w-full shrink-0 overflow-hidden rounded-2xl shadow-lg md:w-[420px]">
              <img
                v-if="thumbUrl"
                :src="thumbUrl"
                :alt="displayTitle"
                class="absolute inset-0 size-full object-cover"
              >
              <Image
                v-if="coverLoader"
                :src="entry.meta?.coverUrl || thumbUrl || ''"
                :alt="displayTitle"
                :loader="coverLoader"
                :fallback="coverFallback"
                class="relative z-1 size-full"
                fit="cover"
              />
              <div
                v-else-if="!thumbUrl"
                class="text-base-content/35 flex size-full flex-col items-center justify-center gap-2"
              >
                <Icon :name="I.LIBRARY" class="text-4xl" />
                <span v-if="entry.externalId" class="font-mono text-xs">{{ entry.externalId }}</span>
              </div>
            </div>

            <!-- 标题与简介元信息 -->
            <div class="flex min-w-0 flex-1 flex-col gap-4">
              <div class="flex flex-col gap-2">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    v-if="entry.externalId"
                    class="badge badge-primary badge-soft font-mono text-xs font-semibold"
                  >
                    {{ entry.externalId }}
                  </span>
                  <span v-if="entry.meta?.source" class="badge badge-neutral badge-soft text-xs">
                    {{ entry.meta.source }}
                  </span>
                  <span v-if="entry.files.length > 1" class="badge badge-accent badge-soft text-xs">
                    {{ entry.files.length }} 个版本
                  </span>
                  <span
                    v-if="entry.starred"
                    class="badge badge-warning badge-soft gap-1 text-xs"
                    title="已星标收藏"
                  >
                    <Icon :name="I.STAR_FILL" class="text-xs" />
                    <span>已收藏</span>
                  </span>
                  <span
                    v-for="label in entry.driveLabels"
                    :key="label.id"
                    class="badge bg-base-content/10 border-none text-xs"
                    :style="label.color ? { backgroundColor: label.color } : undefined"
                    :title="`网盘标签：${label.name}`"
                  >
                    {{ label.name }}
                  </span>
                </div>
                <h1 class="text-base-content text-xl leading-snug font-bold sm:text-2xl">
                  {{ displayTitle }}
                </h1>
              </div>

              <!-- 关键指标 -->
              <div class="text-base-content/75 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm">
                <span v-if="entry.meta?.releaseDate" class="flex items-center gap-1.5">
                  <Icon :name="I.CALENDAR" class="text-base-content/50 text-base" />
                  <span>{{ entry.meta.releaseDate }}</span>
                </span>
                <span v-if="durationDisplay" class="flex items-center gap-1.5">
                  <Icon :name="I.HISTORY" class="text-base-content/50 text-base" />
                  <span>{{ durationDisplay }}</span>
                </span>
                <span class="flex items-center gap-1.5">
                  <Icon :name="I.SORT_DATABASE" class="text-base-content/50 text-base" />
                  <span>{{ format.fileSize(entry.totalSize) }}</span>
                </span>
                <span v-if="entry.meta?.rating" class="flex items-center gap-1">
                  <Icon :name="I.STAR_RATING" class="text-warning text-base" />
                  <span class="font-medium">{{ entry.meta.rating }}</span>
                </span>
              </div>

              <!-- 导演 -->
              <div v-if="entry.meta?.directors.length" class="flex flex-wrap items-center gap-2 text-xs">
                <span class="text-base-content/50">导演</span>
                <button
                  v-for="director in entry.meta.directors"
                  :key="director"
                  type="button"
                  class="badge badge-ghost hover:badge-primary cursor-pointer rounded-full transition-colors"
                  @click="openDirectorInLibrary(director)"
                >
                  {{ director }}
                </button>
              </div>

              <!-- 题材标签胶囊 -->
              <div v-if="entry.meta?.genres.length" class="flex flex-wrap gap-1.5">
                <button
                  v-for="genre in entry.meta.genres"
                  :key="genre"
                  type="button"
                  class="badge badge-neutral badge-soft hover:badge-primary cursor-pointer rounded-full text-xs transition-colors"
                  @click="openGenreInLibrary(genre)"
                >
                  {{ genre }}
                </button>
              </div>

              <!-- 快捷播放主按钮 -->
              <div v-if="activeFile" class="flex flex-wrap items-center gap-2.5 pt-1">
                <Button
                  color="primary"
                  class="gap-2 rounded-full px-6"
                  @click="playAt(activeFile.pickCode)"
                >
                  <Icon :name="I.PLAY" class="text-lg" />
                  <span>MASTER 播放</span>
                </Button>
                <Button
                  variant="soft"
                  class="gap-1.5 rounded-full px-4"
                  @click="openFolder(activeFile.cid)"
                >
                  <Icon :name="I.FOLDER_OPEN" class="text-base" />
                  <span>在文件管理中打开目录</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="mx-auto flex max-w-6xl flex-col gap-8 px-4 pt-8 sm:px-8">
        <!-- 演员横排 -->
        <section v-if="entry.meta?.actors.length" class="flex flex-col gap-3">
          <h2 class="text-base-content text-base font-semibold">
            演员
          </h2>
          <div class="flex flex-wrap gap-3">
            <button
              v-for="actor in entry.meta.actors"
              :key="actor.name"
              type="button"
              class="bg-base-200/60 hover:bg-base-200 border-base-content/6 flex items-center gap-2.5 rounded-full border py-1.5 pr-4 pl-1.5 text-left transition-colors"
              @click="openActorInLibrary(actor.name)"
            >
              <img
                v-if="getActorAvatar(actor) && !failedActorAvatars.has(actor.name)"
                :src="getActorAvatar(actor)"
                :alt="actor.name"
                referrerpolicy="no-referrer"
                class="size-9 rounded-full object-cover"
                @error="markActorAvatarFailed(actor.name)"
              >
              <span
                v-else
                class="bg-base-content/10 text-base-content/65 flex size-9 items-center justify-center rounded-full text-xs font-semibold"
              >
                {{ actor.name.slice(0, 1) }}
              </span>
              <span class="text-sm font-medium">{{ actor.name }}</span>
            </button>
          </div>
        </section>

        <!-- 版本与网盘文件列表 -->
        <section class="flex flex-col gap-3">
          <h2 class="text-base-content text-base font-semibold">
            网盘文件版本 ({{ entry.files.length }})
          </h2>
          <div class="flex flex-col gap-2">
            <div
              v-for="(file, index) in entry.files"
              :key="file.fid"
              class="border-base-content/8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors"
              :class="index === activeFileIndex
                ? 'bg-primary/8 border-primary/35'
                : 'bg-base-200/40 hover:bg-base-200/70'"
              @click="activeFileIndex = index"
            >
              <div class="flex min-w-0 flex-1 cursor-pointer flex-col gap-1">
                <div class="flex items-center gap-2">
                  <span
                    v-if="entry.files.length > 1"
                    class="badge badge-xs rounded-full"
                    :class="index === activeFileIndex ? 'badge-primary' : 'badge-ghost'"
                  >
                    版本 {{ index + 1 }}
                  </span>
                  <span class="truncate text-sm font-medium">{{ file.name }}</span>
                </div>
                <div class="text-base-content/55 flex flex-wrap items-center gap-3 text-xs">
                  <span>{{ format.fileSize(file.size) }}</span>
                  <span v-if="file.duration > 0">{{ formatTime(file.duration) }}</span>
                  <span v-if="file.mtime > 0">{{ format.dateTime(file.mtime) }}</span>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <Button
                  color="primary"
                  variant="soft"
                  size="sm"
                  class="gap-1 rounded-full px-3 text-xs"
                  @click.stop="playAt(file.pickCode)"
                >
                  <Icon :name="I.PLAY" class="text-sm" />
                  <span>播放</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="rounded-full px-3 text-xs"
                  @click.stop="openFolder(file.cid)"
                >
                  目录
                </Button>
              </div>
            </div>
          </div>
        </section>

        <!-- 时间分段截图（优先命中本机 video_cover_cache_v1 历史缓存） -->
        <section v-if="activeFile" class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-base-content text-base font-semibold">
              时间分段截图
              <span class="text-base-content/50 ml-1 text-xs font-normal">点击截图从对应时间点起播</span>
            </h2>
            <Button
              v-if="timelineError"
              variant="ghost"
              size="xs"
              class="rounded-full"
              @click="loadTimelineCovers(activeFile)"
            >
              重试生成
            </Button>
          </div>

          <div
            v-if="timelineLoading"
            class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6"
          >
            <div
              v-for="n in previewSlotCount"
              :key="n"
              class="skeleton aspect-video w-full rounded-xl"
            />
          </div>

          <div
            v-else-if="timelineError"
            class="bg-base-200/45 border-base-content/8 rounded-2xl border p-4"
          >
            <StatusFeedback
              status="info"
              size="xs"
              :padded="false"
              :message="typeof timelineError === 'string' ? timelineError : errorFeedback(timelineError).message"
            />
          </div>

          <div
            v-else-if="timelineCovers.length > 0"
            class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6"
          >
            <button
              v-for="item in timelineCovers"
              :key="item.seekTime"
              type="button"
              class="group bg-base-300 relative aspect-video overflow-hidden rounded-xl text-left transition-transform hover:scale-[1.02]"
              @click="playAt(activeFile.pickCode, item.seekTime)"
            >
              <img
                :src="item.img"
                :alt="`时间点 ${formatTime(item.seekTime)}`"
                class="size-full object-cover"
              >
              <span class="absolute right-1.5 bottom-1.5 rounded-full bg-black/70 px-2 py-0.5 font-mono text-[11px] text-white">
                {{ formatTime(item.seekTime) }}
              </span>
              <span class="bg-primary/90 text-primary-content absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-[10px] opacity-0 transition-opacity group-hover:opacity-100">
                从此播放
              </span>
            </button>
          </div>

          <p v-else class="text-base-content/50 text-xs">
            当前文件暂未提供时长或 SHA1 信息，无法生成时间分段截图。
          </p>
        </section>

        <!-- 已保存打点列表 -->
        <section v-if="activeFile && activeMarkers.length > 0" class="flex flex-col gap-3">
          <h2 class="text-base-content text-base font-semibold">
            播放打点 ({{ activeMarkers.length }})
          </h2>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="marker in activeMarkers"
              :key="marker.id"
              type="button"
              class="bg-base-200/65 hover:bg-primary/15 hover:border-primary/40 border-base-content/8 flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs transition-colors"
              @click="playAt(activeFile.pickCode, marker.time)"
            >
              <Icon :name="I.MARKER" class="text-secondary text-sm" />
              <span class="font-mono font-medium">{{ formatTime(marker.time) }}</span>
              <span v-if="marker.label" class="text-base-content/75 max-w-48 truncate">
                {{ marker.label }}
              </span>
            </button>
          </div>
        </section>

        <!-- 官方预览剧照画廊 -->
        <section v-if="visiblePreviews.length > 0" class="flex flex-col gap-3">
          <h2 class="text-base-content text-base font-semibold">
            官方剧照 ({{ visiblePreviews.length }})
          </h2>
          <div
            ref="previewGalleryRef"
            class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          >
            <a
              v-for="preview in visiblePreviews"
              :key="preview.key"
              :href="preview.src"
              class="bg-base-300/60 aspect-video overflow-hidden rounded-xl transition-opacity hover:opacity-85"
            >
              <Image
                :src="preview.src"
                alt="官方剧照"
                :loader="preview.loader"
                :fallback="preview.fallback"
                class="size-full"
                fit="cover"
                lazy
              />
            </a>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { VideoCover } from '@/hooks/useVideoCover'
import type { Marker } from '@/utils/markers/types'
import type { LibraryFileItem, MediaActor, MediaPreview, PosterThumbResource } from '@/utils/mediaIndex'
import { Core } from '@115master/drive115'
import { Button, Empty, Image, StatusFeedback } from '@115master/ui'
import { format } from '@115master/utils'
import { useTitle } from '@vueuse/core'
import PhotoSwipe from 'photoswipe'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import { computed, h, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { formatTime } from '@/components/XPlayer/utils/time'
import { FRIENDLY_ERROR_MESSAGE } from '@/constants'
import { calculateVideoCoverTimes, getVideoCover } from '@/hooks/useVideoCover'
import { I, Icon } from '@/icons'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { markerStore } from '@/utils/cache/markerStore'
import { drive115 } from '@/utils/drive115Instance'
import { errorFeedback } from '@/utils/errorFeedback'
import { createGMImageFallbackLoader } from '@/utils/imageLoader'
import { getCoverCandidates, loadPosterThumbUrl } from '@/utils/mediaIndex'
import { useUserSetting } from '@/utils/userSettings'
import 'photoswipe/style.css'

const route = useRoute('library-detail')
const router = useRouter()
const store = useMediaLibraryStore()
const previewCountSetting = useUserSetting('filelistPreviewCount')

const mediaKey = computed(() => String(route.params.mediaKey ?? ''))
const entry = computed(() => store.getEntry(mediaKey.value))

const activeFileIndex = shallowRef(0)
const activeFile = computed(() => entry.value?.files[activeFileIndex.value] ?? entry.value?.files[0])

const thumbUrl = shallowRef('')
const showManualAv = shallowRef(false)
const manualAvInput = shallowRef('')
const scrapeHint = shallowRef('')

const timelineCovers = shallowRef<VideoCover[]>([])
const timelineLoading = shallowRef(false)
const timelineError = shallowRef<unknown>(null)

const activeMarkers = shallowRef<Marker[]>([])
const failedActorAvatars = ref(new Set<string>())
const failedPreviews = ref(new Set<string>())

const previewGalleryRef = ref<HTMLElement | null>(null)
let lightbox: PhotoSwipeLightbox | null = null
let thumbController: AbortController | null = null
let thumbResource: PosterThumbResource | null = null
let timelineRequestId = 0

const previewSlotCount = computed(() => {
  const count = Number(previewCountSetting.value)
  return Number.isInteger(count) && count > 0 ? count : 6
})

const displayTitle = computed(() =>
  entry.value?.meta?.title
  || entry.value?.externalId
  || activeFile.value?.name
  || '影片详情',
)

const isScraping = computed(() => store.scrapingKeys.has(mediaKey.value))

const durationDisplay = computed(() => {
  if (entry.value?.maxDuration && entry.value.maxDuration > 0)
    return formatTime(entry.value.maxDuration)
  if (entry.value?.meta?.duration)
    return format.duration(entry.value.meta.duration)
  return ''
})

useTitle(computed(() => `${displayTitle.value} · 影视库`))

const coverCandidates = computed(() => getCoverCandidates(entry.value?.meta))

const coverLoader = computed(() => {
  if (coverCandidates.value.length === 0)
    return undefined
  return createGMImageFallbackLoader(coverCandidates.value, {
    transform: { maxWidth: 1440, maxHeight: 1440 },
  })
})

const heroImageSrc = computed(() => thumbUrl.value || entry.value?.meta?.coverUrl || '')

function coverFallback() {
  if (thumbUrl.value) {
    return h('img', {
      src: thumbUrl.value,
      alt: displayTitle.value,
      class: 'size-full object-cover',
    })
  }
  return h('div', { class: 'size-full bg-base-300/40' })
}

function getActorAvatar(actor: MediaActor): string {
  return store.actorAvatars[actor.name] || actor.avatarUrl || ''
}

function markActorAvatarFailed(name: string) {
  failedActorAvatars.value = new Set([...failedActorAvatars.value, name])
}

function getPreviewUrls(item: MediaPreview): string[] {
  return Array.from(new Set([item.raw, item.thumbnail].filter((url): url is string => Boolean(url))))
}

const visiblePreviews = computed(() => {
  const meta = entry.value?.meta
  const list = meta?.previews ?? []
  return list
    .map((item, index) => {
      const key = item.thumbnail || item.raw || String(index)
      const urls = getPreviewUrls(item)
      const candidates = urls.map(url => ({ url, referer: meta?.detailUrl }))
      return {
        key,
        src: urls[0] ?? '',
        urls,
        loader: candidates.length > 0
          ? createGMImageFallbackLoader(candidates, {
              transform: { maxWidth: 1280, maxHeight: 1280 },
            })
          : undefined,
        fallback: () => {
          let fallbackIndex = 0
          return h('img', {
            alt: '官方剧照',
            class: 'block size-full object-cover',
            referrerpolicy: 'no-referrer',
            src: urls[0] ?? '',
            onError: (event: Event) => {
              const img = event.currentTarget as HTMLImageElement
              fallbackIndex += 1
              if (urls[fallbackIndex]) {
                img.src = urls[fallbackIndex]
                return
              }
              failedPreviews.value = new Set([...failedPreviews.value, key])
            },
          })
        },
      }
    })
    .filter(item => item.src && !failedPreviews.value.has(item.key))
})

function cleanupThumb() {
  thumbController?.abort()
  thumbController = null
  thumbResource?.dispose()
  thumbResource = null
  thumbUrl.value = ''
}

async function refreshThumb() {
  cleanupThumb()
  if (!entry.value)
    return

  const controller = new AbortController()
  thumbController = controller
  try {
    const resource = await loadPosterThumbUrl(
      entry.value.mediaKey,
      coverCandidates.value,
      controller.signal,
    )
    if (controller.signal.aborted) {
      resource?.dispose()
      return
    }
    if (resource) {
      thumbResource = resource
      thumbUrl.value = resource.url
    }
  }
  catch {
    // 取消或缩略图加载失败时交由高清封面或占位视图处理
  }
}

function revokeTimelineCovers(covers: VideoCover[]) {
  covers.forEach((item) => {
    if (item.img.startsWith('blob:'))
      URL.revokeObjectURL(item.img)
  })
}

async function loadTimelineCovers(file?: LibraryFileItem) {
  timelineRequestId += 1
  const currentId = timelineRequestId

  revokeTimelineCovers(timelineCovers.value)
  timelineCovers.value = []
  timelineError.value = null

  if (!file) {
    timelineLoading.value = false
    return
  }

  timelineLoading.value = true
  try {
    let sha1 = file.sha1 || ''
    let duration = file.duration

    // 兼容旧版 superSearch 快照：若缺失 sha1 或时长，按需查询视频信息兜底补全
    if (!sha1 || duration <= 0) {
      const info = await drive115.video.getFilesVideo({
        pickcode: file.pickCode,
        share_id: '0',
        local: '1',
      })
      if (currentId !== timelineRequestId)
        return
      sha1 = sha1 || info.sha1 || ''
      duration = duration > 0 ? duration : Number(info.play_long) || 0
    }

    if (!sha1 || duration <= 0)
      return

    const times = calculateVideoCoverTimes(duration, previewSlotCount.value)
    const covers = await getVideoCover(sha1, file.pickCode, times)
    if (currentId !== timelineRequestId) {
      revokeTimelineCovers(covers)
      return
    }
    timelineCovers.value = covers
  }
  catch (error) {
    if (currentId !== timelineRequestId)
      return
    if (
      error instanceof Core.Drive115Error
      && error.code === Core.Drive115ErrorCode.NotFoundM3u8File
    ) {
      timelineError.value = FRIENDLY_ERROR_MESSAGE.CANNOT_VIDEO_COVER_WITHOUT_TRANSCODING
      return
    }
    timelineError.value = error
  }
  finally {
    if (currentId === timelineRequestId)
      timelineLoading.value = false
  }
}

async function loadMarkers(file?: LibraryFileItem) {
  if (!file) {
    activeMarkers.value = []
    return
  }
  const doc = await markerStore.getDoc(file.pickCode)
  activeMarkers.value = (doc?.markers ?? [])
    .filter(marker => !marker.deleted)
    .sort((a, b) => a.time - b.time)
}

watch(
  mediaKey,
  () => {
    activeFileIndex.value = 0
    showManualAv.value = false
    scrapeHint.value = ''
    failedActorAvatars.value = new Set()
    failedPreviews.value = new Set()
  },
)

watch(
  [() => entry.value?.mediaKey, () => entry.value?.meta?.coverUrl, () => entry.value?.meta?.updatedAt],
  () => {
    void refreshThumb()
  },
  { immediate: true },
)

watch(
  () => activeFile.value,
  (file) => {
    void loadTimelineCovers(file)
    void loadMarkers(file)
  },
  { immediate: true },
)

watch(
  [previewGalleryRef, () => visiblePreviews.value.length],
  async ([container, count]) => {
    lightbox?.destroy()
    lightbox = null
    if (!container || count === 0)
      return

    await nextTick()
    lightbox = new PhotoSwipeLightbox({
      gallery: container,
      children: 'a',
      pswpModule: PhotoSwipe,
      mouseMovePan: true,
      initialZoomLevel: 'fit',
      wheelToZoom: true,
    })
    lightbox.addFilter('domItemData', (itemData, element) => {
      const img = element.querySelector('img')
      if (img?.currentSrc || img?.src)
        itemData.src = img.currentSrc || img.src
      itemData.width = img?.naturalWidth
      itemData.height = img?.naturalHeight
      return itemData
    })
    lightbox.init()
  },
)

onMounted(async () => {
  await store.init()
  if (entry.value && entry.value.meta === null && entry.value.kind === 'jav')
    store.enqueueScrape(entry.value.mediaKey)
})

onUnmounted(() => {
  timelineRequestId += 1
  cleanupThumb()
  revokeTimelineCovers(timelineCovers.value)
  lightbox?.destroy()
  lightbox = null
})

function toggleManualAv() {
  showManualAv.value = !showManualAv.value
  scrapeHint.value = ''
  if (showManualAv.value)
    manualAvInput.value = entry.value?.externalId ?? ''
}

async function handleRescrape() {
  scrapeHint.value = ''
  const result = await store.rescrape(mediaKey.value)
  if (!result)
    scrapeHint.value = '未获取到新的刮削结果'
}

async function handleManualScrape() {
  const target = manualAvInput.value.trim()
  if (!target)
    return
  scrapeHint.value = ''
  const result = await store.rescrape(mediaKey.value, target)
  if (!result) {
    scrapeHint.value = `未找到番号「${target}」的资料`
    return
  }
  showManualAv.value = false
}

function goBackToLibrary() {
  void router.push({ name: 'library' })
}

function openActorInLibrary(name: string) {
  store.resetFilters()
  store.selectActor(name)
  store.scrollTop = 0
  void router.push({ name: 'library' })
}

function openGenreInLibrary(name: string) {
  store.resetFilters()
  store.selectGenre(name)
  store.scrollTop = 0
  void router.push({ name: 'library' })
}

function openDirectorInLibrary(name: string) {
  store.resetFilters()
  store.filter.director = name
  store.scrollTop = 0
  void router.push({ name: 'library' })
}

function playAt(pickCode: string, seconds = 0) {
  const t = Math.max(0, Math.floor(seconds))
  void router.push({
    name: 'video',
    params: { pickCode },
    query: t > 0 ? { t: String(t) } : undefined,
  })
}

function openFolder(cid: string) {
  void router.push({
    name: 'drive',
    params: { cid: cid === '0' ? '' : cid },
  })
}
</script>
