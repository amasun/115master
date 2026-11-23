<template>
  <div class="flex min-h-0 flex-1 flex-col pt-5">
    <!-- 顶部品牌 -->
    <div class="flex items-center justify-between px-1 pb-3">
      <RouterLink
        to="/library"
        class="flex items-center gap-2 no-underline"
      >
        <LogoWordmark role="img" aria-label="115Master" class="text-base-content h-7 w-auto" />
        <span class="badge badge-primary badge-soft badge-xs font-medium">影视库</span>
      </RouterLink>
    </div>

    <div class="bg-base-content/5 mb-2.5 h-px w-full shrink-0" />

    <!-- 离线下载主入口 -->
    <Button
      color="primary"
      size="sm"
      class="mb-2.5 shrink-0 gap-2 rounded-full"
      @click="openCloudDownload"
    >
      <Icon :name="I.ADD_LINK" class="text-lg" />
      <span>离线下载</span>
    </Button>

    <!-- 主导航菜单 -->
    <ul class="flex shrink-0 flex-col gap-0.5">
      <li>
        <button
          type="button"
          class="flex h-9 w-full items-center justify-between rounded-full border border-transparent px-3.5 text-sm transition-colors"
          :class="isAllWorksActive
            ? 'bg-base-content/8 border-base-content/5 text-base-content font-medium'
            : 'hover:bg-base-content/5 text-base-content/75'"
          @click="selectAllWorks"
        >
          <span class="flex items-center gap-2.5">
            <Icon :name="I.LIBRARY" class="text-lg" />
            <span>全部作品</span>
          </span>
          <span class="text-base-content/45 text-xs tabular-nums">{{ store.entries.length }}</span>
        </button>
      </li>
      <li>
        <button
          type="button"
          class="flex h-9 w-full items-center justify-between rounded-full border border-transparent px-3.5 text-sm transition-colors"
          :class="isRecentActive
            ? 'bg-base-content/8 border-base-content/5 text-base-content font-medium'
            : 'hover:bg-base-content/5 text-base-content/75'"
          @click="selectView('recent')"
        >
          <span class="flex items-center gap-2.5">
            <Icon :name="I.HISTORY" class="text-lg" />
            <span>最近入库</span>
          </span>
        </button>
      </li>
      <li>
        <button
          type="button"
          class="flex h-9 w-full items-center justify-between rounded-full border border-transparent px-3.5 text-sm transition-colors"
          :class="isStarredActive
            ? 'bg-base-content/8 border-base-content/5 text-base-content font-medium'
            : 'hover:bg-base-content/5 text-base-content/75'"
          @click="selectView('starred')"
        >
          <span class="flex items-center gap-2.5">
            <Icon :name="I.STAR" class="text-lg" />
            <span>星标收藏</span>
          </span>
          <span class="text-base-content/45 text-xs tabular-nums">{{ store.starredCount }}</span>
        </button>
      </li>
      <li>
        <button
          type="button"
          class="flex h-9 w-full items-center justify-between rounded-full border border-transparent px-3.5 text-sm transition-colors"
          :class="isMarkedActive
            ? 'bg-base-content/8 border-base-content/5 text-base-content font-medium'
            : 'hover:bg-base-content/5 text-base-content/75'"
          @click="selectView('marked')"
        >
          <span class="flex items-center gap-2.5">
            <Icon :name="I.MARKER" class="text-lg" />
            <span>有打点</span>
          </span>
          <span class="text-base-content/45 text-xs tabular-nums">{{ store.markedCount }}</span>
        </button>
      </li>
      <li>
        <button
          type="button"
          class="flex h-9 w-full items-center justify-between rounded-full border border-transparent px-3.5 text-sm transition-colors"
          :class="isActorsActive
            ? 'bg-base-content/8 border-base-content/5 text-base-content font-medium'
            : 'hover:bg-base-content/5 text-base-content/75'"
          @click="openActorsWall"
        >
          <span class="flex items-center gap-2.5">
            <Icon :name="I.PEOPLE" class="text-lg" />
            <span>演员</span>
          </span>
          <span class="text-base-content/45 text-xs tabular-nums">{{ store.libraryIndex.actors.length }}</span>
        </button>
      </li>
      <li>
        <button
          type="button"
          class="flex h-9 w-full items-center justify-between rounded-full border border-transparent px-3.5 text-sm transition-colors"
          :class="isTagsActive
            ? 'bg-base-content/8 border-base-content/5 text-base-content font-medium'
            : 'hover:bg-base-content/5 text-base-content/75'"
          @click="openTagsPage"
        >
          <span class="flex items-center gap-2.5">
            <Icon :name="I.TAG" class="text-lg" />
            <span>标签管理</span>
          </span>
        </button>
      </li>
    </ul>

    <div class="mt-auto pt-3">
      <div class="bg-base-content/5 mb-2 h-px w-full shrink-0" />

      <!-- 底部同步与刮削统计 -->
      <div class="mb-2 flex shrink-0 flex-col gap-1">
        <div
          class="text-base-content/60 flex items-center justify-between px-1 text-[11px]"
          :title="`已刮削 ${store.scrapedCount} / ${store.entries.length}，待刮削 ${store.bgScrapePendingCount}，负缓存跳过 ${store.missedScrapeCount}`"
        >
          <span>已刮削 {{ store.scrapedCount }} / {{ store.entries.length }}</span>
          <span v-if="store.bgScrapeState === 'circuit_open'" class="text-warning">
            已熔断暂停
          </span>
          <span v-else-if="store.scrapingCount > 0" class="text-primary">
            刮削中 {{ store.scrapingCount }}
          </span>
        </div>

        <!-- 后台低速刮削控制 -->
        <div v-if="store.bgScrapePendingCount > 0 || store.bgScrapeState === 'running' || store.bgScrapeState === 'circuit_open'" class="flex items-center gap-1">
          <Button
            v-if="store.bgScrapeState === 'running'"
            variant="ghost"
            size="sm"
            class="hover:bg-base-content/5 text-primary min-w-0 flex-1 justify-start gap-2 rounded-xl px-2.5 text-xs font-normal"
            title="低速单并发后台刮削中（视口优先插队），点击暂停"
            @click="store.pauseBackgroundScrape()"
          >
            <Icon :name="I.PAUSE" class="shrink-0 text-base" />
            <span class="truncate tabular-nums">暂停刮削 (余 {{ store.bgScrapePendingCount }})</span>
          </Button>
          <Button
            v-else
            variant="ghost"
            size="sm"
            class="hover:bg-base-content/5 min-w-0 flex-1 justify-start gap-2 rounded-xl px-2.5 text-xs font-normal"
            :class="store.bgScrapeState === 'circuit_open' ? 'text-warning' : ''"
            :title="store.bgScrapeReason || '低速单并发后台刮削（1.5-3s 随机间隔，遇限流自动熔断，视口优先）'"
            @click="store.startBackgroundScrape()"
          >
            <Icon :name="I.PLAY" class="shrink-0 text-base" />
            <span class="truncate tabular-nums">
              {{ store.bgScrapeState === 'paused' || store.bgScrapeState === 'circuit_open' ? `继续刮削 (${store.bgScrapePendingCount})` : `后台刮削 (${store.bgScrapePendingCount})` }}
            </span>
          </Button>
        </div>

        <p
          v-if="store.bgScrapeState === 'circuit_open' && store.bgScrapeReason"
          class="text-warning/85 line-clamp-2 px-1 text-[10px] leading-snug"
          :title="store.bgScrapeReason"
        >
          {{ store.bgScrapeReason }}
        </p>

        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            class="hover:bg-base-content/5 min-w-0 flex-1 justify-start gap-2 rounded-xl px-2.5 text-xs font-normal"
            :disabled="store.indexing"
            @click="store.syncIndex('incremental')"
          >
            <Icon :name="I.RESTART" class="shrink-0 text-base" :class="store.indexing && 'animate-spin'" />
            <span v-if="store.indexing" class="truncate tabular-nums">
              同步 {{ store.indexProgress.fetched }}/{{ store.indexProgress.total || '...' }}
            </span>
            <span v-else class="truncate">增量同步索引</span>
          </Button>
          <Button
            variant="ghost"
            size="xs"
            class="hover:bg-base-content/5 text-base-content/65 hover:text-base-content shrink-0 rounded-xl px-2 font-normal"
            title="全量重建索引（穿透全部目录并补全 SHA1 / 标签）"
            :disabled="store.indexing"
            @click="store.syncIndex('full')"
          >
            全量
          </Button>
        </div>
      </div>

      <!-- 网盘容量空间条 -->
      <div
        v-show="spaceInfo.state?.state === true"
        class="mb-2 flex shrink-0 flex-col gap-1 px-1"
      >
        <div class="text-base-content/55 flex items-baseline justify-between text-[11px] tabular-nums">
          <span class="text-base-content/80 font-medium">
            {{ format.fileSize(spaceInfo?.state?.data?.space_info?.all_use?.size ?? 0) }}
          </span>
          <span>{{ format.fileSize(spaceInfo?.state?.data?.space_info?.all_total?.size ?? 0) }}</span>
        </div>
        <progress
          class="progress progress-xs progress-primary w-full"
          :max="100"
          :value="spacePercent"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LibraryView } from '@/utils/mediaIndex'
import { Button } from '@115master/ui'
import { format } from '@115master/utils'
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import LogoWordmark from '@/assets/logo-wordmark-inline.svg?component'
import { useCloudDownloadAction } from '@/hooks/useDriveAction/useCloudDownloadAction'
import { I, Icon } from '@/icons'
import { useDriveSpaceInfoStore } from '@/store/driveSpaceInfo'
import { useMediaLibraryStore } from '@/store/mediaLibrary'

const route = useRoute()
const router = useRouter()
const store = useMediaLibraryStore()
const spaceInfo = useDriveSpaceInfoStore()
const cloudAction = useCloudDownloadAction()

const spacePercent = computed(() => {
  const allUse = spaceInfo?.state?.data?.space_info?.all_use?.size ?? 0
  const allTotal = spaceInfo?.state?.data?.space_info?.all_total?.size ?? 1
  return Number((allUse / allTotal * 100).toFixed(2))
})

const isWallRoute = computed(() => route.name === 'library')
const isActorsActive = computed(() => route.name === 'library-actors')
const isTagsActive = computed(() => route.name === 'library-tags')
const isAllWorksActive = computed(() =>
  isWallRoute.value && store.filter.view === 'all' && !store.filter.actor && !store.filter.genre && !store.filter.driveLabel,
)
const isRecentActive = computed(() => isWallRoute.value && store.filter.view === 'recent')
const isStarredActive = computed(() => isWallRoute.value && store.filter.view === 'starred')
const isMarkedActive = computed(() => isWallRoute.value && store.filter.view === 'marked')

function ensureLibraryWall() {
  if (route.name !== 'library') {
    store.scrollTop = 0
    void router.push({ name: 'library' })
  }
}

function selectAllWorks() {
  store.setView('all')
  store.selectActor(undefined)
  store.selectGenre(undefined)
  store.selectDriveLabel(undefined)
  ensureLibraryWall()
}

function selectView(view: LibraryView) {
  store.setView(view)
  ensureLibraryWall()
}

function openActorsWall() {
  if (route.name !== 'library-actors')
    void router.push({ name: 'library-actors' })
}

function openTagsPage() {
  if (route.name !== 'library-tags')
    void router.push({ name: 'library-tags' })
}

async function openCloudDownload() {
  await cloudAction.cloudDownload()
}
</script>
