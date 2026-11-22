<template>
  <div class="flex min-h-0 flex-1 flex-col pt-5">
    <!-- 顶部品牌与返回网盘 -->
    <div class="flex items-center justify-between px-1 pb-3">
      <RouterLink
        to="/library"
        class="flex items-center gap-2 no-underline"
      >
        <LogoWordmark role="img" aria-label="115Master" class="text-base-content h-7 w-auto" />
        <span class="badge badge-primary badge-soft badge-xs font-medium">影视库</span>
      </RouterLink>
      <RouterLink
        to="/drive"
        class="btn btn-ghost btn-xs gap-1 rounded-full px-2.5 text-xs font-normal"
        title="返回文件管理"
      >
        <Icon :name="I.BACK_DIR" class="text-sm" />
        <span>网盘</span>
      </RouterLink>
    </div>

    <div class="bg-base-content/5 mb-2.5 h-px w-full shrink-0" />

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
    </ul>

    <div class="mt-auto pt-3">
      <div class="bg-base-content/5 mb-2 h-px w-full shrink-0" />

      <!-- 底部同步与刮削统计 -->
      <div class="mb-1 flex shrink-0 flex-col gap-1">
        <div class="text-base-content/60 flex items-center justify-between px-1 text-[11px]">
          <span>已刮削 {{ store.scrapedCount }} / {{ store.entries.length }}</span>
          <span v-if="store.scrapingCount > 0" class="text-primary">
            刮削中 {{ store.scrapingCount }}
          </span>
        </div>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LibraryView } from '@/utils/mediaIndex'
import { Button } from '@115master/ui'
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import LogoWordmark from '@/assets/logo-wordmark-inline.svg?component'
import { I, Icon } from '@/icons'
import { useMediaLibraryStore } from '@/store/mediaLibrary'

const route = useRoute()
const router = useRouter()
const store = useMediaLibraryStore()

const isWallRoute = computed(() => route.name === 'library')
const isActorsActive = computed(() => route.name === 'library-actors')
const isAllWorksActive = computed(() =>
  isWallRoute.value && store.filter.view === 'all' && !store.filter.actor && !store.filter.genre,
)
const isRecentActive = computed(() => isWallRoute.value && store.filter.view === 'recent')
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
</script>
