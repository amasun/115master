import { describe, expect, it } from 'vitest'
import { parseMediaIdentity } from '@/utils/mediaIdentity'

describe('mediaIdentity', () => {
  it('fC2-PPV 番号保持最高优先级', () => {
    expect(parseMediaIdentity('FC2-PPV-4818259.mp4')).toEqual({
      platform: 'fc2',
      avNumber: 'FC2-PPV-4818259',
    })
    expect(parseMediaIdentity('[FC2-PPV-123456] @test_creator.mp4')).toEqual({
      platform: 'fc2',
      avNumber: 'FC2-PPV-123456',
    })
  })

  it('识别 MyFans 文件并提取创作者名与账号', () => {
    expect(parseMediaIdentity('www.98T.la@Myfansみなと(minato___26)【正片露脸】.mp4')).toEqual({
      platform: 'myfans',
      avNumber: null,
      creator: { name: 'みなと', handle: 'minato___26' },
    })

    expect(parseMediaIdentity('ティアくん(tiakun_404)曾担任女性杂志专属模特。^WM10.mp4')).toEqual({
      platform: 'myfans',
      avNumber: null,
      creator: { name: 'ティアくん', handle: 'tiakun_404' },
    })

    expect(parseMediaIdentity('(banbi_555) 狂操爆乳骚奶子.mp4')).toEqual({
      platform: 'myfans',
      avNumber: null,
      creator: { handle: 'banbi_555' },
    })
  })

  it('识别 OnlyFans 文件并隔离假番号，同时不误伤带站点前缀的 JAV 番号', () => {
    expect(parseMediaIdentity('OnlyFans - @luna_2024 - bedroom.mp4')).toEqual({
      platform: 'onlyfans',
      avNumber: null,
      creator: { handle: 'luna_2024' },
    })

    expect(parseMediaIdentity('[OF] mia_102.mp4')).toEqual({
      platform: 'onlyfans',
      avNumber: null,
      creator: { name: 'mia_102', handle: 'mia_102' },
    })

    expect(parseMediaIdentity('OF-sora_999.mp4')).toEqual({
      platform: 'onlyfans',
      avNumber: null,
      creator: { name: 'sora_999', handle: 'sora_999' },
    })

    expect(parseMediaIdentity('@hana_01 daily vlog.mp4')).toEqual({
      platform: 'onlyfans',
      avNumber: null,
      creator: { handle: 'hana_01' },
    })

    // 带站点域名前缀的标准番号不能被 @ 误判为 OnlyFans
    expect(parseMediaIdentity('[activehlj.com]@SONE-263_[4K].mp4')).toEqual({
      platform: 'jav',
      avNumber: 'SONE-263',
    })
    expect(parseMediaIdentity('www.98T.la@SSIS-001.mp4')).toEqual({
      platform: 'jav',
      avNumber: 'SSIS-001',
    })
  })

  it('结合父目录上下文识别无品牌文件并阻断假番号，但不映射泛化 fans 目录', () => {
    expect(
      parseMediaIdentity('abc_123.mp4', {
        name: 'luna_2024',
        fullPath: '根目录 / OnlyFans / luna_2024',
      }),
    ).toEqual({
      platform: 'onlyfans',
      avNumber: null,
      creator: { name: 'luna_2024', handle: 'luna_2024' },
    })

    expect(
      parseMediaIdentity('20240501.mp4', {
        name: 'ティアくん(tiakun_404)',
        fullPath: '根目录 / MyFans / ティアくん(tiakun_404)',
      }),
    ).toEqual({
      platform: 'myfans',
      avNumber: null,
      creator: { name: 'ティアくん', handle: 'tiakun_404' },
    })

    // 泛化 fans 目录不覆盖标准番号识别
    expect(
      parseMediaIdentity('SSIS-001.mp4', {
        name: 'fans',
        fullPath: '根目录 / fans',
      }),
    ).toEqual({
      platform: 'jav',
      avNumber: 'SSIS-001',
    })
  })
})
