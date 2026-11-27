import { describe, expect, it } from 'vitest'
import { classifyGenreGroup, groupGenres } from '../genreGroups'

describe('genreGroups', () => {
  it('classifies Simplified and Traditional Chinese tags into expected groups', () => {
    expect(classifyGenreGroup('單體作品')).toBe('theme')
    expect(classifyGenreGroup('人妻')).toBe('role')
    expect(classifyGenreGroup('黑絲')).toBe('outfit')
    expect(classifyGenreGroup('巨乳')).toBe('body')
    expect(classifyGenreGroup('中出')).toBe('action')
    expect(classifyGenreGroup('NTR')).toBe('play')
    expect(classifyGenreGroup('未归类测试标签')).toBe('other')
  })

  it('groups facet counts in canonical order and omits empty groups', () => {
    const groups = groupGenres([
      { name: '巨乳', count: 20 },
      { name: '单体作品', count: 50 },
      { name: '黑丝', count: 12 },
      { name: '人妻', count: 8 },
    ])

    expect(groups.map(g => g.key)).toEqual(['theme', 'role', 'outfit', 'body'])
    expect(groups[0]?.items).toEqual([{ name: '单体作品', count: 50 }])
  })
})
