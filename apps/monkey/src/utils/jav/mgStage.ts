import type { JavInfo } from './jav'
import dayjs from 'dayjs'
import { cleanActorName } from '@/utils/actressNameMatcher'
import { appLogger } from '@/utils/logger'
import { GMRequest } from '@/utils/request/gmRequest'
import { Jav, JAV_SOURCE, normalizeAvNumber } from './jav'

const logger = appLogger.sub('MGStage')

const MGSTAGE_CODE_REGEX = /^(?:\d{3}[A-Z]{2,5}|SIRO|ABW|ABP|ABF|ABS|BGN|CHN|DOCP|EDD|GAH|HRV|INU|KBI|MGT|MKM|MPT|SGA|TEM|TRE|TRG|YRH)\d{3,5}$/

/** 判断当前番号是否属于 MGStage 素人/Prestige 常见前缀。 */
export function isMgStageAvNumber(avNumber: string): boolean {
  return MGSTAGE_CODE_REGEX.test(normalizeAvNumber(avNumber))
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

/** MGStage 素人/Prestige 番号资料源（带 adc=1 年龄认证 Cookie）。 */
export class MGStage extends Jav {
  source = JAV_SOURCE.MGSTAGE
  baseUrl = 'https://www.mgstage.com'
  detailUrl = ''
  searchUrl = ''
  request = new GMRequest({
    redirect: 'follow',
    timeout: 10000,
  })

  private rows = new Map<string, Element>()

  async getInfoByAvNumber(avNumber: string) {
    logger.info('开始请求 MGStage 番号资料', avNumber)

    const code = avNumber.trim().toUpperCase()
    this.detailUrl = `${this.baseUrl}/product/product_detail/${encodeURIComponent(code)}/`
    this.searchUrl = `${this.baseUrl}/search/cSearch.php?search_word=${encodeURIComponent(code)}`

    const response = await this.request.get(this.detailUrl, {
      headers: {
        Cookie: 'adc=1',
        Referer: `${this.baseUrl}/`,
      },
    })

    if (response.status === 404) {
      logger.info('MGStage 番号资料未找到', avNumber)
      throw new Jav.NotFound()
    }
    if (response.status !== 200 && response.status !== 302) {
      logger.warn('MGStage 响应异常', avNumber, response.status)
      throw new Jav.PageError()
    }

    const html = await response.text()
    const info = await this.parseInfo(html)
    if (!info?.avNumber && !info?.title) {
      logger.info('MGStage 页面未包含有效详情', avNumber)
      throw new Jav.NotFound()
    }

    logger.info('MGStage 番号资料请求完成', avNumber, info.avNumber)
    return info
  }

  async parseInfoBefore(dom: Document): Promise<Document> {
    this.rows.clear()
    dom.querySelectorAll('table.detail_data tr').forEach((tr) => {
      const th = tr.querySelector('th')
      const td = tr.querySelector('td')
      const key = normalizeLabelKey(th?.textContent)
      if (key && td)
        this.rows.set(key, td)
    })

    if (this.rows.size === 0 && !dom.querySelector('h1.tag'))
      throw new Jav.NotFound()

    return dom
  }

  parseAvNumber(): JavInfo['avNumber'] {
    const raw = this.getRowText(['品番'])
    return raw ? raw.toUpperCase() : undefined
  }

  parseTitle(dom: Document): JavInfo['title'] {
    const title = dom.querySelector('h1.tag')?.textContent?.replace(/\s+/g, ' ').trim()
    return title || undefined
  }

  parseDate(): JavInfo['date'] {
    const raw = this.getRowText(['配信開始日', '商品発売日'])
    const matched = raw?.match(/\d{4}\/\d{1,2}\/\d{1,2}|\d{4}-\d{1,2}-\d{1,2}/)?.[0]
    if (!matched)
      return undefined
    const ts = dayjs(matched).valueOf()
    return Number.isFinite(ts) ? ts : undefined
  }

  parseDuration(): JavInfo['duration'] {
    const raw = this.getRowText(['収録時間'])
    const match = raw?.match(/(\d+)\s*(?:min|分)/i)
    if (!match?.[1])
      return undefined
    const minutes = Number(match[1])
    return Number.isFinite(minutes) && minutes > 0 ? minutes : undefined
  }

  parseDirector(): JavInfo['director'] {
    return this.getRowLinks(['監督'])
  }

  parseActor(): JavInfo['actors'] {
    const td = this.rows.get('出演')
    if (!td)
      return undefined
    const links = Array.from(td.querySelectorAll('a'))
      .map(a => ({
        name: cleanActorName(a.textContent ?? ''),
        url: toAbsUrl(a.getAttribute('href'), this.baseUrl),
        sex: 1 as const,
      }))
      .filter(actor => Boolean(actor.name))
    if (links.length)
      return links

    const fallback = (td.textContent ?? '')
      .split(/[,，/／、\n]+/)
      .map(name => cleanActorName(name))
      .filter(name => Boolean(name) && name !== '-')
      .map(name => ({ name, sex: 1 as const }))
    return fallback.length ? fallback : undefined
  }

  parseStudio(): JavInfo['studio'] {
    return this.getRowLinks(['メーカー'])
  }

  parsePublisher(): JavInfo['publisher'] {
    return this.getRowLinks(['レーベル'])
  }

  parseCover(dom: Document): JavInfo['cover'] {
    const href = dom.querySelector('a.link_magnify')?.getAttribute('href')
    const url = toAbsUrl(href, this.baseUrl)
    if (url)
      return { url, referer: this.detailUrl }
    return this.parseCoverSingle(dom)
  }

  parseCoverSingle(dom: Document): JavInfo['coverSingle'] {
    const src = dom.querySelector('a.link_magnify img[src], .detail_photo img.enlarge_image[src]')?.getAttribute('src')
    const url = toAbsUrl(src, this.baseUrl)
    return url ? { url, referer: this.detailUrl } : undefined
  }

  parsePreview(dom: Document): JavInfo['preview'] {
    const links = Array.from(dom.querySelectorAll('#sample-photo a.sample_image'))
    const items = links
      .map((link) => {
        const raw = toAbsUrl(link.getAttribute('href'), this.baseUrl)
        const thumbnail = toAbsUrl(link.querySelector('img')?.getAttribute('src'), this.baseUrl)
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
    return this.getRowLinks(['シリーズ'])
  }

  parseCategory(): JavInfo['category'] {
    return this.getRowLinks(['ジャンル'])
  }

  private getRowText(keys: string[]): string | undefined {
    for (const key of keys) {
      const td = this.rows.get(key)
      const text = td?.textContent?.replace(/\s+/g, ' ').trim()
      if (text)
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
          url: toAbsUrl(a.getAttribute('href'), this.baseUrl),
        }))
        .filter(item => Boolean(item.name))
      if (links.length)
        return links

      const text = td.textContent?.replace(/\s+/g, ' ').trim()
      if (text && text !== '-')
        return [{ name: text }]
    }
    return undefined
  }
}
