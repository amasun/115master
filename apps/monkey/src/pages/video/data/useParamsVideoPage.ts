import type { MaybeRefOrGetter } from 'vue'
import { computed, ref, toValue } from 'vue'
import { useRoute } from 'vue-router'

/**
 * 视频页面参数
 */
export function useParamsVideoPage(overridePickCode?: MaybeRefOrGetter<string | undefined>) {
  const route = useRoute()

  const pickCode = computed(() => {
    const override = toValue(overridePickCode)
    if (override)
      return override
    return 'pickCode' in route.params && typeof route.params.pickCode === 'string'
      ? route.params.pickCode
      : undefined
  })
  /** cid 从文件信息中获取，不再从路由参数中读取 */
  const cid = ref<string>()

  return {
    cid,
    pickCode,
  }
}
