import type { MarkerDoc } from '@/utils/markers/types'
import type {
  ActorFacetStat,
  AdVideoDetectOptions,
  AdVideoMatchMode,
  CollectionCustomMeta,
  DuplicateGroup,
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
import type { IndexRootCategory } from '@/utils/userSettings'
import { useStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { openCustomSectionDialog } from '@/components/CustomSectionDialog'
import { openIndexFolderPicker } from '@/components/IndexFolderPicker'
import {
  clampWallPage,
  DEFAULT_WALL_PAGE_SIZE,
  getWallTotalPages,
  normalizeWallPageSize,
} from '@/pages/library/components/wallPagination'
import { actressFaceDB } from '@/utils/actressFaceDB'
import { normalizeActressName } from '@/utils/actressNameMatcher'
import { markerStore } from '@/utils/cache/markerStore'
import { folderPathResolver } from '@/utils/driveFolderPath'
import { getAvNumber } from '@/utils/getNumber'
import { appLogger } from '@/utils/logger'
import {
  aggregateLibraryEntries,
  analyzeDuplicateGroupsAsync,
  buildLibraryIndex,
  clampAdMaxDurationSec,
  clampAdMaxSizeMB,
  clearAllScrapeMissed,
  clearScrapeMissed,
  COLLECTION_CUSTOM_META_STORAGE_KEY,
  compressCustomAvatar,
  compressCustomCover,
  DEFAULT_LIBRARY_AD_MATCH_MODE,
  DEFAULT_LIBRARY_AD_MAX_DURATION_SEC,
  DEFAULT_LIBRARY_AD_MAX_SIZE_MB,
  hasUniformSha1,
  isAdLibraryEntry,
  isSuspectedMultiPartGroup,
  loadVideoIndexSnapshot,
  markScrapeMissed,
  normalizeAdMatchMode,
  readActiveScrapeMissKeys,
  readAllCachedCinemaMeta,
  readAllCachedJavMeta,
  readAllCustomMediaKeys,
  removeCustomAvatar,
  removeCustomCover,
  requestPersistentStorage,
  sanitizeCollectionCustomMeta,
  saveCustomAvatar,
  saveCustomCover,
  saveVideoIndexSnapshot,
  scrapeCinemaMetaDetailed,
  scrapeJavMetaDetailed,
  syncDriveVideoIndex,
  UNGROUPED_COLLECTION_CIDS_STORAGE_KEY,
} from '@/utils/mediaIndex'
import { Scheduler, SchedulerError, TaskStatus } from '@/utils/scheduler'
import { getAllCachedActorWorks } from '@/utils/superSearch'
import {
  buildRootScanPlan,
  getConfiguredIndexRootCids,
  getIndexFoldersByCategory,
  normalizeCustomSections,
  normalizeIndexRootFolders,
  replaceIndexFoldersForCategory,
  useUserSetting,
} from '@/utils/userSettings'

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
  const wallPageSize = useStorage<number>('115Master_library_wall_page_size', DEFAULT_WALL_PAGE_SIZE)
  const initialWallPageSize = normalizeWallPageSize(wallPageSize.value)
  if (wallPageSize.value !== initialWallPageSize)
    wallPageSize.value = initialWallPageSize
  const wallPage = shallowRef(1)
  const hideAdVideos = useStorage<boolean>('115Master_library_hide_ad_videos', true)
  const adMaxDurationSec = useStorage<number>('115Master_library_ad_max_duration_sec', DEFAULT_LIBRARY_AD_MAX_DURATION_SEC)
  const adMaxSizeMB = useStorage<number>('115Master_library_ad_max_size_mb', DEFAULT_LIBRARY_AD_MAX_SIZE_MB)
  const adMatchMode = useStorage<AdVideoMatchMode>('115Master_library_ad_match_mode', DEFAULT_LIBRARY_AD_MATCH_MODE)
  const initialAdDuration = clampAdMaxDurationSec(adMaxDurationSec.value)
  if (adMaxDurationSec.value !== initialAdDuration)
    adMaxDurationSec.value = initialAdDuration
  const initialAdSize = clampAdMaxSizeMB(adMaxSizeMB.value)
  if (adMaxSizeMB.value !== initialAdSize)
    adMaxSizeMB.value = initialAdSize
  const initialAdMatchMode = normalizeAdMatchMode(adMatchMode.value)
  if (adMatchMode.value !== initialAdMatchMode)
    adMatchMode.value = initialAdMatchMode

  const hiddenActorKeys = useStorage<string[]>('115Master_library_hidden_actors', [])
  const hiddenActorKeySet = computed(() => new Set(hiddenActorKeys.value))
  const favoriteActorKeys = useStorage<string[]>('115Master_library_favorite_actors', [])
  const favoriteActorKeySet = computed(() => new Set(favoriteActorKeys.value))
  const customCollections = useStorage<Record<string, CollectionCustomMeta>>(COLLECTION_CUSTOM_META_STORAGE_KEY, {})
  const ungroupedCollectionCids = useStorage<string[]>(UNGROUPED_COLLECTION_CIDS_STORAGE_KEY, [])
  const ungroupedCollectionCidSet = computed(() => new Set(ungroupedCollectionCids.value))
  const indexRootFolders = useUserSetting('indexRootFolders')
  const enableCinemaLibrary = useUserSetting('enableCinemaLibrary')
  const customSections = useUserSetting('customSections')

  watch(enableCinemaLibrary, (enabled) => {
    if (!enabled && filter.view === 'cinema')
      filter.view = 'all'
  })
  const scrollTop = shallowRef(0)
  const tagRailOpen = ref(false)
  const actorAvatars = shallowRef<Record<string, string>>({})
  const customCoverKeys = shallowRef<Set<string>>(new Set())
  const customCoverVersions = shallowRef<Record<string, number>>({})
  const customAvatarUrls = shallowRef<Record<string, string>>({})
  const imagePickerTarget = shallowRef<MediaImagePickerTarget | null>(null)
  const playerOverlayPickCode = shallowRef<string | null>(null)
  const scrapingKeys = shallowRef<Set<string>>(new Set())
  const viewportScrapingKeys = shallowRef<Set<string>>(new Set())
  const missedScrapeKeys = shallowRef<Set<string>>(new Set())

  const bgScrapeState = shallowRef<BackgroundScrapeState>('idle')
  const bgScrapeReason = shallowRef('')
  const bgScrapeProcessed = shallowRef(0)

  const duplicateGroups = shallowRef<DuplicateGroup[]>([])
  const duplicateAnalyzing = shallowRef(false)
  const duplicateAnalyzedAt = shallowRef(0)
  const duplicateStale = shallowRef(true)

  const attemptedScrapeKeys = new Set<string>()
  const checkedAvatarActors = new Set<string>()
  const prefetchedCollectionCids = new Set<string>()
  const scrapeScheduler = new Scheduler<ScrapeResult>({
    maxConcurrent: 2,
    maxQueueLength: 200,
  })

  let initPromise: Promise<void> | null = null
  let syncController: AbortController | null = null
  let bgScrapeController: AbortController | null = null
  let dupController: AbortController | null = null
  let dupIdleTimer: ReturnType<typeof setTimeout> | null = null
  let offlineSyncTimer: ReturnType<typeof setTimeout> | null = null
  let offlineSyncToken = 0
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

  async function runDuplicateAnalysis(force = false): Promise<DuplicateGroup[]> {
    if (!force && !duplicateStale.value && duplicateAnalyzedAt.value > 0)
      return duplicateGroups.value

    if (dupIdleTimer) {
      clearTimeout(dupIdleTimer)
      dupIdleTimer = null
    }

    dupController?.abort()
    const controller = new AbortController()
    dupController = controller
    duplicateAnalyzing.value = true

    try {
      const result = await analyzeDuplicateGroupsAsync(
        videos.value,
        entries.value,
        markerDocs.value,
        { chunkSize: 400, signal: controller.signal },
      )
      if (controller.signal.aborted)
        return duplicateGroups.value
      duplicateGroups.value = result
      duplicateAnalyzedAt.value = Date.now()
      duplicateStale.value = false
      return result
    }
    catch (error) {
      if (!controller.signal.aborted)
        logger.warn('后台重复影片分析失败', error)
      return duplicateGroups.value
    }
    finally {
      if (dupController === controller) {
        duplicateAnalyzing.value = false
        dupController = null
      }
    }
  }

  function scheduleBackgroundDuplicateAnalysis(delayMs = 1200) {
    if (dupIdleTimer)
      clearTimeout(dupIdleTimer)
    if (videos.value.length === 0) {
      duplicateGroups.value = []
      duplicateStale.value = false
      return
    }

    dupIdleTimer = setTimeout(() => {
      dupIdleTimer = null
      if (indexing.value) {
        scheduleBackgroundDuplicateAnalysis(1500)
        return
      }
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => {
          void runDuplicateAnalysis()
        }, { timeout: 2500 })
      }
      else {
        void runDuplicateAnalysis()
      }
    }, delayMs)
  }

  function rebuildEntries() {
    const excludedRootCids = new Set(getConfiguredIndexRootCids(indexRootFolders.value))
    const nextEntries = aggregateLibraryEntries(videos.value, metaMap.value, markerDocs.value, {
      excludedRootCids,
      ungroupedCids: ungroupedCollectionCidSet.value,
      customCollections: customCollections.value,
      folderNameLookup: cid => folderPathResolver.getCached(cid)?.name,
    })
    const nextIndex = buildLibraryIndex(nextEntries, actorWorks.value)
    entries.value = nextEntries
    libraryIndex.value = nextIndex
    duplicateStale.value = true
    void matchActorAvatars(nextIndex.actorStats)
    scheduleBackgroundDuplicateAnalysis()

    const missingCollectionCids: string[] = []
    for (const item of nextEntries) {
      if (item.kind !== 'collection')
        continue
      const cid = item.mediaKey.slice('collection:'.length)
      if (!cid || prefetchedCollectionCids.has(cid) || folderPathResolver.getCached(cid))
        continue
      prefetchedCollectionCids.add(cid)
      missingCollectionCids.push(cid)
    }
    if (missingCollectionCids.length > 0)
      folderPathResolver.prefetch(missingCollectionCids)
  }

  watch(
    () => folderPathResolver.version.value,
    () => {
      const hasResolvableCollection = entries.value.some((item) => {
        if (item.kind !== 'collection')
          return false
        const cid = item.mediaKey.slice('collection:'.length)
        const cachedName = folderPathResolver.getCached(cid)?.name?.trim()
        if (!cachedName)
          return false
        const customTitle = customCollections.value[cid]?.title?.trim()
        return !customTitle && item.meta?.title !== cachedName
      })
      if (hasResolvableCollection)
        rebuildEntries()
    },
  )

  async function loadAllCachedMeta(): Promise<Map<string, UnifiedMediaMeta>> {
    const [javMeta, cinemaMeta] = await Promise.all([
      readAllCachedJavMeta(),
      readAllCachedCinemaMeta(),
    ])
    const merged = new Map(javMeta)
    cinemaMeta.forEach((meta, key) => {
      merged.set(key, meta)
    })
    return merged
  }

  async function syncIndex(mode: 'full' | 'incremental' = 'incremental', overrideRootCids?: string[]) {
    syncController?.abort()
    const controller = new AbortController()
    syncController = controller

    const resolvedMode = videos.value.length > 0 ? mode : 'full'
    const scanPlan = buildRootScanPlan({
      indexRootFolders: indexRootFolders.value,
      enableCinemaLibrary: enableCinemaLibrary.value,
      customSections: customSections.value,
    })
    const targetRootCids = overrideRootCids ?? scanPlan.rootCids
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
          ...(overrideRootCids ? { rootCids: targetRootCids } : { scanTargets: scanPlan.targets, rootConfigSignature: scanPlan.signature }),
          signal: controller.signal,
          onProgress: (progress) => {
            indexProgress.value = progress
          },
        }),
        loadAllCachedMeta(),
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

  function scheduleOfflineIncrementalSync(options: {
    initialDelayMs?: number
    retryDelayMs?: number
    onSynced?: (result: { addedCount: number, queuedScrapeCount: number }) => void
  } = {}) {
    if (offlineSyncTimer) {
      clearTimeout(offlineSyncTimer)
      offlineSyncTimer = null
    }
    const token = ++offlineSyncToken
    const beforeKeys = new Set(entries.value.map(entry => entry.mediaKey))
    const initialDelayMs = options.initialDelayMs ?? 3000
    const retryDelayMs = options.retryDelayMs ?? 10_000

    const runAttempt = async (allowRetry: boolean) => {
      if (token !== offlineSyncToken)
        return
      await syncIndex('incremental')
      if (token !== offlineSyncToken || indexError.value)
        return

      const added = entries.value.filter(entry => !beforeKeys.has(entry.mediaKey))
      if (added.length > 0) {
        let queuedScrapeCount = 0
        for (const entry of added) {
          if (entry.meta === null && (entry.kind === 'jav' || entry.kind === 'movie' || entry.kind === 'tv')) {
            enqueueScrape(entry.mediaKey)
            queuedScrapeCount += 1
          }
        }
        options.onSynced?.({ addedCount: added.length, queuedScrapeCount })
        return
      }

      if (allowRetry) {
        offlineSyncTimer = setTimeout(() => {
          offlineSyncTimer = null
          void runAttempt(false)
        }, retryDelayMs)
      }
    }

    offlineSyncTimer = setTimeout(() => {
      offlineSyncTimer = null
      void runAttempt(true)
    }, initialDelayMs)
  }

  async function refreshLocalContext() {
    const [cachedMeta, cachedActorWorks, markers] = await Promise.all([
      loadAllCachedMeta(),
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

  async function configureIndexRootFolders(options: { resyncIfChanged?: boolean } = {}) {
    const prevPlan = buildRootScanPlan({
      indexRootFolders: indexRootFolders.value,
      enableCinemaLibrary: enableCinemaLibrary.value,
      customSections: customSections.value,
    })
    const picked = await openIndexFolderPicker({
      initialFolders: indexRootFolders.value,
    })
    if (picked === null)
      return false
    indexRootFolders.value = picked
    const nextPlan = buildRootScanPlan({
      indexRootFolders: picked,
      enableCinemaLibrary: enableCinemaLibrary.value,
      customSections: customSections.value,
    })
    if (prevPlan.signature !== nextPlan.signature && options.resyncIfChanged !== false)
      await syncIndex('full')
    return true
  }

  async function configureCategoryFolders(
    category: IndexRootCategory,
    options: { resyncIfChanged?: boolean } = {},
  ) {
    const prevPlan = buildRootScanPlan({
      indexRootFolders: indexRootFolders.value,
      enableCinemaLibrary: enableCinemaLibrary.value,
      customSections: customSections.value,
    })
    const initialCategoryFolders = getIndexFoldersByCategory(indexRootFolders.value, category)
    const picked = await openIndexFolderPicker({
      title: category === 'cinema' ? '选择院线影视目录（可多选）' : '选择 AV / 番号影视目录（可多选）',
      description: category === 'cinema'
        ? '选中的目录将归类为「院线影视」，使用 TMDB / 豆瓣刮削电影与剧集。'
        : '选中的目录将作为「全部作品」AV 扫描范围；不选时默认扫描全盘。',
      initialFolders: initialCategoryFolders,
      fixedCategory: category,
    })
    if (picked === null)
      return false
    const merged = replaceIndexFoldersForCategory(indexRootFolders.value, category, picked)
    indexRootFolders.value = merged
    const nextPlan = buildRootScanPlan({
      indexRootFolders: merged,
      enableCinemaLibrary: enableCinemaLibrary.value,
      customSections: customSections.value,
    })
    if (prevPlan.signature !== nextPlan.signature && options.resyncIfChanged !== false)
      await syncIndex('full')
    return true
  }

  async function createCustomSection() {
    const created = await openCustomSectionDialog()
    if (!created)
      return null
    customSections.value = [...normalizeCustomSections(customSections.value), created]
    await syncIndex('full')
    filter.view = `section:${created.id}`
    return created
  }

  async function editCustomSection(sectionId: string) {
    const current = normalizeCustomSections(customSections.value).find(sec => sec.id === sectionId)
    if (!current)
      return false
    const prevPlan = buildRootScanPlan({
      indexRootFolders: indexRootFolders.value,
      enableCinemaLibrary: enableCinemaLibrary.value,
      customSections: customSections.value,
    })
    const updated = await openCustomSectionDialog({ initialSection: current })
    if (!updated)
      return false
    const nextList = normalizeCustomSections(customSections.value).map(sec =>
      sec.id === sectionId ? updated : sec,
    )
    customSections.value = nextList
    const nextPlan = buildRootScanPlan({
      indexRootFolders: indexRootFolders.value,
      enableCinemaLibrary: enableCinemaLibrary.value,
      customSections: nextList,
    })
    if (prevPlan.signature !== nextPlan.signature)
      await syncIndex('full')
    return true
  }

  async function deleteCustomSection(sectionId: string) {
    const nextList = normalizeCustomSections(customSections.value).filter(sec => sec.id !== sectionId)
    customSections.value = nextList
    if (filter.view === `section:${sectionId}`)
      filter.view = 'all'
    await syncIndex('full')
  }

  async function reloadFromCache() {
    const [snapshot, cachedMeta, cachedActorWorks, markers] = await Promise.all([
      loadVideoIndexSnapshot(),
      loadAllCachedMeta(),
      getAllCachedActorWorks(),
      markerStore.getAllDocs(),
    ])
    if (snapshot) {
      videos.value = snapshot.items
      lastIndexedAt.value = snapshot.lastSyncAt
      snapshotMeta.value = {
        rootCids: snapshot.rootCids,
        lastFullSyncAt: snapshot.lastFullSyncAt,
        lastSyncAt: snapshot.lastSyncAt,
      }
    }
    metaMap.value = cachedMeta
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
          loadAllCachedMeta(),
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
          if (normalizeIndexRootFolders(indexRootFolders.value).length === 0) {
            const picked = await openIndexFolderPicker({
              title: '选择初次索引与刮削目录',
              description: '可多选一个或多个影视目录以加快索引并减少杂项误刮削；不选择直接确认（或取消）将默认扫描全盘。',
              initialFolders: [],
            })
            if (picked !== null)
              indexRootFolders.value = picked
          }
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

  function isCinemaEntry(entry: LibraryEntry): boolean {
    return entry.kind === 'movie' || entry.kind === 'tv'
  }

  function isScrapableEntry(entry: LibraryEntry): boolean {
    if (entry.kind === 'collection')
      return false
    if (entry.customScrapeMode === 'folder_collection' || entry.customScrapeMode === 'none')
      return false
    return (entry.kind === 'jav' && Boolean(entry.externalId)) || isCinemaEntry(entry)
  }

  function scrapeEntryByKind(entry: LibraryEntry, customQuery?: string): Promise<ScrapeResult> {
    if (isCinemaEntry(entry)) {
      const folderName = folderPathResolver.getCached(entry.files[0]?.cid ?? '')?.name
      return scrapeCinemaMetaDetailed({
        mediaKey: entry.mediaKey,
        filename: entry.files[0]?.name ?? '',
        ...(folderName ? { folderName } : {}),
        customQuery,
        kindHint: entry.kind as 'movie' | 'tv',
      })
    }
    const targetAv = (customQuery?.trim() || entry.externalId || '').toUpperCase()
    return scrapeJavMetaDetailed(targetAv)
  }

  function enqueueScrape(mediaKey: string) {
    const entry = libraryIndex.value.entryMap.get(mediaKey)
    if (!entry || entry.meta !== null || !isScrapableEntry(entry))
      return
    if (
      attemptedScrapeKeys.has(mediaKey)
      || scrapingKeys.value.has(mediaKey)
      || missedScrapeKeys.value.has(mediaKey)
    ) {
      return
    }

    const missRef = entry.externalId || entry.files[0]?.name || mediaKey
    updateScrapingKeys(mediaKey, true)
    updateViewportScrapingKeys(mediaKey, true)

    void scrapeScheduler.add(
      () => scrapeEntryByKind(entry),
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
        addMissedScrapeKey(mediaKey, missRef)
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

  async function rescrape(mediaKey: string, customInput?: string): Promise<UnifiedMediaMeta | null> {
    const entry = libraryIndex.value.entryMap.get(mediaKey)
    if (!entry)
      return null
    const cinema = isCinemaEntry(entry)
    const targetQuery = cinema
      ? (customInput?.trim() || entry.files[0]?.name || '')
      : (customInput?.trim() || entry.externalId || '').toUpperCase()
    if (!targetQuery)
      return null

    attemptedScrapeKeys.delete(mediaKey)
    removeMissedScrapeKey(mediaKey)
    updateScrapingKeys(mediaKey, true)
    try {
      const result = await scrapeEntryByKind(entry, customInput)
      if (result.status !== 'ok') {
        if (result.status === 'not_found')
          addMissedScrapeKey(mediaKey, targetQuery)
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

  const adFilterOptions = computed<Required<AdVideoDetectOptions>>(() => ({
    maxDurationSec: clampAdMaxDurationSec(adMaxDurationSec.value),
    maxSizeMB: clampAdMaxSizeMB(adMaxSizeMB.value),
    matchMode: normalizeAdMatchMode(adMatchMode.value),
    excludeStarred: true,
  }))
  const adEntryKeySet = computed(() =>
    new Set(
      entries.value
        .filter(entry => isAdLibraryEntry(entry, adFilterOptions.value))
        .map(entry => entry.mediaKey),
    ),
  )
  const adEntryCount = computed(() => adEntryKeySet.value.size)
  const visibleEntries = computed(() =>
    hideAdVideos.value
      ? entries.value.filter(entry => !adEntryKeySet.value.has(entry.mediaKey))
      : entries.value,
  )
  const visibleEntryCount = computed(() =>
    visibleEntries.value.filter(entry => !isCinemaEntry(entry) && !entry.sectionId).length,
  )
  const cinemaCount = computed(() =>
    visibleEntries.value.filter(entry => isCinemaEntry(entry) && !entry.sectionId).length,
  )
  const sectionCounts = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {}
    for (const entry of visibleEntries.value) {
      if (!entry.sectionId)
        continue
      counts[entry.sectionId] = (counts[entry.sectionId] ?? 0) + 1
    }
    return counts
  })

  function commitAdThresholds(next?: { maxDurationSec?: unknown, maxSizeMB?: unknown, matchMode?: unknown }) {
    const duration = clampAdMaxDurationSec(
      next && 'maxDurationSec' in next ? next.maxDurationSec : adMaxDurationSec.value,
    )
    if (adMaxDurationSec.value !== duration)
      adMaxDurationSec.value = duration

    const size = clampAdMaxSizeMB(
      next && 'maxSizeMB' in next ? next.maxSizeMB : adMaxSizeMB.value,
    )
    if (adMaxSizeMB.value !== size)
      adMaxSizeMB.value = size

    const mode = normalizeAdMatchMode(
      next && 'matchMode' in next ? next.matchMode : adMatchMode.value,
    )
    if (adMatchMode.value !== mode)
      adMatchMode.value = mode
  }

  function getNextBackgroundCandidate(): LibraryEntry | undefined {
    return visibleEntries.value.find(entry =>
      isScrapableEntry(entry)
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
        if (!candidate) {
          flushRebuilds()
          bgScrapeState.value = 'done'
          bgScrapeReason.value = ''
          break
        }

        const { mediaKey } = candidate
        const missRef = candidate.externalId || candidate.files[0]?.name || mediaKey
        updateScrapingKeys(mediaKey, true)
        let result: ScrapeResult
        try {
          result = await scrapeEntryByKind(candidate)
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
          addMissedScrapeKey(mediaKey, missRef)
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

  function pruneDuplicateGroupsByFids(fidSet: ReadonlySet<string>) {
    if (duplicateGroups.value.length === 0)
      return

    const nextGroups: DuplicateGroup[] = []
    for (const group of duplicateGroups.value) {
      const remaining = group.files.filter(file => !fidSet.has(file.fid))
      if (remaining.length < 2)
        continue
      if (remaining.length === group.files.length) {
        nextGroups.push(group)
        continue
      }
      const files = remaining.map((file, idx) => ({
        ...file,
        recommendedKeep: idx === 0,
      }))
      const totalSize = files.reduce((sum, f) => sum + f.size, 0)
      const keptSize = files[0]?.size ?? 0
      nextGroups.push({
        ...group,
        files,
        totalSize,
        reclaimableSize: Math.max(0, totalSize - keptSize),
        suspectedMultiPart: group.kind === 'sha1' || hasUniformSha1(files)
          ? false
          : isSuspectedMultiPartGroup(files.map(f => f.name)),
      })
    }
    duplicateGroups.value = nextGroups
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
    pruneDuplicateGroupsByFids(fidSet)
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

  function isActorFavorite(actorKey: string): boolean {
    return favoriteActorKeySet.value.has(actorKey)
  }

  function toggleFavoriteActor(actorKey: string): boolean {
    if (!actorKey)
      return false
    if (favoriteActorKeySet.value.has(actorKey)) {
      favoriteActorKeys.value = favoriteActorKeys.value.filter(key => key !== actorKey)
      return false
    }
    favoriteActorKeys.value = [...favoriteActorKeys.value, actorKey]
    return true
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

  function openPlayerOverlay(pickCode: string) {
    if (pickCode)
      playerOverlayPickCode.value = pickCode
  }

  function closePlayerOverlay() {
    playerOverlayPickCode.value = null
  }

  function saveCollectionMeta(
    cid: string,
    patch: {
      title?: string
      overview?: string
      genres?: string[]
      actors?: string[]
    },
  ) {
    const sanitized = sanitizeCollectionCustomMeta(cid, patch)
    const next = { ...customCollections.value }
    if (sanitized)
      next[sanitized.cid] = sanitized
    else
      delete next[cid.trim()]
    customCollections.value = next
    rebuildEntries()
  }

  function isCollectionUngrouped(cid: string): boolean {
    return ungroupedCollectionCidSet.value.has(cid.trim())
  }

  function setCollectionUngrouped(cid: string, ungrouped: boolean) {
    const normalizedCid = cid.trim()
    if (!normalizedCid)
      return
    const next = new Set(ungroupedCollectionCids.value)
    if (ungrouped)
      next.add(normalizedCid)
    else
      next.delete(normalizedCid)
    ungroupedCollectionCids.value = Array.from(next)
    rebuildEntries()
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

  const filteredEntries = computed(() =>
    libraryIndex.value.query(
      filter,
      hideAdVideos.value ? { excludeKeys: adEntryKeySet.value } : undefined,
    ),
  )
  const wallTotalPages = computed(() =>
    getWallTotalPages(filteredEntries.value.length, wallPageSize.value),
  )

  function setWallPage(page: number) {
    const next = clampWallPage(page, filteredEntries.value.length, wallPageSize.value)
    if (wallPage.value !== next)
      wallPage.value = next
    scrollTop.value = 0
  }

  function setWallPageSize(size: number) {
    const next = normalizeWallPageSize(size)
    if (wallPageSize.value !== next)
      wallPageSize.value = next
    wallPage.value = 1
    scrollTop.value = 0
  }

  watch(
    [
      () => filter.view,
      () => filter.keyword,
      () => filter.actor,
      () => filter.genre,
      () => filter.director,
      () => filter.year,
      () => filter.driveLabel,
      () => filter.scrapeStatus,
      () => filter.onlyStarred,
      () => filter.onlyMarked,
      () => filter.sortBy,
      () => filter.sortAsc,
      hideAdVideos,
      adMaxDurationSec,
      adMaxSizeMB,
      adMatchMode,
    ],
    () => {
      wallPage.value = 1
      scrollTop.value = 0
    },
  )

  watch(wallTotalPages, (total) => {
    if (wallPage.value > total)
      wallPage.value = total
  })

  const scrapedCount = computed(() => visibleEntries.value.filter(item => item.meta !== null).length)
  const starredCount = computed(() => visibleEntries.value.filter(item => item.starred).length)
  const markedCount = computed(() => visibleEntries.value.filter(item => item.markerCount > 0).length)
  const scrapingCount = computed(() => scrapingKeys.value.size)
  const missedScrapeCount = computed(() => missedScrapeKeys.value.size)
  const bgScrapePendingCount = computed(() =>
    visibleEntries.value.filter(entry =>
      isScrapableEntry(entry)
      && entry.meta === null
      && !missedScrapeKeys.value.has(entry.mediaKey),
    ).length,
  )

  async function retryMissedScrapes() {
    missedScrapeKeys.value = new Set()
    attemptedScrapeKeys.clear()
    await clearAllScrapeMissed()
    if (bgScrapePendingCount.value > 0 && bgScrapeState.value !== 'running')
      startBackgroundScrape()
  }

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
    wallPage,
    wallPageSize,
    wallTotalPages,
    setWallPage,
    setWallPageSize,
    hideAdVideos,
    adMaxDurationSec,
    adMaxSizeMB,
    adMatchMode,
    adFilterOptions,
    adEntryCount,
    visibleEntryCount,
    cinemaCount,
    sectionCounts,
    commitAdThresholds,
    hiddenActorKeys,
    hiddenActorKeySet,
    favoriteActorKeys,
    favoriteActorKeySet,
    scrollTop,
    tagRailOpen,
    actorAvatars,
    customCoverKeys,
    customCoverVersions,
    customAvatarUrls,
    imagePickerTarget,
    playerOverlayPickCode,
    scrapingKeys,
    scrapingCount,
    missedScrapeCount,
    bgScrapeState,
    bgScrapeReason,
    bgScrapeProcessed,
    bgScrapePendingCount,
    duplicateGroups,
    duplicateAnalyzing,
    duplicateAnalyzedAt,
    duplicateStale,
    filteredEntries,
    scrapedCount,
    starredCount,
    markedCount,
    init,
    syncIndex,
    indexRootFolders,
    enableCinemaLibrary,
    customSections,
    configureIndexRootFolders,
    configureCategoryFolders,
    createCustomSection,
    editCustomSection,
    deleteCustomSection,
    scheduleOfflineIncrementalSync,
    refreshLocalContext,
    reloadFromCache,
    runDuplicateAnalysis,
    enqueueScrape,
    cancelScrape,
    rescrape,
    startBackgroundScrape,
    pauseBackgroundScrape,
    resumeBackgroundScrape,
    stopBackgroundScrape,
    retryMissedScrapes,
    applyFileStar,
    applyFileLabels,
    applyFileRename,
    applyFileMove,
    applyFileDelete,
    applyFilesDelete,
    isActorHidden,
    hideActor,
    unhideActor,
    isActorFavorite,
    toggleFavoriteActor,
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
    openPlayerOverlay,
    closePlayerOverlay,
    customCollections,
    ungroupedCollectionCids,
    saveCollectionMeta,
    isCollectionUngrouped,
    setCollectionUngrouped,
    applyCustomCover,
    resetCustomCover,
    applyCustomAvatar,
    resetCustomAvatar,
  }
})
