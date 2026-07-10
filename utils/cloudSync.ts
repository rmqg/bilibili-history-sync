import {
  buildWatchEventId,
  getAllHistory,
  getAllWatchEvents,
  saveHistory,
  saveWatchEvents,
} from "./db";
import { HistoryItem, WatchEvent } from "./types";

export type CloudSyncConfig = {
  endpoint: string;
  token: string;
};

export type CloudSyncPayload = {
  version: 2;
  updated_at: string;
  device_id: string;
  history: HistoryItem[];
  watchEvents: WatchEvent[];
};

export type CloudSyncResult = {
  localHistoryCount: number;
  remoteHistoryCount: number;
  mergedHistoryCount: number;
  localWatchEventCount: number;
  remoteWatchEventCount: number;
  mergedWatchEventCount: number;
};

type FirefoxDataCollectionRequest = {
  data_collection: Array<"authenticationInfo" | "browsingActivity">;
};

export const requestCloudSyncDataConsent = async (): Promise<void> => {
  if (!import.meta.env.FIREFOX) return;

  const requestPermission = browser.permissions.request as unknown as (
    permissions: FirefoxDataCollectionRequest,
  ) => Promise<boolean>;
  const granted = await requestPermission({
    data_collection: ["authenticationInfo", "browsingActivity"],
  });

  if (!granted) {
    throw new Error("没有获得云端同步的数据传输权限，历史记录仍只保存在本机");
  }
};

const trimTrailingSlash = (value: string) => value.trim().replace(/\/+$/, "");

const normalizeEndpoint = (endpoint: string) => {
  const normalized = trimTrailingSlash(endpoint);
  if (!normalized) throw new Error("请先填写云端地址");
  if (!/^https:\/\//i.test(normalized)) {
    throw new Error("云端地址必须以 https:// 开头");
  }
  return normalized;
};

const normalizeToken = (token: string) => {
  const normalized = token.trim();
  if (!normalized) throw new Error("请先填写同步密钥");
  return normalized;
};

const buildHeaders = (token: string, contentType?: string) => ({
  ...(contentType ? { "Content-Type": contentType } : {}),
  Authorization: `Bearer ${normalizeToken(token)}`,
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object";

const normalizeHistoryRecord = (item: HistoryItem): HistoryItem => ({
  ...item,
  id: Number(item.id),
  view_at: Number(item.view_at),
  business: item.business || "archive",
  bvid: item.bvid || "",
  cover: item.cover || "",
  author_name: item.author_name || "",
  timestamp: item.timestamp || Date.now(),
});

const normalizeWatchEventRecord = (item: WatchEvent): WatchEvent => {
  const historyId = Number(item.history_id);
  const viewAt = Number(item.view_at);
  const business = item.business || "archive";

  return {
    ...item,
    event_id: item.event_id || buildWatchEventId(business, historyId, viewAt),
    history_id: historyId,
    view_at: viewAt,
    business,
    bvid: item.bvid || "",
    cover: item.cover || "",
    author_name: item.author_name || "",
    source: item.source || "import",
    recorded_at: item.recorded_at || Date.now(),
  };
};

const isHistoryRecord = (value: unknown): value is HistoryItem => {
  if (!isObject(value)) return false;
  return (
    Number.isFinite(Number(value.id)) &&
    Number.isFinite(Number(value.view_at)) &&
    typeof value.title === "string"
  );
};

const isWatchEventRecord = (value: unknown): value is WatchEvent => {
  if (!isObject(value)) return false;
  return (
    Number.isFinite(Number(value.history_id)) &&
    Number.isFinite(Number(value.view_at)) &&
    typeof value.title === "string"
  );
};

const normalizePayload = (value: unknown): CloudSyncPayload | null => {
  if (!isObject(value) || value.empty === true) return null;

  const historyInput = Array.isArray(value.history) ? value.history : [];
  const watchEventInput = Array.isArray(value.watchEvents) ? value.watchEvents : [];

  return {
    version: 2,
    updated_at:
      typeof value.updated_at === "string" && value.updated_at
        ? value.updated_at
        : new Date(0).toISOString(),
    device_id: typeof value.device_id === "string" ? value.device_id : "",
    history: historyInput.filter(isHistoryRecord).map(normalizeHistoryRecord),
    watchEvents: watchEventInput.filter(isWatchEventRecord).map(normalizeWatchEventRecord),
  };
};

const progressScore = (item: HistoryItem | WatchEvent) => {
  if (item.progress === -1) return Number.POSITIVE_INFINITY;
  const progress = Number(item.progress);
  return Number.isFinite(progress) ? progress : 0;
};

const pickHistoryRecord = (current: HistoryItem, incoming: HistoryItem) => {
  if (incoming.view_at !== current.view_at) {
    return incoming.view_at > current.view_at ? incoming : current;
  }

  const incomingTimestamp = Number(incoming.timestamp || 0);
  const currentTimestamp = Number(current.timestamp || 0);
  if (incomingTimestamp !== currentTimestamp) {
    return incomingTimestamp > currentTimestamp ? incoming : current;
  }

  return progressScore(incoming) > progressScore(current) ? incoming : current;
};

const pickWatchEvent = (current: WatchEvent, incoming: WatchEvent) => {
  const incomingRecordedAt = Number(incoming.recorded_at || 0);
  const currentRecordedAt = Number(current.recorded_at || 0);
  if (incomingRecordedAt !== currentRecordedAt) {
    return incomingRecordedAt > currentRecordedAt ? incoming : current;
  }

  return progressScore(incoming) > progressScore(current) ? incoming : current;
};

const mergePayloads = (
  local: CloudSyncPayload,
  remote: CloudSyncPayload | null,
): CloudSyncPayload => {
  if (!remote) return local;

  const historyMap = new Map<number, HistoryItem>();
  [...remote.history, ...local.history].forEach((item) => {
    const key = Number(item.id);
    if (!Number.isFinite(key)) return;
    const current = historyMap.get(key);
    historyMap.set(key, current ? pickHistoryRecord(current, item) : item);
  });

  const watchEventMap = new Map<string, WatchEvent>();
  [...remote.watchEvents, ...local.watchEvents].forEach((item) => {
    const key = item.event_id || buildWatchEventId(item.business, item.history_id, item.view_at);
    const normalizedItem = { ...item, event_id: key };
    const current = watchEventMap.get(key);
    watchEventMap.set(key, current ? pickWatchEvent(current, normalizedItem) : normalizedItem);
  });

  return {
    version: 2,
    updated_at: new Date().toISOString(),
    device_id: local.device_id,
    history: Array.from(historyMap.values()).sort((a, b) => b.view_at - a.view_at),
    watchEvents: Array.from(watchEventMap.values()).sort((a, b) => b.view_at - a.view_at),
  };
};

export const createLocalCloudPayload = async (deviceId: string): Promise<CloudSyncPayload> => {
  const [history, watchEvents] = await Promise.all([getAllHistory(), getAllWatchEvents()]);

  return {
    version: 2,
    updated_at: new Date().toISOString(),
    device_id: deviceId,
    history: history.map(normalizeHistoryRecord),
    watchEvents: watchEvents.map(normalizeWatchEventRecord),
  };
};

export class CloudSyncClient {
  private endpoint: string;
  private token: string;

  constructor(config: CloudSyncConfig) {
    this.endpoint = normalizeEndpoint(config.endpoint);
    this.token = normalizeToken(config.token);
  }

  async pull(): Promise<CloudSyncPayload | null> {
    const response = await fetch(this.endpoint, {
      method: "GET",
      headers: buildHeaders(this.token),
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`云端返回 ${response.status}，请检查地址和密钥`);
    }

    const payload = await response.json();
    return normalizePayload(payload);
  }

  async push(payload: CloudSyncPayload): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: "PUT",
      headers: buildHeaders(this.token, "application/json"),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`上传失败：云端返回 ${response.status}`);
    }
  }

  async ping(): Promise<void> {
    await this.pull();
  }

  async deleteRemoteData(): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: "DELETE",
      headers: buildHeaders(this.token),
    });

    if (!response.ok) {
      throw new Error(`删除失败：云端返回 ${response.status}`);
    }
  }
}

export const runCloudSync = async (
  config: CloudSyncConfig,
  deviceId: string,
): Promise<CloudSyncResult> => {
  const client = new CloudSyncClient(config);
  const localPayload = await createLocalCloudPayload(deviceId);
  const remotePayload = await client.pull();
  const mergedPayload = mergePayloads(localPayload, remotePayload);

  await saveHistory(mergedPayload.history);
  await saveWatchEvents(mergedPayload.watchEvents);
  await client.push(mergedPayload);

  return {
    localHistoryCount: localPayload.history.length,
    remoteHistoryCount: remotePayload?.history.length || 0,
    mergedHistoryCount: mergedPayload.history.length,
    localWatchEventCount: localPayload.watchEvents.length,
    remoteWatchEventCount: remotePayload?.watchEvents.length || 0,
    mergedWatchEventCount: mergedPayload.watchEvents.length,
  };
};
