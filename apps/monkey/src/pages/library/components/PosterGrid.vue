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
        :description="store.filter.view === 'cinema' && store.cinemaCount === 0 ? '尚未配置院线影视目录' : emptyDescription"
        size="lg"
      />
      <div v-if="store.filter.view === 'cinema' && store.cinemaCount === 0" class="flex flex-wrap items-center justify-center gap-2">
        <Button
          color="primary"
          size="sm"
          class="rounded-full"
          @click="store.configureCategoryFolders('cinema')"
        >
          选择院线影视目录
        </Button>
      </div>
      <div v-else-if="store.entries.length > 0" class="flex flex-wrap items-center justify-center gap-2">
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

    <!-- 分页海报网格 -->
    <div v-else ref="trackRef" class="flex w-full flex-col gap-6">
      <section
        v-for="section in sections"
        :key="`${store.wallPage}:${section.key}`"
        class="flex w-full flex-col gap-3"
      >
        <div
          v-if="section.title"
          class="flex h-10 items-center gap-3"
        >
          <div class="flex shrink-0 items-center gap-2">
            <span
              v-if="section.badge"
              class="badge badge-primary badge-soft badge-xs rounded-full font-medium"
            >
              {{ section.badge }}
            </span>
            <span class="text-base-content text-sm font-semibold">
              {{ section.title }}
            </span>
            <span
              v-if="section.count !== undefined"
              class="text-base-content/45 text-xs tabular-nums"
            >
              {{ section.count }} 部
            </span>
          </div>
          <div class="bg-base-content/10 h-px flex-1" />
        </div>

        <div
          class="grid w-full"
          :style="{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: `${gap}px`,
          }"
        >
          <PosterCard
            v-for="entry in section.entries"
            :key="entry.mediaKey"
            :entry="entry"
            :aspect-mode="effectiveAspectMode"
          />
        </div>
      </section>

      <!-- 底部分页切换与每页数量控制 -->
      <div
        v-if="entries.length >= WALL_PAGE_SIZE_OPTIONS[0]"
        class="mt-4 flex flex-col items-center gap-3"
      >
        <Pagination
          surface="floating"
          :current-page="store.wallPage"
          :current-page-size="store.wallPageSize"
          :total="entries.length"
          :page-size-options="WALL_PAGE_SIZE_OPTIONS"
          :show-size-changer="true"
          :show-quick-jumper="true"
          :labels="paginationLabels"
          :on-current-page-change="handlePageChange"
          :on-page-size-change="handlePageSizeChange"
        />
        <div class="text-base-content/55 flex flex-wrap items-center justify-center gap-3 text-xs tabular-nums">
          <span>第 {{ store.wallPage }} / {{ store.wallTotalPages }} 页 · 共 {{ entries.length }} 部</span>
          <label
            v-if="store.wallTotalPages > 1 && store.wallTotalPages <= 500"
            class="inline-flex items-center gap-1.5 md:hidden"
          >
            <span>跳转</span>
            <select
              :value="store.wallPage"
              aria-label="跳转页码"
              class="select select-ghost select-xs bg-base-200/70 rounded-full tabular-nums"
              @change="handleMobilePageChange"
            >
              <option
                v-for="page in store.wallTotalPages"
                :key="page"
                :value="page"
              >
                第 {{ page }} 页
              </option>
            </select>
          </label>
          <label class="inline-flex items-center gap-1.5 md:hidden">
            <span>每页</span>
            <select
              :value="store.wallPageSize"
              aria-label="每页显示数量"
              class="select select-ghost select-xs bg-base-200/70 rounded-full"
              @change="handleMobilePageSizeChange"
            >
              <option
                v-for="size in WALL_PAGE_SIZE_OPTIONS"
                :key="size"
                :value="size"
              >
                {{ size }} 部
              </option>
            </select>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PaginationLabels } from '@115master/ui'
import { Button, Empty, Pagination, Progress, StatusFeedback } from '@115master/ui'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { I, Icon } from '@/icons'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { errorFeedback } from '@/utils/errorFeedback'
import PosterCard from './PosterCard.vue'
import {
  buildWallPageSections,
  sliceWallPage,
  WALL_PAGE_SIZE_OPTIONS,
} from './wallPagination'

const store = useMediaLibraryStore()
const trackRef = ref<HTMLElement>()
const containerWidth = shallowRef(960)

const entries = computed(() => store.filteredEntries)
const pagedEntries = computed(() =>
  sliceWallPage(entries.value, store.wallPage, store.wallPageSize),
)

const paginationLabels: PaginationLabels = {
  previousPage: '上一页',
  nextPage: '下一页',
  jumpToPage: '跳转页码',
  pageSize: '每页显示数量',
  pageSizeUnit: '部 / 页',
}

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

const effectiveAspectMode = computed<'landscape' | 'portrait'>(() =>
  store.filter.view === 'cinema' ? 'portrait' : store.aspectMode,
)

const columns = computed(() => {
  const width = Math.max(280, containerWidth.value)
  const targetWidth = effectiveAspectMode.value === 'portrait'
    ? store.density === 'compact' ? 148 : store.density === 'relaxed' ? 220 : 180
    : store.density === 'compact' ? 210 : store.density === 'relaxed' ? 320 : 256
  return Math.max(1, Math.floor((width + gap.value) / (targetWidth + gap.value)))
})

const sections = computed(() =>
  buildWallPageSections({
    allEntries: entries.value,
    pageEntries: pagedEntries.value,
    view: store.filter.view,
    sortBy: store.filter.sortBy,
    sortAsc: store.filter.sortAsc,
  }),
)

function updateMetrics() {
  if (!trackRef.value)
    return
  containerWidth.value = trackRef.value.clientWidth || window.innerWidth
}

function scrollToTop() {
  if (typeof window !== 'undefined')
    window.scrollTo({ top: 0, behavior: 'auto' })
}

function handlePageChange(page: number) {
  store.setWallPage(page)
  scrollToTop()
}

function handlePageSizeChange(size: number) {
  store.setWallPageSize(size)
  scrollToTop()
}

function handleMobilePageSizeChange(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value)
  handlePageSizeChange(value)
}

function handleMobilePageChange(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value)
  handlePageChange(value)
}

let activePageKeys = new Set<string>()

watch(
  pagedEntries,
  (list) => {
    const nextKeys = new Set(list.map(entry => entry.mediaKey))
    activePageKeys.forEach((key) => {
      if (!nextKeys.has(key))
        store.cancelScrape(key)
    })
    activePageKeys = nextKeys
  },
  { immediate: true },
)

onMounted(() => {
  updateMetrics()
})

onUnmounted(() => {
  activePageKeys.forEach(key => store.cancelScrape(key))
  activePageKeys.clear()
})

useResizeObserver(trackRef, updateMetrics)
useEventListener(window, 'resize', updateMetrics)
</script>
