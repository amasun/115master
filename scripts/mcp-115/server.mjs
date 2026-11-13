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
const TASK_TIMEOUT_MS = 30_000;

// 浏览器代理任务队列：油猴脚本轮询 GET /task 领取任务，POST /result 回传结果
const taskQueue = [];
const taskWaiters = new Set();
const pendingTasks = new Map();

function nextQueuedTask() {
  return taskQueue.shift() ?? null;
}

function enqueueTask(url) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const task = { id, url, createdAt: Date.now(), delivered: false };
    taskQueue.push(task);
    pendingTasks.set(id, { task, resolve, reject });
    const waiters = [...taskWaiters];
    taskWaiters.clear();
    for (const wake of waiters) wake();
    setTimeout(() => {
      if (!pendingTasks.has(id)) return;
      pendingTasks.delete(id);
      const idx = taskQueue.indexOf(task);
      if (idx >= 0) taskQueue.splice(idx, 1);
      reject(new Error('浏览器代理超时：请确认已打开 115 页面且油猴桥脚本在运行（v0.3.0+）'));
    }, TASK_TIMEOUT_MS);
  });
}

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
  const url = new URL(FILES_API);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const cookie = loadCookie();
  const data = cookie ? await directFetch(url, cookie) : await proxyFetchJson(url.href);
  if (!data.state) {
    throw new Error(`115 API 返回失败（可能是登录态失效，请重新推送 Cookie）: ${JSON.stringify({
      state: data.state,
      error: data.error ?? data.message ?? null,
      noLogin: data.noLogin ?? null,
    })}`);
  }
  return data;
}

async function directFetch(url, cookie) {
  const res = await fetch(url, {
    headers: {
      cookie,
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      referer: 'https://115.com/',
    },
  });
  if (!res.ok) throw new Error(`115 API HTTP ${res.status}`);
  return res.json();
}

// 通过油猴脚本代理：GM_xmlhttpRequest 自动携带浏览器登录态（含 httpOnly）
async function proxyFetchJson(url) {
  return enqueueTask(url);
}

function normalizeItem(item) {
  const isDir = item.fid === undefined;
  return {
    id: isDir ? item.cid : item.fid,
    name: item.n,
    type: isDir ? 'dir' : 'file',
    parentId: item.pid,
    size: isDir ? undefined : item.s,
    ext: isDir ? undefined : item.ico,
    stars: item.stars ?? 0,
    updateTime: item.te,
    pickCode: item.pc,
  };
}

function summarize(data, offset) {
  const list = (data.data ?? []).map(normalizeItem);
  return {
    count: data.count,
    total: data.total,
    offset,
    list,
    hasMore: (offset ?? 0) + list.length < (data.count ?? 0),
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

// Cookie 桥：油猴脚本 POST /cookie 推送登录态（DSH 探针进程会并发抢端口，失败则用新实例重试）
function handleBridge(req, res) {
  const sendJson = (code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(obj));
  };

  // 油猴脚本领取代理任务（长轮询：无任务时挂起，直到有任务或超时）
  if (req.method === 'GET' && req.url.startsWith('/task')) {
    const task = nextQueuedTask();
    if (task) {
      task.delivered = true;
      sendJson(200, { ok: true, task: { id: task.id, url: task.url } });
      return;
    }
    const wake = () => {
      const t = nextQueuedTask();
      if (t) {
        t.delivered = true;
        sendJson(200, { ok: true, task: { id: t.id, url: t.url } });
      } else {
        sendJson(200, { ok: true, task: null });
      }
    };
    const waiter = () => {
      clearTimeout(timer);
      taskWaiters.delete(wake);
      wake();
    };
    taskWaiters.add(wake);
    const timer = setTimeout(() => {
      taskWaiters.delete(wake);
      sendJson(200, { ok: true, task: null });
    }, 15_000);
    return;
  }

  // 油猴脚本回传 115 API 结果
  if (req.method === 'POST' && req.url.startsWith('/result')) {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 8 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const { id, status, body: resultBody } = JSON.parse(body);
        const pending = pendingTasks.get(id);
        if (!pending) return sendJson(200, { ok: false, error: 'unknown task id' });
        pendingTasks.delete(id);
        const idx = taskQueue.indexOf(pending.task);
        if (idx >= 0) taskQueue.splice(idx, 1);
        const parsed = JSON.parse(resultBody);
        if (status !== 200) {
          pending.reject(new Error(`115 API HTTP ${status}（浏览器代理）`));
        } else {
          pending.resolve(parsed);
        }
        sendJson(200, { ok: true });
      } catch (e) {
        sendJson(400, { ok: false, error: e.message });
      }
    });
    return;
  }

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
        sendJson(400, { ok: false, error: 'cookie 必须包含 UID/CID/SEID' });
        return;
      }
      saveCookie(cookie);
      sendJson(200, { ok: true, savedTo: CONFIG_PATH });
    } catch (e) {
      sendJson(400, { ok: false, error: e.message });
    }
  });
}

let bridgeRetryTimer = null;
function listenBridge() {
  if (bridgeRetryTimer) return;
  const b = http.createServer(handleBridge);
  b.on('error', (err) => {
    if (err.code !== 'EADDRINUSE') {
      console.error(`[mcp-115] cookie bridge error: ${err.message}`);
      return;
    }
    console.error(`[mcp-115] cookie bridge port ${BRIDGE_PORT} busy, retrying in 5s...`);
    b.close();
    bridgeRetryTimer = setTimeout(() => {
      bridgeRetryTimer = null;
      listenBridge();
    }, 5000);
  });
  b.listen(BRIDGE_PORT, '127.0.0.1', () => {
    console.error(`[mcp-115] cookie bridge listening on http://127.0.0.1:${BRIDGE_PORT}/cookie`);
  });
}
listenBridge();

process.on('exit', () => bridge.close());

await server.connect(new StdioServerTransport());
console.error('[mcp-115] MCP server started on stdio');
