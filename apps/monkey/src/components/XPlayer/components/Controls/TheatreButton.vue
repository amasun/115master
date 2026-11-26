<template>
  <Button
    v-if="!fullscreen.isFullscreen.value"
    variant="ghost"
    shape="circle"
    :class="controlStyles.btn.root"
    :title="tip"
    @click="fullscreen.toggleTheatre"
  >
    <Icon :class="controlStyles.btn.icon" :name="icon" />
  </Button>
</template>

<script setup lang="ts">
import { Button } from '@115master/ui'
import { computed } from 'vue'
import { usePlayerContext } from '@/components/XPlayer/hooks/usePlayerProvide'
import { controlStyles } from '@/components/XPlayer/styles/common'
import { I, Icon } from '@/icons'

const { fullscreen, shortcuts } = usePlayerContext()

const icon = computed(() => fullscreen.theatre.value
  ? I.THEATRE_EXIT
  : I.THEATRE)

const tip = computed(() => {
  const name = fullscreen.theatre.value ? '正常模式' : '剧院模式'
  return `${name}${shortcuts.getShortcutsTip('toggleTheatre')}`
})
</script>
