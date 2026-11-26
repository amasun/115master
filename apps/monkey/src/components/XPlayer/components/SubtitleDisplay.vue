<template>
  <div :class="styles.root">
    <div :class="styles.itemContent">
      <!-- 第一行：序号 + 字幕名称 -->
      <div :class="styles.firstLine">
        <span :class="styles.label">{{ label }}</span>
      </div>
      <!-- 第二行：格式 + 来源 + 操作按钮 -->
      <div :class="styles.secondLine">
        <span v-if="subtitleIndex !== null" :class="[styles.badge, tone]">
          No.{{ subtitleIndex }}
        </span>
        <span v-if="format" :class="[styles.badge, tone]">
          {{ format.toUpperCase() }}
        </span>
        <span v-if="source" :class="[styles.badge, tone]">
          {{ source }}
        </span>
        <div v-if="showActions" :class="styles.actions">
          <Button
            variant="soft"
            size="xs"
            shape="circle"
            :class="[styles.action, active && styles.actionActive]"
            :title="`查看 ${label}`"
            :aria-label="`查看 ${label}`"
            @click.stop="emit('view')"
          >
            <Icon :class="styles.actionIcon" :name="I.VIEW" />
          </Button>
          <Button
            variant="soft"
            size="xs"
            shape="circle"
            :class="[styles.action, active && styles.actionActive]"
            :title="`下载 ${label}`"
            :aria-label="`下载 ${label}`"
            @click.stop="emit('download')"
          >
            <Icon :class="styles.actionIcon" :name="I.DOWNLOAD" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@115master/ui'
import { computed } from 'vue'
import { I, Icon } from '@/icons'
import { clsx } from '@/utils/clsx'

interface Props {
  label: string
  format?: string
  source?: string
  subtitleIndex: number | null
  total: number
  showActions?: boolean
  /** 是否为菜单选中项（primary 底色，需切换前景色调） */
  active?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showActions: false,
  active: false,
})

const emit = defineEmits<{
  view: []
  download: []
}>()

/** badge 色调：选中态使用主题高亮色，未选中态使用暗底柔光芯片 */
const tone = computed(() => props.active
  ? 'bg-primary/25 text-primary'
  : 'bg-white/10 text-white/65')

const styles = clsx({
  root: 'flex w-full items-center gap-2',
  itemContent: 'flex min-w-0 flex-1 flex-col gap-1.5',
  firstLine: 'flex items-center gap-2',
  secondLine: 'flex items-center gap-1.5',
  label: 'line-clamp-2 text-[13px] leading-snug font-medium break-all text-white/92',
  badge: 'rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
  actions: 'ml-auto flex items-center gap-1 border-l border-white/15 pl-2',
  action: [
    'size-7 min-h-7 flex-shrink-0 p-0',
    'border border-white/15 bg-white/10 text-white/85',
    'hover:border-white/30 hover:bg-white/20 hover:text-white',
  ],
  actionActive: [
    'border-primary/40 bg-primary/20 text-primary',
    'hover:bg-primary/30',
  ],
  actionIcon: 'size-4',
})
</script>
