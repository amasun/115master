<template>
  <div
    v-if="store.filter.actor"
    class="flex w-full flex-col gap-5 px-(--main-content-gutter) lg:flex-row lg:items-start"
  >
    <div class="min-w-0 flex-1 [&_>div]:px-0">
      <PosterGrid />
    </div>
    <ActorProfileRail :actor-name="store.filter.actor" />
  </div>
  <PosterGrid v-else />
</template>

<script setup lang="ts">
import { useTitle } from '@vueuse/core'
import { nextTick, onMounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import ActorProfileRail from './components/ActorProfileRail.vue'
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
