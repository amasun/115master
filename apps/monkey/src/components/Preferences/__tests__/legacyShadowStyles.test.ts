// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createHostTokenStyles } from '../legacyShadowStyles'

describe('createHostTokenStyles', () => {
  it('把顶层与分组规则内的 :root 变量复制到 :host', () => {
    const css = [
      ':root { --ui-glass-blur-strong: 32px; }',
      '@media screen { :root { --ui-glass-brightness: 100%; } }',
      ':root, :host { --ignored: 1px; }',
      '.ui-dialog { color: red; }',
    ].join('\n')

    const result = createHostTokenStyles(document, css)

    expect(result.startsWith(':host {')).toBe(true)
    expect(result).toContain('--ui-glass-blur-strong: 32px')
    expect(result).toContain('--ui-glass-brightness: 100%')
    expect(result).not.toContain('--ignored')
    expect(result).not.toContain('color')
  })

  it('没有 :root 规则时返回空字符串', () => {
    expect(createHostTokenStyles(document, '.a { color: red; }')).toBe('')
  })
})
