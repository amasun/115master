<template>
  <div
    :class="styles.root"
    :data-canplay="playerCore?.canplay"
  >
    <span class="text-white/95">{{ formatTime(playerCore?.currentTime) }}</span>
    <span class="text-white/40">/</span>
    <span class="text-white/65">{{ formatTime(playerCore?.duration) }}</span>
  </div>
</template>

<script setup lang="ts">
import { usePlayerContext } from '@/components/XPlayer/hooks/usePlayerProvide'
import { formatTime } from '@/components/XPlayer/utils/time'
import { clsx } from '@/utils/clsx'

const { playerCore } = usePlayerContext()

const styles = clsx({
  root: [
    'flex items-center gap-1 whitespace-nowrap select-none',
    'px-2',
    'text-[13px]',
    'font-medium',
    'app-font-time',
  ],
})
</script>
