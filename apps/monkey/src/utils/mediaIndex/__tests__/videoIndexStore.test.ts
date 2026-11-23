import { beforeEach, describe, expect, it, vi } from 'vitest'

const missStore = new Map<string, unknown>()

vi.mock('@/utils/logger', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    sub: () => logger,
  }
  return { appLogger: logger }
})

vi.mock('@/utils/superSearch', () => ({
  clearVideoIndexSnapshot: vi.fn(),
  loadVideoIndexSnapshot: vi.fn(),
  saveVideoIndexSnapshot: vi.fn(),
}))

vi.mock('@115master/shared', () => ({
  CacheCore: class MockCacheCore {
    storage = {
      iterate: async (callback: (entry: unknown, key: string) => void) => {
        for (const [key, entry] of missStore.entries())
          callback(entry, key)
      },
      clear: async () => {
        missStore.clear()
      },
    }

    async get(key: string) {
      return missStore.get(key)
    }

    async set(key: string, value: unknown) {
      missStore.set(key, { value })
    }

    async remove(key: string) {
      missStore.delete(key)
    }

    async clear() {
      missStore.clear()
    }
  },
}))

const {
  SCRAPE_MISS_RULE_VERSION,
  clearAllScrapeMissed,
  isScrapeMissed,
  markScrapeMissed,
  readActiveScrapeMissKeys,
} = await import('../videoIndexStore')

describe('videoIndexStore scrapeMissCache', () => {
  beforeEach(() => {
    missStore.clear()
  })

  it('旧版本或无版本号的未命中负缓存会自动失效并清理', async () => {
    const now = 1_000_000
    missStore.set('jav:011015780', {
      value: {
        avNumber: '011015_780',
        missedAt: now - 1000,
        expiresAt: now + 60_000,
      },
    })
    missStore.set('jav:OLD001', {
      value: {
        avNumber: 'OLD-001',
        missedAt: now - 1000,
        expiresAt: now + 60_000,
        ruleVersion: SCRAPE_MISS_RULE_VERSION - 1,
      },
    })
    missStore.set('jav:CURR001', {
      value: {
        avNumber: 'CURR-001',
        missedAt: now - 1000,
        expiresAt: now + 60_000,
        ruleVersion: SCRAPE_MISS_RULE_VERSION,
      },
    })

    expect(await isScrapeMissed('jav:011015780', now)).toBe(false)
    expect(missStore.has('jav:011015780')).toBe(false)

    const active = await readActiveScrapeMissKeys(now)
    expect(Array.from(active)).toEqual(['jav:CURR001'])
    expect(missStore.has('jav:OLD001')).toBe(false)
  })

  it('markScrapeMissed 会写入当前规则版本，clearAllScrapeMissed 会清空全部负缓存', async () => {
    const now = 2_000_000
    await markScrapeMissed('jav:TEST001', 'TEST-001', 60_000, now)
    expect(await isScrapeMissed('jav:TEST001', now + 1000)).toBe(true)

    const stored = missStore.get('jav:TEST001') as { value: { ruleVersion?: number } }
    expect(stored.value.ruleVersion).toBe(SCRAPE_MISS_RULE_VERSION)

    await clearAllScrapeMissed()
    expect(missStore.size).toBe(0)
    expect(await isScrapeMissed('jav:TEST001', now + 1000)).toBe(false)
  })
})
