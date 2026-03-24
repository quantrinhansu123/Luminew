import { supabase } from '../supabase/config';
import { buildEmailByNameLookup, emailFromName } from '../utils/emailFromName';

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

  // If it's already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // If it's DD/MM/YYYY
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      if (y && m && d) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // If it's DD-MM-YYYY
  if (s.includes('-')) {
    const parts = s.split('-');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      if (y && m && d && Number(y) > 1900) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
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

function reportCaToGroup(caVal) {
  const lower = normalizeStr(caVal);
  if (!lower) return null;

  if (lower.includes('hết ca') || lower.includes('het ca')) return 'Hết ca';
  if (lower.includes('giữa ca') || lower.includes('giua ca')) return 'Giữa ca';
  return null;
}

function orderShiftToGroups(shiftVal) {
  const shiftLower = normalizeStr(shiftVal);
  const groups = [];
  if (!shiftLower) return groups;

  if (shiftLower.includes('hết ca') || shiftLower.includes('het ca')) groups.push('Hết ca');
  if (shiftLower.includes('giữa ca') || shiftLower.includes('giua ca')) groups.push('Giữa ca');
  return groups;
}

function buildKey(dateStr, name, product, market) {
  // Key(R) = lower(Ngày | Tên | Sản_phẩm | Thị_trường)
  // Key(F) = lower(formatDate(Ngày_lên_đơn) | Nhân_viên_Marketing | Mặt_hàng | Khu_vực)
  return [
    normalizeDateStr(dateStr),
    normalizeStr(name),
    normalizeStr(product),
    normalizeStr(market),
  ].join('|');
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `mkt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function fetchAllReportsInRange(startDate, endDate) {
  const PAGE_SIZE = 1000;
  const reports = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('detail_reports')
      .select('*')
      .gte('Ngày', startDate)
      .lte('Ngày', endDate)
      .order('Ngày', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    reports.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return reports;
}

async function fetchAllOrdersInRange(startDate, endDate) {
  const PAGE_SIZE = 2000;
  const orders = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('order_code, order_date, marketing_staff, product, country, shift, total_amount_vnd, team')
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

async function fetchHumanResourceEmailLookup() {
  const { data, error } = await supabase
    .from('human_resources')
    .select('"Họ Và Tên", email');

  if (error) {
    console.warn('[MKT recalc] human_resources:', error.message);
    return buildEmailByNameLookup([]);
  }
  return buildEmailByNameLookup(data || []);
}

export async function recalcMktSoDonThucTeFromOrders({ startDate, endDate, dryRun = false } = {}) {
  const normalizedStart = normalizeDateStr(startDate);
  const normalizedEnd = normalizeDateStr(endDate);

  if (!normalizedStart || !normalizedEnd) {
    throw new Error('Khoảng ngày không hợp lệ. Vui lòng truyền startDate/endDate dạng YYYY-MM-DD.');
  }

  const [reports, orders, hrEmailLookup] = await Promise.all([
    fetchAllReportsInRange(normalizedStart, normalizedEnd),
    fetchAllOrdersInRange(normalizedStart, normalizedEnd),
    fetchHumanResourceEmailLookup(),
  ]);

  // countsByGroup: { 'Hết ca': Map<key, {count, sample}>, 'Giữa ca': ... }
  const countsByGroup = {
    'Hết ca': new Map(),
    'Giữa ca': new Map(),
  };

  // B2: Số đơn TT(R) = count(F ∈ F3 | Key(F) = Key(R))
  // => trong DB map vào cột: "Số đơn thực tế"
  for (const order of orders || []) {
    const groups = orderShiftToGroups(order.shift);
    if (!groups.length) continue;

    const key = buildKey(order.order_date, order.marketing_staff, order.product, order.country);
    if (!key) continue;

    for (const group of groups) {
      const mapForGroup = countsByGroup[group];
      const existing = mapForGroup.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        mapForGroup.set(key, {
          count: 1,
          sample: {
            date: normalizeDateStr(order.order_date),
            name: String(order.marketing_staff || '').trim(),
            product: String(order.product || '').trim(),
            market: String(order.country || '').trim(),
            team: String(order.team || '').trim(),
          },
        });
      }
    }
  }

  // existingByCaKey: caGroup|key => report rows (presence only)
  const existingByCaKey = new Set();
  const reportRows = (reports || []).filter((r) => {
    const group = reportCaToGroup(r.ca);
    return group === 'Hết ca' || group === 'Giữa ca';
  });

  for (const r of reportRows) {
    const group = reportCaToGroup(r.ca);
    const key = buildKey(r['Ngày'], r['Tên'], r['Sản_phẩm'], r['Thị_trường']);
    if (!key) continue;
    existingByCaKey.add(`${group}|${key}`);
  }

  const updateRows = [];
  const createRows = [];
  const previewRows = [];
  const PREVIEW_LIMIT = 50;

  // 1) Update existing reports' "Số đơn thực tế"
  for (const r of reportRows) {
    const group = reportCaToGroup(r.ca);
    const key = buildKey(r['Ngày'], r['Tên'], r['Sản_phẩm'], r['Thị_trường']);
    const count = countsByGroup[group]?.get(key)?.count || 0;

    if (!r.id) continue;
    const resolvedEmail = emailFromName(r['Tên'], hrEmailLookup);
    const patch = {
      id: r.id,
      'Số đơn thực tế': count,
    };
    if (resolvedEmail && !String(r['Email'] ?? '').trim()) {
      patch['Email'] = resolvedEmail;
    }
    updateRows.push(patch);

    if (previewRows.length < PREVIEW_LIMIT) {
      previewRows.push({
        ca: group,
        'Ngày': normalizeDateStr(r['Ngày']),
        'Tên': String(r['Tên'] || '').trim(),
        'Sản_phẩm': String(r['Sản_phẩm'] || '').trim(),
        'Thị_trường': String(r['Thị_trường'] || '').trim(),
        'Số đơn thực tế': count,
        action: 'update',
      });
    }
  }

  // 2) Create missing report rows for keys not present in detail_reports (B2)
  for (const group of ['Hết ca', 'Giữa ca']) {
    const mapForGroup = countsByGroup[group];
    for (const [key, entry] of mapForGroup.entries()) {
      const exists = existingByCaKey.has(`${group}|${key}`);
      if (exists) continue;

      const email = emailFromName(entry.sample.name, hrEmailLookup) || '';

      const row = {
        id: makeId(),
        'Tên': entry.sample.name,
        'Email': email,
        'Ngày': entry.sample.date,
        ca: group,
        'Sản_phẩm': entry.sample.product,
        'Thị_trường': entry.sample.market,
        'Team': entry.sample.team || 'MKT',
        'Số đơn thực tế': entry.count,
      };
      createRows.push(row);

      if (previewRows.length < PREVIEW_LIMIT) {
        previewRows.push({
          ca: group,
          'Ngày': row['Ngày'],
          'Tên': row['Tên'],
          'Sản_phẩm': row['Sản_phẩm'],
          'Thị_trường': row['Thị_trường'],
          'Số đơn thực tế': row['Số đơn thực tế'],
          action: 'create',
        });
      }
    }
  }

  if (dryRun) {
    return {
      success: true,
      reportsFetched: reportRows.length,
      ordersFetched: orders?.length || 0,
      updatedExisting: updateRows.length,
      createdMissing: createRows.length,
      upsertCount: updateRows.length + createRows.length,
      previewRows,
    };
  }

  // Chỉ cập nhật cột "Số đơn thực tế" — KHÔNG dùng upsert partial (tránh ghi NULL các cột khác)
  const UPDATE_CHUNK = 80;
  let touched = 0;

  for (let i = 0; i < updateRows.length; i += UPDATE_CHUNK) {
    const chunk = updateRows.slice(i, i + UPDATE_CHUNK);
    const results = await Promise.all(
      chunk.map((row) => {
        const { id, ...rest } = row;
        return supabase.from('detail_reports').update(rest).eq('id', id);
      })
    );
    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) throw firstErr;
    touched += chunk.length;
  }

  const INSERT_CHUNK = 200;
  for (let i = 0; i < createRows.length; i += INSERT_CHUNK) {
    const chunk = createRows.slice(i, i + INSERT_CHUNK);
    const { error } = await supabase.from('detail_reports').insert(chunk);
    if (error) throw error;
    touched += chunk.length;
  }

  return {
    success: true,
    reportsFetched: reportRows.length,
    ordersFetched: orders?.length || 0,
    updatedExisting: updateRows.length,
    createdMissing: createRows.length,
    upserted: touched,
    previewRows,
  };
}

/**
 * Sau khi Lưu / Cập nhật đơn (nhap-don): tính lại "Số đơn thực tế" (Số đơn TT) theo Key match orders ↔ detail_reports.
 * Không dùng Kết quả Check — chỉ đếm đơn theo Key(F) = Key(R) và phân nhóm ca (shift).
 *
 * @param {string} newOrderDate - Ngày đơn sau lưu (YYYY-MM-DD hoặc string DB)
 * @param {string} [previousOrderDate] - Khi sửa đơn: ngày đơn trước khi đổi (để tính lại cả ngày cũ)
 */
export async function recalcMktSoDonAfterOrderSave({ newOrderDate, previousOrderDate } = {}) {
  const n = normalizeDateStr(newOrderDate);
  const p = previousOrderDate != null && previousOrderDate !== '' ? normalizeDateStr(previousOrderDate) : '';
  if (!n && !p) {
    return { skipped: true, reason: 'no_dates' };
  }
  const dates = [n, p].filter(Boolean).sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  return recalcMktSoDonThucTeFromOrders({ startDate, endDate, dryRun: false });
}

