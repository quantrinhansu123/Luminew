import {
  normalizeCustomerTextForDup,
  normalizePhoneDigits,
} from './customerDuplicateCanhBao';

function pickField(row, dbKey, appKey) {
  if (!row) return '';
  const v = row[dbKey] ?? row[appKey];
  return v == null ? '' : String(v).trim();
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

function addCodeToMap(map, key, code, source) {
  if (!key || !code) return;
  const c = String(code).trim();
  if (!c) return;
  if (!map.has(key)) {
    map.set(key, { hcm: new Set(), orders: new Set() });
  }
  const bucket = map.get(key);
  if (source === 'hcm') bucket.hcm.add(c);
  else bucket.orders.add(c);
}

/**
 * Nhóm trùng nội dung giữa order_code_hcm và orders (cùng khóa 4 trường, có mã ở cả hai bảng).
 */
export function findHcmOrdersCrossTableDuplicateGroups(hcmRows, ordersRows) {
  const byKey = new Map();

  for (const row of hcmRows || []) {
    const key = buildHcmOrdersCrossDuplicateKey(row);
    if (!key) continue;
    addCodeToMap(byKey, key, row.order_code, 'hcm');
  }
  for (const row of ordersRows || []) {
    const key = buildHcmOrdersCrossDuplicateKey(row);
    if (!key) continue;
    addCodeToMap(byKey, key, row.order_code, 'orders');
  }

  const groups = [];
  for (const [key, { hcm, orders }] of byKey.entries()) {
    if (hcm.size === 0 || orders.size === 0) continue;
    const sample =
      (hcmRows || []).find((r) => buildHcmOrdersCrossDuplicateKey(r) === key) ||
      (ordersRows || []).find((r) => buildHcmOrdersCrossDuplicateKey(r) === key);
    groups.push({
      key,
      name: pickField(sample, 'customer_name', 'Name*'),
      phone: pickField(sample, 'customer_phone', 'Phone*'),
      address: pickField(sample, 'customer_address', 'Add'),
      product: pickField(sample, 'product', 'Mặt hàng'),
      hcmCodes: [...hcm].sort((a, b) => a.localeCompare(b, 'vi')),
      ordersCodes: [...orders].sort((a, b) => a.localeCompare(b, 'vi')),
    });
  }

  groups.sort((a, b) => {
    const score = (g) => g.hcmCodes.length + g.ordersCodes.length;
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return (a.hcmCodes[0] || '').localeCompare(b.hcmCodes[0] || '', 'vi');
  });

  return groups;
}
