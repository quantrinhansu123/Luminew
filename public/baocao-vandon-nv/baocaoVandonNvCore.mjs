const PAGE = 800;
export const DEFAULT_BAOCAO_MAX_ROWS = 25000;
const DEFAULT_PRELOAD_DAYS = 10;
function formatDateYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function resolveFetchDateRange(startDate, endDate) {
  const s = String(startDate || '').trim();
  const e = String(endDate || '').trim();
  if (s && e) return { startDate: s, endDate: e };
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (DEFAULT_PRELOAD_DAYS - 1));
  return { startDate: formatDateYmd(start), endDate: formatDateYmd(end) };
}

const BAOCAO_OMIT_AFTER_MAP = [
  'log',
  'ffm_log',
  'chi_tiet_chia',
  'Nhật ký',
  'Lịch sử FFM',
];

const DB_TO_APP_MAPPING = {
  order_code: 'Mã đơn hàng',
  customer_name: 'Name*',
  customer_phone: 'Phone*',
  customer_address: 'Add',
  city: 'City',
  state: 'State',
  country: 'Khu vực',
  zipcode: 'Zipcode',
  product: 'Mặt hàng',
  total_amount_vnd: 'Tổng tiền VNĐ',
  payment_method: 'Hình thức thanh toán',
  tracking_code: 'Mã Tracking',
  // Phí ship VNĐ = shipping_cost. Không map shipping_fee (hay là text/ngày đối soát).
  shipping_cost: 'Phí ship',
  marketing_staff: 'Nhân viên MKT',
  sale_staff: 'Nhân viên Sale',
  page_name: 'Page',
  team: 'Team',
  shift: 'Ca',
  delivery_staff: 'NV Vận đơn',
  delivery_status: 'Trạng thái giao hàng',
  payment_status: 'Trạng thái thu tiền',
  payment_status_detail: 'Trạng thái thanh toán',
  note: 'Ghi chú',
  feedback_pos: 'Phản hồi tích cực',
  feedback_neg: 'Phản hồi tiêu cực',
  lydo: 'Lý do',
  order_date: 'Ngày lên đơn',
  sale_price: 'Giá bán',
  shipping_unit: 'Đơn vị vận chuyển',
  accountant_confirm: 'Kế toán xác nhận thu tiền về',
  created_at: 'Ngày tạo (DB)',
  ngaydonghang: 'Ngày đóng hàng',
  check_result: 'Kết quả Check',
  vandon_note: 'Ghi chú của VĐ',
  product_name_1: 'Tên mặt hàng 1',
  quantity_1: 'Số lượng mặt hàng 1',
  product_name_2: 'Tên mặt hàng 2',
  quantity_2: 'Số lượng mặt hàng 2',
  gift: 'Quà tặng',
  gift_quantity: 'Số lượng quà kèm',
  delivery_status_nb: 'Trạng thái giao hàng NB',
  payment_currency: 'Loại tiền thanh toán',
  thoigiangiaohangffm: 'Thời gian giao dự kiến',
  warehouse_fee: 'Phí xử lý đơn đóng hàng-Lưu kho(usd)',
  luu_kho_usd: 'Ngày đối soát kế toán',
  note_caps: 'GHI CHÚ',
  accounting_check_date: 'Ngày Kế toán đối soát với FFM lần 2',
  tracking_check_date: 'Ngày có mã tracking',
  reconciled_amount: 'Số tiền của đơn hàng đã về TK Cty',
  payment_bill: 'Payment Bill',
  payment_image: 'Payment Image',
  ngayupbill: 'Ngày up bill',
  reconciled_vnd: 'Tiền Việt đã đối soát',
  ngay_doi_soat_bill: 'Ngày đối soát bill',
  ngay_doi_soat_cuoc: 'Ngày đối soát cước',
  cskh_status: 'Trạng thái cskh',
  log: 'Nhật ký',
  ffm_log: 'Lịch sử FFM',
  canh_bao: 'Cảnh báo trùng',
  thu_tu_chia: 'Thứ tự chia',
  ngay_chia_van_don: 'Ngày chia vận đơn',
  payment_method_text: 'Hình thức thanh toán (text)',
  reason: 'Lý do (reason)',
  estimated_delivery_date: 'Thời gian giao dự kiến (cũ)',
};

function normalizeNgayDoiSoatKeToanText(v) {
  if (v === undefined || v === null) return '';
  const s = String(v).trim();
  if (s === '') return '';
  if (s === '0' || s === '0.0' || s === '0,0') return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  if (/^\d{8}$/.test(s)) {
    const yyyy = s.slice(0, 4);
    const mm = s.slice(4, 6);
    const dd = s.slice(6, 8);
    return `${dd}/${mm}/${yyyy}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return s;
  if (/^\d{1,2}-\d{1,2}-\d{2,4}/.test(s)) return s;
  return '';
}

/** Phí ship VNĐ: ưu tiên shipping_cost; shipping_fee chỉ khi là số tiền (bỏ chuỗi ngày). */
export function shippingVndFromDbRow(sOrder) {
  if (!sOrder || typeof sOrder !== 'object') return 0;
  const sc = sOrder.shipping_cost;
  if (sc !== undefined && sc !== null && sc !== '') {
    const n = typeof sc === 'number' ? sc : Number(sc);
    if (Number.isFinite(n)) return n;
  }
  const sf = sOrder.shipping_fee;
  if (sf === undefined || sf === null || sf === '') return 0;
  if (typeof sf === 'number' && Number.isFinite(sf)) return sf;
  const s = String(sf).trim();
  if (/^\d{1,2}[./-]\d{1,2}/.test(s)) return 0;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return 0;
  const cleaned = s.replace(/[^\d.,-]/g, '');
  if (!cleaned) return 0;
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  let numStr = cleaned;
  if (lastDot > -1 && lastDot === cleaned.length - 3 && lastComma > -1 && lastComma < lastDot) {
    numStr = cleaned.replace(/,/g, '');
  } else {
    numStr = cleaned.replace(/\./g, '').replace(/,/g, '');
  }
  const n = Number(numStr);
  return Number.isFinite(n) ? n : 0;
}

function formatLogSimple(log) {
  if (log === undefined || log === null) return '';
  if (typeof log === 'string') return log;
  try {
    return JSON.stringify(log);
  } catch {
    return String(log);
  }
}

export function mapOrderDbRowToLegacyF3(sOrder) {
  const appOrder = {};
  Object.keys(sOrder).forEach((k) => {
    appOrder[k] = sOrder[k];
  });

  Object.entries(DB_TO_APP_MAPPING).forEach(([dbKey, appKey]) => {
    if (sOrder[dbKey] !== undefined) {
      appOrder[appKey] = sOrder[dbKey];
    }
  });

  // Khớp header «Tổng tiền» trang /van-don: line (≠0) → tong_tien (≠0) → total_amount_vnd.
  {
    let money = null;
    if (sOrder.van_don_line_total_vnd != null && sOrder.van_don_line_total_vnd !== '') {
      const v = Number(sOrder.van_don_line_total_vnd);
      if (!Number.isNaN(v) && v !== 0) money = v;
    }
    if (money == null) {
      const rawTong = sOrder.tong_tien_vnd ?? sOrder.tong_tien_VND;
      if (rawTong != null && rawTong !== '' && !Number.isNaN(Number(rawTong))) {
        const tn = Number(rawTong);
        if (tn !== 0) money = tn;
      }
    }
    if (money == null) {
      const candidates = [sOrder.total_amount_vnd, sOrder.sale_price, sOrder.goods_amount];
      for (let i = 0; i < candidates.length; i++) {
        const raw = candidates[i];
        if (raw === undefined || raw === null) continue;
        if (typeof raw === 'string' && String(raw).trim() === '') continue;
        const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^\d.-]/g, ''));
        if (Number.isFinite(n)) {
          money = n;
          break;
        }
      }
    }
    if (money != null) appOrder['Tổng tiền VNĐ'] = money;
  }

  {
    const ly = appOrder['Lý do'];
    const lyEmpty = ly === undefined || ly === null || String(ly).trim() === '';
    if (
      lyEmpty &&
      sOrder.reason !== undefined &&
      sOrder.reason !== null &&
      String(sOrder.reason).trim() !== ''
    ) {
      appOrder['Lý do'] = sOrder.reason;
    }
  }

  const estEd = sOrder.estimated_delivery_date;
  const ffmEd = sOrder.thoigiangiaohangffm;
  const isEmptyMergedDate = (v) =>
    v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  const hasFfm = !isEmptyMergedDate(ffmEd);
  const hasEst = !isEmptyMergedDate(estEd);
  if (hasFfm) {
    appOrder['Thời gian giao dự kiến'] = ffmEd;
  } else if (hasEst) {
    appOrder['Thời gian giao dự kiến'] = estEd;
  } else {
    appOrder['Thời gian giao dự kiến'] = null;
  }

  if (sOrder.sale_price !== undefined && sOrder.sale_price !== null) {
    appOrder['Giá bán'] = sOrder.sale_price;
  } else if (sOrder.goods_amount !== undefined) {
    appOrder['Giá bán'] = sOrder.goods_amount;
  }

  const paymentMethod =
    sOrder.payment_method === undefined || sOrder.payment_method === null
      ? ''
      : String(sOrder.payment_method).trim();
  const paymentMethodText =
    sOrder.payment_method_text === undefined || sOrder.payment_method_text === null
      ? ''
      : String(sOrder.payment_method_text).trim();
  appOrder['Hình thức thanh toán'] = paymentMethod || paymentMethodText || '';

  if (!appOrder['Ngày lên đơn'] && sOrder.order_date) appOrder['Ngày lên đơn'] = sOrder.order_date;
  if (!appOrder['Mã đơn hàng']) appOrder['Mã đơn hàng'] = sOrder.order_code;
  appOrder['Trạng thái giao hàng NB'] = sOrder.delivery_status_nb ?? '';
  appOrder['Trạng thái giao hàng'] =
    sOrder.delivery_status != null && String(sOrder.delivery_status).trim() !== ''
      ? String(sOrder.delivery_status).trim()
      : '';

  if (sOrder.payment_bill) appOrder['Payment Bill'] = sOrder.payment_bill;
  if (sOrder.payment_image) appOrder['Payment Image'] = sOrder.payment_image;

  const itemName1 = sOrder.product_name_1 ?? sOrder.item_name_1 ?? sOrder.product ?? '';
  const itemQty1 = sOrder.quantity_1 ?? sOrder.item_qty_1 ?? '';
  const itemName2 = sOrder.product_name_2 ?? sOrder.item_name_2 ?? '';
  const itemQty2 = sOrder.quantity_2 ?? sOrder.item_qty_2 ?? '';
  const giftItem = sOrder.gift ?? sOrder.gift_item ?? '';
  const giftQty = sOrder.gift_quantity ?? sOrder.gift_qty ?? '';

  appOrder['Tên mặt hàng 1'] = itemName1;
  appOrder['Số lượng mặt hàng 1'] = itemQty1;
  appOrder['Tên mặt hàng 2'] = itemName2;
  appOrder['Số lượng mặt hàng 2'] = itemQty2;
  appOrder['Quà tặng'] = giftItem;
  appOrder['Số lượng quà kèm'] = giftQty;

  if (sOrder.ngayupbill !== undefined && sOrder.ngayupbill !== null) {
    appOrder.ngayupbill = sOrder.ngayupbill;
    appOrder['Ngày up bill'] = sOrder.ngayupbill;
  }
  if (sOrder.reconciled_vnd !== undefined && sOrder.reconciled_vnd !== null) {
    appOrder.reconciled_vnd = sOrder.reconciled_vnd;
    appOrder['Tiền Việt đã đối soát'] = sOrder.reconciled_vnd;
    appOrder['Tiền đã thanh toán'] = sOrder.reconciled_vnd;
  }
  const nsFromLuu = normalizeNgayDoiSoatKeToanText(sOrder.luu_kho_usd);
  const nsFromWh = nsFromLuu ? '' : normalizeNgayDoiSoatKeToanText(sOrder.warehouse_fee);
  const nsFromShip =
    nsFromLuu || nsFromWh ? '' : normalizeNgayDoiSoatKeToanText(sOrder.shipping_fee);
  const ns =
    nsFromLuu ||
    nsFromWh ||
    nsFromShip ||
    normalizeNgayDoiSoatKeToanText(appOrder['Ngày đối soát kế toán']);

  appOrder['Ngày đối soát kế toán'] = ns;
  appOrder.luu_kho_usd = ns;

  // Ghi đè Phí ship bằng shipping_cost (không dùng shipping_fee text/ngày)
  const shipVnd = shippingVndFromDbRow(sOrder);
  appOrder['Phí ship'] = shipVnd;
  appOrder['Phí cước'] = shipVnd;

  for (const k of ['shipping_unit', 'tracking_code', 'Đơn vị vận chuyển', 'Mã Tracking']) {
    const v = appOrder[k];
    if (typeof v === 'string') appOrder[k] = v.trim();
  }

  if (sOrder.log !== undefined && sOrder.log !== null) {
    appOrder['Nhật ký'] = formatLogSimple(sOrder.log);
  }

  const mkt = appOrder['Nhân viên MKT'];
  if (mkt !== undefined && mkt !== null) {
    appOrder['Nhân viên Marketing'] = mkt;
  }

  if (sOrder.created_at && !appOrder['Thời gian lên đơn']) {
    appOrder['Thời gian lên đơn'] = sOrder.created_at;
  }

  if (appOrder.Page && !appOrder['Tên page']) {
    appOrder['Tên page'] = appOrder.Page;
  }

  if (sOrder.delivery_staff != null && String(sOrder.delivery_staff).trim() !== '') {
    appOrder['NV Vận đơn'] = String(sOrder.delivery_staff).trim();
  }

  return appOrder;
}

/** Bản gọn cho iframe báo cáo — bỏ log/ffm_log và key DB trùng bản map (city/City) để JSON hợp lệ. */
export function mapOrderDbRowToLegacyF3Baocao(sOrder) {
  const appOrder = mapOrderDbRowToLegacyF3(sOrder);
  // Giữ cột tiền nguồn để báo cáo luôn resolve giống /van-don (không chỉ total_amount_vnd).
  const moneyKeep = {
    van_don_line_total_vnd: sOrder?.van_don_line_total_vnd,
    tong_tien_vnd: sOrder?.tong_tien_vnd ?? sOrder?.tong_tien_VND,
    total_amount_vnd: sOrder?.total_amount_vnd,
  };
  for (const dbKey of Object.keys(DB_TO_APP_MAPPING)) {
    delete appOrder[dbKey];
  }
  for (const k of BAOCAO_OMIT_AFTER_MAP) {
    delete appOrder[k];
  }
  if (moneyKeep.van_don_line_total_vnd != null && moneyKeep.van_don_line_total_vnd !== '') {
    appOrder.van_don_line_total_vnd = moneyKeep.van_don_line_total_vnd;
  }
  if (moneyKeep.tong_tien_vnd != null && moneyKeep.tong_tien_vnd !== '') {
    appOrder.tong_tien_vnd = moneyKeep.tong_tien_vnd;
  }
  if (moneyKeep.total_amount_vnd != null && moneyKeep.total_amount_vnd !== '') {
    appOrder.total_amount_vnd = moneyKeep.total_amount_vnd;
  }
  return appOrder;
}

function normalizeBranchForHcmVanDon(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.\-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isHcmBranchForVanDonFilter(value) {
  const branch = normalizeBranchForHcmVanDon(value);
  return (
    branch === 'hcm' ||
    branch === 'tp hcm' ||
    branch === 'tphcm' ||
    branch === 'ho chi minh' ||
    branch.includes('hcm') ||
    branch.includes('ho chi minh')
  );
}

/** Đơn thuộc HCM — cột `team` (DB) hoặc Team / Chi nhánh (sau map). */
export function isBaocaoOrderRowHcm(row) {
  if (!row || typeof row !== 'object') return false;
  const team =
    row.team ??
    row.Team ??
    row.branch ??
    row.Branch ??
    row['Chi nhánh'] ??
    row.Chi_nhanh ??
    '';
  return isHcmBranchForVanDonFilter(team);
}

function isBoPhanVanDonDepartment(dept) {
  const raw = (dept ?? '').toString().trim();
  if (!raw) return false;
  const compact = raw.toLowerCase().replace(/\s+/g, ' ');
  if (compact.includes('vận đơn') || compact.includes('van đơn')) return true;
  const ascii = raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (ascii.includes('van don')) return true;
  if (ascii === 'logistics' || ascii.startsWith('logistics ')) return true;
  return false;
}

/** Bảng HCM (van-don-hcm). */
export const ORDER_HCM_SUPABASE_TABLE = 'order_code_hcm';
/** Bảng đơn mặc định Hà Nội / toàn hệ thống — `/bao-cao-van-don`. */
export const ORDER_DEFAULT_SUPABASE_TABLE = 'orders';
export const BAOCAO_VANDON_NV_ORDERS_TABLE = ORDER_HCM_SUPABASE_TABLE;

const ALLOWED_ORDER_TABLE_ALIASES = new Set(['order_hcm', 'order_code_hcm', 'orders', 'order', '']);

/** `table=orders` → `orders`; `order_hcm` / trống → `order_code_hcm`. */
export function resolveBaocaoOrdersTable(tableParam) {
  const t = String(tableParam ?? '').trim().toLowerCase();
  if (!t || t === 'order_hcm' || t === 'order_code_hcm') {
    return ORDER_HCM_SUPABASE_TABLE;
  }
  if (t === 'orders' || t === 'order') {
    return ORDER_DEFAULT_SUPABASE_TABLE;
  }
  throw new Error(`Bảng đơn không hỗ trợ: ${tableParam}`);
}

/** @deprecated */
export function resolveBaocaoOrderHcmTable(tableParam) {
  return resolveBaocaoOrdersTable(tableParam);
}

/** Quét distinct delivery_staff trên bảng đơn (orders / order_code_hcm). */
async function scanDeliveryStaffFromTable(supabase, tableName) {
  const names = new Set();
  let from = 0;
  const page = 500;
  while (from < 20000) {
    const { data, error } = await supabase
      .from(tableName)
      .select('delivery_staff')
      .not('delivery_staff', 'is', null)
      .order('order_code', { ascending: false })
      .range(from, from + page - 1);
    if (error) throw error;
    const chunk = data || [];
    for (const row of chunk) {
      const v = row?.delivery_staff != null ? String(row.delivery_staff).trim() : '';
      if (v) names.add(v);
    }
    if (chunk.length < page) break;
    from += page;
  }
  return names;
}

/**
 * NV Vận đơn cho bộ lọc — distinct `delivery_staff` theo bảng đơn đang dùng.
 */
export async function fetchVanDonDeliveryStaffDirectory(supabase, tableName = ORDER_HCM_SUPABASE_TABLE) {
  const names = new Set();
  const resolved = resolveBaocaoOrdersTable(tableName === 'orders' ? 'orders' : 'order_hcm');

  if (resolved === ORDER_HCM_SUPABASE_TABLE) {
    try {
      const { data, error } = await supabase.rpc('get_order_code_hcm_distinct_values', {
        p_column: 'delivery_staff',
      });
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const v = row?.val != null ? String(row.val).trim() : '';
          if (v) names.add(v);
        }
      }
    } catch (e) {
      console.warn('[baocaoVandonNvData] distinct delivery_staff:', e?.message || e);
    }
  }

  if (names.size === 0) {
    try {
      const scanned = await scanDeliveryStaffFromTable(supabase, resolved);
      scanned.forEach((n) => names.add(n));
    } catch (e2) {
      console.warn('[baocaoVandonNvData] scan delivery_staff:', e2?.message || e2);
    }
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b, 'vi'));
}

/** @deprecated dùng fetchVanDonDeliveryStaffDirectory */
export async function fetchVanDonHcmDeliveryStaffDirectory(supabase) {
  return fetchVanDonDeliveryStaffDirectory(supabase, ORDER_HCM_SUPABASE_TABLE);
}

/** Khi `users.department` trống (nhiều bản ghi HR chỉ có Team + Vị trí) — KPI lọc theo Bộ phận = "Vận đơn" sẽ ra 0 dòng. */
function inferBoPhanFromUserFields(u) {
  if (!u || typeof u !== 'object') return '';
  const pos = (u.position || '').toString();
  const role = (u.role || '').toString();
  const team = (u.team || u.branch || '').toString();
  const blob = `${pos} ${role} ${team}`.toLowerCase();
  if (/marketing|(^|\s)mkt(\s|$)|quảng cáo|qc marketing|\bads\b/.test(blob)) return 'MKT';
  if (/\bsale\b|telesale|kinh doanh|sale[-_]/.test(blob)) return 'Sale';
  if (
    /vận đơn|van don|vận_đơn|nv\s*vận|nvvd|shipper|giao hàng|đóng hàng|\bffm\b|warehouse|kho hàng|\bvđ\b|[-_/]vd(?:\b|[-_/]|$)|^vd[-_/]/.test(
      blob
    )
  ) {
    return 'Vận đơn';
  }
  return '';
}

export function mapUserRowToLegacyNhanSu(u) {
  if (!u || typeof u !== 'object') return null;
  const name = [u.name, u.username].find((x) => x && String(x).trim());
  const displayName = name ? String(name).trim() : '';
  const team = (u.team || u.branch || '').toString().trim();
  const branch = (u.branch || '').toString().trim();
  let deptRaw = (u.department || u.dept || '').toString().trim();
  if (!deptRaw) deptRaw = inferBoPhanFromUserFields(u);
  const idStr = u.id != null ? String(u.id).trim() : '';
  const row = {
    id: idStr,
    ID: idStr,
    Team: team,
    'Chi nhánh': branch || team,
    Chi_nhanh: branch || team,
    Branch: branch || team,
    Tên: displayName,
    'Họ và tên': displayName,
    'Họ_và_tên': displayName,
    'Họ Và Tên': displayName,
    Name: displayName,
    'Vị trí': (u.position || '').toString().trim(),
    Vi_tri: (u.position || '').toString().trim(),
    Position: (u.position || '').toString().trim(),
  };
  if (deptRaw) {
    row['Bộ phận'] = deptRaw;
    row.Bo_phan = deptRaw;
  }
  return row;
}

/**
 * Khi n-api Google Sheet lỗi (invalid_grant / 500), lấy báo cáo MKT đã sync trên Supabase
 * (cùng nguồn viewNsMoiNhanh / detail_reports) để KPIVandon vẫn có CPQC.
 */
export async function fetchMktFromDetailReports(supabase) {
  if (!supabase) return [];
  const cap = 25000;
  const page = PAGE;
  const rows = [];
  let from = 0;
  while (rows.length < cap) {
    const base = () =>
      supabase.from('detail_reports').select('*').order('id', { ascending: true }).range(from, from + page - 1);
    let { data, error } = await base().or('department.eq.MKT,department.is.null');
    if (error && /department|column|42703/i.test(String(error.message || error.code || ''))) {
      ({ data, error } = await base());
    }
    if (error) throw error;
    const chunk = data || [];
    for (const r of chunk) {
      if (r && r.department !== 'RD') rows.push(r);
    }
    if (chunk.length < page) break;
    from += page;
  }
  return rows.slice(0, cap);
}

/** @typedef {'order_date' | 'created_at_null_order_date'} OrdersDateMode */
async function fetchOrdersTablePage(
  supabase,
  tableName,
  { startDate, endDate, from, pageSize, hcmTeamOnly, dateMode = 'order_date' }
) {
  let q = supabase.from(tableName).select('*');
  if (hcmTeamOnly) {
    q = q.ilike('team', '%HCM%');
  }
  if (startDate && endDate) {
    if (dateMode === 'created_at_null_order_date') {
      q = q.is('order_date', null).gte('created_at', startDate).lte('created_at', endDate);
      q = q.order('created_at', { ascending: false, nullsFirst: false });
    } else {
      q = q.gte('order_date', startDate).lte('order_date', endDate);
      q = q.order('order_date', { ascending: false, nullsFirst: false });
    }
  } else if (dateMode === 'created_at_null_order_date') {
    q = q.is('order_date', null).order('created_at', { ascending: false, nullsFirst: false });
  } else {
    q = q.order('order_date', { ascending: false, nullsFirst: false });
  }
  q = q.order('order_code', { ascending: false }).range(from, from + pageSize - 1);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchF3LegacyMapped(supabase, opts = {}) {
  const { maxRows, tableName: tableOpt, hcmTeamOnly } = opts;
  const { startDate, endDate } = resolveFetchDateRange(opts.startDate, opts.endDate);
  const tableName = resolveBaocaoOrdersTable(tableOpt);
  const applyHcmTeamFilter =
    !!hcmTeamOnly && tableName === ORDER_HCM_SUPABASE_TABLE;
  const cap = Math.min(
    Number(maxRows) || DEFAULT_BAOCAO_MAX_ROWS,
    150000
  );
  const byCode = new Map();

  const ingest = (chunk) => {
    for (const row of chunk) {
      if (applyHcmTeamFilter && !isBaocaoOrderRowHcm(row)) continue;
      const code = row?.order_code != null ? String(row.order_code).trim() : '';
      if (!code) continue;
      if (!byCode.has(code)) byCode.set(code, row);
    }
  };

  const paginate = async (dateMode) => {
    let from = 0;
    while (byCode.size < cap) {
      const chunk = await fetchOrdersTablePage(supabase, tableName, {
        startDate,
        endDate,
        dateMode,
        from,
        pageSize: PAGE,
        hcmTeamOnly: applyHcmTeamFilter,
      });
      ingest(chunk);
      if (chunk.length < PAGE) break;
      from += PAGE;
    }
  };

  if (startDate && endDate) {
    await paginate('order_date');
    await paginate('created_at_null_order_date');
  } else {
    await paginate('order_date');
  }

  return Array.from(byCode.values()).slice(0, cap).map(mapOrderDbRowToLegacyF3Baocao);
}

/**
 * Không dùng select('*'). Thử lần lượt bộ cột hẹp dần — DB cũ có thể thiếu email/username.
 * Lỗi "user_name does not exist" thường do process server cũ vẫn gọi select('*') hoặc DB thiếu migration;
 * chạy migration `20260426120000_users_add_user_name_if_missing.sql` trên Supabase nếu cần.
 */
const HR_SELECT_ATTEMPTS = [
  'id,email,username,name,role,team,branch,department,position',
  'id,username,name,role,team,branch,department,position',
  'id,name,role,team,branch,department,position',
  'id,name,team,branch,department,position',
];

export async function fetchHrLegacyMapped(supabase) {
  let data = null;
  let error = null;
  for (let i = 0; i < HR_SELECT_ATTEMPTS.length; i++) {
    const cols = HR_SELECT_ATTEMPTS[i];
    const res = await supabase.from('users').select(cols);
    data = res.data;
    error = res.error;
    if (!error) break;
    console.warn(
      `[baocaoVandonNvData] HR select attempt ${i + 1}/${HR_SELECT_ATTEMPTS.length} failed (${cols.slice(0, 40)}…):`,
      error.code || '',
      error.message || error
    );
  }
  if (error) throw error;
  const list = (data || []).map(mapUserRowToLegacyNhanSu).filter(Boolean);
  /** KPI cần Team hoặc Bộ phận để gán loại NV; chỉ lọc theo Team sẽ mất nhân sự có department nhưng chưa nhập team. */
  return list.filter((r) => {
    const tm = (r.Team || '').toString().trim();
    const bp = (r['Bộ phận'] || r.Bo_phan || '').toString().trim();
    return !!(tm || bp);
  });
}

/** KPI: không làm vỡ tab khi users/RLS/Schema lỗi — trả []. */
export async function fetchHrForKpiOrEmpty(supabase) {
  try {
    return await fetchHrLegacyMapped(supabase);
  } catch (e) {
    const msg =
      e && e.message
        ? String(e.message)
        : e && e.code
          ? String(e.code)
          : 'unknown';
    console.warn('[baocaoVandonNvData] HR users unavailable, using []:', msg);
    return [];
  }
}

