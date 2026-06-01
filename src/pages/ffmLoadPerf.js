/** Batch FFM — ưu tiên tải đủ dữ liệu, UI chỉ throttle re-render khi tải nền. */

export const FFM_RAM_MAX_ROWS = Number.MAX_SAFE_INTEGER;
export const FFM_BG_UI_THROTTLE_MS = 450;

export const FFM_MGT_MERGED_FIRST_BATCH_TOTAL = 2000;
export const FFM_MGT_MERGED_NEXT_BATCH_TOTAL = 4000;
export const FFM_ALL_MARKET_FIRST_BATCH_TOTAL = 2000;
export const FFM_ALL_MARKET_NEXT_BATCH_TOTAL = 4000;

export const FFM_HCM_FIRST_BATCH = 1000;
export const FFM_HCM_NEXT_BATCH = 2000;
export const FFM_HCM_ALL_FIRST_BATCH = 1000;
export const FFM_HCM_ALL_NEXT_BATCH = 2000;

export function isFfmAllMarket(marketParam) {
  return !String(marketParam ?? '').trim();
}

export function getFfmMgtMergedBatchPlan(marketParam) {
  const all = isFfmAllMarket(marketParam);
  return {
    firstTotal: all ? FFM_ALL_MARKET_FIRST_BATCH_TOTAL : FFM_MGT_MERGED_FIRST_BATCH_TOTAL,
    nextTotal: all ? FFM_ALL_MARKET_NEXT_BATCH_TOTAL : FFM_MGT_MERGED_NEXT_BATCH_TOTAL,
    autoBackgroundLoad: true,
    ramMaxRows: FFM_RAM_MAX_ROWS,
  };
}

export function getFfmHcmBatchPlan(marketParam) {
  const all = isFfmAllMarket(marketParam);
  return {
    firstSize: all ? FFM_HCM_ALL_FIRST_BATCH : FFM_HCM_FIRST_BATCH,
    nextSize: all ? FFM_HCM_ALL_NEXT_BATCH : FFM_HCM_NEXT_BATCH,
    autoBackgroundLoad: true,
    ramMaxRows: FFM_RAM_MAX_ROWS,
  };
}

export function isFfmMergeAtRamCap(mergeMap, ramMaxRows = FFM_RAM_MAX_ROWS) {
  return mergeMap.size >= ramMaxRows;
}

/**
 * Gom merge Map → sort → setAllData, throttle khi tải nền (tránh sort + filter 20 lần/giây).
 */
export function createFfmThrottledMergeSync({
  getMergeMap,
  assignSortedRows,
  runTransition,
  setAllData,
  getLoadGen,
  loadGenRef,
  throttleMs = FFM_BG_UI_THROTTLE_MS,
}) {
  let throttleTimer = null;

  const syncNow = () => {
    if (getLoadGen() !== loadGenRef.current) return 0;
    const list = assignSortedRows(Array.from(getMergeMap().values()));
    runTransition(() => setAllData(list));
    return list.length;
  };

  const scheduleSync = () => {
    if (throttleTimer != null) return;
    throttleTimer = setTimeout(() => {
      throttleTimer = null;
      syncNow();
    }, throttleMs);
  };

  const flush = () => {
    if (throttleTimer != null) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
    return syncNow();
  };

  const cancel = () => {
    if (throttleTimer != null) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
  };

  return { scheduleSync, flush, cancel };
}
