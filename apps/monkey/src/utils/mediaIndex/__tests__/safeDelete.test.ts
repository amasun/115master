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
  })
})
