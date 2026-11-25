# 115 master fusion+ 主要功能总览

本文档记录 `115 master fusion+` 的核心功能版图，分为两部分：
- **第一部分**：继承自上游 `115master`（`@cbingb666`）与 `115master-fusion`（`@daoran9`）的核心基础功能。
- **第二部分**：本维护版本（`115 master fusion+`）在此基础上新增与重构的主要大功能模块。

> **自动维护约定**：每次新增主要功能模块、独立页面/面板、新数据源或新用户可见偏好设置项时，须同步更新本文档第二部分（详见 `docs/agents/feature-catalog.md`）。

---

## 第一部分：核心基础功能（来自 `115master` 与 `115master-fusion`）

### 1.1 115 旧版网盘增强（U1）
- **文件列表增强**：在 115 官方旧版文件列表中直接展示视频时间轴多格预览截图（支持在设置中调节截图张数）与快捷播放按钮。
- **番号资料卡片**：自动识别列表内视频番号，内联渲染海报、标题、演员、发行日期、评分等作品详情，支持宽大布局与紧凑布局切换。
- **演员头像文件夹**：当文件夹名称匹配演员姓名时，自动使用演员头像替代默认文件夹图标。
- **关键代码**：`apps/monkey/src/pages/home`

### 1.2 115 新版网盘增强（U2）
- **列表数据捕获与注入**：无侵入拦截并关联 115 新版前端列表数据，为新版页面补充视频封面、番号作品资料与演员头像展示。
- **快捷入口与链接导出**：提供直达 MASTER 播放器入口与 ED2K 链接一键生成能力。
- **关键代码**：`apps/monkey/src/pages/official`

### 1.3 Fusion 独立界面底座（U3）
- **独立应用容器**：内置独立 Vue 3 SPA 界面、路由、毛玻璃 UI 组件体系（`@115master/ui`）及浅色/深色/跟随系统主题管理。
- **网盘文件管理能力**：支持分页/无限滚动文件浏览、多选、移动、重命名、星标、115 标签管理与离线下载任务管理。
- **偏好设置中心**：统一管理账号状态、布局密度、各项增强开关与外观主题，修改即时生效。
- **关键代码**：`apps/monkey/src/app`、`apps/monkey/src/pages/drive`、`apps/monkey/src/components/Preferences`、`packages/ui`

### 1.4 MASTER 播放器
- **原画与多画质播放**：基于 `@libmedia/avplayer` + `hls.js` 支持 Ultra 原画直链与多档转码画质无缝切换。
- **字幕自动搜索与加载**：内置多源字幕客户端（`Thunder` 迅雷、`SubtitleCat`、`AvSubtitles`、`Aiyi`），自动匹配并挂载外挂字幕。
- **观影交互增强**：进度条缩略图预览、同目录播放列表、播放倍速、画面比例/旋转、剧院模式/全屏/画中画、自定义快捷键以及播放页影片详情侧边栏。
- **关键代码**：`apps/monkey/src/components/XPlayer`、`apps/monkey/src/pages/video`、`packages/subtitle-source`

### 1.5 播放器打点（Fusion Markers）
- **进度条关键点标记**：播放时一键在当前时间点打点（默认 `B`）并编辑文字备注，进度条实时渲染打点刻度与悬停预览。
- **列表管理与快捷跳转**：支持在控制栏打点面板中集中查看、重命名、删除打点，并通过快捷键（`,` / `.`）在打点间前后跳转。
- **关键代码**：`apps/monkey/src/utils/markers`、`apps/monkey/src/components/XPlayer`

### 1.6 基础番号刮削与头像库
- **多源并发对冲与融合缓存**：内置 `JavLibrary`、`JavBus`、`JavDB`、`MissAV` 及 FC2 专用源 `FD2PPV`，支持并发对冲请求、按优先级字段融合（`Fusion` 缓存）与封面降级回退。
- **演员头像数据库**：对接 `gfriends` 演员头像索引，提供本地缓存与姓名归一化匹配。
- **关键代码**：`apps/monkey/src/utils/jav`、`apps/monkey/src/utils/actressFaceDB.ts`

---

## 第二部分：本新版（`115 master fusion+`）新增核心大功能模块

### 2.1 超级搜索与全盘扁平视频索引（Super Search & Drive Indexer）
- **跨目录全盘视频索引**：递归/批量拉取 115 全盘视频文件并在本地 IndexedDB 构建扁平化视频索引，摆脱逐级翻找目录的限制。
- **全量同步与安全增量同步**：支持全量重建与基于时间窗口回溯的安全增量同步；通过影视库发起离线下载后自动触发后台增量同步与新片刮削。
- **多维联合检索与原生兜底**：支持按番号、片名、文件名为线索极速检索，内置中日文演员姓名/曾用名别名映射匹配，并在本地未命中时支持 115 原生搜索兜底，提供 U1/U2/U3 三端快捷搜索入口。
- **创作者平台识别防冲突与父目录索引**：内置 `OnlyFans` / `MyFans` 显式特征与目录辅助识别，彻底阻断与常规 AV 番号的误提取和子串误命中；支持按安全节流一键索引父目录路径（祖先链消重、断点续传），提供来源平台筛选胶囊以及 `@账号`、`of:`、`mf:`、`dir:` 等快捷查询前缀。
- **关键代码**：`apps/monkey/src/utils/superSearch`、`apps/monkey/src/components/SuperSearch`、`apps/monkey/src/utils/mediaIdentity.ts`、`apps/monkey/src/utils/driveFolderPath.ts`

### 2.2 真影视库模式（Media Library / 番号专线）
- **影院级海报墙主界面**：以沉浸式深色海报墙影视库替代原 Fusion 默认入口（支持从 115 旧版快捷栏一键直达），并在侧边栏右下角常驻展示当前插件版本号。
- **分页切换加载与每页数量可配**：海报墙支持自定义每页显示数量（`24 / 48 / 60 / 96 / 120` 部/页，持久化保存）与分页切换加载，结合视口按需加载封面与切页自动释放 Blob URL / 中止在途请求 / 取消旧页刮削队列，避免海量作品带来的渲染与内存压力。
- **智能海报裁切与嵌入式详情页**：自动识别双页横版封面并智能右半裁切生成高清竖版海报；作品详情页采用嵌入式嵌套路由，支持预览图画廊、时间分段截图、同番号多文件切换与快捷文件操作。
- **多维组合筛选体系**：支持二级标签筛选面板、按题材/发行年份/近 30 天入库分组、115 网盘原生颜色标签联动筛选，以及「隐藏疑似广告视频」一键过滤开关。
- **自定义封面与演员头像**：支持从多源候选中手动切换作品封面/演员头像，或上传本地图片自动压缩持久化。
- **关键代码**：`apps/monkey/src/pages/library`、`apps/monkey/src/store/mediaLibrary.ts`

### 2.3 影院浮窗播放器与打点备注云同步
- **影视库内嵌浮窗播放器**：在影视库内点击播放时直接拉起顶层影院浮窗播放器（`LibraryVideoOverlay`），无需离开当前海报墙/详情筛选上下文即可流畅观影。
- **播放打点同步至 115 原生备注**：支持将本地播放打点自动序列化写入 115 文件原生备注（含旧本地打点打开视频时自动补写），实现换浏览器/换设备打开同一视频自动恢复打点，并在播放器内直观展示当前打点保存方式标签。
- **关键代码**：`apps/monkey/src/pages/library/components/LibraryVideoOverlay.vue`、`apps/monkey/src/utils/markers`

### 2.4 演员图片墙与多源个人资料
- **独立演员图片墙**：按作品数量与收藏权重聚合本库演员，支持女演员/男演员筛选（默认女演员）、右键菜单手动标注性别并持久化、演员收藏置顶、隐藏演员管理以及演员姓名角标后缀自动清洗。
- **右侧竖型演员个人资料面板（Actor Profile Rail）**：在演员作品墙右侧展示生日、年龄、身高、罩杯、三围、出生地、爱好、曾用名别名、本库作品统计、网盘标签与常拍题材联动筛选。
- **演员资料多源自动兜底**：按 `JavBus → AVBASE → MINNANO-AV` 顺序自动回退拉取个人资料与别名（30 天本地缓存），解除对单一站点的依赖。
- **关键代码**：`apps/monkey/src/pages/library/actors.vue`、`apps/monkey/src/pages/library/components/ActorProfileRail.vue`、`apps/monkey/src/utils/mediaIndex/actorProfileFetcher.ts`

### 2.5 去重与垃圾文件清理中心（Cleanup Center）
- **智能异步重复作品分析**：后台异步扫描全库重复番号与相似视频，内置内嵌域名/跨中日文误提取过滤、剧集集数识别、蓝光原盘分卷防误判与规则版本（`AV_NUMBER_RULE_VERSION`）升级自动重算，按画质/体积智能推荐保留项。
- **疑似广告视频与垃圾文件扫描**：支持自定义广告判定时长与体积阈值（与影视库过滤共用配置），并按类别扫描全盘非媒体垃圾文件。
- **高可控批量清理体验**：分页栏置底常驻（`sticky`）、支持多维排序与底部全选；批量删除时实时展示进度条、逐目录即时刷新列表、透出具体错误/风控原因，并支持随时中断（`AbortSignal`）及页面关闭前防中断提醒（`beforeunload`）。
- **关键代码**：`apps/monkey/src/pages/library/cleanup.vue`、`apps/monkey/src/utils/mediaIndex/deduplicator.ts`、`apps/monkey/src/utils/mediaIndex/junkScanner.ts`、`apps/monkey/src/utils/mediaIndex/safeDelete.ts`

### 2.6 多源元数据刮削扩展与抗风控体系
- **全场景备用刮削源扩展**：
  - 通用无日区限制兜底源：`Jav321`、`AVBASE`（支持 `__NEXT_DATA__` 与 DOM 双层解析）。
  - 细分类型优先补盲源：`MGStage`（自动识别 `SIRO`/`LUXU`/`MIUM`/`ABW` 等素人与 Prestige 前缀并优先路由）、`FC2Official`（FC2 官方商品页补盲）。
  - 可选官方高清源：`FANZA / DMM`（可在偏好设置「启用 FANZA / DMM 官方源」中按需开启，日本 IP 下优先获取官方无水印封面与完整元数据）。
- **低速后台刮削与负缓存保护**：支持后台队列低速自动补全未刮削作品，区分「未收录（负缓存）」与「风控/挑战/网络超时（允许重试）」。
- **115 接口抗风控熔断与降级**：目录路径反查采用单并发串行节流 + 400ms 间隔 + 触发风控 30 秒全局熔断退避；播放列表拉取异常时优雅降级并支持一键重试。
- **关键代码**：`apps/monkey/src/utils/jav/{sources,jav321,avBase,mgStage,fc2Official,fanza}.ts`、`apps/monkey/src/utils/mediaIndex/scraperRegistry.ts`、`apps/monkey/src/utils/driveFolderPath.ts`

### 2.7 跨设备缓存同步与设置/工程增强
- **跨设备缓存导入导出**：在偏好设置「缓存与数据同步」中支持一键将本地视频索引、刮削元数据、演员个人资料、播放打点、目录路径缓存及自定义封面/头像导出为 JSON 备份，并在其他设备上安全合并导入（按时间戳保留较新数据，即时热刷新影视库）。
- **原生 115 目录跳转版本切换**：支持在偏好设置中选择「打开所在目录」默认跳转到 **新版 115** 或 **旧版 115**（当旧版触发风控刷不出时可无缝切至新版）。
- **离线图标子集与一键发布工作流**：全量迁移至 Phosphor 图标库并在构建期生成离线 SVG 子集；提供 `pnpm ship` 一键完成暂存提交、rebase、userscript 构建校验与 `v2` 自动发版推送。
- **关键代码**：`apps/monkey/src/utils/cacheBackup.ts`、`apps/monkey/src/utils/userSettings.ts`、`apps/monkey/src/components/Preferences/PreferencesContent.tsx`、`apps/monkey/plugins/phosphorIcons.ts`、`scripts/push-and-build.mjs`

---

## 附录：新增主要功能记录模板

后续新增独立大模块或在现有模块追加重要子能力时，请保持以下精炼格式：

```markdown
### 2.X 模块名称（英文简称可选）
- **核心能力名称**：一句话说明解决的用户问题、核心交互与关键行为边界。
- **关键代码**：`apps/monkey/src/...`
```
