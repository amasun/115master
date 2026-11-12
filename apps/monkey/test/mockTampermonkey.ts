export const unsafeWindow = globalThis.window || globalThis
export const GM_info = { script: { version: '1.0.0', name: '115master' } }
export const GM_getValue = (_key: string, defaultValue?: any) => defaultValue
export function GM_setValue() {}
export function GM_deleteValue() {}
export const GM_listValues = () => []
export const GM_addValueChangeListener = () => 0
export function GM_removeValueChangeListener() {}
export function GM_openInTab() {}
export function GM_setClipboard() {}
export function GM_notification() {}
export const GM_cookie = { list: () => Promise.resolve([]) }
export function GM_xmlhttpRequest() {}

export default {
  unsafeWindow,
  GM_info,
  GM_getValue,
  GM_setValue,
  GM_deleteValue,
  GM_listValues,
  GM_addValueChangeListener,
  GM_removeValueChangeListener,
  GM_openInTab,
  GM_setClipboard,
  GM_notification,
  GM_cookie,
  GM_xmlhttpRequest,
}
