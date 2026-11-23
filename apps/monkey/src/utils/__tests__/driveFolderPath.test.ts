import type { FolderPathDriveApi } from '../driveFolderPath'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/drive115Instance', () => ({
  drive115: {
    file: {
      getFilesWithFallback: vi.fn(),
    },
  },
}))

const {
  buildFolderPathsFromTrail,
  createFolderPathResolver,
  ROOT_FOLDER_PATH,
} = await import('../driveFolderPath')

function createMemoryStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  }
}

async function flushAsync(turns = 8) {
  for (let i = 0; i < turns; i += 1)
    await Promise.resolve()
}

describe('driveFolderPath', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('buildFolderPathsFromTrail', () => {
    it('builds displayLabel and fullPath across root and nested depths', () => {
      const rootOnly = buildFolderPathsFromTrail([{ cid: 0, name: '' }], '0', 100)
      expect(rootOnly).toEqual([
        {
          cid: '0',
          name: '根目录',
          displayLabel: '根目录',
          fullPath: '根目录',
          updatedAt: 100,
        },
      ])

      const nested = buildFolderPathsFromTrail(
        [
          { cid: '0', name: '根目录' },
          { cid: 10, name: '云下载' },
          { cid: '20', name: 'SSIS-001' },
          { cid: '30', name: '4K' },
        ],
        '30',
        200,
      )

      expect(nested.map(item => ({
        cid: item.cid,
        displayLabel: item.displayLabel,
        fullPath: item.fullPath,
        parentName: item.parentName,
      }))).toEqual([
        { cid: '0', displayLabel: '根目录', fullPath: '根目录', parentName: undefined },
        { cid: '10', displayLabel: '根目录 / 云下载', fullPath: '根目录 / 云下载', parentName: '根目录' },
        { cid: '20', displayLabel: '云下载 / SSIS-001', fullPath: '根目录 / 云下载 / SSIS-001', parentName: '云下载' },
        { cid: '30', displayLabel: 'SSIS-001 / 4K', fullPath: '根目录 / 云下载 / SSIS-001 / 4K', parentName: 'SSIS-001' },
      ])
    })

    it('truncates to requestedCid when trail includes children and aliases missing requestedCid', () => {
      const truncated = buildFolderPathsFromTrail(
        [
          { cid: '0', name: '根目录' },
          { cid: '10', name: '云下载' },
          { cid: '20', name: '子目录' },
        ],
        '10',
        300,
      )
      expect(truncated.map(item => item.cid)).toEqual(['0', '10'])

      const aliased = buildFolderPathsFromTrail(
        [
          { cid: '0', name: '根目录' },
          { cid: '10', name: '云下载' },
        ],
        '999',
        400,
      )
      expect(aliased.find(item => item.cid === '999')).toMatchObject({
        cid: '999',
        name: '云下载',
        displayLabel: '根目录 / 云下载',
      })
    })
  })

  describe('createFolderPathResolver', () => {
    it('returns root path synchronously without calling API', () => {
      const getFilesWithFallback = vi.fn()
      const resolver = createFolderPathResolver({
        driveApi: { getFilesWithFallback } as unknown as FolderPathDriveApi,
        storageKey: null,
        delayMs: 0,
      })

      expect(resolver.getCached('0')).toEqual(ROOT_FOLDER_PATH)
      expect(resolver.getCached('')).toEqual(ROOT_FOLDER_PATH)

      resolver.prefetch(['0', '', '  '])
      expect(getFilesWithFallback).not.toHaveBeenCalled()
    })

    it('deduplicates concurrent cids and caches ancestors from path trail', async () => {
      const getFilesWithFallback = vi.fn().mockResolvedValue({
        state: true,
        path: [
          { cid: '0', name: '根目录' },
          { cid: '10', name: '云下载' },
          { cid: '20', name: '推广广告' },
        ],
        data: [],
      })

      const resolver = createFolderPathResolver({
        driveApi: { getFilesWithFallback } as unknown as FolderPathDriveApi,
        storageKey: null,
        delayMs: 0,
        maxConcurrent: 1,
      })

      resolver.prefetch(['20', '20', '10'])
      await flushAsync()

      expect(getFilesWithFallback).toHaveBeenCalledTimes(1)
      expect(getFilesWithFallback).toHaveBeenCalledWith(expect.objectContaining({
        cid: '20',
        limit: 1,
        show_dir: 1,
        cur: 1,
      }))
      expect(resolver.getCached('20')?.displayLabel).toBe('云下载 / 推广广告')
      expect(resolver.getCached('20')?.fullPath).toBe('根目录 / 云下载 / 推广广告')
      expect(resolver.getCached('10')?.displayLabel).toBe('根目录 / 云下载')

      resolver.prefetch(['10', '20'])
      await flushAsync()
      expect(getFilesWithFallback).toHaveBeenCalledTimes(1)
    })

    it('deduplicates identical concurrent cids even with multiple workers', async () => {
      let resolveReq!: (value: unknown) => void
      const getFilesWithFallback = vi.fn().mockImplementation(
        () => new Promise((resolve) => {
          resolveReq = resolve
        }),
      )

      const resolver = createFolderPathResolver({
        driveApi: { getFilesWithFallback } as unknown as FolderPathDriveApi,
        storageKey: null,
        delayMs: 0,
        maxConcurrent: 2,
      })

      resolver.prefetch(['20', '20'])
      resolver.prefetch(['20'])
      await flushAsync(2)

      expect(getFilesWithFallback).toHaveBeenCalledTimes(1)
      resolveReq({
        state: true,
        path: [
          { cid: '0', name: '根目录' },
          { cid: '20', name: '推广广告' },
        ],
        data: [],
      })
      await flushAsync()
      expect(resolver.getCached('20')?.displayLabel).toBe('根目录 / 推广广告')
    })

    it('respects maxConcurrent limit and skips queued cids after cancelScope', async () => {
      const resolvers: Array<() => void> = []
      const getFilesWithFallback = vi.fn().mockImplementation(
        () => new Promise((resolve) => {
          resolvers.push(() => resolve({
            state: true,
            path: [
              { cid: '0', name: '根目录' },
              { cid: '101', name: '目录A' },
            ],
            data: [],
          }))
        }),
      )

      const resolver = createFolderPathResolver({
        driveApi: { getFilesWithFallback } as unknown as FolderPathDriveApi,
        storageKey: null,
        delayMs: 0,
        maxConcurrent: 1,
      })

      const scope = Symbol('scope')
      resolver.prefetch(['101', '102'], scope)
      await flushAsync(2)

      expect(getFilesWithFallback).toHaveBeenCalledTimes(1)
      resolver.cancelScope(scope)

      resolvers.forEach(done => done())
      await flushAsync()
      expect(getFilesWithFallback).toHaveBeenCalledTimes(1)
    })

    it('handles API failure gracefully with cooldown and persists valid cache across instances', async () => {
      const failingApi = vi.fn().mockRejectedValueOnce(new Error('network error'))
      const resolverA = createFolderPathResolver({
        driveApi: { getFilesWithFallback: failingApi } as unknown as FolderPathDriveApi,
        storageKey: 'test_folder_cache',
        delayMs: 0,
      })

      resolverA.prefetch(['404'])
      await flushAsync()
      expect(resolverA.getCached('404')).toBeNull()
      expect(failingApi).toHaveBeenCalledTimes(1)

      // 冷却期内不重复请求
      resolverA.prefetch(['404'])
      await flushAsync()
      expect(failingApi).toHaveBeenCalledTimes(1)

      const okApi = vi.fn().mockResolvedValue({
        state: true,
        path: [
          { cid: '0', name: '根目录' },
          { cid: '50', name: '精选' },
          { cid: '51', name: '2026' },
        ],
        data: [],
      })
      const resolverB = createFolderPathResolver({
        driveApi: { getFilesWithFallback: okApi } as unknown as FolderPathDriveApi,
        storageKey: 'test_folder_cache',
        delayMs: 0,
      })

      resolverB.prefetch(['51'])
      await flushAsync()
      resolverB.flushPersist()

      const resolverC = createFolderPathResolver({
        driveApi: { getFilesWithFallback: vi.fn() } as unknown as FolderPathDriveApi,
        storageKey: 'test_folder_cache',
        ttlMs: 60_000,
      })
      expect(resolverC.getCached('51')?.displayLabel).toBe('精选 / 2026')
    })

    it('discards expired cache entries on hydrate and getCached', () => {
      localStorage.setItem('expired_folder_cache', JSON.stringify([
        {
          cid: '77',
          name: '旧目录',
          parentName: '根目录',
          displayLabel: '根目录 / 旧目录',
          fullPath: '根目录 / 旧目录',
          updatedAt: Date.now() - 10_000,
        },
      ]))

      const resolver = createFolderPathResolver({
        driveApi: { getFilesWithFallback: vi.fn() } as unknown as FolderPathDriveApi,
        storageKey: 'expired_folder_cache',
        ttlMs: 1_000,
      })

      expect(resolver.getCached('77')).toBeNull()
    })

    it('trips global backoff on non-JSON rate-limit error and stops hitting API for remaining cids', async () => {
      const getFilesWithFallback = vi.fn().mockRejectedValue(
        new Error('115 接口返回了非 JSON 页面（可能触发风控、接口重定向或登录态失效，请刷新 115 页面后重试）'),
      )

      const resolver = createFolderPathResolver({
        driveApi: { getFilesWithFallback } as unknown as FolderPathDriveApi,
        storageKey: null,
        delayMs: 0,
        maxConcurrent: 1,
        globalBackoffMs: 30_000,
      })

      resolver.prefetch(['201', '202', '203'])
      await flushAsync(4)

      expect(getFilesWithFallback).toHaveBeenCalledTimes(1)
      resolver.clear()
    })
  })
})
