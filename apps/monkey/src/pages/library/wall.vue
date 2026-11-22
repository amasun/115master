<template>
  <PosterGrid />
</template>

<script setup lang="ts">
import { useTitle } from '@vueuse/core'
import { nextTick, onMounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import PosterGrid from './components/PosterGrid.vue'

useTitle('影视库 · 115Master Fusion')

const store = useMediaLibraryStore()

onMounted(async () => {
  await store.init()
  if (store.scrollTop > 0) {
    await nextTick()
    requestAnimationFrame(() => {
      window.scrollTo({ top: store.scrollTop, behavior: 'auto' })
    })
  }
})

onBeforeRouteLeave(() => {
  store.scrollTop = window.scrollY
})
</script>
