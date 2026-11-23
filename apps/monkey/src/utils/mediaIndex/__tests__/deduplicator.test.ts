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
  isSuspectedMultiPartGroup,
  scoreEntryFilesForDedupe,
  scoreFileForKeep,
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
})
