<template>
  <Button
    variant="ghost"
    shape="circle"
    :class="[controlStyles.btn.root, { 'swap-active': !fullscreen.isFullscreen.value }]"
    :title="fullscreenTip"
    @click="fullscreen.toggleFullscreen"
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

const icon = computed(() => {
  return fullscreen.isFullscreen.value
    ? I.FULLSCREEN_EXIT
    : I.FULLSCREEN
})

const NAME = '全屏'

const fullscreenTip = computed(() => {
  const tip = shortcuts.getShortcutsTip('toggleFullscreen')
  return `${NAME}${tip}`
})
</script>
