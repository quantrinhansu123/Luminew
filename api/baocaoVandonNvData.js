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

export function mapUserRowToLegacyNhanSu(u) {
  if (!u || typeof u !== 'object') return null;
  const name = [u.name, u.username, u.user_name].find((x) => x && String(x).trim());
  const displayName = name ? String(name).trim() : '';
  const team = (u.team || u.branch || '').toString().trim();
  const idStr = u.id != null ? String(u.id).trim() : '';
  return {
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
}

export async function fetchF3LegacyMapped(supabase, opts = {}) {
  const { startDate = '', endDate = '', maxRows } = opts;
  const cap = Math.min(Number(maxRows) || 80000, 150000);
  const rows = [];
  let from = 0;

  while (rows.length < cap) {
    let q = supabase.from('orders').select('*');
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

export async function fetchHrLegacyMapped(supabase) {
  const { data, error } = await supabase
    .from('users')
    .select('id,name,username,team,branch,position');
  if (error) throw error;
  const list = (data || []).map(mapUserRowToLegacyNhanSu).filter(Boolean);
  return list.filter((r) => r.Team);
}

export async function proxyMktReport(env = process.env) {
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
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`MKT proxy ${r.status}: ${text.slice(0, 200)}`);
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/** KPI iframe: nếu n-api / Google sheet lỗi (invalid_grant, …) trả JSON rỗng thay vì 500. */
export async function fetchMktForKpiOrEmpty() {
  try {
    return await proxyMktReport();
  } catch (e) {
    const msg = e && e.message ? String(e.message).split('\n')[0].slice(0, 160) : 'unknown';
    console.warn('[baocaoVandonNvData] MKT upstream unavailable, using empty payload:', msg);
    return { data: [], rows: [] };
  }
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
      const body = await fetchMktForKpiOrEmpty();
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      res.status(200).json(body);
      return;
    }

    const client = getSupabase();

    if (kind === 'hr' || kind === 'nhan-su' || kind === 'nhansu') {
      const hr = await fetchHrLegacyMapped(client);
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=240');
      res.status(200).json(hr);
      return;
    }

    const startDate = req.query.start_date ? String(req.query.start_date).trim() : '';
    const endDate = req.query.end_date ? String(req.query.end_date).trim() : '';
    const maxRows = req.query.max_rows ? Number(req.query.max_rows) : undefined;

    const mapped = await fetchF3LegacyMapped(client, { startDate, endDate, maxRows });
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    res.status(200).json(mapped);
  } catch (e) {
    const msg = e && e.message ? String(e.message) : 'Server error';
    console.error('[baocaoVandonNvData]', kind, msg);
    res.status(500).json({ error: msg, kind });
  }
}
