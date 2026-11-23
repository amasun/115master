import type { IconifyIcon as IconifySvgData } from 'iconify-icon'
import type { PropType } from 'vue'
import type { IconSize, IconValue } from './types'
import { addCollection as addVueIconCollection, Icon as IconifyIcon } from '@iconify/vue'
import { addCollection as addWebComponentIconCollection } from 'iconify-icon'
import { phCollection } from 'virtual:phosphor-icons'
import { computed, defineAsyncComponent, defineComponent, h } from 'vue'

// 预注册离线 Phosphor 图标子集，防止运行环境 CSP/断网导致图标显示空白
addVueIconCollection(phCollection)
addWebComponentIconCollection(phCollection)

const sizeClasses: Record<IconSize, string> = {
  'xs': 'size-3.5',
  'sm': 'size-4',
  'md': 'size-5',
  'lg': 'size-6',
  'xl': 'size-16',
  '2xl': 'size-24',
  'custom': '',
}

/** 按需将 Phosphor bold 图标名解析为选中态 fill 风格 */
export function resolveIconName(name: IconValue, filled = false): string {
  if (!filled || !name.startsWith('ph:'))
    return name
  return name.endsWith('-bold') ? `${name.slice(0, -5)}-fill` : name
}

/** 获取随用户脚本离线打包的 Iconify SVG 数据对象 */
export function getOfflineIcon(name: IconValue, filled = false): IconifySvgData {
  const resolved = resolveIconName(name, filled)
  const key = resolved.replace(/^ph:/, '')
  const icon = phCollection.icons[key]
  if (!icon) {
    throw new Error(`[icons] 未找到离线 Phosphor 图标：${resolved}`)
  }
  return {
    width: icon.width ?? phCollection.width ?? 256,
    height: icon.height ?? phCollection.height ?? 256,
    body: icon.body,
  }
}

const Icon = defineComponent({
  name: 'Icon',

  props: {
    name: {
      type: String as PropType<IconValue>,
      required: true,
    },
    size: {
      type: String as PropType<IconSize>,
      default: 'md',
    },
    filled: {
      type: Boolean,
      default: false,
    },
  },

  setup(props) {
    const resolvedName = computed(() => resolveIconName(props.name, props.filled))
    const isPh = computed(() => resolvedName.value.startsWith('ph:'))
    const custom = computed(() => {
      if (isPh.value)
        return null
      const file = props.name.replace('custom:', '')
      return defineAsyncComponent(() => import(`./custom/${file}.svg`))
    })

    return () => {
      if (isPh.value)
        return <IconifyIcon icon={resolvedName.value} class={sizeClasses[props.size]} />
      if (!custom.value)
        return null
      return h(custom.value, { class: sizeClasses[props.size] })
    }
  },
})

export default Icon
