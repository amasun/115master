<template>
  <div
    class="flex min-h-screen flex-col [--main-content-gutter:calc(var(--spacing)*3)] [--ui-header-gutter:var(--main-content-gutter)] [--ui-header-offset:calc(var(--spacing)*2)] sm:[--main-content-gutter:calc(var(--spacing)*6)]"
  >
    <Layout class="[--navbar-frosted-glass-height:var(--navbar-height)]">
      <Sider>
        <LibrarySider />
      </Sider>
      <Main class="relative flex min-h-screen flex-col">
        <LibraryHeader
          :show-filters="showFilters"
          @toggle-filters="showFilters = !showFilters"
        />
        <FilterBar :visible="showFilters" />
        <PosterGrid />
      </Main>
    </Layout>
  </div>
</template>

<script setup lang="ts">
import { useTitle } from '@vueuse/core'
import { nextTick, onMounted, shallowRef } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { Layout, Main, Sider } from '@/components'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import FilterBar from './components/FilterBar.vue'
import LibraryHeader from './components/LibraryHeader.vue'
import LibrarySider from './components/LibrarySider.vue'
import PosterGrid from './components/PosterGrid.vue'

useTitle('影视库 · 115Master Fusion')

const store = useMediaLibraryStore()
const showFilters = shallowRef(false)

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
