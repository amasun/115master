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
  detectAdVideos,
  JUNK_EXTENSION_GROUPS,
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
  })

  describe('scanDriveJunkFiles', () => {
    it('scans suffixes and optional magnet search, deduplicates by fid, and reports progress', async () => {
      const getFilesWithFallback = vi.fn().mockImplementation(async (params: { suffix?: string }) => {
        if (params.suffix === 'html') {
          return {
            state: true,
            data: [
              { fc: 1, fid: 'j1', pid: 'c1', pc: 'pc1', n: 'promo.html', s: 1024, t: 100, tu: 200, ico: 'html', iv: 0, play_long: 0 },
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

      const searchFiles = vi.fn().mockResolvedValue({
        state: true,
        data: [
          { fc: 1, fid: 'j1', pid: 'c1', pc: 'pc1', n: 'promo.html', s: 1024, t: 100, tu: 200, ico: 'html', iv: 0, play_long: 0 },
          { fc: 1, fid: 'j3', pid: 'c3', pc: 'pc3', n: 'magnet_links.txt', s: 512, t: 100, tu: 400, ico: 'txt', iv: 0, play_long: 0 },
        ],
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
