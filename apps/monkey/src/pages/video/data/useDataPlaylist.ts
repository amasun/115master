import type { Share } from '@115master/drive115'
import { useAsyncState } from '@vueuse/core'
import { reactive } from 'vue'
import { drive115 } from '@/utils/drive115Instance'
import { appLogger } from '@/utils/logger'

const logger = appLogger.sub('DataPlaylist')

/**
 * 播放列表
 */
export function useDataPlaylist() {
  let lastCid = ''

  const playlist = useAsyncState(
    async (cid: string) => {
      lastCid = cid
      const res = await drive115.file.getPlaylist(cid)
      return res
    },
    null,
    {
      immediate: false,
      onError: (err) => {
        logger.warn('加载同目录播放列表失败（不影响当前视频播放）', err)
      },
    },
  )

  const retry = () => (lastCid ? playlist.execute(0, lastCid) : Promise.resolve(null))

  /** 更新播放列表项 */
  const updateItem = (pickCode: string, data: Partial<Share.Entity.FileItem>) => {
    if (!playlist.state.value)
      return
    const index = playlist.state.value.data.findIndex(i => i.pc === pickCode)
    if (index !== -1) {
      playlist.state.value.data[index] = {
        ...playlist.state.value.data[index],
        ...data,
      } as Share.Entity.FileItem
    }
  }

  /** 更新播放列表项时间 */
  const updateItemTime = (pickCode: string, time: number) => {
    updateItem(pickCode, { current_time: time })
  }

  /** 更新播放列表项星标 */
  const updateItemMark = (pickCode: string, mark: boolean) => {
    updateItem(pickCode, { m: mark ? 1 : 0 })
  }

  return reactive({
    ...playlist,
    retry,
    updateItemTime,
    updateItemMark,
  })
}
