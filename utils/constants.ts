export const IS_SYNCING = "isSyncing";
export const SYNC_LOCK_STARTED_AT = "syncLockStartedAt";
export const HAS_FULL_SYNC = "hasFullSync";
export const LAST_FULL_SYNC = "lastFullSync";

export const SYNC_INTERVAL = "syncInterval";
export const SYNC_TIME_REMAIN = "syncTimeRemain";
export const SYNC_PROGRESS_HISTORY = "syncProgressHistory";
export const CLOUD_SYNC_CONFIG = "cloudSyncConfig";
export const CLOUD_SYNC_DEVICE_ID = "cloudSyncDeviceId";
export const CLOUD_SYNC_LAST_SYNC_AT = "cloudSyncLastSyncAt";

export const DATE_SELECTION_MODE = "date_selection_mode";
export const TIME_ZONE = "timeZone";
export const GRID_COLUMNS = "gridColumns";

export const THEME_MODE = "themeMode";

export const UPDATE_HISTORY = [
  {
    date: "2026-07-10",
    version: "2.0.1",
    changes: [
      "修复自动保存可能并发运行或卡在保存状态的问题",
      "普通更新改为回看最近 7 天，并每周自动完整校验一次",
      "新增 Safari 免费签名安装脚本和说明",
    ],
  },
  {
    date: "2026-07-10",
    version: "2.0.0",
    changes: ["全新定位为哔哩哔哩历史记录保存与分析工具", "新增观看分析、时区和可选云端同步"],
  },
] as const;
