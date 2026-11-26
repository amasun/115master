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
        class="library-video-overlay-shell flex w-full flex-col gap-2.5"
        @click.stop
      >
        <div
          v-if="overlayCode || overlayTitle"
          class="flex items-start justify-between gap-3 px-1"
        >
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-center gap-2">
              <span
                v-if="overlayCode"
                class="shrink-0 rounded-md bg-white/15 px-2 py-0.5 font-mono text-xs font-semibold tracking-wide text-white"
              >
                {{ overlayCode }}
              </span>
              <h2
                v-if="overlayTitle"
                class="min-w-0 truncate text-sm font-semibold text-white/95 sm:text-base"
                :title="overlayTitle"
              >
                {{ overlayTitle }}
              </h2>
            </div>
            <p
              v-if="overlayMetaSub"
              class="mt-0.5 truncate text-xs text-white/60"
              :title="overlayMetaSub"
            >
              {{ overlayMetaSub }}
            </p>
          </div>
          <button
            type="button"
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/75 transition-colors hover:bg-white/20 hover:text-white"
            aria-label="关闭播放器"
            title="关闭 (Esc)"
            @click="store.closePlayerOverlay()"
          >
            <Icon :name="I.CLOSE" class="text-base" />
          </button>
        </div>

        <div class="library-video-overlay-card bg-base-100 relative w-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
          <VideoPage
            :pick-code="store.playerOverlayPickCode"
            :overlay="true"
            :start-time="store.playerOverlayStartTime ?? undefined"
            @close="store.closePlayerOverlay()"
            @select-pick-code="code => store.openPlayerOverlay(code)"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { computed, defineAsyncComponent, onUnmounted, watch } from 'vue'
import { I, Icon } from '@/icons'
import { useMediaLibraryStore } from '@/store/mediaLibrary'

const VideoPage = defineAsyncComponent(() => import('@/pages/video/index.vue'))

const store = useMediaLibraryStore()
let previousBodyOverflow: string | null = null

const activeEntry = computed(() => {
  const pickCode = store.playerOverlayPickCode
  if (!pickCode)
    return undefined
  return store.entries.find(entry => entry.files.some(file => file.pickCode === pickCode))
})

const activeFile = computed(() => {
  const pickCode = store.playerOverlayPickCode
  if (!pickCode)
    return undefined
  return activeEntry.value?.files.find(file => file.pickCode === pickCode)
    ?? store.videos.find(video => video.pickCode === pickCode)
})

const overlayCode = computed(() => activeEntry.value?.externalId || '')
const overlayTitle = computed(() => activeEntry.value?.meta?.title || activeFile.value?.name || '')
const overlayMetaSub = computed(() => {
  const meta = activeEntry.value?.meta
  if (!meta)
    return ''
  const parts: string[] = []
  const dateText = meta.releaseDate || (meta.year ? String(meta.year) : '')
  if (dateText)
    parts.push(dateText)
  if (meta.actors.length > 0)
    parts.push(meta.actors.slice(0, 3).map(actor => actor.name).join(' / '))
  return parts.join(' · ')
})

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
  padding-top: max(0.75rem, calc((100dvh - var(--overlay-player-h) - 3.25rem) / 2));
}

@media (min-width: 640px) {
  .library-video-overlay {
    --overlay-px: 2.5rem;
  }
}

.library-video-overlay-shell {
  max-width: var(--overlay-player-w);
}
</style>
