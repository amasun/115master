# @115master/mcp-115

115 网盘本地 MCP 通道（方案 A）：本地 MCP 服务器直连 115 Web API，让 Agent 查看文件目录。

**安装 Cookie 桥油猴脚本（独立脚本，与 115master 主插件无关）：**

```
https://github.com/amasun/115master/releases/download/mcp-cookie-bridge-v0.2.0/115-mcp-cookie-bridge.user.js
```


## 组成

| 文件 | 作用 |
|---|---|
| `server.mjs` | MCP 服务器（stdio），工具 `list_files` / `get_cookie_status`；同时监听 `127.0.0.1:26315` 接收 Cookie 推送 |
| `cookie-bridge.user.js` | **独立油猴脚本**（与 115master 主插件无任何关系）：读取 115 登录 Cookie 并推送到本地桥；菜单支持手动推送、改端口，带页面提示 |
| `dsh-bundle/` | DSH 配置 bundle：注册 `@deepseek-ai/dsh-mcp-client`（stdio → server.mjs） |

## Cookie

- 存储位置：`%USERPROFILE%\.115-mcp\config.json`（可用环境变量 `MCP_115_CONFIG` 覆盖）
- 仅保存在本机，绝不外传；Agent 侧工具只读文件列表，不返回 Cookie 内容

## 使用

```sh
pnpm install            # 本目录内
pnpm start              # 手动调试（stdio 模式下一般由 DSH 拉起）
```

1. 将 `dsh-bundle/` 作为本地 bundle 安装到 DSH profile（Plugins > Add plugin）
2. 浏览器安装 `cookie-bridge.user.js`，登录 115 并打开任意 115 页面
3. Agent 即可调用 `mcp__drive115__list_files { cid: 0 }` 列根目录

## 安全边界

- 服务器只实现只读工具（列目录/搜索），无删除/移动/下载能力
- HTTP 桥仅绑定 `127.0.0.1`，只接受 `/cookie` 的 POST
