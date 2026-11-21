<template>
  <div
    ref="rootRef"
    :style="{ '--cover-h': compact ? '96px' : '150px' }"
    :class="[
      props.variant === 'official'
        ? videoCover.isReady
          ? [styles.container.officialMain, compact ? styles.container.alignCompact : styles.container.alignDefault]
          : styles.container.officialPending
        : props.variant === 'official-panel'
          ? [styles.container.officialPanelMain, compact ? styles.container.alignCompact : styles.container.alignDefault]
          : [styles.container.legacyMain, compact ? styles.container.alignCompact : styles.container.alignDefault],
    ]"
  >
    <div
      v-if="props.variant !== 'official' || videoCover.isReady"
      :class="[
        styles.container.content,
        isLegacyVisual && styles.container.legacyContent,
      ]"
    >
      <!-- 错误状态 -->
      <div v-if="props.variant !== 'official' && videoCover.error" :class="styles.states.error">
        <StatusFeedback status="error" size="xs" :padded="false" v-bind="errorFeedback(videoCover.error)" />
      </div>

      <!-- 骨架屏 -->
      <template v-else-if="props.variant !== 'official' && videoCover.isLoading">
        <div :class="[styles.skeleton, props.variant === 'legacy' && styles.legacySkeleton]" />
      </template>

      <!-- 内容 -->
      <div
        v-else-if="videoCover.isReady"
        :id="`gallery-${props.pickCode}`"
        class="pswp-gallery"
        :class="[styles.cover.container, isLegacyVisual && styles.cover.legacyContainer]"
      >
        <a
          v-for="(thumbnail, index) in videoCover.state"
          :key="index"
          :class="[
            styles.cover.thumbItem,
            isLegacyVisual ? styles.cover.legacyThumbItem : styles.cover.officialThumbItem,
          ]"
          @click.prevent.stop="openPhotoSwipe(index)"
        >
          <img
            :src="thumbnail.img"
            :alt="`${isLegacyVisual ? '预览图' : '视频封面'} ${index + 1}`"
            :class="[styles.cover.thumbImage, isLegacyVisual && styles.cover.legacyThumbImage]"
          >
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { StatusFeedback } from '@115master/ui'
import PhotoSwipe from 'photoswipe'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useSmartVideoCover } from '@/hooks/useVideoCover'
import { clsx } from '@/utils/clsx'
import { errorFeedback } from '@/utils/errorFeedback'
import { useUserSetting } from '@/utils/userSettings'
import 'photoswipe/style.css'

const props = withDefaults(defineProps<{
  pickCode: string
  sha1: string
  duration: number | string
  listScrollBoxNode: HTMLElement
  variant?: 'legacy' | 'official' | 'official-panel'
}>(), {
  variant: 'legacy',
})

/** 新旧页面共用旧版预览条视觉，保留 official 的延迟挂载策略。 */
const isLegacyVisual = props.variant === 'legacy'
  || props.variant === 'official'
  || props.variant === 'official-panel'

/** 显示与截图张数（用户设置，非法值回退到 6） */
const count = useUserSetting('filelistPreviewCount')
/** 紧凑布局下缩小预览条高度 */
const compact = useUserSetting('compactAvInfo')

/** 样式常量定义 */
const styles = clsx({
  // 容器样式（与 ExtInfo 封面图左边缘对齐：宽大 ml-34 + px-16 = 50px，紧凑 ml-34 + px-0 = 34px）
  container: {
    legacyMain: 'mr-[74px] box-border h-[var(--cover-h)] !w-auto [content-visibility:auto]',
    officialMain: 'mr-[74px] box-border h-[var(--cover-h)] !w-auto [content-visibility:auto]',
    officialPanelMain: 'mr-[74px] box-border h-[var(--cover-h)] !w-auto [content-visibility:auto]',
    alignDefault: 'ml-[50px]',
    alignCompact: 'ml-[34px]',
    officialPending: 'h-px overflow-hidden',
    content:
      'bg-base-300 relative flex h-full items-center overflow-hidden rounded',
    legacyContent: '!rounded-none !bg-transparent',
  },
  // 状态样式
  states: {
    error: 'flex flex-1 items-center justify-center',
  },
  // 骨架样式
  skeleton: 'skeleton h-full w-full rounded',
  legacySkeleton: '!rounded-none',
  // 视频封面
  cover: {
    container: [
      'flex h-full w-full overflow-hidden select-none',
    ],
    legacyContainer: 'justify-start gap-px overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
    thumbItem: [
      'h-full',
      'cursor-zoom-in no-underline',
      'transition-opacity ease-[var(--ui-ease-standard)] hover:opacity-90',
    ],
    officialThumbItem: 'aspect-video overflow-hidden',
    legacyThumbItem: '!h-[var(--cover-h)] !w-auto',
    thumbImage: ['h-full w-full object-contain object-center align-top'],
    legacyThumbImage: '!h-[var(--cover-h)] !w-auto !object-cover',
  },
})

/** 根元素引用 */
const rootRef = ref<HTMLElement>()
/** PhotoSwipe 实例 */
const lightbox = ref<PhotoSwipeLightbox | null>(null)

/** 滚动目标 ref（用于 useScroll） */
const scrollTargetRef = computed(() => props.listScrollBoxNode)

/** 选项 */
const options = computed(() => ({
  sha1: props.sha1,
  pickCode: props.pickCode,
  coverNum: Number.isInteger(count.value) && count.value > 0 ? count.value : 6,
  duration: Number(props.duration),
}))

/** 配置 */
const config = {
  elementRef: rootRef,
  scrollTarget: scrollTargetRef,
}

/** smart 视频封面 hook */
const { videoCover } = useSmartVideoCover(options, config)

/** 初始化 PhotoSwipe */
function initPhotoSwipe() {
  if (lightbox.value) {
    lightbox.value.destroy()
    lightbox.value = null
  }

  lightbox.value = new PhotoSwipeLightbox({
    dataSource: videoCover.state.map(item => ({
      src: item.img,
      width: item.width,
      height: item.height,
      alt: isLegacyVisual ? '预览图' : '视频封面',
    })),
    showHideAnimationType: 'fade',
    pswpModule: PhotoSwipe,
    mouseMovePan: true,
    initialZoomLevel: 'fit',
    secondaryZoomLevel: 2,
    maxZoomLevel: 4,
    wheelToZoom: true,
    bgOpacity: 0.9,
  })

  lightbox.value.init()
}

/** 打开 PhotoSwipe */
function openPhotoSwipe(index: number) {
  if (!lightbox.value || !videoCover.isReady)
    return
  lightbox.value.loadAndOpen(index)
}

// 监听有效图片变化，初始化 PhotoSwipe
watch(
  () => videoCover.isReady,
  async (isReady) => {
    if (isReady) {
      await nextTick()
      initPhotoSwipe()
    }
  },
)

// 组件销毁时清理
onBeforeUnmount(() => {
  if (lightbox.value) {
    lightbox.value.destroy()
    lightbox.value = null
  }
})
</script>
