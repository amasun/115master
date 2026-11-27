<template>
  <article
    ref="cardRef"
    class="group bg-base-200/45 border-base-content/5 hover:border-primary/40 hover:bg-base-200/75 flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border transition-all duration-200"
    tabindex="0"
    @click="openDetail"
    @contextmenu.prevent="openContextMenu"
    @keydown.enter.prevent="openDetail"
  >
    <!-- 封面区域 -->
    <div
      class="bg-base-300/60 relative w-full shrink-0 overflow-hidden"
      :class="aspectMode === 'portrait' ? 'aspect-[2/3]' : 'aspect-[3/2]'"
    >
      <img
        v-if="thumbUrl"
        ref="imgRef"
        :src="thumbUrl"
        :alt="displayTitle"
        loading="lazy"
        decoding="async"
        class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        :class="aspectMode === 'portrait' && isRightHalfPortrait ? 'object-right' : 'object-center'"
        draggable="false"
        @load="handleThumbLoad"
      >
      <div
        v-else
        class="text-base-content/35 flex size-full flex-col items-center justify-center gap-2 px-3 text-center"
      >
        <Icon
          :name="isScraping ? I.LOADING : (isCollection ? I.FOLDER_OPEN : I.LIBRARY)"
          class="text-3xl"
          :class="isScraping && 'text-primary animate-spin'"
        />
        <span
          v-if="isCollection"
          class="bg-primary/15 text-primary max-w-full truncate rounded-full px-2.5 py-0.5 text-[11px] font-medium"
        >
          合集 · {{ entry.files.length }} 个视频
        </span>
        <span
          v-else-if="entry.externalId"
          class="bg-base-content/8 text-base-content/70 max-w-full truncate rounded-full px-2.5 py-0.5 font-mono text-[11px]"
        >
          {{ entry.externalId }}
        </span>
      </div>

      <!-- 左上角：星标、多版本/合集与打点角标 -->
      <div class="pointer-events-none absolute top-2 left-2 flex flex-wrap gap-1">
        <span
          v-if="entry.starred"
          title="已星标收藏"
          class="badge badge-warning badge-xs rounded-full px-1.5 py-2 text-[11px] shadow-xs"
        >
          <Icon :name="I.STAR_FILL" class="text-[11px]" />
        </span>
        <span
          v-if="isCollection"
          class="ui-glass-overlay text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
        >
          合集 · {{ entry.files.length }}
        </span>
        <span
          v-else-if="entry.files.length > 1"
          class="ui-glass-overlay text-base-content inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
        >
          {{ entry.files.length }} 版本
        </span>
        <span
          v-if="entry.markerCount > 0"
          class="badge badge-secondary badge-xs gap-0.5 rounded-full px-1.5 py-2 text-[11px] shadow-xs"
        >
          <Icon :name="I.MARKER" class="text-[11px]" />
          <span>{{ entry.markerCount }}</span>
        </span>
      </div>

      <!-- 右下角：时长角标 -->
      <span
        v-if="durationLabel"
        class="pointer-events-none absolute right-2 bottom-2 rounded-full bg-black/65 px-2 py-0.5 font-mono text-[11px] text-white backdrop-blur-xs"
      >
        {{ durationLabel }}
      </span>

      <!-- 悬停浮现「直接播放」按钮 -->
      <button
        v-if="primaryFile"
        type="button"
        title="直接播放"
        aria-label="直接播放"
        class="btn btn-primary btn-circle btn-sm absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 shadow-lg transition-all duration-150 group-focus-within:opacity-100 group-hover:scale-105 group-hover:opacity-100"
        @click.stop="playPrimary"
      >
        <Icon :name="I.PLAY" class="ml-0.5 text-base" />
      </button>
    </div>

    <!-- 底部文案区：固定标题高度 + 题材标签行 + 番号年份 -->
    <div class="flex min-h-0 flex-1 flex-col justify-between gap-1.5 p-2.5">
      <h3
        :title="displayTitle"
        class="text-base-content line-clamp-2 min-h-[2.1rem] shrink-0 text-xs leading-[1.4] font-medium"
      >
        {{ displayTitle }}
      </h3>

      <!-- AV 演员与发行商 -->
      <div
        v-if="isAvEntry"
        class="text-base-content/65 flex h-4 shrink-0 items-center justify-between gap-2 text-[11px] leading-4"
      >
        <div
          v-if="visibleActors.length > 0"
          class="flex min-w-0 items-center gap-1 overflow-hidden"
          :title="allActorsTitle"
        >
          <template v-for="(actor, idx) in visibleActors" :key="actor.name">
            <span v-if="idx > 0" class="text-base-content/35 shrink-0">·</span>
            <button
              type="button"
              class="hover:text-primary truncate transition-colors"
              :class="store.filter.actor === actor.name ? 'text-primary font-medium' : ''"
              :title="`按演员「${actor.name}」筛选`"
              @click.stop="store.selectActor(actor.name)"
            >
              {{ actor.name }}
            </button>
          </template>
        </div>
        <span v-else class="text-base-content/35 truncate">未知演员</span>
        <span
          v-if="publisherLabel"
          class="text-base-content/45 max-w-[45%] shrink-0 truncate"
          :title="`发行商：${publisherLabel}`"
        >
          {{ publisherLabel }}
        </span>
      </div>

      <!-- 题材标签（最多展示 3 枚，支持点击快捷筛选） -->
      <div class="flex h-5 shrink-0 items-center gap-1 overflow-hidden">
        <button
          v-for="genre in visibleGenres"
          :key="genre"
          type="button"
          class="max-w-20 shrink-0 truncate rounded-full px-1.5 py-0.5 text-[10px] leading-tight transition-colors"
          :class="store.filter.genre === genre
            ? 'bg-primary/25 text-primary font-medium'
            : 'bg-base-content/8 text-base-content/75 hover:bg-primary/20 hover:text-primary'"
          :title="`按题材「${genre}」筛选`"
          @click.stop="store.selectGenre(genre)"
        >
          {{ genre }}
        </button>
      </div>

      <div class="text-base-content/55 flex h-4 shrink-0 items-center justify-between gap-2 text-[11px] leading-4">
        <span v-if="isCollection" class="text-primary/80 truncate font-medium">
          合集 · {{ entry.files.length }} 个视频
        </span>
        <span v-else-if="entry.externalId" class="truncate font-mono">
          {{ entry.externalId }}
        </span>
        <span v-else class="truncate">未识别番号</span>
        <span class="shrink-0 tabular-nums">
          {{ releaseDateLabel }}
        </span>
      </div>
    </div>

    <ActionMenu
      v-if="primaryFile"
      aria-label="作品操作"
      :groups="menuGroups"
      :open="menuOpen"
      :position="menuPosition"
      @update:open="menuOpen = $event"
    />
  </article>
</template>

<script setup lang="ts">
import type { LibraryEntry, PosterThumbResource } from '@/utils/mediaIndex'
import { ActionMenu } from '@115master/ui'
import { useIntersectionObserver } from '@vueuse/core'
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { formatTime } from '@/components/XPlayer/utils/time'
import { I, Icon } from '@/icons'
import { useLibraryFileActions } from '@/pages/library/useLibraryFileActions'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { getCoverCandidates, loadPosterThumbUrl, shouldCropRightHalfForPortrait } from '@/utils/mediaIndex'

const props = defineProps<{
  entry: LibraryEntry
  aspectMode: 'landscape' | 'portrait'
}>()

const router = useRouter()
const store = useMediaLibraryStore()
const fileActions = useLibraryFileActions()

const cardRef = ref<HTMLElement>()
const imgRef = ref<HTMLImageElement>()
const hasEnteredViewport = shallowRef(typeof IntersectionObserver === 'undefined')
const thumbUrl = shallowRef('')
const isRightHalfPortrait = shallowRef(false)
const menuOpen = shallowRef(false)
const menuPosition = shallowRef({ x: 0, y: 0 })
let activeController: AbortController | null = null
let activeResource: PosterThumbResource | null = null

const primaryFile = computed(() => props.entry.files[0])
const menuGroups = fileActions.buildFileMenuGroups(
  () => primaryFile.value,
  {
    onPlay: () => playPrimary(),
    onOpenDetail: () => openDetail(),
    onChangeCover: () => store.openCoverPicker(props.entry.mediaKey),
  },
)

function openContextMenu(event: MouseEvent) {
  if (!primaryFile.value)
    return
  menuPosition.value = { x: event.clientX, y: event.clientY }
  menuOpen.value = true
}
const isCollection = computed(() => props.entry.kind === 'collection')
const isAvEntry = computed(() => props.entry.kind === 'jav')
const isScraping = computed(() => store.scrapingKeys.has(props.entry.mediaKey))
const visibleGenres = computed(() => props.entry.meta?.genres.slice(0, 3) ?? [])
const visibleActors = computed(() => {
  const actors = props.entry.meta?.actors ?? []
  if (actors.length === 0)
    return []
  const preferred = actors.filter(actor => actor.sex !== 0)
  return (preferred.length > 0 ? preferred : actors).slice(0, 2)
})
const allActorsTitle = computed(() => (props.entry.meta?.actors ?? []).map(actor => actor.name).join('、'))
const publisherLabel = computed(() => props.entry.meta?.publisher || props.entry.meta?.studio || '')
const releaseDateLabel = computed(() => {
  if (isAvEntry.value)
    return props.entry.meta?.releaseDate || (props.entry.meta?.year ? String(props.entry.meta.year) : '')
  return props.entry.meta?.year || props.entry.meta?.releaseDate?.slice(0, 4) || ''
})

const displayTitle = computed(() =>
  props.entry.meta?.title
  || props.entry.externalId
  || primaryFile.value?.name
  || '未命名视频',
)

const durationLabel = computed(() => {
  if (props.entry.maxDuration > 0)
    return formatTime(props.entry.maxDuration)
  if (props.entry.meta?.duration)
    return `${props.entry.meta.duration} 分钟`
  return ''
})

function cleanupResource() {
  activeController?.abort()
  activeController = null
  if (imgRef.value)
    imgRef.value.removeAttribute('src')
  activeResource?.dispose()
  activeResource = null
  thumbUrl.value = ''
  isRightHalfPortrait.value = false
}

function handleThumbLoad(event: Event) {
  const image = event.currentTarget as HTMLImageElement | null
  if (!image)
    return
  isRightHalfPortrait.value = shouldCropRightHalfForPortrait(
    image.naturalWidth,
    image.naturalHeight,
    props.entry.externalId,
    props.entry.kind,
  )
}

async function refreshThumb() {
  cleanupResource()
  if (!hasEnteredViewport.value)
    return

  const controller = new AbortController()
  activeController = controller

  const candidates = getCoverCandidates(props.entry.meta)
  try {
    const resource = await loadPosterThumbUrl(props.entry.mediaKey, candidates, controller.signal)
    if (controller.signal.aborted || activeController !== controller) {
      resource?.dispose()
      return
    }
    if (resource) {
      activeResource = resource
      thumbUrl.value = resource.url
    }
  }
  catch {
    // 取消或图片失败时回退占位视图
  }
}

const { stop: stopObserving } = useIntersectionObserver(
  cardRef,
  (entries) => {
    if (!entries.some(item => item.isIntersecting))
      return
    hasEnteredViewport.value = true
    stopObserving()
  },
  { rootMargin: '240px 0px' },
)

watch(
  [
    hasEnteredViewport,
    () => props.entry.mediaKey,
    () => props.entry.meta?.coverUrl,
    () => props.entry.meta?.updatedAt,
    () => store.customCoverVersions[props.entry.mediaKey],
  ],
  ([visible]) => {
    if (!visible)
      return
    void refreshThumb()
  },
  { immediate: true },
)

watch(
  [hasEnteredViewport, () => props.entry.mediaKey, () => props.entry.meta],
  ([visible, mediaKey, meta]) => {
    if (visible && meta === null && (props.entry.kind === 'jav' || props.entry.kind === 'movie' || props.entry.kind === 'tv'))
      store.enqueueScrape(mediaKey)
  },
  { immediate: true },
)

onUnmounted(() => {
  stopObserving()
  store.cancelScrape(props.entry.mediaKey)
  cleanupResource()
})

function openDetail() {
  void router.push({
    name: 'library-detail',
    params: { mediaKey: props.entry.mediaKey },
  })
}

function playPrimary() {
  if (!primaryFile.value)
    return
  store.openPlayerOverlay(primaryFile.value.pickCode)
}
</script>
