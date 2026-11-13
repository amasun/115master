import { DialogHost, ModalHost, OverlayHost } from '@115master/ui'
import { usePreferredDark } from '@vueuse/core'
import { createPinia } from 'pinia'
import { createApp, defineComponent, provide } from 'vue'
import { appDialog } from '@/app/dialog'
import mainStyles from '@/styles/main.css?inline'
import { adoptShadowStyle } from '@/utils/adoptShadowStyle'
import { useUserSetting } from '@/utils/userSettings'
import { PREFERENCES_NATIVE } from './AccountPreferences'
import { PreferencesDialog, usePreferencesDialog } from './PreferencesDialog'

let hostApp: ReturnType<typeof createApp> | null = null

/** 在原生 115 页面中按需挂载并展示全局偏好设置弹窗 */
export function showPreferencesDialog(): void {
  if (!hostApp) {
    let container = document.getElementById('115master-preferences-dialog-root')
    if (!container) {
      container = document.createElement('div')
      container.id = '115master-preferences-dialog-root'
      document.body.append(container)
    }

    const shadow = container.shadowRoot ?? container.attachShadow({ mode: 'open' })
    adoptShadowStyle(shadow, mainStyles)

    const mountPoint = document.createElement('div')
    shadow.append(mountPoint)

    const Wrapper = defineComponent({
      name: 'PreferencesDialogWrapper',
      setup() {
        provide(PREFERENCES_NATIVE, true)
        const mode = useUserSetting('theme')
        const dark = usePreferredDark()
        /** Shadow DOM 内匹配不到 :root，必须显式写 data-theme，否则颜色变量为空、弹窗透明 */
        return () => (
          <div
            class="text-base-content"
            data-theme={mode.value === 'system' ? (dark.value ? 'dark' : 'light') : mode.value}
          >
            <OverlayHost>
              <ModalHost>
                <DialogHost service={appDialog}>
                  <PreferencesDialog />
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

  const open = usePreferencesDialog()
  open()
}
