export interface ParsedCinemaTitle {
  title: string
  year?: number
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  normalizedKey: string
}

const NOISE_TAG_RE = /\b(?:2160p|1080p|720p|480p|4k|8k|uhd|fhd|hd|bluray|blu-ray|bdrip|brrip|web-dl|webdl|webrip|hdrip|dvdrip|hdtv|remux|hdr10\+?|hdr|dolby|vision|dv|atmos|truehd|dts-hd|dts|aac|ac3|eac3|flac|hevc|x265|x264|h\.?265|h\.?264|10bit|8bit|hq|proper|repack|extended|uncut|imax)\b/gi
const CN_NOISE_TAG_RE = /国语|粤语|日语|英语|韩语|国粤双语|中英双字|中字|简繁|特效字幕|内封字幕|内嵌字幕|双语字幕|高码率|无水印|完整版|未删减版|导演剪辑版/g
const DOMAIN_BRACKET_RE = /[[【(（][^\]】)）]*(?:www\.|\.com|\.net|\.cn|\.tv|\.cc|\.org)[^\]】)）]*[\]】)）]/gi
const LEADING_DOMAIN_RE = /^(?:[\w-]+\.)+[a-z]{2,}@/i

function normalizeCinemaKey(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s._\-:：/\\|·・'’"“”!?！？,，。()（）[\]【】]+/g, '')
}

function preferPrimaryTitle(cleaned: string): string {
  const englishIdx = cleaned.search(/\s+[a-z][a-z0-9\s:.'-]+$/i)
  if (englishIdx > 0) {
    const prefix = cleaned.slice(0, englishIdx).trim()
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(prefix) && prefix.length >= 2)
      return prefix
  }
  return cleaned
}

/**
 * 解析电影 / 剧集文件名，提取干净片名、年份、类型与剧集号；
 * 当文件名仅含集数/纯数字（如 S01E01.mkv、01.mp4）且提供了父目录名时，自动回退解析父目录名。
 */
export function parseCinemaTitle(rawInput: string, fallbackFolderName?: string): ParsedCinemaTitle {
  let working = rawInput
    .normalize('NFKC')
    .replace(/\.(?!\d{4}$)[^./\\]{2,5}$/, '')
    .replace(DOMAIN_BRACKET_RE, ' ')
    .replace(LEADING_DOMAIN_RE, '')
    .trim()

  let mediaType: 'movie' | 'tv' = 'movie'
  let season: number | undefined
  let episode: number | undefined

  const seMatch = working.match(/\bS(\d{1,2})\s*E(\d{1,3})\b/i)
  if (seMatch) {
    mediaType = 'tv'
    season = Number(seMatch[1])
    episode = Number(seMatch[2])
    working = working.slice(0, seMatch.index)
  }
  else {
    const cnEpMatch = working.match(/第\s*(\d{1,3})\s*[集话話]/)
    if (cnEpMatch) {
      mediaType = 'tv'
      episode = Number(cnEpMatch[1])
      working = working.slice(0, cnEpMatch.index)
    }
    else {
      const epMatch = working.match(/(?:^|[\s._-])EP?(\d{1,3})(?=$|[\s._-])/i)
      if (epMatch) {
        mediaType = 'tv'
        episode = Number(epMatch[1])
        working = working.slice(0, epMatch.index)
      }
    }
  }

  // 移除单季标识如 S01 / 第一季
  working = working
    .replace(/\bS\d{1,2}\b/gi, ' ')
    .replace(/第\s*[一二三四五六七八九十\d]+\s*季/g, ' ')

  let year: number | undefined
  const yearMatches = Array.from(working.matchAll(/(?<!\d)(19\d{2}|20\d{2})(?!\d)/g))
  if (yearMatches.length > 0) {
    /** 若片名本身是纯年份或带数字（如 2012），仅在前面已有足够标题内容时把年份剥离出来 */
    const lastMatch = yearMatches[yearMatches.length - 1]!
    const idx = lastMatch.index ?? -1
    const before = working.slice(0, idx).replace(/[\s._\-()（）[\]【】]+/g, '').trim()
    if (before.length >= 1) {
      year = Number(lastMatch[1])
      working = working.slice(0, idx)
    }
  }

  working = working
    .replace(NOISE_TAG_RE, ' ')
    .replace(CN_NOISE_TAG_RE, ' ')
    .replace(/[[【(（]\s*[\]】)）]/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/[\s\-([【（]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const bareStem = working.replace(/[\s\-()（）[\]【】]+/g, '')
  const needsFolderFallback = Boolean(
    fallbackFolderName?.trim()
    && (!bareStem || /^\d{1,4}$/.test(bareStem)),
  )

  if (needsFolderFallback && fallbackFolderName) {
    const folderParsed = parseCinemaTitle(fallbackFolderName)
    return {
      title: folderParsed.title,
      ...(year ?? folderParsed.year ? { year: year ?? folderParsed.year } : {}),
      mediaType: mediaType === 'tv' || /^\d{1,4}$/.test(bareStem) ? 'tv' : folderParsed.mediaType,
      ...(season !== undefined ? { season } : folderParsed.season !== undefined ? { season: folderParsed.season } : {}),
      ...(episode !== undefined ? { episode } : /^\d{1,4}$/.test(bareStem) ? { episode: Number(bareStem) } : {}),
      normalizedKey: folderParsed.normalizedKey,
    }
  }

  const title = preferPrimaryTitle(working) || rawInput.replace(/\.[^./\\]{2,5}$/, '').trim()
  const normalizedKey = normalizeCinemaKey(title) || normalizeCinemaKey(rawInput) || 'unknown'

  return {
    title,
    ...(year ? { year } : {}),
    mediaType,
    ...(season !== undefined ? { season } : {}),
    ...(episode !== undefined ? { episode } : {}),
    normalizedKey,
  }
}
