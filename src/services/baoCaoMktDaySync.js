/**
 * Đồng bộ bao_cao_mkt_day từ Danh sách báo cáo tay (detail_reports) + đơn orders.
 * Ca luôn ghi "Hết ca". Grain: ngày × mkt × sp × thị trường.
 *
 * Số đơn / hủy / Ok / DS: đếm live từ orders (gồm đơn 0đ không hủy) — khớp Số Đơn (TT) xem-bao-cao-mkt.
 * CPQC: lấy từ báo cáo tay (cộng dồn).
 */
import { REPORT_CA_HET } from '../constants/reportShifts';
import { supabase } from '../supabase/config';
import {
  computeMktOrderMetricsForReportRow,
  fetchMktOrdersInDateRange,
  prepareMktOrdersForRowMetrics,
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

function dayGroupKey(ngay, mkt, sp, thiTruong) {
  return [ngay, mkt, sp, thiTruong].map((x) => String(x || '').trim().toLowerCase()).join('|');
}

function parseCpqcFromReportRow(row) {
  const candidates = [
    row?.CPQC,
    row?.cpqc,
    row?.['CPQC theo TKQC'],
    row?.cpqc_theo_tkqc,
  ];
  for (const value of candidates) {
    if (value == null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  for (const value of candidates) {
    if (value == null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/**
 * Key báo cáo theo ca — dedupe trùng dòng trước khi cộng CPQC.
 * (ngày|mkt|sp|tt|caNorm)
 */
function reportDedupeKey(row, ymd) {
  const ngay = normalizeNgay(row?.['Ngày'] ?? row?.ngay) || ymd;
  const mkt = textField(row, ['Tên', 'ten', 'name']);
  const sp = textField(row, ['Sản_phẩm', 'Sản phẩm', 'san_pham', 'product']);
  const tt = textField(row, ['Thị_trường', 'Thị trường', 'thi_truong', 'market']);
  const ca = String(row?.ca ?? row?.['Ca'] ?? row?.shift ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const caNorm = !ca || (ca.includes('het') && ca.includes('giua')) || ca.includes('het')
    ? 'het'
    : ca.includes('giua')
      ? 'gua'
      : ca;
  return `${dayGroupKey(ngay, mkt, sp, tt)}|${caNorm}`;
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
 * Metrics đơn đếm từ orders (1 lần / mã đơn theo ngày×MKT×SP×TT); CPQC từ báo cáo tay.
 *
 * @param {object[]} detailRows
 * @param {string} ymd
 * @param {object[]} [ordersPrepared] đơn đã prepareMktOrdersForRowMetrics; nếu thiếu thì metrics = 0
 */
export function aggregateDetailReportsToBaoCaoMktDay(detailRows, ymd, ordersPrepared = null) {
  const byDay = new Map();
  const cpqcByDedupeKey = new Map();

  // 1) CPQC + khung dòng từ báo cáo tay (dedupe theo key có ca, rồi cộng theo ngày×mkt×sp×tt)
  for (const row of detailRows || []) {
    const ngay = normalizeNgay(row?.['Ngày'] ?? row?.ngay) || ymd;
    if (ngay !== ymd) continue;

    const mkt = textField(row, ['Tên', 'ten', 'name']);
    const sp = textField(row, ['Sản_phẩm', 'Sản phẩm', 'san_pham', 'product']);
    const thi_truong = textField(row, ['Thị_trường', 'Thị trường', 'thi_truong', 'market']);
    if (!mkt && !sp && !thi_truong) continue;

    const dk = reportDedupeKey(row, ymd);
    const cpqc = parseCpqcFromReportRow(row);
    // Trùng key+ca: cộng CPQC (khớp dedupe danh sách báo cáo tay)
    cpqcByDedupeKey.set(dk, (cpqcByDedupeKey.get(dk) || 0) + cpqc);

    const gk = dayGroupKey(ngay, mkt, sp, thi_truong);
    if (!byDay.has(gk)) {
      byDay.set(gk, {
        ngay,
        mkt: mkt || '',
        ca: REPORT_CA_HET,
        thi_truong: thi_truong || '',
        sp: sp || '',
        so_don: 0,
        ds: 0,
        so_don_huy: 0,
        ds_huy: 0,
        so_don_ok: 0,
        doanh_so_ok: 0,
        cpqc: 0,
      });
    }
  }

  for (const [dk, cpqc] of cpqcByDedupeKey) {
    const gk = dk.slice(0, dk.lastIndexOf('|'));
    const entry = byDay.get(gk);
    if (entry) entry.cpqc += cpqc;
  }

  // Thêm grain từ đơn của MKT đã có trên báo cáo tay (tránh sót SP/TT chỉ có trên orders)
  const reportMktKeys = new Set(
    Array.from(byDay.values()).map((e) =>
      String(e.mkt || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
    )
  );
  const orders = Array.isArray(ordersPrepared) ? ordersPrepared : [];
  for (const order of orders) {
    const mkt = String(order?.marketing_staff ?? '').trim();
    const mktKey = mkt.toLowerCase().replace(/\s+/g, ' ');
    if (!mkt || !reportMktKeys.has(mktKey)) continue;
    const ngay = normalizeNgay(order?.order_date) || ymd;
    if (ngay !== ymd) continue;
    const sp = String(order?.product ?? '').trim();
    const thi_truong = String(order?.country ?? '').trim();
    const gk = dayGroupKey(ngay, mkt, sp, thi_truong);
    if (byDay.has(gk)) continue;
    byDay.set(gk, {
      ngay,
      mkt,
      ca: REPORT_CA_HET,
      thi_truong,
      sp,
      so_don: 0,
      ds: 0,
      so_don_huy: 0,
      ds_huy: 0,
      so_don_ok: 0,
      doanh_so_ok: 0,
      cpqc: 0,
    });
  }

  // 2) Đếm đơn live theo grain ngày×mkt×sp×tt — bỏ lọc ca (mỗi order_code 1 lần, gồm 0đ)
  if (orders.length && byDay.size) {
    for (const entry of byDay.values()) {
      const pseudo = {
        Ngày: entry.ngay,
        Tên: entry.mkt,
        Sản_phẩm: entry.sp,
        Thị_trường: entry.thi_truong,
      };
      const metrics = computeMktOrderMetricsForReportRow(pseudo, orders, { ignoreCa: true });
      entry.so_don = Number(metrics.so_don_gross || 0);
      entry.so_don_huy = Number(metrics.so_don_huy || 0);
      entry.so_don_ok = Number(metrics.so_don_ok || 0);
      entry.doanh_so_ok = Number(metrics.doanh_so_ok || 0);
      entry.ds = Number(metrics.doanh_so_thuc_te || 0);
      entry.ds_huy = Number(metrics.doanh_so_huy || 0);
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
 * Xóa dữ liệu ngày đã chọn rồi ghi lại từ báo cáo tay + đơn live.
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
      ({ ngay, mkt, ca, thi_truong, sp, so_don, ds, so_don_huy, ds_huy, so_don_ok, doanh_so_ok, cpqc }) => ({
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
