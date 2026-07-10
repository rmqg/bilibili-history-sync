export type HistoryBusiness =
  "archive" | "pgc" | "article" | "article-list" | "live" | "cheese" | (string & {});

export interface HistoryItem {
  id: number;
  business: HistoryBusiness;
  bvid: string;
  cid?: number | string;
  title: string;
  tag_name?: string;
  cover: string;
  view_at: number;
  uri?: string;
  author_name: string;
  author_mid?: number | string;
  progress?: number;
  duration?: number;
  is_fav?: boolean;
  timestamp?: number;
}

export type WatchEventSource = "history_cursor" | "migration" | "import";

export interface WatchEvent {
  event_id: string;
  history_id: number;
  business: HistoryBusiness;
  bvid: string;
  cid?: number | string;
  title: string;
  tag_name?: string;
  cover: string;
  view_at: number;
  uri?: string;
  author_name: string;
  author_mid?: number | string;
  progress?: number;
  duration?: number;
  is_fav?: boolean;
  source?: WatchEventSource;
  recorded_at?: number;
}

export interface DBConfig {
  name: string;
  version: number;
  stores: {
    history: {
      keyPath: string;
      indexes: string[];
    };
    watchEvents: {
      keyPath: string;
      indexes: string[];
    };
  };
}

export interface SyncResponse {
  code: number;
  message: string;
  data: {
    list: HistoryItem[];
    has_more: boolean;
  };
}
