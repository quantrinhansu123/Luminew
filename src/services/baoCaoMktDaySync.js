/**
 * Đồng bộ bao_cao_mkt_day từ Danh sách báo cáo tay (detail_reports).
 * Ca luôn ghi "Hết ca". Grain: ngày × mkt × sp × thị trường (cộng dồn mọi ca).
 */
import { REPORT_CA_HET } from '../constants/reportShifts';
import { supabase } from '../supabase/config';
import {
  buildMktDetailReportRowKey,
  mktRealValuesFallbackFromReportRow,
} from './mktRecalcSoDonThucTeFromOrders';

const TABLE = 'bao_cao_mkt_day';
const SOURCE_TABLE = 'detail_reports';

/** Cùng scope trang Danh sách báo cáo tay MKT (HN). */
const MKT_DETAIL_REPORTS_SCOPE_OR =
  'department.is.null,department.eq.MKT,department.neq.RD,Team.ilike.test';

function formatDateYmdLocal(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeNgay(raw) {
  if (!raw) return '';
  if (raw instanceof Date) return formatDateYmdLocal(raw);
  const s = String(raw).trim();
  if (!s) return '';
  if (s.includes('T')) return s.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.includes('/')) {
    const [d, m, y] = s.split('/');
    if (y && m && d) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? '' : formatDateYmdLocal(parsed);
}

function textField(row, keys) {
  for (const k of keys) {
    const v = row?.[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function metricsFromDetailRow(row) {
  const rv = mktRealValuesFallbackFromReportRow(row, { grossSoDon: false });
  const soDon = Number(
    rv.so_don_gross ?? Number(rv.so_don_thuc_te || 0) + Number(rv.so_don_huy || 0)
  );
  const dsHuy = Number(
    row?.['Doanh số hoàn hủy thực tế'] ??
      row?.doanh_so_hoan_huy_thuc_te ??
      row?.['Doanh số hủy'] ??
      0
  );
  return {
    so_don: soDon,
    ds: Number(rv.doanh_so_thuc_te || 0),
    so_don_huy: Number(rv.so_don_huy || 0),
    ds_huy: dsHuy,
    so_don_ok: Number(rv.so_don_ok || 0),
    doanh_so_ok: Number(rv.doanh_so_ok || 0),
  };
}

function dayGroupKey(ngay, mkt, sp, thiTruong) {
  return [ngay, mkt, sp, thiTruong].map((x) => String(x || '').trim().toLowerCase()).join('|');
}

async function fetchDetailReportsForDay(ymd) {
  const PAGE_SIZE = 500;
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(SOURCE_TABLE)
      .select('*')
      .gte('Ngày', ymd)
      .lte('Ngày', ymd)
      .or(MKT_DETAIL_REPORTS_SCOPE_OR)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

/**
 * Tổng hợp 1 ngày từ detail_reports → rows bao_cao_mkt_day (ca = Hết ca).
 */
export function aggregateDetailReportsToBaoCaoMktDay(detailRows, ymd) {
  const byDetailKey = new Map();

  for (const row of detailRows || []) {
    const ngay = normalizeNgay(row?.['Ngày'] ?? row?.ngay) || ymd;
    if (ngay !== ymd) continue;

    const k = buildMktDetailReportRowKey(row);
    const metrics = metricsFromDetailRow(row);
    const prev = byDetailKey.get(k);
    if (!prev) {
      byDetailKey.set(k, {
        ngay,
        mkt: textField(row, ['Tên', 'ten', 'name']),
        sp: textField(row, ['Sản_phẩm', 'Sản phẩm', 'san_pham', 'product']),
        thi_truong: textField(row, ['Thị_trường', 'Thị trường', 'thi_truong', 'market']),
        ...metrics,
      });
    } else {
      byDetailKey.set(k, {
        ...prev,
        so_don: Math.max(prev.so_don, metrics.so_don),
        ds: Math.max(prev.ds, metrics.ds),
        so_don_huy: Math.max(prev.so_don_huy, metrics.so_don_huy),
        ds_huy: Math.max(prev.ds_huy, metrics.ds_huy),
        so_don_ok: Math.max(prev.so_don_ok, metrics.so_don_ok),
        doanh_so_ok: Math.max(prev.doanh_so_ok, metrics.doanh_so_ok),
      });
    }
  }

  const byDay = new Map();
  for (const entry of byDetailKey.values()) {
    const gk = dayGroupKey(entry.ngay, entry.mkt, entry.sp, entry.thi_truong);
    const prev = byDay.get(gk);
    if (!prev) {
      byDay.set(gk, {
        ngay: entry.ngay,
        mkt: entry.mkt || '',
        ca: REPORT_CA_HET,
        thi_truong: entry.thi_truong || '',
        sp: entry.sp || '',
        so_don: entry.so_don,
        ds: entry.ds,
        so_don_huy: entry.so_don_huy,
        ds_huy: entry.ds_huy,
        so_don_ok: entry.so_don_ok,
        doanh_so_ok: entry.doanh_so_ok,
      });
    } else {
      prev.so_don += entry.so_don;
      prev.ds += entry.ds;
      prev.so_don_huy += entry.so_don_huy;
      prev.ds_huy += entry.ds_huy;
      prev.so_don_ok += entry.so_don_ok;
      prev.doanh_so_ok += entry.doanh_so_ok;
    }
  }

  return Array.from(byDay.values()).sort((a, b) => {
    const m = String(a.mkt || '').localeCompare(String(b.mkt || ''), 'vi');
    if (m) return m;
    const s = String(a.sp || '').localeCompare(String(b.sp || ''), 'vi');
    if (s) return s;
    return String(a.thi_truong || '').localeCompare(String(b.thi_truong || ''), 'vi');
  });
}

/**
 * Xóa dữ liệu ngày đã chọn rồi ghi lại từ báo cáo tay.
 * @param {string} ymd YYYY-MM-DD
 */
export async function syncBaoCaoMktDayFromManualReports(ymdRaw) {
  const ymd = String(ymdRaw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error('Ngày không hợp lệ (cần YYYY-MM-DD).');
  }

  const detailRows = await fetchDetailReportsForDay(ymd);
  const aggregated = aggregateDetailReportsToBaoCaoMktDay(detailRows, ymd);

  const { error: delError } = await supabase.from(TABLE).delete().eq('ngay', ymd);
  if (delError) throw delError;

  if (aggregated.length > 0) {
    const { error: insError } = await supabase.from(TABLE).insert(aggregated);
    if (insError) throw insError;
  }

  return {
    ymd,
    sourceRows: detailRows.length,
    upserted: aggregated.length,
    rows: aggregated,
  };
}

/** Đọc bảng bao_cao_mkt_day theo ngày (hoặc khoảng). */
export async function fetchBaoCaoMktDay({ startDate, endDate } = {}) {
  let query = supabase.from(TABLE).select('*').order('ngay', { ascending: false }).order('mkt', {
    ascending: true,
  });

  if (startDate) query = query.gte('ngay', startDate);
  if (endDate) query = query.lte('ngay', endDate);

  const { data, error } = await query.limit(2000);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
