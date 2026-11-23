import type { IRequest } from '@115master/shared'
import type {
  ActorFetchProgress,
  ActorWorksCacheEntry,
  ActorWorksSource,
} from './types'
import { cleanActorName, extractCleanElementText, normalizeActressName } from '@/utils/actressNameMatcher'
import { getAvNumber } from '@/utils/getNumber'
import { normalizeAvNumber } from '@/utils/jav/jav'
import { appLogger } from '@/utils/logger'
import { GMRequest } from '@/utils/request/gmRequest'
import { getCachedActorWorks, normalizeActorKey, saveActorWorks } from './actorWorksStore'

const logger = appLogger.sub('ActorWorksFetcher')

/** 单次默认最多拉取页数（防触发站点限流） */
export const DEFAULT_MAX_PAGES = 5
/** 单位演员允许继续加载的硬上限页数 */
export const HARD_MAX_PAGES = 15
/** 连续翻页最小延迟（ms） */
export const PAGE_DELAY_MIN_MS = 650
/** 连续翻页随机抖动范围（ms） */
export const PAGE_DELAY_JITTER_MS = 300
/** 数据源触发风控后的熔断冷却时间（5 分钟） */
export const SOURCE_COOLDOWN_MS = 5 * 60 * 1000

const JAVBUS_BASE_URL = 'https://www.javbus.com'
const JAVDB_BASE_URL = 'https://javdb.com'

const BLOCKED_STATUSES = new Set([403, 429, 503])
const ANTI_BOT_HTML_PATTERN = /just a moment|cf-challenge|challenge-platform|attention required!\s*\|\s*cloudflare/i
const JAVDB_LOGIN_WALL_PATTERN = /\/users\/sign_in|请先登录|請先登入/i
const KANA_PATTERN = /[\u3040-\u30FF]/
const ALIAS_PREFIX_PATTERN = /^(?:別名|别名|旧名|舊名)[:：]\s*/
const NON_ALIAS_META_PATTERN = /^(?:\d+\s*部|共\s*\d+|\d+$)/

/** 外部来源熔断时间戳（source -> 冷却结束时间 ms） */
const sourceBlockedUntil = new Map<ActorWorksSource, number>()

let defaultRequest: GMRequest | null = null

function getDefaultRequest(): IRequest {
  if (!defaultRequest)
    defaultRequest = new GMRequest({ timeout: 10000 })
  return defaultRequest
}

/** 外部光源触发防爬 / 限流 / 登录墙异常 */
export class ActorSourceBlockedError extends Error {
  readonly source: ActorWorksSource

  constructor(source: ActorWorksSource, message?: string) {
    super(message ?? `${sourceLabel(source)} 触发访问限制`)
    this.name = 'ActorSourceBlockedError'
    this.source = source
  }
}

/** 演员作品缓存适配器（支持测试注入） */
export interface ActorWorksStoreAdapter {
  get: (actorName: string, now?: number) => Promise<ActorWorksCacheEntry | null>
  save: (entry: ActorWorksCacheEntry) => Promise<void>
}

/** 在线演员作品反查参数 */
export interface FetchActorWorksOptions {
  /** 本次最多拉取页数（默认 5） */
  maxPages?: number
  /** 起始页码（默认 1） */
  startPage?: number
  /** 是否跳过缓存强制刷新 */
  forceRefresh?: boolean
  /** 已有缓存条目（用于「加载更多」延续翻页） */
  existingEntry?: ActorWorksCacheEntry | null
  /** 取消信号 */
  signal?: AbortSignal
  /** 抓取进度回调 */
  onProgress?: (progress: ActorFetchProgress) => void
  /** 自定义请求客户端（测试用） */
  request?: IRequest
  /** 自定义延时函数（测试用） */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** 自定义时钟函数（测试用） */
  now?: () => number
  /** 自定义缓存读写（测试用） */
  store?: ActorWorksStoreAdapter
}

interface ActorCandidate {
  name: string
  aliases: string[]
  url: string
}

interface SourcePageResult {
  avNumbers: string[]
  hasMore: boolean
  itemCount: number
}

function sourceLabel(source: ActorWorksSource): string {
  return source === 'javbus' ? 'JavBus' : 'JavDB'
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw signal.reason ?? new DOMException('已取消演员作品查询', 'AbortError')
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted)
    return Promise.reject(signal.reason ?? new DOMException('已取消演员作品查询', 'AbortError'))
  if (ms <= 0)
    return Promise.resolve()

  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    function onAbort() {
      if (timer !== undefined)
        clearTimeout(timer)
      reject(signal?.reason ?? new DOMException('已取消演员作品查询', 'AbortError'))
    }
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function nextPageDelayMs(): number {
  return PAGE_DELAY_MIN_MS + Math.floor(Math.random() * PAGE_DELAY_JITTER_MS)
}

/** 重置各数据源熔断冷却状态（供测试使用） */
export function resetActorFetcherCircuitBreaker(): void {
  sourceBlockedUntil.clear()
}

/** 检测响应是否命中 HTTP 限流、Cloudflare 质询或登录墙 */
export function isBlockedResponse(status: number, html: string, source: ActorWorksSource): boolean {
  if (BLOCKED_STATUSES.has(status))
    return true
  if (ANTI_BOT_HTML_PATTERN.test(html))
    return true
  if (source === 'javdb' && JAVDB_LOGIN_WALL_PATTERN.test(html))
    return !/\b(?:actor-box|movie-list)\b/.test(html)
  return false
}

function parseDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function splitAliases(rawText: string): string[] {
  const parts = rawText
    .split(/[（）()、,，/]+/)
    .map(part => cleanActorName(part))
    .filter(Boolean)
  if (parts.length > 0)
    return Array.from(new Set(parts))
  const full = cleanActorName(rawText)
  return full ? [full] : []
}

function collectUniqueAliases(names: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of names) {
    const trimmed = raw.replace(/\s+/g, ' ').trim()
    if (!trimmed || seen.has(trimmed))
      continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

function extractNormalizedAv(rawText: string): string | null {
  const text = rawText.trim()
  if (!text || /^\d{4}-\d{2}-\d{2}$/.test(text))
    return null
  const normalized = normalizeAvNumber(getAvNumber(text) ?? text)
  return normalized.length >= 2 ? normalized : null
}

function pickBestActorCandidate(candidates: ActorCandidate[], queryName: string): ActorCandidate | null {
  if (candidates.length === 0)
    return null

  const target = normalizeActressName(queryName)
  if (!target)
    return candidates.length === 1 ? candidates[0]! : null

  const exact = candidates.find(candidate =>
    normalizeActressName(candidate.name) === target
    || candidate.aliases.some(alias => normalizeActressName(alias) === target),
  )
  if (exact)
    return exact

  const fuzzy = candidates.find((candidate) => {
    const normalizedName = normalizeActressName(candidate.name)
    return normalizedName.includes(target)
      || target.includes(normalizedName)
      || candidate.aliases.some((alias) => {
        const normalizedAlias = normalizeActressName(alias)
        return normalizedAlias.includes(target) || target.includes(normalizedAlias)
      })
  })
  if (fuzzy)
    return fuzzy

  return candidates.length === 1 ? candidates[0]! : null
}

/** 提取中文译名的纯汉字前缀作为日文假名兜底检索词 */
export function buildHanPrefixFallback(actorName: string): string | null {
  const trimmed = actorName.trim()
  if (!trimmed || KANA_PATTERN.test(trimmed))
    return null

  const match = trimmed.match(/^\p{Script=Han}+/u)
  if (!match)
    return null

  const han = match[0]
  if (han.length >= 4)
    return han.slice(0, 3)
  if (han.length === 3)
    return han.slice(0, 2)
  return null
}

function pickPrefixFallbackCandidate(candidates: ActorCandidate[], prefix: string): ActorCandidate | null {
  const normalizedPrefix = normalizeActressName(prefix)
  if (!normalizedPrefix || candidates.length === 0)
    return null

  const startsWithMatches = candidates.filter((candidate) => {
    const names = [candidate.name, ...candidate.aliases]
    return names.some(name => normalizeActressName(name).startsWith(normalizedPrefix))
  })
  if (startsWithMatches.length === 0)
    return null

  const kanaMatch = startsWithMatches.find((candidate) => {
    const names = [candidate.name, ...candidate.aliases]
    return names.some(name =>
      normalizeActressName(name).startsWith(normalizedPrefix) && KANA_PATTERN.test(name),
    )
  })
  if (kanaMatch)
    return kanaMatch

  return startsWithMatches.length === 1 ? startsWithMatches[0]! : null
}

function parseJavBusCandidates(html: string): ActorCandidate[] {
  const doc = parseDocument(html)
  return Array.from(doc.querySelectorAll('.avatar-box')).flatMap((box) => {
    const link = box.matches('a[href]') ? box : box.querySelector('a[href]')
    const href = link?.getAttribute('href')?.trim()
    if (!href)
      return []
    const rawName = (
      cleanActorName(box.querySelector('img')?.getAttribute('title') ?? '')
      || extractCleanElementText(box.querySelector('span'))
      || extractCleanElementText(link)
    )
    if (!rawName)
      return []
    return [{
      name: rawName,
      aliases: splitAliases(rawName),
      url: new URL(href, JAVBUS_BASE_URL).href,
    }]
  })
}

function parseJavBusProfileAliases(html: string): string[] {
  const doc = parseDocument(html)
  return Array.from(doc.querySelectorAll('.avatar-box .photo-info p')).flatMap((p) => {
    const text = (p.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!ALIAS_PREFIX_PATTERN.test(text))
      return []
    const cleaned = text.replace(ALIAS_PREFIX_PATTERN, '').trim()
    return cleaned ? splitAliases(cleaned) : []
  })
}

function buildJavBusPageUrl(profileUrl: string, page: number): string {
  const cleanUrl = profileUrl.replace(/\/+$/, '')
  return page <= 1 ? cleanUrl : `${cleanUrl}/${page}`
}

function parseJavBusWorksPage(html: string, page: number): SourcePageResult {
  const doc = parseDocument(html)
  const items = doc.querySelectorAll('.movie-box')
  const avNumbers = Array.from(doc.querySelectorAll('.movie-box date')).flatMap((el) => {
    const av = extractNormalizedAv(el.textContent ?? '')
    return av ? [av] : []
  })

  if (items.length === 0) {
    return { avNumbers, hasMore: false, itemCount: 0 }
  }

  const nextAnchor = doc.querySelector('a#next')
  const hasExplicitNext = Boolean(nextAnchor?.getAttribute('href')?.trim())
  const nextPagePattern = new RegExp(`/${page + 1}(?:[/?#]|$)`)
  const hasPageLink = Array.from(doc.querySelectorAll('.pagination a[href], ul.pagination a[href]')).some((anchor) => {
    const href = anchor.getAttribute('href') ?? ''
    return nextPagePattern.test(href) || anchor.textContent?.trim() === String(page + 1)
  })

  return {
    avNumbers,
    hasMore: hasExplicitNext || hasPageLink,
    itemCount: items.length,
  }
}

function parseJavDBCandidates(html: string): ActorCandidate[] {
  const doc = parseDocument(html)
  const links = doc.querySelectorAll('.actor-box a[href*="/actors/"], a.actor-box[href*="/actors/"]')
  return Array.from(links).flatMap((link) => {
    const href = link.getAttribute('href')?.trim()
    if (!href)
      return []
    const primary = cleanActorName(
      link.querySelector('strong')?.textContent
      || link.getAttribute('title')
      || extractCleanElementText(link)
      || '',
    )
    const rawText = extractCleanElementText(link)
    if (!primary && !rawText)
      return []
    return [{
      name: primary || rawText,
      aliases: splitAliases(rawText || primary),
      url: new URL(href, JAVDB_BASE_URL).href,
    }]
  })
}

function parseJavDBProfileAliases(html: string): string[] {
  const doc = parseDocument(html)
  return Array.from(doc.querySelectorAll('.actor-section-name, .section-meta, .title .actor-name')).flatMap((el) => {
    const raw = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!raw)
      return []
    const cleaned = raw.replace(ALIAS_PREFIX_PATTERN, '').trim()
    if (!cleaned || NON_ALIAS_META_PATTERN.test(cleaned))
      return []
    return splitAliases(cleaned)
  })
}

function buildJavDBPageUrl(profileUrl: string, page: number): string {
  if (page <= 1)
    return profileUrl
  const url = new URL(profileUrl)
  url.searchParams.set('page', String(page))
  return url.href
}

function parseJavDBWorksPage(html: string): SourcePageResult {
  const doc = parseDocument(html)
  const items = doc.querySelectorAll('.movie-list .item')
  const avNumbers = Array.from(items).flatMap((item) => {
    const avText = item.querySelector('.video-title strong, .uid')?.textContent ?? ''
    const av = extractNormalizedAv(avText)
    return av ? [av] : []
  })

  if (items.length === 0) {
    return { avNumbers, hasMore: false, itemCount: 0 }
  }

  const nextEl = doc.querySelector('.pagination-next')
  const nextHref = nextEl?.getAttribute('href')?.trim()
  const hasMore = Boolean(
    nextEl
    && nextHref
    && !nextEl.hasAttribute('disabled')
    && !nextEl.classList.contains('is-disabled'),
  )

  return {
    avNumbers,
    hasMore,
    itemCount: items.length,
  }
}

async function fetchHtml(
  request: IRequest,
  url: string,
  source: ActorWorksSource,
  signal?: AbortSignal,
): Promise<string | null> {
  throwIfAborted(signal)
  const response = await request.get(url, { redirect: 'follow', signal })
  const html = await response.text()

  if (isBlockedResponse(response.status, html, source))
    throw new ActorSourceBlockedError(source, `${sourceLabel(source)} 触发限流或验证保护（HTTP ${response.status}）`)

  if (response.status === 404)
    return null

  if (response.status < 200 || response.status >= 400)
    throw new Error(`${sourceLabel(source)} 请求失败（HTTP ${response.status}）`)

  return html
}

async function paginateActorWorks(params: {
  source: ActorWorksSource
  profileUrl: string
  startPage: number
  endPage: number
  initialAvNumbers: string[]
  sleepBeforeFirstPage: boolean
  request: IRequest
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
  signal?: AbortSignal
  onProgress?: (progress: ActorFetchProgress) => void
}): Promise<{ avNumbers: string[], profileAliases: string[], fetchedPages: number, hasMore: boolean }> {
  const avSet = new Set(params.initialAvNumbers)
  const profileAliases: string[] = []
  let fetchedPages = params.startPage - 1
  let hasMore = false

  for (let page = params.startPage; page <= params.endPage; page += 1) {
    throwIfAborted(params.signal)

    if (page > params.startPage || params.sleepBeforeFirstPage) {
      await params.sleep(nextPageDelayMs(), params.signal)
    }

    params.onProgress?.({
      source: params.source,
      page,
      maxPages: params.endPage,
      collected: avSet.size,
      stage: 'fetching',
    })

    const pageUrl = params.source === 'javbus'
      ? buildJavBusPageUrl(params.profileUrl, page)
      : buildJavDBPageUrl(params.profileUrl, page)

    const html = await fetchHtml(params.request, pageUrl, params.source, params.signal)
    if (!html) {
      hasMore = false
      break
    }

    if (page === 1) {
      const extracted = params.source === 'javbus'
        ? parseJavBusProfileAliases(html)
        : parseJavDBProfileAliases(html)
      profileAliases.push(...extracted)
    }

    const parsed = params.source === 'javbus'
      ? parseJavBusWorksPage(html, page)
      : parseJavDBWorksPage(html)

    for (const av of parsed.avNumbers)
      avSet.add(av)

    fetchedPages = page
    hasMore = parsed.hasMore

    if (parsed.itemCount === 0 || !parsed.hasMore)
      break
  }

  return {
    avNumbers: Array.from(avSet),
    profileAliases,
    fetchedPages,
    hasMore,
  }
}

function buildSearchUrl(source: ActorWorksSource, keyword: string): string {
  return source === 'javbus'
    ? `${JAVBUS_BASE_URL}/searchstar/${encodeURIComponent(keyword)}`
    : `${JAVDB_BASE_URL}/search?q=${encodeURIComponent(keyword)}&f=actor`
}

function parseSourceSearchCandidates(source: ActorWorksSource, html: string): ActorCandidate[] {
  return source === 'javbus' ? parseJavBusCandidates(html) : parseJavDBCandidates(html)
}

async function fetchFromSource(params: {
  source: ActorWorksSource
  actorName: string
  startPage: number
  endPage: number
  request: IRequest
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
  now: () => number
  signal?: AbortSignal
  onProgress?: (progress: ActorFetchProgress) => void
}): Promise<ActorWorksCacheEntry | null> {
  params.onProgress?.({
    source: params.source,
    page: 0,
    maxPages: params.endPage,
    collected: 0,
    stage: 'searching',
  })

  const searchHtml = await fetchHtml(
    params.request,
    buildSearchUrl(params.source, params.actorName),
    params.source,
    params.signal,
  )
  let candidate = searchHtml
    ? pickBestActorCandidate(parseSourceSearchCandidates(params.source, searchHtml), params.actorName)
    : null

  if (!candidate) {
    const prefix = buildHanPrefixFallback(params.actorName)
    if (prefix) {
      await params.sleep(nextPageDelayMs(), params.signal)
      const fallbackHtml = await fetchHtml(
        params.request,
        buildSearchUrl(params.source, prefix),
        params.source,
        params.signal,
      )
      if (fallbackHtml) {
        candidate = pickPrefixFallbackCandidate(
          parseSourceSearchCandidates(params.source, fallbackHtml),
          prefix,
        )
      }
    }
  }

  if (!candidate)
    return null

  const paged = await paginateActorWorks({
    source: params.source,
    profileUrl: candidate.url,
    startPage: params.startPage,
    endPage: params.endPage,
    initialAvNumbers: [],
    sleepBeforeFirstPage: true,
    request: params.request,
    sleep: params.sleep,
    signal: params.signal,
    onProgress: params.onProgress,
  })

  if (paged.avNumbers.length === 0)
    return null

  const aliases = collectUniqueAliases([
    params.actorName,
    candidate.name,
    ...candidate.aliases,
    ...paged.profileAliases,
  ])
  return {
    actorKey: normalizeActorKey(params.actorName) || normalizeActorKey(candidate.name),
    name: candidate.name || params.actorName,
    aliases,
    source: params.source,
    profileUrl: candidate.url,
    avNumbers: paged.avNumbers,
    fetchedPages: paged.fetchedPages,
    hasMore: paged.hasMore,
    cachedAt: params.now(),
  }
}

/**
 * 在线反查演员作品番号表（JavBus 优先，失败/缺失自动降级 JavDB，内置 7 天缓存与 5 分钟熔断）
 */
export async function fetchActorWorks(
  actorName: string,
  options: FetchActorWorksOptions = {},
): Promise<{ entry: ActorWorksCacheEntry, fromCache: boolean }> {
  const trimmedName = actorName.trim()
  if (!trimmedName)
    throw new Error('请输入演员姓名')

  const nowFn = options.now ?? (() => Date.now())
  const sleepFn = options.sleep ?? defaultSleep
  const request = options.request ?? getDefaultRequest()
  const store = options.store ?? {
    get: getCachedActorWorks,
    save: saveActorWorks,
  }

  if (!options.forceRefresh && !options.existingEntry) {
    const cached = await store.get(trimmedName, nowFn())
    if (cached)
      return { entry: cached, fromCache: true }
  }

  // 加载更多分页（沿用现有数据源与主页链接）
  if (options.existingEntry) {
    const existing = options.existingEntry
    if (!existing.hasMore || existing.fetchedPages >= HARD_MAX_PAGES) {
      return {
        entry: { ...existing, hasMore: false },
        fromCache: true,
      }
    }

    const blockedUntil = sourceBlockedUntil.get(existing.source) ?? 0
    if (nowFn() < blockedUntil) {
      throw new ActorSourceBlockedError(
        existing.source,
        `${sourceLabel(existing.source)} 触发限流冷却中，请稍后再试`,
      )
    }

    const startPage = Math.max(1, options.startPage ?? existing.fetchedPages + 1)
    const maxPages = Math.max(1, options.maxPages ?? DEFAULT_MAX_PAGES)
    const endPage = Math.min(startPage + maxPages - 1, HARD_MAX_PAGES)

    try {
      const paged = await paginateActorWorks({
        source: existing.source,
        profileUrl: existing.profileUrl,
        startPage,
        endPage,
        initialAvNumbers: existing.avNumbers,
        sleepBeforeFirstPage: false,
        request,
        sleep: sleepFn,
        signal: options.signal,
        onProgress: options.onProgress,
      })

      const updated: ActorWorksCacheEntry = {
        ...existing,
        avNumbers: paged.avNumbers,
        fetchedPages: Math.max(existing.fetchedPages, paged.fetchedPages),
        hasMore: paged.hasMore,
        cachedAt: nowFn(),
      }
      await store.save(updated)
      return { entry: updated, fromCache: false }
    }
    catch (error) {
      if (error instanceof ActorSourceBlockedError)
        sourceBlockedUntil.set(existing.source, nowFn() + SOURCE_COOLDOWN_MS)
      throw error
    }
  }

  /** 新查询：JavBus -> JavDB 自动降级 */
  const startPage = Math.max(1, options.startPage ?? 1)
  const maxPages = Math.max(1, options.maxPages ?? DEFAULT_MAX_PAGES)
  const endPage = Math.min(startPage + maxPages - 1, HARD_MAX_PAGES)

  const sources: ActorWorksSource[] = ['javbus', 'javdb']
  let sawBlocked = false
  let sawNotFound = false
  let lastError: Error | null = null

  for (const source of sources) {
    throwIfAborted(options.signal)

    const blockedUntil = sourceBlockedUntil.get(source) ?? 0
    if (nowFn() < blockedUntil) {
      sawBlocked = true
      logger.warn(`${sourceLabel(source)} 处于熔断冷却期，跳过本次请求`)
      continue
    }

    try {
      const entry = await fetchFromSource({
        source,
        actorName: trimmedName,
        startPage,
        endPage,
        request,
        sleep: sleepFn,
        now: nowFn,
        signal: options.signal,
        onProgress: options.onProgress,
      })
      if (entry) {
        await store.save(entry)
        return { entry, fromCache: false }
      }
      sawNotFound = true
    }
    catch (error) {
      if (isAbortError(error) || options.signal?.aborted)
        throw error
      if (error instanceof ActorSourceBlockedError) {
        sawBlocked = true
        sourceBlockedUntil.set(source, nowFn() + SOURCE_COOLDOWN_MS)
        lastError = error
        logger.warn(`${sourceLabel(source)} 触发限流保护，已进入 5 分钟冷却`, error.message)
        continue
      }
      lastError = error instanceof Error ? error : new Error(String(error))
      logger.warn(`${sourceLabel(source)} 查询失败，准备降级`, lastError.message)
    }
  }

  if (sawBlocked && !sawNotFound)
    throw new Error('外部数据源触发防爬或限流保护，已自动熔断冷却，请稍后再试或使用本地搜索')

  if (sawBlocked && sawNotFound)
    throw new Error('部分外部数据源触发限流，其余数据源未找到该演员作品')

  if (lastError)
    throw new Error(`在线反查演员作品失败：${lastError.message}`)

  throw new Error(`未在 JavBus / JavDB 找到演员「${trimmedName}」的作品列表`)
}
