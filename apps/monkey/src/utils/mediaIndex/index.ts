export {
  actorProfileCache,
  fetchActorProfile,
  parseAvBaseActorProfile,
  parseJavBusActorProfile,
  parseMinnanoActorProfile,
} from './actorProfileFetcher'
export type { ActorProfile, FetchActorProfileOptions } from './actorProfileFetcher'
export {
  cinemaCache,
  DEFAULT_TMDB_API_BASE,
  DEFAULT_TMDB_IMAGE_BASE,
  normalizeTmdbImageUrl,
  readAllCachedCinemaMeta,
  resolveTmdbApiBase,
  saveCinemaMeta,
  scrapeCinemaMetaDetailed,
} from './cinemaScraper'
export {
  buildCinemaSearchQueries,
  needsCinemaFolderFallback,
  parseCinemaTitle,
} from './cinemaTitleParser'
export type { ParsedCinemaTitle } from './cinemaTitleParser'
export {
  COLLECTION_CUSTOM_META_STORAGE_KEY,
  normalizeCollectionTags,
  sanitizeCollectionCustomMeta,
  UNGROUPED_COLLECTION_CIDS_STORAGE_KEY,
} from './collectionStore'
export {
  analyzeDuplicateGroups,
  analyzeDuplicateGroupsAsync,
  detectEntryUncensoredKind,
  detectFileUncensoredKind,
  getUncensoredBadgeMeta,
  hasUniformSha1,
  isLadaFileName,
  isLtxFileName,
  isSuspectedMultiPartGroup,
  scoreEntryFilesForDedupe,
  scoreFileForKeep,
  selectSmartRedundantFids,
} from './deduplicator'
export type {
  DuplicateFileCandidate,
  DuplicateGroup,
  DuplicateKind,
  UncensoredBadgeMeta,
} from './deduplicator'
export {
  AD_DURATION_MAX_SEC,
  AD_DURATION_MIN_SEC,
  AD_SIZE_MAX_MB,
  AD_SIZE_MIN_MB,
  clampAdMaxDurationSec,
  clampAdMaxSizeMB,
  DEFAULT_LIBRARY_AD_MATCH_MODE,
  DEFAULT_LIBRARY_AD_MAX_DURATION_SEC,
  DEFAULT_LIBRARY_AD_MAX_SIZE_MB,
  detectAdVideos,
  isAdLibraryEntry,
  isAdVideo,
  JUNK_EXTENSION_GROUPS,
  normalizeAdMatchMode,
  scanDriveJunkFiles,
} from './junkScanner'
export type {
  AdVideoCandidate,
  AdVideoDetectOptions,
  AdVideoMatchMode,
  JunkCategory,
  JunkFileItem,
  JunkScannerDriveApi,
} from './junkScanner'
export { aggregateLibraryEntries, buildLibraryIndex } from './libraryAggregator'
export type {
  AggregateLibraryOptions,
  LibraryIndex,
  LibraryQueryOptions,
  YearFacetCount,
} from './libraryAggregator'
export {
  MANUAL_AV_BINDINGS_STORAGE_KEY,
  normalizeManualAvNumber,
  sanitizeManualAvBindings,
} from './manualMatchStore'
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
  installNativeDeleteCapture,
  NATIVE_DELETE_SYNC_STORAGE_KEY,
  removeFidsFromVideoIndex,
} from './nativeDeleteSync'
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
  SafeDeleteProgress,
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
  CollectionCustomMeta,
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
  UncensoredKind,
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
