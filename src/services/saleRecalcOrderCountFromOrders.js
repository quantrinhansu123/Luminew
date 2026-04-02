import { supabase } from '../supabase/config';
import { buildEmailByNameLookup, emailFromName } from '../utils/emailFromName';
import { getCheckResult, isCheckResultHuy, orderAmountVnd } from '../utils/orderCheckAndVnd';

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

function nextDateStr(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse ca để nhận diện dòng sales_reports thuộc slot nào.
 * Lưu ý: aggregate số liệu bên dưới đã bỏ điều kiện ca (mọi ca dùng chung cùng một tổng theo key).
 */
function orderShiftToGroups(shiftVal) {
  const shiftLower = normalizeStr(shiftVal);
  const groups = [];
  if (!shiftLower) return groups;
  if (shiftLower.includes('hết ca') || shiftLower.includes('het ca')) groups.push('Hết ca');
  if (shiftLower.includes('giữa ca') || shiftLower.includes('giua ca')) groups.push('Giữa ca');
  return groups;
}

/** Key giống detail_reports/MKT nhưng dùng cột sales_reports: date, name, product, market */
function buildKey(dateStr, name, product, market) {
  return [
    normalizeDateStr(dateStr),
    normalizeStr(name),
    normalizeStr(product),
    normalizeStr(market),
  ].join('|');
}

function orderHasGoTracking(order) {
  const t = String(
    order?.tracking_code ||
      order?.trackingCode ||
      order?.tracking ||
      order?.ma_tracking ||
      order?.maTracking ||
      ''
  ).trim();
  return t !== '';
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `sale_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function fetchAllSalesReportsInRange(
  startDate,
  endDate,
  reportsTable = 'sales_reports',
  teamIn = null
) {
  const PAGE_SIZE = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    let q = supabase
      .from(reportsTable)
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate);
    if (teamIn?.length) q = q.in('team', teamIn);
    const { data, error } = await q.order('date', { ascending: false }).range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function fetchAllOrdersInRangeForSale(startDate, endDate, ordersTable = 'orders') {
  const PAGE_SIZE = 2000;
  const orders = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(ordersTable)
      .select(
        'order_code, order_date, sale_staff, product, country, shift, team, check_result, payment_status, total_amount_vnd, total_vnd, reconciled_vnd, goods_amount, sale_price'
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

async function fetchSalesReportsForExactKeys(exactKeys, reportsTable = 'sales_reports', teamIn = null) {
  const rows = [];
  const seen = new Set();
  for (const k of exactKeys) {
    let q = supabase
      .from(reportsTable)
      .select('*')
      .eq('date', k.date)
      .eq('name', k.name)
      .eq('product', k.product)
      .eq('market', k.market);
    if (teamIn?.length) q = q.in('team', teamIn);
    const { data, error } = await q;
    if (error) throw error;
    for (const r of data || []) {
      const id = r?.id ? String(r.id) : `${r?.date || ''}|${r?.name || ''}|${r?.product || ''}|${r?.market || ''}|${r?.shift || ''}`;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(r);
    }
  }
  return rows;
}

async function fetchOrdersForExactKeysForSale(exactKeys, ordersTable = 'orders') {
  const rows = [];
  const seen = new Set();
  for (const k of exactKeys) {
    const next = nextDateStr(k.date);
    const { data, error } = await supabase
      .from(ordersTable)
      .select(
        'order_code, order_date, sale_staff, product, country, shift, team, check_result, payment_status, total_amount_vnd, total_vnd, reconciled_vnd, goods_amount, sale_price'
      )
      .gte('order_date', k.date)
      .lt('order_date', next)
      .eq('sale_staff', k.name)
      .eq('product', k.product)
      .eq('country', k.market);
    if (error) throw error;
    for (const r of data || []) {
      const id = String(r?.order_code || '');
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      rows.push(r);
    }
  }
  return rows;
}

async function fetchHumanResourceEmailLookup() {
  const { data, error } = await supabase.from('human_resources').select('"Họ Và Tên", email');

  if (error) {
    console.warn('[Sale recalc order_count] human_resources:', error.message);
    return buildEmailByNameLookup([]);
  }
  return buildEmailByNameLookup(data || []);
}

/** Lỗi fetch/Supabase kiểu mạng — dùng fallback chạy từng request (giống mktRecalc). */
function isNetworkError(e) {
  const raw = e?.message || String(e);
  return (
    e?.name === 'TypeError' ||
    (typeof raw === 'string' && raw.toLowerCase().includes('failed to fetch')) ||
    (typeof raw === 'string' && raw.toLowerCase().includes('networkerror'))
  );
}

/**
 * Giống Báo cáo MKT (`createMissingRows`): khi true, recalc vừa UPDATE dòng đã có,
 * vừa INSERT dòng mới cho key (ngày + tên + SP + TT + ca) có trong orders nhưng chưa có trong sales_reports.
 */
export const SALES_REPORTS_AUTO_CREATE_MISSING_ROWS = true;

/**
 * Từ `orders` ghi `sales_reports`: order_count, revenue_actual, order_cancel_count_actual, revenue_cancel_actual (tổng VND các đơn hủy).
 * Tạo dòng thiếu: mặc định theo {@link SALES_REPORTS_AUTO_CREATE_MISSING_ROWS} (có thể override từng tham số).
 */
export async function recalcSaleOrderCountFromOrders({
  startDate,
  endDate,
  dryRun = false,
  createMissingForHetCa = SALES_REPORTS_AUTO_CREATE_MISSING_ROWS,
  // Chỉ tính đúng các key này (không quét key khác trong ngày) khi có truyền vào.
  exactKeys = null,
  reportsTable = 'sales_reports',
  ordersTable = 'orders',
  /** Chỉ đọc/ghi sales_reports thuộc các team này (vd. CSKH-HCM). null = mọi team. */
  reportsTeamIn = null,
  /** Team ghi cho dòng INSERT mới khi orders không có team ∈ reportsTeamIn. */
  defaultTeamForNewRows = null,
} = {}) {
  const normalizedStart = normalizeDateStr(startDate);
  const normalizedEnd = normalizeDateStr(endDate);

  if (!normalizedStart || !normalizedEnd) {
    throw new Error('Khoảng ngày không hợp lệ. Vui lòng truyền startDate/endDate dạng YYYY-MM-DD.');
  }

  const normalizedExactKeys = Array.isArray(exactKeys)
    ? exactKeys
        .map((k) => ({
          date: normalizeDateStr(k?.date),
          name: String(k?.name || '').trim(),
          product: String(k?.product || '').trim(),
          market: String(k?.market || '').trim(),
        }))
        .filter((k) => k.date && k.name && k.product && k.market)
    : [];

  const teamScope = Array.isArray(reportsTeamIn) && reportsTeamIn.length > 0 ? reportsTeamIn : null;

  // Tuần tự — tránh mở quá nhiều kết nối cùng lúc (dễ Failed to fetch trên mạng yếu / giới hạn trình duyệt).
  const reports = normalizedExactKeys.length > 0
    ? await fetchSalesReportsForExactKeys(normalizedExactKeys, reportsTable, teamScope)
    : await fetchAllSalesReportsInRange(normalizedStart, normalizedEnd, reportsTable, teamScope);
  const orders = normalizedExactKeys.length > 0
    ? await fetchOrdersForExactKeysForSale(normalizedExactKeys, ordersTable)
    : await fetchAllOrdersInRangeForSale(normalizedStart, normalizedEnd, ordersTable);
  const hrEmailLookup = await fetchHumanResourceEmailLookup();

  // Bỏ điều kiện ca: cùng một key thì Hết ca/Giữa ca dùng cùng tổng.
  // Key -> { count, revenueVnd, cancelCount, cancelRevenueVnd, sample }
  const countsAllByKey = new Map();

  for (const order of orders || []) {
    const key = buildKey(order.order_date, order.sale_staff, order.product, order.country);
    if (!key || !normalizeStr(order.sale_staff)) continue;

    const vnd = orderAmountVnd(order);
    const huy = isCheckResultHuy(getCheckResult(order));
    const goOrder = !huy && orderHasGoTracking(order);

    const exAll = countsAllByKey.get(key);
    if (exAll) {
      exAll.count += 1;
      exAll.revenueVnd += vnd;
      if (huy) {
        exAll.cancelCount += 1;
        exAll.cancelRevenueVnd += vnd;
      }
      if (goOrder) {
        exAll.goCount = (exAll.goCount || 0) + 1;
        exAll.goRevenueVnd = (exAll.goRevenueVnd || 0) + vnd;
      }
    } else {
      countsAllByKey.set(key, {
        count: 1,
        revenueVnd: vnd,
        cancelCount: huy ? 1 : 0,
        cancelRevenueVnd: huy ? vnd : 0,
        goCount: goOrder ? 1 : 0,
        goRevenueVnd: goOrder ? vnd : 0,
        sample: {
          date: normalizeDateStr(order.order_date),
          name: String(order.sale_staff || '').trim(),
          product: String(order.product || '').trim(),
          market: String(order.country || '').trim(),
          team: String(order.team || '').trim(),
        },
      });
    }

  }

  const existingByShiftKey = new Set();
  const reportRows = (reports || []).filter((r) => orderShiftToGroups(r.shift).length > 0);

  for (const r of reportRows) {
    const key = buildKey(r.date, r.name, r.product, r.market);
    if (!key) continue;
    const gs = orderShiftToGroups(r.shift);
    if (gs.length === 1) {
      existingByShiftKey.add(`${gs[0]}|${key}`);
    } else if (gs.length === 2) {
      existingByShiftKey.add(`Hết ca|${key}`);
    }
  }

  const updateRows = [];
  const createRows = [];
  const previewRows = [];
  const PREVIEW_LIMIT = 50;

  for (const r of reportRows) {
    const gs = orderShiftToGroups(r.shift);
    if (!gs.length) continue;
    const key = buildKey(r.date, r.name, r.product, r.market);
    const primaryGroup = gs.length === 2 ? 'Hết ca' : gs[0];
    const agg = countsAllByKey.get(key);
    const count = agg?.count || 0;
    const revenueActual = agg?.revenueVnd ?? 0;
    const cancelActual = agg?.cancelCount ?? 0;
    const revenueCancelActual = agg?.cancelRevenueVnd ?? 0;
    const goCount = agg?.goCount ?? 0;
    const goRevenue = agg?.goRevenueVnd ?? 0;

    if (!r.id) continue;
    const resolvedEmail = emailFromName(r.name, hrEmailLookup);
    const patch = {
      id: r.id,
      order_count: count,
      revenue_actual: revenueActual,
      order_cancel_count: cancelActual,
      order_cancel_count_actual: cancelActual,
      revenue_cancel_actual: revenueCancelActual,
      order_go: goCount,
      revenue_go_actual: goRevenue,
    };
    if (gs.length === 2) {
      patch.shift = 'Hết ca';
    }
    if (resolvedEmail && !String(r.email ?? '').trim()) {
      patch.email = resolvedEmail;
    }
    updateRows.push(patch);

    if (previewRows.length < PREVIEW_LIMIT) {
      previewRows.push({
        ca: primaryGroup,
        Ngày: normalizeDateStr(r.date),
        Tên: String(r.name || '').trim(),
        Sản_phẩm: String(r.product || '').trim(),
        Thị_trường: String(r.market || '').trim(),
        order_count: count,
        revenue_actual: revenueActual,
        order_cancel_count_actual: cancelActual,
        revenue_cancel_actual: revenueCancelActual,
        action: 'update',
      });
    }
  }

  // Chỉ tạo dòng thiếu cho "Hết ca" (không auto-create "Giữa ca").
  for (const group of ['Hết ca']) {
    if (group === 'Hết ca' && !createMissingForHetCa) continue;

    const mapForGroup = countsAllByKey;
    for (const [key, entry] of mapForGroup.entries()) {
      const exists = existingByShiftKey.has(`${group}|${key}`);
      if (exists) continue;

      const email = emailFromName(entry.sample.name, hrEmailLookup) || '';

      const orderTeam = String(entry.sample.team || '').trim();
      let teamForRow = orderTeam || 'Sale';
      if (teamScope?.length) {
        if (orderTeam && teamScope.includes(orderTeam)) teamForRow = orderTeam;
        else if (defaultTeamForNewRows && teamScope.includes(String(defaultTeamForNewRows).trim()))
          teamForRow = String(defaultTeamForNewRows).trim();
        else teamForRow = teamScope[0];
      }

      const row = {
        id: makeId(),
        name: entry.sample.name,
        email: email || null,
        team: teamForRow,
        date: entry.sample.date,
        shift: group,
        product: entry.sample.product || null,
        market: entry.sample.market || null,
        order_count: entry.count,
        revenue_actual: entry.revenueVnd ?? 0,
        order_cancel_count: entry.cancelCount ?? 0,
        order_cancel_count_actual: entry.cancelCount ?? 0,
        revenue_cancel_actual: entry.cancelRevenueVnd ?? 0,
        order_go: entry.goCount ?? 0,
        revenue_go_actual: entry.goRevenueVnd ?? 0,
      };
      createRows.push(row);

      if (previewRows.length < PREVIEW_LIMIT) {
        previewRows.push({
          ca: group,
          Ngày: row.date,
          Tên: row.name,
          Sản_phẩm: row.product || '',
          Thị_trường: row.market || '',
          order_count: row.order_count,
          revenue_actual: row.revenue_actual,
          order_cancel_count_actual: row.order_cancel_count_actual,
          revenue_cancel_actual: row.revenue_cancel_actual,
          action: 'create',
        });
      }
    }
  }

  if (dryRun) {
    return {
      success: true,
      table: reportsTable,
      field: 'order_count, revenue_actual, order_cancel_count_actual, revenue_cancel_actual',
      reportsFetched: reportRows.length,
      ordersFetched: orders?.length || 0,
      updatedExisting: updateRows.length,
      createdMissing: createRows.length,
      upsertCount: updateRows.length + createRows.length,
      previewRows,
    };
  }

  // Đồng thời thấp (giống detail_reports/MKT); lỗi mạng → cập nhật từng dòng.
  const UPDATE_CONCURRENCY = 4;
  let touched = 0;

  for (let i = 0; i < updateRows.length; i += UPDATE_CONCURRENCY) {
    const chunk = updateRows.slice(i, i + UPDATE_CONCURRENCY);
    try {
      const results = await Promise.all(
        chunk.map((row) => {
          const { id, ...rest } = row;
          return supabase.from(reportsTable).update(rest).eq('id', id);
        })
      );
      const firstErr = results.find((r) => r.error)?.error;
      if (firstErr) throw firstErr;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      for (const row of chunk) {
        const { id, ...rest } = row;
        const { error } = await supabase.from(reportsTable).update(rest).eq('id', id);
        if (error) throw error;
      }
    }
    touched += chunk.length;
  }

  const INSERT_CHUNK = 200;
  for (let i = 0; i < createRows.length; i += INSERT_CHUNK) {
    const chunk = createRows.slice(i, i + INSERT_CHUNK);
    try {
      const { error } = await supabase.from(reportsTable).insert(chunk);
      if (error) throw error;
    } catch (e) {
      if (chunk.length <= 1) throw e;
      for (const row of chunk) {
        const { error: e2 } = await supabase.from(reportsTable).insert([row]);
        if (e2) throw e2;
      }
    }
    touched += chunk.length;
  }

  return {
    success: true,
    table: reportsTable,
    field: 'order_count, revenue_actual, order_cancel_count_actual, revenue_cancel_actual',
    reportsFetched: reportRows.length,
    ordersFetched: orders?.length || 0,
    updatedExisting: updateRows.length,
    createdMissing: createRows.length,
    upserted: touched,
    previewRows,
  };
}

export async function recalcSaleOrderCountAfterOrderSave({
  newOrderDate,
  previousOrderDate,
  newOrderKey,
  previousOrderKey,
  createMissingForHetCa = SALES_REPORTS_AUTO_CREATE_MISSING_ROWS,
} = {}) {
  const exactKeys = [newOrderKey, previousOrderKey]
    .filter(Boolean)
    .map((k) => ({
      date: normalizeDateStr(k.date),
      name: String(k.name || '').trim(),
      product: String(k.product || '').trim(),
      market: String(k.market || '').trim(),
    }))
    .filter((k) => k.date && k.name && k.product && k.market);

  if (exactKeys.length > 0) {
    const dedupMap = new Map();
    exactKeys.forEach((k) => {
      const id = buildKey(k.date, k.name, k.product, k.market);
      if (!dedupMap.has(id)) dedupMap.set(id, k);
    });
    const deduped = Array.from(dedupMap.values());
    const dates = deduped.map((k) => k.date).sort();
    return recalcSaleOrderCountFromOrders({
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      dryRun: false,
      createMissingForHetCa,
      exactKeys: deduped,
    });
  }

  const n = normalizeDateStr(newOrderDate);
  const p = previousOrderDate != null && previousOrderDate !== '' ? normalizeDateStr(previousOrderDate) : '';
  if (!n && !p) return { skipped: true, reason: 'no_dates' };
  const dates = [n, p].filter(Boolean).sort();
  return recalcSaleOrderCountFromOrders({
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    dryRun: false,
    createMissingForHetCa,
  });
}
