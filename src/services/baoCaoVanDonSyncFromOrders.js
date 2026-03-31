import { supabase } from '../supabase/config';
import { orderRangeToCreatedAtIsoBounds } from '../utils/dateParsing';
import { getCheckResult } from '../utils/orderCheckAndVnd';
import { isGiaoHangHistogramSyntheticKey } from '../utils/baoCaoVanDonFormat';

function normalizeStr(str) {
  if (str === null || str === undefined) return '';
  return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeDateStr(dateVal) {
  if (!dateVal) return '';
  if (dateVal instanceof Date) {
    const year = dateVal.getFullYear();
    const month = String(dateVal.getMonth() + 1).padStart(2, '0');
    const day = String(dateVal.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const s = String(dateVal).trim();
  if (!s) return '';
  if (s.includes('T')) return s.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      if (y && m && d) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return s;
}

/** Khóa logic: ngay|nhan_vien|san_pham|thi_truong (chuẩn hóa giống sales_reports). */
function buildVanDonReportKey(dateStr, nhanVien, sanPham, thiTruong) {
  return [
    normalizeDateStr(dateStr),
    normalizeStr(nhanVien),
    normalizeStr(sanPham),
    normalizeStr(thiTruong),
  ].join('|');
}

function hasNonEmptyDeliveryStaff(order) {
  return normalizeStr(order?.delivery_staff) !== '';
}

function pickMode(values) {
  const counts = new Map();
  for (const v of values) {
    const s = v == null ? '' : String(v).trim();
    if (!s) continue;
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  if (counts.size === 0) return null;
  let best = null;
  let bestN = -1;
  for (const [s, n] of counts) {
    if (n > bestN || (n === bestN && (best === null || s < best))) {
      best = s;
      bestN = n;
    }
  }
  return best;
}

/** jsonb lưu DB: { "Giá trị (hoặc (Trống))": số đơn } */
function countHistogram(rawValues) {
  const counts = new Map();
  for (const v of rawValues) {
    const s = v == null ? '' : String(v).trim();
    const key = s || '(Trống)';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries(counts);
}

function pickOrderTotalAmountVnd(order) {
  const v = order?.total_amount_vnd;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  return 0;
}

function paymentLabelIsCoBillOnly(label) {
  const s = String(label ?? '').trim().toLowerCase();
  if (!s) return false;
  if (s.includes('1 phần') && s.includes('bill')) return false;
  return s.includes('có bill');
}

/** jsonb cùng key như countHistogram: tổng total_amount_vnd (VNĐ) theo nhãn thanh toán. */
function sumMoneyHistogramByPaymentLabel(orders) {
  const sums = new Map();
  for (const o of orders || []) {
    const label = paymentLabelForHistogram(o);
    const key = label == null || String(label).trim() === '' ? '(Trống)' : String(label).trim();
    const amt = paymentLabelIsCoBillOnly(key) ? pickOrderTotalAmountVnd(o) : 0;
    sums.set(key, (sums.get(key) || 0) + amt);
  }
  return Object.fromEntries(sums);
}

/** Đếm bucket "Mã Tracking" chỉ theo cột orders.tracking_code (sau trim, khác rỗng). */
function orderHasTrackingCode(o) {
  const tc = o?.tracking_code;
  return tc != null && String(tc).trim() !== '';
}

/** Đã khai báo đơn vị vận chuyển (cột shipping_unit): có tên = đếm 1, trống = 0. */
function orderHasShippingUnitName(o) {
  const u = o?.shipping_unit;
  return u != null && String(u).trim() !== '';
}

/**
 * Histogram giao hàng: delivery_status + hai dòng tổng hợp (luôn ghi, đếm từ DB).
 * — "Mã Tracking": số đơn có tracking_code khác rỗng.
 * — "Lên vận hành": số đơn có shipping_unit khác rỗng.
 * Xóa mọi key delivery_status trùng nhãn tổng hợp để tránh trùng với đếm tracking_code.
 */
function buildTrangThaiGiaoHangHistogram(list) {
  const h = countHistogram(list.map((o) => o.delivery_status));
  for (const k of Object.keys(h)) {
    if (isGiaoHangHistogramSyntheticKey(k)) delete h[k];
  }
  let ma = 0;
  let lenVh = 0;
  for (const o of list || []) {
    if (orderHasTrackingCode(o)) ma += 1;
    if (orderHasShippingUnitName(o)) lenVh += 1;
  }
  h['Mã Tracking'] = ma;
  h['Lên vận hành'] = lenVh;
  return h;
}

/** Ngày lên đơn chuẩn; thiếu order_date thì lấy ngày từ created_at (khớp Danh sách đơn). */
function effectiveOrderDateYmd(order) {
  const od = normalizeDateStr(order?.order_date);
  if (od) return od;
  const ca = order?.created_at;
  if (ca == null) return '';
  const s = String(ca).trim();
  if (s.includes('T')) return s.split('T')[0];
  return normalizeDateStr(ca);
}

/** Trạng thái thanh toán: ưu tiên payment_status_detail (Trạng thái thu tiền trên UI), fallback payment_status. */
function paymentLabelForHistogram(order) {
  const d = order?.payment_status_detail;
  const p = order?.payment_status;
  const sd = d == null ? '' : String(d).trim();
  if (sd) return sd;
  return p == null ? '' : String(p).trim();
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `bcvd_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isNetworkError(e) {
  const raw = e?.message || String(e);
  return (
    e?.name === 'TypeError' ||
    (typeof raw === 'string' && raw.toLowerCase().includes('failed to fetch')) ||
    (typeof raw === 'string' && raw.toLowerCase().includes('networkerror'))
  );
}

/** DB chưa migration cột tiền — bỏ field khỏi payload để đồng bộ còn lại vẫn chạy. */
function omitTienTrangThaiThanhToan(row) {
  if (!row || typeof row !== 'object') return row;
  const { tien_trang_thai_thanh_toan: _drop, ...rest } = row;
  return rest;
}

function postgresClientErrorText(err) {
  return String(err?.message ?? err?.details ?? err?.hint ?? err ?? '');
}

function isMissingTienColumnError(err) {
  const msg = postgresClientErrorText(err).toLowerCase();
  if (!msg.includes('tien_trang_thai_thanh_toan')) return false;
  return (
    msg.includes('column') ||
    msg.includes('schema') ||
    msg.includes('does not exist') ||
    msg.includes('could not find')
  );
}

/** Chạy trong Supabase SQL Editor nếu báo thiếu cột tien_trang_thai_thanh_toan. */
export const SQL_ADD_BAO_CAO_VAN_DON_TIEN_COLUMN = `alter table public.bao_cao_van_don
  add column if not exists tien_trang_thai_thanh_toan jsonb not null default '{}'::jsonb;`;

const VAN_DON_REPORT_ORDER_SELECT =
  'order_code, order_date, created_at, delivery_staff, product, country, delivery_status, check_result, payment_status, payment_status_detail, total_amount_vnd, reconciled_vnd, tracking_code, shipping_unit';

async function fetchAllOrdersForVanDonReport(startDate, endDate) {
  const PAGE_SIZE = 2000;
  const orders = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select(VAN_DON_REPORT_ORDER_SELECT)
      .gte('order_date', startDate)
      .lte('order_date', endDate)
      .order('order_date', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    orders.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const { start: cStart, end: cEnd } = orderRangeToCreatedAtIsoBounds(startDate, endDate);
  if (cStart && cEnd) {
    const seen = new Set((orders || []).map((o) => o.order_code).filter(Boolean));
    let nFrom = 0;
    for (let page = 0; page < 500; page++) {
      const { data, error } = await supabase
        .from('orders')
        .select(VAN_DON_REPORT_ORDER_SELECT)
        .is('order_date', null)
        .gte('created_at', cStart)
        .lte('created_at', cEnd)
        .order('created_at', { ascending: false })
        .range(nFrom, nFrom + PAGE_SIZE - 1);

      if (error) {
        console.warn('[baoCaoVanDonSync] Không gộp đơn order_date null:', error.message);
        break;
      }
      const chunk = data || [];
      for (const row of chunk) {
        const oc = row.order_code;
        if (oc && !seen.has(oc)) {
          seen.add(oc);
          orders.push(row);
        }
      }
      if (chunk.length < PAGE_SIZE) break;
      nFrom += PAGE_SIZE;
    }
  }

  return orders;
}

async function fetchAllBaoCaoVanDonInRange(startDate, endDate) {
  const PAGE_SIZE = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('bao_cao_van_don')
      .select('*')
      .gte('ngay', startDate)
      .lte('ngay', endDate)
      .order('ngay', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

/**
 * Từ `orders` ghi `bao_cao_van_don`: upsert theo key
 * (ngay ← order_date, nhan_vien ← delivery_staff, san_pham ← product, thi_truong ← country).
 * Cột trạng thái: jsonb đếm số đơn theo từng giá trị trong nhóm key.
 * - trang_thai_thanh_toan: nhãn thanh toán; tien_trang_thai_thanh_toan: tổng total_amount_vnd cùng key.
 * - trang_thai_giao_hang: delivery_status + "Mã Tracking" (đếm tracking_code) + "Lên vận hành" (shipping_unit).
 */
export async function syncBaoCaoVanDonFromOrders({ startDate, endDate, dryRun = false } = {}) {
  const normalizedStart = normalizeDateStr(startDate);
  const normalizedEnd = normalizeDateStr(endDate);

  if (!normalizedStart || !normalizedEnd) {
    throw new Error('Khoảng ngày không hợp lệ. Vui lòng truyền startDate/endDate dạng YYYY-MM-DD.');
  }

  const [orders, existingRows] = await Promise.all([
    fetchAllOrdersForVanDonReport(normalizedStart, normalizedEnd),
    fetchAllBaoCaoVanDonInRange(normalizedStart, normalizedEnd),
  ]);

  const byKey = new Map();
  for (const order of orders || []) {
    // Chỉ tính các đơn đã có NV vận đơn; khi không còn nhân sự F3 thì báo cáo sẽ về 0.
    if (!hasNonEmptyDeliveryStaff(order)) continue;
    const ngayEff = effectiveOrderDateYmd(order);
    const k = buildVanDonReportKey(ngayEff, order.delivery_staff, order.product, order.country);
    if (!k || !ngayEff) continue;

    let bucket = byKey.get(k);
    if (!bucket) {
      bucket = {
        orders: [],
      };
      byKey.set(k, bucket);
    }
    bucket.orders.push(order);
  }

  const existingByKey = new Map();
  for (const r of existingRows || []) {
    const k = buildVanDonReportKey(r.ngay, r.nhan_vien, r.san_pham, r.thi_truong);
    if (!k || !r.id) continue;
    if (!existingByKey.has(k)) existingByKey.set(k, r);
  }

  const updateRows = [];
  const createRows = [];
  const deleteRows = [];
  const previewRows = [];
  const PREVIEW_LIMIT = 50;

  for (const r of existingRows || []) {
    const k = buildVanDonReportKey(r.ngay, r.nhan_vien, r.san_pham, r.thi_truong);
    if (!k || !r.id) continue;
    if (!byKey.has(k)) {
      deleteRows.push(r.id);
      if (previewRows.length < PREVIEW_LIMIT) {
        previewRows.push({
          ngay: r.ngay,
          nhan_vien: r.nhan_vien || null,
          san_pham: r.san_pham || null,
          thi_truong: r.thi_truong || null,
          action: 'delete',
        });
      }
    }
  }

  for (const [key, { orders: list }] of byKey) {
    if (!list?.length) continue;

    const ngay = effectiveOrderDateYmd(list[0]);
    const nhan_vien = pickMode(list.map((o) => o.delivery_staff)) ?? '';
    const san_pham = pickMode(list.map((o) => o.product)) ?? '';
    const thi_truong = pickMode(list.map((o) => o.country)) ?? '';

    const trang_thai_giao_hang = buildTrangThaiGiaoHangHistogram(list);
    const ket_qua_check = countHistogram(list.map((o) => getCheckResult(o)));
    const trang_thai_thanh_toan = countHistogram(list.map((o) => paymentLabelForHistogram(o)));
    const tien_trang_thai_thanh_toan = sumMoneyHistogramByPaymentLabel(list);

    const patch = {
      ngay,
      nhan_vien: nhan_vien || null,
      san_pham: san_pham || null,
      thi_truong: thi_truong || null,
      trang_thai_giao_hang,
      ket_qua_check,
      trang_thai_thanh_toan,
      tien_trang_thai_thanh_toan,
    };

    const existing = existingByKey.get(key);
    if (existing?.id) {
      updateRows.push({ id: existing.id, ...patch });
      if (previewRows.length < PREVIEW_LIMIT) {
        previewRows.push({
          ...patch,
          action: 'update',
        });
      }
    } else {
      const row = { id: makeId(), ...patch };
      createRows.push(row);
      if (previewRows.length < PREVIEW_LIMIT) {
        previewRows.push({
          ...patch,
          action: 'create',
        });
      }
    }
  }

  if (dryRun) {
    return {
      success: true,
      table: 'bao_cao_van_don',
      ordersFetched: orders?.length || 0,
      existingFetched: existingRows?.length || 0,
      updatedExisting: updateRows.length,
      createdMissing: createRows.length,
      deletedObsolete: deleteRows.length,
      upsertCount: updateRows.length + createRows.length,
      previewRows,
      tienColumnSkippedInSync: false,
    };
  }

  const UPDATE_CONCURRENCY = 4;
  let touched = 0;
  let tienColumnUsable = true;
  let tienColumnSkippedInSync = false;

  const stripPayloadForUpdate = (rest, stripTien) => {
    let p = rest;
    if (stripTien) p = omitTienTrangThaiThanhToan(p);
    return p;
  };

  for (let i = 0; i < updateRows.length; i += UPDATE_CONCURRENCY) {
    const chunk = updateRows.slice(i, i + UPDATE_CONCURRENCY);

    const runUpdates = (stripTien) =>
      Promise.all(
        chunk.map((row) => {
          const { id, ...rest } = row;
          const payload = stripPayloadForUpdate(rest, stripTien);
          return supabase.from('bao_cao_van_don').update(payload).eq('id', id);
        })
      );

    let results = await runUpdates(!tienColumnUsable);
    let firstErr = results.find((r) => r.error)?.error;

    for (let guard = 0; guard < 4 && firstErr; guard++) {
      if (tienColumnUsable && isMissingTienColumnError(firstErr)) {
        tienColumnUsable = false;
        tienColumnSkippedInSync = true;
        results = await runUpdates(true);
        firstErr = results.find((r) => r.error)?.error;
        continue;
      }
      break;
    }

    if (firstErr && isNetworkError(firstErr)) {
      for (const row of chunk) {
        const { id, ...rest } = row;
        let { error } = await supabase
          .from('bao_cao_van_don')
          .update(stripPayloadForUpdate(rest, !tienColumnUsable))
          .eq('id', id);
        for (let g = 0; g < 4 && error; g++) {
          if (tienColumnUsable && isMissingTienColumnError(error)) {
            tienColumnUsable = false;
            tienColumnSkippedInSync = true;
            ({ error } = await supabase
              .from('bao_cao_van_don')
              .update(stripPayloadForUpdate(rest, true))
              .eq('id', id));
            continue;
          }
          break;
        }
        if (error) throw error;
      }
    } else if (firstErr) {
      throw firstErr;
    }

    touched += chunk.length;
  }

  const mapRowForInsert = (r) => stripPayloadForUpdate(r, !tienColumnUsable);

  const INSERT_CHUNK = 200;
  for (let i = 0; i < createRows.length; i += INSERT_CHUNK) {
    const chunk = createRows.slice(i, i + INSERT_CHUNK);
    const rowsForInsert = chunk.map((r) => mapRowForInsert(r));

    let { error: insErr } = await supabase.from('bao_cao_van_don').insert(rowsForInsert);
    for (let guard = 0; guard < 4 && insErr; guard++) {
      if (tienColumnUsable && isMissingTienColumnError(insErr)) {
        tienColumnUsable = false;
        tienColumnSkippedInSync = true;
        ({ error: insErr } = await supabase.from('bao_cao_van_don').insert(chunk.map((r) => mapRowForInsert(r))));
        continue;
      }
      break;
    }

    if (insErr && chunk.length > 1) {
      for (const row of chunk) {
        let { error } = await supabase.from('bao_cao_van_don').insert([mapRowForInsert(row)]);
        for (let g = 0; g < 4 && error; g++) {
          if (tienColumnUsable && isMissingTienColumnError(error)) {
            tienColumnUsable = false;
            tienColumnSkippedInSync = true;
            ({ error } = await supabase.from('bao_cao_van_don').insert([mapRowForInsert(row)]));
            continue;
          }
          break;
        }
        if (error) throw error;
      }
      insErr = null;
    }

    if (insErr) throw insErr;
    touched += chunk.length;
  }

  const DELETE_CHUNK = 500;
  for (let i = 0; i < deleteRows.length; i += DELETE_CHUNK) {
    const chunk = deleteRows.slice(i, i + DELETE_CHUNK);
    let { error: delErr } = await supabase.from('bao_cao_van_don').delete().in('id', chunk);
    if (delErr) throw delErr;
    touched += chunk.length;
  }

  return {
    success: true,
    table: 'bao_cao_van_don',
    ordersFetched: orders?.length || 0,
    existingFetched: existingRows?.length || 0,
    updatedExisting: updateRows.length,
    createdMissing: createRows.length,
    deletedObsolete: deleteRows.length,
    upserted: touched,
    previewRows,
    tienColumnSkippedInSync,
  };
}
