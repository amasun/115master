<template>
  <div
    class="library-spotify-shell flex min-h-screen flex-col bg-[#121215] text-[#F4F4F5] [--main-content-gutter:calc(var(--spacing)*3)] [--ui-header-gutter:var(--main-content-gutter)] [--ui-header-offset:calc(var(--spacing)*2)] sm:[--main-content-gutter:calc(var(--spacing)*6)]"
  >
    <Layout
      :class="store.tagRailOpen ? '[--rail2-width:0px] sm:[--rail2-width:calc(var(--spacing)*62)]' : '[--rail2-width:0px]'"
      class="[--navbar-frosted-glass-height:var(--navbar-height)]"
    >
      <Sider>
        <LibrarySider />
      </Sider>
      <LibraryTagRail />
      <Main class="relative flex min-h-screen flex-col bg-[#121215]">
        <!-- 顶部极克制环境光渐变 -->
        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-0 top-0 h-72 transition-colors duration-500"
          :style="{
            background: store.filter.view === 'cinema'
              ? 'radial-gradient(ellipse 75% 60% at 30% -10%, rgba(139, 92, 246, 0.11), transparent 72%)'
              : 'radial-gradient(ellipse 75% 60% at 30% -10%, rgba(182, 245, 8, 0.08), transparent 72%)',
          }"
        />
        <LibraryHeader
          v-if="!isTags"
          :show-filters="showFilters"
          @toggle-filters="handleToggleFilters"
        />
        <FilterBar v-if="isWall" :visible="showFilters" />
        <RouterView />
      </Main>
    </Layout>
    <MediaImagePickerDialog />
    <LibraryVideoOverlay />
  </div>
</template>

<script setup lang="ts">
import type { LibraryView } from '@/utils/mediaIndex'
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { Layout, Main, Sider, useToast } from '@/components'
import { useCloudDownloadAction } from '@/hooks/useDriveAction/useCloudDownloadAction'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { setThemeOverride } from '@/utils/theme'
import FilterBar from './components/FilterBar.vue'
import LibraryHeader from './components/LibraryHeader.vue'
import LibrarySider from './components/LibrarySider.vue'
import LibraryTagRail from './components/LibraryTagRail.vue'
import LibraryVideoOverlay from './components/LibraryVideoOverlay.vue'
import MediaImagePickerDialog from './components/MediaImagePickerDialog.vue'

setThemeOverride('dark')

const route = useRoute()
const router = useRouter()
const store = useMediaLibraryStore()
const cloudAction = useCloudDownloadAction()
const toast = useToast()
const showFilters = shallowRef(false)
const isWall = computed(() => route.name === 'library')
const isTags = computed(() => route.name === 'library-tags')

function parseRouteView(raw: unknown): LibraryView {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === 'all' || value === 'starred' || value === 'marked')
    return value
  if (value === 'cinema')
    return store.enableCinemaLibrary ? 'cinema' : 'all'
  if (typeof value === 'string' && value.startsWith('section:')) {
    const id = value.slice('section:'.length)
    if (store.customSections.some(s => s.id === id))
      return value as LibraryView
  }
  return 'all'
}

watch(
  [() => route.name, () => route.query.view, () => route.query.tags],
  ([name, view, tags]) => {
    if (name !== 'library') {
      if (store.tagRailOpen)
        store.setTagRailOpen(false)
      return
    }
    const rawTags = Array.isArray(tags) ? tags[0] : tags
    const wantsTagRail = rawTags === '1' || rawTags === 'true'
    const nextView: LibraryView = wantsTagRail ? 'all' : parseRouteView(view)
    if (store.filter.view !== nextView)
      store.setView(nextView)
    if (store.tagRailOpen !== wantsTagRail)
      store.setTagRailOpen(wantsTagRail)
  },
  { immediate: true },
)

watch(
  () => store.tagRailOpen,
  (open) => {
    if (route.name !== 'library')
      return
    const rawTags = Array.isArray(route.query.tags) ? route.query.tags[0] : route.query.tags
    const hasTagsQuery = rawTags === '1' || rawTags === 'true'
    if (open) {
      if (store.filter.view !== 'all')
        store.setView('all')
      if (!hasTagsQuery || route.query.view) {
        const nextQuery = { ...route.query }
        delete nextQuery.view
        nextQuery.tags = '1'
        void router.replace({ name: 'library', query: nextQuery })
      }
      return
    }
    if (hasTagsQuery) {
      const nextQuery = { ...route.query }
      delete nextQuery.tags
      void router.replace({ name: 'library', query: nextQuery })
    }
  },
)

watch(
  () => store.filter.view,
  (view) => {
    if (route.name !== 'library')
      return
    const targetView = view === 'all' ? undefined : view
    const currentView = Array.isArray(route.query.view) ? route.query.view[0] : route.query.view
    if (currentView === targetView)
      return
    const nextQuery = { ...route.query }
    if (targetView)
      nextQuery.view = targetView
    else
      delete nextQuery.view
    void router.replace({ name: 'library', query: nextQuery })
  },
)

function handleToggleFilters() {
  if (!isWall.value) {
    showFilters.value = true
    store.scrollTop = 0
    void router.push({ name: 'library' })
    return
  }
  const next = !showFilters.value
  showFilters.value = next
  if (!next)
    store.resetSubFilters()
}

async function consumeOfflineUrl() {
  const raw = route.query.offline_url
  const offlineUrl = Array.isArray(raw) ? raw[0] : raw
  if (!offlineUrl)
    return

  const nextQuery = { ...route.query }
  delete nextQuery.offline_url
  void router.replace({ query: nextQuery })
  const ok = await cloudAction.cloudDownload('', [], offlineUrl)
  if (!ok)
    return
  toast.info('离线任务已提交，稍后将自动增量同步并刮削新入库作品')
  store.scheduleOfflineIncrementalSync({
    onSynced: ({ addedCount, queuedScrapeCount }) => {
      toast.success(
        queuedScrapeCount > 0
          ? `已增量入库 ${addedCount} 部新作品，正在自动刮削 ${queuedScrapeCount} 部`
          : `已增量入库 ${addedCount} 部新作品`,
      )
    },
  })
}

watch(
  () => route.query.offline_url,
  () => {
    void consumeOfflineUrl()
  },
)

onMounted(async () => {
  void consumeOfflineUrl()
  await store.init()
})

onUnmounted(() => {
  setThemeOverride(null)
})
</script>

<style scoped>
.library-spotify-shell :deep(aside[aria-label='主导航']) {
  background: #09090b;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  box-shadow: none;
}
</style>
