import { unsafeWindow } from '$'
import { appLogger } from '@/utils/logger'
import { loadVideoIndexSnapshot, saveVideoIndexSnapshot } from '@/utils/superSearch/videoIndexStore'

export const NATIVE_DELETE_SYNC_STORAGE_KEY = '115Master_native_delete_sync_v1'

const NATIVE_DELETE_CAPTURE_MARKER = '__115masterNativeDeleteCaptureInstalled__'
const NATIVE_XHR_URL_KEY = '__115masterNativeDeleteUrl__'
const NATIVE_DELETE_PATH_RE = /\/rb\/delete(?:$|[/?#])/i
const FID_PARAM_KEY_RE = /^fid(?:\[\d*\])?$/i
const logger = appLogger.sub('NativeDeleteSync')

/** 判断请求地址是否为 115 原生删除接口 */
export function isNativeDeleteRequest(url: string): boolean {
  if (!url)
    return false
  try {
    const parsed = new URL(url, 'https://115.com')
    return (parsed.hostname === '115.com' || parsed.hostname.endsWith('.115.com'))
      && NATIVE_DELETE_PATH_RE.test(parsed.pathname)
  }
  catch {
    return NATIVE_DELETE_PATH_RE.test(url)
  }
}

function appendFidValue(target: Set<string>, raw: unknown) {
  if (raw === null || raw === undefined)
    return
  if (Array.isArray(raw)) {
    for (const item of raw)
      appendFidValue(target, item)
    return
  }
  if (typeof raw !== 'string' && typeof raw !== 'number')
    return
  for (const part of String(raw).split(',')) {
    const trimmed = part.trim()
    if (trimmed)
      target.add(trimmed)
  }
}

function collectFromSearchParams(target: Set<string>, params: URLSearchParams) {
  for (const [key, value] of params.entries()) {
    if (FID_PARAM_KEY_RE.test(key))
      appendFidValue(target, value)
  }
}

function collectFromObject(target: Set<string>, record: Record<string, unknown>) {
  for (const [key, value] of Object.entries(record)) {
    if (FID_PARAM_KEY_RE.test(key))
      appendFidValue(target, value)
  }
}

/** 从原生 /rb/delete 请求体或查询参数中提取被删除的文件 / 目录 ID */
export function extractDeletedFidsFromRequestBody(body: unknown, url?: string): string[] {
  const fids = new Set<string>()

  if (url) {
    try {
      const parsed = new URL(url, 'https://115.com')
      collectFromSearchParams(fids, parsed.searchParams)
    }
    catch {
      // 忽略无效 URL
    }
  }

  if (body instanceof URLSearchParams) {
    collectFromSearchParams(fids, body)
  }
  else if (typeof FormData !== 'undefined' && body instanceof FormData) {
    for (const [key, value] of body.entries()) {
      if (FID_PARAM_KEY_RE.test(key) && typeof value === 'string')
        appendFidValue(fids, value)
    }
  }
  else if (typeof body === 'string') {
    const trimmed = body.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          collectFromObject(fids, parsed as Record<string, unknown>)
      }
      catch {
        // 回退按查询串解析
        collectFromSearchParams(fids, new URLSearchParams(trimmed))
      }
    }
    else {
      collectFromSearchParams(fids, new URLSearchParams(trimmed))
    }
  }
  else if (body && typeof body === 'object') {
    collectFromObject(fids, body as Record<string, unknown>)
  }

  return Array.from(fids)
}

/** 从本地视频索引快照中移除已删除的 fid / cid（含同目录下子视频）并广播跨标签同步 */
export async function removeFidsFromVideoIndex(fids: string[]): Promise<number> {
  if (fids.length === 0)
    return 0

  const snapshot = await loadVideoIndexSnapshot(true)
  if (!snapshot || snapshot.items.length === 0)
    return 0

  const deletedSet = new Set(fids)
  const remaining = snapshot.items.filter(
    item => !deletedSet.has(item.fid) && !deletedSet.has(item.cid),
  )
  const removedCount = snapshot.items.length - remaining.length
  if (removedCount === 0)
    return 0

  await saveVideoIndexSnapshot({
    ...snapshot,
    items: remaining,
  })

  try {
    localStorage.setItem(
      NATIVE_DELETE_SYNC_STORAGE_KEY,
      JSON.stringify({ fids, removedCount, at: Date.now() }),
    )
  }
  catch {
    // 忽略 storage 不可用或配额异常
  }

  logger.info(`已同步移除原生 115 删除的 ${removedCount} 条本地视频索引`)
  return removedCount
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string')
    return input
  if (input instanceof URL)
    return input.href
  return input.url
}

async function resolveFetchRequestBody(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  if (init?.body !== undefined && init.body !== null)
    return init.body
  if (typeof Request !== 'undefined' && input instanceof Request) {
    try {
      return await input.clone().text()
    }
    catch {
      return undefined
    }
  }
  return undefined
}

function isDeleteSuccessPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object')
    return false
  const state = (payload as { state?: unknown }).state
  return state === true || state === 1 || state === '1'
}

/**
 * 安装 115 原生删除接口（/rb/delete）监听：
 * 在 fetch 与 XMLHttpRequest 删除成功后立即同步移除本地视频索引，无需全量重扫。
 */
export function installNativeDeleteCapture(
  targetWindow: Window & typeof globalThis = unsafeWindow as unknown as Window & typeof globalThis,
): void {
  const win = targetWindow as (Window & typeof globalThis) & {
    [NATIVE_DELETE_CAPTURE_MARKER]?: boolean
  }
  if (!win || win[NATIVE_DELETE_CAPTURE_MARKER])
    return

  Object.defineProperty(win, NATIVE_DELETE_CAPTURE_MARKER, {
    configurable: false,
    enumerable: false,
    value: true,
  })

  const currentFetch = win.fetch
  if (typeof currentFetch === 'function') {
    win.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = getRequestUrl(input)
      const shouldCapture = isNativeDeleteRequest(requestUrl)
      const rawBodyPromise = shouldCapture ? resolveFetchRequestBody(input, init) : null
      const response = await currentFetch.call(win, input, init)

      if (shouldCapture && rawBodyPromise) {
        void (async () => {
          try {
            const payload = await response.clone().json()
            if (!isDeleteSuccessPayload(payload))
              return
            const fids = extractDeletedFidsFromRequestBody(await rawBodyPromise, response.url || requestUrl)
            if (fids.length > 0)
              await removeFidsFromVideoIndex(fids)
          }
          catch {
            // 不影响原生页面消费响应
          }
        })()
      }

      return response
    }) as typeof fetch
  }

  const xhrProto = win.XMLHttpRequest?.prototype as (XMLHttpRequest & {
    [NATIVE_XHR_URL_KEY]?: string
  }) | undefined
  if (xhrProto && typeof xhrProto.open === 'function' && typeof xhrProto.send === 'function') {
    const rawOpen = xhrProto.open
    const rawSend = xhrProto.send

    xhrProto.open = function (
      this: XMLHttpRequest & { [NATIVE_XHR_URL_KEY]?: string },
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ) {
      this[NATIVE_XHR_URL_KEY] = typeof url === 'string' ? url : url.href
      return rawOpen.call(this, method, url, async ?? true, username, password)
    }

    xhrProto.send = function (
      this: XMLHttpRequest & { [NATIVE_XHR_URL_KEY]?: string },
      body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      const requestUrl = this[NATIVE_XHR_URL_KEY] ?? ''
      if (isNativeDeleteRequest(requestUrl)) {
        const fids = extractDeletedFidsFromRequestBody(body, requestUrl)
        if (fids.length > 0) {
          this.addEventListener('load', () => {
            try {
              const payload = JSON.parse(this.responseText) as unknown
              if (isDeleteSuccessPayload(payload))
                void removeFidsFromVideoIndex(fids)
            }
            catch {
              // 忽略非 JSON 响应
            }
          }, { once: true })
        }
      }
      return rawSend.call(this, body as Parameters<typeof rawSend>[0])
    }
  }
}
