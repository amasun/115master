<template>
  <Button
    ref="buttonRef"
    variant="ghost"
    shape="circle"
    class="relative"
    :class="styles.btn.root"
    :disabled="!playerCore?.canplay"
    :title="markerTip"
    @click="toggleMenu"
  >
    <Icon :class="styles.btn.icon" :filled="markerList.length > 0" :name="I.MARKER" />
    <span
      v-if="markerList.length > 0"
      :class="styles.activeDot"
    />
  </Button>
  <Popup
    v-model:visible="menuVisible"
    :trigger="buttonRef"
    placement="top"
  >
    <div :class="styles.popup.container">
      <!-- 顶部添加打点按钮与保存方式提示 -->
      <div :class="styles.popup.header">
        <div :class="styles.popup.storageRow">
          <span class="text-white/55">保存方式</span>
          <span
            class="badge badge-xs rounded-full font-normal"
            :class="storageBadge.badgeClass"
            :title="storageBadge.title"
          >
            {{ storageBadge.label }}
          </span>
        </div>
        <Button
          variant="solid"
          color="primary"
          size="sm"
          class="flex w-full items-center justify-center gap-1.5"
          @click="handleAddMarker"
        >
          <Icon :name="I.PLUS" class="size-4" />
          <span>在当前位置打点</span>
          <kbd
            v-if="addMarkerKey"
            class="rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px] leading-none"
          >
            {{ addMarkerKey }}
          </kbd>
        </Button>
      </div>

      <!-- 打点列表 -->
      <div v-if="markerList.length === 0" :class="styles.popup.empty">
        暂无打点
      </div>
      <ul v-else :class="styles.popup.list">
        <li
          v-for="item in markerList"
          :key="item.id"
          :class="styles.popup.row"
          data-marker-item
          @click="handleSeek(item)"
        >
          <!-- 时间 -->
          <span :class="styles.popup.time">
            {{ formatMarkerTime(item.time) }}
          </span>

          <!-- 行内编辑状态 -->
          <div v-if="editingId === item.id" :class="styles.popup.editBox" @click.stop>
            <input
              :ref="(el) => { if (el) editInputRef = el as HTMLInputElement }"
              v-model="editingLabel"
              type="text"
              :class="styles.popup.input"
              placeholder="输入备注..."
              @keydown.stop
              @keydown.enter.stop="saveEdit(item.id)"
              @keydown.esc.stop="cancelEdit"
            >
            <Button
              variant="ghost"
              size="xs"
              shape="circle"
              title="保存"
              @click.stop="saveEdit(item.id)"
            >
              <Icon :name="I.TOAST_SUCCESS" class="text-success size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              shape="circle"
              title="取消"
              @click.stop="cancelEdit"
            >
              <Icon :name="I.CLOSE" class="size-3.5" />
            </Button>
          </div>

          <!-- 正常展示状态 -->
          <template v-else>
            <span :class="styles.popup.label" :title="item.label || '未命名打点'">
              {{ item.label || '未命名打点' }}
            </span>
            <div :class="styles.popup.actions" @click.stop>
              <Button
                variant="ghost"
                size="xs"
                shape="circle"
                title="修改备注"
                data-marker-edit
                @click.stop="startEdit(item)"
              >
                <Icon :name="I.RENAME" class="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="xs"
                shape="circle"
                title="删除"
                data-marker-delete
                @click.stop="handleDelete(item.id)"
              >
                <Icon :name="I.DELETE" class="text-error size-3.5" />
              </Button>
            </div>
          </template>
        </li>
      </ul>

      <!-- 快捷键提示 -->
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-[11px] text-white/55">
        <span
          v-for="hint in markerShortcutHints"
          :key="hint.label"
          class="inline-flex items-center gap-1"
        >
          <kbd class="rounded border border-white/15 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] leading-none text-white/85">
            {{ hint.key }}
          </kbd>
          <span>{{ hint.label }}</span>
        </span>
      </div>
    </div>
  </Popup>
</template>

<script setup lang="ts">
import type { MarkerItem } from '@/components/XPlayer/types'
import { Button, scrollbar } from '@115master/ui'
import { computed, nextTick, ref, shallowRef } from 'vue'
import Popup from '@/components/XPlayer/components/Popup/index.vue'
import { usePlayerContext } from '@/components/XPlayer/hooks/usePlayerProvide'
import { controlStyles } from '@/components/XPlayer/styles/common'
import { I, Icon } from '@/icons'
import { clsx } from '@/utils/clsx'
import { formatMarkerTime } from '@/utils/markers'

const styles = clsx({
  btn: controlStyles.btn,
  btnText: controlStyles.btnText,
  activeDot: 'pointer-events-none absolute top-1.5 right-1.5 size-1.5 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.9)]',
  popup: {
    container: 'flex max-h-80 w-72 flex-col gap-2 p-2.5 text-white/90',
    header: 'flex shrink-0 flex-col gap-1.5',
    storageRow: 'flex items-center justify-between px-0.5 text-[11px] text-white/60',
    empty: 'py-6 text-center text-xs text-white/45',
    list: [
      'flex max-h-60 flex-col gap-1 overflow-y-auto',
      ...scrollbar(),
    ],
    row: [
      'flex items-center gap-2 rounded-lg px-2 py-1.5',
      'group cursor-pointer transition-colors hover:bg-white/10',
    ],
    time: 'app-font-time shrink-0 rounded bg-white/12 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white/90',
    label: 'flex-1 truncate text-xs text-white/85',
    actions: 'flex shrink-0 items-center gap-0.5 opacity-80 group-hover:opacity-100',
    editBox: 'flex min-w-0 flex-1 items-center gap-1',
    input: 'input input-xs focus:border-primary h-6 min-w-0 flex-1 border-white/20 bg-white/10 text-xs text-white placeholder:text-white/40',
  },
})

const NAME = '打点'

const { markers, playerCore, shortcuts } = usePlayerContext()
const menuVisible = shallowRef(false)
const buttonRef = ref<HTMLElement>()
const editInputRef = ref<HTMLInputElement>()

const editingId = shallowRef<string | null>(null)
const editingLabel = ref('')

const markerList = computed(() => markers.list.value)

const storageBadge = computed(() => {
  const mode = markers.storageMode?.value ?? 'local'
  if (mode === 'file_desc') {
    return {
      label: '115 备注保存',
      badgeClass: 'badge-success badge-soft',
      title: '打点会自动同步保存到 115 文件备注，同时保留本地缓存',
    }
  }
  if (mode === 'local_truncated') {
    return {
      label: '本地保存（备注已满）',
      badgeClass: 'badge-warning badge-soft',
      title: '115 文件备注长度已达上限，超出的打点仅保存在本地',
    }
  }
  return {
    label: '本地保存',
    badgeClass: 'badge-neutral badge-soft',
    title: '当前仅保存在本地浏览器，可在偏好设置中开启「同步打点到 115 文件备注」',
  }
})

const markerTip = computed(() => {
  const tip = shortcuts.getShortcutsTip('addMarker')
  return `${NAME}${tip}`
})

function formatShortcutKey(keys: string[] | undefined, fallback: string): string {
  const first = keys?.[0]?.trim() || fallback
  return first.length === 1 && /^[a-z]$/i.test(first) ? first.toUpperCase() : first
}

const addMarkerKey = computed(() =>
  formatShortcutKey(shortcuts.mergedActionKeyBindings?.value?.addMarker, 'b'),
)

const markerShortcutHints = computed(() => [
  { key: addMarkerKey.value, label: '打点' },
  { key: formatShortcutKey(shortcuts.mergedActionKeyBindings?.value?.prevMarker, ','), label: '上一个' },
  { key: formatShortcutKey(shortcuts.mergedActionKeyBindings?.value?.nextMarker, '.'), label: '下一个' },
])

/** 切换菜单 */
function toggleMenu() {
  menuVisible.value = !menuVisible.value
}

/** 当前位置打点 */
function handleAddMarker() {
  markers.addAtCurrentTime()
}

/** 跳转到打点 */
function handleSeek(item: MarkerItem) {
  if (editingId.value === item.id) {
    return
  }
  markers.seekTo(item)
}

/** 开始编辑备注 */
function startEdit(item: MarkerItem) {
  editingId.value = item.id
  editingLabel.value = item.label
  void nextTick(() => {
    editInputRef.value?.focus()
  })
}

/** 保存备注编辑 */
function saveEdit(id: string) {
  markers.update(id, { label: editingLabel.value.trim() })
  editingId.value = null
  editingLabel.value = ''
}

/** 取消编辑 */
function cancelEdit() {
  editingId.value = null
  editingLabel.value = ''
}

/** 删除打点 */
function handleDelete(id: string) {
  if (editingId.value === id) {
    cancelEdit()
  }
  markers.remove(id)
}
</script>
