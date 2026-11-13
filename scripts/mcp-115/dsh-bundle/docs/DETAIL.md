# Drive115 MCP 通道

本地 stdio MCP 服务器，让 Agent 直接查看 115 网盘文件目录（只读）。

## 组成

- `../server.mjs` — MCP 服务器（stdio）+ Cookie 推送桥（`http://127.0.0.1:26315/cookie`）
- `../cookie-bridge.user.js` — 油猴脚本：打开 115 页面时用 `GM_cookie` 读取登录态并推送到本地桥

## Cookie 存储

保存在 `%USERPROFILE%\.115-mcp\config.json`，仅在本机使用，不会上传。

## 使用

1. 安装本 bundle 后，DSH 通过 `dsh-mcp-client`（stdio）拉起 `server.mjs`，Agent 获得 `mcp__drive115__*` 工具
2. 浏览器安装 `cookie-bridge.user.js` 并登录 115，Cookie 自动推送
3. Agent 调用 `list_files` 即可列目录/搜索
