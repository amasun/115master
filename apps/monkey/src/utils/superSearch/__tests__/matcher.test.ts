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

  it('通道 A：即使未命中 javCache 且文件名不含演员名，也可通过演员作品集合反查命中', () => {
    const uncachedVideos: IndexedVideo[] = [
      ...videos,
      {
        fid: '4',
        cid: '400',
        pickCode: 'pc4',
        name: 'raw-upload-PRED-456.mp4',
        avNumber: 'PRED-456',
        size: 1024,
        duration: 3600,
        mtime: 4000,
      },
    ]

    const results = searchIndexedVideos('山岸逢花', uncachedVideos, javMap, {
      actorReverse: {
        actorName: '山岸逢花',
        source: 'javbus',
        avNumbers: new Set(['PRED456']),
      },
    })

    expect(results).toHaveLength(1)
    expect(results[0]!.video.fid).toBe('4')
    expect(results[0]!.reasons).toEqual([
      { kind: 'actorReverse', label: '演员反查 · 山岸逢花' },
    ])
  })

  it('通道 A 与通道 B 同时命中同一视频时合并去重并叠加排序分', () => {
    const results = searchIndexedVideos('松下纱荣子', videos, javMap, {
      actorReverse: {
        actorName: '松下紗栄子',
        source: 'javbus',
        avNumbers: new Set(['SSIS001']),
      },
    })

    expect(results).toHaveLength(1)
    expect(results[0]!.video.fid).toBe('1')
    expect(results[0]!.reasons.map(r => r.kind)).toEqual(['actorReverse', 'actor'])
    expect(results[0]!.score).toBe(185)
  })

  it('通道 B：支持繁简与日文汉字演员名归一化匹配', () => {
    const jpJavMap = new Map<string, JavInfo>([
      [
        'SSIS-001',
        {
          ...javMap.get('SSIS-001')!,
          actors: [{ name: '松下紗栄子' }],
        },
      ],
    ])

    const results = searchIndexedVideos('松下纱荣子', videos, jpJavMap)
    expect(results).toHaveLength(1)
    expect(results[0]!.video.fid).toBe('1')
    expect(results[0]!.reasons[0]?.kind).toBe('actor')
  })

  it('通道 B：借助 actorReverse.aliases 可用中文译名命中只含日文假名的 javCache 记录', () => {
    const kanaJavMap = new Map<string, JavInfo>([
      [
        'IPX-534',
        {
          ...javMap.get('IPX-534')!,
          actors: [{ name: '桃乃木かな' }],
        },
      ],
    ])

    const results = searchIndexedVideos('桃乃木香奈', videos, kanaJavMap, {
      actorReverse: {
        actorName: '桃乃木かな',
        source: 'javbus',
        avNumbers: new Set(),
        aliases: ['桃乃木香奈', '桃乃木かな'],
      },
    })

    expect(results).toHaveLength(1)
    expect(results[0]!.video.fid).toBe('2')
    expect(results[0]!.reasons).toEqual([
      { kind: 'actor', label: '演员 · 桃乃木かな' },
    ])
  })

  it('支持按 115 网盘文件文字标签检索命中', () => {
    const labeledVideos: IndexedVideo[] = [
      ...videos,
      {
        fid: '5',
        cid: '500',
        pickCode: 'pc5',
        name: 'MIDV-001.mp4',
        avNumber: 'MIDV-001',
        size: 1024,
        duration: 3600,
        mtime: 5000,
        starred: true,
        labels: [{ id: '10', name: '私人珍藏', color: '#f59e0b' }],
      },
    ]

    const results = searchIndexedVideos('珍藏', labeledVideos, javMap)
    expect(results).toHaveLength(1)
    expect(results[0]!.video.fid).toBe('5')
    expect(results[0]!.reasons).toEqual([
      { kind: 'driveLabel', label: '网盘标签 · 私人珍藏' },
    ])
  })

  it('支持创作者匹配、跨平台冲突抑制、父目录搜索与平台筛选', () => {
    const mixedVideos: IndexedVideo[] = [
      ...videos,
      {
        fid: '10',
        cid: 'of-luna',
        pickCode: 'pc10',
        name: 'ipx_534_special.mp4',
        avNumber: null,
        platform: 'onlyfans',
        creator: { name: 'Luna', handle: 'ipx' },
        size: 1024,
        duration: 1200,
        mtime: 6000,
      },
      {
        fid: '11',
        cid: 'mf-tia',
        pickCode: 'pc11',
        name: 'ティアくん(tiakun_404)特典.mp4',
        avNumber: null,
        platform: 'myfans',
        creator: { name: 'ティアくん', handle: 'tiakun_404' },
        size: 1024,
        duration: 1500,
        mtime: 7000,
      },
      {
        fid: '12',
        cid: 'of-unnamed',
        pickCode: 'pc12',
        name: 'abc_123.mp4',
        avNumber: 'ABC-123',
        size: 1024,
        duration: 900,
        mtime: 8000,
      },
    ]

    const folderMap = new Map([
      [
        'of-luna',
        {
          cid: 'of-luna',
          name: 'ipx',
          parentName: 'OnlyFans',
          displayLabel: 'OnlyFans / ipx',
          fullPath: '根目录 / OnlyFans / ipx',
          updatedAt: 1000,
        },
      ],
      [
        'of-unnamed',
        {
          cid: 'of-unnamed',
          name: 'mia_2024',
          parentName: 'OnlyFans',
          displayLabel: 'OnlyFans / mia_2024',
          fullPath: '根目录 / OnlyFans / mia_2024',
          updatedAt: 1000,
        },
      ],
      [
        '300',
        {
          cid: '300',
          name: '私人合集',
          parentName: '根目录',
          displayLabel: '根目录 / 私人合集',
          fullPath: '根目录 / 私人合集',
          updatedAt: 1000,
        },
      ],
    ])

    /** 1. 搜索 @ipx 时仅命中创作者，不误命中 IPX-534；直接搜 ipx 时创作者排第一且 IPX-534 不触发番号子串命中 */
    const byHandle = searchIndexedVideos('@ipx', mixedVideos, javMap, { folderMap })
    expect(byHandle.map(r => r.video.fid)).toEqual(['10'])
    expect(byHandle[0]!.reasons.some(r => r.kind === 'creator')).toBe(true)

    const byKnownHandle = searchIndexedVideos('ipx', mixedVideos, javMap, { folderMap })
    expect(byKnownHandle[0]!.video.fid).toBe('10')
    const javItem = byKnownHandle.find(r => r.video.fid === '2')
    expect(javItem?.reasons.some(r => r.kind === 'avNumber')).toBeFalsy()

    // 2. 搜索 MyFans 创作者名与账号
    expect(searchIndexedVideos('tiakun_404', mixedVideos, javMap, { folderMap }).map(r => r.video.fid)).toEqual(['11'])
    expect(searchIndexedVideos('ティアくん', mixedVideos, javMap, { folderMap }).map(r => r.video.fid)).toEqual(['11'])

    // 3. 父目录路径与跨字段联合搜索
    expect(searchIndexedVideos('dir:私人合集', mixedVideos, javMap, { folderMap }).map(r => r.video.fid)).toEqual(['3'])
    expect(searchIndexedVideos('私人合集 东京', mixedVideos, javMap, { folderMap }).map(r => r.video.fid)).toEqual(['3'])

    /** 4. 运行时结合目录把 OnlyFans 目录下的 abc_123.mp4 重归类为 onlyfans 并阻断假番号 */
    const ofResults = searchIndexedVideos('', mixedVideos, javMap, {
      folderMap,
      platformFilter: 'onlyfans',
    })
    expect(ofResults.map(r => r.video.fid)).toEqual(['12', '10'])
    expect(ofResults[0]!.avNumber).toBeNull()
    expect(ofResults[0]!.creator).toEqual({ name: 'mia_2024', handle: 'mia_2024' })
  })
})
