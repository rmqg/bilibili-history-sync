export const INCREMENTAL_RESCAN_DAYS = 7;
export const FULL_RECONCILE_DAYS = 7;
export const SYNC_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

export const getIncrementalCutoff = (previousSyncAt: number, now: number) => {
  if (!Number.isFinite(previousSyncAt) || previousSyncAt <= 0) return 0;
  const safePreviousSyncAt = Math.min(previousSyncAt, now);
  return Math.floor((safePreviousSyncAt - INCREMENTAL_RESCAN_DAYS * 24 * 60 * 60 * 1000) / 1000);
};

export const shouldStopIncrementalScan = (
  viewTimes: number[],
  cutoff: number,
  isFullSync: boolean,
) => {
  if (isFullSync || cutoff <= 0 || viewTimes.length === 0) return false;
  const validViewTimes = viewTimes.filter((value) => Number.isFinite(value) && value > 0);
  return validViewTimes.length > 0 && Math.min(...validViewTimes) <= cutoff;
};

export const isFullReconcileDue = (lastFullSyncAt: number, now: number) =>
  !Number.isFinite(lastFullSyncAt) ||
  lastFullSyncAt <= 0 ||
  now - lastFullSyncAt >= FULL_RECONCILE_DAYS * 24 * 60 * 60 * 1000;

export const isSyncLockActive = (isSyncing: boolean, lockStartedAt: number, now: number) =>
  isSyncing &&
  Number.isFinite(lockStartedAt) &&
  lockStartedAt > 0 &&
  now - lockStartedAt < SYNC_LOCK_TIMEOUT_MS;
