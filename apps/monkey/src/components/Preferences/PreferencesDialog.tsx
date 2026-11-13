import { Dialog, Drawer, NavigationStack } from '@115master/ui'
import { useMediaQuery } from '@vueuse/core'
import { defineComponent, ref } from 'vue'
import PreferencesContent from './PreferencesContent'

const open = ref(false)

export function usePreferencesDialog() {
  return () => {
    open.value = true
  }
}

function closePreferencesDialog() {
  open.value = false
}

export const PreferencesDialog = defineComponent({
  name: 'PreferencesDialog',

  setup() {
    const desktop = useMediaQuery('(min-width: 640px)')

    function update(value: boolean) {
      open.value = value
    }

    const navigation = () => (
      <NavigationStack
        title="偏好设置"
        pageKey="root"
        depth={0}
        canGoBack={false}
        closeLabel="关闭偏好设置"
        onDismiss={closePreferencesDialog}
      >
        <PreferencesContent onLoggedOut={closePreferencesDialog} />
      </NavigationStack>
    )

    return () => desktop.value
      ? (
          <Dialog
            open={open.value}
            label="偏好设置"
            size="xl"
            onUpdate:open={update}
          >
            {navigation}
          </Dialog>
        )
      : (
          <Drawer
            open={open.value}
            label="偏好设置"
            placement="bottom"
            size="lg"
            style="--ui-drawer-size: min(75dvh, 44rem)"
            onUpdate:open={update}
          >
            {navigation}
          </Drawer>
        )
  },
})
