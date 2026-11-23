import type { MarkerDoc } from '@/utils/markers/types'
import type {
  ActorFacetStat,
  IndexedVideo,
  IndexedVideoLabel,
  IndexProgress,
  LibraryEntry,
  LibraryFilterState,
  LibraryIndex,
  LibraryView,
  ScrapeResult,
  UnifiedMediaMeta,
} from '@/utils/mediaIndex'
import type { ActorWorksCacheEntry } from '@/utils/superSearch'
import { useStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef } from 'vue'
import { actressFaceDB } from '@/utils/actressFaceDB'
import { normalizeActressName } from '@/utils/actressNameMatcher'
import { markerStore } from '@/utils/cache/markerStore'
import { getAvNumber } from '@/utils/getNumber'
import { appLogger } from '@/utils/logger'
import {
  aggregateLibraryEntries,
  buildLibraryIndex,
  clearScrapeMissed,
  compressCustomAvatar,
  compressCustomCover,
  loadVideoIndexSnapshot,
  markScrapeMissed,
  readActiveScrapeMissKeys,
  readAllCachedJavMeta,
  readAllCustomMediaKeys,
  removeCustomAvatar,
  removeCustomCover,
  requestPersistentStorage,
  saveCustomAvatar,
  saveCustomCover,
  saveVideoIndexSnapshot,
  scrapeJavMetaDetailed,
  syncDriveVideoIndex,
} from '@/utils/mediaIndex'
import { Scheduler, SchedulerError, TaskStatus } from '@/utils/scheduler'
import { getAllCachedActorWorks } from '@/utils/superSearch'

const logger = appLogger.sub('MediaLibraryStore')

export type BackgroundScrapeState = 'idle' | 'running' | 'paused' | 'circuit_open' | 'done'

export type MediaImagePickerTarget
  = | {
    mode: 'cover'
    mediaKey: string
    title: string
    externalId?: string
  }
  | {
    mode: 'avatar'
    actorKey: string
    name: string
    aliases?: string[]
    avatarUrl?: string
  }

const BG_SCRAPE_MIN_DELAY_MS = 1500
const BG_SCRAPE_MAX_DELAY_MS = 3000
const BG_SCRAPE_CIRCUIT_THRESHOLD = 3
const BG_SCRAPE_REBUILD_BATCH = 5
const BG_SCRAPE_REBUILD_INTERVAL_MS = 3000

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted)
    return Promise.resolve()
  return new Promise((resolve) => {
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined
    const onAbort = () => {
      if (timer !== undefined)
        globalThis.clearTimeout(timer)
      resolve()
    }
    timer = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export const useMediaLibraryStore = defineStore('mediaLibrary', () => {
  const initialized = shallowRef(false)
  const initializing = shallowRef(false)
  const indexing = shallowRef(false)
  const indexProgress = shallowRef<IndexProgress>({
    pages: 0,
    fetched: 0,
    total: 0,
    mode: 'full',
  })
  const indexError = shallowRef<unknown>(null)
  const lastIndexedAt = shallowRef(0)
  const snapshotMeta = shallowRef({
    rootCids: ['0'],
    lastFullSyncAt: 0,
    lastSyncAt: 0,
  })

  const videos = shallowRef<IndexedVideo[]>([])
  const metaMap = shallowRef<Map<string, UnifiedMediaMeta>>(new Map())
  const actorWorks = shallowRef<ActorWorksCacheEntry[]>([])
  const markerDocs = shallowRef<Record<string, MarkerDoc>>({})
  const entries = shallowRef<LibraryEntry[]>([])
  const libraryIndex = shallowRef<LibraryIndex>(buildLibraryIndex([]))

  const filter = reactive<LibraryFilterState>({
    view: 'all',
    keyword: '',
    actor: undefined,
    genre: undefined,
    director: undefined,
    year: undefined,
    driveLabel: undefined,
    scrapeStatus: 'all',
    onlyStarred: false,
    onlyMarked: false,
    sortBy: 'mtime',
    sortAsc: false,
  })

  const aspectMode = useStorage<'landscape' | 'portrait'>('115Master_library_aspect', 'landscape')
  const density = useStorage<'compact' | 'comfortable' | 'relaxed'>('115Master_library_density', 'comfortable')
  const hiddenActorKeys = useStorage<string[]>('115Master_library_hidden_actors', [])
  const hiddenActorKeySet = computed(() => new Set(hiddenActorKeys.value))
  const scrollTop = shallowRef(0)
  const tagRailOpen = ref(false)
  const actorAvatars = shallowRef<Record<string, string>>({})
  const customCoverKeys = shallowRef<Set<string>>(new Set())
  const customCoverVersions = shallowRef<Record<string, number>>({})
  const customAvatarUrls = shallowRef<Record<string, string>>({})
  const imagePickerTarget = shallowRef<MediaImagePickerTarget | null>(null)
  const scrapingKeys = shallowRef<Set<string>>(new Set())
  const viewportScrapingKeys = shallowRef<Set<string>>(new Set())
  const missedScrapeKeys = shallowRef<Set<string>>(new Set())

  const bgScrapeState = shallowRef<BackgroundScrapeState>('idle')
  const bgScrapeReason = shallowRef('')
  const bgScrapeProcessed = shallowRef(0)

  const attemptedScrapeKeys = new Set<string>()
  const checkedAvatarActors = new Set<string>()
  const scrapeScheduler = new Scheduler<ScrapeResult>({
    maxConcurrent: 2,
    maxQueueLength: 200,
  })

  let initPromise: Promise<void> | null = null
  let syncController: AbortController | null = null
  let bgScrapeController: AbortController | null = null
  let avatarTaskRunning = false

  function updateScrapingKeys(mediaKey: string, active: boolean) {
    const next = new Set(scrapingKeys.value)
    if (active)
      next.add(mediaKey)
    else
      next.delete(mediaKey)
    scrapingKeys.value = next
  }

  async function matchActorAvatars(stats: ActorFacetStat[]) {
    if (avatarTaskRunning || stats.length === 0)
      return

    const pending = stats.filter(stat => !checkedAvatarActors.has(stat.name))
    if (pending.length === 0)
      return

    avatarTaskRunning = true
    try {
      await actressFaceDB.init()
      const updates: Record<string, string> = {}

      for (const stat of pending) {
        checkedAvatarActors.add(stat.name)
        const candidates = [stat.name, ...stat.aliases]
        for (const candidate of candidates) {
          const matched = await actressFaceDB.findActress(candidate, 'name')
          if (matched?.url) {
            updates[stat.name] = matched.url
            break
          }
        }
      }

      if (Object.keys(updates).length > 0)
        actorAvatars.value = { ...actorAvatars.value, ...updates }
    }
    catch (error) {
      logger.warn('匹配演员头像库失败', error)
    }
    finally {
      avatarTaskRunning = false
    }
  }

  function rebuildEntries() {
    const nextEntries = aggregateLibraryEntries(videos.value, metaMap.value, markerDocs.value)
    const nextIndex = buildLibraryIndex(nextEntries, actorWorks.value)
    entries.value = nextEntries
    libraryIndex.value = nextIndex
    void matchActorAvatars(nextIndex.actorStats)
  }

  async function syncIndex(mode: 'full' | 'incremental' = 'incremental') {
    syncController?.abort()
    const controller = new AbortController()
    syncController = controller

    const resolvedMode = videos.value.length > 0 ? mode : 'full'
    indexing.value = true
    indexError.value = null
    indexProgress.value = {
      pages: 0,
      fetched: 0,
      total: 0,
      mode: resolvedMode,
    }

    try {
      const [snapshot, cachedMeta, cachedActorWorks, markers] = await Promise.all([
        syncDriveVideoIndex({
          mode: resolvedMode,
          signal: controller.signal,
          onProgress: (progress) => {
            indexProgress.value = progress
          },
        }),
        readAllCachedJavMeta(),
        getAllCachedActorWorks(),
        markerStore.getAllDocs(),
      ])

      if (controller.signal.aborted)
        return

      const mergedMeta = new Map(cachedMeta)
      metaMap.value.forEach((meta, key) => {
        if (!mergedMeta.has(key))
          mergedMeta.set(key, meta)
      })

      videos.value = snapshot.items
      lastIndexedAt.value = snapshot.lastSyncAt
      snapshotMeta.value = {
        rootCids: snapshot.rootCids,
        lastFullSyncAt: snapshot.lastFullSyncAt,
        lastSyncAt: snapshot.lastSyncAt,
      }
      metaMap.value = mergedMeta
      actorWorks.value = cachedActorWorks
      markerDocs.value = markers
      rebuildEntries()
    }
    catch (error) {
      if (controller.signal.aborted)
        return
      indexError.value = error
      logger.error('同步网盘视频索引失败', error)
    }
    finally {
      if (syncController === controller)
        indexing.value = false
    }
  }

  async function refreshLocalContext() {
    const [cachedMeta, cachedActorWorks, markers] = await Promise.all([
      readAllCachedJavMeta(),
      getAllCachedActorWorks(),
      markerStore.getAllDocs(),
    ])
    const mergedMeta = new Map(cachedMeta)
    metaMap.value.forEach((meta, key) => {
      if (!mergedMeta.has(key))
        mergedMeta.set(key, meta)
    })
    metaMap.value = mergedMeta
    actorWorks.value = cachedActorWorks
    markerDocs.value = markers
    if (videos.value.length > 0)
      rebuildEntries()
  }

  async function init() {
    if (initialized.value) {
      void refreshLocalContext()
      return
    }
    if (initPromise)
      return initPromise

    initializing.value = true
    initPromise = (async () => {
      try {
        void requestPersistentStorage()
        const [snapshot, cachedMeta, cachedActorWorks, markers, activeMissKeys, customMedia] = await Promise.all([
          loadVideoIndexSnapshot(),
          readAllCachedJavMeta(),
          getAllCachedActorWorks(),
          markerStore.getAllDocs(),
          readActiveScrapeMissKeys(),
          readAllCustomMediaKeys(),
        ])

        metaMap.value = cachedMeta
        actorWorks.value = cachedActorWorks
        markerDocs.value = markers
        missedScrapeKeys.value = activeMissKeys
        customCoverKeys.value = customMedia.coverKeys

        const nextAvatarUrls: Record<string, string> = {}
        customMedia.avatars.forEach((record, key) => {
          if (record.blob instanceof Blob && record.blob.size > 0)
            nextAvatarUrls[key] = URL.createObjectURL(record.blob)
        })
        Object.values(customAvatarUrls.value).forEach(url => URL.revokeObjectURL(url))
        customAvatarUrls.value = nextAvatarUrls

        if (snapshot && snapshot.items.length > 0) {
          videos.value = snapshot.items
          lastIndexedAt.value = snapshot.lastSyncAt
          snapshotMeta.value = {
            rootCids: snapshot.rootCids,
            lastFullSyncAt: snapshot.lastFullSyncAt,
            lastSyncAt: snapshot.lastSyncAt,
          }
          rebuildEntries()
        }
        else {
          await syncIndex('full')
        }

        initialized.value = true
      }
      finally {
        initializing.value = false
        initPromise = null
      }
    })()

    return initPromise
  }

  function updateViewportScrapingKeys(mediaKey: string, active: boolean) {
    const next = new Set(viewportScrapingKeys.value)
    if (active)
      next.add(mediaKey)
    else
      next.delete(mediaKey)
    viewportScrapingKeys.value = next
  }

  function addMissedScrapeKey(mediaKey: string, avNumber: string) {
    const next = new Set(missedScrapeKeys.value)
    next.add(mediaKey)
    missedScrapeKeys.value = next
    void markScrapeMissed(mediaKey, avNumber)
  }

  function removeMissedScrapeKey(mediaKey: string) {
    if (!missedScrapeKeys.value.has(mediaKey))
      return
    const next = new Set(missedScrapeKeys.value)
    next.delete(mediaKey)
    missedScrapeKeys.value = next
    void clearScrapeMissed(mediaKey)
  }

  function enqueueScrape(mediaKey: string) {
    const entry = libraryIndex.value.entryMap.get(mediaKey)
    if (!entry || entry.meta !== null || entry.kind !== 'jav' || !entry.externalId)
      return
    if (
      attemptedScrapeKeys.has(mediaKey)
      || scrapingKeys.value.has(mediaKey)
      || missedScrapeKeys.value.has(mediaKey)
    ) {
      return
    }

    const avNumber = entry.externalId
    updateScrapingKeys(mediaKey, true)
    updateViewportScrapingKeys(mediaKey, true)

    void scrapeScheduler.add(
      () => scrapeJavMetaDetailed(avNumber),
      { id: mediaKey, immediate: true, action: 'push' },
    ).then((result) => {
      attemptedScrapeKeys.add(mediaKey)
      updateScrapingKeys(mediaKey, false)
      updateViewportScrapingKeys(mediaKey, false)
      if (result.status === 'ok') {
        removeMissedScrapeKey(mediaKey)
        const nextMap = new Map(metaMap.value)
        nextMap.set(mediaKey, { ...result.meta, mediaKey })
        metaMap.value = nextMap
        rebuildEntries()
        return
      }
      if (result.status === 'not_found')
        addMissedScrapeKey(mediaKey, avNumber)
    }).catch((error) => {
      updateScrapingKeys(mediaKey, false)
      updateViewportScrapingKeys(mediaKey, false)
      if (error instanceof SchedulerError.TaskCancelled || error instanceof SchedulerError.TaskExist)
        return
      attemptedScrapeKeys.add(mediaKey)
      logger.warn('视口按需刮削失败', mediaKey, error)
    })
  }

  function cancelScrape(mediaKey: string) {
    const task = scrapeScheduler.get(mediaKey)
    if (task && task.status === TaskStatus.Pending) {
      scrapeScheduler.cancel(mediaKey)
      updateScrapingKeys(mediaKey, false)
      updateViewportScrapingKeys(mediaKey, false)
    }
  }

  async function rescrape(mediaKey: string, customAvNumber?: string): Promise<UnifiedMediaMeta | null> {
    const entry = libraryIndex.value.entryMap.get(mediaKey)
    const targetAv = (customAvNumber?.trim() || entry?.externalId || '').toUpperCase()
    if (!targetAv)
      return null

    attemptedScrapeKeys.delete(mediaKey)
    removeMissedScrapeKey(mediaKey)
    updateScrapingKeys(mediaKey, true)
    try {
      const result = await scrapeJavMetaDetailed(targetAv)
      if (result.status !== 'ok') {
        if (result.status === 'not_found')
          addMissedScrapeKey(mediaKey, targetAv)
        return null
      }
      const patched: UnifiedMediaMeta = { ...result.meta, mediaKey }
      const nextMap = new Map(metaMap.value)
      nextMap.set(mediaKey, patched)
      metaMap.value = nextMap
      rebuildEntries()
      return patched
    }
    finally {
      attemptedScrapeKeys.add(mediaKey)
      updateScrapingKeys(mediaKey, false)
    }
  }

  function getNextBackgroundCandidate(): LibraryEntry | undefined {
    return entries.value.find(entry =>
      entry.kind === 'jav'
      && Boolean(entry.externalId)
      && entry.meta === null
      && !missedScrapeKeys.value.has(entry.mediaKey)
      && !scrapingKeys.value.has(entry.mediaKey)
      && !attemptedScrapeKeys.has(entry.mediaKey),
    )
  }

  async function runBackgroundScrapeLoop(controller: AbortController) {
    let consecutiveBlocks = 0
    let pendingRebuilds = 0
    let lastRebuildAt = Date.now()

    const flushRebuilds = () => {
      if (pendingRebuilds <= 0)
        return
      pendingRebuilds = 0
      lastRebuildAt = Date.now()
      rebuildEntries()
    }

    try {
      while (!controller.signal.aborted) {
        // 视口优先插队：只要当前视口有活跃刮削任务，后台循环主动让路
        while (!controller.signal.aborted && viewportScrapingKeys.value.size > 0) {
          await sleepWithAbort(250, controller.signal)
        }
        if (controller.signal.aborted)
          break

        const candidate = getNextBackgroundCandidate()
        if (!candidate || !candidate.externalId) {
          flushRebuilds()
          bgScrapeState.value = 'done'
          bgScrapeReason.value = ''
          break
        }

        const { mediaKey, externalId } = candidate
        updateScrapingKeys(mediaKey, true)
        let result: ScrapeResult
        try {
          result = await scrapeJavMetaDetailed(externalId)
        }
        catch (error) {
          result = {
            status: 'network_error',
            reason: error instanceof Error ? error.message : String(error ?? '未知错误'),
          }
        }
        finally {
          updateScrapingKeys(mediaKey, false)
        }

        if (controller.signal.aborted)
          break

        bgScrapeProcessed.value += 1

        if (result.status === 'ok') {
          consecutiveBlocks = 0
          attemptedScrapeKeys.add(mediaKey)
          removeMissedScrapeKey(mediaKey)
          const nextMap = new Map(metaMap.value)
          nextMap.set(mediaKey, { ...result.meta, mediaKey })
          metaMap.value = nextMap
          pendingRebuilds += 1
          if (
            pendingRebuilds >= BG_SCRAPE_REBUILD_BATCH
            || Date.now() - lastRebuildAt >= BG_SCRAPE_REBUILD_INTERVAL_MS
          ) {
            flushRebuilds()
          }
        }
        else if (result.status === 'not_found') {
          consecutiveBlocks = 0
          attemptedScrapeKeys.add(mediaKey)
          addMissedScrapeKey(mediaKey, externalId)
        }
        else if (result.status === 'challenge') {
          flushRebuilds()
          bgScrapeState.value = 'circuit_open'
          bgScrapeReason.value = `触发源站验证，已自动暂停保护（${result.reason}）`
          logger.warn('后台刮削触发人机校验熔断', result.reason)
          break
        }
        else if (result.status === 'rate_limited') {
          consecutiveBlocks += 1
          if (consecutiveBlocks >= BG_SCRAPE_CIRCUIT_THRESHOLD) {
            flushRebuilds()
            bgScrapeState.value = 'circuit_open'
            bgScrapeReason.value = `连续 ${consecutiveBlocks} 次限流，已自动暂停保护（${result.reason}）`
            logger.warn('后台刮削触发限流熔断', result.reason)
            break
          }
        }
        else {
          // 临时网络错误不写负缓存，标记本次会话已尝试，避免死循环卡住同一部
          attemptedScrapeKeys.add(mediaKey)
        }

        const delayMs = BG_SCRAPE_MIN_DELAY_MS
          + Math.floor(Math.random() * (BG_SCRAPE_MAX_DELAY_MS - BG_SCRAPE_MIN_DELAY_MS + 1))
        await sleepWithAbort(delayMs, controller.signal)
      }
    }
    finally {
      flushRebuilds()
      if (bgScrapeController === controller)
        bgScrapeController = null
    }
  }

  function startBackgroundScrape() {
    if (bgScrapeState.value === 'running')
      return
    bgScrapeController?.abort()
    const controller = new AbortController()
    bgScrapeController = controller
    bgScrapeState.value = 'running'
    bgScrapeReason.value = ''
    void runBackgroundScrapeLoop(controller)
  }

  function pauseBackgroundScrape() {
    if (bgScrapeState.value !== 'running')
      return
    bgScrapeController?.abort()
    bgScrapeController = null
    bgScrapeState.value = 'paused'
  }

  function resumeBackgroundScrape() {
    if (bgScrapeState.value === 'running')
      return
    startBackgroundScrape()
  }

  function stopBackgroundScrape() {
    bgScrapeController?.abort()
    bgScrapeController = null
    bgScrapeState.value = 'idle'
    bgScrapeReason.value = ''
  }

  async function persistVideosSnapshot() {
    if (videos.value.length === 0 && snapshotMeta.value.lastFullSyncAt === 0)
      return
    try {
      await saveVideoIndexSnapshot({
        schemaVersion: 1,
        rootCids: snapshotMeta.value.rootCids,
        lastFullSyncAt: snapshotMeta.value.lastFullSyncAt || Date.now(),
        lastSyncAt: snapshotMeta.value.lastSyncAt || Date.now(),
        items: videos.value,
      })
    }
    catch (error) {
      logger.warn('回写视频索引快照失败', error)
    }
  }

  async function applyFileStar(fid: string, starred: boolean) {
    let changed = false
    const next = videos.value.map((video) => {
      if (video.fid !== fid)
        return video
      changed = true
      if (starred)
        return { ...video, starred: true }
      const { starred: _removed, ...rest } = video
      return rest
    })
    if (!changed)
      return
    videos.value = next
    rebuildEntries()
    await persistVideosSnapshot()
  }

  async function applyFileLabels(fid: string, labels: IndexedVideoLabel[]) {
    let changed = false
    const next = videos.value.map((video) => {
      if (video.fid !== fid)
        return video
      changed = true
      if (labels.length > 0)
        return { ...video, labels }
      const { labels: _removed, ...rest } = video
      return rest
    })
    if (!changed)
      return
    videos.value = next
    rebuildEntries()
    await persistVideosSnapshot()
  }

  async function applyFileRename(fid: string, nextName: string) {
    let changed = false
    const next = videos.value.map((video) => {
      if (video.fid !== fid)
        return video
      changed = true
      return {
        ...video,
        name: nextName,
        avNumber: getAvNumber(nextName) || null,
      }
    })
    if (!changed)
      return
    videos.value = next
    rebuildEntries()
    await persistVideosSnapshot()
  }

  async function applyFileMove(fid: string, nextCid: string) {
    let changed = false
    const next = videos.value.map((video) => {
      if (video.fid !== fid)
        return video
      changed = true
      return { ...video, cid: nextCid }
    })
    if (!changed)
      return
    videos.value = next
    rebuildEntries()
    await persistVideosSnapshot()
  }

  async function applyFilesDelete(fids: string[]) {
    if (fids.length === 0)
      return
    const fidSet = new Set(fids)
    const next = videos.value.filter(video => !fidSet.has(video.fid))
    if (next.length === videos.value.length)
      return
    videos.value = next
    rebuildEntries()
    await persistVideosSnapshot()
  }

  async function applyFileDelete(fid: string) {
    await applyFilesDelete([fid])
  }

  function isActorHidden(actorKey: string): boolean {
    return hiddenActorKeySet.value.has(actorKey)
  }

  function hideActor(actorKey: string) {
    if (!actorKey || hiddenActorKeySet.value.has(actorKey))
      return
    hiddenActorKeys.value = [...hiddenActorKeys.value, actorKey]
  }

  function unhideActor(actorKey: string) {
    if (!hiddenActorKeySet.value.has(actorKey))
      return
    hiddenActorKeys.value = hiddenActorKeys.value.filter(key => key !== actorKey)
  }

  function selectActor(name?: string) {
    filter.actor = !name || filter.actor === name ? undefined : name
  }

  function setActorFilter(name: string) {
    filter.view = 'all'
    filter.actor = name
  }

  function selectGenre(name?: string) {
    filter.genre = !name || filter.genre === name ? undefined : name
  }

  function selectDriveLabel(labelId?: string) {
    filter.driveLabel = !labelId || filter.driveLabel === labelId ? undefined : labelId
  }

  function setTagRailOpen(open: boolean) {
    tagRailOpen.value = open
  }

  function toggleTagRail() {
    tagRailOpen.value = !tagRailOpen.value
  }

  function setView(view: LibraryView) {
    filter.view = view
    if (view === 'recent') {
      filter.sortBy = 'mtime'
      filter.sortAsc = false
    }
    if (view === 'starred')
      filter.onlyStarred = false
    if (view === 'marked')
      filter.onlyMarked = false
  }

  function resetFilters() {
    filter.view = 'all'
    filter.keyword = ''
    filter.actor = undefined
    filter.genre = undefined
    filter.director = undefined
    filter.year = undefined
    filter.driveLabel = undefined
    filter.scrapeStatus = 'all'
    filter.onlyStarred = false
    filter.onlyMarked = false
  }

  function getEntry(mediaKey: string): LibraryEntry | undefined {
    return libraryIndex.value.entryMap.get(mediaKey)
  }

  function resolveActorStorageKey(name: string, explicitKey?: string): string {
    if (explicitKey)
      return explicitKey
    const normalized = normalizeActressName(name) || name.trim().toLowerCase()
    const matched = libraryIndex.value.actorStats.find(stat =>
      stat.key === normalized
      || stat.name === name
      || stat.aliases.includes(name),
    )
    return matched?.key ?? normalized
  }

  function getActorAvatarUrl(actor: { key?: string, name: string, avatarUrl?: string }): string {
    const key = resolveActorStorageKey(actor.name, actor.key)
    return customAvatarUrls.value[key] || actorAvatars.value[actor.name] || actor.avatarUrl || ''
  }

  function openCoverPicker(mediaKey: string) {
    const entry = libraryIndex.value.entryMap.get(mediaKey)
    if (!entry)
      return
    imagePickerTarget.value = {
      mode: 'cover',
      mediaKey,
      title: entry.meta?.title || entry.externalId || entry.files[0]?.name || '未命名作品',
      externalId: entry.externalId,
    }
  }

  function openAvatarPicker(actor: { key?: string, name: string, aliases?: string[], avatarUrl?: string }) {
    const actorKey = resolveActorStorageKey(actor.name, actor.key)
    const stat = libraryIndex.value.actorStats.find(item => item.key === actorKey)
    imagePickerTarget.value = {
      mode: 'avatar',
      actorKey,
      name: stat?.name || actor.name,
      aliases: actor.aliases ?? stat?.aliases,
      avatarUrl: actor.avatarUrl ?? stat?.avatarUrl,
    }
  }

  function closeImagePicker() {
    imagePickerTarget.value = null
  }

  function bumpCustomCoverVersion(mediaKey: string) {
    customCoverVersions.value = {
      ...customCoverVersions.value,
      [mediaKey]: (customCoverVersions.value[mediaKey] ?? 0) + 1,
    }
  }

  async function applyCustomCover(mediaKey: string, blob: Blob, sourceLabel: string) {
    const { thumbBlob, fullBlob } = await compressCustomCover(blob)
    await saveCustomCover({
      kind: 'cover',
      mediaKey,
      thumbBlob,
      fullBlob,
      sourceLabel,
      updatedAt: Date.now(),
    })
    const nextKeys = new Set(customCoverKeys.value)
    nextKeys.add(mediaKey)
    customCoverKeys.value = nextKeys
    bumpCustomCoverVersion(mediaKey)
  }

  async function resetCustomCover(mediaKey: string) {
    await removeCustomCover(mediaKey)
    const nextKeys = new Set(customCoverKeys.value)
    nextKeys.delete(mediaKey)
    customCoverKeys.value = nextKeys
    bumpCustomCoverVersion(mediaKey)
  }

  async function applyCustomAvatar(actorKey: string, blob: Blob, sourceLabel: string) {
    const compressed = await compressCustomAvatar(blob)
    await saveCustomAvatar({
      kind: 'avatar',
      actorKey,
      blob: compressed,
      sourceLabel,
      updatedAt: Date.now(),
    })
    const prevUrl = customAvatarUrls.value[actorKey]
    if (prevUrl)
      URL.revokeObjectURL(prevUrl)
    customAvatarUrls.value = {
      ...customAvatarUrls.value,
      [actorKey]: URL.createObjectURL(compressed),
    }
  }

  async function resetCustomAvatar(actorKey: string) {
    await removeCustomAvatar(actorKey)
    const prevUrl = customAvatarUrls.value[actorKey]
    if (prevUrl)
      URL.revokeObjectURL(prevUrl)
    const next = { ...customAvatarUrls.value }
    delete next[actorKey]
    customAvatarUrls.value = next
  }

  const filteredEntries = computed(() => libraryIndex.value.query(filter))
  const scrapedCount = computed(() => entries.value.filter(item => item.meta !== null).length)
  const starredCount = computed(() => entries.value.filter(item => item.starred).length)
  const markedCount = computed(() => entries.value.filter(item => item.markerCount > 0).length)
  const scrapingCount = computed(() => scrapingKeys.value.size)
  const missedScrapeCount = computed(() => missedScrapeKeys.value.size)
  const bgScrapePendingCount = computed(() =>
    entries.value.filter(entry =>
      entry.kind === 'jav'
      && Boolean(entry.externalId)
      && entry.meta === null
      && !missedScrapeKeys.value.has(entry.mediaKey),
    ).length,
  )

  return {
    initialized,
    initializing,
    indexing,
    indexProgress,
    indexError,
    lastIndexedAt,
    videos,
    markerDocs,
    entries,
    metaMap,
    libraryIndex,
    filter,
    aspectMode,
    density,
    hiddenActorKeys,
    hiddenActorKeySet,
    scrollTop,
    tagRailOpen,
    actorAvatars,
    customCoverKeys,
    customCoverVersions,
    customAvatarUrls,
    imagePickerTarget,
    scrapingKeys,
    scrapingCount,
    missedScrapeCount,
    bgScrapeState,
    bgScrapeReason,
    bgScrapeProcessed,
    bgScrapePendingCount,
    filteredEntries,
    scrapedCount,
    starredCount,
    markedCount,
    init,
    syncIndex,
    refreshLocalContext,
    enqueueScrape,
    cancelScrape,
    rescrape,
    startBackgroundScrape,
    pauseBackgroundScrape,
    resumeBackgroundScrape,
    stopBackgroundScrape,
    applyFileStar,
    applyFileLabels,
    applyFileRename,
    applyFileMove,
    applyFileDelete,
    applyFilesDelete,
    isActorHidden,
    hideActor,
    unhideActor,
    selectActor,
    setActorFilter,
    selectGenre,
    selectDriveLabel,
    setTagRailOpen,
    toggleTagRail,
    setView,
    resetFilters,
    getEntry,
    resolveActorStorageKey,
    getActorAvatarUrl,
    openCoverPicker,
    openAvatarPicker,
    closeImagePicker,
    applyCustomCover,
    resetCustomCover,
    applyCustomAvatar,
    resetCustomAvatar,
  }
})
