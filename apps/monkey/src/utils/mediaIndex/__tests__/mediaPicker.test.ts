import type { UnifiedMediaMeta } from '../types'
import type { JavInfo } from '@/utils/jav/jav'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  compressMock,
  getCustomCoverMock,
  gmGetMock,
  iterateJavCacheMock,
  posterCacheGetMock,
} = vi.hoisted(() => ({
  compressMock: vi.fn(),
  getCustomCoverMock: vi.fn(),
  gmGetMock: vi.fn(),
  iterateJavCacheMock: vi.fn(),
  posterCacheGetMock: vi.fn(),
}))

vi.mock('@115master/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@115master/utils')>()
  return {
    ...actual,
    image: {
      ...actual.image,
      compress: compressMock,
    },
  }
})

vi.mock('@/utils/logger', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    sub: () => logger,
  }
  return { appLogger: logger }
})

vi.mock('@/utils/request/gmRequest', () => ({
  GMRequest: class {
    get = gmGetMock
  },
}))

vi.mock('@/utils/cache/javCache', () => ({
  javCache: {
    get: vi.fn(),
    set: vi.fn(),
    storage: {
      iterate: iterateJavCacheMock,
    },
  },
}))

vi.mock('@/utils/cache/performerFaceCache', () => ({
  performerFaceCache: {
    getByName: vi.fn().mockResolvedValue(null),
  },
}))

vi.mock('@/utils/actressFaceDB', () => ({
  actressFaceDB: {
    findActressAll: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../actorProfileFetcher', () => ({
  actorProfileCache: { get: vi.fn().mockResolvedValue(null) },
  fetchActorProfile: vi.fn().mockResolvedValue(null),
}))

vi.mock('../videoIndexStore', () => ({
  getCustomCover: getCustomCoverMock,
  posterThumbCache: { get: posterCacheGetMock, set: vi.fn() },
  scrapeMissCache: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
  requestPersistentStorage: vi.fn(),
}))

const { JAV_SOURCE } = await import('@/utils/jav/jav')
const {
  collectLocalCoverCandidates,
  compressCustomAvatar,
  compressCustomCover,
  MAX_UPLOAD_IMAGE_BYTES,
  validateUploadImageFile,
} = await import('../mediaPicker')
const { loadPosterThumbUrl } = await import('../scraperRegistry')

describe('mediaPicker', () => {
  beforeEach(() => {
    compressMock.mockReset()
    getCustomCoverMock.mockReset().mockResolvedValue(null)
    gmGetMock.mockReset()
    iterateJavCacheMock.mockReset()
    posterCacheGetMock.mockReset().mockResolvedValue(null)
  })

  it('校验上传图片的文件类型与体积上限', () => {
    expect(validateUploadImageFile({ type: 'application/pdf', size: 1024 })).toContain('图片')
    expect(validateUploadImageFile({ type: 'image/png', size: 0 })).toContain('为空')
    expect(validateUploadImageFile({ type: 'image/png', size: MAX_UPLOAD_IMAGE_BYTES + 1 })).toContain('20MB')
    expect(validateUploadImageFile({ type: 'image/jpeg', size: 2048 })).toBeNull()
  })

  it('压缩自定义封面为 480px 与 1440px 双档 WebP，头像为 480px WebP', async () => {
    const thumb = new Blob(['thumb'], { type: 'image/webp' })
    const full = new Blob(['full'], { type: 'image/webp' })
    const avatar = new Blob(['avatar'], { type: 'image/webp' })
    compressMock
      .mockResolvedValueOnce(thumb)
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce(avatar)

    const src = new Blob(['raw'], { type: 'image/png' })
    const coverResult = await compressCustomCover(src)
    expect(coverResult).toEqual({ thumbBlob: thumb, fullBlob: full })
    expect(compressMock).toHaveBeenNthCalledWith(1, src, {
      maxWidth: 480,
      maxHeight: 480,
      quality: 0.75,
      type: 'image/webp',
    })
    expect(compressMock).toHaveBeenNthCalledWith(2, src, {
      maxWidth: 1440,
      maxHeight: 1440,
      quality: 0.82,
      type: 'image/webp',
    })

    const avatarResult = await compressCustomAvatar(src)
    expect(avatarResult).toBe(avatar)
    expect(compressMock).toHaveBeenNthCalledWith(3, src, {
      maxWidth: 480,
      maxHeight: 480,
      quality: 0.8,
      type: 'image/webp',
    })
  })

  it('汇总当前元数据与 javCache 多源封面并按 URL 去重', async () => {
    const meta: UnifiedMediaMeta = {
      mediaKey: 'jav:SSIS001',
      kind: 'jav',
      externalId: 'SSIS-001',
      title: '测试影片',
      coverUrl: 'https://img.example/main.jpg',
      posterUrl: 'https://img.example/poster.jpg',
      coverFallbacks: [{ url: 'https://img.example/backup.jpg' }],
      directors: [],
      actors: [],
      genres: [],
      source: 'JavLibrary',
      detailUrl: 'https://javlibrary.example/v/1',
      updatedAt: 1,
    }

    const javBusEntry: JavInfo = {
      source: JAV_SOURCE.JAVBUS,
      baseUrl: 'https://javbus.example',
      detailUrl: 'https://javbus.example/SSIS-001',
      searchUrl: '',
      avNumber: 'SSIS-001',
      cover: { url: 'https://img.example/main.jpg' },
      coverSingle: { url: 'https://javbus.example/single.jpg' },
    }

    iterateJavCacheMock.mockImplementation(async (callback: (entry: unknown) => void) => {
      callback({ value: javBusEntry })
    })

    const list = await collectLocalCoverCandidates('SSIS-001', meta)
    expect(list.map(item => item.url)).toEqual([
      'https://img.example/main.jpg',
      'https://img.example/poster.jpg',
      'https://img.example/backup.jpg',
      'https://javbus.example/single.jpg',
    ])
  })

  it('loadPosterThumbUrl 命中自定义封面时直接返回本地 Blob 不请求远端', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:custom-cover')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const customBlob = new Blob(['custom-webp'], { type: 'image/webp' })
    getCustomCoverMock.mockResolvedValue({
      kind: 'cover',
      mediaKey: 'jav:SSIS001',
      thumbBlob: customBlob,
      fullBlob: customBlob,
      sourceLabel: '本地上传',
      updatedAt: 100,
    })

    const resource = await loadPosterThumbUrl(
      'jav:SSIS001',
      [{ url: 'https://img.example/remote.jpg' }],
      new AbortController().signal,
    )

    expect(resource?.url).toBe('blob:custom-cover')
    expect(posterCacheGetMock).not.toHaveBeenCalled()
    expect(gmGetMock).not.toHaveBeenCalled()
    resource?.dispose()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:custom-cover')

    vi.unstubAllGlobals()
  })
})
