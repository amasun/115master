import type { CacheValue } from '@115master/shared'
import type { ScrapeResult } from './scraperRegistry'
import type { MediaActor, UnifiedMediaMeta } from './types'
import { CacheCore } from '@115master/shared'
import { STORE_NAME } from '@/utils/cache/const'
import { appLogger } from '@/utils/logger'
import { GMRequest } from '@/utils/request/gmRequest'
import { userSettings } from '@/utils/userSettings'
import { parseCinemaTitle } from './cinemaTitleParser'

const logger = appLogger.sub('CinemaScraper')
const gm = new GMRequest()

const CINEMA_STORE_NAME = 'cinema_meta_v1'
const TMDB_API_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'
const DOUBAN_SUGGEST_URL = 'https://movie.douban.com/j/subject_suggest'
const DOUBAN_SUBJECT_BASE = 'https://movie.douban.com/subject'

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

interface TmdbSearchResponse {
  results?: Array<{
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
  }>
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

async function tmdbFetchJson<T>(path: string, params: Record<string, string>, apiKey: string): Promise<{ status: number, data?: T }> {
  const isBearer = isTmdbBearerToken(apiKey)
  const queryParams = isBearer ? params : { ...params, api_key: apiKey }
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(isBearer ? { Authorization: `Bearer ${apiKey}` } : {}),
  }

  const response = await gm.get(`${TMDB_API_BASE}${path}`, {
    params: queryParams,
    headers,
  })
  if (response.status !== 200)
    return { status: response.status }
  return { status: 200, data: await response.json() as T }
}

async function scrapeFromTmdb(params: {
  mediaKey: string
  title: string
  year?: number
  mediaType: 'movie' | 'tv'
  apiKey: string
}): Promise<{ meta: UnifiedMediaMeta | null, rateLimited?: boolean, error?: string }> {
  const { mediaKey, title, year, mediaType, apiKey } = params
  const searchParams: Record<string, string> = {
    query: title,
    language: 'zh-CN',
    include_adult: 'false',
    ...(year ? { [mediaType === 'tv' ? 'first_air_date_year' : 'year']: String(year) } : {}),
  }

  let searchRes = await tmdbFetchJson<TmdbSearchResponse>(`/search/${mediaType}`, searchParams, apiKey)
  if (searchRes.status === 429)
    return { meta: null, rateLimited: true, error: 'TMDB 请求过于频繁 (HTTP 429)' }
  if (searchRes.status === 401 || searchRes.status === 403)
    return { meta: null, error: 'TMDB API Key 无效或已失效' }

  /** 若指定类型或年份未命中，回退 multi 搜索或去掉年份重试 */
  let resolvedType: 'movie' | 'tv' = mediaType
  let candidate = searchRes.data?.results?.[0]
  if (!candidate && year) {
    const retryParams = { query: title, language: 'zh-CN', include_adult: 'false' }
    searchRes = await tmdbFetchJson<TmdbSearchResponse>(`/search/${mediaType}`, retryParams, apiKey)
    candidate = searchRes.data?.results?.[0]
  }
  if (!candidate) {
    const altType: 'movie' | 'tv' = mediaType === 'movie' ? 'tv' : 'movie'
    const altRes = await tmdbFetchJson<TmdbSearchResponse>(`/search/${altType}`, {
      query: title,
      language: 'zh-CN',
      include_adult: 'false',
    }, apiKey)
    if (altRes.data?.results?.[0]) {
      candidate = altRes.data.results[0]
      resolvedType = altType
    }
  }

  if (!candidate?.id)
    return { meta: null }

  const detailRes = await tmdbFetchJson<TmdbDetailResponse>(
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

async function scrapeFromDouban(params: {
  mediaKey: string
  title: string
  year?: number
  mediaType: 'movie' | 'tv'
}): Promise<{ meta: UnifiedMediaMeta | null, rateLimited?: boolean, challenge?: boolean, error?: string }> {
  const { mediaKey, title, year, mediaType } = params
  const suggestRes = await gm.get(DOUBAN_SUGGEST_URL, {
    params: { q: title },
    headers: { Referer: 'https://movie.douban.com/' },
  })

  if (suggestRes.status === 429)
    return { meta: null, rateLimited: true, error: '豆瓣请求过于频繁 (HTTP 429)' }
  if (suggestRes.status === 403)
    return { meta: null, challenge: true, error: '豆瓣触发反爬校验 (HTTP 403)' }
  if (suggestRes.status !== 200)
    return { meta: null, error: `豆瓣搜索失败 (HTTP ${suggestRes.status})` }

  const candidates = await suggestRes.json() as DoubanSuggestItem[]
  if (!Array.isArray(candidates) || candidates.length === 0)
    return { meta: null }

  const movieCandidates = candidates.filter(item => item.id && item.title)
  if (movieCandidates.length === 0)
    return { meta: null }

  const matched = (year
    ? movieCandidates.find(item => Number(item.year) === year)
    : undefined) ?? movieCandidates[0]!

  const subjectId = matched.id!
  const detailUrl = `${DOUBAN_SUBJECT_BASE}/${subjectId}/`
  const fallbackYear = matched.year ? Number(matched.year) : year

  let ld: DoubanLdJson | null = null
  try {
    const detailRes = await gm.get(detailUrl, {
      headers: { Referer: 'https://movie.douban.com/' },
    })
    if (detailRes.status === 200) {
      const html = await detailRes.text()
      const ldMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)
      if (ldMatch?.[1])
        ld = JSON.parse(ldMatch[1].trim()) as DoubanLdJson
    }
  }
  catch {
    // 详情页受限时保留 suggest 基础信息兜底
  }

  const posterUrl = (ld?.image || matched.img || '').replace(/^http:\/\//i, 'https://') || undefined
  const ratingNum = ld?.aggregateRating?.ratingValue ? Number(ld.aggregateRating.ratingValue) : Number.NaN
  const releaseDate = ld?.datePublished?.trim() || undefined
  const parsedYear = releaseDate ? Number(releaseDate.slice(0, 4)) : fallbackYear

  const meta: UnifiedMediaMeta = {
    mediaKey,
    kind: mediaType,
    externalId: `douban:${subjectId}`,
    title: ld?.name?.trim() || matched.title!.trim(),
    originalTitle: matched.sub_title?.trim() || undefined,
    overview: ld?.description?.trim() || undefined,
    coverUrl: posterUrl,
    coverReferer: detailUrl,
    posterUrl,
    releaseDate,
    year: parsedYear && Number.isFinite(parsedYear) ? parsedYear : undefined,
    ...(Number.isFinite(ratingNum) && ratingNum > 0 ? { rating: ratingNum } : {}),
    directors: toArray(ld?.director).map(d => d.name?.trim() ?? '').filter(Boolean),
    actors: toArray(ld?.actor)
      .map(a => a.name?.trim() ?? '')
      .filter(Boolean)
      .slice(0, 12)
      .map(name => ({ name })),
    genres: toArray(ld?.genre).map(g => g.trim()).filter(Boolean),
    source: 'Douban',
    detailUrl,
    updatedAt: Date.now(),
  }

  return { meta }
}

/**
 * 联网刮削院线影视元数据（优先 TMDB，未配置 Key 或未命中时回退豆瓣）
 */
export async function scrapeCinemaMetaDetailed(params: {
  mediaKey: string
  filename: string
  folderName?: string
  customQuery?: string
  kindHint?: 'movie' | 'tv'
}): Promise<ScrapeResult> {
  const parsed = parseCinemaTitle(params.customQuery?.trim() || params.filename, params.folderName)
  const mediaType = params.kindHint ?? parsed.mediaType
  const apiKey = userSettings.value.tmdbApiKey.trim()

  try {
    if (apiKey) {
      const tmdbResult = await scrapeFromTmdb({
        mediaKey: params.mediaKey,
        title: parsed.title,
        year: parsed.year,
        mediaType,
        apiKey,
      })
      if (tmdbResult.meta) {
        await saveCinemaMeta(tmdbResult.meta)
        return { status: 'ok', meta: tmdbResult.meta }
      }
      if (tmdbResult.rateLimited)
        return { status: 'rate_limited', reason: tmdbResult.error ?? 'TMDB 限流' }
    }

    const doubanResult = await scrapeFromDouban({
      mediaKey: params.mediaKey,
      title: parsed.title,
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

    return { status: 'not_found' }
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error ?? '网络异常')
    return { status: 'network_error', reason }
  }
}
