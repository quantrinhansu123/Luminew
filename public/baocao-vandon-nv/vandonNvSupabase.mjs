/**
 * Báo cáo vận đơn NV — đọc Supabase trực tiếp (orders / order_code_hcm, users, detail_reports).
 * Cấu hình: window.__SUPABASE_URL__ / __SUPABASE_ANON_KEY__ hoặc ./supabase-config.js
 */
import {
  fetchF3LegacyMapped,
  fetchHrForKpiOrEmpty,
  fetchVanDonDeliveryStaffDirectory,
  fetchMktFromDetailReports,
  resolveFetchDateRange,
  resolveBaocaoOrdersTable,
  ORDER_DEFAULT_SUPABASE_TABLE,
  DEFAULT_BAOCAO_MAX_ROWS,
} from './baocaoVandonNvCore.mjs';

const SUPABASE_URL_DEFAULT = 'https://gsjhsmxyxjyiqovauyrp.supabase.co';
const SUPABASE_ANON_KEY_DEFAULT =
  'sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy';

function getSupabaseUrl() {
  return String(window.__SUPABASE_URL__ || SUPABASE_URL_DEFAULT).trim();
}

function getSupabaseAnonKey() {
  return String(window.__SUPABASE_ANON_KEY__ || SUPABASE_ANON_KEY_DEFAULT).trim();
}

let clientPromise = null;

async function getClient() {
  if (!clientPromise) {
    clientPromise = import('https://esm.sh/@supabase/supabase-js@2').then(({ createClient }) => {
      const url = getSupabaseUrl();
      const key = getSupabaseAnonKey();
      if (!url || !key) {
        throw new Error('Thiếu cấu hình Supabase (URL hoặc anon key).');
      }
      return createClient(url, key);
    });
  }
  return clientPromise;
}

function getEmbedTableFromUrl() {
  if (typeof window === 'undefined') return '';
  try {
    return new URLSearchParams(window.location.search).get('table') || '';
  } catch {
    return '';
  }
}

function resolveOrdersTableName(dateRange) {
  const fromOpts = dateRange && dateRange.table;
  const fromUrl = getEmbedTableFromUrl();
  return resolveBaocaoOrdersTable(fromOpts || fromUrl || 'order_hcm');
}

function resolveOrderDateRange(dateRange) {
  const dr = dateRange || {};
  if (dr.full === true) {
    return { startDate: '', endDate: '' };
  }
  return resolveFetchDateRange(dr.startDate, dr.endDate);
}

/** Đơn — bảng `orders` hoặc `order_code_hcm` tùy `?table=` trên URL. */
export async function fetchOrderHcmRows(dateRange) {
  const range = resolveOrderDateRange(dateRange);
  const tableResolved = resolveOrdersTableName(dateRange);
  const tableOpt = tableResolved === ORDER_DEFAULT_SUPABASE_TABLE ? 'orders' : 'order_hcm';
  const hcmTeamOnly =
    tableResolved !== ORDER_DEFAULT_SUPABASE_TABLE && !!(dateRange && dateRange.hcmTeamOnly);
  const maxRows =
    dateRange && dateRange.maxRows != null
      ? Number(dateRange.maxRows)
      : DEFAULT_BAOCAO_MAX_ROWS;
  const sb = await getClient();
  const rows = await fetchF3LegacyMapped(sb, {
    startDate: range.startDate,
    endDate: range.endDate,
    maxRows,
    tableName: tableOpt,
    hcmTeamOnly,
  });
  return { rows, count: rows.length, startDate: range.startDate, endDate: range.endDate };
}

export async function fetchStaffDirectory() {
  const sb = await getClient();
  const tableResolved = resolveOrdersTableName({});
  return fetchVanDonDeliveryStaffDirectory(sb, tableResolved);
}

export async function fetchHrRows() {
  const sb = await getClient();
  return fetchHrForKpiOrEmpty(sb);
}

/** MKT KPI — chỉ Supabase detail_reports (không gọi n-api). */
export async function fetchMktRows() {
  const sb = await getClient();
  try {
    const rows = await fetchMktFromDetailReports(sb);
    return { data: rows, rows };
  } catch (e) {
    console.warn('[VandonNvSupabase] detail_reports:', e && e.message);
    return { data: [], rows: [] };
  }
}
