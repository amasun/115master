import type { IndexedVideo, LibraryEntry, LibraryFileItem, UncensoredKind, UnifiedMediaMeta } from './types'
import type { MarkerDoc } from '@/utils/markers/types'
import { normalizeAvNumber } from '@/utils/jav/jav'
import { isEpisodicSeriesFilename, parseCinemaTitle } from './cinemaTitleParser'

const LTX_FILENAME_RE = /(?:^|[^A-Z0-9])LTX(?:V?\d+(?:\.\d+)?)?(?=[^A-Z0-9]|$)/i
const LADA_FILENAME_RE = /(?:^|[^A-Z0-9])LADA(?:V?\d+(?:\.\d+)?)?(?=[^A-Z0-9]|$)/i
const RESTORED_FILENAME_RE = /(?:^|[^A-Z0-9])RESTORED(?=[^A-Z0-9]|$)/i
const NATIVE_UNCENSORED_CODE_RE = /(?:^|[^A-Z0-9])(?:FC2[-_\s]?PPV[-_\s]?\d+|HEYZO[-_\s]?\d{4}|CARIB(?:BEAN(?:COM)?)?[-_\s]?\d{6}[-_]\d{3}|1PON(?:DO)?[-_\s]?\d{6}[-_]\d{3}|10MUSUME[-_\s]?\d{6}[-_]\d{2,3}|PACO(?:PACOMAMA)?[-_\s]?\d{6}[-_]\d{3}|(?:LAFBD|CWPBD|MKBD|SMBD|KIBD|MCBD|S2MBD|SKYHD|CWP|MKD|SMD|LAF|SKY|DRC|RHJ|GACHI|XXX-AV|CWDV|HEYDOUGA|H0930|H4610|C0930|KIN8|MURAMURA|MESUBUTA|NYOSHIN)[-_\s]?\d+|[NK]\d{4}|\d{6}[-_]\d{3})(?=[^A-Z0-9]|$)/i
const NATIVE_TEXT_RE = /原生(?:无码|無碼)|步兵/
const DEMOSAIC_TEXT_RE = /去码|去碼|破坏版|破壞版|demosaic|mosaic[-_\s]?removed|reducing[-_\s]?mosaic/i
const CRACKED_TEXT_RE = /破解|流出|leaked/i
const UNCENSORED_SUFFIX_RE = /[_-]UC?(?=\.[^.]+$|[-_](?:C|CH|CHS|CHT|SUB|4K|1080P|720P|FHD|HD|UHD)(?:[^A-Z0-9]|$))/i
const UNCENSORED_TEXT_RE = /无码|無碼|无修正|無修正|uncensored/i

const UNCENSORED_PRIORITY: Record<UncensoredKind, number> = {
  ltx: 4,
  lada: 3,
  native: 2,
  cracked: 1,
}

export interface UncensoredBadgeMeta {
  shortLabel: string
  fullLabel: string
  title: string
  badgeClass: string
}

const UNCENSORED_BADGE_MAP: Record<UncensoredKind, UncensoredBadgeMeta> = {
  ltx: {
    shortLabel: 'LTX',
    fullLabel: 'LTX',
    title: 'LTX 高级去码版',
    badgeClass: 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white ring-1 ring-white/25',
  },
  lada: {
    shortLabel: 'LADA',
    fullLabel: 'LADA',
    title: 'LADA 去码版',
    badgeClass: 'bg-gradient-to-r from-cyan-500 to-indigo-500 text-white ring-1 ring-white/20',
  },
  native: {
    shortLabel: '无码',
    fullLabel: '无码',
    title: '原生无码',
    badgeClass: 'bg-emerald-500/90 text-white',
  },
  cracked: {
    shortLabel: '破解',
    fullLabel: '破解',
    title: '破解 / 去码 / 无码流出',
    badgeClass: 'bg-amber-500/90 text-black',
  },
}

/** 判断文件名是否包含 LTX 高级去码标记 */
export function isLtxFileName(fileName?: string | null): boolean {
  if (!fileName)
    return false
  return LTX_FILENAME_RE.test(fileName)
}

/** 判断文件名是否包含 LADA 去码标记（含 restored 标记） */
export function isLadaFileName(
  fileName?: string | null,
  options?: { allowRestored?: boolean },
): boolean {
  if (!fileName)
    return false
  return LADA_FILENAME_RE.test(fileName)
    || (options?.allowRestored !== false && RESTORED_FILENAME_RE.test(fileName))
}

function pickHigherUncensoredKind(
  current: UncensoredKind | undefined,
  candidate: UncensoredKind | undefined,
): UncensoredKind | undefined {
  if (!candidate)
    return current
  if (!current)
    return candidate
  return UNCENSORED_PRIORITY[candidate] > UNCENSORED_PRIORITY[current] ? candidate : current
}

function detectTextUncensoredKind(
  text: string | null | undefined,
  options: { isNativeFromStudio: boolean, allowDirectNative?: boolean },
): UncensoredKind | undefined {
  if (!text)
    return undefined
  if (LTX_FILENAME_RE.test(text))
    return 'ltx'
  if (LADA_FILENAME_RE.test(text))
    return 'lada'
  if (DEMOSAIC_TEXT_RE.test(text) || CRACKED_TEXT_RE.test(text))
    return 'cracked'
  if (NATIVE_TEXT_RE.test(text)) {
    if (options.isNativeFromStudio || options.allowDirectNative)
      return 'native'
    return 'cracked'
  }
  if (UNCENSORED_TEXT_RE.test(text))
    return options.isNativeFromStudio ? 'native' : 'cracked'
  return undefined
}

/** 识别单个文件的无码 / 破解 / 去码来源类型（先判定 AI 去码与原生无码厂商，再处理文件名关键词冲突） */
export function detectFileUncensoredKind(
  fileName?: string | null,
  options?: { externalId?: string, allowNativeCode?: boolean },
): UncensoredKind | undefined {
  const name = fileName?.trim() ?? ''
  const allowNativeCode = options?.allowNativeCode !== false
  if (name) {
    if (LTX_FILENAME_RE.test(name))
      return 'ltx'
    if (isLadaFileName(name, { allowRestored: allowNativeCode }))
      return 'lada'
  }

  const isNativeCode = allowNativeCode && (
    (Boolean(name) && (NATIVE_UNCENSORED_CODE_RE.test(name) || NATIVE_TEXT_RE.test(name)))
    || (options?.externalId ? NATIVE_UNCENSORED_CODE_RE.test(options.externalId) : false)
  )
  if (isNativeCode)
    return 'native'

  if (!name)
    return undefined

  if (
    DEMOSAIC_TEXT_RE.test(name)
    || CRACKED_TEXT_RE.test(name)
    || UNCENSORED_SUFFIX_RE.test(name)
    || UNCENSORED_TEXT_RE.test(name)
  ) {
    return 'cracked'
  }
  return undefined
}

/** 综合文件、网盘标签、题材与标题识别作品的无码 / 破解 / 去码来源类型 */
export function detectEntryUncensoredKind(params: {
  kind: LibraryEntry['kind']
  externalId?: string
  files: ReadonlyArray<{ name: string }>
  meta: UnifiedMediaMeta | null
  driveLabels: ReadonlyArray<{ name: string }>
}): UncensoredKind | undefined {
  const allowNativeCode = params.kind !== 'movie' && params.kind !== 'tv'
  const isNativeFromStudio = allowNativeCode && Boolean(
    (params.externalId && NATIVE_UNCENSORED_CODE_RE.test(params.externalId))
    || params.files.some(file => NATIVE_UNCENSORED_CODE_RE.test(file.name)),
  )
  let best: UncensoredKind | undefined

  for (const file of params.files) {
    best = pickHigherUncensoredKind(
      best,
      detectFileUncensoredKind(file.name, { externalId: params.externalId, allowNativeCode }),
    )
  }

  // 手动网盘标签首先保留为网盘标签本身；仅在含明确 LTX/LADA 或文件名无任何标识时作为兜底冲突判定
  for (const label of params.driveLabels) {
    if (LTX_FILENAME_RE.test(label.name)) {
      best = pickHigherUncensoredKind(best, 'ltx')
      continue
    }
    if (LADA_FILENAME_RE.test(label.name)) {
      best = pickHigherUncensoredKind(best, 'lada')
      continue
    }
    if (!best) {
      best = pickHigherUncensoredKind(
        best,
        detectTextUncensoredKind(label.name, { isNativeFromStudio }),
      )
    }
  }

  if (!best && params.meta) {
    for (const genre of params.meta.genres) {
      best = pickHigherUncensoredKind(
        best,
        detectTextUncensoredKind(genre, { isNativeFromStudio, allowDirectNative: !params.externalId }),
      )
    }
    best = pickHigherUncensoredKind(
      best,
      detectTextUncensoredKind(params.meta.title, { isNativeFromStudio, allowDirectNative: !params.externalId }),
    )
  }

  return best
}

/** 获取无码 / 去码角标展示信息 */
export function getUncensoredBadgeMeta(kind?: UncensoredKind): UncensoredBadgeMeta | null {
  return kind ? UNCENSORED_BADGE_MAP[kind] : null
}

export type DuplicateKind = 'sha1' | 'avNumber' | 'edition' | 'similar'

export interface DuplicateFileCandidate extends IndexedVideo {
  mediaKey: string
  keepScore: number
  keepReasons: string[]
  recommendedKeep: boolean
  markerCount: number
}

export interface DuplicateGroup {
  id: string
  kind: DuplicateKind
  title: string
  key: string
  mediaKey?: string
  files: DuplicateFileCandidate[]
  totalSize: number
  reclaimableSize: number
  suspectedMultiPart: boolean
}

const SIMILAR_MIN_SIZE_BYTES = 50 * 1024 * 1024
const SIMILAR_MIN_DURATION_SEC = 60
const BYTES_PER_GB = 1024 * 1024 * 1024

const BD_EDITION_PREFIX_MAP: Record<string, string> = {
  LAFBD: 'LAF',
  CWPBD: 'CWP',
  MKBD: 'MKD',
  SMBD: 'SMD',
  KIBD: 'KID',
  MCBD: 'MCD',
  S2MBD: 'S2M',
}

const BD_EDITION_ENTRIES = Object.entries(BD_EDITION_PREFIX_MAP)

/** 识别同作蓝光版与普通版映射键，仅限明确白名单系列 */
export function resolveEditionWorkKey(
  avNumber?: string | null,
): { workKey: string, isBluRay: boolean } | null {
  const normalized = normalizeAvNumber(avNumber)
  if (!normalized)
    return null

  for (const [bdPrefix, basePrefix] of BD_EDITION_ENTRIES) {
    if (normalized.startsWith(bdPrefix)) {
      const rest = normalized.slice(bdPrefix.length)
      if (/^S?\d+$/.test(rest))
        return { workKey: `${basePrefix}${rest}`, isBluRay: true }
    }
    if (normalized.startsWith(basePrefix)) {
      const rest = normalized.slice(basePrefix.length)
      if (/^S?\d+$/.test(rest))
        return { workKey: `${basePrefix}${rest}`, isBluRay: false }
    }
  }

  return null
}

function extractPartMarker(name: string): string | null {
  const sxeMatch = name.match(/(?<![a-z0-9])(s\d{1,2}e\d{1,3})(?![a-z0-9])/i)
  if (sxeMatch)
    return `ep:${sxeMatch[1].toLowerCase()}`

  const epMatch = name.match(/(?<![a-z0-9])(?:ep|e)[\s._-]*(\d{1,3})(?![a-z0-9])/i)
  if (epMatch)
    return `ep:${Number(epMatch[1])}`

  const zhEpMatch = name.match(/第\s*(\d{1,3})\s*[集话話期回]/)
  if (zhEpMatch)
    return `ep:${Number(zhEpMatch[1])}`

  const partMatch = name.match(/(cd|part|disc)[\s._-]*(\d+)/i)
  if (partMatch)
    return `part:${partMatch[1].toLowerCase()}${Number(partMatch[2])}`

  const letterMatch = name.match(/[-_\s]([A-D])(?=\.[^.]+$)/)
  if (letterMatch)
    return `letter:${letterMatch[1]}`

  const zhMatch = name.match(/(上集|下集)/)
  if (zhMatch)
    return `zh:${zhMatch[1]}`

  const stem = name.replace(/\.[^.]+$/, '')
  const parenMatch = stem.match(/\((\d+)\)\s*$/)
  if (parenMatch)
    return `paren:${Number(parenMatch[1])}`

  return null
}

/**
 * 检测一组文件名是否包含 >=2 个不同的分集/分段标记（如 cd1/cd2、上集/下集）
 */
export function isSuspectedMultiPartGroup(names: string[]): boolean {
  const markers = new Set(
    names
      .map(extractPartMarker)
      .filter((marker): marker is string => marker !== null),
  )
  return markers.size >= 2
}

/**
 * 判断一组视频文件是否拥有完全一致的非空 SHA1（内容完全相同，不属于分段视频）
 */
export function hasUniformSha1(files: ReadonlyArray<Pick<IndexedVideo, 'sha1'>>): boolean {
  if (files.length < 2)
    return false
  const first = files[0]?.sha1?.trim().toLowerCase()
  if (!first)
    return false
  return files.every(file => file.sha1?.trim().toLowerCase() === first)
}

/**
 * 为单个视频文件计算保留优先级评分与原因
 */
export function scoreFileForKeep(
  file: Pick<IndexedVideo, 'name' | 'size' | 'duration' | 'mtime' | 'starred' | 'labels'>,
  markerCount = 0,
): { score: number, reasons: string[] } {
  const reasons: string[] = []
  const parts: number[] = []

  if (file.starred) {
    parts.push(1000)
    reasons.push('已星标')
  }

  if (markerCount > 0) {
    parts.push(500 + Math.min(markerCount, 10) * 20)
    reasons.push(`有 ${markerCount} 个打点`)
  }

  if (file.labels && file.labels.length > 0) {
    parts.push(200)
    reasons.push('有网盘标签')
  }

  if (/-C(?=\.[^.]+$|$)|[-_\s[\](](?:中字|中文|CHS|CHT|SUB)/i.test(file.name)) {
    parts.push(150)
    reasons.push('含中文字幕标记')
  }

  if (isLtxFileName(file.name)) {
    parts.push(180)
    reasons.push('LTX 高级去码')
  }
  else if (isLadaFileName(file.name)) {
    parts.push(150)
    reasons.push('LADA 去码')
  }

  if (/(?:^|[^A-Z0-9])(?:LAFBD|CWPBD|MKBD|SMBD|KIBD|MCBD|S2MBD)[-_\s]?S?\d+|BLU-?RAY|BDMV|BDRIP/i.test(file.name)) {
    parts.push(120)
    reasons.push('蓝光版')
  }

  if (UNCENSORED_SUFFIX_RE.test(file.name) || /无码|無碼|破解|流出|去码|去碼|破坏版|破壞版|无修正|無修正/.test(file.name)) {
    parts.push(100)
    reasons.push('无码/破解版')
  }

  if (/4K|2160P|UHD/i.test(file.name)) {
    parts.push(80)
    reasons.push('4K 分辨率标记')
  }
  else if (/1080P|FHD/i.test(file.name)) {
    parts.push(50)
    reasons.push('1080P 分辨率标记')
  }

  if (file.size > 0) {
    parts.push(Math.round(Math.min(file.size / BYTES_PER_GB, 20) * 30))
    if (file.size >= BYTES_PER_GB)
      reasons.push('文件体积较大')
  }

  if (file.duration > 0)
    parts.push(Math.round(Math.min(file.duration / 60, 240) * 0.5))

  if (file.mtime > 0)
    parts.push(Math.round(Math.min(file.mtime / 1e9, 10)))

  return {
    score: parts.reduce((sum, n) => sum + n, 0),
    reasons,
  }
}

function countDocMarkers(doc?: MarkerDoc): number {
  if (!doc?.markers?.length)
    return 0
  return doc.markers.filter(marker => !marker.deleted).length
}

function resolveFallbackMediaKey(video: IndexedVideo): string {
  if (video.avNumber) {
    const normalized = normalizeAvNumber(video.avNumber)
    if (normalized)
      return `jav:${normalized}`
  }
  return `file:${video.fid}`
}

function compareCandidates(a: DuplicateFileCandidate, b: DuplicateFileCandidate): number {
  return (
    b.keepScore - a.keepScore
    || b.size - a.size
    || b.mtime - a.mtime
    || a.fid.localeCompare(b.fid)
  )
}

function normalizeStem(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[[(【（](?:1080p|720p|2160p|4k|x264|x265|h\.?264|h\.?265|hevc|aac|hd|fhd|uhd)[\])】）]/gi, '')
    .replace(/1080p|720p|2160p|4k|x264|x265|h\.?264|h\.?265|hevc/gi, '')
    .replace(/[\s._\-()[\]【】（）]+/g, '')
    .trim()
}

function buildGroup(
  id: string,
  kind: DuplicateKind,
  title: string,
  key: string,
  items: IndexedVideo[],
  fidToMediaKey: Map<string, string>,
  markerDocs?: Record<string, MarkerDoc>,
  mediaKey?: string,
): DuplicateGroup {
  const scored = items
    .map((video): DuplicateFileCandidate => {
      const markerCount = countDocMarkers(markerDocs?.[video.pickCode])
      const result = scoreFileForKeep(video, markerCount)
      return {
        ...video,
        mediaKey: fidToMediaKey.get(video.fid) ?? resolveFallbackMediaKey(video),
        keepScore: result.score,
        keepReasons: result.reasons,
        recommendedKeep: false,
        markerCount,
      }
    })
    .sort(compareCandidates)

  const files = scored.map((item, idx) => ({
    ...item,
    recommendedKeep: idx === 0,
  }))

  const totalSize = files.reduce((sum, f) => sum + f.size, 0)
  const keptSize = files[0]?.size ?? 0

  return {
    id,
    kind,
    title,
    key,
    ...(mediaKey ? { mediaKey } : {}),
    files,
    totalSize,
    reclaimableSize: Math.max(0, totalSize - keptSize),
    suspectedMultiPart: kind === 'sha1' || hasUniformSha1(files)
      ? false
      : isSuspectedMultiPartGroup(files.map(f => f.name)),
  }
}

function signatureOf(items: IndexedVideo[]): string {
  return items.map(v => v.fid).sort().join('|')
}

function groupByKey(videos: IndexedVideo[], keyOf: (video: IndexedVideo) => string | null): Map<string, IndexedVideo[]> {
  const map = new Map<string, IndexedVideo[]>()
  for (const video of videos) {
    const key = keyOf(video)
    if (!key)
      continue
    const list = map.get(key)
    if (list)
      list.push(video)
    else
      map.set(key, [video])
  }
  return map
}

const GENERIC_SIMILAR_STEMS = new Set([
  'video',
  'movie',
  'film',
  'clip',
  'sample',
  '正片',
  '视频',
  '电影',
  '预告',
])

const GENERIC_NUMBERED_STEM_RE = /^(?:video|movie|film|clip|sample|vid|mov|part|ep|episode|track|file|cam|rec|dsc|img|pxl|mvi|mts|vts|正片|视频|电影|预告|片段|合集)\d*$/i

function isGenericSimilarStem(stem: string): boolean {
  return GENERIC_SIMILAR_STEMS.has(stem) || GENERIC_NUMBERED_STEM_RE.test(stem)
}

function isDurationCompatibleForSimilar(a: IndexedVideo, b: IndexedVideo): boolean {
  if (a.duration <= 0 || b.duration <= 0)
    return a.size === b.size
  const diff = Math.abs(a.duration - b.duration)
  const tolerance = Math.max(15, Math.min(a.duration, b.duration) * 0.05)
  return diff <= tolerance
}

function isStemMatchCompatible(a: IndexedVideo, b: IndexedVideo): boolean {
  // 不同父级目录且文件大小不一致的同名/类似名视频不视为重复
  if (a.cid !== b.cid && a.size !== b.size)
    return false
  return isDurationCompatibleForSimilar(a, b)
}

/** 识别同番号/同键桶是否为站点前缀碰撞导致的误判组（>=4 个不同时长与不同标题的视频） */
function isLikelyFalsePositiveAvGroup(items: IndexedVideo[]): boolean {
  if (items.length < 4)
    return false
  if (isSuspectedMultiPartGroup(items.map(v => v.name)))
    return false

  const durations = items
    .map(v => v.duration)
    .filter(d => d >= 300)
    .sort((a, b) => a - b)

  if (durations.length < 4)
    return false

  let clusterCount = 1
  let clusterAnchor = durations[0]
  for (let i = 1; i < durations.length; i += 1) {
    const dur = durations[i]
    if (dur - clusterAnchor > Math.max(180, clusterAnchor * 0.12)) {
      clusterCount += 1
      clusterAnchor = dur
    }
  }

  if (clusterCount < 4)
    return false

  const distinctStems = new Set(
    items
      .map(v => normalizeStem(v.name))
      .filter(stem => stem.length > 0),
  )

  return distinctStems.size >= 4
}

function collectSimilarBuckets(unnumbered: IndexedVideo[]): IndexedVideo[][] {
  if (unnumbered.length < 2)
    return []

  const parent = unnumbered.map((_, idx) => idx)
  const find = (x: number): number => {
    let root = x
    while (parent[root] !== root)
      root = parent[root]
    let cur = x
    while (cur !== root) {
      const next = parent[cur]
      parent[cur] = root
      cur = next
    }
    return root
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb)
      parent[rb] = ra
  }

  const byStem = new Map<string, number[]>()
  const bySizeDur = new Map<string, number>()

  unnumbered.forEach((video, idx) => {
    const stem = normalizeStem(video.name)
    if (stem.length >= 4 && !isGenericSimilarStem(stem)) {
      const prevList = byStem.get(stem)
      if (prevList) {
        for (const prev of prevList) {
          if (isStemMatchCompatible(unnumbered[prev], video))
            union(prev, idx)
        }
        prevList.push(idx)
      }
      else {
        byStem.set(stem, [idx])
      }
    }

    if (video.size >= SIMILAR_MIN_SIZE_BYTES && video.duration >= SIMILAR_MIN_DURATION_SEC) {
      const sdKey = `${video.size}:${Math.round(video.duration)}`
      const prev = bySizeDur.get(sdKey)
      if (prev !== undefined)
        union(prev, idx)
      else
        bySizeDur.set(sdKey, idx)
    }
  })

  const buckets = new Map<number, IndexedVideo[]>()
  unnumbered.forEach((video, idx) => {
    const root = find(idx)
    const list = buckets.get(root)
    if (list)
      list.push(video)
    else
      buckets.set(root, [video])
  })

  return Array.from(buckets.values()).filter(list => list.length >= 2)
}

function stripSectionPrefix(mediaKey: string): string {
  return mediaKey.startsWith('sec:')
    ? mediaKey.slice(mediaKey.indexOf(':', 4) + 1)
    : mediaKey
}

function resolveAvDuplicateKey(
  video: IndexedVideo,
  fidToMediaKey: ReadonlyMap<string, string>,
): string | null {
  if (isEpisodicSeriesFilename(video.name))
    return null
  const entryKey = fidToMediaKey.get(video.fid)
  if (entryKey) {
    const unprefixed = stripSectionPrefix(entryKey)
    if (
      unprefixed.startsWith('file:')
      || unprefixed.startsWith('collection:')
      || unprefixed.startsWith('tv:')
      || unprefixed.startsWith('movie:')
    ) {
      return null
    }
    return entryKey
  }
  if (video.avNumber) {
    const normalized = normalizeAvNumber(video.avNumber)
    return normalized ? `jav:${normalized}` : `jav:${video.avNumber.trim().toUpperCase()}`
  }
  return null
}

function resolveTvEpisodeDuplicateInfo(video: IndexedVideo): { key: string, title: string } | null {
  if (!isEpisodicSeriesFilename(video.name))
    return null
  const parsed = parseCinemaTitle(video.name)
  if (!parsed.normalizedKey || parsed.episode === undefined)
    return null
  const season = parsed.season ?? 0
  const episode = parsed.episode
  const epTag = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
  return {
    key: `tv-ep:${parsed.normalizedKey}:${epTag}`,
    title: `${parsed.title} ${epTag}`,
  }
}

/**
 * 分析网盘视频索引中的重复组：
 * 1. sha1 完全相同
 * 2. 同番号 / 同 mediaKey（与 sha1 组完全重合的跳过，排除剧集分集文件）
 * 3. 同剧集同季同集重复 / 无番号视频的相似文件名或同体积同长视频
 */
export function analyzeDuplicateGroups(
  videos: IndexedVideo[],
  entries: LibraryEntry[],
  markerDocs?: Record<string, MarkerDoc>,
): DuplicateGroup[] {
  const fidToMediaKey = new Map<string, string>()
  const mediaKeyToTitle = new Map<string, string>()

  for (const entry of entries) {
    if (entry.meta?.title)
      mediaKeyToTitle.set(entry.mediaKey, entry.meta.title)
    else if (entry.externalId)
      mediaKeyToTitle.set(entry.mediaKey, entry.externalId)

    for (const file of entry.files)
      fidToMediaKey.set(file.fid, entry.mediaKey)
  }

  const sha1Buckets = groupByKey(videos, (video) => {
    const sha1 = video.sha1?.trim().toLowerCase()
    return sha1 || null
  })

  const sha1Groups = Array.from(sha1Buckets.entries())
    .filter(([, list]) => list.length >= 2)
    .map(([sha1, list]) => {
      const mediaKey = fidToMediaKey.get(list[0].fid) ?? resolveFallbackMediaKey(list[0])
      const title = mediaKeyToTitle.get(mediaKey) ?? list[0].avNumber ?? list[0].name
      return buildGroup(`sha1:${sha1}`, 'sha1', title, sha1, list, fidToMediaKey, markerDocs, mediaKey)
    })

  const sha1Signatures = new Set(sha1Groups.map(g => signatureOf(g.files)))

  const avBuckets = groupByKey(videos, video => resolveAvDuplicateKey(video, fidToMediaKey))

  const avGroups = Array.from(avBuckets.entries())
    .filter(([, list]) => (
      list.length >= 2
      && !sha1Signatures.has(signatureOf(list))
      && !isLikelyFalsePositiveAvGroup(list)
    ))
    .map(([mediaKey, list]) => {
      const title = mediaKeyToTitle.get(mediaKey) ?? list[0].avNumber ?? list[0].name
      return buildGroup(`av:${mediaKey}`, 'avNumber', title, mediaKey, list, fidToMediaKey, markerDocs, mediaKey)
    })

  const editionBuckets = groupByKey(videos, (video) => {
    if (isEpisodicSeriesFilename(video.name))
      return null
    const resolved = resolveEditionWorkKey(video.avNumber)
    return resolved?.workKey ?? null
  })

  const editionGroups = Array.from(editionBuckets.entries())
    .filter(([, list]) => {
      if (list.length < 2 || sha1Signatures.has(signatureOf(list)))
        return false
      const distinctMediaKeys = new Set(
        list.map(v => fidToMediaKey.get(v.fid) ?? resolveFallbackMediaKey(v)),
      )
      return distinctMediaKeys.size >= 2
    })
    .map(([workKey, list]) => {
      const group = buildGroup(`edition:${workKey}`, 'edition', workKey, workKey, list, fidToMediaKey, markerDocs)
      const primaryMediaKey = group.files[0]?.mediaKey
      const title = (primaryMediaKey ? mediaKeyToTitle.get(primaryMediaKey) : undefined)
        ?? group.files[0]?.avNumber
        ?? workKey
      return {
        ...group,
        ...(primaryMediaKey ? { mediaKey: primaryMediaKey } : {}),
        title,
      }
    })

  const tvEpisodeBuckets = new Map<string, { title: string, items: IndexedVideo[] }>()
  for (const video of videos) {
    const tvInfo = resolveTvEpisodeDuplicateInfo(video)
    if (!tvInfo)
      continue
    const bucket = tvEpisodeBuckets.get(tvInfo.key)
    if (bucket)
      bucket.items.push(video)
    else
      tvEpisodeBuckets.set(tvInfo.key, { title: tvInfo.title, items: [video] })
  }

  const tvEpisodeGroups = Array.from(tvEpisodeBuckets.entries())
    .filter(([, bucket]) => bucket.items.length >= 2 && !sha1Signatures.has(signatureOf(bucket.items)))
    .map(([key, bucket]) => ({
      ...buildGroup(`tv-ep:${key}`, 'similar', bucket.title, key, bucket.items, fidToMediaKey, markerDocs),
      suspectedMultiPart: false,
    }))

  const unnumbered = videos.filter((video) => {
    if (isEpisodicSeriesFilename(video.name))
      return false
    if (video.avNumber)
      return false
    const entryKey = fidToMediaKey.get(video.fid)
    return !entryKey || stripSectionPrefix(entryKey).startsWith('file:')
  })

  const similarGroups = collectSimilarBuckets(unnumbered)
    .filter(list => !sha1Signatures.has(signatureOf(list)))
    .map((list) => {
      const stem = normalizeStem(list[0].name)
      const key = stem.length >= 2 ? stem : `${list[0].size}:${Math.round(list[0].duration)}`
      return buildGroup(`similar:${list[0].fid}`, 'similar', list[0].name, key, list, fidToMediaKey, markerDocs)
    })

  return [...sha1Groups, ...avGroups, ...editionGroups, ...tvEpisodeGroups, ...similarGroups].sort(
    (a, b) => b.reclaimableSize - a.reclaimableSize || b.totalSize - a.totalSize || a.id.localeCompare(b.id),
  )
}

function yieldMainThread(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted)
    throw signal.reason ?? new DOMException('重复检测已取消', 'AbortError')
}

/**
 * 分片异步分析重复视频组：每处理 chunkSize 条记录主动让出主线程，避免万级库卡顿 UI
 */
export async function analyzeDuplicateGroupsAsync(
  videos: IndexedVideo[],
  entries: LibraryEntry[],
  markerDocs?: Record<string, MarkerDoc>,
  options: { chunkSize?: number, signal?: AbortSignal } = {},
): Promise<DuplicateGroup[]> {
  const chunkSize = Math.max(50, options.chunkSize ?? 400)
  const signal = options.signal
  throwIfAborted(signal)

  const fidToMediaKey = new Map<string, string>()
  const mediaKeyToTitle = new Map<string, string>()

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]
    if (entry.meta?.title)
      mediaKeyToTitle.set(entry.mediaKey, entry.meta.title)
    else if (entry.externalId)
      mediaKeyToTitle.set(entry.mediaKey, entry.externalId)

    for (const file of entry.files)
      fidToMediaKey.set(file.fid, entry.mediaKey)

    if ((i + 1) % chunkSize === 0) {
      await yieldMainThread()
      throwIfAborted(signal)
    }
  }

  const sha1Buckets = new Map<string, IndexedVideo[]>()
  const avBuckets = new Map<string, IndexedVideo[]>()
  const editionBuckets = new Map<string, IndexedVideo[]>()
  const tvEpisodeBuckets = new Map<string, { title: string, items: IndexedVideo[] }>()
  const unnumbered: IndexedVideo[] = []

  for (let i = 0; i < videos.length; i += 1) {
    const video = videos[i]
    const sha1 = video.sha1?.trim().toLowerCase()
    if (sha1) {
      const list = sha1Buckets.get(sha1)
      if (list)
        list.push(video)
      else
        sha1Buckets.set(sha1, [video])
    }

    const tvInfo = resolveTvEpisodeDuplicateInfo(video)
    if (tvInfo) {
      const bucket = tvEpisodeBuckets.get(tvInfo.key)
      if (bucket)
        bucket.items.push(video)
      else
        tvEpisodeBuckets.set(tvInfo.key, { title: tvInfo.title, items: [video] })
    }

    const avKey = resolveAvDuplicateKey(video, fidToMediaKey)
    if (avKey) {
      const list = avBuckets.get(avKey)
      if (list)
        list.push(video)
      else
        avBuckets.set(avKey, [video])

      const editionResolved = resolveEditionWorkKey(video.avNumber)
      if (editionResolved) {
        const edList = editionBuckets.get(editionResolved.workKey)
        if (edList)
          edList.push(video)
        else
          editionBuckets.set(editionResolved.workKey, [video])
      }
    }
    else if (!isEpisodicSeriesFilename(video.name) && !video.avNumber) {
      unnumbered.push(video)
    }

    if ((i + 1) % chunkSize === 0) {
      await yieldMainThread()
      throwIfAborted(signal)
    }
  }

  const groups: DuplicateGroup[] = []
  const sha1Signatures = new Set<string>()
  let builtCount = 0

  for (const [sha1, list] of sha1Buckets.entries()) {
    if (list.length < 2)
      continue
    sha1Signatures.add(signatureOf(list))
    const mediaKey = fidToMediaKey.get(list[0].fid) ?? resolveFallbackMediaKey(list[0])
    const title = mediaKeyToTitle.get(mediaKey) ?? list[0].avNumber ?? list[0].name
    groups.push(buildGroup(`sha1:${sha1}`, 'sha1', title, sha1, list, fidToMediaKey, markerDocs, mediaKey))
    builtCount += 1
    if (builtCount % chunkSize === 0) {
      await yieldMainThread()
      throwIfAborted(signal)
    }
  }

  for (const [mediaKey, list] of avBuckets.entries()) {
    if (
      list.length < 2
      || sha1Signatures.has(signatureOf(list))
      || isLikelyFalsePositiveAvGroup(list)
    ) {
      continue
    }
    const title = mediaKeyToTitle.get(mediaKey) ?? list[0].avNumber ?? list[0].name
    groups.push(buildGroup(`av:${mediaKey}`, 'avNumber', title, mediaKey, list, fidToMediaKey, markerDocs, mediaKey))
    builtCount += 1
    if (builtCount % chunkSize === 0) {
      await yieldMainThread()
      throwIfAborted(signal)
    }
  }

  for (const [workKey, list] of editionBuckets.entries()) {
    if (list.length < 2 || sha1Signatures.has(signatureOf(list)))
      continue
    const distinctMediaKeys = new Set(
      list.map(v => fidToMediaKey.get(v.fid) ?? resolveFallbackMediaKey(v)),
    )
    if (distinctMediaKeys.size < 2)
      continue
    const group = buildGroup(`edition:${workKey}`, 'edition', workKey, workKey, list, fidToMediaKey, markerDocs)
    const primaryMediaKey = group.files[0]?.mediaKey
    const title = (primaryMediaKey ? mediaKeyToTitle.get(primaryMediaKey) : undefined)
      ?? group.files[0]?.avNumber
      ?? workKey
    groups.push({
      ...group,
      ...(primaryMediaKey ? { mediaKey: primaryMediaKey } : {}),
      title,
    })
    builtCount += 1
    if (builtCount % chunkSize === 0) {
      await yieldMainThread()
      throwIfAborted(signal)
    }
  }

  for (const [key, bucket] of tvEpisodeBuckets.entries()) {
    if (bucket.items.length < 2 || sha1Signatures.has(signatureOf(bucket.items)))
      continue
    groups.push({
      ...buildGroup(`tv-ep:${key}`, 'similar', bucket.title, key, bucket.items, fidToMediaKey, markerDocs),
      suspectedMultiPart: false,
    })
    builtCount += 1
    if (builtCount % chunkSize === 0) {
      await yieldMainThread()
      throwIfAborted(signal)
    }
  }

  const similarBuckets = collectSimilarBuckets(unnumbered)
  for (const list of similarBuckets) {
    if (sha1Signatures.has(signatureOf(list)))
      continue
    const stem = normalizeStem(list[0].name)
    const key = stem.length >= 2 ? stem : `${list[0].size}:${Math.round(list[0].duration)}`
    groups.push(buildGroup(`similar:${list[0].fid}`, 'similar', list[0].name, key, list, fidToMediaKey, markerDocs))
    builtCount += 1
    if (builtCount % chunkSize === 0) {
      await yieldMainThread()
      throwIfAborted(signal)
    }
  }

  return groups.sort(
    (a, b) => b.reclaimableSize - a.reclaimableSize || b.totalSize - a.totalSize || a.id.localeCompare(b.id),
  )
}

/**
 * 为媒体库单条目的文件列表计算去重保留评分与推荐保留标记
 */
export function scoreEntryFilesForDedupe(
  files: LibraryFileItem[],
  markerCountByPickCode?: Map<string, number>,
): Array<{ file: LibraryFileItem, keepScore: number, keepReasons: string[], recommendedKeep: boolean }> {
  const scored = files
    .map((file) => {
      const result = scoreFileForKeep(file, markerCountByPickCode?.get(file.pickCode) ?? 0)
      return {
        file,
        keepScore: result.score,
        keepReasons: result.reasons,
      }
    })
    .sort((a, b) => (
      b.keepScore - a.keepScore
      || b.file.size - a.file.size
      || b.file.mtime - a.file.mtime
      || a.file.fid.localeCompare(b.file.fid)
    ))

  return scored.map((item, idx) => ({
    ...item,
    recommendedKeep: idx === 0,
  }))
}

/**
 * 智能勾选当前重复组中的冗余文件：
 * - 非疑似分段组（含所有 SHA1 一致重复组）：保留推荐项，勾选其余冗余文件
 * - 疑似分段组：若组内存在 SHA1 完全一致的重复文件，同 SHA1 仅保留评分最高的一份并勾选其余冗余
 */
export function selectSmartRedundantFids(
  groups: readonly DuplicateGroup[],
): { fids: Set<string>, skippedMultiPart: number } {
  const fids = new Set<string>()
  let skippedMultiPart = 0

  for (const group of groups) {
    if (!group.suspectedMultiPart || group.kind === 'sha1' || hasUniformSha1(group.files)) {
      for (const file of group.files) {
        if (!file.recommendedKeep)
          fids.add(file.fid)
      }
      continue
    }

    const seenSha1 = new Set<string>()
    let selectedInGroup = false
    for (const file of group.files) {
      const sha1 = file.sha1?.trim().toLowerCase()
      if (!sha1)
        continue
      if (seenSha1.has(sha1)) {
        fids.add(file.fid)
        selectedInGroup = true
      }
      else {
        seenSha1.add(sha1)
      }
    }

    if (!selectedInGroup)
      skippedMultiPart += 1
  }

  return { fids, skippedMultiPart }
}
