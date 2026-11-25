import { onScopeDispose, shallowRef } from 'vue'
import { drive115 } from '@/utils/drive115Instance'

export interface FolderPathInfo {
  cid: string
  name: string
  parentName?: string
  displayLabel: string
  fullPath: string
  updatedAt: number
}

export type FolderPathDriveApi = Pick<typeof drive115.file, 'getFilesWithFallback'>

export interface FolderPathResolverOptions {
  driveApi?: FolderPathDriveApi
  storageKey?: string | null
  ttlMs?: number
  maxEntries?: number
  maxConcurrent?: number
  delayMs?: number
  globalBackoffMs?: number
}

export interface NativeFolderItemShape {
  fc: 0 | 1
  cid?: string
  pid?: string
  n: string
}

export interface FolderSyncProgress {
  resolved: number
  total: number
  cached: number
  failed: number
}

export interface SyncFolderPathsOptions {
  signal?: AbortSignal
  onProgress?: (progress: FolderSyncProgress) => void
}

export const ROOT_FOLDER_PATH: FolderPathInfo = {
  cid: '0',
  name: '根目录',
  displayLabel: '根目录',
  fullPath: '根目录',
  updatedAt: 0,
}

const DEFAULT_STORAGE_KEY = '115Master_folder_path_cache_v1'
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_MAX_ENTRIES = 20000
const DEFAULT_MAX_CONCURRENT = 1
const DEFAULT_DELAY_MS = 400
const DEFAULT_GLOBAL_BACKOFF_MS = 30_000
const FAILED_COOLDOWN_MS = 5 * 60 * 1000
const PERSIST_DEBOUNCE_MS = 500

function isRateLimitOrNonJsonError(error: unknown): boolean {
  return error instanceof Error && /非\s*JSON|风控|频繁|403|429/i.test(error.message)
}

function normalizeCid(raw: string | number | null | undefined): string {
  if (raw === undefined || raw === null)
    return ''
  return String(raw).trim()
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0)
    return Promise.resolve()
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('目录索引已取消', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(signal?.reason ?? new DOMException('目录索引已取消', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function isValidStoredEntry(raw: unknown): raw is FolderPathInfo {
  if (typeof raw !== 'object' || raw === null)
    return false
  const record = raw as Record<string, unknown>
  return (
    typeof record.cid === 'string'
    && record.cid.length > 0
    && typeof record.name === 'string'
    && record.name.length > 0
    && typeof record.displayLabel === 'string'
    && typeof record.fullPath === 'string'
    && typeof record.updatedAt === 'number'
    && Number.isFinite(record.updatedAt)
  )
}

/**
 * 从 115 `/files` 返回的 `path` 路径链构造当前目录及所有祖先目录的展示路径
 */
export function buildFolderPathsFromTrail(
  pathItems: ReadonlyArray<{ cid?: string | number, name?: string }>,
  requestedCid?: string,
  now = Date.now(),
): FolderPathInfo[] {
  const normalized = pathItems
    .map((item) => {
      const cid = normalizeCid(item.cid)
      const rawName = typeof item.name === 'string' ? item.name.trim() : ''
      const name = rawName || (cid === '0' ? '根目录' : '')
      return { cid, name }
    })
    .filter(item => item.cid.length > 0 && item.name.length > 0)

  if (normalized.length === 0)
    return []

  const target = normalizeCid(requestedCid)
  const matchIndex = target ? normalized.findIndex(seg => seg.cid === target) : -1
  const segments = matchIndex >= 0 ? normalized.slice(0, matchIndex + 1) : normalized

  const results = segments.map((seg, index): FolderPathInfo => {
    const parent = index > 0 ? segments[index - 1] : undefined
    const displayLabel = parent ? `${parent.name} / ${seg.name}` : seg.name
    const fullPath = segments.slice(0, index + 1).map(item => item.name).join(' / ')
    return {
      cid: seg.cid,
      name: seg.name,
      ...(parent ? { parentName: parent.name } : {}),
      displayLabel,
      fullPath,
      updatedAt: now,
    }
  })

  if (target && target !== '0' && matchIndex < 0 && results.length > 0) {
    const tail = results[results.length - 1]
    results.push({ ...tail, cid: target })
  }

  return results
}

interface QueueEntry {
  cid: string
  scopeId?: symbol
}

/**
 * 创建带节流、去重与持久化缓存的 115 目录路径解析器
 */
export function createFolderPathResolver(options: FolderPathResolverOptions = {}) {
  const storageKey = options.storageKey === undefined ? DEFAULT_STORAGE_KEY : options.storageKey
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES)
  const maxConcurrent = Math.max(1, options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT)
  const delayMs = Math.max(0, options.delayMs ?? DEFAULT_DELAY_MS)
  const globalBackoffMs = Math.max(0, options.globalBackoffMs ?? DEFAULT_GLOBAL_BACKOFF_MS)

  const version = shallowRef(0)
  const cache = new Map<string, FolderPathInfo>()
  const failedAt = new Map<string, number>()
  const inFlight = new Set<string>()
  const queue: QueueEntry[] = []

  let activeCount = 0
  let hasFetchedOnce = false
  let globalBackoffUntil = 0
  let backoffTimer: ReturnType<typeof setTimeout> | null = null
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleBackoffResume() {
    if (backoffTimer !== null || queue.length === 0)
      return
    const waitMs = Math.max(0, globalBackoffUntil - Date.now())
    backoffTimer = setTimeout(() => {
      backoffTimer = null
      drain()
    }, waitMs)
  }

  function resolveDriveApi(): FolderPathDriveApi {
    return options.driveApi ?? drive115.file
  }

  function isExpired(entry: FolderPathInfo, now = Date.now()): boolean {
    return now - entry.updatedAt > ttlMs
  }

  function isValidCached(cid: string, now = Date.now()): boolean {
    const entry = cache.get(cid)
    return Boolean(entry && !isExpired(entry, now))
  }

  function isCoolingDown(cid: string, now = Date.now()): boolean {
    const failed = failedAt.get(cid)
    return failed !== undefined && now - failed < FAILED_COOLDOWN_MS
  }

  function upsertEntry(entry: FolderPathInfo) {
    if (entry.cid === '0')
      return
    cache.delete(entry.cid)
    cache.set(entry.cid, entry)
    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value
      if (oldestKey === undefined)
        break
      cache.delete(oldestKey)
    }
  }

  function hydrate() {
    if (!storageKey || typeof localStorage === 'undefined')
      return
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw)
        return
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed))
        return
      const now = Date.now()
      parsed
        .filter(isValidStoredEntry)
        .filter(entry => entry.cid !== '0' && !isExpired(entry, now))
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .forEach(upsertEntry)
    }
    catch {
      // 忽略损坏的本地缓存
    }
  }

  function flushPersist() {
    if (!storageKey || typeof localStorage === 'undefined')
      return
    try {
      const entries = Array.from(cache.values())
      localStorage.setItem(storageKey, JSON.stringify(entries))
    }
    catch {
      // 忽略配额或隐私模式异常
    }
  }

  function schedulePersist() {
    if (!storageKey || typeof localStorage === 'undefined')
      return
    if (persistTimer !== null)
      clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      flushPersist()
    }, PERSIST_DEBOUNCE_MS)
  }

  hydrate()

  function getCached(rawCid: string): FolderPathInfo | null {
    void version.value
    const cid = normalizeCid(rawCid)
    if (!cid || cid === '0')
      return ROOT_FOLDER_PATH
    const entry = cache.get(cid)
    if (!entry || isExpired(entry))
      return null
    return entry
  }

  function removeQueuedByCids(resolvedCids: ReadonlySet<string>) {
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (resolvedCids.has(queue[i].cid))
        queue.splice(i, 1)
    }
  }

  async function processCid(cid: string) {
    try {
      if (delayMs > 0 && hasFetchedOnce)
        await sleep(delayMs)
      hasFetchedOnce = true

      const res = await resolveDriveApi().getFilesWithFallback({
        aid: 1,
        cid,
        offset: 0,
        limit: 1,
        show_dir: 1,
        cur: 1,
        format: 'json',
      })

      const rawPath = Array.isArray(res.path)
        ? res.path as Array<{ cid?: string | number, name?: string }>
        : []
      const resolved = buildFolderPathsFromTrail(rawPath, cid, Date.now())

      if (res.state && resolved.length > 0) {
        const resolvedCids = new Set<string>()
        for (const info of resolved) {
          upsertEntry(info)
          failedAt.delete(info.cid)
          resolvedCids.add(info.cid)
        }
        removeQueuedByCids(resolvedCids)
        version.value += 1
        schedulePersist()
        return
      }

      failedAt.set(cid, Date.now())
    }
    catch (error) {
      const now = Date.now()
      failedAt.set(cid, now)
      if (globalBackoffMs > 0 && isRateLimitOrNonJsonError(error)) {
        globalBackoffUntil = now + globalBackoffMs
        scheduleBackoffResume()
      }
    }
    finally {
      inFlight.delete(cid)
      activeCount -= 1
      drain()
    }
  }

  function drain() {
    if (Date.now() < globalBackoffUntil) {
      if (queue.length > 0)
        scheduleBackoffResume()
      return
    }
    while (activeCount < maxConcurrent && queue.length > 0) {
      const next = queue.shift()
      if (!next)
        break
      if (isValidCached(next.cid) || inFlight.has(next.cid) || isCoolingDown(next.cid))
        continue
      activeCount += 1
      inFlight.add(next.cid)
      void processCid(next.cid)
    }
  }

  function prefetch(rawCids: Iterable<string>, scopeId?: symbol) {
    const queuedCids = new Set(queue.map(item => item.cid))
    const now = Date.now()
    let added = false

    for (const rawCid of rawCids) {
      const cid = normalizeCid(rawCid)
      if (!cid || cid === '0')
        continue
      if (isValidCached(cid, now) || isCoolingDown(cid, now))
        continue
      if (inFlight.has(cid) || queuedCids.has(cid))
        continue
      queuedCids.add(cid)
      queue.push({ cid, scopeId })
      added = true
    }

    if (added)
      drain()
  }

  function cancelScope(scopeId: symbol) {
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (queue[i].scopeId === scopeId)
        queue.splice(i, 1)
    }
  }

  function invalidate(rawCid: string) {
    const cid = normalizeCid(rawCid)
    if (!cid || cid === '0')
      return
    const removedCache = cache.delete(cid)
    const removedFail = failedAt.delete(cid)
    if (removedCache || removedFail) {
      version.value += 1
      schedulePersist()
    }
  }

  function clear() {
    cache.clear()
    failedAt.clear()
    queue.length = 0
    globalBackoffUntil = 0
    if (backoffTimer !== null) {
      clearTimeout(backoffTimer)
      backoffTimer = null
    }
    if (persistTimer !== null) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    if (storageKey && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(storageKey)
      }
      catch {
        // 忽略
      }
    }
    version.value += 1
  }

  function reloadFromStorage() {
    cache.clear()
    failedAt.clear()
    hydrate()
    version.value += 1
  }

  function getAllCached(): Map<string, FolderPathInfo> {
    void version.value
    const now = Date.now()
    const result = new Map<string, FolderPathInfo>()
    for (const [cid, entry] of cache.entries()) {
      if (!isExpired(entry, now))
        result.set(cid, entry)
    }
    return result
  }

  async function syncCids(
    rawCids: Iterable<string>,
    syncOptions: SyncFolderPathsOptions = {},
  ): Promise<FolderSyncProgress> {
    const uniqueCids: string[] = []
    const seen = new Set<string>()
    for (const rawCid of rawCids) {
      const cid = normalizeCid(rawCid)
      if (!cid || cid === '0' || seen.has(cid))
        continue
      seen.add(cid)
      uniqueCids.push(cid)
    }

    const total = uniqueCids.length
    let cached = 0
    const pending: string[] = []
    const startNow = Date.now()
    for (const cid of uniqueCids) {
      if (isValidCached(cid, startNow))
        cached += 1
      else
        pending.push(cid)
    }

    let resolved = cached
    let failed = 0
    let mutated = false
    syncOptions.onProgress?.({ resolved, total, cached, failed })

    try {
      for (const cid of pending) {
        if (syncOptions.signal?.aborted)
          throw syncOptions.signal.reason ?? new DOMException('目录索引已取消', 'AbortError')

        // 前序子目录解析到的祖先链可能已覆盖当前 cid，直接复用缓存跳过请求
        if (isValidCached(cid)) {
          cached += 1
          resolved += 1
          syncOptions.onProgress?.({ resolved, total, cached, failed })
          continue
        }

        const now = Date.now()
        if (now < globalBackoffUntil)
          await sleep(globalBackoffUntil - now, syncOptions.signal)

        if (delayMs > 0 && hasFetchedOnce)
          await sleep(delayMs, syncOptions.signal)
        hasFetchedOnce = true

        try {
          const res = await resolveDriveApi().getFilesWithFallback(
            {
              aid: 1,
              cid,
              offset: 0,
              limit: 1,
              show_dir: 1,
              cur: 1,
              format: 'json',
            },
            syncOptions.signal,
          )

          const rawPath = Array.isArray(res.path)
            ? res.path as Array<{ cid?: string | number, name?: string }>
            : []
          const trail = buildFolderPathsFromTrail(rawPath, cid, Date.now())

          if (res.state && trail.length > 0) {
            const resolvedCids = new Set<string>()
            for (const info of trail) {
              upsertEntry(info)
              failedAt.delete(info.cid)
              resolvedCids.add(info.cid)
            }
            removeQueuedByCids(resolvedCids)
            version.value += 1
            mutated = true
            resolved += 1
          }
          else {
            failedAt.set(cid, Date.now())
            failed += 1
          }
        }
        catch (error) {
          if (syncOptions.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError'))
            throw error
          const errNow = Date.now()
          failedAt.set(cid, errNow)
          failed += 1
          if (globalBackoffMs > 0 && isRateLimitOrNonJsonError(error))
            globalBackoffUntil = errNow + globalBackoffMs
        }

        syncOptions.onProgress?.({ resolved, total, cached, failed })
      }
    }
    finally {
      if (mutated)
        flushPersist()
    }

    return { resolved, total, cached, failed }
  }

  return {
    version,
    getCached,
    getAllCached,
    prefetch,
    syncCids,
    cancelScope,
    invalidate,
    clear,
    reloadFromStorage,
    flushPersist,
  }
}

export const folderPathResolver = createFolderPathResolver()

/**
 * 为组件提供带作用域自动取消、响应式目录名解析的 Composable
 */
export function useFolderPathLabels(resolver = folderPathResolver) {
  const scope = Symbol('folder-path-scope')

  onScopeDispose(() => {
    resolver.cancelScope(scope)
  })

  function prefetch(cids: Iterable<string>) {
    resolver.prefetch(cids, scope)
  }

  function getInfo(cid?: string | null): FolderPathInfo | null {
    return resolver.getCached(cid ?? '')
  }

  function getAllCached(): Map<string, FolderPathInfo> {
    return resolver.getAllCached()
  }

  function syncCids(cids: Iterable<string>, options?: SyncFolderPathsOptions): Promise<FolderSyncProgress> {
    return resolver.syncCids(cids, options)
  }

  function getLabel(cid?: string | null, fallback = '目录'): string {
    return getInfo(cid)?.displayLabel ?? fallback
  }

  function getTooltip(cid?: string | null, fallback = '在原生 115 打开所在目录'): string {
    const info = getInfo(cid)
    return info ? `打开所在目录：${info.fullPath}` : fallback
  }

  function getNativeItemDisplay(item: NativeFolderItemShape): { label: string, tooltip: string } {
    if (item.fc === 1) {
      const info = getInfo(item.pid)
      return {
        label: info?.displayLabel ?? '目录',
        tooltip: info ? `打开所在目录：${info.fullPath}` : '打开所在网盘目录',
      }
    }

    const parentCid = normalizeCid(item.pid)
    if (!parentCid || parentCid === '0') {
      return {
        label: `根目录 / ${item.n}`,
        tooltip: `打开目录：根目录 / ${item.n}`,
      }
    }

    const parent = getInfo(parentCid)
    if (parent) {
      return {
        label: `${parent.name} / ${item.n}`,
        tooltip: `打开目录：${parent.fullPath} / ${item.n}`,
      }
    }

    return {
      label: item.n || '打开',
      tooltip: `打开目录：${item.n}`,
    }
  }

  return {
    prefetch,
    getInfo,
    getAllCached,
    syncCids,
    getLabel,
    getTooltip,
    getNativeItemDisplay,
  }
}
