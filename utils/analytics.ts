import { getAllHistory } from "./db";
import { formatDateKey, TimeZonePreference } from "./timezone";
import { HistoryItem } from "./types";

export interface DailyVideoMetric {
  date: string;
  count: number;
  durationCount: number;
  totalDuration: number;
  progressCount: number;
  averageDuration: number;
  averageProgressPercent: number;
  estimatedWatchSeconds: number;
  boundarySampleCount: number;
  bounceCount: number;
  completionCount: number;
  bounceProbability: number;
  completionProbability: number;
}

export interface RankedMetric {
  name: string;
  count: number;
  progressCount: number;
  averageProgressPercent: number;
}

export interface DistributionBucket {
  label: string;
  count: number;
}

export interface WatchBoundaryAnalysis {
  sampleCount: number;
  measuredSampleCount: number;
  explicitCompleteCount: number;
  bouncePercentThreshold: number;
  completionRemainingPercentThreshold: number;
  bounceCount: number;
  bounceProbability: number;
  inferredCompletionCount: number;
  completionCount: number;
  completionProbability: number;
}

export interface AnalyticsReport {
  totalEvents: number;
  videoEvents: number;
  progressSampleCount: number;
  progressCoveragePercent: number;
  estimatedProgressSampleCount: number;
  estimatedProgressCoveragePercent: number;
  averageDuration: number;
  averageProgressPercent: number;
  completedRate: number;
  totalEstimatedProgress: number;
  boundaryAnalysis: WatchBoundaryAnalysis;
  progressPercentBuckets: DistributionBucket[];
  durationBuckets: DistributionBucket[];
  dailyVideoMetrics: DailyVideoMetric[];
  topTags: RankedMetric[];
  topAuthors: RankedMetric[];
}

type DailyAccumulator = {
  count: number;
  durationCount: number;
  totalDuration: number;
  progressCount: number;
  totalProgressPercent: number;
  boundarySampleCount: number;
  bounceCount: number;
  completionCount: number;
};

type RankAccumulator = {
  count: number;
  progressCount: number;
  totalProgressPercent: number;
};

type MeasuredProgressSample = {
  watchedPercent: number;
  remainingPercent: number;
};

type BoundaryResult = {
  isBounce: boolean;
  isComplete: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getDuration = (event: HistoryItem) => {
  const duration = Number(event.duration);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
};

const shouldIncludeInAnalytics = (event: HistoryItem) => event.business === "archive";

const WATCH_BOUNDARY_LIMITS = {
  bouncePercentThreshold: 10,
  completionRemainingPercentThreshold: 10,
};

const progressPercentBucketLabels = [
  "0-10%",
  "10-20%",
  "20-30%",
  "30-40%",
  "40-50%",
  "50-60%",
  "60-70%",
  "70-80%",
  "80-90%",
  "90-100%",
];

const durationBucketDefinitions = [
  { label: "<30 秒", maxSeconds: 30 },
  { label: "30秒-1分", maxSeconds: 60 },
  { label: "1-2 分钟", maxSeconds: 120 },
  { label: "2-3 分钟", maxSeconds: 180 },
  { label: "3-5 分钟", maxSeconds: 300 },
  { label: "5-8 分钟", maxSeconds: 480 },
  { label: "8-10 分钟", maxSeconds: 600 },
  { label: "10-15 分钟", maxSeconds: 900 },
  { label: "15-20 分钟", maxSeconds: 1200 },
  { label: "20-30 分钟", maxSeconds: 1800 },
  { label: "30-45 分钟", maxSeconds: 2700 },
  { label: "45-60 分钟", maxSeconds: 3600 },
  { label: ">60 分钟", maxSeconds: Infinity },
];

export const getProgressPercent = (event: HistoryItem) => {
  if (event.progress === -1) return 100;

  const duration = getDuration(event);
  if (!duration) return null;

  const progress = Number(event.progress);
  if (!Number.isFinite(progress) || progress <= 0) return null;

  return clamp((progress / duration) * 100, 0, 100);
};

const addRank = (
  map: Map<string, RankAccumulator>,
  name: string,
  progressPercent: number | null,
) => {
  const key = name.trim() || "未分类";
  const current = map.get(key) || { count: 0, progressCount: 0, totalProgressPercent: 0 };
  current.count += 1;
  if (progressPercent !== null) {
    current.progressCount += 1;
    current.totalProgressPercent += progressPercent;
  }
  map.set(key, current);
};

const toRankedMetrics = (map: Map<string, RankAccumulator>) =>
  Array.from(map.entries())
    .map(([name, value]) => ({
      name,
      count: value.count,
      progressCount: value.progressCount,
      averageProgressPercent:
        value.progressCount > 0 ? value.totalProgressPercent / value.progressCount : 0,
    }))
    .sort((a, b) => b.count - a.count || b.averageProgressPercent - a.averageProgressPercent)
    .slice(0, 8);

const hasKnownAuthor = (authorName?: string) => {
  const normalized = authorName?.trim();
  return !!normalized && normalized !== "未知 UP 主";
};

const createMeasuredProgressSample = (event: HistoryItem): MeasuredProgressSample | null => {
  if (event.progress === -1) return null;

  const duration = getDuration(event);
  const progress = Number(event.progress);
  if (!duration || !Number.isFinite(progress) || progress <= 0) return null;

  const watchedPercent = clamp((clamp(progress, 0, duration) / duration) * 100, 0, 100);

  return {
    watchedPercent,
    remainingPercent: clamp(100 - watchedPercent, 0, 100),
  };
};

const getBoundaryResult = (event: HistoryItem): BoundaryResult | null => {
  if (event.progress === -1) {
    return { isBounce: false, isComplete: true };
  }

  const sample = createMeasuredProgressSample(event);
  if (!sample) return null;

  const isComplete =
    sample.remainingPercent <= WATCH_BOUNDARY_LIMITS.completionRemainingPercentThreshold;
  return {
    isBounce: !isComplete && sample.watchedPercent <= WATCH_BOUNDARY_LIMITS.bouncePercentThreshold,
    isComplete,
  };
};

const buildBoundaryAnalysis = (events: HistoryItem[]): WatchBoundaryAnalysis => {
  const measuredSamples = events
    .map(createMeasuredProgressSample)
    .filter((sample): sample is MeasuredProgressSample => sample !== null);
  const explicitCompleteCount = events.filter((event) => event.progress === -1).length;
  const sampleCount = measuredSamples.length + explicitCompleteCount;
  const { bouncePercentThreshold, completionRemainingPercentThreshold } = WATCH_BOUNDARY_LIMITS;

  const boundaryResults = events
    .map(getBoundaryResult)
    .filter((result): result is BoundaryResult => result !== null);
  const completionCount = boundaryResults.filter((result) => result.isComplete).length;
  const bounceCount = boundaryResults.filter((result) => result.isBounce).length;

  return {
    sampleCount,
    measuredSampleCount: measuredSamples.length,
    explicitCompleteCount,
    bouncePercentThreshold,
    completionRemainingPercentThreshold,
    bounceCount,
    bounceProbability: sampleCount > 0 ? (bounceCount / sampleCount) * 100 : 0,
    inferredCompletionCount: completionCount - explicitCompleteCount,
    completionCount,
    completionProbability: sampleCount > 0 ? (completionCount / sampleCount) * 100 : 0,
  };
};

const buildProgressPercentBuckets = (events: HistoryItem[]): DistributionBucket[] => {
  const buckets = progressPercentBucketLabels.map((label) => ({ label, count: 0 }));

  events.forEach((event) => {
    const progressPercent = getProgressPercent(event);
    if (progressPercent === null) return;

    const bucketIndex = Math.min(Math.floor(progressPercent / 10), buckets.length - 1);
    buckets[bucketIndex].count += 1;
  });

  return buckets;
};

const buildDurationBuckets = (events: HistoryItem[]): DistributionBucket[] => {
  const buckets = durationBucketDefinitions.map(({ label }) => ({ label, count: 0 }));

  events.forEach((event) => {
    const duration = getDuration(event);
    if (!duration) return;

    const bucketIndex = durationBucketDefinitions.findIndex(
      ({ maxSeconds }) => duration < maxSeconds,
    );
    buckets[bucketIndex === -1 ? buckets.length - 1 : bucketIndex].count += 1;
  });

  return buckets;
};

export const buildAnalyticsReport = async (
  timeZone: TimeZonePreference = "system",
): Promise<AnalyticsReport> => {
  const events = (await getAllHistory()).filter(shouldIncludeInAnalytics);
  const videoEvents = events.filter((event) => getDuration(event) !== null);
  const boundaryAnalysis = buildBoundaryAnalysis(events);
  const progressPercentBuckets = buildProgressPercentBuckets(events);
  const durationBuckets = buildDurationBuckets(events);

  let totalDuration = 0;
  let totalEstimatedProgress = 0;
  let durationCount = 0;
  let progressCount = 0;
  let estimatedProgressSampleCount = 0;
  let totalProgressPercent = 0;
  let completedCount = 0;

  const dailyMap = new Map<string, DailyAccumulator>();
  const tagMap = new Map<string, RankAccumulator>();
  const authorMap = new Map<string, RankAccumulator>();

  events.forEach((event) => {
    const duration = getDuration(event);
    const progressPercent = getProgressPercent(event);
    if (!duration && progressPercent === null) return;

    if (duration) {
      durationCount += 1;
      totalDuration += duration;
    }

    if (progressPercent !== null) {
      progressCount += 1;
      totalProgressPercent += progressPercent;
      if (progressPercent >= 100) completedCount += 1;
    }

    if (duration && progressPercent !== null) {
      estimatedProgressSampleCount += 1;
      totalEstimatedProgress += clamp((duration * progressPercent) / 100, 0, duration);
    }

    const date = formatDateKey(Number(event.view_at) * 1000, timeZone);
    const daily = dailyMap.get(date) || {
      count: 0,
      durationCount: 0,
      totalDuration: 0,
      progressCount: 0,
      totalProgressPercent: 0,
      boundarySampleCount: 0,
      bounceCount: 0,
      completionCount: 0,
    };
    daily.count += 1;
    if (duration) {
      daily.durationCount += 1;
      daily.totalDuration += duration;
    }
    if (progressPercent !== null) {
      daily.progressCount += 1;
      daily.totalProgressPercent += progressPercent;
    }
    const boundaryResult = getBoundaryResult(event);
    if (boundaryResult) {
      daily.boundarySampleCount += 1;
      if (boundaryResult.isBounce) daily.bounceCount += 1;
      if (boundaryResult.isComplete) daily.completionCount += 1;
    }
    dailyMap.set(date, daily);

    addRank(tagMap, event.tag_name || "未分类", progressPercent);
    if (hasKnownAuthor(event.author_name)) {
      addRank(authorMap, event.author_name, progressPercent);
    }
  });

  const dailyVideoMetrics = Array.from(dailyMap.entries())
    .map(([date, value]) => {
      const averageProgressPercent =
        value.progressCount > 0 ? value.totalProgressPercent / value.progressCount : 0;

      return {
        date,
        count: value.count,
        durationCount: value.durationCount,
        totalDuration: value.totalDuration,
        progressCount: value.progressCount,
        averageDuration: value.durationCount > 0 ? value.totalDuration / value.durationCount : 0,
        averageProgressPercent,
        estimatedWatchSeconds:
          value.durationCount > 0 && value.progressCount > 0
            ? (value.totalDuration * averageProgressPercent) / 100
            : 0,
        boundarySampleCount: value.boundarySampleCount,
        bounceCount: value.bounceCount,
        completionCount: value.completionCount,
        bounceProbability:
          value.boundarySampleCount > 0 ? (value.bounceCount / value.boundarySampleCount) * 100 : 0,
        completionProbability:
          value.boundarySampleCount > 0
            ? (value.completionCount / value.boundarySampleCount) * 100
            : 0,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalEvents: events.length,
    videoEvents: videoEvents.length,
    progressSampleCount: progressCount,
    progressCoveragePercent: events.length > 0 ? (progressCount / events.length) * 100 : 0,
    estimatedProgressSampleCount,
    estimatedProgressCoveragePercent:
      videoEvents.length > 0 ? (estimatedProgressSampleCount / videoEvents.length) * 100 : 0,
    averageDuration: durationCount > 0 ? totalDuration / durationCount : 0,
    averageProgressPercent: progressCount > 0 ? totalProgressPercent / progressCount : 0,
    completedRate: progressCount > 0 ? (completedCount / progressCount) * 100 : 0,
    totalEstimatedProgress,
    boundaryAnalysis,
    progressPercentBuckets,
    durationBuckets,
    dailyVideoMetrics,
    topTags: toRankedMetrics(tagMap),
    topAuthors: toRankedMetrics(authorMap),
  };
};

export const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 分钟";

  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${totalMinutes} 分钟`;
  if (minutes === 0) return `${hours} 小时`;
  return `${hours} 小时 ${minutes} 分钟`;
};
