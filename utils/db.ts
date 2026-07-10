import { DBConfig, HistoryItem, WatchEvent, WatchEventSource } from "./types";
import { formatDateKey, TimeZonePreference } from "./timezone";

const DB_CONFIG: DBConfig = {
  name: "bilibiliHistory",
  version: 7,
  stores: {
    history: {
      keyPath: "id",
      indexes: ["view_at"],
    },
    watchEvents: {
      keyPath: "event_id",
      indexes: ["view_at", "history_id", "business"],
    },
  },
};

const REMOVED_STORES = ["likedMusic", "favFolders", "favResources"] as const;

export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction;
      const oldVersion = event.oldVersion;

      if (!db.objectStoreNames.contains("history")) {
        const historyStore = db.createObjectStore("history", { keyPath: "id" });
        historyStore.createIndex("view_at", "view_at", { unique: false });
      }

      if (!db.objectStoreNames.contains("watchEvents")) {
        const watchEventStore = db.createObjectStore("watchEvents", { keyPath: "event_id" });
        watchEventStore.createIndex("view_at", "view_at", { unique: false });
        watchEventStore.createIndex("history_id", "history_id", { unique: false });
        watchEventStore.createIndex("business", "business", { unique: false });
      }

      if (!transaction) return;

      const historyStore = transaction.objectStore("history");
      const watchEventStore = transaction.objectStore("watchEvents");
      if (historyStore.indexNames.contains("viewTime")) {
        historyStore.deleteIndex("viewTime");
      }
      if (!historyStore.indexNames.contains("view_at")) {
        historyStore.createIndex("view_at", "view_at", { unique: false });
      }
      if (!watchEventStore.indexNames.contains("view_at")) {
        watchEventStore.createIndex("view_at", "view_at", { unique: false });
      }
      if (!watchEventStore.indexNames.contains("history_id")) {
        watchEventStore.createIndex("history_id", "history_id", { unique: false });
      }
      if (!watchEventStore.indexNames.contains("business")) {
        watchEventStore.createIndex("business", "business", { unique: false });
      }

      if (oldVersion > 0 && oldVersion < 2) {
        const getAllRequest = historyStore.getAll();
        getAllRequest.onsuccess = () => {
          getAllRequest.result.forEach((record: any) => {
            if (record.viewTime !== undefined && record.view_at === undefined) {
              historyStore.put({
                ...record,
                view_at: record.viewTime,
                viewTime: undefined,
              });
            }
          });
        };
      }

      if (oldVersion > 0 && oldVersion < 7) {
        const getAllRequest = historyStore.getAll();
        getAllRequest.onsuccess = () => {
          getAllRequest.result.forEach((record: HistoryItem & { viewTime?: number }) => {
            const viewAt = record.view_at ?? record.viewTime;
            if (!record?.id || !viewAt) return;
            watchEventStore.put(createWatchEvent({ ...record, view_at: viewAt }, "migration"));
          });
        };
      }

      for (const storeName of REMOVED_STORES) {
        if (db.objectStoreNames.contains(storeName)) {
          db.deleteObjectStore(storeName);
        }
      }
    };
  });
};

export const buildWatchEventId = (
  business: string | undefined,
  historyId: number | string,
  viewAt: number | string,
) => `${business || "archive"}:${historyId}:${viewAt}`;

export const createWatchEvent = (
  item: HistoryItem,
  source: WatchEventSource = "history_cursor",
): WatchEvent => {
  const historyId = Number(item.id);
  const viewAt = Number(item.view_at);

  return {
    event_id: buildWatchEventId(item.business, historyId, viewAt),
    history_id: historyId,
    business: item.business || "archive",
    bvid: item.bvid || "",
    cid: item.cid,
    title: item.title || "",
    tag_name: item.tag_name,
    cover: item.cover || "",
    view_at: viewAt,
    uri: item.uri,
    author_name: item.author_name || "",
    author_mid: item.author_mid,
    progress: item.progress,
    duration: item.duration,
    is_fav: item.is_fav,
    source,
    recorded_at: item.timestamp || Date.now(),
  };
};

export const putHistoryAndWatchEvent = (
  historyStore: IDBObjectStore,
  watchEventStore: IDBObjectStore,
  item: HistoryItem,
  source: WatchEventSource = "history_cursor",
) => {
  historyStore.put(item);
  watchEventStore.put(createWatchEvent(item, source));
};

const runTransaction = (tx: IDBTransaction): Promise<void> => {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

export const saveHistory = async (history: HistoryItem[]): Promise<void> => {
  if (history.length === 0) return;

  const db = await openDB();
  const tx = db.transaction(["history", "watchEvents"], "readwrite");
  const historyStore = tx.objectStore("history");
  const watchEventStore = tx.objectStore("watchEvents");

  history.forEach((item) => {
    putHistoryAndWatchEvent(historyStore, watchEventStore, item, "import");
  });

  await runTransaction(tx);
};

export const saveWatchEvents = async (events: WatchEvent[]): Promise<void> => {
  if (events.length === 0) return;

  const db = await openDB();
  const tx = db.transaction("watchEvents", "readwrite");
  const store = tx.objectStore("watchEvents");

  events.forEach((event) => {
    store.put(event);
  });

  await runTransaction(tx);
};

const matchBusinessType = (item: HistoryItem, businessType: string) => {
  if (!businessType || businessType === "all") return true;
  if (businessType === "article") {
    return item.business === "article" || item.business === "article-list";
  }
  return item.business === businessType;
};

const matchDate = (
  item: HistoryItem,
  dateRange: { start: string; end: string } | null,
  timeZone: TimeZonePreference,
) => {
  if (!dateRange?.start) return true;

  const dateStr = formatDateKey(Number(item.view_at) * 1000, timeZone);
  if (!dateRange.end) return dateStr === dateRange.start;
  return dateStr >= dateRange.start && dateStr <= dateRange.end;
};

const matchKeyword = (
  item: HistoryItem,
  keyword: string,
  searchType: "all" | "title" | "up" | "bvid" | "avid" = "all",
) => {
  const value = keyword.trim().toLowerCase();
  if (!value) return true;

  const title = item.title?.toLowerCase() || "";
  const authorName = item.author_name?.toLowerCase() || "";
  const bvid = item.bvid?.toLowerCase() || "";
  const authorMid = item.author_mid ? String(item.author_mid).toLowerCase() : "";
  const avid = item.id ? String(item.id) : "";

  switch (searchType) {
    case "title":
      return title.includes(value);
    case "up":
      return authorName.includes(value) || authorMid.includes(value);
    case "bvid":
      return bvid.includes(value);
    case "avid":
      return avid.includes(value);
    case "all":
    default:
      return (
        title.includes(value) ||
        authorName.includes(value) ||
        bvid.includes(value) ||
        authorMid.includes(value) ||
        avid.includes(value)
      );
  }
};

const matchCondition = (
  item: HistoryItem,
  keyword: string,
  dateRange: { start: string; end: string } | null,
  businessType: string,
  searchType: "all" | "title" | "up" | "bvid" | "avid" = "all",
  timeZone: TimeZonePreference = "system",
) => {
  return (
    matchKeyword(item, keyword, searchType) &&
    matchDate(item, dateRange, timeZone) &&
    matchBusinessType(item, businessType)
  );
};

export const getTotalHistoryCount = async (): Promise<number> => {
  const db = await openDB();
  const tx = db.transaction("history", "readonly");
  const store = tx.objectStore("history");

  return new Promise<number>((resolve, reject) => {
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getHistory = async (
  lastViewTime: number | "" = "",
  pageSize: number = 20,
  keyword: string = "",
  dateRange: { start: string; end: string } | null = null,
  businessType: string = "",
  searchType: "all" | "title" | "up" | "bvid" | "avid" = "all",
  timeZone: TimeZonePreference = "system",
): Promise<{ items: HistoryItem[]; hasMore: boolean }> => {
  const db = await openDB();
  const tx = db.transaction("history", "readonly");
  const store = tx.objectStore("history");
  const index = store.index("view_at");
  const range = lastViewTime ? IDBKeyRange.upperBound(lastViewTime, true) : null;

  return new Promise((resolve, reject) => {
    const request = index.openCursor(range, "prev");
    const items: HistoryItem[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor) {
        resolve({ items, hasMore: false });
        return;
      }

      if (items.length >= pageSize) {
        resolve({ items, hasMore: true });
        return;
      }

      const item = cursor.value as HistoryItem;
      if (matchCondition(item, keyword, dateRange, businessType, searchType, timeZone)) {
        items.push(item);
      }
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
  });
};

export const getItem = (store: IDBObjectStore, key: IDBValidKey): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getAllWatchEvents = async (): Promise<WatchEvent[]> => {
  const db = await openDB();
  const tx = db.transaction("watchEvents", "readonly");
  const store = tx.objectStore("watchEvents");
  const index = store.index("view_at");

  return new Promise((resolve, reject) => {
    const request = index.openCursor(null, "prev");
    const items: WatchEvent[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor) {
        resolve(items);
        return;
      }

      items.push(cursor.value as WatchEvent);
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
  });
};

export const getAllHistory = async (limit?: number): Promise<HistoryItem[]> => {
  const db = await openDB();
  const tx = db.transaction("history", "readonly");
  const store = tx.objectStore("history");
  const index = store.index("view_at");

  return new Promise((resolve, reject) => {
    const request = index.openCursor(null, "prev");
    const items: HistoryItem[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor || (limit && items.length >= limit)) {
        resolve(items);
        return;
      }

      items.push(cursor.value as HistoryItem);
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
  });
};
