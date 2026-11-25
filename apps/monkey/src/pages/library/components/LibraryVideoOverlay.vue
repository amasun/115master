<template>
  <Teleport to="body">
    <div
      v-if="store.playerOverlayPickCode"
      role="dialog"
      aria-modal="true"
      aria-label="浮窗播放器"
      class="library-video-overlay ui-z-host fixed inset-0 flex items-start justify-center overflow-y-auto bg-black/75 px-2 pb-6 backdrop-blur-sm sm:px-5 sm:pb-10"
      @click="store.closePlayerOverlay()"
    >
      <div
        class="library-video-overlay-card bg-base-100 relative w-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
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

<style scoped>
.library-video-overlay {
  --overlay-px: 1rem;
  --overlay-player-w: min(calc(100vw - var(--overlay-px)), 1440px, calc(82dvh * 16 / 9));
  --overlay-player-h: calc(var(--overlay-player-w) * 9 / 16);
  padding-top: max(1rem, calc((100dvh - var(--overlay-player-h)) / 2));
}

@media (min-width: 640px) {
  .library-video-overlay {
    --overlay-px: 2.5rem;
  }
}

.library-video-overlay-card {
  max-width: var(--overlay-player-w);
}
</style>
