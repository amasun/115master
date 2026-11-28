<template>
  <article
    ref="cardRef"
    class="group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl bg-[#18181B] p-2 ring-1 ring-white/[0.04] transition-colors duration-200 hover:bg-[#27272A]"
    tabindex="0"
    @click="openDetail"
    @contextmenu.prevent="openContextMenu"
    @keydown.enter.prevent="openDetail"
  >
    <!-- 封面区域 -->
    <div
      class="relative w-full shrink-0 overflow-hidden rounded-lg bg-[#121215] shadow-md shadow-black/40"
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
        class="flex size-full flex-col items-center justify-center gap-2 px-3 text-center text-[#71717A]"
      >
        <Icon
          :name="isScraping ? I.LOADING : (isCollection ? I.FOLDER_OPEN : I.LIBRARY)"
          class="text-3xl"
          :class="isScraping && 'animate-spin text-[#B6F508]'"
        />
        <span
          v-if="isCollection"
          class="max-w-full truncate rounded-md border border-[#38BDF8]/25 bg-[#38BDF8]/15 px-2.5 py-0.5 text-[11px] font-medium text-[#38BDF8]"
        >
          合集 · {{ entry.files.length }} 个视频
        </span>
        <span
          v-else-if="entry.externalId"
          class="max-w-full truncate rounded-md bg-white/[0.06] px-2.5 py-0.5 font-mono text-[11px] text-[#A1A1AA]"
        >
          {{ entry.externalId }}
        </span>
      </div>

      <!-- 左上角：多版本/合集与打点角标 -->
      <div class="pointer-events-none absolute top-2 left-2 flex flex-wrap gap-1">
        <span
          v-if="isCollection"
          class="inline-flex items-center gap-1 rounded-md border border-[#38BDF8]/25 bg-[#09090B]/80 px-2 py-0.5 text-[11px] font-medium text-[#38BDF8] backdrop-blur-xs"
        >
          合集 · {{ entry.files.length }}
        </span>
        <span
          v-else-if="entry.files.length > 1"
          class="inline-flex items-center rounded-md border border-[#38BDF8]/25 bg-[#09090B]/80 px-2 py-0.5 text-[11px] font-medium text-[#38BDF8] backdrop-blur-xs"
        >
          {{ entry.files.length }} 版本
        </span>
        <span
          v-if="entry.markerCount > 0"
          class="inline-flex items-center gap-0.5 rounded-md border border-[#8B5CF6]/30 bg-[#8B5CF6]/20 px-1.5 py-0.5 text-[11px] font-medium text-[#C4B5FD] tabular-nums backdrop-blur-xs"
        >
          <Icon :name="I.MARKER" class="text-[11px]" />
          <span>{{ entry.markerCount }}</span>
        </span>
      </div>

      <!-- 右上角：无码 / 去码角标与收藏星标 -->
      <div
        v-if="uncensoredBadge || entry.starred"
        class="pointer-events-none absolute top-2 right-2 flex items-center gap-1.5"
      >
        <button
          v-if="uncensoredBadge"
          type="button"
          :title="`${uncensoredBadge.title}（点击筛选）`"
          class="pointer-events-auto inline-flex cursor-pointer items-center rounded-md px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider shadow-sm transition-transform hover:scale-105"
          :class="uncensoredBadge.badgeClass"
          @click.stop="store.selectUncensoredKind(props.entry.uncensoredKind)"
        >
          {{ uncensoredBadge.shortLabel }}
        </button>
        <span
          v-if="entry.starred"
          title="已星标收藏"
          class="fav-icon-outline inline-flex items-center justify-center text-[#F43F5E] drop-shadow-sm"
        >
          <Icon :name="I.STAR_FILL" size="custom" class="size-5" />
        </span>
      </div>

      <!-- 左下角：评分与评价人数角标 -->
      <span
        v-if="ratingBadge"
        :title="ratingBadge.title"
        class="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-0.5 font-mono text-[11px] text-[#ECA617] tabular-nums backdrop-blur-xs"
      >
        <span>★ {{ ratingBadge.scoreText }}</span>
        <span v-if="ratingBadge.countText" class="text-[10px] text-[#F4F4F5]/70">({{ ratingBadge.countText }})</span>
      </span>

      <!-- 右下角：时长角标（悬停时让位给播放按钮） -->
      <span
        v-if="durationLabel"
        class="pointer-events-none absolute right-2 bottom-2 rounded-md bg-black/75 px-2 py-0.5 font-mono text-[11px] text-[#F4F4F5] tabular-nums backdrop-blur-xs transition-opacity duration-150 group-hover:opacity-0"
      >
        {{ durationLabel }}
      </span>

      <!-- Spotify 标志性：悬停从右下角平滑浮现「#B6F508 实心圆播放按钮」 -->
      <button
        v-if="primaryFile"
        type="button"
        title="直接播放"
        aria-label="直接播放"
        class="absolute right-2.5 bottom-2.5 flex size-10 translate-y-2 cursor-pointer items-center justify-center rounded-full bg-[#B6F508] text-[#09090B] opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.55)] transition-all duration-200 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 hover:scale-105 hover:bg-[#c6ff29]"
        @click.stop="playPrimary"
      >
        <Icon :name="I.PLAY" class="ml-0.5 text-lg" />
      </button>
    </div>

    <!-- 底部文案区 -->
    <div class="flex min-h-0 flex-1 flex-col justify-between gap-1.5 px-1 pt-2.5 pb-1">
      <div class="flex shrink-0 flex-col gap-0.5">
        <h3
          :title="displayTitle"
          class="line-clamp-2 min-h-[2.1rem] text-xs leading-[1.4] font-semibold text-[#F4F4F5]"
        >
          {{ displayTitle }}
        </h3>
        <p
          v-if="mediaNote"
          :title="`备注：${mediaNote}`"
          class="truncate text-[11px] leading-tight text-[#B6F508]/90"
        >
          {{ mediaNote }}
        </p>
      </div>

      <!-- AV 演员与发行商 -->
      <div
        v-if="isAvEntry"
        class="flex h-4 shrink-0 items-center justify-between gap-2 text-[11px] leading-4 text-[#A1A1AA]"
      >
        <div
          v-if="visibleActors.length > 0"
          class="flex min-w-0 items-center gap-1 overflow-hidden"
          :title="allActorsTitle"
        >
          <template v-for="(actor, idx) in visibleActors" :key="actor.name">
            <span v-if="idx > 0" class="shrink-0 text-[#71717A]">·</span>
            <button
              type="button"
              class="truncate transition-colors hover:text-[#F4F4F5]"
              :class="store.filter.actor === actor.name ? 'font-medium text-[#B6F508]' : ''"
              :title="`按演员「${actor.name}」筛选`"
              @click.stop="store.selectActor(actor.name)"
            >
              {{ actor.name }}
            </button>
          </template>
        </div>
        <span v-else class="truncate text-[#71717A]">未知演员</span>
        <button
          v-if="publisherLabel"
          type="button"
          class="max-w-[45%] shrink-0 truncate transition-colors hover:text-[#F4F4F5]"
          :class="store.filter.publisher === publisherLabel ? 'font-medium text-[#B6F508]' : 'text-[#71717A]'"
          :title="`按片商「${publisherLabel}」筛选`"
          @click.stop="store.selectPublisher(publisherLabel)"
        >
          {{ publisherLabel }}
        </button>
      </div>

      <!-- 题材标签（最多展示 3 枚，支持点击快捷筛选） -->
      <div class="flex h-5 shrink-0 items-center gap-1 overflow-hidden">
        <button
          v-for="genre in visibleGenres"
          :key="genre"
          type="button"
          class="max-w-20 shrink-0 truncate rounded-full px-2 py-0.5 text-[10px] leading-tight transition-colors"
          :class="store.filter.genre === genre
            ? 'bg-[#B6F508]/15 font-medium text-[#B6F508]'
            : 'bg-white/[0.06] text-[#A1A1AA] hover:bg-white/[0.12] hover:text-[#F4F4F5]'"
          :title="`按题材「${genre}」筛选`"
          @click.stop="store.selectGenre(genre)"
        >
          {{ genre }}
        </button>
      </div>

      <div class="flex h-4 shrink-0 items-center justify-between gap-2 text-[11px] leading-4 text-[#71717A]">
        <span v-if="isCollection" class="truncate font-medium text-[#38BDF8]">
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
import type { ActionMenuGroup } from '@115master/ui'
import type { LibraryEntry, PosterThumbResource } from '@/utils/mediaIndex'
import { ActionMenu } from '@115master/ui'
import { useIntersectionObserver } from '@vueuse/core'
import { computed, h, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppDialog } from '@/app/dialog'
import { useToast } from '@/components'
import { formatTime } from '@/components/XPlayer/utils/time'
import { I, Icon } from '@/icons'
import { useLibraryFileActions } from '@/pages/library/useLibraryFileActions'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { actionIcon } from '@/utils/action'
import { getCoverCandidates, getUncensoredBadgeMeta, loadPosterThumbUrl, shouldCropRightHalfForPortrait } from '@/utils/mediaIndex'

const props = defineProps<{
  entry: LibraryEntry
  aspectMode: 'landscape' | 'portrait'
}>()

const router = useRouter()
const store = useMediaLibraryStore()
const dialog = useAppDialog()
const toast = useToast()
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
const mediaNote = computed(() => store.getMediaNote(props.entry.mediaKey))
const displayTitle = computed(() =>
  props.entry.meta?.title
  || props.entry.externalId
  || primaryFile.value?.name
  || '未命名视频',
)

async function editMediaNote() {
  const draft = ref(mediaNote.value)
  const syncToDrive = ref(true)
  const confirmed = await dialog.confirm({
    title: '编辑片名备注',
    confirmText: '保存',
    cancelText: '取消',
    content: () => h('div', { class: 'flex flex-col gap-2.5 py-1 text-sm' }, [
      h('p', { class: 'text-base-content/75 line-clamp-2 text-xs' }, displayTitle.value),
      h('input', {
        type: 'text',
        class: 'input input-sm input-bordered w-full rounded-xl',
        placeholder: '输入片名备注，留空即清除',
        value: draft.value,
        autofocus: true,
        onInput: (event: Event) => {
          draft.value = (event.target as HTMLInputElement).value
        },
      }),
      h('label', { class: 'flex cursor-pointer items-center gap-2 text-xs text-base-content/75' }, [
        h('input', {
          type: 'checkbox',
          class: 'checkbox checkbox-xs checkbox-primary',
          checked: syncToDrive.value,
          onChange: (event: Event) => {
            syncToDrive.value = (event.target as HTMLInputElement).checked
          },
        }),
        h('span', '同时写入 115 文件原生备注（自动保留打点数据）'),
      ]),
    ]),
  })
  if (!confirmed)
    return
  const res = await store.setMediaNote(props.entry.mediaKey, draft.value, {
    syncToDriveFileIds: syncToDrive.value ? props.entry.files.map(file => file.fid) : [],
  })
  if (res.truncated)
    toast.warning('本地备注已保存，但超出 115 文件备注长度上限未能同步远端')
  else if (res.failedCount > 0)
    toast.warning('本地备注已保存，部分文件同步 115 备注失败')
  else if (syncToDrive.value && res.syncedCount > 0)
    toast.success('已保存片名备注并同步至 115 文件备注')
  else
    toast.success(draft.value.trim() ? '已保存片名备注' : '已清除片名备注')
}

const baseMenuGroups = fileActions.buildFileMenuGroups(
  () => primaryFile.value,
  {
    onPlay: () => playPrimary(),
    onOpenDetail: () => openDetail(),
    onChangeCover: () => store.openCoverPicker(props.entry.mediaKey),
  },
)

const menuGroups = computed<ActionMenuGroup[]>(() => {
  const [first, ...rest] = baseMenuGroups
  const noteItem = {
    id: 'edit-media-note',
    label: mediaNote.value ? '编辑片名备注' : '添加片名备注',
    leading: actionIcon(I.DOCUMENT),
    onSelect: () => void editMediaNote(),
  }
  return first ? [[...first, noteItem], ...rest] : [[noteItem], ...rest]
})

function openContextMenu(event: MouseEvent) {
  if (!primaryFile.value)
    return
  menuPosition.value = { x: event.clientX, y: event.clientY }
  menuOpen.value = true
}
const isCollection = computed(() => props.entry.kind === 'collection')
const uncensoredBadge = computed(() => getUncensoredBadgeMeta(props.entry.uncensoredKind))
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

const durationLabel = computed(() => {
  if (props.entry.maxDuration > 0)
    return formatTime(props.entry.maxDuration)
  if (props.entry.meta?.duration)
    return `${props.entry.meta.duration} 分钟`
  return ''
})

function formatCompactCount(count: number): string {
  if (count >= 10000)
    return `${(count / 10000).toFixed(1).replace(/\.0$/, '')}万`
  if (count >= 1000)
    return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(count)
}

const ratingBadge = computed(() => {
  const rating = props.entry.meta?.rating
  if (!rating || !Number.isFinite(rating) || rating <= 0)
    return null
  const scoreText = rating.toFixed(rating >= 10 ? 1 : 2).replace(/\.00$/, '.0')
  const count = props.entry.meta?.ratingCount
  const hasCount = Boolean(count && Number.isFinite(count) && count > 0)
  const countText = hasCount ? formatCompactCount(count!) : ''
  const title = hasCount
    ? `评分 ${scoreText}（${count!.toLocaleString()} 人评价）`
    : `评分 ${scoreText}`
  return { scoreText, countText, title }
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

<style scoped>
.fav-icon-outline :deep(svg) {
  overflow: visible;
}

.fav-icon-outline :deep(path) {
  stroke: #fff;
  stroke-width: 4px;
  vector-effect: non-scaling-stroke;
  paint-order: stroke fill;
  stroke-linejoin: round;
  stroke-linecap: round;
}
</style>
