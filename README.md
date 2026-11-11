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

在 MASTER 播放器内为当前视频打点，记录时间位置和备注：

- 进度条显示打点刻度，点击跳转
- 控制栏打点按钮，弹层支持查看列表、内联编辑标签、删除
- 快捷键 `M` 在当前时间打点
- 打点随视频持久化保存到本地，再次打开自动恢复

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

## 许可与致谢

原作者：[@cbingb666](https://github.com/cbingb666)  
Fusion 维护：[@daoran9](https://github.com/daoran9)  
本仓库：[@amasun](https://github.com/amasun)

继续使用 [MIT](LICENSE) 许可证。

## 免责声明

本软件仅供技术研究与学习，使用者须遵守当地法律法规及 115 服务条款，自行承担使用风险。
