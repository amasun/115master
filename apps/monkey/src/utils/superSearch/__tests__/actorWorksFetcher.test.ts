// @vitest-environment jsdom
import type { IRequest, RequestOptions, ResponseType } from '@115master/shared'
import type { ActorWorksCacheEntry } from '../types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ActorSourceBlockedError,
  fetchActorWorks,
  HARD_MAX_PAGES,
  isBlockedResponse,
  resetActorFetcherCircuitBreaker,
  SOURCE_COOLDOWN_MS,
} from '../actorWorksFetcher'

interface MockReply {
  status?: number
  body: string
}

function createMockRequest(handler: (url: string, options?: RequestOptions) => MockReply | Promise<MockReply>): {
  request: IRequest
  calls: string[]
} {
  const calls: string[] = []

  async function run(url: string, options?: RequestOptions): Promise<ResponseType> {
    if (options?.signal?.aborted)
      throw options.signal.reason ?? new DOMException('已取消', 'AbortError')
    calls.push(url)
    const reply = await handler(url, options)
    return new Response(reply.body, {
      status: reply.status ?? 200,
    })
  }

  const request: IRequest = {
    get: run,
    post: run,
    request: run,
  }

  return { request, calls }
}

function createMemoryStore(initial?: ActorWorksCacheEntry | null) {
  let stored = initial ?? null
  const getMock = vi.fn(async () => stored)
  const saveMock = vi.fn(async (entry: ActorWorksCacheEntry) => {
    stored = entry
  })
  return {
    store: { get: getMock, save: saveMock },
    getMock,
    saveMock,
    getStored: () => stored,
  }
}

const instantSleep = vi.fn(async (_ms: number, signal?: AbortSignal) => {
  if (signal?.aborted)
    throw signal.reason ?? new DOMException('已取消', 'AbortError')
})

describe('actorWorksFetcher', () => {
  beforeEach(() => {
    resetActorFetcherCircuitBreaker()
    instantSleep.mockClear()
  })

  it('支持 JavBus 搜索演员、多页翻页、番号标准化与 hasMore 识别', async () => {
    const { store, saveMock } = createMemoryStore()
    const { request, calls } = createMockRequest((url) => {
      if (url.includes('/searchstar/')) {
        return {
          body: `
            <div class="avatar-box">
              <a href="/star/2jv"><span>三上悠亜</span></a>
            </div>
          `,
        }
      }
      if (url === 'https://www.javbus.com/star/2jv') {
        return {
          body: `
            <div class="movie-box"><date>ssis-001</date><date>2021-03-19</date></div>
            <div class="movie-box"><date>SSIS-002</date><date>2021-04-19</date></div>
            <a id="next" href="/star/2jv/2">下一页</a>
          `,
        }
      }
      if (url === 'https://www.javbus.com/star/2jv/2') {
        return {
          body: `
            <div class="movie-box"><date>fc2-4853836</date><date>2022-01-01</date></div>
            <div class="movie-box"><date>SSIS-001</date><date>2021-03-19</date></div>
            <ul class="pagination"><li><a href="/star/2jv/3">3</a></li></ul>
          `,
        }
      }
      return { status: 404, body: '' }
    })

    const progressPages: number[] = []
    const result = await fetchActorWorks('三上悠亚', {
      maxPages: 2,
      request,
      sleep: instantSleep,
      now: () => 1_700_000_000_000,
      store,
      onProgress: p => progressPages.push(p.page),
    })

    expect(result.fromCache).toBe(false)
    expect(result.entry.source).toBe('javbus')
    expect(result.entry.name).toBe('三上悠亜')
    expect(result.entry.profileUrl).toBe('https://www.javbus.com/star/2jv')
    expect(result.entry.avNumbers).toEqual(['SSIS001', 'SSIS002', 'FC2PPV4853836'])
    expect(result.entry.fetchedPages).toBe(2)
    expect(result.entry.hasMore).toBe(true)
    expect(calls).toEqual([
      'https://www.javbus.com/searchstar/%E4%B8%89%E4%B8%8A%E6%82%A0%E4%BA%9A',
      'https://www.javbus.com/star/2jv',
      'https://www.javbus.com/star/2jv/2',
    ])
    expect(progressPages).toEqual([0, 1, 2])
    expect(saveMock).toHaveBeenCalledTimes(1)
  })

  it('当 JavBus 未找到演员时自动降级至 JavDB', async () => {
    const { store } = createMemoryStore()
    const { request, calls } = createMockRequest((url) => {
      if (url.includes('javbus.com/searchstar/')) {
        return { body: '<div class="empty">没有结果</div>' }
      }
      if (url.includes('javdb.com/search')) {
        return {
          body: `
            <div class="actor-box">
              <a href="/actors/abc123"><strong>松下紗栄子</strong>（松下纱荣子）</a>
            </div>
          `,
        }
      }
      if (url === 'https://javdb.com/actors/abc123') {
        return {
          body: `
            <div class="movie-list">
              <div class="item"><div class="video-title"><strong>ADN-202</strong> 作品标题</div></div>
              <div class="item"><span class="uid">ATID-380</span></div>
            </div>
            <a class="pagination-next" disabled>下一页</a>
          `,
        }
      }
      return { status: 404, body: '' }
    })

    const result = await fetchActorWorks('松下纱荣子', {
      request,
      sleep: instantSleep,
      now: () => 2000,
      store,
    })

    expect(result.entry.source).toBe('javdb')
    expect(result.entry.avNumbers).toEqual(['ADN202', 'ATID380'])
    expect(result.entry.hasMore).toBe(false)
    expect(result.entry.aliases).toContain('松下纱荣子')
    expect(result.entry.aliases).toContain('松下紗栄子')
    expect(calls.some(u => u.includes('javdb.com/actors/abc123'))).toBe(true)
  })

  it('命中 403/429/Cloudflare 时触发 5 分钟熔断并在冷却后自动恢复', async () => {
    let clock = 10_000
    const { store } = createMemoryStore()
    const { request, calls } = createMockRequest((url) => {
      if (url.includes('javbus.com/searchstar/')) {
        if (clock < 10_000 + SOURCE_COOLDOWN_MS) {
          return { status: 403, body: 'Just a moment... cf-challenge' }
        }
        return {
          body: '<div class="avatar-box"><a href="/star/ok"><span>桃乃木かな</span></a></div>',
        }
      }
      if (url === 'https://www.javbus.com/star/ok') {
        return {
          body: '<div class="movie-box"><date>IPX-534</date></div>',
        }
      }
      if (url.includes('javdb.com/search')) {
        return { status: 429, body: 'Too Many Requests' }
      }
      return { status: 404, body: '' }
    })

    await expect(fetchActorWorks('桃乃木香奈', {
      request,
      sleep: instantSleep,
      now: () => clock,
      store,
    })).rejects.toThrow('熔断冷却')

    /** 冷却期内再次请求不会继续访问外部站点 */
    const callCountAfterTrip = calls.length
    await expect(fetchActorWorks('桃乃木香奈', {
      request,
      sleep: instantSleep,
      now: () => clock + 60_000,
      store,
    })).rejects.toThrow('熔断冷却')
    expect(calls).toHaveLength(callCountAfterTrip)

    /** 冷却到期后恢复正常请求 */
    clock += SOURCE_COOLDOWN_MS
    const recovered = await fetchActorWorks('桃乃木香奈', {
      request,
      sleep: instantSleep,
      now: () => clock,
      store,
    })
    expect(recovered.entry.source).toBe('javbus')
    expect(recovered.entry.avNumbers).toEqual(['IPX534'])
  })

  it('识别 Cloudflare 与 JavDB 登录墙拦截', () => {
    expect(isBlockedResponse(429, '', 'javbus')).toBe(true)
    expect(isBlockedResponse(200, '<title>Just a moment...</title>', 'javbus')).toBe(true)
    expect(isBlockedResponse(200, '<form action="/users/sign_in">请先登录</form>', 'javdb')).toBe(true)
    expect(isBlockedResponse(200, '<a href="/users/sign_in">登入</a><div class="movie-list"></div>', 'javdb')).toBe(false)
  })

  it('命中缓存时不发请求，forceRefresh 与加载更多可正常工作', async () => {
    const cachedEntry: ActorWorksCacheEntry = {
      actorKey: '三上悠亚',
      name: '三上悠亜',
      aliases: ['三上悠亚', '三上悠亜'],
      source: 'javbus',
      profileUrl: 'https://www.javbus.com/star/2jv',
      avNumbers: ['SSIS001'],
      fetchedPages: 1,
      hasMore: true,
      cachedAt: 5000,
    }
    const { store, getStored } = createMemoryStore(cachedEntry)
    const { request, calls } = createMockRequest((url) => {
      if (url.includes('/searchstar/')) {
        return { body: '<div class="avatar-box"><a href="/star/2jv"><span>三上悠亜</span></a></div>' }
      }
      if (url === 'https://www.javbus.com/star/2jv') {
        return {
          body: '<div class="movie-box"><date>SSIS-001</date></div><a id="next" href="/star/2jv/2">2</a>',
        }
      }
      if (url === 'https://www.javbus.com/star/2jv/2') {
        return {
          body: '<div class="movie-box"><date>SSIS-099</date></div>',
        }
      }
      return { status: 404, body: '' }
    })

    /** 1. 缓存命中：0 网络请求 */
    const hit = await fetchActorWorks('三上悠亚', {
      request,
      sleep: instantSleep,
      now: () => 6000,
      store,
    })
    expect(hit.fromCache).toBe(true)
    expect(calls).toHaveLength(0)

    /** 2. 加载更多：从第 2 页继续翻页并合并作品表 */
    const more = await fetchActorWorks('三上悠亚', {
      existingEntry: hit.entry,
      maxPages: 2,
      request,
      sleep: instantSleep,
      now: () => 7000,
      store,
    })
    expect(more.fromCache).toBe(false)
    expect(more.entry.avNumbers).toEqual(['SSIS001', 'SSIS099'])
    expect(more.entry.fetchedPages).toBe(2)
    expect(more.entry.hasMore).toBe(false)
    expect(calls).toEqual(['https://www.javbus.com/star/2jv/2'])
    expect(getStored()?.avNumbers).toEqual(['SSIS001', 'SSIS099'])

    /** 3. forceRefresh 跳过缓存重新拉取 */
    const refreshed = await fetchActorWorks('三上悠亚', {
      forceRefresh: true,
      maxPages: 1,
      request,
      sleep: instantSleep,
      now: () => 8000,
      store,
    })
    expect(refreshed.fromCache).toBe(false)
    expect(refreshed.entry.fetchedPages).toBe(1)
    expect(refreshed.entry.hasMore).toBe(true)
  })

  it('loadMore 达到硬上限或存在熔断时按预期处理', async () => {
    const maxed: ActorWorksCacheEntry = {
      actorKey: 'test',
      name: 'Test',
      aliases: [],
      source: 'javbus',
      profileUrl: 'https://www.javbus.com/star/1',
      avNumbers: ['ABC001'],
      fetchedPages: HARD_MAX_PAGES,
      hasMore: true,
      cachedAt: 1000,
    }
    const { store } = createMemoryStore(maxed)
    const { request, calls } = createMockRequest(() => ({ body: '' }))

    const capped = await fetchActorWorks('Test', {
      existingEntry: maxed,
      request,
      sleep: instantSleep,
      store,
    })
    expect(capped.entry.hasMore).toBe(false)
    expect(calls).toHaveLength(0)

    /** 加载更多时若数据源被限流会抛出 ActorSourceBlockedError */
    const canLoadMore: ActorWorksCacheEntry = { ...maxed, fetchedPages: 1 }
    const blockedReq = createMockRequest(() => ({ status: 429, body: 'rate limit' }))
    await expect(fetchActorWorks('Test', {
      existingEntry: canLoadMore,
      request: blockedReq.request,
      sleep: instantSleep,
      store,
    })).rejects.toBeInstanceOf(ActorSourceBlockedError)
  })

  it('支持 AbortSignal 取消请求', async () => {
    const controller = new AbortController()
    const { store } = createMemoryStore()
    const { request } = createMockRequest(() => {
      controller.abort()
      return {
        body: '<div class="avatar-box"><a href="/star/2jv"><span>三上悠亜</span></a></div>',
      }
    })

    await expect(fetchActorWorks('三上悠亜', {
      signal: controller.signal,
      request,
      sleep: instantSleep,
      store,
    })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
