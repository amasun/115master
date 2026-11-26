import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

const gmStore = vi.hoisted(() => new Map<string, unknown>())
const gmSetValue = vi.hoisted(() => vi.fn((key: string, value: unknown) => {
  gmStore.set(key, structuredClone(value))
}))
const testLogger = { info: vi.fn() }

vi.mock('$', () => ({
  GM_getValue: (key: string) => gmStore.get(key),
  GM_setValue: gmSetValue,
}))

vi.mock('@/utils/logger', () => ({
  appLogger: {
    sub: () => ({ info: vi.fn() }),
  },
}))

const {
  buildRootScanPlan,
  getConfiguredIndexRootCategoryMap,
  getConfiguredIndexRootCids,
  getIndexFoldersByCategory,
  normalizeIndexRootFolders,
  replaceIndexFoldersForCategory,
  userSettings,
  useUserSetting,
} = await import('../userSettings')

describe('useUserSetting', () => {
  beforeEach(() => {
    gmSetValue.mockClear()
  })

  it('同一设置键复用一份状态和一组监听', () => {
    /**
     * ================================================================================
     * 步骤1：验证设置状态按键共享
     * ================================================================================
     * 目标：文件列表中的重复组件不会重复注册设置监听。
     * 操作：
     * 1) 连续获取同一设置键
     * 2) 验证引用复用和双向同步
     */
    testLogger.info('开始验证共享用户设置状态')

    /** 1.1 监听底层设置注册次数 */
    const watchSpy = vi.spyOn(userSettings, 'watch')

    /** 1.2 在临时组件作用域内首次获取设置键 */
    const ownerScope = effectScope()
    const first = ownerScope.run(() => useUserSetting('enableAvInfo'))!

    // 1.3 模拟首次调用设置的组件卸载
    ownerScope.stop()

    /** 1.4 再次获取同一设置键 */
    const second = useUserSetting('enableAvInfo')

    // 1.5 验证引用复用且只注册一次底层监听
    expect(second).toBe(first)
    expect(watchSpy).toHaveBeenCalledOnce()

    // 1.6 验证首次组件卸载后仍能写回用户设置
    first.value = false
    expect(userSettings.value.enableAvInfo).toBe(false)
    expect(gmSetValue).toHaveBeenCalledOnce()

    // 1.7 验证用户设置变化同步到共享状态
    userSettings.value.enableAvInfo = true
    expect(second.value).toBe(true)

    testLogger.info('共享用户设置状态验证完成')
  })

  it('规范化索引根目录列表并在未配置时默认回退全盘', () => {
    expect(userSettings.value.indexRootFolders).toEqual([])
    expect(userSettings.value.tmdbApiKey).toBe('')
    expect(userSettings.value.tmdbProxyUrl).toBe('')
    expect(getConfiguredIndexRootCids([])).toEqual(['0'])

    const normalized = normalizeIndexRootFolders([
      { cid: '0', name: '根目录', path: '根目录' },
      { cid: ' 123 ', name: ' 影视库 ', path: ' 根目录 / 影视库 ' },
      { cid: '123', name: '重复忽略', path: '重复忽略' },
      { cid: '', name: '空', path: '空' },
      { cid: '456', name: '电影合集', path: '', category: 'cinema' },
    ])
    expect(normalized).toEqual([
      { cid: '123', name: '影视库', path: '根目录 / 影视库', category: 'jav' },
      { cid: '456', name: '电影合集', path: '电影合集', category: 'cinema' },
    ])
    expect(getConfiguredIndexRootCids(normalized)).toEqual(['123', '456'])
    expect(getConfiguredIndexRootCategoryMap(normalized)).toEqual(new Map([
      ['123', 'jav'],
      ['456', 'cinema'],
    ]))

    const javOnly = getIndexFoldersByCategory(normalized, 'jav')
    expect(javOnly.map(f => f.cid)).toEqual(['123'])

    const replacedCinema = replaceIndexFoldersForCategory(normalized, 'cinema', [
      { cid: '789', name: '新院线', path: '新院线', category: 'jav' },
    ])
    expect(replacedCinema).toEqual([
      { cid: '123', name: '影视库', path: '根目录 / 影视库', category: 'jav' },
      { cid: '789', name: '新院线', path: '新院线', category: 'cinema' },
    ])

    const planDisabled = buildRootScanPlan({
      indexRootFolders: replacedCinema,
      enableCinemaLibrary: false,
      customSections: [
        {
          id: 'sec_doc',
          name: '纪录片',
          scrapeMode: 'folder_collection',
          folders: [{ cid: '901', name: 'BBC', path: 'BBC', category: 'jav' }],
          createdAt: 1,
        },
      ],
    })
    expect(planDisabled.targets.map(t => `${t.cid}:${t.category}:${t.sectionId ?? ''}:${t.priority}`)).toEqual([
      '123:jav::1',
      '901:jav:sec_doc:3',
    ])

    const planEnabled = buildRootScanPlan({
      indexRootFolders: replacedCinema,
      enableCinemaLibrary: true,
      customSections: [],
    })
    expect(planEnabled.targets.map(t => `${t.cid}:${t.category}:${t.priority}`)).toEqual([
      '123:jav:1',
      '789:cinema:2',
    ])
    expect(planEnabled.signature).not.toBe(planDisabled.signature)
  })
})
