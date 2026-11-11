import { ref } from 'vue'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const APP_ROOT_ID = 'my-app'

/** 主题对应的根容器背景色（防止挂载前白闪/黑闪）；light 与 base-100 完全一致 */
const APP_BG: Record<ResolvedTheme, string> = {
  dark: '#000',
  light: '#fff',
}

/** 当前主题模式（含跟随系统） */
export const themeMode = ref<ThemeMode>('system')

/** 当前实际生效主题（解析 system 后） */
export const resolvedTheme = ref<ResolvedTheme>('dark')

function systemPrefersDark(): boolean {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
}

function resolve(mode: ThemeMode): ResolvedTheme {
  if (mode === 'light')
    return 'light'
  if (mode === 'dark')
    return 'dark'
  return systemPrefersDark() ? 'dark' : 'light'
}

/** 把当前主题写到 DOM */
function applyToDOM(theme: ResolvedTheme) {
  const root = document.getElementById(APP_ROOT_ID)
  if (!root)
    return
  root.setAttribute('data-theme', theme)
  root.style.backgroundColor = APP_BG[theme]
}

/** 同步当前主题到 DOM（不修改主题模式） */
export function syncResolvedTheme() {
  const next = resolve(themeMode.value)
  resolvedTheme.value = next
  applyToDOM(next)
}

/** 切换主题模式（仅写 ref + DOM，持久化由调用方负责） */
export function setThemeMode(mode: ThemeMode) {
  themeMode.value = mode
  syncResolvedTheme()
}

/** 初始化：应用当前模式并启动系统主题监听（仅在启动时调用一次） */
export function initTheme() {
  syncResolvedTheme()
  const mql = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
  if (!mql)
    return
  mql.addEventListener('change', () => {
    if (themeMode.value !== 'system')
      return
    syncResolvedTheme()
  })
}

/**
 * 获取嵌入官方页面的组件应使用的主题
 * @description MASTER 独立页跟随应用主题；官方页面没有应用根节点，按页面背景明暗判断
 */
export function detectHostTheme(): ResolvedTheme {
  const appTheme = document.getElementById(APP_ROOT_ID)?.getAttribute('data-theme')
  if (appTheme === 'light' || appTheme === 'dark')
    return appTheme

  for (const node of [document.body, document.documentElement]) {
    if (!node)
      continue
    const channels = getComputedStyle(node).backgroundColor.match(/[\d.]+/g)?.map(Number)
    if (!channels || channels.length < 3 || channels[3] === 0)
      continue
    const [r, g, b] = channels
    return (r * 299 + g * 587 + b * 114) / 1000 < 128 ? 'dark' : 'light'
  }
  // 背景透明时浏览器默认白底
  return 'light'
}
