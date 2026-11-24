import type { JavInfo } from './jav'
import dayjs from 'dayjs'
import { cleanActorName } from '@/utils/actressNameMatcher'
import { appLogger } from '@/utils/logger'
import { GMRequest } from '@/utils/request/gmRequest'
import { isSameAvNumber, Jav, JAV_SOURCE } from './jav'

const logger = appLogger.sub('AvBase')

interface AvBaseNamedEntity {
  name?: string
}

interface AvBaseSampleImage {
  l?: string
  s?: string
}

interface AvBaseProduct {
  product_id?: string
  url?: string
  date?: string
  image_url?: string
  thumbnail_url?: string
  sample_image_urls?: AvBaseSampleImage[]
  maker?: AvBaseNamedEntity
  label?: AvBaseNamedEntity
  series?: AvBaseNamedEntity
  director?: AvBaseNamedEntity
  iteminfo?: {
    volume?: string | number
    maker?: AvBaseNamedEntity[]
    label?: AvBaseNamedEntity[]
    series?: AvBaseNamedEntity[]
    director?: AvBaseNamedEntity[]
  }
}

interface AvBaseCast {
  actor?: {
    name?: string
    image_url?: string
  }
}

interface AvBaseGenre {
  name?: string
}

interface AvBaseWork {
  work_id?: string
  prefix?: string
  title?: string
  min_date?: string
  casts?: AvBaseCast[]
  actors?: Array<{ name?: string, image_url?: string }>
  genres?: AvBaseGenre[]
  tags?: Array<{ name?: string }>
  products?: AvBaseProduct[]
}

function toAbsUrl(raw: string | null | undefined, baseUrl: string): string | undefined {
  const trimmed = raw?.trim()
  if (!trimmed)
    return undefined
  try {
    return new URL(trimmed, baseUrl).href
  }
  catch {
    return undefined
  }
}

function extractWorkId(rawId?: string | null): string | undefined {
  const trimmed = rawId?.trim()
  if (!trimmed)
    return undefined
  const colonIdx = trimmed.indexOf(':')
  const pure = colonIdx >= 0 ? trimmed.slice(colonIdx + 1) : trimmed
  return pure.trim().toUpperCase() || undefined
}

function extractNextData(dom: Document): Record<string, any> | null {
  const script = dom.querySelector('script#__NEXT_DATA__')
  if (!script?.textContent)
    return null
  try {
    return JSON.parse(script.textContent) as Record<string, any>
  }
  catch {
    return null
  }
}

/** AVBASE 番号资料源（Next.js 结构，抗风控能力强且别名映射齐全）。 */
export class AvBase extends Jav {
  source = JAV_SOURCE.AVBASE
  baseUrl = 'https://www.avbase.net'
  detailUrl = ''
  searchUrl = ''
  request = new GMRequest({
    redirect: 'follow',
    timeout: 10000,
  })

  private nextWork: AvBaseWork | null = null

  async getInfoByAvNumber(avNumber: string) {
    logger.info('开始请求 AVBASE 番号资料', avNumber)

    const upperCode = avNumber.trim().toUpperCase()
    this.searchUrl = `${this.baseUrl}/works?q=${encodeURIComponent(upperCode)}`

    // 1) 优先直达标准作品详情页
    const directUrl = `${this.baseUrl}/works/${encodeURIComponent(upperCode)}`
    const directRes = await this.request.get(directUrl, {
      headers: { Referer: `${this.baseUrl}/` },
    })

    if (directRes.status === 200) {
      this.detailUrl = directUrl
      const directHtml = await directRes.text()
      const directInfo = await this.parseInfo(directHtml)
      if (directInfo?.avNumber && directInfo?.title && isSameAvNumber(avNumber, directInfo.avNumber)) {
        logger.info('AVBASE 直达详情命中', avNumber, directInfo.avNumber)
        return directInfo
      }
    }
    else if (directRes.status !== 404 && directRes.status !== 302) {
      throw new Jav.PageError()
    }

    // 2) 直达未命中时回退关键词检索
    const searchRes = await this.request.get(this.searchUrl, {
      headers: { Referer: `${this.baseUrl}/` },
    })
    if (searchRes.status === 404)
      throw new Jav.NotFound()
    if (searchRes.status !== 200 && searchRes.status !== 302)
      throw new Jav.PageError()

    const searchHtml = await searchRes.text()
    const searchDom = new DOMParser().parseFromString(searchHtml, 'text/html')
    const matchedPath = this.findWorkPathInSearchDom(searchDom, avNumber)
    if (!matchedPath) {
      logger.info('AVBASE 搜索无匹配作品', avNumber)
      throw new Jav.NotFound()
    }

    this.detailUrl = toAbsUrl(matchedPath, this.baseUrl) ?? this.searchUrl
    const detailRes = await this.request.get(this.detailUrl, {
      headers: { Referer: this.searchUrl },
    })
    if (detailRes.status === 404)
      throw new Jav.NotFound()
    if (detailRes.status !== 200 && detailRes.status !== 302)
      throw new Jav.PageError()

    const info = await this.parseInfo(await detailRes.text())
    if (!info?.title)
      throw new Jav.NotFound()
    return info
  }

  async parseInfoBefore(dom: Document): Promise<Document> {
    const nextData = extractNextData(dom)
    const work = nextData?.props?.pageProps?.work as AvBaseWork | undefined
    this.nextWork = work ?? null
    return dom
  }

  parseAvNumber(dom: Document): JavInfo['avNumber'] {
    const fromNext = extractWorkId(this.nextWork?.work_id)
    if (fromNext)
      return fromNext

    const titleText = dom.querySelector('h1')?.textContent
      || dom.querySelector('meta[property="og:title"]')?.getAttribute('content')
      || ''
    const match = titleText.match(/[A-Z0-9]+-[A-Z0-9]+/i)
    return match?.[0]?.toUpperCase()
  }

  parseTitle(dom: Document): JavInfo['title'] {
    const fromNext = this.nextWork?.title?.trim()
    if (fromNext)
      return fromNext

    const h1 = dom.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim()
    if (h1)
      return h1

    const ogTitle = dom.querySelector('meta[property="og:title"]')?.getAttribute('content')?.replace(/\s*\|\s*AVBASE.*$/i, '').trim()
    return ogTitle || undefined
  }

  parseDate(dom: Document): JavInfo['date'] {
    const raw = this.nextWork?.min_date || this.nextWork?.products?.[0]?.date
      || dom.querySelector('time[datetime]')?.getAttribute('datetime')
    if (!raw)
      return undefined
    const ts = dayjs(raw).valueOf()
    return Number.isFinite(ts) ? ts : undefined
  }

  parseDuration(): JavInfo['duration'] {
    const volume = this.nextWork?.products?.[0]?.iteminfo?.volume
    if (volume === undefined || volume === null)
      return undefined
    const num = Number(String(volume).match(/\d+/)?.[0])
    return Number.isFinite(num) && num > 0 ? num : undefined
  }

  parseDirector(): JavInfo['director'] {
    const product = this.nextWork?.products?.[0]
    const name = product?.director?.name?.trim() || product?.iteminfo?.director?.[0]?.name?.trim()
    return name ? [{ name }] : undefined
  }

  parseActor(dom: Document): JavInfo['actors'] {
    const seen = new Set<string>()
    const actors: NonNullable<JavInfo['actors']> = []
    const pushActor = (name?: string, url?: string, face?: string) => {
      const cleaned = cleanActorName(name ?? '')
      if (!cleaned || seen.has(cleaned))
        return
      seen.add(cleaned)
      actors.push({
        name: cleaned,
        ...(url ? { url } : {}),
        ...(face ? { face, faceReferer: this.detailUrl } : {}),
        sex: 1 as const,
      })
    }

    for (const cast of this.nextWork?.casts ?? []) {
      const rawName = cast.actor?.name
      if (rawName) {
        pushActor(
          rawName,
          `${this.baseUrl}/talents/${encodeURIComponent(rawName)}`,
          toAbsUrl(cast.actor?.image_url, this.baseUrl),
        )
      }
    }

    for (const actor of this.nextWork?.actors ?? []) {
      if (actor.name) {
        pushActor(
          actor.name,
          `${this.baseUrl}/talents/${encodeURIComponent(actor.name)}`,
          toAbsUrl(actor.image_url, this.baseUrl),
        )
      }
    }

    if (!actors.length) {
      dom.querySelectorAll('a[href*="/talents/"]').forEach((link) => {
        const name = link.textContent?.trim()
        const url = toAbsUrl(link.getAttribute('href'), this.baseUrl)
        pushActor(name, url)
      })
    }

    return actors.length ? actors : undefined
  }

  parseStudio(): JavInfo['studio'] {
    const product = this.nextWork?.products?.[0]
    const name = product?.maker?.name?.trim() || product?.iteminfo?.maker?.[0]?.name?.trim()
    return name ? [{ name }] : undefined
  }

  parsePublisher(): JavInfo['publisher'] {
    const product = this.nextWork?.products?.[0]
    const name = product?.label?.name?.trim() || product?.iteminfo?.label?.[0]?.name?.trim()
    return name ? [{ name }] : undefined
  }

  parseCover(dom: Document): JavInfo['cover'] {
    const product = this.nextWork?.products?.[0]
    const url = toAbsUrl(
      product?.image_url || dom.querySelector('meta[property="og:image"]')?.getAttribute('content'),
      this.baseUrl,
    )
    return url ? { url, referer: this.detailUrl } : undefined
  }

  parseCoverSingle(dom: Document): JavInfo['coverSingle'] {
    const product = this.nextWork?.products?.[0]
    const url = toAbsUrl(product?.thumbnail_url || product?.image_url, this.baseUrl)
    if (url)
      return { url, referer: this.detailUrl }
    return this.parseCover(dom)
  }

  parsePreview(): JavInfo['preview'] {
    const samples = this.nextWork?.products?.[0]?.sample_image_urls ?? []
    const items = samples
      .map((sample) => {
        const raw = toAbsUrl(sample.l || sample.s, this.baseUrl)
        const thumbnail = toAbsUrl(sample.s || sample.l, this.baseUrl)
        if (!raw && !thumbnail)
          return null
        return {
          raw: raw || thumbnail,
          thumbnail: thumbnail || raw,
        }
      })
      .filter((item): item is { raw: string, thumbnail: string } => Boolean(item))
    return items.length ? items : undefined
  }

  parseSeries(): JavInfo['series'] {
    const product = this.nextWork?.products?.[0]
    const name = product?.series?.name?.trim() || product?.iteminfo?.series?.[0]?.name?.trim()
    return name ? [{ name }] : undefined
  }

  parseCategory(dom: Document): JavInfo['category'] {
    const seen = new Set<string>()
    const categories: NonNullable<JavInfo['category']> = []
    const pushCategory = (name?: string, url?: string) => {
      const trimmed = name?.trim()
      if (!trimmed || seen.has(trimmed))
        return
      seen.add(trimmed)
      categories.push({ name: trimmed, ...(url ? { url } : {}) })
    }

    for (const genre of [...(this.nextWork?.genres ?? []), ...(this.nextWork?.tags ?? [])]) {
      if (genre.name)
        pushCategory(genre.name, `${this.baseUrl}/genres/${encodeURIComponent(genre.name)}`)
    }

    if (!categories.length) {
      dom.querySelectorAll('a[href*="/genres/"]').forEach((link) => {
        pushCategory(link.textContent, toAbsUrl(link.getAttribute('href'), this.baseUrl))
      })
    }

    return categories.length ? categories : undefined
  }

  private findWorkPathInSearchDom(dom: Document, avNumber: string): string | undefined {
    const nextData = extractNextData(dom)
    const works = nextData?.props?.pageProps?.works as AvBaseWork[] | undefined
    if (Array.isArray(works)) {
      const matched = works.find((work) => {
        const id = extractWorkId(work.work_id)
        return Boolean(id && isSameAvNumber(avNumber, id))
      })
      if (matched?.work_id) {
        const pathId = matched.prefix ? `${matched.prefix}:${extractWorkId(matched.work_id)}` : matched.work_id
        return `/works/${encodeURIComponent(pathId)}`
      }
    }

    const links = Array.from(dom.querySelectorAll('a[href^="/works/"]'))
    for (const link of links) {
      const href = link.getAttribute('href')
      if (!href)
        continue
      const tail = decodeURIComponent(href.replace(/^\/works\//, '').split(/[?#]/)[0] ?? '')
      const pureId = extractWorkId(tail)
      if (pureId && isSameAvNumber(avNumber, pureId))
        return href
    }
    return undefined
  }
}
