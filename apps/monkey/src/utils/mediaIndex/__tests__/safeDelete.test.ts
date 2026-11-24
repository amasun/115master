import type { SafeDeleteDriveApi } from '../safeDelete'
import type { IndexedVideo } from '../types'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/drive115Instance', () => ({
  drive115: {
    file: {
      getFilesWithFallback: vi.fn(),
      deleteFiles: vi.fn(),
    },
  },
}))

const {
  evaluateParentFolderSafety,
  safeDeleteFiles,
} = await import('../safeDelete')

function makeVideo(overrides: Partial<IndexedVideo> = {}): IndexedVideo {
  return {
    fid: 'f1',
    cid: 'c100',
    pickCode: 'pc1',
    name: 'video.mp4',
    avNumber: null,
    size: 1000,
    duration: 100,
    mtime: 100,
    ...overrides,
  }
}

describe('safeDelete', () => {
  describe('evaluateParentFolderSafety', () => {
    it('rejects root cid and protected folder names', () => {
      expect(evaluateParentFolderSafety({ cid: '0', remainingItems: [] }).safe).toBe(false)
      expect(evaluateParentFolderSafety({ cid: '123', folderName: '云下载', remainingItems: [] }).safe).toBe(false)
      expect(evaluateParentFolderSafety({ cid: '123', folderName: 'Movies', remainingItems: [] }).safe).toBe(false)
    })

    it('rejects folders containing subfolders, other videos, indexed videos, or unknown files', () => {
      expect(evaluateParentFolderSafety({
        cid: '123',
        folderName: 'SSIS-001',
        remainingItems: [{ name: 'sub', isFolder: true }],
      }).safe).toBe(false)

      expect(evaluateParentFolderSafety({
        cid: '123',
        folderName: 'SSIS-001',
        remainingItems: [{ name: 'other.mkv', isFolder: false }],
      }).safe).toBe(false)

      expect(evaluateParentFolderSafety({
        cid: '123',
        folderName: 'SSIS-001',
        remainingItems: [{ name: 'archive.zip', isFolder: false }],
      }).safe).toBe(false)

      expect(evaluateParentFolderSafety({
        cid: '123',
        folderName: 'SSIS-001',
        remainingItems: [],
        remainingIndexedVideosCount: 1,
      }).safe).toBe(false)
    })

    it('approves empty folder or folder with only companion/junk files', () => {
      expect(evaluateParentFolderSafety({
        cid: '123',
        folderName: 'SSIS-001',
        remainingItems: [],
      }).safe).toBe(true)

      expect(evaluateParentFolderSafety({
        cid: '123',
        folderName: 'SSIS-001',
        remainingItems: [
          { name: 'poster.jpg', isFolder: false },
          { name: 'movie.nfo', isFolder: false },
          { name: 'sub.srt', isFolder: false },
        ],
      }).safe).toBe(true)
    })
  })

  describe('safeDeleteFiles', () => {
    it('deletes files and cleans up safe empty parent folder', async () => {
      const deleteFiles = vi.fn().mockResolvedValue({ state: true, errno: '' })
      const getFilesWithFallback = vi.fn().mockResolvedValue({
        state: true,
        data: [
          { fc: 1, fid: 'nfo1', n: 'movie.nfo', pid: 'c100' },
        ],
        path: [
          { cid: '0', name: '根目录', aid: '1', pid: '0' },
          { cid: 'c10', name: 'JAV', aid: '1', pid: '0' },
          { cid: 'c100', name: 'SSIS-001', aid: '1', pid: 'c10' },
        ],
      })

      const driveApi = { deleteFiles, getFilesWithFallback } as unknown as SafeDeleteDriveApi

      const result = await safeDeleteFiles(
        [{ fid: 'f1', cid: 'c100', name: 'SSIS-001.mp4' }],
        {
          deleteEmptyParent: true,
          allIndexedVideos: [makeVideo({ fid: 'f1', cid: 'c100' })],
          driveApi,
        },
      )

      expect(result.deletedFileIds).toEqual(['f1'])
      expect(result.failedFileIds).toEqual([])
      expect(result.deletedFolders).toEqual([
        { cid: 'c100', name: 'SSIS-001', deleted: true, reason: '仅剩附属或垃圾文件' },
      ])
      expect(deleteFiles).toHaveBeenNthCalledWith(1, { 'pid': 'c100', 'fid[0]': 'f1', 'ignore_warn': 1 })
      expect(deleteFiles).toHaveBeenNthCalledWith(2, { 'pid': 'c10', 'fid[0]': 'c100', 'ignore_warn': 1 })
    })

    it('skips parent folder deletion when protected or another video remains', async () => {
      const deleteFiles = vi.fn().mockResolvedValue({ state: true, errno: '' })
      const getFilesWithFallback = vi.fn().mockResolvedValue({
        state: true,
        data: [],
        path: [
          { cid: '0', name: '根目录', aid: '1', pid: '0' },
          { cid: 'c100', name: '云下载', aid: '1', pid: '0' },
        ],
      })

      const driveApi = { deleteFiles, getFilesWithFallback } as unknown as SafeDeleteDriveApi

      const result = await safeDeleteFiles(
        [{ fid: 'f1', cid: 'c100' }],
        {
          deleteEmptyParent: true,
          allIndexedVideos: [makeVideo({ fid: 'f1', cid: 'c100' })],
          driveApi,
        },
      )

      expect(result.deletedFileIds).toEqual(['f1'])
      expect(result.deletedFolders).toEqual([])
      expect(result.skippedFolders).toHaveLength(1)
      expect(result.skippedFolders[0].deleted).toBe(false)
      expect(deleteFiles).toHaveBeenCalledTimes(1)
    })

    it('records failedFileIds when file deletion fails', async () => {
      const deleteFiles = vi.fn().mockResolvedValue({ state: false, errno: '1' })
      const getFilesWithFallback = vi.fn()
      const driveApi = { deleteFiles, getFilesWithFallback } as unknown as SafeDeleteDriveApi

      const result = await safeDeleteFiles(
        [{ fid: 'f1', cid: 'c100' }],
        {
          deleteEmptyParent: true,
          allIndexedVideos: [],
          driveApi,
        },
      )

      expect(result.deletedFileIds).toEqual([])
      expect(result.failedFileIds).toEqual(['f1'])
      expect(getFilesWithFallback).not.toHaveBeenCalled()
    })

    it('batches cross-directory files with pid "0" in a single request and tracks directory progress', async () => {
      const deleteFiles = vi.fn().mockResolvedValue({ state: true, errno: '' })
      const driveApi = { deleteFiles, getFilesWithFallback: vi.fn() } as unknown as SafeDeleteDriveApi
      const batches: string[][] = []
      const progressEvents: Array<{ completedFiles: number, completedDirs: number, totalDirs: number }> = []

      const result = await safeDeleteFiles(
        [
          { fid: 'f1', cid: 'c1' },
          { fid: 'f2', cid: 'c2' },
          { fid: 'f3', cid: 'c3' },
        ],
        {
          deleteEmptyParent: false,
          allIndexedVideos: [],
          driveApi,
          onBatchDeleted: (fids) => {
            batches.push(fids)
          },
          onProgress: (p) => {
            progressEvents.push({
              completedFiles: p.completedFiles,
              completedDirs: p.completedDirs,
              totalDirs: p.totalDirs,
            })
          },
        },
      )

      expect(deleteFiles).toHaveBeenCalledTimes(1)
      expect(deleteFiles).toHaveBeenCalledWith({
        'pid': '0',
        'fid[0]': 'f1',
        'fid[1]': 'f2',
        'fid[2]': 'f3',
        'ignore_warn': 1,
      })
      expect(batches).toEqual([['f1', 'f2', 'f3']])
      expect(result.deletedFileIds).toEqual(['f1', 'f2', 'f3'])
      expect(result.failedFileIds).toEqual([])
      expect(progressEvents).toEqual([
        { completedFiles: 0, completedDirs: 0, totalDirs: 3 },
        { completedFiles: 3, completedDirs: 3, totalDirs: 3 },
      ])
    })

    it('falls back to per-directory deletion when cross-directory batch is rejected and supports AbortSignal', async () => {
      const controller = new AbortController()
      const deleteFiles = vi.fn()
        // 跨目录合批被拒绝，降级按目录重试
        .mockResolvedValueOnce({ state: false, error: '跨目录不支持' })
        .mockResolvedValueOnce({ state: true, errno: '' })
        .mockImplementationOnce(async () => {
          controller.abort()
          return { state: false, error: '请求过于频繁' }
        })
        .mockResolvedValueOnce({ state: true, errno: '' })

      const driveApi = { deleteFiles, getFilesWithFallback: vi.fn() } as unknown as SafeDeleteDriveApi
      const batches: string[][] = []
      const progressEvents: number[] = []

      const result = await safeDeleteFiles(
        [
          { fid: 'f1', cid: 'c1' },
          { fid: 'f2', cid: 'c2' },
          { fid: 'f3', cid: 'c3' },
        ],
        {
          deleteEmptyParent: false,
          allIndexedVideos: [],
          driveApi,
          signal: controller.signal,
          onBatchDeleted: (fids) => {
            batches.push(fids)
          },
          onProgress: (p) => {
            progressEvents.push(p.completedFiles)
          },
        },
      )

      expect(batches).toEqual([['f1']])
      expect(result.deletedFileIds).toEqual(['f1'])
      expect(result.failedFileIds).toEqual(['f2'])
      expect(result.aborted).toBe(true)
      expect(result.lastError).toBe('请求过于频繁')
      expect(progressEvents).toEqual([0, 1, 2])
      expect(deleteFiles).toHaveBeenCalledTimes(3)
      expect(deleteFiles).toHaveBeenNthCalledWith(1, {
        'pid': '0',
        'fid[0]': 'f1',
        'fid[1]': 'f2',
        'fid[2]': 'f3',
        'ignore_warn': 1,
      })
      expect(deleteFiles).toHaveBeenNthCalledWith(2, {
        'pid': 'c1',
        'fid[0]': 'f1',
        'ignore_warn': 1,
      })
      expect(deleteFiles).toHaveBeenNthCalledWith(3, {
        'pid': 'c2',
        'fid[0]': 'f2',
        'ignore_warn': 1,
      })
    })

    it('supports batchSize chunking and stops before next chunk on AbortSignal', async () => {
      const controller = new AbortController()
      const deleteFiles = vi.fn().mockImplementation(async () => {
        controller.abort()
        return { state: true, errno: '' }
      })
      const driveApi = { deleteFiles, getFilesWithFallback: vi.fn() } as unknown as SafeDeleteDriveApi

      const result = await safeDeleteFiles(
        [
          { fid: 'f1', cid: 'c1' },
          { fid: 'f2', cid: 'c2' },
          { fid: 'f3', cid: 'c3' },
          { fid: 'f4', cid: 'c4' },
        ],
        {
          deleteEmptyParent: false,
          allIndexedVideos: [],
          batchSize: 2,
          driveApi,
          signal: controller.signal,
        },
      )

      expect(deleteFiles).toHaveBeenCalledTimes(1)
      expect(result.deletedFileIds).toEqual(['f1', 'f2'])
      expect(result.aborted).toBe(true)
    })
  })
})
