import { describe, expect, it } from 'vitest'
import {
  MANUAL_AV_BINDINGS_STORAGE_KEY,
  normalizeManualAvNumber,
  sanitizeManualAvBindings,
} from '../manualMatchStore'

describe('manualMatchStore', () => {
  it('使用预期 storage key 并规范化番号输入', () => {
    expect(MANUAL_AV_BINDINGS_STORAGE_KEY).toBe('115Master_library_manual_av_bindings_v1')
    expect(normalizeManualAvNumber('  ｓｓｉｓ-001 \n')).toBe('SSIS-001')
    expect(normalizeManualAvNumber('   ')).toBe('')
  })

  it('清洗无效绑定并规范化有效映射', () => {
    expect(sanitizeManualAvBindings(null)).toEqual({})
    expect(sanitizeManualAvBindings(['SSIS-001'])).toEqual({})
    expect(sanitizeManualAvBindings({
      ' file:100 ': ' ssis-001 ',
      'jav:ABP100': 'abp-123',
      '': 'SSIS-002',
      'file:empty': '   ',
      'file:num': 123,
    })).toEqual({
      'file:100': 'SSIS-001',
      'jav:ABP100': 'ABP-123',
    })
  })
})
