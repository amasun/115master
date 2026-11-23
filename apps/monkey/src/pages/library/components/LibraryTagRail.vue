<template>
  <!-- 桌面端紧邻主侧边栏右侧的平行 rail2 -->
  <aside
    v-if="store.tagRailOpen && !isMobile"
    aria-label="标签面板"
    class="ui-glass-panel ui-z-header sticky top-2 my-2 ml-2 flex h-[calc(100dvh-1rem)] w-60 shrink-0 flex-col overflow-hidden rounded-2xl max-sm:hidden"
  >
    <LibraryTagRailBody />
  </aside>

  <!-- 移动端底部抽屉（仅在窄屏挂载，避免桌面端触发 showModal() 导致文档 inert） -->
  <Drawer
    v-if="isMobile"
    :open="store.tagRailOpen"
    label="标签面板"
    placement="bottom"
    size="lg"
    style="--ui-drawer-size: min(80dvh, 44rem)"
    @update:open="store.setTagRailOpen"
  >
    <LibraryTagRailBody mobile />
  </Drawer>
</template>

<script setup lang="ts">
import { Drawer } from '@115master/ui'
import { useMediaQuery } from '@vueuse/core'
import { watch } from 'vue'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { useTagStore } from '@/store/tagList'
import LibraryTagRailBody from './LibraryTagRailBody.vue'

const store = useMediaLibraryStore()
const tagStore = useTagStore()
const isMobile = useMediaQuery('(max-width: 639px)')

watch(
  () => store.tagRailOpen,
  (open) => {
    if (open && tagStore.tags.length === 0 && !tagStore.loading)
      void tagStore.load()
  },
  { immediate: true },
)
</script>
