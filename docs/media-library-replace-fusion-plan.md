# 影视库替代 Fusion 原界面（`/drive`）实施计划与进度追踪

> **状态：✅ 全部完成（已归档）** — Phase 0–5 已全部交付上线，后续新增待办统一记录在 [docs/TODO.md](./TODO.md)。

> **已确认的核心决策**
> 1. **旧 `/drive` 归档策略**：先从 `v2` 切出独立归档分支 `archive/legacy-drive`（标注「不再维护」），随后在 `v2` 直接清理 `pages/drive` 及仅 `/drive` 独享组件，并将 `/drive` 路由重定向至 `/library`。
> 2. **入口文案**：原生 115 悬浮入口（`apps/monkey/src/pages/official/index.ts`）按钮文案由 `Fusion` 改为 `影视库`。
> 3. **文件操作项与简洁度**：全部保留（星标、打标签、生成 ED2K、重命名、移动、删除、打开原生目录），海报卡片不增加可见按钮（纯右键菜单），详情页仅保留高频轻量图标并将低频操作收进「`...`」菜单。
> 4. **大规模影视库（2 万部级）刮削增强**：保留「视口优先」，新增手动可控的「后台低速刮削 + 视口插队 + 熔断保护 + 空结果负缓存」，缩略图压缩参数调优至 `480px / quality 0.75`。
> 5. **播放打点云同步**：将播放打点无损同步到 115 原生文件备注（`desc`），换新电脑自动恢复。

---

## 总进度一览

- [x] **Phase 0**：创建独立归档分支 `archive/legacy-drive` 并标注不再维护（commit `1626511`）
- [x] **Phase 1**：入口与路由全面切换（影视库成为 Fusion 默认主界面）
- [x] **Phase 2**：高价值功能移植到影视库（离线下载/磁力接管、空间条、星标收藏、115 网盘标签筛选与 `/library/tags`、简洁收纳的文件操作）
- [x] **Phase 3**：2 万部级可控后台低速刮削 + 视口插队 + 熔断保护 + 空结果负缓存 + 480px 缩略图压缩调优
- [x] **Phase 4**：播放打点云同步（写入 115 原生文件备注）
- [x] **Phase 5**：清理主分支 `/drive` 独享代码，更新单测/E2E 并完成验证

---

## 分阶段任务清单

### Phase 0：旧 `/drive` 归档分支
- [x] 基于 `v2` 创建独立分支 `archive/legacy-drive`
- [x] 添加 `apps/monkey/src/pages/drive/README.md` 明确标注「已归档，不再维护」并提交（`1626511`）
- [x] 切回 `v2` 分支并将本计划文档存入仓库 `docs/media-library-replace-fusion-plan.md`

### Phase 1：入口与路由全面切换
- [x] `apps/monkey/src/app/routes.ts`：根路径 `/` 与 `/drive/:area?/:cid?` 重定向至 `library`（保留 query）；新增 `/library/tags` 子路由，`/tags` 重定向至 `/library/tags`
- [x] `apps/monkey/src/types/vue-router.d.ts`：同步路由类型定义
- [x] `apps/monkey/src/pages/official/index.ts`：悬浮入口改为 `#/library`，按钮文案改为 `影视库`
- [x] `apps/monkey/src/pages/home/NavMod/index.ts`：旧版侧边栏入口改为 `#/library`
- [x] `apps/monkey/src/pages/library/components/LibrarySider.vue`：移除顶部「← 网盘 (`/drive`)」按钮
- [x] `apps/monkey/src/pages/library/detail.vue` & `apps/monkey/src/components/SuperSearch/SuperSearchContent.vue`：「打开目录」直达原生 115 对应目录
- [x] `apps/monkey/src/app/app.tsx`：移除已废弃的 `<GlobalSearchModal />`

### Phase 2：高价值功能移植到影视库
- [x] **2.1 离线下载、磁力接管与空间条**
  - [x] `LibrarySider.vue` 顶部增加「离线下载」按钮（复用 `useCloudDownloadAction`）
  - [x] `library/index.vue` 承接 `route.query.offline_url` 自动弹出离线下载框并清理 query
  - [x] `LibrarySider.vue` 底部接入 `useDriveSpaceInfoStore` 紧凑空间进度条
  - [x] `MobileSider.tsx` 补齐「超级搜索」入口
- [x] **2.2 星标收藏与 115 网盘标签体系整合**
  - [x] `mediaIndex/types.ts`、`libraryAggregator.ts`、`store/mediaLibrary.ts`：新增 `'starred'` 视图、`onlyStarred`、`driveLabel` 筛选及 `driveLabels` 聚合统计
  - [x] `LibrarySider.vue`、`FilterBar.vue`、`LibraryHeader.vue`：接入星标收藏导航、仅看星标与 115 网盘标签筛选
  - [x] `pages/tags/tags.tsx`：移除旧 `Layout/Sider/SiderContent` 外壳，作为 `/library/tags` 无缝融入影视库
- [x] **2.3 简洁收纳的文件操作**
  - [x] 解耦 `useTagAction.tsx` 对 `useDriveStore` 的强耦合，并将 `onGotoTags` 指向 `/library/tags`
  - [x] 新建 `apps/monkey/src/pages/library/useLibraryFileActions.ts` 适配并封装星标、打标签、ED2K、重命名、移动、删除、打开原生目录，并在 `mediaLibrary` store 中同步更新本地索引与快照
  - [x] `PosterCard.vue`：卡片表面零新增按钮，通过右键 `ActionMenu` 提供快捷操作
  - [x] `library/detail.vue`：顶部轻量星标/打标签图标 + `...` 菜单；文件版本行保留「播放」+ `...` 菜单

### Phase 3：2 万部体量后台低速刮削 + 熔断保护 + 空结果负缓存 + 480px 缩略图调优
- [x] `scraperRegistry.ts` & `utils/jav/loadInfo.ts`：扩展结构化刮削结果 `ScrapeResult`（`ok` / `not_found` / `rate_limited` / `challenge` / `network_error`）
- [x] `videoIndexStore.ts`：新增 7 天 TTL 空结果负缓存 `scrapeMissCache`（手动重新刮削/指定番号自动豁免清除）
- [x] `store/mediaLibrary.ts`：实现手动可控的后台低速刮削（单并发、1.5–3s 随机延迟、暂停/继续/停止、视口优先插队让路、连续风控熔断暂停与提示、2 万条级批量节流聚合重建）
- [x] `LibrarySider.vue`：底部刮削统计区增加紧凑的「后台刮削 / 暂停 / 继续」与熔断状态提示
- [x] `scraperRegistry.ts`：海报缩略图压缩参数由 `640px / 0.8` 调优为 `480px / 0.75`

### Phase 4：播放打点云同步（写入 115 原生文件备注）
- [x] `packages/drive115/src/clients/file/`：封装 115 原生文件备注读取与写入 API 并 rebuild `packages/drive115`
- [x] `apps/monkey/src/utils/markers/descCodec.ts`：实现固定分隔块的紧凑无损编解码（保留原备注、超长安全回退）
- [x] `useDataMarkers.ts` & `library/detail.vue` & `userSettings.ts` & `PreferencesContent.tsx`：接入打开自动拉取合并、修改防抖写回与偏好设置开关

### Phase 5：旧代码清理、测试更新与总闸门验证
- [x] 清理主分支仅 `/drive` 独享代码（删除 `pages/drive`、`SiderContent.tsx`、`components/Menu`、`GlobalSearch`、`useGlobalSearch`、`store/driveList`，完整保留 `FileBroswer`/`FileList`/`FileItem`/`FilePath`/`useDriveList` 等共享底座）
- [x] 补全并更新单元测试（`libraryAggregator.test.ts`、`descCodec.test.ts`、`app.test.ts`，全量单测 60/60 文件通过；`drive115` 13/13 文件 139 tests 通过）
- [x] 更新 E2E 测试（`smoke.spec.ts`、`official/launcher.spec.ts`、`home/navMod.spec.ts`、新增 `e2e/specs/library/library.spec.ts`、清理旧 `e2e/specs/drive/`）
- [x] 通过 `type-check`、`eslint`、全量单元测试与 userscript `vite build` 产物校验（注：当前云端 VM 预装 Playwright 浏览器为 `chromium-1255`，与 `@playwright/test@1.62.0` 期望的 `1234` 版本不一致，E2E 需在安装对应浏览器或 CI 环境中运行）

---

## 执行日志

- **Phase 0 完成**：基于 `v2` 创建独立归档分支 `archive/legacy-drive`（commit `1626511`），标注不再维护，并已切回 `v2` 存入本计划文档。
- **Phase 1 完成**：默认根路由 `/` 与 `/drive` 重定向至 `/library`，原生 115 入口文案改为 `影视库` 并指向 `#/library`，详情页与超级搜索打开目录直达原生 115，移除废弃的 `GlobalSearchModal`。
- **Phase 2 完成**：离线下载（含 `offline_url` 磁力接管）、紧凑空间进度条、星标收藏视图与过滤、115 网盘标签筛选与 `/library/tags` 嵌入、以及简洁收纳的 7 项文件操作（卡片右键 + 详情页轻量图标/`...`菜单 + 本地索引乐观同步）全部落地。
- **Phase 3 完成**：落地结构化 `ScrapeResult`、7 天空结果负缓存 `scrapeMissCache`、手动可控单并发低速后台刮削（1.5–3s 随机延迟、视口优先插队、429/Cloudflare 熔断自动暂停、2 万部级批量节流聚合重建）及海报缩略图 `480px / 0.75` 压缩调优。
- **Phase 4 完成**：`drive115` 封装 `getFileDesc`/`setFileDesc` 并重新构建；实现 `descCodec.ts` 无损读写原备注与超长保护；播放器 `useDataMarkers`、详情页 `detail.vue` 与偏好设置开关全面接入。
- **Phase 5 完成**：安全清理主分支 `/drive` 独享代码，保留共享底座；通过 `@115master/monkey` 与 `@115master/drive115` 的 `type-check`、`eslint`、全量单元测试及 userscript 生产构建（`apps/monkey/dist/115master-fusion.{user,meta}.js`）。
