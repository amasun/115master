import type { JavInfo } from '@/utils/jav/jav'

/** 115 网盘文件文字标签 */
export interface IndexedVideoLabel {
  id: string
  name: string
  color?: string
}

/** 网盘扁平视频索引单条记录 */
export interface IndexedVideo {
  /** 115 文件 ID（主键） */
  fid: string
  /** 所在父目录 ID（用于一键跳转目录） */
  cid: string
  /** 提取码（用于直接拉起 MASTER 播放器） */
  pickCode: string
  /** 原始文件名 */
  name: string
  /** 标准化番号（如 SSIS-001），无法识别时为 null */
  avNumber: string | null
  /** 文件大小（字节） */
  size: number
  /** 视频时长（秒） */
  duration: number
  /** 115 修改时间戳（秒），用于增量同步比对 */
  mtime: number
  /** 是否已星标（收藏） */
  starred?: boolean
  /** 115 网盘文件文字标签列表 */
  labels?: IndexedVideoLabel[]
}

/** 持久化在 IndexedDB 中的网盘视频索引快照 */
export interface VideoIndexSnapshot {
  /** 结构版本号 */
  schemaVersion: 1
  /** 扫描的根目录 cid 列表，默认 ['0'] */
  rootCids: string[]
  /** 上次全量同步时间（ms） */
  lastFullSyncAt: number
  /** 上次增量或全量同步时间（ms） */
  lastSyncAt: number
  /** 扁平视频列表 */
  items: IndexedVideo[]
}

/** 索引同步进度 */
export interface IndexProgress {
  /** 当前已扫描页数 */
  pages: number
  /** 当前已拉取视频条数 */
  fetched: number
  /** 115 返回的总视频数（估算） */
  total: number
  /** 同步模式 */
  mode: 'full' | 'incremental'
}

/** 命中原因来源 */
export type SuperSearchMatchKind = 'avNumber' | 'actorReverse' | 'actor' | 'genre' | 'director' | 'title' | 'year' | 'driveLabel' | 'filename'

/** 单条命中说明 */
export interface SuperSearchMatchReason {
  kind: SuperSearchMatchKind
  label: string
}

/** 超级搜索结果条目 */
export interface SuperSearchResult {
  video: IndexedVideo
  /** 关联的本地元数据（命中 javCache 时存在） */
  javInfo: JavInfo | null
  /** 命中的所有原因标签 */
  reasons: SuperSearchMatchReason[]
  /** 相关度排序分值（越高越靠前） */
  score: number
}

/** 演员作品反查数据源 */
export type ActorWorksSource = 'javbus' | 'javdb'

/** 演员作品表缓存条目 */
export interface ActorWorksCacheEntry {
  /** 规范化演员键（主键） */
  actorKey: string
  /** 演员展示名 */
  name: string
  /** 已知别名列表 */
  aliases: string[]
  /** 来源站点 */
  source: ActorWorksSource
  /** 演员主页链接 */
  profileUrl: string
  /** 标准化后的作品番号列表（已去重） */
  avNumbers: string[]
  /** 已拉取的总页数 */
  fetchedPages: number
  /** 是否仍有下一页可继续加载 */
  hasMore: boolean
  /** 缓存写入时间戳（ms） */
  cachedAt: number
}

/** 演员反查进度 */
export interface ActorFetchProgress {
  source: ActorWorksSource
  page: number
  maxPages: number
  collected: number
  stage: 'searching' | 'fetching'
}

/** 在线演员作品反查匹配上下文 */
export interface ActorReverseMatch {
  actorName: string
  source: ActorWorksSource
  avNumbers: Set<string>
  aliases?: string[]
}

/** 演员输入候选建议 */
export interface ActorSuggestion {
  name: string
  avatarUrl: string
}
