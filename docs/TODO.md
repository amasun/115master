# 开发计划与待办清单

> 本文件为当前仓库的**唯一活跃计划与待办总览**；历史已完成方案文档与技术规格保留在各自目录作为归档参考。

---

## 一、当前待办（Backlog）

- [ ] **OPT1：演员头像缩位匹配降级**（详见 [optimizations.md](./agy/optimizations.md)）
  - 完整名字精确匹配失败时，逐步去掉末位降级搜索（最短至 2 位），命中即停并补齐降级链路单测。
- [ ] **影视库元数据手动匹配与纠正**
  - 在影片详情页支持手动指定番号或重新拉取绑定元数据，修正自动识别偏差。
- [ ] **超级搜索直达影视库详情页**
  - 搜索结果命中本地影视库作品时，提供一键跳转至 `/library/detail/:mediaKey` 详情页的入口。
- [ ] **（可选）「最近入库」时间范围筛选**
  - 目前「最近入库」按全库 `mtime` 倒序展示；按需增加近 7 天 / 30 天时间窗口过滤开关。

---

## 二、中远期规划（Roadmap）

- **普通影视（TMDB）双库支持**（详见 [media-library-spec.md](./media-library-spec.md)）
  - 引入 `TmdbScraper`（支持自定义 TMDB API Key / 反代）、电影/剧集 `S01E01` 文件名解析、目录类型绑定与竖版/季集排版。
- **自定义片单 / 收藏夹**
  - 支持在影视库内创建与管理跨作品自定义片单。
- **SubtitleFinder 字幕匹配融合**（`Status: needs-triage`，详见 [01-fuse-subtitle-matching.md](../.scratch/subtitle-finder-integration/issues/01-fuse-subtitle-matching.md)）
  - 对比 115Master 与 SubtitleFinder 的字幕检索与排序规则，评估共享抽象边界。

---

## 三、暂缓项（Deferred）

- **超级搜索高频接口增强**（详见 [super-search-spec.md](./super-search-spec.md)）
  - 定时轮询刷新、扫描目录白名单、父文件夹名番号兜底（受 115 频控限制暂缓；已通过 115 原生全盘搜索兜底覆盖未建库/未匹配场景）。
- **播放打点网盘 `markers.json` 同步后端**（详见 [plan.md](./agy/plan.md)）
  - 已落地更轻量的「115 原生文件备注（`desc`）」云同步方案，独立的网盘 JSON 文件后端暂不实施。

---

## 四、近期已完成里程碑（归档）

- **影视库替代 `/drive` 全量落地（Phase 0–5）** — [media-library-replace-fusion-plan.md](./media-library-replace-fusion-plan.md)
  - `/library` 成为 Fusion 默认主入口；离线下载、空间条、星标/标签体系、2 万部级低速可控后台刮削 + 熔断 + 7 天负缓存、播放打点写入 115 原生备注、旧 `/drive` 独享代码清理。
- **影视库交互、去重与超级搜索升级**
  - 并行桌面端三栏布局（`rail1` + `rail2` 标签内联管理 + 内容区）、统一面包屑导航、全局可点击指针。
  - 演员页互斥 Tab（女演员 / 男演员 / 收藏 / 隐藏）+ 头像右上角收藏爱心 + 隐藏/性别覆盖 + 作品页网盘标签聚合。
  - 番号智能匹配与变体回退（兼容 `011015_780` ↔ `011015-780`、前导零归一化）+ 超级搜索 115 原生全盘搜索兜底。
  - 去重与清理中心（SHA1 / 同番号 / 蓝光与普通版 `edition` 识别 / 疑似重复、后台分片防卡顿、渐进渲染、安全联动删除空/独立父目录、垃圾与广告视频清理）。
- **原生 115 页面增强（OPT2–OPT4）** — [optimizations.md](./agy/optimizations.md)
  - 文件夹演员头像替换、顶栏 5 独立控制按钮、原生页面直接唤起全局偏好设置弹窗。
