<template>
  <div
    class="bg-base-100 text-base-content flex min-h-screen flex-col [--main-content-gutter:calc(var(--spacing)*3)] [--ui-header-gutter:var(--main-content-gutter)] [--ui-header-offset:calc(var(--spacing)*2)] sm:[--main-content-gutter:calc(var(--spacing)*6)]"
  >
    <Layout
      :class="store.tagRailOpen ? '[--rail2-width:0px] sm:[--rail2-width:calc(var(--spacing)*62)]' : '[--rail2-width:0px]'"
      class="[--navbar-frosted-glass-height:var(--navbar-height)]"
    >
      <Sider>
        <LibrarySider />
      </Sider>
      <LibraryTagRail />
      <Main class="relative flex min-h-screen flex-col">
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

function handleToggleFilters() {
  if (!isWall.value) {
    showFilters.value = true
    store.scrollTop = 0
    void router.push({ name: 'library' })
    return
  }
  showFilters.value = !showFilters.value
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
