import type { SlotsType } from 'vue'
import { Button } from '@115master/ui'
import { defineComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from '@/components'
import { I, Icon } from '@/icons'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { buildNativeFolderUrl } from '@/utils/userSettings'
import SiderMenuButton from './SiderMenuButton'

const DesktopSider = defineComponent({
  name: 'DesktopSider',
  slots: Object as SlotsType<{
    default: () => void
    left: () => void
    right: () => void
  }>,
  setup(_, { slots }) {
    const store = useMediaLibraryStore()
    const route = useRoute()
    const router = useRouter()
    const toast = useToast()

    async function handleCreateCustomSection() {
      const created = await store.createCustomSection()
      if (created) {
        toast.success(`已创建栏目「${created.name}」`)
        if (route.name !== 'library') {
          store.scrollTop = 0
          void router.push({ name: 'library' })
        }
      }
    }

    function backToNative() {
      window.location.href = buildNativeFolderUrl('0')
    }

    return () => (
      <aside
        aria-label="主导航"
        class="
          ui-glass-panel
          ui-z-header
          sticky top-2
          my-2 ml-2
          flex
          h-[calc(100dvh-1rem)]
          w-[calc(var(--sider-width)-var(--spacing)*2)]
          shrink-0
          flex-col
          rounded-2xl
          px-4
          pb-4
          max-sm:hidden
        "
      >
        {slots.default?.()}
        <div class="mt-auto flex flex-col gap-2">
          {slots.left?.()}
          <Button
            variant="ghost"
            class="hover:bg-base-content/5 text-base-content/75 hover:text-base-content justify-start gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
            onClick={handleCreateCustomSection}
            title="新建自定义栏目"
          >
            <Icon class="text-lg" name={I.ADD_LINK} />
            <span>新建栏目</span>
          </Button>
          <Button
            variant="ghost"
            class="hover:bg-base-content/5 text-base-content/75 hover:text-base-content justify-start gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
            onClick={backToNative}
            title="返回 115 原生网盘界面"
          >
            <Icon class="text-lg" name={I.LEFT} />
            <span>返回原生 115</span>
          </Button>
          <div class="flex items-center justify-between">
            <SiderMenuButton />
            <span class="text-base-content/40 px-1 text-[10px] tabular-nums select-none">
              {`v${__115MASTER_VERSION__}`}
            </span>
          </div>
        </div>
      </aside>
    )
  },
})

export default DesktopSider
