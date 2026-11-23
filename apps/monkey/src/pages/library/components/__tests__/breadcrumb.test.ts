import { describe, expect, it } from 'vitest'
import { buildLibraryBreadcrumbs } from '../breadcrumb'

describe('buildLibraryBreadcrumbs', () => {
  it('renders single current root on all works wall', () => {
    expect(buildLibraryBreadcrumbs({
      routeName: 'library',
      view: 'all',
      count: 120,
    })).toEqual([
      {
        key: 'root',
        label: '全部作品',
        current: true,
        count: 120,
      },
    ])
  })

  it('uses wall target for root when entering detail directly from all works', () => {
    expect(buildLibraryBreadcrumbs({
      routeName: 'library-detail',
      view: 'all',
      detailLabel: 'SSIS-001',
      count: 120,
    })).toEqual([
      {
        key: 'root',
        label: '全部作品',
        current: false,
        target: { kind: 'wall' },
      },
      {
        key: 'detail',
        label: 'SSIS-001',
        title: 'SSIS-001',
        current: true,
      },
    ])
  })

  it('builds breadcrumbs for actors wall and standalone tags page', () => {
    expect(buildLibraryBreadcrumbs({
      routeName: 'library-actors',
      view: 'all',
      count: 42,
    })).toEqual([
      { key: 'root', label: '全部作品', current: false, target: { kind: 'root' } },
      { key: 'actors', label: '演员', count: 42, current: true },
    ])

    expect(buildLibraryBreadcrumbs({
      routeName: 'library-tags',
      view: 'all',
      count: 9,
    })).toEqual([
      { key: 'root', label: '全部作品', current: false, target: { kind: 'root' } },
      { key: 'tags', label: '标签管理', count: 9, current: true },
    ])

    expect(buildLibraryBreadcrumbs({
      routeName: 'library-cleanup',
      view: 'all',
      count: 4,
    })).toEqual([
      { key: 'root', label: '全部作品', current: false, target: { kind: 'root' } },
      { key: 'cleanup', label: '去重与清理', count: 4, current: true },
    ])
  })

  it('builds breadcrumbs for actor wall and actor detail', () => {
    expect(buildLibraryBreadcrumbs({
      routeName: 'library',
      view: 'all',
      actor: '三上悠亚',
      count: 18,
    })).toEqual([
      { key: 'root', label: '全部作品', current: false, target: { kind: 'root' } },
      { key: 'actor:三上悠亚', label: '三上悠亚', title: '演员：三上悠亚', count: 18, current: true },
    ])

    expect(buildLibraryBreadcrumbs({
      routeName: 'library-detail',
      view: 'all',
      actor: '三上悠亚',
      detailLabel: 'SSIS-001',
    })).toEqual([
      { key: 'root', label: '全部作品', current: false, target: { kind: 'root' } },
      {
        key: 'actor:三上悠亚',
        label: '三上悠亚',
        title: '演员：三上悠亚',
        current: false,
        target: { kind: 'scope', keep: ['actor'] },
      },
      { key: 'detail', label: 'SSIS-001', title: 'SSIS-001', current: true },
    ])
  })

  it('builds breadcrumbs for tag and view filters into detail', () => {
    expect(buildLibraryBreadcrumbs({
      routeName: 'library-detail',
      view: 'all',
      driveLabelId: 't1',
      driveLabelName: '经典收藏',
      detailLabel: 'SSIS-001',
    })).toEqual([
      { key: 'root', label: '全部作品', current: false, target: { kind: 'root' } },
      {
        key: 'driveLabel:t1',
        label: '经典收藏',
        title: '标签：经典收藏',
        current: false,
        target: { kind: 'scope', keep: ['driveLabel'] },
      },
      { key: 'detail', label: 'SSIS-001', title: 'SSIS-001', current: true },
    ])

    expect(buildLibraryBreadcrumbs({
      routeName: 'library-detail',
      view: 'starred',
      detailLabel: 'SSIS-001',
    })).toEqual([
      { key: 'root', label: '全部作品', current: false, target: { kind: 'root' } },
      {
        key: 'view:starred',
        label: '星标收藏',
        current: false,
        target: { kind: 'scope', keep: ['view'] },
      },
      { key: 'detail', label: 'SSIS-001', title: 'SSIS-001', current: true },
    ])
  })

  it('preserves cumulative scope keep arrays when multiple filters are active', () => {
    expect(buildLibraryBreadcrumbs({
      routeName: 'library-detail',
      view: 'starred',
      driveLabelId: 't1',
      driveLabelName: '经典收藏',
      actor: '三上悠亚',
      detailLabel: 'SSIS-001',
    })).toEqual([
      { key: 'root', label: '全部作品', current: false, target: { kind: 'root' } },
      {
        key: 'view:starred',
        label: '星标收藏',
        current: false,
        target: { kind: 'scope', keep: ['view'] },
      },
      {
        key: 'driveLabel:t1',
        label: '经典收藏',
        title: '标签：经典收藏',
        current: false,
        target: { kind: 'scope', keep: ['view', 'driveLabel'] },
      },
      {
        key: 'actor:三上悠亚',
        label: '三上悠亚',
        title: '演员：三上悠亚',
        current: false,
        target: { kind: 'scope', keep: ['view', 'driveLabel', 'actor'] },
      },
      { key: 'detail', label: 'SSIS-001', title: 'SSIS-001', current: true },
    ])
  })
})
