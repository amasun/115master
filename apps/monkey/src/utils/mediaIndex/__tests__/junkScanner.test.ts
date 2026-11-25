import type { JunkScannerDriveApi } from '../junkScanner'
import type { IndexedVideo } from '../types'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/drive115Instance', () => ({
  drive115: {
    file: {
      getFilesWithFallback: vi.fn(),
      searchFiles: vi.fn(),
    },
  },
}))

const {
  clampAdMaxDurationSec,
  clampAdMaxSizeMB,
  detectAdVideos,
  isAdLibraryEntry,
  isAdVideo,
  JUNK_EXTENSION_GROUPS,
  normalizeAdMatchMode,
  scanDriveJunkFiles,
} = await import('../junkScanner')

function makeVideo(overrides: Partial<IndexedVideo> = {}): IndexedVideo {
  return {
    fid: 'f1',
    cid: 'c1',
    pickCode: 'pc1',
    name: 'video.mp4',
    avNumber: null,
    size: 10 * 1024 * 1024,
    duration: 30,
    mtime: 1_700_000_000,
    ...overrides,
  }
}

describe('junkScanner', () => {
  it('exposes expected JUNK_EXTENSION_GROUPS', () => {
    expect(JUNK_EXTENSION_GROUPS.web).toEqual(['html', 'htm', 'mht', 'mhtml', 'url', 'lnk'])
    expect(JUNK_EXTENSION_GROUPS.textMagnet).toEqual(['txt', 'magnet', 'torrent', 'chm'])
    expect(JUNK_EXTENSION_GROUPS.executable).toEqual(['apk', 'exe', 'bat', 'cmd'])
  })

  describe('detectAdVideos', () => {
    it('detects short small videos and ad keyword videos while excluding starred by default', () => {
      const videos = [
        makeVideo({ fid: 'ad1', name: 'intro.mp4', duration: 25, size: 12 * 1024 * 1024 }),
        makeVideo({ fid: 'ad2', name: '澳门葡京最新地址.mp4', duration: 90, size: 20 * 1024 * 1024 }),
        makeVideo({ fid: 'starred', name: 'short.mp4', duration: 20, size: 5 * 1024 * 1024, starred: true }),
        makeVideo({ fid: 'normal', name: 'feature.mp4', duration: 3600, size: 2 * 1024 ** 3 }),
      ]

      const detected = detectAdVideos(videos)

      expect(detected.map(item => item.fid)).toEqual(['ad1', 'ad2'])
      expect(detected.every(item => item.category === 'adVideo' && item.isVideo)).toBe(true)

      const includingStarred = detectAdVideos(videos, { excludeStarred: false })
      expect(includingStarred.map(item => item.fid)).toEqual(['ad1', 'ad2', 'starred'])
    })

    it('supports single-video and library-entry ad predicates with mixed-file safety', () => {
      const adFile = makeVideo({ fid: 'ad', name: 'trailer.mp4', duration: 75, size: 15 * 1024 * 1024 })
      const realFile = makeVideo({ fid: 'real', name: 'SSIS-001.mp4', duration: 7200, size: 4 * 1024 ** 3 })
      const starredAd = makeVideo({ fid: 'star', name: 'promo.mp4', duration: 20, size: 5 * 1024 * 1024, starred: true })

      expect(isAdVideo(adFile, { maxDurationSec: 60, maxSizeMB: 50 })).toBe(false)
      expect(isAdVideo(adFile, { maxDurationSec: 90, maxSizeMB: 50 })).toBe(true)
      expect(isAdVideo(starredAd, { maxDurationSec: 90, maxSizeMB: 50, excludeStarred: true })).toBe(false)

      expect(isAdLibraryEntry({ files: [adFile] }, { maxDurationSec: 90, maxSizeMB: 50 })).toBe(true)
      expect(isAdLibraryEntry({ files: [adFile, realFile] }, { maxDurationSec: 90, maxSizeMB: 50 })).toBe(false)
      expect(isAdLibraryEntry({ files: [adFile, starredAd] }, { maxDurationSec: 90, maxSizeMB: 50 })).toBe(false)
      expect(isAdLibraryEntry({ files: [] }, { maxDurationSec: 90, maxSizeMB: 50 })).toBe(false)
    })

    it('supports AND vs OR matchMode and normalizes invalid matchMode values', () => {
      expect(normalizeAdMatchMode('or')).toBe('or')
      expect(normalizeAdMatchMode('and')).toBe('and')
      expect(normalizeAdMatchMode('invalid')).toBe('and')
      expect(normalizeAdMatchMode(undefined, 'or')).toBe('or')

      const shortButLarge = makeVideo({ fid: 'sbl', duration: 40, size: 120 * 1024 * 1024 })
      const longButSmall = makeVideo({ fid: 'lbs', duration: 600, size: 10 * 1024 * 1024 })
      const unknownDurationSmall = makeVideo({ fid: 'uds', duration: 0, size: 10 * 1024 * 1024 })

      expect(isAdVideo(shortButLarge, { maxDurationSec: 90, maxSizeMB: 50, matchMode: 'and' })).toBe(false)
      expect(isAdVideo(longButSmall, { maxDurationSec: 90, maxSizeMB: 50, matchMode: 'and' })).toBe(false)
      expect(isAdVideo(unknownDurationSmall, { maxDurationSec: 90, maxSizeMB: 50, matchMode: 'and' })).toBe(false)

      expect(isAdVideo(shortButLarge, { maxDurationSec: 90, maxSizeMB: 50, matchMode: 'or' })).toBe(true)
      expect(isAdVideo(longButSmall, { maxDurationSec: 90, maxSizeMB: 50, matchMode: 'or' })).toBe(true)
      expect(isAdVideo(unknownDurationSmall, { maxDurationSec: 90, maxSizeMB: 50, matchMode: 'or' })).toBe(true)
    })

    it('clamps ad duration and size thresholds while rejecting invalid inputs', () => {
      expect(clampAdMaxDurationSec(undefined)).toBe(90)
      expect(clampAdMaxDurationSec('')).toBe(90)
      expect(clampAdMaxDurationSec('   ')).toBe(90)
      expect(clampAdMaxDurationSec(Number.NaN)).toBe(90)
      expect(clampAdMaxDurationSec(3)).toBe(10)
      expect(clampAdMaxDurationSec(9999)).toBe(600)
      expect(clampAdMaxDurationSec(45.6)).toBe(46)

      expect(clampAdMaxSizeMB(null)).toBe(50)
      expect(clampAdMaxSizeMB('')).toBe(50)
      expect(clampAdMaxSizeMB(Number.POSITIVE_INFINITY)).toBe(50)
      expect(clampAdMaxSizeMB(0)).toBe(1)
      expect(clampAdMaxSizeMB(800)).toBe(500)
      expect(clampAdMaxSizeMB(120.4)).toBe(120)
    })
  })

  describe('scanDriveJunkFiles', () => {
    it('scans suffixes and optional magnet search, deduplicates by fid, and reports progress', async () => {
      const getFilesWithFallback = vi.fn().mockResolvedValue({ state: true, data: [] })

      const searchFiles = vi.fn().mockImplementation(async (params: { suffix?: string, search_value?: string }) => {
        if (params.search_value === 'magnet') {
          return {
            state: true,
            data: [
              { fc: 1, fid: 'j1', pid: 'c1', pc: 'pc1', n: 'promo.html', s: 1024, t: 100, tu: 200, ico: 'html', iv: 0, play_long: 0 },
              { fc: 1, fid: 'j3', pid: 'c3', pc: 'pc3', n: 'magnet_links.txt', s: 512, t: 100, tu: 400, ico: 'txt', iv: 0, play_long: 0 },
            ],
          }
        }
        if (params.suffix === 'html') {
          return {
            state: true,
            data: [
              { fc: '1', fid: 'j1', pid: 'c1', pc: 'pc1', n: 'promo.html', s: 1024, t: 100, tu: 200, ico: 'html', iv: 0, play_long: 0 },
              { fid: 'noise1', pid: 'c1', pc: 'pcn', n: 'html_guide.mp4', s: 1024, t: 100, tu: 200, ico: 'mp4', iv: 1, play_long: 60 },
              { fc: 0, cid: 'dir1', n: 'folder', pid: 'c1', s: 0, t: 100, tu: 100, ico: '', iv: 0, play_long: 0 },
            ],
          }
        }
        return {
          state: true,
          data: [
            { fc: 1, fid: 'j2', pid: 'c2', pc: 'pc2', n: 'setup.exe', s: 2048, t: 100, tu: 300, ico: 'exe', iv: 0, play_long: 0 },
          ],
        }
      })

      const driveApi = { getFilesWithFallback, searchFiles } as unknown as JunkScannerDriveApi
      const progressCalls: Array<{ scannedSuffixes: number, totalSuffixes: number, currentLabel: string, found: number }> = []

      const results = await scanDriveJunkFiles({
        rootCid: '0',
        suffixes: ['.html', 'exe'],
        includeMagnetSearch: true,
        pageDelayMs: 0,
        onProgress: p => progressCalls.push(p),
        driveApi,
      })

      expect(results.map(r => r.fid)).toEqual(['j1', 'j2', 'j3'])
      expect(searchFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          suffix: 'html',
          search_value: '.html',
          fc: 2,
        }),
        undefined,
      )
      expect(results[0].category).toBe('web')
      expect(results[1].category).toBe('executable')
      expect(results[2].category).toBe('textMagnet')
      expect(progressCalls).toHaveLength(3)
      expect(progressCalls[2]).toEqual({
        scannedSuffixes: 3,
        totalSuffixes: 3,
        currentLabel: 'magnet 搜索',
        found: 3,
      })
    })

    it('falls back to getFilesWithFallback when searchFiles throws or returns empty and skips isolated suffix failures', async () => {
      const searchFiles = vi.fn().mockImplementation(async (params: { suffix?: string }) => {
        if (params.suffix === 'html')
          throw new Error('Unexpected token \'<\', "<!doctypeh"... is not valid JSON')
        throw new Error('search failed for exe')
      })

      const getFilesWithFallback = vi.fn().mockImplementation(async (params: { suffix?: string }) => {
        if (params.suffix === 'html') {
          return {
            state: true,
            data: [
              { fc: 1, fid: 'fallback1', pid: 'c1', pc: 'pc1', n: 'fallback.html', s: 512, t: 100, tu: 200, ico: 'html', iv: 0, play_long: 0 },
            ],
          }
        }
        throw new Error('temporary network error')
      })

      const driveApi = { getFilesWithFallback, searchFiles } as unknown as JunkScannerDriveApi
      const results = await scanDriveJunkFiles({
        rootCid: '0',
        suffixes: ['html', 'exe'],
        includeMagnetSearch: false,
        pageDelayMs: 0,
        driveApi,
      })

      expect(results.map(r => r.fid)).toEqual(['fallback1'])
      expect(getFilesWithFallback).toHaveBeenCalledWith(
        expect.objectContaining({
          suffix: 'html',
          o: 'user_ptime',
          asc: 0,
          custom_order: 1,
        }),
        undefined,
      )
    })

    it('aborts immediately when signal is already aborted', async () => {
      const controller = new AbortController()
      controller.abort(new DOMException('cancelled', 'AbortError'))

      const driveApi = {
        getFilesWithFallback: vi.fn(),
        searchFiles: vi.fn(),
      } as unknown as JunkScannerDriveApi

      await expect(scanDriveJunkFiles({
        suffixes: ['html'],
        signal: controller.signal,
        pageDelayMs: 0,
        driveApi,
      })).rejects.toThrow('cancelled')
    })
  })
})
