import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Cloud,
  CloudOff,
  Clock,
  Download,
  Globe2,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  CloudSyncClient,
  CloudSyncConfig,
  requestCloudSyncDataConsent,
  runCloudSync,
} from "../utils/cloudSync";
import { buildWatchEventId, saveHistory, saveWatchEvents } from "../utils/db";
import { exportHistoryToCSV, exportHistoryToJSON } from "../utils/export";
import { getStorageValue, removeStorageValue, setStorageValue } from "../utils/storage";
import { HistoryItem, WatchEvent } from "../utils/types";
import {
  CLOUD_SYNC_CONFIG,
  CLOUD_SYNC_DEVICE_ID,
  CLOUD_SYNC_LAST_SYNC_AT,
  DATE_SELECTION_MODE,
  SYNC_INTERVAL,
  SYNC_PROGRESS_HISTORY,
  TIME_ZONE,
} from "../utils/constants";
import {
  formatDateTime,
  getSystemTimeZone,
  TIME_ZONE_OPTIONS,
  TimeZonePreference,
} from "../utils/timezone";

type SyncProgress = {
  current: number;
  message: string;
};

type HistoryBackup = {
  history: unknown[];
  watchEvents?: unknown[];
};

const cloudflareWorkerCode = `export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Content-Type": "application/json; charset=utf-8",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const auth = request.headers.get("Authorization") || "";
    if (auth !== \`Bearer \${env.SYNC_TOKEN}\`) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: cors,
      });
    }

    if (request.method === "GET") {
      const value = await env.BILI_HISTORY_SYNC.get("history.json");
      return new Response(value || JSON.stringify({ empty: true }), { headers: cors });
    }

    if (request.method === "PUT") {
      const body = await request.text();
      await env.BILI_HISTORY_SYNC.put("history.json", body);
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    if (request.method === "DELETE") {
      await env.BILI_HISTORY_SYNC.delete("history.json");
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: cors,
    });
  },
};`;

const sectionClass =
  "w-full max-w-2xl rounded-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 shadow-sm";

const isHistoryRecord = (value: unknown): value is HistoryItem => {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<HistoryItem>;
  return (
    Number.isFinite(Number(record.id)) &&
    Number.isFinite(Number(record.view_at)) &&
    typeof record.title === "string"
  );
};

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

const isWatchEventRecord = (value: unknown): value is WatchEvent => {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<WatchEvent>;
  return (
    Number.isFinite(Number(record.history_id)) &&
    Number.isFinite(Number(record.view_at)) &&
    typeof record.title === "string"
  );
};

const isHistoryBackup = (value: unknown): value is HistoryBackup => {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as Partial<HistoryBackup>).history) &&
    ((value as Partial<HistoryBackup>).watchEvents === undefined ||
      Array.isArray((value as Partial<HistoryBackup>).watchEvents))
  );
};

const normalizeWatchEventRecord = (item: WatchEvent): WatchEvent => {
  const historyId = Number(item.history_id);
  const viewAt = Number(item.view_at);
  const business = item.business || "archive";
  const source =
    item.source === "history_cursor" || item.source === "migration" ? item.source : "import";

  return {
    ...item,
    event_id: item.event_id || buildWatchEventId(business, historyId, viewAt),
    history_id: historyId,
    view_at: viewAt,
    business,
    bvid: item.bvid || "",
    cover: item.cover || "",
    author_name: item.author_name || "",
    source,
    recorded_at: item.recorded_at || Date.now(),
  };
};

const getOrCreateDeviceId = async () => {
  const storedDeviceId = await getStorageValue<string>(CLOUD_SYNC_DEVICE_ID, "");
  if (storedDeviceId) return storedDeviceId;

  const nextDeviceId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await setStorageValue(CLOUD_SYNC_DEVICE_ID, nextDeviceId);
  return nextDeviceId;
};

const Settings = () => {
  const [syncInterval, setSyncInterval] = useState<number | string>(1);
  const [dateSelectionMode, setDateSelectionMode] = useState<"range" | "single">("range");
  const [timeZone, setTimeZone] = useState<TimeZonePreference>("system");
  const [historyProgress, setHistoryProgress] = useState<SyncProgress | null>(null);

  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [cloudEndpoint, setCloudEndpoint] = useState("");
  const [cloudToken, setCloudToken] = useState("");
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState("");
  const [isSavingCloudConfig, setIsSavingCloudConfig] = useState(false);
  const [isTestingCloud, setIsTestingCloud] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [isDeletingCloud, setIsDeletingCloud] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const [
        storedSyncInterval,
        storedDateMode,
        storedTimeZone,
        progress,
        cloudConfig,
        cloudSyncAt,
      ] = await Promise.all([
        getStorageValue(SYNC_INTERVAL, 1),
        getStorageValue(DATE_SELECTION_MODE, "range"),
        getStorageValue<TimeZonePreference>(TIME_ZONE, "system"),
        getStorageValue<SyncProgress | null>(SYNC_PROGRESS_HISTORY, null),
        getStorageValue<CloudSyncConfig | null>(CLOUD_SYNC_CONFIG, null),
        getStorageValue<string>(CLOUD_SYNC_LAST_SYNC_AT, ""),
      ]);

      setSyncInterval(storedSyncInterval);
      setDateSelectionMode(storedDateMode === "single" ? "single" : "range");
      setTimeZone(storedTimeZone || "system");
      setHistoryProgress(progress);
      setCloudEndpoint(cloudConfig?.endpoint || "");
      setCloudToken(cloudConfig?.token || "");
      setLastCloudSyncAt(cloudSyncAt || "");
    };

    loadSettings();

    const handleStorageChange = (
      changes: { [key: string]: Browser.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName !== "local" || !changes[SYNC_PROGRESS_HISTORY]) return;
      setHistoryProgress(changes[SYNC_PROGRESS_HISTORY].newValue as SyncProgress | null);
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => browser.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const handleSyncIntervalChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSyncInterval(value);

    const minutes = Number(value);
    if (Number.isFinite(minutes) && minutes >= 1) {
      await setStorageValue(SYNC_INTERVAL, minutes);
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      if (exportFormat === "csv") {
        await exportHistoryToCSV();
        toast.success("表格文件已导出");
      } else {
        await exportHistoryToJSON();
        toast.success("备份文件已导出");
      }
    } catch (error) {
      console.error("导出历史记录失败:", error);
      toast.error("导出失败，请稍后再试");
    } finally {
      setIsExporting(false);
    }
  };

  const getCloudConfigFromInput = (): CloudSyncConfig => ({
    endpoint: cloudEndpoint.trim(),
    token: cloudToken.trim(),
  });

  const handleSaveCloudConfig = async () => {
    try {
      setIsSavingCloudConfig(true);
      const config = getCloudConfigFromInput();
      if (!config.endpoint || !config.token) {
        toast.error("请先填写云端地址和同步密钥");
        return;
      }
      await setStorageValue(CLOUD_SYNC_CONFIG, config);
      toast.success("云端同步设置已保存");
    } catch (error) {
      console.error("保存云端同步设置失败:", error);
      toast.error("保存失败，请稍后再试");
    } finally {
      setIsSavingCloudConfig(false);
    }
  };

  const handleTestCloud = async () => {
    try {
      setIsTestingCloud(true);
      const config = getCloudConfigFromInput();
      await requestCloudSyncDataConsent();
      await new CloudSyncClient(config).ping();
      await setStorageValue(CLOUD_SYNC_CONFIG, config);
      toast.success("云端连接正常");
    } catch (error) {
      console.error("测试云端连接失败:", error);
      toast.error(error instanceof Error ? error.message : "连接失败，请检查地址和密钥");
    } finally {
      setIsTestingCloud(false);
    }
  };

  const handleCloudSync = async () => {
    try {
      setIsCloudSyncing(true);
      const config = getCloudConfigFromInput();
      await requestCloudSyncDataConsent();
      await setStorageValue(CLOUD_SYNC_CONFIG, config);

      const deviceId = await getOrCreateDeviceId();
      const result = await runCloudSync(config, deviceId);
      const syncedAt = new Date().toISOString();
      await setStorageValue(CLOUD_SYNC_LAST_SYNC_AT, syncedAt);
      setLastCloudSyncAt(syncedAt);

      toast.success(
        `同步完成：本机 ${result.localHistoryCount} 条，云端 ${result.remoteHistoryCount} 条，合并后 ${result.mergedHistoryCount} 条`,
      );
    } catch (error) {
      console.error("云端同步失败:", error);
      toast.error(error instanceof Error ? error.message : "同步失败，请稍后再试");
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const clearLocalCloudConfig = async () => {
    await Promise.all([
      removeStorageValue(CLOUD_SYNC_CONFIG),
      removeStorageValue(CLOUD_SYNC_DEVICE_ID),
      removeStorageValue(CLOUD_SYNC_LAST_SYNC_AT),
    ]);
    setCloudEndpoint("");
    setCloudToken("");
    setLastCloudSyncAt("");
  };

  const handleDisableCloudSync = async () => {
    await clearLocalCloudConfig();
    toast.success("已停用云端同步，并清除这台浏览器保存的地址和密钥");
  };

  const handleDeleteCloudData = async () => {
    const confirmed = window.confirm(
      "确定删除云端保存的 history.json 吗？本机历史记录不会被删除，此操作无法撤销。",
    );
    if (!confirmed) return;

    try {
      setIsDeletingCloud(true);
      const config = getCloudConfigFromInput();
      await requestCloudSyncDataConsent();
      await new CloudSyncClient(config).deleteRemoteData();
      await clearLocalCloudConfig();
      toast.success("云端记录已删除，云端同步也已停用");
    } catch (error) {
      console.error("删除云端记录失败:", error);
      toast.error(error instanceof Error ? error.message : "删除失败，请稍后再试");
    } finally {
      setIsDeletingCloud(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";

    fileInput.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) {
        setIsImporting(false);
        return;
      }

      try {
        const content = await file.text();
        const data = JSON.parse(content);
        const historyData = Array.isArray(data)
          ? data
          : isHistoryBackup(data)
            ? data.history
            : null;
        const watchEventData =
          !Array.isArray(data) && isHistoryBackup(data) ? data.watchEvents || [] : [];
        const historyRecords = historyData?.filter(isHistoryRecord) || [];
        const watchEventRecords = watchEventData.filter(isWatchEventRecord);

        if (
          !historyData ||
          historyRecords.length !== historyData.length ||
          watchEventRecords.length !== watchEventData.length
        ) {
          toast.error("这个文件不能恢复，请选择这个扩展导出的备份文件");
          return;
        }

        await saveHistory(historyRecords.map(normalizeHistoryRecord));
        await saveWatchEvents(watchEventRecords.map(normalizeWatchEventRecord));
        toast.success(`已恢复 ${historyData.length} 条记录`);
      } catch (error) {
        console.error("导入历史记录失败:", error);
        toast.error("恢复失败，请确认选择的是这个扩展导出的备份文件");
      } finally {
        setIsImporting(false);
      }
    };

    fileInput.click();
  };

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-[#0a0a0a] text-gray-900 dark:text-neutral-100 px-6 py-8 pb-20">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <header>
          <h1 className="text-2xl font-semibold tracking-normal">设置</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
            管理历史记录的自动保存、时区、日期筛选、备份和云端同步。默认只保存在这台电脑；只有主动使用云端同步时才会上传到你配置的云端。
          </p>
        </header>

        {historyProgress?.message && (
          <section className="w-full max-w-2xl rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">保存进度</p>
                <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                  {historyProgress.message}
                </p>
              </div>
              {historyProgress.current > 0 && (
                <span className="shrink-0 font-mono text-xs text-blue-700 dark:text-blue-300">
                  {historyProgress.current} 条
                </span>
              )}
            </div>
          </section>
        )}

        <section className={sectionClass}>
          <div className="border-b border-gray-200 p-5 dark:border-neutral-800">
            <h2 className="text-base font-semibold">自动保存历史记录</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
              扩展会定时检查哔哩哔哩有没有新的历史记录，并保存到这台电脑。它不会删除或修改你账号里的记录。
            </p>
          </div>

          <div className="flex flex-col gap-5 p-5">
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-sm font-medium">每隔几分钟检查一次</span>
                <span className="block text-xs text-gray-500 dark:text-neutral-400">
                  例如填 30，表示每 30 分钟检查一次。想立刻保存，可以点浏览器工具栏里的扩展图标。
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400 dark:text-neutral-500" />
                <input
                  type="number"
                  min="1"
                  value={syncInterval}
                  onChange={handleSyncIntervalChange}
                  className="w-24 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                />
              </span>
            </label>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="border-b border-gray-200 p-5 dark:border-neutral-800">
            <div className="flex items-start gap-3">
              <Globe2 className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div>
                <h2 className="text-base font-semibold">日期和时区</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
                  决定一条记录算在哪一天，也会影响记录时间、逐日分析和导出的观看时间。
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 p-5">
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-sm font-medium">使用的时区</span>
                <span className="block text-xs text-gray-500 dark:text-neutral-400">
                  当前设备时区：{getSystemTimeZone()}
                  。在中美两地切换时，可以固定为其中一个时区，避免同一条记录跑到前一天或后一天。
                </span>
              </span>
              <select
                value={timeZone}
                onChange={async (event) => {
                  const nextTimeZone = event.target.value;
                  setTimeZone(nextTimeZone);
                  await setStorageValue(TIME_ZONE, nextTimeZone);
                  toast.success("时区已更新");
                }}
                className="max-w-64 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
              >
                {TIME_ZONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="border-b border-gray-200 p-5 dark:border-neutral-800">
            <h2 className="text-base font-semibold">日期筛选方式</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
              在记录列表里选择日期时，可以只看某一天，也可以选择一段时间。这里只影响本机页面，不会改动
              哔哩哔哩账号。
            </p>
          </div>

          <div className="flex flex-col gap-3 p-5">
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="dateSelectionMode"
                checked={dateSelectionMode === "range"}
                onChange={async () => {
                  setDateSelectionMode("range");
                  await setStorageValue(DATE_SELECTION_MODE, "range");
                }}
                className="h-4 w-4 border-gray-300 text-blue-600"
              />
              <span>
                <span className="block text-sm">选择一段时间</span>
                <span className="block text-xs text-gray-500 dark:text-neutral-400">
                  先选开始日期，再选结束日期，只显示这段时间内的记录。
                </span>
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="dateSelectionMode"
                checked={dateSelectionMode === "single"}
                onChange={async () => {
                  setDateSelectionMode("single");
                  await setStorageValue(DATE_SELECTION_MODE, "single");
                }}
                className="h-4 w-4 border-gray-300 text-blue-600"
              />
              <span>
                <span className="block text-sm">只看选中的那一天</span>
                <span className="block text-xs text-gray-500 dark:text-neutral-400">
                  选哪一天，就只显示那一天的记录。
                </span>
              </span>
            </label>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="border-b border-gray-200 p-5 dark:border-neutral-800">
            <h2 className="text-base font-semibold">备份和导出</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
              备份文件以后可以恢复到浏览器里；表格文件适合用 Excel、Numbers
              或数据分析工具打开。恢复备份只会把记录加到这台电脑，不会上传或改动哔哩哔哩账号。
            </p>
          </div>

          <div className="flex flex-col gap-5 p-5">
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">导出哪种文件</span>
              <select
                value={exportFormat}
                onChange={(event) => setExportFormat(event.target.value as "json" | "csv")}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
              >
                <option value="json">备份文件（以后可恢复）</option>
                <option value="csv">表格文件（用于查看或分析）</option>
              </select>
            </label>

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={handleImport}
                disabled={isImporting}
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                <Upload className="h-4 w-4" />
                {isImporting ? "正在恢复..." : "恢复备份"}
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {isExporting ? "正在导出..." : "导出记录"}
              </button>
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="border-b border-gray-200 p-5 dark:border-neutral-800">
            <div className="flex items-start gap-3">
              <Cloud className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div>
                <h2 className="text-base font-semibold">历史记录云端同步</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
                  把这台电脑保存的历史记录和观看进度同步到你自己的云端地址。另一台电脑填同一个地址和密钥后点同步，就能合并记录。
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5 p-5">
            <div className="space-y-3 text-sm leading-6 text-gray-600 dark:text-neutral-300">
              <p className="font-medium text-gray-900 dark:text-neutral-100">
                合规免费额度方案：Cloudflare Workers + KV
              </p>
              <p>
                适合个人使用。当前官方免费额度包含 Workers 每天 100,000 次请求、KV 1GB 存储、每天
                100,000 次读取和 1,000 次写入。也可以用 Supabase 免费版或 GitHub Gist，但这版 SDK
                先接入最简单的 HTTP 地址。
              </p>
              <p>
                注意：这版会把记录明文保存到你配置的云端地址，不是端到端加密。只建议连接你自己控制的
                Worker，密钥不要分享给别人。
              </p>
              <details open>
                <summary className="cursor-pointer text-sm font-medium text-gray-900 hover:text-blue-600 dark:text-neutral-100 dark:hover:text-blue-400">
                  详细教程：用 Cloudflare 免费额度搭一个同步云端
                </summary>
                <div className="mt-3 space-y-4 rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-neutral-100">开始前准备</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>准备一个 Cloudflare 账号。</li>
                      <li>准备一段同步密钥，建议至少 24 位，包含大小写字母、数字和符号。</li>
                      <li>不要使用公开仓库、公开网页或别人提供的 Worker 地址保存自己的记录。</li>
                    </ol>
                  </div>

                  <div>
                    <p className="font-medium text-gray-900 dark:text-neutral-100">
                      第 1 步：创建 KV 存储
                    </p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>打开 Cloudflare Dashboard。</li>
                      <li>在左侧进入“存储和数据库” &gt; “Workers KV”，然后点击“创建实例”。</li>
                      <li>实例名称填写 bilibili-history-save-analysis-sync。</li>
                      <li>点击“创建”，看到 KV 的指标页面就表示这一步完成。</li>
                    </ol>
                  </div>

                  <div>
                    <p className="font-medium text-gray-900 dark:text-neutral-100">
                      第 2 步：创建 Worker
                    </p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>在左侧进入“计算” &gt; “Workers 和 Pages”。</li>
                      <li>点击“创建应用程序”或“创建 Worker”。</li>
                      <li>
                        选择“从 Hello World 开始”，Worker 名称填写
                        bilibili-history-save-analysis-sync，然后点击“部署”。
                      </li>
                      <li>进入 Worker 概述页面后，暂时不用点击“访问”。</li>
                    </ol>
                  </div>

                  <div>
                    <p className="font-medium text-gray-900 dark:text-neutral-100">
                      第 3 步：替换 Worker 代码
                    </p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>在 Worker 概述页面点击右上角“编辑代码”。</li>
                      <li>删除编辑器中的默认 Hello World 代码。</li>
                      <li>展开本教程下方的“查看 Cloudflare Worker 代码”，复制全部代码并粘贴。</li>
                      <li>点击编辑器右上角“部署”。</li>
                    </ol>
                  </div>

                  <div>
                    <p className="font-medium text-gray-900 dark:text-neutral-100">
                      第 4 步：绑定 KV
                    </p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>返回 Worker 概述页面。</li>
                      <li>点击顶部“绑定”，或者点击右侧“添加绑定”旁边的加号。</li>
                      <li>选择“KV 命名空间”。</li>
                      <li>变量名称必须填写 BILI_HISTORY_SYNC。</li>
                      <li>KV 命名空间选择 bilibili-history-save-analysis-sync。</li>
                      <li>保存，并按页面提示部署新版本。</li>
                    </ol>
                  </div>

                  <div>
                    <p className="font-medium text-gray-900 dark:text-neutral-100">
                      第 5 步：添加同步密钥
                    </p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>在 Worker 页面点击顶部“设置”，找到“变量和机密”。</li>
                      <li>点击“添加”，类型选择“Secret”或“机密”。</li>
                      <li>变量名称必须填写 SYNC_TOKEN。</li>
                      <li>值填写开始时准备的同步密钥，然后保存并部署。</li>
                      <li>同步密钥不会再次完整显示，请自己妥善保存，也不要截图或发给别人。</li>
                    </ol>
                  </div>

                  <div>
                    <p className="font-medium text-gray-900 dark:text-neutral-100">
                      第 6 步：找到 Worker 地址
                    </p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>返回 Worker 的“概述”页面。</li>
                      <li>
                        页面顶部灰色栏中的 workers.dev
                        链接就是云端地址，也可以点击右上角“访问”后复制浏览器地址栏。
                      </li>
                      <li>完整地址应以 https:// 开头，并以 workers.dev 结尾。</li>
                      <li>
                        直接访问显示 unauthorized 或 401
                        是正常的，因为普通网页请求没有携带同步密钥。
                      </li>
                    </ol>
                  </div>

                  <div>
                    <p className="font-medium text-gray-900 dark:text-neutral-100">
                      第 7 步：回到这个扩展
                    </p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>把完整的 workers.dev 地址粘贴到下面的“云端地址”。</li>
                      <li>把 SYNC_TOKEN 对应的密钥粘贴到“同步密钥”。</li>
                      <li>先点击“测试连接”，提示连接正常后再点击“立即同步”。</li>
                      <li>首次同步完成后，可以到 Cloudflare KV 的“KV 对”页面查看 history.json。</li>
                      <li>另一台电脑填写相同地址和密钥，再点“立即同步”，即可合并记录。</li>
                      <li>
                        不再使用时，点击页面底部“删除云端记录”清除
                        history.json，再点击“停用云端同步”清除本机保存的地址和密钥。
                      </li>
                    </ol>
                  </div>

                  <div>
                    <p className="font-medium text-gray-900 dark:text-neutral-100">常见问题</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>
                        在浏览器直接打开 Worker 地址看到 401：属于正常现象，请在扩展里测试连接。
                      </li>
                      <li>
                        扩展测试时出现 401：同步密钥不一致，检查 SYNC_TOKEN 和扩展中填写的密钥。
                      </li>
                      <li>出现 500：通常是 KV 变量名称没有填成 BILI_HISTORY_SYNC。</li>
                      <li>
                        测试连接没反应：确认 Worker 地址以 https:// 开头，并且 Worker 已部署。
                      </li>
                      <li>另一台电脑没有数据：两边都要点“立即同步”，并且使用同一个地址和密钥。</li>
                    </ol>
                  </div>
                </div>
              </details>
              <div className="flex flex-wrap gap-3 text-xs">
                <a
                  href="https://developers.cloudflare.com/workers/platform/limits/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  Workers 免费额度
                </a>
                <a
                  href="https://developers.cloudflare.com/kv/platform/limits/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  KV 免费额度
                </a>
                <a
                  href="https://supabase.com/pricing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  Supabase 免费版
                </a>
                <a
                  href="https://docs.github.com/rest/using-the-rest-api/rate-limits-for-the-rest-api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  GitHub API 限额
                </a>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-medium text-gray-900 hover:text-blue-600 dark:text-neutral-100 dark:hover:text-blue-400">
                  查看 Cloudflare Worker 代码
                </summary>
                <textarea
                  readOnly
                  value={cloudflareWorkerCode}
                  className="mt-3 h-72 w-full resize-y rounded-md border border-gray-200 bg-gray-50 p-3 font-mono text-xs leading-5 text-gray-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200"
                />
              </details>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">云端地址</span>
              <input
                type="url"
                value={cloudEndpoint}
                onChange={(event) => setCloudEndpoint(event.target.value)}
                placeholder="https://your-worker.your-name.workers.dev"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">同步密钥</span>
              <input
                type="password"
                value={cloudToken}
                onChange={(event) => setCloudToken(event.target.value)}
                placeholder="和 Worker 里的 SYNC_TOKEN 保持一致"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
              <span className="text-xs text-gray-500 dark:text-neutral-400">
                密钥只保存在这个浏览器里。不要把它发给别人。
              </span>
            </label>

            {lastCloudSyncAt && (
              <p className="text-xs text-gray-500 dark:text-neutral-400">
                上次云端同步：{formatDateTime(new Date(lastCloudSyncAt).getTime(), timeZone)}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-5 dark:border-neutral-800">
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleDisableCloudSync}
                  disabled={isDeletingCloud}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  <CloudOff className="h-4 w-4" />
                  停用云端同步
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCloudData}
                  disabled={isDeletingCloud}
                  className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-neutral-950 dark:text-red-300 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="h-4 w-4" />
                  {isDeletingCloud ? "正在删除..." : "删除云端记录"}
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSaveCloudConfig}
                  disabled={isSavingCloudConfig}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  <Save className="h-4 w-4" />
                  {isSavingCloudConfig ? "正在保存..." : "保存设置"}
                </button>
                <button
                  type="button"
                  onClick={handleTestCloud}
                  disabled={isTestingCloud}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  <Cloud className="h-4 w-4" />
                  {isTestingCloud ? "正在测试..." : "测试连接"}
                </button>
                <button
                  type="button"
                  onClick={handleCloudSync}
                  disabled={isCloudSyncing}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${isCloudSyncing ? "animate-spin" : ""}`} />
                  {isCloudSyncing ? "正在同步..." : "立即同步"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Settings;
