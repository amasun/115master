<template>
  <aside
    aria-label="演员个人资料"
    class="w-full shrink-0 lg:sticky lg:top-20 lg:w-72 lg:self-start xl:w-80"
  >
    <div class="bg-base-200/55 border-base-content/8 relative overflow-hidden rounded-3xl border">
      <!-- 氛围模糊底图 -->
      <div
        v-if="avatarSrc"
        class="pointer-events-none absolute inset-x-0 top-0 h-44 scale-110 bg-cover bg-center opacity-20 blur-2xl"
        :style="{ backgroundImage: `url(${avatarSrc})` }"
      />
      <div class="from-base-200/30 via-base-200/80 to-base-200 pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b" />

      <div class="relative flex flex-col gap-4 p-4">
        <!-- 顶部工具按钮 -->
        <div class="flex items-center justify-between gap-2">
          <span class="text-base-content/55 text-[11px] font-medium tracking-wide">
            演员资料
          </span>
          <div class="flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              shape="circle"
              title="更换头像"
              aria-label="更换头像"
              @click="openAvatarPicker"
            >
              <Icon :name="I.RENAME" class="text-sm" />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              shape="circle"
              title="刷新个人资料"
              aria-label="刷新个人资料"
              :disabled="loading"
              @click="loadProfile(true)"
            >
              <Icon :name="I.RESTART" class="text-sm" :class="loading && 'animate-spin'" />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              shape="circle"
              title="退出演员筛选"
              aria-label="退出演员筛选"
              @click="closeActorRail"
            >
              <Icon :name="I.CLOSE" class="text-sm" />
            </Button>
          </div>
        </div>

        <!-- 头像与姓名 -->
        <div class="flex items-center gap-3.5 lg:flex-col lg:items-center lg:text-center">
          <div class="bg-base-300/70 border-base-content/10 size-20 shrink-0 overflow-hidden rounded-2xl border shadow-md lg:size-36 lg:rounded-3xl">
            <img
              v-if="avatarSrc && !avatarFailed"
              :src="avatarSrc"
              :alt="displayName"
              referrerpolicy="no-referrer"
              class="size-full object-cover object-top"
              @error="avatarFailed = true"
            >
            <div
              v-else
              class="text-base-content/55 flex size-full items-center justify-center text-3xl font-semibold"
            >
              {{ displayName.slice(0, 1) }}
            </div>
          </div>

          <div class="flex min-w-0 flex-1 flex-col gap-1 lg:w-full lg:items-center">
            <h2 class="text-base-content truncate text-lg leading-snug font-bold">
              {{ displayName }}
            </h2>
            <p
              v-if="activeYearRange"
              class="text-base-content/55 text-xs tabular-nums"
            >
              本库作品年份 {{ activeYearRange }}
            </p>
            <div v-if="displayAliases.length > 0" class="mt-1 flex flex-wrap gap-1 lg:justify-center">
              <span
                v-for="alias in displayAliases"
                :key="alias"
                class="bg-base-content/8 text-base-content/70 max-w-28 truncate rounded-full px-2 py-0.5 text-[10px]"
                :title="alias"
              >
                {{ alias }}
              </span>
            </div>
          </div>
        </div>

        <!-- 收藏与隐藏快捷操作 -->
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="btn btn-xs gap-1.5 rounded-xl font-medium"
            :class="isFavorite
              ? 'btn-error btn-soft'
              : 'btn-ghost bg-base-100/50 border-base-content/8 text-base-content/75 hover:text-error border'"
            @click="handleToggleFavorite"
          >
            <Icon :name="isFavorite ? I.HEART_FILL : I.HEART" class="text-xs" />
            <span>{{ isFavorite ? '已收藏' : '收藏演员' }}</span>
          </button>
          <button
            type="button"
            class="btn btn-xs gap-1.5 rounded-xl font-medium"
            :class="isHidden
              ? 'btn-warning btn-soft'
              : 'btn-ghost bg-base-100/50 border-base-content/8 text-base-content/75 hover:text-warning border'"
            @click="handleToggleHidden"
          >
            <Icon :name="isHidden ? I.VIEW : I.PREVIEW_OFF" class="text-xs" />
            <span>{{ isHidden ? '已隐藏' : '隐藏演员' }}</span>
          </button>
        </div>

        <!-- 本库统计 2 格卡片 -->
        <div class="bg-base-100/45 border-base-content/6 divide-base-content/8 grid grid-cols-2 divide-x rounded-2xl border py-2.5 text-center">
          <div class="flex flex-col gap-0.5 px-1">
            <span class="text-base-content text-sm font-semibold tabular-nums">
              {{ actorStat?.count ?? actorEntries.length }}
            </span>
            <span class="text-base-content/50 text-[10px]">本库作品</span>
          </div>
          <div class="flex flex-col gap-0.5 px-1">
            <span class="text-base-content text-sm font-semibold tabular-nums">
              {{ format.fileSize(actorStat?.totalSize ?? totalSizeFallback) }}
            </span>
            <span class="text-base-content/50 text-[10px]">总容量</span>
          </div>
        </div>

        <!-- 个人资料详情 -->
        <div class="flex flex-col gap-2">
          <div v-if="loading && infoRows.length === 0" class="flex flex-col gap-2 py-1">
            <div v-for="n in 4" :key="n" class="skeleton h-4 w-full rounded-lg opacity-50" />
          </div>

          <dl v-else-if="infoRows.length > 0" class="flex flex-col gap-1.5 text-xs">
            <div
              v-for="row in infoRows"
              :key="row.label"
              class="flex items-start justify-between gap-3 py-0.5"
            >
              <dt class="text-base-content/50 shrink-0">
                {{ row.label }}
              </dt>
              <dd class="text-base-content/90 text-right leading-relaxed font-medium">
                {{ row.value }}
              </dd>
            </div>
          </dl>

          <div
            v-else
            class="text-base-content/50 bg-base-100/35 flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs"
          >
            <span>暂未获取到在线个人资料</span>
            <button
              type="button"
              class="text-primary hover:underline"
              @click="loadProfile(true)"
            >
              重试
            </button>
          </div>
        </div>

        <!-- 网盘标签（点击直接叠加筛选） -->
        <div v-if="actorDriveLabels.length > 0" class="flex flex-col gap-2">
          <span class="text-base-content/50 text-[11px] font-medium">网盘标签</span>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="tag in actorDriveLabels"
              :key="tag.id"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] transition-colors"
              :class="store.filter.driveLabel === tag.id
                ? 'bg-primary text-primary-content font-medium'
                : 'bg-base-content/8 text-base-content/75 hover:bg-primary/20 hover:text-primary'"
              @click="store.selectDriveLabel(tag.id)"
            >
              <span
                class="size-2 shrink-0 rounded-full"
                :class="!tag.color || tag.color === LabelColor.Blank ? 'border-current/40 border' : ''"
                :style="tag.color && tag.color !== LabelColor.Blank ? { backgroundColor: tag.color } : undefined"
              />
              <span class="max-w-28 truncate">{{ tag.name }}</span>
              <span class="tabular-nums opacity-65">{{ tag.count }}</span>
            </button>
          </div>
        </div>

        <!-- 常拍题材（点击直接叠加筛选） -->
        <div v-if="topGenres.length > 0" class="flex flex-col gap-2">
          <span class="text-base-content/50 text-[11px] font-medium">常拍题材</span>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="genre in topGenres"
              :key="genre.name"
              type="button"
              class="rounded-full px-2.5 py-0.5 text-[11px] transition-colors"
              :class="store.filter.genre === genre.name
                ? 'bg-primary text-primary-content font-medium'
                : 'bg-base-content/8 text-base-content/75 hover:bg-primary/20 hover:text-primary'"
              @click="store.selectGenre(genre.name)"
            >
              {{ genre.name }}
              <span class="ml-0.5 tabular-nums opacity-65">{{ genre.count }}</span>
            </button>
          </div>
        </div>

        <!-- 原站主页外链 -->
        <a
          v-if="profile?.profileUrl"
          :href="profile.profileUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-ghost btn-xs border-base-content/8 text-base-content/70 hover:text-base-content w-full rounded-full border font-normal"
        >
          {{ profileSourceLabel }}
        </a>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { ActorProfile } from '@/utils/mediaIndex'
import { Api } from '@115master/drive115'
import { Button } from '@115master/ui'
import { format } from '@115master/utils'
import { computed, onUnmounted, shallowRef, watch } from 'vue'
import { useToast } from '@/components'
import { I, Icon } from '@/icons'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { useTagStore } from '@/store/tagList'
import { normalizeActressName } from '@/utils/actressNameMatcher'
import { fetchActorProfile } from '@/utils/mediaIndex'
import { resolveDriveLabelName } from './tagRail'

const props = defineProps<{
  actorName: string
}>()

const { LabelColor } = Api.TagApi.Req

const store = useMediaLibraryStore()
const tagStore = useTagStore()
const toast = useToast()
const profile = shallowRef<ActorProfile | null>(null)
const profileSourceLabel = computed(() => {
  switch (profile.value?.source) {
    case 'avbase':
      return '查看 AVBASE 演员主页'
    case 'minnano-av':
      return '查看 MINNANO-AV 演员主页'
    default:
      return '查看 JavBus 演员主页'
  }
})
const loading = shallowRef(false)
const avatarFailed = shallowRef(false)

let activeController: AbortController | null = null

const normalizedName = computed(() => normalizeActressName(props.actorName) || props.actorName.trim().toLowerCase())

const actorStat = computed(() =>
  store.libraryIndex.actorStats.find(stat =>
    stat.name === props.actorName
    || stat.key === normalizedName.value
    || stat.aliases.includes(props.actorName),
  ),
)

const displayName = computed(() => actorStat.value?.name || profile.value?.name || props.actorName)
const actorKey = computed(() => actorStat.value?.key ?? normalizedName.value)
const isFavorite = computed(() => store.isActorFavorite(actorKey.value))
const isHidden = computed(() => store.isActorHidden(actorKey.value))

function handleToggleFavorite() {
  const favorited = store.toggleFavoriteActor(actorKey.value)
  toast.success(favorited ? `已收藏「${displayName.value}」` : `已取消收藏「${displayName.value}」`)
}

function handleToggleHidden() {
  if (store.isActorHidden(actorKey.value)) {
    store.unhideActor(actorKey.value)
    toast.success(`已取消隐藏「${displayName.value}」`)
    return
  }
  store.hideActor(actorKey.value)
  toast.success(`已隐藏「${displayName.value}」，可在演员页「隐藏」标签查看`)
}

const actorEntries = computed(() => {
  const keys = store.libraryIndex.byActor.get(displayName.value)
  if (!keys)
    return []
  return Array.from(keys)
    .map(key => store.libraryIndex.entryMap.get(key))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
})

const totalSizeFallback = computed(() =>
  actorEntries.value.reduce((sum, entry) => sum + entry.totalSize, 0),
)

const actorDriveLabels = computed(() => {
  const map = new Map<string, { id: string, name: string, color?: string, count: number }>()
  for (const entry of actorEntries.value) {
    const seenInEntry = new Set<string>()
    for (const label of entry.driveLabels) {
      if (seenInEntry.has(label.id))
        continue
      seenInEntry.add(label.id)

      const existing = map.get(label.id)
      if (existing) {
        existing.count += 1
        continue
      }

      const driveTag = tagStore.tags.find(tag => tag.id === label.id)
      map.set(label.id, {
        id: label.id,
        name: resolveDriveLabelName(label.id, tagStore.tags, store.libraryIndex.driveLabels),
        color: driveTag?.color || label.color,
        count: 1,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'))
})

const activeYearRange = computed(() => {
  const years = actorEntries.value
    .map(entry => entry.meta?.year)
    .filter((year): year is number => typeof year === 'number' && year > 1900)
  if (years.length === 0)
    return ''
  const min = Math.min(...years)
  const max = Math.max(...years)
  return min === max ? `${min}` : `${min} – ${max}`
})

const topGenres = computed(() => {
  const counts = new Map<string, number>()
  actorEntries.value.forEach((entry) => {
    entry.meta?.genres.forEach((genre) => {
      counts.set(genre, (counts.get(genre) ?? 0) + 1)
    })
  })
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, 8)
})

const displayAliases = computed(() => {
  const merged = new Set<string>([
    ...(actorStat.value?.aliases ?? []),
    ...(profile.value?.aliases ?? []),
  ])
  merged.delete(displayName.value)
  return Array.from(merged).slice(0, 6)
})

const avatarSrc = computed(() =>
  store.customAvatarUrls[actorStat.value?.key ?? normalizedName.value]
  || store.actorAvatars[displayName.value]
  || profile.value?.avatarUrl
  || actorStat.value?.avatarUrl
  || '',
)

const knownProfileUrl = computed(() => {
  for (const entry of actorEntries.value) {
    const matched = entry.meta?.actors.find(actor =>
      normalizeActressName(actor.name) === normalizedName.value && actor.url && /javbus\.com\/star\//i.test(actor.url),
    )
    if (matched?.url)
      return matched.url
  }
  return undefined
})

const infoRows = computed(() => {
  const data = profile.value
  if (!data)
    return []

  const rows: Array<{ label: string, value: string }> = []
  if (data.birthday) {
    rows.push({
      label: '生日',
      value: data.age ? `${data.birthday}（${data.age}）` : data.birthday,
    })
  }
  else if (data.age) {
    rows.push({ label: '年龄', value: data.age })
  }

  if (data.height || data.cup) {
    rows.push({
      label: '身高 / 罩杯',
      value: [data.height, data.cup].filter(Boolean).join(' · '),
    })
  }

  const measurements = [
    data.bust ? `B ${data.bust}` : '',
    data.waist ? `W ${data.waist}` : '',
    data.hips ? `H ${data.hips}` : '',
  ].filter(Boolean)
  if (measurements.length > 0)
    rows.push({ label: '三围', value: measurements.join(' / ') })

  if (data.birthplace)
    rows.push({ label: '出生地', value: data.birthplace })
  if (data.hobby)
    rows.push({ label: '爱好', value: data.hobby })

  return rows
})

async function loadProfile(forceRefresh = false) {
  activeController?.abort()
  const controller = new AbortController()
  activeController = controller
  loading.value = true
  if (forceRefresh)
    avatarFailed.value = false

  try {
    const fetched = await fetchActorProfile(displayName.value, {
      aliases: actorStat.value?.aliases ?? [],
      profileUrl: knownProfileUrl.value,
      forceRefresh,
      signal: controller.signal,
    })
    if (controller.signal.aborted)
      return
    profile.value = fetched
  }
  finally {
    if (activeController === controller)
      loading.value = false
  }
}

function closeActorRail() {
  store.selectActor(undefined)
}

function openAvatarPicker() {
  store.openAvatarPicker({
    key: actorStat.value?.key ?? normalizedName.value,
    name: displayName.value,
    aliases: displayAliases.value,
    avatarUrl: profile.value?.avatarUrl || actorStat.value?.avatarUrl,
  })
}

watch(
  () => props.actorName,
  () => {
    profile.value = null
    avatarFailed.value = false
    void loadProfile(false)
  },
  { immediate: true },
)

onUnmounted(() => {
  activeController?.abort()
  activeController = null
})
</script>
