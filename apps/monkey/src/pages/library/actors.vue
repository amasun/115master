<template>
  <div class="relative min-h-[60vh] w-full px-(--main-content-gutter) pb-16">
    <!-- 顶部统计与排序 -->
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="text-base-content/65 flex flex-wrap items-center gap-2 text-xs">
        <span>
          共 <strong class="text-base-content tabular-nums">{{ sortedActors.length }}</strong> 位演员
          <template v-if="hasKeyword && sortedActors.length !== totalActors">
            （全部 {{ totalActors }} 位）
          </template>
        </span>
        <span class="text-base-content/35">·</span>
        <span>点击演员查看名下作品</span>
      </div>

      <div class="bg-base-200/70 border-base-content/8 inline-flex items-center gap-1 rounded-full border p-1">
        <button
          v-for="option in sortOptions"
          :key="option.value"
          type="button"
          class="rounded-full px-3 py-1 text-xs transition-colors"
          :class="sortBy === option.value
            ? 'bg-primary text-primary-content font-medium shadow-xs'
            : 'text-base-content/70 hover:text-base-content'"
          @click="sortBy = option.value"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <!-- 加载态 -->
    <div
      v-if="(store.initializing || store.indexing) && totalActors === 0"
      class="text-base-content/65 flex min-h-[50vh] flex-col items-center justify-center gap-3"
    >
      <Icon :name="I.LOADING" class="text-primary animate-spin text-3xl" />
      <p class="text-sm font-medium">
        正在汇总演员索引...
      </p>
    </div>

    <!-- 空状态 -->
    <div
      v-else-if="sortedActors.length === 0"
      class="flex min-h-[50vh] flex-col items-center justify-center gap-3"
    >
      <Empty
        :description="hasKeyword ? '未找到匹配的演员' : '暂无已关联演员信息'"
        size="lg"
      />
      <Button
        v-if="hasKeyword"
        variant="soft"
        size="sm"
        class="rounded-full"
        @click="store.filter.keyword = ''"
      >
        清空搜索词
      </Button>
      <Button
        v-else
        variant="soft"
        size="sm"
        class="rounded-full"
        @click="router.push({ name: 'library' })"
      >
        返回作品海报墙
      </Button>
    </div>

    <!-- 演员头像图片墙 -->
    <div
      v-else
      class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    >
      <button
        v-for="actor in sortedActors"
        :key="actor.key"
        type="button"
        class="group bg-base-200/45 border-base-content/8 hover:border-primary/45 hover:bg-base-200/75 flex flex-col overflow-hidden rounded-2xl border text-left transition-all duration-200"
        @click="openActorWorks(actor.name)"
      >
        <div class="bg-base-300/60 relative aspect-[3/4] w-full shrink-0 overflow-hidden">
          <img
            v-if="getActorAvatar(actor) && !failedAvatars.has(actor.key)"
            :src="getActorAvatar(actor)"
            :alt="actor.name"
            loading="lazy"
            referrerpolicy="no-referrer"
            class="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
            @error="markAvatarFailed(actor.key)"
          >
          <div
            v-else
            class="from-base-content/10 via-base-300/80 to-base-content/5 text-base-content/45 flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-br"
          >
            <span class="bg-base-content/10 text-base-content/75 flex size-16 items-center justify-center rounded-full text-2xl font-semibold">
              {{ actor.name.slice(0, 1) }}
            </span>
          </div>

          <!-- 右上角：作品数 -->
          <span class="pointer-events-none absolute top-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white tabular-nums backdrop-blur-xs">
            {{ actor.count }} 部
          </span>

          <!-- 左上角：有打点作品数 -->
          <span
            v-if="actor.markedCount > 0"
            title="有打点的作品数"
            class="badge badge-secondary badge-xs pointer-events-none absolute top-2 left-2 gap-0.5 rounded-full px-1.5 py-2 text-[11px] shadow-xs"
          >
            <Icon :name="I.MARKER" class="text-[11px]" />
            <span>{{ actor.markedCount }}</span>
          </span>
        </div>

        <div class="flex flex-col gap-1 p-3">
          <h3
            :title="actor.name"
            class="text-base-content truncate text-sm leading-snug font-semibold"
          >
            {{ actor.name }}
          </h3>
          <div class="text-base-content/55 flex items-center justify-between gap-2 text-[11px] tabular-nums">
            <span>{{ actor.count }} 部作品</span>
            <span>{{ format.fileSize(actor.totalSize) }}</span>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ActorFacetStat } from '@/utils/mediaIndex'
import { Button, Empty } from '@115master/ui'
import { format } from '@115master/utils'
import { useStorage, useTitle } from '@vueuse/core'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { I, Icon } from '@/icons'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { normalizeActressName } from '@/utils/actressNameMatcher'

useTitle('演员 · 影视库 · 115Master Fusion')

type ActorSortBy = 'count' | 'recent' | 'name'

const sortOptions: Array<{ value: ActorSortBy, label: string }> = [
  { value: 'count', label: '按作品数' },
  { value: 'recent', label: '按最近入库' },
  { value: 'name', label: '按姓名' },
]

const router = useRouter()
const store = useMediaLibraryStore()
const sortBy = useStorage<ActorSortBy>('115Master_library_actors_sort', 'count')
const failedAvatars = ref(new Set<string>())

const totalActors = computed(() => store.libraryIndex.actorStats.length)
const hasKeyword = computed(() => Boolean(store.filter.keyword.trim()))

function matchesActorSearch(actor: ActorFacetStat, rawKeyword: string, normalizedKeyword: string): boolean {
  const candidates = [actor.name, ...actor.aliases]
  return candidates.some((name) => {
    if (name.toLowerCase().includes(rawKeyword))
      return true
    return Boolean(normalizedKeyword) && normalizeActressName(name).includes(normalizedKeyword)
  })
}

const sortedActors = computed(() => {
  const keyword = store.filter.keyword.trim().toLowerCase()
  const normalizedKeyword = normalizeActressName(store.filter.keyword)
  const list = keyword
    ? store.libraryIndex.actorStats.filter(actor => matchesActorSearch(actor, keyword, normalizedKeyword))
    : [...store.libraryIndex.actorStats]

  if (sortBy.value === 'recent')
    return list.sort((a, b) => b.latestMtime - a.latestMtime || b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'))
  if (sortBy.value === 'name')
    return list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  return list.sort((a, b) => b.count - a.count || b.latestMtime - a.latestMtime || a.name.localeCompare(b.name, 'zh-CN'))
})

function getActorAvatar(actor: ActorFacetStat): string {
  return store.actorAvatars[actor.name] || actor.avatarUrl || ''
}

function markAvatarFailed(key: string) {
  failedAvatars.value = new Set([...failedAvatars.value, key])
}

function openActorWorks(name: string) {
  store.setActorFilter(name)
  store.filter.keyword = ''
  store.scrollTop = 0
  void router.push({ name: 'library' })
}
</script>
