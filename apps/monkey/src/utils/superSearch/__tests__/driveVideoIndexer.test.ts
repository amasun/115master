// @vitest-environment jsdom
import type { VideoIndexSnapshot } from '../types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const storedSnapshot = vi.hoisted(() => ({ current: null as VideoIndexSnapshot | null }))
const getFilesWithFallbackMock = vi.hoisted(() => vi.fn())

vi.mock('@/utils/drive115Instance', () => ({
  drive115: {
    file: {
      getFilesWithFallback: getFilesWithFallbackMock,
    },
  },
}))

vi.mock('../videoIndexStore', () => ({
  loadVideoIndexSnapshot: vi.fn(async () => storedSnapshot.current),
  saveVideoIndexSnapshot: vi.fn(async (snap: VideoIndexSnapshot) => {
    storedSnapshot.current = snap
  }),
}))

const { syncDriveVideoIndex } = await import('../driveVideoIndexer')

function makeFile(fid: string, name: string, tu: number, pid = '10') {
  return {
    fc: 1 as const,
    fid,
    pc: `pc_${fid}`,
    n: name,
    s: 1024,
    t: tu,
    tu,
    play_long: 3600,
    pid,
  }
}

describe('syncDriveVideoIndex', () => {
  beforeEach(() => {
    storedSnapshot.current = null
    getFilesWithFallbackMock.mockReset()
  })

  it('全量同步使用 show_dir=0 & type=4 扁平拉取并自动提取番号', async () => {
    getFilesWithFallbackMock.mockResolvedValueOnce({
      state: true,
      count: 2,
      data: [
        makeFile('1', 'www.98T.la@SSIS-001.mp4', 2000, 'dirA'),
        makeFile('2', '普通视频.mp4', 1500, 'dirB'),
      ],
    })

    const progressList: number[] = []
    const snap = await syncDriveVideoIndex({
      mode: 'full',
      pageDelayMs: 0,
      onProgress: p => progressList.push(p.fetched),
    })

    expect(getFilesWithFallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cid: '0',
        show_dir: 0,
        type: 4,
        limit: 1150,
        offset: 0,
      }),
      undefined,
    )
    expect(snap.items).toHaveLength(2)
    expect(snap.items[0]!.avNumber).toBe('SSIS-001')
    expect(snap.items[0]!.cid).toBe('dirA')
    expect(snap.items[1]!.avNumber).toBeNull()
    expect(progressList).toEqual([2])
  })

  it('增量同步遇到早于上次同步时间的视频时提前停止并合并旧记录', async () => {
    storedSnapshot.current = {
      schemaVersion: 1,
      rootCids: ['0'],
      lastFullSyncAt: 1_000_000,
      lastSyncAt: 2_000_000,
      items: [
        {
          fid: 'old-1',
          cid: '10',
          pickCode: 'pc_old-1',
          name: 'OLD-001.mp4',
          avNumber: 'OLD-001',
          size: 1024,
          duration: 3600,
          mtime: 1500,
        },
      ],
    }

    getFilesWithFallbackMock.mockResolvedValueOnce({
      state: true,
      count: 2000,
      data: [
        makeFile('new-1', 'NEW-100.mp4', 2500, '20'),
        makeFile('old-1', 'OLD-001.mp4', 1500, '10'),
      ],
    })

    const snap = await syncDriveVideoIndex({
      mode: 'incremental',
      pageDelayMs: 0,
    })

    // 遇到 mtime=1500 < lastSyncSec=2000 提前结束，仅发起 1 次请求
    expect(getFilesWithFallbackMock).toHaveBeenCalledTimes(1)
    expect(snap.items.map(i => i.fid)).toEqual(['new-1', 'old-1'])
  })
})
