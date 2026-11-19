import type { TopRootSearchParams } from '@/pages/home/global'
import { unsafeWindow } from '$'
import { showPreferencesDialog } from '@/components/Preferences'
import { I } from '@/icons'
import { BaseMod } from '@/pages/home/BaseMod'
import { appLogger } from '@/utils/logger'
import { getUrlParams } from '@/utils/url'
import { userSettings } from '@/utils/userSettings'
import './index.css'
import 'iconify-icon'

/**
 * 顶部导航栏修改器
 * @description
 * 1. 保留官方云下载按钮，不再注入插件版离线下载入口
 * 2. 添加预览切换开关
 */
export class TopHeaderMod extends BaseMod {
  private readonly logger = appLogger.sub('TopHeaderMod')
  private menuObserver: ResizeObserver | null = null
  private menuFrame: number | null = null
  private cluster: HTMLDivElement | null = null
  private clusterHost: HTMLElement | null = null
  private settingDisposers: Array<() => void> = []

  constructor() {
    super()
    this.init()
  }

  /** 顶部导航栏节点 */
  get topHeaderNode() {
    return document.querySelector(unsafeWindow.Main.CONFIG.TopPanelBox)
      ?.firstElementChild as HTMLElement
  }

  /** 面包屑路径栏节点（右侧留白充裕，优先承载插件按钮组） */
  get listTopHeaderNode() {
    return document.querySelector<HTMLElement>('.list-topheader')
  }

  /** 销毁 */
  destroy() {
    /*
     * ================================================================================
     * 步骤1：释放顶栏增强
     * ================================================================================
     * 目标：页面重绘或路由切换后不残留观察器、设置监听与重复按钮。
     * 操作：
     * 1) 停止尺寸监听并取消待处理的布局任务
     * 2) 释放设置监听并移除 Fusion 注入的按钮组
     */
    this.logger.info('开始释放旧版页面顶栏增强')

    this.menuObserver?.disconnect()
    this.menuObserver = null
    if (this.menuFrame !== null)
      cancelAnimationFrame(this.menuFrame)
    this.menuFrame = null
    this.settingDisposers.forEach(dispose => dispose())
    this.settingDisposers = []
    this.cluster?.remove()
    this.cluster = null
    this.clusterHost?.classList.remove('master-has-topbar-cluster')
    this.clusterHost = null

    this.logger.info('旧版页面顶栏增强释放完成')
  }

  /** 初始化 */
  private init() {
    if (!this.topHeaderNode)
      return
    const params = getUrlParams<TopRootSearchParams>(
      top?.window.location.search ?? '',
    )
    if (params.mode === 'search') {
      return
    }
    this.addMasterTopbarCluster()
    this.watchContextMenuPosition()
  }

  /**
   * 添加注入按钮组
   * @description 优先挂载在 .list-topheader（面包屑栏）右侧，避免挤入已满载的顶部操作栏
   * 造成换行与浮动错位；若页面不存在 .list-topheader，则回退到顶部操作栏末尾。
   */
  private addMasterTopbarCluster() {
    const cluster = document.createElement('div')
    cluster.classList.add('master-topbar-cluster')
    cluster.setAttribute('role', 'group')
    cluster.setAttribute('aria-label', '115Master 快捷控制')
    cluster.append(
      this.createPreviewSwitchButton(),
      this.createAvInfoSwitchButton(),
      this.createActressFacesSwitchButton(),
      this.createSettingsButton(),
    )

    const listHeader = this.listTopHeaderNode
    const useListHeader = Boolean(
      listHeader && window.getComputedStyle(listHeader).display !== 'none',
    )
    const host = useListHeader ? listHeader : this.topHeaderNode
    if (!host)
      return

    if (useListHeader && listHeader) {
      listHeader.classList.add('master-has-topbar-cluster')
    }
    host.append(cluster)
    this.cluster = cluster
    this.clusterHost = host
  }

  /** 创建预览切换开关 */
  private createPreviewSwitchButton() {
    /*
     * ================================================================================
     * 步骤1：创建旧版文件预览开关
     * ================================================================================
     * 目标：让旧版 iframe 内真实开关同步图标状态、提示和无障碍属性。
     * 数据源：USER_SETTINGS.enableFilelistPreview。
     * 操作：
     * 1) 按当前设置初始化 active、title 和 aria-pressed
     * 2) 点击后持久化设置并响应外部偏好设置变更
     */
    this.logger.info('开始创建旧版文件预览开关')

    /** 1.1 创建按钮和离线图标。 */
    const button = document.createElement('a')
    button.classList.add('master-topbar-btn', 'master-preview-switch-btn')
    button.href = 'javascript:void(0)'
    button.setAttribute('role', 'button')
    button.innerHTML = `
      <iconify-icon class="preview-off" icon="${I.PREVIEW_OFF}" noobserver></iconify-icon>
      <iconify-icon class="preview-on" icon="${I.PREVIEW_ON}" noobserver></iconify-icon>
      <span>截图</span>
    `

    /** 1.2 集中同步可见状态和辅助属性。 */
    const syncState = (enabled = userSettings.value.enableFilelistPreview) => {
      button.classList.toggle('active', enabled)
      button.setAttribute('aria-pressed', String(enabled))
      button.setAttribute(
        'aria-label',
        enabled ? '关闭文件预览' : '开启文件预览',
      )
      button.title = enabled ? '关闭文件预览' : '开启文件预览'
    }
    syncState()
    this.settingDisposers.push(
      userSettings.watch('enableFilelistPreview', (_, enabled) => syncState(enabled)),
    )

    /** 1.3 点击后写入设置，并同步本 iframe 中的真实开关。 */
    button.onclick = () => {
      userSettings.value.enableFilelistPreview
        = !userSettings.value.enableFilelistPreview
    }
    this.logger.info('旧版文件预览开关创建完成')
    return button
  }

  /** 创建作品介绍切换开关 */
  private createAvInfoSwitchButton() {
    const button = document.createElement('a')
    button.classList.add('master-topbar-btn', 'master-control-btn', 'master-av-switch-btn')
    button.href = 'javascript:void(0)'
    button.setAttribute('role', 'button')
    button.innerHTML = `
      <iconify-icon icon="${I.DOCUMENT}" noobserver></iconify-icon>
      <span>介绍</span>
    `
    const syncState = (enabled = userSettings.value.enableAvInfo) => {
      button.classList.toggle('active', enabled)
      button.setAttribute('aria-pressed', String(enabled))
      button.setAttribute(
        'aria-label',
        enabled ? '关闭作品介绍' : '开启作品介绍',
      )
      button.title = enabled ? '关闭作品介绍' : '开启作品介绍'
    }
    syncState()
    this.settingDisposers.push(
      userSettings.watch('enableAvInfo', (_, enabled) => syncState(enabled)),
    )

    button.onclick = () => {
      userSettings.value.enableAvInfo = !userSettings.value.enableAvInfo
    }
    return button
  }

  /** 创建演员头像切换开关 */
  private createActressFacesSwitchButton() {
    const button = document.createElement('a')
    button.classList.add('master-topbar-btn', 'master-control-btn', 'master-actress-switch-btn')
    button.href = 'javascript:void(0)'
    button.setAttribute('role', 'button')
    button.innerHTML = `
      <iconify-icon icon="${I.ACCOUNT}" noobserver></iconify-icon>
      <span>头像</span>
    `
    const syncState = (enabled = userSettings.value.enableActressFaces) => {
      button.classList.toggle('active', enabled)
      button.setAttribute('aria-pressed', String(enabled))
      button.setAttribute(
        'aria-label',
        enabled ? '关闭演员头像' : '开启演员头像',
      )
      button.title = enabled ? '关闭演员头像' : '开启演员头像'
    }
    syncState()
    this.settingDisposers.push(
      userSettings.watch('enableActressFaces', (_, enabled) => syncState(enabled)),
    )

    button.onclick = () => {
      userSettings.value.enableActressFaces = !userSettings.value.enableActressFaces
    }
    return button
  }

  /** 创建偏好设置按钮 */
  private createSettingsButton() {
    const button = document.createElement('a')
    button.classList.add('master-topbar-btn', 'master-control-btn', 'master-settings-btn')
    button.href = 'javascript:void(0)'
    button.setAttribute('role', 'button')
    button.title = '偏好设置'
    button.setAttribute('aria-label', '偏好设置')
    button.innerHTML = `
      <iconify-icon icon="${I.SETTINGS}" noobserver></iconify-icon>
      <span>设置</span>
    `
    button.onclick = () => {
      showPreferencesDialog()
    }
    return button
  }

  /** 修正右键菜单位置 */
  private fixContextMenuPosition(name: string) {
    const tabNode = document.querySelector<HTMLElement>(
      `[data-dropdown-tab="${name}"]`,
    )
    const contextMenuNode = document.querySelector<HTMLElement>(
      `[data-dropdown-content="${name}"]`,
    )
    if (!tabNode || !contextMenuNode)
      return
    const tabRect = tabNode.getBoundingClientRect()
    contextMenuNode.style.left = `${tabRect.left}px`
  }

  /** 跟随顶栏布局变化修正下拉菜单位置。 */
  private watchContextMenuPosition() {
    /*
     * ================================================================================
     * 步骤1：监听顶栏布局
     * ================================================================================
     * 目标：图标、字体或新版官方 DOM 延迟布局后，下拉菜单仍对齐触发按钮。
     * 操作：
     * 1) 用 ResizeObserver 捕获顶栏尺寸变化
     * 2) 在下一帧统一重算上传与新建菜单坐标
     */
    this.logger.info('开始监听旧版页面顶栏布局')

    const update = () => {
      if (this.menuFrame !== null)
        cancelAnimationFrame(this.menuFrame)
      this.menuFrame = requestAnimationFrame(() => {
        this.fixContextMenuPosition('upload_btn_add_dir')
        this.fixContextMenuPosition('create_new_add_dir')
        this.menuFrame = null
      })
    }

    this.menuObserver = new ResizeObserver(update)
    this.menuObserver.observe(this.topHeaderNode)
    update()

    this.logger.info('旧版页面顶栏布局监听完成')
  }
}
