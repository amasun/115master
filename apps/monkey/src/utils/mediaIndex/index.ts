export { aggregateLibraryEntries, buildLibraryIndex } from './libraryAggregator'
export type { LibraryIndex, YearFacetCount } from './libraryAggregator'
export {
  getCoverCandidates,
  javInfoToUnifiedMeta,
  loadPosterThumbUrl,
  readAllCachedJavMeta,
  scrapeJavMeta,
} from './scraperRegistry'
export type { PosterThumbResource } from './scraperRegistry'
export type {
  FacetCount,
  IndexedVideo,
  IndexedVideoLabel,
  IndexProgress,
  LibraryEntry,
  LibraryFileItem,
  LibraryFilterState,
  LibraryScrapeFilter,
  LibrarySortBy,
  LibraryView,
  MediaActor,
  MediaCoverCandidate,
  MediaKind,
  MediaPreview,
  UnifiedMediaMeta,
  VideoIndexSnapshot,
} from './types'
export {
  clearVideoIndexSnapshot,
  loadVideoIndexSnapshot,
  posterThumbCache,
  requestPersistentStorage,
  saveVideoIndexSnapshot,
} from './videoIndexStore'
export { syncDriveVideoIndex } from '@/utils/superSearch'
export type { SyncVideoIndexOptions } from '@/utils/superSearch'
