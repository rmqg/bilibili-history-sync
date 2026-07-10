import { useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import "./App.css";
import { TIME_ZONE } from "../../utils/constants";
import { getStorageValue } from "../../utils/storage";
import { formatDateTime, TimeZonePreference } from "../../utils/timezone";

function App() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [status, setStatus] = useState("");
  const [isFullSync, setIsFullSync] = useState(false);

  useEffect(() => {
    const checkSyncStatus = async () => {
      const [result, timeZone] = await Promise.all([
        browser.storage.local.get("lastSync"),
        getStorageValue<TimeZonePreference>(TIME_ZONE, "system"),
      ]);
      if (result.lastSync) {
        setStatus(`上次保存：${formatDateTime(Number(result.lastSync), timeZone)}`);
      } else {
        setStatus("还没有保存过历史记录。请先在这个浏览器登录哔哩哔哩网页版。");
      }
    };

    checkSyncStatus();
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    setStatus("正在把哔哩哔哩历史记录保存到这台电脑...");

    try {
      const response = await browser.runtime.sendMessage({
        action: "syncHistory",
        isFullSync,
      });

      if (response?.success) {
        setStatus(response.message);
      } else if (!response) {
        setStatus("保存失败：扩展没有响应。请在 Safari 的扩展设置里点 Reload 后再试。");
      } else {
        setStatus(`保存失败：${response?.error || "未知原因"}`);
      }
    } catch (error) {
      setStatus(`保存失败：${error instanceof Error ? error.message : "未知原因"}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      <Toaster position="top-center" />
      <div className="flex w-72 flex-col gap-3">
        <div>
          <h2 className="text-lg font-bold leading-tight">哔哩哔哩历史记录保存与分析</h2>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            把历史记录保存到这台电脑，方便查找、备份和分析。只有你主动使用云端同步时，记录才会上传到你配置的云端。
          </p>
        </div>
        <button
          className="w-full rounded bg-[#00a1d6] px-2 py-2 text-white hover:bg-[#0091c2] disabled:cursor-not-allowed disabled:bg-gray-300"
          onClick={() => browser.tabs.create({ url: "/my-history.html" })}
          disabled={isSyncing}
        >
          打开记录与分析
        </button>
        <button
          className="w-full rounded bg-[#00a1d6] px-2 py-2 text-white hover:bg-[#0091c2] disabled:cursor-not-allowed disabled:bg-gray-300"
          onClick={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? "正在保存..." : "保存历史记录"}
        </button>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            id="fullSync"
            checked={isFullSync}
            onChange={(event) => setIsFullSync(event.target.checked)}
            disabled={isSyncing}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 bg-gray-100 text-[#00a1d6] focus:ring-2 focus:ring-[#00a1d6]"
          />
          <span
            className={`cursor-pointer select-none text-sm leading-5 ${
              isSyncing ? "text-gray-400" : "text-gray-700"
            }`}
          >
            重新保存全部历史
            <span className="block text-xs text-gray-500">
              普通保存会重新检查最近 3
              天。勾选后会从头检查哔哩哔哩历史，适合第一次使用、换电脑或修复缺失记录。
            </span>
          </span>
        </label>
        {status && (
          <div className="rounded bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-600">
            {status}
          </div>
        )}
      </div>
    </>
  );
}

export default App;
