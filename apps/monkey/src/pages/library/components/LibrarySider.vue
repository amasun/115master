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
            <svg
              v-if="isAllWorksActive"
              class="size-[1em] shrink-0 text-lg"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M6.10645 0.885437C6.34064 0.419037 6.88987 0.215724 7.36621 0.403992H7.36816C7.38752 0.410078 7.44336 0.427426 7.49609 0.445007C7.61095 0.483338 7.77963 0.545351 7.95996 0.644226C8.29454 0.827849 8.71139 1.16678 8.91406 1.74677C9.03762 1.57678 9.18549 1.414 9.36523 1.27313C10.0153 0.764153 10.8305 0.710249 11.3164 0.727234L11.3154 0.72821C11.4405 0.731527 11.5645 0.753951 11.6816 0.79657L11.7998 0.847351L11.9121 0.910828C11.9846 0.957465 12.0519 1.01242 12.1123 1.07391L12.1973 1.17059L12.2715 1.27606C12.3164 1.34889 12.353 1.42756 12.3809 1.50848L12.416 1.63348L12.4375 1.76044C12.4508 1.88383 12.4434 2.00975 12.417 2.13153L12.418 2.13251C12.363 2.39463 12.26 2.74739 12.0732 3.09735C12.2599 3.17687 12.444 3.27482 12.6201 3.39423L12.915 3.612C14.3942 4.79637 15.9148 7.41532 14.3262 10.8786C13.6312 12.3935 12.3989 13.4246 11.2598 14.1003C10.1168 14.7781 8.98865 15.1452 8.37109 15.3024C8.15966 15.3562 7.93534 15.3395 7.73438 15.2546C6.90159 14.9017 4.93987 14.1418 2.8623 12.2585C0.713278 10.3095 0.159927 6.55547 2.6123 3.81122C3.70756 2.58587 5.18165 2.28454 6.4248 2.33368C6.60058 2.34067 6.77458 2.35675 6.94531 2.37665C6.9213 2.36643 6.89478 2.35302 6.86328 2.34247C6.83117 2.33176 6.80988 2.32551 6.76758 2.31219C6.75062 2.30685 6.72329 2.29764 6.69531 2.28778C6.67258 2.27976 6.6153 2.25903 6.55176 2.22723C6.05822 1.97966 5.85905 1.37904 6.10645 0.885437ZM9.62109 3.75751C9.48735 3.41468 9.10072 3.24512 8.75781 3.3786C8.10258 3.63402 6.5909 4.21278 5.77246 5.96747C4.89903 7.83976 5.57847 9.51253 5.72754 10.1511C5.8112 10.5096 6.16976 10.7328 6.52832 10.6491C6.8866 10.5652 7.10901 10.2067 7.02539 9.84833C6.82433 8.98678 6.35036 7.88309 6.98047 6.53192V6.53094C7.56083 5.28666 8.61493 4.8653 9.24219 4.62079C9.58495 4.48691 9.75476 4.10041 9.62109 3.75751Z"
                fill="currentColor"
              />
            </svg>
            <svg
              v-else
              class="size-[1em] shrink-0 text-lg"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M6.10645 0.885071C6.34059 0.418547 6.88981 0.215334 7.36621 0.403625H7.36816C7.38706 0.40957 7.44291 0.426908 7.49609 0.444641C7.61096 0.482959 7.77937 0.544844 7.95996 0.64386C8.22224 0.787724 8.53557 1.02689 8.75684 1.40265C8.87266 1.26321 9.00648 1.13046 9.16016 1.01007C9.89447 0.434947 10.794 0.378187 11.3076 0.39386L11.3086 0.392883C11.3123 0.392997 11.3167 0.393777 11.3203 0.39386C11.323 0.39392 11.3265 0.393769 11.3291 0.39386L11.3281 0.394836C11.4883 0.399396 11.6469 0.42813 11.7969 0.482727L11.9492 0.548157L12.0938 0.630188C12.1867 0.690032 12.2731 0.760335 12.3506 0.839172L12.46 0.964172L12.5557 1.10089C12.6428 1.24196 12.7058 1.3973 12.7422 1.55988C12.7892 1.77049 12.7886 1.98872 12.7432 2.19952L12.7451 2.2005C12.688 2.47305 12.5783 2.85571 12.373 3.24347C12.4567 3.28952 12.5401 3.33899 12.6211 3.39386L12.916 3.61163C14.3953 4.79588 15.9161 7.4145 14.3271 10.8782C13.6321 12.3934 12.4 13.4242 11.2607 14.0999C10.1176 14.7779 8.98955 15.1449 8.37207 15.3021C8.16046 15.3559 7.93644 15.3393 7.73535 15.2542C6.90252 14.9013 4.941 14.1417 2.86328 12.2581C0.7142 10.3091 0.160763 6.55513 2.61328 3.81085C3.70856 2.58533 5.18256 2.28417 6.42578 2.33331C6.60135 2.34028 6.77479 2.35546 6.94531 2.37531C6.92128 2.3651 6.89481 2.35262 6.86328 2.3421C6.83104 2.33135 6.81021 2.32525 6.76758 2.31183C6.75052 2.30646 6.72346 2.29734 6.69531 2.28741C6.67252 2.27937 6.61549 2.2588 6.55176 2.22687C6.05815 1.97926 5.85888 1.37872 6.10645 0.885071ZM6.34668 4.33234C5.46008 4.29731 4.66565 4.516 4.10449 5.14386C2.41588 7.03348 2.8363 9.53367 4.20703 10.7767L4.54395 11.0716C6.00897 12.3146 7.36027 12.9217 8.19238 13.2737C8.71287 13.1162 9.47832 12.8326 10.2412 12.3802C11.182 11.8222 12.0443 11.0568 12.5088 10.0443C13.7124 7.42069 12.4264 5.67847 11.499 5.04913C11.234 4.86952 10.8347 4.77762 10.3682 4.7796C9.90546 4.78169 9.50976 4.87649 9.35645 4.93488C9.35543 4.93526 9.35355 4.93449 9.35254 4.93488C8.73213 5.17692 7.8012 5.56211 7.2832 6.67316C6.71363 7.89419 7.13649 8.85537 7.35059 9.77277C7.4758 10.3103 7.14101 10.8483 6.60352 10.9739C6.06596 11.0992 5.52808 10.7652 5.40234 10.2278C5.26643 9.64535 4.53644 7.83024 5.4707 5.82745C5.76031 5.2064 6.1315 4.72332 6.52246 4.34503C6.46405 4.34055 6.40555 4.33467 6.34668 4.33234ZM10.3936 2.58429C10.3922 2.58536 10.3901 2.58618 10.3887 2.58722C10.39 2.58639 10.3923 2.58622 10.3936 2.58527C10.3949 2.58415 10.3961 2.58245 10.3975 2.58136C10.3962 2.5823 10.3948 2.58336 10.3936 2.58429Z"
                fill="currentColor"
              />
            </svg>
            <span>番号影视</span>
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
                  <div class="flex w-72 flex-col gap-2 p-1 text-left text-xs leading-relaxed">
                    <div class="flex items-center justify-between gap-4 border-b border-white/10 pb-1.5 text-[13px] font-medium">
                      <span>预估总时长</span>
                      <span class="tabular-nums">{{ libraryDurationStats.totalLabel }}</span>
                    </div>
                    <div
                      v-for="item in libraryDurationStats.categories"
                      :key="item.key"
                      class="flex items-center justify-between gap-4 text-xs opacity-85"
                    >
                      <span>{{ item.label }} ({{ item.count }})</span>
                      <span class="tabular-nums">{{ item.durationLabel }}</span>
                    </div>
                    <div class="flex flex-col items-start gap-1 border-t border-white/10 pt-2 text-left">
                      <div class="flex items-baseline gap-2">
                        <span class="text-[11px] opacity-65">片库称号</span>
                        <span class="text-warning text-sm font-semibold tracking-wide">
                          {{ libraryDurationStats.persona.title }}
                        </span>
                      </div>
                      <p class="text-left text-xs leading-relaxed opacity-90">
                        {{ libraryDurationStats.persona.tagline }}
                      </p>
                    </div>
                    <p v-if="libraryDurationStats.missingCount > 0" class="border-t border-white/10 pt-1.5 text-left text-[11px] opacity-60">
                      另有 {{ libraryDurationStats.missingCount }} 部未返回时长元数据
                    </p>
                  </div>
                </template>
                <button
                  type="button"
                  class="text-base-content/45 hover:text-base-content inline-flex items-center justify-center rounded-full transition-colors"
                  aria-label="查看各分类预估总时长"
                >
                  <Icon :name="I.ABOUT" size="custom" class="size-3" />
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
  isWallRoute.value && !store.tagRailOpen && store.filter.view === 'all' && !store.filter.actor && !store.filter.genre && !store.filter.publisher && !store.filter.uncensoredKind && !store.filter.driveLabel,
)
const isCinemaActive = computed(() =>
  isWallRoute.value && store.filter.view === 'cinema' && !store.filter.actor && !store.filter.genre && !store.filter.publisher && !store.filter.uncensoredKind && !store.filter.driveLabel,
)
function isSectionActive(sectionId: string): boolean {
  return isWallRoute.value && store.filter.view === `section:${sectionId}` && !store.filter.actor && !store.filter.genre && !store.filter.publisher && !store.filter.uncensoredKind && !store.filter.driveLabel
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
  store.selectPublisher(undefined)
  store.selectUncensoredKind(undefined)
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
