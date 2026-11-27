<template>
  <div class="flex min-h-0 flex-1 flex-col pt-5">
    <!-- 顶部品牌 -->
    <div class="flex items-center justify-between px-1 pb-3">
      <RouterLink
        to="/library"
        class="flex items-center gap-2 no-underline"
        @click="store.setTagRailOpen(false)"
      >
        <LogoWordmark role="img" aria-label="115Master" class="text-base-content h-7 w-auto" />
        <span class="badge badge-primary badge-soft badge-xs font-medium">影视库</span>
      </RouterLink>
    </div>

    <div class="bg-base-content/5 mb-2.5 h-px w-full shrink-0" />

    <!-- 离线下载主入口 -->
    <Button
      color="primary"
      size="sm"
      class="mb-2.5 shrink-0 gap-2 rounded-full"
      @click="openCloudDownload"
    >
      <Icon :name="I.ADD_LINK" class="text-lg" />
      <span>离线下载</span>
    </Button>

    <!-- 主导航菜单 -->
    <ul class="flex shrink-0 flex-col gap-0.5">
      <li>
        <button
          type="button"
          class="flex h-9 w-full items-center justify-between rounded-full border border-transparent px-3.5 text-sm transition-colors"
          :class="isAllWorksActive
            ? 'bg-base-content/8 border-base-content/5 text-base-content font-medium'
            : 'hover:bg-base-content/5 text-base-content/75'"
          @click="selectAllWorks"
          @contextmenu.prevent="openNavMenu($event, { kind: 'all' })"
        >
          <span class="flex items-center gap-2.5">
            <Icon :name="I.LIBRARY" :filled="isAllWorksActive" class="text-lg" />
            <span>全部作品</span>
          </span>
          <span class="text-base-content/45 text-xs tabular-nums">{{ store.visibleEntryCount }}</span>
        </button>
      </li>
      <li
        v-for="section in store.customSections"
        :key="section.id"
      >
        <button
          type="button"
          class="flex h-9 w-full items-center justify-between rounded-full border border-transparent px-3.5 text-sm transition-colors"
          :class="isSectionActive(section.id)
            ? 'bg-base-content/8 border-base-content/5 text-base-content font-medium'
            : 'hover:bg-base-content/5 text-base-content/75'"
          :title="`${section.name}（${scrapeModeLabel(section.scrapeMode)}）`"
          @click="selectView(`section:${section.id}`)"
          @contextmenu.prevent="openNavMenu($event, { kind: 'section', sectionId: section.id })"
        >
          <span class="flex min-w-0 items-center gap-2.5">
            <Icon :name="I.FOLDER_OPEN" :filled="isSectionActive(section.id)" class="shrink-0 text-lg" />
            <span class="truncate">{{ section.name }}</span>
          </span>
          <span class="text-base-content/45 shrink-0 text-xs tabular-nums">{{ store.sectionCounts[section.id] ?? 0 }}</span>
        </button>
      </li>
      <li>
        <button
          type="button"
          class="flex h-9 w-full items-center justify-between rounded-full border border-transparent px-3.5 text-sm transition-colors"
          :class="isActorsActive
            ? 'bg-base-content/8 border-base-content/5 text-base-content font-medium'
            : 'hover:bg-base-content/5 text-base-content/75'"
          @click="openActorsWall"
        >
          <span class="flex items-center gap-2.5">
            <Icon :name="I.PEOPLE" :filled="isActorsActive" class="text-lg" />
            <span>演员</span>
          </span>
          <span class="text-base-content/45 text-xs tabular-nums">{{ visibleActorCount }}</span>
        </button>
      </li>
      <li>
        <button
          type="button"
          class="flex h-9 w-full items-center justify-between rounded-full border border-transparent px-3.5 text-sm transition-colors"
          :class="isStarredActive
            ? 'bg-base-content/8 border-base-content/5 text-base-content font-medium'
            : 'hover:bg-base-content/5 text-base-content/75'"
          @click="selectView('starred')"
        >
          <span class="flex items-center gap-2.5">
            <Icon :name="I.STAR" :filled="isStarredActive" class="text-lg" />
            <span>星标收藏</span>
          </span>
          <span class="text-base-content/45 text-xs tabular-nums">{{ store.starredCount }}</span>
        </button>
      </li>
      <li>
        <button
          type="button"
          class="flex h-9 w-full items-center justify-between rounded-full border border-transparent px-3.5 text-sm transition-colors"
          :class="isMarkedActive
            ? 'bg-base-content/8 border-base-content/5 text-base-content font-medium'
            : 'hover:bg-base-content/5 text-base-content/75'"
          @click="selectView('marked')"
        >
          <span class="flex items-center gap-2.5">
            <Icon :name="I.MARKER" :filled="isMarkedActive" class="text-lg" />
            <span>有打点</span>
          </span>
          <span class="text-base-content/45 text-xs tabular-nums">{{ store.markedCount }}</span>
        </button>
      </li>
      <li>
        <button
          type="button"
          aria-label="标签与标签管理"
          :aria-expanded="store.tagRailOpen"
          class="flex h-9 w-full items-center justify-between rounded-full border border-transparent px-3.5 text-sm transition-colors"
          :class="isTagsActive
            ? 'bg-base-content/8 border-base-content/5 text-base-content font-medium'
            : 'hover:bg-base-content/5 text-base-content/75'"
          @click="toggleTagRail"
        >
          <span class="flex items-center gap-2.5">
            <Icon :name="I.TAG" :filled="isTagsActive" class="text-lg" />
            <span>标签</span>
          </span>
          <span
            v-if="tagCount > 0"
            class="text-base-content/45 text-xs tabular-nums"
          >
            {{ tagCount }}
          </span>
        </button>
      </li>
      <li>
        <button
          type="button"
          class="flex h-9 w-full items-center justify-between rounded-full border border-transparent px-3.5 text-sm transition-colors"
          :class="isCleanupActive
            ? 'bg-base-content/8 border-base-content/5 text-base-content font-medium'
            : 'hover:bg-base-content/5 text-base-content/75'"
          @click="openCleanupPage"
        >
          <span class="flex items-center gap-2.5">
            <Icon :name="I.DELETE" :filled="isCleanupActive" class="text-lg" />
            <span>去重与清理</span>
          </span>
          <span
            v-if="duplicateGroupCount > 0"
            class="text-base-content/45 text-xs tabular-nums"
          >
            {{ duplicateGroupCount }}
          </span>
        </button>
      </li>
    </ul>

    <!-- 院线影视独立分组（与 AV 导航视觉隔离） -->
    <template v-if="store.enableCinemaLibrary">
      <div class="bg-base-content/8 my-2 h-px w-full shrink-0" />
      <ul class="flex shrink-0 flex-col gap-0.5">
        <li>
          <button
            type="button"
            class="flex h-9 w-full items-center justify-between rounded-full border border-transparent px-3.5 text-sm transition-colors"
            :class="isCinemaActive
              ? 'bg-base-content/8 border-base-content/5 text-base-content font-medium'
              : 'hover:bg-base-content/5 text-base-content/75'"
            @click="selectView('cinema')"
            @contextmenu.prevent="openNavMenu($event, { kind: 'cinema' })"
          >
            <span class="flex items-center gap-2.5">
              <Icon :name="I.FILE_VIDEO" :filled="isCinemaActive" class="text-lg" />
              <span>院线影视</span>
            </span>
            <span class="text-base-content/45 text-xs tabular-nums">{{ store.cinemaCount }}</span>
          </button>
        </li>
      </ul>
    </template>

    <div class="mt-auto pt-3">
      <div class="bg-base-content/5 mb-2 h-px w-full shrink-0" />

      <!-- 底部网盘索引与元数据刮削控制 -->
      <div class="mb-2.5 flex shrink-0 flex-col gap-2.5">
        <!-- 网盘索引分组（增量同步 + 全量同步） -->
        <div class="flex flex-col gap-1">
          <div class="text-base-content/55 flex items-center justify-between px-1 text-[11px]">
            <span>网盘索引</span>
            <span v-if="store.indexing" class="text-primary tabular-nums">
              同步 {{ store.indexProgress.fetched }}/{{ store.indexProgress.total || '...' }}
            </span>
            <span v-else class="inline-flex items-center gap-1 tabular-nums">
              <span
                :title="store.hideAdVideos && store.adEntryCount > 0 ? `共索引 ${store.entries.length} 部，已隐藏 ${store.adEntryCount} 部疑似广告` : undefined"
              >
                {{ store.visibleEntryCount }} 部
              </span>
              <Tooltip placement="right">
                <template #content>
                  <div class="flex min-w-60 max-w-68 flex-col gap-1.5 text-left text-xs leading-relaxed">
                    <div class="flex items-center justify-between gap-4 border-b border-white/10 pb-1 font-medium">
                      <span>预估总时长</span>
                      <span class="tabular-nums">{{ libraryDurationStats.totalLabel }}</span>
                    </div>
                    <div
                      v-for="item in libraryDurationStats.categories"
                      :key="item.key"
                      class="flex items-center justify-between gap-4 text-[11px] opacity-85"
                    >
                      <span>{{ item.label }} ({{ item.count }})</span>
                      <span class="tabular-nums">{{ item.durationLabel }}</span>
                    </div>
                    <div class="border-t border-white/10 pt-1.5">
                      <div class="flex items-center justify-between gap-2 text-[11px]">
                        <span class="opacity-60">片库称号</span>
                        <span class="text-primary font-medium">{{ libraryDurationStats.persona.title }}</span>
                      </div>
                      <p class="mt-0.5 text-[11px] leading-relaxed opacity-75">
                        {{ libraryDurationStats.persona.tagline }}
                      </p>
                    </div>
                    <p v-if="libraryDurationStats.missingCount > 0" class="border-t border-white/10 pt-1 text-[10px] opacity-60">
                      另有 {{ libraryDurationStats.missingCount }} 部未返回时长元数据
                    </p>
                  </div>
                </template>
                <button
                  type="button"
                  class="text-base-content/45 hover:text-base-content inline-flex items-center justify-center rounded-full transition-colors"
                  aria-label="查看各分类预估总时长"
                >
                  <Icon :name="I.ABOUT" class="text-[10px]" />
                </button>
              </Tooltip>
            </span>
          </div>

          <div class="grid grid-cols-2 gap-1">
            <Tooltip placement="right">
              <template #content>
                <span class="block max-w-56 text-left leading-relaxed">
                  增量同步索引：仅拉取新入库的视频文件，速度快；不会删除已刮削的图文与封面。
                </span>
              </template>
              <Button
                variant="ghost"
                size="xs"
                class="bg-base-content/4 hover:bg-base-content/8 h-8 w-full justify-center gap-1.5 rounded-xl px-2 text-xs font-normal"
                :disabled="store.indexing"
                @click="store.syncIndex('incremental')"
              >
                <Icon
                  :name="I.RESTART"
                  class="shrink-0 text-sm"
                  :class="store.indexing && store.indexProgress.mode === 'incremental' && 'animate-spin'"
                />
                <span>增量同步</span>
              </Button>
            </Tooltip>

            <Tooltip placement="right">
              <template #content>
                <span class="block max-w-56 text-left leading-relaxed">
                  全量重建索引：重扫已配置目录视频清单，清理已删除文件并刷新老文件番号、标签与入库时间；不会删除已刮削的图文与封面。
                </span>
              </template>
              <Button
                variant="ghost"
                size="xs"
                class="bg-base-content/4 hover:bg-base-content/8 h-8 w-full justify-center gap-1.5 rounded-xl px-2 text-xs font-normal"
                :disabled="store.indexing"
                @click="store.syncIndex('full')"
              >
                <Icon
                  :name="I.RESET_ALL"
                  class="shrink-0 text-sm"
                  :class="store.indexing && store.indexProgress.mode === 'full' && 'animate-spin'"
                />
                <span>全量同步</span>
              </Button>
            </Tooltip>
          </div>

          <Button
            variant="ghost"
            size="xs"
            class="bg-base-content/4 hover:bg-base-content/8 h-7 w-full justify-between rounded-xl px-2.5 text-[11px] font-normal"
            :disabled="store.indexing"
            title="选择索引与刮削根目录（支持多选，不选默认全盘）"
            @click="store.configureIndexRootFolders()"
          >
            <span class="text-base-content/65 flex items-center gap-1.5">
              <Icon :name="I.FOLDER_OPEN" class="text-xs" />
              <span>扫描目录</span>
            </span>
            <span class="text-base-content/85 font-medium tabular-nums">
              {{ store.indexRootFolders.length > 0 ? `${store.indexRootFolders.length} 个目录` : '全盘' }}
            </span>
          </Button>
        </div>

        <!-- 元数据刮削分组（后台刮削 + 重试未命中） -->
        <div class="flex flex-col gap-1">
          <div
            class="text-base-content/60 flex items-center justify-between px-1 text-[11px]"
            :title="`已刮削 ${store.scrapedCount} / ${store.totalVisibleEntryCount}，待刮削 ${store.bgScrapePendingCount}，负缓存跳过 ${store.missedScrapeCount}`"
          >
            <span class="tabular-nums">已刮削 {{ store.scrapedCount }} / {{ store.totalVisibleEntryCount }}</span>
            <span v-if="store.bgScrapeState === 'circuit_open'" class="text-warning">
              已熔断暂停
            </span>
            <span v-else-if="store.scrapingCount > 0" class="text-primary tabular-nums">
              刮削中 {{ store.scrapingCount }}
            </span>
          </div>

          <div
            v-if="store.bgScrapePendingCount > 0 || store.bgScrapeState === 'running' || store.bgScrapeState === 'circuit_open' || store.missedScrapeCount > 0"
            class="flex items-center gap-1"
          >
            <template v-if="store.bgScrapePendingCount > 0 || store.bgScrapeState === 'running' || store.bgScrapeState === 'circuit_open'">
              <Tooltip v-if="store.bgScrapeState === 'running'" placement="right">
                <template #content>
                  <span class="block max-w-56 text-left leading-relaxed">
                    低速单并发后台刮削中（视口优先插队），点击暂停。
                  </span>
                </template>
                <Button
                  variant="ghost"
                  size="sm"
                  class="bg-base-content/4 hover:bg-base-content/8 text-primary h-8 min-w-0 flex-1 justify-start gap-2 rounded-xl px-2.5 text-xs font-normal"
                  @click="store.pauseBackgroundScrape()"
                >
                  <Icon :name="I.PAUSE" class="shrink-0 text-base" />
                  <span class="truncate tabular-nums">暂停刮削 (余 {{ store.bgScrapePendingCount }})</span>
                </Button>
              </Tooltip>

              <Tooltip v-else placement="right">
                <template #content>
                  <span class="block max-w-56 text-left leading-relaxed">
                    {{
                      store.bgScrapeReason
                        ? `${store.bgScrapeReason}；点击继续刮削剩余未匹配作品。`
                        : '后台刮削：低速补齐库中所有尚未匹配图文的视频（含老文件），自动跳过已匹配作品，不会删除已有图文。'
                    }}
                  </span>
                </template>
                <Button
                  variant="ghost"
                  size="sm"
                  class="bg-base-content/4 hover:bg-base-content/8 h-8 min-w-0 flex-1 justify-start gap-2 rounded-xl px-2.5 text-xs font-normal"
                  :class="store.bgScrapeState === 'circuit_open' ? 'text-warning' : ''"
                  @click="store.startBackgroundScrape()"
                >
                  <Icon :name="I.PLAY" class="shrink-0 text-base" />
                  <span class="truncate tabular-nums">
                    {{ store.bgScrapeState === 'paused' || store.bgScrapeState === 'circuit_open' ? `继续刮削 (${store.bgScrapePendingCount})` : `后台刮削 (${store.bgScrapePendingCount})` }}
                  </span>
                </Button>
              </Tooltip>

              <Tooltip v-if="store.missedScrapeCount > 0" placement="right">
                <template #content>
                  <span class="block max-w-56 text-left leading-relaxed">
                    清除 {{ store.missedScrapeCount }} 条未命中负缓存并重新刮削（仅重跑未匹配作品，不影响已匹配图文）。
                  </span>
                </template>
                <Button
                  variant="ghost"
                  size="xs"
                  class="bg-base-content/4 hover:bg-base-content/8 text-base-content/70 hover:text-base-content h-8 shrink-0 rounded-xl px-2 text-xs font-normal tabular-nums"
                  :disabled="store.bgScrapeState === 'running'"
                  @click="store.retryMissedScrapes()"
                >
                  重试({{ store.missedScrapeCount }})
                </Button>
              </Tooltip>
            </template>

            <Tooltip v-else placement="right">
              <template #content>
                <span class="block max-w-56 text-left leading-relaxed">
                  清除 {{ store.missedScrapeCount }} 条未命中负缓存并重新刮削（仅重跑未匹配作品，不影响已匹配图文）。
                </span>
              </template>
              <Button
                variant="ghost"
                size="sm"
                class="bg-base-content/4 hover:bg-base-content/8 h-8 min-w-0 flex-1 justify-start gap-2 rounded-xl px-2.5 text-xs font-normal"
                @click="store.retryMissedScrapes()"
              >
                <Icon :name="I.RESTART" class="shrink-0 text-base" />
                <span class="truncate tabular-nums">重试未命中 ({{ store.missedScrapeCount }})</span>
              </Button>
            </Tooltip>
          </div>

          <p
            v-if="store.bgScrapeState === 'circuit_open' && store.bgScrapeReason"
            class="text-warning/85 line-clamp-2 px-1 text-[10px] leading-snug"
            :title="store.bgScrapeReason"
          >
            {{ store.bgScrapeReason }}
          </p>
        </div>
      </div>

      <!-- 网盘容量空间条 -->
      <div
        v-show="spaceInfo.state?.state === true"
        class="mb-2 flex shrink-0 flex-col gap-1 px-1"
      >
        <div class="text-base-content/55 flex items-baseline justify-between text-[11px] tabular-nums">
          <span class="text-base-content/80 font-medium">
            {{ format.fileSize(spaceInfo?.state?.data?.space_info?.all_use?.size ?? 0) }}
          </span>
          <span>{{ format.fileSize(spaceInfo?.state?.data?.space_info?.all_total?.size ?? 0) }}</span>
        </div>
        <progress
          class="progress progress-xs progress-primary w-full"
          :max="100"
          :value="spacePercent"
        />
      </div>
    </div>

    <ActionMenu
      aria-label="栏目操作菜单"
      :groups="navMenuGroups"
      :open="navMenuOpen"
      :position="navMenuPosition"
      @update:open="navMenuOpen = $event"
    />
  </div>
</template>

<script setup lang="ts">
import type { ActionMenuGroup } from '@115master/ui'
import type { LibraryView } from '@/utils/mediaIndex'
import type { CustomScrapeMode } from '@/utils/userSettings'
import { ActionMenu, Button, Tooltip } from '@115master/ui'
import { format } from '@115master/utils'
import { computed, h, shallowRef } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import LogoWordmark from '@/assets/logo-wordmark-inline.svg?component'
import { useToast } from '@/components'
import { useCloudDownloadAction } from '@/hooks/useDriveAction/useCloudDownloadAction'
import { I, Icon } from '@/icons'
import { useDriveSpaceInfoStore } from '@/store/driveSpaceInfo'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { useTagStore } from '@/store/tagList'
import { buildLibraryDurationStats } from './durationStats'

const route = useRoute()
const router = useRouter()
const store = useMediaLibraryStore()
const tagStore = useTagStore()
const spaceInfo = useDriveSpaceInfoStore()
const cloudAction = useCloudDownloadAction()
const toast = useToast()

const spacePercent = computed(() => {
  const allUse = spaceInfo?.state?.data?.space_info?.all_use?.size ?? 0
  const allTotal = spaceInfo?.state?.data?.space_info?.all_total?.size ?? 1
  return Number((allUse / allTotal * 100).toFixed(2))
})

const libraryDurationStats = computed(() =>
  buildLibraryDurationStats(store.entries, store.customSections),
)

const isWallRoute = computed(() => route.name === 'library')
const isActorsActive = computed(() => route.name === 'library-actors')
const isCleanupActive = computed(() => route.name === 'library-cleanup')
const visibleActorCount = computed(() =>
  store.libraryIndex.actorStats.filter(actor => !store.isActorHidden(actor.key)).length,
)
const duplicateGroupCount = computed(() => store.duplicateGroups.length)
const isTagsActive = computed(() =>
  store.tagRailOpen || route.name === 'library-tags' || Boolean(store.filter.driveLabel),
)
const tagCount = computed(() =>
  tagStore.tags.length > 0 ? tagStore.tags.length : store.libraryIndex.driveLabels.length,
)
const isAllWorksActive = computed(() =>
  isWallRoute.value && !store.tagRailOpen && store.filter.view === 'all' && !store.filter.actor && !store.filter.genre && !store.filter.driveLabel,
)
const isCinemaActive = computed(() =>
  isWallRoute.value && store.filter.view === 'cinema' && !store.filter.actor && !store.filter.genre && !store.filter.driveLabel,
)
function isSectionActive(sectionId: string): boolean {
  return isWallRoute.value && store.filter.view === `section:${sectionId}` && !store.filter.actor && !store.filter.genre && !store.filter.driveLabel
}
function scrapeModeLabel(mode: CustomScrapeMode): string {
  if (mode === 'jav')
    return '番号刮削'
  if (mode === 'cinema')
    return '院线刮削'
  if (mode === 'folder_collection')
    return '目录合集'
  return '纯本地'
}

type NavMenuTarget = { kind: 'all' } | { kind: 'cinema' } | { kind: 'section', sectionId: string }
const navMenuOpen = shallowRef(false)
const navMenuPosition = shallowRef({ x: 0, y: 0 })
const navMenuTarget = shallowRef<NavMenuTarget | null>(null)

function openNavMenu(event: MouseEvent, target: NavMenuTarget) {
  navMenuTarget.value = target
  navMenuPosition.value = { x: event.clientX, y: event.clientY }
  navMenuOpen.value = true
}

function menuIcon(name: (typeof I)[keyof typeof I]) {
  return () => h(Icon, { name, class: 'text-base' })
}

const navMenuGroups = computed<ActionMenuGroup[]>(() => {
  const target = navMenuTarget.value
  if (!target)
    return []

  if (target.kind === 'all') {
    return [[
      {
        id: 'config-jav-folders',
        label: '配置 AV 扫描目录',
        leading: menuIcon(I.FOLDER_OPEN),
        onSelect: () => {
          void store.configureCategoryFolders('jav')
        },
      },
      {
        id: 'resync-all',
        label: '全量重建索引',
        leading: menuIcon(I.RESET_ALL),
        onSelect: () => {
          void store.syncIndex('full')
        },
      },
    ]]
  }

  if (target.kind === 'cinema') {
    return [
      [
        {
          id: 'config-cinema-folders',
          label: '配置院线扫描目录',
          leading: menuIcon(I.FOLDER_OPEN),
          onSelect: () => {
            void store.configureCategoryFolders('cinema')
          },
        },
        {
          id: 'resync-cinema',
          label: '全量重建索引',
          leading: menuIcon(I.RESET_ALL),
          onSelect: () => {
            void store.syncIndex('full')
          },
        },
      ],
      [
        {
          id: 'hide-cinema',
          label: '隐藏院线影视栏目',
          leading: menuIcon(I.PREVIEW_OFF),
          onSelect: () => {
            store.enableCinemaLibrary = false
            void store.syncIndex('full')
          },
        },
      ],
    ]
  }

  const sectionId = target.sectionId
  return [
    [
      {
        id: 'edit-section',
        label: '编辑栏目与刮削规则',
        leading: menuIcon(I.RENAME),
        onSelect: () => {
          void store.editCustomSection(sectionId)
        },
      },
      {
        id: 'resync-section',
        label: '全量重建索引',
        leading: menuIcon(I.RESET_ALL),
        onSelect: () => {
          void store.syncIndex('full')
        },
      },
    ],
    [
      {
        id: 'delete-section',
        label: '删除该栏目',
        leading: menuIcon(I.DELETE),
        tone: 'destructive',
        onSelect: () => {
          void store.deleteCustomSection(sectionId)
        },
      },
    ],
  ]
})
const isStarredActive = computed(() => isWallRoute.value && store.filter.view === 'starred')
const isMarkedActive = computed(() => isWallRoute.value && store.filter.view === 'marked')

function ensureLibraryWall(view: LibraryView = 'all') {
  store.setTagRailOpen(false)
  const targetView = view === 'all' ? undefined : view
  const currentView = Array.isArray(route.query.view) ? route.query.view[0] : route.query.view
  const hasTagsQuery = Boolean(route.query.tags)
  if (route.name !== 'library' || currentView !== targetView || hasTagsQuery) {
    if (route.name !== 'library')
      store.scrollTop = 0
    void router.push({
      name: 'library',
      query: targetView ? { view: targetView } : {},
    })
    return
  }
  if (store.filter.view !== view)
    store.setView(view)
}

function selectAllWorks() {
  store.selectActor(undefined)
  store.selectGenre(undefined)
  store.selectDriveLabel(undefined)
  ensureLibraryWall('all')
}

function selectView(view: LibraryView) {
  store.selectDriveLabel(undefined)
  ensureLibraryWall(view)
}

function openActorsWall() {
  store.setTagRailOpen(false)
  if (route.name !== 'library-actors')
    void router.push({ name: 'library-actors' })
}

function openCleanupPage() {
  store.setTagRailOpen(false)
  if (route.name !== 'library-cleanup')
    void router.push({ name: 'library-cleanup' })
}

function toggleTagRail() {
  if (store.tagRailOpen) {
    store.setTagRailOpen(false)
    return
  }
  store.selectActor(undefined)
  store.selectGenre(undefined)
  if (route.name !== 'library' || route.query.tags !== '1' || route.query.view) {
    if (route.name !== 'library')
      store.scrollTop = 0
    void router.push({ name: 'library', query: { tags: '1' } })
    return
  }
  if (store.filter.view !== 'all')
    store.setView('all')
  store.setTagRailOpen(true)
}

async function openCloudDownload() {
  const ok = await cloudAction.cloudDownload()
  if (!ok)
    return
  toast.info('离线任务已提交，稍后将自动增量同步并刮削新入库作品')
  store.scheduleOfflineIncrementalSync({
    onSynced: ({ addedCount, queuedScrapeCount }) => {
      toast.success(
        queuedScrapeCount > 0
          ? `已增量入库 ${addedCount} 部新作品，正在自动刮削 ${queuedScrapeCount} 部`
          : `已增量入库 ${addedCount} 部新作品`,
      )
    },
  })
}
</script>
