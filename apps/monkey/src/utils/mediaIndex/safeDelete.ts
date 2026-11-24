import type { IndexedVideo } from './types'
import { drive115 } from '@/utils/drive115Instance'

export interface SafeDeleteFileInput {
  fid: string
  cid: string
  name?: string
}

export interface ParentFolderDecision {
  cid: string
  name?: string
  deleted: boolean
  reason: string
}

export interface SafeDeleteProgress {
  phase: 'files' | 'folders'
  completedFiles: number
  totalFiles: number
  deletedFiles: number
  failedFiles: number
  completedDirs: number
  totalDirs: number
  checkedFolders: number
  totalFolders: number
  deletedFolders: number
  lastError?: string
}

export interface SafeDeleteResult {
  deletedFileIds: string[]
  failedFileIds: string[]
  deletedFolders: ParentFolderDecision[]
  skippedFolders: ParentFolderDecision[]
  aborted?: boolean
  lastError?: string
}

export type SafeDeleteDriveApi = Pick<typeof drive115.file, 'getFilesWithFallback' | 'deleteFiles'>

export interface EvaluateParentFolderParams {
  cid: string
  folderName?: string
  remainingItems: Array<{ name: string, isFolder: boolean }>
  remainingIndexedVideosCount?: number
}

export const PROTECTED_FOLDER_NAMES = new Set([
  '根目录',
  '我的接收',
  '云下载',
  '来自：分享',
  '视频',
  '电影',
  '电视剧',
  '动漫',
  '综艺',
  '纪录片',
  '音乐',
  '图片',
  '文档',
  '下载',
  'downloads',
  'download',
  'videos',
  'video',
  'movies',
  'movie',
  'tv',
  'jav',
  '115',
  'root',
])

export const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mkv',
  'avi',
  'mov',
  'wmv',
  'flv',
  'webm',
  'm4v',
  'ts',
  'm2ts',
  'rmvb',
  'rm',
  '3gp',
  'mpg',
  'mpeg',
  'vob',
  'iso',
  'strm',
])

export const COMPANION_OR_JUNK_EXTENSIONS = new Set([
  'nfo',
  'srt',
  'ass',
  'ssa',
  'sub',
  'idx',
  'vtt',
  'sup',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'tbn',
  'txt',
  'url',
  'html',
  'htm',
  'mht',
  'mhtml',
  'torrent',
  'magnet',
  'lnk',
  'chm',
  'apk',
  'exe',
  'bat',
  'cmd',
  'xml',
  'json',
])

function extractExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1)
    return ''
  return name.slice(dot + 1).toLowerCase()
}

/**
 * 纯函数：评估父目录在删除目标文件后是否可以安全连带删除
 */
export function evaluateParentFolderSafety(
  params: EvaluateParentFolderParams,
): { safe: boolean, reason: string } {
  const cid = params.cid.trim()
  if (!cid || cid === '0')
    return { safe: false, reason: '根目录不可删除' }

  const normalizedName = params.folderName?.trim().toLowerCase()
  if (normalizedName && PROTECTED_FOLDER_NAMES.has(normalizedName))
    return { safe: false, reason: `受保护目录 (${params.folderName}) 不可删除` }

  if ((params.remainingIndexedVideosCount ?? 0) > 0)
    return { safe: false, reason: '本地索引中该目录仍有其他视频' }

  if (params.remainingItems.some(item => item.isFolder))
    return { safe: false, reason: '目录内仍有子文件夹' }

  if (params.remainingItems.some(item => VIDEO_EXTENSIONS.has(extractExtension(item.name))))
    return { safe: false, reason: '目录内仍有其他视频文件' }

  const hasUnknownFile = params.remainingItems.some(
    item => !COMPANION_OR_JUNK_EXTENSIONS.has(extractExtension(item.name)),
  )
  if (hasUnknownFile)
    return { safe: false, reason: '目录内仍有非附属/未知类型文件' }

  return {
    safe: true,
    reason: params.remainingItems.length === 0 ? '空目录' : '仅剩附属或垃圾文件',
  }
}

function buildDeletePayload(fids: string[], pid: string) {
  const payload: { [key: `fid[${number}]`]: string, pid: string, ignore_warn: 1 } = {
    pid,
    ignore_warn: 1,
  }
  fids.forEach((fid, index) => {
    payload[`fid[${index}]`] = fid
  })
  return payload
}

function extractApiErrorMessage(res: unknown): string {
  if (!res || typeof res !== 'object')
    return '115 接口返回失败'
  const record = res as { error?: unknown, error_msg?: unknown, message?: unknown }
  const raw = record.error || record.error_msg || record.message
  return typeof raw === 'string' && raw.trim() ? raw.trim() : '115 接口返回失败'
}

export const DEFAULT_DELETE_BATCH_SIZE = 200

/**
 * 安全删除指定文件（移入回收站），并在开启 deleteEmptyParent 时安全清理空父目录
 * @description 优先按跨目录合批（pid: '0'）提交，若接口拒绝跨目录则自动降级为按父目录逐组删除。
 */
export async function safeDeleteFiles(
  files: SafeDeleteFileInput[],
  options: {
    deleteEmptyParent: boolean
    allIndexedVideos: IndexedVideo[]
    batchSize?: number
    driveApi?: SafeDeleteDriveApi
    signal?: AbortSignal
    onProgress?: (progress: SafeDeleteProgress) => void
    onBatchDeleted?: (deletedFids: string[]) => void | Promise<void>
  },
): Promise<SafeDeleteResult> {
  const api = options.driveApi ?? drive115.file
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? DEFAULT_DELETE_BATCH_SIZE))
  const deletedFileIds: string[] = []
  const failedFileIds: string[] = []
  const deletedFolders: ParentFolderDecision[] = []
  const skippedFolders: ParentFolderDecision[] = []
  let aborted = false
  let lastError: string | undefined

  if (files.length === 0) {
    return { deletedFileIds, failedFileIds, deletedFolders, skippedFolders }
  }

  const remainingCountByCid = new Map<string, number>()
  for (const file of files)
    remainingCountByCid.set(file.cid, (remainingCountByCid.get(file.cid) ?? 0) + 1)

  const totalFiles = files.length
  const totalDirs = remainingCountByCid.size
  const affectedCids = new Set<string>()
  let completedFiles = 0
  let completedDirs = 0
  let checkedFolders = 0

  const emitProgress = (phase: SafeDeleteProgress['phase'], totalFolders = 0) => {
    options.onProgress?.({
      phase,
      completedFiles,
      totalFiles,
      deletedFiles: deletedFileIds.length,
      failedFiles: failedFileIds.length,
      completedDirs,
      totalDirs,
      checkedFolders,
      totalFolders,
      deletedFolders: deletedFolders.length,
      ...(lastError ? { lastError } : {}),
    })
  }

  const markProcessedFiles = (processedFiles: SafeDeleteFileInput[]) => {
    completedFiles += processedFiles.length
    for (const file of processedFiles) {
      const next = (remainingCountByCid.get(file.cid) ?? 0) - 1
      remainingCountByCid.set(file.cid, next)
      if (next === 0)
        completedDirs += 1
    }
  }

  const deleteBySingleCid = async (group: SafeDeleteFileInput[], cid: string) => {
    const fids = group.map(item => item.fid)
    try {
      const res = await api.deleteFiles(buildDeletePayload(fids, cid))
      if (res.state) {
        deletedFileIds.push(...fids)
        affectedCids.add(cid)
        await options.onBatchDeleted?.(fids)
      }
      else {
        failedFileIds.push(...fids)
        lastError = extractApiErrorMessage(res)
      }
    }
    catch (error) {
      failedFileIds.push(...fids)
      lastError = error instanceof Error ? error.message : String(error)
    }

    markProcessedFiles(group)
    emitProgress('files')
  }

  const deleteChunkByCid = async (chunk: SafeDeleteFileInput[]) => {
    const byCid = new Map<string, SafeDeleteFileInput[]>()
    for (const file of chunk) {
      const group = byCid.get(file.cid)
      if (group)
        group.push(file)
      else
        byCid.set(file.cid, [file])
    }

    for (const [cid, group] of byCid.entries()) {
      if (options.signal?.aborted) {
        aborted = true
        break
      }
      await deleteBySingleCid(group, cid)
    }
  }

  emitProgress('files')

  let crossDirSupported = true

  for (let offset = 0; offset < files.length; offset += batchSize) {
    if (options.signal?.aborted) {
      aborted = true
      break
    }

    const chunk = files.slice(offset, offset + batchSize)
    const chunkCids = new Set(chunk.map(item => item.cid))

    // 同目录文件直接带真实 pid 提交
    if (chunkCids.size === 1) {
      const singleCid = chunk[0]!.cid
      await deleteBySingleCid(chunk, singleCid)
      continue
    }

    // 跨目录合批优先使用 pid: '0'；若被 115 拒绝则自动降级为按目录逐组重试
    if (crossDirSupported) {
      const fids = chunk.map(item => item.fid)
      let batchSucceeded = false
      try {
        const res = await api.deleteFiles(buildDeletePayload(fids, '0'))
        if (res.state) {
          deletedFileIds.push(...fids)
          for (const cid of chunkCids)
            affectedCids.add(cid)
          await options.onBatchDeleted?.(fids)
          markProcessedFiles(chunk)
          emitProgress('files')
          batchSucceeded = true
        }
        else {
          lastError = extractApiErrorMessage(res)
        }
      }
      catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
      }

      if (batchSucceeded)
        continue

      crossDirSupported = false
      if (options.signal?.aborted) {
        aborted = true
        break
      }
    }

    await deleteChunkByCid(chunk)
    if (aborted)
      break
  }

  if (aborted || !options.deleteEmptyParent || affectedCids.size === 0) {
    return {
      deletedFileIds,
      failedFileIds,
      deletedFolders,
      skippedFolders,
      ...(aborted ? { aborted: true } : {}),
      ...(lastError ? { lastError } : {}),
    }
  }

  const deletedFidSet = new Set(deletedFileIds)
  const totalFolders = affectedCids.size
  emitProgress('folders', totalFolders)

  for (const cid of affectedCids) {
    if (options.signal?.aborted) {
      aborted = true
      break
    }

    if (!cid || cid === '0') {
      skippedFolders.push({ cid, deleted: false, reason: '根目录不可删除' })
      checkedFolders += 1
      emitProgress('folders', totalFolders)
      continue
    }

    const remainingIndexed = options.allIndexedVideos.filter(
      video => video.cid === cid && !deletedFidSet.has(video.fid),
    ).length

    try {
      const listing = await api.getFilesWithFallback({
        aid: 1,
        cid,
        offset: 0,
        limit: 200,
        show_dir: 1,
        cur: 1,
      })

      if (!listing.state) {
        skippedFolders.push({ cid, deleted: false, reason: '无法读取目录内容' })
        checkedFolders += 1
        emitProgress('folders', totalFolders)
        continue
      }

      const pathList = Array.isArray(listing.path) ? listing.path : []
      const currentPath = pathList.find(item => item.cid === cid) ?? pathList[pathList.length - 1]
      const folderName = currentPath?.name
      const grandParentCid = currentPath?.pid || (pathList.length >= 2 ? pathList[pathList.length - 2]?.cid : '')

      const rawItems = Array.isArray(listing.data) ? listing.data : []
      const remainingItems = rawItems
        .filter(item => item.fc === 0 || !deletedFidSet.has(item.fid))
        .map(item => ({
          name: item.n,
          isFolder: item.fc === 0,
        }))

      const decision = evaluateParentFolderSafety({
        cid,
        folderName,
        remainingItems,
        remainingIndexedVideosCount: remainingIndexed,
      })

      if (!decision.safe) {
        skippedFolders.push({ cid, name: folderName, deleted: false, reason: decision.reason })
        checkedFolders += 1
        emitProgress('folders', totalFolders)
        continue
      }

      if (!grandParentCid) {
        skippedFolders.push({ cid, name: folderName, deleted: false, reason: '无法获取上级目录ID' })
        checkedFolders += 1
        emitProgress('folders', totalFolders)
        continue
      }

      const folderDeleteRes = await api.deleteFiles(buildDeletePayload([cid], grandParentCid))
      if (folderDeleteRes.state)
        deletedFolders.push({ cid, name: folderName, deleted: true, reason: decision.reason })
      else
        skippedFolders.push({ cid, name: folderName, deleted: false, reason: '删除父目录请求失败' })
    }
    catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      skippedFolders.push({ cid, deleted: false, reason: '检查或删除父目录时发生异常' })
    }

    checkedFolders += 1
    emitProgress('folders', totalFolders)
  }

  return {
    deletedFileIds,
    failedFileIds,
    deletedFolders,
    skippedFolders,
    ...(aborted ? { aborted: true } : {}),
    ...(lastError ? { lastError } : {}),
  }
}
