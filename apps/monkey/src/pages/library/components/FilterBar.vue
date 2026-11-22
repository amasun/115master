<template>
  <div
    v-if="visible || activeChips.length > 0"
    class="px-(--main-content-gutter) pb-3"
  >
    <div
      v-if="visible"
      class="ui-glass-surface mb-2 flex flex-wrap items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs"
    >
      <!-- 年份 -->
      <label class="flex items-center gap-1.5">
        <span class="text-base-content/55">年份</span>
        <select
          :value="store.filter.year ?? ''"
          class="select select-xs select-bordered bg-base-100/70 rounded-full"
          @change="onYearChange"
        >
          <option value="">全部年份</option>
          <option
            v-for="item in store.libraryIndex.years"
            :key="item.year"
            :value="item.year"
          >
            {{ item.year }} ({{ item.count }})
          </option>
        </select>
      </label>

      <!-- 导演 -->
      <label class="flex items-center gap-1.5">
        <span class="text-base-content/55">导演</span>
        <select
          v-model="store.filter.director"
          class="select select-xs select-bordered bg-base-100/70 max-w-36 rounded-full"
        >
          <option :value="undefined">全部导演</option>
          <option
            v-for="item in store.libraryIndex.directors.slice(0, 100)"
            :key="item.name"
            :value="item.name"
          >
            {{ item.name }} ({{ item.count }})
          </option>
        </select>
      </label>

      <!-- 刮削状态 -->
      <div class="flex items-center gap-1">
        <span class="text-base-content/55 mr-0.5">状态</span>
        <button
          v-for="option in scrapeOptions"
          :key="option.value"
          type="button"
          class="btn btn-xs rounded-full font-normal"
          :class="store.filter.scrapeStatus === option.value ? 'btn-primary' : 'btn-ghost'"
          @click="store.filter.scrapeStatus = option.value"
        >
          {{ option.label }}
        </button>
      </div>

      <!-- 仅看有打点 -->
      <button
        type="button"
        class="btn btn-xs gap-1 rounded-full font-normal"
        :class="store.filter.onlyMarked ? 'btn-secondary' : 'btn-ghost'"
        @click="store.filter.onlyMarked = !store.filter.onlyMarked"
      >
        <Icon :name="I.MARKER" class="text-sm" />
        <span>仅看有打点</span>
      </button>

      <!-- 移动端补充排序切换 -->
      <label class="flex items-center gap-1.5 md:hidden">
        <span class="text-base-content/55">排序</span>
        <select
          v-model="store.filter.sortBy"
          class="select select-xs select-bordered bg-base-100/70 rounded-full"
        >
          <option value="mtime">最近入库</option>
          <option value="releaseDate">发行日期</option>
          <option value="duration">片长</option>
          <option value="size">文件大小</option>
          <option value="title">番号 / 名称</option>
        </select>
      </label>
    </div>

    <!-- 已选筛选条件胶囊条 -->
    <div v-if="activeChips.length > 0" class="flex flex-wrap items-center gap-1.5">
      <span
        v-for="chip in activeChips"
        :key="chip.key"
        class="badge badge-neutral badge-soft badge-sm gap-1 rounded-full pr-1.5 pl-2.5"
      >
        <span>{{ chip.label }}</span>
        <button
          type="button"
          class="hover:text-base-content text-base-content/55"
          :aria-label="`移除${chip.label}`"
          @click="chip.clear()"
        >
          <Icon :name="I.CLOSE" class="text-xs" />
        </button>
      </span>
      <button
        type="button"
        class="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content rounded-full"
        @click="store.resetFilters()"
      >
        全部清空
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LibraryScrapeFilter } from '@/utils/mediaIndex'
import { computed } from 'vue'
import { I, Icon } from '@/icons'
import { useMediaLibraryStore } from '@/store/mediaLibrary'

defineProps<{
  visible: boolean
}>()

const store = useMediaLibraryStore()

const scrapeOptions: Array<{ value: LibraryScrapeFilter, label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'scraped', label: '已刮削' },
  { value: 'unscraped', label: '待刮削' },
]

function onYearChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  store.filter.year = value ? Number(value) : undefined
}

const activeChips = computed(() => {
  const chips: Array<{ key: string, label: string, clear: () => void }> = []

  if (store.filter.keyword.trim()) {
    chips.push({
      key: 'keyword',
      label: `关键词: ${store.filter.keyword.trim()}`,
      clear: () => { store.filter.keyword = '' },
    })
  }
  if (store.filter.actor) {
    chips.push({
      key: 'actor',
      label: `演员: ${store.filter.actor}`,
      clear: () => store.selectActor(undefined),
    })
  }
  if (store.filter.genre) {
    chips.push({
      key: 'genre',
      label: `题材: ${store.filter.genre}`,
      clear: () => store.selectGenre(undefined),
    })
  }
  if (store.filter.year !== undefined) {
    chips.push({
      key: 'year',
      label: `年份: ${store.filter.year}`,
      clear: () => { store.filter.year = undefined },
    })
  }
  if (store.filter.director) {
    chips.push({
      key: 'director',
      label: `导演: ${store.filter.director}`,
      clear: () => { store.filter.director = undefined },
    })
  }
  if (store.filter.scrapeStatus !== 'all') {
    chips.push({
      key: 'scrapeStatus',
      label: store.filter.scrapeStatus === 'scraped' ? '仅已刮削' : '仅待刮削',
      clear: () => { store.filter.scrapeStatus = 'all' },
    })
  }
  if (store.filter.onlyMarked) {
    chips.push({
      key: 'onlyMarked',
      label: '仅看有打点',
      clear: () => { store.filter.onlyMarked = false },
    })
  }

  return chips
})
</script>
