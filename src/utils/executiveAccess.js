/** Chuẩn hóa nhãn phòng ban để so khớp không phụ thuộc hoa/thường/dấu. */
export function normalizeDeptLabel(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Phòng ban được xem nhóm menu / thẻ "Dashboard điều hành" (và /dashboard-quan-tri).
 * Khớp: Giám đốc, Ban giám đốc, BGĐ, …
 */
export function isDirectorDepartment(dept) {
  const n = normalizeDeptLabel(dept);
  if (!n) return false;
  if (n === 'bgd') return true;
  if (n.includes('giam doc')) return true;
  return false;
}

/**
 * Vai trò RBAC (users.role / app_roles.code) thuộc khối điều hành — ví dụ Leader - Ban Giám Đốc - Hà Nội
 * (code kiểu LEADER_BAN_GIAM_DOC_HN, …). Dùng khi department trên users chưa khai báo nhưng role đã đúng nhóm.
 */
export function isExecutiveDashboardByRoleCode(roleCode) {
  const raw = String(roleCode ?? '').trim();
  if (!raw) return false;
  const n = normalizeDeptLabel(raw.replace(/_/g, ' '));
  if (!n) return false;
  if (n.includes('giam doc')) return true;
  if (n.includes('ban giam')) return true;
  if (/\bbgd\b/.test(n)) return true;
  if (n.includes('leader') && (n.includes('giam') || /\bbgd\b/.test(n))) return true;
  return false;
}

/** Full quyền xem nhóm Dashboard điều hành: theo bộ phận Giám đốc hoặc theo mã vai trò lãnh đạo/BGĐ. */
export function isExecutiveDashboardAudience(department, roleCodeFromDb) {
  return isDirectorDepartment(department) || isExecutiveDashboardByRoleCode(roleCodeFromDb);
}
