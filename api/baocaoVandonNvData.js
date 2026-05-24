import { createClient } from '@supabase/supabase-js';

const PAGE = 800;

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
  shipping_fee: 'Phí ship',
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

  return appOrder;
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
  let deptRaw = (u.department || u.dept || '').toString().trim();
  if (!deptRaw) deptRaw = inferBoPhanFromUserFields(u);
  const idStr = u.id != null ? String(u.id).trim() : '';
  const row = {
    id: idStr,
    ID: idStr,
    Team: team,
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
async function fetchMktFromDetailReports(supabase) {
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

/** Báo cáo vận đơn NV (`/baocao-vandon-nv`) — chỉ bảng HCM, không đọc `orders`. */
export const BAOCAO_VANDON_NV_ORDERS_TABLE = 'order_code_hcm';

export async function fetchF3LegacyMapped(supabase, opts = {}) {
  const { startDate = '', endDate = '', maxRows } = opts;
  const tableName = BAOCAO_VANDON_NV_ORDERS_TABLE;
  const cap = Math.min(Number(maxRows) || 80000, 150000);
  const rows = [];
  let from = 0;

  while (rows.length < cap) {
    let q = supabase.from(tableName).select('*');
    if (startDate) q = q.gte('order_date', startDate);
    if (endDate) q = q.lte('order_date', endDate);
    q = q
      .order('order_date', { ascending: false, nullsFirst: false })
      .order('order_code', { ascending: false })
      .range(from, from + PAGE - 1);

    const { data, error } = await q;
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }

  return rows.slice(0, cap).map(mapOrderDbRowToLegacyF3);
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

/** Một lần gọi n-api; KPI dùng kết quả mềm, proxyMktReport ném lỗi nếu cần báo cứng. */
async function fetchMktReportUpstream(env = process.env) {
  const base =
    env.MKT_REPORT_API_BASE || 'https://n-api-gamma.vercel.app/report/generate';
  const url = `${base}?tableName=${encodeURIComponent('Báo cáo MKT')}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25000);
  try {
    const r = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await r.text();
    if (!r.ok) {
      return {
        ok: false,
        reason: 'http',
        status: r.status,
        snippet: text.slice(0, 220),
      };
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, reason: 'parse', snippet: text.slice(0, 120) };
    }
    if (json && json.success === false) {
      return {
        ok: false,
        reason: 'report',
        snippet: String(json.message || '').slice(0, 200),
      };
    }
    return { ok: true, json };
  } catch (e) {
    const msg = e && e.message ? String(e.message).split('\n')[0].slice(0, 160) : 'unknown';
    return { ok: false, reason: 'network', snippet: msg };
  } finally {
    clearTimeout(t);
  }
}

/** Gọi n-api MKT; lỗi mạng/HTTP/JSON → throw (dùng khi cần fail cứng). */
export async function proxyMktReport(env = process.env) {
  const r = await fetchMktReportUpstream(env);
  if (!r.ok) {
    const detail =
      r.reason === 'http'
        ? `MKT proxy ${r.status}: ${r.snippet}`
        : `MKT ${r.reason}: ${r.snippet}`;
    throw new Error(detail);
  }
  return r.json;
}

/**
 * KPI: không throw. Thứ tự: n-api → nếu lỗi thì detail_reports (Supabase) → rỗng.
 * @param {import('@supabase/supabase-js').SupabaseClient | null} supabaseClient — bắt buộc trên server để fallback DB
 */
export async function fetchMktForKpiOrEmpty(env = process.env, supabaseClient = null) {
  const r = await fetchMktReportUpstream(env);
  if (r.ok) return r.json;
  console.warn('[baocaoVandonNvData] MKT n-api unavailable:', r.reason, (r.snippet || '').slice(0, 120));
  if (supabaseClient) {
    try {
      const fallbackRows = await fetchMktFromDetailReports(supabaseClient);
      if (fallbackRows.length) {
        console.warn(
          '[baocaoVandonNvData] MKT using detail_reports fallback:',
          fallbackRows.length,
          'rows'
        );
        return { data: fallbackRows, rows: fallbackRows };
      }
    } catch (e) {
      console.warn('[baocaoVandonNvData] detail_reports MKT fallback failed:', e && e.message);
    }
  }
  return { data: [], rows: [] };
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Thiếu SUPABASE_URL/VITE_SUPABASE_URL hoặc key Supabase trên server');
  }
  return createClient(url, key);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-Requested-With, Accept, Content-Type'
  );
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const kind = (req.query.kind || 'f3').toString().toLowerCase();

  try {
    if (kind === 'mkt') {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      let sb = null;
      try {
        sb = getSupabase();
      } catch (_) {
        /* chỉ n-api, không có fallback DB */
      }
      try {
        const body = await fetchMktForKpiOrEmpty(process.env, sb);
        res.status(200).json(body && typeof body === 'object' ? body : { data: [], rows: [] });
      } catch (e) {
        console.warn('[baocaoVandonNvData] kind=mkt handler fallback:', e && e.message);
        res.status(200).json({ data: [], rows: [] });
      }
      return;
    }

    const client = getSupabase();

    if (kind === 'hr' || kind === 'nhan-su' || kind === 'nhansu') {
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=240');
      try {
        const hr = await fetchHrForKpiOrEmpty(client);
        res.status(200).json(Array.isArray(hr) ? hr : []);
      } catch (e) {
        console.warn('[baocaoVandonNvData] kind=hr handler fallback:', e && e.message);
        res.status(200).json([]);
      }
      return;
    }

    const startDate = req.query.start_date ? String(req.query.start_date).trim() : '';
    const endDate = req.query.end_date ? String(req.query.end_date).trim() : '';
    const maxRows = req.query.max_rows ? Number(req.query.max_rows) : undefined;

    const mapped = await fetchF3LegacyMapped(client, {
      startDate,
      endDate,
      maxRows,
    });
    res.setHeader('X-Baocao-Vandon-Source-Table', BAOCAO_VANDON_NV_ORDERS_TABLE);
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    res.status(200).json(mapped);
  } catch (e) {
    const msg = e && e.message ? String(e.message) : 'Server error';
    console.error('[baocaoVandonNvData]', kind, msg);
    res.status(500).json({ error: msg, kind });
  }
}
