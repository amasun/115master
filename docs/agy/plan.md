# 播放器打点（Markers）设计方案

基线 commit：`8be230c`（分支 `v2`）。执行者：Antigravity（agy）。验收：`node docs/agy/verify.mjs`。

## 目标

1. 在 MASTER 播放器里对当前视频打点，记录时间位置和备注。
2. 打点在进度条上可见，可点击跳转；有列表可改名、删除。
3. 快捷键：打点、跳到上一个 / 下一个打点。
4. 同一视频再次打开时打点自动恢复。
5. 两种可选的自动跳转（默认都关闭）：
   - 打开时跳到首个打点；
   - 精华模式：只播放打点片段，播完一个片段自动跳到下一个。
6. 导出 / 导入全部打点（JSON 文件）。
7. 云端同步（实验性，默认关闭），两种后端可选：
   - A：存为用户 115 网盘里的一个文件；
   - B：写进视频文件的 115 备注字段。

## 非目标

- 不改 115 官方页面上的任何增强。
- 不做多人共享、不接第三方存储（WebDAV 等）。
- 不跑全量测试，只跑本功能的单测、类型检查、lint、构建。

## 关键设计

### 数据模型（`apps/monkey/src/utils/markers/types.ts`）

```ts
type Marker = {
  id: string          // crypto.randomUUID()
  time: number        // 秒
  endTime?: number    // 片段结束，缺省时用"片段时长"设置
  label: string
  createdAt: number
  updatedAt: number
  deleted?: boolean   // 墓碑，用于同步合并
}
type MarkerDoc = {
  v: 1
  pickCode: string
  fileId?: string
  fileName?: string
  duration?: number
  markers: Marker[]
  updatedAt: number
}
```

- 以 `pick_code` 为主键（观看历史也用它）。同时记下 `fileId`、`fileName` 供将来迁移。
- 删除用墓碑而不是物理删除，否则同步时会被另一端"复活"。超过 30 天的墓碑在保存时清理。

### 分层

| 层 | 位置 | 说明 |
|---|---|---|
| 纯逻辑 | `apps/monkey/src/utils/markers/` | 增删改、排序、上一个/下一个、片段计算、合并、序列化。无 DOM、无网络，全部单测 |
| 本地存储 | `apps/monkey/src/utils/cache/markerStore.ts` | `extends CacheCore`，仿 `subtitlePreference.ts` |
| 页面数据 | `apps/monkey/src/pages/video/data/useDataMarkers.ts` | 按 `pickCode` 加载 / 保存，切换视频时重载；之后挂同步 |
| 播放器 UI | `apps/monkey/src/components/XPlayer/` | XPlayer 保持通用：通过 `markers` prop 接收，通过事件上报增删改，不直接碰存储 |
| 同步后端 | `apps/monkey/src/utils/markers/sync/` | 统一接口 `MarkerSyncBackend { pull(pickCode), push(doc) }` |

理由：XPlayer 目前所有持久化都在视频页（`usePreferences`、`useDataHistory`），打点沿用同一边界；纯逻辑独立出来才能在不登录 115 的情况下验证。

注意命名：已有的 `useDataMark.ts` 是"收藏"，本功能一律用 `marker` / `Markers`，不要用 `mark`。

### 播放器 UI

- 进度条刻度：在 `Controls/ProgressBar.vue` 的 wrapper 层（不是带 `overflow-hidden` 的 track）加一层绝对定位的刻度，位置为 `time / duration`。悬停显示备注，点击跳转。
- 控制栏按钮：仿 `Controls/PlaybackRateButton.vue`，弹出打点列表（时间、备注、跳转、改名、删除）和"在当前位置打点"。
- 快捷键：在 `shortcuts.actions.ts` / `shortcuts.const.ts` 增加 `addMarker`（默认 `M`）、`prevMarker`、`nextMarker`（默认 `[`、`]`，与现有绑定冲突则留空 `[]`）。
- 操作反馈用现有的 `ctx.hud.show(...)`。

### 自动跳转

设置放在 `pages/video/data/usePreferences.ts` 的 `PlayerPreferences`：

- `markerSeekFirstOnOpen: boolean`（默认 false）：有打点且没有续播位置优先级冲突时，起播位置取首个打点。规则：开启后优先于历史续播。
- `markerHighlightMode: boolean`（默认 false）和 `markerSegmentSeconds: number`（默认 60）：片段为 `[time, endTime ?? time + markerSegmentSeconds]`，重叠片段合并；播放到片段末尾跳到下一片段开头，最后一个片段结束后触发现有的"播放下一个"逻辑（`handleVideoEnded`）。用户手动拖动进度条到片段外时，不强行拉回，等播放进入下一个片段范围前按"下一个片段"处理。

### 云端同步（实验性）

设置 `markerSync: 'off' | 'drive-file' | 'file-desc'`，放 `utils/userSettings.ts`，默认 `off`，在偏好设置里标注"实验性"。

共同规则：
- 本地优先：所有操作先写本地，再异步同步；同步失败只记日志和一次提示，不影响使用。
- 合并：按 `id` 合并，`updatedAt` 大者胜，墓碑参与合并。纯函数 `mergeDocs(local, remote)`。
- 节流：`push` 防抖 10 秒，并在页面隐藏（`visibilitychange`）时立即推一次；`pull` 在打开视频时执行，同一 `pickCode` 5 分钟内不重复拉。

后端 A（网盘文件）：
- 位置：根目录下 `115Master` 文件夹里的 `markers.json`，内容为 `{ v: 1, docs: Record<pickCode, MarkerDoc> }`。
- 读：找到文件 → `drive115.video.getFileDownloadUrl` → 用 `GMRequest` 带 cookie 取文本（参照 `utils/ed2k/generate.ts`）。
- 写：`drive115.upload.upload(...)` 上传新文件，成功后删除旧文件（`deleteFiles`）。上传返回的 `file_id` / `pick_code` 是伪造的（见 `parseOssResponse`），必须重新列目录取真实值。
- 已知不确定点：上传接口只在测试页用过；同名文件 115 如何处理未知。实现必须能应对"目录里出现多个同名文件"：读时取最新的一个并合并其余，写后清理多余的。

后端 B（文件备注）：
- 在 `packages/drive115` 的 file client 新增 `getFileDesc` / `setFileDesc`。接口为社区已知但**本仓库未验证**：读 `GET {WEB_API}/files/desc?file_id=<fid>&format=json&compat=1`，写 `POST {WEB_API}/files/edit`，表单 `fid=<fid>&file_desc=<text>`（`setFileLabels` 用的同一路径）。
- 备注里用定界块保存，保留用户自己的备注文字：`<!--115master-markers:<base64url(JSON)>-->`。读不到块视为无远端数据；写时只替换该块。
- 备注长度上限未知：写入前若编码后超过 60000 字符则放弃写入并提示。

两个后端都无法在无登录环境下实测，执行者只需保证单测（mock 请求）通过；真实接口由用户在浏览器里验证，验证清单见 `docs/agy/manual-test.md`（T4 产出）。

## 任务拆分

| 任务 | 内容 | 允许修改的范围 | 完成标准 |
|---|---|---|---|
| T1 | 数据模型、纯逻辑、本地存储 | `apps/monkey/src/utils/markers/**`、`apps/monkey/src/utils/cache/markerStore.ts`、`apps/monkey/src/utils/cache/index.ts` | 单测覆盖增删改、排序、上/下一个、片段合并、`mergeDocs`、墓碑清理；`verify.mjs` 通过 |
| T2 | 播放器 UI、快捷键、视频页接入（仅本地持久化） | `apps/monkey/src/components/XPlayer/**`、`apps/monkey/src/pages/video/**`、图标注册文件 | 可打点、显示刻度、列表增删改、快捷键跳转、刷新后恢复；`verify.mjs` 通过 |
| T3 | 两种自动跳转、导出 / 导入 | 同 T2，另加 `apps/monkey/src/utils/markers/**` | 设置项默认关闭；片段逻辑有单测；导出再导入数据一致；`verify.mjs` 通过 |
| T4 | 同步框架 + 后端 A + 设置项 + 手动验证清单 | `apps/monkey/src/utils/markers/sync/**`、`apps/monkey/src/utils/userSettings.ts`、`apps/monkey/src/components/Preferences/PreferencesContent.tsx`、`apps/monkey/src/pages/video/data/useDataMarkers.ts`、`docs/agy/manual-test.md` | mock 请求的单测覆盖 pull / push / 多个同名文件 / 失败不影响本地；`verify.mjs` 通过 |
| T5 | 后端 B + drive115 备注接口 | `packages/drive115/src/clients/file/**`、`packages/drive115/src/__tests__/**`、`apps/monkey/src/utils/markers/sync/**`、`docs/agy/manual-test.md` | 接口有 mock 单测；定界块读写保留用户备注；`verify.mjs` 通过 |

每个任务都必须附一个 changeset（`.changeset/*.md`，`@115master/monkey` minor 或 patch）。

建议节奏：T1–T3 完成后先发一个版本给用户在浏览器里试用，再做 T4、T5。

## 风险与回退

- 115 内部接口未验证（上传、备注）：两种同步默认关闭且标注实验性，失败不影响本地打点。
- 精华模式与现有"续播""自动播放下一个"的交互容易出边界问题：片段计算做成纯函数并单测。
- 每个任务一个 commit，出问题可单独 `git revert`；整体回退到基线 `8be230c`。
