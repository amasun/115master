import type { IconifyJSON } from '@iconify/vue'
import { createRequire } from 'node:module'
import { phCollection } from 'virtual:phosphor-icons'
import { describe, expect, it } from 'vitest'
import { getOfflineIcon, I, resolveIconName } from '@/icons'
import { officialIcons } from '@/pages/official/icons'

const require = createRequire(import.meta.url)
const phosphorSource = require('@iconify-json/ph/icons.json') as IconifyJSON

describe('phosphor 离线图标子集契约', () => {
  it('registry.ts 中全部 ph:* 图标均已收入离线子集并存在于 @iconify-json/ph', () => {
    const phEntries = Object.entries(I).filter(([, value]) => value.startsWith('ph:'))
    expect(phEntries.length).toBeGreaterThan(0)

    phEntries.forEach(([key, value]) => {
      const iconName = value.slice(3)
      expect(phCollection.icons[iconName], `缺失离线图标 ${key}: ${value}`).toBeDefined()

      const existsInPackage = Boolean(
        phosphorSource.icons[iconName] || phosphorSource.aliases?.[iconName],
      )
      expect(existsInPackage, `@iconify-json/ph 中不存在 ${key}: ${value}`).toBe(true)
    })
  })

  it('全部 ph:*-bold 图标的伴生 -fill 变体均已自动收入离线子集', () => {
    const boldEntries = Object.values(I).filter(
      value => value.startsWith('ph:') && value.endsWith('-bold'),
    )
    expect(boldEntries.length).toBeGreaterThan(0)

    boldEntries.forEach((value) => {
      const fillName = value.slice(3).replace(/-bold$/, '-fill')
      expect(phCollection.icons[fillName], `缺失伴生 fill 变体 ph:${fillName}`).toBeDefined()
    })
  })

  it('resolveIconName 与 getOfflineIcon 正确切换 bold / fill 并透传 custom 图标', () => {
    expect(resolveIconName(I.LIBRARY, false)).toBe('ph:film-strip-bold')
    expect(resolveIconName(I.LIBRARY, true)).toBe('ph:film-strip-fill')
    expect(resolveIconName(I.STAR_FILL, true)).toBe('ph:star-fill')
    expect(resolveIconName(I.FILE_FOLDER, true)).toBe('custom:folder')

    const boldData = getOfflineIcon(I.DOCUMENT, false)
    const fillData = getOfflineIcon(I.DOCUMENT, true)
    expect(boldData.body.length).toBeGreaterThan(0)
    expect(fillData.body.length).toBeGreaterThan(0)
    expect(fillData.body).not.toBe(boldData.body)
    expect(boldData.width).toBe(256)
    expect(boldData.height).toBe(256)
  })

  it('officialIcons 全部从离线 Phosphor 子集生成有效 SVG 数据', () => {
    Object.entries(officialIcons).forEach(([key, icon]) => {
      expect(icon.body.length, `officialIcons.${key} body 为空`).toBeGreaterThan(0)
      expect(icon.width, `officialIcons.${key} width 无效`).toBeGreaterThan(0)
      expect(icon.height, `officialIcons.${key} height 无效`).toBeGreaterThan(0)
    })
  })
})
