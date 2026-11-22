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
          @toggle-filters="handleToggleFilters"
        />
        <FilterBar v-if="!isDetail" :visible="showFilters" />
        <RouterView />
      </Main>
    </Layout>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { Layout, Main, Sider } from '@/components'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import FilterBar from './components/FilterBar.vue'
import LibraryHeader from './components/LibraryHeader.vue'
import LibrarySider from './components/LibrarySider.vue'

const route = useRoute()
const router = useRouter()
const store = useMediaLibraryStore()
const showFilters = shallowRef(false)
const isDetail = computed(() => route.name === 'library-detail')

function handleToggleFilters() {
  if (isDetail.value) {
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
</script>
