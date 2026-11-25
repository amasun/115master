<template>
  <div class="flex max-h-[72vh] flex-col gap-3">
    <!-- 搜索框与演员反查入口 -->
    <div class="relative flex items-center gap-2">
      <div class="relative flex flex-1 items-center">
        <Icon
          :name="I.SEARCH"
          class="text-base-content/50 pointer-events-none absolute left-3.5 text-lg"
        />
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          placeholder="输入演员、创作者(@账号)、番号、目录路径、标签或关键词…"
          class="input input-bordered bg-base-200/50 focus:bg-base-100 w-full rounded-xl pr-9 pl-10 text-sm"
          @focus="onInputFocus"
          @blur="onInputBlur"
          @input="onInputChange"
          @keydown="handleInputKeydown"
        >
        <button
          v-if="query"
          type="button"
          class="btn btn-ghost btn-xs btn-circle absolute right-2"
          title="清空"
          aria-label="清空搜索词"
          @click="clearQuery"
        >
          <Icon :name="I.CLOSE" class="text-sm" />
        </button>

        <!-- 演员头像候选下拉 -->
        <div
          v-if="dropdownVisible"
          class="bg-base-100 border-base-content/15 absolute top-full right-0 left-0 z-30 mt-1.5 overflow-hidden rounded-xl border shadow-lg"
        >
          <div class="text-base-content/50 border-base-content/10 border-b px-3 py-1.5 text-[11px]">
            演员候选联想（选择或回车直接反查全部作品）
          </div>
          <ul class="max-h-60 overflow-y-auto py-1">
            <li
              v-for="(item, index) in suggestions"
              :key="item.name"
            >
              <button
                type="button"
                class="hover:bg-base-200/75 flex w-full items-center justify-between gap-2.5 px-3 py-1.5 text-left text-xs transition-colors"
                :class="{ 'bg-base-200': index === activeSuggestionIndex }"
                @mousedown.prevent="selectSuggestion(item)"
              >
                <span class="flex min-w-0 items-center gap-2.5">
                  <img
                    :src="item.avatarUrl"
                    :alt="item.name"
                    class="bg-base-300 h-6 w-6 shrink-0 rounded-full object-cover"
                    loading="lazy"
                  >
                  <span class="text-base-content truncate font-medium">{{ item.name }}</span>
                </span>
                <span class="text-base-content/45 shrink-0 text-[11px]">
                  反查作品
                </span>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <button
        type="button"
        class="btn btn-sm btn-secondary btn-soft shrink-0 rounded-xl"
        :disabled="!snapshot || !query.trim() || actorLoading"
        title="仅在手动点击或回车时通过 JavBus / JavDB 反查演员全部作品"
        @click="triggerActorLookup(query)"
      >
        <span v-if="actorLoading" class="loading loading-spinner loading-xs" />
        <span>反查演员</span>
      </button>
    </div>

    <!-- 索引状态栏 -->
    <div class="bg-base-200/45 border-base-content/10 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs">
      <div class="text-base-content/75 flex flex-wrap items-center gap-x-3 gap-y-1">
        <template v-if="syncing">
          <span class="loading loading-spinner loading-xs text-primary" />
          <span>
            正在{{ progress?.mode === 'incremental' ? '增量更新' : '全量扫描' }}网盘视频…
            已拉取 {{ progress?.fetched ?? 0 }}
            <template v-if="progress && progress.total > 0"> / {{ progress.total }}</template>
            （第 {{ progress?.pages ?? 0 }} 页）
          </span>
        </template>
        <template v-else-if="snapshot">
          <span>
            已索引 <strong class="text-base-content tabular-nums">{{ snapshot.items.length }}</strong> 个视频
          </span>
          <span class="text-base-content/55">
            识别番号 <strong class="text-base-content/80 tabular-nums">{{ avCount }}</strong> 部
          </span>
          <span class="text-base-content/55">
            本地元数据 <strong class="text-base-content/80 tabular-nums">{{ javMap.size }}</strong> 部
          </span>
          <span v-if="totalFolderCount > 0" class="text-base-content/55">
            目录 <strong class="text-base-content/80 tabular-nums">{{ indexedFolderCount }}/{{ totalFolderCount }}</strong>
          </span>
          <span v-if="folderSyncing" class="text-secondary flex items-center gap-1">
            <span class="loading loading-spinner loading-xs" />
            <span>
              正在索引目录 {{ folderProgress?.resolved ?? indexedFolderCount }} / {{ folderProgress?.total ?? totalFolderCount }}
            </span>
          </span>
          <span class="text-base-content/45">
            更新于 {{ lastSyncLabel }}
          </span>
        </template>
        <template v-else>
          <span class="text-base-content/65">尚未建立本地网盘视频索引（仅扫描视频，自动忽略其他文件）</span>
        </template>
      </div>

      <div class="flex items-center gap-1.5">
        <template v-if="syncing">
          <button
            type="button"
            class="btn btn-xs btn-outline btn-error rounded-lg"
            @click="cancelSync"
          >
            取消
          </button>
        </template>
        <template v-else>
          <button
            v-if="folderSyncing"
            type="button"
            class="btn btn-xs btn-outline btn-error rounded-lg"
            @click="cancelFolderSync"
          >
            取消目录索引
          </button>
          <button
            v-else-if="snapshot && indexedFolderCount < totalFolderCount"
            type="button"
            class="btn btn-xs btn-secondary btn-soft rounded-lg"
            title="按安全节流速度解析父目录路径，支持按目录搜索与自动识别 OnlyFans / MyFans 目录，可随时取消并断点续传"
            @click="startFolderSync"
          >
            <Icon :name="I.FOLDER_OPEN" class="text-xs" />
            <span>索引目录</span>
          </button>
          <button
            v-if="snapshot"
            type="button"
            class="btn btn-xs btn-ghost rounded-lg"
            title="选择索引与刮削根目录（支持多选，不选默认全盘）"
            @click="configureRootFolders"
          >
            <Icon :name="I.FOLDER_OPEN" class="text-xs" />
            <span>{{ indexRootFolders.length > 0 ? `${indexRootFolders.length} 个目录` : '全盘' }}</span>
          </button>
          <button
            type="button"
            class="btn btn-xs btn-primary rounded-lg"
            @click="startSync(snapshot ? 'incremental' : 'full')"
          >
            <Icon :name="I.RESTART" class="text-xs" />
            <span>{{ snapshot ? '增量更新' : '建立索引' }}</span>
          </button>
          <button
            v-if="snapshot"
            type="button"
            class="btn btn-xs btn-ghost rounded-lg"
            title="全量重新扫描网盘视频索引"
            @click="startSync('full')"
          >
            全量重建
          </button>
        </template>
      </div>
    </div>

    <!-- 来源平台筛选栏 -->
    <div
      v-if="snapshot && platformTabs.length > 1"
      class="flex flex-wrap items-center gap-1.5 px-0.5 text-xs"
    >
      <button
        v-for="tab in platformTabs"
        :key="tab.key"
        type="button"
        class="btn btn-xs rounded-lg transition-colors"
        :class="platformFilter === tab.key ? 'btn-primary' : 'btn-ghost bg-base-200/50 text-base-content/75'"
        @click="platformFilter = tab.key"
      >
        <span>{{ tab.label }}</span>
        <span class="tabular-nums opacity-65">{{ tab.count }}</span>
      </button>
    </div>

    <!-- 通道 A：在线演员反查状态条 -->
    <div
      v-if="snapshot && (actorLoading || actorEntry)"
      class="bg-secondary/8 border-secondary/20 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs"
    >
      <div class="text-base-content/80 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <template v-if="actorLoading">
          <span class="loading loading-spinner loading-xs text-secondary" />
          <span v-if="actorProgress?.stage === 'searching'">
            正在从 {{ actorProgress.source === 'javbus' ? 'JavBus' : 'JavDB' }} 搜索演员「{{ actorLookupQuery }}」…
          </span>
          <span v-else>
            正在从 {{ actorProgress?.source === 'javdb' ? 'JavDB' : 'JavBus' }} 拉取「{{ actorLookupQuery }}」作品表（第 {{ actorProgress?.page ?? 1 }} / {{ actorProgress?.maxPages ?? 5 }} 页，已收集 {{ actorProgress?.collected ?? 0 }} 部）…
          </span>
        </template>
        <template v-else-if="actorEntry">
          <span class="badge badge-secondary badge-soft badge-xs font-medium">
            {{ actorEntry.source === 'javbus' ? 'JavBus' : 'JavDB' }}
          </span>
          <span>
            演员 <strong class="text-base-content">{{ actorEntry.name }}</strong> 已收录
            <strong class="text-base-content tabular-nums">{{ actorEntry.avNumbers.length }}</strong> 部作品（{{ actorEntry.fetchedPages }} 页）
          </span>
          <span class="text-base-content/60">
            · 网盘命中 <strong class="text-secondary tabular-nums">{{ actorReverseHitCount }}</strong> 部
          </span>
          <span v-if="actorFromCache" class="badge badge-ghost badge-xs text-[11px]">
            7天缓存
          </span>
        </template>
      </div>

      <div class="flex items-center gap-1.5">
        <template v-if="actorLoading">
          <button
            type="button"
            class="btn btn-xs btn-outline btn-error rounded-lg"
            @click="cancelActorLookup"
          >
            取消
          </button>
        </template>
        <template v-else-if="actorEntry">
          <button
            v-if="actorEntry.hasMore && actorEntry.fetchedPages < HARD_MAX_PAGES"
            type="button"
            class="btn btn-xs btn-secondary btn-outline rounded-lg"
            @click="loadMoreActorWorks"
          >
            加载更多
          </button>
          <button
            type="button"
            class="btn btn-xs btn-ghost rounded-lg"
            title="跳过 7 天缓存重新抓取该演员作品"
            @click="triggerActorLookup(actorEntry.name, true)"
          >
            刷新
          </button>
        </template>
      </div>
    </div>

    <!-- 错误提示 -->
    <div
      v-if="errorMessage"
      class="alert alert-error py-2 text-xs"
    >
      <span>{{ errorMessage }}</span>
    </div>

    <!-- 通道 A 警告提示（不遮挡本地通道 B/C 结果） -->
    <div
      v-if="actorError"
      class="alert alert-warning flex items-center justify-between gap-2 py-2 text-xs"
    >
      <span>{{ actorError }}（下方仍显示本地缓存与文件名匹配结果）</span>
      <button
        type="button"
        class="btn btn-ghost btn-xs"
        @click="actorError = ''"
      >
        忽略
      </button>
    </div>

    <!-- 结果区 -->
    <div class="min-h-[260px] flex-1 overflow-y-auto pr-1">
      <!-- 未建索引且未输入关键词 -->
      <div
        v-if="!snapshot && !syncing && !query.trim()"
        class="text-base-content/60 flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center"
      >
        <Icon :name="I.SEARCH" class="text-base-content/25 text-4xl" />
        <div class="space-y-1">
          <p class="text-base-content text-sm font-medium">
            一键建立网盘视频索引
          </p>
          <p class="text-xs leading-relaxed">
            通过 115 跨子目录接口仅拉取视频文件（8,000 部约 3–5 秒），零外部风控，支持按演员、标签、导演、番号和文件名毫秒检索；未建库时也可直接输入关键词走 115 原生搜索。
          </p>
        </div>
        <button
          type="button"
          class="btn btn-sm btn-primary rounded-xl"
          @click="startSync('full')"
        >
          立即建立索引
        </button>
      </div>

      <!-- 已建索引但未输入关键词且未筛选平台 -->
      <div
        v-else-if="!query.trim() && platformFilter === 'all'"
        class="text-base-content/55 flex h-full min-h-[220px] flex-col items-center justify-center gap-2 text-center text-xs"
      >
        <p>输入关键词开始本地毫秒级检索，或点击上方来源标签浏览</p>
        <p class="text-base-content/45">
          支持 <code class="kbd kbd-xs">@账号</code>、<code class="kbd kbd-xs">of:</code>、<code class="kbd kbd-xs">mf:</code>、<code class="kbd kbd-xs">dir:</code> 前缀 · 快捷键 <kbd class="kbd kbd-xs">Alt</kbd> + <kbd class="kbd kbd-xs">K</kbd> 随时唤起
        </p>
      </div>

      <!-- 本地无匹配结果：展示空态与 115 原生搜索兜底 -->
      <div
        v-else-if="results.length === 0"
        class="flex flex-col gap-3"
      >
        <div class="text-base-content/55 flex flex-col items-center justify-center gap-2 rounded-xl py-4 text-center text-xs">
          <p class="text-base-content/80 text-sm font-medium">
            {{ snapshot ? `本地索引未找到与「${query.trim()}」匹配的视频` : `尚未建立本地视频索引，已尝试 115 原生搜索「${query.trim()}」` }}
          </p>
          <p v-if="snapshot && !actorEntry && !actorLoading">
            本地索引与已缓存元数据中暂无匹配；若搜索的是演员名，可点击下方按钮在线反查其作品表。
          </p>
          <p v-else-if="actorEntry">
            已对照 {{ actorEntry.source === 'javbus' ? 'JavBus' : 'JavDB' }} 的 {{ actorEntry.avNumbers.length }} 部作品，当前本地网盘索引暂无命中。
          </p>
          <div class="flex flex-wrap items-center justify-center gap-2">
            <button
              v-if="snapshot && !actorLoading && !actorEntry"
              type="button"
              class="btn btn-xs btn-secondary rounded-lg"
              @click="triggerActorLookup(query)"
            >
              在线反查「{{ query.trim() }}」
            </button>
            <button
              v-if="actorEntry?.hasMore && actorEntry.fetchedPages < HARD_MAX_PAGES && !actorLoading"
              type="button"
              class="btn btn-xs btn-outline rounded-lg"
              @click="loadMoreActorWorks"
            >
              继续加载更多作品
            </button>
            <button
              type="button"
              class="btn btn-xs btn-outline rounded-lg"
              :disabled="nativeLoading"
              @click="runNativeFallbackSearch(query, true)"
            >
              {{ nativeLoading ? '正在原生搜索…' : '刷新 115 原生搜索' }}
            </button>
          </div>
        </div>

        <!-- 115 原生搜索兜底结果 -->
        <div
          v-if="nativeLoading || nativeError || nativeSearchedQuery"
          class="bg-base-200/30 border-base-content/10 flex flex-col gap-2 rounded-xl border p-3"
        >
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div class="flex items-center gap-2">
              <span class="badge badge-info badge-soft badge-xs font-medium">115 原生搜索兜底</span>
              <span v-if="!nativeLoading && !nativeError" class="text-base-content/60 text-[11px] tabular-nums">
                匹配 {{ nativeTotal }} 条{{ nativeResults.length < nativeTotal ? `（显示前 ${nativeResults.length} 条）` : '' }}
              </span>
            </div>
          </div>

          <div v-if="nativeLoading" class="text-base-content/60 flex items-center gap-2 py-3 text-xs">
            <span class="loading loading-spinner loading-xs text-info" />
            <span>正在调用 115 原生搜索「{{ query.trim() }}」…</span>
          </div>

          <div v-else-if="nativeError" class="alert alert-warning py-2 text-xs">
            <span>{{ nativeError }}</span>
          </div>

          <div v-else-if="nativeResults.length === 0" class="text-base-content/50 py-2 text-center text-xs">
            115 原生搜索也未找到匹配的文件或目录
          </div>

          <div v-else class="flex flex-col gap-1.5">
            <div
              v-for="item in nativeResults"
              :key="item.fc === 1 ? item.fid : item.cid"
              class="bg-base-100/50 hover:bg-base-200/70 border-base-content/8 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-colors"
            >
              <div class="min-w-0 flex-1 space-y-0.5">
                <div class="flex items-center gap-1.5">
                  <span
                    class="badge badge-xs shrink-0"
                    :class="item.fc === 0 ? 'badge-warning badge-soft' : item.iv === 1 ? 'badge-primary badge-soft' : 'badge-ghost'"
                  >
                    {{ item.fc === 0 ? '目录' : item.iv === 1 ? '视频' : '文件' }}
                  </span>
                  <span class="text-base-content truncate text-sm font-medium" :title="item.n">
                    {{ item.n }}
                  </span>
                </div>
                <div class="text-base-content/55 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] tabular-nums">
                  <span v-if="item.fc === 1 && Number(item.s) > 0">{{ formatSize(Number(item.s)) }}</span>
                  <span v-if="item.fc === 1 && Number(item.play_long) > 0">{{ formatDuration(Number(item.play_long)) }}</span>
                  <span v-if="Number(item.tu || item.t) > 0">{{ format.dateTime(Number(item.tu || item.t)) }}</span>
                </div>
              </div>

              <div class="flex shrink-0 items-center gap-1.5">
                <button
                  v-if="item.fc === 1 && item.iv === 1 && item.pc"
                  type="button"
                  class="btn btn-xs btn-primary rounded-lg"
                  title="使用 MASTER 播放器播放"
                  @click="playNativeItem(item.pc)"
                >
                  <Icon :name="I.PLAY" class="text-xs" />
                  <span>播放</span>
                </button>
                <button
                  type="button"
                  class="btn btn-xs btn-ghost max-w-44 rounded-lg sm:max-w-56"
                  :title="folderPaths.getNativeItemDisplay(item).tooltip"
                  @click="openFolderByCid(item.fc === 0 ? item.cid : item.pid)"
                >
                  <Icon :name="I.FOLDER_OPEN" class="shrink-0 text-xs" />
                  <span class="min-w-0 truncate">{{ folderPaths.getNativeItemDisplay(item).label }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 匹配结果列表 -->
      <div v-else class="flex flex-col gap-2">
        <div class="text-base-content/55 flex items-center justify-between px-1 text-[11px]">
          <span>
            共匹配 <strong class="text-base-content tabular-nums">{{ results.length }}</strong> 个视频
            <template v-if="results.length > MAX_VISIBLE">（当前显示前 {{ MAX_VISIBLE }} 条）</template>
          </span>
          <button
            type="button"
            class="btn btn-xs btn-ghost rounded-lg"
            :disabled="nativeLoading"
            @click="runNativeFallbackSearch(query, true)"
          >
            {{ nativeLoading ? '原生搜索中…' : '用 115 原生搜索' }}
          </button>
        </div>

        <div
          v-for="item in visibleResults"
          :key="item.video.fid"
          class="bg-base-200/35 hover:bg-base-200/75 border-base-content/8 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors"
        >
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <span
                v-if="item.platform === 'onlyfans'"
                class="badge badge-info badge-soft badge-xs font-medium"
              >
                OnlyFans
              </span>
              <span
                v-else-if="item.platform === 'myfans'"
                class="badge badge-accent badge-soft badge-xs font-medium"
              >
                MyFans
              </span>
              <span
                v-else-if="item.platform === 'fc2' && !(item.avNumber ?? item.video.avNumber)"
                class="badge badge-secondary badge-soft badge-xs font-medium"
              >
                FC2
              </span>
              <span
                v-if="item.avNumber !== undefined ? item.avNumber : item.video.avNumber"
                class="badge badge-primary badge-soft badge-xs font-mono font-semibold"
              >
                {{ item.avNumber !== undefined ? item.avNumber : item.video.avNumber }}
              </span>
              <span
                v-if="item.creator"
                class="badge badge-outline badge-xs text-[11px]"
              >
                {{ item.creator.name ? (item.creator.handle && item.creator.name.toLowerCase() !== item.creator.handle.toLowerCase() ? `${item.creator.name} (@${item.creator.handle})` : item.creator.name) : `@${item.creator.handle}` }}
              </span>
              <span
                v-if="item.video.starred"
                class="badge badge-warning badge-soft badge-xs gap-0.5 font-medium"
                title="已收藏（星标）"
              >
                <Icon :name="I.STAR_FILL" class="text-[11px]" />
                <span>已收藏</span>
              </span>
              <span
                v-for="label in item.video.labels"
                :key="label.id"
                class="badge bg-base-content/10 badge-xs border-none text-[11px]"
                :style="label.color ? { backgroundColor: label.color } : undefined"
                :title="`网盘标签：${label.name}`"
              >
                {{ label.name }}
              </span>
              <span
                v-for="reason in item.reasons"
                :key="`${reason.kind}-${reason.label}`"
                class="badge badge-xs text-[11px]"
                :class="reason.kind === 'actorReverse' || reason.kind === 'creator'
                  ? 'badge-secondary badge-soft font-medium'
                  : reason.kind === 'folderPath'
                    ? 'badge-info badge-soft'
                    : 'badge-ghost'"
              >
                {{ reason.label }}
              </span>
            </div>

            <div
              class="text-base-content truncate text-sm font-medium"
              :title="item.javInfo?.title || item.video.name"
            >
              {{ item.javInfo?.title || item.video.name }}
            </div>

            <div class="text-base-content/55 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
              <span v-if="item.javInfo?.title" class="max-w-[360px] truncate" :title="item.video.name">
                {{ item.video.name }}
              </span>
              <span v-if="item.video.duration > 0" class="tabular-nums">
                {{ formatDuration(item.video.duration) }}
              </span>
              <span v-if="item.video.size > 0" class="tabular-nums">
                {{ formatSize(item.video.size) }}
              </span>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              class="btn btn-xs btn-primary rounded-lg"
              title="使用 MASTER 播放器播放"
              @click="playVideo(item.video)"
            >
              <Icon :name="I.PLAY" class="text-xs" />
              <span>播放</span>
            </button>
            <button
              type="button"
              class="btn btn-xs btn-ghost max-w-44 rounded-lg sm:max-w-56"
              :title="folderPaths.getTooltip(item.video.cid, '打开视频所在网盘目录')"
              @click="openFolder(item.video)"
            >
              <Icon :name="I.FOLDER_OPEN" class="shrink-0 text-xs" />
              <span class="min-w-0 truncate">{{ folderPaths.getLabel(item.video.cid) }}</span>
            </button>
          </div>
        </div>

        <!-- 手动触发的 115 原生搜索兜底结果 -->
        <div
          v-if="nativeManualTriggered && (nativeLoading || nativeError || nativeSearchedQuery)"
          class="bg-base-200/30 border-base-content/10 mt-1 flex flex-col gap-2 rounded-xl border p-3"
        >
          <div class="flex items-center justify-between gap-2 text-xs">
            <div class="flex items-center gap-2">
              <span class="badge badge-info badge-soft badge-xs font-medium">115 原生搜索兜底</span>
              <span v-if="!nativeLoading && !nativeError" class="text-base-content/60 text-[11px] tabular-nums">
                匹配 {{ nativeTotal }} 条{{ nativeResults.length < nativeTotal ? `（显示前 ${nativeResults.length} 条）` : '' }}
              </span>
            </div>
          </div>

          <div v-if="nativeLoading" class="text-base-content/60 flex items-center gap-2 py-2 text-xs">
            <span class="loading loading-spinner loading-xs text-info" />
            <span>正在调用 115 原生搜索「{{ query.trim() }}」…</span>
          </div>

          <div v-else-if="nativeError" class="alert alert-warning py-2 text-xs">
            <span>{{ nativeError }}</span>
          </div>

          <div v-else-if="nativeResults.length === 0" class="text-base-content/50 py-2 text-center text-xs">
            115 原生搜索未找到更多结果
          </div>

          <div v-else class="flex flex-col gap-1.5">
            <div
              v-for="item in nativeResults"
              :key="`manual-${item.fc === 1 ? item.fid : item.cid}`"
              class="bg-base-100/50 hover:bg-base-200/70 border-base-content/8 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-colors"
            >
              <div class="min-w-0 flex-1 space-y-0.5">
                <div class="flex items-center gap-1.5">
                  <span
                    class="badge badge-xs shrink-0"
                    :class="item.fc === 0 ? 'badge-warning badge-soft' : item.iv === 1 ? 'badge-primary badge-soft' : 'badge-ghost'"
                  >
                    {{ item.fc === 0 ? '目录' : item.iv === 1 ? '视频' : '文件' }}
                  </span>
                  <span class="text-base-content truncate text-sm font-medium" :title="item.n">
                    {{ item.n }}
                  </span>
                </div>
                <div class="text-base-content/55 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] tabular-nums">
                  <span v-if="item.fc === 1 && Number(item.s) > 0">{{ formatSize(Number(item.s)) }}</span>
                  <span v-if="item.fc === 1 && Number(item.play_long) > 0">{{ formatDuration(Number(item.play_long)) }}</span>
                  <span v-if="Number(item.tu || item.t) > 0">{{ format.dateTime(Number(item.tu || item.t)) }}</span>
                </div>
              </div>

              <div class="flex shrink-0 items-center gap-1.5">
                <button
                  v-if="item.fc === 1 && item.iv === 1 && item.pc"
                  type="button"
                  class="btn btn-xs btn-primary rounded-lg"
                  title="使用 MASTER 播放器播放"
                  @click="playNativeItem(item.pc)"
                >
                  <Icon :name="I.PLAY" class="text-xs" />
                  <span>播放</span>
                </button>
                <button
                  type="button"
                  class="btn btn-xs btn-ghost max-w-44 rounded-lg sm:max-w-56"
                  :title="folderPaths.getNativeItemDisplay(item).tooltip"
                  @click="openFolderByCid(item.fc === 0 ? item.cid : item.pid)"
                >
                  <Icon :name="I.FOLDER_OPEN" class="shrink-0 text-xs" />
                  <span class="min-w-0 truncate">{{ folderPaths.getNativeItemDisplay(item).label }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Share } from '@115master/drive115'
import type { FolderSyncProgress } from '@/utils/driveFolderPath'
import type { JavInfo } from '@/utils/jav/jav'
import type {
  ActorFetchProgress,
  ActorReverseMatch,
  ActorSuggestion,
  ActorWorksCacheEntry,
  IndexedVideo,
  IndexProgress,
  PlatformFilter,
  VideoIndexSnapshot,
} from '@/utils/superSearch'
import { GM_openInTab } from '$'
import { format } from '@115master/utils'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { openIndexFolderPicker } from '@/components/IndexFolderPicker'
import { MASTER_BASE_URL } from '@/constants'
import { I, Icon } from '@/icons'
import { actressFaceDB } from '@/utils/actressFaceDB'
import { drive115 } from '@/utils/drive115Instance'
import { useFolderPathLabels } from '@/utils/driveFolderPath'
import { goToPlayer } from '@/utils/route'
import {
  fetchActorWorks,
  HARD_MAX_PAGES,
  loadAllCachedJavInfo,
  loadVideoIndexSnapshot,
  normalizeActorKey,
  resolveVideoIdentity,
  searchIndexedVideos,
  syncDriveVideoIndex,
} from '@/utils/superSearch'
import {
  getConfiguredIndexRootCids,
  normalizeIndexRootFolders,
  useUserSetting,
} from '@/utils/userSettings'

const emit = defineEmits<{
  close: []
}>()

const MAX_VISIBLE = 100

const folderPaths = useFolderPathLabels()
const inputRef = ref<HTMLInputElement | null>(null)
const query = ref('')
const snapshot = shallowRef<VideoIndexSnapshot | null>(null)
const javMap = shallowRef<Map<string, JavInfo>>(new Map())
const syncing = ref(false)
const progress = ref<IndexProgress | null>(null)
const errorMessage = ref('')
let abortController: AbortController | null = null

const folderSyncing = ref(false)
const folderProgress = ref<FolderSyncProgress | null>(null)
let folderAbortController: AbortController | null = null
const platformFilter = ref<PlatformFilter>('all')
const indexRootFolders = useUserSetting('indexRootFolders')

const actressDbReady = ref(false)
const inputFocused = ref(false)
const dropdownDismissed = ref(false)
const activeSuggestionIndex = ref(-1)

const actorLoading = ref(false)
const actorLookupQuery = ref('')
const actorProgress = ref<ActorFetchProgress | null>(null)
const actorEntry = shallowRef<ActorWorksCacheEntry | null>(null)
const actorFromCache = ref(false)
const actorError = ref('')
let actorAbortController: AbortController | null = null
let actorRequestId = 0

const nativeResults = shallowRef<Share.Entity.FilesItem[]>([])
const nativeLoading = ref(false)
const nativeError = ref('')
const nativeSearchedQuery = ref('')
const nativeTotal = ref(0)
const nativeManualTriggered = ref(false)
let nativeController: AbortController | null = null
let nativeTimer: ReturnType<typeof setTimeout> | null = null

const folderMap = computed(() => folderPaths.getAllCached())

const uniqueFolderCids = computed(() => {
  if (!snapshot.value)
    return []
  const seen = new Set<string>()
  for (const item of snapshot.value.items) {
    if (item.cid && item.cid !== '0')
      seen.add(item.cid)
  }
  return Array.from(seen)
})

const totalFolderCount = computed(() => uniqueFolderCids.value.length)

const indexedFolderCount = computed(() => {
  let count = 0
  for (const cid of uniqueFolderCids.value) {
    if (folderMap.value.has(cid))
      count += 1
  }
  return count
})

const platformCounts = computed(() => {
  const counts: Record<PlatformFilter, number> = {
    all: 0,
    jav: 0,
    fc2: 0,
    onlyfans: 0,
    myfans: 0,
    unknown: 0,
  }
  if (!snapshot.value)
    return counts

  counts.all = snapshot.value.items.length
  for (const item of snapshot.value.items) {
    const folder = item.cid && item.cid !== '0' ? folderMap.value.get(item.cid) : undefined
    const identity = resolveVideoIdentity(item, folder)
    counts[identity.platform] += 1
  }
  return counts
})

const platformTabs = computed(() => {
  const defs: Array<{ key: PlatformFilter, label: string }> = [
    { key: 'all', label: '全部' },
    { key: 'jav', label: '正规 AV' },
    { key: 'fc2', label: 'FC2' },
    { key: 'onlyfans', label: 'OnlyFans' },
    { key: 'myfans', label: 'MyFans' },
    { key: 'unknown', label: '其他' },
  ]
  return defs
    .map(def => ({ ...def, count: platformCounts.value[def.key] }))
    .filter(tab => tab.key === 'all' || tab.count > 0 || platformFilter.value === tab.key)
})

const avCount = computed(() =>
  platformCounts.value.jav + platformCounts.value.fc2,
)

const lastSyncLabel = computed(() => {
  if (!snapshot.value?.lastSyncAt)
    return '未知'
  return new Date(snapshot.value.lastSyncAt).toLocaleString()
})

const suggestions = computed<ActorSuggestion[]>(() => {
  if (!actressDbReady.value || query.value.trim().length < 2)
    return []
  return actressFaceDB.searchActresses(query.value, 6)
})

const dropdownVisible = computed(() =>
  inputFocused.value && !dropdownDismissed.value && suggestions.value.length > 0,
)

const actorReverse = computed<ActorReverseMatch | null>(() => {
  if (!actorEntry.value || !query.value.trim())
    return null
  return {
    actorName: actorEntry.value.name,
    source: actorEntry.value.source,
    avNumbers: new Set(actorEntry.value.avNumbers),
    aliases: actorEntry.value.aliases,
  }
})

const results = computed(() => {
  if (!snapshot.value)
    return []
  if (!query.value.trim() && platformFilter.value === 'all')
    return []
  return searchIndexedVideos(query.value, snapshot.value.items, javMap.value, {
    actorReverse: actorReverse.value,
    folderMap: folderMap.value,
    platformFilter: platformFilter.value,
  })
})

const actorReverseHitCount = computed(() =>
  results.value.filter(item => item.reasons.some(reason => reason.kind === 'actorReverse')).length,
)

const visibleResults = computed(() => results.value.slice(0, MAX_VISIBLE))

watch(
  [visibleResults, nativeResults],
  ([localItems, nativeItems]) => {
    folderPaths.prefetch([
      ...localItems.map(item => item.video.cid),
      ...nativeItems.map(item => item.pid ?? ''),
    ])
  },
  { immediate: true },
)

function formatSize(bytes: number): string {
  return format.fileSize(bytes)
}

function formatDuration(seconds: number): string {
  return format.duration(seconds)
}

function matchesActiveActor(nextQuery: string): boolean {
  const trimmed = nextQuery.trim()
  if (!trimmed)
    return false
  const nextKey = normalizeActorKey(trimmed)
  if (!nextKey)
    return false
  if (actorLookupQuery.value && normalizeActorKey(actorLookupQuery.value) === nextKey)
    return true
  if (!actorEntry.value)
    return false
  return actorEntry.value.actorKey === nextKey
    || normalizeActorKey(actorEntry.value.name) === nextKey
    || actorEntry.value.aliases.some(alias => normalizeActorKey(alias) === nextKey)
}

function clearActorState() {
  actorAbortController?.abort()
  actorAbortController = null
  actorRequestId += 1
  actorLoading.value = false
  actorProgress.value = null
  actorEntry.value = null
  actorFromCache.value = false
  actorError.value = ''
  actorLookupQuery.value = ''
}

watch(query, (nextQuery) => {
  activeSuggestionIndex.value = -1
  if (!matchesActiveActor(nextQuery))
    clearActorState()

  if (nativeTimer) {
    clearTimeout(nativeTimer)
    nativeTimer = null
  }
  nativeController?.abort()
  nativeController = null
  nativeLoading.value = false
  nativeResults.value = []
  nativeError.value = ''
  nativeSearchedQuery.value = ''
  nativeTotal.value = 0
  nativeManualTriggered.value = false
})

async function runNativeFallbackSearch(rawKeyword: string, manual = false) {
  const trimmed = rawKeyword.trim()
  if (!trimmed)
    return

  if (nativeTimer) {
    clearTimeout(nativeTimer)
    nativeTimer = null
  }
  nativeController?.abort()
  const controller = new AbortController()
  nativeController = controller

  if (manual)
    nativeManualTriggered.value = true
  nativeLoading.value = true
  nativeError.value = ''

  try {
    const res = await drive115.file.searchFiles({
      aid: 1,
      cid: '0',
      search_value: trimmed,
      show_dir: 1,
      offset: 0,
      limit: 50,
      format: 'json',
    }, controller.signal)

    if (controller.signal.aborted)
      return

    if (!res.state) {
      nativeError.value = res.error || '115 原生搜索失败'
      nativeResults.value = []
      nativeTotal.value = 0
    }
    else {
      const items = res.data ?? []
      nativeResults.value = items
      nativeTotal.value = Number(res.count) || items.length
      nativeSearchedQuery.value = trimmed
    }
  }
  catch (error) {
    if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError'))
      return
    nativeError.value = error instanceof Error ? error.message : '115 原生搜索请求异常'
    nativeResults.value = []
    nativeTotal.value = 0
  }
  finally {
    if (nativeController === controller) {
      nativeLoading.value = false
      nativeController = null
    }
  }
}

watch(
  [() => query.value.trim(), () => results.value.length, actorLoading],
  ([trimmed, localCount, isActorLoading]) => {
    if (nativeTimer) {
      clearTimeout(nativeTimer)
      nativeTimer = null
    }
    if (!trimmed || trimmed.length < 2 || localCount > 0 || isActorLoading)
      return
    if (/^(?:of|onlyfans|mf|myfans|fc2|jav|av|dir|folder):$/i.test(trimmed))
      return
    if (nativeSearchedQuery.value === trimmed && !nativeError.value)
      return

    nativeTimer = setTimeout(() => {
      nativeTimer = null
      void runNativeFallbackSearch(trimmed, false)
    }, 450)
  },
)

function onInputFocus() {
  inputFocused.value = true
  dropdownDismissed.value = false
}

function onInputBlur() {
  inputFocused.value = false
  activeSuggestionIndex.value = -1
}

function onInputChange() {
  dropdownDismissed.value = false
}

function clearQuery() {
  query.value = ''
  dropdownDismissed.value = false
  activeSuggestionIndex.value = -1
  inputRef.value?.focus()
}

function selectSuggestion(item: ActorSuggestion) {
  actorLookupQuery.value = item.name
  query.value = item.name
  dropdownDismissed.value = true
  activeSuggestionIndex.value = -1
  void triggerActorLookup(item.name)
}

function isNonJavLookupQuery(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed)
    return true
  if (trimmed.startsWith('@'))
    return true
  if (/^(?:of|onlyfans|mf|myfans|fc2|dir|folder):/i.test(trimmed))
    return true
  if (/^(?:only\s*fans|myfans|マイファン[ズス])$/i.test(trimmed))
    return true
  return platformFilter.value === 'onlyfans' || platformFilter.value === 'myfans'
}

function handleInputKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' && dropdownVisible.value) {
    event.preventDefault()
    activeSuggestionIndex.value = (activeSuggestionIndex.value + 1) % suggestions.value.length
    return
  }

  if (event.key === 'ArrowUp' && dropdownVisible.value) {
    event.preventDefault()
    const total = suggestions.value.length
    activeSuggestionIndex.value = activeSuggestionIndex.value <= 0
      ? total - 1
      : activeSuggestionIndex.value - 1
    return
  }

  if (event.key === 'Escape' && dropdownVisible.value) {
    event.preventDefault()
    event.stopPropagation()
    dropdownDismissed.value = true
    activeSuggestionIndex.value = -1
    return
  }

  if (event.key === 'Enter') {
    if (dropdownVisible.value && activeSuggestionIndex.value >= 0) {
      const selected = suggestions.value[activeSuggestionIndex.value]
      if (selected) {
        event.preventDefault()
        selectSuggestion(selected)
        return
      }
    }
    if (snapshot.value && query.value.trim()) {
      event.preventDefault()
      dropdownDismissed.value = true
      if (!isNonJavLookupQuery(query.value))
        void triggerActorLookup(query.value)
    }
  }
}

async function triggerActorLookup(rawName: string, forceRefresh = false) {
  const targetName = rawName.trim()
  if (!targetName || !snapshot.value)
    return

  actorAbortController?.abort()
  const controller = new AbortController()
  actorAbortController = controller
  const requestId = ++actorRequestId

  actorLookupQuery.value = targetName
  actorLoading.value = true
  actorError.value = ''
  actorProgress.value = {
    source: 'javbus',
    page: 0,
    maxPages: 5,
    collected: 0,
    stage: 'searching',
  }

  try {
    const result = await fetchActorWorks(targetName, {
      forceRefresh,
      signal: controller.signal,
      onProgress: (nextProgress) => {
        if (requestId === actorRequestId)
          actorProgress.value = nextProgress
      },
    })
    if (requestId !== actorRequestId)
      return
    actorEntry.value = result.entry
    actorFromCache.value = result.fromCache
  }
  catch (error) {
    if (requestId !== actorRequestId)
      return
    if (error instanceof DOMException && error.name === 'AbortError')
      return
    actorError.value = error instanceof Error ? error.message : '演员作品在线反查失败'
  }
  finally {
    if (requestId === actorRequestId) {
      actorLoading.value = false
      actorProgress.value = null
      actorAbortController = null
    }
  }
}

async function loadMoreActorWorks() {
  const existing = actorEntry.value
  if (!existing || actorLoading.value)
    return

  actorAbortController?.abort()
  const controller = new AbortController()
  actorAbortController = controller
  const requestId = ++actorRequestId

  actorLookupQuery.value = existing.name
  actorLoading.value = true
  actorError.value = ''
  actorProgress.value = {
    source: existing.source,
    page: existing.fetchedPages + 1,
    maxPages: Math.min(existing.fetchedPages + 5, HARD_MAX_PAGES),
    collected: existing.avNumbers.length,
    stage: 'fetching',
  }

  try {
    const result = await fetchActorWorks(existing.name, {
      existingEntry: existing,
      signal: controller.signal,
      onProgress: (nextProgress) => {
        if (requestId === actorRequestId)
          actorProgress.value = nextProgress
      },
    })
    if (requestId !== actorRequestId)
      return
    actorEntry.value = result.entry
    actorFromCache.value = result.fromCache
  }
  catch (error) {
    if (requestId !== actorRequestId)
      return
    if (error instanceof DOMException && error.name === 'AbortError')
      return
    actorError.value = error instanceof Error ? error.message : '加载更多作品失败'
  }
  finally {
    if (requestId === actorRequestId) {
      actorLoading.value = false
      actorProgress.value = null
      actorAbortController = null
    }
  }
}

function cancelActorLookup() {
  actorAbortController?.abort()
}

async function refreshLocalData() {
  const [loadedSnapshot, loadedJavMap] = await Promise.all([
    loadVideoIndexSnapshot(),
    loadAllCachedJavInfo(),
  ])
  snapshot.value = loadedSnapshot
  javMap.value = loadedJavMap
}

async function configureRootFolders() {
  const prevCids = getConfiguredIndexRootCids(indexRootFolders.value)
  const picked = await openIndexFolderPicker({
    initialFolders: indexRootFolders.value,
  })
  if (picked === null)
    return
  indexRootFolders.value = picked
  const nextCids = getConfiguredIndexRootCids(picked)
  const changed = prevCids.length !== nextCids.length
    || prevCids.some(cid => !nextCids.includes(cid))
  if (changed && snapshot.value)
    await startSync('full')
}

async function startSync(mode: 'full' | 'incremental') {
  if (syncing.value)
    return
  if (!snapshot.value && normalizeIndexRootFolders(indexRootFolders.value).length === 0) {
    const picked = await openIndexFolderPicker({
      title: '选择初次索引与刮削目录',
      description: '可多选一个或多个影视目录以加快索引并减少杂项误刮削；不选择直接确认（或取消）将默认扫描全盘。',
      initialFolders: [],
    })
    if (picked !== null)
      indexRootFolders.value = picked
  }
  errorMessage.value = ''
  syncing.value = true
  progress.value = { pages: 0, fetched: 0, total: 0, mode }
  abortController = new AbortController()
  try {
    snapshot.value = await syncDriveVideoIndex({
      mode,
      rootCids: getConfiguredIndexRootCids(indexRootFolders.value),
      signal: abortController.signal,
      onProgress: (nextProgress) => {
        progress.value = nextProgress
      },
    })
    javMap.value = await loadAllCachedJavInfo()
  }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      errorMessage.value = '已取消索引同步'
    }
    else {
      errorMessage.value = error instanceof Error ? error.message : '同步索引失败，请确认已登录 115 网盘'
    }
  }
  finally {
    syncing.value = false
    abortController = null
  }
}

function cancelSync() {
  abortController?.abort()
}

async function startFolderSync() {
  if (folderSyncing.value || uniqueFolderCids.value.length === 0)
    return
  errorMessage.value = ''
  folderSyncing.value = true
  folderProgress.value = {
    resolved: indexedFolderCount.value,
    total: totalFolderCount.value,
    cached: indexedFolderCount.value,
    failed: 0,
  }
  folderAbortController = new AbortController()
  try {
    await folderPaths.syncCids(uniqueFolderCids.value, {
      signal: folderAbortController.signal,
      onProgress: (nextProgress) => {
        folderProgress.value = nextProgress
      },
    })
  }
  catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError'))
      errorMessage.value = error instanceof Error ? error.message : '目录索引失败'
  }
  finally {
    folderSyncing.value = false
    folderAbortController = null
  }
}

function cancelFolderSync() {
  folderAbortController?.abort()
}

function isMasterApp(): boolean {
  return window.location.pathname.startsWith(new URL(MASTER_BASE_URL).pathname)
}

async function playVideo(video: IndexedVideo) {
  await goToPlayer({ pickCode: video.pickCode }, !isMasterApp())
  emit('close')
}

async function playNativeItem(pickCode: string) {
  await goToPlayer({ pickCode }, !isMasterApp())
  emit('close')
}

function openFolderByCid(cid: string) {
  const url = !isMasterApp() && window.location.pathname.startsWith('/storage/')
    ? `https://115.com/storage/allfiles?cid=${encodeURIComponent(cid || '0')}`
    : `https://115.com/?cid=${encodeURIComponent(cid || '0')}&offset=0&mode=wangpan`
  GM_openInTab(url, { active: true })
  emit('close')
}

async function openFolder(video: IndexedVideo) {
  openFolderByCid(video.cid)
}

onMounted(async () => {
  void actressFaceDB.init()
    .then(() => {
      actressDbReady.value = true
    })
    .catch(() => {})

  await refreshLocalData()
  await nextTick()
  inputRef.value?.focus()
})

onBeforeUnmount(() => {
  abortController?.abort()
  folderAbortController?.abort()
  actorAbortController?.abort()
  nativeController?.abort()
  if (nativeTimer)
    clearTimeout(nativeTimer)
})
</script>
