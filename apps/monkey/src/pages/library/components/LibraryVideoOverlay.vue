<template>
  <Teleport to="body">
    <div
      v-if="store.playerOverlayPickCode"
      role="dialog"
      aria-modal="true"
      aria-label="浮窗播放器"
      class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-2 backdrop-blur-sm sm:p-5"
      @click="store.closePlayerOverlay()"
    >
      <div
        class="bg-base-100 relative my-auto w-full max-w-[1440px] overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
        @click.stop
      >
        <VideoPage
          :pick-code="store.playerOverlayPickCode"
          :overlay="true"
          @close="store.closePlayerOverlay()"
          @select-pick-code="store.openPlayerOverlay"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { defineAsyncComponent, onUnmounted, watch } from 'vue'
import { useMediaLibraryStore } from '@/store/mediaLibrary'

const VideoPage = defineAsyncComponent(() => import('@/pages/video/index.vue'))

const store = useMediaLibraryStore()
let previousBodyOverflow: string | null = null

function restoreBodyOverflow() {
  if (previousBodyOverflow === null)
    return
  document.body.style.overflow = previousBodyOverflow
  previousBodyOverflow = null
}

watch(
  () => store.playerOverlayPickCode,
  (code) => {
    if (code) {
      if (previousBodyOverflow === null) {
        previousBodyOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
      }
      return
    }
    restoreBodyOverflow()
  },
  { immediate: true },
)

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (!store.playerOverlayPickCode || event.key !== 'Escape')
    return
  if (document.fullscreenElement)
    return
  store.closePlayerOverlay()
})

onUnmounted(() => {
  restoreBodyOverflow()
})
</script>
