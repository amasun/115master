import { describe, expect, it } from 'vitest'
import { parseCinemaTitle } from '../cinemaTitleParser'

describe('cinemaTitleParser', () => {
  it('解析中文电影名、年份与画质噪点标记', () => {
    expect(parseCinemaTitle('[电影天堂www.dytt89.com]流浪地球2.2023.2160p.WEB-DL.H265.国语中字.mp4')).toEqual({
      title: '流浪地球2',
      year: 2023,
      mediaType: 'movie',
      normalizedKey: '流浪地球2',
    })
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
})
