# UI / 功能优化计划（归档与摘要）

> **状态说明（已归档）**：OPT1–OPT4 均已交付完成；当前活跃待办请统一查看 [docs/TODO.md](../TODO.md)。

## 任务进展

| 任务 | 状态 | 交付说明 |
|---|---|---|
| OPT1 演员缩位匹配 | ✅ 已完成 | 精确匹配失败时逐位去尾降级搜索（最短 2 位），已补齐单测 |
| OPT2 视频头像修正 | ✅ 已完成 | 仅文件夹展示并替代原生文件夹图标 |
| OPT3 控制按钮扩展 | ✅ 已完成 | 截图、介绍、头像、设置、影视库独立控制 |
| OPT4 设置同步原生界面 | ✅ 已完成 | 原生界面呼出完整偏好设置面板 |

---

## OPT1：演员头像缩位匹配降级（已完成）

- **背景**：演员头像因中日文写法差异（汉字 vs 假名）容易精确匹配失败，需渐进式降级提高命中率。
- **需求**：当完整名字无结果时依次降级（例如 `1234` → `123` → `12`，取第一候选），命中即停；最短降至 2 位仍无结果则返回 `undefined`。
- **实现与验证**：已在 `apps/monkey/src/utils/actressNameMatcher.ts`（`ActressNameMatcher.resolveName`）与 `apps/monkey/src/utils/actressFaceDB.ts`（`findActress`）落地，并在 `apps/monkey/src/utils/__tests__/actressFaceDB.test.ts` 补齐完整命中、一级降级、二级降级、全部失败及 `title` 模式降级单测。
