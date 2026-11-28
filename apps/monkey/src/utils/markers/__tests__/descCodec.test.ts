import { describe, expect, it } from 'vitest'
import { createDoc } from '../core'
import {
  decodeMarkersFromDesc,
  encodeMarkersIntoDesc,
  encodeUserNoteIntoDesc,
  extractUserNoteFromDesc,
} from '../descCodec'

describe('descCodec user note & marker coexistence', () => {
  it('extracts user note while stripping marker sync block', () => {
    const raw = '我的片名备注：经典必看\n\n[115M:MARKERS:v1]\n12.5|开场\n45|高能\n[/115M]'
    expect(extractUserNoteFromDesc(raw)).toBe('我的片名备注：经典必看')
    expect(extractUserNoteFromDesc('[115M:MARKERS:v1]\n12.5|开场\n[/115M]')).toBe('')
    expect(extractUserNoteFromDesc('')).toBe('')
  })

  it('encodes user note while preserving existing marker sync block', () => {
    const doc = createDoc({ pickCode: 'pick-1' }, 1000)
    doc.markers.push({
      id: 'm1',
      time: 12.5,
      label: '开场',
      createdAt: 1000,
      updatedAt: 1000,
    })
    const withMarkers = encodeMarkersIntoDesc('', doc).desc
    const encoded = encodeUserNoteIntoDesc(withMarkers, '精校中字版')
    expect(encoded.truncated).toBe(false)
    expect(encoded.desc.startsWith('精校中字版\n\n[115M:MARKERS:v1]')).toBe(true)

    const decodedMarkers = decodeMarkersFromDesc(encoded.desc, { pickCode: 'pick-1' })
    expect(decodedMarkers?.markers).toHaveLength(1)
    expect(decodedMarkers?.markers[0].label).toBe('开场')
    expect(extractUserNoteFromDesc(encoded.desc)).toBe('精校中字版')
  })

  it('clears user note without dropping marker block', () => {
    const raw = '旧备注\n\n[115M:MARKERS:v1]\n12.5|开场\n[/115M]'
    const cleared = encodeUserNoteIntoDesc(raw, '')
    expect(cleared.truncated).toBe(false)
    expect(cleared.desc).toBe('[115M:MARKERS:v1]\n12.5|开场\n[/115M]')
    expect(extractUserNoteFromDesc(cleared.desc)).toBe('')
  })
})
