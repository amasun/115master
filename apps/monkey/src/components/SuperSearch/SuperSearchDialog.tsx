import { Dialog, Drawer, NavigationStack } from '@115master/ui'
import { useMediaQuery } from '@vueuse/core'
import { defineComponent, ref } from 'vue'
import SuperSearchContent from './SuperSearchContent.vue'

const open = ref(false)

export function useSuperSearchDialog() {
  return () => {
    open.value = true
  }
}

function closeSuperSearchDialog() {
  open.value = false
}

export const SuperSearchDialog = defineComponent({
  name: 'SuperSearchDialog',

  setup() {
    const desktop = useMediaQuery('(min-width: 640px)')

    function update(value: boolean) {
      open.value = value
    }

    const navigation = () => (
      <NavigationStack
        title="超级搜索"
        pageKey="root"
        depth={0}
        canGoBack={false}
        closeLabel="关闭超级搜索"
        onDismiss={closeSuperSearchDialog}
      >
        <SuperSearchContent onClose={closeSuperSearchDialog} />
      </NavigationStack>
    )

    return () => desktop.value
      ? (
          <Dialog
            open={open.value}
            label="超级搜索"
            size="xl"
            onUpdate:open={update}
          >
            {navigation}
          </Dialog>
        )
      : (
          <Drawer
            open={open.value}
            label="超级搜索"
            placement="bottom"
            size="lg"
            style="--ui-drawer-size: min(82dvh, 48rem)"
            onUpdate:open={update}
          >
            {navigation}
          </Drawer>
        )
  },
})
