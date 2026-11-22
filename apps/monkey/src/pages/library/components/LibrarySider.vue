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

    <!-- 上半区：固定主导航 -->
    <ul class="flex shrink-0 flex-col gap-0.5">
      <li>
        <button
          type="button"
          class="flex h-9 w-full items-center justify-between rounded-full border border-transparent px-3.5 text-sm transition-colors"
          :class="store.filter.view === 'all' && !store.filter.actor && !store.filter.genre
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
          :class="store.filter.view === 'recent'
            ? 'bg-base-content/8 border-base-content/5 text-base-content font-medium'
            : 'hover:bg-base-content/5 text-base-content/75'"
          @click="store.setView('recent')"
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
          :class="store.filter.view === 'marked'
            ? 'bg-base-content/8 border-base-content/5 text-base-content font-medium'
            : 'hover:bg-base-content/5 text-base-content/75'"
          @click="store.setView('marked')"
        >
          <span class="flex items-center gap-2.5">
            <Icon :name="I.MARKER" class="text-lg" />
            <span>有打点</span>
          </span>
          <span class="text-base-content/45 text-xs tabular-nums">{{ store.markedCount }}</span>
        </button>
      </li>
    </ul>

    <div class="bg-base-content/5 my-2.5 h-px w-full shrink-0" />

    <!-- 下半区：演员 / 题材联动索引 -->
    <div class="flex min-h-0 flex-1 flex-col gap-2">
      <div class="bg-base-content/5 grid shrink-0 grid-cols-2 gap-1 rounded-full p-0.5">
        <button
          type="button"
          class="flex h-7 items-center justify-center gap-1.5 rounded-full text-xs transition-colors"
          :class="store.siderTab === 'actors'
            ? 'bg-base-100 text-base-content font-medium shadow-xs'
            : 'text-base-content/65 hover:text-base-content'"
          @click="store.siderTab = 'actors'"
        >
          <Icon :name="I.PEOPLE" class="text-sm" />
          <span>演员</span>
          <span class="text-base-content/40 tabular-nums">{{ store.libraryIndex.actors.length }}</span>
        </button>
        <button
          type="button"
          class="flex h-7 items-center justify-center gap-1.5 rounded-full text-xs transition-colors"
          :class="store.siderTab === 'genres'
            ? 'bg-base-100 text-base-content font-medium shadow-xs'
            : 'text-base-content/65 hover:text-base-content'"
          @click="store.siderTab = 'genres'"
        >
          <Icon :name="I.TAG" class="text-sm" />
          <span>题材</span>
          <span class="text-base-content/40 tabular-nums">{{ store.libraryIndex.genres.length }}</span>
        </button>
      </div>

      <!-- 迷你过滤框 -->
      <label class="input input-xs input-bordered bg-base-content/4 flex w-full shrink-0 items-center gap-1.5 rounded-full px-2.5">
        <Icon :name="I.SEARCH" class="text-base-content/45 text-sm" />
        <input
          v-model="facetKeyword"
          type="text"
          class="grow bg-transparent text-xs outline-none"
          :placeholder="store.siderTab === 'actors' ? '过滤演员...' : '过滤题材...'"
        >
        <button
          v-if="facetKeyword"
          type="button"
          class="text-base-content/45 hover:text-base-content"
          @click="facetKeyword = ''"
        >
          <Icon :name="I.CLOSE" class="text-xs" />
        </button>
      </label>

      <!-- 可滚动索引列表 -->
      <div
        class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-0.5" :class="[
          ...scrollbar('xs'),
        ]"
      >
        <template v-if="store.siderTab === 'actors'">
          <button
            v-for="actor in visibleActors"
            :key="actor.name"
            type="button"
            class="flex h-8 w-full shrink-0 items-center justify-between gap-2 rounded-xl px-2 text-left text-xs transition-colors"
            :class="store.filter.actor === actor.name
              ? 'bg-primary/15 text-primary font-medium'
              : 'hover:bg-base-content/5 text-base-content/80'"
            @click="store.selectActor(actor.name)"
          >
            <span class="flex min-w-0 items-center gap-2">
              <img
                v-if="store.actorAvatars[actor.name] && !failedAvatars.has(actor.name)"
                :src="store.actorAvatars[actor.name]"
                :alt="actor.name"
                loading="lazy"
                referrerpolicy="no-referrer"
                class="size-5 shrink-0 rounded-full object-cover"
                @error="markAvatarFailed(actor.name)"
              >
              <span
                v-else
                class="bg-base-content/10 text-base-content/60 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium"
              >
                {{ actor.name.slice(0, 1) }}
              </span>
              <span class="truncate">{{ actor.name }}</span>
            </span>
            <span class="text-base-content/45 shrink-0 tabular-nums">{{ actor.count }}</span>
          </button>
          <button
            v-if="hasMoreActors"
            type="button"
            class="btn btn-ghost btn-xs text-base-content/60 mt-1 shrink-0"
            @click="actorLimit += 120"
          >
            显示更多（{{ filteredActors.length - visibleActors.length }}）
          </button>
          <p v-if="filteredActors.length === 0" class="text-base-content/45 py-4 text-center text-xs">
            暂无已刮削演员
          </p>
        </template>

        <template v-else>
          <button
            v-for="genre in visibleGenres"
            :key="genre.name"
            type="button"
            class="flex h-8 w-full shrink-0 items-center justify-between gap-2 rounded-xl px-2.5 text-left text-xs transition-colors"
            :class="store.filter.genre === genre.name
              ? 'bg-primary/15 text-primary font-medium'
              : 'hover:bg-base-content/5 text-base-content/80'"
            @click="store.selectGenre(genre.name)"
          >
            <span class="truncate">{{ genre.name }}</span>
            <span class="text-base-content/45 shrink-0 tabular-nums">{{ genre.count }}</span>
          </button>
          <button
            v-if="hasMoreGenres"
            type="button"
            class="btn btn-ghost btn-xs text-base-content/60 mt-1 shrink-0"
            @click="genreLimit += 120"
          >
            显示更多（{{ filteredGenres.length - visibleGenres.length }}）
          </button>
          <p v-if="filteredGenres.length === 0" class="text-base-content/45 py-4 text-center text-xs">
            暂无题材标签
          </p>
        </template>
      </div>
    </div>

    <div class="bg-base-content/5 my-2 h-px w-full shrink-0" />

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
</template>

<script setup lang="ts">
import { Button, scrollbar } from '@115master/ui'
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import LogoWordmark from '@/assets/logo-wordmark-inline.svg?component'
import { I, Icon } from '@/icons'
import { useMediaLibraryStore } from '@/store/mediaLibrary'

const store = useMediaLibraryStore()
const facetKeyword = shallowRef('')
const actorLimit = shallowRef(120)
const genreLimit = shallowRef(120)
const failedAvatars = ref(new Set<string>())

watch(() => store.siderTab, () => {
  facetKeyword.value = ''
})

function markAvatarFailed(name: string) {
  failedAvatars.value = new Set([...failedAvatars.value, name])
}

function selectAllWorks() {
  store.setView('all')
  store.selectActor(undefined)
  store.selectGenre(undefined)
}

const filteredActors = computed(() => {
  const kw = facetKeyword.value.trim().toLowerCase()
  const list = store.libraryIndex.actors
  return kw ? list.filter(item => item.name.toLowerCase().includes(kw)) : list
})

const filteredGenres = computed(() => {
  const kw = facetKeyword.value.trim().toLowerCase()
  const list = store.libraryIndex.genres
  return kw ? list.filter(item => item.name.toLowerCase().includes(kw)) : list
})

const visibleActors = computed(() => filteredActors.value.slice(0, actorLimit.value))
const visibleGenres = computed(() => filteredGenres.value.slice(0, genreLimit.value))
const hasMoreActors = computed(() => filteredActors.value.length > visibleActors.value.length)
const hasMoreGenres = computed(() => filteredGenres.value.length > visibleGenres.value.length)
</script>
