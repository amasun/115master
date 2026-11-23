<template>
  <div class="relative min-h-[60vh] w-full px-(--main-content-gutter) pb-16">
    <!-- 顶部加载进度条 -->
    <Progress :active="store.initializing || store.indexing" />

    <!-- 索引错误态 -->
    <div v-if="store.indexError && entries.length === 0" class="flex min-h-[50vh] items-center justify-center">
      <StatusFeedback
        status="error"
        retry-label="重新同步"
        v-bind="errorFeedback(store.indexError)"
        @retry="store.syncIndex()"
      />
    </div>

    <!-- 首次拉取全盘索引加载态 -->
    <div
      v-else-if="(store.initializing || store.indexing) && entries.length === 0"
      class="text-base-content/65 flex min-h-[50vh] flex-col items-center justify-center gap-3"
    >
      <Icon :name="I.LOADING" class="text-primary animate-spin text-3xl" />
      <p class="text-sm font-medium">
        正在同步 115 网盘全盘视频索引...
      </p>
      <p v-if="store.indexProgress.fetched > 0" class="text-base-content/50 text-xs tabular-nums">
        已扫描 {{ store.indexProgress.fetched }} / {{ store.indexProgress.total || '...' }} 部视频
      </p>
    </div>

    <!-- 空状态 -->
    <div
      v-else-if="entries.length === 0"
      class="flex min-h-[50vh] flex-col items-center justify-center gap-3"
    >
      <Empty
        :description="emptyDescription"
        size="lg"
      />
      <div v-if="store.entries.length > 0" class="flex flex-wrap items-center justify-center gap-2">
        <Button
          v-if="store.visibleEntryCount > 0"
          variant="soft"
          size="sm"
          class="rounded-full"
          @click="store.resetFilters()"
        >
          清除筛选条件
        </Button>
        <Button
          v-if="store.hideAdVideos && store.adEntryCount > 0"
          :variant="store.visibleEntryCount === 0 ? 'soft' : 'ghost'"
          size="sm"
          class="rounded-full"
          @click="store.hideAdVideos = false"
        >
          显示疑似广告视频
        </Button>
      </div>
      <Button
        v-else
        color="primary"
        size="sm"
        class="rounded-full"
        @click="store.syncIndex()"
      >
        立即同步索引
      </Button>
    </div>

    <!-- 虚拟滚动海报网格 -->
    <div ref="trackRef" class="w-full">
      <div
        v-if="entries.length > 0"
        class="relative w-full"
        :style="{ height: `${totalSize}px` }"
      >
        <div
          v-for="row in virtualRows"
          :key="String(row.key)"
          class="absolute top-0 left-0 w-full"
          :class="rows[row.index]?.kind === 'section' ? 'flex items-center gap-3' : 'grid'"
          :style="rows[row.index]?.kind === 'section'
            ? {
              transform: `translateY(${row.start - scrollMargin}px)`,
              height: `${SECTION_HEADER_HEIGHT}px`,
            }
            : {
              transform: `translateY(${row.start - scrollMargin}px)`,
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: `${gap}px`,
              height: `${rowHeight}px`,
            }"
        >
          <template v-if="rows[row.index]?.kind === 'section'">
            <div class="flex shrink-0 items-center gap-2">
              <span
                v-if="rows[row.index]?.kind === 'section' && (rows[row.index] as Extract<GridRow, { kind: 'section' }>).badge"
                class="badge badge-primary badge-soft badge-xs rounded-full font-medium"
              >
                {{ (rows[row.index] as Extract<GridRow, { kind: 'section' }>).badge }}
              </span>
              <span class="text-base-content text-sm font-semibold">
                {{ (rows[row.index] as Extract<GridRow, { kind: 'section' }>).title }}
              </span>
              <span class="text-base-content/45 text-xs tabular-nums">
                {{ (rows[row.index] as Extract<GridRow, { kind: 'section' }>).count }} 部
              </span>
            </div>
            <div class="bg-base-content/10 h-px flex-1" />
          </template>
          <template v-else-if="rows[row.index]?.kind === 'cards'">
            <PosterCard
              v-for="entry in (rows[row.index] as Extract<GridRow, { kind: 'cards' }>).entries"
              :key="entry.mediaKey"
              :entry="entry"
              :aspect-mode="store.aspectMode"
            />
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LibraryEntry } from '@/utils/mediaIndex'
import { Button, Empty, Progress, StatusFeedback } from '@115master/ui'
import { useWindowVirtualizer } from '@tanstack/vue-virtual'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { I, Icon } from '@/icons'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { errorFeedback } from '@/utils/errorFeedback'
import PosterCard from './PosterCard.vue'

const store = useMediaLibraryStore()
const trackRef = ref<HTMLElement>()
const containerWidth = shallowRef(960)
const scrollMargin = shallowRef(0)

const entries = computed(() => store.filteredEntries)

const emptyDescription = computed(() => {
  if (store.entries.length === 0)
    return '暂未索引到网盘视频'
  if (store.visibleEntryCount === 0 && store.hideAdVideos)
    return '当前索引中的视频均被判定为疑似广告并已隐藏'
  return '没有符合当前筛选条件的作品'
})

const gap = computed(() => {
  if (store.density === 'compact')
    return 12
  if (store.density === 'relaxed')
    return 20
  return 16
})

const columns = computed(() => {
  const width = Math.max(280, containerWidth.value)
  const targetWidth = store.aspectMode === 'portrait'
    ? store.density === 'compact' ? 148 : store.density === 'relaxed' ? 220 : 180
    : store.density === 'compact' ? 210 : store.density === 'relaxed' ? 320 : 256
  return Math.max(1, Math.floor((width + gap.value) / (targetWidth + gap.value)))
})

const rowHeight = computed(() => {
  const width = Math.max(280, containerWidth.value)
  const cardWidth = (width - gap.value * (columns.value - 1)) / columns.value
  const coverHeight = store.aspectMode === 'portrait' ? cardWidth * 1.5 : cardWidth * (2 / 3)
  return Math.ceil(coverHeight + 114)
})

const RECENT_30_DAYS_SEC = 30 * 24 * 60 * 60
const SECTION_HEADER_HEIGHT = 40

type GridRow
  = | { kind: 'section', key: string, title: string, count: number, badge?: string }
    | { kind: 'cards', key: string, entries: LibraryEntry[] }

function chunkCards(list: LibraryEntry[], cols: number): GridRow[] {
  const result: GridRow[] = []
  for (let i = 0; i < list.length; i += cols) {
    const slice = list.slice(i, i + cols)
    if (slice.length > 0)
      result.push({ kind: 'cards', key: slice[0]!.mediaKey, entries: slice })
  }
  return result
}

const rows = computed<GridRow[]>(() => {
  const cols = columns.value
  const list = entries.value
  if (list.length === 0)
    return []

  if (store.filter.view === 'all' && store.filter.sortBy === 'mtime') {
    const cutoffSec = Math.floor(Date.now() / 1000) - RECENT_30_DAYS_SEC
    const recentEntries = list.filter(entry => entry.latestMtime >= cutoffSec)
    const olderEntries = list.filter(entry => entry.latestMtime < cutoffSec)

    if (recentEntries.length > 0) {
      const recentBlock: GridRow[] = [
        {
          kind: 'section',
          key: 'section:recent30',
          title: '最近 30 天入库',
          count: recentEntries.length,
          badge: '近 30 天',
        },
        ...chunkCards(recentEntries, cols),
      ]
      const olderBlock: GridRow[] = olderEntries.length > 0
        ? [
            {
              kind: 'section',
              key: 'section:older',
              title: '更早入库',
              count: olderEntries.length,
            },
            ...chunkCards(olderEntries, cols),
          ]
        : []
      return store.filter.sortAsc ? [...olderBlock, ...recentBlock] : [...recentBlock, ...olderBlock]
    }
  }

  return chunkCards(list, cols)
})

function updateMetrics() {
  if (!trackRef.value)
    return
  containerWidth.value = trackRef.value.clientWidth || window.innerWidth
  scrollMargin.value = trackRef.value.getBoundingClientRect().top + window.scrollY
}

const virtualizerOptions = computed(() => ({
  count: rows.value.length,
  estimateSize: (index: number) => rows.value[index]?.kind === 'section' ? SECTION_HEADER_HEIGHT : rowHeight.value,
  gap: gap.value,
  overscan: 2,
  scrollMargin: scrollMargin.value,
  getItemKey: (index: number) => {
    const item = rows.value[index]
    if (!item)
      return `${columns.value}:${index}`
    return item.kind === 'section' ? item.key : `${columns.value}:${item.key}`
  },
}))

const virtualizer = useWindowVirtualizer(virtualizerOptions)
const virtualRows = computed(() => virtualizer.value.getVirtualItems())
const totalSize = computed(() => virtualizer.value.getTotalSize())

watch([columns, rowHeight, () => store.filter.view, () => store.filter.sortBy, () => store.filter.sortAsc], () => {
  void nextTick(() => {
    virtualizer.value.measure()
  })
})

let activeVisibleKeys = new Set<string>()

watch(
  [virtualRows, rows],
  () => {
    const nextKeys = new Set<string>()
    virtualRows.value.forEach((row) => {
      const rowData = rows.value[row.index]
      if (!rowData || rowData.kind !== 'cards')
        return
      rowData.entries.forEach((entry) => {
        nextKeys.add(entry.mediaKey)
        if (entry.meta === null && entry.kind === 'jav')
          store.enqueueScrape(entry.mediaKey)
      })
    })

    activeVisibleKeys.forEach((key) => {
      if (!nextKeys.has(key))
        store.cancelScrape(key)
    })
    activeVisibleKeys = nextKeys
  },
  { immediate: true, flush: 'post' },
)

onMounted(() => {
  updateMetrics()
  void nextTick(() => {
    virtualizer.value.measure()
  })
})

onUnmounted(() => {
  activeVisibleKeys.forEach(key => store.cancelScrape(key))
  activeVisibleKeys.clear()
})

useResizeObserver(trackRef, updateMetrics)
useEventListener(window, 'resize', updateMetrics)
</script>
