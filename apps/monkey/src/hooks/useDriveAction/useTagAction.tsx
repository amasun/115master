import type { Share } from '@115master/drive115'
import type { TagPickerState } from '@/components/TagPicker/TagPickerContent'
import type { FileTagChange, FileTagInput } from '@/utils/fileTag'
import { Core } from '@115master/drive115'
import { reactive } from 'vue'
import { useAppDialog } from '@/app/dialog'
import { router } from '@/app/router'
import { useToast } from '@/components'
import TagPickerContent from '@/components/TagPicker/TagPickerContent'
import { useTagStore } from '@/store/tagList'
import { drive115 } from '@/utils/drive115Instance'
import { getFilesItemId } from '@/utils/filesItem'
import { intersectTagIds, resolveFileTagChanges } from '@/utils/fileTag'

/** 单个失败项：文件 id + 归一化错误（保留 action 用于 UI 行为分派） */
interface TagApplyFailure {
  id: string
  error: Core.Drive115Error
}

export interface TagBatchOptions {
  /** 标签写回后回调（至少有一项成功时触发） */
  onApplied?: (applied: FileTagChange[], failedIds: string[]) => Promise<void> | void
}

/**
 * 「打标签」文件操作。
 *
 * 弹窗初始勾选为选中文件标签交集，确认后客户端 diff 出每文件目标标签集，
 * 逐文件全量写回（`setFileLabels`），其余标签保留。批量用 `Promise.allSettled`
 * 聚合；仅失败时 toast 提示。auth 类错误升级 dialog。
 */
export function useTagAction() {
  const dialog = useAppDialog()
  const toast = useToast()
  const tagStore = useTagStore()

  /** 单文件写回；失败抛 `Drive115Error`（经 `handle()` 边界归一，保留 action 分类） */
  async function applyOne(fileId: string, labelIds: string[]) {
    const res = await drive115.tag.setFileLabels(fileId, labelIds)
    if (!res.state)
      throw new Core.Drive115Error(res.message || '打标签失败', Core.Drive115ErrorCode.Unknown)
  }

  /** 并发写回所有变更；返回失败项（成功项已生效） */
  async function applyAll(changes: FileTagChange[]): Promise<TagApplyFailure[]> {
    const results = await Promise.allSettled(
      changes.map(change => applyOne(change.fileId, change.labelIds)),
    )
    return results.flatMap((r, i) =>
      r.status === 'rejected'
        ? [{ id: changes[i]!.fileId, error: Core.toDrive115Error(r.reason) }]
        : [],
    )
  }

  /** UI 行为分派：relogin / verify 升级 dialog，其余 toast */
  async function reportError(e: unknown) {
    const err = Core.toDrive115Error(e)
    if (err.action === 'relogin' || err.action === 'verify') {
      await dialog.alert({ title: '提示', content: err.message })
      return
    }
    toast.error(err.message)
  }

  /** 失败反馈：仅在有失败项时 toast（部分失败含名称 / 全失败），全成功靠 UI 徽章 */
  function reportBatch(failedIds: string[], nameById: Map<string, string>) {
    if (failedIds.length === 0)
      return
    const names = failedIds.map(id => nameById.get(id) ?? id).join('、')
    toast.error(`${failedIds.length} 个文件打标签失败：${names}`)
  }

  /** 结果反馈：auth 类错误升级 dialog 给行动指引；否则仅失败时 toast */
  async function reportResult(failed: TagApplyFailure[], nameById: Map<string, string>) {
    const authError = failed.find(f => f.error.action === 'relogin' || f.error.action === 'verify')
    if (authError) {
      await dialog.alert({ title: '提示', content: authError.error.message })
      return
    }
    reportBatch(failed.map(f => f.id), nameById)
  }

  async function tagBatch(items: Share.Entity.FilesItem[], options?: TagBatchOptions): Promise<void> {
    const files: FileTagInput[] = items.map(item => ({
      id: getFilesItemId(item),
      tagIds: (item.fl ?? []).map(t => t.id),
    }))
    const intersection = intersectTagIds(files)
    const nameById = new Map(items.map(item => [getFilesItemId(item), item.n]))

    // 标签目录：打开时若为空先 load；重置搜索词（dialog 内临时态，不进 URL）
    if (tagStore.tags.length === 0)
      await tagStore.load()
    tagStore.setKeyword('')

    const pickerState = reactive<TagPickerState>({
      checked: new Set(intersection),
      submitting: false,
    })

    /** 应用回调：返回 false 阻止关闭（无变化 / 提交中 / 失败时保留 dialog） */
    async function onConfirm(): Promise<false | void> {
      if (pickerState.submitting)
        return false
      const changes = resolveFileTagChanges(files, pickerState.checked)
      if (changes.length === 0)
        return false
      pickerState.submitting = true
      try {
        const failed = await applyAll(changes)
        const failedIds = failed.map(f => f.id)
        const failedSet = new Set(failedIds)

        await reportResult(failed, nameById)

        const applied = changes.filter(change => !failedSet.has(change.fileId))
        if (applied.length > 0)
          await options?.onApplied?.(applied, failedIds)
      }
      catch (e) {
        await reportError(e)
        return false
      }
      finally {
        pickerState.submitting = false
      }
    }

    dialog.create({
      title: '打标签',
      size: 'lg',
      closeOnBackdrop: true,
      history: true,
      confirmText: '应用',
      cancelText: '取消',
      content: () => (
        <TagPickerContent
          state={pickerState}
          intersection={intersection}
          onGotoTags={() => router.push('/library/tags')}
        />
      ),
      onConfirm,
    })
  }

  return { tagBatch }
}
