/** Đồng bộ khoảng ngày trên Dashboard quản trị (ô Từ/Đến cạnh tab) → các iframe báo cáo. */

export const DASHBOARD_GLOBAL_DATE_STORAGE_KEY = 'lumi_oms_dashboard_global_date_range';

export const DASHBOARD_GLOBAL_DATE_MESSAGE_TYPE = 'LUMI_OMS_DASHBOARD_GLOBAL_DATE_RANGE';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDashboardYmd(s) {
  return typeof s === 'string' && YMD_RE.test(s.trim());
}

export function readDashboardGlobalDateRange() {
  try {
    const raw = localStorage.getItem(DASHBOARD_GLOBAL_DATE_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    const from = String(o?.from ?? '').trim();
    const to = String(o?.to ?? '').trim();
    if (!isValidDashboardYmd(from) || !isValidDashboardYmd(to)) return null;
    return { from, to };
  } catch {
    return null;
  }
}

export function writeDashboardGlobalDateRange(from, to) {
  if (!isValidDashboardYmd(from) || !isValidDashboardYmd(to)) return;
  try {
    localStorage.setItem(DASHBOARD_GLOBAL_DATE_STORAGE_KEY, JSON.stringify({ from, to }));
  } catch {
    /* private mode / quota */
  }
}

/** Trích { from, to } từ postMessage (parent Dashboard). */
export function parseDashboardGlobalDateMessage(data) {
  if (!data || data.type !== DASHBOARD_GLOBAL_DATE_MESSAGE_TYPE) return null;
  const from = String(data.from ?? '').trim();
  const to = String(data.to ?? '').trim();
  if (!isValidDashboardYmd(from) || !isValidDashboardYmd(to)) return null;
  return { from, to };
}
