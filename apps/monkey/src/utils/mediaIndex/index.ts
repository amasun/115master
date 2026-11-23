export {
  actorProfileCache,
  fetchActorProfile,
  parseJavBusActorProfile,
} from './actorProfileFetcher'
export type { ActorProfile, FetchActorProfileOptions } from './actorProfileFetcher'
export {
  analyzeDuplicateGroups,
  analyzeDuplicateGroupsAsync,
  isSuspectedMultiPartGroup,
  scoreEntryFilesForDedupe,
  scoreFileForKeep,
} from './deduplicator'
export type {
  DuplicateFileCandidate,
  DuplicateGroup,
  DuplicateKind,
} from './deduplicator'
export {
  detectAdVideos,
  JUNK_EXTENSION_GROUPS,
  scanDriveJunkFiles,
} from './junkScanner'
export type {
  JunkCategory,
  JunkFileItem,
  JunkScannerDriveApi,
} from './junkScanner'
export { aggregateLibraryEntries, buildLibraryIndex } from './libraryAggregator'
export type { LibraryIndex, YearFacetCount } from './libraryAggregator'
export {
  collectLocalAvatarCandidates,
  collectLocalCoverCandidates,
  compressCustomAvatar,
  compressCustomCover,
  fetchCandidateBlob,
  MAX_UPLOAD_IMAGE_BYTES,
  probeRemoteAvatarCandidates,
  probeRemoteCoverCandidates,
  validateUploadImageFile,
} from './mediaPicker'
export type { ImageCandidateItem } from './mediaPicker'
export {
  COMPANION_OR_JUNK_EXTENSIONS,
  evaluateParentFolderSafety,
  PROTECTED_FOLDER_NAMES,
  safeDeleteFiles,
  VIDEO_EXTENSIONS,
} from './safeDelete'
export type {
  EvaluateParentFolderParams,
  ParentFolderDecision,
  SafeDeleteDriveApi,
  SafeDeleteFileInput,
  SafeDeleteResult,
} from './safeDelete'
export {
  getCoverCandidates,
  javInfoToUnifiedMeta,
  loadCustomFullCoverUrl,
  loadPosterThumbUrl,
  readAllCachedJavMeta,
  scrapeJavMeta,
  scrapeJavMetaDetailed,
  shouldCropRightHalfForPortrait,
} from './scraperRegistry'
export type { PosterThumbResource, ScrapeResult } from './scraperRegistry'
export type {
  ActorFacetStat,
  DriveLabelFacetCount,
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
  clearAllScrapeMissed,
  clearScrapeMissed,
  clearVideoIndexSnapshot,
  customMediaCache,
  DEFAULT_SCRAPE_MISS_TTL_MS,
  getCustomAvatar,
  getCustomCover,
  isScrapeMissed,
  loadVideoIndexSnapshot,
  markScrapeMissed,
  posterThumbCache,
  readActiveScrapeMissKeys,
  readAllCustomMediaKeys,
  removeCustomAvatar,
  removeCustomCover,
  requestPersistentStorage,
  saveCustomAvatar,
  saveCustomCover,
  saveVideoIndexSnapshot,
  SCRAPE_MISS_RULE_VERSION,
  scrapeMissCache,
} from './videoIndexStore'
export type {
  CustomAvatarRecord,
  CustomCoverRecord,
  CustomMediaRecord,
  ScrapeMissEntry,
} from './videoIndexStore'
export { syncDriveVideoIndex } from '@/utils/superSearch'
export type { SyncVideoIndexOptions } from '@/utils/superSearch'
