import { getOfflineIcon, I } from '@/icons'

/** 新版页面控制条使用的 Phosphor 离线图标（常规 bold，开启态 fill）。 */
export const officialIcons = {
  eye: getOfflineIcon(I.PREVIEW_ON),
  eyeOff: getOfflineIcon(I.PREVIEW_OFF),
  close: getOfflineIcon(I.CLOSE),
  documentText: getOfflineIcon(I.DOCUMENT),
  documentTextActive: getOfflineIcon(I.DOCUMENT, true),
  person: getOfflineIcon(I.ACCOUNT),
  personActive: getOfflineIcon(I.ACCOUNT, true),
  settings: getOfflineIcon(I.SETTINGS),
  search: getOfflineIcon(I.SEARCH),
  rocket: getOfflineIcon(I.ROCKET_LAUNCH),
}
