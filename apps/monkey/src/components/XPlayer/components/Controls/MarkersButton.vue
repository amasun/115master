<template>
  <Button
    ref="buttonRef"
    variant="ghost"
    size="sm"
    :class="styles.btnText.root"
    :disabled="!playerCore?.canplay"
    :title="markerTip"
    @click="toggleMenu"
  >
    <Icon :class="styles.btn.icon" :name="I.MARKER" />
  </Button>
  <Popup
    v-model:visible="menuVisible"
    :trigger="buttonRef"
    placement="top"
  >
    <div :class="styles.popup.container">
      <!-- 顶部添加打点按钮 -->
      <div :class="styles.popup.header">
        <Button
          variant="solid"
          color="primary"
          size="sm"
          class="flex w-full items-center justify-center gap-1.5"
          @click="handleAddMarker"
        >
          <Icon :name="I.PLUS" class="size-4" />
          <span>在当前位置打点</span>
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
              ref="editInputRef"
              v-model="editingLabel"
              type="text"
              :class="styles.popup.input"
              placeholder="输入备注..."
              @keydown.stop
              @keydown.enter="saveEdit(item.id)"
              @keydown.esc="cancelEdit"
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
  popup: {
    container: 'flex flex-col w-72 max-h-80 p-2 gap-2 text-base-content',
    header: 'shrink-0',
    empty: 'py-6 text-center text-sm text-base-content/50',
    list: [
      'flex flex-col gap-1 overflow-y-auto max-h-60',
      ...scrollbar(),
    ],
    row: [
      'flex items-center gap-2 px-2 py-1.5 rounded-lg',
      'hover:bg-base-content/10 cursor-pointer group transition-colors',
    ],
    time: 'badge badge-sm badge-neutral font-mono shrink-0',
    label: 'flex-1 truncate text-xs text-base-content/80',
    actions: 'flex items-center gap-0.5 opacity-80 group-hover:opacity-100 shrink-0',
    editBox: 'flex items-center gap-1 flex-1 min-w-0',
    input: 'input input-xs input-bordered flex-1 min-w-0 bg-base-100 text-base-content',
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

const markerTip = computed(() => {
  const tip = shortcuts.getShortcutsTip('addMarker')
  return `${NAME}${tip}`
})

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
