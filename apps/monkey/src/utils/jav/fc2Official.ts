import type { JavInfo } from './jav'
import dayjs from 'dayjs'
import { appLogger } from '@/utils/logger'
import { GMRequest } from '@/utils/request/gmRequest'
import { Jav, JAV_SOURCE, normalizeAvNumber } from './jav'

const logger = appLogger.sub('Fc2Official')

function getArticleId(avNumber: string): string | undefined {
  return normalizeAvNumber(avNumber).match(/^FC2PPV(\d{5,8})$/)?.[1]
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

function parseDurationText(value?: string | null): number | undefined {
  const match = value?.match(/(?:(\d+):)?(\d{1,2}):(\d{2})/)
  if (!match)
    return undefined
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  const seconds = Number(match[3] ?? 0)
  if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds))
    return undefined
  return Math.max(1, Math.round(hours * 60 + minutes + seconds / 60))
}

/** FC2 官方商品页资料源（用于 FD2PPV 缺失或被盾时的 FC2-PPV 补盲）。 */
export class Fc2Official extends Jav {
  source = JAV_SOURCE.FC2OFFICIAL
  baseUrl = 'https://adult.contents.fc2.com'
  detailUrl = ''
  searchUrl = ''
  request = new GMRequest({
    redirect: 'follow',
    timeout: 10000,
  })

  private articleId = ''

  async getInfoByAvNumber(avNumber: string) {
    logger.info('开始请求 FC2 官方资料', avNumber)

    const articleId = getArticleId(avNumber)
    if (!articleId) {
      logger.info('非 FC2 PPV 番号，跳过 FC2 官方源', avNumber)
      throw new Jav.NotFound()
    }

    this.articleId = articleId
    this.detailUrl = `${this.baseUrl}/article/${articleId}/`
    this.searchUrl = this.detailUrl

    const response = await this.request.get(this.detailUrl, {
      headers: {
        Referer: `${this.baseUrl}/`,
      },
    })

    if (response.status === 404) {
      logger.info('FC2 官方页面返回 404', avNumber)
      throw new Jav.NotFound()
    }
    if (response.status !== 200 && response.status !== 302) {
      logger.warn('FC2 官方页面异常', avNumber, response.status)
      throw new Jav.PageError()
    }

    const html = await response.text()
    const info = await this.parseInfo(html)
    if (!info?.title)
      throw new Jav.NotFound()

    logger.info('FC2 官方资料请求完成', avNumber)
    return info
  }

  async parseInfoBefore(dom: Document): Promise<Document> {
    const bodyText = dom.body?.textContent ?? ''
    if (bodyText.includes('お探しの商品が見つかりません') || !dom.querySelector('.items_article_headerInfo'))
      throw new Jav.NotFound()

    if (!this.articleId) {
      const canonical = dom.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? ''
      const matched = canonical.match(/\/article\/(\d{5,8})/)?.[1]
      if (matched)
        this.articleId = matched
    }

    return dom
  }

  parseAvNumber(): JavInfo['avNumber'] {
    return this.articleId ? `FC2-PPV-${this.articleId}` : undefined
  }

  parseTitle(dom: Document): JavInfo['title'] {
    const title = dom.querySelector('.items_article_headerInfo h3')?.textContent?.replace(/\s+/g, ' ').trim()
      || dom.querySelector('meta[property="og:title"]')?.getAttribute('content')?.replace(/\s*\|\s*FC2コンテンツマーケット.*$/i, '').trim()
    return title || undefined
  }

  parseDate(dom: Document): JavInfo['date'] {
    const text = dom.querySelector('.items_article_Releasedate')?.textContent ?? ''
    const matched = text.match(/\d{4}\/\d{1,2}\/\d{1,2}/)?.[0]
    if (!matched)
      return undefined
    const ts = dayjs(matched).valueOf()
    return Number.isFinite(ts) ? ts : undefined
  }

  parseDuration(dom: Document): JavInfo['duration'] {
    const durationText = dom.querySelector('.items_article_MainitemThumb .items_article_info')?.textContent
    return parseDurationText(durationText)
  }

  parseDirector(): JavInfo['director'] {
    return undefined
  }

  parseActor(): JavInfo['actors'] {
    return undefined
  }

  parseStudio(dom: Document): JavInfo['studio'] {
    const sellerLink = dom.querySelector('.items_article_headerInfo a[href*="/users/"]')
    const name = sellerLink?.textContent?.replace(/\s+/g, ' ').trim()
    if (!name)
      return undefined
    return [{
      name,
      url: toAbsUrl(sellerLink?.getAttribute('href'), this.baseUrl),
    }]
  }

  parsePublisher(): JavInfo['publisher'] {
    return undefined
  }

  parseCover(dom: Document): JavInfo['cover'] {
    const raw = dom.querySelector('.items_article_MainitemThumb img[src]')?.getAttribute('src')
      || dom.querySelector('meta[property="og:image"]')?.getAttribute('content')
    const url = toAbsUrl(raw, this.baseUrl)
    return url ? { url, referer: this.detailUrl } : undefined
  }

  parseCoverSingle(dom: Document): JavInfo['coverSingle'] {
    return this.parseCover(dom)
  }

  parsePreview(dom: Document): JavInfo['preview'] {
    const items: NonNullable<JavInfo['preview']> = []
    const seen = new Set<string>()
    const area = dom.querySelector('.items_article_SampleImagesArea')
    if (!area)
      return undefined

    area.querySelectorAll('a[href]').forEach((link) => {
      const raw = toAbsUrl(link.getAttribute('href'), this.baseUrl)
      const thumbnail = toAbsUrl(link.querySelector('img')?.getAttribute('src'), this.baseUrl) || raw
      const key = raw || thumbnail
      if (!key || seen.has(key))
        return
      seen.add(key)
      items.push({ raw: raw || thumbnail, thumbnail })
    })

    if (items.length === 0) {
      area.querySelectorAll('img[src]').forEach((img) => {
        const url = toAbsUrl(img.getAttribute('src'), this.baseUrl)
        if (!url || seen.has(url))
          return
        seen.add(url)
        items.push({ raw: url, thumbnail: url })
      })
    }

    return items.length ? items : undefined
  }

  parseSeries(): JavInfo['series'] {
    return undefined
  }

  parseCategory(dom: Document): JavInfo['category'] {
    const categories = Array.from(dom.querySelectorAll('.items_article_TagArea a.tag'))
      .map(link => ({
        name: link.textContent?.trim() ?? '',
        url: toAbsUrl(link.getAttribute('href'), this.baseUrl),
      }))
      .filter(item => Boolean(item.name))
    return categories.length ? categories : undefined
  }
}
