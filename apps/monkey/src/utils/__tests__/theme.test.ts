// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolvedTheme, setThemeMode, setThemeOverride, themeMode, themeOverride } from '../theme'

describe('theme override', () => {
  let root: HTMLDivElement

  beforeEach(() => {
    root = document.createElement('div')
    root.id = 'my-app'
    document.body.append(root)
    setThemeOverride(null)
    setThemeMode('light')
  })

  afterEach(() => {
    setThemeOverride(null)
    setThemeMode('system')
    root.remove()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
    document.documentElement.style.backgroundColor = ''
    document.body.style.backgroundColor = ''
  })

  it('forces dark theme on DOM when overriding light theme', () => {
    expect(resolvedTheme.value).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    setThemeOverride('dark')

    expect(themeOverride.value).toBe('dark')
    expect(resolvedTheme.value).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.documentElement.style.backgroundColor).toBe('rgb(0, 0, 0)')
    expect(document.body.style.backgroundColor).toBe('rgb(0, 0, 0)')
    expect(root.style.backgroundColor).toBe('rgb(0, 0, 0)')
  })

  it('keeps dark override active when setThemeMode changes and restores user theme on clear', () => {
    setThemeMode('dark')
    setThemeOverride('dark')
    setThemeMode('light')

    expect(themeMode.value).toBe('light')
    expect(resolvedTheme.value).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')

    setThemeOverride(null)

    expect(themeOverride.value).toBeNull()
    expect(resolvedTheme.value).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(root.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.documentElement.style.backgroundColor).toBe('rgb(255, 255, 255)')
    expect(document.body.style.backgroundColor).toBe('rgb(255, 255, 255)')
    expect(root.style.backgroundColor).toBe('rgb(255, 255, 255)')
  })
})
