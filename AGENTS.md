# AGENTS.md

## Quick Start

```bash
pnpm install              # Node >= 20.12, pnpm 9.x
pnpm dev                  # turbo 并行启动所有 packages 的 dev
pnpm build                # turbo 并行 build
pnpm push                 # 事务：构建 userscript 并推送当前分支（支持 --release / --allow-dirty / git push 参数）
pnpm ship                 # 一键事务：自动暂存提交（支持 -m "msg"）、rebase、构建校验并推送 v2
pnpm type-check           # vue-tsc / tsc --noEmit (全包)
pnpm test                 # vitest run (全包)
pnpm lint                 # eslint
pnpm lint:fix             # eslint --fix
pnpm lint:inspector       # @eslint/config-inspector (调试规则冲突)
pnpm analyze              # bundle 分析 (rollup-plugin-visualizer)
pnpm storybook            # 并行启动 UI Foundation (6006) 与 Monkey 集成 Storybook (6007)
pnpm storybook:ui         # 仅启动 UI Foundation Storybook
pnpm storybook:monkey     # 仅启动 Monkey 集成 Storybook
pnpm build-storybook      # 构建两套静态 Storybook
pnpm test:visual          # 视觉回归：Storybook × 双主题截图
pnpm test:visual:update   # 更新当前平台视觉基线（写共享基线，须串行）
pnpm test:e2e             # 业务 E2E：离线 harness (含 userscript 构建)
pnpm test:e2e:run         # E2E 跳过构建 (纯跑全量；分片/过滤用法见下方说明)
pnpm verify               # 总闸门：type-check && test && test:e2e && build-storybook && test:visual
pnpm changeset            # 新建 changeset (仅用户执行)
pnpm clean:cache          # 清理 Turbo / Vite / Rollup / TypeScript 构建缓存
pnpm clean                # 清理所有 dist、构建缓存及根目录 node_modules
```

> **Pre-commit hook**：`simple-git-hooks` 在每次 `git commit` 前自动跑 `pnpm type-check && pnpm lint && pnpm lint:fix`。
>
> **E2E 分片/过滤**：`pnpm test:e2e` 含构建（共享产物，不可并行）；跳过构建用 `pnpm --filter @115master/monkey test:e2e:run`——分片追加 `--shard=i/n`，按目录过滤追加 `specs/<子目录>`（参数直接追加在脚本名后，不能加 `--` 分隔符，否则被 Playwright 吞掉跑全量；根 `pnpm test:e2e:run` 不转发参数，仅纯跑全量）。验证平台与并行规约详见 `docs/agents/verification.md`。

## Monorepo 拓扑

```sh
apps/
└── monkey                # Vue 3 + Vite + vite-plugin-monkey

packages/
├── shared                # 基础设施（被 drive115 / subtitle-source / monkey 消费）
├── drive115              # 115 API 门面（依赖 shared, utils）
├── subtitle-source       # 字幕来源（依赖 shared, utils）
├── ui                    # 应用无关 UI Foundation
├── utils                 # 通用工具函数
├── tsconfig              # 共享 tsconfig
└── eslint-config         # 共享 eslint 配置

依赖方向（仅向下游）：
monkey → ui, drive115, subtitle-source, shared, utils
drive115 / subtitle-source → shared, utils
```

## Code Style Guide

**编码时必须查看**
@.agents/STYLE_GUIDE.md

## Git

- 默认保持线性历史：合并走 fast-forward / rebase，不产生 merge commit，除非用户明确要求。
- **推送与 userscript 构建同步事务**：禁止单独执行 `git push`；所有推送统一使用 `pnpm push`（`scripts/push-and-build.mjs`），单条命令内先自动 `git pull --rebase` 同步远端提交（含 CI 回写的版本提交），再执行 `pnpm build` 并校验 `apps/monkey/dist/115master-fusion.{user,meta}.js` 产物，校验通过后再推送远端（构建失败则中止推送），确保推送与最新 `.user.js` 构建同步且减少输出开销。
- **v2 自动发版**：`.github/workflows/release.yml` 已监听 `v2` 分支的业务代码推送（`apps/monkey/**`、`packages/**`、`pnpm-lock.yaml`，排除纯文档与 Story）；当 `v2` 收到新代码推送且当前 `v<version>` tag 已存在时，CI 会自动递增 patch 版本号、构建并发布新 GitHub Release（附带最新 `115master-fusion.{user,meta}.js`）。日常开发走 `pnpm push` 推送到 `v2` 即可自动出新版；如需手动触发可追加 `--release`。
- **每两次功能改动自动提交推送**：在连续开发过程中，每累计完成 **2 次**功能/修复改动且本地验证通过后，无需等待用户额外指令，自动执行 `pnpm ship -m "<提交说明>"` 完成暂存提交、rebase、构建校验并推送到 `v2`（若用户明确要求暂不推送则以用户指令为准）。

## Packages

### @packages/shared

简介：跨应用共享基础设施层——错误类型（InfraError）、缓存系统（CacheCore、MetaStore、QuotaManager）、日志（Logger）、HTTP请求抽象（IRequest、FetchRequest）。
指令：@packages/shared/AGENTS.md

### @packages/ui

简介：应用无关 UI Foundation，拥有公共 Theme、Design Token、Glass、核心组件、Dialog 服务与基础 Storybook。
上下文：@packages/ui/CONTEXT.md

### @packages/drive115

简介：115网盘API客户端，封装所有115 API调用（文件、视频、离线、用户、图片等）及加密逻辑，通过Drive115门面类统一暴露。
指令：@packages/drive115/AGENTS.md

### @packages/utils

简介：提供跨应用共享的通用工具函数（数组、字符串、数字、Promise、格式化、时间、文件等）。
指令：@packages/utils/AGENTS.md

### @packages/subtitle-source

简介：字幕来源客户端，对接各字幕网站（thunder射手网、subtitlecat等），提供统一字幕搜索与下载接口。
指令：@packages/subtitle-source/AGENTS.md

### @packages/tsconfig

简介：共享TypeScript配置（base.json、node.json、vue-app.json），各包通过extends引用。
指令：@packages/tsconfig/AGENTS.md

### @packages/eslint-config

简介：共享ESLint配置，基于@antfu/eslint-config，集成tailwindcss与格式化插件。
指令：@packages/eslint-config/AGENTS.md

---

## Apps

### @apps/monkey

简介：115网盘用户脚本（Tampermonkey），基于 Vue 3 + Vite + vite-plugin-monkey 构建。

技术栈：Vue 3.5 + Vite 6 + Tailwind CSS v4 + daisyUI v5 + Pinia 3 + vue-router 4；视频播放 `@libmedia/avplayer` + `hls.js` + `m3u8-parser`；图标 `@iconify/vue`。
指令：@apps/monkey/AGENTS.md

## Agent skills

### Issue tracker

Issues 以 markdown 文件形式存放在 `.scratch/<feature>/` 下。详见 `docs/agents/issue-tracker.md`。

### Triage labels

默认五标签（needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix），以 `Status:` 行记录在 issue 文件中。详见 `docs/agents/triage-labels.md`。

### Domain docs

Multi-context —— 根目录 `CONTEXT-MAP.md` 指向各 package/app 的 `CONTEXT.md`。详见 `docs/agents/domain.md`。

### Verification

离线验证平台（单测/Storybook、业务 E2E、静态 Storybook 构建）的命令、并行 agent 规约与扩展指南。详见 `docs/agents/verification.md`。

### Component Stories

组件 Story 的所有权、分类、Args/Controls、fixture、可访问性与显式 `.test()` 规范。详见 `docs/agents/component-stories.md`。

### Feature Catalog & Product Manual（主要功能总览与产品说明书定期维护）

- 插件全部核心功能总览维护在 `@docs/FEATURES.md`（第一部分为继承自 `115master` 与 `fusion` 的基础功能，第二部分为本新版 `115 master fusion+` 新增的大功能模块），用户向 Wiki 说明书维护在 `@docs/PRODUCT_MANUAL.md`。
- **强制规则**：每次新增主要功能模块、独立页面/面板、新数据源/同步机制、筛选/排序维度或新增用户可见设置项时，**必须在提交前同步更新 `docs/FEATURES.md` 第二部分与 `docs/PRODUCT_MANUAL.md` 对应章节**；纯 bugfix、内部重构或样式微调无需记录。详见 `docs/agents/feature-catalog.md`。
