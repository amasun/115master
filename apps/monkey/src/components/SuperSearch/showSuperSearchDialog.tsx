import { DialogHost, ModalHost, OverlayHost } from '@115master/ui'
import { usePreferredDark } from '@vueuse/core'
import { createPinia } from 'pinia'
import { createApp, defineComponent } from 'vue'
import { appDialog } from '@/app/dialog'
import mainStyles from '@/styles/main.css?inline'
import { adoptShadowStyle } from '@/utils/adoptShadowStyle'
import { useUserSetting } from '@/utils/userSettings'
import { SuperSearchDialog, useSuperSearchDialog } from './SuperSearchDialog'

let hostApp: ReturnType<typeof createApp> | null = null

/** 在原生 115 页面中按需挂载并展示超级搜索弹窗 */
export function showSuperSearchDialog(): void {
  if (!hostApp) {
    let container = document.getElementById('115master-super-search-dialog-root')
    if (!container) {
      container = document.createElement('div')
      container.id = '115master-super-search-dialog-root'
      document.body.append(container)
    }

    const shadow = container.shadowRoot ?? container.attachShadow({ mode: 'open' })
    adoptShadowStyle(shadow, mainStyles)

    const mountPoint = document.createElement('div')
    shadow.append(mountPoint)

    const Wrapper = defineComponent({
      name: 'SuperSearchDialogWrapper',
      setup() {
        const mode = useUserSetting('theme')
        const dark = usePreferredDark()
        return () => (
          <div
            class="text-base-content font-sans leading-normal antialiased"
            data-theme={mode.value === 'system' ? (dark.value ? 'dark' : 'light') : mode.value}
          >
            <OverlayHost>
              <ModalHost>
                <DialogHost service={appDialog}>
                  <SuperSearchDialog />
                </DialogHost>
              </ModalHost>
            </OverlayHost>
          </div>
        )
      },
    })

    hostApp = createApp(Wrapper)
    hostApp.use(createPinia())
    hostApp.mount(mountPoint)
  }

  const open = useSuperSearchDialog()
  open()
}

/** 判断事件目标是否处于可编辑输入控件中 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement))
    return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/**
 * 注册 Alt+K 全局快捷键唤起超级搜索（避开 115 官方 Cmd/Ctrl+K）
 * @returns 注销监听的清理函数
 */
export function registerSuperSearchShortcut(open: () => void = showSuperSearchDialog): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return
    if (event.key.toLowerCase() !== 'k')
      return
    if (isEditableTarget(event.target))
      return
    event.preventDefault()
    open()
  }
  window.addEventListener('keydown', onKeyDown)
  return () => {
    window.removeEventListener('keydown', onKeyDown)
  }
}
