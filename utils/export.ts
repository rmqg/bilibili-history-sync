import { getContentUrl, getTypeTag } from "./common";
import { getAllHistory, getAllWatchEvents } from "./db";
import { HistoryItem } from "./types";
import { TIME_ZONE } from "./constants";
import { getStorageValue } from "./storage";
import { formatDateKey, formatDateTime, TimeZonePreference } from "./timezone";

const escapeCSVField = (field: string | number | boolean | undefined | null) => {
  const value = field === undefined || field === null ? "" : String(field);
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const downloadFile = (content: BlobPart, type: string, filename: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const convertHistoryToCSV = (items: HistoryItem[], timeZone: TimeZonePreference): string => {
  const headers = [
    "ID",
    "BV号",
    "CID",
    "标题",
    "观看时间",
    "哔哩哔哩类型代码",
    "内容类型",
    "分区",
    "看到的位置(秒)",
    "视频长度(秒)",
    "已收藏",
    "链接",
    "封面",
    "UP主",
    "UP主ID",
    "UP主主页",
  ].join(",");

  const rows = items.map((item) => {
    const viewAt = formatDateTime(item.view_at * 1000, timeZone);
    const authorUrl = item.author_mid ? `https://space.bilibili.com/${item.author_mid}` : "";

    return [
      item.id,
      item.bvid,
      item.cid,
      item.title,
      viewAt,
      item.business,
      getTypeTag(item.business),
      item.tag_name,
      item.progress ?? "",
      item.duration ?? "",
      item.is_fav === true,
      getContentUrl(item),
      item.cover,
      item.author_name,
      item.author_mid,
      authorUrl,
    ]
      .map(escapeCSVField)
      .join(",");
  });

  return [headers, ...rows].join("\n");
};

export const exportHistoryToCSV = async (): Promise<void> => {
  const items = await getAllHistory();
  const timeZone = await getStorageValue<TimeZonePreference>(TIME_ZONE, "system");
  const csv = convertHistoryToCSV(items, timeZone);
  const date = formatDateKey(Date.now(), timeZone);
  downloadFile(
    "\ufeff" + csv,
    "text/csv;charset=utf-8",
    `bilibili-history-save-analysis-${date}.csv`,
  );
};

export const exportHistoryToJSON = async (): Promise<void> => {
  const [items, watchEvents] = await Promise.all([getAllHistory(), getAllWatchEvents()]);
  const json = JSON.stringify(
    {
      version: 2,
      exported_at: new Date().toISOString(),
      history: items,
      watchEvents,
    },
    null,
    2,
  );
  const timeZone = await getStorageValue<TimeZonePreference>(TIME_ZONE, "system");
  const date = formatDateKey(Date.now(), timeZone);
  downloadFile(
    json,
    "application/json;charset=utf-8",
    `bilibili-history-save-analysis-${date}.json`,
  );
};
