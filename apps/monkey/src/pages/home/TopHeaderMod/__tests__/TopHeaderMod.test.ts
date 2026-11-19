// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const gmStore = vi.hoisted(() => new Map<string, unknown>())
const showPreferencesDialogMock = vi.hoisted(() => vi.fn())
const mockWindow = vi.hoisted(() => ({
  Main: {
    CONFIG: {
      TopPanelBox: '#js_top_panel_box',
    },
  },
}))

vi.mock('$', () => ({
  GM_getValue: (key: string) => gmStore.get(key),
  GM_setValue: (key: string, value: unknown) => gmStore.set(key, structuredClone(value)),
  unsafeWindow: mockWindow,
}))

vi.mock('@/components/Preferences', () => ({
  showPreferencesDialog: showPreferencesDialogMock,
}))

vi.mock('@/utils/logger', () => ({
  appLogger: {
    sub: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

vi.mock('iconify-icon', () => ({
  addCollection: vi.fn(),
}))

const { userSettings } = await import('@/utils/userSettings')
const { TopHeaderMod } = await import('../index')

describe('topHeaderMod', () => {
  let mod: InstanceType<typeof TopHeaderMod> | null = null

  beforeEach(() => {
    gmStore.clear()
    showPreferencesDialogMock.mockClear()
    userSettings.value.enableFilelistPreview = true
    userSettings.value.enableAvInfo = true
    userSettings.value.enableActressFaces = true
    document.body.innerHTML = ''
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn()
      disconnect = vi.fn()
    })
  })

  afterEach(() => {
    mod?.destroy()
    mod = null
  })

  it('优先将控制按钮组挂载在面包屑栏 .list-topheader 右侧，不挤占顶部操作栏', () => {
    document.body.innerHTML = `
      <div id="js_top_panel_box">
        <div class="top-bar">
          <a class="button" menu="offline_task"><span>云下载</span></a>
          <a class="button" menu="upload_btn_add_dir"><span>上传</span></a>
        </div>
      </div>
      <div class="list-topheader">
        <div class="top-file-path">
          <div class="file-path"><a cid="0">根目录</a></div>
        </div>
      </div>
    `

    mod = new TopHeaderMod()

    const topBar = document.querySelector('#js_top_panel_box > div')!
    const listHeader = document.querySelector('.list-topheader')!
    const cluster = listHeader.querySelector('.master-topbar-cluster')!

    expect(topBar.querySelector('.master-topbar-cluster')).toBeNull()
    expect(topBar.querySelector('.button[menu="offline_task"]')).not.toBeNull()
    expect(cluster).not.toBeNull()
    expect(listHeader.classList.contains('master-has-topbar-cluster')).toBe(true)
    expect(listHeader.lastElementChild).toBe(cluster)

    const buttons = cluster.querySelectorAll('a.master-topbar-btn')
    expect(buttons).toHaveLength(4)
    expect(Array.from(buttons).map(btn => btn.textContent?.trim())).toEqual([
      '截图',
      '介绍',
      '头像',
      '设置',
    ])

    // 卸载时清理按钮组与宿主标记
    mod.destroy()
    expect(listHeader.querySelector('.master-topbar-cluster')).toBeNull()
    expect(listHeader.classList.contains('master-has-topbar-cluster')).toBe(false)
  })

  it('缺少 .list-topheader 时回退到顶部操作栏末尾', () => {
    document.body.innerHTML = `
      <div id="js_top_panel_box">
        <div class="top-bar">
          <a class="button" menu="upload_btn_add_dir"><span>上传</span></a>
        </div>
      </div>
    `

    mod = new TopHeaderMod()

    const topBar = document.querySelector('#js_top_panel_box > div')!
    expect(topBar.querySelector('.master-topbar-cluster')).not.toBeNull()
    expect(topBar.classList.contains('master-has-topbar-cluster')).toBe(false)
  })

  it('按钮点击与外部 userSettings 变更双向同步状态', () => {
    document.body.innerHTML = `
      <div id="js_top_panel_box"><div></div></div>
      <div class="list-topheader"><div class="top-file-path"></div></div>
    `

    mod = new TopHeaderMod()

    const preview = document.querySelector<HTMLAnchorElement>('.master-preview-switch-btn')!
    const av = document.querySelector<HTMLAnchorElement>('.master-av-switch-btn')!
    const actress = document.querySelector<HTMLAnchorElement>('.master-actress-switch-btn')!
    const settings = document.querySelector<HTMLAnchorElement>('.master-settings-btn')!

    preview.click()
    expect(userSettings.value.enableFilelistPreview).toBe(false)
    expect(preview.classList.contains('active')).toBe(false)
    expect(preview.getAttribute('aria-pressed')).toBe('false')

    // 模拟在偏好设置弹窗中修改设置
    userSettings.value.enableFilelistPreview = true
    expect(preview.classList.contains('active')).toBe(true)

    userSettings.value.enableAvInfo = false
    expect(av.classList.contains('active')).toBe(false)

    userSettings.value.enableActressFaces = false
    expect(actress.classList.contains('active')).toBe(false)

    settings.click()
    expect(showPreferencesDialogMock).toHaveBeenCalledOnce()
  })
})
