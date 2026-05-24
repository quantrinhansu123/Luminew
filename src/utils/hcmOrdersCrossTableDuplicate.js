import {
  normalizeCustomerTextForDup,
  normalizePhoneDigits,
} from './customerDuplicateCanhBao';
import { parseSmartDate } from './dateParsing';

function pickField(row, dbKey, appKey) {
  if (!row) return '';
  const v = row[dbKey] ?? row[appKey];
  return v == null ? '' : String(v).trim();
}

/** Ms để sort — ưu tiên order_date, fallback created_at. */
export function orderDateMsFromRow(row) {
  if (!row) return 0;
  const od = parseSmartDate(row.order_date);
  if (od) return od.getTime();
  const ca = parseSmartDate(row.created_at);
  if (ca) return ca.getTime();
  return 0;
}

/** Hiển thị Ngày lên đơn (dd/mm/yyyy); không có order_date thì ghi chú created_at. */
export function formatCrossDupNgayLenDon(row) {
  if (!row) return '—';
  const od = parseSmartDate(row.order_date);
  if (od) {
    const d = String(od.getDate()).padStart(2, '0');
    const m = String(od.getMonth() + 1).padStart(2, '0');
    const y = od.getFullYear();
    return `${d}/${m}/${y}`;
  }
  const ca = parseSmartDate(row.created_at);
  if (ca) {
    const d = String(ca.getDate()).padStart(2, '0');
    const m = String(ca.getMonth() + 1).padStart(2, '0');
    const y = ca.getFullYear();
    return `${d}/${m}/${y} (tạo)`;
  }
  return '—';
}

/**
 * Khóa so khớp: Name*, Phone*, Add, Mặt hàng.
 * Trả về null nếu không đủ dữ liệu (cần ít nhất SĐT hoặc tên).
 */
export function buildHcmOrdersCrossDuplicateKey(row) {
  const name = pickField(row, 'customer_name', 'Name*');
  const phone = pickField(row, 'customer_phone', 'Phone*');
  const address = pickField(row, 'customer_address', 'Add');
  const product = pickField(row, 'product', 'Mặt hàng');

  const np = normalizePhoneDigits(phone);
  const nn = normalizeCustomerTextForDup(name);
  const na = normalizeCustomerTextForDup(address);
  const npd = normalizeCustomerTextForDup(product);

  const phoneOk = np.length >= 9;
  const nameOk = nn.length >= 2;
  if (!phoneOk && !nameOk) return null;

  return `${np}\u001f${nn}\u001f${na}\u001f${npd}`;
}

function upsertCodeEntry(setMap, row, source) {
  const key = buildHcmOrdersCrossDuplicateKey(row);
  if (!key) return;
  const code = row?.order_code != null ? String(row.order_code).trim() : '';
  if (!code) return;

  if (!setMap.has(key)) {
    setMap.set(key, { hcm: new Map(), orders: new Map() });
  }
  const bucket = setMap.get(key);
  const side = source === 'hcm' ? bucket.hcm : bucket.orders;
  const ms = orderDateMsFromRow(row);
  const label = formatCrossDupNgayLenDon(row);
  const prev = side.get(code);
  if (!prev || ms >= prev.orderDateMs) {
    side.set(code, { code, orderDateMs: ms, orderDateLabel: label });
  }
}

function entriesFromMap(map) {
  return [...map.values()].sort((a, b) => b.orderDateMs - a.orderDateMs);
}

function latestMsFromEntries(hcmEntries, ordersEntries) {
  let max = 0;
  for (const e of hcmEntries) if (e.orderDateMs > max) max = e.orderDateMs;
  for (const e of ordersEntries) if (e.orderDateMs > max) max = e.orderDateMs;
  return max;
}

function latestLabelFromMs(ms, hcmEntries, ordersEntries) {
  if (!ms) return '—';
  const hit =
    hcmEntries.find((e) => e.orderDateMs === ms) ||
    ordersEntries.find((e) => e.orderDateMs === ms);
  return hit?.orderDateLabel || '—';
}

/** Chuỗi mã kèm ngày cho cột bảng. */
export function formatCrossDupCodeList(entries) {
  if (!entries?.length) return '—';
  return entries
    .map((e) => (e.orderDateLabel && e.orderDateLabel !== '—' ? `${e.code} (${e.orderDateLabel})` : e.code))
    .join(', ');
}

/**
 * Nhóm trùng nội dung giữa order_code_hcm và orders (cùng khóa 4 trường, có mã ở cả hai bảng).
 * Sắp xếp: ngày lên đơn gần hôm nay nhất lên đầu.
 */
export function findHcmOrdersCrossTableDuplicateGroups(hcmRows, ordersRows) {
  const byKey = new Map();

  for (const row of hcmRows || []) {
    upsertCodeEntry(byKey, row, 'hcm');
  }
  for (const row of ordersRows || []) {
    upsertCodeEntry(byKey, row, 'orders');
  }

  const groups = [];
  for (const [key, { hcm, orders }] of byKey.entries()) {
    if (hcm.size === 0 || orders.size === 0) continue;
    const hcmEntries = entriesFromMap(hcm);
    const ordersEntries = entriesFromMap(orders);
    const latestOrderDateMs = latestMsFromEntries(hcmEntries, ordersEntries);
    const sample =
      (hcmRows || []).find((r) => buildHcmOrdersCrossDuplicateKey(r) === key) ||
      (ordersRows || []).find((r) => buildHcmOrdersCrossDuplicateKey(r) === key);
    groups.push({
      key,
      name: pickField(sample, 'customer_name', 'Name*'),
      phone: pickField(sample, 'customer_phone', 'Phone*'),
      address: pickField(sample, 'customer_address', 'Add'),
      product: pickField(sample, 'product', 'Mặt hàng'),
      latestOrderDateMs,
      latestOrderDateLabel: latestLabelFromMs(latestOrderDateMs, hcmEntries, ordersEntries),
      hcmEntries,
      ordersEntries,
      /** @deprecated dùng hcmEntries */
      hcmCodes: hcmEntries.map((e) => e.code),
      /** @deprecated dùng ordersEntries */
      ordersCodes: ordersEntries.map((e) => e.code),
    });
  }

  groups.sort((a, b) => {
    const dateDiff = (b.latestOrderDateMs || 0) - (a.latestOrderDateMs || 0);
    if (dateDiff !== 0) return dateDiff;
    const score = (g) => g.hcmEntries.length + g.ordersEntries.length;
    return score(b) - score(a);
  });

  return groups;
}
