import type { CreateDocMeta, Marker, MarkerDoc } from './types'
import { markerStore } from '@/utils/cache/markerStore'
import { appLogger } from '@/utils/logger'
import { mergeDocs, visibleMarkers } from './core'

const logger = appLogger.sub('MarkerDescSync')

export const MARKER_DESC_START = '[115M:MARKERS:v1]'
export const MARKER_DESC_END = '[/115M]'
export const MAX_FILE_DESC_LENGTH = 2000

const MARKER_BLOCK_REGEX = /\[115M:MARKERS:v1\][\s\S]*?\[\/115M\]/

function sanitizeLabel(label?: string): string {
  if (!label)
    return ''
  return label.replace(/[\r\n]/g, ' ').trim()
}

function serializeMarkerLine(marker: Marker): string {
  const time = Number(marker.time.toFixed(2))
  const label = sanitizeLabel(marker.label)
  return label ? `${time}|${label}` : `${time}`
}

function buildMarkerId(pickCode: string, time: number, index: number): string {
  return `desc:${pickCode}:${Math.round(time * 100)}:${index}`
}

/** 从 115 原生文件备注中解析打点文档；无打点块时返回 null */
export function decodeMarkersFromDesc(desc: string, meta: CreateDocMeta, now = Date.now()): MarkerDoc | null {
  if (!desc)
    return null
  const startIdx = desc.indexOf(MARKER_DESC_START)
  if (startIdx < 0)
    return null
  const endIdx = desc.indexOf(MARKER_DESC_END, startIdx + MARKER_DESC_START.length)
  if (endIdx < 0)
    return null

  const body = desc.slice(startIdx + MARKER_DESC_START.length, endIdx).trim()
  const lines = body
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  const markers: Marker[] = []
  lines.forEach((line, index) => {
    const sepIndex = line.indexOf('|')
    const rawTime = sepIndex >= 0 ? line.slice(0, sepIndex) : line
    const rawLabel = sepIndex >= 0 ? line.slice(sepIndex + 1).trim() : ''
    const time = Number(rawTime)
    if (!Number.isFinite(time) || time < 0)
      return
    markers.push({
      id: buildMarkerId(meta.pickCode, time, index),
      time,
      label: rawLabel,
      createdAt: now,
      updatedAt: now,
    })
  })

  return {
    v: 1,
    pickCode: meta.pickCode,
    ...(meta.fileId ? { fileId: meta.fileId } : {}),
    ...(meta.fileName ? { fileName: meta.fileName } : {}),
    ...(meta.duration !== undefined ? { duration: meta.duration } : {}),
    updatedAt: now,
    markers,
  }
}

/** 将打点块无损写入 115 原生文件备注，严格保留用户手写的原备注内容 */
export function encodeMarkersIntoDesc(
  originalDesc: string,
  doc: MarkerDoc,
  maxLength = MAX_FILE_DESC_LENGTH,
): { desc: string, truncated: boolean } {
  const active = visibleMarkers(doc)
  const stripped = originalDesc.replace(MARKER_BLOCK_REGEX, '').trim()

  if (active.length === 0)
    return { desc: stripped, truncated: false }

  const block = [
    MARKER_DESC_START,
    ...active.map(serializeMarkerLine),
    MARKER_DESC_END,
  ].join('\n')

  const combined = stripped ? `${stripped}\n\n${block}` : block
  if (combined.length > maxLength)
    return { desc: originalDesc, truncated: true }

  return { desc: combined, truncated: false }
}

/** 读取 115 原生文件备注中的打点并与本地 markerStore 双向合并；若云端缺少本地历史打点则自动补写 */
export async function syncMarkersFromFileDesc(
  fileId: string,
  meta: CreateDocMeta,
): Promise<MarkerDoc | null> {
  if (!fileId || !meta.pickCode)
    return null
  try {
    const { drive115 } = await import('@/utils/drive115Instance')
    const res = await drive115.file.getFileDesc({ file_id: fileId })
    if (!res.state)
      return null
    const rawDesc = String(res.desc ?? res.file_desc ?? '')
    const remoteDoc = decodeMarkersFromDesc(rawDesc, { ...meta, fileId })
    const localDoc = await markerStore.getDoc(meta.pickCode)

    const pushIfDiff = async (doc: MarkerDoc) => {
      const encoded = encodeMarkersIntoDesc(rawDesc, doc)
      if (encoded.truncated || encoded.desc === rawDesc)
        return
      await drive115.file.setFileDesc({
        file_id: fileId,
        file_desc: encoded.desc,
      })
    }

    /** 云端无打点块：若本地已有历史打点，自动补写到 115 文件备注 */
    if (!remoteDoc || remoteDoc.markers.length === 0) {
      if (localDoc && visibleMarkers(localDoc).length > 0)
        await pushIfDiff(localDoc)
      return localDoc
    }

    /** 本地无打点：直接从云端恢复到本地 */
    if (!localDoc) {
      await markerStore.saveDoc(remoteDoc)
      return remoteDoc
    }

    /** 按时间去重合并：保留本地已有时间点，补充云端新增的时间点，并顺手补写云端缺失点 */
    const localTimes = new Set(
      visibleMarkers(localDoc).map(marker => Math.round(marker.time * 10)),
    )
    const missingRemote = remoteDoc.markers.filter(
      marker => !localTimes.has(Math.round(marker.time * 10)),
    )
    const finalDoc = missingRemote.length > 0
      ? (mergeDocs(localDoc, { ...remoteDoc, markers: missingRemote }) ?? localDoc)
      : localDoc

    if (finalDoc !== localDoc)
      await markerStore.saveDoc(finalDoc)

    await pushIfDiff(finalDoc)
    return finalDoc
  }
  catch (error) {
    logger.warn('读取 115 文件备注打点失败，使用本地数据', fileId, error)
    return null
  }
}

/** 将打点文档无损同步写回 115 原生文件备注 */
export async function pushMarkersToFileDesc(
  fileId: string,
  doc: MarkerDoc,
): Promise<{ ok: boolean, truncated?: boolean }> {
  if (!fileId)
    return { ok: false }
  try {
    const { drive115 } = await import('@/utils/drive115Instance')
    const current = await drive115.file.getFileDesc({ file_id: fileId })
    if (!current.state)
      return { ok: false }

    const rawDesc = String(current.desc ?? current.file_desc ?? '')
    const encoded = encodeMarkersIntoDesc(rawDesc, doc)
    if (encoded.truncated) {
      logger.warn('打点同步超出 115 备注长度上限，已跳过远端写入以保护原备注', fileId)
      return { ok: false, truncated: true }
    }
    if (encoded.desc === rawDesc)
      return { ok: true }

    const saveRes = await drive115.file.setFileDesc({
      file_id: fileId,
      file_desc: encoded.desc,
    })
    return { ok: Boolean(saveRes.state) }
  }
  catch (error) {
    logger.warn('同步打点到 115 文件备注失败', fileId, error)
    return { ok: false }
  }
}
