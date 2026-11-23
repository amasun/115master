import type { MarkerDoc } from '../types'
import { describe, expect, it } from 'vitest'
import {
  decodeMarkersFromDesc,
  encodeMarkersIntoDesc,
  MARKER_DESC_END,
  MARKER_DESC_START,
} from '../descCodec'

function makeDoc(markers: MarkerDoc['markers']): MarkerDoc {
  return {
    v: 1,
    pickCode: 'pc001',
    fileId: 'f001',
    updatedAt: 1000,
    markers,
  }
}

describe('markers descCodec', () => {
  it('能无损将打点写入已有备注并在读取时还原，不破坏原有备注', () => {
    const doc = makeDoc([
      { id: '1', time: 65.5, label: '高能片段', createdAt: 1, updatedAt: 1 },
      { id: '2', time: 180, label: '', createdAt: 2, updatedAt: 2 },
      { id: '3', time: 200, label: '已删除', createdAt: 3, updatedAt: 3, deleted: true },
    ])

    const encoded = encodeMarkersIntoDesc('个人手写备注内容', doc)
    expect(encoded.truncated).toBe(false)
    expect(encoded.desc).toContain('个人手写备注内容')
    expect(encoded.desc).toContain(MARKER_DESC_START)
    expect(encoded.desc).toContain(MARKER_DESC_END)
    expect(encoded.desc).not.toContain('已删除')

    const decoded = decodeMarkersFromDesc(encoded.desc, { pickCode: 'pc001', fileId: 'f001' })
    expect(decoded).not.toBeNull()
    expect(decoded?.markers).toHaveLength(2)
    expect(decoded?.markers[0]).toMatchObject({ time: 65.5, label: '高能片段' })
    expect(decoded?.markers[1]).toMatchObject({ time: 180 })
  })

  it('再次写入时覆盖旧打点块而不重复叠加，清空打点时还原纯净原备注', () => {
    const first = encodeMarkersIntoDesc(
      '原备注',
      makeDoc([{ id: '1', time: 12, label: 'A', createdAt: 1, updatedAt: 1 }]),
    )
    const second = encodeMarkersIntoDesc(
      first.desc,
      makeDoc([{ id: '2', time: 99, label: 'B', createdAt: 2, updatedAt: 2 }]),
    )
    expect(second.desc.match(/\[115M:MARKERS:v1\]/g)).toHaveLength(1)
    expect(second.desc).toContain('99|B')
    expect(second.desc).not.toContain('12|A')

    const cleared = encodeMarkersIntoDesc(second.desc, makeDoc([]))
    expect(cleared.truncated).toBe(false)
    expect(cleared.desc).toBe('原备注')
  })

  it('超出备注长度上限时返回 truncated=true 并原样保留原备注', () => {
    const original = 'A'.repeat(100)
    const doc = makeDoc([
      { id: '1', time: 10, label: '超长标签内容', createdAt: 1, updatedAt: 1 },
    ])
    const encoded = encodeMarkersIntoDesc(original, doc, 110)
    expect(encoded.truncated).toBe(true)
    expect(encoded.desc).toBe(original)
  })
})
