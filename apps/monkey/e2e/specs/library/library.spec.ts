import { expect, test } from '@playwright/test'
import { FILES_RE, json, MASTER_URL, setupHarness, video, watch } from '../../support'

const OFFLINE_QUOTA_RE = /^https:\/\/115\.com\/web\/lixian\?/

function makePathItem(cid: string, name: string, pid = '') {
  return {
    cid,
    name,
    aid: '1',
    pid,
    p_cid: pid,
    isp: '',
    iss: '',
    fv: '',
    fvs: '',
  }
}

test.describe('影视库主界面（替代原 Fusion）', () => {
  test('默认根路径与旧 /drive 路由均自动重定向到影视库，且保留 offline_url 自动弹出离线下载', async ({ page }) => {
    const errors = watch(page)
    await setupHarness(page, {
      mocks: api => api.override(OFFLINE_QUOTA_RE, ({ route }) => json(route, {
        state: true,
        count: 10,
        surplus: 8,
        used: 2,
        package: [],
        max_size: 0,
      })),
    })

    const magnet = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567'
    await page.goto(`${MASTER_URL}#/?offline_url=${encodeURIComponent(magnet)}`)

    await expect(page).toHaveURL(/#\/library/)
    const dialog = page.getByRole('dialog', { name: '离线下载' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('textarea')).toHaveValue(magnet)
    await dialog.getByRole('button', { name: '取消' }).click()

    // 旧 /drive 路由重定向至 /library
    await page.goto(`${MASTER_URL}#/drive/star`)
    await expect(page).toHaveURL(/#\/library/)

    // 侧边栏包含核心移植入口：星标收藏、标签、离线下载
    await expect(page.getByRole('button', { name: /星标收藏/ })).toBeVisible()
    await expect(page.getByRole('button', { name: '标签与标签管理' })).toBeVisible()
    await expect(page.getByRole('button', { name: '离线下载' })).toBeVisible()

    // 点击标签打开紧邻侧边栏右侧的 rail2 标签面板（保持在 #/library）
    await page.getByRole('button', { name: '标签与标签管理' }).click()
    await expect(page).toHaveURL(/#\/library/)
    const tagRail = page.getByLabel('标签面板')
    await expect(tagRail).toBeVisible()

    // 点击面板内的「管理」按钮进入内联管理模式并可看到「新建标签」入口
    await tagRail.getByRole('button', { name: '管理' }).click()
    await expect(tagRail.getByRole('button', { name: '新建标签' })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('影视库支持隐藏疑似广告视频开关、与清理页共用持久化阈值并显示父级源目录名', async ({ page }) => {
    const errors = watch(page)
    const rootPath = makePathItem('0', '根目录')
    const downloadsPath = makePathItem('2001', '云下载', '0')
    const featureDirPath = makePathItem('2002', '精选电影', '2001')
    const adDirPath = makePathItem('2003', '推广广告', '2001')

    const featureVideo = {
      ...video('正常电影示例.mp4', '2002'),
      fid: '900000000001001',
      play_long: 7200,
      s: 2 * 1024 ** 3,
    }
    const adVideo = {
      ...video('片头预览.mp4', '2003'),
      fid: '900000000001002',
      play_long: 30,
      s: 10 * 1024 * 1024,
    }

    await setupHarness(page, {
      mocks: (api) => {
        api.override(OFFLINE_QUOTA_RE, ({ route }) => json(route, {
          state: true,
          count: 10,
          surplus: 8,
          used: 2,
          package: [],
          max_size: 0,
        }))
        api.override(FILES_RE, ({ route, url }) => {
          const cid = url.searchParams.get('cid') ?? '0'
          const type = url.searchParams.get('type')
          const rAll = url.searchParams.get('r_all')

          if (cid === '0' && type === '4' && rAll === '1') {
            return json(route, {
              state: true,
              count: 2,
              file_count: 2,
              folder_count: 0,
              is_asc: 0,
              order: 'user_ptime',
              fc_mix: 0,
              offset: 0,
              cur: 1,
              data: [featureVideo, adVideo],
              path: [rootPath],
            })
          }

          if (cid === '2002') {
            return json(route, {
              state: true,
              count: 0,
              file_count: 0,
              folder_count: 0,
              offset: 0,
              cur: 1,
              data: [],
              path: [rootPath, downloadsPath, featureDirPath],
            })
          }

          if (cid === '2003') {
            return json(route, {
              state: true,
              count: 0,
              file_count: 0,
              folder_count: 0,
              offset: 0,
              cur: 1,
              data: [],
              path: [rootPath, downloadsPath, adDirPath],
            })
          }

          if (cid === '2001') {
            return json(route, {
              state: true,
              count: 0,
              file_count: 0,
              folder_count: 0,
              offset: 0,
              cur: 1,
              data: [],
              path: [rootPath, downloadsPath],
            })
          }
        })
      },
    })

    await page.goto(`${MASTER_URL}#/library`)

    // 默认开启「隐藏疑似广告视频」：正常影片可见，30s/10MB 短视频被隐藏
    await expect(page.getByRole('heading', { name: '正常电影示例.mp4' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '片头预览.mp4' })).toHaveCount(0)

    const hideAdBtn = page.getByRole('button', { name: '隐藏疑似广告视频', exact: true })
    await expect(hideAdBtn).toHaveAttribute('aria-pressed', 'true')

    // 切换关闭后展示疑似广告视频，再次开启并刷新验证持久化
    await hideAdBtn.click()
    await expect(hideAdBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('heading', { name: '片头预览.mp4' })).toBeVisible()

    await hideAdBtn.click()
    await expect(hideAdBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { name: '片头预览.mp4' })).toHaveCount(0)

    await page.reload()
    await expect(page.getByRole('heading', { name: '正常电影示例.mp4' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '片头预览.mp4' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '隐藏疑似广告视频', exact: true })).toHaveAttribute('aria-pressed', 'true')

    // 打开多维筛选栏并点击阈值入口跳转至清理页 Tab 2
    await page.getByRole('button', { name: '多维筛选', exact: true }).click()
    const thresholdBtn = page.getByRole('button', { name: '≤90s / 50MB' })
    await expect(thresholdBtn).toBeVisible()
    await thresholdBtn.click()

    await expect(page).toHaveURL(/#\/library\/cleanup\?tab=junk/)
    await expect(page.getByText('片头预览.mp4')).toBeVisible()

    /** 目录按钮显示「父级目录 / 源目录」且 tooltip 为完整路径 */
    const adFolderBtn = page.getByRole('button', { name: '云下载 / 推广广告' })
    await expect(adFolderBtn).toBeVisible()
    await expect(adFolderBtn).toHaveAttribute('title', '打开所在目录：根目录 / 云下载 / 推广广告')

    /** 将时长上限调整为 20 秒并持久化，30 秒视频在清理页与展示墙均不再判定为广告 */
    const durationInput = page.getByLabel('时长上限 (秒)')
    await durationInput.fill('20')
    await durationInput.blur()
    await expect(page.getByText('片头预览.mp4')).toHaveCount(0)

    await page.reload()
    await expect(page.getByLabel('时长上限 (秒)')).toHaveValue('20')
    await expect(page.getByText('片头预览.mp4')).toHaveCount(0)

    // 返回展示墙，开关依然开启但 30s 视频已按新阈值放行显示
    await page.getByRole('navigation', { name: '面包屑导航' }).getByRole('button', { name: '全部作品' }).click()
    await expect(page).toHaveURL(/#\/library$/)
    await expect(page.getByRole('button', { name: '隐藏疑似广告视频', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { name: '片头预览.mp4' })).toBeVisible()

    // 进入详情页验证文件列表的目录跳转按钮同样显示「父级目录 / 源目录」
    await page.getByRole('heading', { name: '正常电影示例.mp4' }).click()
    await expect(page).toHaveURL(/#\/library\/item\//)
    const detailFolderBtn = page.getByRole('button', { name: '云下载 / 精选电影' })
    await expect(detailFolderBtn).toBeVisible()
    await expect(detailFolderBtn).toHaveAttribute('title', '打开所在目录：根目录 / 云下载 / 精选电影')

    expect(errors).toEqual([])
  })
})
