import type { RouteRecordRaw } from 'vue-router'

/** 路由配置 */
export const routes: RouteRecordRaw[] = [
  {
    name: 'home',
    path: '/',
    redirect: {
      name: 'drive',
      params: {
        cid: '0',
      },
    },
  },

  {
    name: 'drive',
    path: '/drive/:area?/:cid?',
    component: async () => import('../pages/drive/drive'),
  },

  {
    name: 'login',
    path: '/login',
    component: () => import('../pages/login/LoginPage'),
    beforeEnter: async (to) => {
      const guest = await import('./guest')
      return guest.guardLogin(to.query.redirect)
    },
  },

  {
    name: 'tags',
    path: '/tags',
    component: () => import('../pages/tags/tags'),
  },
  {
    path: '/library',
    component: () => import('../pages/library/index.vue'),
    children: [
      {
        name: 'library',
        path: '',
        component: () => import('../pages/library/wall.vue'),
      },
      {
        name: 'library-actors',
        path: 'actors',
        component: () => import('../pages/library/actors.vue'),
      },
      {
        name: 'library-detail',
        path: 'item/:mediaKey',
        component: () => import('../pages/library/detail.vue'),
      },
    ],
  },
  {
    name: 'video',
    path: '/video/:pickCode',
    component: () => import('../pages/video/index.vue'),
  },
  {
    name: 'test',
    path: '/test',
    component: () => import('../pages/test/TestPage'),
  },
]
