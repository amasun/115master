import { DialogHost, DndRoot, ModalHost, OverlayHost, Watermark } from '@115master/ui'
import { GM_info } from 'vite-plugin-monkey/dist/client'
import { defineComponent, onBeforeUnmount, onErrorCaptured, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { appDialog } from '@/app/dialog'
import {
  ToastContainer,
  useSponsorBoot,
} from '@/components'
import { PreferencesDialog } from '@/components/Preferences'
import {
  registerSuperSearchShortcut,
  SuperSearchDialog,
  useSuperSearchDialog,
} from '@/components/SuperSearch'
import { appLogger } from '@/utils/logger'

const Boot = defineComponent({
  setup() {
    useSponsorBoot()
    const openSuperSearch = useSuperSearchDialog()
    let disposeShortcut: (() => void) | null = null
    onMounted(() => {
      disposeShortcut = registerSuperSearchShortcut(openSuperSearch)
    })
    onBeforeUnmount(() => {
      disposeShortcut?.()
      disposeShortcut = null
    })
    return () => null
  },
})

const App = defineComponent({
  name: 'App',
  setup() {
    onErrorCaptured((err, instance, info) => {
      appLogger.error('Vue error captured:', err, instance, info)
      return false
    })

    return () => {
      const content = (
        <DndRoot>
          <DialogHost service={appDialog}>
            <Boot />
            <ToastContainer>
              <SuperSearchDialog />
              <PreferencesDialog />
              <RouterView />
            </ToastContainer>
          </DialogHost>
        </DndRoot>
      )

      return (
        <OverlayHost>
          <ModalHost>
            {content}
            {import.meta.env.DEV && (
              <Watermark
                content={GM_info.script.name}
                opacity={0.09}
                class="ui-z-watermark pointer-events-none fixed inset-0"
              />
            )}
          </ModalHost>
        </OverlayHost>
      )
    }
  },
})

export default App
