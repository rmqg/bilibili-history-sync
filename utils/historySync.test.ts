import { describe, expect, it } from "vitest";
import {
  FULL_RECONCILE_DAYS,
  getIncrementalCutoff,
  isFullReconcileDue,
  isSyncLockActive,
  shouldStopIncrementalScan,
  SYNC_LOCK_TIMEOUT_MS,
} from "./historySync";

const day = 24 * 60 * 60 * 1000;

describe("history sync boundaries", () => {
  it("rescans seven complete days before the previous successful sync", () => {
    const now = Date.UTC(2026, 6, 10, 12);
    expect(getIncrementalCutoff(now, now)).toBe(Math.floor((now - 7 * day) / 1000));
  });

  it("clamps a future last-sync value to the current time", () => {
    const now = Date.UTC(2026, 6, 10, 12);
    expect(getIncrementalCutoff(now + 3 * day, now)).toBe(Math.floor((now - 7 * day) / 1000));
  });

  it("keeps fetching until a page reaches the incremental cutoff", () => {
    const cutoff = 1_000;
    expect(shouldStopIncrementalScan([1_300, 1_200], cutoff, false)).toBe(false);
    expect(shouldStopIncrementalScan([1_100, 1_000], cutoff, false)).toBe(true);
  });

  it("never applies the cutoff during a full reconciliation", () => {
    expect(shouldStopIncrementalScan([500], 1_000, true)).toBe(false);
  });

  it("runs a full reconciliation every seven days", () => {
    const now = Date.UTC(2026, 6, 10, 12);
    expect(isFullReconcileDue(now - FULL_RECONCILE_DAYS * day + 1, now)).toBe(false);
    expect(isFullReconcileDue(now - FULL_RECONCILE_DAYS * day, now)).toBe(true);
    expect(isFullReconcileDue(0, now)).toBe(true);
  });

  it("recovers a stale synchronization lock", () => {
    const now = Date.now();
    expect(isSyncLockActive(true, now - SYNC_LOCK_TIMEOUT_MS + 1, now)).toBe(true);
    expect(isSyncLockActive(true, now - SYNC_LOCK_TIMEOUT_MS, now)).toBe(false);
    expect(isSyncLockActive(false, now, now)).toBe(false);
  });
});
