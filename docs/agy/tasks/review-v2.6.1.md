# v2.4.0 → v2.6.1 问题记录（按优先级）

范围：`git diff 1037f7e 96121b0 -- apps packages`。自动检查（类型检查、lint、打点单测、构建）全部通过。
来源：代码审查（读代码得出，未在真实 115 页面验证）和用户实测反馈。详细位置与修法见下方各节。

| 优先级 | 编号 | 问题 | 来源 | 状态 |
|---|---|---|---|---|
| P0 | A | 旧版 115 界面：头像没有替换到文件夹图标位置，头像和文件名都向右偏 | 用户实测 | 已修，待浏览器确认 |
| P0 | 1 | 新版界面：隐藏规则过宽，未选中时也可能把原生行内操作栏藏掉 | 审查 | 已修，待浏览器确认 |
| P1 | 3 | 设置面板丢了"退出登录"和"列表加载方式" | 审查 | 未修（需确认是否有意删除） |
| P1 | 6 | 文件夹头像匹配回退：标题含名字不再匹配，普通文件夹可能配错头像 | 审查 | 未修 |
| P1 | 5 | 新版界面头像替换时可能隐藏到行外元素 / 复选框列 | 审查 | 未修（需浏览器确认） |
| P2 | 2 | "紧凑样式"开关不会即时生效 | 审查 | 未修 |
| P2 | 4 | e2e 用例仍查找旧文案，会失败 | 审查 | 未修 |
| P3 | - | "建议修复"一节的 6 条 | 审查 | 未修（其中 `margin: 0 auto` 一条已随 A 处理） |

## 已执行的修复

### A. 旧版界面头像右移（P0）
原因：旧版列表的文件夹图标是绝对定位，文件名靠左内边距给它留位置。新代码把图标隐藏后按普通流插入头像，头像排在留白之后，文件名再被头像顶开；另外内联的 `margin: 0 auto` 在 flex 行里会把头像往中间推。
修法（`actressInfo.ts` 旧版分支、`FileListMod/index.css`）：图标是绝对定位时，头像也绝对定位到图标原来的 `left`，垂直居中；头像比图标宽而盖住文件名时，按实际重叠量加大文件名节点的左内边距，卸载时恢复；行最小高度 58px；`margin: 0 auto` 只保留在"头像放进图标容器"这一种情况。
待确认：旧版真实页面里头像位置和文件名间距是否合适。

### 1. 隐藏规则过宽（P0）
修法（`pages/official/index.css`）：去掉 `[class*=...]` 子串匹配和 `body:has(input:checked)` 这类看整页的规则，只保留行内真实选中状态：行内勾选的复选框、`role=checkbox` 的 `aria-checked`、行上的 `aria-selected` / `data-selected` / `.selected` / `.is-selected`；"任意一行被勾选则隐藏所有行内操作栏"的多选行为保留，但限定为文件行内的复选框。
待确认：真实页面里选中文件后悬浮菜单是否仍然被隐藏（如果 115 用的是别的选中标记，需要按真实类名补一条）；未选中时悬停行内操作按钮是否正常显示。

---

## 审查原始记录：必须修复

### 1. 隐藏规则过宽，可能把 115 原生的行内操作栏永久隐藏
`apps/monkey/src/pages/official/index.css:32-46`。合并模式下 `data-115master-native-actions` 打在 115 自己的行悬停操作栏上（`newFileList.ts:1016`，含下载 / 分享 / 移动 / 重命名 / 删除 / 更多）。下列选择器在没有任何选中时也会命中：
- `[class*='checkbox'][class*='check']` 等同于 `[class*='checkbox']`，只要行里有复选框元素就命中。
- `.file-list-item[class*='active']` 会命中 Tailwind 的 `active:` 工具类。
- `body:has([class*='selected'])`、`body:has(input:checked)`、`body:has([aria-checked='true'])` 命中页面任意位置（如选中的导航项）。

后果：原生行内操作和 Fusion 下载入口被 `!important` 隐藏。`[data-native-selection-toolbar]` 只存在于 e2e 夹具，夹具测不出来。修复：只在行自身处于选中态时隐藏该行的操作栏，选择器限定到行内的真实选中标记。（需浏览器确认真实类名）

### 2. "紧凑样式"开关不会即时生效
`apps/monkey/src/pages/home/components/ExtInfo/index.vue:252-256`：`computed(() => userSettings.value.compactAvInfo)` 读的是普通 Proxy，不是 Vue 响应式；`extInfo.ts` 的 `SETTING_KEYS` 也只有 `enableAvInfo`。标签里的"刷新后生效"已删，但已渲染的卡片不会切换。改用 `useUserSetting('compactAvInfo')`。

### 3. 设置面板丢了"退出登录"和"列表加载方式"
`apps/monkey/src/components/Preferences/PreferencesContent.tsx`：账号区（退出登录）和分页 / 无限加载选择被删除，Fusion 应用里没有别处渲染它们，`AccountPreferences.tsx` 及其测试成了孤儿，`loggedOut` 事件也没人触发。`docs/agy/optimizations.md` 没有说明这是有意为之。恢复，或明确确认要删并清理孤儿文件。

### 4. e2e 用例与新文案不一致
`apps/monkey/e2e/specs/video/theme.spec.ts:134` 仍查找"文件视频封面""番号资料"，现在是"视频截图预览""番号作品资料"，该用例会失败。

### 5. 头像替换文件夹图标时可能隐藏到行外的元素
`apps/monkey/src/pages/home/FileListMod/FileItemMod/actressInfo.ts:113`：`inlineName.closest('.flex-1')` 没有限定在行内，可能爬到页面级的 `.flex-1`，随后 116-130 行会隐藏它的前一个兄弟或子元素。复选框判断只认 `input` 和 `role=checkbox`，115 若用带样式的 div，复选框列会被隐藏。修复：`closest` 的结果必须在行节点内，否则放弃替换。（需浏览器确认）

### 6. 文件夹头像匹配回退
`actressInfo.ts:61-67` 与 `extractActressCandidates`：从 title 模式（标题里包含名字即可）改成了只用 name 模式，"精品 三上悠亚"这类文件夹以前能匹配、现在不能。同时"首段汉字"回退会把普通文件夹词送进 `resolveName` 的 2 字前缀模糊匹配，普通文件夹可能显示错误头像。修复：先用 `findActress(title, 'title')`，前缀降级只用于明确的人名候选，且至少 3 个字。

## 审查原始记录：建议修复

- `actressInfo.ts:100`：内联 `margin: 0 auto` 覆盖了 CSS 的 `margin-right: 12px`，头像可能贴着名字或漂到中间。
- `actressInfo.ts:267-277`：销毁时对所有子元素 `removeProperty('display')`，会把 115 自己隐藏的元素也显示出来；`alignItems` / `justifyContent` 没有恢复。应只恢复自己改过的元素。
- `actressInfo.ts:212-214`：`with-actress-info` 加在 `itemNode` 上，销毁时却从 `.file-name-wrap` 移除，类名残留。
- 头像 `<img>` 没有 `onerror`：加载失败时文件夹图标仍被隐藏，只剩空白圆圈。失败时应恢复原图标。
- `pages/home/TopHeaderMod/index.ts:179-225`：介绍 / 头像按钮没有订阅 `userSettings.watch`，在设置面板里改了之后按钮状态不同步。
- `PreferencesContent.tsx`：关于里的链接写死为 `github.com/amasun`，应取 `PKG.homepage`。

## 已确认没问题

无 `any`、`export *`、`console.log`；返回入口指向 `https://115.com/?mode=wangpan`；官方工具栏的监听有正确释放；`actressInfo.test.ts` 与新插入逻辑一致。
