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

export interface SafeDeleteResult {
  deletedFileIds: string[]
  failedFileIds: string[]
  deletedFolders: ParentFolderDecision[]
  skippedFolders: ParentFolderDecision[]
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

/**
 * 安全删除指定文件（移入回收站），并在开启 deleteEmptyParent 时安全清理空父目录
 */
export async function safeDeleteFiles(
  files: SafeDeleteFileInput[],
  options: {
    deleteEmptyParent: boolean
    allIndexedVideos: IndexedVideo[]
    driveApi?: SafeDeleteDriveApi
  },
): Promise<SafeDeleteResult> {
  const api = options.driveApi ?? drive115.file
  const deletedFileIds: string[] = []
  const failedFileIds: string[] = []
  const deletedFolders: ParentFolderDecision[] = []
  const skippedFolders: ParentFolderDecision[] = []

  if (files.length === 0) {
    return { deletedFileIds, failedFileIds, deletedFolders, skippedFolders }
  }

  const byCid = new Map<string, SafeDeleteFileInput[]>()
  for (const file of files) {
    const group = byCid.get(file.cid)
    if (group)
      group.push(file)
    else
      byCid.set(file.cid, [file])
  }

  const affectedCids = new Set<string>()

  for (const [cid, group] of byCid.entries()) {
    const fids = group.map(item => item.fid)
    try {
      const res = await api.deleteFiles(buildDeletePayload(fids, cid))
      if (res.state) {
        deletedFileIds.push(...fids)
        affectedCids.add(cid)
      }
      else {
        failedFileIds.push(...fids)
      }
    }
    catch {
      failedFileIds.push(...fids)
    }
  }

  if (!options.deleteEmptyParent || affectedCids.size === 0) {
    return { deletedFileIds, failedFileIds, deletedFolders, skippedFolders }
  }

  const deletedFidSet = new Set(deletedFileIds)

  for (const cid of affectedCids) {
    if (!cid || cid === '0') {
      skippedFolders.push({ cid, deleted: false, reason: '根目录不可删除' })
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
        continue
      }

      if (!grandParentCid) {
        skippedFolders.push({ cid, name: folderName, deleted: false, reason: '无法获取上级目录ID' })
        continue
      }

      const folderDeleteRes = await api.deleteFiles(buildDeletePayload([cid], grandParentCid))
      if (folderDeleteRes.state)
        deletedFolders.push({ cid, name: folderName, deleted: true, reason: decision.reason })
      else
        skippedFolders.push({ cid, name: folderName, deleted: false, reason: '删除父目录请求失败' })
    }
    catch {
      skippedFolders.push({ cid, deleted: false, reason: '检查或删除父目录时发生异常' })
    }
  }

  return { deletedFileIds, failedFileIds, deletedFolders, skippedFolders }
}
