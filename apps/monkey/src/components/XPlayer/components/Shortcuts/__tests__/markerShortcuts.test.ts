import { describe, expect, it } from 'vitest'
import { DEFAULT_ACTION_KEY_BINDINGS } from '../shortcuts.const'

describe('shortcuts 默认按键互斥性校验', () => {
  it('遍历 DEFAULT_ACTION_KEY_BINDINGS，所有默认按键转小写后互不重复', () => {
    const seen = new Map<string, string>()

    for (const [action, bindings] of Object.entries(DEFAULT_ACTION_KEY_BINDINGS)) {
      for (const key of bindings) {
        const lowerKey = key.toLowerCase()
        if (seen.has(lowerKey)) {
          const conflictingAction = seen.get(lowerKey)
          throw new Error(
            `按键冲突: "${key}" (小写 "${lowerKey}") 同时绑定于 "${conflictingAction}" 和 "${action}"`,
          )
        }
        seen.set(lowerKey, action)
      }
    }

    expect(seen.size).toBeGreaterThan(0)
    // 确认打点三个快捷键正确设置且唯一
    expect(seen.get('b')).toBe('addMarker')
    expect(seen.get(',')).toBe('prevMarker')
    expect(seen.get('.')).toBe('nextMarker')
  })
})
