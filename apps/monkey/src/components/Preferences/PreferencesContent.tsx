import type { PropType } from 'vue'
import type { IconValue } from '@/icons'
import type { IndexRootCategory } from '@/utils/userSettings'
import { GM_info } from '$'
import { format } from '@115master/utils'
import { defineComponent, ref, shallowRef } from 'vue'
import PKG from '@/../package.json'
import { openIndexFolderPicker } from '@/components/IndexFolderPicker'
import ThemeToggle from '@/components/ThemeToggle'
import { useDriveListMode } from '@/hooks/useDriveListMode'
import { I, Icon } from '@/icons'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import {
  downloadCacheArchiveFile,
  exportCacheArchive,
  importInspectedBackup,
  inspectBackupFile,
  pruneOrphanScrapeCache,
} from '@/utils/cacheBackup'
import {
  getIndexFoldersByCategory,
  replaceIndexFoldersForCategory,
  useUserSetting,
} from '@/utils/userSettings'
import AccountPreferences from './AccountPreferences'

/** 分类卡片：无透明实体卡片，层级对比清晰 */
const Card = defineComponent({
  name: 'PreferenceCard',
  props: {
    title: { type: String, required: true },
    hint: { type: String, default: '' },
    icon: { type: String as PropType<IconValue>, required: true },
    className: { type: String, default: '' },
  },
  setup(props, { slots }) {
    return () => (
      <section
        class={[
          'pref-card flex min-w-0 flex-col gap-3 rounded-xl border p-4',
          props.className,
        ]}
        aria-label={props.title}
      >
        <header class="flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <Icon name={props.icon} size="sm" class="pref-text-muted shrink-0" />
            <div class="min-w-0">
              <h3 class="text-base-content truncate text-sm leading-5 font-semibold">{props.title}</h3>
              {props.hint && <p class="pref-text-subtle truncate text-xs leading-4">{props.hint}</p>}
            </div>
          </div>
          {slots.extra?.()}
        </header>
        {slots.default?.()}
      </section>
    )
  },
})

const SettingToggle = defineComponent({
  name: 'SettingToggle',
  props: {
    icon: {
      type: String as PropType<IconValue>,
      required: true,
    },
    label: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    modelValue: {
      type: Boolean,
      required: true,
    },
  },
  emits: {
    'update:modelValue': (_value: boolean) => true,
  },
  setup(props, { emit }) {
    return () => (
      <label class="hover:bg-base-content/[0.06] flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors">
        <div class="flex min-w-0 items-center gap-2.5">
          <Icon
            name={props.icon}
            size="sm"
            class={[
              'shrink-0 transition-colors',
              props.modelValue ? 'text-base-content' : 'pref-text-subtle',
            ]}
          />
          <div class="flex min-w-0 flex-col">
            <span class="text-base-content text-sm leading-5 font-medium">{props.label}</span>
            {props.description && (
              <span class="pref-text-subtle text-xs leading-4">{props.description}</span>
            )}
          </div>
        </div>
        <input
          type="checkbox"
          class="toggle toggle-primary toggle-sm shrink-0"
          checked={props.modelValue}
          onChange={event => emit('update:modelValue', (event.target as HTMLInputElement).checked)}
        />
      </label>
    )
  },
})

/** 宽大 / 紧凑布局极简示意指示 */
function renderLayoutWireframe(compact: boolean, active: boolean) {
  const tone = active ? 'bg-primary/80' : 'bg-base-content/40'
  const muted = active ? 'bg-primary/35' : 'bg-base-content/20'
  const surface = active
    ? 'pref-card border-primary/50'
    : 'pref-card'

  if (!compact) {
    return (
      <div
        aria-hidden="true"
        class={['flex h-7 items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors', surface]}
      >
        <div class={['h-4 w-3.5 shrink-0 rounded-xs', tone]} />
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <div class={['h-1.5 w-3/5 rounded-full', tone]} />
          <div class={['h-1 w-2/5 rounded-full', muted]} />
        </div>
        <div class="flex shrink-0 items-center gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} class={['h-3 w-4 rounded-xs', muted]} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      aria-hidden="true"
      class={['flex h-7 flex-col justify-center gap-1 rounded-lg border px-2.5 py-1.5 transition-colors', surface]}
    >
      {[0, 1].map(row => (
        <div key={row} class="flex w-full items-center gap-1.5">
          <div class={['size-1.5 shrink-0 rounded-xs', row === 0 ? tone : muted]} />
          <div class={['h-1 flex-1 rounded-full', row === 0 ? tone : muted]} />
          <div class={['h-1 w-5 shrink-0 rounded-full', muted]} />
        </div>
      ))}
    </div>
  )
}

const PreferencesContent = defineComponent({
  name: 'PreferencesContent',

  emits: {
    loggedOut: () => true,
  },

  setup(_, { emit }) {
    const mode = useDriveListMode()
    const previewCount = useUserSetting('filelistPreviewCount')
    const compactAvInfo = useUserSetting('compactAvInfo')
    const playerMovieInfo = useUserSetting('enablePlayerMovieInfo')
    const syncMarkersToFileDesc = useUserSetting('syncMarkersToFileDesc')
    const enableFanzaSource = useUserSetting('enableFanzaSource')
    const nativeFolderTarget = useUserSetting('nativeFolderTarget')
    const indexRootFolders = useUserSetting('indexRootFolders')
    const enableCinemaLibrary = useUserSetting('enableCinemaLibrary')
    const tmdbApiKey = useUserSetting('tmdbApiKey')
    const tmdbProxyUrl = useUserSetting('tmdbProxyUrl')
    const backupBusy = shallowRef(false)
    const exportIncludeCustomMedia = shallowRef(true)
    const exportIncludePosterThumbs = shallowRef(false)
    const backupStatus = shallowRef<{ kind: 'success' | 'error' | 'info', text: string } | null>(null)
    const backupFileInputRef = ref<HTMLInputElement | null>(null)

    const triggerLibraryResync = () => {
      try {
        void useMediaLibraryStore().syncIndex('full')
      }
      catch {
        // 非 Pinia 挂载上下文中忽略即时同步
      }
    }

    const handlePickCategoryFolders = async (category: IndexRootCategory) => {
      const current = getIndexFoldersByCategory(indexRootFolders.value, category)
      const picked = await openIndexFolderPicker({
        title: category === 'cinema' ? '选择院线影视目录（可多选）' : '选择 AV / 番号影视目录（可多选）',
        description: category === 'cinema'
          ? '选中的目录将归类为「院线影视」，使用 TMDB / 豆瓣刮削电影与剧集。'
          : '选中的目录将作为「全部作品」AV 扫描范围；不选时默认扫描全盘。',
        initialFolders: current,
        fixedCategory: category,
      })
      if (picked === null)
        return
      indexRootFolders.value = replaceIndexFoldersForCategory(indexRootFolders.value, category, picked)
      triggerLibraryResync()
    }

    const handleRemoveCategoryFolder = (category: IndexRootCategory, cid: string) => {
      const next = getIndexFoldersByCategory(indexRootFolders.value, category).filter(item => item.cid !== cid)
      indexRootFolders.value = replaceIndexFoldersForCategory(indexRootFolders.value, category, next)
      triggerLibraryResync()
    }

    const handleResetCategoryFolders = (category: IndexRootCategory) => {
      indexRootFolders.value = replaceIndexFoldersForCategory(indexRootFolders.value, category, [])
      triggerLibraryResync()
    }

    const handleExportBackup = async () => {
      if (backupBusy.value)
        return
      backupBusy.value = true
      backupStatus.value = { kind: 'info', text: '正在准备导出数据…' }
      try {
        const { blob, filename, sizeBytes, stats } = await exportCacheArchive({
          includeCustomMedia: exportIncludeCustomMedia.value,
          includePosterThumbs: exportIncludePosterThumbs.value,
          onProgress: (text) => {
            backupStatus.value = { kind: 'info', text }
          },
        })
        downloadCacheArchiveFile(blob, filename)
        const mediaParts: string[] = []
        if (stats.customCoverCount > 0 || stats.customAvatarCount > 0)
          mediaParts.push(`自定义媒体 ${stats.customCoverCount + stats.customAvatarCount}`)
        if (stats.posterThumbCount > 0)
          mediaParts.push(`缩略图 ${stats.posterThumbCount}`)
        const mediaSuffix = mediaParts.length > 0 ? ` · ${mediaParts.join(' · ')}` : ''
        backupStatus.value = {
          kind: 'success',
          text: `已导出 ${filename}：视频 ${stats.videoCount} · JAV ${stats.javMetaCount} · 院线 ${stats.cinemaMetaCount} · 目录 ${stats.folderPathCount}${mediaSuffix} (${format.fileSize(sizeBytes)})`,
        }
      }
      catch (error) {
        backupStatus.value = {
          kind: 'error',
          text: `导出失败：${error instanceof Error ? error.message : '未知错误'}`,
        }
      }
      finally {
        backupBusy.value = false
      }
    }

    const handleImportBackup = async (event: Event) => {
      const input = event.target as HTMLInputElement
      const file = input.files?.[0]
      input.value = ''
      if (!file || backupBusy.value)
        return

      backupBusy.value = true
      backupStatus.value = { kind: 'info', text: '正在解析备份文件…' }
      try {
        const inspected = await inspectBackupFile(file)
        const preview = inspected.stats
        const mediaLines = inspected.format === 'archive'
          ? `、自定义封面 ${preview.customCoverCount} 张、自定义头像 ${preview.customAvatarCount} 个、海报缩略图 ${preview.posterThumbCount} 张`
          : ''
        const confirmed = window.confirm(
          `确认将备份数据合并导入当前设备吗？\n\n包含：视频索引 ${preview.videoCount} 条、JAV 刮削 ${preview.javMetaCount} 条、院线刮削 ${preview.cinemaMetaCount} 条、未命中记录 ${preview.scrapeMissCount} 条、演员资料 ${preview.actorProfileCount} 条、播放打点 ${preview.markerDocCount} 个、目录缓存 ${preview.folderPathCount} 条${mediaLines}。\n（将保留较新记录，不会清空现有数据）`,
        )
        if (!confirmed) {
          backupStatus.value = null
          return
        }

        const stats = await importInspectedBackup(inspected, {
          mode: 'merge',
          onProgress: (text) => {
            backupStatus.value = { kind: 'info', text }
          },
        })
        try {
          await useMediaLibraryStore().reloadFromCache()
        }
        catch {
          // 非 Pinia 挂载上下文中忽略即时 store 刷新
        }
        const importedMediaSuffix = (stats.customCoverCount + stats.customAvatarCount + stats.posterThumbCount) > 0
          ? ` · 图片 ${stats.customCoverCount + stats.customAvatarCount + stats.posterThumbCount}`
          : ''
        backupStatus.value = {
          kind: 'success',
          text: `导入完成：视频 ${stats.videoCount} · JAV ${stats.javMetaCount} · 院线 ${stats.cinemaMetaCount} · 打点 ${stats.markerDocCount} · 目录 ${stats.folderPathCount}${importedMediaSuffix}`,
        }
      }
      catch (error) {
        backupStatus.value = {
          kind: 'error',
          text: `导入失败：${error instanceof Error ? error.message : '文件解析失败'}`,
        }
      }
      finally {
        backupBusy.value = false
      }
    }

    const handlePruneOrphanCache = async () => {
      if (backupBusy.value)
        return
      const confirmed = window.confirm(
        '将根据当前本地视频索引，清理已删除影片残留的孤立刮削元数据与缩略图缓存（不会影响现有网盘影片）。是否继续？',
      )
      if (!confirmed)
        return

      backupBusy.value = true
      backupStatus.value = { kind: 'info', text: '正在扫描孤立刮削缓存…' }
      try {
        const result = await pruneOrphanScrapeCache((text) => {
          backupStatus.value = { kind: 'info', text }
        })
        if (result.totalRemoved > 0) {
          try {
            await useMediaLibraryStore().reloadFromCache()
          }
          catch {
            // 非 Pinia 挂载上下文中忽略即时 store 刷新
          }
          backupStatus.value = {
            kind: 'success',
            text: `已清理孤立缓存 ${result.totalRemoved} 条（JAV ${result.removedJavMeta} · 院线 ${result.removedCinemaMeta} · 未命中 ${result.removedScrapeMisses} · 缩略图 ${result.removedPosterThumbs}，约释放 ${format.fileSize(result.freedBytes)}）`,
          }
        }
        else {
          backupStatus.value = {
            kind: 'info',
            text: '未发现孤立缓存，无需清理',
          }
        }
      }
      catch (error) {
        backupStatus.value = {
          kind: 'error',
          text: `清理失败：${error instanceof Error ? error.message : '未知错误'}`,
        }
      }
      finally {
        backupBusy.value = false
      }
    }

    const layoutOption = (compact: boolean, label: string, text: string) => {
      const active = compactAvInfo.value === compact
      return (
        <label
          class={[
            'flex cursor-pointer flex-col gap-1.5 rounded-lg border p-2.5 transition-colors',
            active
              ? 'pref-surface-2 border-primary ring-primary/35 ring-1'
              : 'pref-surface-2-interactive',
          ]}
        >
          {renderLayoutWireframe(compact, active)}
          <div class="flex items-start justify-between gap-2 px-0.5">
            <div class="flex min-w-0 flex-col">
              <span class="text-base-content text-xs leading-4 font-semibold">{label}</span>
              <span class="pref-text-subtle mt-0.5 text-[11px] leading-4">{text}</span>
            </div>
            <input
              type="radio"
              name="layout-mode"
              class="radio radio-primary radio-xs mt-0.5 shrink-0"
              checked={active}
              onChange={() => compactAvInfo.value = compact}
            />
          </div>
        </label>
      )
    }

    const aboutLink = (href: string, icon: IconValue, label: string) => (
      <a
        class="pref-surface-2-interactive text-base-content flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors"
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        <Icon name={icon} size="sm" class="pref-text-muted shrink-0" />
        <span class="truncate">{label}</span>
      </a>
    )

    return () => (
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
        {/* 左栏：账号 · 显示与列表 · 功能增强 */}
        <div class="flex min-w-0 flex-col gap-4">
          <Card title="账号" icon={I.ACCOUNT}>
            <AccountPreferences onLoggedOut={() => emit('loggedOut')} />
          </Card>

          <Card title="显示与列表" hint="主题外观、资料卡密度与文件列表行为" icon={I.GRID}>
            <div class="flex flex-col gap-3">
              <ThemeToggle />

              <div class="pref-divider border-t pt-3">
                <div class="grid grid-cols-2 gap-2">
                  {layoutOption(false, '宽大布局', '大封面与完整资料')}
                  {layoutOption(true, '紧凑布局', '小封面一屏更多')}
                </div>
              </div>

              <div class="pref-divider grid grid-cols-2 gap-2.5 border-t pt-3">
                <label class="flex flex-col gap-1" for="drive-list-load-mode">
                  <span class="pref-text-muted text-xs font-medium">列表加载方式</span>
                  <select
                    id="drive-list-load-mode"
                    aria-label="文件列表加载方式"
                    class="select select-bordered select-xs pref-input-2 w-full rounded-lg"
                    value={mode.value}
                    onChange={event => mode.value = (event.target as HTMLSelectElement).value as typeof mode.value}
                  >
                    <option value="pagination">分页加载</option>
                    <option value="infinite">滚动无限加载</option>
                  </select>
                </label>

                <label class="flex flex-col gap-1" for="native-folder-target">
                  <span class="pref-text-muted text-xs font-medium">默认 115 界面版本</span>
                  <select
                    id="native-folder-target"
                    aria-label="默认 115 界面版本"
                    class="select select-bordered select-xs pref-input-2 w-full rounded-lg"
                    value={nativeFolderTarget.value}
                    onChange={event => nativeFolderTarget.value = (event.target as HTMLSelectElement).value as typeof nativeFolderTarget.value}
                  >
                    <option value="new">新版 UI（默认）</option>
                    <option value="legacy">旧版 UI</option>
                  </select>
                </label>
              </div>
            </div>
          </Card>

          <Card title="功能增强" hint="各功能可单独开关，立即生效" icon={I.EXTENSION}>
            <div class="-mx-1 flex flex-col divide-y divide-[var(--pref-border-subtle)]">
              <label
                class="hover:bg-base-content/[0.06] flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors"
                for="filelist-preview-count"
              >
                <div class="flex min-w-0 items-center gap-2.5">
                  <Icon name={I.FILE_VIDEO} size="sm" class="text-base-content shrink-0" />
                  <div class="flex min-w-0 flex-col">
                    <span class="text-base-content text-sm leading-5 font-medium">视频截图张数</span>
                    <span class="pref-text-subtle text-xs leading-4">时间轴预览与详情页分段截图数量</span>
                  </div>
                </div>
                <select
                  id="filelist-preview-count"
                  class="select select-bordered select-xs pref-input-2 w-20 shrink-0 rounded-md"
                  value={previewCount.value}
                  onChange={event => previewCount.value = Number((event.target as HTMLSelectElement).value)}
                >
                  {[4, 5, 6, 8].map(n => <option key={n} value={n}>{`${n} 张`}</option>)}
                </select>
              </label>

              <SettingToggle
                icon={I.PLAY}
                label="播放页影片详情"
                description="在播放器页面显示影片介绍与侧边信息"
                modelValue={playerMovieInfo.value}
                onUpdate:modelValue={value => playerMovieInfo.value = value}
              />
              <SettingToggle
                icon={I.MARKER}
                label="打点同步到 115 文件备注"
                description="自动将播放打点写入文件原生备注，换设备打开即可恢复"
                modelValue={syncMarkersToFileDesc.value}
                onUpdate:modelValue={value => syncMarkersToFileDesc.value = value}
              />
              <SettingToggle
                icon={I.DOCUMENT}
                label="启用 FANZA / DMM 官方源"
                description="需日本 IP；开启后优先从 FANZA 获取高清封面与官方元数据"
                modelValue={enableFanzaSource.value}
                onUpdate:modelValue={value => enableFanzaSource.value = value}
              />
            </div>
          </Card>
        </div>

        {/* 右栏：索引与刮削目录 · 缓存与数据同步 · 关于 */}
        <div class="flex min-w-0 flex-col gap-4">
          <Card title="索引与刮削目录" hint="分别配置 AV 与院线影视目录，修改后自动重扫" icon={I.FOLDER_OPEN}>
            <div class="flex flex-col gap-3">
              {/* AV / 番号影视目录 */}
              <div class="pref-surface-2 flex flex-col gap-2 rounded-lg border p-3">
                <div class="flex items-center justify-between gap-2 text-xs">
                  <span class="text-base-content font-medium">AV / 番号影视目录</span>
                  <span class="pref-text-subtle text-[11px] tabular-nums">
                    {getIndexFoldersByCategory(indexRootFolders.value, 'jav').length > 0
                      ? `已选 ${getIndexFoldersByCategory(indexRootFolders.value, 'jav').length} 个`
                      : '全盘扫描'}
                  </span>
                </div>
                {getIndexFoldersByCategory(indexRootFolders.value, 'jav').length > 0
                  ? (
                      <div class="flex flex-wrap gap-1.5">
                        {getIndexFoldersByCategory(indexRootFolders.value, 'jav').map(folder => (
                          <span
                            key={folder.cid}
                            class="pref-surface-3 text-base-content inline-flex h-auto max-w-full items-center gap-1 rounded-md border py-0.5 pr-1 pl-2 text-[11px]"
                            title={folder.path}
                          >
                            <span class="max-w-32 truncate">{folder.name}</span>
                            <button
                              type="button"
                              class="pref-text-subtle hover:text-base-content rounded-sm p-0.5"
                              aria-label={`移除 ${folder.name}`}
                              onClick={() => handleRemoveCategoryFolder('jav', folder.cid)}
                            >
                              <Icon name={I.CLOSE} size="xs" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )
                  : (
                      <p class="pref-text-subtle text-[11px]">
                        未指定目录时默认扫描全盘（仅归入「全部作品」）。
                      </p>
                    )}
                <div class="flex gap-2 pt-0.5">
                  <button
                    type="button"
                    class="btn btn-xs pref-surface-3-interactive text-base-content flex-1 gap-1.5 rounded-lg border font-medium shadow-none"
                    onClick={() => handlePickCategoryFolders('jav')}
                  >
                    <Icon name={I.FOLDER_OPEN} size="xs" />
                    <span>选择 AV 目录</span>
                  </button>
                  {getIndexFoldersByCategory(indexRootFolders.value, 'jav').length > 0 && (
                    <button
                      type="button"
                      class="btn btn-xs btn-ghost pref-text-muted rounded-lg"
                      onClick={() => handleResetCategoryFolders('jav')}
                    >
                      恢复全盘
                    </button>
                  )}
                </div>
              </div>

              {/* 启用院线影视栏目开关 */}
              <SettingToggle
                icon={I.FILE_VIDEO}
                label="启用院线影视栏目"
                description="开启后在侧边栏显示「院线影视」，支持 TMDB / 豆瓣刮削"
                modelValue={enableCinemaLibrary.value}
                onUpdate:modelValue={(value) => {
                  enableCinemaLibrary.value = value
                  triggerLibraryResync()
                }}
              />

              {/* 院线影视目录（开启后展示） */}
              {enableCinemaLibrary.value && (
                <div class="pref-surface-2 flex flex-col gap-2 rounded-lg border p-3">
                  <div class="flex items-center justify-between gap-2 text-xs">
                    <span class="text-base-content font-medium">院线影视目录</span>
                    <span class="pref-text-subtle text-[11px] tabular-nums">
                      {getIndexFoldersByCategory(indexRootFolders.value, 'cinema').length > 0
                        ? `已选 ${getIndexFoldersByCategory(indexRootFolders.value, 'cinema').length} 个`
                        : '未配置'}
                    </span>
                  </div>
                  {getIndexFoldersByCategory(indexRootFolders.value, 'cinema').length > 0
                    ? (
                        <div class="flex flex-wrap gap-1.5">
                          {getIndexFoldersByCategory(indexRootFolders.value, 'cinema').map(folder => (
                            <span
                              key={folder.cid}
                              class="pref-surface-3 text-base-content inline-flex h-auto max-w-full items-center gap-1 rounded-md border py-0.5 pr-1 pl-2 text-[11px]"
                              title={folder.path}
                            >
                              <span class="max-w-32 truncate">{folder.name}</span>
                              <button
                                type="button"
                                class="pref-text-subtle hover:text-base-content rounded-sm p-0.5"
                                aria-label={`移除 ${folder.name}`}
                                onClick={() => handleRemoveCategoryFolder('cinema', folder.cid)}
                              >
                                <Icon name={I.CLOSE} size="xs" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )
                    : (
                        <p class="pref-text-subtle text-[11px]">
                          请选择存放电影或剧集的 115 目录，避免与 AV 混在一起。
                        </p>
                      )}
                  <div class="flex gap-2 pt-0.5">
                    <button
                      type="button"
                      class="btn btn-xs pref-surface-3-interactive text-base-content flex-1 gap-1.5 rounded-lg border font-medium shadow-none"
                      onClick={() => handlePickCategoryFolders('cinema')}
                    >
                      <Icon name={I.FOLDER_OPEN} size="xs" />
                      <span>选择院线目录</span>
                    </button>
                    {getIndexFoldersByCategory(indexRootFolders.value, 'cinema').length > 0 && (
                      <button
                        type="button"
                        class="btn btn-xs btn-ghost pref-text-muted rounded-lg"
                        onClick={() => handleResetCategoryFolders('cinema')}
                      >
                        清空
                      </button>
                    )}
                  </div>
                  <label class="flex flex-col gap-1 pt-1" for="tmdb-api-key-input">
                    <div class="flex items-center justify-between gap-2 text-xs">
                      <span class="pref-text-muted font-medium">TMDB API Key（可选）</span>
                      <span class="pref-text-subtle text-[11px]">留空走豆瓣免 Key 兜底</span>
                    </div>
                    <input
                      id="tmdb-api-key-input"
                      type="password"
                      autocomplete="off"
                      placeholder="支持 v3 API Key 或 v4 Read Token"
                      class="input input-bordered input-xs pref-input-3 w-full rounded-lg font-mono"
                      value={tmdbApiKey.value}
                      onInput={event => tmdbApiKey.value = (event.target as HTMLInputElement).value.trim()}
                    />
                  </label>
                  <label class="flex flex-col gap-1 pt-1" for="tmdb-proxy-url-input">
                    <div class="flex items-center justify-between gap-2 text-xs">
                      <span class="pref-text-muted font-medium">TMDB 反代地址（可选）</span>
                      <span class="pref-text-subtle text-[11px]">留空直连官方接口</span>
                    </div>
                    <input
                      id="tmdb-proxy-url-input"
                      type="url"
                      autocomplete="off"
                      placeholder="可选，如 https://tmdb-proxy.example.com（留空直连）"
                      class="input input-bordered input-xs pref-input-3 w-full rounded-lg font-mono"
                      value={tmdbProxyUrl.value}
                      onInput={event => tmdbProxyUrl.value = (event.target as HTMLInputElement).value.trim()}
                    />
                  </label>
                </div>
              )}
            </div>
          </Card>

          <Card title="缓存与数据同步" hint="单文件 .115bak 跨设备迁移（兼容旧 .json）" icon={I.SORT_DATABASE}>
            <input
              ref={backupFileInputRef}
              type="file"
              accept=".115bak,.json,application/json"
              class="hidden"
              onChange={handleImportBackup}
            />
            <div class="flex flex-col gap-1.5 text-xs">
              <label class="text-base-content/90 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  class="checkbox checkbox-xs checkbox-primary"
                  checked={exportIncludeCustomMedia.value}
                  onChange={event => exportIncludeCustomMedia.value = (event.target as HTMLInputElement).checked}
                />
                <span>包含自定义封面与头像</span>
              </label>
              <label class="text-base-content/90 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  class="checkbox checkbox-xs checkbox-primary"
                  checked={exportIncludePosterThumbs.value}
                  onChange={event => exportIncludePosterThumbs.value = (event.target as HTMLInputElement).checked}
                />
                <span>包含海报墙缩略图缓存（体积较大，新设备秒开海报墙）</span>
              </label>
            </div>
            <div class="flex gap-2 pt-1">
              <button
                type="button"
                class="btn btn-sm btn-primary flex-1 gap-1.5 rounded-lg shadow-none"
                disabled={backupBusy.value}
                onClick={handleExportBackup}
              >
                <Icon name={I.EXPORT} size="sm" />
                <span>{backupBusy.value ? '处理中...' : '导出 .115bak'}</span>
              </button>
              <button
                type="button"
                class="btn btn-sm pref-surface-2-interactive text-base-content flex-1 gap-1.5 rounded-lg border shadow-none"
                disabled={backupBusy.value}
                onClick={() => backupFileInputRef.value?.click()}
              >
                <Icon name={I.IMPORT} size="sm" />
                <span>导入备份</span>
              </button>
            </div>
            <button
              type="button"
              class="btn btn-xs pref-surface-2-interactive text-base-content w-full gap-1.5 rounded-lg border font-medium shadow-none"
              disabled={backupBusy.value}
              onClick={handlePruneOrphanCache}
            >
              <Icon name={I.DELETE} size="xs" />
              <span>清理孤立刮削缓存</span>
            </button>
            {backupStatus.value && (
              <p
                class={[
                  'text-[11px] leading-4',
                  backupStatus.value.kind === 'error'
                    ? 'text-error'
                    : backupStatus.value.kind === 'info'
                      ? 'text-info'
                      : 'text-success',
                ]}
              >
                {backupStatus.value.text}
              </p>
            )}
          </Card>

          <Card
            title="关于"
            hint={GM_info.script.name}
            icon={I.ABOUT}
            v-slots={{
              extra: () => (
                <span class="pref-surface-2 pref-text-muted shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums">
                  {`v${PKG.version}`}
                </span>
              ),
            }}
          >
            <div class="flex gap-2">
              {aboutLink('https://github.com/amasun/115master', I.GITHUB, 'GitHub 仓库')}
              {aboutLink('https://github.com/amasun', I.SPONSOR, '赞助作者')}
            </div>
          </Card>
        </div>
      </div>
    )
  },
})

export default PreferencesContent
