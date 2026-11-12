import { image as imageUtil } from '@115master/utils'
import { FileListType, FileType } from '@/pages/home/types'
import { actressFaceDB } from '@/utils/actressFaceDB'
import { imageCache } from '@/utils/cache'
import { appLogger } from '@/utils/logger'
import { FileItemModBase } from './base'

/** 演员头像增强共用日志。 */
const logger = appLogger.sub('FileItemModActressInfo')

/**
 * FileItemMod 演员信息
 */
export class FileItemModActressInfo extends FileItemModBase {
  readonly SETTING_KEYS = ['enableActressFaces'] as const
  private actressDom: HTMLImageElement | null = null
  private actressContainer: HTMLElement | null = null
  private nativeIconNode: HTMLElement | null = null
  private nativeIconDisplay: string | null = null
  private loadId = 0
  private objectUrl: string | null = null

  async onLoad() {
    const loadId = ++this.loadId
    logger.info('开始加载页面演员头像')

    // 如果文件列表类型为网格，则不加载演员信息
    if (this.itemInfo.fileListType === FileListType.grid) {
      return
    }

    // 仅文件夹才加载演员头像，普通文件/视频文件一律不显示头像
    if (this.itemInfo.attributes.file_type !== FileType.folder) {
      return
    }

    await actressFaceDB.init()
    const actress = await actressFaceDB.findActress(
      this.itemInfo.attributes.title.trim(),
    )
    if (!actress || loadId !== this.loadId) {
      logger.info('页面演员头像加载完成，无匹配头像')
      return
    }

    const actressDom = document.createElement('img')
    actressDom.alt = actress.filename
    actressDom.loading = 'lazy'
    actressDom.className = 'actress-info-img'
    actressDom.setAttribute('data-115master-actress', '')
    /*
     * ================================================================================
     * 步骤1：按页面形态约束演员头像并替代原生文件夹图标
     * ================================================================================
     * 目标：隐藏原生文件夹图标，将演员头像放入原生图标位置，同时视频文件不显示头像。
     * 数据源：文件项所属页面形态。
     * 操作：
     * 1) 固定为 50×50 圆形头像
     * 2) 旧版隐藏 .file-thumb/.file-type 并前置插入头像代替原生图标
     * 3) 新版列表隐藏原生图标并在文件名节点前插入头像代替原生图标
     */
    logger.info('开始设置演员头像显示模式')

    // eslint-disable-next-line jsdoc/convert-to-jsdoc-comments -- 项目步骤注释使用编号行注释。
    // 1.1 识别新版 115 原生文件列表附加区。
    const isOfficialSurface = this.itemInfo.surface === 'official'
    const avatarSize = 50

    // 1.2 写入与页面形态对应的固定尺寸和缩放方式。
    actressDom.style.width = `${avatarSize}px`
    actressDom.style.height = `${avatarSize}px`
    actressDom.style.minWidth = `${avatarSize}px`
    actressDom.style.maxWidth = `${avatarSize}px`
    actressDom.style.minHeight = `${avatarSize}px`
    actressDom.style.maxHeight = `${avatarSize}px`
    actressDom.style.flex = `0 0 ${avatarSize}px`
    actressDom.style.borderRadius = '50%'
    actressDom.style.objectFit = 'cover'
    logger.info('演员头像显示模式设置完成', isOfficialSurface ? 'official' : 'legacy')

    if (isOfficialSurface) {
      if (this.itemInfo.presentation === 'panel') {
        const panelHeader = this.itemNode.closest('[data-115master-grid-panel]')
          ?.querySelector<HTMLElement>('[data-115master-grid-panel-header]')
          ?? this.itemNode
        panelHeader.prepend(actressDom)
        panelHeader.classList.add('with-actress-info')
        panelHeader.setAttribute('data-115master-actress-host', '')
        this.actressContainer = panelHeader
      }
      else {
        const inlineName = this.itemInfo.interactionNode
          ?.querySelector<HTMLElement>('.file-name-responsive') ?? null
        const nameContainer = inlineName?.parentElement ?? this.itemNode

        /** 代替原生文件夹图标：若 inlineName 前面有原生图标节点，则将其隐藏 */
        const nativeIcon = (inlineName?.previousElementSibling ?? null) as HTMLElement | null
        if (nativeIcon && nativeIcon !== actressDom) {
          this.nativeIconNode = nativeIcon
          this.nativeIconDisplay = nativeIcon.style.display
          nativeIcon.style.display = 'none'
        }

        nameContainer.setAttribute('data-115master-actress-host', '')
        nameContainer.classList.add('with-actress-info')
        this.itemNode.setAttribute('data-115master-actress-inline', '')
        if (inlineName) {
          inlineName.before(actressDom)
        }
        else {
          nameContainer.prepend(actressDom)
        }
        this.actressContainer = nameContainer
      }
    }
    else {
      /** 旧版 115 页面：代替原生文件夹图标（.file-thumb 或 .file-type） */
      const thumbNode = this.itemNode.querySelector<HTMLElement>('.file-thumb, .file-type')
      if (thumbNode) {
        this.nativeIconNode = thumbNode
        this.nativeIconDisplay = thumbNode.style.display
        thumbNode.style.display = 'none'
        thumbNode.before(actressDom)
      }
      else {
        const nameContainer = this.itemNode.querySelector<HTMLElement>('.file-name-wrap') ?? this.itemNode
        nameContainer.prepend(actressDom)
      }
      this.itemNode.classList.add('with-actress-info')
      this.actressContainer = this.itemNode
    }

    this.actressDom = actressDom

    try {
      /** 尝试从缓存获取图片 */
      const cacheKey = `actress-face-${actress.url}`
      const cachedImage = await imageCache.get(cacheKey)

      if (cachedImage) {
        this.objectUrl = URL.createObjectURL(cachedImage.value)
        actressDom.src = this.objectUrl
      }
      else {
        actressDom.src = actress.url
        try {
          const response = await fetch(actress.url)
          if (response.ok) {
            const blob = await response.blob()

            /** 压缩图片后再缓存 */
            const compressedBlob = await imageUtil.compress(blob, {
              maxWidth: 200,
              maxHeight: 200,
              quality: 0.8,
              type: 'image/webp',
            })

            // 存储到imageCache中
            await imageCache.set(cacheKey, compressedBlob)
          }
        }
        catch (error) {
          logger.error('缓存演员头像失败:', error)
        }
      }
    }
    catch (error) {
      // 出错时直接使用原始URL
      logger.error('加载演员头像缓存失败:', error)
      actressDom.src = actress.url
    }

    logger.info('旧版页面演员头像加载完成')
  }

  onDestroy() {
    logger.info('开始卸载页面演员头像')
    this.loadId += 1
    this.actressDom?.remove()
    this.actressDom = null
    if (this.nativeIconNode) {
      if (this.nativeIconDisplay !== null && this.nativeIconDisplay !== '') {
        this.nativeIconNode.style.display = this.nativeIconDisplay
      }
      else {
        this.nativeIconNode.style.removeProperty('display')
      }
      this.nativeIconNode = null
      this.nativeIconDisplay = null
    }
    this.actressContainer?.classList.remove('with-actress-info')
    this.actressContainer?.removeAttribute('data-115master-actress-host')
    this.actressContainer = null
    this.itemNode.removeAttribute('data-115master-actress-inline')
    if (this.objectUrl)
      URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = null
    logger.info('页面演员头像卸载完成')
  }
}
