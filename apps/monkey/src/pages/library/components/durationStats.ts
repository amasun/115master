import type { LibraryEntry } from '@/utils/mediaIndex'
import type { CustomLibrarySection } from '@/utils/userSettings'

export interface LibraryDurationCategory {
  key: string
  label: string
  count: number
  durationLabel: string
}

export interface LibraryDurationPersona {
  title: string
  tagline: string
}

export interface LibraryDurationStats {
  totalLabel: string
  categories: LibraryDurationCategory[]
  missingCount: number
  persona: LibraryDurationPersona
}

export interface LibraryPersonaMetrics {
  totalCount: number
  totalSeconds: number
  javSeconds: number
  cinemaSeconds: number
  otherSeconds: number
}

export function formatTotalDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0)
    return '0 分钟'
  const totalMinutes = Math.round(totalSeconds / 60)
  if (totalMinutes < 60)
    return `${Math.max(1, totalMinutes)} 分钟`
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  const base = mins > 0 ? `${hours} 小时 ${mins} 分钟` : `${hours} 小时`
  if (hours >= 24)
    return `${base}（约 ${(hours / 24).toFixed(1)} 天）`
  return base
}

export function estimateEntryDuration(entry: LibraryEntry): number {
  if (entry.kind === 'tv' || entry.kind === 'collection') {
    const filesSum = entry.files.reduce((sum, file) => sum + (file.duration > 0 ? file.duration : 0), 0)
    if (filesSum > 0)
      return filesSum
  }
  return entry.maxDuration > 0 ? entry.maxDuration : (entry.meta?.duration ?? 0)
}

export function resolveLibraryPersona(metrics: LibraryPersonaMetrics): LibraryDurationPersona {
  if (metrics.totalCount === 0 || metrics.totalSeconds <= 0) {
    return {
      title: '硬盘还很清白',
      tagline: '片库一片祥和，建议先去添置点精神食粮',
    }
  }

  const totalHours = metrics.totalSeconds / 3600
  const totalDays = totalHours / 24
  const javHours = metrics.javSeconds / 3600
  const cinemaHours = metrics.cinemaSeconds / 3600
  const javRatio = metrics.javSeconds / metrics.totalSeconds
  const cinemaRatio = metrics.cinemaSeconds / metrics.totalSeconds
  const otherRatio = metrics.otherSeconds / metrics.totalSeconds

  if (totalHours < 10) {
    return {
      title: '刚领入门券',
      tagline: '库存还不到一个通宵的量，115 的空间都在替你着急',
    }
  }

  if (totalHours >= 3000) {
    return {
      title: '赛博亚历山大图书馆长',
      tagline: `不吃不喝连看 ${Math.round(totalDays)} 天，建议直接申遗`,
    }
  }

  if (javHours >= 200 && cinemaHours >= 200) {
    return {
      title: '雅俗共赏·双料宗师',
      tagline: '左手奥斯卡右手老师傅，艺术与本能达到了微妙平衡',
    }
  }

  if (javHours >= 1000 && javRatio >= 0.75) {
    return {
      title: '深夜人类学研究员',
      tagline: `累计 ${Math.round(javHours)} 小时田野调查，硬盘里装的是半部行业编年史`,
    }
  }

  if (cinemaHours >= 500 && cinemaRatio >= 0.65) {
    return {
      title: '私人放映厅主理人',
      tagline: '院线片长够办十届电影节，豆瓣 Top250 看了都得递烟',
    }
  }

  if (javHours >= 100 && javRatio >= 0.8) {
    return {
      title: '营养快线 VIP 股东',
      tagline: `片库含番量 ${Math.round(javRatio * 100)}%，温馨提示：多喝热水，注意护肝`,
    }
  }

  if (javHours >= 20 && javRatio >= 0.65) {
    return {
      title: '老师们的忠实课代表',
      tagline: '学习资料排期已满，建议制定科学复习计划',
    }
  }

  if (cinemaHours >= 30 && cinemaRatio >= 0.7) {
    return {
      title: '正经影迷（大概吧）',
      tagline: `院线占比 ${Math.round(cinemaRatio * 100)}%，正经得让人有点不好意思调侃`,
    }
  }

  if (otherRatio >= 0.55 && totalHours >= 30) {
    return {
      title: '仓鼠系合集收藏家',
      tagline: '存了就是看了，下完就算拥有，主打一个松鼠过冬',
    }
  }

  if (javHours >= 20 && cinemaHours >= 20) {
    return {
      title: '端水大师',
      tagline: '白天看剧情片陶冶情操，晚上看动作片放松身心，安排得明明白白',
    }
  }

  if (totalHours >= 200) {
    return {
      title: '熬夜冠军预备役',
      tagline: '按每天看 2 小时算，足够你从今年追到明年',
    }
  }

  return {
    title: '云端囤片新人',
    tagline: '库存正在稳步膨胀，离塞满网盘只差几个离线链接',
  }
}

export function buildLibraryDurationStats(
  entries: readonly LibraryEntry[],
  customSections: readonly CustomLibrarySection[],
): LibraryDurationStats {
  const buckets = new Map<string, { label: string, count: number, seconds: number }>()
  const sectionById = new Map(customSections.map(section => [section.id, section]))

  const addBucket = (key: string, label: string, seconds: number) => {
    const existing = buckets.get(key)
    if (existing) {
      existing.count += 1
      existing.seconds += seconds
      return
    }
    buckets.set(key, { label, count: 1, seconds })
  }

  let totalSeconds = 0
  let missingCount = 0
  let javSeconds = 0
  let cinemaSeconds = 0
  let otherSeconds = 0

  for (const entry of entries) {
    const sec = estimateEntryDuration(entry)
    if (sec > 0)
      totalSeconds += sec
    else
      missingCount += 1

    if (entry.sectionId) {
      const section = sectionById.get(entry.sectionId)
      addBucket(`section:${entry.sectionId}`, section?.name ?? '自定义栏目', sec)
      if (section?.scrapeMode === 'jav')
        javSeconds += sec
      else if (section?.scrapeMode === 'cinema')
        cinemaSeconds += sec
      else
        otherSeconds += sec
    }
    else if (entry.kind === 'jav') {
      addBucket('jav', 'AV 作品', sec)
      javSeconds += sec
    }
    else if (entry.kind === 'movie' || entry.kind === 'tv') {
      addBucket('cinema', '院线影视', sec)
      cinemaSeconds += sec
    }
    else {
      addBucket('other', '合集 / 其他', sec)
      otherSeconds += sec
    }
  }

  const orderedKeys = ['jav', 'cinema', 'other', ...customSections.map(section => `section:${section.id}`)]
  const categories = orderedKeys
    .map((key) => {
      const item = buckets.get(key)
      if (!item || item.count === 0)
        return null
      return {
        key,
        label: item.label,
        count: item.count,
        durationLabel: formatTotalDuration(item.seconds),
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  return {
    totalLabel: formatTotalDuration(totalSeconds),
    categories,
    missingCount,
    persona: resolveLibraryPersona({
      totalCount: entries.length,
      totalSeconds,
      javSeconds,
      cinemaSeconds,
      otherSeconds,
    }),
  }
}
