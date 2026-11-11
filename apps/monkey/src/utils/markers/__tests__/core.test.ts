import type { MarkerDoc } from '../types'
import { describe, expect, it } from 'vitest'
import {
  addMarker,
  buildSegments,
  createDoc,
  findNextMarker,
  findPrevMarker,
  formatMarkerTime,
  mergeDocs,
  nextSegmentAction,
  parseDocs,
  pruneTombstones,
  removeMarker,
  serializeDocs,
  updateMarker,
  visibleMarkers,
} from '../core'

describe('createDoc', () => {
  it('创建带完整元数据的文档', () => {
    const doc = createDoc({
      pickCode: 'pick123',
      fileId: 'fid123',
      fileName: 'video.mp4',
      duration: 3600,
    }, 1000)

    expect(doc).toEqual({
      v: 1,
      pickCode: 'pick123',
      fileId: 'fid123',
      fileName: 'video.mp4',
      duration: 3600,
      markers: [],
      updatedAt: 1000,
    })
  })

  it('创建仅带必要元数据的文档', () => {
    const doc = createDoc({ pickCode: 'pick123' }, 2000)
    expect(doc.v).toBe(1)
    expect(doc.pickCode).toBe('pick123')
    expect(doc.markers).toEqual([])
    expect(doc.updatedAt).toBe(2000)
    expect(doc.fileId).toBeUndefined()
  })
})

describe('addMarker', () => {
  it('添加打点并保持不可变更新', () => {
    const doc = createDoc({ pickCode: 'pick1' }, 1000)
    const nextDoc = addMarker(doc, { time: 10, label: '点1' }, 1500, 'id-1')

    expect(doc.markers).toHaveLength(0)
    expect(doc.updatedAt).toBe(1000)

    expect(nextDoc.markers).toHaveLength(1)
    expect(nextDoc.updatedAt).toBe(1500)
    expect(nextDoc.markers[0]).toEqual({
      id: 'id-1',
      time: 10,
      label: '点1',
      createdAt: 1500,
      updatedAt: 1500,
    })
  })

  it('未指定 id 时自动生成 UUID，未指定 label 时默认为空字符串', () => {
    const doc = createDoc({ pickCode: 'pick1' }, 1000)
    const nextDoc = addMarker(doc, { time: 25, endTime: 40 }, 2000)

    expect(nextDoc.markers[0].id).toBeDefined()
    expect(typeof nextDoc.markers[0].id).toBe('string')
    expect(nextDoc.markers[0].label).toBe('')
    expect(nextDoc.markers[0].endTime).toBe(40)
  })

  it('负数时间自动 clamp 到 0', () => {
    const doc = createDoc({ pickCode: 'pick1' }, 1000)
    const nextDoc = addMarker(doc, { time: -10, endTime: 10 }, 2000)
    expect(nextDoc.markers[0].time).toBe(0)
    expect(nextDoc.markers[0].endTime).toBe(10)
  })

  it('time 为 NaN 或 Infinity 时不写入，直接返回原 doc', () => {
    const doc = createDoc({ pickCode: 'pick1' }, 1000)
    expect(addMarker(doc, { time: Number.NaN }, 2000)).toBe(doc)
    expect(addMarker(doc, { time: Number.POSITIVE_INFINITY }, 2000)).toBe(doc)
    expect(addMarker(doc, { time: Number.NEGATIVE_INFINITY }, 2000)).toBe(doc)
  })

  it('endTime 非有限数或 <= time 时视为未设置', () => {
    const doc = createDoc({ pickCode: 'pick1' }, 1000)
    const d1 = addMarker(doc, { time: 10, endTime: 10 }, 2000, 'm1')
    expect(d1.markers[0].endTime).toBeUndefined()

    const d2 = addMarker(doc, { time: 10, endTime: 5 }, 2000, 'm2')
    expect(d2.markers[0].endTime).toBeUndefined()

    const d3 = addMarker(doc, { time: 10, endTime: Number.NaN }, 2000, 'm3')
    expect(d3.markers[0].endTime).toBeUndefined()

    const d4 = addMarker(doc, { time: 10, endTime: Number.POSITIVE_INFINITY }, 2000, 'm4')
    expect(d4.markers[0].endTime).toBeUndefined()

    const d5 = addMarker(doc, { time: -10, endTime: -5 }, 2000, 'm5')
    /** clamped time is 0, clamped endTime is 0, <= time so undefined */
    expect(d5.markers[0].endTime).toBeUndefined()
  })
})

describe('updateMarker', () => {
  it('更新指定打点的内容和更新时间', () => {
    const doc = addMarker(createDoc({ pickCode: 'pick1' }, 1000), { time: 10, label: '旧备注' }, 1000, 'id-1')
    const updated = updateMarker(doc, 'id-1', { label: '新备注', time: 15, endTime: 30 }, 2000)

    expect(updated.updatedAt).toBe(2000)
    expect(updated.markers[0]).toEqual({
      id: 'id-1',
      time: 15,
      endTime: 30,
      label: '新备注',
      createdAt: 1000,
      updatedAt: 2000,
    })
  })

  it('传 undefined 字段时保持原值', () => {
    const doc = addMarker(createDoc({ pickCode: 'pick1' }, 1000), { time: 10, endTime: 20, label: '保持备注' }, 1000, 'id-1')
    const updated = updateMarker(doc, 'id-1', { label: undefined, time: undefined, endTime: undefined }, 2000)

    expect(updated.markers[0].time).toBe(10)
    expect(updated.markers[0].endTime).toBe(20)
    expect(updated.markers[0].label).toBe('保持备注')
  })

  it('目标打点已是墓碑时直接返回原 doc', () => {
    const doc = removeMarker(addMarker(createDoc({ pickCode: 'pick1' }, 1000), { time: 10 }, 1000, 'id-1'), 'id-1', 2000)
    const updated = updateMarker(doc, 'id-1', { label: '试图修改' }, 3000)
    expect(updated).toBe(doc)
    expect(updated.markers[0].label).toBe('')
    expect(updated.updatedAt).toBe(2000)
  })

  it('time 为 NaN 或 Infinity 时忽略该字段，保持原值', () => {
    const doc = addMarker(createDoc({ pickCode: 'pick1' }, 1000), { time: 10, label: '原点' }, 1000, 'id-1')
    const u1 = updateMarker(doc, 'id-1', { time: Number.NaN, label: '新名' }, 2000)
    expect(u1.markers[0].time).toBe(10)
    expect(u1.markers[0].label).toBe('新名')

    const u2 = updateMarker(doc, 'id-1', { time: Number.POSITIVE_INFINITY }, 2000)
    expect(u2.markers[0].time).toBe(10)
  })

  it('endTime 非有限数或 <= time 时置为 undefined', () => {
    const doc = addMarker(createDoc({ pickCode: 'pick1' }, 1000), { time: 10, endTime: 30 }, 1000, 'id-1')

    /** endTime <= time */
    const u1 = updateMarker(doc, 'id-1', { endTime: 10 }, 2000)
    expect(u1.markers[0].endTime).toBeUndefined()

    const u2 = updateMarker(doc, 'id-1', { endTime: 5 }, 2000)
    expect(u2.markers[0].endTime).toBeUndefined()

    /** time 推进导致已有 endTime <= time */
    const u3 = updateMarker(doc, 'id-1', { time: 35 }, 2000)
    expect(u3.markers[0].endTime).toBeUndefined()

    /** endTime 为 NaN */
    const u4 = updateMarker(doc, 'id-1', { endTime: Number.NaN }, 2000)
    expect(u4.markers[0].endTime).toBeUndefined()
  })

  it('id 不存在时直接返回原 doc', () => {
    const doc = createDoc({ pickCode: 'pick1' }, 1000)
    const updated = updateMarker(doc, 'non-existent', { label: 'abc' }, 2000)
    expect(updated).toBe(doc)
  })
})

describe('removeMarker', () => {
  it('写入墓碑 deleted: true 并更新时间戳', () => {
    const doc = addMarker(createDoc({ pickCode: 'pick1' }, 1000), { time: 10 }, 1000, 'id-1')
    const removed = removeMarker(doc, 'id-1', 2000)

    expect(removed.updatedAt).toBe(2000)
    expect(removed.markers[0].deleted).toBe(true)
    expect(removed.markers[0].updatedAt).toBe(2000)
  })

  it('重复删除已是墓碑的打点幂等返回原 doc', () => {
    const doc = addMarker(createDoc({ pickCode: 'pick1' }, 1000), { time: 10 }, 1000, 'id-1')
    const removed = removeMarker(doc, 'id-1', 2000)
    const removedAgain = removeMarker(removed, 'id-1', 3000)

    expect(removedAgain).toBe(removed)
  })

  it('id 不存在时直接返回原 doc', () => {
    const doc = createDoc({ pickCode: 'pick1' }, 1000)
    const removed = removeMarker(doc, 'non-existent', 2000)
    expect(removed).toBe(doc)
  })
})

describe('visibleMarkers', () => {
  it('过滤墓碑并按时间升序排列', () => {
    let doc = createDoc({ pickCode: 'pick1' }, 1000)
    doc = addMarker(doc, { time: 30, label: '3' }, 1000, 'm3')
    doc = addMarker(doc, { time: 10, label: '1' }, 1000, 'm1')
    doc = addMarker(doc, { time: 20, label: '2' }, 1000, 'm2')
    doc = removeMarker(doc, 'm2', 2000)

    const visible = visibleMarkers(doc)
    expect(visible.map(m => m.id)).toEqual(['m1', 'm3'])
  })

  it('同一时间多个打点按创建时间稳定排序', () => {
    let doc = createDoc({ pickCode: 'pick1' }, 1000)
    doc = addMarker(doc, { time: 10, label: 'first' }, 1000, 'm1')
    doc = addMarker(doc, { time: 10, label: 'second' }, 2000, 'm2')

    const visible = visibleMarkers(doc)
    expect(visible.map(m => m.id)).toEqual(['m1', 'm2'])
  })

  it('空文档或全墓碑返回空数组', () => {
    const emptyDoc = createDoc({ pickCode: 'pick1' }, 1000)
    expect(visibleMarkers(emptyDoc)).toEqual([])

    const docWithDeleted = removeMarker(
      addMarker(emptyDoc, { time: 10 }, 1000, 'm1'),
      'm1',
      2000,
    )
    expect(visibleMarkers(docWithDeleted)).toEqual([])
  })
})

describe('findPrevMarker', () => {
  const baseMarkers = [
    { id: '1', time: 10, label: '1', createdAt: 100, updatedAt: 100 },
    { id: '2', time: 20, label: '2', createdAt: 100, updatedAt: 100 },
    { id: '3', time: 30, label: '3', createdAt: 100, updatedAt: 100 },
  ]

  it('距离当前打点超过 tolerance 时回到当前打点', () => {
    /** 当前在 35，最近打点为 30，距离 5 > 2，回到 30 */
    const prev = findPrevMarker(baseMarkers, 35, 2)
    expect(prev?.id).toBe('3')
  })

  it('距离当前打点小于等于 tolerance 时回到再前一个', () => {
    /** 当前在 31，最近打点为 30，距离 1 <= 2，回到 20 */
    const prev = findPrevMarker(baseMarkers, 31, 2)
    expect(prev?.id).toBe('2')

    /** 当前刚好在 30，距离 0 <= 2，回到 20 */
    const atMarker = findPrevMarker(baseMarkers, 30, 2)
    expect(atMarker?.id).toBe('2')
  })

  it('在首个打点附近且小于等于 tolerance 时回到 null', () => {
    /** 当前在 11，首个打点为 10，距离 1 <= 2，前面没有打点，返回 null */
    const prev = findPrevMarker(baseMarkers, 11, 2)
    expect(prev).toBeNull()
  })

  it('在首个打点之前返回 null', () => {
    const prev = findPrevMarker(baseMarkers, 5, 2)
    expect(prev).toBeNull()
  })

  it('同一时间多个打点不会卡住，能顺利回到更早时间的打点', () => {
    const markersWithDuplicates = [
      { id: '1', time: 10, label: '1', createdAt: 100, updatedAt: 100 },
      { id: '2a', time: 30, label: '2a', createdAt: 100, updatedAt: 100 },
      { id: '2b', time: 30, label: '2b', createdAt: 200, updatedAt: 200 },
    ]

    /** 处于 31 秒，距离 30 为 1 <= 2，应当回到 10 秒 */
    const prev = findPrevMarker(markersWithDuplicates, 31, 2)
    expect(prev?.id).toBe('1')
  })

  it('过滤墓碑打点', () => {
    const markersWithTombstone = [
      { id: '1', time: 10, label: '1', createdAt: 100, updatedAt: 100 },
      { id: '2', time: 20, label: '2', createdAt: 100, updatedAt: 100, deleted: true },
      { id: '3', time: 30, label: '3', createdAt: 100, updatedAt: 100 },
    ]

    /** 从 31 回退，本应去 20，但 20 已删除，直接去 10 */
    const prev = findPrevMarker(markersWithTombstone, 31, 2)
    expect(prev?.id).toBe('1')
  })
})

describe('findNextMarker', () => {
  const baseMarkers = [
    { id: '1', time: 10, label: '1', createdAt: 100, updatedAt: 100 },
    { id: '2', time: 20, label: '2', createdAt: 100, updatedAt: 100 },
    { id: '3', time: 30, label: '3', createdAt: 100, updatedAt: 100 },
  ]

  it('在打点前寻找下一个打点', () => {
    expect(findNextMarker(baseMarkers, 5)?.id).toBe('1')
    expect(findNextMarker(baseMarkers, 10)?.id).toBe('2')
    expect(findNextMarker(baseMarkers, 25)?.id).toBe('3')
  })

  it('已在最后一个打点或其后返回 null', () => {
    expect(findNextMarker(baseMarkers, 30)).toBeNull()
    expect(findNextMarker(baseMarkers, 35)).toBeNull()
  })

  it('忽略已删除打点', () => {
    const markersWithDeleted = [
      { id: '1', time: 10, label: '1', createdAt: 100, updatedAt: 100 },
      { id: '2', time: 20, label: '2', createdAt: 100, updatedAt: 100, deleted: true },
      { id: '3', time: 30, label: '3', createdAt: 100, updatedAt: 100 },
    ]
    expect(findNextMarker(markersWithDeleted, 10)?.id).toBe('3')
  })
})

describe('buildSegments', () => {
  it('基本片段计算与重叠、相接片段合并', () => {
    const markers = [
      /** [10, 25] (默认 15s) */
      { id: '1', time: 10, label: '', createdAt: 100, updatedAt: 100 },
      /** [20, 35] -> 重叠合并为 [10, 35] */
      { id: '2', time: 20, label: '', createdAt: 100, updatedAt: 100 },
      /** [35, 50] -> 相接合并为 [10, 50] */
      { id: '3', time: 35, label: '', createdAt: 100, updatedAt: 100 },
      /** [60, 70] */
      { id: '4', time: 60, endTime: 70, label: '', createdAt: 100, updatedAt: 100 },
    ]

    const segments = buildSegments(markers, 15)
    expect(segments).toEqual([
      { start: 10, end: 50 },
      { start: 60, end: 70 },
    ])
  })

  it('按 duration 截断并剔除超出 duration 的片段', () => {
    const markers = [
      /** [80, 140] -> 截断为 [80, 100] */
      { id: '1', time: 80, label: '', createdAt: 100, updatedAt: 100 },
      /** [110, 170] -> 超出截断后无效 */
      { id: '2', time: 110, label: '', createdAt: 100, updatedAt: 100 },
    ]

    const segments = buildSegments(markers, 60, 100)
    expect(segments).toEqual([
      { start: 80, end: 100 },
    ])
  })

  it('segmentSeconds <= 0 时只跳过没有显式 endTime 的打点', () => {
    const markers = [
      { id: '1', time: 10, label: '', createdAt: 100, updatedAt: 100 },
      { id: '2', time: 20, endTime: 35, label: '', createdAt: 100, updatedAt: 100 },
    ]
    expect(buildSegments(markers, 0)).toEqual([
      { start: 20, end: 35 },
    ])
    expect(buildSegments(markers, -10)).toEqual([
      { start: 20, end: 35 },
    ])
  })

  it('duration 为 undefined、非有限数或 <= 0 时视为未知时长不做截断', () => {
    const markers = [
      { id: '1', time: 10, label: '', createdAt: 100, updatedAt: 100 },
    ]
    expect(buildSegments(markers, 60, 0)).toEqual([
      { start: 10, end: 70 },
    ])
    expect(buildSegments(markers, 60, Number.NaN)).toEqual([
      { start: 10, end: 70 },
    ])
    expect(buildSegments(markers, 60, -50)).toEqual([
      { start: 10, end: 70 },
    ])
  })

  it('endTime <= time 的打点回退为 time + segmentSeconds', () => {
    const markers = [
      { id: '1', time: 10, endTime: 5, label: '', createdAt: 100, updatedAt: 100 },
      { id: '2', time: 30, endTime: 30, label: '', createdAt: 100, updatedAt: 100 },
    ]
    expect(buildSegments(markers, 15)).toEqual([
      { start: 10, end: 25 },
      { start: 30, end: 45 },
    ])
  })

  it('边界情况：空打点、全墓碑', () => {
    expect(buildSegments([], 60)).toEqual([])
    expect(buildSegments([{ id: '1', time: 10, label: '', createdAt: 100, updatedAt: 100, deleted: true }], 60)).toEqual([])
  })
})

describe('nextSegmentAction', () => {
  const segments = [
    { start: 10, end: 20 },
    { start: 30, end: 40 },
  ]

  it('在片段内部返回 stay', () => {
    expect(nextSegmentAction(segments, 10)).toEqual({ type: 'stay' })
    expect(nextSegmentAction(segments, 15)).toEqual({ type: 'stay' })
    expect(nextSegmentAction(segments, 19.9)).toEqual({ type: 'stay' })
    expect(nextSegmentAction(segments, 35)).toEqual({ type: 'stay' })
  })

  it('在片段外部 seek 到下一个最近片段的 start', () => {
    expect(nextSegmentAction(segments, 0)).toEqual({ type: 'seek', time: 10 })
    expect(nextSegmentAction(segments, 20)).toEqual({ type: 'seek', time: 30 })
    expect(nextSegmentAction(segments, 25)).toEqual({ type: 'seek', time: 30 })
  })

  it('后面没有片段时返回 ended', () => {
    expect(nextSegmentAction(segments, 40)).toEqual({ type: 'ended' })
    expect(nextSegmentAction(segments, 50)).toEqual({ type: 'ended' })
    expect(nextSegmentAction([], 10)).toEqual({ type: 'ended' })
  })
})

describe('mergeDocs', () => {
  it('任一侧为空时返回另一侧深拷贝', () => {
    const doc = createDoc({ pickCode: 'p1' }, 1000)
    const m1 = mergeDocs(doc, null)
    expect(m1).toEqual(doc)
    expect(m1?.markers).not.toBe(doc.markers)

    const m2 = mergeDocs(null, doc)
    expect(m2).toEqual(doc)
    expect(m2?.markers).not.toBe(doc.markers)

    expect(mergeDocs(null, null)).toBeNull()
  })

  it('不修改入参对象与数组', () => {
    const local = addMarker(createDoc({ pickCode: 'p1' }, 1000), { time: 10 }, 1000, 'm1')
    const remote = addMarker(createDoc({ pickCode: 'p1' }, 2000), { time: 20 }, 2000, 'm2')

    const localSnapshot = JSON.parse(JSON.stringify(local))
    const remoteSnapshot = JSON.parse(JSON.stringify(remote))

    const merged = mergeDocs(local, remote)
    expect(local).toEqual(localSnapshot)
    expect(remote).toEqual(remoteSnapshot)

    // 修改合并结果不影响原对象
    if (merged)
      merged.markers[0].label = 'modified'
    expect(local.markers[0].label).toBe('')
  })

  it('两侧 pickCode 不一致时抛出错误', () => {
    const docA = createDoc({ pickCode: 'codeA' }, 1000)
    const docB = createDoc({ pickCode: 'codeB' }, 1000)
    expect(() => mergeDocs(docA, docB)).toThrow('无法合并 pickCode 不一致的文档: codeA vs codeB')
  })

  it('元数据取 updatedAt 较大一侧的值，该侧缺失时用另一侧补', () => {
    const localNew = {
      ...createDoc({ pickCode: 'p1', fileId: 'fid-local', duration: 120 }, 2000),
      markers: [],
    }
    const remoteOld = {
      ...createDoc({ pickCode: 'p1', fileId: 'fid-remote', fileName: 'remote.mp4', duration: 200 }, 1000),
      markers: [],
    }

    const merged1 = mergeDocs(localNew, remoteOld)
    expect(merged1?.fileId).toBe('fid-local')
    expect(merged1?.fileName).toBe('remote.mp4')
    expect(merged1?.duration).toBe(120)

    /** 反向：remote 为较大侧 */
    const localOld2 = {
      ...createDoc({ pickCode: 'p1', fileName: 'local.mp4' }, 1000),
      markers: [],
    }
    const remoteNew2 = {
      ...createDoc({ pickCode: 'p1', fileId: 'fid-remote', duration: 300 }, 3000),
      markers: [],
    }

    const merged2 = mergeDocs(localOld2, remoteNew2)
    expect(merged2?.fileId).toBe('fid-remote')
    expect(merged2?.fileName).toBe('local.mp4')
    expect(merged2?.duration).toBe(300)
  })

  it('按 id 合并，updatedAt 大者胜，相等时保留 local', () => {
    const local = addMarker(
      createDoc({ pickCode: 'p1' }, 1000),
      { time: 10, label: 'local-old' },
      1000,
      'm1',
    )
    const remote = addMarker(
      createDoc({ pickCode: 'p1' }, 2000),
      { time: 12, label: 'remote-new' },
      2000,
      'm1',
    )

    const merged = mergeDocs(local, remote)
    expect(merged?.markers[0].label).toBe('remote-new')
    expect(merged?.markers[0].time).toBe(12)
    expect(merged?.updatedAt).toBe(2000)

    /** 相等时保留 local */
    const remoteSame = addMarker(
      createDoc({ pickCode: 'p1' }, 1000),
      { time: 15, label: 'remote-same' },
      1000,
      'm1',
    )
    const mergedSame = mergeDocs(local, remoteSame)
    expect(mergedSame?.markers[0].label).toBe('local-old')
  })

  it('墓碑参与合并', () => {
    /** local 删除了打点（updatedAt=2000），remote 还是未删除状态（updatedAt=1500） */
    const local = removeMarker(
      addMarker(createDoc({ pickCode: 'p1' }, 1000), { time: 10 }, 1000, 'm1'),
      'm1',
      2000,
    )
    const remote = addMarker(createDoc({ pickCode: 'p1' }, 1500), { time: 10 }, 1500, 'm1')

    const merged = mergeDocs(local, remote)
    expect(merged?.markers[0].deleted).toBe(true)
    expect(merged?.markers[0].updatedAt).toBe(2000)
  })

  it('合并两端独立存在的打点', () => {
    const local = addMarker(createDoc({ pickCode: 'p1' }, 1000), { time: 10 }, 1000, 'local-only')
    const remote = addMarker(createDoc({ pickCode: 'p1' }, 1500), { time: 20 }, 1500, 'remote-only')

    const merged = mergeDocs(local, remote)
    expect(merged?.markers).toHaveLength(2)
    expect(merged?.updatedAt).toBe(1500)
  })
})

describe('pruneTombstones', () => {
  it('清理超过 maxAgeMs 的墓碑，保留年轻墓碑与正常打点', () => {
    const now = 100_000_000
    const maxAge = 10_000

    const doc: MarkerDoc = {
      v: 1,
      pickCode: 'p1',
      updatedAt: now,
      markers: [
        { id: '1', time: 10, label: 'active', createdAt: 1000, updatedAt: 1000 },
        { id: '2', time: 20, label: 'fresh tombstone', createdAt: 1000, updatedAt: now - 5000, deleted: true },
        { id: '3', time: 30, label: 'expired tombstone', createdAt: 1000, updatedAt: now - 20000, deleted: true },
      ],
    }

    const pruned = pruneTombstones(doc, now, maxAge)
    expect(pruned.markers.map(m => m.id)).toEqual(['1', '2'])
  })

  it('恰好在清理边界上的墓碑予以保留，超出边界清理', () => {
    const now = 50_000
    const maxAge = 10_000

    const doc: MarkerDoc = {
      v: 1,
      pickCode: 'p1',
      updatedAt: now,
      markers: [
        /** now - updatedAt = 10000 === maxAge，恰好在边界上，保留 */
        { id: 'on-boundary', time: 10, label: 'on', createdAt: 1000, updatedAt: 40_000, deleted: true },
        /** now - updatedAt = 10001 > maxAge，超出边界 1ms，清理 */
        { id: 'beyond-boundary', time: 20, label: 'beyond', createdAt: 1000, updatedAt: 39_999, deleted: true },
      ],
    }

    const pruned = pruneTombstones(doc, now, maxAge)
    expect(pruned.markers.map(m => m.id)).toEqual(['on-boundary'])
  })

  it('无墓碑清理时返回原始 doc 引用', () => {
    const doc = createDoc({ pickCode: 'p1' }, 1000)
    expect(pruneTombstones(doc, 2000)).toBe(doc)
  })
})

describe('serializeDocs / parseDocs', () => {
  it('导入与导出完整往返一致', () => {
    let doc = createDoc({ pickCode: 'p1', fileName: 'test.mp4', duration: 120 }, 1000)
    doc = addMarker(doc, { time: 15, label: '精彩镜头', endTime: 30 }, 1000, 'm1')

    const serialized = serializeDocs({ p1: doc })
    const parsed = parseDocs(serialized)

    expect(parsed.v).toBe(1)
    expect(parsed.docs.p1).toEqual(doc)
  })

  it('serializeDocs 支持数组入参', () => {
    const doc = createDoc({ pickCode: 'p1' }, 1000)
    const json = serializeDocs([doc])
    const parsed = parseDocs(json)
    expect(parsed.docs.p1).toEqual(doc)
  })

  it('parseDocs 遇到非法输入抛出可读错误', () => {
    expect(() => parseDocs('')).toThrow('输入内容为空')
    expect(() => parseDocs('{ invalid json }')).toThrow('JSON 解析错误')
    expect(() => parseDocs('[]')).toThrow('根节点必须为对象')
    expect(() => parseDocs(JSON.stringify({ v: 2, docs: {} }))).toThrow('不支持的数据版本')
    expect(() => parseDocs(JSON.stringify({ v: 1, docs: [] }))).toThrow('docs 字段必须为对象')
  })

  it('parseDocs 自动丢弃字段不合法的打点', () => {
    const raw = {
      v: 1,
      docs: {
        p1: {
          v: 1,
          pickCode: 'p1',
          updatedAt: 1000,
          markers: [
            { id: 'valid', time: 10, label: 'ok', createdAt: 100, updatedAt: 100 },
            /** 缺少时间戳和有效 id */
            { id: '', time: 10, label: 'empty id' },
            { id: 'bad-time', time: 'not-number', label: 'bad' },
            { id: 'negative-time', time: -5, label: 'bad' },
            { id: 'bad-end', time: 10, endTime: 'bad', label: 'bad', createdAt: 100, updatedAt: 100 },
          ],
        },
      },
    }

    const parsed = parseDocs(JSON.stringify(raw))
    expect(parsed.docs.p1.markers).toHaveLength(1)
    expect(parsed.docs.p1.markers[0].id).toBe('valid')
  })

  it('parseDocs 缺少 updatedAt 时取打点最大 updatedAt，无打点为 0', () => {
    const rawWithMarkers = {
      v: 1,
      docs: {
        p1: {
          v: 1,
          pickCode: 'p1',
          markers: [
            { id: 'm1', time: 10, label: '', createdAt: 100, updatedAt: 500 },
            { id: 'm2', time: 20, label: '', createdAt: 100, updatedAt: 1200 },
          ],
        },
      },
    }
    const parsed1 = parseDocs(JSON.stringify(rawWithMarkers))
    expect(parsed1.docs.p1.updatedAt).toBe(1200)

    const rawEmpty = {
      v: 1,
      docs: {
        p2: {
          v: 1,
          pickCode: 'p2',
          markers: [],
        },
      },
    }
    const parsed2 = parseDocs(JSON.stringify(rawEmpty))
    expect(parsed2.docs.p2.updatedAt).toBe(0)
  })

  it('parseDocs 同一文档内 id 重复时只保留 updatedAt 最大的一个', () => {
    const raw = {
      v: 1,
      docs: {
        p1: {
          v: 1,
          pickCode: 'p1',
          updatedAt: 1000,
          markers: [
            { id: 'dup', time: 10, label: 'old', createdAt: 100, updatedAt: 200 },
            { id: 'dup', time: 15, label: 'new', createdAt: 100, updatedAt: 800 },
            { id: 'dup', time: 12, label: 'middle', createdAt: 100, updatedAt: 500 },
          ],
        },
      },
    }
    const parsed = parseDocs(JSON.stringify(raw))
    expect(parsed.docs.p1.markers).toHaveLength(1)
    expect(parsed.docs.p1.markers[0].label).toBe('new')
    expect(parsed.docs.p1.markers[0].time).toBe(15)
  })

  it('parseDocs 只保留 Marker 和 MarkerDoc 定义的字段', () => {
    const raw = {
      v: 1,
      docs: {
        p1: {
          v: 1,
          pickCode: 'p1',
          fileId: 'fid',
          unknownDocProp: 'ignore me',
          markers: [
            {
              id: 'm1',
              time: 10,
              label: 'ok',
              createdAt: 100,
              updatedAt: 100,
              unknownMarkerProp: 12345,
            },
          ],
        },
      },
    }
    const parsed = parseDocs(JSON.stringify(raw))
    const doc = parsed.docs.p1
    expect('unknownDocProp' in doc).toBe(false)
    expect('unknownMarkerProp' in doc.markers[0]).toBe(false)
  })
})

describe('formatMarkerTime', () => {
  it('不足一小时格式化为 M:SS', () => {
    expect(formatMarkerTime(0)).toBe('0:00')
    expect(formatMarkerTime(5)).toBe('0:05')
    expect(formatMarkerTime(59)).toBe('0:59')
    expect(formatMarkerTime(60)).toBe('1:00')
    expect(formatMarkerTime(65)).toBe('1:05')
    expect(formatMarkerTime(754)).toBe('12:34')
    expect(formatMarkerTime(3599)).toBe('59:59')
  })

  it('超过一小时格式化为 H:MM:SS', () => {
    expect(formatMarkerTime(3600)).toBe('1:00:00')
    expect(formatMarkerTime(3665)).toBe('1:01:05')
    expect(formatMarkerTime(7325)).toBe('2:02:05')
    expect(formatMarkerTime(36000)).toBe('10:00:00')
  })

  it('浮点数与边界异常输入处理', () => {
    expect(formatMarkerTime(65.8)).toBe('1:05')
    expect(formatMarkerTime(-10)).toBe('0:00')
    expect(formatMarkerTime(Number.NaN)).toBe('0:00')
  })
})
