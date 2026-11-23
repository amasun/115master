<template>
  <div class="text-base-content px-(--main-content-gutter) pb-16">
    <!-- 未初始化加载态 -->
    <div
      v-if="(store.initializing || store.indexing) && !entry"
      class="flex min-h-[60vh] flex-col items-center justify-center gap-3"
    >
      <Icon :name="I.LOADING" class="text-primary animate-spin text-3xl" />
      <p class="text-base-content/65 text-sm">
        正在加载影视库资料...
      </p>
    </div>

    <!-- 未找到作品 -->
    <div
      v-else-if="!entry"
      class="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4"
    >
      <Empty description="未在本地索引中找到该作品" size="lg" />
      <Button variant="soft" class="rounded-full" @click="goBackToLibrary">
        返回影视库
      </Button>
    </div>

    <!-- 详情内容 -->
    <template v-else>
      <!-- 沉浸式模糊背景头部卡片 -->
      <section class="border-base-content/8 relative overflow-hidden rounded-3xl border">
        <div
          v-if="heroImageSrc"
          class="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center opacity-25 blur-3xl"
          :style="{ backgroundImage: `url(${heroImageSrc})` }"
        />
        <div class="from-base-100/70 via-base-100/85 to-base-100 pointer-events-none absolute inset-0 bg-gradient-to-b" />

        <div class="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 sm:px-8 sm:py-7">
          <!-- 顶部操作栏 -->
          <div class="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="glass-floating"
              size="sm"
              class="gap-1.5 rounded-full px-3.5 text-xs"
              :disabled="isScraping"
              @click="handleRescrape()"
            >
              <Icon :name="isScraping ? I.LOADING : I.RESTART" class="text-sm" :class="isScraping && 'animate-spin'" />
              <span>{{ isScraping ? '刮削中...' : '重新刮削' }}</span>
            </Button>
            <Button
              variant="glass-floating"
              size="sm"
              class="gap-1.5 rounded-full px-3.5 text-xs"
              @click="toggleManualAv"
            >
              <Icon :name="I.RENAME" class="text-sm" />
              <span>指定番号</span>
            </Button>
            <Button
              variant="glass-floating"
              size="sm"
              class="gap-1.5 rounded-full px-3.5 text-xs"
              @click="store.openCoverPicker(mediaKey)"
            >
              <Icon :name="I.UPLOAD" class="text-sm" />
              <span>更换封面</span>
            </Button>
            <a
              v-if="entry.meta?.detailUrl"
              :href="entry.meta.detailUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-ghost btn-sm rounded-full text-xs"
            >
              原站详情
            </a>
          </div>

          <!-- 手动指定番号面板 -->
          <form
            v-if="showManualAv"
            class="ui-glass-surface flex flex-wrap items-center gap-2 rounded-2xl p-3"
            @submit.prevent="handleManualScrape"
          >
            <input
              v-model="manualAvInput"
              type="text"
              placeholder="输入正确的番号（例如 SSIS-001）"
              class="input input-sm input-bordered bg-base-100/80 min-w-48 flex-1 rounded-full font-mono text-xs"
            >
            <Button
              type="submit"
              color="primary"
              size="sm"
              class="rounded-full px-4 text-xs"
              :disabled="!manualAvInput.trim() || isScraping"
            >
              重新匹配
            </Button>
            <span v-if="scrapeHint" class="text-warning text-xs">{{ scrapeHint }}</span>
          </form>

          <!-- 主封面与核心元数据 -->
          <div class="flex flex-col gap-6 md:flex-row md:items-start">
            <!-- 主封面（自定义封面优先，否则 WebP 缩略图瞬时占位 + 高清原图异步升级） -->
            <div class="group bg-base-300/70 relative aspect-[3/2] w-full shrink-0 overflow-hidden rounded-2xl shadow-lg md:w-[420px]">
              <img
                v-if="customCoverUrl"
                :src="customCoverUrl"
                :alt="displayTitle"
                class="relative z-1 size-full object-cover"
              >
              <template v-else>
                <img
                  v-if="thumbUrl"
                  :src="thumbUrl"
                  :alt="displayTitle"
                  class="absolute inset-0 size-full object-cover"
                >
                <Image
                  v-if="coverLoader"
                  :src="entry.meta?.coverUrl || thumbUrl || ''"
                  :alt="displayTitle"
                  :loader="coverLoader"
                  :fallback="coverFallback"
                  class="relative z-1 size-full"
                  fit="cover"
                />
                <div
                  v-else-if="!thumbUrl"
                  class="text-base-content/35 flex size-full flex-col items-center justify-center gap-2"
                >
                  <Icon :name="I.LIBRARY" class="text-4xl" />
                  <span v-if="entry.externalId" class="font-mono text-xs">{{ entry.externalId }}</span>
                </div>
              </template>
              <button
                type="button"
                title="更换封面"
                aria-label="更换封面"
                class="btn btn-xs border-base-content/15 absolute right-2.5 bottom-2.5 z-2 gap-1 rounded-full border bg-black/75 px-2.5 text-white opacity-0 shadow-sm backdrop-blur-xs transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-black/90"
                @click.stop="store.openCoverPicker(mediaKey)"
              >
                <Icon :name="I.RENAME" class="text-xs" />
                <span>更换封面</span>
              </button>
            </div>

            <!-- 标题与简介元信息 -->
            <div class="flex min-w-0 flex-1 flex-col gap-4">
              <div class="flex flex-col gap-2">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    v-if="entry.externalId"
                    class="badge badge-primary badge-soft font-mono text-xs font-semibold"
                  >
                    {{ entry.externalId }}
                  </span>
                  <span v-if="entry.meta?.source" class="badge badge-neutral badge-soft text-xs">
                    {{ entry.meta.source }}
                  </span>
                  <span v-if="entry.files.length > 1" class="badge badge-accent badge-soft text-xs">
                    {{ entry.files.length }} 个版本
                  </span>
                  <span
                    v-if="entry.starred"
                    class="badge badge-warning badge-soft gap-1 text-xs"
                    title="已星标收藏"
                  >
                    <Icon :name="I.STAR_FILL" class="text-xs" />
                    <span>已收藏</span>
                  </span>
                  <button
                    v-for="label in entry.driveLabels"
                    :key="label.id"
                    type="button"
                    class="badge bg-base-content/10 cursor-pointer border-none text-xs transition-opacity hover:opacity-90"
                    :style="label.color ? { backgroundColor: label.color } : undefined"
                    :title="`按网盘标签「${label.name}」筛选`"
                    @click="openDriveLabelInLibrary(label.id)"
                  >
                    {{ label.name }}
                  </button>
                </div>
                <h1 class="text-base-content text-xl leading-snug font-bold sm:text-2xl">
                  {{ displayTitle }}
                </h1>
              </div>

              <!-- 关键指标 -->
              <div class="text-base-content/75 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm">
                <span v-if="entry.meta?.releaseDate" class="flex items-center gap-1.5">
                  <Icon :name="I.CALENDAR" class="text-base-content/50 text-base" />
                  <span>{{ entry.meta.releaseDate }}</span>
                </span>
                <span v-if="durationDisplay" class="flex items-center gap-1.5">
                  <Icon :name="I.HISTORY" class="text-base-content/50 text-base" />
                  <span>{{ durationDisplay }}</span>
                </span>
                <span class="flex items-center gap-1.5">
                  <Icon :name="I.SORT_DATABASE" class="text-base-content/50 text-base" />
                  <span>{{ format.fileSize(entry.totalSize) }}</span>
                </span>
                <span v-if="entry.meta?.rating" class="flex items-center gap-1">
                  <Icon :name="I.STAR_RATING" class="text-warning text-base" />
                  <span class="font-medium">{{ entry.meta.rating }}</span>
                </span>
              </div>

              <!-- 导演 -->
              <div v-if="entry.meta?.directors.length" class="flex flex-wrap items-center gap-2 text-xs">
                <span class="text-base-content/50">导演</span>
                <button
                  v-for="director in entry.meta.directors"
                  :key="director"
                  type="button"
                  class="badge badge-ghost hover:badge-primary cursor-pointer rounded-full transition-colors"
                  @click="openDirectorInLibrary(director)"
                >
                  {{ director }}
                </button>
              </div>

              <!-- 题材标签胶囊 -->
              <div v-if="entry.meta?.genres.length" class="flex flex-wrap gap-1.5">
                <button
                  v-for="genre in entry.meta.genres"
                  :key="genre"
                  type="button"
                  class="badge badge-neutral badge-soft hover:badge-primary cursor-pointer rounded-full text-xs transition-colors"
                  @click="openGenreInLibrary(genre)"
                >
                  {{ genre }}
                </button>
              </div>

              <!-- 快捷播放与轻量操作按钮 -->
              <div v-if="activeFile" class="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  color="primary"
                  class="gap-2 rounded-full px-6"
                  @click="playAt(activeFile.pickCode)"
                >
                  <Icon :name="I.PLAY" class="text-lg" />
                  <span>MASTER 播放</span>
                </Button>
                <Button
                  variant="soft"
                  shape="circle"
                  :title="activeFile.starred ? '取消星标' : '星标收藏'"
                  :aria-label="activeFile.starred ? '取消星标' : '星标收藏'"
                  :class="activeFile.starred ? 'text-warning' : ''"
                  @click="fileActions.toggleStar(activeFile)"
                >
                  <Icon :name="activeFile.starred ? I.STAR_FILL : I.STAR" class="text-lg" />
                </Button>
                <Button
                  variant="soft"
                  shape="circle"
                  title="打标签"
                  aria-label="打标签"
                  @click="fileActions.editTags(activeFile)"
                >
                  <Icon :name="I.TAG" class="text-lg" />
                </Button>
                <Button
                  variant="soft"
                  shape="circle"
                  title="更多文件操作"
                  aria-label="更多文件操作"
                  @click="openFileMenu($event, activeFile)"
                >
                  <Icon :name="I.MORE" class="text-lg" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="mx-auto flex w-full max-w-6xl flex-col gap-8 pt-6">
        <!-- 演员横排 -->
        <section v-if="entry.meta?.actors.length" class="flex flex-col gap-3">
          <h2 class="text-base-content text-base font-semibold">
            演员
          </h2>
          <div class="flex flex-wrap gap-3">
            <div
              v-for="actor in entry.meta.actors"
              :key="actor.name"
              class="group bg-base-200/60 hover:bg-base-200 border-base-content/6 inline-flex items-center gap-1 rounded-full border py-1.5 pr-2.5 pl-1.5 transition-colors"
              @contextmenu.prevent="store.openAvatarPicker({ name: actor.name, avatarUrl: actor.avatarUrl })"
            >
              <button
                type="button"
                class="flex items-center gap-2.5 text-left"
                @click="openActorInLibrary(actor.name)"
              >
                <img
                  v-if="getActorAvatar(actor) && !failedActorAvatars.has(actor.name)"
                  :src="getActorAvatar(actor)"
                  :alt="actor.name"
                  referrerpolicy="no-referrer"
                  class="size-9 rounded-full object-cover object-top"
                  @error="markActorAvatarFailed(actor.name)"
                >
                <span
                  v-else
                  class="bg-base-content/10 text-base-content/65 flex size-9 items-center justify-center rounded-full text-xs font-semibold"
                >
                  {{ actor.name.slice(0, 1) }}
                </span>
                <span class="pr-1 text-sm font-medium">{{ actor.name }}</span>
              </button>
              <button
                type="button"
                title="更换演员头像"
                aria-label="更换演员头像"
                class="btn btn-ghost btn-circle btn-xs text-base-content/50 hover:text-base-content opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                @click.stop="store.openAvatarPicker({ name: actor.name, avatarUrl: actor.avatarUrl })"
              >
                <Icon :name="I.RENAME" class="text-xs" />
              </button>
            </div>
          </div>
        </section>

        <!-- 版本与网盘文件列表 -->
        <section class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base-content text-base font-semibold">
                网盘文件版本 ({{ entry.files.length }})
              </h2>
              <template v-if="entry.files.length > 1">
                <span
                  v-if="hasExactSha1Duplicate"
                  class="badge badge-error badge-soft badge-xs rounded-full"
                >
                  SHA1 重复
                </span>
                <span
                  v-else
                  class="badge badge-warning badge-soft badge-xs rounded-full"
                >
                  多源版本
                </span>
                <span
                  v-if="isDetailMultiPart"
                  class="badge badge-warning badge-outline badge-xs rounded-full"
                >
                  疑似分段 (CD1/CD2)
                </span>
              </template>
            </div>

            <Button
              v-if="entry.files.length > 1"
              size="xs"
              :variant="dedupeMode ? 'soft' : 'ghost'"
              :color="dedupeMode ? 'primary' : 'neutral'"
              class="rounded-full"
              @click="toggleDetailDedupeMode"
            >
              {{ dedupeMode ? '退出去重' : '去重管理' }}
            </Button>
          </div>

          <div class="flex flex-col gap-2">
            <div
              v-for="(file, index) in entry.files"
              :key="file.fid"
              class="border-base-content/8 flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors"
              :class="dedupeMode
                ? (keepFileFids.has(file.fid) ? 'bg-success/8 border-success/30' : 'bg-error/10 border-error/30')
                : (index === activeFileIndex
                  ? 'bg-primary/8 border-primary/35'
                  : 'bg-base-200/40 hover:bg-base-200/70')"
              @click="dedupeMode ? toggleKeepDetailFile(file.fid) : (activeFileIndex = index)"
            >
              <div class="flex min-w-0 flex-1 items-center gap-3">
                <label
                  v-if="dedupeMode"
                  class="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs"
                  @click.stop
                >
                  <input
                    type="checkbox"
                    class="checkbox checkbox-xs checkbox-success"
                    :checked="keepFileFids.has(file.fid)"
                    @change="toggleKeepDetailFile(file.fid)"
                  >
                  <span :class="keepFileFids.has(file.fid) ? 'text-success font-medium' : 'text-error'">
                    {{ keepFileFids.has(file.fid) ? '保留' : '删除' }}
                  </span>
                </label>

                <div class="flex min-w-0 flex-1 flex-col gap-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span
                      v-if="entry.files.length > 1"
                      class="badge badge-xs rounded-full"
                      :class="index === activeFileIndex ? 'badge-primary' : 'badge-ghost'"
                    >
                      版本 {{ index + 1 }}
                    </span>
                    <span
                      v-if="dedupeMode && dedupeScoreByFid.get(file.fid)?.recommendedKeep"
                      class="badge badge-success badge-soft badge-xs rounded-full"
                    >
                      推荐保留
                    </span>
                    <span
                      v-for="reason in (dedupeMode ? (dedupeScoreByFid.get(file.fid)?.keepReasons.slice(0, 2) ?? []) : [])"
                      :key="reason"
                      class="badge badge-ghost badge-xs rounded-full"
                    >
                      {{ reason }}
                    </span>
                    <span class="truncate text-sm font-medium">{{ file.name }}</span>
                  </div>
                  <div class="text-base-content/55 flex flex-wrap items-center gap-3 text-xs">
                    <span>{{ format.fileSize(file.size) }}</span>
                    <span v-if="file.duration > 0">{{ formatTime(file.duration) }}</span>
                    <span v-if="file.mtime > 0">{{ format.dateTime(file.mtime) }}</span>
                  </div>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-1.5">
                <Button
                  color="primary"
                  variant="soft"
                  size="sm"
                  class="gap-1 rounded-full px-3 text-xs"
                  @click.stop="playAt(file.pickCode)"
                >
                  <Icon :name="I.PLAY" class="text-sm" />
                  <span>播放</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  shape="circle"
                  title="文件操作"
                  aria-label="文件操作"
                  @click.stop="openFileMenu($event, file)"
                >
                  <Icon :name="I.MORE" class="text-base" />
                </Button>
              </div>
            </div>
          </div>

          <!-- 详情页内嵌去重操作栏 -->
          <div
            v-if="dedupeMode && entry.files.length > 1"
            class="bg-base-200/55 border-base-content/8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs"
          >
            <label class="text-base-content/80 flex cursor-pointer items-center gap-2">
              <input
                v-model="dedupeDeleteEmptyParent"
                type="checkbox"
                class="checkbox checkbox-xs checkbox-primary"
              >
              <span>同时安全删除空/独立父目录（仅在目录无其他作品与子目录时生效）</span>
            </label>

            <div class="flex items-center gap-2">
              <span class="text-base-content/60 tabular-nums">
                保留 {{ keepFileFids.size }} 个 · 删除 {{ detailFilesToDelete.length }} 个
              </span>
              <Button
                size="sm"
                color="error"
                class="rounded-full"
                :disabled="detailFilesToDelete.length === 0 || dedupeDeleting"
                @click="executeDetailDedupe"
              >
                {{ dedupeDeleting ? '清理中...' : `删除未保留的 ${detailFilesToDelete.length} 个版本` }}
              </Button>
            </div>
          </div>
        </section>

        <!-- 时间分段截图（优先命中本机 video_cover_cache_v1 历史缓存） -->
        <section v-if="activeFile" class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-base-content text-base font-semibold">
              时间分段截图
              <span class="text-base-content/50 ml-1 text-xs font-normal">点击截图从对应时间点起播</span>
            </h2>
            <Button
              v-if="timelineError"
              variant="ghost"
              size="xs"
              class="rounded-full"
              @click="loadTimelineCovers(activeFile)"
            >
              重试生成
            </Button>
          </div>

          <div
            v-if="timelineLoading"
            class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6"
          >
            <div
              v-for="n in previewSlotCount"
              :key="n"
              class="skeleton aspect-video w-full rounded-xl"
            />
          </div>

          <div
            v-else-if="timelineError"
            class="bg-base-200/45 border-base-content/8 rounded-2xl border p-4"
          >
            <StatusFeedback
              status="info"
              size="xs"
              :padded="false"
              :message="typeof timelineError === 'string' ? timelineError : errorFeedback(timelineError).message"
            />
          </div>

          <div
            v-else-if="timelineCovers.length > 0"
            class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6"
          >
            <button
              v-for="item in timelineCovers"
              :key="item.seekTime"
              type="button"
              class="group bg-base-300 relative aspect-video overflow-hidden rounded-xl text-left transition-transform hover:scale-[1.02]"
              @click="playAt(activeFile.pickCode, item.seekTime)"
            >
              <img
                :src="item.img"
                :alt="`时间点 ${formatTime(item.seekTime)}`"
                class="size-full object-cover"
              >
              <span class="absolute right-1.5 bottom-1.5 rounded-full bg-black/70 px-2 py-0.5 font-mono text-[11px] text-white">
                {{ formatTime(item.seekTime) }}
              </span>
              <span class="bg-primary/90 text-primary-content absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-[10px] opacity-0 transition-opacity group-hover:opacity-100">
                从此播放
              </span>
            </button>
          </div>

          <p v-else class="text-base-content/50 text-xs">
            当前文件暂未提供时长或 SHA1 信息，无法生成时间分段截图。
          </p>
        </section>

        <!-- 已保存打点列表 -->
        <section v-if="activeFile && activeMarkers.length > 0" class="flex flex-col gap-3">
          <h2 class="text-base-content text-base font-semibold">
            播放打点 ({{ activeMarkers.length }})
          </h2>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="marker in activeMarkers"
              :key="marker.id"
              type="button"
              class="bg-base-200/65 hover:bg-primary/15 hover:border-primary/40 border-base-content/8 flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs transition-colors"
              @click="playAt(activeFile.pickCode, marker.time)"
            >
              <Icon :name="I.MARKER" class="text-secondary text-sm" />
              <span class="font-mono font-medium">{{ formatTime(marker.time) }}</span>
              <span v-if="marker.label" class="text-base-content/75 max-w-48 truncate">
                {{ marker.label }}
              </span>
            </button>
          </div>
        </section>

        <!-- 官方预览剧照画廊 -->
        <section v-if="visiblePreviews.length > 0" class="flex flex-col gap-3">
          <h2 class="text-base-content text-base font-semibold">
            官方剧照 ({{ visiblePreviews.length }})
          </h2>
          <div
            ref="previewGalleryRef"
            class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          >
            <a
              v-for="preview in visiblePreviews"
              :key="preview.key"
              :href="preview.src"
              class="bg-base-300/60 aspect-video overflow-hidden rounded-xl transition-opacity hover:opacity-85"
            >
              <Image
                :src="preview.src"
                alt="官方剧照"
                :loader="preview.loader"
                :fallback="preview.fallback"
                class="size-full"
                fit="cover"
                lazy
              />
            </a>
          </div>
        </section>
      </div>
    </template>

    <ActionMenu
      aria-label="文件操作"
      :groups="fileMenuGroups"
      :open="fileMenuOpen"
      :position="fileMenuPosition"
      @update:open="fileMenuOpen = $event"
    />
  </div>
</template>

<script setup lang="ts">
import type { VideoCover } from '@/hooks/useVideoCover'
import type { Marker } from '@/utils/markers/types'
import type { LibraryFileItem, MediaActor, MediaPreview, PosterThumbResource } from '@/utils/mediaIndex'
import { Core } from '@115master/drive115'
import { ActionMenu, Button, Empty, Image, StatusFeedback } from '@115master/ui'
import { format } from '@115master/utils'
import { useTitle } from '@vueuse/core'
import PhotoSwipe from 'photoswipe'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import { computed, h, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppDialog } from '@/app/dialog'
import { useToast } from '@/components'
import { formatTime } from '@/components/XPlayer/utils/time'
import { FRIENDLY_ERROR_MESSAGE } from '@/constants'
import { calculateVideoCoverTimes, getVideoCover } from '@/hooks/useVideoCover'
import { I, Icon } from '@/icons'
import { useLibraryFileActions } from '@/pages/library/useLibraryFileActions'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { markerStore } from '@/utils/cache/markerStore'
import { drive115 } from '@/utils/drive115Instance'
import { errorFeedback } from '@/utils/errorFeedback'
import { createGMImageFallbackLoader } from '@/utils/imageLoader'
import { syncMarkersFromFileDesc } from '@/utils/markers'
import {
  getCoverCandidates,
  isSuspectedMultiPartGroup,
  loadCustomFullCoverUrl,
  loadPosterThumbUrl,
  safeDeleteFiles,
  scoreEntryFilesForDedupe,
} from '@/utils/mediaIndex'
import { userSettings, useUserSetting } from '@/utils/userSettings'
import 'photoswipe/style.css'

const route = useRoute('library-detail')
const router = useRouter()
const store = useMediaLibraryStore()
const dialog = useAppDialog()
const toast = useToast()
const fileActions = useLibraryFileActions()
const previewCountSetting = useUserSetting('filelistPreviewCount')

const mediaKey = computed(() => String(route.params.mediaKey ?? ''))
const entry = computed(() => store.getEntry(mediaKey.value))

const activeFileIndex = shallowRef(0)
const activeFile = computed(() => entry.value?.files[activeFileIndex.value] ?? entry.value?.files[0])

/** 详情页内嵌多源去重状态 */
const dedupeMode = shallowRef(false)
const keepFileFids = ref(new Set<string>())
const dedupeDeleteEmptyParent = shallowRef(false)
const dedupeDeleting = shallowRef(false)

const dedupeScoredFiles = computed(() => {
  const files = entry.value?.files ?? []
  if (files.length <= 1)
    return []
  const markerMap = new Map<string, number>()
  for (const f of files) {
    const doc = store.markerDocs[f.pickCode]
    const count = doc?.markers?.filter(m => !m.deleted).length ?? 0
    if (count > 0)
      markerMap.set(f.pickCode, count)
  }
  return scoreEntryFilesForDedupe(files, markerMap)
})

const dedupeScoreByFid = computed(() => {
  const map = new Map<string, (typeof dedupeScoredFiles.value)[number]>()
  for (const item of dedupeScoredFiles.value)
    map.set(item.file.fid, item)
  return map
})

const hasExactSha1Duplicate = computed(() => {
  const seen = new Set<string>()
  for (const file of entry.value?.files ?? []) {
    const sha1 = file.sha1?.trim().toUpperCase()
    if (!sha1)
      continue
    if (seen.has(sha1))
      return true
    seen.add(sha1)
  }
  return false
})

const isDetailMultiPart = computed(() => {
  const files = entry.value?.files ?? []
  return files.length > 1 && isSuspectedMultiPartGroup(files.map(f => f.name))
})

const detailFilesToDelete = computed(() =>
  (entry.value?.files ?? []).filter(file => !keepFileFids.value.has(file.fid)),
)

function toggleDetailDedupeMode() {
  dedupeMode.value = !dedupeMode.value
  if (!dedupeMode.value)
    return
  const files = entry.value?.files ?? []
  if (isDetailMultiPart.value) {
    keepFileFids.value = new Set(files.map(f => f.fid))
    return
  }
  const recommended = dedupeScoredFiles.value.find(item => item.recommendedKeep)?.file ?? files[0]
  keepFileFids.value = recommended ? new Set([recommended.fid]) : new Set()
}

function toggleKeepDetailFile(fid: string) {
  const next = new Set(keepFileFids.value)
  if (next.has(fid))
    next.delete(fid)
  else
    next.add(fid)
  keepFileFids.value = next
}

async function executeDetailDedupe() {
  const targets = detailFilesToDelete.value
  if (targets.length === 0 || dedupeDeleting.value)
    return

  if (keepFileFids.value.size === 0) {
    const warnConfirmed = await dialog.confirm({
      title: '危险操作确认',
      content: '您当前未保留任何版本，继续操作将删除该作品的全部网盘文件！确定继续吗？',
      confirmText: '仍然删除全部',
      cancelText: '返回调整',
    })
    if (!warnConfirmed)
      return
  }
  else {
    const confirmed = await dialog.confirm({
      title: '确认清理冗余版本',
      content: dedupeDeleteEmptyParent.value
        ? `将移入回收站 ${targets.length} 个未保留版本，并尝试安全清理空/独立父目录，确定继续吗？`
        : `确定将 ${targets.length} 个未保留版本移入 115 回收站吗？`,
      confirmText: '移入回收站',
      cancelText: '取消',
    })
    if (!confirmed)
      return
  }

  dedupeDeleting.value = true
  try {
    const res = await safeDeleteFiles(targets, {
      deleteEmptyParent: dedupeDeleteEmptyParent.value,
      allIndexedVideos: store.videos,
    })
    if (res.deletedFileIds.length > 0) {
      await store.applyFilesDelete(res.deletedFileIds)
      activeFileIndex.value = 0
      dedupeMode.value = false
      if (!store.getEntry(mediaKey.value)) {
        toast.success('已清理全部选中版本，返回影视库')
        void router.push({ name: 'library' })
        return
      }
    }

    const parts = [`已将 ${res.deletedFileIds.length} 个版本移入回收站`]
    if (res.deletedFolders.length > 0)
      parts.push(`安全清理 ${res.deletedFolders.length} 个父目录`)
    if (res.skippedFolders.length > 0)
      parts.push(`保留 ${res.skippedFolders.length} 个非空或受保护父目录`)
    if (res.deletedFileIds.length > 0)
      toast.success(parts.join('，'))
    else
      toast.error('清理失败，未成功删除文件')
  }
  finally {
    dedupeDeleting.value = false
  }
}
const fileMenuTarget = shallowRef<LibraryFileItem | undefined>(undefined)
const fileMenuOpen = shallowRef(false)
const fileMenuPosition = shallowRef({ x: 0, y: 0 })

const fileMenuGroups = fileActions.buildFileMenuGroups(
  () => fileMenuTarget.value,
  {
    hooks: {
      onDeleted: () => {
        if (!store.getEntry(mediaKey.value))
          void router.push({ name: 'library' })
      },
    },
  },
)

function openFileMenu(event: MouseEvent, file: LibraryFileItem) {
  fileMenuTarget.value = file
  const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  fileMenuPosition.value = rect
    ? { x: rect.left, y: rect.bottom + 4 }
    : { x: event.clientX, y: event.clientY }
  fileMenuOpen.value = true
}

const customCoverUrl = shallowRef('')
const thumbUrl = shallowRef('')
const showManualAv = shallowRef(false)
const manualAvInput = shallowRef('')
const scrapeHint = shallowRef('')

const timelineCovers = shallowRef<VideoCover[]>([])
const timelineLoading = shallowRef(false)
const timelineError = shallowRef<unknown>(null)

const activeMarkers = shallowRef<Marker[]>([])
const failedActorAvatars = ref(new Set<string>())
const failedPreviews = ref(new Set<string>())

const previewGalleryRef = ref<HTMLElement | null>(null)
let lightbox: PhotoSwipeLightbox | null = null
let thumbController: AbortController | null = null
let thumbResource: PosterThumbResource | null = null
let customCoverResource: PosterThumbResource | null = null
let customCoverRequestId = 0
let timelineRequestId = 0

const previewSlotCount = computed(() => {
  const count = Number(previewCountSetting.value)
  return Number.isInteger(count) && count > 0 ? count : 6
})

const displayTitle = computed(() =>
  entry.value?.meta?.title
  || entry.value?.externalId
  || activeFile.value?.name
  || '影片详情',
)

const isScraping = computed(() => store.scrapingKeys.has(mediaKey.value))

const durationDisplay = computed(() => {
  if (entry.value?.maxDuration && entry.value.maxDuration > 0)
    return formatTime(entry.value.maxDuration)
  if (entry.value?.meta?.duration)
    return format.duration(entry.value.meta.duration)
  return ''
})

useTitle(computed(() => `${displayTitle.value} · 影视库`))

const coverCandidates = computed(() => getCoverCandidates(entry.value?.meta))

const coverLoader = computed(() => {
  if (coverCandidates.value.length === 0)
    return undefined
  return createGMImageFallbackLoader(coverCandidates.value, {
    transform: { maxWidth: 1440, maxHeight: 1440 },
  })
})

const heroImageSrc = computed(() => customCoverUrl.value || thumbUrl.value || entry.value?.meta?.coverUrl || '')

function coverFallback() {
  if (thumbUrl.value) {
    return h('img', {
      src: thumbUrl.value,
      alt: displayTitle.value,
      class: 'size-full object-cover',
    })
  }
  return h('div', { class: 'size-full bg-base-300/40' })
}

function getActorAvatar(actor: MediaActor): string {
  return store.getActorAvatarUrl(actor)
}

function markActorAvatarFailed(name: string) {
  failedActorAvatars.value = new Set([...failedActorAvatars.value, name])
}

function getPreviewUrls(item: MediaPreview): string[] {
  return Array.from(new Set([item.raw, item.thumbnail].filter((url): url is string => Boolean(url))))
}

const visiblePreviews = computed(() => {
  const meta = entry.value?.meta
  const list = meta?.previews ?? []
  return list
    .map((item, index) => {
      const key = item.thumbnail || item.raw || String(index)
      const urls = getPreviewUrls(item)
      const candidates = urls.map(url => ({ url, referer: meta?.detailUrl }))
      return {
        key,
        src: urls[0] ?? '',
        urls,
        loader: candidates.length > 0
          ? createGMImageFallbackLoader(candidates, {
              transform: { maxWidth: 1280, maxHeight: 1280 },
            })
          : undefined,
        fallback: () => {
          let fallbackIndex = 0
          return h('img', {
            alt: '官方剧照',
            class: 'block size-full object-cover',
            referrerpolicy: 'no-referrer',
            src: urls[0] ?? '',
            onError: (event: Event) => {
              const img = event.currentTarget as HTMLImageElement
              fallbackIndex += 1
              if (urls[fallbackIndex]) {
                img.src = urls[fallbackIndex]
                return
              }
              failedPreviews.value = new Set([...failedPreviews.value, key])
            },
          })
        },
      }
    })
    .filter(item => item.src && !failedPreviews.value.has(item.key))
})

function cleanupCustomCover() {
  customCoverResource?.dispose()
  customCoverResource = null
  customCoverUrl.value = ''
}

async function refreshCustomCover() {
  customCoverRequestId += 1
  const currentId = customCoverRequestId
  cleanupCustomCover()

  const key = entry.value?.mediaKey || mediaKey.value
  if (!key)
    return

  const resource = await loadCustomFullCoverUrl(key).catch(() => null)
  if (currentId !== customCoverRequestId) {
    resource?.dispose()
    return
  }
  if (resource) {
    customCoverResource = resource
    customCoverUrl.value = resource.url
  }
}

function cleanupThumb() {
  thumbController?.abort()
  thumbController = null
  thumbResource?.dispose()
  thumbResource = null
  thumbUrl.value = ''
}

async function refreshThumb() {
  cleanupThumb()
  if (!entry.value)
    return

  const controller = new AbortController()
  thumbController = controller
  try {
    const resource = await loadPosterThumbUrl(
      entry.value.mediaKey,
      coverCandidates.value,
      controller.signal,
    )
    if (controller.signal.aborted) {
      resource?.dispose()
      return
    }
    if (resource) {
      thumbResource = resource
      thumbUrl.value = resource.url
    }
  }
  catch {
    // 取消或缩略图加载失败时交由高清封面或占位视图处理
  }
}

function revokeTimelineCovers(covers: VideoCover[]) {
  covers.forEach((item) => {
    if (item.img.startsWith('blob:'))
      URL.revokeObjectURL(item.img)
  })
}

async function loadTimelineCovers(file?: LibraryFileItem) {
  timelineRequestId += 1
  const currentId = timelineRequestId

  revokeTimelineCovers(timelineCovers.value)
  timelineCovers.value = []
  timelineError.value = null

  if (!file) {
    timelineLoading.value = false
    return
  }

  timelineLoading.value = true
  try {
    let sha1 = file.sha1 || ''
    let duration = file.duration

    // 兼容旧版 superSearch 快照：若缺失 sha1 或时长，按需查询视频信息兜底补全
    if (!sha1 || duration <= 0) {
      const info = await drive115.video.getFilesVideo({
        pickcode: file.pickCode,
        share_id: '0',
        local: '1',
      })
      if (currentId !== timelineRequestId)
        return
      sha1 = sha1 || info.sha1 || ''
      duration = duration > 0 ? duration : Number(info.play_long) || 0
    }

    if (!sha1 || duration <= 0)
      return

    const times = calculateVideoCoverTimes(duration, previewSlotCount.value)
    const covers = await getVideoCover(sha1, file.pickCode, times)
    if (currentId !== timelineRequestId) {
      revokeTimelineCovers(covers)
      return
    }
    timelineCovers.value = covers
  }
  catch (error) {
    if (currentId !== timelineRequestId)
      return
    if (
      error instanceof Core.Drive115Error
      && error.code === Core.Drive115ErrorCode.NotFoundM3u8File
    ) {
      timelineError.value = FRIENDLY_ERROR_MESSAGE.CANNOT_VIDEO_COVER_WITHOUT_TRANSCODING
      return
    }
    timelineError.value = error
  }
  finally {
    if (currentId === timelineRequestId)
      timelineLoading.value = false
  }
}

async function loadMarkers(file?: LibraryFileItem) {
  if (!file) {
    activeMarkers.value = []
    return
  }
  const applyDoc = (doc: Awaited<ReturnType<typeof markerStore.getDoc>>) => {
    if (activeFile.value?.pickCode !== file.pickCode)
      return
    activeMarkers.value = (doc?.markers ?? [])
      .filter(marker => !marker.deleted)
      .sort((a, b) => a.time - b.time)
  }

  const doc = await markerStore.getDoc(file.pickCode)
  applyDoc(doc)

  if (userSettings.value.syncMarkersToFileDesc && file.fid) {
    const merged = await syncMarkersFromFileDesc(file.fid, {
      pickCode: file.pickCode,
      fileId: file.fid,
      fileName: file.name,
      duration: file.duration,
    })
    if (merged) {
      applyDoc(merged)
      void store.refreshLocalContext()
    }
  }
}

watch(
  mediaKey,
  () => {
    activeFileIndex.value = 0
    showManualAv.value = false
    scrapeHint.value = ''
    failedActorAvatars.value = new Set()
    failedPreviews.value = new Set()
  },
)

watch(
  [
    () => entry.value?.mediaKey,
    () => entry.value?.meta?.coverUrl,
    () => entry.value?.meta?.updatedAt,
    () => store.customCoverVersions[mediaKey.value],
  ],
  () => {
    void refreshCustomCover()
    void refreshThumb()
  },
  { immediate: true },
)

watch(
  () => store.customAvatarUrls,
  () => {
    failedActorAvatars.value = new Set()
  },
)

watch(
  () => activeFile.value,
  (file) => {
    void loadTimelineCovers(file)
    void loadMarkers(file)
  },
  { immediate: true },
)

watch(
  [previewGalleryRef, () => visiblePreviews.value.length],
  async ([container, count]) => {
    lightbox?.destroy()
    lightbox = null
    if (!container || count === 0)
      return

    await nextTick()
    lightbox = new PhotoSwipeLightbox({
      gallery: container,
      children: 'a',
      pswpModule: PhotoSwipe,
      mouseMovePan: true,
      initialZoomLevel: 'fit',
      wheelToZoom: true,
    })
    lightbox.addFilter('domItemData', (itemData, element) => {
      const img = element.querySelector('img')
      if (img?.currentSrc || img?.src)
        itemData.src = img.currentSrc || img.src
      itemData.width = img?.naturalWidth
      itemData.height = img?.naturalHeight
      return itemData
    })
    lightbox.init()
  },
)

onMounted(async () => {
  await store.init()
  if (entry.value && entry.value.meta === null && entry.value.kind === 'jav')
    store.enqueueScrape(entry.value.mediaKey)
})

onUnmounted(() => {
  customCoverRequestId += 1
  timelineRequestId += 1
  cleanupCustomCover()
  cleanupThumb()
  revokeTimelineCovers(timelineCovers.value)
  lightbox?.destroy()
  lightbox = null
})

function toggleManualAv() {
  showManualAv.value = !showManualAv.value
  scrapeHint.value = ''
  if (showManualAv.value)
    manualAvInput.value = entry.value?.externalId ?? ''
}

async function handleRescrape() {
  scrapeHint.value = ''
  const result = await store.rescrape(mediaKey.value)
  if (!result)
    scrapeHint.value = '未获取到新的刮削结果'
}

async function handleManualScrape() {
  const target = manualAvInput.value.trim()
  if (!target)
    return
  scrapeHint.value = ''
  const result = await store.rescrape(mediaKey.value, target)
  if (!result) {
    scrapeHint.value = `未找到番号「${target}」的资料`
    return
  }
  showManualAv.value = false
}

function goBackToLibrary() {
  void router.push({ name: 'library' })
}

function openActorInLibrary(name: string) {
  store.resetFilters()
  store.selectActor(name)
  store.scrollTop = 0
  void router.push({ name: 'library' })
}

function openGenreInLibrary(name: string) {
  store.resetFilters()
  store.selectGenre(name)
  store.scrollTop = 0
  void router.push({ name: 'library' })
}

function openDirectorInLibrary(name: string) {
  store.resetFilters()
  store.filter.director = name
  store.scrollTop = 0
  void router.push({ name: 'library' })
}

function openDriveLabelInLibrary(labelId: string) {
  store.resetFilters()
  store.selectDriveLabel(labelId)
  store.setTagRailOpen(true)
  store.scrollTop = 0
  void router.push({ name: 'library' })
}

function playAt(pickCode: string, seconds = 0) {
  const t = Math.max(0, Math.floor(seconds))
  void router.push({
    name: 'video',
    params: { pickCode },
    query: t > 0 ? { t: String(t) } : undefined,
  })
}
</script>
