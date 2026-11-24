import type { ActorReverseMatch, IndexedVideo, SuperSearchMatchReason, SuperSearchResult } from './types'
import type { FolderPathInfo } from '@/utils/driveFolderPath'
import type { JavInfo } from '@/utils/jav/jav'
import type { MediaIdentity, MediaPlatform } from '@/utils/mediaIdentity'
import { normalizeActressName } from '@/utils/actressNameMatcher'
import { getAvNumber } from '@/utils/getNumber'
import { isFd2PpvAvNumber } from '@/utils/jav/fd2Ppv'
import { normalizeAvNumber } from '@/utils/jav/jav'
import { parseMediaIdentity } from '@/utils/mediaIdentity'

export type PlatformFilter = 'all' | MediaPlatform

export interface SearchIndexedVideosOptions {
  /** 通道 A：在线演员作品反查匹配集合 */
  actorReverse?: ActorReverseMatch | null
  /** 已缓存的网盘目录路径映射（cid -> FolderPathInfo） */
  folderMap?: ReadonlyMap<string, FolderPathInfo>
  /** 平台筛选（默认 'all'） */
  platformFilter?: PlatformFilter
}

interface ParsedSearchQuery {
  effectiveQuery: string
  prefixPlatform: MediaPlatform | null
  dirOnly: boolean
  handleQuery: string | null
}

const PLATFORM_LABELS: Record<MediaPlatform, string> = {
  jav: '正规 AV',
  fc2: 'FC2',
  onlyfans: 'OnlyFans',
  myfans: 'MyFans',
  unknown: '其他',
}

const PLATFORM_KEYWORDS: Record<Exclude<MediaPlatform, 'jav' | 'unknown'>, string[]> = {
  onlyfans: ['onlyfans', 'only fans'],
  myfans: ['myfans', 'マイファンズ', 'マイファンス'],
  fc2: ['fc2', 'fc2ppv', 'fc2-ppv'],
}

/** 规范化检索关键词 */
function normalizeQuery(text: string): string {
  return text.normalize('NFKC').trim().toLowerCase()
}

/** 解析轻量查询前缀（of: / mf: / fc2: / jav: / dir: / @handle） */
function parseSearchQuery(rawQuery: string): ParsedSearchQuery {
  const normalized = normalizeQuery(rawQuery)
  if (!normalized) {
    return {
      effectiveQuery: '',
      prefixPlatform: null,
      dirOnly: false,
      handleQuery: null,
    }
  }

  const prefixMatch = normalized.match(/^(of|onlyfans|mf|myfans|fc2|jav|av|dir|folder):(.*)$/i)
  if (prefixMatch) {
    const prefix = prefixMatch[1]!.toLowerCase()
    const rest = prefixMatch[2]!.trim()
    if (prefix === 'dir' || prefix === 'folder') {
      return {
        effectiveQuery: rest,
        prefixPlatform: null,
        dirOnly: true,
        handleQuery: null,
      }
    }
    const platformMap: Record<string, MediaPlatform> = {
      of: 'onlyfans',
      onlyfans: 'onlyfans',
      mf: 'myfans',
      myfans: 'myfans',
      fc2: 'fc2',
      jav: 'jav',
      av: 'jav',
    }
    const handleQuery = rest.startsWith('@') && rest.length > 1 ? rest.slice(1) : null
    return {
      effectiveQuery: handleQuery ?? rest,
      prefixPlatform: platformMap[prefix] ?? null,
      dirOnly: false,
      handleQuery,
    }
  }

  if (normalized.startsWith('@') && normalized.length > 1) {
    const handle = normalized.slice(1)
    return {
      effectiveQuery: handle,
      prefixPlatform: null,
      dirOnly: false,
      handleQuery: handle,
    }
  }

  return {
    effectiveQuery: normalized,
    prefixPlatform: null,
    dirOnly: false,
    handleQuery: null,
  }
}

/** 结合父目录缓存实时解析单条视频的平台、番号与创作者身份 */
export function resolveVideoIdentity(
  video: IndexedVideo,
  folder?: FolderPathInfo | null,
): MediaIdentity {
  if (!folder || folder.cid === '0') {
    const fallbackPlatform: MediaPlatform = video.platform
      ?? (video.avNumber ? (isFd2PpvAvNumber(video.avNumber) ? 'fc2' : 'jav') : 'unknown')
    return {
      platform: fallbackPlatform,
      avNumber: video.avNumber,
      ...(video.creator ? { creator: video.creator } : {}),
    }
  }

  if (video.platform === 'myfans' || video.platform === 'onlyfans') {
    if (video.creator) {
      return {
        platform: video.platform,
        avNumber: null,
        creator: video.creator,
      }
    }
    const folderIdentity = parseMediaIdentity(video.name, folder)
    return {
      platform: video.platform,
      avNumber: null,
      ...(folderIdentity.creator ? { creator: folderIdentity.creator } : {}),
    }
  }

  return parseMediaIdentity(video.name, folder)
}

function getFolderSearchPaths(folder?: FolderPathInfo | null): {
  folderName: string
  folderFullPath: string
} {
  if (!folder || folder.cid === '0')
    return { folderName: '', folderFullPath: '' }
  const folderName = normalizeQuery(folder.name)
  const strippedFullPath = folder.fullPath.replace(/^根目录\s*\/\s*/, '')
  return {
    folderName,
    folderFullPath: normalizeQuery(strippedFullPath),
  }
}

function formatCreatorLabel(identity: MediaIdentity): string {
  const creator = identity.creator
  if (!creator)
    return ''
  if (creator.name && creator.handle && creator.name.toLowerCase() !== creator.handle.toLowerCase())
    return `${creator.name} (@${creator.handle})`
  if (creator.name)
    return creator.name
  return creator.handle ? `@${creator.handle}` : ''
}

function matchPlatformByQuery(
  query: string,
  tokens: string[],
  platform: MediaPlatform,
): boolean {
  if (platform !== 'onlyfans' && platform !== 'myfans' && platform !== 'fc2')
    return false
  const keywords = PLATFORM_KEYWORDS[platform]
  return keywords.some(kw => query === kw || tokens.includes(kw))
}

/**
 * 本地与演员反查多路检索
 * - 通道 A：在线演员反查作品番号集合求交集
 * - 通道 1：番号精确 / 前缀匹配（受跨平台冲突抑制保护）
 * - 通道 2：本地 javCache 元数据反查（演员、分类、导演、标题、年份）
 * - 通道 3：创作者账号 / 名称匹配（MyFans / OnlyFans）
 * - 通道 4：父目录名称与祖先路径匹配
 * - 通道 5：网盘标签、平台关键词、跨字段联合与文件名多词模糊匹配
 */
export function searchIndexedVideos(
  rawQuery: string,
  videos: IndexedVideo[],
  javMap: Map<string, JavInfo>,
  options?: SearchIndexedVideosOptions,
): SuperSearchResult[] {
  const parsed = parseSearchQuery(rawQuery)
  const optionPlatform = options?.platformFilter && options.platformFilter !== 'all'
    ? options.platformFilter
    : null
  const activePlatform = parsed.prefixPlatform ?? optionPlatform

  if (!parsed.effectiveQuery && !activePlatform)
    return []

  const query = parsed.effectiveQuery
  const folderMap = options?.folderMap
  const actorQuery = query ? normalizeActressName(query) : ''
  const actorReverse = options?.actorReverse ?? null
  const actorAliasKeys = new Set(
    (actorReverse?.aliases ?? [])
      .map(alias => normalizeActressName(alias))
      .filter(Boolean),
  )
  const tokens = query ? query.split(/\s+/).filter(Boolean) : []
  const extractedAv = query && !parsed.handleQuery && !parsed.dirOnly ? getAvNumber(query) : null
  const normalizedQueryAv = query ? normalizeAvNumber(extractedAv ?? query) : ''

  /** 预解析身份并收集已知创作者句柄，用于抑制纯创作者搜索误命中 AV 番号子串 */
  const resolvedEntries = videos.map((video) => {
    const folder = video.cid && video.cid !== '0' ? folderMap?.get(video.cid) : undefined
    const identity = resolveVideoIdentity(video, folder)
    return { video, folder, identity }
  })

  const knownHandles = new Set<string>()
  for (const entry of resolvedEntries) {
    const handle = entry.identity.creator?.handle?.toLowerCase()
    if (handle)
      knownHandles.add(handle)
  }

  const cleanHandleQuery = (parsed.handleQuery ?? query).replace(/^@/, '')
  const isPlatformKeywordQuery = /^(?:only\s*fans|myfans|マイファン[ズス])$/i.test(query)
  const suppressFuzzyAv = Boolean(
    parsed.handleQuery
    || parsed.prefixPlatform === 'onlyfans'
    || parsed.prefixPlatform === 'myfans'
    || parsed.dirOnly
    || isPlatformKeywordQuery
    || (cleanHandleQuery && knownHandles.has(cleanHandleQuery)),
  )

  const results: SuperSearchResult[] = []

  for (const { video, folder, identity } of resolvedEntries) {
    if (activePlatform && identity.platform !== activePlatform)
      continue

    // 空关键词浏览筛选平台
    if (!query) {
      results.push({
        video,
        javInfo: null,
        reasons: [{ kind: 'platform', label: `平台 · ${PLATFORM_LABELS[identity.platform]}` }],
        score: 60,
        platform: identity.platform,
        creator: identity.creator,
        avNumber: identity.avNumber,
      })
      continue
    }

    const reasons: SuperSearchMatchReason[] = []
    let score = 0
    const videoAvKey = identity.avNumber ? normalizeAvNumber(identity.avNumber) : ''
    const javInfo = videoAvKey
      ? (javMap.get(videoAvKey) ?? (identity.avNumber ? javMap.get(identity.avNumber) : undefined) ?? null)
      : null

    // 通道 A：在线演员反查作品集合求交集
    if (!parsed.dirOnly && actorReverse && videoAvKey && actorReverse.avNumbers.has(videoAvKey)) {
      score += 95
      reasons.push({ kind: 'actorReverse', label: `演员反查 · ${actorReverse.actorName}` })
    }

    // 通道 1：番号匹配（创作者/平台/目录查询时抑制模糊子串误命中）
    if (!parsed.dirOnly && identity.avNumber && videoAvKey && normalizedQueryAv.length >= 2) {
      if (videoAvKey === normalizedQueryAv) {
        score += 100
        reasons.push({ kind: 'avNumber', label: `番号 ${identity.avNumber}` })
      }
      else if (!suppressFuzzyAv && videoAvKey.includes(normalizedQueryAv)) {
        score += 70
        reasons.push({ kind: 'avNumber', label: `番号 ${identity.avNumber}` })
      }
    }

    // 通道 3：创作者匹配（MyFans / OnlyFans）
    if (!parsed.dirOnly && identity.creator) {
      const handle = identity.creator.handle?.toLowerCase() ?? ''
      const name = identity.creator.name ? normalizeQuery(identity.creator.name) : ''
      const normalizedCreatorName = identity.creator.name ? normalizeActressName(identity.creator.name) : ''
      const exactMatch = (handle && cleanHandleQuery === handle)
        || (name && query === name)
        || (normalizedCreatorName && actorQuery && normalizedCreatorName === actorQuery)
      const partialMatch = (handle && cleanHandleQuery.length >= 2 && handle.includes(cleanHandleQuery))
        || (name && query.length >= 2 && name.includes(query))
        || (normalizedCreatorName && actorQuery.length >= 2 && normalizedCreatorName.includes(actorQuery))

      if (exactMatch) {
        score += 95
        reasons.push({ kind: 'creator', label: `创作者 · ${formatCreatorLabel(identity)}` })
      }
      else if (partialMatch) {
        score += 85
        reasons.push({ kind: 'creator', label: `创作者 · ${formatCreatorLabel(identity)}` })
      }
    }

    /** 115 网盘文字标签匹配 */
    if (!parsed.dirOnly) {
      const matchedDriveLabel = video.labels?.find(label =>
        normalizeQuery(label.name).includes(query),
      )
      if (matchedDriveLabel) {
        score += 75
        reasons.push({ kind: 'driveLabel', label: `网盘标签 · ${matchedDriveLabel.name}` })
      }
    }

    /** 通道 2：本地 javCache 元数据反查 */
    if (!parsed.dirOnly && javInfo) {
      const matchedActor = javInfo.actors?.find((actor) => {
        const normalizedActor = normalizeActressName(actor.name)
        if (!normalizedActor)
          return false
        if (actorQuery && normalizedActor.includes(actorQuery))
          return true
        return actorAliasKeys.has(normalizedActor)
      })
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

    // 平台关键词通道
    if (!parsed.dirOnly && matchPlatformByQuery(query, tokens, identity.platform)) {
      score += 60
      reasons.push({ kind: 'platform', label: `平台 · ${PLATFORM_LABELS[identity.platform]}` })
    }

    /** 通道 4：父目录名称与祖先路径匹配 */
    const { folderName, folderFullPath } = getFolderSearchPaths(folder)
    let folderMatched = false
    if (folder && folderFullPath) {
      if (folderName && tokens.length > 0 && tokens.every(token => folderName.includes(token))) {
        score += 65
        folderMatched = true
        reasons.push({ kind: 'folderPath', label: `目录 · ${folder.displayLabel}` })
      }
      else if (tokens.length > 0 && tokens.every(token => folderFullPath.includes(token))) {
        score += 50
        folderMatched = true
        reasons.push({ kind: 'folderPath', label: `目录 · ${folder.displayLabel}` })
      }
    }

    /** 通道 5：文件名多词 AND 匹配 & 跨字段联合匹配（显式 @handle 查询时不误匹配 JAV/FC2 文件名） */
    const allowFilenameFallback = !parsed.dirOnly
      && !(parsed.handleQuery && (identity.platform === 'jav' || identity.platform === 'fc2'))
    if (allowFilenameFallback) {
      const lowerName = normalizeQuery(video.name)
      const filenameMatched = tokens.length > 0 && tokens.every(token => lowerName.includes(token))
      if (filenameMatched) {
        score += 40
        if (!reasons.some(r => r.kind === 'avNumber'))
          reasons.push({ kind: 'filename', label: '文件名' })
      }
      else if (tokens.length >= 2 && !folderMatched) {
        const platformWords = identity.platform !== 'unknown'
          ? (identity.platform === 'jav' ? 'jav av' : PLATFORM_KEYWORDS[identity.platform].join(' '))
          : ''
        const creatorWords = [identity.creator?.name ?? '', identity.creator?.handle ?? ''].join(' ').toLowerCase()
        const combined = `${lowerName} ${folderFullPath} ${creatorWords} ${platformWords}`
        if (tokens.every(token => combined.includes(token))) {
          score += 45
          reasons.push({
            kind: 'folderPath',
            label: folder && folder.cid !== '0' ? `目录联合 · ${folder.displayLabel}` : '组合匹配',
          })
        }
      }
    }

    if (score > 0) {
      results.push({
        video,
        javInfo,
        reasons,
        score,
        platform: identity.platform,
        creator: identity.creator,
        avNumber: identity.avNumber,
      })
    }
  }

  return results.sort((a, b) => {
    if (b.score !== a.score)
      return b.score - a.score
    return b.video.mtime - a.video.mtime
  })
}
