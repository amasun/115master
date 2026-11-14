// ==UserScript==
// @name         115 MCP Cookie Bridge
// @name:zh-CN   115 MCP 浏览器代理桥
// @namespace    115-mcp-cookie-bridge
// @version      0.4.0
// @description  Standalone helper, dual mode: (1) auto-pushes 115 login cookies (incl. httpOnly) to the local MCP bridge where GM_cookie works (Chrome/Edge) for auto renewal; (2) proxy mode - polls the bridge and executes 115 API requests with the browser's login state (115Browser fallback). Independent of any other userscript.
// @description:zh-CN  独立辅助脚本，双模式：Chrome/Edge 下自动推送 115 登录 Cookie（含 httpOnly）给本地 MCP 桥实现自动续期；115Browser 下退化为代理模式（轮询领任务、用登录态执行请求）。不依赖任何其他脚本。
// @author       you
// @match        https://115.com/*
// @match        https://*.115.com/*
// @match        https://webapi.115.com/*
// @connect      127.0.0.1
// @connect      localhost
// @connect      webapi.115.com
// @connect      115.com
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_cookie
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const BRIDGE_PORT_KEY = 'mcpBridgePort';
  const POLL_INTERVAL = 3000;

  function port() {
    return Number(GM_getValue(BRIDGE_PORT_KEY, 26315));
  }

  function bridge(path) {
    return `http://127.0.0.1:${port()}${path}`;
  }

  function toast(message, ok = true) {
    const id = 'mcp-115-cookie-bridge-toast';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      Object.assign(el.style, {
        position: 'fixed', right: '16px', bottom: '16px', zIndex: 2147483647,
        padding: '10px 14px', borderRadius: '8px', fontSize: '13px',
        maxWidth: '320px', boxShadow: '0 4px 12px rgba(0,0,0,.25)',
        fontFamily: 'system-ui, sans-serif', whiteSpace: 'pre-line',
      });
      document.body.appendChild(el);
    }
    el.style.background = ok ? 'rgba(16,185,129,.95)' : 'rgba(239,68,68,.95)';
    el.style.color = '#fff';
    el.textContent = `[115 MCP] ${message}`;
    el.style.display = 'block';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  function bridgePost(path, data) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: bridge(path),
        headers: { 'content-type': 'application/json' },
        data: JSON.stringify(data),
        timeout: 8000,
        onload: (res) => resolve(res),
        onerror: () => reject(new Error('bridge unreachable')),
        ontimeout: () => reject(new Error('bridge timeout')),
      });
    });
  }

  function runTask(task) {
    // GM_xmlhttpRequest 请求 115 域名时自动携带浏览器登录态（含 httpOnly Cookie）
    GM_xmlhttpRequest({
      method: 'GET',
      url: task.url,
      timeout: 20000,
      headers: { accept: 'application/json' },
      onload: async (res) => {
        try {
          await bridgePost('/result', { id: task.id, status: res.status, body: res.responseText });
        } catch (e) {
          toast(`结果回传失败：${e.message}`, false);
        }
      },
      onerror: async () => {
        try {
          await bridgePost('/result', { id: task.id, status: 0, body: JSON.stringify({ state: false, error: 'request failed' }) });
        } catch { /* bridge down */ }
      },
      ontimeout: async () => {
        try {
          await bridgePost('/result', { id: task.id, status: 0, body: JSON.stringify({ state: false, error: 'request timeout' }) });
        } catch { /* bridge down */ }
      },
    });
  }


  // ---------- 模式一：Cookie 自动续期（Chrome/Edge 可读 httpOnly，115Browser 不行） ----------
  const COOKIE_PUSH_INTERVAL = 30 * 60 * 1000;

  function pushCookie(silent) {
    if (typeof GM_cookie === 'undefined' || !GM_cookie?.list) {
      if (!silent) toast('当前脚本管理器不支持 GM_cookie，仅代理模式可用', false);
      return;
    }
    GM_cookie.list({ url: location.href }, (cookies, error) => {
      if (error || !cookies?.length) {
        if (!silent) toast(`读取 Cookie 失败：${error ?? '没有 Cookie'}`, false);
        return;
      }
      const names = cookies.map((c) => c.name);
      if (!['UID', 'CID', 'SEID'].every((k) => names.includes(k))) {
        if (!silent) toast('读到的 Cookie 不含 UID/CID/SEID（此浏览器可能读不到 httpOnly），仅代理模式可用', false);
        return;
      }
      const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      bridgePost('/cookie', { cookie })
        .then((res) => {
          const body = JSON.parse(res.responseText);
          if (body.ok) toast(silent ? 'Cookie 已自动续期' : 'Cookie 已推送到本地 MCP 桥');
          else toast(`推送被拒绝：${body.error}`, false);
        })
        .catch(() => {
          if (!silent) toast('本地桥不可达（MCP server 未运行？）', false);
        });
    });
  }

  // ---------- 模式二：代理模式（轮询领任务，用登录态执行请求） ----------
  let polling = false;
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      const res = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: bridge('/task'),
          timeout: 20000, // 桥端长轮询最多挂 15s
          onload: (r) => resolve(r),
          onerror: () => reject(new Error('unreachable')),
          ontimeout: () => reject(new Error('timeout')),
        });
      });
      const data = JSON.parse(res.responseText);
      if (data.ok && data.task) {
        runTask(data.task);
        toast('已代理一次 115 API 请求');
      }
    } catch {
      // 桥不可达：静默，避免刷屏
    } finally {
      polling = false;
    }
  }

  GM_registerMenuCommand('立即推送 Cookie（续期）', () => pushCookie(false));

  // 启动：推送一次 Cookie + 开始轮询任务；每 30 分钟续推一次 Cookie
  pushCookie(true);
  setInterval(() => pushCookie(true), COOKIE_PUSH_INTERVAL);
  setInterval(poll, POLL_INTERVAL);
  poll();
})();
