import { describe, expect, it } from 'vitest'
import { ActressNameMatcher } from '../actressNameMatcher'

const matcher = new ActressNameMatcher([
  '大橋未久',
  '大橋未久-2',
  '美谷朱音',
  '美谷朱里',
  '明里',
  '明里つむぎ',
  '桜井彩',
  'Julia',
  'Mia',
  'さくら',
  '葵-2',
])

describe('actressNameMatcher', () => {
  it.each([
    ['大橋未久', '大橋未久'],
    ['大桥未久', '大橋未久'],
    ['大桥未久无码全集', '大橋未久'],
    ['美谷朱音 朱可人', '美谷朱音'],
    ['[合集]櫻井彩 2019', '桜井彩'],
    ['明里つむぎ 合集', '明里つむぎ'],
    ['合集 明里', '明里'],
    ['JULIA 合集', 'Julia'],
    ['葵', '葵-2'],
    ['大桥未久/美谷朱音', '大橋未久'],
    ['朱可人/美谷朱音', '美谷朱音'],
    ['明里／朱可人', '明里'],
    ['朱可人、Julia', 'Julia'],
  ])('%s -> %s', (title, expected) => {
    expect(matcher.match(title)).toBe(expected)
  })

  it.each([
    '光明里的故事',
    'Juliana 合集',
    'Mia 合集',
    'さくらんぼ',
    '普通文件夹',
    '',
  ])('%s 不匹配', (title) => {
    expect(matcher.match(title)).toBeUndefined()
  })
})
