import type { LibraryView } from '@/utils/mediaIndex'

export type BreadcrumbScopeKey = 'view' | 'driveLabel' | 'actor' | 'genre' | 'director'

export type BreadcrumbTarget
  = | { kind: 'root' }
    | { kind: 'wall' }
    | { kind: 'scope', keep: BreadcrumbScopeKey[] }

export interface LibraryBreadcrumbItem {
  key: string
  label: string
  title?: string
  count?: number
  current: boolean
  target?: BreadcrumbTarget
}

export interface LibraryBreadcrumbContext {
  routeName: string
  view: LibraryView
  actor?: string
  genre?: string
  director?: string
  driveLabelId?: string
  driveLabelName?: string
  detailLabel?: string
  count?: number
}

const VIEW_LABELS: Record<Exclude<LibraryView, 'all'>, string> = {
  recent: '最近入库',
  starred: '星标收藏',
  marked: '有打点',
}

/**
 * 构建影视库顶部面包屑导航链路：
 * - 全部作品（顶层首页）
 * - 模块或筛选层级（如 最近入库 / 标签 / 演员 / 题材 / 导演）
 * - 作品详情
 */
export function buildLibraryBreadcrumbs(ctx: LibraryBreadcrumbContext): LibraryBreadcrumbItem[] {
  const root: LibraryBreadcrumbItem = {
    key: 'root',
    label: '全部作品',
    current: false,
    target: { kind: 'root' },
  }

  if (ctx.routeName === 'library-actors') {
    return [
      root,
      {
        key: 'actors',
        label: '演员',
        count: ctx.count,
        current: true,
      },
    ]
  }

  if (ctx.routeName === 'library-tags') {
    return [
      root,
      {
        key: 'tags',
        label: '标签管理',
        count: ctx.count,
        current: true,
      },
    ]
  }

  if (ctx.routeName === 'library-cleanup') {
    return [
      root,
      {
        key: 'cleanup',
        label: '去重与清理',
        count: ctx.count,
        current: true,
      },
    ]
  }

  const items: LibraryBreadcrumbItem[] = [root]
  const kept: BreadcrumbScopeKey[] = []

  if (ctx.view !== 'all') {
    kept.push('view')
    items.push({
      key: `view:${ctx.view}`,
      label: VIEW_LABELS[ctx.view],
      current: false,
      target: { kind: 'scope', keep: [...kept] },
    })
  }

  if (ctx.driveLabelId) {
    const label = ctx.driveLabelName || ctx.driveLabelId
    kept.push('driveLabel')
    items.push({
      key: `driveLabel:${ctx.driveLabelId}`,
      label,
      title: `标签：${label}`,
      current: false,
      target: { kind: 'scope', keep: [...kept] },
    })
  }

  if (ctx.actor) {
    kept.push('actor')
    items.push({
      key: `actor:${ctx.actor}`,
      label: ctx.actor,
      title: `演员：${ctx.actor}`,
      current: false,
      target: { kind: 'scope', keep: [...kept] },
    })
  }

  if (ctx.genre) {
    kept.push('genre')
    items.push({
      key: `genre:${ctx.genre}`,
      label: ctx.genre,
      title: `题材：${ctx.genre}`,
      current: false,
      target: { kind: 'scope', keep: [...kept] },
    })
  }

  if (ctx.director) {
    kept.push('director')
    items.push({
      key: `director:${ctx.director}`,
      label: ctx.director,
      title: `导演：${ctx.director}`,
      current: false,
      target: { kind: 'scope', keep: [...kept] },
    })
  }

  if (ctx.routeName === 'library-detail') {
    if (kept.length === 0)
      root.target = { kind: 'wall' }

    const detailLabel = ctx.detailLabel || '作品详情'
    items.push({
      key: 'detail',
      label: detailLabel,
      title: detailLabel,
      current: true,
    })
    return items
  }

  const last = items[items.length - 1]
  last.current = true
  last.count = ctx.count
  delete last.target
  return items
}
