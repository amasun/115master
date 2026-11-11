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

  describe('matchName 渐进式缩位降级', () => {
    it('完整命中：精确匹配或忽略写法差异', () => {
      expect(matcher.matchName('美谷朱音')).toBe('美谷朱音')
      expect(matcher.matchName('大桥未久')).toBe('大橋未久')
      expect(matcher.matchName('明里')).toBe('明里')
      expect(matcher.matchName('Julia')).toBe('Julia')
    })

    it('一级降级：去掉末位搜索命中（如 1234 -> 123）', () => {
      // 库中没有「美谷朱X」，去掉末位搜「美谷朱」，命中「美谷朱音」
      expect(matcher.matchName('美谷朱X')).toBe('美谷朱音')
      // 库中没有「大桥未美」，去掉末位搜「大桥未」，命中「大橋未久」
      expect(matcher.matchName('大桥未美')).toBe('大橋未久')
    })

    it('二级降级：继续去位搜索命中第一候选（如 1234 -> 12）', () => {
      // 库中没有「美谷XX」和「美谷X」，继续去位搜「美谷」，取第一候选「美谷朱音」
      expect(matcher.matchName('美谷XX')).toBe('美谷朱音')
      // 去位至「明里」，完全相等的「明里」优先于「明里つむぎ」
      expect(matcher.matchName('明里XX')).toBe('明里')
    })

    it('全部失败：无候选或长度越界时返回 undefined', () => {
      expect(matcher.matchName('某某XX')).toBeUndefined()
      // 文本过长（如标题、无码全集等长关键词）不做缩位降级，避免误匹配
      expect(matcher.matchName('大桥未久无码全集')).toBeUndefined()
      // 2位去掉末位只剩1位，低于 MIN_FUZZY_LENGTH (2)
      expect(matcher.matchName('葵X')).toBeUndefined()
      expect(matcher.matchName('')).toBeUndefined()
    })

    it('searchCandidates 候选列表按规则排序', () => {
      // 「美谷」前缀匹配多个候选，保持收录顺序，首项为第一候选
      expect(matcher.searchCandidates('美谷')).toEqual(['美谷朱音', '美谷朱里'])
      // 「明里」完全匹配排在第一位，前缀匹配「明里つむぎ」排在后面
      expect(matcher.searchCandidates('明里')).toEqual(['明里', '明里つむぎ'])
      expect(matcher.searchCandidates('未知')).toEqual([])
      expect(matcher.searchCandidates('a')).toEqual([])
    })
  })
})
