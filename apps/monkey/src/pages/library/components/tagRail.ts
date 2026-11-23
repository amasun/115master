import type { Tag } from '@/store/tagList'
import type { DriveLabelFacetCount } from '@/utils/mediaIndex'

export type TagRailMode = 'filter' | 'manage'

export interface TagRailItem {
  id: string
  name: string
  color: string
  sort: number
  count: number
  fromDrive: boolean
}

/**
 * 合并 115 网盘标签字典与本地影视库已关联的标签计数。
 * - 保留所有网盘标签（包括暂无作品的标签，count = 0）
 * - 补充仅在本地索引中出现、尚未在网盘字典拉取到的标签
 */
export function mergeTagRailItems(
  driveTags: Tag[],
  libraryLabels: DriveLabelFacetCount[],
  blankColor: string,
): TagRailItem[] {
  const countMap = new Map<string, DriveLabelFacetCount>()
  for (const label of libraryLabels)
    countMap.set(label.id, label)

  const seen = new Set<string>()
  const merged: TagRailItem[] = driveTags.map((tag) => {
    seen.add(tag.id)
    return {
      id: tag.id,
      name: tag.name,
      color: tag.color || blankColor,
      sort: tag.sort,
      count: countMap.get(tag.id)?.count ?? 0,
      fromDrive: true,
    }
  })

  for (const label of libraryLabels) {
    if (seen.has(label.id))
      continue
    merged.push({
      id: label.id,
      name: label.name,
      color: label.color || blankColor,
      sort: 0,
      count: label.count,
      fromDrive: false,
    })
  }

  return merged
}

/**
 * 按当前面板模式与搜索关键词过滤并排序标签列表。
 */
export function filterTagRailItems(
  items: TagRailItem[],
  options: {
    keyword: string
    mode: TagRailMode
    onlyWithWorks?: boolean
  },
): TagRailItem[] {
  const kw = options.keyword.trim().toLowerCase()
  let result = kw
    ? items.filter(item => item.name.toLowerCase().includes(kw))
    : [...items]

  if (options.mode === 'manage')
    return result

  if (options.onlyWithWorks)
    result = result.filter(item => item.count > 0)

  return result.sort((a, b) => {
    const aHasWorks = a.count > 0
    const bHasWorks = b.count > 0
    if (aHasWorks !== bHasWorks)
      return aHasWorks ? -1 : 1
    if (aHasWorks && bHasWorks && a.count !== b.count)
      return b.count - a.count
    if (!aHasWorks && !bHasWorks && a.sort !== b.sort)
      return a.sort - b.sort
    return a.name.localeCompare(b.name, 'zh-CN')
  })
}

/**
 * 解析网盘标签 ID 对应的显示名称：优先网盘字典，其次本地索引，最后回退原 ID。
 */
export function resolveDriveLabelName(
  labelId: string,
  driveTags: Tag[],
  libraryLabels: DriveLabelFacetCount[],
): string {
  return driveTags.find(tag => tag.id === labelId)?.name
    ?? libraryLabels.find(label => label.id === labelId)?.name
    ?? labelId
}
