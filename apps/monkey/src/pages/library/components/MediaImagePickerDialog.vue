<template>
  <Dialog
    :open="Boolean(target)"
    size="lg"
    :title="dialogTitle"
    :description="dialogSubtitle"
    @update:open="handleOpenChange"
  >
    <div v-if="target" class="flex flex-col gap-4">
      <!-- 顶部 Tab 与恢复默认 -->
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="bg-base-200/80 border-base-content/10 inline-flex items-center gap-1 rounded-full border p-1">
          <button
            type="button"
            class="rounded-full px-3.5 py-1 text-xs transition-colors"
            :class="activeTab === 'candidates'
              ? 'bg-primary text-primary-content font-medium shadow-xs'
              : 'text-base-content/70 hover:text-base-content'"
            @click="activeTab = 'candidates'"
          >
            多源候选 ({{ candidates.length }})
          </button>
          <button
            type="button"
            class="rounded-full px-3.5 py-1 text-xs transition-colors"
            :class="activeTab === 'upload'
              ? 'bg-primary text-primary-content font-medium shadow-xs'
              : 'text-base-content/70 hover:text-base-content'"
            @click="activeTab = 'upload'"
          >
            本地上传
          </button>
        </div>

        <Button
          v-if="hasCustomOverride"
          variant="ghost"
          size="xs"
          class="text-warning hover:bg-warning/10 gap-1 rounded-full"
          :disabled="submitting"
          @click="handleResetDefault"
        >
          <Icon :name="I.RESET" class="text-sm" />
          <span>恢复默认</span>
        </Button>
      </div>

      <!-- Tab 1: 多源候选 -->
      <div v-if="activeTab === 'candidates'" class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-base-content/60 text-xs">
            {{ loadingLocal ? '正在汇总本地多源候选...' : `共找到 ${candidates.length} 个候选源，点击选中后应用` }}
          </span>
          <Button
            v-if="canProbeRemote"
            variant="soft"
            size="xs"
            class="gap-1.5 rounded-full"
            :disabled="probingRemote || submitting"
            @click="handleProbeRemote"
          >
            <Icon :name="probingRemote ? I.LOADING : I.SEARCH" class="text-xs" :class="probingRemote && 'animate-spin'" />
            <span>{{ probingRemote ? '正在探测源站...' : '联网探测更多源' }}</span>
          </Button>
        </div>

        <div
          v-if="loadingLocal && candidates.length === 0"
          class="flex min-h-48 items-center justify-center"
        >
          <Icon :name="I.LOADING" class="text-primary animate-spin text-2xl" />
        </div>

        <div
          v-else-if="candidates.length === 0"
          class="bg-base-200/45 border-base-content/10 flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border p-6 text-center"
        >
          <Empty description="本地暂未收录其他来源候选图" size="sm" />
          <div class="flex flex-wrap items-center justify-center gap-2">
            <Button
              v-if="canProbeRemote"
              variant="soft"
              size="xs"
              class="rounded-full"
              :disabled="probingRemote"
              @click="handleProbeRemote"
            >
              联网探测更多源
            </Button>
            <Button
              variant="ghost"
              size="xs"
              class="rounded-full"
              @click="activeTab = 'upload'"
            >
              改用本地上传
            </Button>
          </div>
        </div>

        <div
          v-else
          class="grid max-h-[52vh] gap-3 overflow-y-auto pr-1"
          :class="target.mode === 'cover' ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-3 sm:grid-cols-4'"
        >
          <button
            v-for="item in candidates"
            :key="item.id"
            type="button"
            class="group bg-base-200/50 relative flex flex-col overflow-hidden rounded-xl border text-left transition-all"
            :class="selectedId === item.id
              ? 'border-primary ring-primary/60 ring-2'
              : 'border-base-content/10 hover:border-primary/45'"
            @click="selectedId = item.id"
          >
            <div
              class="bg-base-300/70 relative w-full overflow-hidden"
              :class="target.mode === 'cover' ? 'aspect-[3/2]' : 'aspect-[3/4]'"
            >
              <img
                v-if="previewUrls[item.id]"
                :src="previewUrls[item.id]"
                :alt="item.sourceLabel"
                class="size-full object-cover"
                :class="target.mode === 'avatar' && 'object-top'"
              >
              <div
                v-else-if="previewFailed.has(item.id)"
                class="text-base-content/40 flex size-full flex-col items-center justify-center gap-1 px-2 text-center text-[11px]"
              >
                <Icon :name="I.ERROR" class="text-lg" />
                <span>预览加载失败</span>
              </div>
              <div
                v-else
                class="text-base-content/45 flex size-full items-center justify-center"
              >
                <Icon :name="I.LOADING" class="animate-spin text-lg" />
              </div>

              <span
                v-if="selectedId === item.id"
                class="bg-primary text-primary-content absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full shadow-sm"
              >
                <Icon :name="I.TOAST_SUCCESS" class="text-xs" />
              </span>
            </div>

            <div class="flex items-center justify-between gap-1 px-2 py-1.5">
              <span class="text-base-content/80 truncate text-[11px] font-medium" :title="item.sourceLabel">
                {{ item.sourceLabel }}
              </span>
            </div>
          </button>
        </div>

        <div class="flex items-center justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            class="rounded-full"
            :disabled="submitting"
            @click="store.closeImagePicker()"
          >
            取消
          </Button>
          <Button
            color="primary"
            size="sm"
            class="rounded-full px-5"
            :disabled="!selectedCandidate || submitting"
            @click="handleApplyCandidate"
          >
            <Icon v-if="submitting" :name="I.LOADING" class="animate-spin text-sm" />
            <span>{{ submitting ? '压缩保存中...' : '应用选中图片' }}</span>
          </Button>
        </div>
      </div>

      <!-- Tab 2: 本地上传与压缩 -->
      <div v-else class="flex flex-col gap-3">
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          class="hidden"
          @change="handleFileChange"
        >

        <div
          role="button"
          tabindex="0"
          class="border-base-content/20 hover:border-primary/60 flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-5 text-center transition-colors"
          :class="isDragging ? 'border-primary bg-primary/10' : 'bg-base-200/35'"
          @click="fileInputRef?.click()"
          @keydown.enter.prevent="fileInputRef?.click()"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="handleDrop"
        >
          <template v-if="uploadPreviewUrl">
            <img
              :src="uploadPreviewUrl"
              alt="本地上传预览"
              class="max-h-52 rounded-xl object-contain shadow-sm"
            >
            <div class="text-base-content/75 flex flex-wrap items-center justify-center gap-2 text-xs">
              <span>原图 {{ format.fileSize(uploadOriginalSize) }}</span>
              <span>→</span>
              <span class="text-primary font-medium">
                压缩后 {{ format.fileSize(uploadCompressedSize) }} (WebP)
              </span>
            </div>
            <span class="text-base-content/50 text-[11px]">点击、拖拽新图片或直接 Ctrl/Cmd+V 替换</span>
          </template>

          <template v-else-if="compressing">
            <Icon :name="I.LOADING" class="text-primary animate-spin text-2xl" />
            <span class="text-base-content/70 text-xs">正在自动压缩为 WebP...</span>
          </template>

          <template v-else>
            <Icon :name="I.UPLOAD" class="text-base-content/45 text-3xl" />
            <div class="flex flex-col gap-1">
              <span class="text-base-content text-sm font-medium">
                点击选图、拖拽图片到此，或按 Ctrl/Cmd+V 粘贴
              </span>
              <span class="text-base-content/50 text-xs">
                自动压缩为轻量 WebP（封面 480px/1440px 双档，头像 480px），上限 20MB
              </span>
            </div>
          </template>
        </div>

        <p v-if="uploadError" class="text-error text-xs">
          {{ uploadError }}
        </p>

        <div class="flex items-center justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            class="rounded-full"
            :disabled="submitting"
            @click="store.closeImagePicker()"
          >
            取消
          </Button>
          <Button
            color="primary"
            size="sm"
            class="rounded-full px-5"
            :disabled="!uploadRawBlob || compressing || submitting"
            @click="handleApplyUpload"
          >
            <Icon v-if="submitting" :name="I.LOADING" class="animate-spin text-sm" />
            <span>{{ submitting ? '保存中...' : '应用上传图片' }}</span>
          </Button>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import type { ImageCandidateItem } from '@/utils/mediaIndex'
import { Button, Dialog, Empty } from '@115master/ui'
import { format } from '@115master/utils'
import { useEventListener } from '@vueuse/core'
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useToast } from '@/components'
import { I, Icon } from '@/icons'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import {
  collectLocalAvatarCandidates,
  collectLocalCoverCandidates,
  compressCustomAvatar,
  compressCustomCover,
  fetchCandidateBlob,
  probeRemoteAvatarCandidates,
  probeRemoteCoverCandidates,
  validateUploadImageFile,
} from '@/utils/mediaIndex'

const store = useMediaLibraryStore()
const toast = useToast()

const target = computed(() => store.imagePickerTarget)
const activeTab = shallowRef<'candidates' | 'upload'>('candidates')
const candidates = shallowRef<ImageCandidateItem[]>([])
const selectedId = shallowRef('')
const loadingLocal = shallowRef(false)
const probingRemote = shallowRef(false)
const submitting = shallowRef(false)
const compressing = shallowRef(false)
const isDragging = shallowRef(false)

const previewUrls = ref<Record<string, string>>({})
const previewFailed = ref(new Set<string>())
const previewBlobs = new Map<string, Blob>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const uploadRawBlob = shallowRef<Blob | null>(null)
const uploadPreviewUrl = shallowRef('')
const uploadOriginalSize = shallowRef(0)
const uploadCompressedSize = shallowRef(0)
const uploadError = shallowRef('')

let activeController: AbortController | null = null

const dialogTitle = computed(() =>
  target.value?.mode === 'avatar' ? '更换演员头像' : '更换作品封面',
)

const dialogSubtitle = computed(() => {
  if (!target.value)
    return ''
  if (target.value.mode === 'avatar')
    return target.value.name
  return target.value.externalId ? `${target.value.externalId} · ${target.value.title}` : target.value.title
})

const hasCustomOverride = computed(() => {
  if (!target.value)
    return false
  if (target.value.mode === 'avatar')
    return Boolean(store.customAvatarUrls[target.value.actorKey])
  return store.customCoverKeys.has(target.value.mediaKey)
})

const canProbeRemote = computed(() => {
  if (!target.value)
    return false
  if (target.value.mode === 'avatar')
    return true
  return Boolean(target.value.externalId)
})

const selectedCandidate = computed(() =>
  candidates.value.find(item => item.id === selectedId.value) ?? null,
)

function cleanupPreviews() {
  activeController?.abort()
  activeController = null

  Object.values(previewUrls.value).forEach(url => URL.revokeObjectURL(url))
  previewUrls.value = {}
  previewFailed.value = new Set()
  previewBlobs.clear()

  if (uploadPreviewUrl.value)
    URL.revokeObjectURL(uploadPreviewUrl.value)
  uploadPreviewUrl.value = ''
  uploadRawBlob.value = null
  uploadOriginalSize.value = 0
  uploadCompressedSize.value = 0
  uploadError.value = ''
}

async function preloadCandidatePreviews(items: ImageCandidateItem[], signal: AbortSignal) {
  await Promise.allSettled(
    items.map(async (item) => {
      if (signal.aborted || previewUrls.value[item.id])
        return
      try {
        const blob = await fetchCandidateBlob(item, signal)
        if (signal.aborted)
          return
        previewBlobs.set(item.id, blob)
        previewUrls.value = {
          ...previewUrls.value,
          [item.id]: URL.createObjectURL(blob),
        }
      }
      catch {
        if (signal.aborted)
          return
        previewFailed.value = new Set([...previewFailed.value, item.id])
      }
    }),
  )
}

async function initPickerSession() {
  cleanupPreviews()
  if (!target.value)
    return

  activeTab.value = 'candidates'
  candidates.value = []
  selectedId.value = ''
  loadingLocal.value = true

  const controller = new AbortController()
  activeController = controller
  const current = target.value

  try {
    const localItems = current.mode === 'cover'
      ? await collectLocalCoverCandidates(
          current.externalId,
          store.metaMap.get(current.mediaKey) ?? null,
        )
      : await collectLocalAvatarCandidates(
          {
            key: current.actorKey,
            name: current.name,
            aliases: current.aliases,
            avatarUrl: current.avatarUrl,
          },
          store.metaMap,
        )

    if (controller.signal.aborted)
      return

    candidates.value = localItems
    if (localItems[0])
      selectedId.value = localItems[0].id
    loadingLocal.value = false
    void preloadCandidatePreviews(localItems, controller.signal)
  }
  catch {
    if (!controller.signal.aborted)
      loadingLocal.value = false
  }
}

watch(target, () => {
  void initPickerSession()
})

onUnmounted(() => {
  cleanupPreviews()
})

function handleOpenChange(open: boolean) {
  if (!open)
    store.closeImagePicker()
}

async function handleProbeRemote() {
  if (!target.value || probingRemote.value)
    return

  probingRemote.value = true
  const controller = activeController ?? new AbortController()
  activeController = controller
  const current = target.value
  const existingUrls = new Set(candidates.value.map(item => item.url))

  try {
    const extra = current.mode === 'cover' && current.externalId
      ? await probeRemoteCoverCandidates(current.externalId, existingUrls, controller.signal)
      : current.mode === 'avatar'
        ? await probeRemoteAvatarCandidates(
            { name: current.name, aliases: current.aliases },
            existingUrls,
          )
        : []

    if (controller.signal.aborted)
      return

    if (extra.length === 0) {
      toast.info('未发现新的候选图片')
      return
    }

    candidates.value = [...candidates.value, ...extra]
    if (!selectedId.value && extra[0])
      selectedId.value = extra[0].id
    void preloadCandidatePreviews(extra, controller.signal)
  }
  finally {
    probingRemote.value = false
  }
}

async function handleApplyCandidate() {
  const item = selectedCandidate.value
  const current = target.value
  if (!item || !current || submitting.value)
    return

  submitting.value = true
  try {
    const blob = previewBlobs.get(item.id)
      ?? await fetchCandidateBlob(item, activeController?.signal)

    if (current.mode === 'cover') {
      await store.applyCustomCover(current.mediaKey, blob, item.sourceLabel)
      toast.success('已更换作品封面')
    }
    else {
      await store.applyCustomAvatar(current.actorKey, blob, item.sourceLabel)
      toast.success('已更换演员头像')
    }
    store.closeImagePicker()
  }
  catch {
    toast.error('下载候选图片失败，请尝试其他候选或改用本地上传')
  }
  finally {
    submitting.value = false
  }
}

async function handleSelectedFile(file: File) {
  const validationError = validateUploadImageFile(file)
  if (validationError) {
    uploadError.value = validationError
    return
  }

  uploadError.value = ''
  compressing.value = true
  if (uploadPreviewUrl.value) {
    URL.revokeObjectURL(uploadPreviewUrl.value)
    uploadPreviewUrl.value = ''
  }

  try {
    uploadRawBlob.value = file
    uploadOriginalSize.value = file.size

    if (target.value?.mode === 'avatar') {
      const compressed = await compressCustomAvatar(file)
      uploadCompressedSize.value = compressed.size
      uploadPreviewUrl.value = URL.createObjectURL(compressed)
    }
    else {
      const { thumbBlob, fullBlob } = await compressCustomCover(file)
      uploadCompressedSize.value = fullBlob.size + thumbBlob.size
      uploadPreviewUrl.value = URL.createObjectURL(fullBlob)
    }
  }
  catch {
    uploadError.value = '图片压缩失败，请尝试更换图片格式'
    uploadRawBlob.value = null
  }
  finally {
    compressing.value = false
  }
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (file)
    void handleSelectedFile(file)
  if (input)
    input.value = ''
}

function handleDrop(event: DragEvent) {
  isDragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file)
    void handleSelectedFile(file)
}

useEventListener(window, 'paste', (event: ClipboardEvent) => {
  if (!target.value)
    return
  const items = Array.from(event.clipboardData?.items ?? [])
  const imageItem = items.find(item => item.type.startsWith('image/'))
  const file = imageItem?.getAsFile()
  if (!file)
    return
  activeTab.value = 'upload'
  void handleSelectedFile(file)
})

async function handleApplyUpload() {
  const blob = uploadRawBlob.value
  const current = target.value
  if (!blob || !current || submitting.value)
    return

  submitting.value = true
  try {
    if (current.mode === 'cover') {
      await store.applyCustomCover(current.mediaKey, blob, '本地上传')
      toast.success('已上传并应用自定义封面')
    }
    else {
      await store.applyCustomAvatar(current.actorKey, blob, '本地上传')
      toast.success('已上传并应用自定义头像')
    }
    store.closeImagePicker()
  }
  catch {
    toast.error('保存自定义图片失败')
  }
  finally {
    submitting.value = false
  }
}

async function handleResetDefault() {
  const current = target.value
  if (!current || submitting.value)
    return

  submitting.value = true
  try {
    if (current.mode === 'cover') {
      await store.resetCustomCover(current.mediaKey)
      toast.success('已恢复默认封面')
    }
    else {
      await store.resetCustomAvatar(current.actorKey)
      toast.success('已恢复默认头像')
    }
    store.closeImagePicker()
  }
  catch {
    toast.error('恢复默认失败')
  }
  finally {
    submitting.value = false
  }
}
</script>
