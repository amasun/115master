<template>
  <transition
    enter-active-class="transition-all duration-200 ease-[var(--ui-ease-enter)]"
    leave-active-class="transition-all duration-200 ease-[var(--ui-ease-exit)]"
    enter-from-class="opacity-0 translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-2"
  >
    <div
      v-if="currentSubtitle"
      :class="[styles.root]"
    >
      <Icon :name="I.SUBTITLES" :class="[styles.icon]" />
      <SubtitleDisplay
        :label="currentSubtitle.label"
        :format="currentSubtitle.format"
        :source="currentSubtitle.source"
        :subtitle-index="subtitles.currentIndex.value"
        :total="subtitles.total.value"
      />
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SubtitleDisplay from '@/components/XPlayer/components/SubtitleDisplay.vue'
import { usePlayerContext } from '@/components/XPlayer/hooks/usePlayerProvide'
import { I, Icon } from '@/icons'
import { clsx } from '@/utils/clsx'

const { subtitles, controls, progressBar } = usePlayerContext()

const styles = clsx({
  root: [
    'absolute bottom-22 left-5',
    'inline-flex items-center gap-2.5 px-3.5 py-2',
    'rounded-xl border border-white/10',
    'bg-black/72 shadow-lg backdrop-blur-md',
    'text-xs text-white/90',
    'pointer-events-none',
  ],
  icon: 'size-5 shrink-0 text-white/80',
})

/** 当前字幕 */
const currentSubtitle = computed(() => {
  if (!subtitles.current.value) {
    return null
  }
  if (!controls.visible.value
    || progressBar.isHovering.value
  ) {
    return null
  }
  return subtitles.current.value
})
</script>
