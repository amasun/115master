import type { PropType } from 'vue'
import type { IconValue } from '@/icons'
import { GM_info } from '$'
import { defineComponent } from 'vue'
import PKG from '@/../package.json'
import ThemeToggle from '@/components/ThemeToggle'
import { useDriveListMode } from '@/hooks/useDriveListMode'
import { I, Icon } from '@/icons'
import { useUserSetting } from '@/utils/userSettings'
import AccountPreferences from './AccountPreferences'

/** 分类卡片：图标 + 标题 + 说明，保证每个分类一眼可辨 */
const Card = defineComponent({
  name: 'PreferenceCard',
  props: {
    title: { type: String, required: true },
    hint: { type: String, default: '' },
    icon: { type: String as PropType<IconValue>, required: true },
  },
  setup(props, { slots }) {
    return () => (
      <section
        class="border-base-content/10 bg-base-content/[0.03] flex min-w-0 flex-col gap-2.5 rounded-2xl border p-3"
        aria-label={props.title}
      >
        <header class="flex items-center gap-2">
          <span class="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-lg">
            <Icon name={props.icon} size="sm" />
          </span>
          <div class="min-w-0">
            <h3 class="text-base-content text-sm leading-5 font-semibold">{props.title}</h3>
            {props.hint && <p class="text-base-content/55 text-xs leading-4">{props.hint}</p>}
          </div>
        </header>
        {slots.default?.()}
      </section>
    )
  },
})

const SettingToggle = defineComponent({
  name: 'SettingToggle',
  props: {
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
      <label class="hover:bg-base-content/5 flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors">
        <div class="flex flex-col">
          <span class="text-base-content text-sm font-medium">{props.label}</span>
          {props.description && (
            <span class="text-base-content/60 text-xs">{props.description}</span>
          )}
        </div>
        <input
          type="checkbox"
          class="toggle toggle-primary toggle-sm"
          checked={props.modelValue}
          onChange={event => emit('update:modelValue', (event.target as HTMLInputElement).checked)}
        />
      </label>
    )
  },
})

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

    const layout = (compact: boolean, label: string, text: string) => (
      <label
        class={[
          'flex cursor-pointer flex-col gap-1 rounded-xl border-2 px-3 py-2 transition-colors',
          compactAvInfo.value === compact
            ? 'border-primary bg-primary/5'
            : 'border-base-content/15 hover:border-base-content/30',
        ]}
      >
        <span class="flex items-center justify-between">
          <span class="text-base-content text-sm font-semibold">{label}</span>
          <input
            type="radio"
            name="layout-mode"
            class="radio radio-primary radio-sm"
            checked={compactAvInfo.value === compact}
            onChange={() => compactAvInfo.value = compact}
          />
        </span>
        <span class="text-base-content/60 text-xs leading-relaxed">{text}</span>
      </label>
    )

    const link = (href: string, icon: IconValue, label: string) => (
      <a
        class="border-base-content/10 hover:border-primary/40 hover:bg-primary/5 text-base-content flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-sm font-medium transition-colors"
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        <Icon name={icon} size="sm" class="shrink-0" />
        <span class="truncate">{label}</span>
      </a>
    )

    const row = 'hover:bg-base-content/5 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors'

    return () => (
      <div class="flex flex-col gap-2.5 sm:flex-row sm:items-start">
        <div class="flex min-w-0 flex-col gap-2.5 sm:flex-[3]">
          <Card title="布局模式" hint="番号资料卡片与截图预览的排版密度" icon={I.GRID}>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {layout(false, '宽大布局', '大封面、完整介绍与标签，截图预览较大。')}
              {layout(true, '紧凑布局', '缩小封面、间距与截图预览，一屏显示更多文件。')}
            </div>
          </Card>

          <Card title="功能增强" hint="各功能可单独开关，立即生效" icon={I.EXTENSION}>
            <div class="-mx-2 -my-1 flex flex-col">
              <SettingToggle
                label="视频截图预览"
                description="在视频文件下方显示时间轴截图"
                modelValue={preview.value}
                onUpdate:modelValue={value => preview.value = value}
              />
              <label class={row} for="filelist-preview-count">
                <div class="flex flex-col">
                  <span class="text-base-content text-sm font-medium">截图张数</span>
                  <span class="text-base-content/60 text-xs">每个视频显示的预览截图数量，越少加载越快</span>
                </div>
                <select
                  id="filelist-preview-count"
                  class="select select-bordered select-sm w-20"
                  value={previewCount.value}
                  disabled={!preview.value}
                  onChange={event => previewCount.value = Number((event.target as HTMLSelectElement).value)}
                >
                  {[4, 5, 6, 8].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <SettingToggle
                label="番号作品资料"
                description="识别番号并显示海报、演员、发行日期和评分"
                modelValue={avInfo.value}
                onUpdate:modelValue={value => avInfo.value = value}
              />
              <SettingToggle
                label="演员头像替代文件夹图标"
                description="文件夹识别为演员时，用头像代替文件夹图标"
                modelValue={actressFaces.value}
                onUpdate:modelValue={value => actressFaces.value = value}
              />
              <SettingToggle
                label="播放页影片详情"
                description="在播放器页面显示影片介绍与侧边信息"
                modelValue={playerMovieInfo.value}
                onUpdate:modelValue={value => playerMovieInfo.value = value}
              />
            </div>
          </Card>
        </div>

        <div class="flex min-w-0 flex-col gap-2.5 sm:flex-[2]">
          <Card title="账号" icon={I.ACCOUNT}>
            <AccountPreferences onLoggedOut={() => emit('loggedOut')} />
          </Card>

          <Card title="外观主题" hint="作用于 Fusion 界面和本设置窗口" icon={I.THEME_LIGHT}>
            <ThemeToggle />
          </Card>

          <Card title="文件列表" hint="作用于 Fusion 界面的文件列表" icon={I.LIST}>
            <label class="flex items-center justify-between gap-3" for="drive-list-load-mode">
              <span class="text-base-content text-sm font-medium">加载方式</span>
              <select
                id="drive-list-load-mode"
                aria-label="文件列表加载方式"
                class="select select-bordered select-sm w-40"
                value={mode.value}
                onChange={event => mode.value = (event.target as HTMLSelectElement).value as typeof mode.value}
              >
                <option value="pagination">分页加载</option>
                <option value="infinite">滚动无限加载</option>
              </select>
            </label>
          </Card>

          <Card title="关于" hint={`${GM_info.script.name} · v${PKG.version}`} icon={I.ABOUT}>
            <div class="flex gap-2">
              {link('https://github.com/amasun/115master', I.GITHUB, 'GitHub 仓库')}
              {link('https://github.com/amasun', I.SPONSOR, '赞助作者')}
            </div>
          </Card>
        </div>
      </div>
    )
  },
})

export default PreferencesContent
