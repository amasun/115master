import { expect, test } from '@playwright/test'
import { json, MASTER_URL, setupHarness, watch } from '../../support'

const OFFLINE_QUOTA_RE = /^https:\/\/115\.com\/web\/lixian\?/

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

    // 侧边栏包含核心移植入口：星标收藏、标签管理、离线下载
    await expect(page.getByRole('button', { name: /星标收藏/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /标签管理/ })).toBeVisible()
    await expect(page.getByRole('button', { name: '离线下载' })).toBeVisible()

    // 点击标签管理切换到 /library/tags
    await page.getByRole('button', { name: /标签管理/ }).click()
    await expect(page).toHaveURL(/#\/library\/tags/)
    expect(errors).toEqual([])
  })
})
