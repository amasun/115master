/**
 * 播放器打点数据类型定义
 */

/** 单个打点数据结构 */
// eslint-disable-next-line ts/consistent-type-definitions -- T1 规范要求使用 type 定义数据模型
export type Marker = {
  /** 唯一标识 */
  id: string
  /** 打点时间（秒） */
  time: number
  /** 片段结束时间（秒），缺省时由片段时长设置决定 */
  endTime?: number
  /** 备注描述 */
  label: string
  /** 创建时间戳（毫秒） */
  createdAt: number
  /** 更新时间戳（毫秒） */
  updatedAt: number
  /** 墓碑标记，用于同步合并 */
  deleted?: boolean
}

/** 打点展示/时间点基础结构（可直接用于跳转与查找） */

export type MarkerPoint = Pick<Marker, 'id' | 'time'> & Partial<Pick<Marker, 'deleted' | 'createdAt' | 'endTime' | 'label'>>

/** 单视频打点文档数据结构 */
// eslint-disable-next-line ts/consistent-type-definitions -- T1 规范要求使用 type 定义数据模型
export type MarkerDoc = {
  /** 数据版本 */
  v: 1
  /** 115 提取码（主键） */
  pickCode: string
  /** 115 文件 ID */
  fileId?: string
  /** 视频文件名 */
  fileName?: string
  /** 视频总时长（秒） */
  duration?: number
  /** 打点列表 */
  markers: Marker[]
  /** 文档更新时间戳（毫秒） */
  updatedAt: number
}

/** 创建打点文档的元信息 */
// eslint-disable-next-line ts/consistent-type-definitions -- T1 规范要求使用 type 定义数据模型
export type CreateDocMeta = {
  pickCode: string
  fileId?: string
  fileName?: string
  duration?: number
}

/** 新增打点输入参数 */
// eslint-disable-next-line ts/consistent-type-definitions -- T1 规范要求使用 type 定义数据模型
export type AddMarkerInput = {
  time: number
  label?: string
  endTime?: number
}

/** 更新打点补丁参数 */
// eslint-disable-next-line ts/consistent-type-definitions -- T1 规范要求使用 type 定义数据模型
export type UpdateMarkerPatch = {
  time?: number
  endTime?: number
  label?: string
}

/** 片段区间 */
// eslint-disable-next-line ts/consistent-type-definitions -- T1 规范要求使用 type 定义数据模型
export type MarkerSegment = {
  start: number
  end: number
}

/** 精华模式下一个片段动作 */
export type SegmentAction = { type: 'stay' } | { type: 'seek', time: number } | { type: 'ended' }

/** 导出导入文件格式 */
// eslint-disable-next-line ts/consistent-type-definitions -- T1 规范要求使用 type 定义数据模型
export type MarkerExportData = {
  v: 1
  docs: Record<string, MarkerDoc>
}
