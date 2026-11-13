#!/usr/bin/env node
/**
 * 115 网盘本地 MCP 服务器
 *
 * - MCP 传输：stdio（由 DSH dsh-mcp-client 拉起）
 * - Cookie 来源：
 *   1. 配置文件（默认 %USERPROFILE%\.115-mcp\config.json，可由 MCP_115_CONFIG 覆盖）
 *   2. 本地 HTTP 桥：POST http://127.0.0.1:26315/cookie {"cookie": "..."}（配合 cookie-bridge.user.js）
 *
 * 工具（只读）：
 * - list_files { cid?, page?, page_size?, search_value?, order?, asc? }
 * - get_cookie_status {}
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_PATH = process.env.MCP_115_CONFIG
  ?? path.join(os.homedir(), '.115-mcp', 'config.json');
const BRIDGE_PORT = Number(process.env.MCP_115_BRIDGE_PORT ?? 26315);
const FILES_API = 'https://webapi.115.com/files';

function loadCookie() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const cookie = String(raw.cookie ?? '').trim();
    return cookie || null;
  } catch {
    return null;
  }
}

function saveCookie(cookie) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ cookie }, null, 2), 'utf8');
}

async function call115(params) {
  const cookie = loadCookie();
  if (!cookie) {
    throw new Error(
      '尚未配置 115 Cookie。两种方式：\n'
      + '1) 在浏览器安装 scripts/mcp-115/cookie-bridge.user.js 油猴桥（自动推送）\n'
      + `2) 手动把 Cookie 写入 ${CONFIG_PATH}：{"cookie":"UID=...;CID=...;SEID=..."}\n`
      + '需要 UID、CID、SEID 三个字段。',
    );
  }
  const url = new URL(FILES_API);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: {
      cookie,
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      referer: 'https://115.com/',
    },
  });
  if (!res.ok) throw new Error(`115 API HTTP ${res.status}`);
  const data = await res.json();
  if (!data.state) {
    throw new Error(`115 API 返回失败（可能是登录态失效，请重新推送 Cookie）: ${JSON.stringify({
      state: data.state,
      error: data.error ?? data.message ?? null,
      noLogin: data.noLogin ?? null,
    })}`);
  }
  return data;
}

function normalizeItem(item) {
  const isDir = item.fid === undefined;
  return {
    id: isDir ? item.cid : item.fid,
    name: item.fn,
    type: isDir ? 'dir' : 'file',
    parentId: item.pid,
    size: isDir ? undefined : item.siv,
    ext: isDir ? undefined : item.ico,
    stars: item.stars ?? 0,
    updateTime: item.upt,
    pickCode: item.pc,
  };
}

function summarize(data, offset) {
  const list = (data.data ?? []).map(normalizeItem);
  return {
    total: data.total,
    count: data.count,
    offset,
    list,
    hasMore: (offset ?? 0) + list.length < (data.total ?? 0),
    folderName: data.path?.map((p) => p.name).join(' / '),
  };
}

const server = new McpServer({ name: 'drive115', version: '0.1.0' });

server.registerTool(
  'list_files',
  {
    title: 'List 115 drive files',
    description:
      '列出 115 网盘目录内容或按关键词搜索。cid=0 为根目录；传 search_value 时进行全局搜索，忽略 cid。',
    inputSchema: {
      cid: z.number().int().default(0).describe('目录 id，0 = 根目录'),
      page: z.number().int().min(1).default(1).describe('页码，从 1 开始'),
      page_size: z.number().int().min(1).max(1150).default(50).describe('每页条数'),
      search_value: z.string().optional().describe('关键词，提供时执行全局搜索'),
      order: z
        .enum(['user_ptime', 'file_name', 'file_size', 'file_type'])
        .default('user_ptime')
        .describe('排序字段'),
      asc: z.boolean().default(false).describe('是否升序'),
    },
  },
  async ({ cid, page, page_size, search_value, order, asc }) => {
    const offset = (page - 1) * page_size;
    const data = await call115({
      cid: search_value ? undefined : cid,
      offset,
      pagesize: page_size,
      limit: page_size,
      o: order,
      asc: asc ? 1 : 0,
      show_count: 1,
      format: 'json',
      search_value,
    });
    return { content: [{ type: 'text', text: JSON.stringify(summarize(data, offset), null, 2) }] };
  },
);

server.registerTool(
  'get_cookie_status',
  {
    title: 'Check 115 cookie status',
    description: '检查是否已配置 115 Cookie 及配置文件位置（不返回 Cookie 内容）。',
    inputSchema: {},
  },
  async () => {
    const ok = loadCookie() !== null;
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ configured: ok, configPath: CONFIG_PATH, bridgePort: BRIDGE_PORT }),
      }],
    };
  },
);

// Cookie 桥：油猴脚本 POST /cookie 推送登录态
const bridge = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.startsWith('/cookie')) {
    res.writeHead(404).end();
    return;
  }
  let body = '';
  req.on('data', (c) => {
    body += c;
    if (body.length > 64 * 1024) req.destroy();
  });
  req.on('end', () => {
    try {
      const { cookie } = JSON.parse(body);
      if (!cookie || !/UID=/.test(cookie) || !/CID=/.test(cookie) || !/SEID=/.test(cookie)) {
        res.writeHead(400, { 'content-type': 'application/json' })
          .end(JSON.stringify({ ok: false, error: 'cookie 必须包含 UID/CID/SEID' }));
        return;
      }
      saveCookie(cookie);
      res.writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ ok: true, savedTo: CONFIG_PATH }));
    } catch (e) {
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
});
bridge.listen(BRIDGE_PORT, '127.0.0.1', () => {
  console.error(`[mcp-115] cookie bridge listening on http://127.0.0.1:${BRIDGE_PORT}/cookie`);
});
bridge.on('error', (err) => {
  // 端口被占用时（例如另一个实例已在跑桥）不阻断 MCP 服务本身
  console.error(`[mcp-115] cookie bridge unavailable: ${err.message}`);
});

process.on('exit', () => bridge.close());

await server.connect(new StdioServerTransport());
console.error('[mcp-115] MCP server started on stdio');
