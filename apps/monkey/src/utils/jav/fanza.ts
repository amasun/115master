import type { JavInfo } from './jav'
import dayjs from 'dayjs'
import { cleanActorName } from '@/utils/actressNameMatcher'
import { appLogger } from '@/utils/logger'
import { GMRequest } from '@/utils/request/gmRequest'
import { Jav, JAV_SOURCE, normalizeAvNumber } from './jav'

const logger = appLogger.sub('Fanza')

const GRAPHQL_URL = 'https://api.video.dmm.co.jp/graphql'
const VIDEO_REFERER = 'https://video.dmm.co.jp/'
const DMM_DETAIL_BASE = 'https://www.dmm.co.jp'

const SEARCH_QUERY = `query FanzaSearch($word: String!) {
  legacySearchPPV(
    limit: 10
    sort: SALES_RANK_SCORE
    queryWord: $word
    includeExplicit: true
  ) {
    result {
      contents {
        id
        title
        packageImage {
          largeUrl
          mediumUrl
        }
      }
    }
  }
}`

interface FanzaContent {
  id?: string | null
  title?: string | null
  packageImage?: {
    largeUrl?: string | null
    mediumUrl?: string | null
  } | null
}

interface FanzaGraphqlResponse {
  data?: {
    legacySearchPPV?: {
      result?: {
        contents?: FanzaContent[] | null
      } | null
    } | null
  }
}

function buildSuffixPattern(avNumber: string): RegExp | undefined {
  const match = normalizeAvNumber(avNumber).match(/^([A-Z]+)(\d+)$/)
  if (!match)
    return undefined
  const prefix = match[1]!
  const number = match[2]!.replace(/^0+(?=\d)/, '')
  return new RegExp(`${prefix}0*${number}$`, 'i')
}

function normalizeLabelKey(raw?: string | null): string {
  return raw?.replace(/[:：\s]+/g, '').trim() ?? ''
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

/** DMM / FANZA 官方资料源（需日本 IP，提供无水印高清封面与完整官方元数据）。 */
export class Fanza extends Jav {
  source = JAV_SOURCE.FANZA
  baseUrl = VIDEO_REFERER
  detailUrl = ''
  searchUrl = ''
  request = new GMRequest({
    redirect: 'follow',
    timeout: 10000,
  })

  private currentAvNumber = ''
  private graphqlContent: FanzaContent | null = null
  private rows = new Map<string, Element>()

  async getInfoByAvNumber(avNumber: string) {
    logger.info('开始请求 FANZA 番号资料', avNumber)

    const pattern = buildSuffixPattern(avNumber)
    if (!pattern)
      throw new Jav.NotFound()

    this.currentAvNumber = avNumber.trim().toUpperCase()
    this.searchUrl = `${VIDEO_REFERER}list/?keyword=${encodeURIComponent(this.currentAvNumber)}`

    const gqlRes = await this.request.request(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': VIDEO_REFERER,
      },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: { word: this.currentAvNumber },
      }),
    })

    if (gqlRes.status === 404)
      throw new Jav.NotFound()
    if (!gqlRes.ok)
      throw new Jav.PageError()

    let payload: FanzaGraphqlResponse | null = null
    try {
      payload = JSON.parse(await gqlRes.text()) as FanzaGraphqlResponse
    }
    catch {
      throw new Jav.PageError()
    }

    const contents = payload?.data?.legacySearchPPV?.result?.contents ?? []
    const matched = contents.find(item => Boolean(item?.id && pattern.test(item.id)))
    if (!matched?.id) {
      logger.info('FANZA GraphQL 未命中精确番号', avNumber)
      throw new Jav.NotFound()
    }

    this.graphqlContent = matched
    this.detailUrl = `${DMM_DETAIL_BASE}/digital/videoa/-/detail/=/cid=${encodeURIComponent(matched.id)}/`

    // 尽力拉取官方详情页补充演员/片商/类别/预览图；失败时仍降级返回 GraphQL 基础资料
    try {
      const detailRes = await this.request.get(this.detailUrl, {
        headers: {
          Cookie: 'age_check_done=1',
          Referer: `${DMM_DETAIL_BASE}/`,
        },
      })
      if (detailRes.ok) {
        const html = await detailRes.text()
        const parsed = await this.parseInfo(html)
        if (parsed)
          return parsed
      }
    }
    catch (error) {
      logger.warn('FANZA 详情页补充请求失败，降级使用 GraphQL 结果', avNumber, error)
    }

    return this.buildGraphqlFallbackInfo()
  }

  async parseInfoBefore(dom: Document): Promise<Document> {
    this.rows.clear()
    dom.querySelectorAll('table.mg-b20 tr').forEach((tr) => {
      const cells = tr.querySelectorAll('td')
      if (cells.length >= 2) {
        const key = normalizeLabelKey(cells[0]?.textContent)
        if (key)
          this.rows.set(key, cells[1]!)
      }
    })
    return dom
  }

  parseAvNumber(): JavInfo['avNumber'] {
    return this.currentAvNumber || undefined
  }

  parseTitle(dom: Document): JavInfo['title'] {
    const h1 = dom.querySelector('h1#title, h1.item')?.textContent?.replace(/\s+/g, ' ').trim()
    return h1 || this.graphqlContent?.title?.trim() || undefined
  }

  parseDate(): JavInfo['date'] {
    const raw = this.getRowText(['配信開始日', '商品発売日', '発売日'])
    const matched = raw?.match(/\d{4}\/\d{1,2}\/\d{1,2}|\d{4}-\d{1,2}-\d{1,2}/)?.[0]
    if (!matched)
      return undefined
    const ts = dayjs(matched).valueOf()
    return Number.isFinite(ts) ? ts : undefined
  }

  parseDuration(): JavInfo['duration'] {
    const raw = this.getRowText(['収録時間'])
    const match = raw?.match(/(\d+)\s*分/)
    if (!match?.[1])
      return undefined
    const minutes = Number(match[1])
    return Number.isFinite(minutes) && minutes > 0 ? minutes : undefined
  }

  parseDirector(): JavInfo['director'] {
    return this.getRowLinks(['監督'])
  }

  parseActor(): JavInfo['actors'] {
    const td = this.rows.get('出演者')
    if (!td)
      return undefined
    const links = Array.from(td.querySelectorAll('a'))
      .map(a => ({
        name: cleanActorName(a.textContent ?? ''),
        url: toAbsUrl(a.getAttribute('href'), DMM_DETAIL_BASE),
        sex: 1 as const,
      }))
      .filter(actor => Boolean(actor.name) && actor.name !== '----')
    return links.length ? links : undefined
  }

  parseStudio(): JavInfo['studio'] {
    return this.getRowLinks(['メーカー'])
  }

  parsePublisher(): JavInfo['publisher'] {
    return this.getRowLinks(['レーベル'])
  }

  parseCover(dom: Document): JavInfo['cover'] {
    const largeUrl = this.graphqlContent?.packageImage?.largeUrl?.trim()
      || dom.querySelector('a[name="package-image"]')?.getAttribute('href')
      || dom.querySelector('#sample-video img')?.getAttribute('src')
    const url = toAbsUrl(largeUrl, DMM_DETAIL_BASE)
    return url ? { url, referer: VIDEO_REFERER } : undefined
  }

  parseCoverSingle(dom: Document): JavInfo['coverSingle'] {
    const mediumUrl = this.graphqlContent?.packageImage?.mediumUrl?.trim()
      || dom.querySelector('#sample-video img')?.getAttribute('src')
    const url = toAbsUrl(mediumUrl, DMM_DETAIL_BASE)
    return url ? { url, referer: VIDEO_REFERER } : this.parseCover(dom)
  }

  parsePreview(dom: Document): JavInfo['preview'] {
    const imgs = Array.from(dom.querySelectorAll('#sample-image-block a[name="sample-image"] img[src], #sample-image-block img[src]'))
    const items = imgs
      .map((img) => {
        const thumb = toAbsUrl(img.getAttribute('src'), DMM_DETAIL_BASE)
        if (!thumb)
          return null
        /** DMM 缩略图 `-1.jpg` -> 大图 `jp-1.jpg` */
        const raw = thumb.replace(/-(\d+)\.jpg$/i, 'jp-$1.jpg')
        return {
          raw,
          thumbnail: thumb,
        }
      })
      .filter((item): item is { raw: string, thumbnail: string } => Boolean(item))
    return items.length ? items : undefined
  }

  parseSeries(): JavInfo['series'] {
    return this.getRowLinks(['シリーズ'])
  }

  parseCategory(): JavInfo['category'] {
    return this.getRowLinks(['ジャンル'])
  }

  private buildGraphqlFallbackInfo(): JavInfo | undefined {
    const content = this.graphqlContent
    if (!content?.id)
      return undefined
    const largeUrl = content.packageImage?.largeUrl?.trim() || undefined
    const mediumUrl = content.packageImage?.mediumUrl?.trim() || undefined
    return {
      source: this.source,
      baseUrl: this.baseUrl,
      detailUrl: this.detailUrl,
      searchUrl: this.searchUrl,
      avNumber: this.currentAvNumber || undefined,
      title: content.title?.trim() || undefined,
      cover: largeUrl
        ? { url: largeUrl, referer: VIDEO_REFERER }
        : mediumUrl
          ? { url: mediumUrl, referer: VIDEO_REFERER }
          : undefined,
      coverSingle: mediumUrl
        ? { url: mediumUrl, referer: VIDEO_REFERER }
        : largeUrl
          ? { url: largeUrl, referer: VIDEO_REFERER }
          : undefined,
    }
  }

  private getRowText(keys: string[]): string | undefined {
    for (const key of keys) {
      const td = this.rows.get(key)
      const text = td?.textContent?.replace(/\s+/g, ' ').trim()
      if (text && text !== '----')
        return text
    }
    return undefined
  }

  private getRowLinks(keys: string[]): Array<{ name: string, url?: string }> | undefined {
    for (const key of keys) {
      const td = this.rows.get(key)
      if (!td)
        continue
      const links = Array.from(td.querySelectorAll('a'))
        .map(a => ({
          name: a.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          url: toAbsUrl(a.getAttribute('href'), DMM_DETAIL_BASE),
        }))
        .filter(item => Boolean(item.name) && item.name !== '----')
      if (links.length)
        return links

      const text = td.textContent?.replace(/\s+/g, ' ').trim()
      if (text && text !== '----')
        return [{ name: text }]
    }
    return undefined
  }
}
