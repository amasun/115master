import type { AppDialogService } from '@/app/dialog'
import type { CustomLibrarySection, CustomScrapeMode, IndexRootFolder } from '@/utils/userSettings'
import { ref } from 'vue'
import { appDialog } from '@/app/dialog'
import { normalizeIndexRootFolders } from '@/utils/userSettings'
import CustomSectionDialogContent from './CustomSectionDialogContent.vue'

export interface OpenCustomSectionDialogOptions {
  initialSection?: CustomLibrarySection
  dialog?: AppDialogService
}

/** 打开「新建 / 编辑自建侧边栏目」弹窗 */
export async function openCustomSectionDialog(
  options: OpenCustomSectionDialogOptions = {},
): Promise<CustomLibrarySection | null> {
  const dialog = options.dialog ?? appDialog
  const initial = options.initialSection
  const name = ref(initial?.name ?? '')
  const scrapeMode = ref<CustomScrapeMode>(initial?.scrapeMode ?? 'folder_collection')
  const folders = ref<IndexRootFolder[]>(normalizeIndexRootFolders(initial?.folders ?? []))

  return new Promise((resolve, reject) => {
    let confirmedSection: CustomLibrarySection | null = null
    const instance = dialog.create({
      title: initial ? `编辑栏目：${initial.name}` : '新建侧边栏目',
      size: 'lg',
      closeOnBackdrop: true,
      confirmText: initial ? '保存' : '创建栏目',
      cancelText: '取消',
      content: () => (
        <CustomSectionDialogContent
          name={name.value}
          scrapeMode={scrapeMode.value}
          folders={folders.value}
          onUpdate:name={(val: string) => {
            name.value = val
          }}
          onUpdate:scrapeMode={(val: CustomScrapeMode) => {
            scrapeMode.value = val
          }}
          onUpdate:folders={(val: IndexRootFolder[]) => {
            folders.value = val
          }}
        />
      ),
      onConfirm: () => {
        const trimmedName = name.value.trim()
        const normalizedFolders = normalizeIndexRootFolders(folders.value)
        if (!trimmedName) {
          void dialog.alert({ title: '提示', content: '请输入栏目名称' })
          return false
        }
        if (normalizedFolders.length === 0) {
          void dialog.alert({ title: '提示', content: '请至少选择一个 115 目录' })
          return false
        }
        confirmedSection = {
          id: initial?.id ?? `sec_${Date.now().toString(36)}`,
          name: trimmedName,
          scrapeMode: scrapeMode.value,
          folders: normalizedFolders.map(folder => ({
            ...folder,
            category: scrapeMode.value === 'cinema' ? 'cinema' : 'jav',
          })),
          createdAt: initial?.createdAt ?? Date.now(),
        }
      },
    })

    void instance.closed.then((outcome) => {
      if (outcome.reason === 'confirm')
        resolve(confirmedSection)
      else
        resolve(null)
    }, reject)
  })
}
