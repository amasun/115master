// ==UserScript==
// @name         115 MCP Cookie Bridge
// @name:zh-CN   115 MCP 浏览器代理桥
// @namespace    115-mcp-cookie-bridge
// @version      0.3.0
// @description  Standalone helper: polls a local MCP bridge and executes 115 API requests with the browser's login state (GM_xmlhttpRequest auto-attaches httpOnly cookies). Independent of any other userscript.
// @description:zh-CN  独立辅助脚本：轮询本地 MCP 桥领取任务，用浏览器登录态（GM_xmlhttpRequest 自动携带 httpOnly Cookie）执行 115 API 请求并回传结果。不依赖任何其他脚本，不需要读取 Cookie。
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

  GM_registerMenuCommand('修改本地桥端口', () => {
    const input = prompt(`本地 MCP 桥端口（当前 ${port()}）：`, String(port()));
    if (input === null) return;
    const n = Number(input);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      alert('端口无效');
      return;
    }
    GM_setValue(BRIDGE_PORT_KEY, n);
    toast(`端口已改为 ${n}`);
  });

  GM_registerMenuCommand('立即轮询一次任务', poll);

  setInterval(poll, POLL_INTERVAL);
  poll();
})();
