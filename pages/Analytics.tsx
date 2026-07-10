import dayjs from "dayjs";
import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, Clock, Percent, PlayCircle, RefreshCw, Tag, Users } from "lucide-react";
import {
  AnalyticsReport,
  DailyVideoMetric,
  DistributionBucket,
  RankedMetric,
  WatchBoundaryAnalysis,
  buildAnalyticsReport,
  formatDuration,
} from "../utils/analytics";
import { TIME_ZONE } from "../utils/constants";
import { getStorageValue } from "../utils/storage";
import { TimeZonePreference } from "../utils/timezone";

type TimeRange = "30" | "90" | "all";

interface StatCardProps {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}

interface DailyLineChartProps {
  title: string;
  detail: string;
  data: DailyVideoMetric[];
  color: string;
  getValue: (item: DailyVideoMetric) => number;
  formatValue: (value: number) => string;
  maxValue?: number;
  emptyText?: string;
  getDetails?: (item: DailyVideoMetric, value: number) => string[];
}

const rangeOptions: { value: TimeRange; label: string }[] = [
  { value: "30", label: "30 天" },
  { value: "90", label: "90 天" },
  { value: "all", label: "全部" },
];

const formatPercent = (value: number) => `${Math.round(value)}%`;

const formatPrecisePercent = (value: number) => {
  if (!Number.isFinite(value)) return "0%";
  return value < 10 && value > 0 ? `${value.toFixed(1)}%` : `${Math.round(value)}%`;
};

const formatAverageProgress = (item: RankedMetric) =>
  item.progressCount > 0 ? formatPercent(item.averageProgressPercent) : "暂无进度";

const formatExactDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 秒";
  const roundedSeconds = Math.round(seconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const restSeconds = roundedSeconds % 60;

  if (hours > 0) return `${hours} 小时 ${minutes} 分 ${restSeconds} 秒`;
  if (minutes > 0) return `${minutes} 分 ${restSeconds} 秒`;
  return `${restSeconds} 秒`;
};

const formatCompactDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = seconds / 3600;
  return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
};

const tagPieColors = [
  "#2563eb",
  "#fb7299",
  "#16a34a",
  "#f59e0b",
  "#9333ea",
  "#0891b2",
  "#ef4444",
  "#64748b",
];

const filterDailyMetrics = (metrics: DailyVideoMetric[], range: TimeRange) => {
  if (range === "all" || metrics.length === 0) return metrics;

  const days = Number(range);
  const lastDate = metrics[metrics.length - 1].date;
  const startDate = dayjs(lastDate)
    .subtract(days - 1, "day")
    .format("YYYY-MM-DD");

  return metrics.filter((item) => item.date >= startDate);
};

const StatCard: React.FC<StatCardProps> = ({ title, value, detail, icon }) => (
  <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm text-gray-500 dark:text-neutral-400">{title}</p>
        <p className="mt-2 text-2xl font-semibold tracking-normal text-gray-900 dark:text-neutral-100">
          {value}
        </p>
      </div>
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
        {icon}
      </span>
    </div>
    <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-neutral-400">{detail}</p>
  </section>
);

const DailyLineChart: React.FC<DailyLineChartProps> = ({
  title,
  detail,
  data,
  color,
  getValue,
  formatValue,
  maxValue,
  emptyText = "暂无可分析的记录",
  getDetails,
}) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 760;
  const height = 280;
  const padding = { top: 26, right: 28, bottom: 40, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const values = data.map(getValue).filter((value) => Number.isFinite(value));
  const highestValue = Math.max(...values, 0);
  const chartMax = Math.max(maxValue ?? highestValue * 1.12, 1);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => chartMax * ratio);

  const getX = (index: number) => {
    if (data.length <= 1) return padding.left + chartWidth / 2;
    return padding.left + (index / (data.length - 1)) * chartWidth;
  };

  const getY = (value: number) => padding.top + chartHeight - (value / chartMax) * chartHeight;

  const points = data.map((item, index) => `${getX(index)},${getY(getValue(item))}`).join(" ");

  const labelIndexes = useMemo(() => {
    if (data.length <= 6) return data.map((_, index) => index);
    return Array.from(
      new Set([
        0,
        Math.floor((data.length - 1) * 0.25),
        Math.floor((data.length - 1) * 0.5),
        Math.floor((data.length - 1) * 0.75),
        data.length - 1,
      ]),
    );
  }, [data]);

  const latest = data[data.length - 1];
  const activeItem = activeIndex !== null && data[activeIndex] ? data[activeIndex] : latest;
  const activeValue = activeItem ? getValue(activeItem) : 0;
  const activeDetails = activeItem ? getDetails?.(activeItem, activeValue) || [] : [];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-neutral-100">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-neutral-400">{detail}</p>
        </div>
        {activeItem && (
          <div className="shrink-0 rounded-md bg-gray-50 px-2.5 py-2 text-right text-xs text-gray-600 dark:bg-neutral-950 dark:text-neutral-300">
            <p className="font-medium text-gray-900 dark:text-neutral-100">
              {dayjs(activeItem.date).format("YYYY/M/D")} · {formatValue(activeValue)}
            </p>
            {activeDetails.map((line) => (
              <p key={line} className="mt-1 text-gray-500 dark:text-neutral-400">
                {line}
              </p>
            ))}
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed border-gray-200 text-sm text-gray-400 dark:border-neutral-800 dark:text-neutral-500">
          {emptyText}
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[280px] w-full overflow-visible"
          role="img"
          aria-label={title}
        >
          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className="text-gray-100 dark:text-neutral-800"
                />
                <text
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-gray-400 text-[11px] dark:fill-neutral-500"
                >
                  {formatValue(tick)}
                </text>
              </g>
            );
          })}

          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
          />

          {data.map((item, index) => {
            const value = getValue(item);
            const x = getX(index);
            const y = getY(value);
            const slotWidth =
              data.length <= 1 ? chartWidth : chartWidth / Math.max(1, data.length - 1);
            const detailText = [
              `${dayjs(item.date).format("YYYY/M/D")} · ${formatValue(value)}`,
              ...(getDetails?.(item, value) || []),
            ].join("\n");

            return (
              <rect
                key={`${item.date}-${index}-hit`}
                x={x - slotWidth / 2}
                y={padding.top}
                width={slotWidth}
                height={chartHeight}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
                tabIndex={0}
              >
                <title>{detailText}</title>
              </rect>
            );
          })}

          {data.length <= 45 &&
            data.map((item, index) => (
              <circle
                key={`${item.date}-${index}`}
                cx={getX(index)}
                cy={getY(getValue(item))}
                r="3.5"
                fill="white"
                stroke={color}
                strokeWidth="2"
                className="pointer-events-none"
              />
            ))}

          {activeItem && (
            <>
              <line
                x1={getX(data.indexOf(activeItem))}
                x2={getX(data.indexOf(activeItem))}
                y1={padding.top}
                y2={height - padding.bottom}
                stroke={color}
                strokeWidth="1.5"
                strokeDasharray="4 4"
                opacity="0.55"
              />
              <circle
                cx={getX(data.indexOf(activeItem))}
                cy={getY(activeValue)}
                r="5"
                fill={color}
                stroke="white"
                strokeWidth="2"
              />
            </>
          )}

          {labelIndexes.map((index) => {
            const item = data[index];
            return (
              <text
                key={`${item.date}-${index}`}
                x={getX(index)}
                y={height - 12}
                textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
                className="fill-gray-400 text-[11px] dark:fill-neutral-500"
              >
                {dayjs(item.date).format("M/D")}
              </text>
            );
          })}
        </svg>
      )}
    </section>
  );
};

const BoundaryAnalysisPanel: React.FC<{
  analysis?: WatchBoundaryAnalysis;
}> = ({ analysis }) => {
  if (!analysis || analysis.sampleCount === 0) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-neutral-100">
          跳出和看完判断
        </h2>
        <div className="mt-4 rounded-md border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400 dark:border-neutral-800 dark:text-neutral-500">
          暂无足够的观看进度记录
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-5 flex flex-col gap-1">
        <h2 className="text-base font-semibold text-gray-900 dark:text-neutral-100">
          跳出和看完判断
        </h2>
        <p className="text-xs leading-5 text-gray-500 dark:text-neutral-400">
          只统计普通视频。看了不超过 10% 算跳出；距离结尾 10% 以内，或哔哩哔哩标记已看完，算看完。
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-100 p-4 dark:border-neutral-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-neutral-400">跳出概率</p>
              <p className="mt-2 text-3xl font-semibold tracking-normal text-gray-900 dark:text-neutral-100">
                {formatPercent(analysis.bounceProbability)}
              </p>
            </div>
            <span className="rounded-md bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
              {analysis.bounceCount} / {analysis.sampleCount}
            </span>
          </div>
          <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-neutral-400">
            规则：播放进度不超过 {formatPrecisePercent(analysis.bouncePercentThreshold)}
            ，并且没有被算作看完。
          </p>
        </div>

        <div className="rounded-lg border border-gray-100 p-4 dark:border-neutral-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-neutral-400">看完概率</p>
              <p className="mt-2 text-3xl font-semibold tracking-normal text-gray-900 dark:text-neutral-100">
                {formatPercent(analysis.completionProbability)}
              </p>
            </div>
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              {analysis.completionCount} / {analysis.sampleCount}
            </span>
          </div>
          <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-neutral-400">
            规则：距离结尾不超过{" "}
            {formatPrecisePercent(analysis.completionRemainingPercentThreshold)}
            ；另外包含哔哩哔哩标记为看完的 {analysis.explicitCompleteCount} 条记录。
          </p>
        </div>
      </div>
    </section>
  );
};

const DistributionBarChart: React.FC<{
  title: string;
  detail: string;
  items: DistributionBucket[];
  color: string;
}> = ({ title, detail, items, color }) => {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const maxCount = Math.max(...items.map((item) => item.count), 0);
  const totalCount = items.reduce((sum, item) => sum + item.count, 0);
  const activeItem =
    items.find((item) => item.label === activeLabel) ||
    items.reduce<DistributionBucket | null>(
      (current, item) => (!current || item.count > current.count ? item : current),
      null,
    );

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-start gap-2">
          <BarChart3 className="mt-0.5 h-4 w-4 text-blue-600 dark:text-blue-400" />
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-neutral-100">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-neutral-400">{detail}</p>
          </div>
        </div>
        {activeItem && totalCount > 0 && (
          <div className="shrink-0 rounded-md bg-gray-50 px-2.5 py-2 text-right text-xs text-gray-600 dark:bg-neutral-950 dark:text-neutral-300">
            <p className="font-medium text-gray-900 dark:text-neutral-100">
              {activeItem.label} · {activeItem.count} 条
            </p>
            <p className="mt-1 text-gray-500 dark:text-neutral-400">
              占比 {formatPrecisePercent((activeItem.count / totalCount) * 100)}
            </p>
          </div>
        )}
      </div>

      {maxCount === 0 ? (
        <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-gray-200 text-sm text-gray-400 dark:border-neutral-800 dark:text-neutral-500">
          暂无记录
        </div>
      ) : (
        <div
          className="grid h-64 items-end gap-2"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        >
          {items.map((item) => {
            const height = Math.max(3, (item.count / maxCount) * 100);
            return (
              <div key={item.label} className="flex h-full min-w-0 flex-col justify-end gap-2">
                <p className="truncate text-center text-[11px] font-medium text-gray-500 dark:text-neutral-400">
                  {item.count}
                </p>
                <div className="flex h-44 items-end rounded-t-md bg-gray-50 dark:bg-neutral-950">
                  <div
                    className="w-full cursor-pointer rounded-t-md transition-opacity hover:opacity-80"
                    style={{
                      height: `${height}%`,
                      backgroundColor: color,
                    }}
                    title={`${item.label}: ${item.count} 条`}
                    onMouseEnter={() => setActiveLabel(item.label)}
                    onFocus={() => setActiveLabel(item.label)}
                    onClick={() => setActiveLabel(item.label)}
                    tabIndex={0}
                  />
                </div>
                <p className="h-8 truncate text-center text-[11px] text-gray-500 dark:text-neutral-400">
                  {item.label}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

const TagPieChart: React.FC<{
  title: string;
  icon: React.ReactNode;
  items: RankedMetric[];
}> = ({ title, icon, items }) => {
  const [activeName, setActiveName] = useState<string | null>(null);
  const size = 192;
  const center = size / 2;
  const radius = 70;
  const strokeWidth = 34;
  const circumference = 2 * Math.PI * radius;
  const totalCount = items.reduce((sum, item) => sum + item.count, 0);

  const segments = useMemo(() => {
    let offset = 0;

    return items.map((item, index) => {
      const length = totalCount > 0 ? (item.count / totalCount) * circumference : 0;
      const segment = {
        item,
        color: tagPieColors[index % tagPieColors.length],
        dashArray: `${length} ${Math.max(0, circumference - length)}`,
        dashOffset: -offset,
        share: totalCount > 0 ? (item.count / totalCount) * 100 : 0,
      };

      offset += length;
      return segment;
    });
  }, [circumference, items, totalCount]);
  const activeSegment = segments.find((segment) => segment.item.name === activeName) || segments[0];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-blue-600 dark:text-blue-400">{icon}</span>
          <h2 className="text-base font-semibold text-gray-900 dark:text-neutral-100">{title}</h2>
        </div>
        {activeSegment && (
          <div className="shrink-0 rounded-md bg-gray-50 px-2.5 py-2 text-right text-xs text-gray-600 dark:bg-neutral-950 dark:text-neutral-300">
            <p className="font-medium text-gray-900 dark:text-neutral-100">
              {activeSegment.item.name} · {activeSegment.item.count} 条
            </p>
            <p className="mt-1 text-gray-500 dark:text-neutral-400">
              占比 {formatPrecisePercent(activeSegment.share)} · 平均进度{" "}
              {formatAverageProgress(activeSegment.item)}
            </p>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400 dark:text-neutral-500">
          暂无分区记录
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
          <div className="flex justify-center">
            <svg
              viewBox={`0 0 ${size} ${size}`}
              className="h-52 w-52"
              role="img"
              aria-label={title}
            >
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                className="text-gray-100 dark:text-neutral-800"
              />
              {segments.map((segment) => (
                <g key={segment.item.name}>
                  <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={
                      activeSegment?.item.name === segment.item.name ? strokeWidth + 4 : strokeWidth
                    }
                    strokeDasharray={segment.dashArray}
                    strokeDashoffset={segment.dashOffset}
                    transform={`rotate(-90 ${center} ${center})`}
                    className="cursor-pointer"
                    onMouseEnter={() => setActiveName(segment.item.name)}
                    onFocus={() => setActiveName(segment.item.name)}
                    onClick={() => setActiveName(segment.item.name)}
                    tabIndex={0}
                  />
                  <title>
                    {segment.item.name}: {segment.item.count} 条，占比{" "}
                    {formatPrecisePercent(segment.share)}，平均进度{" "}
                    {formatAverageProgress(segment.item)}
                  </title>
                </g>
              ))}
              <text
                x={center}
                y={center - 4}
                textAnchor="middle"
                className="fill-gray-900 text-[22px] font-semibold dark:fill-neutral-100"
              >
                {totalCount}
              </text>
              <text
                x={center}
                y={center + 20}
                textAnchor="middle"
                className="fill-gray-500 text-[12px] dark:fill-neutral-400"
              >
                条记录
              </text>
            </svg>
          </div>

          <div className="min-w-0 space-y-3">
            {segments.map((segment) => (
              <div
                key={segment.item.name}
                className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] gap-3 rounded-md px-1 py-0.5 hover:bg-gray-50 dark:hover:bg-neutral-950"
                onMouseEnter={() => setActiveName(segment.item.name)}
                onFocus={() => setActiveName(segment.item.name)}
                onClick={() => setActiveName(segment.item.name)}
                tabIndex={0}
                title={`${segment.item.name}: ${segment.item.count} 条，占比 ${formatPrecisePercent(
                  segment.share,
                )}，平均进度 ${formatAverageProgress(segment.item)}`}
              >
                <span
                  className="mt-1.5 h-3 w-3 rounded-sm"
                  style={{ backgroundColor: segment.color }}
                />
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-medium text-gray-700 dark:text-neutral-200"
                    title={segment.item.name}
                  >
                    {segment.item.name}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-neutral-400">
                    平均进度 {formatAverageProgress(segment.item)}
                  </p>
                </div>
                <div className="text-right text-xs text-gray-500 dark:text-neutral-400">
                  <p className="font-medium text-gray-700 dark:text-neutral-200">
                    {formatPercent(segment.share)}
                  </p>
                  <p className="mt-0.5">{segment.item.count} 条</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

const RankingList: React.FC<{
  title: string;
  icon: React.ReactNode;
  items: RankedMetric[];
}> = ({ title, icon, items }) => {
  const [activeName, setActiveName] = useState<string | null>(null);
  const maxCount = Math.max(...items.map((item) => item.count), 1);
  const activeItem = items.find((item) => item.name === activeName) || items[0];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-blue-600 dark:text-blue-400">{icon}</span>
          <h2 className="text-base font-semibold text-gray-900 dark:text-neutral-100">{title}</h2>
        </div>
        {activeItem && (
          <div className="shrink-0 rounded-md bg-gray-50 px-2.5 py-2 text-right text-xs text-gray-600 dark:bg-neutral-950 dark:text-neutral-300">
            <p className="font-medium text-gray-900 dark:text-neutral-100">
              {activeItem.name} · {activeItem.count} 条
            </p>
            <p className="mt-1 text-gray-500 dark:text-neutral-400">
              平均进度 {formatAverageProgress(activeItem)}
            </p>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400 dark:text-neutral-500">暂无记录</div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.name}
              className="cursor-pointer rounded-md px-1 py-0.5 hover:bg-gray-50 dark:hover:bg-neutral-950"
              onMouseEnter={() => setActiveName(item.name)}
              onFocus={() => setActiveName(item.name)}
              onClick={() => setActiveName(item.name)}
              tabIndex={0}
              title={`${item.name}: ${item.count} 条，平均进度 ${formatAverageProgress(item)}`}
            >
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-gray-700 dark:text-neutral-200">{item.name}</span>
                <span className="shrink-0 text-xs text-gray-500 dark:text-neutral-400">
                  {item.count} 条 · {formatAverageProgress(item)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 dark:bg-neutral-800">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${Math.max(4, (item.count / maxCount) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const Analytics = () => {
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("90");
  const [isLoading, setIsLoading] = useState(true);
  const [timeZone, setTimeZone] = useState<TimeZonePreference>("system");

  const loadReport = async (selectedTimeZone: TimeZonePreference = timeZone) => {
    try {
      setIsLoading(true);
      setReport(await buildAnalyticsReport(selectedTimeZone));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    getStorageValue<TimeZonePreference>(TIME_ZONE, "system").then((storedTimeZone) => {
      setTimeZone(storedTimeZone);
      loadReport(storedTimeZone);
    });
  }, []);

  const dailyMetrics = useMemo(
    () => filterDailyMetrics(report?.dailyVideoMetrics || [], timeRange),
    [report, timeRange],
  );
  const dailyDurationMetrics = useMemo(
    () => dailyMetrics.filter((item) => item.durationCount > 0),
    [dailyMetrics],
  );
  const dailyProgressMetrics = useMemo(
    () => dailyMetrics.filter((item) => item.progressCount > 0),
    [dailyMetrics],
  );
  const hasProgressSamples = (report?.progressSampleCount || 0) > 0;

  return (
    <div className="min-h-screen bg-gray-50/50 px-6 py-8 pb-20 text-gray-900 dark:bg-[#0a0a0a] dark:text-neutral-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">历史记录分析</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
              分析普通视频的长度、观看进度、分区和 UP 主。直播、番剧和专栏不会进入统计。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-900">
              {rangeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTimeRange(option.value)}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    timeRange === option.value
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => loadReport()}
              disabled={isLoading}
              title="刷新分析"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              刷新
            </button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="普通视频记录"
            value={String(report?.totalEvents || 0)}
            detail={`${report?.videoEvents || 0} 条有视频长度，${report?.progressSampleCount || 0} 条有观看进度`}
            icon={<PlayCircle className="h-5 w-5" />}
          />
          <StatCard
            title="平均视频长度"
            value={formatDuration(report?.averageDuration || 0)}
            detail="这些普通视频本身平均有多长"
            icon={<Clock className="h-5 w-5" />}
          />
          <StatCard
            title="平均观看进度"
            value={
              hasProgressSamples ? formatPercent(report?.averageProgressPercent || 0) : "无数据"
            }
            detail="哔哩哔哩标记已看完按 100%；没有进度的记录不参与计算"
            icon={<Percent className="h-5 w-5" />}
          />
        </div>

        <BoundaryAnalysisPanel analysis={report?.boundaryAnalysis} />

        <div className="grid gap-5">
          <DistributionBarChart
            title="观看进度分布"
            detail="把每条记录按“看到了全片的多少”分组，已看完计入 90-100%"
            items={report?.progressPercentBuckets || []}
            color="#fb7299"
          />
          <DistributionBarChart
            title="视频总长度分布"
            detail="把普通视频按视频本身的时长分组"
            items={report?.durationBuckets || []}
            color="#2563eb"
          />
        </div>

        <div className="grid gap-5">
          <DailyLineChart
            title="逐日估算观看时长"
            detail="当天普通视频总长度乘以当天平均观看进度，仅供参考"
            data={dailyMetrics.filter((item) => item.estimatedWatchSeconds > 0)}
            color="#16a34a"
            getValue={(item) => item.estimatedWatchSeconds}
            formatValue={formatCompactDuration}
            getDetails={(item) => [
              `估算值 ${formatExactDuration(item.estimatedWatchSeconds)}`,
              `当天视频总长 ${formatExactDuration(item.totalDuration)}`,
              `平均观看进度 ${formatPrecisePercent(item.averageProgressPercent)}`,
              `${item.count} 条普通视频记录`,
            ]}
            emptyText="暂无可估算观看时长的记录"
          />
          <DailyLineChart
            title="逐日平均视频长度"
            detail="每天看过的普通视频，平均每条有多长"
            data={dailyDurationMetrics}
            color="#2563eb"
            getValue={(item) => item.averageDuration}
            formatValue={formatCompactDuration}
            getDetails={(item) => [
              `平均值 ${formatExactDuration(item.averageDuration)}`,
              `当天视频总长 ${formatExactDuration(item.totalDuration)}`,
              `${item.durationCount} 条有视频长度`,
            ]}
          />
          <DailyLineChart
            title="逐日观看进度"
            detail="每天有进度的记录，平均看到了全片的多少"
            data={dailyProgressMetrics}
            color="#fb7299"
            getValue={(item) => item.averageProgressPercent}
            formatValue={formatPercent}
            maxValue={100}
            getDetails={(item) => [
              `平均值 ${formatPrecisePercent(item.averageProgressPercent)}`,
              `${item.progressCount} 条有观看进度`,
            ]}
            emptyText="暂无观看进度记录"
          />
          <DailyLineChart
            title="逐日跳出概率"
            detail="当天普通视频里，看了不超过 10% 且没有看完的比例"
            data={dailyMetrics.filter((item) => item.boundarySampleCount > 0)}
            color="#f59e0b"
            getValue={(item) => item.bounceProbability}
            formatValue={formatPercent}
            maxValue={100}
            getDetails={(item) => [
              `比例 ${formatPrecisePercent(item.bounceProbability)}`,
              `${item.bounceCount} / ${item.boundarySampleCount} 条`,
            ]}
            emptyText="暂无足够记录"
          />
          <DailyLineChart
            title="逐日看完概率"
            detail="当天普通视频里，距离结尾 10% 以内或哔哩哔哩标记已看完的比例"
            data={dailyMetrics.filter((item) => item.boundarySampleCount > 0)}
            color="#16a34a"
            getValue={(item) => item.completionProbability}
            formatValue={formatPercent}
            maxValue={100}
            getDetails={(item) => [
              `比例 ${formatPrecisePercent(item.completionProbability)}`,
              `${item.completionCount} / ${item.boundarySampleCount} 条`,
            ]}
            emptyText="暂无足够记录"
          />
        </div>

        <div className="grid gap-5">
          <TagPieChart
            title="常看的分区"
            icon={<Tag className="h-4 w-4" />}
            items={report?.topTags || []}
          />
          <RankingList
            title="常看的 UP 主"
            icon={<Users className="h-4 w-4" />}
            items={report?.topAuthors || []}
          />
        </div>
      </div>
    </div>
  );
};

export default Analytics;
