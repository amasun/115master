export const MANUAL_AV_BINDINGS_STORAGE_KEY = '115Master_library_manual_av_bindings_v1'

/** 将手动输入的番号统一归一化为去除首尾空白的全角转半角大写格式 */
export function normalizeManualAvNumber(input: string): string {
  return input.normalize('NFKC').trim().toUpperCase()
}

/** 清洗并规范化本地存储的手动番号绑定映射（mediaKey -> avNumber） */
export function sanitizeManualAvBindings(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return {}

  const result: Record<string, string> = {}
  for (const [key, val] of Object.entries(raw)) {
    const mediaKey = key.trim()
    if (!mediaKey || typeof val !== 'string')
      continue
    const av = normalizeManualAvNumber(val)
    if (!av)
      continue
    result[mediaKey] = av
  }
  return result
}
