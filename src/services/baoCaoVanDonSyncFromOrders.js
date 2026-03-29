import { supabase } from '../supabase/config';
import { getCheckResult } from '../utils/orderCheckAndVnd';

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

async function fetchAllOrdersForVanDonReport(startDate, endDate) {
  const PAGE_SIZE = 2000;
  const orders = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select(
        'order_date, delivery_staff, product, country, delivery_status, check_result, payment_status'
      )
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
 * Cột trạng thái: mode theo nhóm đơn cùng key.
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
    const k = buildVanDonReportKey(
      order.order_date,
      order.delivery_staff,
      order.product,
      order.country
    );
    if (!k || !normalizeDateStr(order.order_date)) continue;

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
  const previewRows = [];
  const PREVIEW_LIMIT = 50;

  for (const [key, { orders: list }] of byKey) {
    if (!list?.length) continue;

    const ngay = normalizeDateStr(list[0].order_date);
    const nhan_vien = pickMode(list.map((o) => o.delivery_staff)) ?? '';
    const san_pham = pickMode(list.map((o) => o.product)) ?? '';
    const thi_truong = pickMode(list.map((o) => o.country)) ?? '';

    const trang_thai_giao_hang = pickMode(list.map((o) => o.delivery_status)) ?? null;
    const ket_qua_check = pickMode(list.map((o) => getCheckResult(o))) ?? null;
    const trang_thai_thanh_toan = pickMode(list.map((o) => o.payment_status)) ?? null;

    const patch = {
      ngay,
      nhan_vien: nhan_vien || null,
      san_pham: san_pham || null,
      thi_truong: thi_truong || null,
      trang_thai_giao_hang,
      ket_qua_check,
      trang_thai_thanh_toan,
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
      upsertCount: updateRows.length + createRows.length,
      previewRows,
    };
  }

  const UPDATE_CONCURRENCY = 4;
  let touched = 0;

  for (let i = 0; i < updateRows.length; i += UPDATE_CONCURRENCY) {
    const chunk = updateRows.slice(i, i + UPDATE_CONCURRENCY);
    try {
      const results = await Promise.all(
        chunk.map((row) => {
          const { id, ...rest } = row;
          return supabase.from('bao_cao_van_don').update(rest).eq('id', id);
        })
      );
      const firstErr = results.find((r) => r.error)?.error;
      if (firstErr) throw firstErr;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      for (const row of chunk) {
        const { id, ...rest } = row;
        const { error } = await supabase.from('bao_cao_van_don').update(rest).eq('id', id);
        if (error) throw error;
      }
    }
    touched += chunk.length;
  }

  const INSERT_CHUNK = 200;
  for (let i = 0; i < createRows.length; i += INSERT_CHUNK) {
    const chunk = createRows.slice(i, i + INSERT_CHUNK);
    try {
      const { error } = await supabase.from('bao_cao_van_don').insert(chunk);
      if (error) throw error;
    } catch (e) {
      if (chunk.length <= 1) throw e;
      for (const row of chunk) {
        const { error: e2 } = await supabase.from('bao_cao_van_don').insert([row]);
        if (e2) throw e2;
      }
    }
    touched += chunk.length;
  }

  return {
    success: true,
    table: 'bao_cao_van_don',
    ordersFetched: orders?.length || 0,
    existingFetched: existingRows?.length || 0,
    updatedExisting: updateRows.length,
    createdMissing: createRows.length,
    upserted: touched,
    previewRows,
  };
}
