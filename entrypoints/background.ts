import {
  HAS_FULL_SYNC,
  IS_SYNCING,
  SYNC_INTERVAL,
  SYNC_PROGRESS_HISTORY,
  SYNC_TIME_REMAIN,
} from "../utils/constants";
import { openDB, putHistoryAndWatchEvent } from "../utils/db";
import { getStorageValue, setStorageValue } from "../utils/storage";
import { HistoryItem } from "../utils/types";

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; name?: unknown };
    const message = typeof record.message === "string" ? record.message : "";
    const name = typeof record.name === "string" ? record.name : "";
    if (message && name) return `${name}: ${message}`;
    if (message) return message;
    if (name) return name;

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return "未知原因";
};

const getSessdataCookie = async () => {
  const queries: Browser.cookies.GetAllDetails[] = [
    { url: "https://www.bilibili.com/" },
    { url: "https://api.bilibili.com/" },
    { domain: "bilibili.com" },
    { domain: ".bilibili.com" },
  ];

  for (const query of queries) {
    try {
      const cookies = await browser.cookies.getAll(query);
      const sessdata = cookies.find((cookie) => cookie.name === "SESSDATA")?.value;
      if (sessdata) return sessdata;
    } catch (error) {
      console.warn("读取哔哩哔哩登录信息失败:", query, error);
    }
  }

  return "";
};

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async (details) => {
    browser.alarms.create("syncHistory", {
      periodInMinutes: 1,
    });

    if (details.reason === "install") {
      browser.tabs.create({ url: browser.runtime.getURL("/my-history.html") });
      await setStorageValue(SYNC_PROGRESS_HISTORY, {
        current: 0,
        message: "请先登录哔哩哔哩网页版，然后在扩展弹窗里保存历史记录",
      });
    }
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== "syncHistory") return;

    const syncInterval = await getStorageValue(SYNC_INTERVAL, 1);
    const syncRemain = await getStorageValue(SYNC_TIME_REMAIN, syncInterval);
    const currentSyncRemain = syncRemain - 1;

    if (currentSyncRemain > 0) {
      await setStorageValue(SYNC_TIME_REMAIN, currentSyncRemain);
      return;
    }

    intervalSync(syncInterval);
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "syncHistory") {
      handleSyncHistory(message)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({ success: false, error: getErrorMessage(error) });
        });
      return true;
    }

    return false;
  });

  const intervalSync = async (syncInterval: number) => {
    try {
      const isSyncing = await getStorageValue(IS_SYNCING);
      if (isSyncing) return;

      const hasFullSync = await getStorageValue(HAS_FULL_SYNC, false);
      if (!hasFullSync) {
        await setStorageValue(SYNC_TIME_REMAIN, syncInterval);
        return;
      }

      await setStorageValue(IS_SYNCING, true);
      await setStorageValue(SYNC_PROGRESS_HISTORY, {
        current: 0,
        message: "正在检查有没有新的历史记录...",
      });
      await syncHistory(false);
    } catch (error) {
      console.error("定时读取失败:", error);
    } finally {
      await setStorageValue(IS_SYNCING, false);
      await setStorageValue(SYNC_PROGRESS_HISTORY, { current: 0, message: "检查完成" });
      await setStorageValue(SYNC_TIME_REMAIN, syncInterval);
    }
  };

  const handleSyncHistory = async (message: any) => {
    try {
      const isSyncing = await getStorageValue(IS_SYNCING);
      if (isSyncing) {
        return { success: false, error: "正在保存，请等这次结束后再试" };
      }

      await setStorageValue(IS_SYNCING, true);
      await setStorageValue(SYNC_PROGRESS_HISTORY, {
        current: 0,
        message: "正在连接哔哩哔哩，并保存历史记录...",
      });

      const forceFullSync = message.isFullSync || false;
      const hasFullSync = await getStorageValue(HAS_FULL_SYNC, false);

      if (forceFullSync || !hasFullSync) {
        await syncHistory(true);
        await setStorageValue(HAS_FULL_SYNC, true);
        return {
          success: true,
          message: hasFullSync ? "全部历史记录已保存，可以打开记录页面查看" : "第一次保存完成",
        };
      }

      await syncHistory(false);
      return { success: true, message: "更新完成，最近 3 天的历史记录已重新检查" };
    } catch (error) {
      console.error("保存失败:", error);
      return { success: false, error: getErrorMessage(error) };
    } finally {
      await setStorageValue(IS_SYNCING, false);
      await setStorageValue(SYNC_PROGRESS_HISTORY, { current: 0, message: "保存完成" });
    }
  };

  async function syncHistory(isFullSync = false): Promise<boolean> {
    try {
      const SESSDATA = await getSessdataCookie();

      if (!SESSDATA) {
        throw new Error(
          "没有检测到登录状态。请先在这个浏览器打开哔哩哔哩网页版并登录，然后再回来保存历史记录。",
        );
      }

      let hasMore = true;
      let max = 0;
      let view_at = 0;
      const type = "all";
      const ps = 30;
      let totalSynced = 0;
      const syncStartedAt = Date.now();
      const previousSync = await browser.storage.local.get("lastSync");
      const previousSyncAt = Number(previousSync.lastSync) || 0;
      const recentRescanCutoff = Math.floor((previousSyncAt - 72 * 60 * 60 * 1000) / 1000);
      const visitedCursors = new Set<string>();

      while (hasMore) {
        const cursorKey = `${max}:${view_at}`;
        if (visitedCursors.has(cursorKey)) {
          throw new Error("哔哩哔哩返回了重复的历史记录页面，请稍后再试");
        }
        visitedCursors.add(cursorKey);

        const response = await fetch(
          `https://api.bilibili.com/x/web-interface/history/cursor?max=${max}&view_at=${view_at}&type=${type}&ps=${ps}`,
          {
            credentials: "include",
          },
        );

        if (!response.ok) {
          throw new Error("保存历史记录失败，请稍后再试");
        }

        const data = await response.json();
        if (data.code !== 0) {
          throw new Error(data.message || "保存历史记录失败，请稍后再试");
        }

        hasMore = data.data.list.length > 0;
        max = data.data.cursor.max;
        view_at = data.data.cursor.view_at;

        if (data.data.list.length > 0) {
          const db = await openDB();

          const tx = db.transaction(["history", "watchEvents"], "readwrite");
          const historyStore = tx.objectStore("history");
          const watchEventStore = tx.objectStore("watchEvents");

          for (const item of data.data.list) {
            const historyItem: HistoryItem = {
              id: item.history.oid,
              business: item.history.business,
              bvid: item.history.bvid,
              cid: item.history.cid,
              title: item.title,
              tag_name: item.tag_name,
              cover: item.cover || (item.covers && item.covers[0]),
              view_at: item.view_at,
              uri: item.uri,
              author_name: item.author_name || "",
              author_mid: item.author_mid || "",
              progress: item.progress,
              duration: item.duration,
              is_fav: item.is_fav === 1,
              timestamp: Date.now(),
            };

            putHistoryAndWatchEvent(historyStore, watchEventStore, historyItem);
          }

          totalSynced += data.data.list.length;
          await setStorageValue(SYNC_PROGRESS_HISTORY, {
            current: totalSynced,
            message: `正在检查并更新，已经检查 ${totalSynced} 条记录`,
          });

          await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          });

          await new Promise((resolve) => setTimeout(resolve, 1000));

          if (!isFullSync && previousSyncAt > 0) {
            const oldestViewAt = Math.min(
              ...data.data.list.map((item: { view_at: number }) => Number(item.view_at)),
            );
            if (oldestViewAt <= recentRescanCutoff) {
              hasMore = false;
            }
          }
        }
      }

      await browser.storage.local.set({ lastSync: syncStartedAt });
      await setStorageValue(SYNC_PROGRESS_HISTORY, {
        current: totalSynced,
        message:
          totalSynced > 0
            ? isFullSync
              ? `保存完成，本次检查并保存了 ${totalSynced} 条记录`
              : `保存完成，已重新检查最近 3 天的 ${totalSynced} 条记录`
            : "保存完成，没有发现新的历史记录",
      });

      return true;
    } catch (error) {
      console.error("保存历史记录失败:", error);
      const message = getErrorMessage(error);
      await setStorageValue(SYNC_PROGRESS_HISTORY, {
        current: 0,
        message: `保存失败：${message}`,
      });
      throw error;
    }
  }
});
