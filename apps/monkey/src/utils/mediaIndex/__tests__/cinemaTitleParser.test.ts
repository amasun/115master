import { describe, expect, it } from 'vitest'
import {
  buildCinemaSearchQueries,
  isEpisodicSeriesFilename,
  needsCinemaFolderFallback,
  parseCinemaTitle,
} from '../cinemaTitleParser'

describe('cinemaTitleParser', () => {
  it('解析中文电影名、年份与画质噪点标记', () => {
    expect(parseCinemaTitle('[电影天堂www.dytt89.com]流浪地球2.2023.2160p.WEB-DL.H265.国语中字.mp4')).toEqual({
      title: '流浪地球2',
      year: 2023,
      mediaType: 'movie',
      normalizedKey: '流浪地球2',
    })
  })

  it('清洗复杂网盘压制名与字幕组前缀（杜比视界 / 60fps / DDP5.1 / 压制组）', () => {
    expect(parseCinemaTitle('[人人影视]【4K杜比】流浪地球2.杜比视界.60fps.DDP5.1-HHWEB.mp4')).toEqual({
      title: '流浪地球2',
      mediaType: 'movie',
      normalizedKey: '流浪地球2',
    })

    expect(parseCinemaTitle('沙丘2-Dune Part Two.2024.IMAX.2160p.WEB-DL.Atmos.H265-FRDS.mkv')).toEqual({
      title: '沙丘2',
      year: 2024,
      mediaType: 'movie',
      normalizedKey: '沙丘2',
    })
  })

  it('判断仅含集数或纯数字的文件名是否需要父目录回退', () => {
    expect(needsCinemaFolderFallback('S01E01.1080p.WEB-DL.mkv')).toBe(true)
    expect(needsCinemaFolderFallback('03.mp4')).toBe(true)
    expect(needsCinemaFolderFallback('第02集.4K.HDR.mp4')).toBe(true)
    expect(needsCinemaFolderFallback('流浪地球2.2023.mp4')).toBe(false)
  })

  it('生成去重后的搜索候选词队列（中英混合与副标题降级）', () => {
    expect(buildCinemaSearchQueries({ title: '流浪地球2' })).toEqual(['流浪地球2'])
    expect(buildCinemaSearchQueries({ title: '阿凡达2：水之道 Avatar The Way of Water' })).toEqual([
      '阿凡达2：水之道 Avatar The Way of Water',
      '阿凡达2：水之道',
      'Avatar The Way of Water',
      '阿凡达2',
    ])
  })

  it('解析英文剧集并按同一 normalizedKey 聚合多集', () => {
    const ep1 = parseCinemaTitle('Breaking.Bad.2008.S01E01.1080p.BluRay.x265.mkv')
    const ep2 = parseCinemaTitle('Breaking.Bad.2008.S01E02.1080p.BluRay.x265.mkv')

    expect(ep1).toEqual({
      title: 'Breaking Bad',
      year: 2008,
      mediaType: 'tv',
      season: 1,
      episode: 1,
      normalizedKey: 'breakingbad',
    })
    expect(ep2.mediaType).toBe('tv')
    expect(ep2.episode).toBe(2)
    expect(ep2.normalizedKey).toBe(ep1.normalizedKey)
  })

  it('解析中文剧集第 N 集格式', () => {
    expect(parseCinemaTitle('三体.第01集.4K.HDR.mp4')).toEqual({
      title: '三体',
      mediaType: 'tv',
      episode: 1,
      normalizedKey: '三体',
    })
  })

  it('当文件名仅含集数或纯数字时自动回退解析父目录名', () => {
    expect(parseCinemaTitle('S01E02.1080p.mkv', '绝命毒师.Breaking.Bad.2008')).toEqual({
      title: '绝命毒师',
      year: 2008,
      mediaType: 'tv',
      season: 1,
      episode: 2,
      normalizedKey: '绝命毒师',
    })

    expect(parseCinemaTitle('03.mp4', '漫长的季节 (2023)')).toEqual({
      title: '漫长的季节',
      year: 2023,
      mediaType: 'tv',
      episode: 3,
      normalizedKey: '漫长的季节',
    })
  })

  it('解析中文季数（第一季/第二季 + EP02）并跨年份/季数统一剧集 normalizedKey', () => {
    const s1e5 = parseCinemaTitle('绝命毒师.第一季.2008.EP05.BD1080P.X264.AAC.English.CHS-ENG.BDYS.mp4')
    const s2e2 = parseCinemaTitle('绝命毒师.第二季.2009.EP02.BD1080P.X264.AAC.English.CHS-ENG.BDYS.mp4')
    const shameless = parseCinemaTitle('无耻家庭.shameless.us.s04e01.中英字幕.hr-hdtv.ac3.1024x576.x264.mkv')

    expect(s1e5).toEqual({
      title: '绝命毒师',
      year: 2008,
      mediaType: 'tv',
      season: 1,
      episode: 5,
      normalizedKey: '绝命毒师',
    })
    expect(s2e2).toEqual({
      title: '绝命毒师',
      year: 2009,
      mediaType: 'tv',
      season: 2,
      episode: 2,
      normalizedKey: '绝命毒师',
    })
    expect(shameless).toEqual({
      title: '无耻家庭',
      mediaType: 'tv',
      season: 4,
      episode: 1,
      normalizedKey: '无耻家庭',
    })
    expect(isEpisodicSeriesFilename('绝命毒师.第二季.2009.EP02.BD1080P.mp4')).toBe(true)
    expect(isEpisodicSeriesFilename('无耻家庭.shameless.us.s04e01.mkv')).toBe(true)
    expect(isEpisodicSeriesFilename('SSIS-001.mp4')).toBe(false)
  })
})
