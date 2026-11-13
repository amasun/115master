import { Button, Image } from '@115master/ui'
import { defineComponent, inject, ref } from 'vue'
import { useAppDialog } from '@/app/dialog'
import { showLogin } from '@/app/login'
import { I, Icon } from '@/icons'
import { useUserAqStore } from '@/store/userAq'
import { drive115 } from '@/utils/drive115Instance'

/** 在 115 原生页面（U1/U2）内使用时注入 true：退出后刷新页面，交给 115 自己的登录页 */
export const PREFERENCES_NATIVE = Symbol('preferences-native')

const AccountPreferences = defineComponent({
  name: 'AccountPreferences',

  emits: {
    loggedOut: () => true,
  },

  setup(_, { emit }) {
    const dialog = useAppDialog()
    const native = inject(PREFERENCES_NATIVE, false)
    const user = useUserAqStore()
    const busy = ref(false)
    const error = ref('')

    async function logout() {
      const confirmed = await dialog.confirm({
        title: '退出登录',
        content: '确定要退出账号吗？',
        confirmText: '确定',
        cancelText: '取消',
      })

      if (!confirmed)
        return

      busy.value = true
      error.value = ''
      try {
        await drive115.auth.logout()
        emit('loggedOut')
        if (native) {
          location.reload()
          return
        }
        await showLogin('已退出登录，请重新登录。')
      }
      catch (cause) {
        error.value = cause instanceof Error ? cause.message : '退出登录失败，请稍后重试'
      }
      finally {
        busy.value = false
      }
    }

    return () => {
      const data = user.state?.data

      if (!data) {
        return (
          <div class="flex min-h-10 flex-col items-center justify-center gap-2 text-center">
            {user.isLoading
              ? (
                  <>
                    <span class="loading loading-spinner loading-md text-primary" />
                    <p class="text-base-content/60 text-sm">正在加载账号信息…</p>
                  </>
                )
              : (
                  <>
                    <Icon name={I.ERROR} class="text-error text-3xl" />
                    <p class="text-base-content/60 text-sm">
                      {user.error instanceof Error ? user.error.message : '账号信息加载失败'}
                    </p>
                    <Button size="sm" variant="soft" onClick={() => user.execute()}>重新加载</Button>
                  </>
                )}
          </div>
        )
      }

      const uid = String(data.uid)
      const name = data.uname?.trim()
      const displayName = name && name !== uid ? name : ''

      return (
        <div class="flex flex-col gap-2" data-account-preferences>
          <div class="flex items-center gap-2.5">
            <Image
              class="border-base-content/10 size-10 shrink-0 rounded-full border"
              src={data.face?.face_l || ''}
              alt={displayName || '115 用户头像'}
              fit="cover"
              fallback={(
                <div class="bg-primary/15 text-primary flex size-full items-center justify-center text-base font-semibold">
                  {displayName.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
            />
            <div class="min-w-0 flex-1">
              <p class="text-base-content flex items-center gap-1.5 text-sm font-medium">
                <span class="truncate">{displayName || uid}</span>
                <span class="text-base-content/55 flex shrink-0 items-center gap-0.5 text-xs font-normal">
                  {data.vip?.is_vip && <Icon name={I.STAR_RATING} size="xs" class="text-warning" />}
                  <span>{data.vip?.is_vip ? (data.vip.desc || 'VIP 用户') : '普通用户'}</span>
                </span>
              </p>
              <p class="text-base-content/55 mt-0.5 flex flex-wrap gap-x-2 text-xs">
                {displayName && (
                  <span>
                    UID
                    {' '}
                    <span>{uid}</span>
                  </span>
                )}
                {data.vip?.is_vip && data.vip.expire_str && (
                  <span>
                    到期
                    {' '}
                    <span>{data.vip.expire_str}</span>
                  </span>
                )}
              </p>
            </div>
            <Button
              class="shrink-0"
              size="sm"
              color="error"
              variant="soft"
              loading={busy.value}
              onClick={() => logout()}
            >
              <Icon name={I.LOGOUT} size="sm" />
              退出登录
            </Button>
          </div>
          {error.value && (
            <div class="bg-error/10 text-error rounded-lg px-3 py-2 text-sm" role="alert">
              {error.value}
            </div>
          )}
        </div>
      )
    }
  },
})

export default AccountPreferences
