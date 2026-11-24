import {
  getAvNumber,
  isExplicitMyFansFilename,
  isExplicitOnlyFansFilename,
  normalizeFilenameForIdentity,
  stripLeadingSiteTags,
} from '@/utils/getNumber'

export type MediaPlatform = 'jav' | 'fc2' | 'myfans' | 'onlyfans' | 'unknown'

export interface MediaCreator {
  name?: string
  handle?: string
}

export interface FolderContext {
  name?: string
  fullPath?: string
}

export interface MediaIdentity {
  platform: MediaPlatform
  avNumber: string | null
  creator?: MediaCreator
}

const GENERIC_FOLDER_SEGMENTS = new Set([
  '根目录',
  '视频',
  '合集',
  '下载',
  '云下载',
  '全部',
  '其他',
  'videos',
  'video',
  'collection',
  'collections',
  '4k',
  '1080p',
  '720p',
  'hd',
  'uncensored',
  'restored',
])

const ONLYFANS_FOLDER_SEGMENT = /^(?:only\s*fans(?:\.com)?|of)$/i
const MYFANS_FOLDER_SEGMENT = /^(?:myfans(?:\.jp)?|マイファン[ズス])$/i
const FC2_FOLDER_SEGMENT = /^(?:fc2|fc2[-_\s]?ppv)$/i

function cleanMyFansCreatorName(raw: string): string {
  return raw
    .replace(/^(?:myfans(?:\.jp)?|マイファン[ズス])[-_:\s]*/i, '')
    .replace(/^[[【(（]\s*|\s*[\]】)）]$/g, '')
    .trim()
}

function extractMyFansCreator(normalizedName: string): MediaCreator | undefined {
  const cleaned = stripLeadingSiteTags(normalizedName)
  if (!cleaned)
    return undefined

  const namedMatch = cleaned.match(/([^()[\]【】\s@]{1,24})\s*\(@?([a-z][\w.-]{2,32})\)/i)
  if (namedMatch) {
    const name = cleanMyFansCreatorName(namedMatch[1]!)
    const handle = namedMatch[2]!.toLowerCase()
    return name ? { name, handle } : { handle }
  }

  const handleOnly = cleaned.match(/\(@?([a-z][\w.-]{2,32})\)/i)
  if (handleOnly)
    return { handle: handleOnly[1]!.toLowerCase() }

  const brandPrefixed = cleaned.match(/(?:myfans(?:\.jp)?|マイファン[ズス])[-_:\s]+@?([^\s[\]【】()_-]{2,24})/i)
  if (brandPrefixed) {
    const token = brandPrefixed[1]!.trim()
    if (/^[a-z][\w.-]{2,32}$/i.test(token))
      return { handle: token.toLowerCase(), name: token }
    return { name: token }
  }

  return undefined
}

function extractOnlyFansCreator(normalizedName: string): MediaCreator | undefined {
  const cleaned = stripLeadingSiteTags(normalizedName)
  if (!cleaned)
    return undefined

  const namedMatch = cleaned.match(/([^()[\]【】\s@]{1,24})\s*\(@?([a-z][\w.-]{2,32})\)/i)
  if (namedMatch) {
    const rawName = namedMatch[1]!.replace(/^(?:only\s*fans(?:\.com)?|of)[-_:\s]*/i, '').trim()
    const handle = namedMatch[2]!.toLowerCase()
    return rawName ? { name: rawName, handle } : { handle }
  }

  const atMatch = cleaned.match(/(?:^|[\s([【（_-])@([a-z][\w.-]{2,32})(?=$|[\s)\]】）._-])/i)
  if (atMatch)
    return { handle: atMatch[1]!.toLowerCase() }

  const brandCreatorMatch = cleaned.match(
    /(?:only\s*fans(?:\.com)?|[[【(（]\s*OF\s*[\]】)）]|OF[-_])[-_:\s]*@?([a-z][\w.-]{2,32}|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}][\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\w.-]{1,20})/iu,
  )
  if (brandCreatorMatch) {
    const token = brandCreatorMatch[1]!.trim()
    if (/^(?:1080p|2160p|720p|480p|4k|hd|mp4|mkv|uncensored|censored)$/i.test(token))
      return undefined
    if (/^[a-z][\w.-]{2,32}$/i.test(token))
      return { handle: token.toLowerCase(), name: token }
    return { name: token }
  }

  return undefined
}

function getFolderSegments(folder?: FolderContext | null): string[] {
  if (!folder)
    return []
  if (folder.fullPath) {
    return folder.fullPath
      .split('/')
      .map(seg => seg.trim())
      .filter(Boolean)
  }
  return folder.name?.trim() ? [folder.name.trim()] : []
}

function parseCreatorFromFolderSegment(segment: string): MediaCreator | undefined {
  const trimmed = segment.trim()
  if (!trimmed)
    return undefined
  if (GENERIC_FOLDER_SEGMENTS.has(trimmed.toLowerCase()) || /^\d{4}$/.test(trimmed))
    return undefined

  const namedMatch = trimmed.match(/^([^()[\]【】]{1,24}?)\s*\(@?([a-z][\w.-]{2,32})\)$/i)
  if (namedMatch) {
    const name = namedMatch[1]!.trim()
    const handle = namedMatch[2]!.toLowerCase()
    return name ? { name, handle } : { handle }
  }

  const stripped = trimmed.replace(/^@/, '')
  if (/^[a-z][\w.-]{2,32}$/i.test(stripped))
    return { handle: stripped.toLowerCase(), name: stripped }

  return { name: trimmed }
}

function detectPlatformFromFolder(folder?: FolderContext | null): {
  platform: 'onlyfans' | 'myfans' | 'fc2'
  creator?: MediaCreator
} | null {
  const segments = getFolderSegments(folder)
  if (segments.length === 0)
    return null

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]!
    if (ONLYFANS_FOLDER_SEGMENT.test(seg)) {
      const nextSeg = segments[i + 1]
      const creator = nextSeg ? parseCreatorFromFolderSegment(nextSeg) : undefined
      return { platform: 'onlyfans', ...(creator ? { creator } : {}) }
    }
    if (MYFANS_FOLDER_SEGMENT.test(seg)) {
      const nextSeg = segments[i + 1]
      const creator = nextSeg ? parseCreatorFromFolderSegment(nextSeg) : undefined
      return { platform: 'myfans', ...(creator ? { creator } : {}) }
    }
  }

  if (segments.some(seg => FC2_FOLDER_SEGMENT.test(seg)))
    return { platform: 'fc2' }

  return null
}

/**
 * 统一解析视频的平台归属、标准化番号与创作者信息
 * @param filename 文件名
 * @param folder 可选父目录上下文
 */
export function parseMediaIdentity(
  filename: string,
  folder?: FolderContext | null,
): MediaIdentity {
  const normalizedName = normalizeFilenameForIdentity(filename)

  /** 1. 显式 FC2-PPV 番号最高优先级 */
  const fc2Match = normalizedName.match(/(?<![a-z0-9])fc2(?:[\s._-]*ppv)?[\s._-]*(\d{5,8})(?!\d)/i)
  if (fc2Match) {
    return {
      platform: 'fc2',
      avNumber: `FC2-PPV-${fc2Match[1]}`,
    }
  }

  // 2. 显式 MyFans 特征
  if (isExplicitMyFansFilename(normalizedName)) {
    const folderHint = detectPlatformFromFolder(folder)
    const creator = extractMyFansCreator(normalizedName)
      ?? (folderHint?.platform === 'myfans' ? folderHint.creator : undefined)
    return {
      platform: 'myfans',
      avNumber: null,
      ...(creator ? { creator } : {}),
    }
  }

  // 3. 显式 OnlyFans 特征
  if (isExplicitOnlyFansFilename(normalizedName)) {
    const folderHint = detectPlatformFromFolder(folder)
    const creator = extractOnlyFansCreator(normalizedName)
      ?? (folderHint?.platform === 'onlyfans' ? folderHint.creator : undefined)
    return {
      platform: 'onlyfans',
      avNumber: null,
      ...(creator ? { creator } : {}),
    }
  }

  /** 4. 父目录平台辅助归类（仅独立 OnlyFans/OF 或 MyFans 目录段，不映射泛化 fans 目录） */
  const folderHint = detectPlatformFromFolder(folder)
  if (folderHint?.platform === 'onlyfans' || folderHint?.platform === 'myfans') {
    const creator = folderHint.platform === 'onlyfans'
      ? (extractOnlyFansCreator(normalizedName) ?? folderHint.creator)
      : (extractMyFansCreator(normalizedName) ?? folderHint.creator)
    return {
      platform: folderHint.platform,
      avNumber: null,
      ...(creator ? { creator } : {}),
    }
  }

  /** 5. 标准 JAV / FC2 番号回退 */
  const avNumber = getAvNumber(filename)
  if (avNumber) {
    return {
      platform: /^FC2-PPV-\d{5,8}$/i.test(avNumber) ? 'fc2' : 'jav',
      avNumber,
    }
  }

  if (folderHint?.platform === 'fc2') {
    return {
      platform: 'fc2',
      avNumber: null,
    }
  }

  return {
    platform: 'unknown',
    avNumber: null,
  }
}
