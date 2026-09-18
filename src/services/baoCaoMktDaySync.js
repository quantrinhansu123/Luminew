/**
 * Đồng bộ bao_cao_mkt_day — cùng logic tab «Báo cáo sau huỷ» trên /xem-bao-cao-mkt:
 * 1) Phủ Số đơn TT / hủy / Ok / DS từ orders (gồm đơn 0đ không hủy)
 * 2) Lọc trùng key (ngày×MKT×SP×TT×ca) qua dedupeMktDetailReportRows
 * 3) Tổng hợp grain ngày×MKT×SP×TT (ca = Hết ca), cộng dồn các ca
 * Số đơn ghi vào bảng ngày = Số đơn TT (không gồm hủy).
 */
import { REPORT_CA_HET } from '../constants/reportShifts';
import { supabase } from '../supabase/config';
import {
  computeMktOrderMetricsForReportRow,
  dedupeMktDetailReportRows,
  fetchMktOrdersInDateRange,
  prepareMktOrdersForRowMetrics,
} from './mktRecalcSoDonThucTeFromOrders';
import { parseIntegerVi, parseMoneyNumber } from '../utils/mktNormalizeDetailReportRows';

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

function dayGroupKey(ngay, mkt, sp, thiTruong) {
  return [ngay, mkt, sp, thiTruong].map((x) => String(x || '').trim().toLowerCase()).join('|');
}

/** Khớp viewNsMoiNhanh: đơn team HCM không thuộc báo cáo HN. */
function filterHnOrdersForMktOverlay(orders) {
  return (orders || []).filter((order) => !/hcm/i.test(String(order?.team ?? '')));
}

/**
 * Phủ số liệu TT lên từng dòng báo cáo — cùng ý overlayHnActualsFromOrders (xem-bao-cao-mkt).
 */
export function overlayHnDetailReportsFromOrders(reportRows, ordersPrepared) {
  const orders = filterHnOrdersForMktOverlay(ordersPrepared);
  return (reportRows || []).map((row) => {
    const metrics = computeMktOrderMetricsForReportRow(row, orders);
    return {
      ...row,
      'Số đơn thực tế': metrics.so_don_thuc_te,
      so_don_thuc_te: metrics.so_don_thuc_te,
      'Doanh số TT': metrics.doanh_so_thuc_te,
      doanh_so_tt: metrics.doanh_so_thuc_te,
      'Số đơn hoàn hủy': metrics.so_don_huy,
      'Số đơn hoàn hủy thực tế': metrics.so_don_huy,
      so_don_hoan_huy: metrics.so_don_huy,
      so_don_hoan_huy_thuc_te: metrics.so_don_huy,
      'Doanh số hoàn hủy thực tế': metrics.doanh_so_huy || 0,
      doanh_so_hoan_huy_thuc_te: metrics.doanh_so_huy || 0,
      'Đơn Ok': metrics.so_don_ok,
      so_don_ok: metrics.so_don_ok,
      'Doanh số Ok': metrics.doanh_so_ok,
      doanh_so_ok: metrics.doanh_so_ok,
    };
  });
}

function metricsFromDedupedRow(row) {
  const soDonTt = parseIntegerVi(row?.['Số đơn thực tế'] ?? row?.so_don_thuc_te ?? 0);
  const soDonHuy = parseIntegerVi(
    row?.['Số đơn hoàn hủy'] ?? row?.['Số đơn hoàn hủy thực tế'] ?? row?.so_don_hoan_huy ?? 0
  );
  return {
    // Số đơn = Số đơn TT (không hủy, gồm 0đ) — khớp cột Số Đơn (TT) tab Báo cáo sau huỷ.
    so_don: soDonTt,
    ds: parseMoneyNumber(row?.['Doanh số TT'] ?? row?.doanh_so_tt ?? 0),
    so_don_huy: soDonHuy,
    ds_huy: parseMoneyNumber(
      row?.['Doanh số hoàn hủy thực tế'] ?? row?.doanh_so_hoan_huy_thuc_te ?? 0
    ),
    so_don_ok: parseIntegerVi(row?.['Đơn Ok'] ?? row?.['Số đơn Ok'] ?? row?.so_don_ok ?? 0),
    doanh_so_ok: parseMoneyNumber(row?.['Doanh số Ok'] ?? row?.doanh_so_ok ?? 0),
    cpqc: parseMoneyNumber(row?.['CPQC'] ?? row?.cpqc ?? 0),
  };
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
 * Tổng hợp 1 ngày → rows bao_cao_mkt_day (ca = Hết ca).
 * Pipeline: overlay orders → dedupe key → cộng theo ngày×mkt×sp×tt.
 *
 * @param {object[]} detailRows
 * @param {string} ymd
 * @param {object[]} [ordersPrepared]
 */
export function aggregateDetailReportsToBaoCaoMktDay(detailRows, ymd, ordersPrepared = null) {
  const dayRows = (detailRows || []).filter((row) => {
    const ngay = normalizeNgay(row?.['Ngày'] ?? row?.ngay) || ymd;
    return ngay === ymd;
  });

  const orders = Array.isArray(ordersPrepared) ? ordersPrepared : [];
  const actualized = orders.length
    ? overlayHnDetailReportsFromOrders(dayRows, orders)
    : dayRows;
  const deduped = dedupeMktDetailReportRows(actualized);

  const byDay = new Map();
  for (const row of deduped) {
    const ngay = normalizeNgay(row?.['Ngày'] ?? row?.ngay) || ymd;
    if (ngay !== ymd) continue;

    const mkt = textField(row, ['Tên', 'ten', 'name']);
    const sp = textField(row, ['Sản_phẩm', 'Sản phẩm', 'san_pham', 'product']);
    const thi_truong = textField(row, ['Thị_trường', 'Thị trường', 'thi_truong', 'market']);
    if (!mkt) continue;

    const metrics = metricsFromDedupedRow(row);
    const gk = dayGroupKey(ngay, mkt, sp, thi_truong);
    const prev = byDay.get(gk);
    if (!prev) {
      byDay.set(gk, {
        ngay,
        mkt,
        ca: REPORT_CA_HET,
        thi_truong: thi_truong || '',
        sp: sp || '',
        so_don: metrics.so_don,
        ds: metrics.ds,
        so_don_huy: metrics.so_don_huy,
        ds_huy: metrics.ds_huy,
        so_don_ok: metrics.so_don_ok,
        doanh_so_ok: metrics.doanh_so_ok,
        cpqc: metrics.cpqc,
      });
    } else {
      // Cộng dồn các ca khác nhau cùng ngày×MKT×SP×TT (sau khi đã lọc trùng key+ca).
      prev.so_don += metrics.so_don;
      prev.ds += metrics.ds;
      prev.so_don_huy += metrics.so_don_huy;
      prev.ds_huy += metrics.ds_huy;
      prev.so_don_ok += metrics.so_don_ok;
      prev.doanh_so_ok += metrics.doanh_so_ok;
      prev.cpqc += metrics.cpqc;
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
 * Xóa dữ liệu ngày đã chọn rồi ghi lại (overlay + lọc trùng key + tổng hợp).
 * @param {string} ymd YYYY-MM-DD
 */
export async function syncBaoCaoMktDayFromManualReports(ymdRaw) {
  const ymd = String(ymdRaw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error('Ngày không hợp lệ (cần YYYY-MM-DD).');
  }

  const [detailRows, ordersRaw] = await Promise.all([
    fetchDetailReportsForDay(ymd),
    fetchMktOrdersInDateRange(ymd, ymd, 'orders'),
  ]);
  const ordersPrepared = prepareMktOrdersForRowMetrics(ordersRaw);
  const aggregated = aggregateDetailReportsToBaoCaoMktDay(detailRows, ymd, ordersPrepared);

  const { error: delError } = await supabase.from(TABLE).delete().eq('ngay', ymd);
  if (delError) throw delError;

  if (aggregated.length > 0) {
    const rowsToInsert = aggregated.map(
      ({
        ngay,
        mkt,
        ca,
        thi_truong,
        sp,
        so_don,
        ds,
        so_don_huy,
        ds_huy,
        so_don_ok,
        doanh_so_ok,
        cpqc,
      }) => ({
        ngay,
        mkt,
        ca,
        thi_truong,
        sp,
        so_don,
        ds,
        so_don_huy,
        ds_huy,
        so_don_ok,
        doanh_so_ok,
        cpqc,
      })
    );
    const { error: insError } = await supabase.from(TABLE).insert(rowsToInsert);
    if (insError) throw insError;
  }

  const soDonTotal = aggregated.reduce((s, r) => s + (Number(r.so_don) || 0), 0);

  return {
    ymd,
    sourceRows: detailRows.length,
    dedupedHint: 'overlay+dedupeMktDetailReportRows',
    upserted: aggregated.length,
    soDonTotal,
    ordersLoaded: ordersPrepared.length,
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
