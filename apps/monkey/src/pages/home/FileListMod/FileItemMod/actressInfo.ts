import { image as imageUtil } from '@115master/utils'
import { FileListType, FileType } from '@/pages/home/types'
import { actressFaceDB } from '@/utils/actressFaceDB'
import { imageCache } from '@/utils/cache'
import { appLogger } from '@/utils/logger'
import { FileItemModBase } from './base'

/** 演员头像增强共用日志。 */
const logger = appLogger.sub('FileItemModActressInfo')

/** 提取文件夹名称中可能匹配演员的候选词（支持带修饰词/标签的文件夹） */
export function extractActressCandidates(raw: string): string[] {
  const list: string[] = []
  const trimmed = raw.trim()
  if (trimmed)
    list.push(trimmed)

  /** 去除常见方括号、圆括号标签 [xxx], 【xxx】, (xxx) 等 */
  const cleaned = trimmed
    .replace(/\[[^\]]*\]|【[^】]*】|\([^)]*\)|（[^）]*）/g, '')
    .replace(/1080p|720p|4k|fhd|合集|精选|中文|字幕|无码|破解/gi, '')
    .trim()
  if (cleaned && !list.includes(cleaned))
    list.push(cleaned)

  /** 提取连续 2-6 位汉字/片假名/平假名 */
  const match = cleaned.match(/[\u4E00-\u9FA5\u3040-\u309F\u30A0-\u30FF]{2,6}/)
  if (match && !list.includes(match[0]))
    list.push(match[0])

  return list
}

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
    const candidates = extractActressCandidates(this.itemInfo.attributes.title)
    let actress: Awaited<ReturnType<typeof actressFaceDB.findActress>>
    for (const name of candidates) {
      actress = await actressFaceDB.findActress(name, 'name')
      if (actress)
        break
    }

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
     * 1) 约束为精致圆形头像，与原生列表行高对齐
     * 2) 精准隐藏原生文件夹图标节点
     * 3) 在原生图标位置前置插入头像代替原生图标
     */
    logger.info('开始设置演员头像显示模式')

    const isOfficialSurface = this.itemInfo.surface === 'official'
    const avatarSize = 50

    actressDom.style.width = `${avatarSize}px`
    actressDom.style.height = `${avatarSize}px`
    actressDom.style.minWidth = `${avatarSize}px`
    actressDom.style.maxWidth = `${avatarSize}px`
    actressDom.style.minHeight = `${avatarSize}px`
    actressDom.style.maxHeight = `${avatarSize}px`
    actressDom.style.flex = `0 0 ${avatarSize}px`
    actressDom.style.borderRadius = '50%'
    actressDom.style.objectFit = 'cover'
    actressDom.style.display = 'block'
    actressDom.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.12)'
    actressDom.style.border = '2px solid rgba(255, 255, 255, 0.8)'
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
        const interactionRoot = this.itemInfo.interactionNode ?? this.itemNode
        const inlineName = interactionRoot.querySelector<HTMLElement>('.file-name-responsive') ?? null
        const nameCol = inlineName?.closest<HTMLElement>('.flex-1')
          ?? inlineName?.parentElement
          ?? this.itemNode

        /**
         * 代替原生文件夹图标并占用其原生位置：
         * 优先定位 nameCol 左侧的原生图标列（如 .flex-shrink-0 或原生图标容器）
         */
        let nativeIcon: HTMLElement | null = null

        // 尝试从 nameCol 的左侧兄弟节点找原生图标容器
        if (nameCol && nameCol !== interactionRoot && nameCol.previousElementSibling) {
          const prev = nameCol.previousElementSibling as HTMLElement
          if (!prev.closest('input, [role="checkbox"]') && !prev.querySelector('input[type="checkbox"]')) {
            nativeIcon = prev
          }
        }

        // 兜底：在 interactionRoot 中查找原生图标节点
        if (!nativeIcon) {
          if (inlineName?.previousElementSibling) {
            const prev = inlineName.previousElementSibling as HTMLElement
            if (prev !== actressDom && !prev.hasAttribute('data-115master-actress')) {
              nativeIcon = prev
            }
          }
        }

        if (!nativeIcon) {
          const icons = Array.from(interactionRoot.querySelectorAll<HTMLElement>(
            '.file-thumb, .file-type, [class*="thumb"], [class*="icon"], svg, img',
          ))
          nativeIcon = icons.find(n => !n.closest('input, [role="checkbox"], [data-115master-row-addon]')
            && !n.hasAttribute('data-115master-actress')) ?? null
        }

        if (nativeIcon && nativeIcon !== actressDom) {
          this.nativeIconNode = nativeIcon
          this.nativeIconDisplay = nativeIcon.style.display

          /** 如果 nativeIcon 是一个容器（有子元素），隐藏其原有子元素并把头像装入容器内部居中 */
          const iconChildren = Array.from(nativeIcon.children).filter(
            c => c !== actressDom && !c.hasAttribute('data-115master-actress'),
          ) as HTMLElement[]

          if (iconChildren.length > 0) {
            iconChildren.forEach((child) => {
              child.style.display = 'none'
            })
            nativeIcon.style.display = 'flex'
            nativeIcon.style.alignItems = 'center'
            nativeIcon.style.justifyContent = 'center'
            actressDom.style.margin = '0 auto'
            nativeIcon.append(actressDom)
            this.actressContainer = nativeIcon
          }
          else {
            // 叶子节点：隐藏该叶子节点并在其原位前置插入头像
            nativeIcon.style.display = 'none'
            nativeIcon.before(actressDom)
            this.actressContainer = nativeIcon.parentElement ?? interactionRoot
          }
        }
        else if (inlineName) {
          inlineName.before(actressDom)
          this.actressContainer = inlineName.parentElement ?? interactionRoot
        }
        else {
          nameCol.prepend(actressDom)
          this.actressContainer = nameCol
        }

        this.actressContainer.setAttribute('data-115master-actress-host', '')
        this.actressContainer.classList.add('with-actress-info')
        this.itemNode.setAttribute('data-115master-actress-inline', '')
      }
    }
    else {
      /** 旧版 115 页面：代替原生文件夹图标（.file-thumb 或 .file-type）占用其原来显示位置 */
      const thumbNode = this.itemNode.querySelector<HTMLElement>('.file-thumb, .file-type')
      if (thumbNode) {
        /**
         * 旧版列表的文件夹图标是绝对定位的，文件名靠左内边距给它留位置。
         * 头像必须同样绝对定位到图标原来的位置；如果按普通流插入，
         * 头像会排在留白之后，文件名再被头像顶开，两者都向右偏。
         */
        const absolute = getComputedStyle(thumbNode).position === 'absolute'
        const center = thumbNode.offsetLeft + thumbNode.offsetWidth / 2
        this.nativeIconNode = thumbNode
        this.nativeIconDisplay = thumbNode.style.display
        thumbNode.style.display = 'none'
        thumbNode.before(actressDom)
        this.actressContainer = thumbNode.parentElement ?? this.itemNode
        if (absolute) {
          /** 头像缩到图标留白内，以图标中心对齐；文件名保持原位，不改任何内边距 */
          const size = 40
          const px = `${size}px`
          actressDom.style.boxSizing = 'border-box'
          actressDom.style.width = px
          actressDom.style.height = px
          actressDom.style.minWidth = px
          actressDom.style.maxWidth = px
          actressDom.style.minHeight = px
          actressDom.style.maxHeight = px
          actressDom.style.flex = `0 0 ${px}`
          actressDom.style.position = 'absolute'
          actressDom.style.left = `${center - size / 2}px`
          actressDom.style.top = '50%'
          actressDom.style.transform = 'translateY(-50%)'
          actressDom.style.margin = '0'
        }
      }
      else {
        const nameContainer = this.itemNode.querySelector<HTMLElement>('.file-name-wrap') ?? this.itemNode
        nameContainer.prepend(actressDom)
        this.actressContainer = nameContainer
      }
      this.itemNode.classList.add('with-actress-info')
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
      Array.from(this.nativeIconNode.children).forEach((child) => {
        if (child instanceof HTMLElement) {
          child.style.removeProperty('display')
        }
      })
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
