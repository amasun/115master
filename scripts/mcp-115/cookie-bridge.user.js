// ==UserScript==
// @name         115 MCP Cookie Bridge
// @name:zh-CN   115 MCP Cookie 桥
// @namespace    115-mcp-cookie-bridge
// @version      0.2.0
// @description  Standalone helper: reads 115 login cookies and pushes them to a local MCP server bridge (http://127.0.0.1:26315/cookie). Independent of any other userscript.
// @description:zh-CN  独立辅助脚本：读取 115 登录 Cookie 并推送给本地 MCP 服务器桥（http://127.0.0.1:26315/cookie）。不依赖任何其他脚本。
// @author       you
// @match        https://115.com/*
// @match        https://*.115.com/*
// @connect      127.0.0.1
// @connect      localhost
// @grant        GM_cookie
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
  const REQUIRED = ['UID', 'CID', 'SEID'];

  function port() {
    return Number(GM_getValue(BRIDGE_PORT_KEY, 26315));
  }

  function bridgeUrl() {
    return `http://127.0.0.1:${port()}/cookie`;
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

  function sendCookie(cookie) {
    GM_xmlhttpRequest({
      method: 'POST',
      url: bridgeUrl(),
      headers: { 'content-type': 'application/json' },
      data: JSON.stringify({ cookie }),
      timeout: 5000,
      onload(res) {
        try {
          const body = JSON.parse(res.responseText);
          if (body.ok) toast(`Cookie 已推送到本地 MCP 桥（端口 ${port()}）`);
          else toast(`推送被拒绝：${body.error || res.responseText}`, false);
        } catch (e) {
          toast(`本地桥响应异常：${e.message}`, false);
        }
      },
      onerror() {
        toast(`本地桥不可达（http://127.0.0.1:${port()}）。请确认 MCP server 正在运行。`, false);
      },
      ontimeout() {
        toast('本地桥连接超时，请确认 MCP server 正在运行。', false);
      },
    });
  }

  function collect(silent) {
    GM_cookie.list({ domain: '115.com' }, (cookies, error) => {
      if (error) {
        toast(`GM_cookie 读取失败：${error}`, false);
        return;
      }
      const names = cookies.map((c) => c.name);
      if (!REQUIRED.every((k) => names.includes(k))) {
        if (!silent) toast('未找到完整的 UID/CID/SEID，请确认已在浏览器登录 115', false);
        return;
      }
      const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      sendCookie(cookie);
    });
  }

  GM_registerMenuCommand('推送 Cookie 到本地 MCP 桥', () => collect(false));

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

  // 打开 115 页面即推送一次；之后每 30 分钟刷新一次，防登录态轮换
  collect(true);
  setInterval(() => collect(true), 30 * 60 * 1000);
})();
