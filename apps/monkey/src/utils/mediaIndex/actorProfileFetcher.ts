import { CacheCore } from '@115master/shared'
import { normalizeActressName } from '@/utils/actressNameMatcher'
import { STORE_NAME } from '@/utils/cache/const'
import { appLogger } from '@/utils/logger'
import { GMRequest } from '@/utils/request/gmRequest'

const logger = appLogger.sub('ActorProfileFetcher')

const JAVBUS_BASE_URL = 'https://www.javbus.com'
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
  source: 'javbus'
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
  const name = cleanValue(titleEl?.textContent ?? '') || fallbackName

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
    const rawName = cleanValue(
      box.querySelector('span')?.textContent
      || box.querySelector('img')?.getAttribute('title')
      || link?.textContent
      || '',
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
    const profile = parseJavBusActorProfile(html, actorKey, actorName, starUrl)
    if (profile)
      await actorProfileCache.set(actorKey, profile)
    return profile
  }
  catch (error) {
    if (!options.signal?.aborted)
      logger.warn('获取演员个人资料失败', actorName, error)
    return null
  }
}
