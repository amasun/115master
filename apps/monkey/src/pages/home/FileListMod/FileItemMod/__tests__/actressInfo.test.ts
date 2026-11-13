// @vitest-environment happy-dom
import type { FileItemAttributes, ItemInfo } from '@/pages/home/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileListType, FileType, IvType } from '@/pages/home/types'
import { actressFaceDB } from '@/utils/actressFaceDB'
import { FileItemModActressInfo } from '../actressInfo'

vi.mock('$', () => ({
  GM_getValue: vi.fn(),
  GM_setValue: vi.fn(),
  GM_addValueChangeListener: vi.fn(),
}))

vi.mock('@/utils/actressFaceDB', () => ({
  actressFaceDB: {
    init: vi.fn().mockResolvedValue(undefined),
    findActress: vi.fn(),
  },
}))

vi.mock('@/utils/cache', () => ({
  imageCache: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@115master/utils', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>()
  return {
    ...actual,
    image: {
      ...actual.image,
      compress: vi.fn().mockImplementation(blob => Promise.resolve(blob)),
    },
  }
})

function createFakeAttributes(overrides: Partial<FileItemAttributes> = {}): FileItemAttributes {
  return {
    c: '',
    cid: '0',
    iv: IvType.No,
    vdi: '',
    title: '三上悠亚',
    hdf: '',
    file_type: FileType.folder,
    file_mode: '',
    pick_code: 'test-pick-code',
    is_share: '0',
    is_top: '0',
    area_id: '',
    p_id: '0',
    cate_id: '0',
    cate_name: '',
    score: '',
    has_desc: '',
    fl_encode: '',
    fuuid: '',
    shared: '',
    has_pass: '',
    issct: '',
    sha1: '',
    play_button: '',
    ...overrides,
  }
}

describe('fileItemModActressInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url')
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn()
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['fake-img'], { type: 'image/jpeg' })),
      }),
    )
  })

  it('视频文件（非文件夹）即使名称命中演员也不加载头像且不影响原生图标', async () => {
    const itemNode = document.createElement('li')
    const thumbNode = document.createElement('div')
    thumbNode.className = 'file-thumb'
    const nameWrap = document.createElement('div')
    nameWrap.className = 'file-name-wrap'
    itemNode.append(thumbNode, nameWrap)

    const itemInfo: ItemInfo = {
      avNumber: null,
      attributes: createFakeAttributes({
        title: '三上悠亚-SSNI-001.mp4',
        file_type: FileType.file,
        iv: IvType.Yes,
      }),
      fileListType: FileListType.list,
      duration: 3600,
      listScrollBoxNode: document.createElement('div'),
      surface: 'legacy',
    }

    const mod = new FileItemModActressInfo(itemNode, itemInfo)
    await mod.onLoad()

    expect(actressFaceDB.findActress).not.toHaveBeenCalled()
    expect(itemNode.querySelector('[data-115master-actress]')).toBeNull()
    expect(thumbNode.style.display).not.toBe('none')
  })

  it('旧版文件夹匹配演员后：隐藏原生文件夹图标并用头像替代原生图标位置', async () => {
    vi.mocked(actressFaceDB.findActress).mockResolvedValue({
      url: 'https://example.com/yua.jpg',
      folder: 's',
      filename: '三上悠亚.jpg',
      timestamp: 123456,
    })

    const itemNode = document.createElement('li')
    const thumbNode = document.createElement('div')
    thumbNode.className = 'file-thumb'
    const nameWrap = document.createElement('div')
    nameWrap.className = 'file-name-wrap'
    itemNode.append(thumbNode, nameWrap)

    const itemInfo: ItemInfo = {
      avNumber: null,
      attributes: createFakeAttributes({
        title: '三上悠亚',
        file_type: FileType.folder,
      }),
      fileListType: FileListType.list,
      duration: 0,
      listScrollBoxNode: document.createElement('div'),
      surface: 'legacy',
    }

    const mod = new FileItemModActressInfo(itemNode, itemInfo)
    await mod.onLoad()

    expect(actressFaceDB.findActress).toHaveBeenCalledWith('三上悠亚', 'title')

    // 原生图标容器被隐藏
    expect(thumbNode.style.display).toBe('none')

    /** 头像插入在原图标容器前（替代其位置） */
    const avatar = itemNode.querySelector<HTMLImageElement>('[data-115master-actress]')
    expect(avatar).not.toBeNull()
    expect(avatar?.nextElementSibling).toBe(thumbNode)
    expect(itemNode.classList.contains('with-actress-info')).toBe(true)

    // 卸载后恢复原生图标
    mod.onDestroy()
    expect(itemNode.querySelector('[data-115master-actress]')).toBeNull()
    expect(thumbNode.style.display).toBe('')
    expect(itemNode.classList.contains('with-actress-info')).toBe(false)
  })

  it('新版官方列表文件夹匹配演员后：隐藏原生文件夹图标并在文件名节点前替代显示头像', async () => {
    vi.mocked(actressFaceDB.findActress).mockResolvedValue({
      url: 'https://example.com/yua.jpg',
      folder: 's',
      filename: '三上悠亚.jpg',
      timestamp: 123456,
    })

    const itemNode = document.createElement('div')
    itemNode.className = 'file-list-item'
    const flexBox = document.createElement('div')
    flexBox.className = 'flex items-center'

    const nativeIcon = document.createElement('div')
    nativeIcon.className = 'native-folder-icon'
    const inlineName = document.createElement('div')
    inlineName.className = 'file-name-responsive'
    inlineName.title = '三上悠亚'

    flexBox.append(nativeIcon, inlineName)
    itemNode.append(flexBox)

    const itemInfo: ItemInfo = {
      avNumber: null,
      attributes: createFakeAttributes({
        title: '三上悠亚',
        file_type: FileType.folder,
      }),
      fileListType: FileListType.list,
      duration: 0,
      listScrollBoxNode: document.createElement('div'),
      surface: 'official',
      interactionNode: itemNode,
    }

    const mod = new FileItemModActressInfo(itemNode, itemInfo)
    await mod.onLoad()

    // 原生图标被隐藏
    expect(nativeIcon.style.display).toBe('none')

    /** 头像替代原生图标位置，插入在 nativeIcon 前面 */
    const avatar = itemNode.querySelector<HTMLImageElement>('[data-115master-actress]')
    expect(avatar).not.toBeNull()
    expect(avatar?.nextElementSibling).toBe(nativeIcon)
    expect(nativeIcon.nextElementSibling).toBe(inlineName)

    // 卸载后复原
    mod.onDestroy()
    expect(itemNode.querySelector('[data-115master-actress]')).toBeNull()
    expect(nativeIcon.style.display).toBe('')
  })

  it('文件夹名称带有 [FHD] 标签和括号修饰词时依然能提取并匹配演员头像', async () => {
    vi.mocked(actressFaceDB.findActress).mockImplementation(async (name) => {
      if (name === '三上悠亚') {
        return {
          url: 'https://example.com/yua.jpg',
          folder: 's',
          filename: '三上悠亚.jpg',
          timestamp: 123456,
        }
      }
      return undefined
    })

    const itemNode = document.createElement('li')
    const thumbNode = document.createElement('div')
    thumbNode.className = 'file-thumb'
    const nameWrap = document.createElement('div')
    nameWrap.className = 'file-name-wrap'
    itemNode.append(thumbNode, nameWrap)

    const itemInfo: ItemInfo = {
      avNumber: null,
      attributes: createFakeAttributes({
        title: '[FHD] 三上悠亚 (2020)',
        file_type: FileType.folder,
      }),
      fileListType: FileListType.list,
      duration: 0,
      listScrollBoxNode: document.createElement('div'),
      surface: 'legacy',
    }

    const mod = new FileItemModActressInfo(itemNode, itemInfo)
    await mod.onLoad()

    expect(actressFaceDB.findActress).toHaveBeenCalledWith('三上悠亚', 'name')
    expect(itemNode.querySelector('[data-115master-actress]')).not.toBeNull()
  })

  it('文件夹未匹配到演员时不隐藏原生图标也不插入头像', async () => {
    vi.mocked(actressFaceDB.findActress).mockResolvedValue(undefined)

    const itemNode = document.createElement('li')
    const thumbNode = document.createElement('div')
    thumbNode.className = 'file-thumb'
    itemNode.append(thumbNode)

    const itemInfo: ItemInfo = {
      avNumber: null,
      attributes: createFakeAttributes({
        title: '普通目录',
        file_type: FileType.folder,
      }),
      fileListType: FileListType.list,
      duration: 0,
      listScrollBoxNode: document.createElement('div'),
      surface: 'legacy',
    }

    const mod = new FileItemModActressInfo(itemNode, itemInfo)
    await mod.onLoad()

    expect(thumbNode.style.display).not.toBe('none')
    expect(itemNode.querySelector('[data-115master-actress]')).toBeNull()
  })
})
