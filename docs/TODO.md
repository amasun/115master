# 开发计划与待办清单

> 本文件为当前仓库的**唯一活跃计划与待办总览**；历史已完成方案文档与技术规格保留在各自目录作为归档参考。

---

## 一、当前待办（Backlog）

- [ ] **院线影视剧集按季/集分组排版**
  - `detail.vue` 当前将剧集（`kind === 'tv'`）多集平铺为「网盘文件版本」并显示「多源版本 / 去重管理」，需改为按季/集排序与选集展示，避免误判为重复文件。
- [ ] **超级搜索直达影视库详情页（并覆盖院线元数据）**
  - `SuperSearchContent.vue` 当前仅提供「播放」与「打开目录」按钮，且只加载 `javCache`；命中本地影视库作品时提供一键跳转 `/library/detail/:mediaKey` 的入口，并按需融合 `cinema_meta_v1` 院线元数据检索展示。
- [ ] **（可选）「最近入库」时间范围筛选开关**
  - 目前 `wallPagination.ts` 在「全部作品 + 按最近入库排序」下已实现「最近 30 天入库 / 更早入库」分组展示；按需在 `FilterBar.vue` 增加近 7 天 / 30 天时间窗口过滤开关，并支持在院线与自建栏目生效。

---

## 二、中远期规划（Roadmap）

- **跨作品自定义片单 / 收藏夹**
  - 现有「智能目录合集」按同目录聚合、「自建侧边栏目」按 115 目录绑定，均强绑定目录结构；后续支持在影视库内跨目录自由勾选作品创建与管理自定义片单。
- **SubtitleFinder 字幕匹配融合**（`Status: needs-triage`，详见 [01-fuse-subtitle-matching.md](../.scratch/subtitle-finder-integration/issues/01-fuse-subtitle-matching.md)）
  - 对比 115Master（当前四源：`Thunder`、`SubtitleCat`、`AVSubtitles`、`Aiyi`）与 SubtitleFinder 的字幕检索与排序规则，评估共享抽象边界。

---

## 三、暂缓项（Deferred）

- **超级搜索高频接口增强（剩余项）**（详见 [super-search-spec.md](./super-search-spec.md)）
  - 后台定时轮询刷新（目前通过手动增量/全量同步与离线下载后自动增量同步覆盖）、父文件夹名提取 JAV 番号兜底（父目录路径索引、多选扫描目录白名单及 OnlyFans/MyFans 目录识别已上线；纯 JAV 番号仍仅从文件名提取以防误识别）。
- **播放打点网盘 `markers.json` 同步后端**（详见 [plan.md](./agy/plan.md)）
  - 已落地更轻量的「115 原生文件备注（`desc`）」云同步方案，独立的网盘 JSON 文件后端暂不实施。

---

## 四、近期已完成里程碑（归档）

- **播放器视觉风格优化（参考 YouTube / B 站）与进度条独立成行**（GitHub Issue `#8`）
  - 在不改变播放与控制功能前提下重构 `XPlayer` 界面层：新增影院暗色样式表 `player.css` 并统一 36px 控制按钮、20px 图标尺度、暗色磨砂弹层（`.x-player-popup`，保留设置弹窗 `surface="panel"`）及顶栏暗色胶囊组（`.x-player-header-group`）；将 `ProgressBar` 独立成行铺满控制栏上方并补充拖拽圆点指示器、纤细音量条（`x-player-volume-range`）、紧凑时间显示与字幕/打点激活态指示，同时升级顶底渐隐遮罩、单环加载器、中央播放动画、HUD、缩略图画框与顶栏信息排版。
- **院线影视刮削链路修复与体验增强**
  - 开启院线海报墙视口与详情页自动刮削（`PosterCard` / `detail.vue`）、后台刮削优先当前视图及父目录名懒反查、修复侧栏总数统计（`totalVisibleEntryCount`），TMDB 支持自定义反代且超时/异常自动回退豆瓣、豆瓣改用 `subject_abstract` JSON 接口避开详情页反爬 302、扩展片名噪声清洗与多候选查询词、补齐 `doubanio.com` `@connect` 与院线 `2:3` 竖版海报自适应，并补充单测。
- **影视库元数据手动匹配与纠正补齐**
  - 新增 `mediaKey -> manualAvNumber` 本地持久化映射与恢复自动识别（同步纳入 `.115bak` 备份与缩略图缓存失效），打通 `Jav.getInfo` → `loadJavInfo` → `scrapeJavMetaDetailed` 全链路 `forceRefresh` 强制重刮，并补齐详情页院线/番号文案与预填区分及配套单测。
- **原生 115 页面增强（OPT1–OPT4 全部完成）** — [optimizations.md](./agy/optimizations.md)
  - OPT1 演员头像缩位匹配降级（`actressNameMatcher.ts` 精确匹配失败逐位去尾至 2 位 + `actressFaceDB.test.ts` 单测）；OPT2 文件夹演员头像替换；OPT3 顶栏 5 独立控制按钮；OPT4 原生页面唤起全局偏好设置弹窗。
- **影视库替代 `/drive` 全量落地（Phase 0–5）** — [media-library-replace-fusion-plan.md](./media-library-replace-fusion-plan.md)
  - `/library` 成为 Fusion 默认主入口；离线下载及提交后自动增量同步与刮削、空间条、星标/标签体系、2 万部级低速可控后台刮削 + 熔断 + 7 天负缓存、播放打点写入 115 原生备注（含旧本地打点自动补写）、旧 `/drive` 独享代码清理。
- **院线影视双源刮削、目录合集与自建侧边栏目**
  - 新增「院线影视」独立栏目（默认开关控制）与 TMDB API / 豆瓣免 Key 双源刮削、`S01E01` / 集数 / 父目录名解析；AV 与院线目录独立多选隔离、用户自建侧边栏目（支持番号/院线/目录合集/纯本地 4 种策略）；无番号同目录自动聚合为「目录合集」并支持在线编辑与拆分恢复。
- **多源刮削扩展、演员资料与自定义媒体**
  - 新增 `Jav321`、`AVBASE`、`MGStage`、`FC2Official`、可选 `FANZA / DMM` 官方源；演员页互斥 Tab + 右侧竖型个人资料面板（`JavBus → AVBASE → MINNANO-AV` 多源兜底）+ 手动性别标注/收藏/隐藏；支持作品封面与演员头像多源选择及本地上传压缩。
- **影视库交互、浮窗播放、去重清理与超级搜索升级**
  - 海报墙可配每页数量分页与切页资源释放、「最近 30 天入库」分组、影院级浮窗播放器（`LibraryVideoOverlay`）；OnlyFans / MyFans 识别防冲突、父目录路径安全节流索引与 115 原生搜索兜底；去重与垃圾文件清理中心（直查 `/files/search` 流式同步、跨目录批量安全删除与中断保护）；`.115bak` 跨设备单文件缓存导入导出。
