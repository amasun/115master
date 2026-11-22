<template>
  <div class="flex max-h-[72vh] flex-col gap-3">
    <!-- 搜索框与演员反查入口 -->
    <div class="relative flex items-center gap-2">
      <div class="relative flex flex-1 items-center">
        <Icon
          :name="I.SEARCH"
          class="text-base-content/50 pointer-events-none absolute left-3.5 text-lg"
        />
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          placeholder="输入演员名、番号、标签、导演、年份或文件名关键词…"
          class="input input-bordered bg-base-200/50 focus:bg-base-100 w-full rounded-xl pr-9 pl-10 text-sm"
          @focus="onInputFocus"
          @blur="onInputBlur"
          @input="onInputChange"
          @keydown="handleInputKeydown"
        >
        <button
          v-if="query"
          type="button"
          class="btn btn-ghost btn-xs btn-circle absolute right-2"
          title="清空"
          aria-label="清空搜索词"
          @click="clearQuery"
        >
          <Icon :name="I.CLOSE" class="text-sm" />
        </button>

        <!-- 演员头像候选下拉 -->
        <div
          v-if="dropdownVisible"
          class="bg-base-100 border-base-content/15 absolute top-full right-0 left-0 z-30 mt-1.5 overflow-hidden rounded-xl border shadow-lg"
        >
          <div class="text-base-content/50 border-base-content/10 border-b px-3 py-1.5 text-[11px]">
            演员候选联想（选择或回车直接反查全部作品）
          </div>
          <ul class="max-h-60 overflow-y-auto py-1">
            <li
              v-for="(item, index) in suggestions"
              :key="item.name"
            >
              <button
                type="button"
                class="hover:bg-base-200/75 flex w-full items-center justify-between gap-2.5 px-3 py-1.5 text-left text-xs transition-colors"
                :class="{ 'bg-base-200': index === activeSuggestionIndex }"
                @mousedown.prevent="selectSuggestion(item)"
              >
                <span class="flex min-w-0 items-center gap-2.5">
                  <img
                    :src="item.avatarUrl"
                    :alt="item.name"
                    class="bg-base-300 h-6 w-6 shrink-0 rounded-full object-cover"
                    loading="lazy"
                  >
                  <span class="text-base-content truncate font-medium">{{ item.name }}</span>
                </span>
                <span class="text-base-content/45 shrink-0 text-[11px]">
                  反查作品
                </span>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <button
        type="button"
        class="btn btn-sm btn-secondary btn-soft shrink-0 rounded-xl"
        :disabled="!snapshot || !query.trim() || actorLoading"
        title="仅在手动点击或回车时通过 JavBus / JavDB 反查演员全部作品"
        @click="triggerActorLookup(query)"
      >
        <span v-if="actorLoading" class="loading loading-spinner loading-xs" />
        <span>反查演员</span>
      </button>
    </div>

    <!-- 索引状态栏 -->
    <div class="bg-base-200/45 border-base-content/10 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs">
      <div class="text-base-content/75 flex flex-wrap items-center gap-x-3 gap-y-1">
        <template v-if="syncing">
          <span class="loading loading-spinner loading-xs text-primary" />
          <span>
            正在{{ progress?.mode === 'incremental' ? '增量更新' : '全量扫描' }}网盘视频…
            已拉取 {{ progress?.fetched ?? 0 }}
            <template v-if="progress && progress.total > 0"> / {{ progress.total }}</template>
            （第 {{ progress?.pages ?? 0 }} 页）
          </span>
        </template>
        <template v-else-if="snapshot">
          <span>
            已索引 <strong class="text-base-content tabular-nums">{{ snapshot.items.length }}</strong> 个视频
          </span>
          <span class="text-base-content/55">
            识别番号 <strong class="text-base-content/80 tabular-nums">{{ avCount }}</strong> 部
          </span>
          <span class="text-base-content/55">
            本地元数据 <strong class="text-base-content/80 tabular-nums">{{ javMap.size }}</strong> 部
          </span>
          <span class="text-base-content/45">
            更新于 {{ lastSyncLabel }}
          </span>
        </template>
        <template v-else>
          <span class="text-base-content/65">尚未建立本地网盘视频索引（仅扫描视频，自动忽略其他文件）</span>
        </template>
      </div>

      <div class="flex items-center gap-1.5">
        <template v-if="syncing">
          <button
            type="button"
            class="btn btn-xs btn-outline btn-error rounded-lg"
            @click="cancelSync"
          >
            取消
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            class="btn btn-xs btn-primary rounded-lg"
            @click="startSync(snapshot ? 'incremental' : 'full')"
          >
            <Icon :name="I.RESTART" class="text-xs" />
            <span>{{ snapshot ? '增量更新' : '建立索引' }}</span>
          </button>
          <button
            v-if="snapshot"
            type="button"
            class="btn btn-xs btn-ghost rounded-lg"
            title="全量重新扫描网盘视频索引"
            @click="startSync('full')"
          >
            全量重建
          </button>
        </template>
      </div>
    </div>

    <!-- 通道 A：在线演员反查状态条 -->
    <div
      v-if="snapshot && (actorLoading || actorEntry)"
      class="bg-secondary/8 border-secondary/20 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs"
    >
      <div class="text-base-content/80 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <template v-if="actorLoading">
          <span class="loading loading-spinner loading-xs text-secondary" />
          <span v-if="actorProgress?.stage === 'searching'">
            正在从 {{ actorProgress.source === 'javbus' ? 'JavBus' : 'JavDB' }} 搜索演员「{{ actorLookupQuery }}」…
          </span>
          <span v-else>
            正在从 {{ actorProgress?.source === 'javdb' ? 'JavDB' : 'JavBus' }} 拉取「{{ actorLookupQuery }}」作品表（第 {{ actorProgress?.page ?? 1 }} / {{ actorProgress?.maxPages ?? 5 }} 页，已收集 {{ actorProgress?.collected ?? 0 }} 部）…
          </span>
        </template>
        <template v-else-if="actorEntry">
          <span class="badge badge-secondary badge-soft badge-xs font-medium">
            {{ actorEntry.source === 'javbus' ? 'JavBus' : 'JavDB' }}
          </span>
          <span>
            演员 <strong class="text-base-content">{{ actorEntry.name }}</strong> 已收录
            <strong class="text-base-content tabular-nums">{{ actorEntry.avNumbers.length }}</strong> 部作品（{{ actorEntry.fetchedPages }} 页）
          </span>
          <span class="text-base-content/60">
            · 网盘命中 <strong class="text-secondary tabular-nums">{{ actorReverseHitCount }}</strong> 部
          </span>
          <span v-if="actorFromCache" class="badge badge-ghost badge-xs text-[11px]">
            7天缓存
          </span>
        </template>
      </div>

      <div class="flex items-center gap-1.5">
        <template v-if="actorLoading">
          <button
            type="button"
            class="btn btn-xs btn-outline btn-error rounded-lg"
            @click="cancelActorLookup"
          >
            取消
          </button>
        </template>
        <template v-else-if="actorEntry">
          <button
            v-if="actorEntry.hasMore && actorEntry.fetchedPages < HARD_MAX_PAGES"
            type="button"
            class="btn btn-xs btn-secondary btn-outline rounded-lg"
            @click="loadMoreActorWorks"
          >
            加载更多
          </button>
          <button
            type="button"
            class="btn btn-xs btn-ghost rounded-lg"
            title="跳过 7 天缓存重新抓取该演员作品"
            @click="triggerActorLookup(actorEntry.name, true)"
          >
            刷新
          </button>
        </template>
      </div>
    </div>

    <!-- 错误提示 -->
    <div
      v-if="errorMessage"
      class="alert alert-error py-2 text-xs"
    >
      <span>{{ errorMessage }}</span>
    </div>

    <!-- 通道 A 警告提示（不遮挡本地通道 B/C 结果） -->
    <div
      v-if="actorError"
      class="alert alert-warning flex items-center justify-between gap-2 py-2 text-xs"
    >
      <span>{{ actorError }}（下方仍显示本地缓存与文件名匹配结果）</span>
      <button
        type="button"
        class="btn btn-ghost btn-xs"
        @click="actorError = ''"
      >
        忽略
      </button>
    </div>

    <!-- 结果区 -->
    <div class="min-h-[260px] flex-1 overflow-y-auto pr-1">
      <!-- 未建索引空态 -->
      <div
        v-if="!snapshot && !syncing"
        class="text-base-content/60 flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center"
      >
        <Icon :name="I.SEARCH" class="text-base-content/25 text-4xl" />
        <div class="space-y-1">
          <p class="text-base-content text-sm font-medium">
            一键建立网盘视频索引
          </p>
          <p class="text-xs leading-relaxed">
            通过 115 跨子目录接口仅拉取视频文件（8,000 部约 3–5 秒），零外部风控，支持按演员、标签、导演、番号和文件名毫秒检索。
          </p>
        </div>
        <button
          type="button"
          class="btn btn-sm btn-primary rounded-xl"
          @click="startSync('full')"
        >
          立即建立索引
        </button>
      </div>

      <!-- 已建索引但未输入关键词 -->
      <div
        v-else-if="!query.trim()"
        class="text-base-content/55 flex h-full min-h-[220px] flex-col items-center justify-center gap-2 text-center text-xs"
      >
        <p>输入关键词开始本地毫秒级检索</p>
        <p class="text-base-content/45">
          快捷键 <kbd class="kbd kbd-xs">Alt</kbd> + <kbd class="kbd kbd-xs">K</kbd> 随时唤起 · 输入演员名后按回车或点击「反查演员」可全盘反查
        </p>
      </div>

      <!-- 无匹配结果 -->
      <div
        v-else-if="results.length === 0"
        class="text-base-content/55 flex h-full min-h-[220px] flex-col items-center justify-center gap-2.5 text-center text-xs"
      >
        <p class="text-base-content/80 text-sm font-medium">
          未找到与「{{ query.trim() }}」匹配的视频
        </p>
        <p v-if="!actorEntry && !actorLoading">
          本地索引与已缓存元数据中暂无匹配；若搜索的是演员名，可点击下方按钮在线反查其作品表。
        </p>
        <p v-else-if="actorEntry">
          已对照 {{ actorEntry.source === 'javbus' ? 'JavBus' : 'JavDB' }} 的 {{ actorEntry.avNumbers.length }} 部作品，当前本地网盘索引暂无命中。
        </p>
        <div class="flex flex-wrap items-center justify-center gap-2">
          <button
            v-if="!actorLoading && !actorEntry"
            type="button"
            class="btn btn-xs btn-secondary rounded-lg"
            @click="triggerActorLookup(query)"
          >
            在线反查「{{ query.trim() }}」
          </button>
          <button
            v-if="actorEntry?.hasMore && actorEntry.fetchedPages < HARD_MAX_PAGES && !actorLoading"
            type="button"
            class="btn btn-xs btn-outline rounded-lg"
            @click="loadMoreActorWorks"
          >
            继续加载更多作品
          </button>
        </div>
      </div>

      <!-- 匹配结果列表 -->
      <div v-else class="flex flex-col gap-2">
        <div class="text-base-content/55 flex items-center justify-between px-1 text-[11px]">
          <span>
            共匹配 <strong class="text-base-content tabular-nums">{{ results.length }}</strong> 个视频
            <template v-if="results.length > MAX_VISIBLE">（当前显示前 {{ MAX_VISIBLE }} 条）</template>
          </span>
        </div>

        <div
          v-for="item in visibleResults"
          :key="item.video.fid"
          class="bg-base-200/35 hover:bg-base-200/75 border-base-content/8 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors"
        >
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <span
                v-if="item.video.avNumber"
                class="badge badge-primary badge-soft badge-xs font-mono font-semibold"
              >
                {{ item.video.avNumber }}
              </span>
              <span
                v-for="reason in item.reasons"
                :key="`${reason.kind}-${reason.label}`"
                class="badge badge-xs text-[11px]"
                :class="reason.kind === 'actorReverse' ? 'badge-secondary badge-soft font-medium' : 'badge-ghost'"
              >
                {{ reason.label }}
              </span>
            </div>

            <div
              class="text-base-content truncate text-sm font-medium"
              :title="item.javInfo?.title || item.video.name"
            >
              {{ item.javInfo?.title || item.video.name }}
            </div>

            <div class="text-base-content/55 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
              <span v-if="item.javInfo?.title" class="max-w-[360px] truncate" :title="item.video.name">
                {{ item.video.name }}
              </span>
              <span v-if="item.video.duration > 0" class="tabular-nums">
                {{ formatDuration(item.video.duration) }}
              </span>
              <span v-if="item.video.size > 0" class="tabular-nums">
                {{ formatSize(item.video.size) }}
              </span>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              class="btn btn-xs btn-primary rounded-lg"
              title="使用 MASTER 播放器播放"
              @click="playVideo(item.video)"
            >
              <Icon :name="I.PLAY" class="text-xs" />
              <span>播放</span>
            </button>
            <button
              type="button"
              class="btn btn-xs btn-ghost rounded-lg"
              title="打开视频所在网盘目录"
              @click="openFolder(item.video)"
            >
              <Icon :name="I.NEW_FOLDER" class="text-xs" />
              <span>目录</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { JavInfo } from '@/utils/jav/jav'
import type {
  ActorFetchProgress,
  ActorReverseMatch,
  ActorSuggestion,
  ActorWorksCacheEntry,
  IndexedVideo,
  IndexProgress,
  VideoIndexSnapshot,
} from '@/utils/superSearch'
import { GM_openInTab } from '$'
import { format } from '@115master/utils'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { MASTER_BASE_URL } from '@/constants'
import { I, Icon } from '@/icons'
import { actressFaceDB } from '@/utils/actressFaceDB'
import { goToPlayer } from '@/utils/route'
import {
  fetchActorWorks,
  HARD_MAX_PAGES,
  loadAllCachedJavInfo,
  loadVideoIndexSnapshot,
  normalizeActorKey,
  searchIndexedVideos,
  syncDriveVideoIndex,
} from '@/utils/superSearch'

const emit = defineEmits<{
  close: []
}>()

const MAX_VISIBLE = 100

const inputRef = ref<HTMLInputElement | null>(null)
const query = ref('')
const snapshot = shallowRef<VideoIndexSnapshot | null>(null)
const javMap = shallowRef<Map<string, JavInfo>>(new Map())
const syncing = ref(false)
const progress = ref<IndexProgress | null>(null)
const errorMessage = ref('')
let abortController: AbortController | null = null

const actressDbReady = ref(false)
const inputFocused = ref(false)
const dropdownDismissed = ref(false)
const activeSuggestionIndex = ref(-1)

const actorLoading = ref(false)
const actorLookupQuery = ref('')
const actorProgress = ref<ActorFetchProgress | null>(null)
const actorEntry = shallowRef<ActorWorksCacheEntry | null>(null)
const actorFromCache = ref(false)
const actorError = ref('')
let actorAbortController: AbortController | null = null
let actorRequestId = 0

const avCount = computed(() =>
  snapshot.value?.items.filter(item => Boolean(item.avNumber)).length ?? 0,
)

const lastSyncLabel = computed(() => {
  if (!snapshot.value?.lastSyncAt)
    return '未知'
  return new Date(snapshot.value.lastSyncAt).toLocaleString()
})

const suggestions = computed<ActorSuggestion[]>(() => {
  if (!actressDbReady.value || query.value.trim().length < 2)
    return []
  return actressFaceDB.searchActresses(query.value, 6)
})

const dropdownVisible = computed(() =>
  inputFocused.value && !dropdownDismissed.value && suggestions.value.length > 0,
)

const actorReverse = computed<ActorReverseMatch | null>(() => {
  if (!actorEntry.value || !query.value.trim())
    return null
  return {
    actorName: actorEntry.value.name,
    source: actorEntry.value.source,
    avNumbers: new Set(actorEntry.value.avNumbers),
  }
})

const results = computed(() => {
  if (!snapshot.value || !query.value.trim())
    return []
  return searchIndexedVideos(query.value, snapshot.value.items, javMap.value, {
    actorReverse: actorReverse.value,
  })
})

const actorReverseHitCount = computed(() =>
  results.value.filter(item => item.reasons.some(reason => reason.kind === 'actorReverse')).length,
)

const visibleResults = computed(() => results.value.slice(0, MAX_VISIBLE))

function formatSize(bytes: number): string {
  return format.fileSize(bytes)
}

function formatDuration(seconds: number): string {
  return format.duration(seconds)
}

function matchesActiveActor(nextQuery: string): boolean {
  const trimmed = nextQuery.trim()
  if (!trimmed)
    return false
  const nextKey = normalizeActorKey(trimmed)
  if (!nextKey)
    return false
  if (actorLookupQuery.value && normalizeActorKey(actorLookupQuery.value) === nextKey)
    return true
  if (!actorEntry.value)
    return false
  return actorEntry.value.actorKey === nextKey
    || normalizeActorKey(actorEntry.value.name) === nextKey
    || actorEntry.value.aliases.some(alias => normalizeActorKey(alias) === nextKey)
}

function clearActorState() {
  actorAbortController?.abort()
  actorAbortController = null
  actorRequestId += 1
  actorLoading.value = false
  actorProgress.value = null
  actorEntry.value = null
  actorFromCache.value = false
  actorError.value = ''
  actorLookupQuery.value = ''
}

watch(query, (nextQuery) => {
  activeSuggestionIndex.value = -1
  if (!matchesActiveActor(nextQuery))
    clearActorState()
})

function onInputFocus() {
  inputFocused.value = true
  dropdownDismissed.value = false
}

function onInputBlur() {
  inputFocused.value = false
  activeSuggestionIndex.value = -1
}

function onInputChange() {
  dropdownDismissed.value = false
}

function clearQuery() {
  query.value = ''
  dropdownDismissed.value = false
  activeSuggestionIndex.value = -1
  inputRef.value?.focus()
}

function selectSuggestion(item: ActorSuggestion) {
  actorLookupQuery.value = item.name
  query.value = item.name
  dropdownDismissed.value = true
  activeSuggestionIndex.value = -1
  void triggerActorLookup(item.name)
}

function handleInputKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' && dropdownVisible.value) {
    event.preventDefault()
    activeSuggestionIndex.value = (activeSuggestionIndex.value + 1) % suggestions.value.length
    return
  }

  if (event.key === 'ArrowUp' && dropdownVisible.value) {
    event.preventDefault()
    const total = suggestions.value.length
    activeSuggestionIndex.value = activeSuggestionIndex.value <= 0
      ? total - 1
      : activeSuggestionIndex.value - 1
    return
  }

  if (event.key === 'Escape' && dropdownVisible.value) {
    event.preventDefault()
    event.stopPropagation()
    dropdownDismissed.value = true
    activeSuggestionIndex.value = -1
    return
  }

  if (event.key === 'Enter') {
    if (dropdownVisible.value && activeSuggestionIndex.value >= 0) {
      const selected = suggestions.value[activeSuggestionIndex.value]
      if (selected) {
        event.preventDefault()
        selectSuggestion(selected)
        return
      }
    }
    if (snapshot.value && query.value.trim()) {
      event.preventDefault()
      dropdownDismissed.value = true
      void triggerActorLookup(query.value)
    }
  }
}

async function triggerActorLookup(rawName: string, forceRefresh = false) {
  const targetName = rawName.trim()
  if (!targetName || !snapshot.value)
    return

  actorAbortController?.abort()
  const controller = new AbortController()
  actorAbortController = controller
  const requestId = ++actorRequestId

  actorLookupQuery.value = targetName
  actorLoading.value = true
  actorError.value = ''
  actorProgress.value = {
    source: 'javbus',
    page: 0,
    maxPages: 5,
    collected: 0,
    stage: 'searching',
  }

  try {
    const result = await fetchActorWorks(targetName, {
      forceRefresh,
      signal: controller.signal,
      onProgress: (nextProgress) => {
        if (requestId === actorRequestId)
          actorProgress.value = nextProgress
      },
    })
    if (requestId !== actorRequestId)
      return
    actorEntry.value = result.entry
    actorFromCache.value = result.fromCache
  }
  catch (error) {
    if (requestId !== actorRequestId)
      return
    if (error instanceof DOMException && error.name === 'AbortError')
      return
    actorError.value = error instanceof Error ? error.message : '演员作品在线反查失败'
  }
  finally {
    if (requestId === actorRequestId) {
      actorLoading.value = false
      actorProgress.value = null
      actorAbortController = null
    }
  }
}

async function loadMoreActorWorks() {
  const existing = actorEntry.value
  if (!existing || actorLoading.value)
    return

  actorAbortController?.abort()
  const controller = new AbortController()
  actorAbortController = controller
  const requestId = ++actorRequestId

  actorLookupQuery.value = existing.name
  actorLoading.value = true
  actorError.value = ''
  actorProgress.value = {
    source: existing.source,
    page: existing.fetchedPages + 1,
    maxPages: Math.min(existing.fetchedPages + 5, HARD_MAX_PAGES),
    collected: existing.avNumbers.length,
    stage: 'fetching',
  }

  try {
    const result = await fetchActorWorks(existing.name, {
      existingEntry: existing,
      signal: controller.signal,
      onProgress: (nextProgress) => {
        if (requestId === actorRequestId)
          actorProgress.value = nextProgress
      },
    })
    if (requestId !== actorRequestId)
      return
    actorEntry.value = result.entry
    actorFromCache.value = result.fromCache
  }
  catch (error) {
    if (requestId !== actorRequestId)
      return
    if (error instanceof DOMException && error.name === 'AbortError')
      return
    actorError.value = error instanceof Error ? error.message : '加载更多作品失败'
  }
  finally {
    if (requestId === actorRequestId) {
      actorLoading.value = false
      actorProgress.value = null
      actorAbortController = null
    }
  }
}

function cancelActorLookup() {
  actorAbortController?.abort()
}

async function refreshLocalData() {
  const [loadedSnapshot, loadedJavMap] = await Promise.all([
    loadVideoIndexSnapshot(),
    loadAllCachedJavInfo(),
  ])
  snapshot.value = loadedSnapshot
  javMap.value = loadedJavMap
}

async function startSync(mode: 'full' | 'incremental') {
  if (syncing.value)
    return
  errorMessage.value = ''
  syncing.value = true
  progress.value = { pages: 0, fetched: 0, total: 0, mode }
  abortController = new AbortController()
  try {
    snapshot.value = await syncDriveVideoIndex({
      mode,
      signal: abortController.signal,
      onProgress: (nextProgress) => {
        progress.value = nextProgress
      },
    })
    javMap.value = await loadAllCachedJavInfo()
  }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      errorMessage.value = '已取消索引同步'
    }
    else {
      errorMessage.value = error instanceof Error ? error.message : '同步索引失败，请确认已登录 115 网盘'
    }
  }
  finally {
    syncing.value = false
    abortController = null
  }
}

function cancelSync() {
  abortController?.abort()
}

function isMasterApp(): boolean {
  return window.location.pathname.startsWith(new URL(MASTER_BASE_URL).pathname)
}

async function playVideo(video: IndexedVideo) {
  await goToPlayer({ pickCode: video.pickCode }, !isMasterApp())
  emit('close')
}

async function openFolder(video: IndexedVideo) {
  if (isMasterApp()) {
    const { router } = await import('@/app/router')
    await router.push({
      name: 'drive',
      params: { cid: video.cid },
    })
    emit('close')
    return
  }

  const url = window.location.pathname.startsWith('/storage/')
    ? `https://115.com/storage/allfiles?cid=${encodeURIComponent(video.cid)}`
    : `https://115.com/?cid=${encodeURIComponent(video.cid)}&offset=0&mode=wangpan`
  GM_openInTab(url, { active: true })
  emit('close')
}

onMounted(async () => {
  void actressFaceDB.init()
    .then(() => {
      actressDbReady.value = true
    })
    .catch(() => {})

  await refreshLocalData()
  await nextTick()
  inputRef.value?.focus()
})

onBeforeUnmount(() => {
  abortController?.abort()
  actorAbortController?.abort()
})
</script>
