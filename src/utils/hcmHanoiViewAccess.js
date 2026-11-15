import { normalizePermissionCode } from './permissionCodes.js';

const normalize = (value) => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function normalizeBranch(value) {
  const key = normalize(value);
  if (['hcm', 'tp hcm', 'tphcm', 'ho chi minh', 'tp ho chi minh', 'hochiminh'].includes(key)) return 'hcm';
  if (['hn', 'ha noi', 'hanoi'].includes(key)) return 'hn';
  return null;
}

export function normalizeDepartment(value) {
  const key = normalize(value).replace(/\b(hcm|hn|ha noi|ho chi minh)\b/g, '').trim();
  const aliases = {
    mkt: ['mkt', 'marketing', 'truyen thong'],
    sale: ['sale', 'sales', 'kinh doanh', 'kd'],
    cskh: ['cskh', 'cham soc khach hang', 'customer service'],
    orders: ['van don', 'van hanh', 'kho', 'delivery', 'warehouse'],
    rnd: ['r d', 'rd', 'rnd', 'nghien cuu phat trien'],
    finance: ['ke toan', 'tai chinh', 'finance', 'accounting'],
    hr: ['hcns', 'hr', 'nhan su', 'hanh chinh nhan su'],
    ffmMgt: ['ffm mgt'],
    ffmTt: ['ffm tt', 'ffm t t'],
  };
  return Object.keys(aliases).find((dept) => aliases[dept].includes(key)) || null;
}

// Only read/list pages: never inherit input, edit, delete or administrator access.
const HANOI_READ_PAGES = {
  mkt: ['MKT_VIEW', 'MKT_ORDERS', 'MKT_PAGES', 'MKT_MANUAL'],
  sale: ['SALE_VIEW', 'SALE_ORDERS', 'SALE_MANUAL', 'SALE_HISTORY'],
  cskh: ['CSKH_VIEW', 'CSKH_LIST', 'CSKH_PAID', 'CSKH_MANUAL', 'CSKH_HISTORY'],
  orders: ['ORDERS_LIST', 'ORDERS_DANH_SACH_VAN_DON', 'ORDERS_REPORT', 'ORDERS_REPORT_OPERATION', 'ORDERS_REPORT_DAILY_DATA', 'ORDERS_FFM_RECONCILE'],
  rnd: ['RND_VIEW', 'RND_ORDERS', 'RND_PAGES', 'RND_MANUAL', 'RND_HISTORY'],
  finance: ['FINANCE_F3', 'FINANCE_DOI_SOAT_BILL', 'FINANCE_ORDERS_BACKUP'],
  hr: ['HR_ACCESS', 'HR_LIST', 'HR_DASHBOARD', 'HR_KPI'],
  ffmMgt: ['ORDERS_FFM_MGT'],
  ffmTt: ['ORDERS_FFM_TT'],
};

export function getHanoiReadPages(user) {
  if (normalizeBranch(user?.branch) !== 'hcm') return [];
  return HANOI_READ_PAGES[normalizeDepartment(user?.department)] || [];
}

export function withHanoiReadPermissions(permissions, user) {
  const result = permissions.map((p) => ({ ...p }));
  for (const code of getHanoiReadPages(user)) {
    const existing = result.find((p) => normalizePermissionCode(p.page_code) === code);
    if (existing) {
      existing.can_view = true;
      existing.allowed_columns = ['*'];
    } else {
      result.push({ page_code: code, can_view: true, can_edit: false, can_delete: false, allowed_columns: ['*'] });
    }
  }
  return result;
}

export function isHanoiDepartmentPeer(user, candidate) {
  const department = normalizeDepartment(user?.department);
  return normalizeBranch(user?.branch) === 'hcm' && !!department
    && normalizeBranch(candidate?.branch) === 'hn'
    && normalizeDepartment(candidate?.department) === department;
}
