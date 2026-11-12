<div align="center">

<p><img src="./apps/monkey/src/assets/logo-wordmark.svg" alt="115Master Fusion" width="500" /></p>

[![GitHub Release](https://img.shields.io/github/v/release/amasun/115master?include_prereleases&logo=github)](https://github.com/amasun/115master/releases)
[![GitHub Downloads](https://img.shields.io/github/downloads/amasun/115master/115master-fusion.user.js?logo=github)](https://github.com/amasun/115master/releases)
[![License](https://img.shields.io/github/license/amasun/115master)](LICENSE)

</div>

基于 [daoran9/115master](https://github.com/daoran9/115master) v2 分支的个人增强版本，使用独立名称和更新源，不会被上游覆盖。

## 安装

```
https://github.com/amasun/115master/releases/latest/download/115master-fusion.user.js
```

需要 Tampermonkey 5.3.3+，Chrome 130+ 或 115Browser 35+，并开启扩展开发者模式。安装前停用原版 115Master，两者不能同时运行。

## 在上游基础上新增的功能

### 播放器打点（Markers）

看视频时把重要位置记下来，下次打开同一个视频还在，可以直接跳过去。打点只在 MASTER 播放器里可用。

**能做什么**

- 在当前播放位置打点，并给它写备注
- 进度条上显示每个打点的刻度，悬停看备注，点击跳转
- 控制栏的打点按钮里有完整列表，可以跳转、改名、删除
- 用快捷键在打点之间前后跳转
- 打点按视频保存在浏览器本地，刷新或重新打开后自动恢复

**怎么用**

1. 用 MASTER 播放器打开视频。
2. 播放到想记录的位置，按 `B`，或点控制栏的打点按钮再点"在当前位置打点"。进度条上会出现一个刻度。
3. 点控制栏的打点按钮打开列表：点某一条跳到该位置；点改名后输入备注，回车保存，`Esc` 取消；点删除移除该打点。
4. 按 `,` 跳到上一个打点，按 `.` 跳到下一个打点。

| 操作 | 默认快捷键 |
|---|---|
| 在当前位置打点 | `B` |
| 上一个打点 | `,` |
| 下一个打点 | `.` |

快捷键可以在播放器的快捷键设置里修改。

**注意**

- 打点目前只存在当前浏览器里，换浏览器或清除站点数据后不会保留。
- 打点跟随视频文件本身，文件改名或移动后仍然有效。

**进行中**

- 正在针对打点和播放器的一系列交互体验问题做优化，界面和操作细节后续版本还会调整。
- 计划中：打开视频自动跳到首个打点、只播放打点片段的精华模式、打点导出与导入、云端同步。

## 上游功能（概览）

以下功能来自上游项目，本仓库未修改：

- MASTER 文件管理器：列表/卡片视图、多选、搜索、移动、重命名、番号资料、演员头像
- 播放器：Ultra 原画、多画质、缩略图、字幕、播放列表、剧院/全屏/画中画、自定义快捷键
- 新版 115 页面接入：视频封面、番号资料、演员头像、播放入口、ED2K 链生成
- 增强开关：在偏好设置中独立控制各增强项

## 开发

```bash
pnpm install --frozen-lockfile
pnpm --filter @115master/monkey exec vitest run --project unit
pnpm --filter @115master/monkey type-check
pnpm --filter @115master/monkey build
```

产物：`apps/monkey/dist/115master-fusion.user.js`

## 贡献

原作者：[@cbingb666](https://github.com/cbingb666)  
Fusion 维护：[@daoran9](https://github.com/daoran9)  
本仓库：[@amasun](https://github.com/amasun)

参与开发请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

[MIT](LICENSE) 许可证。

## 免责声明

本软件仅供技术研究与学习，使用者须遵守当地法律法规及 115 服务条款，自行承担使用风险。
