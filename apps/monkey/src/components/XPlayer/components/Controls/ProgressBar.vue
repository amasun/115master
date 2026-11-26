<template>
  <div
    :class="styles.progressBar.root"
    :data-long-press="isLongPressDragging"
    :data-dragging="isDragging"
    :data-canplay="canplay"
  >
    <!-- 进度条外容器 -->
    <div
      ref="progressBarWrapperRef"
      :class="styles.progressBar.wrapper"
      @mousedown="handleBarWrapperMouseDown"
      @mouseenter="handleBarWrapperMouseEnter"
      @mousemove="handleBarWrapperMouseMoveWithThrottle"
      @mouseleave="handleBarWrapperMouseLeave"
    >
      <!-- 进度条内容器 -->
      <div :class="[styles.progressBar.track]">
        <!-- 原始播放进度（拖拽时保持显示） -->
        <div
          :class="styles.thumb.current"
          :style="{
            transform: `scaleX(${progressValue / 100})`,
            opacity: isDragging ? 0 : 1,
          }"
        />

        <!-- 拖拽时的实时进度 -->
        <div
          v-if="isDragging"
          :class="[styles.thumb.current, styles.thumb.dragging]"
          :style="{ transform: `scaleX(${dragProgress / 100})` }"
        />

        <!-- 预览进度 -->
        <div
          v-show="isPreviewVisible && !isDragging"
          :class="styles.thumb.hover"
          :style="{ transform: `scaleX(${previewProgress / 100})` }"
        />
      </div>

      <!-- 拖拽圆点指示器 -->
      <div
        :class="[
          styles.scrubber.dot,
          isDragging && styles.scrubber.dragging,
        ]"
        :style="{
          left: `${thumbPercent}%`,
        }"
      />

      <!-- 打点刻度层（在 wrapper 层，避免被 track 的 overflow-hidden 裁切） -->
      <div
        v-if="duration > 0 && markerList.length > 0"
        :class="styles.markers.layer"
      >
        <div
          v-for="marker in markerList"
          :key="marker.id"
          :class="styles.markers.itemWrapper"
          :style="{ left: `${Math.min(100, Math.max(0, (marker.time / duration) * 100))}%` }"
          :title="marker.label || formatMarkerTime(marker.time)"
          data-marker-tick
          :data-marker-id="marker.id"
          :data-marker-time="marker.time"
          @mousedown.stop
          @click.stop="handleMarkerClick(marker)"
        >
          <div :class="styles.markers.tick" />
        </div>
      </div>
    </div>
    <!-- 缩略图预览 -->
    <Thumbnail
      ref="thumbnailRef"
      :visible="isPreviewVisible || isDragging"
      :position="isDragging ? dragProgress : previewProgress"
      :time="previewTime"
      :progress-bar-width="progressBarWidth"
    />
  </div>
</template>

<script setup lang="ts">
import type { MarkerItem } from '@/components/XPlayer/types'
import { computed, ref, watch } from 'vue'
import Thumbnail from '@/components/XPlayer/components/Thumbnail/index.vue'
import { usePlayerContext } from '@/components/XPlayer/hooks/usePlayerProvide'
import { clsx } from '@/utils/clsx'
import { formatMarkerTime } from '@/utils/markers'

/** 样式抽象 */
const styles = clsx({
  progressBar: {
    root: [
      'relative',
      'group/progress',
      'hidden',
      'data-[canplay=true]:block',
    ],
    wrapper: 'relative cursor-pointer py-2.5',
    track:
      [
        'h-[3.5px]',
        'group-hover/progress:h-[5.5px]',
        'group-data-[dragging=true]/progress:h-[5.5px]',
        'relative',
        'transition-[height]',
        'duration-150',
        'ease-[var(--ui-ease-standard)]',
        'rounded-full',
        'overflow-hidden',
        'bg-white/25',
      ],
  },
  thumb: {
    current:
      'bg-primary absolute h-full w-full origin-left transition-transform duration-100 ease-[var(--ui-ease-settle)]',
    dragging: 'transition-none',
    hover: 'pointer-events-none absolute h-full w-full origin-left bg-white/35',
  },
  scrubber: {
    dot: [
      'pointer-events-none absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2',
      'ring-primary/90 size-3.5 rounded-full bg-white ring-2',
      'shadow-[0_0_6px_rgba(0,0,0,0.65)]',
      'scale-0 opacity-0 transition-[transform,opacity] duration-150 ease-[var(--ui-ease-standard)]',
      'group-hover/progress:scale-100 group-hover/progress:opacity-100',
      'group-data-[dragging=true]/progress:scale-110 group-data-[dragging=true]/progress:opacity-100',
    ],
    dragging: 'transition-none',
  },
  markers: {
    layer: 'pointer-events-none absolute inset-x-0 top-0 bottom-0',
    itemWrapper: [
      'pointer-events-auto absolute top-0 bottom-0 -translate-x-1/2',
      'z-10 flex w-3 cursor-pointer items-center justify-center',
      'group/marker',
    ],
    tick: [
      'h-2.5 w-[3px] rounded-full bg-amber-400',
      'shadow-[0_0_4px_rgba(0,0,0,0.85)] ring-1 ring-black/30',
      'transition-[transform,height] duration-150 group-hover/marker:scale-125 group-hover/progress:h-3.5',
    ],
  },
})

const { progressBar, playerCore, markers } = usePlayerContext()

const duration = computed(() => progressBar.duration.value)
const markerList = computed(() => markers.list.value)

function handleMarkerClick(marker: MarkerItem) {
  markers.seekTo(marker)
}

/** 缩略图组件引用 */
const thumbnailRef = ref<any>(null)

/** 是否可以播放 */
const canplay = computed(() => {
  return playerCore.value?.canplay ?? false
})

/** 从 hook 中解构所有需要的状态和方法 */
const {
  progressBarWrapperRef,
  progressBarWidth,
  progressValue,
  isDragging,
  dragProgress,
  previewTime,
  previewProgress,
  isPreviewVisible,
  isLongPressDragging,
  handleBarWrapperMouseDown,
  handleBarWrapperMouseEnter,
  handleBarWrapperMouseMoveWithThrottle,
  handleBarWrapperMouseLeave,
  setThumbnailRef,
} = progressBar

/** 拖拽圆点位置百分比 */
const thumbPercent = computed(() => {
  const raw = isDragging.value ? dragProgress.value : progressValue.value
  return Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 0
})

/** 将 thumbnailRef 传递给 hook */
watch(thumbnailRef, (newRef) => {
  setThumbnailRef(newRef)
}, { immediate: true })
</script>
