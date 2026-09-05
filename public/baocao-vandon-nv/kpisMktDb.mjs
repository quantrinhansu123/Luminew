/**
 * Đọc / ghi bảng public.kpis_mkt (KPI MKT đã chốt: ngày × NV × SP × TT).
 * Cache theo khoảng ngày — lọc SP/team/TT không gọi lại Supabase.
 */
const SUPABASE_URL_DEFAULT = 'https://gsjhsmxyxjyiqovauyrp.supabase.co';
const SUPABASE_ANON_KEY_DEFAULT =
  'sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy';

const SELECT_COLS =
  'report_date,employee_name,team,product,market,don_chot,ds_chot,don_huy,ds_huy,don_di,ds_di,don_thu_tien,dthu_tc,ship,dthu_kpi,ty_le_thu,cpqc';

let clientPromise = null;
/** @type {Map<string, { rows: Array<Record<string, unknown>>, fetchedAt: number }>} */
const rangeCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getSupabaseUrl() {
  return String(window.__SUPABASE_URL__ || SUPABASE_URL_DEFAULT).trim();
}

function getSupabaseAnonKey() {
  return String(window.__SUPABASE_ANON_KEY__ || SUPABASE_ANON_KEY_DEFAULT).trim();
}

async function getClient() {
  if (!clientPromise) {
    clientPromise = import('https://esm.sh/@supabase/supabase-js@2').then(({ createClient }) => {
      const url = getSupabaseUrl();
      const key = getSupabaseAnonKey();
      if (!url || !key) throw new Error('Thiếu cấu hình Supabase.');
      return createClient(url, key);
    });
  }
  return clientPromise;
}

function rangeKey(startDate, endDate) {
  return `${startDate}|${endDate}`;
}

export function clearKpisMktCache(startDate, endDate) {
  if (startDate && endDate) {
    rangeCache.delete(rangeKey(startDate, endDate));
    return;
  }
  rangeCache.clear();
}

/**
 * @param {string} startDate YYYY-MM-DD
 * @param {string} endDate YYYY-MM-DD
 * @param {{ force?: boolean }} [opts]
 */
export async function fetchKpisMktInRange(startDate, endDate, opts = {}) {
  const key = rangeKey(startDate, endDate);
  if (!opts.force) {
    const hit = rangeCache.get(key);
    if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
      return hit.rows;
    }
  }

  const sb = await getClient();
  const page = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await sb
      .from('kpis_mkt')
      .select(SELECT_COLS)
      .gte('report_date', startDate)
      .lte('report_date', endDate)
      .order('report_date', { ascending: true })
      .order('employee_name', { ascending: true })
      .range(from, from + page - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < page) break;
    from += page;
  }

  rangeCache.set(key, { rows: all, fetchedAt: Date.now() });
  return all;
}

/**
 * Ghi đè data đã chốt trong khoảng ngày: xóa rồi insert.
 *
 * @param {Array<Record<string, unknown>>} rows
 * @param {{ startDate: string, endDate: string }} range
 */
export async function upsertKpisMktRows(rows, range) {
  if (!Array.isArray(rows) || rows.length === 0) return { count: 0 };
  const startDate = String(range?.startDate || '').trim();
  const endDate = String(range?.endDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error('Thiếu startDate/endDate khi chốt kpis_mkt.');
  }

  const sb = await getClient();

  const { error: delErr } = await sb
    .from('kpis_mkt')
    .delete()
    .gte('report_date', startDate)
    .lte('report_date', endDate);
  if (delErr) throw delErr;

  const chunkSize = 200;
  let count = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await sb.from('kpis_mkt').insert(chunk).select('id');
    if (error) throw error;
    count += (data || []).length;
  }

  clearKpisMktCache(startDate, endDate);
  rangeCache.set(rangeKey(startDate, endDate), { rows: rows.slice(), fetchedAt: Date.now() });
  return { count };
}
