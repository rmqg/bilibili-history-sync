export const IS_SYNCING = "isSyncing";
export const HAS_FULL_SYNC = "hasFullSync";

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
    version: "2.0.0",
    changes: ["全新定位为哔哩哔哩历史记录保存与分析工具", "新增观看分析、时区和可选云端同步"],
  },
] as const;
