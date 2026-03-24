/**
 * Chuẩn hóa tên người để so khớp (không phân biệt hoa thường, gộp khoảng trắng).
 */
export function normalizePersonKey(str) {
  if (str === null || str === undefined) return '';
  return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
}

function hrDisplayName(row) {
  if (!row || typeof row !== 'object') return '';
  return row['Họ Và Tên'] ?? row['Họ và Tên'] ?? row.name ?? row['Tên'] ?? '';
}

/**
 * @param {Array<{ 'Họ Và Tên'?: string, email?: string, name?: string }>} rows
 * @returns {{ map: Map<string, string>, list: typeof rows }}
 */
export function buildEmailByNameLookup(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const map = new Map();
  for (const row of list) {
    const raw = hrDisplayName(row);
    const email = String(row.email || '').trim();
    const key = normalizePersonKey(raw);
    if (key && email && !map.has(key)) map.set(key, email);
  }
  return { map, list };
}

/**
 * Lấy email theo tên: khớp chính xác (sau chuẩn hóa) với danh sách human_resources / nhân viên.
 */
export function emailFromName(name, lookup) {
  if (!lookup || !name) return '';
  const n = normalizePersonKey(name);
  if (!n) return '';
  if (lookup.map?.has(n)) return lookup.map.get(n) || '';
  for (const row of lookup.list || []) {
    const raw = hrDisplayName(row);
    if (normalizePersonKey(raw) === n) return String(row.email || '').trim();
  }
  return '';
}

/**
 * Danh sách nhân viên dạng { name, email, ... } (vd. từ sheet MKT).
 */
export function findEmployeeByName(employees, name) {
  const n = normalizePersonKey(name);
  if (!n || !employees?.length) return null;
  return employees.find((emp) => normalizePersonKey(emp.name) === n) || null;
}
