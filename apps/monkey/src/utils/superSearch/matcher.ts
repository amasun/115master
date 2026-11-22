import type { IndexedVideo, SuperSearchMatchReason, SuperSearchResult } from './types'
import type { JavInfo } from '@/utils/jav/jav'
import { getAvNumber } from '@/utils/getNumber'
import { normalizeAvNumber } from '@/utils/jav/jav'

/** 规范化检索关键词 */
function normalizeQuery(text: string): string {
  return text.normalize('NFKC').trim().toLowerCase()
}

/**
 * 本地多通道检索（Phase 1）
 * - 通道 1：番号精确 / 前缀匹配
 * - 通道 2：本地 javCache 元数据反查（演员、分类、导演、标题、年份）
 * - 通道 3：网盘文件名多词模糊匹配
 */
export function searchIndexedVideos(
  rawQuery: string,
  videos: IndexedVideo[],
  javMap: Map<string, JavInfo>,
): SuperSearchResult[] {
  const query = normalizeQuery(rawQuery)
  if (!query)
    return []

  const tokens = query.split(/\s+/).filter(Boolean)
  const extractedAv = getAvNumber(rawQuery)
  const normalizedQueryAv = normalizeAvNumber(extractedAv ?? rawQuery)
  const results: SuperSearchResult[] = []

  for (const video of videos) {
    const reasons: SuperSearchMatchReason[] = []
    let score = 0
    const videoAvKey = video.avNumber ? normalizeAvNumber(video.avNumber) : ''
    const javInfo = videoAvKey
      ? (javMap.get(videoAvKey) ?? (video.avNumber ? javMap.get(video.avNumber) : undefined) ?? null)
      : null

    // 通道 1：番号匹配
    if (video.avNumber && videoAvKey && normalizedQueryAv.length >= 2) {
      if (videoAvKey === normalizedQueryAv) {
        score += 100
        reasons.push({ kind: 'avNumber', label: `番号 ${video.avNumber}` })
      }
      else if (videoAvKey.includes(normalizedQueryAv)) {
        score += 70
        reasons.push({ kind: 'avNumber', label: `番号 ${video.avNumber}` })
      }
    }

    // 通道 2：本地 javCache 元数据反查
    if (javInfo) {
      const matchedActor = javInfo.actors?.find(actor =>
        normalizeQuery(actor.name).includes(query),
      )
      if (matchedActor) {
        score += 90
        reasons.push({ kind: 'actor', label: `演员 · ${matchedActor.name}` })
      }

      const matchedGenre = javInfo.category?.find(cat =>
        normalizeQuery(cat.name).includes(query),
      )
      if (matchedGenre) {
        score += 65
        reasons.push({ kind: 'genre', label: `分类 · ${matchedGenre.name}` })
      }

      const matchedDirector = javInfo.director?.find(dir =>
        normalizeQuery(dir.name).includes(query),
      )
      if (matchedDirector) {
        score += 60
        reasons.push({ kind: 'director', label: `导演 · ${matchedDirector.name}` })
      }

      if (javInfo.title && normalizeQuery(javInfo.title).includes(query)) {
        score += 55
        reasons.push({ kind: 'title', label: '作品标题' })
      }

      if (javInfo.date && /^\d{4}$/.test(query)) {
        const year = String(new Date(javInfo.date).getFullYear())
        if (year === query) {
          score += 50
          reasons.push({ kind: 'year', label: `年份 · ${year}` })
        }
      }
    }

    /** 通道 3：文件名多词 AND 匹配 */
    const lowerName = normalizeQuery(video.name)
    if (tokens.every(token => lowerName.includes(token))) {
      score += 40
      if (!reasons.some(r => r.kind === 'avNumber')) {
        reasons.push({ kind: 'filename', label: '文件名' })
      }
    }

    if (score > 0) {
      results.push({
        video,
        javInfo,
        reasons,
        score,
      })
    }
  }

  return results.sort((a, b) => {
    if (b.score !== a.score)
      return b.score - a.score
    return b.video.mtime - a.video.mtime
  })
}
