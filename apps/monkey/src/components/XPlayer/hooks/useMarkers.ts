import type { ComputedRef } from 'vue'
import type { PlayerContext } from './usePlayerProvide'
import type { MarkerItem } from '@/components/XPlayer/types'
import type { Marker } from '@/utils/markers'
import { computed } from 'vue'
import { I } from '@/icons'
import { findNextMarker, findPrevMarker, formatMarkerTime } from '@/utils/markers'

/**
 * 打点功能管理 Hook 返回接口
 */
export interface UseMarkersReturn {
  /** 当前打点列表（按时间排序） */
  list: ComputedRef<MarkerItem[]>
  /** 在当前播放位置打点 */
  addAtCurrentTime: () => void
  /** 跳转到指定打点 */
  seekTo: (marker: MarkerItem) => void
  /** 跳转到上一个打点 */
  seekPrev: () => void
  /** 跳转到下一个打点 */
  seekNext: () => void
  /** 更新打点备注或时间 */
  update: (id: string, patch: { time?: number, endTime?: number, label?: string }) => void
  /** 删除打点 */
  remove: (id: string) => void
}

/**
 * 播放器打点功能 Hook
 * @param ctx 播放器上下文
 */
export function useMarkers(ctx: PlayerContext): UseMarkersReturn {
  /** 打点列表（时间升序） */
  const list = computed<MarkerItem[]>(() => {
    const raw = ctx.rootProps.markers ?? []
    return [...raw].sort((a, b) => {
      if (a.time !== b.time) {
        return a.time - b.time
      }
      return a.id.localeCompare(b.id)
    })
  })

  /** 跳转到指定打点 */
  function seekTo(marker: MarkerItem): void {
    ctx.playerCore.value?.seek(marker.time)
    const title = marker.label ? `打点：${marker.label}` : `打点 ${formatMarkerTime(marker.time)}`
    ctx.hud.show({
      title,
      icon: I.MARKER,
    })
  }

  /** 在当前播放位置打点 */
  function addAtCurrentTime(): void {
    const time = ctx.playerCore.value?.currentTime ?? 0
    ctx.rootEmit('markerAdd', time)
    ctx.hud.show({
      title: `已打点 ${formatMarkerTime(time)}`,
      icon: I.MARKER,
    })
  }

  /** 跳转到上一个打点 */
  function seekPrev(): void {
    const currentTime = ctx.playerCore.value?.currentTime ?? 0
    const target = findPrevMarker(list.value as unknown as Marker[], currentTime)
    if (target) {
      seekTo(target as MarkerItem)
      return
    }

    ctx.hud.show({
      title: '没有更多打点',
      icon: I.MARKER,
    })
  }

  /** 跳转到下一个打点 */
  function seekNext(): void {
    const currentTime = ctx.playerCore.value?.currentTime ?? 0
    const target = findNextMarker(list.value as unknown as Marker[], currentTime)
    if (target) {
      seekTo(target as MarkerItem)
      return
    }

    ctx.hud.show({
      title: '没有更多打点',
      icon: I.MARKER,
    })
  }

  /** 更新打点 */
  function update(id: string, patch: { time?: number, endTime?: number, label?: string }): void {
    ctx.rootEmit('markerUpdate', id, patch)
  }

  /** 删除打点 */
  function remove(id: string): void {
    ctx.rootEmit('markerRemove', id)
  }

  return {
    list,
    addAtCurrentTime,
    seekTo,
    seekPrev,
    seekNext,
    update,
    remove,
  }
}
