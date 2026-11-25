import type { AppDialogService } from '@/app/dialog'
import type { IndexRootCategory, IndexRootFolder } from '@/utils/userSettings'
import { ref } from 'vue'
import { appDialog } from '@/app/dialog'
import { normalizeIndexRootFolders, userSettings } from '@/utils/userSettings'
import IndexFolderPickerContent from './IndexFolderPickerContent.vue'

export interface OpenIndexFolderPickerOptions {
  title?: string
  description?: string
  initialFolders?: ReadonlyArray<IndexRootFolder>
  fixedCategory?: IndexRootCategory
  confirmText?: string
  cancelText?: string
  dialog?: AppDialogService
}

/** 打开多选 115 索引/刮削目录弹窗；取消返回 null，确认返回规范化目录列表（空数组表示全盘） */
export async function openIndexFolderPicker(
  options: OpenIndexFolderPickerOptions = {},
): Promise<IndexRootFolder[] | null> {
  const dialog = options.dialog ?? appDialog
  const selected = ref<IndexRootFolder[]>(
    normalizeIndexRootFolders(options.initialFolders ?? userSettings.value.indexRootFolders),
  )

  return new Promise((resolve, reject) => {
    let confirmedValue: IndexRootFolder[] | null = null
    const instance = dialog.create({
      title: options.title ?? '选择索引与刮削目录（可多选）',
      size: 'lg',
      closeOnBackdrop: true,
      confirmText: options.confirmText ?? '确定',
      cancelText: options.cancelText ?? '取消',
      content: () => (
        <IndexFolderPickerContent
          modelValue={selected.value}
          description={options.description}
          fixedCategory={options.fixedCategory}
          onUpdate:modelValue={(next: IndexRootFolder[]) => {
            selected.value = next
          }}
        />
      ),
      onConfirm: () => {
        confirmedValue = normalizeIndexRootFolders(selected.value)
      },
    })

    void instance.closed.then((outcome) => {
      if (outcome.reason === 'confirm')
        resolve(confirmedValue ?? normalizeIndexRootFolders(selected.value))
      else
        resolve(null)
    }, reject)
  })
}
