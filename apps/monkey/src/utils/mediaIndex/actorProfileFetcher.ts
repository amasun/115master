import { CacheCore } from '@115master/shared'
import { cleanActorName, extractCleanElementText, normalizeActressName } from '@/utils/actressNameMatcher'
import { STORE_NAME } from '@/utils/cache/const'
import { appLogger } from '@/utils/logger'
import { GMRequest } from '@/utils/request/gmRequest'

const logger = appLogger.sub('ActorProfileFetcher')

const JAVBUS_BASE_URL = 'https://www.javbus.com'
const AVBASE_BASE_URL = 'https://www.avbase.net'
const MINNANO_BASE_URL = 'https://www.minnano-av.com'
const PROFILE_STORE_NAME = 'library_actor_profile_v1'
const PROFILE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface ActorProfile {
  actorKey: string
  name: string
  avatarUrl?: string
  birthday?: string
  age?: string
  height?: string
  cup?: string
  bust?: string
  waist?: string
  hips?: string
  birthplace?: string
  hobby?: string
  aliases: string[]
  profileUrl?: string
  source: 'javbus' | 'avbase' | 'minnano-av'
  updatedAt: number
}

class ActorProfileCache extends CacheCore<ActorProfile> {
  constructor() {
    super({
      name: STORE_NAME,
      storeName: PROFILE_STORE_NAME,
      enableQuotaManagement: false,
      logger: appLogger.sub('ActorProfileCache'),
    })
  }
}

export const actorProfileCache = new ActorProfileCache()

let sharedRequest: GMRequest | null = null

function getRequest(): GMRequest {
  if (!sharedRequest)
    sharedRequest = new GMRequest({ timeout: 10000 })
  return sharedRequest
}

function normalizeKey(name: string): string {
  return normalizeActressName(name) || name.trim().toLowerCase()
}

function cleanValue(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

function splitAliases(raw: string): string[] {
  return raw
    .split(/[、,，/／|（）()【】[\]]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

/** 解析 JavBus 演员详情页 HTML 中的个人资料 */
export function parseJavBusActorProfile(
  html: string,
  actorKey: string,
  fallbackName: string,
  profileUrl?: string,
  now = Date.now(),
): ActorProfile | null {
  if (!html)
    return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const box = doc.querySelector('.avatar-box')
  if (!box)
    return null

  const titleEl = box.querySelector('.photo-info .pb10')
  const name = extractCleanElementText(titleEl) || cleanActorName(fallbackName) || fallbackName

  const imgSrc = box.querySelector('.photo-frame img')?.getAttribute('src')?.trim()
  const avatarUrl = imgSrc && !/nowprinting/i.test(imgSrc)
    ? new URL(imgSrc, JAVBUS_BASE_URL).href
    : undefined

  let birthday: string | undefined
  let age: string | undefined
  let height: string | undefined
  let cup: string | undefined
  let bust: string | undefined
  let waist: string | undefined
  let hips: string | undefined
  let birthplace: string | undefined
  let hobby: string | undefined
  const aliasSet = new Set<string>()

  box.querySelectorAll('.photo-info p').forEach((p) => {
    const text = cleanValue(p.textContent ?? '')
    if (!text)
      return
    const sepIdx = text.search(/[:：]/)
    if (sepIdx <= 0)
      return
    const label = text.slice(0, sepIdx).trim()
    const value = text.slice(sepIdx + 1).trim()
    if (!label || !value)
      return

    if (/生日/.test(label))
      birthday = value
    else if (/年齡|年龄/.test(label))
      age = value
    else if (/身高/.test(label))
      height = value
    else if (/罩杯/.test(label))
      cup = value
    else if (/胸圍|胸围/.test(label))
      bust = value
    else if (/腰圍|腰围/.test(label))
      waist = value
    else if (/臀圍|臀围/.test(label))
      hips = value
    else if (/出生地/.test(label))
      birthplace = value
    else if (/愛好|爱好/.test(label))
      hobby = value
    else if (/別名|别名|舊名|旧名/.test(label))
      splitAliases(value).forEach(alias => aliasSet.add(alias))
  })

  aliasSet.delete(name)
  const hasDetail = Boolean(
    birthday || age || height || cup || bust || waist || hips || birthplace || hobby || avatarUrl,
  )
  if (!hasDetail)
    return null

  return {
    actorKey,
    name,
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(birthday ? { birthday } : {}),
    ...(age ? { age } : {}),
    ...(height ? { height } : {}),
    ...(cup ? { cup } : {}),
    ...(bust ? { bust } : {}),
    ...(waist ? { waist } : {}),
    ...(hips ? { hips } : {}),
    ...(birthplace ? { birthplace } : {}),
    ...(hobby ? { hobby } : {}),
    aliases: Array.from(aliasSet),
    ...(profileUrl ? { profileUrl } : {}),
    source: 'javbus',
    updatedAt: now,
  }
}

function findMatchingStarUrl(html: string, targets: string[]): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const normalizedTargets = targets.map(normalizeKey).filter(Boolean)
  const boxes = Array.from(doc.querySelectorAll('.avatar-box'))

  const candidates = boxes.flatMap((box) => {
    const link = box.matches('a[href]') ? box : box.querySelector('a[href]')
    const href = link?.getAttribute('href')?.trim()
    if (!href || !href.includes('/star/'))
      return []
    const rawName = (
      cleanActorName(box.querySelector('img')?.getAttribute('title') ?? '')
      || extractCleanElementText(box.querySelector('span'))
      || extractCleanElementText(link)
    )
    return [{
      name: rawName,
      url: new URL(href, JAVBUS_BASE_URL).href,
    }]
  })

  if (candidates.length === 0)
    return null

  const exact = candidates.find((candidate) => {
    const norm = normalizeKey(candidate.name)
    return normalizedTargets.includes(norm)
  })
  if (exact)
    return exact.url

  const fuzzy = candidates.find((candidate) => {
    const norm = normalizeKey(candidate.name)
    return normalizedTargets.some(target => norm.includes(target) || target.includes(norm))
  })
  if (fuzzy)
    return fuzzy.url

  return candidates.length === 1 ? candidates[0]!.url : null
}

function toOptionalText(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value))
    return String(value)
  if (typeof value !== 'string')
    return undefined
  const trimmed = cleanValue(value)
  return trimmed || undefined
}

function toMetricUnit(value: unknown, unit = 'cm'): string | undefined {
  const text = toOptionalText(value)
  if (!text)
    return undefined
  return /^\d+$/.test(text) ? `${text}${unit}` : text
}

/** 解析 AVBASE 演员详情页 HTML 中的个人资料 */
export function parseAvBaseActorProfile(
  html: string,
  actorKey: string,
  fallbackName: string,
  profileUrl?: string,
  now = Date.now(),
): ActorProfile | null {
  if (!html)
    return null

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const script = doc.querySelector('script#__NEXT_DATA__')
  let talent: Record<string, any> | null = null
  if (script?.textContent) {
    try {
      const nextData = JSON.parse(script.textContent) as Record<string, any>
      talent = nextData?.props?.pageProps?.talent ?? nextData?.props?.pageProps?.actor ?? null
    }
    catch {
      talent = null
    }
  }

  const h1Name = extractCleanElementText(doc.querySelector('h1'))
  const name = cleanActorName(toOptionalText(talent?.name) || h1Name || fallbackName) || fallbackName
  const meta = (talent?.meta ?? {}) as Record<string, any>

  const rawAvatar = toOptionalText(talent?.image_url)
    || doc.querySelector('meta[property="og:image"]')?.getAttribute('content')?.trim()
  const avatarUrl = rawAvatar ? new URL(rawAvatar, AVBASE_BASE_URL).href : undefined

  const birthday = toOptionalText(meta.birthday)
  const age = toOptionalText(meta.age)
  const height = toMetricUnit(meta.height)
  const cup = toOptionalText(meta.cup)
  const bust = toMetricUnit(meta.bust)
  const waist = toMetricUnit(meta.waist)
  const hips = toMetricUnit(meta.hip ?? meta.hips)
  const birthplace = toOptionalText(meta.prefectures ?? meta.birthplace)
  const hobby = toOptionalText(meta.hobby)

  const aliasSet = new Set<string>()
  const addAlias = (item: unknown) => {
    const cleaned = cleanActorName(toOptionalText(item) ?? '')
    if (cleaned && cleaned !== name)
      aliasSet.add(cleaned)
  }
  if (Array.isArray(meta.aliases))
    meta.aliases.forEach(addAlias)
  else if (typeof meta.aliases === 'string')
    splitAliases(meta.aliases).forEach(addAlias)

  if (Array.isArray(talent?.actors)) {
    talent.actors.forEach((actor: Record<string, any>) => addAlias(actor?.name))
  }

  const hasDetail = Boolean(
    birthday || age || height || cup || bust || waist || hips || birthplace || hobby || avatarUrl || aliasSet.size > 0,
  )
  if (!hasDetail)
    return null

  return {
    actorKey,
    name,
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(birthday ? { birthday } : {}),
    ...(age ? { age } : {}),
    ...(height ? { height } : {}),
    ...(cup ? { cup } : {}),
    ...(bust ? { bust } : {}),
    ...(waist ? { waist } : {}),
    ...(hips ? { hips } : {}),
    ...(birthplace ? { birthplace } : {}),
    ...(hobby ? { hobby } : {}),
    aliases: Array.from(aliasSet),
    ...(profileUrl ? { profileUrl } : {}),
    source: 'avbase',
    updatedAt: now,
  }
}

/** 解析 MINNANO-AV 演员详情页 HTML 中的个人资料 */
export function parseMinnanoActorProfile(
  html: string,
  actorKey: string,
  fallbackName: string,
  profileUrl?: string,
  now = Date.now(),
): ActorProfile | null {
  if (!html)
    return null

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const profileArea = doc.querySelector('.act-profile, .main-content, main') ?? doc.body
  if (!profileArea)
    return null

  const headingName = extractCleanElementText(doc.querySelector('.act-profile h1, h1'))
    ?.replace(/\s*[（(].*?[)）]\s*$/, '')
  const name = cleanActorName(headingName || fallbackName) || fallbackName

  const imgSrc = doc.querySelector('.act-profile .thumb img, .thumb img')?.getAttribute('src')?.trim()
  const avatarUrl = imgSrc && !/noimage|nowprinting/i.test(imgSrc)
    ? new URL(imgSrc, MINNANO_BASE_URL).href
    : undefined

  let birthday: string | undefined
  let height: string | undefined
  let cup: string | undefined
  let bust: string | undefined
  let waist: string | undefined
  let hips: string | undefined
  let birthplace: string | undefined
  let hobby: string | undefined
  const aliasSet = new Set<string>()

  const applyField = (label: string, value: string) => {
    if (!label || !value)
      return
    if (/生年月日|誕生日/.test(label)) {
      birthday = value.replace(/[（(].*?[)）]/g, '').trim()
    }
    else if (/サイズ|スリーサイズ/.test(label)) {
      const tMatch = value.match(/T(\d+)/i)?.[1]
      const bMatch = value.match(/B(\d+)/i)?.[1]
      const cMatch = value.match(/[（(]([A-Z]+)カップ[)）]/i)?.[1]
      const wMatch = value.match(/W(\d+)/i)?.[1]
      const hMatch = value.match(/H(\d+)/i)?.[1]
      if (tMatch)
        height = `${tMatch}cm`
      if (bMatch)
        bust = `${bMatch}cm`
      if (cMatch)
        cup = cMatch.toUpperCase()
      if (wMatch)
        waist = `${wMatch}cm`
      if (hMatch)
        hips = `${hMatch}cm`
    }
    else if (/出身地/.test(label)) {
      birthplace = value
    }
    else if (/趣味|特技/.test(label)) {
      hobby = value
    }
    else if (/別名|旧名|改名/.test(label)) {
      splitAliases(value).forEach((alias) => {
        const cleaned = cleanActorName(alias)
        if (cleaned && cleaned !== name)
          aliasSet.add(cleaned)
      })
    }
  }

  profileArea.querySelectorAll('table tr').forEach((tr) => {
    const th = cleanValue(tr.querySelector('th')?.textContent ?? '').replace(/[:：]$/, '')
    const td = cleanValue(tr.querySelector('td')?.textContent ?? '')
    applyField(th, td)
  })
  profileArea.querySelectorAll('dt').forEach((dt) => {
    const label = cleanValue(dt.textContent ?? '').replace(/[:：]$/, '')
    const dd = dt.nextElementSibling?.tagName.toLowerCase() === 'dd'
      ? cleanValue(dt.nextElementSibling.textContent ?? '')
      : ''
    applyField(label, dd)
  })

  const hasDetail = Boolean(
    birthday || height || cup || bust || waist || hips || birthplace || hobby || avatarUrl || aliasSet.size > 0,
  )
  if (!hasDetail)
    return null

  return {
    actorKey,
    name,
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(birthday ? { birthday } : {}),
    ...(height ? { height } : {}),
    ...(cup ? { cup } : {}),
    ...(bust ? { bust } : {}),
    ...(waist ? { waist } : {}),
    ...(hips ? { hips } : {}),
    ...(birthplace ? { birthplace } : {}),
    ...(hobby ? { hobby } : {}),
    aliases: Array.from(aliasSet),
    ...(profileUrl ? { profileUrl } : {}),
    source: 'minnano-av',
    updatedAt: now,
  }
}

async function fetchJavBusProfile(
  actorKey: string,
  actorName: string,
  names: string[],
  options: FetchActorProfileOptions,
): Promise<ActorProfile | null> {
  const starUrl = await resolveJavBusStarUrl(names, options.profileUrl, options.signal)
  if (!starUrl || options.signal?.aborted)
    return null

  try {
    const response = await getRequest().get(starUrl, {
      headers: { Referer: JAVBUS_BASE_URL },
      signal: options.signal,
    })
    if (!response.ok || options.signal?.aborted)
      return null
    const html = await response.text()
    return parseJavBusActorProfile(html, actorKey, actorName, starUrl)
  }
  catch (error) {
    if (!options.signal?.aborted)
      logger.warn('获取 JavBus 演员个人资料失败', actorName, error)
    return null
  }
}

async function fetchAvBaseProfile(
  actorKey: string,
  actorName: string,
  names: string[],
  signal?: AbortSignal,
): Promise<ActorProfile | null> {
  const request = getRequest()
  for (const query of names.slice(0, 2)) {
    if (signal?.aborted)
      return null
    const talentUrl = `${AVBASE_BASE_URL}/talents/${encodeURIComponent(query)}`
    try {
      const response = await request.get(talentUrl, {
        headers: { Referer: AVBASE_BASE_URL },
        signal,
      })
      if (!response.ok || signal?.aborted)
        continue
      const html = await response.text()
      const profile = parseAvBaseActorProfile(html, actorKey, actorName, talentUrl)
      if (profile)
        return profile
    }
    catch (error) {
      if (signal?.aborted)
        return null
      logger.warn('获取 AVBASE 演员个人资料失败', query, error)
    }
  }
  return null
}

async function fetchMinnanoProfile(
  actorKey: string,
  actorName: string,
  names: string[],
  signal?: AbortSignal,
): Promise<ActorProfile | null> {
  const request = getRequest()
  const normalizedTargets = names.map(normalizeKey).filter(Boolean)

  for (const query of names.slice(0, 2)) {
    if (signal?.aborted)
      return null
    const listUrl = `${MINNANO_BASE_URL}/actress_list.php?keyword=${encodeURIComponent(query)}`
    try {
      const listRes = await request.get(listUrl, {
        headers: { Referer: MINNANO_BASE_URL },
        signal,
      })
      if (!listRes.ok || signal?.aborted)
        continue
      const listDoc = new DOMParser().parseFromString(await listRes.text(), 'text/html')
      const links = Array.from(listDoc.querySelectorAll('a[href*="actress"]'))
        .map(link => ({
          name: cleanActorName(extractCleanElementText(link)),
          href: link.getAttribute('href')?.trim() ?? '',
        }))
        .filter(item => /actress\d+\.html/i.test(item.href))

      const matched = links.find(item => normalizedTargets.includes(normalizeKey(item.name)))
        ?? (links.length === 1 ? links[0] : undefined)
      if (!matched)
        continue

      const detailUrl = new URL(matched.href, MINNANO_BASE_URL).href
      const detailRes = await request.get(detailUrl, {
        headers: { Referer: listUrl },
        signal,
      })
      if (!detailRes.ok || signal?.aborted)
        continue
      const profile = parseMinnanoActorProfile(await detailRes.text(), actorKey, actorName, detailUrl)
      if (profile)
        return profile
    }
    catch (error) {
      if (signal?.aborted)
        return null
      logger.warn('获取 MINNANO-AV 演员个人资料失败', query, error)
    }
  }
  return null
}

async function resolveJavBusStarUrl(
  names: string[],
  knownUrl: string | undefined,
  signal?: AbortSignal,
): Promise<string | null> {
  if (knownUrl && /javbus\.com\/star\//i.test(knownUrl))
    return knownUrl

  const request = getRequest()
  for (const query of names.slice(0, 3)) {
    if (signal?.aborted)
      return null
    const trimmed = query.trim()
    if (!trimmed)
      continue
    try {
      const searchUrl = `${JAVBUS_BASE_URL}/searchstar/${encodeURIComponent(trimmed)}`
      const response = await request.get(searchUrl, {
        headers: { Referer: JAVBUS_BASE_URL },
        signal,
      })
      if (!response.ok)
        continue
      const html = await response.text()
      const matched = findMatchingStarUrl(html, names)
      if (matched)
        return matched
    }
    catch (error) {
      if (signal?.aborted)
        return null
      logger.warn('检索 JavBus 演员页失败', trimmed, error)
    }
  }
  return null
}

export interface FetchActorProfileOptions {
  aliases?: string[]
  profileUrl?: string
  forceRefresh?: boolean
  signal?: AbortSignal
}

/** 读取或联网拉取演员个人资料（带 30 天本地 IndexedDB 缓存） */
export async function fetchActorProfile(
  actorName: string,
  options: FetchActorProfileOptions = {},
): Promise<ActorProfile | null> {
  const actorKey = normalizeKey(actorName)
  if (!actorKey)
    return null

  if (!options.forceRefresh) {
    try {
      const cached = await actorProfileCache.get(actorKey)
      if (cached?.value && Date.now() - cached.value.updatedAt < PROFILE_TTL_MS)
        return cached.value
    }
    catch {
      // 忽略缓存读取异常
    }
  }

  const names = Array.from(new Set([actorName, ...(options.aliases ?? [])].map(s => s.trim()).filter(Boolean)))
  const profile = (
    await fetchJavBusProfile(actorKey, actorName, names, options)
    || await fetchAvBaseProfile(actorKey, actorName, names, options.signal)
    || await fetchMinnanoProfile(actorKey, actorName, names, options.signal)
  )

  if (profile && !options.signal?.aborted)
    await actorProfileCache.set(actorKey, profile)
  return profile
}
