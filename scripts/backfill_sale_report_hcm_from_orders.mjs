#!/usr/bin/env node
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const REPORT_CA_COMBINED = 'Giữa ca,Hết ca';

function argValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return '';
  return process.argv[idx + 1] || '';
}

function argValues(name) {
  const vals = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === name && process.argv[i + 1]) vals.push(process.argv[i + 1]);
  }
  return vals;
}

const APPLY = process.argv.includes('--apply');
const CREATE_MISSING = process.argv.includes('--create-missing');
const ALL_FIELDS = process.argv.includes('--all-fields');
const FROM_ARG = argValue('--from');
const TO_ARG = argValue('--to');
const NAME_FILTERS = argValues('--name').map(normalizePersonKey).filter(Boolean);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function normalizeStr(str) {
  if (str === null || str === undefined) return '';
  return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePersonKey(str) {
  return normalizeStr(str)
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
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
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return s.slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildKey(dateStr, name, product, market) {
  return [
    normalizeDateStr(dateStr),
    normalizeStr(name),
    normalizeStr(product),
    normalizeStr(market),
  ].join('|');
}

function isCheckResultHuy(val) {
  const ascii = String(val ?? '')
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  return ascii === 'huy';
}

function orderAmountVnd(order) {
  const raw =
    order?.total_amount_vnd ??
    order?.total_vnd ??
    order?.reconciled_vnd ??
    order?.goods_amount ??
    order?.sale_price ??
    0;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function orderHasGoTracking(order) {
  return String(
    order?.tracking_code ||
      order?.trackingCode ||
      order?.tracking ||
      order?.ma_tracking ||
      order?.maTracking ||
      ''
  ).trim() !== '';
}

function orderShiftToGroups(shiftVal) {
  const raw = String(shiftVal ?? '').trim();
  if (!raw) return [];

  const segments = raw
    .split(/[,，;；]/)
    .map((p) => normalizeStr(String(p).trim()))
    .filter(Boolean);

  const parts = segments.length > 0 ? segments : [normalizeStr(raw)];
  let hasHet = false;
  let hasGua = false;
  for (const seg of parts) {
    if (seg.includes('hết ca') || seg.includes('het ca')) hasHet = true;
    if (seg.includes('giữa ca') || seg.includes('giua ca')) hasGua = true;
  }

  const groups = [];
  if (hasHet) groups.push('Hết ca');
  if (hasGua) groups.push('Giữa ca');
  return groups;
}

async function fetchAll(table, select, rangeCol, start, end) {
  const rows = [];
  const PAGE_SIZE = 1000;
  let from = 0;

  while (true) {
    let q = supabase
      .from(table)
      .select(select)
      .gte(rangeCol, start)
      .lte(rangeCol, end)
      .order(rangeCol, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function latestReportDate() {
  const { data, error } = await supabase
    .from('sale_report_hcm')
    .select('date')
    .order('date', { ascending: false })
    .limit(1);
  if (error) throw error;
  return normalizeDateStr(data?.[0]?.date);
}

async function main() {
  const latest = await latestReportDate();
  if (!latest) throw new Error('sale_report_hcm chưa có dữ liệu date');

  const endDate = normalizeDateStr(TO_ARG || latest);
  const startDate = normalizeDateStr(FROM_ARG || addDays(endDate, -119));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error('Dùng ngày dạng YYYY-MM-DD, ví dụ --from 2026-05-01 --to 2026-05-11');
  }

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} sale_report_hcm từ order_code_hcm`);
  console.log(`Khoảng ngày: ${startDate} -> ${endDate}`);
  console.log(`Chế độ: ${ALL_FIELDS ? 'đồng bộ toàn bộ field TT' : 'chỉ backfill field hủy'}`);
  if (NAME_FILTERS.length) console.log(`Lọc nhân viên: ${argValues('--name').join(', ')}`);
  if (CREATE_MISSING) console.log('Có tạo dòng sale_report_hcm còn thiếu: yes');

  const reports = await fetchAll(
    'sale_report_hcm',
    'id,date,name,email,team,product,market,shift,order_count,revenue_actual,order_cancel_count,order_cancel_count_actual,revenue_cancel_actual,order_go,revenue_go_actual',
    'date',
    startDate,
    endDate
  );
  const orders = await fetchAll(
    'order_code_hcm',
    'order_code,order_date,sale_staff,product,country,shift,team,check_result,tracking_code,total_amount_vnd,total_vnd,reconciled_vnd,goods_amount,sale_price',
    'order_date',
    startDate,
    endDate
  );

  const filteredReports = NAME_FILTERS.length
    ? reports.filter((r) => NAME_FILTERS.includes(normalizePersonKey(r.name)))
    : reports;
  const filteredOrders = NAME_FILTERS.length
    ? orders.filter((o) => NAME_FILTERS.includes(normalizePersonKey(o.sale_staff)))
    : orders;

  const countsByKey = new Map();
  for (const order of filteredOrders) {
    if (!normalizeStr(order.sale_staff)) continue;
    const key = buildKey(order.order_date, order.sale_staff, order.product, order.country);
    const current = countsByKey.get(key) || {
      count: 0,
      revenueVnd: 0,
      cancelCount: 0,
      cancelRevenueVnd: 0,
      goCount: 0,
      goRevenueVnd: 0,
      sample: {
        date: normalizeDateStr(order.order_date),
        name: String(order.sale_staff || '').trim(),
        product: String(order.product || '').trim(),
        market: String(order.country || '').trim(),
        team: String(order.team || '').trim(),
      },
    };

    const vnd = orderAmountVnd(order);
    const huy = isCheckResultHuy(order.check_result);
    const goOrder = !huy && orderHasGoTracking(order);

    current.count += 1;
    current.revenueVnd += vnd;
    if (huy) {
      current.cancelCount += 1;
      current.cancelRevenueVnd += vnd;
    }
    if (goOrder) {
      current.goCount += 1;
      current.goRevenueVnd += vnd;
    }
    countsByKey.set(key, current);
  }

  const existingByShiftKey = new Set();
  const updateRows = [];
  const createRows = [];
  const preview = [];

  const reportRows = filteredReports.filter((r) => orderShiftToGroups(r.shift).length > 0);
  for (const r of reportRows) {
    const key = buildKey(r.date, r.name, r.product, r.market);
    const groups = orderShiftToGroups(r.shift);
    if (groups.length === 1) existingByShiftKey.add(`${groups[0]}|${key}`);
    if (groups.length === 2) {
      existingByShiftKey.add(`Hết ca|${key}`);
      existingByShiftKey.add(`Giữa ca|${key}`);
    }

    const agg = countsByKey.get(key);
    const patch = {
      id: r.id,
      order_count: agg?.count || 0,
      revenue_actual: agg?.revenueVnd ?? 0,
      order_cancel_count: agg?.cancelCount ?? 0,
      order_cancel_count_actual: agg?.cancelCount ?? 0,
      revenue_cancel_actual: agg?.cancelRevenueVnd ?? 0,
      order_go: agg?.goCount ?? 0,
      revenue_go_actual: agg?.goRevenueVnd ?? 0,
    };
    if (groups.length === 2) patch.shift = REPORT_CA_COMBINED;

    const cancelChanged =
      Number(r.order_cancel_count || 0) !== patch.order_cancel_count ||
      Number(r.order_cancel_count_actual || 0) !== patch.order_cancel_count_actual ||
      Number(r.revenue_cancel_actual || 0) !== patch.revenue_cancel_actual;
    const anyFieldChanged =
      Number(r.order_count || 0) !== patch.order_count ||
      Number(r.revenue_actual || 0) !== patch.revenue_actual ||
      cancelChanged ||
      Number(r.order_go || 0) !== patch.order_go ||
      Number(r.revenue_go_actual || 0) !== patch.revenue_go_actual ||
      (patch.shift && String(r.shift || '') !== patch.shift);

    const changed = ALL_FIELDS ? anyFieldChanged : cancelChanged;

    if (changed) {
      updateRows.push(
        ALL_FIELDS
          ? patch
          : {
              id: patch.id,
              order_cancel_count: patch.order_cancel_count,
              order_cancel_count_actual: patch.order_cancel_count_actual,
              revenue_cancel_actual: patch.revenue_cancel_actual,
            }
      );
      if (preview.length < 30) {
        preview.push({
          action: 'update',
          date: normalizeDateStr(r.date),
          name: r.name,
          product: r.product,
          market: r.market,
          order_count: `${Number(r.order_count || 0)} -> ${patch.order_count}`,
          cancel_count: `${Number(r.order_cancel_count_actual || 0)} -> ${patch.order_cancel_count_actual}`,
          cancel_vnd: `${Number(r.revenue_cancel_actual || 0)} -> ${patch.revenue_cancel_actual}`,
        });
      }
    }
  }

  if (CREATE_MISSING) {
    for (const [key, entry] of countsByKey.entries()) {
      if (existingByShiftKey.has(`Hết ca|${key}`)) continue;
      const row = {
        id: randomUUID(),
        name: entry.sample.name,
        email: null,
        team: entry.sample.team || 'HCM - Sale ngày',
        date: entry.sample.date,
        shift: REPORT_CA_COMBINED,
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
      if (preview.length < 30) {
        preview.push({
          action: 'create',
          date: row.date,
          name: row.name,
          product: row.product,
          market: row.market,
          order_count: row.order_count,
          cancel_count: row.order_cancel_count_actual,
          cancel_vnd: row.revenue_cancel_actual,
        });
      }
    }
  }

  const uniqueAffectedKeys = new Set(
    preview
      .filter((r) => r.action === 'update')
      .map((r) => `${r.date}|${normalizePersonKey(r.name)}|${normalizeStr(r.product)}|${normalizeStr(r.market)}`)
  );

  console.log({
    reportsFetched: reports.length,
    reportsInScope: reportRows.length,
    ordersFetched: orders.length,
    ordersInScope: filteredOrders.length,
    updateRows: updateRows.length,
    createRows: createRows.length,
    previewUniqueKeys: uniqueAffectedKeys.size,
  });
  console.table(preview);

  if (!APPLY) {
    console.log('Dry-run xong. Thêm --apply để ghi DB.');
    return;
  }

  const UPDATE_CONCURRENCY = 4;
  for (let i = 0; i < updateRows.length; i += UPDATE_CONCURRENCY) {
    const chunk = updateRows.slice(i, i + UPDATE_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(({ id, ...rest }) => supabase.from('sale_report_hcm').update(rest).eq('id', id))
    );
    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) throw firstErr;
  }

  for (let i = 0; i < createRows.length; i += 200) {
    const { error } = await supabase.from('sale_report_hcm').insert(createRows.slice(i, i + 200));
    if (error) throw error;
  }

  console.log(`Đã ghi DB: update ${updateRows.length}, create ${createRows.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
