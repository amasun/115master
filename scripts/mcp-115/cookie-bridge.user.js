// ==UserScript==
// @name         115Master MCP Cookie Bridge
// @namespace    115master-mcp
// @version      0.1.0
// @description  读取 115 登录 Cookie 并推送给本地 MCP 服务器（http://127.0.0.1:26315/cookie）
// @match        https://115.com/*
// @match        https://*.115.com/*
// @connect      127.0.0.1
// @connect      localhost
// @grant        GM_cookie
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const BRIDGE = 'http://127.0.0.1:26315/cookie';

  function sendCookie(cookie) {
    GM_xmlhttpRequest({
      method: 'POST',
      url: BRIDGE,
      headers: { 'content-type': 'application/json' },
      data: JSON.stringify({ cookie }),
      onload(res) {
        try {
          const body = JSON.parse(res.responseText);
          if (body.ok) console.info('[115-mcp] Cookie 已推送到本地桥', body.savedTo);
          else console.warn('[115-mcp] 推送被拒:', body.error);
        } catch (e) {
          console.warn('[115-mcp] 本地桥响应异常:', e);
        }
      },
      onerror() {
        console.warn('[115-mcp] 本地桥不可达（MCP 服务器未运行？）');
      },
    });
  }

  function collect() {
    GM_cookie.list({ domain: '115.com' }, (cookies, error) => {
      if (error) {
        console.warn('[115-mcp] GM_cookie 读取失败:', error);
        return;
      }
      const map = {};
      for (const c of cookies) map[c.name] = c.value;
      const needed = ['UID', 'CID', 'SEID'].every((k) => map[k]);
      if (!needed) {
        console.warn('[115-mcp] 未找到完整的 UID/CID/SEID，请确认已在浏览器登录 115');
        return;
      }
      const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      sendCookie(cookie);
    });
  }

  // 打开 115 页面即推送一次；之后每 30 分钟刷新一次，防登录态轮换
  collect();
  setInterval(collect, 30 * 60 * 1000);
})();
