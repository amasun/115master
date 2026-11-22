import type { MarkerDoc } from '@/utils/markers/types'
import type {
  FacetCount,
  IndexedVideo,
  IndexProgress,
  LibraryEntry,
  LibraryFilterState,
  LibraryIndex,
  LibraryView,
  UnifiedMediaMeta,
} from '@/utils/mediaIndex'
import { useStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, reactive, shallowRef } from 'vue'
import { actressFaceDB } from '@/utils/actressFaceDB'
import { markerStore } from '@/utils/cache/markerStore'
import { appLogger } from '@/utils/logger'
import {
  aggregateLibraryEntries,
  buildLibraryIndex,
  loadVideoIndexSnapshot,
  readAllCachedJavMeta,
  requestPersistentStorage,
  scrapeJavMeta,
  syncDriveVideoIndex,
} from '@/utils/mediaIndex'
import { Scheduler, SchedulerError, TaskStatus } from '@/utils/scheduler'

const logger = appLogger.sub('MediaLibraryStore')

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

  const videos = shallowRef<IndexedVideo[]>([])
  const metaMap = shallowRef<Map<string, UnifiedMediaMeta>>(new Map())
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
    scrapeStatus: 'all',
    onlyMarked: false,
    sortBy: 'mtime',
    sortAsc: false,
  })

  const siderTab = useStorage<'actors' | 'genres'>('115Master_library_sider_tab', 'actors')
  const aspectMode = useStorage<'landscape' | 'portrait'>('115Master_library_aspect', 'landscape')
  const density = useStorage<'compact' | 'comfortable' | 'relaxed'>('115Master_library_density', 'comfortable')
  const scrollTop = shallowRef(0)
  const actorAvatars = shallowRef<Record<string, string>>({})
  const scrapingKeys = shallowRef<Set<string>>(new Set())

  const attemptedScrapeKeys = new Set<string>()
  const checkedAvatarActors = new Set<string>()
  const scrapeScheduler = new Scheduler<UnifiedMediaMeta | null>({
    maxConcurrent: 2,
    maxQueueLength: 200,
  })

  let initPromise: Promise<void> | null = null
  let syncController: AbortController | null = null
  let avatarTaskRunning = false

  function updateScrapingKeys(mediaKey: string, active: boolean) {
    const next = new Set(scrapingKeys.value)
    if (active)
      next.add(mediaKey)
    else
      next.delete(mediaKey)
    scrapingKeys.value = next
  }

  async function matchActorAvatars(actors: FacetCount[]) {
    if (avatarTaskRunning || actors.length === 0)
      return

    const pending = actors
      .map(item => item.name)
      .filter(name => !checkedAvatarActors.has(name))

    if (pending.length === 0)
      return

    avatarTaskRunning = true
    try {
      await actressFaceDB.init()
      const updates: Record<string, string> = {}

      for (const name of pending) {
        checkedAvatarActors.add(name)
        const matched = await actressFaceDB.findActress(name, 'name')
        if (matched?.url)
          updates[name] = matched.url
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
    const nextIndex = buildLibraryIndex(nextEntries)
    entries.value = nextEntries
    libraryIndex.value = nextIndex
    void matchActorAvatars(nextIndex.actors)
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
      const [snapshot, cachedMeta, markers] = await Promise.all([
        syncDriveVideoIndex({
          mode: resolvedMode,
          signal: controller.signal,
          onProgress: (progress) => {
            indexProgress.value = progress
          },
        }),
        readAllCachedJavMeta(),
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
      metaMap.value = mergedMeta
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

  async function refreshMarkers() {
    markerDocs.value = await markerStore.getAllDocs()
    if (videos.value.length > 0)
      rebuildEntries()
  }

  async function init() {
    if (initialized.value) {
      void refreshMarkers()
      return
    }
    if (initPromise)
      return initPromise

    initializing.value = true
    initPromise = (async () => {
      try {
        void requestPersistentStorage()
        const [snapshot, cachedMeta, markers] = await Promise.all([
          loadVideoIndexSnapshot(),
          readAllCachedJavMeta(),
          markerStore.getAllDocs(),
        ])

        metaMap.value = cachedMeta
        markerDocs.value = markers

        if (snapshot && snapshot.items.length > 0) {
          videos.value = snapshot.items
          lastIndexedAt.value = snapshot.lastSyncAt
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

  function enqueueScrape(mediaKey: string) {
    const entry = libraryIndex.value.entryMap.get(mediaKey)
    if (!entry || entry.meta !== null || entry.kind !== 'jav' || !entry.externalId)
      return
    if (attemptedScrapeKeys.has(mediaKey) || scrapingKeys.value.has(mediaKey))
      return

    const avNumber = entry.externalId
    updateScrapingKeys(mediaKey, true)

    void scrapeScheduler.add(
      () => scrapeJavMeta(avNumber),
      { id: mediaKey, immediate: true, action: 'push' },
    ).then((meta) => {
      attemptedScrapeKeys.add(mediaKey)
      updateScrapingKeys(mediaKey, false)
      if (!meta)
        return
      const nextMap = new Map(metaMap.value)
      nextMap.set(mediaKey, { ...meta, mediaKey })
      metaMap.value = nextMap
      rebuildEntries()
    }).catch((error) => {
      updateScrapingKeys(mediaKey, false)
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
    }
  }

  async function rescrape(mediaKey: string, customAvNumber?: string): Promise<UnifiedMediaMeta | null> {
    const entry = libraryIndex.value.entryMap.get(mediaKey)
    const targetAv = (customAvNumber?.trim() || entry?.externalId || '').toUpperCase()
    if (!targetAv)
      return null

    attemptedScrapeKeys.delete(mediaKey)
    updateScrapingKeys(mediaKey, true)
    try {
      const meta = await scrapeJavMeta(targetAv)
      if (!meta)
        return null
      const patched: UnifiedMediaMeta = { ...meta, mediaKey }
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

  function selectActor(name?: string) {
    filter.actor = !name || filter.actor === name ? undefined : name
  }

  function selectGenre(name?: string) {
    filter.genre = !name || filter.genre === name ? undefined : name
  }

  function setView(view: LibraryView) {
    filter.view = view
    if (view === 'recent') {
      filter.sortBy = 'mtime'
      filter.sortAsc = false
    }
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
    filter.scrapeStatus = 'all'
    filter.onlyMarked = false
  }

  function getEntry(mediaKey: string): LibraryEntry | undefined {
    return libraryIndex.value.entryMap.get(mediaKey)
  }

  const filteredEntries = computed(() => libraryIndex.value.query(filter))
  const scrapedCount = computed(() => entries.value.filter(item => item.meta !== null).length)
  const markedCount = computed(() => entries.value.filter(item => item.markerCount > 0).length)
  const scrapingCount = computed(() => scrapingKeys.value.size)

  return {
    initialized,
    initializing,
    indexing,
    indexProgress,
    indexError,
    lastIndexedAt,
    entries,
    libraryIndex,
    filter,
    siderTab,
    aspectMode,
    density,
    scrollTop,
    actorAvatars,
    scrapingKeys,
    scrapingCount,
    filteredEntries,
    scrapedCount,
    markedCount,
    init,
    syncIndex,
    refreshMarkers,
    enqueueScrape,
    cancelScrape,
    rescrape,
    selectActor,
    selectGenre,
    setView,
    resetFilters,
    getEntry,
  }
})
