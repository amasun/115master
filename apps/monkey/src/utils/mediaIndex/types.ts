import type {
  IndexedVideo,
  IndexedVideoLabel,
  IndexProgress,
  VideoIndexSnapshot,
} from '@/utils/superSearch'

export type {
  IndexedVideo,
  IndexedVideoLabel,
  IndexProgress,
  VideoIndexSnapshot,
}

export type MediaKind = 'jav' | 'movie' | 'tv' | 'unknown'

export type LibraryView = 'all' | 'recent' | 'marked'

export type LibrarySortBy = 'mtime' | 'releaseDate' | 'duration' | 'size' | 'title'

export type LibraryScrapeFilter = 'all' | 'scraped' | 'unscraped'

export interface MediaCoverCandidate {
  url: string
  referer?: string
}

export interface MediaActor {
  name: string
  url?: string
  avatarUrl?: string
  avatarReferer?: string
}

export interface MediaPreview {
  thumbnail?: string
  raw?: string
}

export interface UnifiedMediaMeta {
  mediaKey: string
  kind: MediaKind
  externalId: string
  title: string
  originalTitle?: string
  overview?: string
  coverUrl?: string
  coverReferer?: string
  coverFallbacks?: MediaCoverCandidate[]
  posterUrl?: string
  backdropUrl?: string
  previews?: MediaPreview[]
  releaseDate?: string
  year?: number
  duration?: number
  rating?: number
  directors: string[]
  actors: MediaActor[]
  genres: string[]
  source: string
  detailUrl?: string
  updatedAt: number
}

export interface LibraryFileItem {
  fid: string
  cid: string
  pickCode: string
  sha1?: string
  name: string
  size: number
  duration: number
  mtime: number
  starred?: boolean
  labels?: IndexedVideoLabel[]
}

export interface LibraryEntry {
  mediaKey: string
  kind: MediaKind
  externalId?: string
  meta: UnifiedMediaMeta | null
  files: LibraryFileItem[]
  latestMtime: number
  markerCount: number
  totalSize: number
  maxDuration: number
  starred: boolean
  driveLabels: IndexedVideoLabel[]
}

export interface LibraryFilterState {
  view: LibraryView
  keyword: string
  actor?: string
  genre?: string
  director?: string
  year?: number
  scrapeStatus: LibraryScrapeFilter
  onlyMarked: boolean
  sortBy: LibrarySortBy
  sortAsc: boolean
}

export interface FacetCount {
  name: string
  count: number
}

export interface ActorFacetStat extends FacetCount {
  key: string
  aliases: string[]
  scrapedCount: number
  markedCount: number
  totalSize: number
  latestMtime: number
  avatarUrl?: string
}
