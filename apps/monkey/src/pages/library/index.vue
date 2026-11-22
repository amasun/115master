<template>
  <div
    class="bg-base-100 text-base-content flex min-h-screen flex-col [--main-content-gutter:calc(var(--spacing)*3)] [--ui-header-gutter:var(--main-content-gutter)] [--ui-header-offset:calc(var(--spacing)*2)] sm:[--main-content-gutter:calc(var(--spacing)*6)]"
  >
    <Layout class="[--navbar-frosted-glass-height:var(--navbar-height)]">
      <Sider>
        <LibrarySider />
      </Sider>
      <Main class="relative flex min-h-screen flex-col">
        <LibraryHeader
          :show-filters="showFilters"
          @toggle-filters="handleToggleFilters"
        />
        <FilterBar v-if="isWall" :visible="showFilters" />
        <RouterView />
      </Main>
    </Layout>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { Layout, Main, Sider } from '@/components'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { setThemeOverride } from '@/utils/theme'
import FilterBar from './components/FilterBar.vue'
import LibraryHeader from './components/LibraryHeader.vue'
import LibrarySider from './components/LibrarySider.vue'

setThemeOverride('dark')

const route = useRoute()
const router = useRouter()
const store = useMediaLibraryStore()
const showFilters = shallowRef(false)
const isWall = computed(() => route.name === 'library')

function handleToggleFilters() {
  if (!isWall.value) {
    showFilters.value = true
    store.scrollTop = 0
    void router.push({ name: 'library' })
    return
  }
  showFilters.value = !showFilters.value
}

onMounted(async () => {
  await store.init()
})

onUnmounted(() => {
  setThemeOverride(null)
})
</script>
