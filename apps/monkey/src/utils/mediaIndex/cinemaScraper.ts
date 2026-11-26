import type { CacheValue } from '@115master/shared'
import type { ScrapeResult } from './scraperRegistry'
import type { MediaActor, UnifiedMediaMeta } from './types'
import { CacheCore } from '@115master/shared'
import { STORE_NAME } from '@/utils/cache/const'
import { appLogger } from '@/utils/logger'
import { GMRequest } from '@/utils/request/gmRequest'
import { userSettings } from '@/utils/userSettings'
import { buildCinemaSearchQueries, parseCinemaTitle } from './cinemaTitleParser'

const logger = appLogger.sub('CinemaScraper')
const gm = new GMRequest()

const CINEMA_STORE_NAME = 'cinema_meta_v1'
const DEFAULT_TMDB_API_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'
const DOUBAN_SUGGEST_URL = 'https://movie.douban.com/j/subject_suggest'
const DOUBAN_ABSTRACT_URL = 'https://movie.douban.com/j/subject_abstract'
const DOUBAN_SUBJECT_BASE = 'https://movie.douban.com/subject'
const CINEMA_REQUEST_TIMEOUT_MS = 10000

class CinemaMetaCache extends CacheCore<UnifiedMediaMeta> {
  constructor() {
    super({
      name: STORE_NAME,
      storeName: CINEMA_STORE_NAME,
      enableQuotaManagement: false,
      logger: appLogger.sub('CinemaMetaCache'),
    })
  }
}

export const cinemaCache = new CinemaMetaCache()

/** 读取本地全部院线影视缓存元数据 */
export async function readAllCachedCinemaMeta(): Promise<Map<string, UnifiedMediaMeta>> {
  const result = new Map<string, UnifiedMediaMeta>()
  try {
    await cinemaCache.storage.iterate<CacheValue<UnifiedMediaMeta>, void>((entry: CacheValue<UnifiedMediaMeta> | null) => {
      const meta = entry?.value
      if (meta?.mediaKey && meta.title)
        result.set(meta.mediaKey, meta)
    })
  }
  catch (error) {
    logger.warn('读取本地院线影视元数据缓存失败', error)
  }
  return result
}

/** 持久化单条院线影视元数据 */
export async function saveCinemaMeta(meta: UnifiedMediaMeta): Promise<void> {
  await cinemaCache.set(meta.mediaKey, meta)
}

/** 解析生效的 TMDB API 基址（支持可选自定义反代 URL，未配置或非法时回退官方地址） */
export function resolveTmdbApiBase(proxyUrl?: string): string {
  const trimmed = proxyUrl?.trim() ?? ''
  if (!trimmed)
    return DEFAULT_TMDB_API_BASE
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return DEFAULT_TMDB_API_BASE
    const clean = trimmed.replace(/\/+$/, '')
    return clean.endsWith('/3') ? clean : `${clean}/3`
  }
  catch {
    return DEFAULT_TMDB_API_BASE
  }
}

interface TmdbSearchCandidate {
  id?: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  overview?: string
  poster_path?: string
  backdrop_path?: string
  release_date?: string
  first_air_date?: string
  vote_average?: number
}

interface TmdbSearchResponse {
  results?: TmdbSearchCandidate[]
}

interface TmdbDetailResponse {
  id?: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  overview?: string
  poster_path?: string
  backdrop_path?: string
  release_date?: string
  first_air_date?: string
  runtime?: number
  episode_run_time?: number[]
  vote_average?: number
  genres?: Array<{ name?: string }>
  credits?: {
    cast?: Array<{
      name?: string
      profile_path?: string
      gender?: number
    }>
    crew?: Array<{
      name?: string
      job?: string
    }>
  }
}

function isTmdbBearerToken(key: string): boolean {
  return key.length > 40 || key.startsWith('eyJ')
}

async function tmdbFetchJson<T>(
  apiBase: string,
  path: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<{ status: number, data?: T }> {
  const isBearer = isTmdbBearerToken(apiKey)
  const queryParams = isBearer ? params : { ...params, api_key: apiKey }
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(isBearer ? { Authorization: `Bearer ${apiKey}` } : {}),
  }

  const response = await gm.get(`${apiBase}${path}`, {
    params: queryParams,
    headers,
    timeout: CINEMA_REQUEST_TIMEOUT_MS,
  })
  if (response.status !== 200)
    return { status: response.status }
  return { status: 200, data: await response.json() as T }
}

async function scrapeFromTmdb(params: {
  mediaKey: string
  title: string
  queries: string[]
  year?: number
  mediaType: 'movie' | 'tv'
  apiKey: string
  apiBase: string
}): Promise<{ meta: UnifiedMediaMeta | null, rateLimited?: boolean, error?: string }> {
  const { mediaKey, title, queries, year, mediaType, apiKey, apiBase } = params
  let resolvedType: 'movie' | 'tv' = mediaType
  let candidate: TmdbSearchCandidate | undefined

  for (const query of queries) {
    const searchParams: Record<string, string> = {
      query,
      language: 'zh-CN',
      include_adult: 'false',
      ...(year ? { [mediaType === 'tv' ? 'first_air_date_year' : 'year']: String(year) } : {}),
    }

    let searchRes = await tmdbFetchJson<TmdbSearchResponse>(apiBase, `/search/${mediaType}`, searchParams, apiKey)
    if (searchRes.status === 429)
      return { meta: null, rateLimited: true, error: 'TMDB 请求过于频繁 (HTTP 429)' }
    if (searchRes.status === 401 || searchRes.status === 403)
      return { meta: null, error: 'TMDB API Key 无效或已失效' }
    if (searchRes.status !== 200)
      return { meta: null, error: `TMDB 搜索失败 (HTTP ${searchRes.status})` }

    candidate = searchRes.data?.results?.[0]
    if (!candidate && year) {
      const retryParams = { query, language: 'zh-CN', include_adult: 'false' }
      searchRes = await tmdbFetchJson<TmdbSearchResponse>(apiBase, `/search/${mediaType}`, retryParams, apiKey)
      candidate = searchRes.data?.results?.[0]
    }
    if (!candidate) {
      const altType: 'movie' | 'tv' = mediaType === 'movie' ? 'tv' : 'movie'
      const altRes = await tmdbFetchJson<TmdbSearchResponse>(apiBase, `/search/${altType}`, {
        query,
        language: 'zh-CN',
        include_adult: 'false',
      }, apiKey)
      if (altRes.data?.results?.[0]) {
        candidate = altRes.data.results[0]
        resolvedType = altType
      }
    }

    if (candidate?.id)
      break
  }

  if (!candidate?.id)
    return { meta: null }

  const detailRes = await tmdbFetchJson<TmdbDetailResponse>(
    apiBase,
    `/${resolvedType}/${candidate.id}`,
    { language: 'zh-CN', append_to_response: 'credits' },
    apiKey,
  )
  const detail = detailRes.data
  const resolvedTitle = detail?.title || detail?.name || candidate.title || candidate.name || title
  const releaseDate = detail?.release_date || detail?.first_air_date || candidate.release_date || candidate.first_air_date
  const parsedYear = releaseDate ? Number(releaseDate.slice(0, 4)) : undefined
  const posterPath = detail?.poster_path || candidate.poster_path
  const backdropPath = detail?.backdrop_path || candidate.backdrop_path
  const posterUrl = posterPath ? `${TMDB_IMAGE_BASE}/w500${posterPath}` : undefined
  const backdropUrl = backdropPath ? `${TMDB_IMAGE_BASE}/w1280${backdropPath}` : undefined

  const directors = Array.from(new Set(
    (detail?.credits?.crew ?? [])
      .filter(member => member.job === 'Director' && member.name)
      .map(member => member.name!.trim()),
  ))

  const actors: MediaActor[] = (detail?.credits?.cast ?? [])
    .filter(cast => Boolean(cast.name?.trim()))
    .slice(0, 12)
    .map(cast => ({
      name: cast.name!.trim(),
      ...(cast.profile_path ? { avatarUrl: `${TMDB_IMAGE_BASE}/w185${cast.profile_path}` } : {}),
      ...(cast.gender === 1 ? { sex: 1 as const } : cast.gender === 2 ? { sex: 0 as const } : {}),
    }))

  const genres = (detail?.genres ?? [])
    .map(g => g.name?.trim() ?? '')
    .filter(Boolean)

  const duration = detail?.runtime ?? detail?.episode_run_time?.[0]
  const rawRating = detail?.vote_average ?? candidate.vote_average

  const meta: UnifiedMediaMeta = {
    mediaKey,
    kind: resolvedType,
    externalId: `tmdb:${candidate.id}`,
    title: resolvedTitle,
    originalTitle: detail?.original_title || detail?.original_name || candidate.original_title || candidate.original_name,
    overview: (detail?.overview || candidate.overview || '').trim() || undefined,
    coverUrl: posterUrl,
    posterUrl,
    backdropUrl,
    releaseDate: releaseDate || undefined,
    year: parsedYear && Number.isFinite(parsedYear) ? parsedYear : year,
    ...(duration && duration > 0 ? { duration } : {}),
    ...(rawRating && rawRating > 0 ? { rating: Math.round(rawRating * 10) / 10 } : {}),
    directors,
    actors,
    genres,
    source: 'TMDB',
    detailUrl: `https://www.themoviedb.org/${resolvedType}/${candidate.id}`,
    updatedAt: Date.now(),
  }

  return { meta }
}

interface DoubanSuggestItem {
  id?: string
  title?: string
  sub_title?: string
  year?: string
  img?: string
  url?: string
  type?: string
}

interface DoubanAbstractSubject {
  id?: string
  title?: string
  rate?: string | number
  url?: string
  is_tv?: boolean
  subtype?: string
  directors?: string[]
  actors?: string[]
  duration?: string
  types?: string[]
  release_year?: string
  short_comment?: {
    content?: string
    author?: string
  }
}

interface DoubanAbstractResponse {
  r?: number
  subject?: DoubanAbstractSubject
}

interface DoubanLdJson {
  name?: string
  image?: string
  datePublished?: string
  description?: string
  genre?: string | string[]
  director?: Array<{ name?: string }> | { name?: string }
  actor?: Array<{ name?: string }> | { name?: string }
  aggregateRating?: { ratingValue?: string | number }
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (!val)
    return []
  return Array.isArray(val) ? val : [val]
}

function cleanDoubanTitle(raw: string): string {
  return raw
    .replace(/[\u200E\u200F\u202A-\u202E\uFEFF]/g, '')
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .trim()
}

function parseDoubanDuration(raw?: string): number | undefined {
  if (!raw)
    return undefined
  const match = raw.match(/(\d{1,4})\s*分钟/) ?? raw.match(/(\d{1,4})/)
  if (!match)
    return undefined
  const mins = Number(match[1])
  return Number.isFinite(mins) && mins > 0 ? mins : undefined
}

async function scrapeFromDouban(params: {
  mediaKey: string
  queries: string[]
  year?: number
  mediaType: 'movie' | 'tv'
}): Promise<{ meta: UnifiedMediaMeta | null, rateLimited?: boolean, challenge?: boolean, error?: string }> {
  const { mediaKey, queries, year, mediaType } = params
  let matched: DoubanSuggestItem | undefined

  for (const query of queries) {
    const suggestRes = await gm.get(DOUBAN_SUGGEST_URL, {
      params: { q: query },
      headers: { Referer: 'https://movie.douban.com/' },
      timeout: CINEMA_REQUEST_TIMEOUT_MS,
    })

    if (suggestRes.status === 429)
      return { meta: null, rateLimited: true, error: '豆瓣请求过于频繁 (HTTP 429)' }
    if (suggestRes.status === 403)
      return { meta: null, challenge: true, error: '豆瓣触发反爬校验 (HTTP 403)' }
    if (suggestRes.status !== 200)
      return { meta: null, error: `豆瓣搜索失败 (HTTP ${suggestRes.status})` }

    const candidates = await suggestRes.json() as DoubanSuggestItem[]
    if (!Array.isArray(candidates) || candidates.length === 0)
      continue

    const movieCandidates = candidates.filter(item => item.id && item.title)
    if (movieCandidates.length === 0)
      continue

    matched = (year
      ? movieCandidates.find(item => Number(item.year) === year)
      : undefined) ?? movieCandidates[0]!
    break
  }

  if (!matched)
    return { meta: null }

  const subjectId = matched.id!
  const detailUrl = `${DOUBAN_SUBJECT_BASE}/${subjectId}/`
  const fallbackYear = matched.year ? Number(matched.year) : year

  let abstractSubject: DoubanAbstractSubject | null = null
  try {
    const abstractRes = await gm.get(DOUBAN_ABSTRACT_URL, {
      params: { subject_id: subjectId },
      headers: {
        Referer: 'https://movie.douban.com/',
        Accept: 'application/json, text/plain, */*',
      },
      timeout: CINEMA_REQUEST_TIMEOUT_MS,
    })
    if (abstractRes.status === 200) {
      const abstractJson = await abstractRes.json() as DoubanAbstractResponse
      if (abstractJson?.r === 0 && abstractJson.subject)
        abstractSubject = abstractJson.subject
    }
  }
  catch {
    // JSON 接口受限时继续降级尝试 HTML 与 suggest
  }

  let ld: DoubanLdJson | null = null
  const missingCoreFromAbstract = !abstractSubject
    || (!abstractSubject.directors?.length && !abstractSubject.actors?.length && !abstractSubject.types?.length)
  if (missingCoreFromAbstract) {
    try {
      const detailRes = await gm.get(detailUrl, {
        headers: { Referer: 'https://movie.douban.com/' },
        timeout: CINEMA_REQUEST_TIMEOUT_MS,
      })
      if (detailRes.status === 200) {
        const html = await detailRes.text()
        const ldMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)
        if (ldMatch?.[1])
          ld = JSON.parse(ldMatch[1].trim()) as DoubanLdJson
      }
    }
    catch {
      // 详情页受限时保留 abstract / suggest 基础信息兜底
    }
  }

  const posterUrl = (ld?.image || matched.img || '').replace(/^http:\/\//i, 'https://') || undefined
  const rawRating = abstractSubject?.rate ?? ld?.aggregateRating?.ratingValue
  const ratingNum = rawRating !== undefined && rawRating !== '' ? Number(rawRating) : Number.NaN
  const releaseDate = ld?.datePublished?.trim() || undefined
  const abstractYear = abstractSubject?.release_year ? Number(abstractSubject.release_year) : Number.NaN
  const parsedYear = releaseDate
    ? Number(releaseDate.slice(0, 4))
    : (Number.isFinite(abstractYear) && abstractYear > 1900 ? abstractYear : fallbackYear)
  const resolvedKind: 'movie' | 'tv' = abstractSubject?.is_tv === true
    ? 'tv'
    : abstractSubject?.is_tv === false
      ? 'movie'
      : mediaType
  const duration = parseDoubanDuration(abstractSubject?.duration)

  const directors = abstractSubject?.directors?.length
    ? abstractSubject.directors.map(d => d.trim()).filter(Boolean)
    : toArray(ld?.director).map(d => d.name?.trim() ?? '').filter(Boolean)

  const actors = (abstractSubject?.actors?.length
    ? abstractSubject.actors.map(name => name.trim()).filter(Boolean)
    : toArray(ld?.actor).map(a => a.name?.trim() ?? '').filter(Boolean))
    .slice(0, 12)
    .map(name => ({ name }))

  const genres = abstractSubject?.types?.length
    ? abstractSubject.types.map(g => g.trim()).filter(Boolean)
    : toArray(ld?.genre).map(g => g.trim()).filter(Boolean)

  const resolvedTitle = cleanDoubanTitle(abstractSubject?.title || ld?.name || matched.title!)
    || matched.title!.trim()

  const meta: UnifiedMediaMeta = {
    mediaKey,
    kind: resolvedKind,
    externalId: `douban:${subjectId}`,
    title: resolvedTitle,
    originalTitle: matched.sub_title?.trim() || undefined,
    overview: ld?.description?.trim() || abstractSubject?.short_comment?.content?.trim() || undefined,
    coverUrl: posterUrl,
    coverReferer: detailUrl,
    posterUrl,
    releaseDate,
    year: parsedYear && Number.isFinite(parsedYear) ? parsedYear : undefined,
    ...(duration ? { duration } : {}),
    ...(Number.isFinite(ratingNum) && ratingNum > 0 ? { rating: ratingNum } : {}),
    directors,
    actors,
    genres,
    source: 'Douban',
    detailUrl,
    updatedAt: Date.now(),
  }

  return { meta }
}

/**
 * 联网刮削院线影视元数据（优先 TMDB，未配置 Key 或 TMDB 异常/未命中时自动回退豆瓣）
 */
export async function scrapeCinemaMetaDetailed(params: {
  mediaKey: string
  filename: string
  folderName?: string
  customQuery?: string
  kindHint?: 'movie' | 'tv'
}): Promise<ScrapeResult> {
  const parsed = parseCinemaTitle(params.customQuery?.trim() || params.filename, params.folderName)
  const queries = buildCinemaSearchQueries(parsed)
  if (queries.length === 0)
    return { status: 'not_found' }

  const mediaType = params.kindHint ?? parsed.mediaType
  const apiKey = userSettings.value.tmdbApiKey.trim()
  const apiBase = resolveTmdbApiBase(userSettings.value.tmdbProxyUrl)

  let tmdbFailure: { status: 'rate_limited' | 'network_error', reason: string } | null = null

  if (apiKey) {
    try {
      const tmdbResult = await scrapeFromTmdb({
        mediaKey: params.mediaKey,
        title: parsed.title,
        queries,
        year: parsed.year,
        mediaType,
        apiKey,
        apiBase,
      })
      if (tmdbResult.meta) {
        await saveCinemaMeta(tmdbResult.meta)
        return { status: 'ok', meta: tmdbResult.meta }
      }
      if (tmdbResult.rateLimited) {
        tmdbFailure = { status: 'rate_limited', reason: tmdbResult.error ?? 'TMDB 限流' }
      }
      else if (tmdbResult.error) {
        logger.warn('TMDB 刮削异常，自动回退豆瓣', tmdbResult.error)
        tmdbFailure = { status: 'network_error', reason: tmdbResult.error }
      }
    }
    catch (error) {
      const reason = error instanceof Error ? error.message : String(error ?? 'TMDB 请求异常')
      logger.warn('TMDB 请求异常，自动回退豆瓣', reason)
      tmdbFailure = { status: 'network_error', reason }
    }
  }

  try {
    const doubanResult = await scrapeFromDouban({
      mediaKey: params.mediaKey,
      queries,
      year: parsed.year,
      mediaType,
    })
    if (doubanResult.meta) {
      await saveCinemaMeta(doubanResult.meta)
      return { status: 'ok', meta: doubanResult.meta }
    }
    if (doubanResult.rateLimited)
      return { status: 'rate_limited', reason: doubanResult.error ?? '豆瓣限流' }
    if (doubanResult.challenge)
      return { status: 'challenge', reason: doubanResult.error ?? '豆瓣反爬校验' }
    if (doubanResult.error)
      return { status: 'network_error', reason: doubanResult.error }
    if (tmdbFailure)
      return tmdbFailure

    return { status: 'not_found' }
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error ?? '网络异常')
    return { status: 'network_error', reason }
  }
}
