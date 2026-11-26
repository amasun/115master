<template>
  <div v-if="fileInfo.error" :class="styles.container.error">
    <div class="flex items-center gap-2">
      <Icon :name="I.ERROR" class="text-error" />获取文件信息失败
    </div>
    <div>{{ fileInfo.error }}</div>
  </div>
  <div v-else-if="fileInfo.isLoading || (!fileInfo.isLoading && !fileInfo.isReady)" :class="styles.container.loading">
    <div class="skeleton h-7 w-80 rounded-lg" />
  </div>
  <div v-else :class="styles.container.main">
    <div :class="styles.fileInfo.container">
      <div :class="styles.fileInfo.file">
        <!-- 文件名 -->
        <span :class="styles.fileInfo.name">
          {{ fileInfo.state?.file_name?.toUpperCase() }}
        </span>
        <!-- 文件大小 -->
        <span :class="styles.fileInfo.size">
          {{ format.fileSize(Number(fileInfo.state?.file_size)) }}
        </span>
      </div>
      <!-- 目录 -->
      <div :class="styles.fileInfo.path.container">
        <ul>
          <li v-for="item in path" :key="item.cid">
            <a
              :href="buildNativeFolderUrl(item.cid, nativeFolderTarget)"
              target="_blank"
              rel="noreferrer"
            >
              {{ item.name }}
            </a>
          </li>
        </ul>
      </div>
    </div>
    <slot name="default" />
  </div>
</template>

<script setup lang="ts">
import type { PlayerContext } from '@/components/XPlayer/hooks/usePlayerProvide'
import type { useDataFileInfo } from '@/pages/video/data/useDataFileInfo'
import type { useDataPlaylist } from '@/pages/video/data/useDataPlaylist'
import { format } from '@115master/utils'
import { computed } from 'vue'
import { I, Icon } from '@/icons'
import { clsx } from '@/utils/clsx'
import { buildNativeFolderUrl, useUserSetting } from '@/utils/userSettings'

const props = defineProps<{
  /** 播放器上下文 */
  ctx: PlayerContext
  /** 文件信息 */
  fileInfo: ReturnType<typeof useDataFileInfo>
  /** 播放列表 */
  playlist: ReturnType<typeof useDataPlaylist>
}>()

defineSlots<{
  default?: () => void
}>()

const nativeFolderTarget = useUserSetting('nativeFolderTarget')

const styles = clsx({
  /** 容器样式 */
  container: {
    main: 'mx-2 flex w-full items-start gap-4',
    error: 'text-error',
    loading: 'flex items-center',
  },
  /** 文件信息样式 */
  fileInfo: {
    container: 'flex flex-1 flex-col gap-0.5',
    file: 'flex flex-wrap items-center gap-2 tracking-tight',
    name: 'line-clamp-2 text-base leading-snug font-medium text-white/95 drop-shadow-[0_1px_4px_rgba(0,0,0,0.65)] sm:text-lg',
    size: 'flex-shrink-0 text-xs font-medium tracking-wide whitespace-nowrap text-white/60 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]',
    path: {
      container: [
        'breadcrumbs',
        'text-xs font-medium text-white/65',
        'tracking-wide',
        'drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]',
        '[&_a]:transition-colors [&_a:hover]:text-white',
      ],
    },
  },
})

const path = computed(() => {
  return (props.playlist.state?.path ?? []).filter(
    item => Number(item.cid) !== 0,
  )
})
</script>
