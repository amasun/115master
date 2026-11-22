import { expect, test } from '@playwright/test'
import { HOME_URL, setupHarness } from '../../support'
import { watch } from '../../support/homeUtils'

/**
 * TopHeaderMod：顶栏与面包屑控制栏增强
 * - 保留官方原生云下载按钮，不再注入插件版离线下载入口
 * - 在 .list-topheader（面包屑栏）右侧注入统一分段按钮组（截图/介绍/头像/设置）
 * - 修正上传/新建下拉菜单位置
 * - mode=search 时整体跳过
 */
test.describe('TopHeaderMod', () => {
  test('保留官方云下载按钮并在面包屑栏右侧注入统一控制按钮组', async ({ page }) => {
    const errors = watch(page)
    await setupHarness(page)
    await page.goto(HOME_URL)

    // 官方云下载按钮保持保留，不再注入重复的插件版云下载按钮
    await expect(page.locator('a.master-offline-task-btn')).toHaveCount(0)
    await expect(page.locator('.button[menu="offline_task"]')).toBeAttached()

    /** 控制按钮组挂载在面包屑栏右侧，不挤占顶部操作栏 */
    await expect(page.locator('#js_top_panel_box .master-topbar-cluster')).toHaveCount(0)
    const cluster = page.locator('.list-topheader > .master-topbar-cluster')
    await expect(cluster).toBeAttached()
    await expect(cluster.locator('a.master-topbar-btn')).toHaveCount(5)

    /** 预览开关：默认 enableFilelistPreview=true → active */
    const preview = cluster.locator('a.master-preview-switch-btn')
    await expect(preview).toBeAttached()
    await expect(preview).toHaveAttribute('title', '关闭文件预览')
    await expect(preview).toHaveAttribute('aria-label', '关闭文件预览')
    await expect(preview).toHaveAttribute('aria-pressed', 'true')
    await expect(preview).toHaveClass(/active/)
    await expect(preview.locator('iconify-icon.preview-off')).toBeAttached()
    await expect(preview.locator('iconify-icon.preview-on')).toBeAttached()

    /** 上传/新建下拉菜单 left 被修正到对应按钮位置 */
    for (const name of ['upload_btn_add_dir', 'create_new_add_dir']) {
      await expect.poll(() => page.evaluate((menuName) => {
        const tab = document.querySelector(`[data-dropdown-tab="${menuName}"]`)
        const menu = document.querySelector<HTMLElement>(`[data-dropdown-content="${menuName}"]`)
        if (!tab || !menu)
          return null
        return Math.abs(Number.parseFloat(menu.style.left) - tab.getBoundingClientRect().left)
      }, name)).toBeLessThan(0.01)
    }
    expect(errors).toEqual([])
  })

  test('搜索模式：跳过顶栏修改，保留官方按钮', async ({ page }) => {
    const errors = watch(page)
    await setupHarness(page)
    await page.goto('https://115.com/?mode=search&search_value=演示')

    await expect(page.locator('li[title="动漫"]')).toBeAttached()
    await expect(page.locator('a.master-offline-task-btn')).toHaveCount(0)
    await expect(page.locator('.master-topbar-cluster')).toHaveCount(0)
    await expect(page.locator('a.master-preview-switch-btn')).toHaveCount(0)
    await expect(page.locator('.button[menu="offline_task"]')).toBeAttached()
    expect(errors).toEqual([])
  })
})
