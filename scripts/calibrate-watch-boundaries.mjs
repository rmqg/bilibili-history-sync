#!/usr/bin/env node
import fs from "node:fs";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node scripts/calibrate-watch-boundaries.mjs <history-export.json|csv>");
  process.exit(1);
}

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift()?.map((header) => header.replace(/^\ufeff/, "")) || [];
  return rows
    .filter((record) => record.length > 1)
    .map((record) =>
      Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""])),
    );
};

const pickField = (record, ...keys) => {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return "";
};

const normalizeCsvRecord = (record) => {
  const progress = pickField(record, "看到的位置(秒)", "观看进度(秒)");
  const duration = pickField(record, "视频长度(秒)", "总时长(秒)");

  return {
    business: pickField(record, "哔哩哔哩类型代码", "B站类型代码", "原始内容类型") || "archive",
    progress: progress === "" ? undefined : Number(progress),
    duration: duration === "" ? undefined : Number(duration),
  };
};

const rawInput = fs.readFileSync(filePath, "utf8");
const input = filePath.toLowerCase().endsWith(".csv")
  ? parseCsv(rawInput).map(normalizeCsvRecord)
  : JSON.parse(rawInput);
const events = (Array.isArray(input) ? input : input.watchEvents || input.history || []).filter(
  (event) => event && event.business === "archive",
);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const quantile = (values, ratio) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * ratio;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  return lowerIndex === upperIndex ? lower : lower + (upper - lower) * (position - lowerIndex);
};
const roundToStep = (value, step) => Math.round(value / step) * step;

const chooseLowTailThreshold = (values, { fallback, min, max, cap, step }) => {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) return fallback;
  const lowTailValues = finiteValues.filter((value) => value >= 0 && value <= cap);
  const hasEnoughLowTail =
    lowTailValues.length >= Math.min(8, Math.ceil(finiteValues.length * 0.08));
  const sourceValues = hasEnoughLowTail ? lowTailValues : finiteValues;
  const ratio = hasEnoughLowTail ? 0.75 : 0.1;
  return clamp(roundToStep(quantile(sourceValues, ratio) || fallback, step), min, max);
};

const measuredSamples = events
  .map((event) => {
    if (event.progress === -1) return null;
    const duration = Number(event.duration);
    const progress = Number(event.progress);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    if (!Number.isFinite(progress) || progress <= 0) return null;
    const watchedSeconds = clamp(progress, 0, duration);
    const watchedPercent = clamp((watchedSeconds / duration) * 100, 0, 100);
    return {
      watchedSeconds,
      watchedPercent,
      remainingSeconds: clamp(duration - watchedSeconds, 0, duration),
      remainingPercent: clamp(100 - watchedPercent, 0, 100),
    };
  })
  .filter(Boolean);

const startPercentValues = measuredSamples.map((sample) => sample.watchedPercent);
const endPercentValues = measuredSamples.map((sample) => sample.remainingPercent);

const limits = {
  bouncePercentThreshold: chooseLowTailThreshold(startPercentValues, {
    fallback: 10,
    min: 1,
    max: 20,
    cap: 20,
    step: 0.5,
  }),
  completionRemainingPercentThreshold: chooseLowTailThreshold(endPercentValues, {
    fallback: 10,
    min: 0.5,
    max: 20,
    cap: 20,
    step: 0.5,
  }),
};

const summarize = (values) => ({
  count: values.length,
  p10: quantile(values, 0.1),
  p25: quantile(values, 0.25),
  p50: quantile(values, 0.5),
  p75: quantile(values, 0.75),
  p90: quantile(values, 0.9),
});

console.log(
  JSON.stringify(
    {
      sourceEvents: events.length,
      measuredSamples: measuredSamples.length,
      explicitCompleteCount: events.filter((event) => event.progress === -1).length,
      limits,
      diagnostics: {
        startPercent: summarize(startPercentValues),
        remainingPercent: summarize(endPercentValues),
      },
    },
    null,
    2,
  ),
);
