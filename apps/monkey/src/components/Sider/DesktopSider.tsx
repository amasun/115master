import type { SlotsType } from 'vue'
import { Button } from '@115master/ui'
import { defineComponent } from 'vue'
import { I, Icon } from '@/icons'
import SiderMenuButton from './SiderMenuButton'

const DesktopSider = defineComponent({
  name: 'DesktopSider',
  slots: Object as SlotsType<{
    default: () => void
    left: () => void
    right: () => void
  }>,
  setup(_, { slots }) {
    function backToNative() {
      window.location.href = '/?mode=wangpan'
    }

    return () => (
      <div
        class="
          ui-glass-panel
          ui-z-header
          fixed top-2
          bottom-2 left-2
          flex
          w-[calc(var(--sider-width)-var(--spacing)*2)]
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
            onClick={backToNative}
            title="返回 115 原生网盘界面"
          >
            <Icon class="text-lg" name={I.LEFT} />
            <span>返回原生 115</span>
          </Button>
          <SiderMenuButton />
        </div>
      </div>
    )
  },
})

export default DesktopSider
