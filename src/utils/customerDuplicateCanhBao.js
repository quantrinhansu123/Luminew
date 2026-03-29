/**
 * Trùng khách (SĐT HOẶC tên HOẶC địa chỉ) — cùng rule với NhapDonMoi.
 * Thứ tự "lần 1 / lần 2": theo Ngày lên đơn (order_date) tăng dần, tie-break created_at.
 */

export function normalizePhoneDigits(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length >= 9) return d.slice(-9);
  return d;
}

export function normalizeCustomerTextForDup(raw) {
  let s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  try {
    s = s.normalize('NFD').replace(/\p{M}/gu, '');
  } catch {
    /* ignore */
  }
  return s;
}

export function customerDupCheckContext(phone, name, address) {
  const normPhone = normalizePhoneDigits(phone);
  const normName = normalizeCustomerTextForDup(name);
  const normAddr = normalizeCustomerTextForDup(address);
  return {
    normPhone,
    normName,
    normAddr,
    phoneOk: normPhone.length >= 9,
    nameOk: normName.length >= 2,
    addrOk: normAddr.length >= 10,
  };
}

/** Các khóa ghép nhóm trùng (cùng key → cùng component). */
function duplicateKeysForRow(phone, name, address) {
  const ctx = customerDupCheckContext(phone, name, address);
  const keys = [];
  if (ctx.phoneOk) keys.push(`p:${ctx.normPhone}`);
  if (ctx.nameOk) keys.push(`n:${ctx.normName}`);
  if (ctx.addrOk) keys.push(`a:${ctx.normAddr}`);
  return keys;
}

function normalizeOrderDateYmd(orderDate, createdAtFallback) {
  if (orderDate != null && orderDate !== '') {
    const s = String(orderDate).trim();
    if (s.includes('T')) return s.split('T')[0];
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  if (createdAtFallback) {
    const s = String(createdAtFallback).trim();
    if (s.includes('T')) return s.split('T')[0];
  }
  return '9999-12-31';
}

function createdAtMs(createdAt) {
  if (!createdAt) return 0;
  const t = Date.parse(String(createdAt));
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Nội dung cột canh_bao khi chỉ có cảnh báo trùng (không blacklist).
 * Khớp format NhapDonMoi.buildCanhBaoFromChecks.
 */
export function buildCanhBaoFromDuplicateCodes(dupCodes, saleStaff) {
  const codes = (dupCodes || []).map((c) => String(c || '').trim()).filter(Boolean);
  if (codes.length === 0) return '';

  const sale = String(saleStaff ?? '').trim();
  const saleLine = sale || '— chưa chọn —';

  return [
    'Cảnh báo cho Nhân viên Sale',
    `NV Sale phụ trách đơn: ${saleLine}`,
    '',
    `Trùng SĐT hoặc tên hoặc địa chỉ — mã đơn: ${codes.join(', ')}`,
  ].join('\n');
}

class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }

  find(i) {
    if (this.parent[i] !== i) this.parent[i] = this.find(this.parent[i]);
    return this.parent[i];
  }

  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

/**
 * @param {Array<{ order_code: string, order_date?: string|null, created_at?: string|null, customer_phone?: string|null, customer_name?: string|null, customer_address?: string|null, sale_staff?: string|null }>} rows
 * @returns {Array<{ order_code: string, canh_bao: string }>}
 */
export function computeCanhBaoUpdatesForDuplicateCustomers(rows) {
  const list = (rows || [])
    .map((r) => ({
      order_code: String(r?.order_code || '').trim(),
      order_date: r?.order_date,
      created_at: r?.created_at,
      customer_phone: r?.customer_phone,
      customer_name: r?.customer_name,
      customer_address: r?.customer_address,
      sale_staff: r?.sale_staff,
    }))
    .filter((r) => r.order_code);

  const n = list.length;
  if (n === 0) return [];

  const uf = new UnionFind(n);
  const keyToIndices = new Map();

  for (let i = 0; i < n; i++) {
    const keys = duplicateKeysForRow(
      list[i].customer_phone,
      list[i].customer_name,
      list[i].customer_address
    );
    for (const k of keys) {
      if (!keyToIndices.has(k)) keyToIndices.set(k, []);
      keyToIndices.get(k).push(i);
    }
  }

  for (const indices of keyToIndices.values()) {
    if (!indices || indices.length < 2) continue;
    const head = indices[0];
    for (let j = 1; j < indices.length; j++) {
      uf.union(head, indices[j]);
    }
  }

  const rootToIndices = new Map();
  for (let i = 0; i < n; i++) {
    const r = uf.find(i);
    if (!rootToIndices.has(r)) rootToIndices.set(r, []);
    rootToIndices.get(r).push(i);
  }

  const updates = [];

  for (const indices of rootToIndices.values()) {
    if (indices.length < 2) continue;

    const sorted = [...indices].sort((ia, ib) => {
      const a = list[ia];
      const b = list[ib];
      const da = normalizeOrderDateYmd(a.order_date, a.created_at);
      const db = normalizeOrderDateYmd(b.order_date, b.created_at);
      if (da !== db) return da < db ? -1 : 1;
      const ca = createdAtMs(a.created_at);
      const cb = createdAtMs(b.created_at);
      if (ca !== cb) return ca - cb;
      return String(a.order_code).localeCompare(String(b.order_code));
    });

    const earlierCodes = [];
    for (let k = 0; k < sorted.length; k++) {
      const idx = sorted[k];
      const row = list[idx];
      if (k > 0) {
        const text = buildCanhBaoFromDuplicateCodes([...earlierCodes], row.sale_staff);
        if (text) {
          updates.push({ order_code: row.order_code, canh_bao: text });
        }
      }
      earlierCodes.push(row.order_code);
    }
  }

  return updates;
}
