import { supabase } from '../supabase/config';
import { orderRangeToCreatedAtIsoBounds } from '../utils/dateParsing';

const PAGE_SIZE = 1000;
const SELECT_COLS =
  'order_code, customer_name, customer_phone, product, order_date, created_at';

async function fetchPaged(tableName, buildQuery, applyOrder) {
  const all = [];
  let from = 0;
  for (let page = 0; page < 500; page++) {
    let q = buildQuery();
    q = applyOrder(q);
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

function dedupeByOrderCode(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const code = r?.order_code != null ? String(r.order_code).trim() : '';
    const key = code || `__id_${r?.id ?? Math.random()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Tải order_code_hcm + toàn bộ orders trong khoảng ngày order_date;
 * thêm đơn order_date null nhưng created_at trong khoảng.
 */
export async function fetchHcmAndOrdersRowsForCrossDuplicate({ startDate, endDate }) {
  if (!startDate || !endDate) {
    throw new Error('Chọn đủ Từ ngày và Đến ngày (bật Áp dụng) trước khi tra trùng.');
  }

  const orderByOd = (q) =>
    q.order('order_date', { ascending: false }).order('order_code', { ascending: false });
  const orderByCreated = (q) =>
    q.order('created_at', { ascending: false }).order('order_code', { ascending: false });

  const withDate = (table) => {
    let q = supabase.from(table).select(SELECT_COLS);
    q = q.gte('order_date', startDate).lte('order_date', endDate);
    return q;
  };

  const hcmMain = await fetchPaged('order_code_hcm', () => withDate('order_code_hcm'), orderByOd);

  let hcmExtra = [];
  const { start: cStart, end: cEnd } = orderRangeToCreatedAtIsoBounds(startDate, endDate);
  if (cStart && cEnd) {
    hcmExtra = await fetchPaged(
      'order_code_hcm',
      () =>
        supabase
          .from('order_code_hcm')
          .select(SELECT_COLS)
          .is('order_date', null)
          .gte('created_at', cStart)
          .lte('created_at', cEnd),
      orderByCreated
    );
  }

  const ordersMain = await fetchPaged('orders', () => withDate('orders'), orderByOd);

  let ordersExtra = [];
  if (cStart && cEnd) {
    ordersExtra = await fetchPaged(
      'orders',
      () =>
        supabase
          .from('orders')
          .select(SELECT_COLS)
          .is('order_date', null)
          .gte('created_at', cStart)
          .lte('created_at', cEnd),
      orderByCreated
    );
  }

  return {
    hcmRows: dedupeByOrderCode([...hcmMain, ...hcmExtra]),
    ordersRows: dedupeByOrderCode([...ordersMain, ...ordersExtra]),
  };
}
