/**
 * 路由类型
 * @see https://router.vuejs.org/guide/advanced/typed-routes
 */

import type { RouteRecordInfo } from 'vue-router'

export interface RouteNamedMap {
  /** 登录页 */
  'login': RouteRecordInfo<
    'login',
    '/login',
    Record<never, never>,
    Record<never, never>
  >
  /** 网盘页 */
  'drive': RouteRecordInfo<
    'drive',
    '/drive/:area?/:cid?',
    {
      area?: 'all' | 'recent' | 'trash' | 'star' | 'share'
      cid: string
    },
    {
      area?: 'all' | 'recent' | 'trash' | 'star' | 'share'
      cid: string
    }
  >
  /** 影视库页 */
  'library': RouteRecordInfo<
    'library',
    '/library',
    Record<never, never>,
    Record<never, never>
  >
  /** 影视库演员墙 */
  'library-actors': RouteRecordInfo<
    'library-actors',
    '/library/actors',
    Record<never, never>,
    Record<never, never>
  >
  /** 影视库标签管理 */
  'library-tags': RouteRecordInfo<
    'library-tags',
    '/library/tags',
    Record<never, never>,
    Record<never, never>
  >
  /** 影视库详情页 */
  'library-detail': RouteRecordInfo<
    'library-detail',
    '/library/item/:mediaKey',
    {
      mediaKey: string
    },
    {
      mediaKey: string
    }
  >
  /** 播放页 */
  'video': RouteRecordInfo<
    'video',
    '/video/:pickCode',
    {
      pickCode: string
    },
    {
      pickCode: string
    }
  >
  /** 404 */
  'notFound': RouteRecordInfo<
    'not-found',
    '/:path(.*)',
    { path: string },
    { path: string },
    never
  >
}

// Last, you will need to augment the Vue Router types with this map of routes
declare module 'vue-router' {
  interface TypesConfig {
    RouteNamedMap: RouteNamedMap
  }
}
