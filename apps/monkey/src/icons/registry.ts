/**
 * 图标注册表
 * - ph:<name>-bold / ph:<name>-fill  委托给 @iconify/vue 渲染（常规用 bold，选中/实心用 fill）
 * - custom:<name>                    动态加载 ./custom/<name>.svg
 */

export const I = {
  // === 动作 / 导航 ===
  RESTART: 'ph:arrows-clockwise-bold',
  SETTINGS: 'ph:gear-bold',
  ACCOUNT: 'ph:user-circle-bold',
  LOGOUT: 'ph:sign-out-bold',
  CLOSE: 'ph:x-bold',
  RIGHT: 'ph:caret-right-bold',
  LEFT: 'ph:caret-left-bold',
  MENU: 'ph:list-bold',
  COPY: 'ph:copy-bold',
  DOWNLOAD: 'ph:download-simple-bold',
  DELETE: 'ph:trash-bold',
  BACKSPACE: 'ph:backspace-bold',
  CANCEL: 'ph:x-circle-bold',
  TOP: 'ph:push-pin-bold',
  TOP_SOLID: 'ph:push-pin-fill',
  MOVE: 'ph:arrow-right-bold',
  RENAME: 'ph:pencil-simple-line-bold',
  EXPORT: 'ph:export-bold',
  IMPORT: 'ph:sign-in-bold',
  VIEW: 'ph:eye-bold',
  PREVIEW_OFF: 'ph:eye-slash-bold',
  PREVIEW_ON: 'ph:eye-fill',
  PLUS: 'ph:plus-bold',
  RESET: 'ph:arrows-clockwise-bold',
  RESET_ALL: 'ph:arrow-counter-clockwise-bold',
  BACK_DIR: 'ph:arrow-left-bold',
  CHEVRON_DOWN: 'ph:caret-circle-down-bold',
  EMPTY: 'ph:cube-bold',

  // === 媒体控制 ===
  PLAY: 'ph:play-bold',
  PAUSE: 'ph:pause-bold',
  PREV: 'ph:skip-back-bold',
  NEXT: 'ph:skip-forward-bold',
  FAST_FORWARD: 'ph:fast-forward-bold',
  FAST_REWIND: 'ph:rewind-bold',
  FULLSCREEN: 'ph:corners-out-bold',
  FULLSCREEN_EXIT: 'ph:corners-in-bold',
  THEATRE: 'ph:rectangle-bold',
  THEATRE_EXIT: 'ph:browsers-bold',
  VOLUME_OFF: 'ph:speaker-none-bold',
  VOLUME_MUTE: 'ph:speaker-slash-bold',
  VOLUME_DOWN: 'ph:speaker-low-bold',
  VOLUME_UP: 'ph:speaker-high-bold',
  PIP: 'ph:picture-in-picture-bold',
  PIP_EXIT: 'ph:arrow-square-up-left-bold',
  SUBTITLES: 'ph:closed-captioning-bold',
  SUBTITLES_OFF: 'ph:closed-captioning-bold',
  PLAYLIST: 'ph:playlist-bold',

  // === 媒体显示 ===
  PLAYER_CORE: 'ph:code-bold',
  AUDIO_TRACK: 'ph:music-notes-bold',
  TRANSFORM: 'ph:repeat-bold',
  ROTATE_LEFT: 'ph:arrow-counter-clockwise-bold',
  ROTATE_RIGHT: 'ph:arrow-clockwise-bold',
  ROTATE_NORMAL: 'ph:minus-circle-bold',
  ROTATE: 'ph:arrows-clockwise-bold',
  FLIP_X: 'ph:flip-horizontal-bold',
  FLIP_Y: 'ph:flip-vertical-bold',
  LOCATION_ON: 'ph:crosshair-bold',
  TIMER: 'ph:timer-bold',
  PLAYBACK_RATE: 'ph:gauge-bold',
  MARKER: 'ph:bookmark-simple-bold',
  STATISTICS_INFO: 'ph:chart-bar-bold',
  SHORTCUTS: 'ph:keyboard-bold',
  ABOUT: 'ph:info-bold',
  COLOR_ADJUST: 'ph:palette-bold',
  LOADING: 'ph:circle-notch-bold',
  ERROR: 'ph:bug-bold',
  AUTO_LOAD: 'ph:arrows-clockwise-bold',
  ROCKET_LAUNCH: 'ph:rocket-launch-bold',
  MORE: 'ph:dots-three-vertical-bold',
  EXTENSION: 'ph:puzzle-piece-bold',
  WINDOW: 'ph:monitor-bold',
  QUALITY: 'ph:disc-bold',
  ARROW_UP: 'ph:arrow-up-bold',
  ARROW_DOWN: 'ph:arrow-down-bold',
  SORT: 'ph:sliders-horizontal-bold',
  BACK_DIR_ARROW: 'ph:arrow-circle-left-bold',

  // === 通知 / Toast ===
  TOAST_SUCCESS: 'ph:check-circle-bold',
  TOAST_ERROR: 'ph:bug-bold',
  TOAST_WARNING: 'ph:warning-bold',
  TOAST_INFO: 'ph:info-bold',
  TOAST_CLOSE: 'ph:x-bold',

  // === 主题 ===
  THEME_LIGHT: 'ph:sun-bold',
  THEME_DARK: 'ph:moon-bold',
  THEME_SYSTEM: 'ph:circle-half-bold',

  // === 文件 ===
  ALL_FILE: 'ph:files-bold',
  FILE_FOLDER: 'custom:folder',
  FILE_IMAGE: 'custom:image-file',
  FILE_VIDEO: 'ph:film-slate-bold',
  FILE_IMPROVE: 'ph:arrow-up-bold',

  // === 标签 ===
  TAG: 'ph:tag-bold',
  SELECT_ALL: 'ph:checks-bold',
  INVERT: 'ph:arrows-down-up-bold',

  // === 品牌 ===
  GITHUB: 'ph:github-logo-bold',
  SPONSOR: 'ph:coffee-bold',

  // === 通用 ===
  SEARCH: 'ph:magnifying-glass-bold',
  HISTORY: 'ph:clock-bold',
  GRID: 'ph:squares-four-bold',
  LIST: 'ph:list-bullets-bold',
  NEW_FOLDER: 'ph:folder-plus-bold',
  FOLDER_OPEN: 'ph:folder-open-bold',
  DOCUMENT: 'ph:file-text-bold',
  STAR_RATING: 'ph:star-fill',
  UPLOAD: 'ph:cloud-arrow-up-bold',
  ADD_LINK: 'ph:link-bold',
  FLASK: 'ph:flask-bold',
  FILE_UPLOAD: 'ph:cloud-arrow-up-bold',
  LIBRARY: 'ph:film-strip-bold',
  PEOPLE: 'ph:users-bold',
  FILTER: 'ph:funnel-bold',
  CALENDAR: 'ph:calendar-blank-bold',

  // === 上下文 ===
  QA: 'ph:question-bold',
  STAR_FILL: 'ph:star-fill',
  STAR: 'ph:star-bold',
  HEART: 'ph:heart-bold',
  HEART_FILL: 'ph:heart-fill',

  // === 排序 ===
  SORT_HISTORY: 'ph:file-bold',
  SORT_EDIT_CALENDAR: 'ph:calendar-check-bold',
  SORT_SCHEDULE: 'ph:clock-counter-clockwise-bold',
  SORT_ALPHA: 'ph:text-aa-bold',
  SORT_DATABASE: 'ph:hard-drives-bold',
} as const

export type IconValue = (typeof I)[keyof typeof I]
