import type { LibraryView, UncensoredKind } from '@/utils/mediaIndex'

export type BreadcrumbScopeKey = 'view' | 'driveLabel' | 'actor' | 'genre' | 'director' | 'publisher' | 'uncensoredKind'

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
  sectionName?: string
  actor?: string
  genre?: string
  director?: string
  publisher?: string
  uncensoredKind?: UncensoredKind
  driveLabelId?: string
  driveLabelName?: string
  detailLabel?: string
  count?: number
}

const VIEW_LABELS: Record<'cinema' | 'starred' | 'marked', string> = {
  cinema: '院线影视',
  starred: '星标收藏',
  marked: '有打点',
}

const UNCENSORED_LABELS: Record<UncensoredKind, string> = {
  ltx: 'LTX',
  lada: 'LADA',
  native: '无码',
  cracked: '破解',
}

/**
 * 构建影视库顶部面包屑导航链路：
 * - 番号影视（顶层首页）
 * - 模块或筛选层级（如 星标收藏 / 有打点 / 标签 / 演员 / 题材 / 导演）
 * - 作品详情
 */
export function buildLibraryBreadcrumbs(ctx: LibraryBreadcrumbContext): LibraryBreadcrumbItem[] {
  const root: LibraryBreadcrumbItem = {
    key: 'root',
    label: '番号影视',
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

  const isCinemaRoot = ctx.view === 'cinema'
  const rootItem: LibraryBreadcrumbItem = isCinemaRoot
    ? {
        key: 'view:cinema',
        label: VIEW_LABELS.cinema,
        current: false,
        target: { kind: 'scope', keep: ['view'] },
      }
    : root

  const items: LibraryBreadcrumbItem[] = [rootItem]
  const kept: BreadcrumbScopeKey[] = isCinemaRoot ? ['view'] : []

  if (ctx.view !== 'all' && !isCinemaRoot) {
    kept.push('view')
    const viewLabel = ctx.view.startsWith('section:')
      ? (ctx.sectionName || '自建栏目')
      : VIEW_LABELS[ctx.view as 'cinema' | 'starred' | 'marked']
    items.push({
      key: `view:${ctx.view}`,
      label: viewLabel,
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

  if (ctx.publisher) {
    kept.push('publisher')
    items.push({
      key: `publisher:${ctx.publisher}`,
      label: ctx.publisher,
      title: `片商：${ctx.publisher}`,
      current: false,
      target: { kind: 'scope', keep: [...kept] },
    })
  }

  if (ctx.uncensoredKind) {
    kept.push('uncensoredKind')
    const label = UNCENSORED_LABELS[ctx.uncensoredKind] ?? ctx.uncensoredKind
    items.push({
      key: `uncensoredKind:${ctx.uncensoredKind}`,
      label,
      title: `版本：${label}`,
      current: false,
      target: { kind: 'scope', keep: [...kept] },
    })
  }

  if (ctx.routeName === 'library-detail') {
    if (isCinemaRoot ? kept.length === 1 : kept.length === 0)
      rootItem.target = { kind: 'wall' }

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
