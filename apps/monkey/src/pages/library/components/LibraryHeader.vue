<template>
  <Header>
    <HeaderStart>
      <div class="flex min-w-0 items-center gap-1.5">
        <nav aria-label="面包屑导航" class="min-w-0">
          <ol class="flex min-w-0 items-center gap-1 text-sm">
            <li
              v-for="(item, idx) in breadcrumbs"
              :key="item.key"
              class="flex min-w-0 items-center gap-1"
            >
              <Icon
                v-if="idx > 0"
                :name="I.RIGHT"
                class="text-base-content/35 shrink-0 text-xs"
                aria-hidden="true"
              />
              <button
                v-if="!item.current"
                type="button"
                class="text-base-content/65 hover:text-base-content hover:bg-base-content/6 max-w-36 truncate rounded-full px-2 py-1 font-medium transition-colors"
                :title="item.title ?? item.label"
                @click="handleBreadcrumbClick(item)"
              >
                {{ item.label }}
              </button>
              <span
                v-else
                aria-current="page"
                class="text-base-content flex min-w-0 items-center gap-1 px-1.5 font-semibold"
                :title="item.title ?? item.label"
              >
                <span class="max-w-52 truncate">{{ item.label }}</span>
                <span
                  v-if="item.count !== undefined"
                  class="text-base-content/50 shrink-0 text-xs font-normal tabular-nums"
                >
                  ({{ item.count }})
                </span>
              </span>
            </li>
          </ol>
        </nav>
        <button
          v-if="!isActors && !isDetail && hasActiveFilter"
          type="button"
          class="btn btn-ghost btn-xs text-base-content/65 hover:text-base-content shrink-0 rounded-full"
          @click="clearAllFilters"
        >
          清空条件
        </button>
      </div>
    </HeaderStart>

    <HeaderEnd>
      <!-- 库内即时搜索 -->
      <label class="ui-glass-floating flex h-9 w-40 items-center gap-1.5 rounded-full px-3 sm:w-56">
        <Icon :name="I.SEARCH" class="text-base-content/55 shrink-0 text-base" />
        <input
          v-model="store.filter.keyword"
          type="text"
          class="text-base-content placeholder:text-base-content/45 min-w-0 grow bg-transparent text-xs outline-none"
          :placeholder="isActors ? '搜索演员...' : '搜番号、片名、演员...'"
          @input="handleKeywordInput"
        >
        <button
          v-if="store.filter.keyword"
          type="button"
          class="text-base-content/50 hover:text-base-content shrink-0"
          aria-label="清空搜索"
          @click="store.filter.keyword = ''"
        >
          <Icon :name="I.CLOSE" class="text-sm" />
        </button>
      </label>

      <!-- 展开多维筛选 -->
      <Tooltip content="多维筛选">
        <Button
          variant="glass-floating"
          shape="circle"
          size="sm"
          :class="!isActors && (showFilters || subFilterCount > 0) ? 'ring-primary/50 text-primary ring-1' : ''"
          @click="$emit('toggleFilters')"
        >
          <Icon :name="I.FILTER" :filled="!isActors && (showFilters || subFilterCount > 0)" class="text-base" />
        </Button>
      </Tooltip>

      <!-- 排序选择 + 方向 -->
      <div
        v-if="!isActors"
        class="ui-glass-floating hidden h-9 items-center gap-1 rounded-full px-2 md:inline-flex"
      >
        <select
          v-model="store.filter.sortBy"
          aria-label="排序方式"
          class="text-base-content cursor-pointer bg-transparent px-1 text-xs outline-none"
        >
          <option value="mtime">
            最近入库
          </option>
          <option value="releaseDate">
            发行日期
          </option>
          <option value="duration">
            片长
          </option>
          <option value="size">
            文件大小
          </option>
          <option value="title">
            番号 / 名称
          </option>
        </select>
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-circle"
          :title="store.filter.sortAsc ? '升序' : '降序'"
          @click="store.filter.sortAsc = !store.filter.sortAsc"
        >
          <Icon :name="store.filter.sortAsc ? I.ARROW_UP : I.ARROW_DOWN" class="text-sm" />
        </button>
      </div>

      <!-- 横版 / 竖版比例 -->
      <Tooltip
        v-if="!isActors"
        :content="store.aspectMode === 'landscape' ? '切换竖版海报' : '切换横版封面'"
      >
        <Button
          variant="glass-floating"
          size="sm"
          class="hidden rounded-full px-3 text-xs sm:inline-flex"
          @click="toggleAspect"
        >
          {{ store.aspectMode === 'landscape' ? '横版' : '竖版' }}
        </Button>
      </Tooltip>

      <!-- 网格密度 -->
      <Tooltip
        v-if="!isActors"
        :content="`网格密度：${densityLabel}`"
      >
        <Button
          variant="glass-floating"
          shape="circle"
          size="sm"
          class="hidden sm:inline-flex"
          @click="cycleDensity"
        >
          <Icon :name="I.GRID" class="text-base" />
        </Button>
      </Tooltip>

      <!-- 刮削状态徽章 -->
      <span
        v-if="store.scrapingCount > 0 || store.indexing"
        class="badge badge-primary badge-soft hidden gap-1 rounded-full text-xs lg:inline-flex"
      >
        <Icon :name="I.LOADING" class="animate-spin text-xs" />
        <span v-if="store.indexing">同步中</span>
        <span v-else>刮削 {{ store.scrapingCount }}</span>
      </span>
    </HeaderEnd>
  </Header>
</template>

<script setup lang="ts">
import type { LibraryBreadcrumbItem } from './breadcrumb'
import { Button, Header, HeaderEnd, HeaderStart, Tooltip } from '@115master/ui'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { I, Icon } from '@/icons'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { useTagStore } from '@/store/tagList'
import { normalizeActressName } from '@/utils/actressNameMatcher'
import { buildLibraryBreadcrumbs } from './breadcrumb'
import { resolveDriveLabelName } from './tagRail'

defineProps<{
  showFilters: boolean
}>()

defineEmits<{
  toggleFilters: []
}>()

const route = useRoute()
const router = useRouter()
const store = useMediaLibraryStore()
const tagStore = useTagStore()
const isDetail = computed(() => route.name === 'library-detail')
const isActors = computed(() => route.name === 'library-actors')

const activeDriveLabelName = computed(() => {
  if (!store.filter.driveLabel)
    return ''
  return resolveDriveLabelName(store.filter.driveLabel, tagStore.tags, store.libraryIndex.driveLabels)
})

const detailLabel = computed(() => {
  if (!isDetail.value)
    return undefined
  const mediaKey = 'mediaKey' in route.params ? String(route.params.mediaKey ?? '') : ''
  const entry = store.getEntry(mediaKey)
  return entry?.externalId || entry?.meta?.title || entry?.files[0]?.name || '作品详情'
})

function handleBreadcrumbClick(item: LibraryBreadcrumbItem) {
  const target = item.target
  if (!target)
    return

  if (target.kind === 'wall') {
    if (route.name !== 'library')
      void router.push({ name: 'library' })
    return
  }

  if (target.kind === 'root') {
    store.resetFilters()
    store.scrollTop = 0
    if (route.name !== 'library')
      void router.push({ name: 'library' })
    return
  }

  const keep = new Set(target.keep)
  const scopeChanged = (
    (!keep.has('view') && store.filter.view !== 'all')
    || (!keep.has('driveLabel') && Boolean(store.filter.driveLabel))
    || (!keep.has('actor') && Boolean(store.filter.actor))
    || (!keep.has('genre') && Boolean(store.filter.genre))
    || (!keep.has('director') && Boolean(store.filter.director))
  )

  if (!keep.has('view'))
    store.setView('all')
  if (!keep.has('driveLabel'))
    store.selectDriveLabel(undefined)
  if (!keep.has('actor'))
    store.selectActor(undefined)
  if (!keep.has('genre'))
    store.selectGenre(undefined)
  if (!keep.has('director'))
    store.filter.director = undefined

  if (scopeChanged)
    store.scrollTop = 0
  if (route.name !== 'library')
    void router.push({ name: 'library' })
}

function showWallFromFilter() {
  if (isDetail.value) {
    store.scrollTop = 0
    void router.push({ name: 'library' })
  }
}

function clearAllFilters() {
  store.resetFilters()
  showWallFromFilter()
}

function handleKeywordInput() {
  if (isDetail.value && store.filter.keyword.trim()) {
    store.scrollTop = 0
    void router.push({ name: 'library' })
  }
}

const headerCount = computed(() => {
  if (!isActors.value)
    return store.filteredEntries.length

  const keyword = store.filter.keyword.trim().toLowerCase()
  if (!keyword)
    return store.libraryIndex.actorStats.length

  const normalizedKeyword = normalizeActressName(store.filter.keyword)
  return store.libraryIndex.actorStats.filter(actor =>
    [actor.name, ...actor.aliases].some((name) => {
      if (name.toLowerCase().includes(keyword))
        return true
      return Boolean(normalizedKeyword) && normalizeActressName(name).includes(normalizedKeyword)
    }),
  ).length
})

const breadcrumbs = computed(() =>
  buildLibraryBreadcrumbs({
    routeName: String(route.name ?? 'library'),
    view: store.filter.view,
    actor: store.filter.actor,
    genre: store.filter.genre,
    director: store.filter.director,
    driveLabelId: store.filter.driveLabel,
    driveLabelName: activeDriveLabelName.value,
    detailLabel: detailLabel.value,
    count: headerCount.value,
  }),
)

const subFilterCount = computed(() => {
  let count = 0
  if (store.filter.genre)
    count += 1
  if (store.filter.year !== undefined)
    count += 1
  if (store.filter.director)
    count += 1
  if (store.filter.driveLabel)
    count += 1
  if (store.filter.scrapeStatus !== 'all')
    count += 1
  if (store.filter.onlyStarred)
    count += 1
  if (store.filter.onlyMarked)
    count += 1
  return count
})

const hasActiveFilter = computed(() =>
  Boolean(
    store.filter.keyword.trim()
    || store.filter.actor
    || store.filter.genre
    || store.filter.driveLabel
    || store.filter.view !== 'all'
    || subFilterCount.value > 0,
  ),
)

const densityLabel = computed(() => {
  if (store.density === 'compact')
    return '紧凑'
  if (store.density === 'relaxed')
    return '宽松'
  return '标准'
})

function toggleAspect() {
  store.aspectMode = store.aspectMode === 'landscape' ? 'portrait' : 'landscape'
}

function cycleDensity() {
  const order: Array<'compact' | 'comfortable' | 'relaxed'> = ['compact', 'comfortable', 'relaxed']
  const next = order[(order.indexOf(store.density) + 1) % order.length]
  store.density = next ?? 'comfortable'
}
</script>
