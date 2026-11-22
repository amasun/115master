<template>
  <article
    class="group bg-base-200/45 border-base-content/5 hover:border-primary/40 hover:bg-base-200/75 flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border transition-all duration-200"
    tabindex="0"
    @click="openDetail"
    @keydown.enter.prevent="openDetail"
  >
    <!-- 封面区域 -->
    <div
      class="bg-base-300/60 relative w-full shrink-0 overflow-hidden"
      :class="aspectMode === 'portrait' ? 'aspect-[2/3]' : 'aspect-[3/2]'"
    >
      <img
        v-if="thumbUrl"
        :src="thumbUrl"
        :alt="displayTitle"
        class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        draggable="false"
      >
      <div
        v-else
        class="text-base-content/35 flex size-full flex-col items-center justify-center gap-2 px-3 text-center"
      >
        <Icon
          :name="isScraping ? I.LOADING : I.LIBRARY"
          class="text-3xl"
          :class="isScraping && 'text-primary animate-spin'"
        />
        <span
          v-if="entry.externalId"
          class="bg-base-content/8 text-base-content/70 max-w-full truncate rounded-full px-2.5 py-0.5 font-mono text-[11px]"
        >
          {{ entry.externalId }}
        </span>
      </div>

      <!-- 左上角：星标、多版本与打点角标 -->
      <div class="pointer-events-none absolute top-2 left-2 flex flex-wrap gap-1">
        <span
          v-if="entry.starred"
          title="已星标收藏"
          class="badge badge-warning badge-xs rounded-full px-1.5 py-2 text-[11px] shadow-xs"
        >
          <Icon :name="I.STAR_FILL" class="text-[11px]" />
        </span>
        <span
          v-if="entry.files.length > 1"
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

    <!-- 底部文案区 -->
    <div class="flex min-h-0 flex-1 flex-col justify-between gap-1.5 p-2.5">
      <h3 class="text-base-content line-clamp-2 text-xs leading-snug font-medium">
        {{ displayTitle }}
      </h3>
      <div class="text-base-content/55 flex items-center justify-between gap-2 text-[11px]">
        <span v-if="entry.externalId" class="truncate font-mono">
          {{ entry.externalId }}
        </span>
        <span v-else class="truncate">未识别番号</span>
        <span class="shrink-0 tabular-nums">
          {{ entry.meta?.year || (entry.meta?.releaseDate?.slice(0, 4)) || '' }}
        </span>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { LibraryEntry, PosterThumbResource } from '@/utils/mediaIndex'
import { computed, onUnmounted, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { formatTime } from '@/components/XPlayer/utils/time'
import { I, Icon } from '@/icons'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { getCoverCandidates, loadPosterThumbUrl } from '@/utils/mediaIndex'

const props = defineProps<{
  entry: LibraryEntry
  aspectMode: 'landscape' | 'portrait'
}>()

const router = useRouter()
const store = useMediaLibraryStore()

const thumbUrl = shallowRef('')
let activeController: AbortController | null = null
let activeResource: PosterThumbResource | null = null

const primaryFile = computed(() => props.entry.files[0])
const isScraping = computed(() => store.scrapingKeys.has(props.entry.mediaKey))

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
  activeResource?.dispose()
  activeResource = null
  thumbUrl.value = ''
}

async function refreshThumb() {
  cleanupResource()
  const controller = new AbortController()
  activeController = controller

  const candidates = getCoverCandidates(props.entry.meta)
  try {
    const resource = await loadPosterThumbUrl(props.entry.mediaKey, candidates, controller.signal)
    if (controller.signal.aborted) {
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

watch(
  [() => props.entry.mediaKey, () => props.entry.meta?.coverUrl, () => props.entry.meta?.updatedAt],
  () => {
    void refreshThumb()
  },
  { immediate: true },
)

onUnmounted(() => {
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
  void router.push({
    name: 'video',
    params: { pickCode: primaryFile.value.pickCode },
  })
}
</script>
