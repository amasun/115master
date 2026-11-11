# T2 返工 1

T2 已提交（`39d6f93`），验收未通过。请在现有代码上修复下列问题。范围限制、验证方式与 `docs/agy/tasks/T2.md` 相同：不要运行 `verify.mjs`、全量测试、全量 lint；只跑你改动的测试文件、对改动文件 `eslint --fix`、`pnpm --filter @115master/monkey type-check`。不要 `git commit`，不要 `git push`。

## 必须修复

### 1. `addMarker` 默认快捷键永远不会触发
`apps/monkey/src/components/XPlayer/components/Shortcuts/shortcuts.const.ts` 里 `addMarker: ['M']`。按键比较会转小写（`shortcuts.utils.ts` 的 `isSameKeyBinding` / `parseKeyFromCode`），所以 `'M'` 与 `toggleMute: ['m']` 是同一个绑定，而 `matchAction` 取第一个匹配，结果按 M 是静音。

修复：
- `addMarker` 改为 `['b']`；`prevMarker` 改为 `[',']`，`nextMarker` 改为 `['.']`。
- 改之前检查 `DEFAULT_ACTION_KEY_BINDINGS` 全表（按小写比较）确认这三个键没有被占用；被占用的那一个改为 `[]`，并在结束报告里说明。
- 加一个单测：遍历 `DEFAULT_ACTION_KEY_BINDINGS`，断言所有默认按键转小写后互不重复（`progress` 的数字键也算）。文件名带 `marker`。
- 同步更新 `.changeset/markers-player-ui.md` 和界面里出现的快捷键文字（如果有）。

### 2. 切换视频时打点可能覆盖掉另一个视频的已存数据
`apps/monkey/src/pages/video/data/useDataMarkers.ts`（约 105–170 行）：切换视频后 `loadDoc` 没有清空 `currentDoc`，加载期间 `currentDoc` 仍是上一个视频的文档。此时 `add()` 发现 pickCode 不一致，就新建一个空文档并保存，覆盖了新视频原有的打点；随后未完成的 `getDoc` 返回，界面又显示旧数据。`getDoc` 失败时（`currentDoc = null`）同样会覆盖。

修复：
- 切换开始时立即把 `currentDoc` 置空（界面不再显示上一个视频的刻度）。
- 保存一个"当前加载"的 Promise；`add` / `update` / `remove` 先 `await` 它，再操作。
- `getDoc` 抛错时记为"加载失败"状态：此时 `add` 不得新建文档覆盖，应重试一次 `getDoc`，仍失败则放弃本次操作并抛错（由上层提示）。
- await 之后要再次确认 pickCode 仍是发起操作时的那个，否则放弃。
- `extractMeta` 用到的文件信息如果属于另一个 pickCode，不要写进文档（只写 pickCode）。
- 加单测：(a) 加载未完成时 add，最终存储里同时有旧打点和新打点；(b) `getDoc` 失败后 add 不覆盖已有数据；(c) 切换开始后 `markers` 立即为空。

### 3. 改名输入框拿不到焦点，并抛未捕获错误
`apps/monkey/src/components/XPlayer/components/Controls/MarkersButton.vue`（约 53 行、190 行）：`ref="editInputRef"` 在 `v-for` 内，Vue 3 会填成数组，`editInputRef.value?.focus()` 抛 `focus is not a function`。现有单测运行时有 2 个 Unhandled Error 就是它。

修复：改用函数 ref（只给正在编辑的那一行赋值）或取数组第一个元素。单测断言进入改名后输入框是 `document.activeElement`，且测试运行不再有 Unhandled Error。

## 顺带修复

4. 保存失败时回滚：`saveDoc` 目前先乐观更新 `currentDoc` 再抛错，界面会留下一个没存上的打点。失败时恢复为保存前的文档。加单测。
5. `hooks/useMarkers.ts` 约 68、83 行的 `as unknown as Marker[]` 双重断言：改为正确的类型（XPlayer 侧定义一个只含 `id / time / endTime? / label` 的展示类型，或让纯函数的参数类型放宽到所需字段），不要用断言绕过。
6. 改名输入框按 Esc：只取消改名，不关闭弹层，也不触发播放器快捷键。补上标题里写了但没实际执行的 Esc 取消测试。

## 结束时报告

改了哪些文件、跑了哪些验证及结果、最终三个快捷键的默认值、未解决的问题。
