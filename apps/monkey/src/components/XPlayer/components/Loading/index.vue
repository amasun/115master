<template>
  <div :class="styles.container">
    <div :class="styles.spinner" />

    <div
      v-if="playerCore?.type === PlayerCoreType.AvPlayer && (playerCore.stats?.bandwidth ?? 0) > 0"
      :class="styles.speed"
    >
      {{ Math.round((playerCore.stats?.bandwidth ?? 0) / 1024 / 1024 * 100) / 100 }} Mbps/s
    </div>
  </div>
</template>

<script setup lang="ts">
import { PlayerCoreType } from '@/components/XPlayer/hooks/playerCore/types'
import { usePlayerContext } from '@/components/XPlayer/hooks/usePlayerProvide'
import { clsx } from '@/utils/clsx'

/** 样式抽象 */
const styles = clsx({
  container:
    'pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2.5',
  spinner:
    'size-11 animate-spin rounded-full border-[3px] border-white/20 border-t-white shadow-[0_2px_12px_rgba(0,0,0,0.4)]',
  speed:
    'app-font-time rounded-full bg-black/55 px-2.5 py-0.5 text-xs font-medium text-white/85 shadow-sm backdrop-blur-sm',
})

const { playerCore } = usePlayerContext()
</script>
