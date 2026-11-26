import type { IndexedVideo, LibraryEntry, LibraryFileItem } from '../types'
import type { MarkerDoc } from '@/utils/markers/types'
import { describe, expect, it, vi } from 'vitest'

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
  GMRequest: class {},
}))
vi.mock('@/utils/cache/javCache', () => ({
  javCache: { get: vi.fn(), set: vi.fn() },
}))

const {
  analyzeDuplicateGroups,
  analyzeDuplicateGroupsAsync,
  hasUniformSha1,
  isSuspectedMultiPartGroup,
  scoreEntryFilesForDedupe,
  scoreFileForKeep,
  selectSmartRedundantFids,
} = await import('../deduplicator')

function makeVideo(overrides: Partial<IndexedVideo> = {}): IndexedVideo {
  return {
    fid: 'f1',
    cid: 'c1',
    pickCode: 'pc1',
    name: 'video.mp4',
    avNumber: null,
    size: 1024 * 1024 * 1024,
    duration: 3600,
    mtime: 1_700_000_000,
    ...overrides,
  }
}

function makeEntry(mediaKey: string, videos: IndexedVideo[], title?: string): LibraryEntry {
  return {
    mediaKey,
    kind: 'jav',
    externalId: mediaKey.replace(/^jav:/, ''),
    meta: title
      ? {
          mediaKey,
          kind: 'jav',
          externalId: mediaKey.replace(/^jav:/, ''),
          title,
          directors: [],
          actors: [],
          genres: [],
          source: 'test',
          updatedAt: 0,
        }
      : null,
    files: videos.map(v => ({
      fid: v.fid,
      cid: v.cid,
      pickCode: v.pickCode,
      sha1: v.sha1,
      name: v.name,
      size: v.size,
      duration: v.duration,
      mtime: v.mtime,
      starred: v.starred,
      labels: v.labels,
    })),
    latestMtime: 0,
    markerCount: 0,
    totalSize: 0,
    maxDuration: 0,
    starred: false,
    driveLabels: [],
  }
}

describe('deduplicator', () => {
  describe('isSuspectedMultiPartGroup', () => {
    it('detects cd1/cd2, part1/part2, disc1/disc2', () => {
      expect(isSuspectedMultiPartGroup(['SSIS-001-cd1.mp4', 'SSIS-001-cd2.mp4'])).toBe(true)
      expect(isSuspectedMultiPartGroup(['movie.part1.mkv', 'movie.part2.mkv'])).toBe(true)
      expect(isSuspectedMultiPartGroup(['film_disc1.mp4', 'film_disc2.mp4'])).toBe(true)
    })

    it('detects -A/-B, 上集/下集, and (1)/(2) at stem end', () => {
      expect(isSuspectedMultiPartGroup(['ABP-123-A.mp4', 'ABP-123-B.mp4'])).toBe(true)
      expect(isSuspectedMultiPartGroup(['电影上集.mp4', '电影下集.mp4'])).toBe(true)
      expect(isSuspectedMultiPartGroup(['sample (1).mp4', 'sample (2).mp4'])).toBe(true)
    })

    it('returns false for single marker or non-multipart variants like -C subtitle', () => {
      expect(isSuspectedMultiPartGroup(['SSIS-001.mp4', 'SSIS-001-C.mp4'])).toBe(false)
      expect(isSuspectedMultiPartGroup(['SSIS-001-cd1.mp4', 'SSIS-001-cd1-copy.mp4'])).toBe(false)
      expect(isSuspectedMultiPartGroup(['SSIS-001-1080p.mp4', 'SSIS-001-720p.mp4'])).toBe(false)
    })
  })

  describe('scoreFileForKeep', () => {
    it('prioritizes starred, markers, labels, subtitle, and larger size', () => {
      const starred = scoreFileForKeep(makeVideo({ starred: true, size: 500_000_000 }))
      const marked = scoreFileForKeep(makeVideo({ starred: false, size: 500_000_000 }), 3)
      const subbed = scoreFileForKeep(makeVideo({ name: 'SSIS-001-C.mp4', size: 2 * 1024 ** 3 }))
      const plain = scoreFileForKeep(makeVideo({ name: 'SSIS-001.mp4', size: 1024 ** 3 }))

      expect(starred.score).toBeGreaterThan(marked.score)
      expect(marked.score).toBeGreaterThan(subbed.score)
      expect(subbed.score).toBeGreaterThan(plain.score)
      expect(starred.reasons).toContain('已星标')
      expect(marked.reasons).toContain('有 3 个打点')
      expect(subbed.reasons).toContain('含中文字幕标记')
    })
  })

  describe('analyzeDuplicateGroups', () => {
    it('groups sha1 exact duplicates and skips identical avNumber group', () => {
      const v1 = makeVideo({ fid: 'f1', pickCode: 'pc1', sha1: 'ABC123', avNumber: 'SSIS-001', name: 'SSIS-001.mp4', size: 2 * 1024 ** 3 })
      const v2 = makeVideo({ fid: 'f2', pickCode: 'pc2', sha1: 'abc123', avNumber: 'SSIS-001', name: 'SSIS-001-copy.mp4', size: 2 * 1024 ** 3, starred: true })

      const groups = analyzeDuplicateGroups([v1, v2], [makeEntry('jav:SSIS001', [v1, v2], '作品1')])

      expect(groups).toHaveLength(1)
      expect(groups[0].kind).toBe('sha1')
      expect(groups[0].reclaimableSize).toBe(2 * 1024 ** 3)
      expect(groups[0].files[0].fid).toBe('f2')
      expect(groups[0].files[0].recommendedKeep).toBe(true)
      expect(groups[0].files[1].recommendedKeep).toBe(false)
    })

    it('emits avNumber group when it differs from sha1 group and flags suspectedMultiPart', () => {
      const v1 = makeVideo({ fid: 'f1', pickCode: 'pc1', sha1: 's1', avNumber: 'ABP-100', name: 'ABP-100-cd1.mp4', size: 1024 ** 3 })
      const v2 = makeVideo({ fid: 'f2', pickCode: 'pc2', sha1: 's2', avNumber: 'ABP-100', name: 'ABP-100-cd2.mp4', size: 1.5 * 1024 ** 3 })

      const markerDocs: Record<string, MarkerDoc> = {
        pc1: {
          v: 1,
          pickCode: 'pc1',
          markers: [{ id: 'm1', time: 10, label: 'mark', createdAt: 1, updatedAt: 1 }],
          updatedAt: 1,
        },
      }

      const groups = analyzeDuplicateGroups([v1, v2], [makeEntry('jav:ABP100', [v1, v2])], markerDocs)

      expect(groups).toHaveLength(1)
      expect(groups[0].kind).toBe('avNumber')
      expect(groups[0].suspectedMultiPart).toBe(true)
      expect(groups[0].files[0].fid).toBe('f1')
      expect(groups[0].files[0].markerCount).toBe(1)
    })

    it('groups unnumbered videos by normalized stem or same (size >= 50MB && duration >= 60s) and sorts by reclaimableSize desc', () => {
      const a1 = makeVideo({ fid: 'a1', name: 'My Holiday (1080p).mp4', size: 600 * 1024 * 1024, duration: 300 })
      const a2 = makeVideo({ fid: 'a2', name: 'my_holiday.mkv', size: 400 * 1024 * 1024, duration: 300 })
      const b1 = makeVideo({ fid: 'b1', name: 'random_cam_01.mp4', size: 100 * 1024 * 1024, duration: 120 })
      const b2 = makeVideo({ fid: 'b2', name: 'renamed_clip.mp4', size: 100 * 1024 * 1024, duration: 120 })

      const groups = analyzeDuplicateGroups([a1, a2, b1, b2], [])

      expect(groups).toHaveLength(2)
      expect(groups[0].kind).toBe('similar')
      expect(groups[0].files.map(f => f.fid).sort()).toEqual(['a1', 'a2'])
      expect(groups[1].files.map(f => f.fid).sort()).toEqual(['b1', 'b2'])
      expect(groups[0].reclaimableSize).toBeGreaterThan(groups[1].reclaimableSize)
    })

    it('does not group similarly named videos across different parent folders with different sizes or generic numbered names', () => {
      const generic1 = makeVideo({ fid: 'g1', cid: 'dir1', name: 'Video 6.wmv', size: 432 * 1024 * 1024, duration: 313 })
      const generic2 = makeVideo({ fid: 'g2', cid: 'dir2', name: 'Video 6.wmv', size: 294 * 1024 * 1024, duration: 630 })
      const generic3 = makeVideo({ fid: 'g3', cid: 'dir3', name: 'video_ (6).mp4', size: 7 * 1024 * 1024, duration: 22 })
      const namedDiffDir1 = makeVideo({ fid: 'nd1', cid: 'dirA', name: 'My Holiday.mp4', size: 600 * 1024 * 1024, duration: 300 })
      const namedDiffDir2 = makeVideo({ fid: 'nd2', cid: 'dirB', name: 'My Holiday.mkv', size: 400 * 1024 * 1024, duration: 300 })
      const sameSizeDiffDir1 = makeVideo({ fid: 'sd1', cid: 'dirC', name: 'Concert Cut.mp4', size: 500 * 1024 * 1024, duration: 1200 })
      const sameSizeDiffDir2 = makeVideo({ fid: 'sd2', cid: 'dirD', name: 'Concert Cut.mp4', size: 500 * 1024 * 1024, duration: 1200 })

      const groups = analyzeDuplicateGroups(
        [generic1, generic2, generic3, namedDiffDir1, namedDiffDir2, sameSizeDiffDir1, sameSizeDiffDir2],
        [],
      )

      expect(groups).toHaveLength(1)
      expect(groups[0].files.map(f => f.fid).sort()).toEqual(['sd1', 'sd2'])
    })
  })

  describe('scoreEntryFilesForDedupe', () => {
    it('scores LibraryFileItem list and marks only top item recommendedKeep', () => {
      const files: LibraryFileItem[] = [
        { fid: '1', cid: 'c1', pickCode: 'pc1', name: 'a.mp4', size: 1024 ** 3, duration: 100, mtime: 100 },
        { fid: '2', cid: 'c1', pickCode: 'pc2', name: 'a-C.mp4', size: 2 * 1024 ** 3, duration: 100, mtime: 200 },
      ]
      const result = scoreEntryFilesForDedupe(files, new Map([['pc1', 2]]))

      expect(result[0].file.fid).toBe('1')
      expect(result[0].recommendedKeep).toBe(true)
      expect(result[1].recommendedKeep).toBe(false)
    })
  })

  describe('analyzeDuplicateGroupsAsync', () => {
    it('matches synchronous results across chunked slices and respects AbortSignal', async () => {
      const videos = [
        makeVideo({ fid: 'f1', pickCode: 'pc1', sha1: 'DUP1', avNumber: 'SSIS-001', name: 'SSIS-001.mp4', size: 2 * 1024 ** 3 }),
        makeVideo({ fid: 'f2', pickCode: 'pc2', sha1: 'dup1', avNumber: 'SSIS-001', name: 'SSIS-001-copy.mp4', size: 2 * 1024 ** 3 }),
        makeVideo({ fid: 'f3', pickCode: 'pc3', sha1: 's3', avNumber: 'ABP-100', name: 'ABP-100.mp4', size: 1024 ** 3 }),
        makeVideo({ fid: 'f4', pickCode: 'pc4', sha1: 's4', avNumber: 'ABP-100', name: 'ABP-100-C.mp4', size: 1.2 * 1024 ** 3 }),
      ]
      const entries = [
        makeEntry('jav:SSIS001', [videos[0], videos[1]], '作品1'),
        makeEntry('jav:ABP100', [videos[2], videos[3]], '作品2'),
      ]

      const sync = analyzeDuplicateGroups(videos, entries)
      const asyncRes = await analyzeDuplicateGroupsAsync(videos, entries, undefined, { chunkSize: 1 })
      expect(asyncRes).toEqual(sync)

      const controller = new AbortController()
      controller.abort()
      await expect(analyzeDuplicateGroupsAsync(videos, entries, undefined, { signal: controller.signal })).rejects.toThrow()
    })

    it('groups Blu-ray and standard editions as kind=edition and recommends keeping Blu-ray', async () => {
      const videos = [
        makeVideo({ fid: 'bd1', pickCode: 'pc-bd', sha1: 's-bd', avNumber: 'LAFBD-41', name: 'LAFBD-41.mp4', size: 4 * 1024 ** 3 }),
        makeVideo({ fid: 'dvd1', pickCode: 'pc-dvd', sha1: 's-dvd', avNumber: 'LAF-041', name: 'LAF-041.mp4', size: 2 * 1024 ** 3 }),
        makeVideo({ fid: 'std1', pickCode: 'pc-s1', sha1: 's1', avNumber: 'ABP-041', name: 'ABP-041.mp4', size: 2 * 1024 ** 3 }),
        makeVideo({ fid: 'std2', pickCode: 'pc-s2', sha1: 's2', avNumber: 'ABP-41', name: 'ABP-41.mp4', size: 1.5 * 1024 ** 3 }),
      ]
      const entries = [
        makeEntry('jav:LAFBD041', [videos[0]], '天使と悪魔（ブルーレイ版）'),
        makeEntry('jav:LAF041', [videos[1]], '天使と悪魔'),
        makeEntry('jav:ABP041', [videos[2], videos[3]], '同番号前导零'),
      ]

      const syncGroups = analyzeDuplicateGroups(videos, entries)
      const asyncGroups = await analyzeDuplicateGroupsAsync(videos, entries, undefined, { chunkSize: 1 })
      expect(asyncGroups).toEqual(syncGroups)

      const editionGroup = syncGroups.find(g => g.kind === 'edition')
      expect(editionGroup).toBeDefined()
      expect(editionGroup?.files.map(f => f.fid)).toEqual(['bd1', 'dvd1'])
      expect(editionGroup?.files[0]?.recommendedKeep).toBe(true)
      expect(editionGroup?.files[0]?.keepReasons).toContain('蓝光版')
      expect(editionGroup?.files[1]?.recommendedKeep).toBe(false)

      const avGroup = syncGroups.find(g => g.kind === 'avNumber')
      expect(avGroup?.files.map(f => f.fid)).toEqual(['std1', 'std2'])
    })

    it('excludes false-positive AV collision groups with 4+ distinct durations and titles', async () => {
      const videos = [
        makeVideo({ fid: 'm1', pickCode: 'p1', sha1: 's1', avNumber: 'DYTT-89', name: '[电影天堂www.dytt89.com]普罗米亚BD日语中字.mp4', size: 1.26 * 1024 ** 3, duration: 4200 }),
        makeVideo({ fid: 'm2', pickCode: 'p2', sha1: 's2', avNumber: 'DYTT-89', name: '[电影天堂www.dytt89.com]中国乒乓之绝地反击-2023_4K国语中字.mp4', size: 3.97 * 1024 ** 3, duration: 8257 }),
        makeVideo({ fid: 'm3', pickCode: 'p3', sha1: 's3', avNumber: 'DYTT-89', name: '[电影天堂www.dytt89.com]狗阵-2024_HD国语中字.mp4', size: 5.76 * 1024 ** 3, duration: 6665 }),
        makeVideo({ fid: 'm4', pickCode: 'p4', sha1: 's4', avNumber: 'DYTT-89', name: '[电影天堂www.dytt89.com]毗湿奴降临-2024_BD泰卢固语中字.mp4', size: 4.16 * 1024 ** 3, duration: 10558 }),
        makeVideo({ fid: 'r1', pickCode: 'pr1', sha1: 'sr1', avNumber: 'SSIS-001', name: 'SSIS-001.mp4', size: 2 * 1024 ** 3, duration: 7200 }),
        makeVideo({ fid: 'r2', pickCode: 'pr2', sha1: 'sr2', avNumber: 'SSIS-001', name: 'SSIS-001-C.mp4', size: 3 * 1024 ** 3, duration: 7210 }),
      ]
      const entries = [
        makeEntry('jav:DYTT089', videos.slice(0, 4), 'DYTT-89'),
        makeEntry('jav:SSIS001', videos.slice(4, 6), 'SSIS-001'),
      ]

      const syncGroups = analyzeDuplicateGroups(videos, entries)
      const asyncGroups = await analyzeDuplicateGroupsAsync(videos, entries, undefined, { chunkSize: 2 })
      expect(asyncGroups).toEqual(syncGroups)

      expect(syncGroups.some(g => g.key === 'jav:DYTT089')).toBe(false)
      expect(syncGroups.map(g => g.key)).toEqual(['jav:SSIS001'])
    })

    it('marks multi-episode files (S01E01/S01E02, 第01集/第02集) as suspectedMultiPart', () => {
      expect(isSuspectedMultiPartGroup(['Show.S01E01.1080p.mp4', 'Show.S01E02.1080p.mp4'])).toBe(true)
      expect(isSuspectedMultiPartGroup(['纪录片第01集.mp4', '纪录片第02集.mp4'])).toBe(true)
    })

    it('treats identical SHA1 files as duplicates rather than suspectedMultiPart even with multi-part names', () => {
      const v1 = makeVideo({ fid: 'f1', pickCode: 'pc1', sha1: 'SAMEHASH', avNumber: 'ABP-200', name: 'ABP-200-cd1.mp4', size: 2 * 1024 ** 3, starred: true })
      const v2 = makeVideo({ fid: 'f2', pickCode: 'pc2', sha1: 'samehash', avNumber: 'ABP-200', name: 'ABP-200-cd2.mp4', size: 2 * 1024 ** 3 })

      expect(hasUniformSha1([v1, v2])).toBe(true)
      expect(hasUniformSha1([v1, makeVideo({ fid: 'f3', sha1: 'other' })])).toBe(false)
      expect(hasUniformSha1([makeVideo({ fid: 'f1', sha1: '' }), makeVideo({ fid: 'f2', sha1: '' })])).toBe(false)

      const groups = analyzeDuplicateGroups([v1, v2], [makeEntry('jav:ABP200', [v1, v2])])
      expect(groups).toHaveLength(1)
      expect(groups[0].kind).toBe('sha1')
      expect(groups[0].suspectedMultiPart).toBe(false)

      const selected = selectSmartRedundantFids(groups)
      expect(Array.from(selected.fids)).toEqual(['f2'])
      expect(selected.skippedMultiPart).toBe(0)
    })

    it('smart-selects exact SHA1 duplicates inside mixed multi-part groups while skipping distinct parts', () => {
      const cd1Keep = makeVideo({ fid: 'c1a', pickCode: 'p1a', sha1: 'AAA', avNumber: 'SSIS-300', name: 'SSIS-300-cd1.mp4', size: 2 * 1024 ** 3, starred: true })
      const cd1Dup = makeVideo({ fid: 'c1b', pickCode: 'p1b', sha1: 'aaa', avNumber: 'SSIS-300', name: 'SSIS-300-cd1 (2).mp4', size: 2 * 1024 ** 3 })
      const cd2 = makeVideo({ fid: 'c2', pickCode: 'p2', sha1: 'BBB', avNumber: 'SSIS-300', name: 'SSIS-300-cd2.mp4', size: 2 * 1024 ** 3 })
      const realPart1 = makeVideo({ fid: 'r1', pickCode: 'pr1', sha1: 'CCC', avNumber: 'SSIS-301', name: 'SSIS-301-cd1.mp4', size: 2 * 1024 ** 3 })
      const realPart2 = makeVideo({ fid: 'r2', pickCode: 'pr2', sha1: 'DDD', avNumber: 'SSIS-301', name: 'SSIS-301-cd2.mp4', size: 2 * 1024 ** 3 })

      const groups = analyzeDuplicateGroups(
        [cd1Keep, cd1Dup, cd2, realPart1, realPart2],
        [
          makeEntry('jav:SSIS300', [cd1Keep, cd1Dup, cd2]),
          makeEntry('jav:SSIS301', [realPart1, realPart2]),
        ],
      )

      const avGroups = groups.filter(g => g.kind === 'avNumber')
      const selected = selectSmartRedundantFids(avGroups)
      expect(Array.from(selected.fids)).toEqual(['c1b'])
      expect(selected.skippedMultiPart).toBe(1)
    })
  })
})
