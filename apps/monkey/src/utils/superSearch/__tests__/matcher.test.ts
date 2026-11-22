import type { IndexedVideo } from '../types'
// @vitest-environment jsdom
import type { JavInfo } from '@/utils/jav/jav'
import { describe, expect, it } from 'vitest'
import { JAV_SOURCE } from '@/utils/jav/jav'
import { searchIndexedVideos } from '../matcher'

const videos: IndexedVideo[] = [
  {
    fid: '1',
    cid: '100',
    pickCode: 'pc1',
    name: 'www.98T.la@SSIS-001.mp4',
    avNumber: 'SSIS-001',
    size: 1024 * 1024 * 1024,
    duration: 7200,
    mtime: 2000,
  },
  {
    fid: '2',
    cid: '200',
    pickCode: 'pc2',
    name: 'IPX-534-UC.mkv',
    avNumber: 'IPX-534',
    size: 2048 * 1024 * 1024,
    duration: 6800,
    mtime: 3000,
  },
  {
    fid: '3',
    cid: '300',
    pickCode: 'pc3',
    name: '家庭旅行记录 2024 东京.mp4',
    avNumber: null,
    size: 512 * 1024 * 1024,
    duration: 600,
    mtime: 1000,
  },
]

const javMap = new Map<string, JavInfo>([
  [
    'SSIS-001',
    {
      source: JAV_SOURCE.JAVBUS,
      baseUrl: 'https://www.javbus.com',
      detailUrl: 'https://www.javbus.com/SSIS-001',
      searchUrl: 'https://www.javbus.com/SSIS-001',
      avNumber: 'SSIS-001',
      title: '职场新人的秘密日记',
      date: new Date('2024-05-10').getTime(),
      actors: [{ name: '松下纱荣子' }, { name: '立花瑠莉' }],
      director: [{ name: '山田导演' }],
      category: [{ name: '剧情' }, { name: '单体作品' }],
    },
  ],
  [
    'IPX-534',
    {
      source: JAV_SOURCE.JAVDB,
      baseUrl: 'https://javdb.com',
      detailUrl: 'https://javdb.com/v/ipx534',
      searchUrl: 'https://javdb.com/search?q=IPX-534',
      avNumber: 'IPX-534',
      title: '夏夜物语',
      date: new Date('2023-08-01').getTime(),
      actors: [{ name: '桃乃木香奈' }],
      category: [{ name: '偶像' }],
    },
  ],
])

describe('searchIndexedVideos', () => {
  it('文件名不含演员名时，可通过本地 javCache 反查演员精准命中', () => {
    const results = searchIndexedVideos('松下纱荣子', videos, javMap)
    expect(results).toHaveLength(1)
    expect(results[0]!.video.fid).toBe('1')
    expect(results[0]!.reasons.some(r => r.kind === 'actor' && r.label.includes('松下纱荣子'))).toBe(true)
  })

  it('支持按分类标签、导演、作品标题和发行年份反查', () => {
    expect(searchIndexedVideos('单体作品', videos, javMap).map(r => r.video.fid)).toEqual(['1'])
    expect(searchIndexedVideos('山田导演', videos, javMap).map(r => r.video.fid)).toEqual(['1'])
    expect(searchIndexedVideos('秘密日记', videos, javMap).map(r => r.video.fid)).toEqual(['1'])
    expect(searchIndexedVideos('2024', videos, javMap).map(r => r.video.fid)).toEqual(['1', '3'])
  })

  it('支持番号精确匹配与多关键词文件名直搜', () => {
    const byAv = searchIndexedVideos('ssis001', videos, javMap)
    expect(byAv).toHaveLength(1)
    expect(byAv[0]!.video.avNumber).toBe('SSIS-001')

    const byName = searchIndexedVideos('家庭 东京', videos, javMap)
    expect(byName).toHaveLength(1)
    expect(byName[0]!.video.fid).toBe('3')
  })

  it('空查询返回空数组', () => {
    expect(searchIndexedVideos('   ', videos, javMap)).toEqual([])
  })
})
