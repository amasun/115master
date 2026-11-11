import type {
  AddMarkerInput,
  CreateDocMeta,
  Marker,
  MarkerDoc,
  MarkerExportData,
  MarkerPoint,
  MarkerSegment,
  SegmentAction,
  UpdateMarkerPatch,
} from './types'

/** 30 天毫秒数 */
const DEFAULT_MAX_TOMBSTONE_AGE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * 创建空白打点文档
 * @param meta 文档元信息
 * @param now 当前时间戳（毫秒）
 */
export function createDoc(meta: CreateDocMeta, now: number): MarkerDoc {
  return {
    v: 1,
    pickCode: meta.pickCode,
    ...(meta.fileId !== undefined ? { fileId: meta.fileId } : {}),
    ...(meta.fileName !== undefined ? { fileName: meta.fileName } : {}),
    ...(meta.duration !== undefined ? { duration: meta.duration } : {}),
    markers: [],
    updatedAt: now,
  }
}

/**
 * 新增打点
 * @param doc 目标文档
 * @param input 打点参数
 * @param now 当前时间戳（毫秒）
 * @param id 指定 ID（可选，默认自动生成 UUID）
 */
export function addMarker(
  doc: MarkerDoc,
  input: AddMarkerInput,
  now: number,
  id?: string,
): MarkerDoc {
  if (typeof input.time !== 'number' || !Number.isFinite(input.time))
    return doc

  const time = Math.max(0, input.time)
  let endTime: number | undefined

  if (input.endTime !== undefined) {
    if (typeof input.endTime === 'number' && Number.isFinite(input.endTime)) {
      const clampedEnd = Math.max(0, input.endTime)
      if (clampedEnd > time)
        endTime = clampedEnd
    }
  }

  const marker: Marker = {
    id: id ?? crypto.randomUUID(),
    time,
    label: input.label ?? '',
    createdAt: now,
    updatedAt: now,
    ...(endTime !== undefined ? { endTime } : {}),
  }

  return {
    ...doc,
    markers: [...doc.markers, marker],
    updatedAt: now,
  }
}

/**
 * 更新打点
 * @param doc 目标文档
 * @param id 打点 ID
 * @param patch 变更内容
 * @param now 当前时间戳（毫秒）
 */
export function updateMarker(
  doc: MarkerDoc,
  id: string,
  patch: UpdateMarkerPatch,
  now: number,
): MarkerDoc {
  const index = doc.markers.findIndex(m => m.id === id)
  if (index === -1)
    return doc

  const target = doc.markers[index]
  if (target.deleted)
    return doc

  const label = patch.label !== undefined ? patch.label : target.label

  let time = target.time
  if (patch.time !== undefined) {
    if (typeof patch.time === 'number' && Number.isFinite(patch.time))
      time = Math.max(0, patch.time)
  }

  let endTime: number | undefined
  if (patch.endTime !== undefined) {
    if (typeof patch.endTime === 'number' && Number.isFinite(patch.endTime)) {
      const clampedEnd = Math.max(0, patch.endTime)
      if (clampedEnd > time)
        endTime = clampedEnd
    }
  }
  else {
    if (target.endTime !== undefined && target.endTime > time)
      endTime = target.endTime
  }

  const updated: Marker = {
    id: target.id,
    time,
    label,
    createdAt: target.createdAt,
    updatedAt: now,
    ...(endTime !== undefined ? { endTime } : {}),
  }

  const markers = [...doc.markers]
  markers[index] = updated

  return {
    ...doc,
    markers,
    updatedAt: now,
  }
}

/**
 * 软删除打点（写入墓碑）
 * @param doc 目标文档
 * @param id 打点 ID
 * @param now 当前时间戳（毫秒）
 */
export function removeMarker(
  doc: MarkerDoc,
  id: string,
  now: number,
): MarkerDoc {
  const index = doc.markers.findIndex(m => m.id === id)
  if (index === -1)
    return doc

  const target = doc.markers[index]
  if (target.deleted)
    return doc

  const markers = [...doc.markers]
  markers[index] = {
    ...target,
    deleted: true,
    updatedAt: now,
  }

  return {
    ...doc,
    markers,
    updatedAt: now,
  }
}

/**
 * 获取可见打点（过滤墓碑并按时间升序）
 * @param doc 打点文档
 */
export function visibleMarkers(doc: MarkerDoc): Marker[] {
  return doc.markers
    .filter(m => !m.deleted)
    .sort((a, b) => {
      if (a.time !== b.time)
        return a.time - b.time
      if (a.createdAt !== b.createdAt)
        return a.createdAt - b.createdAt
      return a.id.localeCompare(b.id)
    })
}

/**
 * 寻找上一个打点
 * @description 规则：若当前位置距离“当前所在打点”超过 tolerance 秒，则回到该打点；否则回到再前一个
 * @param markers 打点列表
 * @param currentTime 当前播放时间（秒）
 * @param tolerance 容差时间（秒，默认 2）
 */
export function findPrevMarker<T extends MarkerPoint = Marker>(
  markers: T[],
  currentTime: number,
  tolerance: number = 2,
): T | null {
  const list = markers
    .filter(m => !m.deleted)
    .sort((a, b) => a.time - b.time)

  if (list.length === 0)
    return null

  const past = list.filter(m => m.time <= currentTime)
  if (past.length === 0)
    return null

  const curr = past[past.length - 1]
  if (currentTime - curr.time > tolerance)
    return curr

  for (let i = past.length - 2; i >= 0; i--) {
    if (past[i].time < curr.time)
      return past[i]
  }

  return null
}

/**
 * 寻找下一个打点
 * @param markers 打点列表
 * @param currentTime 当前播放时间（秒）
 */
export function findNextMarker<T extends MarkerPoint = Marker>(
  markers: T[],
  currentTime: number,
): T | null {
  const list = markers
    .filter(m => !m.deleted && m.time > currentTime)
    .sort((a, b) => {
      if (a.time !== b.time)
        return a.time - b.time
      if (a.createdAt !== undefined && b.createdAt !== undefined && a.createdAt !== b.createdAt)
        return a.createdAt - b.createdAt
      return a.id.localeCompare(b.id)
    })

  return list[0] ?? null
}

/**
 * 构建高亮片段列表（按 duration 截断，重叠或相接片段合并，升序返回）
 * @param markers 打点列表
 * @param segmentSeconds 片段默认时长（秒）
 * @param duration 视频总时长（秒，可选）
 */
export function buildSegments(
  markers: Marker[],
  segmentSeconds: number,
  duration?: number,
): MarkerSegment[] {
  const visible = markers.filter(m => !m.deleted)
  if (visible.length === 0)
    return []

  const hasKnownDuration = typeof duration === 'number' && Number.isFinite(duration) && duration > 0

  const rawSegments: MarkerSegment[] = []
  for (const marker of visible) {
    if (typeof marker.time !== 'number' || !Number.isFinite(marker.time))
      continue

    let start = Math.max(0, marker.time)
    let end: number

    // endTime <= time 的打点回退为 time + segmentSeconds
    if (marker.endTime !== undefined && Number.isFinite(marker.endTime) && marker.endTime > marker.time) {
      end = marker.endTime
    }
    else {
      // 没有显式 endTime 或 endTime <= time 回退为 time + segmentSeconds
      if (segmentSeconds <= 0)
        continue
      end = marker.time + segmentSeconds
    }

    if (hasKnownDuration) {
      start = Math.min(start, duration)
      end = Math.min(end, duration)
    }

    if (end > start)
      rawSegments.push({ start, end })
  }

  if (rawSegments.length === 0)
    return []

  rawSegments.sort((a, b) => {
    if (a.start !== b.start)
      return a.start - b.start
    return a.end - b.end
  })

  const merged: MarkerSegment[] = []
  for (const seg of rawSegments) {
    const last = merged[merged.length - 1]
    if (!last) {
      merged.push({ start: seg.start, end: seg.end })
      continue
    }

    if (seg.start <= last.end) {
      last.end = Math.max(last.end, seg.end)
      continue
    }

    merged.push({ start: seg.start, end: seg.end })
  }

  return merged
}

/**
 * 精华模式决策动作
 * @description 在片段内→stay；在片段外→seek 到后面最近片段的 start；后面没有片段→ended
 * @param segments 片段列表
 * @param currentTime 当前播放时间（秒）
 */
export function nextSegmentAction(
  segments: MarkerSegment[],
  currentTime: number,
): SegmentAction {
  if (segments.length === 0)
    return { type: 'ended' }

  const sorted = [...segments].sort((a, b) => a.start - b.start)

  const inSegment = sorted.some(seg => currentTime >= seg.start && currentTime < seg.end)
  if (inSegment)
    return { type: 'stay' }

  const next = sorted.find(seg => seg.start >= currentTime)
  if (next)
    return { type: 'seek', time: next.start }

  return { type: 'ended' }
}

/**
 * 合并本地与远端打点文档
 * @description 按 id 合并，updatedAt 大者胜（相等时保留 local），墓碑参与合并；doc.updatedAt 取两者较大值；任一侧为空时返回另一侧
 * @param local 本地打点文档
 * @param remote 远端打点文档
 */
export function mergeDocs(
  local?: MarkerDoc | null,
  remote?: MarkerDoc | null,
): MarkerDoc | null {
  if (!local && !remote)
    return null
  if (!local)
    return remote ? { ...remote, markers: remote.markers.map(m => ({ ...m })) } : null
  if (!remote)
    return local ? { ...local, markers: local.markers.map(m => ({ ...m })) } : null

  if (local.pickCode !== remote.pickCode)
    throw new Error(`无法合并 pickCode 不一致的文档: ${local.pickCode} vs ${remote.pickCode}`)

  const map = new Map<string, Marker>()
  for (const m of local.markers)
    map.set(m.id, { ...m })

  for (const m of remote.markers) {
    const existing = map.get(m.id)
    if (!existing) {
      map.set(m.id, { ...m })
      continue
    }

    if (m.updatedAt > existing.updatedAt)
      map.set(m.id, { ...m })
  }

  /** 元数据（fileId、fileName、duration）取 updatedAt 较大一侧的值，该侧缺失时用另一侧补 */
  const primary = local.updatedAt >= remote.updatedAt ? local : remote
  const secondary = local.updatedAt >= remote.updatedAt ? remote : local

  const fileId = primary.fileId !== undefined ? primary.fileId : secondary.fileId
  const fileName = primary.fileName !== undefined ? primary.fileName : secondary.fileName
  const duration = primary.duration !== undefined ? primary.duration : secondary.duration

  return {
    v: 1,
    pickCode: local.pickCode,
    ...(fileId !== undefined ? { fileId } : {}),
    ...(fileName !== undefined ? { fileName } : {}),
    ...(duration !== undefined ? { duration } : {}),
    markers: Array.from(map.values()),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  }
}

/**
 * 清理过期墓碑标记
 * @param doc 打点文档
 * @param now 当前时间戳（毫秒）
 * @param maxAgeMs 墓碑最长存活时间（毫秒，默认 30 天）
 */
export function pruneTombstones(
  doc: MarkerDoc,
  now: number,
  maxAgeMs: number = DEFAULT_MAX_TOMBSTONE_AGE_MS,
): MarkerDoc {
  const markers = doc.markers.filter((m) => {
    if (!m.deleted)
      return true
    return now - m.updatedAt <= maxAgeMs
  })

  if (markers.length === doc.markers.length)
    return doc

  return {
    ...doc,
    markers,
  }
}

/**
 * 序列化打点文档为 JSON 文本
 * @param docs 打点文档集合（字典或数组）
 */
export function serializeDocs(docs: Record<string, MarkerDoc> | MarkerDoc[]): string {
  const record: Record<string, MarkerDoc> = Array.isArray(docs)
    ? Object.fromEntries(docs.map(doc => [doc.pickCode, doc]))
    : docs

  const exportData: MarkerExportData = {
    v: 1,
    docs: record,
  }

  return JSON.stringify(exportData, null, 2)
}

/** 校验打点对象合法性 */
function isValidMarker(item: unknown): item is Record<string, unknown> {
  if (!item || typeof item !== 'object' || Array.isArray(item))
    return false
  const m = item as Record<string, unknown>
  if (typeof m.id !== 'string' || !m.id.trim())
    return false
  if (typeof m.time !== 'number' || !Number.isFinite(m.time) || m.time < 0)
    return false
  if (m.endTime !== undefined && (typeof m.endTime !== 'number' || !Number.isFinite(m.endTime) || m.endTime < 0))
    return false
  if (typeof m.label !== 'string')
    return false
  if (typeof m.createdAt !== 'number' || !Number.isFinite(m.createdAt))
    return false
  if (typeof m.updatedAt !== 'number' || !Number.isFinite(m.updatedAt))
    return false
  if (m.deleted !== undefined && typeof m.deleted !== 'boolean')
    return false
  return true
}

/** 清理并只提取 Marker 定义的字段 */
function sanitizeMarker(m: Record<string, unknown>): Marker {
  const marker: Marker = {
    id: m.id as string,
    time: m.time as number,
    label: m.label as string,
    createdAt: m.createdAt as number,
    updatedAt: m.updatedAt as number,
  }
  if (typeof m.endTime === 'number' && Number.isFinite(m.endTime))
    marker.endTime = m.endTime
  if (typeof m.deleted === 'boolean' && m.deleted)
    marker.deleted = true
  return marker
}

/**
 * 反序列化导入打点 JSON 文本
 * @description 对非法输入抛出带可读信息的错误，并丢弃字段不合法的打点
 * @param text JSON 字符串
 */
export function parseDocs(text: string): MarkerExportData {
  if (typeof text !== 'string' || !text.trim())
    throw new Error('导入失败: 输入内容为空')

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch (error) {
    throw new Error(`导入失败: JSON 解析错误 (${error instanceof Error ? error.message : String(error)})`)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('导入失败: 根节点必须为对象')

  const root = parsed as Record<string, unknown>
  if (root.v !== 1)
    throw new Error(`导入失败: 不支持的数据版本 ${String(root.v)} (期望版本 1)`)

  if (!root.docs || typeof root.docs !== 'object' || Array.isArray(root.docs))
    throw new Error('导入失败: docs 字段必须为对象')

  const docsMap: Record<string, MarkerDoc> = {}
  for (const [key, rawDoc] of Object.entries(root.docs as Record<string, unknown>)) {
    if (!rawDoc || typeof rawDoc !== 'object' || Array.isArray(rawDoc))
      continue

    const d = rawDoc as Record<string, unknown>
    const pickCode = typeof d.pickCode === 'string' && d.pickCode.trim() ? d.pickCode.trim() : key
    if (!pickCode)
      continue

    const rawMarkers = Array.isArray(d.markers) ? d.markers : []
    const markerMap = new Map<string, Marker>()

    // 同一文档内 id 重复的打点只保留 updatedAt 最大的一个
    for (const raw of rawMarkers) {
      if (!isValidMarker(raw))
        continue
      const sanitized = sanitizeMarker(raw)
      const existing = markerMap.get(sanitized.id)
      if (!existing || sanitized.updatedAt > existing.updatedAt)
        markerMap.set(sanitized.id, sanitized)
    }

    const markers = Array.from(markerMap.values())

    /** 缺少 updatedAt 时取打点 updatedAt 最大值，无打点为 0 */
    let updatedAt: number
    if (typeof d.updatedAt === 'number' && Number.isFinite(d.updatedAt)) {
      updatedAt = d.updatedAt
    }
    else {
      updatedAt = markers.length > 0 ? Math.max(...markers.map(m => m.updatedAt)) : 0
    }

    /** 只保留 MarkerDoc 定义的字段 */
    const cleanDoc: MarkerDoc = {
      v: 1,
      pickCode,
      ...(typeof d.fileId === 'string' ? { fileId: d.fileId } : {}),
      ...(typeof d.fileName === 'string' ? { fileName: d.fileName } : {}),
      ...(typeof d.duration === 'number' && Number.isFinite(d.duration) ? { duration: d.duration } : {}),
      markers,
      updatedAt,
    }

    docsMap[pickCode] = cleanDoc
  }

  return {
    v: 1,
    docs: docsMap,
  }
}

/**
 * 格式化打点时间
 * @param seconds 秒数
 * @returns 格式化后的时间字符串（H:MM:SS 或 M:SS）
 */
export function formatMarkerTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0)
    return '0:00'

  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60

  const padSecs = String(secs).padStart(2, '0')
  if (hours > 0) {
    const padMins = String(minutes).padStart(2, '0')
    return `${hours}:${padMins}:${padSecs}`
  }

  return `${minutes}:${padSecs}`
}
