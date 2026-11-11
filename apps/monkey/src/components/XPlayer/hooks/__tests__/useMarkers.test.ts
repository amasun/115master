// @vitest-environment jsdom

import type { PlayerContext } from '../usePlayerProvide'
import type { MarkerItem } from '@/components/XPlayer/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useMarkers } from '../useMarkers'

describe('useMarkers', () => {
  let scope: ReturnType<typeof effectScope>

  beforeEach(() => {
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
  })

  function setup(initialMarkers: MarkerItem[] = [], initialTime = 0) {
    const markersRef = ref<MarkerItem[]>(initialMarkers)
    const currentTimeRef = ref(initialTime)
    const seekMock = vi.fn((time: number) => {
      currentTimeRef.value = time
    })
    const rootEmitMock = vi.fn()
    const hudShowMock = vi.fn()

    const ctx = {
      rootProps: {
        markers: markersRef.value,
      },
      playerCore: ref({
        currentTime: currentTimeRef.value,
        seek: seekMock,
      }),
      rootEmit: rootEmitMock,
      hud: {
        show: hudShowMock,
      },
    } as unknown as PlayerContext

    let hook!: ReturnType<typeof useMarkers>
    scope.run(() => {
      hook = useMarkers(ctx)
    })

    return {
      hook,
      markersRef,
      currentTimeRef,
      seekMock,
      rootEmitMock,
      hudShowMock,
      ctx,
    }
  }

  it('addAtCurrentTime 获取当前播放时间发出 markerAdd 事件并弹出 HUD 反馈', () => {
    const { hook, rootEmitMock, hudShowMock, ctx } = setup([], 85)
    // 模拟当前播放时间 85 秒 (1分25秒)
    if (ctx.playerCore.value) {
      ctx.playerCore.value.currentTime = 85
    }

    hook.addAtCurrentTime()

    expect(rootEmitMock).toHaveBeenCalledWith('markerAdd', 85)
    expect(hudShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '已打点 1:25',
      }),
    )
  })

  it('seekTo 跳转到指定打点时间并显示备注或时间 HUD', () => {
    const markerWithLabel: MarkerItem = { id: 'm1', time: 120, label: '片头结束' }
    const markerWithoutLabel: MarkerItem = { id: 'm2', time: 300, label: '' }

    const { hook, seekMock, hudShowMock } = setup([markerWithLabel, markerWithoutLabel])

    hook.seekTo(markerWithLabel)
    expect(seekMock).toHaveBeenCalledWith(120)
    expect(hudShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '打点：片头结束',
      }),
    )

    hook.seekTo(markerWithoutLabel)
    expect(seekMock).toHaveBeenCalledWith(300)
    expect(hudShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '打点 5:00',
      }),
    )
  })

  it('seekPrev 与 seekNext 行为正确处理容差与边界', () => {
    const markers: MarkerItem[] = [
      { id: 'm1', time: 10, label: '点1' },
      { id: 'm2', time: 30, label: '点2' },
      { id: 'm3', time: 60, label: '点3' },
    ]

    const { hook, seekMock, hudShowMock, ctx } = setup(markers, 35)

    // 当前在 35 秒（距离 30 秒大于 tolerance 2 秒），seekPrev 应回到 30 秒 (m2)
    if (ctx.playerCore.value) {
      ctx.playerCore.value.currentTime = 35
    }
    hook.seekPrev()
    expect(seekMock).toHaveBeenCalledWith(30)

    // 当前在 31 秒（距离 30 秒在 2 秒以内），seekPrev 应回到上一个 10 秒 (m1)
    if (ctx.playerCore.value) {
      ctx.playerCore.value.currentTime = 31
    }
    hook.seekPrev()
    expect(seekMock).toHaveBeenCalledWith(10)

    // 当前在 5 秒（在第一个打点之前），seekPrev 应提示没有更多打点
    if (ctx.playerCore.value) {
      ctx.playerCore.value.currentTime = 5
    }
    seekMock.mockClear()
    hudShowMock.mockClear()
    hook.seekPrev()
    expect(seekMock).not.toHaveBeenCalled()
    expect(hudShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '没有更多打点',
      }),
    )

    // 当前在 35 秒，seekNext 应跳到 60 秒 (m3)
    if (ctx.playerCore.value) {
      ctx.playerCore.value.currentTime = 35
    }
    seekMock.mockClear()
    hook.seekNext()
    expect(seekMock).toHaveBeenCalledWith(60)

    // 当前在 70 秒（在最后一个打点之后），seekNext 应提示没有更多打点
    if (ctx.playerCore.value) {
      ctx.playerCore.value.currentTime = 70
    }
    seekMock.mockClear()
    hudShowMock.mockClear()
    hook.seekNext()
    expect(seekMock).not.toHaveBeenCalled()
    expect(hudShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '没有更多打点',
      }),
    )
  })

  it('update 与 remove 正确发出 markerUpdate 与 markerRemove 事件', () => {
    const { hook, rootEmitMock } = setup()

    hook.update('m1', { label: '新备注', time: 15 })
    expect(rootEmitMock).toHaveBeenCalledWith('markerUpdate', 'm1', { label: '新备注', time: 15 })

    hook.remove('m1')
    expect(rootEmitMock).toHaveBeenCalledWith('markerRemove', 'm1')
  })
})
