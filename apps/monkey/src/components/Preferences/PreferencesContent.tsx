import type { PropType } from 'vue'
import type { IconValue } from '@/icons'
import { GM_info } from '$'
import { format } from '@115master/utils'
import { defineComponent, ref, shallowRef } from 'vue'
import PKG from '@/../package.json'
import ThemeToggle from '@/components/ThemeToggle'
import { useDriveListMode } from '@/hooks/useDriveListMode'
import { I, Icon } from '@/icons'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import {
  downloadCacheBackupFile,
  exportCacheBackup,
  importCacheBackup,
  parseCacheBackup,
  summarizeCacheBackup,
} from '@/utils/cacheBackup'
import { useUserSetting } from '@/utils/userSettings'
import AccountPreferences from './AccountPreferences'

/** 分类卡片：使用 UI Glass 表面与统一间距，支持右上角附属徽章与自定义表面样式 */
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
          'ui-glass-surface flex min-w-0 flex-col gap-2.5 rounded-2xl p-3',
          props.className,
        ]}
        aria-label={props.title}
      >
        <header class="flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2.5">
            <span class="bg-primary/12 text-primary ring-primary/15 flex size-7 shrink-0 items-center justify-center rounded-lg ring-1">
              <Icon name={props.icon} size="sm" />
            </span>
            <div class="min-w-0">
              <h3 class="text-base-content truncate text-sm leading-5 font-semibold">{props.title}</h3>
              {props.hint && <p class="text-base-content/55 truncate text-xs leading-4">{props.hint}</p>}
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
      <label class="hover:bg-base-content/[0.04] flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 transition-colors">
        <div class="flex min-w-0 items-center gap-2.5">
          <span
            class={[
              'flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors',
              props.modelValue
                ? 'bg-primary/12 text-primary'
                : 'bg-base-content/8 text-base-content/45',
            ]}
          >
            <Icon name={props.icon} size="sm" />
          </span>
          <div class="flex min-w-0 flex-col">
            <span class="text-base-content text-sm leading-5 font-medium">{props.label}</span>
            {props.description && (
              <span class="text-base-content/55 text-xs leading-4">{props.description}</span>
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
  const tone = active ? 'bg-primary/40' : 'bg-base-content/22'
  const muted = active ? 'bg-primary/18' : 'bg-base-content/10'
  const surface = active
    ? 'border-primary/25 bg-base-100/80'
    : 'border-base-content/8 bg-base-content/[0.03]'

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
    const preview = useUserSetting('enableFilelistPreview')
    const previewCount = useUserSetting('filelistPreviewCount')
    const avInfo = useUserSetting('enableAvInfo')
    const compactAvInfo = useUserSetting('compactAvInfo')
    const actressFaces = useUserSetting('enableActressFaces')
    const playerMovieInfo = useUserSetting('enablePlayerMovieInfo')
    const syncMarkersToFileDesc = useUserSetting('syncMarkersToFileDesc')
    const nativeFolderTarget = useUserSetting('nativeFolderTarget')
    const backupBusy = shallowRef(false)
    const backupStatus = shallowRef<{ kind: 'success' | 'error', text: string } | null>(null)
    const backupFileInputRef = ref<HTMLInputElement | null>(null)

    const handleExportBackup = async () => {
      if (backupBusy.value)
        return
      backupBusy.value = true
      backupStatus.value = null
      try {
        const { payload, stats } = await exportCacheBackup()
        const { sizeBytes } = downloadCacheBackupFile(payload)
        backupStatus.value = {
          kind: 'success',
          text: `已导出：视频 ${stats.videoCount} · 刮削 ${stats.javMetaCount} · 打点 ${stats.markerDocCount} · 目录 ${stats.folderPathCount} (${format.fileSize(sizeBytes)})`,
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
      backupStatus.value = null
      try {
        const text = await file.text()
        const payload = parseCacheBackup(text)
        const preview = summarizeCacheBackup(payload)
        const confirmed = window.confirm(
          `确认将备份数据合并导入当前设备吗？\n\n包含：视频索引 ${preview.videoCount} 条、刮削资料 ${preview.javMetaCount} 条、演员资料 ${preview.actorProfileCount} 条、播放打点 ${preview.markerDocCount} 个、目录缓存 ${preview.folderPathCount} 条。\n（将保留较新记录，不会清空现有数据）`,
        )
        if (!confirmed)
          return

        const stats = await importCacheBackup(payload, { mode: 'merge' })
        try {
          await useMediaLibraryStore().reloadFromCache()
        }
        catch {
          // 非 Pinia 挂载上下文中忽略即时 store 刷新
        }
        backupStatus.value = {
          kind: 'success',
          text: `导入完成：视频 ${stats.videoCount} · 刮削 ${stats.javMetaCount} · 打点 ${stats.markerDocCount} · 目录 ${stats.folderPathCount}`,
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

    const layoutOption = (compact: boolean, label: string, text: string) => {
      const active = compactAvInfo.value === compact
      return (
        <label
          class={[
            'flex cursor-pointer flex-col gap-1.5 rounded-xl border p-2 transition-all',
            active
              ? 'border-primary bg-primary/[0.08] ring-primary/25 shadow-xs ring-1'
              : 'border-base-content/12 bg-base-100/40 hover:border-base-content/25 hover:bg-base-100/60',
          ]}
        >
          {renderLayoutWireframe(compact, active)}
          <div class="flex items-start justify-between gap-2 px-0.5">
            <div class="flex min-w-0 flex-col">
              <span class="text-base-content text-sm leading-5 font-semibold">{label}</span>
              <span class="text-base-content/60 mt-0.5 text-xs leading-4">{text}</span>
            </div>
            <input
              type="radio"
              name="layout-mode"
              class="radio radio-primary radio-sm mt-0.5 shrink-0"
              checked={active}
              onChange={() => compactAvInfo.value = compact}
            />
          </div>
        </label>
      )
    }

    const aboutLink = (href: string, icon: IconValue, label: string, accent = false) => (
      <a
        class={[
          'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-medium transition-all',
          accent
            ? 'border-primary/20 bg-primary/8 text-primary hover:border-primary/40 hover:bg-primary/14'
            : 'border-base-content/12 bg-base-100/40 text-base-content hover:border-base-content/25 hover:bg-base-content/[0.06]',
        ]}
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        <Icon name={icon} size="sm" class="shrink-0" />
        <span class="truncate">{label}</span>
      </a>
    )

    return () => (
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-stretch">
        <div class="flex min-w-0 flex-col gap-3 sm:col-span-7">
          <Card title="布局模式" hint="番号资料卡片与截图预览的排版密度" icon={I.GRID}>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {layoutOption(false, '宽大布局', '大封面与完整资料，预览图较大。')}
              {layoutOption(true, '紧凑布局', '缩小封面与间距，一屏展示更多。')}
            </div>
          </Card>

          <Card title="功能增强" hint="各功能可单独开关，立即生效" icon={I.EXTENSION} className="flex-1">
            <div class="-mx-1 flex flex-col gap-0.5">
              <SettingToggle
                icon={I.FILE_VIDEO}
                label="视频截图预览"
                description="在视频文件下方显示时间轴截图"
                modelValue={preview.value}
                onUpdate:modelValue={value => preview.value = value}
              />

              <div class="border-base-content/12 ml-5 border-l pl-3">
                <label
                  class={[
                    'bg-base-content/[0.03] flex items-center justify-between gap-3 rounded-xl px-2.5 py-1.5 transition-opacity',
                    preview.value ? 'cursor-pointer opacity-100' : 'cursor-not-allowed opacity-50',
                  ]}
                  for="filelist-preview-count"
                >
                  <div class="flex min-w-0 flex-col">
                    <span class="text-base-content text-xs font-medium">截图张数</span>
                    <span class="text-base-content/55 text-[11px] leading-4">数量越少加载越快</span>
                  </div>
                  <select
                    id="filelist-preview-count"
                    class="select select-bordered select-xs bg-base-100/80 w-22 rounded-lg"
                    value={previewCount.value}
                    disabled={!preview.value}
                    onChange={event => previewCount.value = Number((event.target as HTMLSelectElement).value)}
                  >
                    {[4, 5, 6, 8].map(n => <option key={n} value={n}>{`${n} 张`}</option>)}
                  </select>
                </label>
              </div>

              <SettingToggle
                icon={I.DOCUMENT}
                label="番号作品资料"
                description="识别番号并显示海报、演员、发行日期和评分"
                modelValue={avInfo.value}
                onUpdate:modelValue={value => avInfo.value = value}
              />
              <SettingToggle
                icon={I.ACCOUNT}
                label="演员头像替代文件夹图标"
                description="文件夹识别为演员时，用头像代替文件夹图标"
                modelValue={actressFaces.value}
                onUpdate:modelValue={value => actressFaces.value = value}
              />
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
            </div>
          </Card>
        </div>

        <div class="flex min-w-0 flex-col justify-between gap-3 sm:col-span-5">
          <Card
            title="账号"
            icon={I.ACCOUNT}
            className="from-primary/[0.06] to-secondary/[0.04] bg-gradient-to-br via-transparent"
          >
            <AccountPreferences onLoggedOut={() => emit('loggedOut')} />
          </Card>

          <Card title="外观主题" hint="作用于 Fusion 界面和本窗口" icon={I.THEME_LIGHT}>
            <ThemeToggle />
          </Card>

          <Card title="文件列表" hint="作用于 Fusion 界面的文件列表" icon={I.LIST}>
            <div class="flex flex-col gap-2.5">
              <label class="flex items-center justify-between gap-2.5" for="drive-list-load-mode">
                <span class="text-base-content text-sm font-medium">加载方式</span>
                <select
                  id="drive-list-load-mode"
                  aria-label="文件列表加载方式"
                  class="select select-bordered select-sm bg-base-100/80 w-32 rounded-xl"
                  value={mode.value}
                  onChange={event => mode.value = (event.target as HTMLSelectElement).value as typeof mode.value}
                >
                  <option value="pagination">分页加载</option>
                  <option value="infinite">滚动无限加载</option>
                </select>
              </label>

              <label class="flex items-center justify-between gap-2.5" for="native-folder-target">
                <span class="text-base-content text-sm font-medium">目录跳转</span>
                <select
                  id="native-folder-target"
                  aria-label="原生 115 目录跳转版本"
                  class="select select-bordered select-sm bg-base-100/80 w-32 rounded-xl"
                  value={nativeFolderTarget.value}
                  onChange={event => nativeFolderTarget.value = (event.target as HTMLSelectElement).value as typeof nativeFolderTarget.value}
                >
                  <option value="new">新版 115</option>
                  <option value="legacy">旧版 115</option>
                </select>
              </label>
            </div>
          </Card>

          <Card title="缓存与数据同步" hint="跨设备导出/导入刮削资料、网盘索引与打点" icon={I.SORT_DATABASE}>
            <input
              ref={backupFileInputRef}
              type="file"
              accept=".json,application/json"
              class="hidden"
              onChange={handleImportBackup}
            />
            <div class="flex gap-2">
              <button
                type="button"
                class="btn btn-sm btn-soft btn-primary flex-1 gap-1.5 rounded-xl"
                disabled={backupBusy.value}
                onClick={handleExportBackup}
              >
                <Icon name={I.EXPORT} size="sm" />
                <span>{backupBusy.value ? '处理中...' : '导出备份'}</span>
              </button>
              <button
                type="button"
                class="btn btn-sm btn-soft flex-1 gap-1.5 rounded-xl"
                disabled={backupBusy.value}
                onClick={() => backupFileInputRef.value?.click()}
              >
                <Icon name={I.IMPORT} size="sm" />
                <span>导入备份</span>
              </button>
            </div>
            {backupStatus.value && (
              <p
                class={[
                  'text-[11px] leading-4',
                  backupStatus.value.kind === 'error' ? 'text-error' : 'text-success',
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
                <span class="bg-base-content/8 text-base-content/70 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums">
                  v
                  {PKG.version}
                </span>
              ),
            }}
          >
            <div class="flex gap-2">
              {aboutLink('https://github.com/amasun/115master', I.GITHUB, 'GitHub 仓库')}
              {aboutLink('https://github.com/amasun', I.SPONSOR, '赞助作者', true)}
            </div>
          </Card>
        </div>
      </div>
    )
  },
})

export default PreferencesContent
