import type { Share } from '@115master/drive115'
import type { ActionMenuGroup } from '@115master/ui'
import type { IndexedVideoLabel, LibraryFileItem } from '@/utils/mediaIndex'
import { h, ref } from 'vue'
import { useAppDialog } from '@/app/dialog'
import { useToast } from '@/components'
import { useEd2kAction } from '@/hooks/useDriveAction/useEd2kAction'
import { useFileAction } from '@/hooks/useDriveAction/useFileAction'
import { useMoveAction } from '@/hooks/useDriveAction/useMoveAction'
import { useTagAction } from '@/hooks/useDriveAction/useTagAction'
import { I } from '@/icons'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { useTagStore } from '@/store/tagList'
import { actionIcon } from '@/utils/action'
import { safeDeleteFiles } from '@/utils/mediaIndex'
import { buildNativeFolderUrl } from '@/utils/userSettings'

/** 将影视库文件项映射为 useDriveAction 兼容的最小文件结构 */
function toDriveFileItem(file: LibraryFileItem): Share.Entity.FileItem {
  return {
    fc: 1,
    fid: file.fid,
    cid: file.cid,
    pc: file.pickCode,
    n: file.name,
    s: file.size,
    sha1: file.sha1 ?? '',
    iv: 1,
    m: file.starred ? 1 : 0,
    fl: (file.labels ?? []).map(label => ({
      id: label.id,
      name: label.name,
      color: label.color ?? '',
      sort: '',
      is_default: 0,
      update_time: '',
      create_time: '',
    })),
  } as unknown as Share.Entity.FileItem
}

/** 在新标签页打开原生 115 对应目录 */
export function openNativeFolder(cid: string) {
  const url = buildNativeFolderUrl(cid)
  window.open(url, '_blank', 'noopener,noreferrer')
}

export interface LibraryFileActionHooks {
  onDeleted?: (file: LibraryFileItem) => void
  onRenamed?: (file: LibraryFileItem, nextName: string) => void
}

/** 影视库单文件管理操作（星标、打标签、ED2K、重命名、移动、删除、打开原生目录） */
export function useLibraryFileActions() {
  const store = useMediaLibraryStore()
  const tagStore = useTagStore()
  const dialog = useAppDialog()
  const toast = useToast()
  const fileAction = useFileAction()
  const tagAction = useTagAction()
  const ed2kAction = useEd2kAction()
  const moveAction = useMoveAction()

  async function toggleStar(file: LibraryFileItem): Promise<boolean> {
    const ok = await fileAction.starBatch([toDriveFileItem(file)])
    if (!ok)
      return false
    const next = !file.starred
    await store.applyFileStar(file.fid, next)
    toast.success(next ? '已星标收藏' : '已取消星标')
    return true
  }

  async function editTags(file: LibraryFileItem): Promise<void> {
    await tagAction.tagBatch([toDriveFileItem(file)], {
      onApplied: async (applied) => {
        const change = applied.find(item => item.fileId === file.fid)
        if (!change)
          return
        const labels: IndexedVideoLabel[] = change.labelIds.map((id) => {
          const found = tagStore.tags.find(tag => tag.id === id)
          return {
            id,
            name: found?.name ?? id,
            ...(found?.color ? { color: found.color } : {}),
          }
        })
        await store.applyFileLabels(file.fid, labels)
      },
    })
  }

  async function generateEd2k(file: LibraryFileItem): Promise<void> {
    await ed2kAction.ed2k(toDriveFileItem(file))
  }

  async function renameFile(file: LibraryFileItem, hooks?: LibraryFileActionHooks): Promise<boolean> {
    const nextName = await fileAction.renameItem(toDriveFileItem(file))
    if (!nextName)
      return false
    await store.applyFileRename(file.fid, nextName)
    toast.success('已重命名')
    hooks?.onRenamed?.(file, nextName)
    return true
  }

  async function moveFile(file: LibraryFileItem): Promise<boolean> {
    const res = await moveAction.moveBatch(file.cid || '0', [toDriveFileItem(file)])
    if (!res.success)
      return false
    await store.applyFileMove(file.fid, res.pid)
    toast.success('已移动到目标目录')
    return true
  }

  async function deleteFile(file: LibraryFileItem, hooks?: LibraryFileActionHooks): Promise<boolean> {
    const deleteEmptyParent = ref(false)
    const confirmed = await dialog.confirm({
      title: '删除文件',
      confirmText: '移入回收站',
      cancelText: '取消',
      content: () => h('div', { class: 'flex flex-col gap-3 py-1 text-sm' }, [
        h('p', { class: 'text-base-content/85 leading-relaxed' }, [
          '确定将 ',
          h('strong', { class: 'text-base-content font-semibold break-all' }, file.name),
          ' 移入 115 回收站吗？',
        ]),
        h('label', { class: 'flex cursor-pointer items-start gap-2 rounded-xl bg-base-200/70 px-3 py-2 text-xs text-base-content/80' }, [
          h('input', {
            type: 'checkbox',
            class: 'checkbox checkbox-xs border-white/25 checked:border-zinc-200 checked:bg-zinc-200 checked:text-zinc-950 mt-0.5',
            checked: deleteEmptyParent.value,
            onChange: (event: Event) => {
              deleteEmptyParent.value = (event.target as HTMLInputElement).checked
            },
          }),
          h('span', { class: 'leading-relaxed' }, '若父级目录内无其他作品与子目录，同时移入回收站（自动跳过根目录、云下载等受保护目录）'),
        ]),
      ]),
    })
    if (!confirmed)
      return false

    const result = await safeDeleteFiles([file], {
      deleteEmptyParent: deleteEmptyParent.value,
      allIndexedVideos: store.videos,
    })

    if (result.deletedFileIds.length === 0) {
      toast.error('删除文件失败，请稍后重试')
      return false
    }

    await store.applyFilesDelete(result.deletedFileIds)

    if (result.deletedFolders.length > 0)
      toast.success('已移入回收站，并安全清理空/独立父目录')
    else if (deleteEmptyParent.value && result.skippedFolders.length > 0)
      toast.info(`已删除文件；父目录未删除（${result.skippedFolders[0].reason}）`)
    else
      toast.success('已移入回收站')

    hooks?.onDeleted?.(file)
    return true
  }

  /** 生成单文件操作菜单分组（供详情页下拉与卡片右键复用） */
  function buildFileMenuGroups(
    getFile: () => LibraryFileItem | undefined,
    options?: {
      onPlay?: (file: LibraryFileItem) => void
      onOpenDetail?: () => void
      onChangeCover?: () => void
      hooks?: LibraryFileActionHooks
    },
  ): ActionMenuGroup[] {
    const groups: ActionMenuGroup[] = []

    if (options?.onPlay || options?.onOpenDetail || options?.onChangeCover) {
      groups.push([
        ...(options.onPlay
          ? [{
              id: 'play',
              label: 'MASTER 播放',
              leading: actionIcon(I.PLAY),
              onSelect: () => {
                const file = getFile()
                if (file)
                  options.onPlay?.(file)
              },
            }]
          : []),
        ...(options.onOpenDetail
          ? [{
              id: 'detail',
              label: '查看详情',
              leading: actionIcon(I.DOCUMENT),
              onSelect: () => options.onOpenDetail?.(),
            }]
          : []),
        ...(options.onChangeCover
          ? [{
              id: 'change-cover',
              label: '更换封面',
              leading: actionIcon(I.RENAME),
              onSelect: () => options.onChangeCover?.(),
            }]
          : []),
      ])
    }

    groups.push([
      {
        id: 'star',
        label: () => getFile()?.starred ? '取消星标' : '星标收藏',
        leading: actionIcon(() => getFile()?.starred ? I.STAR_FILL : I.STAR),
        tone: () => getFile()?.starred ? 'primary' : 'default',
        onSelect: () => {
          const file = getFile()
          if (file)
            void toggleStar(file)
        },
      },
      {
        id: 'tag',
        label: '打标签',
        leading: actionIcon(I.TAG),
        onSelect: () => {
          const file = getFile()
          if (file)
            void editTags(file)
        },
      },
    ])

    groups.push([
      {
        id: 'open-folder',
        label: '在原生 115 打开目录',
        leading: actionIcon(I.FOLDER_OPEN),
        onSelect: () => {
          const file = getFile()
          if (file)
            openNativeFolder(file.cid)
        },
      },
      {
        id: 'ed2k',
        label: '生成 ED2K 链',
        leading: actionIcon(I.ADD_LINK),
        onSelect: () => {
          const file = getFile()
          if (file)
            void generateEd2k(file)
        },
      },
      {
        id: 'rename',
        label: '重命名',
        leading: actionIcon(I.RENAME),
        onSelect: () => {
          const file = getFile()
          if (file)
            void renameFile(file, options?.hooks)
        },
      },
      {
        id: 'move',
        label: '移动到目录',
        leading: actionIcon(I.MOVE),
        onSelect: () => {
          const file = getFile()
          if (file)
            void moveFile(file)
        },
      },
    ])

    groups.push([
      {
        id: 'delete',
        label: '删除文件',
        leading: actionIcon(I.DELETE),
        tone: 'destructive',
        onSelect: () => {
          const file = getFile()
          if (file)
            void deleteFile(file, options?.hooks)
        },
      },
    ])

    return groups
  }

  return {
    toggleStar,
    editTags,
    generateEd2k,
    renameFile,
    moveFile,
    deleteFile,
    openNativeFolder,
    buildFileMenuGroups,
  }
}
