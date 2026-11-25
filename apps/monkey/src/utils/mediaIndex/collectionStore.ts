import type { CollectionCustomMeta } from './types'

export const COLLECTION_CUSTOM_META_STORAGE_KEY = '115Master_library_collection_meta_v1'
export const UNGROUPED_COLLECTION_CIDS_STORAGE_KEY = '115Master_library_ungrouped_collections_v1'

/** 将逗号、顿号或换行分隔的标签文本归一化为去重后的字符串数组 */
export function normalizeCollectionTags(input: string | readonly string[]): string[] {
  const rawList = typeof input === 'string'
    ? input.split(/[,，、\n]/)
    : input
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of rawList) {
    const trimmed = item.trim()
    if (!trimmed || seen.has(trimmed))
      continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

/** 清洗并规范化合集自定义元数据；所有字段均为空时返回 null 表示清除自定义 */
export function sanitizeCollectionCustomMeta(
  cid: string,
  patch: {
    title?: string
    overview?: string
    genres?: readonly string[]
    actors?: readonly string[]
  },
  now = Date.now(),
): CollectionCustomMeta | null {
  const normalizedCid = cid.trim()
  if (!normalizedCid)
    return null

  const title = patch.title?.trim() ?? ''
  const overview = patch.overview?.trim() ?? ''
  const genres = patch.genres ? normalizeCollectionTags(patch.genres) : []
  const actors = patch.actors ? normalizeCollectionTags(patch.actors) : []

  if (!title && !overview && genres.length === 0 && actors.length === 0)
    return null

  return {
    cid: normalizedCid,
    ...(title ? { title } : {}),
    ...(overview ? { overview } : {}),
    ...(genres.length > 0 ? { genres } : {}),
    ...(actors.length > 0 ? { actors } : {}),
    updatedAt: now,
  }
}
