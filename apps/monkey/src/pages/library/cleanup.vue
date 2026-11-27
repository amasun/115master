<template>
  <div class="relative min-h-[60vh] w-full px-(--main-content-gutter) pb-36">
    <!-- 顶部模块切换 -->
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div
        role="tablist"
        aria-label="去重与清理模块"
        class="bg-base-200/70 border-base-content/8 inline-flex items-center gap-1 rounded-full border p-1"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'duplicates'"
          class="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition-colors"
          :class="activeTab === 'duplicates'
            ? 'bg-primary text-primary-content font-medium shadow-xs'
            : 'text-base-content/70 hover:text-base-content'"
          @click="activeTab = 'duplicates'"
        >
          <span>重复影片</span>
          <span class="text-[11px] tabular-nums opacity-80">{{ duplicateGroups.length }}</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'junk'"
          class="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition-colors"
          :class="activeTab === 'junk'
            ? 'bg-primary text-primary-content font-medium shadow-xs'
            : 'text-base-content/70 hover:text-base-content'"
          @click="activeTab = 'junk'"
        >
          <span>垃圾文件清理</span>
          <span v-if="junkInitialized || scannedDriveJunk.length > 0" class="text-[11px] tabular-nums opacity-80">
            {{ allJunkItems.length }}
          </span>
        </button>
      </div>

      <p class="text-base-content/55 text-xs">
        所有删除操作均移入 115 回收站，支持勾选「安全联动清理空/独立父目录」
      </p>
    </div>

    <!-- Tab 1: 重复影片管理 -->
    <section v-if="activeTab === 'duplicates'" class="flex flex-col gap-4">
      <!-- 统计卡片 -->
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="bg-base-200/55 border-base-content/8 rounded-2xl border px-4 py-3">
          <div class="text-base-content/55 text-xs">
            检出重复组
          </div>
          <div class="text-base-content mt-1 text-xl font-bold tabular-nums">
            {{ duplicateGroups.length }} 组
          </div>
        </div>
        <div class="bg-base-200/55 border-base-content/8 rounded-2xl border px-4 py-3">
          <div class="text-base-content/55 text-xs">
            冗余文件数（非分段）
          </div>
          <div class="text-base-content mt-1 text-xl font-bold tabular-nums">
            {{ totalRedundantCount }} 个
          </div>
        </div>
        <div class="bg-base-200/55 border-base-content/8 rounded-2xl border px-4 py-3">
          <div class="text-base-content/55 text-xs">
            预计可释放空间
          </div>
          <div class="text-primary mt-1 text-xl font-bold tabular-nums">
            {{ format.fileSize(totalReclaimableSize) }}
          </div>
        </div>
      </div>

      <!-- 筛选与智能选择栏 -->
      <div class="bg-base-200/45 border-base-content/6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-2.5">
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="chip in dupKindOptions"
            :key="chip.value"
            type="button"
            class="rounded-full px-3 py-1 text-xs transition-colors"
            :class="dupFilterKind === chip.value
              ? 'bg-primary/20 text-primary font-medium'
              : 'text-base-content/65 hover:bg-base-content/5 hover:text-base-content'"
            @click="dupFilterKind = chip.value"
          >
            {{ chip.label }} ({{ chip.count }})
          </button>
          <label class="text-base-content/75 ml-2 flex cursor-pointer items-center gap-1.5 text-xs">
            <input
              v-model="hideMultiPartGroups"
              type="checkbox"
              class="checkbox checkbox-xs checkbox-primary"
            >
            <span>隐藏疑似分段 (CD1/CD2)</span>
          </label>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span
            v-if="lastAnalyzedLabel"
            class="text-base-content/45 text-[11px] tabular-nums"
            title="本地索引变动时会在浏览器空闲时后台自动重算"
          >
            {{ lastAnalyzedLabel }}
          </span>
          <select
            v-model="dupSortBy"
            aria-label="重复影片排序方式"
            class="select select-xs select-bordered bg-base-100/70 w-auto rounded-full"
          >
            <option value="reclaimable_desc">
              可释放空间 (大→小)
            </option>
            <option value="size_desc">
              总大小 (大→小)
            </option>
            <option value="size_asc">
              总大小 (小→大)
            </option>
            <option value="duration_desc">
              时长 (长→短)
            </option>
            <option value="duration_asc">
              时长 (短→长)
            </option>
            <option value="count_desc">
              文件数 (多→少)
            </option>
          </select>
          <Button
            size="xs"
            variant="ghost"
            class="gap-1 rounded-full"
            :disabled="store.duplicateAnalyzing"
            @click="store.runDuplicateAnalysis(true)"
          >
            <Icon :name="I.RESTART" class="text-xs" :class="store.duplicateAnalyzing && 'animate-spin'" />
            <span>{{ store.duplicateAnalyzing ? '检测中...' : '重新检测' }}</span>
          </Button>
          <Button
            size="xs"
            variant="soft"
            color="primary"
            class="rounded-full"
            :disabled="renderedDuplicateGroups.length === 0"
            title="仅勾选当前页展示的重复组冗余文件，防止误删其他页文件"
            @click="smartSelectRedundant"
          >
            智能勾选本页冗余
          </Button>
          <Button
            v-if="selectedDupFids.size > 0"
            size="xs"
            variant="ghost"
            class="rounded-full"
            @click="clearDupSelection"
          >
            清空勾选
          </Button>
        </div>
      </div>

      <!-- 首次后台分析中状态 -->
      <div
        v-if="store.duplicateAnalyzing && duplicateGroups.length === 0"
        class="text-base-content/60 flex min-h-[35vh] flex-col items-center justify-center gap-2.5 text-xs"
      >
        <Icon :name="I.LOADING" class="text-primary animate-spin text-2xl" />
        <span>正在分片分析本地索引，页面保持响应...</span>
      </div>

      <!-- 空状态 -->
      <div
        v-else-if="visibleDuplicateGroups.length === 0"
        class="flex min-h-[40vh] flex-col items-center justify-center gap-3"
      >
        <Empty
          :description="duplicateGroups.length === 0 ? '未在本地视频索引中发现重复影片' : '当前筛选条件下无重复组'"
          size="lg"
        />
      </div>

      <!-- 重复组列表（渐进分批渲染，防止一次挂载过多 DOM 卡顿） -->
      <div v-else class="flex flex-col gap-3">
        <article
          v-for="group in renderedDuplicateGroups"
          :key="group.id"
          class="bg-base-200/45 border-base-content/8 flex flex-col gap-2.5 rounded-2xl border p-4"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <span
                class="badge badge-xs rounded-full"
                :class="group.kind === 'sha1'
                  ? 'badge-error badge-soft'
                  : group.kind === 'avNumber'
                    ? 'badge-warning badge-soft'
                    : group.kind === 'edition'
                      ? 'badge-secondary badge-soft'
                      : 'badge-info badge-soft'"
              >
                {{ dupKindLabel(group.kind) }}
              </span>
              <h3 class="text-base-content truncate text-sm font-semibold">
                {{ group.title }}
              </h3>
              <span
                v-if="group.suspectedMultiPart"
                class="badge badge-warning badge-outline badge-xs rounded-full"
                title="文件名包含 CD1/CD2/Part 等分段标识，智能勾选已自动跳过"
              >
                疑似分段视频 · 请谨慎核对
              </span>
              <span class="text-base-content/50 text-xs tabular-nums">
                {{ group.files.length }} 个文件 · 可释放 {{ format.fileSize(group.reclaimableSize) }}
              </span>
            </div>

            <Button
              v-if="group.mediaKey"
              size="xs"
              variant="ghost"
              class="rounded-full text-xs"
              @click="openMediaDetail(group.mediaKey)"
            >
              <span>查看详情</span>
              <Icon :name="I.RIGHT" class="text-xs" />
            </Button>
          </div>

          <div class="flex flex-col gap-1.5">
            <div
              v-for="candidate in group.files"
              :key="candidate.fid"
              class="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs transition-colors"
              :class="selectedDupFids.has(candidate.fid)
                ? 'bg-error/10 border-error/30'
                : candidate.recommendedKeep
                  ? 'bg-success/8 border-success/25'
                  : 'bg-base-100/40 border-base-content/6'"
            >
              <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  class="checkbox checkbox-xs checkbox-error shrink-0"
                  :checked="selectedDupFids.has(candidate.fid)"
                  @change="toggleDupFid(candidate.fid)"
                >
                <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span
                      v-if="candidate.recommendedKeep"
                      class="badge badge-success badge-soft badge-xs shrink-0 rounded-full"
                    >
                      推荐保留
                    </span>
                    <span
                      v-for="reason in candidate.keepReasons.slice(0, 3)"
                      :key="reason"
                      class="badge badge-ghost badge-xs shrink-0 rounded-full"
                    >
                      {{ reason }}
                    </span>
                    <span class="text-base-content truncate font-medium" :title="candidate.name">
                      {{ candidate.name }}
                    </span>
                  </div>
                  <div class="text-base-content/55 flex flex-wrap items-center gap-3 text-[11px] tabular-nums">
                    <span>{{ format.fileSize(candidate.size) }}</span>
                    <span v-if="candidate.duration > 0">{{ formatTime(candidate.duration) }}</span>
                    <span v-if="candidate.mtime > 0">{{ format.dateTime(candidate.mtime) }}</span>
                    <span v-if="candidate.sha1" class="font-mono opacity-75">{{ candidate.sha1.slice(0, 10) }}</span>
                  </div>
                </div>
              </label>

              <div class="flex shrink-0 items-center gap-1">
                <Button
                  size="xs"
                  variant="ghost"
                  class="rounded-full"
                  title="播放预览"
                  @click="playVideo(candidate.pickCode)"
                >
                  <Icon :name="I.PLAY" class="text-xs" />
                  <span>播放</span>
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  class="max-w-52 rounded-full sm:max-w-64"
                  :title="folderPaths.getTooltip(candidate.cid)"
                  @click="openNativeFolder(candidate.cid)"
                >
                  <Icon :name="I.FOLDER_OPEN" class="shrink-0 text-xs" />
                  <span class="min-w-0 truncate">{{ folderPaths.getLabel(candidate.cid) }}</span>
                </Button>
              </div>
            </div>
          </div>
        </article>

        <div class="ui-glass-panel sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-xs shadow-lg">
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-base-content/60 tabular-nums">
              共 {{ visibleDuplicateGroups.length }} 组 · 当前第 {{ dupPageStart + 1 }}–{{ Math.min(dupPageStart + dupPageSize, visibleDuplicateGroups.length) }} 组
            </span>
            <label class="flex shrink-0 items-center gap-1.5">
              <span class="text-base-content/55 shrink-0 whitespace-nowrap">每页</span>
              <select
                v-model.number="dupPageSize"
                aria-label="重复影片每页显示数量"
                class="select select-xs select-bordered bg-base-100/70 w-auto min-w-16 rounded-full tabular-nums"
              >
                <option v-for="n in PAGE_SIZE_OPTIONS" :key="n" :value="n">
                  {{ n }}
                </option>
              </select>
              <span class="text-base-content/55 shrink-0 whitespace-nowrap">组</span>
            </label>
            <Button
              size="xs"
              variant="soft"
              color="primary"
              class="rounded-full"
              :disabled="renderedDuplicateGroups.length === 0"
              title="仅勾选当前页展示的重复组冗余文件，防止误删其他页文件"
              @click="smartSelectRedundant"
            >
              智能勾选本页冗余
            </Button>
            <Button
              v-if="selectedDupFids.size > 0"
              size="xs"
              variant="ghost"
              class="rounded-full"
              @click="clearDupSelection"
            >
              清空勾选
            </Button>
          </div>

          <nav
            v-if="dupTotalPages > 1"
            role="navigation"
            aria-label="分页导航"
            class="flex flex-wrap items-center gap-1"
          >
            <Button
              size="xs"
              variant="ghost"
              class="rounded-full"
              :disabled="dupPage <= 1"
              @click="dupPage = Math.max(1, dupPage - 1)"
            >
              上一页
            </Button>
            <template v-for="(item, idx) in dupPaginationItems" :key="`dup-p-${idx}-${item}`">
              <span v-if="item === 'ellipsis'" class="text-base-content/45 px-1">…</span>
              <button
                v-else
                type="button"
                class="cursor-pointer rounded-full px-2.5 py-1 text-xs tabular-nums transition-colors"
                :class="dupPage === item
                  ? 'bg-primary text-primary-content font-medium'
                  : 'text-base-content/70 hover:bg-base-content/5 hover:text-base-content'"
                :aria-current="dupPage === item ? 'page' : undefined"
                @click="dupPage = item"
              >
                {{ item }}
              </button>
            </template>
            <Button
              size="xs"
              variant="ghost"
              class="rounded-full"
              :disabled="dupPage >= dupTotalPages"
              @click="dupPage = Math.min(dupTotalPages, dupPage + 1)"
            >
              下一页
            </Button>
          </nav>
        </div>
      </div>
    </section>

    <!-- Tab 2: 垃圾文件与广告视频清理 -->
    <section v-else class="flex flex-col gap-4">
      <div class="bg-base-200/45 border-base-content/8 flex flex-col gap-3 rounded-2xl border p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <label class="flex cursor-pointer items-center gap-1.5 text-xs">
              <input v-model="scanCategories.web" type="checkbox" class="checkbox checkbox-xs checkbox-primary">
              <span>网页 / 快捷方式（{{ JUNK_EXTENSION_GROUPS.web.join(', ') }}）</span>
            </label>
            <label class="flex cursor-pointer items-center gap-1.5 text-xs">
              <input v-model="scanCategories.textMagnet" type="checkbox" class="checkbox checkbox-xs checkbox-primary">
              <span>文本 / 磁力 / 种子（{{ JUNK_EXTENSION_GROUPS.textMagnet.join(', ') }}）</span>
            </label>
            <label class="flex cursor-pointer items-center gap-1.5 text-xs">
              <input v-model="scanCategories.executable" type="checkbox" class="checkbox checkbox-xs checkbox-primary">
              <span>安装包 / 脚本（{{ JUNK_EXTENSION_GROUPS.executable.join(', ') }}）</span>
            </label>
            <label class="flex cursor-pointer items-center gap-1.5 text-xs">
              <input v-model="scanCategories.adVideo" type="checkbox" class="checkbox checkbox-xs checkbox-primary">
              <span>疑似广告短视频（本地索引）</span>
            </label>
          </div>

          <div class="flex items-center gap-2">
            <Button
              v-if="scanningJunk"
              size="sm"
              variant="soft"
              color="error"
              class="rounded-full"
              @click="abortJunkScan"
            >
              停止扫描
            </Button>
            <Button
              v-else
              size="sm"
              color="primary"
              class="gap-1.5 rounded-full"
              @click="startJunkScan"
            >
              <Icon :name="I.SEARCH" class="text-sm" />
              <span>扫描网盘垃圾文件</span>
            </Button>
          </div>
        </div>

        <!-- 广告短视频阈值调节 -->
        <div
          v-if="scanCategories.adVideo"
          class="text-base-content/70 flex flex-wrap items-center gap-4 border-t border-white/5 pt-2.5 text-xs"
        >
          <label class="flex items-center gap-1.5">
            <span>时长上限 (秒)</span>
            <input
              v-model.number="adDurationDraft"
              type="number"
              :min="AD_DURATION_MIN_SEC"
              :max="AD_DURATION_MAX_SEC"
              class="input input-xs input-bordered bg-base-100/70 w-20 rounded-full text-center tabular-nums"
              @change="commitDurationDraft"
              @blur="commitDurationDraft"
            >
          </label>
          <div class="flex items-center gap-1.5">
            <span>匹配方式</span>
            <div
              class="bg-base-100/70 border-base-content/10 inline-flex items-center rounded-full border p-0.5"
              role="group"
              aria-label="广告匹配方式"
            >
              <button
                type="button"
                class="cursor-pointer rounded-full px-2.5 py-0.5 text-xs leading-none transition-colors"
                :class="store.adFilterOptions.matchMode === 'and'
                  ? 'bg-primary text-primary-content font-medium'
                  : 'text-base-content/65 hover:text-base-content'"
                aria-label="匹配方式：且 (AND)"
                :aria-pressed="store.adFilterOptions.matchMode === 'and'"
                title="且 (AND)：同时满足时长和体积上限"
                @click="store.commitAdThresholds({ matchMode: 'and' })"
              >
                且 (AND)
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-full px-2.5 py-0.5 text-xs leading-none transition-colors"
                :class="store.adFilterOptions.matchMode === 'or'
                  ? 'bg-primary text-primary-content font-medium'
                  : 'text-base-content/65 hover:text-base-content'"
                aria-label="匹配方式：或 (OR)"
                :aria-pressed="store.adFilterOptions.matchMode === 'or'"
                title="或 (OR)：满足时长或体积任一上限"
                @click="store.commitAdThresholds({ matchMode: 'or' })"
              >
                或 (OR)
              </button>
            </div>
          </div>
          <label class="flex items-center gap-1.5">
            <span>体积上限 (MB)</span>
            <input
              v-model.number="adSizeDraft"
              type="number"
              :min="AD_SIZE_MIN_MB"
              :max="AD_SIZE_MAX_MB"
              class="input input-xs input-bordered bg-base-100/70 w-20 rounded-full text-center tabular-nums"
              @change="commitSizeDraft"
              @blur="commitSizeDraft"
            >
          </label>
          <label class="flex cursor-pointer items-center gap-1.5">
            <input
              v-model="store.hideAdVideos"
              type="checkbox"
              class="checkbox checkbox-xs checkbox-primary"
            >
            <span>在影视库展示墙隐藏</span>
          </label>
          <span class="text-base-content/50">
            {{ adScanning ? '正在分析广告短视频...' : `本地索引检出 ${adVideoItems.length} 个疑似广告短视频（已排除星标 · 与展示墙共用阈值）` }}
          </span>
        </div>

        <!-- 扫描进度 -->
        <div v-if="scanningJunk" class="flex flex-col gap-1.5 pt-1">
          <Progress :active="true" />
          <div class="text-base-content/60 flex items-center justify-between text-xs tabular-nums">
            <span>正在扫描：{{ junkScanProgress.currentLabel || '...' }}</span>
            <span>{{ junkScanProgress.scannedSuffixes }} / {{ junkScanProgress.totalSuffixes }} 类 · 已发现 {{ junkScanProgress.found }} 个</span>
          </div>
        </div>
      </div>

      <!-- 分类过滤与全选工具栏 -->
      <div class="bg-base-200/45 border-base-content/6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-2.5">
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="cat in junkCategoryTabs"
            :key="cat.value"
            type="button"
            class="rounded-full px-3 py-1 text-xs transition-colors"
            :class="junkFilterCategory === cat.value
              ? 'bg-primary/20 text-primary font-medium'
              : 'text-base-content/65 hover:bg-base-content/5 hover:text-base-content'"
            @click="junkFilterCategory = cat.value"
          >
            {{ cat.label }} ({{ cat.count }})
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <select
            v-model="junkSortBy"
            aria-label="垃圾文件排序方式"
            class="select select-xs select-bordered bg-base-100/70 w-auto rounded-full"
          >
            <option value="size_desc">
              大小 (大→小)
            </option>
            <option value="size_asc">
              大小 (小→大)
            </option>
            <option value="duration_desc">
              时长 (长→短)
            </option>
            <option value="duration_asc">
              时长 (短→长)
            </option>
            <option value="mtime_desc">
              时间 (新→旧)
            </option>
            <option value="mtime_asc">
              时间 (旧→新)
            </option>
            <option value="name_asc">
              名称 (A→Z)
            </option>
          </select>
          <input
            v-model="junkSearchKeyword"
            type="text"
            placeholder="过滤文件名..."
            class="input input-xs input-bordered bg-base-100/70 w-40 rounded-full px-3"
          >
          <Button
            size="xs"
            variant="soft"
            class="rounded-full"
            :disabled="renderedJunkItems.length === 0"
            title="仅全选当前页展示的文件，防止数量过多误删非垃圾文件"
            @click="selectAllVisibleJunk"
          >
            全选本页 ({{ renderedJunkItems.length }})
          </Button>
          <Button
            size="xs"
            variant="soft"
            color="error"
            class="rounded-full"
            :disabled="visibleJunkItems.length === 0"
            title="选中当前筛选条件下的全部文件（不限分页）"
            @click="selectAllFilteredJunk"
          >
            全选全部 ({{ visibleJunkItems.length }})
          </Button>
          <Button
            v-if="selectedJunkFids.size > 0"
            size="xs"
            variant="ghost"
            class="rounded-full"
            @click="selectedJunkFids = new Set()"
          >
            清空勾选
          </Button>
        </div>
      </div>

      <!-- 垃圾文件列表 -->
      <div
        v-if="visibleJunkItems.length === 0"
        class="flex min-h-[35vh] flex-col items-center justify-center gap-2"
      >
        <Empty description="暂无匹配的待清理文件，可点击上方「扫描网盘垃圾文件」" size="lg" />
      </div>

      <div v-else class="flex flex-col gap-1.5">
        <div
          v-for="item in renderedJunkItems"
          :key="item.fid"
          class="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs transition-colors"
          :class="selectedJunkFids.has(item.fid)
            ? 'bg-error/10 border-error/30'
            : 'bg-base-200/40 border-base-content/6 hover:bg-base-200/70'"
        >
          <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              class="checkbox checkbox-xs checkbox-error shrink-0"
              :checked="selectedJunkFids.has(item.fid)"
              @change="toggleJunkFid(item.fid)"
            >
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="badge badge-ghost badge-xs shrink-0 rounded-full">
                  {{ junkCategoryLabel(item.category) }}
                </span>
                <span class="badge badge-ghost badge-xs shrink-0 rounded-full">
                  {{ item.reason }}
                </span>
                <span class="text-base-content truncate font-medium" :title="item.name">
                  {{ item.name }}
                </span>
              </div>
              <div class="text-base-content/55 flex flex-wrap items-center gap-3 text-[11px] tabular-nums">
                <span>{{ format.fileSize(item.size) }}</span>
                <span v-if="item.duration && item.duration > 0">{{ formatTime(item.duration) }}</span>
                <span v-if="item.mtime > 0">{{ format.dateTime(item.mtime) }}</span>
              </div>
            </div>
          </label>

          <div class="flex shrink-0 items-center gap-1">
            <Button
              v-if="item.isVideo && item.pickCode"
              size="xs"
              variant="ghost"
              class="rounded-full"
              @click="playVideo(item.pickCode)"
            >
              <Icon :name="I.PLAY" class="text-xs" />
              <span>播放</span>
            </Button>
            <Button
              size="xs"
              variant="ghost"
              class="max-w-52 rounded-full sm:max-w-64"
              :title="folderPaths.getTooltip(item.cid)"
              @click="openNativeFolder(item.cid)"
            >
              <Icon :name="I.FOLDER_OPEN" class="shrink-0 text-xs" />
              <span class="min-w-0 truncate">{{ folderPaths.getLabel(item.cid) }}</span>
            </Button>
          </div>
        </div>

        <div class="ui-glass-panel sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-xs shadow-lg">
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-base-content/60 tabular-nums">
              共 {{ visibleJunkItems.length }} 项 · 当前第 {{ junkPageStart + 1 }}–{{ Math.min(junkPageStart + junkPageSize, visibleJunkItems.length) }} 项
            </span>
            <label class="flex shrink-0 items-center gap-1.5">
              <span class="text-base-content/55 shrink-0 whitespace-nowrap">每页</span>
              <select
                v-model.number="junkPageSize"
                aria-label="垃圾文件每页显示数量"
                class="select select-xs select-bordered bg-base-100/70 w-auto min-w-16 rounded-full tabular-nums"
              >
                <option v-for="n in PAGE_SIZE_OPTIONS" :key="n" :value="n">
                  {{ n }}
                </option>
              </select>
              <span class="text-base-content/55 shrink-0 whitespace-nowrap">项</span>
            </label>
            <Button
              size="xs"
              variant="soft"
              class="rounded-full"
              :disabled="renderedJunkItems.length === 0"
              title="仅全选当前页展示的文件，防止数量过多误删非垃圾文件"
              @click="selectAllVisibleJunk"
            >
              全选本页 ({{ renderedJunkItems.length }})
            </Button>
            <Button
              size="xs"
              variant="soft"
              color="error"
              class="rounded-full"
              :disabled="visibleJunkItems.length === 0"
              title="选中当前筛选条件下的全部文件（不限分页）"
              @click="selectAllFilteredJunk"
            >
              全选全部 ({{ visibleJunkItems.length }})
            </Button>
            <Button
              v-if="selectedJunkFids.size > 0"
              size="xs"
              variant="ghost"
              class="rounded-full"
              @click="selectedJunkFids = new Set()"
            >
              清空勾选
            </Button>
          </div>

          <nav
            v-if="junkTotalPages > 1"
            role="navigation"
            aria-label="分页导航"
            class="flex flex-wrap items-center gap-1"
          >
            <Button
              size="xs"
              variant="ghost"
              class="rounded-full"
              :disabled="junkPage <= 1"
              @click="junkPage = Math.max(1, junkPage - 1)"
            >
              上一页
            </Button>
            <template v-for="(item, idx) in junkPaginationItems" :key="`junk-p-${idx}-${item}`">
              <span v-if="item === 'ellipsis'" class="text-base-content/45 px-1">…</span>
              <button
                v-else
                type="button"
                class="cursor-pointer rounded-full px-2.5 py-1 text-xs tabular-nums transition-colors"
                :class="junkPage === item
                  ? 'bg-primary text-primary-content font-medium'
                  : 'text-base-content/70 hover:bg-base-content/5 hover:text-base-content'"
                :aria-current="junkPage === item ? 'page' : undefined"
                @click="junkPage = item"
              >
                {{ item }}
              </button>
            </template>
            <Button
              size="xs"
              variant="ghost"
              class="rounded-full"
              :disabled="junkPage >= junkTotalPages"
              @click="junkPage = Math.min(junkTotalPages, junkPage + 1)"
            >
              下一页
            </Button>
          </nav>
        </div>
      </div>
    </section>

    <!-- 底部悬浮批量清理操作栏 -->
    <div
      v-if="deleting || activeSelectedCount > 0"
      class="ui-z-elevated pointer-events-none fixed right-0 bottom-16 left-[calc(var(--sider-width)+var(--rail2-width,0px))] flex justify-center px-4"
    >
      <div
        v-if="deleting"
        class="ui-glass-panel pointer-events-auto flex w-full max-w-2xl flex-col gap-2 rounded-2xl px-4 py-3 shadow-xl"
      >
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="font-medium tabular-nums">
              {{
                deleteProgress.phase === 'folders'
                  ? `正在检查空目录：${deleteProgress.checkedFolders} / ${deleteProgress.totalFolders}（已清理 ${deleteProgress.deletedFolders} 个）`
                  : `正在移入回收站：${deleteProgress.completedFiles} / ${deleteProgress.totalFiles} 个文件（成功 ${deleteProgress.deletedFiles} · 失败 ${deleteProgress.failedFiles}）· 目录 ${deleteProgress.completedDirs}/${deleteProgress.totalDirs}`
              }}
            </span>
            <span class="text-base-content/55 text-[11px]">
              每完成一个目录会立即同步本地库与列表，请勿刷新或关闭页面（可点右侧停止）
            </span>
          </div>
          <Button
            size="xs"
            variant="soft"
            color="error"
            class="shrink-0 rounded-full"
            @click="abortBatchCleanup"
          >
            停止清理
          </Button>
        </div>
        <Progress :active="true" />
        <p v-if="deleteProgress.lastError" class="text-warning text-[11px]">
          最近异常：{{ deleteProgress.lastError }}
        </p>
      </div>

      <div
        v-else
        class="ui-glass-panel pointer-events-auto flex flex-wrap items-center gap-4 rounded-full px-5 py-2.5 shadow-xl"
      >
        <div class="text-xs">
          已选 <strong class="text-error tabular-nums">{{ activeSelectedCount }}</strong> 项
          <span class="text-base-content/60 ml-1 tabular-nums">({{ format.fileSize(activeSelectedSize) }})</span>
        </div>

        <label class="text-base-content/80 flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            v-model="deleteEmptyParent"
            type="checkbox"
            class="checkbox checkbox-xs checkbox-primary"
          >
          <span>同时安全删除空/独立父目录</span>
        </label>

        <Button
          size="sm"
          color="error"
          class="rounded-full"
          @click="executeBatchCleanup"
        >
          {{ `移入回收站 (${activeSelectedCount})` }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DuplicateKind, JunkCategory, JunkFileItem, SafeDeleteProgress } from '@/utils/mediaIndex'
import { Button, Empty, Progress } from '@115master/ui'
import { format } from '@115master/utils'
import { useEventListener, useStorage, useTitle } from '@vueuse/core'
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppDialog } from '@/app/dialog'
import { useToast } from '@/components'
import { formatTime } from '@/components/XPlayer/utils/time'
import { I, Icon } from '@/icons'
import { openNativeFolder } from '@/pages/library/useLibraryFileActions'
import { useMediaLibraryStore } from '@/store/mediaLibrary'
import { useFolderPathLabels } from '@/utils/driveFolderPath'
import {
  AD_DURATION_MAX_SEC,
  AD_DURATION_MIN_SEC,
  AD_SIZE_MAX_MB,
  AD_SIZE_MIN_MB,
  clampAdMaxDurationSec,
  clampAdMaxSizeMB,
  detectAdVideos,
  JUNK_EXTENSION_GROUPS,
  safeDeleteFiles,
  scanDriveJunkFiles,
  selectSmartRedundantFids,
} from '@/utils/mediaIndex'

useTitle('去重与清理 · 影视库 · 115Master Fusion')

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const
const DEFAULT_DUP_PAGE_SIZE = 20
const DEFAULT_JUNK_PAGE_SIZE = 50

function normalizePageSize(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (PAGE_SIZE_OPTIONS.includes(num as (typeof PAGE_SIZE_OPTIONS)[number]))
    return num
  return fallback
}

function buildPaginationItems(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7)
    return Array.from({ length: total }, (_, index) => index + 1)

  const items: Array<number | 'ellipsis'> = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  if (start > 2)
    items.push('ellipsis')
  for (let page = start; page <= end; page += 1)
    items.push(page)
  if (end < total - 1)
    items.push('ellipsis')

  items.push(total)
  return items
}

const route = useRoute()
const router = useRouter()
const store = useMediaLibraryStore()
const dialog = useAppDialog()
const toast = useToast()
const folderPaths = useFolderPathLabels()

const activeTab = ref<'duplicates' | 'junk'>(route.query.tab === 'junk' ? 'junk' : 'duplicates')
const dupFilterKind = ref<'all' | DuplicateKind>('all')
const dupSortBy = ref<'reclaimable_desc' | 'size_desc' | 'size_asc' | 'duration_desc' | 'duration_asc' | 'count_desc'>('reclaimable_desc')
const hideMultiPartGroups = ref(false)
const dupPageSize = useStorage<number>('115Master_cleanup_dup_page_size', DEFAULT_DUP_PAGE_SIZE)
const initialDupPageSize = normalizePageSize(dupPageSize.value, DEFAULT_DUP_PAGE_SIZE)
if (dupPageSize.value !== initialDupPageSize)
  dupPageSize.value = initialDupPageSize
const dupPage = ref(1)
const selectedDupFids = ref(new Set<string>())
const deleteEmptyParent = ref(false)
const deleting = shallowRef(false)

const duplicateGroups = computed(() => store.duplicateGroups)

const lastAnalyzedLabel = computed(() => {
  if (!store.duplicateAnalyzedAt)
    return ''
  const d = new Date(store.duplicateAnalyzedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `上次检测 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})

const dupKindOptions = computed(() => [
  { value: 'all' as const, label: '全部', count: duplicateGroups.value.length },
  { value: 'sha1' as const, label: 'SHA1 完全重复', count: duplicateGroups.value.filter(g => g.kind === 'sha1').length },
  { value: 'avNumber' as const, label: '同番号多版本', count: duplicateGroups.value.filter(g => g.kind === 'avNumber').length },
  { value: 'edition' as const, label: '蓝光/普通版', count: duplicateGroups.value.filter(g => g.kind === 'edition').length },
  { value: 'similar' as const, label: '疑似重复', count: duplicateGroups.value.filter(g => g.kind === 'similar').length },
])

function groupMaxDuration(group: (typeof duplicateGroups.value)[number]): number {
  let max = 0
  for (const file of group.files) {
    if (file.duration > max)
      max = file.duration
  }
  return max
}

const visibleDuplicateGroups = computed(() => {
  const filtered = duplicateGroups.value.filter((group) => {
    if (dupFilterKind.value !== 'all' && group.kind !== dupFilterKind.value)
      return false
    if (hideMultiPartGroups.value && group.suspectedMultiPart)
      return false
    return true
  })

  return [...filtered].sort((a, b) => {
    switch (dupSortBy.value) {
      case 'size_desc':
        return b.totalSize - a.totalSize || b.reclaimableSize - a.reclaimableSize || a.id.localeCompare(b.id)
      case 'size_asc':
        return a.totalSize - b.totalSize || a.reclaimableSize - b.reclaimableSize || a.id.localeCompare(b.id)
      case 'duration_desc':
        return groupMaxDuration(b) - groupMaxDuration(a) || b.totalSize - a.totalSize || a.id.localeCompare(b.id)
      case 'duration_asc': {
        const da = groupMaxDuration(a)
        const db = groupMaxDuration(b)
        const va = da > 0 ? da : Number.POSITIVE_INFINITY
        const vb = db > 0 ? db : Number.POSITIVE_INFINITY
        return va - vb || a.totalSize - b.totalSize || a.id.localeCompare(b.id)
      }
      case 'count_desc':
        return b.files.length - a.files.length || b.reclaimableSize - a.reclaimableSize || a.id.localeCompare(b.id)
      case 'reclaimable_desc':
      default:
        return b.reclaimableSize - a.reclaimableSize || b.totalSize - a.totalSize || a.id.localeCompare(b.id)
    }
  })
})

const dupTotalPages = computed(() =>
  Math.max(1, Math.ceil(visibleDuplicateGroups.value.length / dupPageSize.value)),
)

const dupPageStart = computed(() =>
  (dupPage.value - 1) * dupPageSize.value,
)

const dupPaginationItems = computed(() =>
  buildPaginationItems(dupPage.value, dupTotalPages.value),
)

const renderedDuplicateGroups = computed(() =>
  visibleDuplicateGroups.value.slice(dupPageStart.value, dupPageStart.value + dupPageSize.value),
)

watch([dupFilterKind, hideMultiPartGroups, dupPageSize, dupSortBy], () => {
  dupPage.value = 1
  selectedDupFids.value = new Set()
})

watch(dupTotalPages, (total) => {
  if (dupPage.value > total)
    dupPage.value = total
})

watch(dupPage, () => {
  selectedDupFids.value = new Set()
})

const totalRedundantCount = computed(() =>
  duplicateGroups.value
    .filter(g => !g.suspectedMultiPart)
    .reduce((sum, g) => sum + Math.max(0, g.files.length - 1), 0),
)

const totalReclaimableSize = computed(() =>
  duplicateGroups.value
    .filter(g => !g.suspectedMultiPart)
    .reduce((sum, g) => sum + g.reclaimableSize, 0),
)

function dupKindLabel(kind: DuplicateKind): string {
  if (kind === 'sha1')
    return 'SHA1 完全重复'
  if (kind === 'avNumber')
    return '同番号多版本'
  if (kind === 'edition')
    return '蓝光/普通版'
  return '疑似重复'
}

function toggleDupFid(fid: string) {
  const next = new Set(selectedDupFids.value)
  if (next.has(fid))
    next.delete(fid)
  else
    next.add(fid)
  selectedDupFids.value = next
}

function clearDupSelection() {
  selectedDupFids.value = new Set()
}

function smartSelectRedundant() {
  const { fids: next, skippedMultiPart } = selectSmartRedundantFids(renderedDuplicateGroups.value)
  selectedDupFids.value = next
  if (next.size === 0) {
    toast.info('当前页无可安全自动勾选的冗余文件')
    return
  }
  toast.success(
    skippedMultiPart > 0
      ? `已智能勾选本页 ${next.size} 个冗余文件（已跳过 ${skippedMultiPart} 个疑似分段组）`
      : `已智能勾选本页 ${next.size} 个冗余文件`,
  )
}

/** === Tab 2: 垃圾文件清理（惰性异步计算，进入 Tab 2 时才扫描广告视频） === */
const scanCategories = reactive({
  web: true,
  textMagnet: true,
  executable: true,
  adVideo: true,
})
const adDurationDraft = ref<number | string>(store.adFilterOptions.maxDurationSec)
const adSizeDraft = ref<number | string>(store.adFilterOptions.maxSizeMB)
const adVideoItems = shallowRef<JunkFileItem[]>([])
const adScanning = shallowRef(false)
const junkInitialized = shallowRef(false)
const scannedDriveJunk = shallowRef<JunkFileItem[]>([])
const scanningJunk = shallowRef(false)
const junkScanProgress = reactive({
  scannedSuffixes: 0,
  totalSuffixes: 0,
  currentLabel: '',
  found: 0,
})
const junkFilterCategory = ref<'all' | JunkCategory>('all')
const junkSortBy = ref<'size_desc' | 'size_asc' | 'duration_desc' | 'duration_asc' | 'mtime_desc' | 'mtime_asc' | 'name_asc'>('size_desc')
const junkSearchKeyword = ref('')
const junkPageSize = useStorage<number>('115Master_cleanup_junk_page_size', DEFAULT_JUNK_PAGE_SIZE)
const initialJunkPageSize = normalizePageSize(junkPageSize.value, DEFAULT_JUNK_PAGE_SIZE)
if (junkPageSize.value !== initialJunkPageSize)
  junkPageSize.value = initialJunkPageSize
const junkPage = ref(1)
const selectedJunkFids = ref(new Set<string>())
let junkController: AbortController | null = null
let adScanTimer: ReturnType<typeof setTimeout> | null = null

watch(adDurationDraft, (val) => {
  if (typeof val === 'number' && Number.isFinite(val) && val >= AD_DURATION_MIN_SEC && val <= AD_DURATION_MAX_SEC)
    store.adMaxDurationSec = Math.round(val)
})

watch(adSizeDraft, (val) => {
  if (typeof val === 'number' && Number.isFinite(val) && val >= AD_SIZE_MIN_MB && val <= AD_SIZE_MAX_MB)
    store.adMaxSizeMB = Math.round(val)
})

watch(() => store.adMaxDurationSec, (val) => {
  const clamped = clampAdMaxDurationSec(val)
  if (adDurationDraft.value !== clamped)
    adDurationDraft.value = clamped
})

watch(() => store.adMaxSizeMB, (val) => {
  const clamped = clampAdMaxSizeMB(val)
  if (adSizeDraft.value !== clamped)
    adSizeDraft.value = clamped
})

function commitDurationDraft() {
  const next = clampAdMaxDurationSec(adDurationDraft.value, store.adFilterOptions.maxDurationSec)
  store.commitAdThresholds({ maxDurationSec: next })
  adDurationDraft.value = next
}

function commitSizeDraft() {
  const next = clampAdMaxSizeMB(adSizeDraft.value, store.adFilterOptions.maxSizeMB)
  store.commitAdThresholds({ maxSizeMB: next })
  adSizeDraft.value = next
}

watch(() => route.query.tab, (tab) => {
  if (tab === 'junk' || tab === 'duplicates')
    activeTab.value = tab
})

watch(activeTab, (tab) => {
  if (route.name !== 'library-cleanup')
    return
  const currentTab = route.query.tab === 'junk' ? 'junk' : undefined
  const targetTab = tab === 'junk' ? 'junk' : undefined
  if (currentTab === targetTab)
    return
  const nextQuery = { ...route.query }
  if (targetTab)
    nextQuery.tab = targetTab
  else
    delete nextQuery.tab
  void router.replace({ name: 'library-cleanup', query: nextQuery })
})

function refreshAdVideosAsync() {
  if (adScanTimer)
    clearTimeout(adScanTimer)
  if (!scanCategories.adVideo) {
    adVideoItems.value = []
    adScanning.value = false
    return
  }
  adScanning.value = true
  adScanTimer = setTimeout(() => {
    adScanTimer = null
    adVideoItems.value = detectAdVideos(store.videos, store.adFilterOptions)
    adScanning.value = false
    junkInitialized.value = true
  }, 0)
}

watch(activeTab, (tab) => {
  if (tab === 'junk' && !junkInitialized.value)
    refreshAdVideosAsync()
}, { immediate: true })

watch(
  [() => scanCategories.adVideo, () => store.adFilterOptions, () => store.videos],
  () => {
    if (activeTab.value === 'junk' || junkInitialized.value)
      refreshAdVideosAsync()
  },
)

const allJunkItems = computed<JunkFileItem[]>(() => {
  const map = new Map<string, JunkFileItem>()
  for (const item of scannedDriveJunk.value)
    map.set(item.fid, item)
  for (const item of adVideoItems.value) {
    if (!map.has(item.fid))
      map.set(item.fid, item)
  }
  return Array.from(map.values())
})

const junkCategoryTabs = computed(() => [
  { value: 'all' as const, label: '全部', count: allJunkItems.value.length },
  { value: 'adVideo' as const, label: '疑似广告视频', count: allJunkItems.value.filter(i => i.category === 'adVideo').length },
  { value: 'web' as const, label: '网页/快捷方式', count: allJunkItems.value.filter(i => i.category === 'web').length },
  { value: 'textMagnet' as const, label: '文本/磁力/种子', count: allJunkItems.value.filter(i => i.category === 'textMagnet').length },
  { value: 'executable' as const, label: '安装包/脚本', count: allJunkItems.value.filter(i => i.category === 'executable').length },
])

const visibleJunkItems = computed(() => {
  const kw = junkSearchKeyword.value.trim().toLowerCase()
  const filtered = allJunkItems.value.filter((item) => {
    if (junkFilterCategory.value !== 'all' && item.category !== junkFilterCategory.value)
      return false
    if (kw && !item.name.toLowerCase().includes(kw))
      return false
    return true
  })

  return [...filtered].sort((a, b) => {
    switch (junkSortBy.value) {
      case 'size_asc':
        return a.size - b.size || b.mtime - a.mtime || a.fid.localeCompare(b.fid)
      case 'duration_desc':
        return (b.duration ?? 0) - (a.duration ?? 0) || b.size - a.size || a.fid.localeCompare(b.fid)
      case 'duration_asc': {
        const da = a.duration && a.duration > 0 ? a.duration : Number.POSITIVE_INFINITY
        const db = b.duration && b.duration > 0 ? b.duration : Number.POSITIVE_INFINITY
        return da - db || a.size - b.size || a.fid.localeCompare(b.fid)
      }
      case 'mtime_desc':
        return b.mtime - a.mtime || b.size - a.size || a.fid.localeCompare(b.fid)
      case 'mtime_asc':
        return a.mtime - b.mtime || b.size - a.size || a.fid.localeCompare(b.fid)
      case 'name_asc':
        return a.name.localeCompare(b.name, 'zh-CN') || b.size - a.size
      case 'size_desc':
      default:
        return b.size - a.size || b.mtime - a.mtime || a.fid.localeCompare(b.fid)
    }
  })
})

const junkTotalPages = computed(() =>
  Math.max(1, Math.ceil(visibleJunkItems.value.length / junkPageSize.value)),
)

const junkPageStart = computed(() =>
  (junkPage.value - 1) * junkPageSize.value,
)

const junkPaginationItems = computed(() =>
  buildPaginationItems(junkPage.value, junkTotalPages.value),
)

const renderedJunkItems = computed(() =>
  visibleJunkItems.value.slice(junkPageStart.value, junkPageStart.value + junkPageSize.value),
)

watch([junkFilterCategory, junkSearchKeyword], () => {
  junkPage.value = 1
  selectedJunkFids.value = new Set()
})

watch([junkPageSize, junkSortBy], () => {
  junkPage.value = 1
})

watch(junkTotalPages, (total) => {
  if (junkPage.value > total)
    junkPage.value = total
})

watch(
  [activeTab, renderedDuplicateGroups, renderedJunkItems],
  ([tab, groups, junkItems]) => {
    if (tab === 'duplicates') {
      folderPaths.prefetch(groups.flatMap(group => group.files.map(file => file.cid)))
      return
    }
    folderPaths.prefetch(junkItems.map(item => item.cid))
  },
  { immediate: true },
)

function junkCategoryLabel(cat: JunkCategory): string {
  if (cat === 'adVideo')
    return '广告短视频'
  if (cat === 'web')
    return '网页/快捷方式'
  if (cat === 'textMagnet')
    return '文本/磁力'
  return '安装包/脚本'
}

function toggleJunkFid(fid: string) {
  const next = new Set(selectedJunkFids.value)
  if (next.has(fid))
    next.delete(fid)
  else
    next.add(fid)
  selectedJunkFids.value = next
}

function selectAllVisibleJunk() {
  selectedJunkFids.value = new Set(renderedJunkItems.value.map(item => item.fid))
}

function selectAllFilteredJunk() {
  selectedJunkFids.value = new Set(visibleJunkItems.value.map(item => item.fid))
}

async function startJunkScan() {
  refreshAdVideosAsync()

  const suffixes: string[] = []
  if (scanCategories.web)
    suffixes.push(...JUNK_EXTENSION_GROUPS.web)
  if (scanCategories.textMagnet)
    suffixes.push(...JUNK_EXTENSION_GROUPS.textMagnet)
  if (scanCategories.executable)
    suffixes.push(...JUNK_EXTENSION_GROUPS.executable)

  if (suffixes.length === 0) {
    toast.info('已刷新本地疑似广告短视频列表（如需扫描非视频文件请勾选对应类型）')
    return
  }

  junkController?.abort()
  const controller = new AbortController()
  junkController = controller
  scannedDriveJunk.value = []
  selectedJunkFids.value = new Set()
  scanningJunk.value = true
  junkScanProgress.scannedSuffixes = 0
  junkScanProgress.totalSuffixes = suffixes.length + (scanCategories.textMagnet ? 1 : 0)
  junkScanProgress.currentLabel = ''
  junkScanProgress.found = 0

  try {
    const items = await scanDriveJunkFiles({
      suffixes,
      includeMagnetSearch: scanCategories.textMagnet,
      signal: controller.signal,
      onBatch: (added) => {
        if (junkController !== controller || added.length === 0)
          return
        scannedDriveJunk.value = [...scannedDriveJunk.value, ...added]
        junkInitialized.value = true
      },
      onProgress: (p) => {
        junkScanProgress.scannedSuffixes = p.scannedSuffixes
        junkScanProgress.totalSuffixes = p.totalSuffixes
        junkScanProgress.currentLabel = p.currentLabel
        junkScanProgress.found = p.found
      },
    })
    scannedDriveJunk.value = items
    junkInitialized.value = true
    toast.success(`网盘扫描完成，共发现 ${items.length} 个非视频推广/垃圾文件`)
  }
  catch (e) {
    if (!controller.signal.aborted)
      toast.error(`扫描失败：${e instanceof Error ? e.message : '未知错误'}`)
  }
  finally {
    if (junkController === controller) {
      scanningJunk.value = false
      junkController = null
    }
  }
}

function abortJunkScan() {
  junkController?.abort()
  scanningJunk.value = false
  if (scannedDriveJunk.value.length > 0) {
    junkInitialized.value = true
    toast.info(`已停止扫描，已保留已发现的 ${scannedDriveJunk.value.length} 个文件`)
    return
  }
  toast.info('已停止扫描')
}

onMounted(() => {
  if (store.duplicateStale || store.duplicateAnalyzedAt === 0)
    void store.runDuplicateAnalysis()
})

onUnmounted(() => {
  if (adScanTimer)
    clearTimeout(adScanTimer)
  junkController?.abort()
})

/** === 通用跳转与批量清理 === */
function playVideo(pickCode: string) {
  store.openPlayerOverlay(pickCode)
}

function openMediaDetail(mediaKey: string) {
  void router.push({ name: 'library-detail', params: { mediaKey } })
}

const activeSelectedFiles = computed(() => {
  if (activeTab.value === 'duplicates') {
    const map = new Map<string, { fid: string, cid: string, name: string, size: number }>()
    for (const group of renderedDuplicateGroups.value) {
      for (const file of group.files) {
        if (selectedDupFids.value.has(file.fid))
          map.set(file.fid, { fid: file.fid, cid: file.cid, name: file.name, size: file.size })
      }
    }
    return Array.from(map.values())
  }
  return visibleJunkItems.value
    .filter(item => selectedJunkFids.value.has(item.fid))
    .map(item => ({ fid: item.fid, cid: item.cid, name: item.name, size: item.size }))
})

const activeSelectedCount = computed(() => activeSelectedFiles.value.length)
const activeSelectedSize = computed(() =>
  activeSelectedFiles.value.reduce((sum, item) => sum + item.size, 0),
)

const deleteProgress = reactive<SafeDeleteProgress>({
  phase: 'files',
  completedFiles: 0,
  totalFiles: 0,
  deletedFiles: 0,
  failedFiles: 0,
  completedDirs: 0,
  totalDirs: 0,
  checkedFolders: 0,
  totalFolders: 0,
  deletedFolders: 0,
  lastError: undefined,
})
let deleteController: AbortController | null = null

useEventListener(window, 'beforeunload', (event: BeforeUnloadEvent) => {
  if (!deleting.value)
    return
  event.preventDefault()
  event.returnValue = ''
})

function abortBatchCleanup() {
  deleteController?.abort()
  toast.info('正在停止剩余清理任务...')
}

async function applyDeletedBatch(fids: string[]) {
  if (fids.length === 0)
    return
  await store.applyFilesDelete(fids)
  const deletedSet = new Set(fids)
  scannedDriveJunk.value = scannedDriveJunk.value.filter(item => !deletedSet.has(item.fid))
  adVideoItems.value = adVideoItems.value.filter(item => !deletedSet.has(item.fid))
  selectedDupFids.value = new Set(
    Array.from(selectedDupFids.value).filter(fid => !deletedSet.has(fid)),
  )
  selectedJunkFids.value = new Set(
    Array.from(selectedJunkFids.value).filter(fid => !deletedSet.has(fid)),
  )
}

async function executeBatchCleanup() {
  const targets = activeSelectedFiles.value
  if (targets.length === 0 || deleting.value)
    return

  const confirmed = await dialog.confirm({
    title: '确认移入回收站',
    content: deleteEmptyParent.value
      ? `确定将选中的 ${targets.length} 个文件（${format.fileSize(activeSelectedSize.value)}）移入 115 回收站，并尝试安全清理空/独立父目录吗？`
      : `确定将选中的 ${targets.length} 个文件（${format.fileSize(activeSelectedSize.value)}）移入 115 回收站吗？`,
    confirmText: '移入回收站',
    cancelText: '取消',
  })
  if (!confirmed)
    return

  deleteController?.abort()
  const controller = new AbortController()
  deleteController = controller

  Object.assign(deleteProgress, {
    phase: 'files',
    completedFiles: 0,
    totalFiles: targets.length,
    deletedFiles: 0,
    failedFiles: 0,
    completedDirs: 0,
    totalDirs: 0,
    checkedFolders: 0,
    totalFolders: 0,
    deletedFolders: 0,
    lastError: undefined,
  })

  deleting.value = true
  try {
    const res = await safeDeleteFiles(targets, {
      deleteEmptyParent: deleteEmptyParent.value,
      allIndexedVideos: store.videos,
      signal: controller.signal,
      onProgress: (progress) => {
        Object.assign(deleteProgress, progress)
      },
      onBatchDeleted: applyDeletedBatch,
    })

    const parts = [`已将 ${res.deletedFileIds.length} 个文件移入回收站`]
    if (res.deletedFolders.length > 0)
      parts.push(`安全清理 ${res.deletedFolders.length} 个空/独立父目录`)
    if (res.skippedFolders.length > 0)
      parts.push(`保留 ${res.skippedFolders.length} 个非空或受保护父目录`)
    if (res.failedFileIds.length > 0)
      parts.push(`${res.failedFileIds.length} 个删除失败`)
    if (res.aborted)
      parts.push('已停止剩余清理')

    if (res.deletedFileIds.length > 0) {
      toast.success(res.lastError ? `${parts.join('，')}（${res.lastError}）` : parts.join('，'))
    }
    else if (res.aborted) {
      toast.info('已取消批量清理')
    }
    else {
      toast.error(res.lastError ? `清理失败：${res.lastError}` : '清理失败，未成功删除任何文件')
    }
  }
  finally {
    if (deleteController === controller)
      deleteController = null
    deleting.value = false
  }
}
</script>
