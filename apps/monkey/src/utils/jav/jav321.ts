import type { JavInfo } from './jav'
import dayjs from 'dayjs'
import { cleanActorName } from '@/utils/actressNameMatcher'
import { appLogger } from '@/utils/logger'
import { GMRequest } from '@/utils/request/gmRequest'
import { Jav, JAV_SOURCE } from './jav'

const logger = appLogger.sub('Jav321')

interface Jav321Field {
  text: string
  links: Array<{ name: string, url?: string }>
}

/** 清理标签名，去除冒号与多余空白。 */
function normalizeLabelKey(raw?: string | null): string {
  return raw?.replace(/[:：\s]+/g, '').trim() ?? ''
}

/** 把相对地址或协议相对地址转换为绝对 HTTPS 地址。 */
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

/** Jav321 番号资料源（无日区 IP 限制，适合作为 DMM/MGS 通用兜底）。 */
export class Jav321 extends Jav {
  source = JAV_SOURCE.JAV321
  baseUrl = 'https://jp.jav321.com'
  detailUrl = ''
  searchUrl = ''
  request = new GMRequest({
    redirect: 'follow',
    timeout: 10000,
  })

  private fields = new Map<string, Jav321Field>()
  private starScores: number[] = []

  async getInfoByAvNumber(avNumber: string) {
    logger.info('开始请求 Jav321 番号资料', avNumber)

    this.searchUrl = `${this.baseUrl}/search`
    this.detailUrl = this.searchUrl

    const response = await this.request.request(this.searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Referer': `${this.baseUrl}/`,
      },
      body: `sn=${encodeURIComponent(avNumber)}`,
    })

    if (response.status === 404) {
      logger.info('Jav321 番号资料未找到', avNumber)
      throw new Jav.NotFound()
    }
    if (response.status !== 200 && response.status !== 302) {
      logger.warn('Jav321 响应异常', avNumber, response.status)
      throw new Jav.PageError()
    }

    const html = await response.text()
    if (response.url && /\/video\//i.test(response.url))
      this.detailUrl = response.url

    const info = await this.parseInfo(html)
    if (!info?.avNumber && !info?.title) {
      logger.info('Jav321 页面无有效影片信息', avNumber)
      throw new Jav.NotFound()
    }

    logger.info('Jav321 番号资料请求完成', avNumber, info.avNumber)
    return info
  }

  async parseInfoBefore(dom: Document): Promise<Document> {
    this.fields.clear()
    this.starScores = []

    // 从 og:url / canonical 补全实际详情页 URL
    const canonical = dom.querySelector('link[rel="canonical"]')?.getAttribute('href')
      || dom.querySelector('meta[property="og:url"]')?.getAttribute('content')
    const absCanonical = toAbsUrl(canonical, this.baseUrl)
    if (absCanonical && /\/video\//i.test(absCanonical))
      this.detailUrl = absCanonical

    const infoContainer = dom.querySelector('.panel-body .col-md-9')
    if (infoContainer) {
      const boldNodes = Array.from(infoContainer.querySelectorAll('b'))
      for (const bold of boldNodes) {
        const key = normalizeLabelKey(bold.textContent)
        if (!key)
          continue

        const textParts: string[] = []
        const links: Array<{ name: string, url?: string }> = []
        let cursor: Node | null = bold.nextSibling

        while (cursor) {
          if (cursor.nodeType === 1) {
            const el = cursor as Element
            const tag = el.tagName.toUpperCase()
            if (tag === 'B' || tag === 'BR')
              break
            if (tag === 'A') {
              const name = el.textContent?.trim() ?? ''
              if (name) {
                links.push({
                  name,
                  url: toAbsUrl(el.getAttribute('href'), this.baseUrl),
                })
                textParts.push(name)
              }
            }
            else if (tag === 'IMG') {
              const src = el.getAttribute('src') ?? ''
              const starMatch = src.match(/\/img\/(\d+)\.gif/i)
              if (starMatch?.[1])
                this.starScores.push(Number(starMatch[1]) / 10)
            }
            else {
              const text = el.textContent?.trim()
              if (text)
                textParts.push(text)
            }
          }
          else if (cursor.nodeType === 3) {
            const text = cursor.textContent?.replace(/\s+/g, ' ').trim()
            if (text)
              textParts.push(text)
          }
          cursor = cursor.nextSibling
        }

        const joinedText = textParts.join(' ').replace(/^[:：\s]+/, '').trim()
        this.fields.set(key, { text: joinedText, links })
      }
    }

    return dom
  }

  parseAvNumber(dom: Document): JavInfo['avNumber'] {
    const fromField = this.fields.get('品番')?.text.trim()
    if (fromField && fromField !== '-')
      return fromField.toUpperCase()

    const smallText = dom.querySelector('.panel-heading h3 small')?.textContent?.trim() ?? ''
    const match = smallText.match(/[A-Z0-9]+-[A-Z0-9]+/i)
    return match?.[0]?.toUpperCase()
  }

  parseTitle(dom: Document): JavInfo['title'] {
    const heading = dom.querySelector('.panel-heading h3')
    if (!heading)
      return undefined

    const clone = heading.cloneNode(true) as Element
    clone.querySelectorAll('small').forEach(node => node.remove())
    const title = clone.textContent?.replace(/\s+/g, ' ').trim()
    return title || undefined
  }

  parseDate(): JavInfo['date'] {
    const raw = this.fields.get('配信開始日')?.text || this.fields.get('発売日')?.text
    if (!raw)
      return undefined
    const matched = raw.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/)?.[0]
    if (!matched)
      return undefined
    const ts = dayjs(matched).valueOf()
    return Number.isFinite(ts) ? ts : undefined
  }

  parseDuration(): JavInfo['duration'] {
    const raw = this.fields.get('収録時間')?.text
    const match = raw?.match(/(\d+)\s*分?/)
    if (!match?.[1])
      return undefined
    const minutes = Number(match[1])
    return Number.isFinite(minutes) && minutes > 0 ? minutes : undefined
  }

  parseDirector(): JavInfo['director'] {
    const field = this.fields.get('監督')
    if (!field)
      return undefined
    if (field.links.length)
      return field.links
    const name = field.text.trim()
    return name && name !== '-' ? [{ name }] : undefined
  }

  parseActor(): JavInfo['actors'] {
    const field = this.fields.get('出演者')
    if (!field)
      return undefined

    if (field.links.length) {
      const actors = field.links
        .map(link => ({
          name: cleanActorName(link.name),
          url: link.url,
          sex: 1 as const,
        }))
        .filter(actor => Boolean(actor.name))
      return actors.length ? actors : undefined
    }

    const fallback = field.text
      .split(/[,，/／、]+/)
      .map(name => cleanActorName(name))
      .filter(name => Boolean(name) && name !== '-')
      .map(name => ({ name, sex: 1 as const }))
    return fallback.length ? fallback : undefined
  }

  parseStudio(): JavInfo['studio'] {
    const field = this.fields.get('メーカー')
    if (!field)
      return undefined
    if (field.links.length)
      return field.links
    const name = field.text.trim()
    return name && name !== '-' ? [{ name }] : undefined
  }

  parsePublisher(): JavInfo['publisher'] {
    const field = this.fields.get('レーベル') || this.fields.get('発行')
    if (!field)
      return undefined
    if (field.links.length)
      return field.links
    const name = field.text.trim()
    return name && name !== '-' ? [{ name }] : undefined
  }

  parseCoverSingle(dom: Document): JavInfo['coverSingle'] {
    const src = dom.querySelector('.panel-body .col-md-3 img.img-responsive')?.getAttribute('src')
    const url = toAbsUrl(src, this.baseUrl)
    return url ? { url, referer: this.detailUrl } : undefined
  }

  parseCover(dom: Document): JavInfo['cover'] {
    const largeImg = dom.querySelector('.col-xs-12.col-md-12 p img.img-responsive')
      || dom.querySelector('.col-xs-12.col-md-12 img.img-responsive')
    const largeUrl = toAbsUrl(largeImg?.getAttribute('src'), this.baseUrl)
    if (largeUrl)
      return { url: largeUrl, referer: this.detailUrl }

    const single = this.parseCoverSingle(dom)
    return single ? { ...single } : undefined
  }

  parsePreview(dom: Document): JavInfo['preview'] {
    const snapshots = Array.from(
      dom.querySelectorAll('.col-xs-12.col-md-12 a[href*="/snapshot/"] img[src]'),
    )
    const items = snapshots
      .map((img) => {
        const thumb = toAbsUrl(img.getAttribute('src'), this.baseUrl)
        if (!thumb)
          return null
        return {
          thumbnail: thumb,
          raw: thumb,
        }
      })
      .filter((item): item is { thumbnail: string, raw: string } => Boolean(item))

    if (items.length)
      return items

    // 兜底：若页面无 /snapshot/ 链接，则跳过首张大图，收集其余预览图
    const allImgs = Array.from(dom.querySelectorAll('.col-xs-12.col-md-12 img.img-responsive'))
    const rest = allImgs.slice(1)
      .map((img) => {
        const url = toAbsUrl(img.getAttribute('src'), this.baseUrl)
        return url ? { thumbnail: url, raw: url } : null
      })
      .filter((item): item is { thumbnail: string, raw: string } => Boolean(item))
    return rest.length ? rest : undefined
  }

  parseSeries(): JavInfo['series'] {
    const field = this.fields.get('シリーズ')
    if (!field)
      return undefined
    if (field.links.length)
      return field.links
    const name = field.text.trim()
    return name && name !== '-' ? [{ name }] : undefined
  }

  parseCategory(): JavInfo['category'] {
    const field = this.fields.get('ジャンル')
    if (!field)
      return undefined
    if (field.links.length)
      return field.links
    const items = field.text
      .split(/[,，/／、]+/)
      .map(name => name.trim())
      .filter(name => Boolean(name) && name !== '-')
      .map(name => ({ name }))
    return items.length ? items : undefined
  }

  parseScore(): JavInfo['score'] {
    const raw = this.fields.get('平均評価')?.text
    const numMatch = raw?.match(/(\d+(?:\.\d+)?)/)
    if (numMatch?.[1]) {
      const score = Number(numMatch[1])
      if (Number.isFinite(score) && score > 0)
        return score
    }
    return this.starScores[0]
  }
}
