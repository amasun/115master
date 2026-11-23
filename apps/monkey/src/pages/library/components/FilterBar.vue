<template>
  <div
    v-if="visible"
    class="px-(--main-content-gutter) pb-3"
  >
    <div
      class="ui-glass-surface flex flex-wrap items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs"
    >
      <!-- 题材 -->
      <label class="flex shrink-0 items-center gap-1.5">
        <span class="text-base-content/55 shrink-0 whitespace-nowrap">题材</span>
        <select
          v-model="store.filter.genre"
          class="select select-xs select-bordered bg-base-100/70 w-auto max-w-36 min-w-24 rounded-full"
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
      <label class="flex shrink-0 items-center gap-1.5">
        <span class="text-base-content/55 shrink-0 whitespace-nowrap">年份</span>
        <select
          :value="store.filter.year ?? ''"
          class="select select-xs select-bordered bg-base-100/70 w-auto min-w-24 rounded-full"
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
      <label class="flex shrink-0 items-center gap-1.5">
        <span class="text-base-content/55 shrink-0 whitespace-nowrap">导演</span>
        <select
          v-model="store.filter.director"
          class="select select-xs select-bordered bg-base-100/70 w-auto max-w-36 min-w-24 rounded-full"
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
      <label v-if="store.libraryIndex.driveLabels.length > 0" class="flex shrink-0 items-center gap-1.5">
        <span class="text-base-content/55 shrink-0 whitespace-nowrap">标签</span>
        <select
          v-model="store.filter.driveLabel"
          class="select select-xs select-bordered bg-base-100/70 w-auto max-w-36 min-w-24 rounded-full"
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
      <div class="flex shrink-0 items-center gap-1">
        <span class="text-base-content/55 mr-0.5 shrink-0 whitespace-nowrap">状态</span>
        <button
          v-for="option in scrapeOptions"
          :key="option.value"
          type="button"
          class="btn btn-xs shrink-0 rounded-full font-normal whitespace-nowrap"
          :class="store.filter.scrapeStatus === option.value ? 'btn-primary' : 'btn-ghost'"
          @click="store.filter.scrapeStatus = option.value"
        >
          {{ option.label }}
        </button>
      </div>

      <!-- 仅看星标 -->
      <button
        type="button"
        class="btn btn-xs shrink-0 gap-1 rounded-full font-normal whitespace-nowrap"
        :class="store.filter.onlyStarred ? 'btn-warning' : 'btn-ghost'"
        @click="store.filter.onlyStarred = !store.filter.onlyStarred"
      >
        <Icon :name="I.STAR" :filled="store.filter.onlyStarred" class="text-sm" />
        <span>仅看星标</span>
      </button>

      <!-- 仅看有打点 -->
      <button
        type="button"
        class="btn btn-xs shrink-0 gap-1 rounded-full font-normal whitespace-nowrap"
        :class="store.filter.onlyMarked ? 'btn-secondary' : 'btn-ghost'"
        @click="store.filter.onlyMarked = !store.filter.onlyMarked"
      >
        <Icon :name="I.MARKER" :filled="store.filter.onlyMarked" class="text-sm" />
        <span>仅看有打点</span>
      </button>

      <!-- 隐藏疑似广告视频与共用阈值（与清理页实时同步） -->
      <div class="flex shrink-0 flex-wrap items-center gap-1.5">
        <button
          type="button"
          class="btn btn-xs shrink-0 gap-1 rounded-full font-normal whitespace-nowrap"
          :class="store.hideAdVideos ? 'btn-primary' : 'btn-ghost'"
          :aria-pressed="store.hideAdVideos"
          @click="store.hideAdVideos = !store.hideAdVideos"
        >
          <Icon :name="store.hideAdVideos ? I.PREVIEW_OFF : I.VIEW" class="text-sm" />
          <span>隐藏疑似广告视频</span>
          <span v-if="store.adEntryCount > 0" class="tabular-nums opacity-75">
            ({{ store.adEntryCount }})
          </span>
        </button>
        <div
          class="bg-base-100/50 border-base-content/10 flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5"
          title="自定义广告识别阈值与匹配关系（与「去重与清理」实时同步）"
        >
          <span class="text-base-content/55 shrink-0 whitespace-nowrap">≤</span>
          <input
            v-model.number="adDurationDraft"
            type="number"
            :min="AD_DURATION_MIN_SEC"
            :max="AD_DURATION_MAX_SEC"
            aria-label="广告时长上限 (秒)"
            class="text-base-content w-10 bg-transparent text-center text-xs tabular-nums outline-none"
            @change="commitDurationDraft"
            @blur="commitDurationDraft"
          >
          <span class="text-base-content/55 shrink-0 whitespace-nowrap">秒</span>

          <div
            class="bg-base-content/6 inline-flex shrink-0 items-center rounded-full p-0.5"
            role="group"
            aria-label="广告筛选匹配关系"
          >
            <button
              type="button"
              class="cursor-pointer rounded-full px-1.5 py-0.5 text-[11px] leading-none transition-colors"
              :class="store.adFilterOptions.matchMode === 'and'
                ? 'bg-primary text-primary-content font-medium'
                : 'text-base-content/65 hover:text-base-content'"
              aria-label="广告筛选关系：且 (AND)"
              :aria-pressed="store.adFilterOptions.matchMode === 'and'"
              title="且 (AND)：同时满足时长和体积上限"
              @click="store.commitAdThresholds({ matchMode: 'and' })"
            >
              且
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-full px-1.5 py-0.5 text-[11px] leading-none transition-colors"
              :class="store.adFilterOptions.matchMode === 'or'
                ? 'bg-primary text-primary-content font-medium'
                : 'text-base-content/65 hover:text-base-content'"
              aria-label="广告筛选关系：或 (OR)"
              :aria-pressed="store.adFilterOptions.matchMode === 'or'"
              title="或 (OR)：满足时长或体积任一上限"
              @click="store.commitAdThresholds({ matchMode: 'or' })"
            >
              或
            </button>
          </div>

          <span class="text-base-content/55 shrink-0 whitespace-nowrap">≤</span>
          <input
            v-model.number="adSizeDraft"
            type="number"
            :min="AD_SIZE_MIN_MB"
            :max="AD_SIZE_MAX_MB"
            aria-label="广告体积上限 (MB)"
            class="text-base-content w-10 bg-transparent text-center text-xs tabular-nums outline-none"
            @change="commitSizeDraft"
            @blur="commitSizeDraft"
          >
          <span class="text-base-content/55 shrink-0 whitespace-nowrap">MB</span>
        </div>
        <button
          type="button"
          class="btn btn-ghost btn-xs text-base-content/55 hover:text-base-content shrink-0 rounded-full font-normal whitespace-nowrap"
          aria-label="前往垃圾文件清理"
          title="前往「去重与清理」批量处理疑似广告视频"
          @click="router.push({ name: 'library-cleanup', query: { tab: 'junk' } })"
        >
          去清理
        </button>
      </div>

      <!-- 移动端补充排序切换 -->
      <label class="flex shrink-0 items-center gap-1.5 md:hidden">
        <span class="text-base-content/55 shrink-0 whitespace-nowrap">排序</span>
        <select
          v-model="store.filter.sortBy"
          class="select select-xs select-bordered bg-base-100/70 w-auto min-w-24 rounded-full"
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
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { I, Icon } from '@/icons'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import {
  AD_DURATION_MAX_SEC,
  AD_DURATION_MIN_SEC,
  AD_SIZE_MAX_MB,
  AD_SIZE_MIN_MB,
  clampAdMaxDurationSec,
  clampAdMaxSizeMB,
} from '@/utils/mediaIndex'

defineProps<{
  visible: boolean
}>()

const router = useRouter()
const store = useMediaLibraryStore()

const adDurationDraft = ref(store.adFilterOptions.maxDurationSec)
const adSizeDraft = ref(store.adFilterOptions.maxSizeMB)

watch(adDurationDraft, (val) => {
  if (typeof val === 'number' && Number.isFinite(val) && val >= AD_DURATION_MIN_SEC && val <= AD_DURATION_MAX_SEC)
    store.adMaxDurationSec = Math.round(val)
})

watch(adSizeDraft, (val) => {
  if (typeof val === 'number' && Number.isFinite(val) && val >= AD_SIZE_MIN_MB && val <= AD_SIZE_MAX_MB)
    store.adMaxSizeMB = Math.round(val)
})

watch(() => store.adMaxDurationSec, (val) => {
  const clamped = clampAdMaxDurationSec(val)
  if (adDurationDraft.value !== clamped)
    adDurationDraft.value = clamped
})

watch(() => store.adMaxSizeMB, (val) => {
  const clamped = clampAdMaxSizeMB(val)
  if (adSizeDraft.value !== clamped)
    adSizeDraft.value = clamped
})

function commitDurationDraft() {
  const next = clampAdMaxDurationSec(adDurationDraft.value, store.adFilterOptions.maxDurationSec)
  store.commitAdThresholds({ maxDurationSec: next })
  adDurationDraft.value = next
}

function commitSizeDraft() {
  const next = clampAdMaxSizeMB(adSizeDraft.value, store.adFilterOptions.maxSizeMB)
  store.commitAdThresholds({ maxSizeMB: next })
  adSizeDraft.value = next
}

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
