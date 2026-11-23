<template>
  <!-- 桌面端紧邻主侧边栏右侧的 rail2 -->
  <aside
    v-if="store.tagRailOpen"
    aria-label="标签面板"
    class="
      ui-glass-panel
      ui-z-header
      fixed top-2 bottom-2 left-[calc(var(--sider-width)+var(--spacing)*2)]
      flex w-[calc(var(--rail2-width)-var(--spacing)*2)] flex-col overflow-hidden rounded-2xl
      max-sm:hidden
    "
  >
    <LibraryTagRailBody />
  </aside>

  <!-- 移动端底部抽屉 -->
  <Drawer
    :open="store.tagRailOpen"
    label="标签面板"
    placement="bottom"
    size="lg"
    class="sm:hidden"
    style="--ui-drawer-size: min(80dvh, 44rem)"
    @update:open="store.setTagRailOpen"
  >
    <LibraryTagRailBody mobile />
  </Drawer>
</template>

<script setup lang="ts">
import { Drawer } from '@115master/ui'
import { watch } from 'vue'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { useTagStore } from '@/store/tagList'
import LibraryTagRailBody from './LibraryTagRailBody.vue'

const store = useMediaLibraryStore()
const tagStore = useTagStore()

watch(
  () => store.tagRailOpen,
  (open) => {
    if (open && tagStore.tags.length === 0 && !tagStore.loading)
      void tagStore.load()
  },
  { immediate: true },
)
</script>
