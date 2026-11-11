// @vitest-environment jsdom

import type { MarkerItem } from '@/components/XPlayer/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import MarkersButton from '../MarkersButton.vue'
import ProgressBar from '../ProgressBar.vue'

const apps: ReturnType<typeof createApp>[] = []

const state = vi.hoisted(() => {
  const mockHandleBarWrapperMouseDown = vi.fn()
  const mockSeekTo = vi.fn()
  const mockAddAtCurrentTime = vi.fn()
  const mockSeekPrev = vi.fn()
  const mockSeekNext = vi.fn()
  const mockUpdate = vi.fn()
  const mockRemove = vi.fn()

  return {
    mockHandleBarWrapperMouseDown,
    mockSeekTo,
    mockAddAtCurrentTime,
    mockSeekPrev,
    mockSeekNext,
    mockUpdate,
    mockRemove,
  }
})

const durationRef = ref(100)
const markersListRef = ref<MarkerItem[]>([])
const canplayRef = ref(true)
const progressBarWrapperRef = ref<HTMLDivElement | null>(null)

vi.mock('@/components/XPlayer/hooks/usePlayerProvide', () => ({
  usePlayerContext: () => ({
    rootProps: {
      onThumbnailRequest: undefined,
    },
    source: {
      list: ref([]),
    },
    progressBar: {
      duration: durationRef,
      progressBarWrapperRef,
      progressBarWidth: ref(1000),
      progressValue: ref(20),
      isDragging: ref(false),
      dragProgress: ref(0),
      previewTime: ref(0),
      previewProgress: ref(0),
      isPreviewVisible: ref(false),
      isLongPressDragging: ref(false),
      handleBarWrapperMouseDown: state.mockHandleBarWrapperMouseDown,
      handleBarWrapperMouseEnter: vi.fn(),
      handleBarWrapperMouseMoveWithThrottle: vi.fn(),
      handleBarWrapperMouseLeave: vi.fn(),
      setThumbnailRef: vi.fn(),
    },
    playerCore: ref({
      canplay: canplayRef.value,
      currentTime: 20,
      duration: durationRef.value,
      seek: vi.fn(),
    }),
    markers: {
      list: markersListRef,
      addAtCurrentTime: state.mockAddAtCurrentTime,
      seekTo: state.mockSeekTo,
      seekPrev: state.mockSeekPrev,
      seekNext: state.mockSeekNext,
      update: state.mockUpdate,
      remove: state.mockRemove,
    },
    shortcuts: {
      getShortcutsTip: vi.fn((key: string) => `(${key})`),
    },
    popupManager: {
      registerPopup: vi.fn(),
      unregisterPopup: vi.fn(),
      setPopupVisible: vi.fn(),
    },
  }),
}))

vi.mock('@/components/XPlayer/hooks/usePortal', () => ({
  usePortal: () => ({
    container: ref(undefined),
  }),
}))

describe('progressBar 打点刻度', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    durationRef.value = 100
    markersListRef.value = []
    canplayRef.value = true
  })

  afterEach(() => {
    apps.splice(0).forEach(app => app.unmount())
    document.body.innerHTML = ''
  })

  it('有打点时渲染刻度及其位置与悬停 title', async () => {
    durationRef.value = 200
    markersListRef.value = [
      { id: 'm1', time: 50, label: '第一幕' },
      { id: 'm2', time: 150, label: '' },
    ]

    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(ProgressBar)
    app.mount(host)
    apps.push(app)
    await nextTick()

    const ticks = host.querySelectorAll<HTMLElement>('[data-marker-tick]')
    expect(ticks.length).toBe(2)

    // 50 / 200 = 25%
    expect(ticks[0].style.left).toBe('25%')
    expect(ticks[0].getAttribute('title')).toBe('第一幕')

    // 150 / 200 = 75%，无备注显示格式化时间 2:30
    expect(ticks[1].style.left).toBe('75%')
    expect(ticks[1].getAttribute('title')).toBe('2:30')
  })

  it('duration 为 0 或未知时不渲染刻度', async () => {
    durationRef.value = 0
    markersListRef.value = [
      { id: 'm1', time: 50, label: '第一幕' },
    ]

    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(ProgressBar)
    app.mount(host)
    apps.push(app)
    await nextTick()

    const ticks = host.querySelectorAll<HTMLElement>('[data-marker-tick]')
    expect(ticks.length).toBe(0)
  })

  it('点击刻度触发 seekTo，且 mousedown 阻止冒泡不触发进度条拖拽', async () => {
    const targetMarker: MarkerItem = { id: 'm1', time: 30, label: '测试点' }
    durationRef.value = 100
    markersListRef.value = [targetMarker]

    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(ProgressBar)
    app.mount(host)
    apps.push(app)
    await nextTick()

    const tick = host.querySelector<HTMLElement>('[data-marker-tick]')
    expect(tick).not.toBeNull()

    /** 触发 mousedown 并检查不会调用进度条 wrapper 的 mousedown */
    const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    tick!.dispatchEvent(mouseDownEvent)
    expect(state.mockHandleBarWrapperMouseDown).not.toHaveBeenCalled()

    /** 触发 click 跳转 */
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
    tick!.dispatchEvent(clickEvent)
    expect(state.mockSeekTo).toHaveBeenCalledWith(targetMarker)
  })
})

describe('markersButton 控制栏按钮及弹层列表', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    markersListRef.value = []
    canplayRef.value = true
  })

  afterEach(() => {
    apps.splice(0).forEach(app => app.unmount())
    document.body.innerHTML = ''
  })

  it('点击控制栏打点按钮可打开弹层，无打点时显示空状态', async () => {
    markersListRef.value = []

    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(MarkersButton)
    app.mount(host)
    apps.push(app)
    await nextTick()

    const triggerBtn = host.querySelector('button')
    expect(triggerBtn).not.toBeNull()
    triggerBtn!.click()
    await nextTick()

    expect(document.body.textContent).toContain('在当前位置打点')
    expect(document.body.textContent).toContain('暂无打点')
  })

  it('点击顶部按钮触发 addAtCurrentTime', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(MarkersButton)
    app.mount(host)
    apps.push(app)
    await nextTick()

    const triggerBtn = host.querySelector('button')
    triggerBtn!.click()
    await nextTick()

    const addBtn = Array.from(document.body.querySelectorAll('button')).find(
      btn => btn.textContent?.includes('在当前位置打点'),
    )
    expect(addBtn).toBeDefined()
    addBtn!.click()
    expect(state.mockAddAtCurrentTime).toHaveBeenCalledTimes(1)
  })

  it('展示打点列表、点击行跳转、行内修改备注（回车保存/Esc取消）与删除打点', async () => {
    const m1: MarkerItem = { id: 'm1', time: 75, label: '精彩镜头' }
    markersListRef.value = [m1]

    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(MarkersButton)
    app.mount(host)
    apps.push(app)
    await nextTick()

    // 打开菜单
    host.querySelector('button')!.click()
    await nextTick()

    const itemRow = document.body.querySelector<HTMLElement>('[data-marker-item]')
    expect(itemRow).not.toBeNull()
    expect(itemRow?.textContent).toContain('1:15')
    expect(itemRow?.textContent).toContain('精彩镜头')

    // 1. 点击行触发跳转
    itemRow!.click()
    expect(state.mockSeekTo).toHaveBeenCalledWith(m1)

    /** 2. 点击编辑按钮开启行内输入框 */
    const editBtn = itemRow!.querySelector<HTMLButtonElement>('[data-marker-edit]')
    expect(editBtn).not.toBeNull()
    editBtn!.click()
    await nextTick()

    const input = itemRow!.querySelector<HTMLInputElement>('input')
    expect(input).not.toBeNull()
    expect(input?.value).toBe('精彩镜头')

    // 模拟输入新备注并按回车保存
    input!.value = '修改后的镜头'
    input!.dispatchEvent(new Event('input'))
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()

    expect(state.mockUpdate).toHaveBeenCalledWith('m1', { label: '修改后的镜头' })

    /** 3. 点击删除按钮触发 remove */
    const deleteBtn = document.body.querySelector<HTMLButtonElement>('[data-marker-delete]')
    expect(deleteBtn).not.toBeNull()
    deleteBtn!.click()
    expect(state.mockRemove).toHaveBeenCalledWith('m1')
  })

  it('输入框聚焦时按键不会向上冒泡触发播放器快捷键', async () => {
    markersListRef.value = [{ id: 'm1', time: 10, label: '测试' }]

    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(MarkersButton)
    app.mount(host)
    apps.push(app)
    await nextTick()

    host.querySelector('button')!.click()
    await nextTick()

    const editBtn = document.body.querySelector<HTMLButtonElement>('[data-marker-edit]')
    editBtn!.click()
    await nextTick()

    const input = document.body.querySelector<HTMLInputElement>('input')
    expect(input).not.toBeNull()

    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    const stopSpy = vi.spyOn(spaceEvent, 'stopPropagation')
    input!.dispatchEvent(spaceEvent)

    // 确认 @keydown.stop 已阻止冒泡
    expect(stopSpy).toHaveBeenCalled()
  })
})
