export interface ParsedCinemaTitle {
  title: string
  year?: number
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  normalizedKey: string
}

const NOISE_TAG_RE = /\b(?:2160p|1080p|1080i|720p|480p|4k|8k|uhd|fhd|hd|60fps|120fps|30fps|24fps|bluray|blu-ray|bdrip|brrip|web-dl|webdl|webrip|web|nf|netflix|amzn|amazon|dsnp|atvp|hmax|hulu|iqiyi|youku|baha|kktv|hdrip|dvdrip|hdtv|remux|hdr10plus|hdr10\+?|hdr|hlg|sdr|dolby|vision|dovi|dv|atmos|truehd|dts-hd|dts|ddp\d*(?:\.\d)?|dd\d*(?:\.\d)?|aac\d*(?:\.\d)?|ac3|eac3|flac|lpcm|opus|mp3|hevc|x265|x264|h\.?265|h\.?264|avc|av1|10bit|8bit|ma|5\.1|7\.1|2\.0|2audio|3audio|hq|proper|repack|complete|extended|unrated|uncut|imax|dc|directors?\.?cut)\b/gi
const DD_PLUS_TAG_RE = /(?:^|[\s._-])dd\+\d*(?:\.\d)?(?=$|[\s._-])/gi
const RELEASE_GROUP_RE = /-(?:hhweb|frds|wiki|chd|cmct|mteam|hdsky|adweb|pter|beasts|ourbits|audiences|springsunday|ttg|hds|nyapad|vcb-studio|fgt|rarbg|yts|yify|sparks|geckos|ntb|flux|playweb|cweb|ubits|zmweb|hhanclub|mp4ba)\b/gi
const CN_NOISE_TAG_RE = /国粤双语|国英双语|国日双语|中英双字|中英字幕|中文字幕|简繁英|特效字幕|内封字幕|内嵌字幕|双语字幕|外挂字幕|硬字幕|软字幕|导演剪辑版|未删减版|未删减|加长版|重制版|修复版|典藏版|完整版|杜比视界|杜比全景声|杜比|全景声|高帧率|60帧|120帧|高码率|高码|无水印|台配|港配|双语|多音轨|简繁|简中|繁中|中字|国语|粤语|日语|英语|韩语|臻享|全\d+集|更至\d+集|全集|合集|完结|超清|高清|蓝光|原盘/g
const DOMAIN_BRACKET_RE = /[[【(（][^\]】)）]*(?:www\.|\.com|\.net|\.cn|\.tv|\.cc|\.org)[^\]】)）]*[\]】)）]/gi
const LEADING_DOMAIN_RE = /^(?:[\w-]+\.)+[a-z]{2,}@/i
const CJK_CHAR_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u

function normalizeCinemaKey(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s._\-:：/\\|·・'’"“”!?！？,，。()（）[\]【】《》]+/g, '')
}

function preferPrimaryTitle(cleaned: string): string {
  const englishIdx = cleaned.search(/(?:\s+|\s*-\s*)[a-z][a-z0-9\s:.'-]+$/i)
  if (englishIdx > 0) {
    const prefix = cleaned.slice(0, englishIdx).trim()
    if (CJK_CHAR_RE.test(prefix) && prefix.length >= 2)
      return prefix
  }
  return cleaned
}

function stripLeadingBracketTags(input: string): string {
  const match = input.match(/^(?:[[【(（《][^\]】)）》]{1,40}[\]】)）》][\s._-]*)+/)
  if (!match)
    return input
  const remainder = input.slice(match[0].length).trim()
  if (!remainder)
    return input

  const hasEpisodePattern = /\bS\d{1,2}\s*E\d{1,3}\b|第\s*\d{1,3}\s*[集话話]|(?:^|[\s._-])EP?\d{1,3}(?=$|[\s._-])/i.test(remainder)
  if (hasEpisodePattern)
    return remainder

  const check = remainder
    .replace(/(?<!\d)(19\d{2}|20\d{2})(?!\d)/g, ' ')
    .replace(RELEASE_GROUP_RE, ' ')
    .replace(DD_PLUS_TAG_RE, ' ')
    .replace(NOISE_TAG_RE, ' ')
    .replace(CN_NOISE_TAG_RE, ' ')
    .replace(/[\s._\-()（）[\]【】《》]+/g, '')
  return check.length > 0 ? remainder : input
}

interface StrippedCinemaState {
  working: string
  bareStem: string
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  year?: number
}

function stripCinemaFilenameToWorking(rawInput: string): StrippedCinemaState {
  let working = rawInput
    .normalize('NFKC')
    .replace(/\.(?!\d{4}$)[^./\\]{2,5}$/, '')
    .replace(DOMAIN_BRACKET_RE, ' ')
    .replace(LEADING_DOMAIN_RE, '')
    .trim()

  working = stripLeadingBracketTags(working)

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
    .replace(RELEASE_GROUP_RE, ' ')
    .replace(DD_PLUS_TAG_RE, ' ')
    .replace(NOISE_TAG_RE, ' ')
    .replace(CN_NOISE_TAG_RE, ' ')
    .replace(/[[【(（《]\s*[\]】)）》]/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/[\s\-([【（《]+$/g, '')
    .replace(/^[\s\-([【（《]+|[\s\])）】》]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const bareStem = working.replace(/[\s\-()（）[\]【】《》]+/g, '')
  return { working, bareStem, mediaType, season, episode, year }
}

/**
 * 判断院线视频文件名是否缺少有效片名（仅含集数/纯数字），需要结合父目录名解析
 */
export function needsCinemaFolderFallback(rawInput: string): boolean {
  const { bareStem } = stripCinemaFilenameToWorking(rawInput)
  return !bareStem || /^\d{1,4}$/.test(bareStem)
}

/**
 * 生成去重后的院线影视搜索候选词列表（完整片名优先，必要时补充中/英文段与主标题）
 */
export function buildCinemaSearchQueries(parsed: Pick<ParsedCinemaTitle, 'title'>): string[] {
  const full = parsed.title.trim()
  if (!full)
    return []

  const queries: string[] = []
  const seen = new Set<string>()
  const push = (candidate: string) => {
    const trimmed = candidate.trim()
    if (!trimmed)
      return
    const key = trimmed.toLowerCase()
    if (seen.has(key))
      return
    seen.add(key)
    queries.push(trimmed)
  }

  push(full)

  const hasCjk = CJK_CHAR_RE.test(full)
  const hasLatin = /[a-z]{2,}/i.test(full)
  if (hasCjk && hasLatin) {
    const cjkPart = full
      .replace(/(?:^|\s+|-\s*)[a-z][a-z0-9\s:.'\-—]+$/i, '')
      .replace(/(?:^|\s+)[a-z]{2}[a-z0-9\s:.'-]*(?=\s|$)/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (cjkPart.length >= 2 && CJK_CHAR_RE.test(cjkPart))
      push(cjkPart)

    const englishMatches = full.match(/[a-z][a-z0-9\s:.'-]+[a-z0-9]/gi) ?? []
    const longestEnglish = englishMatches
      .map(item => item.trim())
      .sort((a, b) => b.length - a.length)[0]
    if (longestEnglish && longestEnglish.length >= 2)
      push(longestEnglish)
  }

  const subParts = full.split(/\s*[:：—]\s*|\s+-\s+/)
  if (subParts.length > 1) {
    const mainTitle = subParts[0]?.trim() ?? ''
    if (mainTitle.length >= 2)
      push(mainTitle)
  }

  return queries
}

/**
 * 解析电影 / 剧集文件名，提取干净片名、年份、类型与剧集号；
 * 当文件名仅含集数/纯数字（如 S01E01.mkv、01.mp4）且提供了父目录名时，自动回退解析父目录名。
 */
export function parseCinemaTitle(rawInput: string, fallbackFolderName?: string): ParsedCinemaTitle {
  const {
    working,
    bareStem,
    mediaType,
    season,
    episode,
    year,
  } = stripCinemaFilenameToWorking(rawInput)

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
