import { beforeEach, describe, expect, it, vi } from 'vitest'

const { gmGetMock, cacheSetMock, loggerMock, mockSettings } = vi.hoisted(() => ({
  gmGetMock: vi.fn(),
  cacheSetMock: vi.fn(),
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    sub: undefined as unknown as ReturnType<typeof vi.fn>,
  },
  mockSettings: {
    tmdbApiKey: '',
    tmdbProxyUrl: '',
  },
}))
loggerMock.sub = vi.fn(() => loggerMock)

vi.mock('@/utils/logger', () => ({
  appLogger: {
    sub: () => loggerMock,
  },
}))

vi.mock('@/utils/request/gmRequest', () => ({
  GMRequest: class {
    get = gmGetMock
  },
}))

vi.mock('@/utils/userSettings', () => ({
  userSettings: {
    value: mockSettings,
  },
}))

vi.mock('@/utils/cache/const', () => ({
  STORE_NAME: 'test_store',
}))

vi.mock('@115master/shared', () => ({
  CacheCore: class {
    storage = {
      iterate: vi.fn(),
    }

    set = cacheSetMock
  },
}))

const {
  DEFAULT_TMDB_API_BASE,
  DEFAULT_TMDB_IMAGE_BASE,
  normalizeTmdbImageUrl,
  resolveTmdbApiBase,
  scrapeCinemaMetaDetailed,
} = await import('../cinemaScraper')

function jsonResponse(data: unknown, status = 200) {
  return {
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
}

describe('cinemaScraper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSettings.tmdbApiKey = ''
    mockSettings.tmdbProxyUrl = ''
  })

  it('正确规范化默认与自定义 TMDB API 反代地址', () => {
    expect(resolveTmdbApiBase('')).toBe(DEFAULT_TMDB_API_BASE)
    expect(resolveTmdbApiBase('   ')).toBe(DEFAULT_TMDB_API_BASE)
    expect(resolveTmdbApiBase('invalid-url')).toBe(DEFAULT_TMDB_API_BASE)
    expect(resolveTmdbApiBase('https://tmdb-proxy.example.com')).toBe('https://tmdb-proxy.example.com/3')
    expect(resolveTmdbApiBase('https://tmdb-proxy.example.com/3/')).toBe('https://tmdb-proxy.example.com/3')
  })

  it('能将历史官方 TMDB 图片地址规范化为内置加速代理地址', () => {
    expect(normalizeTmdbImageUrl('https://image.tmdb.org/t/p/w500/abc.jpg')).toBe(`${DEFAULT_TMDB_IMAGE_BASE}/w500/abc.jpg`)
    expect(normalizeTmdbImageUrl(`${DEFAULT_TMDB_IMAGE_BASE}/w500/abc.jpg`)).toBe(`${DEFAULT_TMDB_IMAGE_BASE}/w500/abc.jpg`)
    expect(normalizeTmdbImageUrl('https://img9.doubanio.com/view/photo/poster.jpg')).toBe('https://img9.doubanio.com/view/photo/poster.jpg')
    expect(normalizeTmdbImageUrl('   ')).toBeUndefined()
  })

  it('未填写 TMDB Key 时走内置加速反代免 Key 刮削并输出加速图片地址', async () => {
    gmGetMock.mockImplementation(async (url: string, opts?: { params?: Record<string, string>, headers?: Record<string, string> }) => {
      expect(opts?.params?.api_key).toBeUndefined()
      expect(opts?.headers?.Authorization).toBeUndefined()

      if (url === `${DEFAULT_TMDB_API_BASE}/search/movie`) {
        return jsonResponse({
          results: [{ id: 1001, title: '流浪地球2', poster_path: '/p1.jpg', release_date: '2023-01-22' }],
        })
      }
      if (url === `${DEFAULT_TMDB_API_BASE}/movie/1001`) {
        return jsonResponse({
          id: 1001,
          title: '流浪地球2',
          overview: '太阳危机故事',
          poster_path: '/p1.jpg',
          backdrop_path: '/b1.jpg',
          release_date: '2023-01-22',
          runtime: 173,
          vote_average: 8.2,
          genres: [{ name: '科幻' }],
          credits: {
            crew: [{ name: '郭帆', job: 'Director' }],
            cast: [{ name: '吴京', profile_path: '/a1.jpg', gender: 2 }],
          },
        })
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const result = await scrapeCinemaMetaDetailed({
      mediaKey: 'movie:流浪地球2:2023',
      filename: '流浪地球2.2023.2160p.mp4',
    })

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.meta.source).toBe('TMDB')
      expect(result.meta.posterUrl).toBe(`${DEFAULT_TMDB_IMAGE_BASE}/w500/p1.jpg`)
      expect(result.meta.backdropUrl).toBe(`${DEFAULT_TMDB_IMAGE_BASE}/w1280/b1.jpg`)
      expect(result.meta.actors[0]?.avatarUrl).toBe(`${DEFAULT_TMDB_IMAGE_BASE}/w185/a1.jpg`)
    }
    expect(cacheSetMock).toHaveBeenCalledTimes(1)
  })

  it('内置反代返回 503 或超时时自动回退豆瓣', async () => {
    gmGetMock.mockImplementation(async (url: string) => {
      if (url.startsWith(DEFAULT_TMDB_API_BASE))
        return jsonResponse({ status_code: 503, status_message: 'TMDB_API_KEY secret not configured' }, 503)
      if (url.includes('subject_suggest')) {
        return jsonResponse([{
          id: '35267208',
          title: '流浪地球2',
          sub_title: '流浪地球2',
          year: '2023',
          img: 'http://img9.doubanio.com/view/photo/s_ratio_poster/public/p2916835424.jpg',
        }])
      }
      if (url.includes('subject_abstract')) {
        return jsonResponse({
          r: 0,
          subject: {
            id: '35267208',
            title: '流浪地球2\u200E (2023)',
            rate: '8.3',
            is_tv: false,
            directors: ['郭帆'],
            actors: ['吴京'],
          },
        })
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const result = await scrapeCinemaMetaDetailed({
      mediaKey: 'movie:流浪地球2:2023',
      filename: '流浪地球2.2023.mp4',
    })

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.meta.source).toBe('Douban')
    }
    expect(loggerMock.warn).toHaveBeenCalled()
  })

  it('配置 TMDB Key 与自定义反代时优先走反代并保存元数据', async () => {
    mockSettings.tmdbApiKey = 'test_v3_key'
    mockSettings.tmdbProxyUrl = 'https://tmdb.example.com/'

    gmGetMock.mockImplementation(async (url: string) => {
      if (url === 'https://tmdb.example.com/3/search/movie') {
        return jsonResponse({
          results: [{ id: 1001, title: '流浪地球2', poster_path: '/p1.jpg', release_date: '2023-01-22' }],
        })
      }
      if (url === 'https://tmdb.example.com/3/movie/1001') {
        return jsonResponse({
          id: 1001,
          title: '流浪地球2',
          overview: '太阳危机故事',
          poster_path: '/p1.jpg',
          backdrop_path: '/b1.jpg',
          release_date: '2023-01-22',
          runtime: 173,
          vote_average: 8.2,
          genres: [{ name: '科幻' }],
          credits: {
            crew: [{ name: '郭帆', job: 'Director' }],
            cast: [{ name: '吴京', profile_path: '/a1.jpg', gender: 2 }],
          },
        })
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const result = await scrapeCinemaMetaDetailed({
      mediaKey: 'movie:流浪地球2:2023',
      filename: '流浪地球2.2023.2160p.mp4',
    })

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.meta.source).toBe('TMDB')
      expect(result.meta.title).toBe('流浪地球2')
      expect(result.meta.directors).toEqual(['郭帆'])
      expect(result.meta.actors[0]?.name).toBe('吴京')
      expect(result.meta.genres).toEqual(['科幻'])
    }
    expect(cacheSetMock).toHaveBeenCalledTimes(1)
  })

  it('在 TMDB 请求超时或报错时自动回退豆瓣并使用 subject_abstract JSON 详情', async () => {
    mockSettings.tmdbApiKey = 'test_v3_key'

    gmGetMock.mockImplementation(async (url: string) => {
      if (url.includes('115masterfusion-tmdb-img.xyzpark.com'))
        throw new Error('请求超时')
      if (url.includes('subject_suggest')) {
        return jsonResponse([{
          id: '35267208',
          title: '流浪地球2',
          sub_title: '流浪地球2',
          year: '2023',
          img: 'http://img9.doubanio.com/view/photo/s_ratio_poster/public/p2916835424.jpg',
        }])
      }
      if (url.includes('subject_abstract')) {
        return jsonResponse({
          r: 0,
          subject: {
            id: '35267208',
            title: '流浪地球2\u200E (2023)',
            rate: '8.3',
            is_tv: false,
            directors: ['郭帆'],
            actors: ['吴京', '刘德华'],
            duration: '173分钟',
            types: ['科幻', '冒险'],
            release_year: '2023',
            short_comment: { content: '国产科幻里程碑' },
          },
        })
      }
      throw new Error(`unexpected url: ${url}`)
    })

    const result = await scrapeCinemaMetaDetailed({
      mediaKey: 'movie:流浪地球2:2023',
      filename: '流浪地球2.杜比视界.60fps.DDP5.1-HHWEB.mp4',
    })

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.meta.source).toBe('Douban')
      expect(result.meta.externalId).toBe('douban:35267208')
      expect(result.meta.title).toBe('流浪地球2')
      expect(result.meta.year).toBe(2023)
      expect(result.meta.rating).toBe(8.3)
      expect(result.meta.duration).toBe(173)
      expect(result.meta.directors).toEqual(['郭帆'])
      expect(result.meta.actors.map(a => a.name)).toEqual(['吴京', '刘德华'])
      expect(result.meta.genres).toEqual(['科幻', '冒险'])
      expect(result.meta.coverUrl).toBe('https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2916835424.jpg')
      expect(result.meta.overview).toBe('国产科幻里程碑')
    }
    expect(loggerMock.warn).toHaveBeenCalled()
  })

  it('双源均发生网络异常时返回 network_error 而非写入负缓存 not_found', async () => {
    mockSettings.tmdbApiKey = 'test_v3_key'
    gmGetMock.mockRejectedValue(new Error('network timeout'))

    const result = await scrapeCinemaMetaDetailed({
      mediaKey: 'movie:dune:2021',
      filename: 'Dune.2021.mp4',
    })

    expect(result.status).toBe('network_error')
    expect(cacheSetMock).not.toHaveBeenCalled()
  })
})
