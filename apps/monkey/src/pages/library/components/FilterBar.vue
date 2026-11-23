<template>
  <div
    v-if="visible"
    class="px-(--main-content-gutter) pb-3"
  >
    <div
      class="ui-glass-surface flex flex-wrap items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs"
    >
      <!-- 题材 -->
      <label class="flex items-center gap-1.5">
        <span class="text-base-content/55">题材</span>
        <select
          v-model="store.filter.genre"
          class="select select-xs select-bordered bg-base-100/70 max-w-36 rounded-full"
        >
          <option :value="undefined">全部题材</option>
          <option
            v-for="item in store.libraryIndex.genres"
            :key="item.name"
            :value="item.name"
          >
            {{ item.name }} ({{ item.count }})
          </option>
        </select>
      </label>

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

      <!-- 115 网盘标签 -->
      <label v-if="store.libraryIndex.driveLabels.length > 0" class="flex items-center gap-1.5">
        <span class="text-base-content/55">标签</span>
        <select
          v-model="store.filter.driveLabel"
          class="select select-xs select-bordered bg-base-100/70 max-w-36 rounded-full"
        >
          <option :value="undefined">全部标签</option>
          <option
            v-for="item in store.libraryIndex.driveLabels"
            :key="item.id"
            :value="item.id"
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

      <!-- 仅看星标 -->
      <button
        type="button"
        class="btn btn-xs gap-1 rounded-full font-normal"
        :class="store.filter.onlyStarred ? 'btn-warning' : 'btn-ghost'"
        @click="store.filter.onlyStarred = !store.filter.onlyStarred"
      >
        <Icon :name="I.STAR" :filled="store.filter.onlyStarred" class="text-sm" />
        <span>仅看星标</span>
      </button>

      <!-- 仅看有打点 -->
      <button
        type="button"
        class="btn btn-xs gap-1 rounded-full font-normal"
        :class="store.filter.onlyMarked ? 'btn-secondary' : 'btn-ghost'"
        @click="store.filter.onlyMarked = !store.filter.onlyMarked"
      >
        <Icon :name="I.MARKER" :filled="store.filter.onlyMarked" class="text-sm" />
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
  </div>
</template>

<script setup lang="ts">
import type { LibraryScrapeFilter } from '@/utils/mediaIndex'
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
</script>
