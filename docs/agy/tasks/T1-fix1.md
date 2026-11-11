# T1 返工 1

验收结论：结构没问题，范围干净，49 个单测通过；但有以下问题必须修。范围限制与 T1.md 相同。

## 必须修

1. `apps/monkey/src/utils/markers/core.ts`（约 20、42、72、108 行）：`now: number = Date.now()` 的默认值去掉，`now` 改为必填参数。纯逻辑里不允许出现 `Date.now()`。
2. `core.ts` `parseDocs`（约 440 行）：文档缺少 `updatedAt` 时不要用 `Date.now()`，改为取其打点 `updatedAt` 的最大值，没有打点则为 `0`。
3. `core.ts` `updateMarker`（约 79-84 行）：不要直接展开 `patch`。逐字段构建更新：字段为 `undefined` 时保持原值；`time`、`endTime` 的处理与 `addMarker` 一致（含截断）。目标打点已是墓碑（`deleted`）时直接返回原 `doc`。
4. `core.ts` `addMarker` / `updateMarker`：`time` 非有限数（`NaN`、`Infinity`）时不写入——`addMarker` 返回原 `doc`，`updateMarker` 忽略该字段。`endTime` 非有限数或 `<= time` 时视为未设置（`undefined`）。
5. `core.ts` `buildSegments`（约 216-235 行）：
   - `segmentSeconds <= 0` 时不要整体返回 `[]`，只跳过没有显式 `endTime` 的打点；
   - `duration` 为 `undefined`、非有限数或 `<= 0` 时视为"未知时长"，不做截断（视频元数据加载前 duration 常为 0 / NaN）；
   - `endTime <= time` 的打点回退为 `time + segmentSeconds`。
6. `apps/monkey/src/utils/cache/markerStore.ts`：
   - `saveDoc` 不要吞掉错误，写入失败要抛出（可记日志后 `throw`）；
   - `replaceAll` 改为"先写入全部新文档，再删除不在新集合里的旧 key"，任何一步失败都要抛出，不能出现导入失败却把原有数据清空的情况。
7. `core.ts` `mergeDocs`：两侧 `pickCode` 不一致时抛出错误；元数据（`fileId`、`fileName`、`duration`）取 `updatedAt` 较大一侧的值，该侧缺失时用另一侧补。
8. `core.ts` `parseDocs`：同一文档内 `id` 重复的打点只保留 `updatedAt` 最大的一个；只保留 `Marker` / `MarkerDoc` 定义的字段。
9. `apps/monkey/src/utils/markers/types.ts:1`：去掉文件级 eslint-disable；若确有规则报错，改用最小范围的行级禁用并写明原因。

## 补充测试

为上面每一条补单测，至少包括：NaN / Infinity 时间；`updateMarker` 传 `undefined` 字段、更新墓碑；`endTime <= time`；`segmentSeconds = 0` 且有显式 `endTime`；`duration` 为 0 / NaN；`mergeDocs` 不修改入参、`pickCode` 不一致、元数据取新；恰好在清理边界上的墓碑；`replaceAll` 写入失败时旧数据仍在。同步修正因行为变更而过时的旧断言（如 `__tests__/core.test.ts` 约 301 行）。

## 验证方式（重要）

**不要运行 `node docs/agy/verify.mjs`**（它要跑好几分钟，上一轮你因等待它而超时）。只运行下面三条，全部通过即可结束，完整验收由指挥方执行：

```
pnpm --filter @115master/monkey exec vitest run --project unit src/utils/markers
pnpm --filter @115master/monkey exec eslint src/utils/markers src/utils/cache/markerStore.ts src/utils/cache/index.ts
pnpm --filter @115master/monkey type-check
```

结束时列出：改了哪些文件、三条命令的结果、未解决的问题。

## 另：lint 未通过

`pnpm lint` 报 15 个 error（均可自动修复）。请对你改动的文件运行
`pnpm --filter @115master/monkey exec eslint --fix src/utils/markers src/utils/cache/markerStore.ts src/utils/cache/index.ts`，
并确认上面"验证方式"里的 eslint 命令零报错。
