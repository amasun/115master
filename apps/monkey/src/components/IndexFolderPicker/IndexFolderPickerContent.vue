<template>
  <div class="flex max-h-[68vh] flex-col gap-3">
    <p v-if="description" class="text-base-content/70 text-xs leading-relaxed">
      {{ description }}
    </p>

    <!-- 已选目录摘要区 -->
    <div class="bg-base-200/50 border-base-content/10 flex flex-col gap-2 rounded-xl border p-2.5">
      <div class="flex items-center justify-between gap-2 text-xs">
        <span class="text-base-content/70 font-medium">
          已选扫描目录
          <strong class="text-base-content tabular-nums">{{ modelValue.length }}</strong>
          <span v-if="modelValue.length === 0" class="text-base-content/50 font-normal">（不选将默认扫描全盘）</span>
        </span>
        <button
          v-if="modelValue.length > 0"
          type="button"
          class="btn btn-ghost btn-xs text-base-content/65 hover:text-error rounded-lg"
          @click="clearSelected"
        >
          清空（恢复全盘）
        </button>
      </div>

      <div v-if="modelValue.length > 0" class="flex flex-col gap-1.5">
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="folder in modelValue"
            :key="folder.cid"
            class="badge badge-primary badge-soft badge-sm h-auto max-w-full gap-1 py-1 pr-1 pl-1.5 text-xs"
            :title="folder.path"
          >
            <button
              type="button"
              class="badge badge-xs cursor-pointer border-none font-semibold transition-colors"
              :class="folder.category === 'cinema' ? 'badge-secondary' : 'badge-primary'"
              title="点击切换该目录的刮削类型（AV / 院线影视）"
              @click.stop="toggleFolderCategory(folder.cid)"
            >
              {{ folder.category === 'cinema' ? '院线' : 'AV' }}
            </button>
            <Icon :name="I.FOLDER_OPEN" class="shrink-0 text-xs" />
            <span class="max-w-44 truncate">{{ folder.name }}</span>
            <button
              type="button"
              class="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
              :aria-label="`移除 ${folder.name}`"
              @click="removeFolder(folder.cid)"
            >
              <Icon :name="I.CLOSE" class="text-[11px]" />
            </button>
          </span>
        </div>
        <p class="text-base-content/50 text-[11px]">
          点击已选目录上的「AV / 院线」可手动切换刮削类型（默认 AV）
        </p>
      </div>
    </div>

    <!-- 面包屑导航与刷新 -->
    <div class="flex items-center justify-between gap-2">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-xs">
        <button
          v-for="(crumb, index) in breadcrumbs"
          :key="crumb.cid"
          type="button"
          class="hover:bg-base-200 inline-flex items-center gap-1 rounded-lg px-2 py-1 transition-colors"
          :class="index === breadcrumbs.length - 1 ? 'text-base-content font-semibold' : 'text-base-content/60'"
          @click="navigateTo(crumb.cid)"
        >
          <span v-if="index > 0" class="text-base-content/35 mr-0.5">/</span>
          <span class="max-w-36 truncate">{{ crumb.name }}</span>
        </button>
      </div>

      <button
        type="button"
        class="btn btn-ghost btn-xs shrink-0 rounded-lg"
        :disabled="loading"
        title="刷新当前目录"
        @click="loadDirectory(currentCid, 0, false)"
      >
        <Icon :name="I.RESTART" class="text-xs" :class="loading && 'animate-spin'" />
        <span>刷新</span>
      </button>
    </div>

    <!-- 子目录列表 -->
    <div class="border-base-content/10 bg-base-100/40 min-h-[240px] flex-1 overflow-y-auto rounded-xl border p-1.5">
      <div v-if="loading && folders.length === 0" class="text-base-content/60 flex h-56 items-center justify-center gap-2 text-xs">
        <span class="loading loading-spinner loading-sm text-primary" />
        <span>正在加载目录…</span>
      </div>

      <div v-else-if="errorMessage" class="flex h-56 flex-col items-center justify-center gap-2 px-4 text-center text-xs">
        <p class="text-error">
          {{ errorMessage }}
        </p>
        <button
          type="button"
          class="btn btn-xs btn-primary rounded-lg"
          @click="loadDirectory(currentCid, 0, false)"
        >
          重试
        </button>
      </div>

      <div v-else-if="folders.length === 0" class="text-base-content/50 flex h-56 items-center justify-center text-xs">
        当前目录下没有子文件夹
      </div>

      <div v-else class="flex flex-col gap-1">
        <div
          v-for="folder in folders"
          :key="folder.cid"
          class="hover:bg-base-200/70 flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition-colors"
          :class="selectedCidSet.has(folder.cid) ? 'bg-primary/8' : ''"
        >
          <label class="flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              class="checkbox checkbox-xs checkbox-primary"
              :checked="selectedCidSet.has(folder.cid)"
              @change="toggleFolder(folder)"
            >
          </label>

          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
            @click="navigateTo(folder.cid, folder.name)"
          >
            <Icon :name="I.FOLDER_OPEN" class="text-warning shrink-0 text-base" />
            <span class="text-base-content truncate font-medium">{{ folder.name }}</span>
          </button>

          <button
            type="button"
            class="btn btn-ghost btn-xs text-base-content/55 shrink-0 rounded-lg"
            @click="navigateTo(folder.cid, folder.name)"
          >
            进入
          </button>
        </div>

        <button
          v-if="hasMore"
          type="button"
          class="btn btn-ghost btn-xs mt-1 w-full rounded-lg"
          :disabled="loading"
          @click="loadMore"
        >
          {{ loading ? '加载中…' : '加载更多子目录' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { IndexRootFolder } from '@/utils/userSettings'
import { computed, onMounted, ref, shallowRef } from 'vue'
import { I, Icon } from '@/icons'
import { drive115 } from '@/utils/drive115Instance'

interface FolderItem {
  cid: string
  name: string
  path: string
}

interface BreadcrumbItem {
  cid: string
  name: string
}

const props = defineProps<{
  modelValue: IndexRootFolder[]
  description?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [folders: IndexRootFolder[]]
}>()

const PAGE_LIMIT = 200

const currentCid = ref('0')
const breadcrumbs = shallowRef<BreadcrumbItem[]>([{ cid: '0', name: '根目录' }])
const folders = shallowRef<FolderItem[]>([])
const loading = ref(false)
const errorMessage = ref('')
const totalCount = ref(0)
const nextOffset = ref(0)
let requestVersion = 0

const selectedCidSet = computed(() => new Set(props.modelValue.map(item => item.cid)))
const hasMore = computed(() => totalCount.value > 0 && folders.value.length < totalCount.value)

function buildChildPath(name: string): string {
  const prefix = breadcrumbs.value.map(item => item.name).join(' / ')
  return prefix ? `${prefix} / ${name}` : name
}

async function loadDirectory(cid: string, offset: number, append: boolean, fallbackName?: string) {
  const version = ++requestVersion
  loading.value = true
  errorMessage.value = ''

  try {
    const res = await drive115.file.getFilesWithFallback({
      aid: 1,
      cid,
      offset,
      limit: PAGE_LIMIT,
      show_dir: 1,
      cur: 1,
      format: 'json',
    })

    if (version !== requestVersion)
      return

    if (!res.state) {
      errorMessage.value = res.error || '读取 115 目录失败'
      return
    }

    currentCid.value = cid

    const rawPath = Array.isArray(res.path) ? res.path : []
    if (rawPath.length > 0) {
      breadcrumbs.value = rawPath.map(seg => ({
        cid: String(seg.cid ?? '0'),
        name: String(seg.cid ?? '0') === '0' ? '根目录' : (seg.name?.trim() || `目录 ${seg.cid}`),
      }))
    }
    else if (cid === '0') {
      breadcrumbs.value = [{ cid: '0', name: '根目录' }]
    }
    else if (fallbackName) {
      const existingIdx = breadcrumbs.value.findIndex(item => item.cid === cid)
      breadcrumbs.value = existingIdx >= 0
        ? breadcrumbs.value.slice(0, existingIdx + 1)
        : [...breadcrumbs.value, { cid, name: fallbackName }]
    }

    const list = Array.isArray(res.data) ? res.data : []
    const dirItems: FolderItem[] = []
    for (const raw of list) {
      const item = raw as { fc?: number | string, cid?: string | number, n?: string }
      if (item.fc !== 0 && item.fc !== '0')
        continue
      const itemCid = item.cid !== undefined && item.cid !== null ? String(item.cid).trim() : ''
      const name = typeof item.n === 'string' ? item.n.trim() : ''
      if (!itemCid || itemCid === '0' || !name)
        continue
      dirItems.push({
        cid: itemCid,
        name,
        path: buildChildPath(name),
      })
    }

    folders.value = append ? [...folders.value, ...dirItems] : dirItems
    totalCount.value = Number(res.count) || 0
    nextOffset.value = offset + list.length
  }
  catch (error) {
    if (version !== requestVersion)
      return
    errorMessage.value = error instanceof Error ? error.message : '加载目录失败，请确认已登录 115 网盘'
  }
  finally {
    if (version === requestVersion)
      loading.value = false
  }
}

function navigateTo(cid: string, fallbackName?: string) {
  void loadDirectory(cid, 0, false, fallbackName)
}

function loadMore() {
  if (loading.value || !hasMore.value)
    return
  void loadDirectory(currentCid.value, nextOffset.value, true)
}

function toggleFolder(folder: FolderItem) {
  if (selectedCidSet.value.has(folder.cid)) {
    emit('update:modelValue', props.modelValue.filter(item => item.cid !== folder.cid))
    return
  }
  emit('update:modelValue', [
    ...props.modelValue,
    { cid: folder.cid, name: folder.name, path: folder.path, category: 'jav' },
  ])
}

function toggleFolderCategory(cid: string) {
  emit(
    'update:modelValue',
    props.modelValue.map(item =>
      item.cid === cid
        ? { ...item, category: item.category === 'cinema' ? 'jav' : 'cinema' }
        : item,
    ),
  )
}

function removeFolder(cid: string) {
  emit('update:modelValue', props.modelValue.filter(item => item.cid !== cid))
}

function clearSelected() {
  emit('update:modelValue', [])
}

onMounted(() => {
  void loadDirectory('0', 0, false)
})
</script>
