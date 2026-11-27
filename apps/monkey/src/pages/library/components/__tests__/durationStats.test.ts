import type { LibraryEntry } from '@/utils/mediaIndex'
import type { CustomLibrarySection } from '@/utils/userSettings'
import { describe, expect, it } from 'vitest'
import { buildLibraryDurationStats, resolveLibraryPersona } from '../durationStats'

const HOUR = 3600

function makeEntry(overrides: {
  kind?: LibraryEntry['kind']
  sectionId?: string
  maxDuration?: number
  fileDurations?: number[]
}): LibraryEntry {
  const files = (overrides.fileDurations ?? []).map(duration => ({ duration }))
  return {
    kind: overrides.kind ?? 'jav',
    sectionId: overrides.sectionId,
    maxDuration: overrides.maxDuration ?? 0,
    files,
    meta: null,
  } as unknown as LibraryEntry
}

describe('resolveLibraryPersona', () => {
  it('returns clean title when library is empty or has no duration', () => {
    expect(resolveLibraryPersona({
      totalCount: 0,
      totalSeconds: 0,
      javSeconds: 0,
      cinemaSeconds: 0,
      otherSeconds: 0,
    }).title).toBe('硬盘还很清白')

    expect(resolveLibraryPersona({
      totalCount: 5,
      totalSeconds: 0,
      javSeconds: 0,
      cinemaSeconds: 0,
      otherSeconds: 0,
    }).title).toBe('硬盘还很清白')
  })

  it('matches entry-level and giant-library tiers', () => {
    expect(resolveLibraryPersona({
      totalCount: 4,
      totalSeconds: 8 * HOUR,
      javSeconds: 8 * HOUR,
      cinemaSeconds: 0,
      otherSeconds: 0,
    }).title).toBe('刚领入门券')

    const giant = resolveLibraryPersona({
      totalCount: 1500,
      totalSeconds: 3200 * HOUR,
      javSeconds: 3000 * HOUR,
      cinemaSeconds: 200 * HOUR,
      otherSeconds: 0,
    })
    expect(giant.title).toBe('赛博亚历山大图书馆长')
    expect(giant.tagline).toContain('133 天')
  })

  it('matches dual-master, deep AV, and cinema curator tiers', () => {
    expect(resolveLibraryPersona({
      totalCount: 300,
      totalSeconds: 500 * HOUR,
      javSeconds: 240 * HOUR,
      cinemaSeconds: 220 * HOUR,
      otherSeconds: 40 * HOUR,
    }).title).toBe('雅俗共赏·双料宗师')

    expect(resolveLibraryPersona({
      totalCount: 900,
      totalSeconds: 1200 * HOUR,
      javSeconds: 1050 * HOUR,
      cinemaSeconds: 100 * HOUR,
      otherSeconds: 50 * HOUR,
    }).title).toBe('深夜人类学研究员')

    expect(resolveLibraryPersona({
      totalCount: 400,
      totalSeconds: 700 * HOUR,
      javSeconds: 100 * HOUR,
      cinemaSeconds: 550 * HOUR,
      otherSeconds: 50 * HOUR,
    }).title).toBe('私人放映厅主理人')
  })

  it('matches ratio-based and balanced fallback tiers', () => {
    expect(resolveLibraryPersona({
      totalCount: 80,
      totalSeconds: 150 * HOUR,
      javSeconds: 130 * HOUR,
      cinemaSeconds: 10 * HOUR,
      otherSeconds: 10 * HOUR,
    }).title).toBe('营养快线 VIP 股东')

    expect(resolveLibraryPersona({
      totalCount: 30,
      totalSeconds: 60 * HOUR,
      javSeconds: 42 * HOUR,
      cinemaSeconds: 10 * HOUR,
      otherSeconds: 8 * HOUR,
    }).title).toBe('老师们的忠实课代表')

    expect(resolveLibraryPersona({
      totalCount: 40,
      totalSeconds: 80 * HOUR,
      javSeconds: 10 * HOUR,
      cinemaSeconds: 60 * HOUR,
      otherSeconds: 10 * HOUR,
    }).title).toBe('正经影迷（大概吧）')

    expect(resolveLibraryPersona({
      totalCount: 40,
      totalSeconds: 80 * HOUR,
      javSeconds: 15 * HOUR,
      cinemaSeconds: 15 * HOUR,
      otherSeconds: 50 * HOUR,
    }).title).toBe('仓鼠系合集收藏家')

    expect(resolveLibraryPersona({
      totalCount: 40,
      totalSeconds: 80 * HOUR,
      javSeconds: 30 * HOUR,
      cinemaSeconds: 30 * HOUR,
      otherSeconds: 20 * HOUR,
    }).title).toBe('端水大师')

    expect(resolveLibraryPersona({
      totalCount: 120,
      totalSeconds: 260 * HOUR,
      javSeconds: 150 * HOUR,
      cinemaSeconds: 10 * HOUR,
      otherSeconds: 100 * HOUR,
    }).title).toBe('熬夜冠军预备役')

    expect(resolveLibraryPersona({
      totalCount: 15,
      totalSeconds: 25 * HOUR,
      javSeconds: 10 * HOUR,
      cinemaSeconds: 10 * HOUR,
      otherSeconds: 5 * HOUR,
    }).title).toBe('云端囤片新人')
  })
})

describe('buildLibraryDurationStats', () => {
  it('routes custom sections by scrapeMode into persona calculation while keeping category buckets', () => {
    const sections = [
      { id: 'sec-jav', name: '无码专区', scrapeMode: 'jav' },
      { id: 'sec-movie', name: '4K 电影', scrapeMode: 'cinema' },
    ] as unknown as CustomLibrarySection[]

    const stats = buildLibraryDurationStats([
      makeEntry({ kind: 'jav', sectionId: 'sec-jav', maxDuration: 150 * HOUR }),
      makeEntry({ kind: 'movie', sectionId: 'sec-movie', maxDuration: 10 * HOUR }),
    ], sections)

    expect(stats.categories.map(c => c.label)).toEqual(['无码专区', '4K 电影'])
    expect(stats.persona.title).toBe('营养快线 VIP 股东')
  })
})
