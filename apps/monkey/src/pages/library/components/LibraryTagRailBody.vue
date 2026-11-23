<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- 顶部栏 -->
    <div class="flex shrink-0 items-center justify-between gap-2 px-3.5 pt-3.5 pb-2.5">
      <div class="flex min-w-0 items-center gap-2">
        <Icon :name="I.TAG" class="text-primary shrink-0 text-base" />
        <span class="text-base-content truncate text-sm font-semibold">标签</span>
        <span class="badge badge-neutral badge-soft badge-xs tabular-nums">
          {{ allItems.length }}
        </span>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <Button
          size="xs"
          :variant="managing ? 'soft' : 'ghost'"
          :color="managing ? 'primary' : 'neutral'"
          class="rounded-full px-2.5 text-xs"
          :aria-pressed="managing"
          @click="toggleManaging"
        >
          {{ managing ? '完成' : '管理' }}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          shape="circle"
          title="刷新标签"
          aria-label="刷新标签"
          :disabled="tagStore.loading"
          @click="tagStore.load()"
        >
          <Icon :name="I.RESTART" class="text-sm" :class="tagStore.loading && 'animate-spin'" />
        </Button>
        <Button
          v-if="!mobile"
          variant="ghost"
          size="xs"
          shape="circle"
          title="收起标签栏"
          aria-label="收起标签栏"
          @click="store.setTagRailOpen(false)"
        >
          <Icon :name="I.CLOSE" class="text-sm" />
        </Button>
      </div>
    </div>

    <!-- 搜索框 -->
    <div class="px-3 pb-2">
      <label class="bg-base-content/5 border-base-content/8 focus-within:border-primary/40 flex h-8 items-center gap-1.5 rounded-full border px-2.5 transition-colors">
        <Icon :name="I.SEARCH" class="text-base-content/45 shrink-0 text-sm" />
        <input
          v-model="searchKeyword"
          type="text"
          class="text-base-content placeholder:text-base-content/40 min-w-0 flex-1 bg-transparent text-xs outline-none"
          placeholder="搜索标签..."
        >
        <button
          v-if="searchKeyword"
          type="button"
          class="text-base-content/45 hover:text-base-content shrink-0"
          aria-label="清空标签搜索"
          @click="searchKeyword = ''"
        >
          <Icon :name="I.CLOSE" class="text-xs" />
        </button>
      </label>
    </div>

    <!-- 浏览模式快捷开关 -->
    <div
      v-if="!managing"
      class="flex shrink-0 items-center justify-between gap-2 px-3.5 pb-2"
    >
      <span class="text-base-content/50 text-[11px] tabular-nums">
        已关联 {{ withWorksCount }} 个
      </span>
      <button
        type="button"
        class="rounded-full px-2 py-0.5 text-[11px] transition-colors"
        :class="onlyWithWorks
          ? 'bg-primary/15 text-primary font-medium'
          : 'text-base-content/55 hover:bg-base-content/5 hover:text-base-content'"
        @click="onlyWithWorks = !onlyWithWorks"
      >
        仅看有作品
      </button>
    </div>

    <!-- 管理模式顶部操作栏 -->
    <div v-else class="flex shrink-0 items-center justify-between gap-2 px-3 pb-2">
      <Button
        color="primary"
        variant="soft"
        size="xs"
        class="flex-1 gap-1 rounded-xl text-xs"
        @click="openTagForm()"
      >
        <Icon :name="I.PLUS" class="text-sm" />
        <span>新建标签</span>
      </Button>
      <Button
        v-if="manageableVisibleIds.length > 0"
        variant="ghost"
        size="xs"
        class="shrink-0 rounded-xl px-2.5 text-xs font-normal"
        @click="toggleSelectAllVisible"
      >
        {{ allVisibleSelected ? '取消全选' : '全选' }}
      </Button>
    </div>

    <div class="bg-base-content/5 mx-3 h-px shrink-0" />

    <!-- 标签列表区 -->
    <div class="min-h-0 flex-1 overflow-y-auto px-2 py-2" :class="[...scrollbar()]">
      <!-- 首次加载错误 -->
      <div
        v-if="tagStore.error && allItems.length === 0"
        class="flex flex-col items-center justify-center gap-2 px-3 py-10 text-center"
      >
        <p class="text-base-content/60 text-xs">
          标签加载失败
        </p>
        <Button size="xs" variant="soft" class="rounded-full" @click="tagStore.load()">
          重试
        </Button>
      </div>

      <!-- 首次加载中 -->
      <div
        v-else-if="tagStore.loading && allItems.length === 0"
        class="text-base-content/55 flex items-center justify-center gap-2 py-10 text-xs"
      >
        <Icon :name="I.LOADING" class="animate-spin text-sm" />
        <span>加载标签中...</span>
      </div>

      <!-- 浏览筛选模式 -->
      <template v-else-if="!managing">
        <button
          type="button"
          class="mb-1 flex h-8.5 w-full items-center justify-between gap-2 rounded-xl border border-transparent px-2.5 text-left text-xs transition-colors"
          :class="!store.filter.driveLabel
            ? 'bg-primary/15 border-primary/25 text-base-content font-medium'
            : 'text-base-content/75 hover:bg-base-content/5'"
          @click="handleSelectLabel(undefined)"
        >
          <span class="flex min-w-0 items-center gap-2">
            <span class="bg-base-content/30 size-2 shrink-0 rounded-full" />
            <span class="truncate">全部作品</span>
          </span>
          <span class="text-base-content/45 shrink-0 text-[11px] tabular-nums">
            {{ store.visibleEntryCount }}
          </span>
        </button>

        <div
          v-if="visibleItems.length === 0"
          class="text-base-content/45 py-8 text-center text-xs"
        >
          {{ searchKeyword.trim() ? '无匹配标签' : '暂无关联作品的标签' }}
        </div>

        <ul v-else class="flex flex-col gap-0.5">
          <li v-for="item in visibleItems" :key="item.id">
            <button
              type="button"
              class="flex h-8.5 w-full items-center justify-between gap-2 rounded-xl border border-transparent px-2.5 text-left text-xs transition-colors"
              :class="store.filter.driveLabel === item.id
                ? 'bg-primary/15 border-primary/25 text-base-content font-medium'
                : 'text-base-content/75 hover:bg-base-content/5'"
              @click="handleSelectLabel(item.id)"
            >
              <span class="flex min-w-0 items-center gap-2">
                <span
                  class="size-2.5 shrink-0 rounded-full"
                  :class="item.color === LabelColor.Blank ? 'border-base-content/35 bg-base-content/5 border' : ''"
                  :style="item.color === LabelColor.Blank ? undefined : { backgroundColor: item.color }"
                />
                <span class="truncate" :title="item.name">{{ item.name }}</span>
              </span>
              <span
                class="shrink-0 text-[11px] tabular-nums"
                :class="item.count > 0 ? 'text-base-content/50' : 'text-base-content/30'"
              >
                {{ item.count }}
              </span>
            </button>
          </li>
        </ul>
      </template>

      <!-- 管理模式列表（支持单条编辑/删除及勾选批量删除） -->
      <template v-else>
        <div
          v-if="visibleItems.length === 0"
          class="text-base-content/45 py-8 text-center text-xs"
        >
          {{ searchKeyword.trim() ? '无匹配标签' : '暂无标签，点击上方新建' }}
        </div>

        <ul v-else class="flex flex-col gap-0.5">
          <li
            v-for="item in visibleItems"
            :key="item.id"
            class="group hover:bg-base-content/5 flex h-9 items-center justify-between gap-1.5 rounded-xl px-2 transition-colors"
            :class="selectedTagIds.has(item.id) ? 'bg-primary/10' : ''"
          >
            <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
              <input
                v-if="item.fromDrive"
                type="checkbox"
                class="checkbox checkbox-xs checkbox-primary shrink-0"
                :checked="selectedTagIds.has(item.id)"
                @change="toggleSelectTag(item.id)"
              >
              <span
                class="size-2.5 shrink-0 rounded-full"
                :class="item.color === LabelColor.Blank ? 'border-base-content/35 bg-base-content/5 border' : ''"
                :style="item.color === LabelColor.Blank ? undefined : { backgroundColor: item.color }"
              />
              <span class="text-base-content/85 min-w-0 flex-1 truncate text-xs" :title="item.name">
                {{ item.name }}
              </span>
              <span class="text-base-content/40 shrink-0 text-[11px] tabular-nums">
                {{ item.count }}
              </span>
            </label>
            <div
              v-if="item.fromDrive"
              class="flex shrink-0 items-center gap-0.5"
            >
              <Button
                variant="ghost"
                size="xs"
                shape="circle"
                title="编辑标签"
                aria-label="编辑标签"
                @click="openTagForm(findDriveTag(item.id))"
              >
                <Icon :name="I.RENAME" class="text-xs" />
              </Button>
              <Button
                color="error"
                variant="ghost"
                size="xs"
                shape="circle"
                title="删除标签"
                aria-label="删除标签"
                @click="deleteTag(findDriveTag(item.id))"
              >
                <Icon :name="I.DELETE" class="text-xs" />
              </Button>
            </div>
          </li>
        </ul>
      </template>
    </div>

    <!-- 管理模式底部批量删除栏 -->
    <div
      v-if="managing && selectedTagIds.size > 0"
      class="border-base-content/5 flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2"
    >
      <span class="text-base-content/70 text-xs tabular-nums">
        已选 {{ selectedTagIds.size }} 个
      </span>
      <Button
        color="error"
        variant="soft"
        size="xs"
        class="gap-1 rounded-full px-3 text-xs"
        @click="deleteBatchSelected"
      >
        <Icon :name="I.DELETE" class="text-xs" />
        <span>批量删除</span>
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TagFormState } from '@/pages/tags/TagFormContent'
import type { Tag } from '@/store/tagList'
import { Api, Core } from '@115master/drive115'
import { Button, scrollbar } from '@115master/ui'
import { computed, h, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppDialog } from '@/app/dialog'
import { useToast } from '@/components'
import { I, Icon } from '@/icons'
import TagFormContent from '@/pages/tags/TagFormContent'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { useTagStore } from '@/store/tagList'
import { filterTagRailItems, mergeTagRailItems } from './tagRail'

const props = defineProps<{
  mobile?: boolean
}>()

const { LabelColor } = Api.TagApi.Req

const route = useRoute()
const router = useRouter()
const store = useMediaLibraryStore()
const tagStore = useTagStore()
const dialog = useAppDialog()
const toast = useToast()

const managing = ref(false)
const searchKeyword = ref('')
const onlyWithWorks = ref(false)
const selectedTagIds = ref(new Set<string>())

const allItems = computed(() =>
  mergeTagRailItems(tagStore.tags, store.libraryIndex.driveLabels, LabelColor.Blank),
)

const withWorksCount = computed(() =>
  allItems.value.filter(item => item.count > 0).length,
)

const visibleItems = computed(() =>
  filterTagRailItems(allItems.value, {
    keyword: searchKeyword.value,
    mode: managing.value ? 'manage' : 'filter',
    onlyWithWorks: onlyWithWorks.value,
  }),
)

const manageableVisibleIds = computed(() =>
  visibleItems.value.filter(item => item.fromDrive).map(item => item.id),
)

const allVisibleSelected = computed(() =>
  manageableVisibleIds.value.length > 0
  && manageableVisibleIds.value.every(id => selectedTagIds.value.has(id)),
)

function toggleManaging() {
  managing.value = !managing.value
  if (!managing.value)
    selectedTagIds.value = new Set()
}

function toggleSelectTag(id: string) {
  const next = new Set(selectedTagIds.value)
  if (next.has(id))
    next.delete(id)
  else
    next.add(id)
  selectedTagIds.value = next
}

function toggleSelectAllVisible() {
  if (allVisibleSelected.value) {
    const next = new Set(selectedTagIds.value)
    for (const id of manageableVisibleIds.value)
      next.delete(id)
    selectedTagIds.value = next
    return
  }
  const next = new Set(selectedTagIds.value)
  for (const id of manageableVisibleIds.value)
    next.add(id)
  selectedTagIds.value = next
}

function findDriveTag(id: string): Tag | undefined {
  return tagStore.tags.find(tag => tag.id === id)
}

function handleSelectLabel(labelId?: string) {
  if (!labelId) {
    store.selectDriveLabel(undefined)
  }
  else if (store.filter.driveLabel === labelId) {
    store.selectDriveLabel(undefined)
  }
  else {
    store.selectDriveLabel(labelId)
  }

  if (route.name !== 'library') {
    store.scrollTop = 0
    void router.push({ name: 'library' })
  }

  if (props.mobile)
    store.setTagRailOpen(false)
}

function openTagForm(tag?: Tag) {
  const form = reactive<TagFormState>({
    name: tag?.name ?? '',
    color: tag?.color ?? LabelColor.Blank,
    error: '',
    submitting: false,
  })
  dialog.create({
    title: tag ? '编辑标签' : '新建标签',
    content: () => h(TagFormContent, { form }),
    confirmText: tag ? '保存' : '创建',
    cancelText: '取消',
    closeOnBackdrop: true,
    onConfirm: async () => {
      if (form.submitting)
        return false
      const err = tagStore.checkName(form.name, tag?.id)
      if (err) {
        form.error = err
        return false
      }
      form.submitting = true
      try {
        if (tag)
          await tagStore.update(tag.id, form.name.trim(), form.color)
        else
          await tagStore.create(form.name.trim(), form.color)
      }
      catch (e) {
        form.error = Core.toDrive115Error(e).message
        return false
      }
      finally {
        form.submitting = false
      }
    },
  })
}

async function deleteTag(tag?: Tag) {
  if (!tag)
    return
  const confirmed = await dialog.confirm({
    title: '删除标签',
    content: `确定删除「${tag.name}」吗？该标签会从所有关联文件移除，且不可恢复。`,
    confirmText: '删除',
    cancelText: '取消',
  })
  if (!confirmed)
    return
  try {
    await tagStore.remove(tag.id)
    if (store.filter.driveLabel === tag.id)
      store.selectDriveLabel(undefined)
    if (selectedTagIds.value.has(tag.id)) {
      const next = new Set(selectedTagIds.value)
      next.delete(tag.id)
      selectedTagIds.value = next
    }
  }
  catch (e) {
    toast.error(Core.toDrive115Error(e).message)
  }
}

async function deleteBatchSelected() {
  const ids = Array.from(selectedTagIds.value)
  if (ids.length === 0)
    return
  if (ids.length === 1) {
    const tag = findDriveTag(ids[0])
    if (tag) {
      await deleteTag(tag)
      return
    }
  }

  const confirmed = await dialog.confirm({
    title: '批量删除标签',
    content: `将删除选中的 ${ids.length} 个标签，并从所有关联文件移除，且不可恢复。`,
    confirmText: '删除',
    cancelText: '取消',
  })
  if (!confirmed)
    return

  const failed = await tagStore.removeBatch(ids)
  const failedSet = new Set(failed.map(item => item.id))
  for (const id of ids) {
    if (!failedSet.has(id) && store.filter.driveLabel === id)
      store.selectDriveLabel(undefined)
  }
  selectedTagIds.value = failedSet

  if (failed.length > 0) {
    const names = failed.map(f => findDriveTag(f.id)?.name ?? f.id).join('、')
    toast.error(`${failed.length} 个删除失败：${names}`)
    return
  }
  toast.success(`已删除 ${ids.length} 个标签`)
}
</script>
