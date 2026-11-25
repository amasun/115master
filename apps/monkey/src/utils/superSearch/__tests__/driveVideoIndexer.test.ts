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

const { syncDriveVideoIndex, toIndexedVideo } = await import('../driveVideoIndexer')

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
        cur: 0,
        custom_order: 1,
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

    /** 遇到 mtime=1500 < lastSyncSec=2000 提前结束，仅发起 1 次请求 */
    expect(getFilesWithFallbackMock).toHaveBeenCalledTimes(1)
    expect(snap.items.map(i => i.fid)).toEqual(['new-1', 'old-1'])
  })

  it('增量同步不因页内乱序或 5 分钟窗口内的新文件提前中断，且非时间降序回退时继续翻页', async () => {
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
      count: 2,
      data: [
        makeFile('old-1', 'OLD-001.mp4', 1500, '10'),
        makeFile('new-skew', 'NEW-SKEW.mp4', 1800, '20'),
      ],
    })

    const snap1 = await syncDriveVideoIndex({ mode: 'incremental', pageDelayMs: 0 })
    expect(snap1.items.map(i => i.fid)).toContain('new-skew')

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

    getFilesWithFallbackMock.mockReset()
    getFilesWithFallbackMock
      .mockResolvedValueOnce({
        state: true,
        order: 'file_name',
        is_asc: 1,
        count: 2,
        data: [makeFile('old-1', 'OLD-001.mp4', 1500, '10')],
      })
      .mockResolvedValueOnce({
        state: true,
        order: 'file_name',
        is_asc: 1,
        count: 2,
        data: [makeFile('new-2', 'NEW-200.mp4', 2600, '20')],
      })

    const snap2 = await syncDriveVideoIndex({ mode: 'incremental', pageDelayMs: 0 })
    expect(getFilesWithFallbackMock).toHaveBeenCalledTimes(2)
    expect(snap2.items.map(i => i.fid)).toEqual(['new-2', 'old-1'])
  })

  it('单页条数小于 1150 但未达 count 时继续按实际长度递增 offset 翻页，并在空页时停止', async () => {
    getFilesWithFallbackMock
      .mockResolvedValueOnce({
        state: true,
        count: 5,
        data: [
          makeFile('1', 'SSIS-001.mp4', 5000, 'd1'),
          makeFile('2', 'SSIS-002.mp4', 4000, 'd1'),
          makeFile('3', 'SSIS-003.mp4', 3000, 'd1'),
        ],
      })
      .mockResolvedValueOnce({
        state: true,
        count: 5,
        data: [
          makeFile('4', 'SSIS-004.mp4', 2000, 'd2'),
          makeFile('5', 'SSIS-005.mp4', 1000, 'd2'),
        ],
      })

    const snap = await syncDriveVideoIndex({ mode: 'full', pageDelayMs: 0 })
    expect(getFilesWithFallbackMock).toHaveBeenCalledTimes(2)
    expect(getFilesWithFallbackMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ offset: 3 }),
      undefined,
    )
    expect(snap.items.map(item => item.fid)).toEqual(['1', '2', '3', '4', '5'])

    getFilesWithFallbackMock.mockReset()
    getFilesWithFallbackMock
      .mockResolvedValueOnce({
        state: true,
        count: 10,
        data: [makeFile('6', 'SSIS-006.mp4', 6000, 'd3')],
      })
      .mockResolvedValueOnce({
        state: true,
        count: 10,
        data: [],
      })

    const stoppedSnap = await syncDriveVideoIndex({ mode: 'full', pageDelayMs: 0 })
    expect(getFilesWithFallbackMock).toHaveBeenCalledTimes(2)
    expect(stoppedSnap.items.map(item => item.fid)).toEqual(['6'])
  })

  it('支持多选 rootCids 且在根目录范围变更时自动切换为全量同步', async () => {
    storedSnapshot.current = {
      schemaVersion: 1,
      rootCids: ['0'],
      lastFullSyncAt: 1_000_000,
      lastSyncAt: 2_000_000,
      items: [
        {
          fid: 'old-other',
          cid: '999',
          pickCode: 'pc_old',
          name: 'OTHER-001.mp4',
          avNumber: 'OTHER-001',
          size: 1024,
          duration: 3600,
          mtime: 1500,
        },
      ],
    }

    getFilesWithFallbackMock
      .mockResolvedValueOnce({
        state: true,
        count: 1,
        data: [makeFile('a1', 'SSIS-101.mp4', 1000, 'dirA')],
      })
      .mockResolvedValueOnce({
        state: true,
        count: 1,
        data: [makeFile('b1', 'IPX-202.mp4', 1200, 'dirB')],
      })

    const snap = await syncDriveVideoIndex({
      mode: 'incremental',
      rootCids: ['dirA', 'dirB'],
      pageDelayMs: 0,
    })

    expect(getFilesWithFallbackMock).toHaveBeenCalledTimes(2)
    expect(getFilesWithFallbackMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ cid: 'dirA' }),
      undefined,
    )
    expect(getFilesWithFallbackMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cid: 'dirB' }),
      undefined,
    )
    expect(snap.rootCids).toEqual(['dirA', 'dirB'])
    expect(snap.items.map(item => item.fid)).toEqual(['b1', 'a1'])
  })
})

describe('toIndexedVideo', () => {
  it('兼容省略 fc 或字符串 fc="1"、cid 回退及多时间戳字段，同时过滤目录项', () => {
    expect(toIndexedVideo({ fc: 0, fid: 'dir1', pc: 'p0', n: '文件夹' })).toBeNull()
    expect(toIndexedVideo({ fc: '0', fid: 'dir2', pc: 'p0', n: '字符串目录' })).toBeNull()

    const noFc = toIndexedVideo({
      fid: 'f1',
      cid: 'parent99',
      pc: 'pc1',
      n: 'ABW-123.mp4',
      s: '2048',
      tp: '1700000100',
      play_long: '3600',
    })
    expect(noFc).toEqual({
      fid: 'f1',
      cid: 'parent99',
      pickCode: 'pc1',
      name: 'ABW-123.mp4',
      avNumber: 'ABW-123',
      platform: 'jav',
      size: 2048,
      duration: 3600,
      mtime: 1700000100,
    })

    const strFc = toIndexedVideo({
      fc: '1',
      fid: 'f2',
      pid: 'pid88',
      cid: 'ignored',
      pc: 'pc2',
      n: '普通视频.mp4',
      s: 512,
      t: 1700000200,
    })
    expect(strFc).toEqual({
      fid: 'f2',
      cid: 'pid88',
      pickCode: 'pc2',
      name: '普通视频.mp4',
      avNumber: null,
      size: 512,
      duration: 0,
      mtime: 1700000200,
    })
  })

  it('提取星标收藏状态与 115 文字标签并按 id 去重', () => {
    const starredAndLabeled = toIndexedVideo({
      fc: 1,
      fid: 'f3',
      pid: 'pid1',
      pc: 'pc3',
      n: 'SSIS-999.mp4',
      s: 1000,
      t: 1700000300,
      m: '1',
      fl: [
        { id: '10', name: ' 必看 ', color: '#ff4d4f' },
        { id: '10', name: '重复ID忽略', color: '#000000' },
        { id: '20', name: '无色标签', color: '   ' },
        { id: '30', name: '   ' },
        null,
      ],
    })
    expect(starredAndLabeled).toMatchObject({
      fid: 'f3',
      starred: true,
      labels: [
        { id: '10', name: '必看', color: '#ff4d4f' },
        { id: '20', name: '无色标签' },
      ],
    })
    expect(starredAndLabeled?.labels?.[1]).not.toHaveProperty('color')

    const numericStarred = toIndexedVideo({
      fc: 1,
      fid: 'f3b',
      pc: 'pc3b',
      n: 'ABW-001.mp4',
      m: 1,
    })
    expect(numericStarred?.starred).toBe(true)

    const isMStarred = toIndexedVideo({
      fc: 1,
      fid: 'f4',
      pc: 'pc4',
      n: 'IPX-100.mp4',
      is_m: 1,
      fl: 'invalid',
    })
    expect(isMStarred?.starred).toBe(true)
    expect(isMStarred).not.toHaveProperty('labels')

    const unstarred = toIndexedVideo({
      fc: 1,
      fid: 'f5',
      pc: 'pc5',
      n: 'plain.mp4',
      m: '0',
      fl: [],
    })
    expect(unstarred).not.toHaveProperty('starred')
    expect(unstarred).not.toHaveProperty('labels')

    const onlyFansVideo = toIndexedVideo({
      fc: 1,
      fid: 'f-of',
      pid: 'cid-of',
      pc: 'pc-of',
      n: 'OnlyFans - @luna_2024 - bedroom.mp4',
      s: 1024,
      t: 1700000400,
    })
    expect(onlyFansVideo).toMatchObject({
      fid: 'f-of',
      avNumber: null,
      platform: 'onlyfans',
      creator: { handle: 'luna_2024' },
    })

    const numericUnstarred = toIndexedVideo({
      fc: 1,
      fid: 'f6',
      pc: 'pc6',
      n: 'plain2.mp4',
      m: 0,
    })
    expect(numericUnstarred).not.toHaveProperty('starred')
    expect(numericUnstarred).not.toHaveProperty('labels')
  })

  it('存在 sha 字段时写入 sha1，缺失时不添加该键', () => {
    const withSha = toIndexedVideo({
      fc: 1,
      fid: 'f7',
      pc: 'pc7',
      sha: 'ABC123SHA1',
      n: 'SSIS-007.mp4',
    })
    expect(withSha?.sha1).toBe('ABC123SHA1')

    const withoutSha = toIndexedVideo({
      fc: 1,
      fid: 'f8',
      pc: 'pc8',
      sha: '   ',
      n: 'SSIS-008.mp4',
    })
    expect(withoutSha).not.toHaveProperty('sha1')
  })

  it('优先使用文件自身入库/创建时间 tp 与 t，不受移动后的 tu/te 覆盖', () => {
    const withTpAndNewerTu = toIndexedVideo({
      fc: 1,
      fid: 'f9',
      pc: 'pc9',
      n: 'SSIS-009.mp4',
      tp: 1700000000,
      t: 1700000005,
      te: 1700000500,
      tu: 1700000900,
    })
    expect(withTpAndNewerTu?.mtime).toBe(1700000000)

    const withDateStringT = toIndexedVideo({
      fc: 1,
      fid: 'f10',
      pc: 'pc10',
      n: 'SSIS-010.mp4',
      t: '2024-05-01 12:00:00',
      tu: 1799999999,
    })
    expect(withDateStringT?.mtime).toBe(Math.floor(Date.parse('2024-05-01T12:00:00') / 1000))

    const fallbackTeThenTu = toIndexedVideo({
      fc: 1,
      fid: 'f11',
      pc: 'pc11',
      n: 'SSIS-011.mp4',
      te: 1700000300,
      tu: 1700000900,
    })
    expect(fallbackTeThenTu?.mtime).toBe(1700000300)

    const fallbackTuOnly = toIndexedVideo({
      fc: 1,
      fid: 'f12',
      pc: 'pc12',
      n: 'SSIS-012.mp4',
      tu: 1700000900,
    })
    expect(fallbackTuOnly?.mtime).toBe(1700000900)
  })
})
