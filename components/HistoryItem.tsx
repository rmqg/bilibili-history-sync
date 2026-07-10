import { HistoryItem as HistoryItemType } from "../utils/types";
import { getContentUrl } from "../utils/common";
import React from "react";
import { getTypeTag } from "../utils/common";
import { formatDateTime, TimeZonePreference } from "../utils/timezone";

interface HistoryItemProps {
  item: HistoryItemType;
  timeZone?: TimeZonePreference;
}

export const HistoryItem: React.FC<HistoryItemProps> = ({ item, timeZone = "system" }) => {
  const isFav = item.is_fav === true;

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const getProgressInfo = () => {
    const duration = item.duration;
    if (duration === undefined || duration === null || duration <= 0) {
      return item.progress === -1 ? { text: "100%", percent: 100 } : null;
    }

    const watchedSeconds =
      item.progress === -1 ? duration : Math.min(Math.max(item.progress ?? 0, 0), duration);
    if (watchedSeconds <= 0) return null;

    const percentage = Math.round((watchedSeconds / duration) * 100);
    return {
      text: `${formatDuration(watchedSeconds)} / ${formatDuration(duration)} · ${percentage}%`,
      percent: Math.min(100, percentage),
    };
  };

  const progressInfo = getProgressInfo();

  return (
    <div className="border border-gray-200 dark:border-neutral-800 dark:bg-neutral-900 rounded-lg overflow-hidden">
      <a
        href={getContentUrl(item)}
        target="_blank"
        rel="noopener noreferrer"
        className="no-underline text-inherit"
      >
        <div>
          <div className="relative w-full aspect-video">
            <img
              src={`${item.cover}@760w_428h_1c.avif`}
              alt={item.title}
              className="w-full h-full object-cover"
            />

            {/* 观看进度条 */}
            {progressInfo && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                <div
                  className="h-full bg-[#fb7299]"
                  style={{
                    width: `${progressInfo.percent}%`,
                  }}
                />
              </div>
            )}

            {/* 进度文字 & 类型标签 */}
            <div className="absolute bottom-2 left-2 right-2 flex justify-between items-end pointer-events-none">
              {progressInfo ? (
                <span className="text-[10px] text-white bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded border border-white/10">
                  {progressInfo.text}
                </span>
              ) : (
                <span></span>
              )}{" "}
              {/* Empty span to maintain flex spacing if no progress text */}
              {item.business !== "archive" && (
                <span className="px-2 py-1 rounded text-xs text-white bg-[#fb7299]">
                  {getTypeTag(item.business)}
                </span>
              )}
            </div>

            {/* "已收藏" 标签 (positioned at top-right) */}
            {isFav && (
              <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] text-white bg-black/60 backdrop-blur-sm border border-white/20">
                已收藏
              </span>
            )}
          </div>
          <div className="p-2.5">
            <h3 className="m-0 text-sm leading-[1.4] h-10 overflow-hidden line-clamp-2">
              {item.title}
            </h3>
            <div className="flex justify-between items-center text-gray-500 dark:text-neutral-400 text-xs mt-1">
              <span
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(`https://space.bilibili.com/${item.author_mid}`, "_blank");
                }}
                className="hover:text-[#fb7299] transition-colors cursor-pointer"
              >
                {item.author_name}
              </span>
              <span>{formatDateTime(item.view_at * 1000, timeZone)}</span>
            </div>
          </div>
        </div>
      </a>
    </div>
  );
};
