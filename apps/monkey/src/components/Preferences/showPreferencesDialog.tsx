import { ModalHost, OverlayHost } from '@115master/ui'
import { createPinia } from 'pinia'
import { createApp, defineComponent } from 'vue'
import mainStyles from '@/styles/main.css?inline'
import { adoptShadowStyle } from '@/utils/adoptShadowStyle'
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
        return () => (
          <OverlayHost>
            <ModalHost>
              <PreferencesDialog />
            </ModalHost>
          </OverlayHost>
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
