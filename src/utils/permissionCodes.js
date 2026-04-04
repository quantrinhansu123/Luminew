/** Chuẩn hóa page_code / role_code khi so khớp DB ↔ menu (tránh lệch hoa-thường, khoảng trắng). */
export function normalizePermissionCode(value) {
  return String(value ?? '').trim().toUpperCase();
}
