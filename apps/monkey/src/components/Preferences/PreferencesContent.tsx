import type { PropType } from 'vue'
import type { IconValue } from '@/icons'
import { GM_info } from '$'
import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import PKG from '@/../package.json'
import ThemeToggle from '@/components/ThemeToggle'
import { I, Icon } from '@/icons'
import { useUserSetting } from '@/utils/userSettings'

export type PreferenceSection = 'layout' | 'enhancements' | 'appearance' | 'about'

interface SectionItem {
  id: PreferenceSection
  label: string
  icon: IconValue
}

export const PREFERENCE_SECTIONS: SectionItem[] = [
  { id: 'layout', label: '布局模式', icon: I.VIEW },
  { id: 'enhancements', label: '功能增强', icon: I.EXTENSION },
  { id: 'appearance', label: '外观主题', icon: I.THEME_LIGHT },
  { id: 'about', label: '关于与赞助', icon: I.ABOUT },
]

const DESKTOP_MQ = '(min-width: 640px)'

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
      <label class="hover:bg-base-content/5 flex cursor-pointer items-center justify-between rounded-xl p-3 transition-colors">
        <div class="flex flex-col gap-0.5">
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

  props: {
    section: {
      type: String as PropType<PreferenceSection | null>,
      default: null,
    },
  },

  emits: {
    'update:section': (_section: PreferenceSection) => true,
    'loggedOut': () => true,
  },

  setup(props, { emit }) {
    const preview = useUserSetting('enableFilelistPreview')
    const avInfo = useUserSetting('enableAvInfo')
    const compactAvInfo = useUserSetting('compactAvInfo')
    const actressFaces = useUserSetting('enableActressFaces')
    const playerMovieInfo = useUserSetting('enablePlayerMovieInfo')
    const isDesktop = ref(false)
    let mql: MediaQueryList | undefined

    onMounted(() => {
      mql = window.matchMedia(DESKTOP_MQ)
      isDesktop.value = mql.matches
      mql.addEventListener('change', onChange)
    })

    onBeforeUnmount(() => {
      mql?.removeEventListener('change', onChange)
    })

    function onChange(e: MediaQueryListEvent) {
      isDesktop.value = e.matches
    }

    /** 桌面端无选中时回退到第一项，移动端保持 null 表示一级菜单 */
    const display = computed<PreferenceSection | null>(() => {
      if (props.section)
        return props.section
      return isDesktop.value ? PREFERENCE_SECTIONS[0].id : null
    })

    function pick(section: PreferenceSection) {
      emit('update:section', section)
    }

    return () => {
      const showMenu = props.section === null

      return (
        <div class="flex flex-col gap-4 sm:min-h-[26rem] sm:flex-row">
          {/* 桌面端：始终显示左侧菜单，移动端：仅在 menu 层级显示 */}
          <nav
            class={[
              'border-base-content/10 flex shrink-0 flex-col gap-1 sm:w-40 sm:border-r sm:pr-3',
              showMenu ? 'w-full' : 'hidden sm:flex',
            ]}
          >
            {PREFERENCE_SECTIONS.map(section => (
              <button
                key={section.id}
                type="button"
                class={[
                  'flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ease-[var(--ui-ease-standard)]',
                  display.value === section.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-base-content/70 hover:bg-base-content/5 hover:text-base-content',
                ]}
                onClick={() => pick(section.id)}
              >
                <Icon name={section.icon} class="text-base" />
                <span>{section.label}</span>
                <Icon name={I.RIGHT} class="text-base-content/40 ml-auto text-base sm:hidden" />
              </button>
            ))}
          </nav>

          {/* 移动端 menu 层级不可见、section 层级显示；桌面端反之 */}
          <div
            class={[
              'flex-1 sm:pr-1 sm:pl-3',
              showMenu ? 'hidden sm:block' : 'block',
            ]}
          >
            {/* 1. 布局模式：切换宽大布局与紧凑布局 */}
            {display.value === 'layout' && (
              <div class="flex flex-col gap-5">
                <div>
                  <h3 class="text-base-content text-base font-semibold">资料排版布局</h3>
                  <p class="text-base-content/60 mt-1 text-xs leading-relaxed">
                    选择文件列表中番号作品信息的展现形式，适配不同屏幕分辨率与个人浏览习惯。
                  </p>
                </div>

                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* 宽大布局卡片 */}
                  <div
                    class={[
                      'border-base-content/15 relative flex cursor-pointer flex-col rounded-2xl border-2 p-4 transition-all',
                      !compactAvInfo.value
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'hover:border-base-content/30 bg-base-100',
                    ]}
                    onClick={() => compactAvInfo.value = false}
                  >
                    <div class="flex items-center justify-between">
                      <span class="text-base-content text-sm font-semibold">宽大布局</span>
                      <input
                        type="radio"
                        name="layout-mode"
                        class="radio radio-primary radio-sm"
                        checked={!compactAvInfo.value}
                        onChange={() => compactAvInfo.value = false}
                      />
                    </div>
                    <p class="text-base-content/65 mt-2 text-xs leading-relaxed">
                      显示大尺寸番号封面、完整剧情介绍、详细标签及高清截图，信息充实直观。
                    </p>
                  </div>

                  {/* 紧凑布局卡片 */}
                  <div
                    class={[
                      'border-base-content/15 relative flex cursor-pointer flex-col rounded-2xl border-2 p-4 transition-all',
                      compactAvInfo.value
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'hover:border-base-content/30 bg-base-100',
                    ]}
                    onClick={() => compactAvInfo.value = true}
                  >
                    <div class="flex items-center justify-between">
                      <span class="text-base-content text-sm font-semibold">紧凑布局</span>
                      <input
                        type="radio"
                        name="layout-mode"
                        class="radio radio-primary radio-sm"
                        checked={compactAvInfo.value}
                        onChange={() => compactAvInfo.value = true}
                      />
                    </div>
                    <p class="text-base-content/65 mt-2 text-xs leading-relaxed">
                      精简内边距与封面尺寸，紧凑排布核心字段，适合一屏展示更多文件的高密列表。
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 2. 功能增强开关 */}
            {display.value === 'enhancements' && (
              <div class="flex flex-col gap-2">
                <div>
                  <h3 class="text-base-content text-base font-semibold">功能增强项</h3>
                  <p class="text-base-content/60 mt-1 text-xs">
                    可随时独立开启或关闭特定功能模块。
                  </p>
                </div>
                <div class="mt-2 flex flex-col gap-1">
                  <SettingToggle
                    label="视频截图预览"
                    description="在视频文件下方展开高品质视频时间轴截图"
                    modelValue={preview.value}
                    onUpdate:modelValue={value => preview.value = value}
                  />
                  <SettingToggle
                    label="番号作品资料"
                    description="识别番号并抓取海报、演员、发行日期及评分等详细资料"
                    modelValue={avInfo.value}
                    onUpdate:modelValue={value => avInfo.value = value}
                  />
                  <SettingToggle
                    label="演员头像替代文件夹图标"
                    description="当文件夹识别为女演员时，以演员精美头像直接代替原生文件夹图标"
                    modelValue={actressFaces.value}
                    onUpdate:modelValue={value => actressFaces.value = value}
                  />
                  <SettingToggle
                    label="播放页影片详情"
                    description="在 115Master 播放器内显示影片详细介绍与侧边信息"
                    modelValue={playerMovieInfo.value}
                    onUpdate:modelValue={value => playerMovieInfo.value = value}
                  />
                </div>
              </div>
            )}

            {/* 3. 外观主题 */}
            {display.value === 'appearance' && (
              <div class="flex flex-col gap-4">
                <div>
                  <h3 class="text-base-content text-base font-semibold">界面主题</h3>
                  <p class="text-base-content/60 mt-1 text-xs">切换浅色模式、深色模式或跟随系统设置。</p>
                </div>
                <div class="pt-2">
                  <ThemeToggle />
                </div>
              </div>
            )}

            {/* 4. 关于与赞助 */}
            {display.value === 'about' && (
              <div class="flex flex-col gap-5 text-sm">
                <div>
                  <h3 class="text-base-content text-base font-semibold">{GM_info.script.name}</h3>
                  <p class="text-base-content/60 mt-1 text-xs">
                    当前版本：v
                    {PKG.version}
                  </p>
                </div>
                <div class="flex flex-col gap-2.5">
                  <a
                    class="border-base-content/10 hover:border-primary/40 hover:bg-primary/5 flex items-center justify-between rounded-xl border p-3.5 transition-colors"
                    href="https://github.com/amasun/115master"
                    target="_blank"
                    rel="noreferrer"
                    title="amasun / 115master GitHub 仓库"
                  >
                    <span class="flex items-center gap-3">
                      <Icon name={I.GITHUB} class="text-xl" />
                      <span class="flex flex-col">
                        <span class="text-base-content font-medium">GitHub 仓库 (amasun)</span>
                        <span class="text-base-content/60 text-xs">https://github.com/amasun/115master</span>
                      </span>
                    </span>
                    <Icon name={I.RIGHT} class="text-base-content/40 text-base" />
                  </a>

                  <a
                    class="border-base-content/10 hover:border-primary/40 hover:bg-primary/5 flex items-center justify-between rounded-xl border p-3.5 transition-colors"
                    href="https://github.com/amasun"
                    target="_blank"
                    rel="noreferrer"
                    title="赞助与支持作者 amasun"
                  >
                    <span class="flex items-center gap-3">
                      <Icon name={I.SPONSOR} class="text-primary text-xl" />
                      <span class="flex flex-col">
                        <span class="text-base-content font-medium">赞助作者 amasun</span>
                        <span class="text-base-content/60 text-xs">支持项目的持续更新与开发</span>
                      </span>
                    </span>
                    <Icon name={I.RIGHT} class="text-base-content/40 text-base" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )
    }
  },
})

export default PreferencesContent
