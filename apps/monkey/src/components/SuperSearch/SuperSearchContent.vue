<template>
  <div class="flex max-h-[72vh] flex-col gap-3">
    <!-- 搜索框 -->
    <div class="relative flex items-center">
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
      >
      <button
        v-if="query"
        type="button"
        class="btn btn-ghost btn-xs btn-circle absolute right-2"
        title="清空"
        aria-label="清空搜索词"
        @click="query = ''"
      >
        <Icon :name="I.CLOSE" class="text-sm" />
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

    <!-- 错误提示 -->
    <div
      v-if="errorMessage"
      class="alert alert-error py-2 text-xs"
    >
      <span>{{ errorMessage }}</span>
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
          快捷键 <kbd class="kbd kbd-xs">Alt</kbd> + <kbd class="kbd kbd-xs">K</kbd> 随时唤起 · 支持演员名 / 番号 / 分类 / 导演 / 年份 / 文件名
        </p>
      </div>

      <!-- 无匹配结果 -->
      <div
        v-else-if="results.length === 0"
        class="text-base-content/55 flex h-full min-h-[220px] flex-col items-center justify-center gap-1.5 text-center text-xs"
      >
        <p class="text-base-content/80 text-sm font-medium">
          未找到与「{{ query.trim() }}」匹配的视频
        </p>
        <p>提示：Phase 1 仅匹配本地索引与已浏览缓存的作品介绍，可先点击「增量更新」同步最新文件。</p>
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
                class="badge badge-ghost badge-xs text-[11px]"
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
import type { IndexedVideo, IndexProgress, VideoIndexSnapshot } from '@/utils/superSearch'
import { GM_openInTab } from '$'
import { format } from '@115master/utils'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { MASTER_BASE_URL } from '@/constants'
import { I, Icon } from '@/icons'
import { goToPlayer } from '@/utils/route'
import {
  loadAllCachedJavInfo,
  loadVideoIndexSnapshot,
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

const avCount = computed(() =>
  snapshot.value?.items.filter(item => Boolean(item.avNumber)).length ?? 0,
)

const lastSyncLabel = computed(() => {
  if (!snapshot.value?.lastSyncAt)
    return '未知'
  return new Date(snapshot.value.lastSyncAt).toLocaleString()
})

const results = computed(() => {
  if (!snapshot.value || !query.value.trim())
    return []
  return searchIndexedVideos(query.value, snapshot.value.items, javMap.value)
})

const visibleResults = computed(() => results.value.slice(0, MAX_VISIBLE))

function formatSize(bytes: number): string {
  return format.fileSize(bytes)
}

function formatDuration(seconds: number): string {
  return format.duration(seconds)
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
  await refreshLocalData()
  await nextTick()
  inputRef.value?.focus()
})

onBeforeUnmount(() => {
  abortController?.abort()
})
</script>
