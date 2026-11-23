import type { Tag } from '@/store/tagList'
import type { DriveLabelFacetCount } from '@/utils/mediaIndex'
import { describe, expect, it } from 'vitest'
import { filterTagRailItems, mergeTagRailItems, resolveDriveLabelName } from '../tagRail'

const BLANK = 'blank'

describe('tagRail helpers', () => {
  const driveTags: Tag[] = [
    { id: 't1', name: '经典收藏', color: '#ff0000', sort: 2 },
    { id: 't2', name: '待看清单', color: '', sort: 1 },
    { id: 't3', name: '空标签', color: '#00ff00', sort: 3 },
  ]

  const libraryLabels: DriveLabelFacetCount[] = [
    { id: 't1', name: '经典收藏', color: '#ff0000', count: 5 },
    { id: 't2', name: '待看清单', count: 12 },
    { id: 't4', name: '仅索引标签', color: '#0000ff', count: 2 },
  ]

  it('merges drive tags with library counts and keeps fallback labels', () => {
    const merged = mergeTagRailItems(driveTags, libraryLabels, BLANK)
    expect(merged).toEqual([
      { id: 't1', name: '经典收藏', color: '#ff0000', sort: 2, count: 5, fromDrive: true },
      { id: 't2', name: '待看清单', color: BLANK, sort: 1, count: 12, fromDrive: true },
      { id: 't3', name: '空标签', color: '#00ff00', sort: 3, count: 0, fromDrive: true },
      { id: 't4', name: '仅索引标签', color: '#0000ff', sort: 0, count: 2, fromDrive: false },
    ])
  })

  it('sorts by works count desc then zero-count tags in filter mode', () => {
    const merged = mergeTagRailItems(driveTags, libraryLabels, BLANK)
    const filtered = filterTagRailItems(merged, { keyword: '', mode: 'filter' })
    expect(filtered.map(item => item.id)).toEqual(['t2', 't1', 't4', 't3'])
  })

  it('filters onlyWithWorks and keyword in filter mode', () => {
    const merged = mergeTagRailItems(driveTags, libraryLabels, BLANK)
    expect(
      filterTagRailItems(merged, { keyword: '', mode: 'filter', onlyWithWorks: true }).map(i => i.id),
    ).toEqual(['t2', 't1', 't4'])

    expect(
      filterTagRailItems(merged, { keyword: '收藏', mode: 'filter' }).map(i => i.id),
    ).toEqual(['t1'])
  })

  it('preserves original order in manage mode', () => {
    const merged = mergeTagRailItems(driveTags, libraryLabels, BLANK)
    const managed = filterTagRailItems(merged, { keyword: '', mode: 'manage' })
    expect(managed.map(item => item.id)).toEqual(['t1', 't2', 't3', 't4'])
  })

  it('resolves drive label name with driveTags priority and fallback', () => {
    expect(resolveDriveLabelName('t1', [{ id: 't1', name: '新名称', color: BLANK, sort: 0 }], libraryLabels)).toBe('新名称')
    expect(resolveDriveLabelName('t4', driveTags, libraryLabels)).toBe('仅索引标签')
    expect(resolveDriveLabelName('unknown-id', driveTags, libraryLabels)).toBe('unknown-id')
  })
})
