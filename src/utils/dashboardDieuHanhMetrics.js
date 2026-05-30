import {
  isGiaoHangHistogramSyntheticKey,
  parseBaoCaoVanDonHistogram,
  sumBaoCaoVanDonHistogramValues,
  sumDonCoBillFullAmount,
  sumDonCoBillFullCount,
} from './baoCaoVanDonFormat';

export const PAGE_SIZE = 1000;
export const MAX_PAGES = 60;
export const MKT_DATE_COL = '"Ngày"';

export const DEPARTMENTS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'mkt', label: 'MKT' },
  { value: 'sale', label: 'Sale' },
  { value: 'cskh', label: 'CSKH' },
  { value: 'delivery', label: 'Vận đơn' },
  { value: 'hcns', label: 'HCNS' },
  { value: 'rnd', label: 'R&D' },
];

export const DEPARTMENT_FILTERS = DEPARTMENTS.filter((item) => item.value !== 'all');

export const BRANCHES = [
  { value: 'all', label: 'Tổng' },
  { value: 'hn', label: 'Hà Nội' },
  { value: 'hcm', label: 'Hồ Chí Minh' },
];

export const COMPANY_METRICS = [
  { key: 'orders', label: 'Số đơn', format: 'number' },
  { key: 'revenue', label: 'Doanh thu thực', format: 'money' },
  { key: 'adsRate', label: '% CP / Doanh thu', format: 'percent', threshold: 0.35, direction: 'max' },
  { key: 'closeRate', label: 'Tỉ lệ chốt', format: 'percent', threshold: 0.08, direction: 'min' },
  { key: 'deliverySuccessRate', label: 'Tỉ lệ giao TC', format: 'percent', threshold: 0.9, direction: 'min' },
  { key: 'cancelReturnRate', label: 'Hủy + Hoàn', format: 'percent', threshold: 0.08, direction: 'max' },
  { key: 'collectionRate', label: 'Tỉ lệ thu tiền', format: 'percent', threshold: 0.8, direction: 'min' },
  { key: 'collectedAmount', label: 'Tiền đã thu', format: 'money' },
];

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatLocalYmd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function defaultDateRange() {
  const end = new Date();
  const start = startOfMonth(addMonths(end, -3));
  return { from: formatLocalYmd(start), to: formatLocalYmd(end) };
}

export function normalizeYmd(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (slash) return `${slash[3]}-${pad2(slash[2])}-${pad2(slash[1])}`;
  return raw.slice(0, 10);
}

export function monthKeyFromYmd(ymd) {
  const s = normalizeYmd(ymd);
  return s.length >= 7 ? s.slice(0, 7) : '';
}

function parseDateLike(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;
  const ymd = normalizeYmd(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return new Date(`${ymd}T00:00:00`);
  return null;
}

function parseYmdDate(value) {
  const ymd = normalizeYmd(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
}

function ageHoursFromNow(value) {
  const d = parseDateLike(value);
  if (!d) return 0;
  return (Date.now() - d.getTime()) / 36e5;
}

export function buildLastFourMonthBuckets(toYmd) {
  const endRaw = normalizeYmd(toYmd) || formatLocalYmd(new Date());
  const end = new Date(Number(endRaw.slice(0, 4)), Number(endRaw.slice(5, 7)) - 1, 1);
  return [3, 2, 1, 0].map((offset, index) => {
    const d = addMonths(end, -offset);
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
      key,
      label: `Kỳ ${index + 1}`,
      rangeLabel: `${pad2(d.getMonth() + 1)}/${d.getFullYear()}`,
      start: `${key}-01`,
      end: formatLocalYmd(monthEnd),
      type: 'month',
      isReportPeriod: index === 3,
    };
  });
}

function dayMonthLabel(d) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

export function buildLastFourWeekBuckets(fromYmd, toYmd) {
  const selectedEnd = parseYmdDate(toYmd) || new Date();
  const selectedStart = parseYmdDate(fromYmd) || addDays(selectedEnd, -6);
  const diffMs = selectedEnd.getTime() - selectedStart.getTime();
  const durationDays = Math.max(1, Math.round(diffMs / 864e5) + 1);

  return [3, 2, 1, 0].map((offset, index) => {
    const start = addDays(selectedStart, -durationDays * offset);
    const end = addDays(selectedEnd, -durationDays * offset);
    const startKey = formatLocalYmd(start);
    const endKey = formatLocalYmd(end);
    return {
      key: `${startKey}_${endKey}`,
      label: `Kỳ ${index + 1}`,
      rangeLabel: `${dayMonthLabel(start)}-${dayMonthLabel(end)}/${end.getFullYear()}`,
      start: startKey,
      end: endKey,
      type: 'week',
      isReportPeriod: index === 3,
    };
  });
}

export function buildLastFourPeriodBuckets(periodMode, fromYmd, toYmd) {
  return periodMode === 'week' ? buildLastFourWeekBuckets(fromYmd, toYmd) : buildLastFourMonthBuckets(toYmd);
}

export function parseNumberLoose(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value).trim();
  if (!raw) return 0;
  const negative = raw.startsWith('-');
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return 0;
  const n = Number(`${negative ? '-' : ''}${digits}`);
  return Number.isFinite(n) ? n : 0;
}

export function getFirst(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

function rowInDateRange(row, from, to) {
  const d = normalizeYmd(row?.date);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function getFirstNumberLoose(row, keys) {
  let fallback = null;
  for (const key of keys) {
    const value = row?.[key];
    if (value === undefined || value === null || String(value).trim() === '') continue;
    const parsed = parseNumberLoose(value);
    if (fallback === null) fallback = parsed;
    if (parsed !== 0) return parsed;
  }
  return fallback ?? 0;
}

export function normalizePick(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function branchKeyFromText(value, fallback = 'hn') {
  const n = normalizeText(value);
  if (n.includes('hcm') || n.includes('ho chi minh') || n.includes('sai gon')) return 'hcm';
  if (n.includes('ha noi') || n.includes('hn')) return 'hn';
  return fallback;
}

export function branchLabelFromKey(value) {
  if (value === 'hcm') return 'Hồ Chí Minh';
  if (value === 'hn') return 'Hà Nội';
  return 'Tổng hợp';
}

export function classifyBusinessTeam(value) {
  const n = normalizeText(value);
  if (n.includes('cskh') || n.includes('cham soc')) return 'cskh';
  if (n.includes('van don') || n.includes('delivery') || n.includes('ffm') || n.includes('van hanh')) return 'delivery';
  if (n.includes('hcns') || n.includes('nhan su') || n.includes('hanh chinh') || n.includes('hr')) return 'hcns';
  if (n.includes('r&d') || n === 'rd' || n.includes('rnd') || n.includes('sp test')) return 'rnd';
  if (n.includes('mkt') || n.includes('marketing')) return 'mkt';
  if (n.includes('sale')) return 'sale';
  return 'sale';
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

export function formatMoney(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} triệu`;
  return `${formatNumber(n)} đ`;
}

export function formatPercent(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0.0%';
  return `${(n * 100).toFixed(1)}%`;
}

export function formatByType(value, type) {
  if (type === 'money') return formatMoney(value);
  if (type === 'percent') return formatPercent(value);
  return formatNumber(value);
}

function parseDisplayPercent(value) {
  const raw = String(value ?? '').replace(',', '.');
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export function ratio(n, d) {
  const dd = Number(d || 0);
  if (!dd) return 0;
  return Number(n || 0) / dd;
}

export function calcDelta(current, previous) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (!prev) return cur ? 1 : 0;
  return (cur - prev) / Math.abs(prev);
}

function averageNumbers(values) {
  const nums = values.map((value) => Number(value || 0)).filter((value) => Number.isFinite(value));
  if (nums.length === 0) return 0;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function averagePreviousPeriodValue(periodRows, key) {
  return averageNumbers((periodRows || []).slice(0, -1).map((row) => row?.[key]));
}

function averagePreviousMetricRaw(periodRows, label) {
  const target = normalizeText(label);
  return averageNumbers(
    (periodRows || []).slice(0, -1).map((row) => {
      const metric = row?.metrics?.find((item) => normalizeText(item.label) === target);
      return metric?.raw;
    })
  );
}

export function statusKind(value, threshold, direction) {
  if (threshold == null) return 'good';
  const n = Number(value || 0);
  if (direction === 'max') return n > threshold ? 'danger' : 'good';
  return n < threshold ? 'danger' : 'good';
}

export function thresholdText(metric) {
  if (metric.threshold == null) return 'OK';
  return `${metric.direction === 'max' ? 'Ngưỡng >' : 'Ngưỡng <'} ${formatPercent(metric.threshold)}`;
}

export function mapMktRow(row, source) {
  const date = normalizeYmd(getFirst(row, ['Ngày']));
  if (!date) return null;
  const soDonInput = getFirstNumberLoose(row, ['Số đơn', 'Số_đơn', 'So don']);
  const soDonActual = getFirstNumberLoose(row, ['Số đơn thực tế', 'Số đơn TT', 'so_don_thuc_te']);
  const revenueInput = getFirstNumberLoose(row, ['Doanh số', 'Doanh_số', 'Doanh so']);
  const revenueActual = getFirstNumberLoose(row, [
      'Doanh số TT',
      'doanh_so_tt',
      'Doanh thu chốt thực tế',
      'doanh_thu_chot_thuc_te',
      'Doanh số thực tế',
      'DS chốt',
      'Doanh số sau ship',
  ]);
  const isHcm = source === 'hcm';
  return {
    source,
    branch: isHcm ? 'hcm' : 'hn',
    branchLabel: isHcm ? 'Hồ Chí Minh' : 'Hà Nội',
    date,
    monthKey: monthKeyFromYmd(date),
    name: normalizePick(getFirst(row, ['Tên', 'name']) || 'Không xác định'),
    team: normalizePick(getFirst(row, ['Team', 'team']) || (isHcm ? 'MKT HCM' : 'MKT')),
    product: normalizePick(getFirst(row, ['Sản_phẩm', 'Sản phẩm', 'product']) || ''),
    market: normalizePick(getFirst(row, ['Thị_trường', 'Thị trường', 'market']) || ''),
    messages: parseNumberLoose(getFirst(row, ['Số_Mess_Cmt', 'Số Mess', 'so_mess_cmt'])),
    adsCost: getFirstNumberLoose(row, ['CPQC', 'cpqc', 'CPOC', 'cpoc', 'CPQC theo TKQC', 'cpqc_theo_tkqc']),
    orders: soDonActual,
    ordersForCloseRate: isHcm ? soDonInput : soDonActual,
    revenue: revenueActual,
    revenueForAdsRate: isHcm ? revenueInput : revenueActual,
    cancelOrders: parseNumberLoose(getFirst(row, ['Số đơn hoàn hủy thực tế', 'Số đơn hoàn hủy', 'So don huy'])),
  };
}

function orderMktStaffName(row) {
  return normalizePick(row?.marketing_staff || row?.nhanvien_maketing || row?.nhan_vien_marketing || 'Không xác định');
}

function isCanceledOrder(row) {
  return normalizeText(row?.check_result) === 'huy';
}

export function mapOrderToMktActualRow(row, branch) {
  const date = normalizeYmd(row?.order_date) || normalizeYmd(row?.created_at);
  if (!date) return null;
  const canceled = isCanceledOrder(row);
  const amount = resolveOrderMoney(row);
  const netOrder = canceled ? 0 : 1;
  const netRevenue = canceled ? 0 : amount;
  const isHcm = branch === 'hcm';
  return {
    source: isHcm ? 'hcm-orders' : 'hn-orders',
    branch,
    branchLabel: isHcm ? 'Hồ Chí Minh' : 'Hà Nội',
    date,
    monthKey: monthKeyFromYmd(date),
    name: orderMktStaffName(row),
    team: isHcm ? 'MKT - Đức Anh' : 'HN-MKT',
    product: normalizePick(row?.product || row?.product_name_1 || ''),
    market: normalizePick(row?.country || ''),
    messages: 0,
    adsCost: 0,
    orders: netOrder,
    ordersForCloseRate: 0,
    revenue: netRevenue,
    revenueForAdsRate: 0,
    cancelOrders: canceled ? 1 : 0,
  };
}

export function mapSalesReportRow(row) {
  const date = normalizeYmd(row?.date);
  if (!date) return null;
  const branch = branchKeyFromText(row?.branch || row?.team, 'hn');
  return {
    branch,
    branchLabel: branchLabelFromKey(branch),
    date,
    monthKey: monthKeyFromYmd(date),
    name: normalizePick(row?.name || row?.username || 'Không xác định'),
    team: normalizePick(row?.team || ''),
    teamKind: classifyBusinessTeam(row?.team || row?.department || row?.position),
    product: normalizePick(row?.product || ''),
    market: normalizePick(row?.market || ''),
    messages: Number(row?.mess_count || 0),
    responses: Number(row?.response_count || 0),
    orders: Number(row?.order_count_actual ?? row?.order_count ?? 0),
    revenue: Number(row?.revenue_actual ?? row?.revenue_mess ?? 0),
    cancelOrders: Number(row?.order_cancel_count_actual ?? row?.order_cancel_count ?? 0),
    customerOld: Number(row?.customer_old || 0),
    customerNew: Number(row?.customer_new || 0),
    crossSale: Number(row?.cross_sale || 0),
  };
}

export function mapUserRow(row) {
  const createdAt = normalizeYmd(row?.created_at);
  const branch = branchKeyFromText(row?.branch || row?.team || row?.department, 'hn');
  return {
    branch,
    branchLabel: branchLabelFromKey(branch),
    date: createdAt,
    monthKey: monthKeyFromYmd(createdAt),
    name: normalizePick(row?.name || row?.username || row?.email || 'Không xác định'),
    department: normalizePick(row?.department || ''),
    team: normalizePick(row?.team || ''),
    teamKind: classifyBusinessTeam(row?.department || row?.team),
    active: row?.is_active !== false && String(row?.status || '').toLowerCase() !== 'inactive',
  };
}

function resolveOrderMoney(row) {
  const candidates = [
    row?.van_don_line_total_vnd,
    row?.tong_tien_vnd,
    row?.tong_tien_VND,
    row?.total_amount_vnd,
    row?.total_vnd,
    row?.sale_price,
    row?.goods_amount,
  ];
  for (const v of candidates) {
    if (v == null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return 0;
}

function resolveCollectedMoney(row) {
  const candidates = [row?.reconciled_vnd, row?.reconciled_amount, row?.total_amount_vnd];
  for (const v of candidates) {
    if (v == null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return 0;
}

function paymentLabelForOrder(row) {
  const detail = String(row?.payment_status_detail ?? '').trim();
  return detail || String(row?.payment_status ?? '').trim();
}

function isFullBill(label) {
  const n = normalizeText(label);
  if (!n) return false;
  if (n.includes('1 phan') && n.includes('bill')) return false;
  return n.includes('co bill');
}

function orderHasBillEvidence(row) {
  return Boolean(String(row?.ngayupbill ?? '').trim() || String(row?.payment_bill ?? '').trim() || String(row?.payment_image ?? '').trim());
}

function classifyDeliveryKey(key) {
  const n = normalizeText(key);
  if (!n || n === 'trong' || n.includes('trong trang thai')) return 'empty';
  if (n.includes('don thanh cong') || n.includes('giao thanh cong')) return 'success';
  if (n.includes('dang giao')) return 'shipping';
  if (n.includes('chua giao')) return 'notDelivered';
  if (n.includes('cho check')) return 'checking';
  if (n.includes('huy') || n.includes('cancel')) return 'cancel';
  if (n.includes('hoan')) return 'return';
  return 'other';
}

export function mapOrderToVanDonRow(row, branch) {
  const date = normalizeYmd(row?.order_date) || normalizeYmd(row?.created_at);
  if (!date) return null;
  const deliveryLabel = String(row?.delivery_status_nb ?? row?.delivery_status ?? '').trim();
  const bucket = classifyDeliveryKey(deliveryLabel);
  const paymentLabel = paymentLabelForOrder(row);
  const hasBill = orderHasBillEvidence(row) || isFullBill(paymentLabel);
  const statusCounts = {
    success: bucket === 'success' ? 1 : 0,
    shipping: bucket === 'shipping' ? 1 : 0,
    notDelivered: bucket === 'notDelivered' ? 1 : 0,
    checking: bucket === 'checking' ? 1 : 0,
    cancel: bucket === 'cancel' ? 1 : 0,
    returned: bucket === 'return' ? 1 : 0,
    emptyStatus: !deliveryLabel || bucket === 'empty' ? 1 : 0,
  };

  return {
    branch,
    branchLabel: branch === 'hcm' ? 'Hồ Chí Minh' : 'Hà Nội',
    date,
    monthKey: monthKeyFromYmd(date),
    name: normalizePick(row?.delivery_staff || 'Chưa phân công'),
    team: 'Vận đơn',
    product: '',
    market: normalizePick(row?.country || ''),
    totalOrders: 1,
    ...statusCounts,
    tracking: String(row?.tracking_code ?? '').trim() ? 1 : 0,
    pushedOps: String(row?.shipping_unit ?? '').trim() ? 1 : 0,
    billOrders: hasBill ? 1 : 0,
    billAmount: hasBill ? resolveCollectedMoney(row) : 0,
    amount: resolveOrderMoney(row),
    stale24h: ['shipping', 'notDelivered', 'checking', 'empty', 'other'].includes(bucket) && ageHoursFromNow(row?.created_at || row?.order_date) > 24 ? 1 : 0,
  };
}

function sumDeliveryBucket(histogram, bucket) {
  const obj = parseBaoCaoVanDonHistogram(histogram);
  let total = 0;
  for (const [key, raw] of Object.entries(obj)) {
    if (isGiaoHangHistogramSyntheticKey(key)) continue;
    if (classifyDeliveryKey(key) === bucket) total += Number(raw) || 0;
  }
  return total;
}

function sumDeliveryTotal(histogram) {
  const obj = parseBaoCaoVanDonHistogram(histogram);
  let total = 0;
  for (const [key, raw] of Object.entries(obj)) {
    if (isGiaoHangHistogramSyntheticKey(key)) continue;
    total += Number(raw) || 0;
  }
  return total;
}

function sumSynthetic(histogram, label) {
  const obj = parseBaoCaoVanDonHistogram(histogram);
  const target = normalizeText(label);
  let total = 0;
  for (const [key, raw] of Object.entries(obj)) {
    if (normalizeText(key) === target) total += Number(raw) || 0;
  }
  return total;
}

export function mapVanDonSummaryRow(row) {
  const date = normalizeYmd(row?.ngay);
  if (!date) return null;
  const deliveryHist = row?.trang_thai_giao_hang;
  const checkHist = row?.ket_qua_check;
  const paymentHist = row?.trang_thai_thanh_toan;
  const moneyHist = row?.tien_trang_thai_thanh_toan;
  const totalOrders = sumDeliveryTotal(deliveryHist) || sumBaoCaoVanDonHistogramValues(checkHist);
  const billOrders = sumDonCoBillFullCount(paymentHist);
  const billAmount = sumDonCoBillFullAmount(moneyHist);
  return {
    branch: 'all',
    branchLabel: 'Tổng hợp',
    date,
    monthKey: monthKeyFromYmd(date),
    name: normalizePick(row?.nhan_vien || 'Không xác định'),
    team: 'Vận đơn',
    product: normalizePick(row?.san_pham || ''),
    market: normalizePick(row?.thi_truong || ''),
    totalOrders,
    success: sumDeliveryBucket(deliveryHist, 'success'),
    shipping: sumDeliveryBucket(deliveryHist, 'shipping'),
    notDelivered: sumDeliveryBucket(deliveryHist, 'notDelivered'),
    checking: sumDeliveryBucket(deliveryHist, 'checking'),
    cancel: sumDeliveryBucket(deliveryHist, 'cancel'),
    returned: sumDeliveryBucket(deliveryHist, 'return'),
    emptyStatus: sumDeliveryBucket(deliveryHist, 'empty'),
    tracking: sumSynthetic(deliveryHist, 'Mã Tracking'),
    pushedOps: sumSynthetic(deliveryHist, 'Lên vận hành'),
    billOrders,
    billAmount,
    stale24h: 0,
  };
}

export function emptyMktAgg(label = '') {
  return {
    label,
    messages: 0,
    adsCost: 0,
    orders: 0,
    ordersForCloseRate: 0,
    revenue: 0,
    revenueForAdsRate: 0,
    cancelOrders: 0,
  };
}

export function emptyVdAgg(label = '') {
  return {
    label,
    totalOrders: 0,
    success: 0,
    shipping: 0,
    notDelivered: 0,
    checking: 0,
    cancel: 0,
    returned: 0,
    emptyStatus: 0,
    tracking: 0,
    pushedOps: 0,
    billOrders: 0,
    billAmount: 0,
    stale24h: 0,
  };
}

export function emptySalesAgg(label = '') {
  return {
    label,
    messages: 0,
    responses: 0,
    orders: 0,
    revenue: 0,
    cancelOrders: 0,
    customerOld: 0,
    customerNew: 0,
    crossSale: 0,
    products: new Set(),
  };
}

export function emptyUserAgg(label = '') {
  return { label, total: 0, active: 0, inactive: 0, newHires: 0 };
}

export function addMkt(agg, row) {
  agg.messages += row.messages;
  agg.adsCost += row.adsCost;
  agg.orders += row.orders;
  agg.ordersForCloseRate += row.ordersForCloseRate ?? row.orders;
  agg.revenue += row.revenue;
  agg.revenueForAdsRate += row.revenueForAdsRate ?? row.revenue;
  agg.cancelOrders += row.cancelOrders;
}

export function addVd(agg, row) {
  for (const key of Object.keys(emptyVdAgg())) {
    if (key !== 'label') agg[key] += Number(row[key] || 0);
  }
}

export function addSales(agg, row) {
  agg.messages += Number(row.messages || 0);
  agg.responses += Number(row.responses || 0);
  agg.orders += Number(row.orders || 0);
  agg.revenue += Number(row.revenue || 0);
  agg.cancelOrders += Number(row.cancelOrders || 0);
  agg.customerOld += Number(row.customerOld || 0);
  agg.customerNew += Number(row.customerNew || 0);
  agg.crossSale += Number(row.crossSale || 0);
  if (row.product) agg.products.add(row.product);
}

export function addUser(agg, row) {
  agg.total += 1;
  if (row.active) agg.active += 1;
  else agg.inactive += 1;
  if (row.date) agg.newHires += 1;
}

export function finalizeCompany(mkt, vd) {
  return {
    orders: mkt.orders,
    revenue: mkt.revenue,
    adsRate: ratio(mkt.adsCost, mkt.revenueForAdsRate || mkt.revenue),
    closeRate: ratio(mkt.ordersForCloseRate || mkt.orders, mkt.messages),
    deliverySuccessRate: ratio(vd.success, vd.totalOrders),
    cancelReturnRate: ratio(vd.cancel + vd.returned, vd.totalOrders),
    collectionRate: ratio(vd.billOrders, vd.success),
    collectedAmount: vd.billAmount,
    mkt,
    vd,
  };
}

export function summarizeByPeriod(mktRows, vdRows, buckets) {
  return buckets.map((bucket) => {
    const mkt = emptyMktAgg(bucket.label);
    const vd = emptyVdAgg(bucket.label);
    mktRows.filter((r) => rowInBucket(r, bucket)).forEach((r) => addMkt(mkt, r));
    vdRows.filter((r) => rowInBucket(r, bucket)).forEach((r) => addVd(vd, r));
    return { ...finalizeCompany(mkt, vd), label: bucket.label, rangeLabel: bucket.rangeLabel, key: bucket.key };
  });
}

function rowInBucket(row, bucket) {
  if (!bucket?.start) return row?.monthKey === bucket?.key;
  return rowInDateRange(row, bucket.start, bucket.end || bucket.start);
}

export function aggregateNamed(rows, addFn, emptyFn, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const label = normalizePick(keyFn(row) || 'Không xác định');
    if (!map.has(label)) map.set(label, emptyFn(label));
    addFn(map.get(label), row);
  }
  return [...map.values()];
}

function aggregateSalesRows(rows, label = '') {
  const agg = emptySalesAgg(label);
  rows.forEach((r) => addSales(agg, r));
  return agg;
}

function aggregateUserRows(rows, label = '') {
  const agg = emptyUserAgg(label);
  rows.forEach((r) => addUser(agg, r));
  return agg;
}

export function departmentLabel(value) {
  return DEPARTMENTS.find((item) => item.value === value)?.label || 'Tất cả';
}

export function metricPercent(periodRow, label) {
  const metric = periodRow?.metrics?.find((item) => normalizeText(item.label) === normalizeText(label));
  return parseDisplayPercent(metric?.value);
}

export function getDepartmentConfig(value, ctx) {
  const { current, salesRows, usersRows } = ctx;
  const sale = aggregateSalesRows(salesRows.filter((r) => r.teamKind === 'sale'), 'Sale');
  const cskh = aggregateSalesRows(salesRows.filter((r) => r.teamKind === 'cskh'), 'CSKH');
  const rnd = aggregateSalesRows(salesRows.filter((r) => r.teamKind === 'rnd'), 'R&D');
  const hcns = aggregateUserRows(usersRows.filter((r) => r.teamKind === 'hcns'), 'HCNS');
  const mkt = current.mkt;
  const vd = current.vd;

  if (value === 'mkt') {
    const adsBase = mkt.revenueForAdsRate || mkt.revenue;
    const closeOrders = mkt.ordersForCloseRate || mkt.orders;
    return {
      value,
      label: 'MKT',
      revenue: mkt.revenue,
      trendLabel: 'Ads / doanh thu',
      trendValue: ratio(mkt.adsCost, adsBase),
      trendFormat: formatPercent,
      risk: ratio(mkt.adsCost, adsBase) > 0.35 || ratio(mkt.cancelOrders, mkt.orders) > 0.08,
      metrics: [
        { label: 'Doanh thu', value: formatMoney(mkt.revenue), raw: mkt.revenue, format: 'money' },
        { label: 'Tỷ lệ Ads', value: formatPercent(ratio(mkt.adsCost, adsBase)), raw: ratio(mkt.adsCost, adsBase), format: 'percent', danger: ratio(mkt.adsCost, adsBase) > 0.35, threshold: 0.35, direction: 'max' },
        { label: 'Số Mes', value: formatNumber(mkt.messages), raw: mkt.messages, format: 'number' },
        { label: 'Tỉ lệ chốt', value: formatPercent(ratio(closeOrders, mkt.messages)), raw: ratio(closeOrders, mkt.messages), format: 'percent', danger: ratio(closeOrders, mkt.messages) < 0.08, threshold: 0.08, direction: 'min' },
      ],
    };
  }

  if (value === 'sale') {
    const hasActualOrderData = Boolean(mkt.orders || mkt.revenue || mkt.cancelOrders);
    const source = {
      ...sale,
      revenue: hasActualOrderData ? mkt.revenue : sale.revenue,
      orders: hasActualOrderData ? mkt.orders : sale.orders,
      closeOrders: hasActualOrderData ? mkt.orders : sale.orders,
      messages: sale.messages || mkt.messages,
      cancelOrders: hasActualOrderData ? mkt.cancelOrders : sale.cancelOrders,
    };
    return {
      value,
      label: 'Sale',
      revenue: source.revenue,
      trendLabel: 'Tỉ lệ chốt đơn',
      trendValue: ratio(source.closeOrders, source.messages),
      trendFormat: formatPercent,
      risk: ratio(source.closeOrders, source.messages) < 0.08 || ratio(source.cancelOrders, source.orders) > 0.08,
      metrics: [
        { label: 'Doanh thu', value: formatMoney(source.revenue), raw: source.revenue, format: 'money' },
        { label: 'Tỉ lệ chốt đơn', value: formatPercent(ratio(source.closeOrders, source.messages)), raw: ratio(source.closeOrders, source.messages), format: 'percent', danger: ratio(source.closeOrders, source.messages) < 0.08, threshold: 0.08, direction: 'min' },
        { label: 'Tỷ lệ Hủy', value: formatPercent(ratio(source.cancelOrders, source.orders)), raw: ratio(source.cancelOrders, source.orders), format: 'percent', danger: ratio(source.cancelOrders, source.orders) > 0.08, threshold: 0.08, direction: 'max' },
        { label: 'Số đơn', value: formatNumber(source.orders), raw: source.orders, format: 'number' },
      ],
    };
  }

  if (value === 'cskh') {
    const cared = cskh.responses || cskh.orders;
    const repurchase = cskh.customerOld + cskh.crossSale;
    return {
      value,
      label: 'CSKH',
      revenue: cskh.revenue,
      trendLabel: 'Tỷ lệ mua lại',
      trendValue: ratio(repurchase, cskh.orders || cared),
      trendFormat: formatPercent,
      risk: false,
      metrics: [
        { label: 'Doanh thu', value: formatMoney(cskh.revenue), raw: cskh.revenue, format: 'money' },
        { label: 'Tỷ lệ CSKH', value: formatPercent(ratio(cared, cskh.messages || cskh.orders)), raw: ratio(cared, cskh.messages || cskh.orders), format: 'percent' },
        { label: 'Mua lại', value: formatPercent(ratio(repurchase, cskh.orders || cared)), raw: ratio(repurchase, cskh.orders || cared), format: 'percent' },
        { label: 'Khách cũ/Cross', value: formatNumber(repurchase), raw: repurchase, format: 'number' },
      ],
    };
  }

  if (value === 'delivery') {
    return {
      value,
      label: 'Vận đơn',
      revenue: vd.billAmount,
      trendLabel: 'Tỷ lệ thu tiền',
      trendValue: ratio(vd.billOrders, vd.success),
      trendFormat: formatPercent,
      risk: ratio(vd.billOrders, vd.success) < 0.8 || ratio(vd.cancel + vd.returned, vd.totalOrders) > 0.08,
      metrics: [
        { label: 'Doanh thu/tiền thu', value: formatMoney(vd.billAmount), raw: vd.billAmount, format: 'money' },
        { label: 'Tỷ lệ thu tiền', value: formatPercent(ratio(vd.billOrders, vd.success)), raw: ratio(vd.billOrders, vd.success), format: 'percent', danger: ratio(vd.billOrders, vd.success) < 0.8, threshold: 0.8, direction: 'min' },
        { label: 'Hủy + Hoàn', value: formatPercent(ratio(vd.cancel + vd.returned, vd.totalOrders)), raw: ratio(vd.cancel + vd.returned, vd.totalOrders), format: 'percent', danger: ratio(vd.cancel + vd.returned, vd.totalOrders) > 0.08, threshold: 0.08, direction: 'max' },
        { label: 'Quá 24h', value: formatNumber(vd.stale24h), raw: vd.stale24h, format: 'number', danger: vd.stale24h > 0 },
      ],
    };
  }

  if (value === 'hcns') {
    return {
      value,
      label: 'HCNS',
      revenue: 0,
      trendLabel: 'Tỷ lệ giữ người',
      trendValue: ratio(hcns.active, hcns.total),
      trendFormat: formatPercent,
      risk: ratio(hcns.active, hcns.total) < 0.9,
      metrics: [
        { label: 'Tỷ lệ tuyển dụng', value: formatPercent(ratio(hcns.newHires, hcns.total)), raw: ratio(hcns.newHires, hcns.total), format: 'percent' },
        { label: 'Tỷ lệ giữ người', value: formatPercent(ratio(hcns.active, hcns.total)), raw: ratio(hcns.active, hcns.total), format: 'percent', danger: ratio(hcns.active, hcns.total) < 0.9, threshold: 0.9, direction: 'min' },
        { label: 'Nhân sự active', value: formatNumber(hcns.active), raw: hcns.active, format: 'number' },
        { label: 'Tổng nhân sự', value: formatNumber(hcns.total), raw: hcns.total, format: 'number' },
      ],
    };
  }

  return {
    value: 'rnd',
    label: 'R&D',
    revenue: rnd.revenue,
    trendLabel: 'Sản phẩm kiểm duyệt',
    trendValue: rnd.products.size,
    trendFormat: formatNumber,
    risk: false,
    metrics: [
      { label: 'Doanh thu SP Test', value: formatMoney(rnd.revenue), raw: rnd.revenue, format: 'money' },
      { label: 'Sản phẩm qua bước', value: formatNumber(rnd.products.size), raw: rnd.products.size, format: 'number' },
      { label: 'Số Mes', value: formatNumber(rnd.messages), raw: rnd.messages, format: 'number' },
      { label: 'Số đơn', value: formatNumber(rnd.orders), raw: rnd.orders, format: 'number' },
    ],
  };
}

export function buildCompanyPeriodRows(monthly) {
  return COMPANY_METRICS.map((metric) => ({
    ...metric,
    values: monthly.map((m, index) => ({
      label: m.label,
      value: m[metric.key],
      display: formatByType(m[metric.key], metric.format),
      delta: index === 0 ? 0 : calcDelta(m[metric.key], monthly[index - 1]?.[metric.key]),
      danger: statusKind(m[metric.key], metric.threshold, metric.direction) === 'danger',
    })),
  }));
}

function optionLabel(value) {
  return normalizePick(value || '');
}

function buildValueOptions(rows, key) {
  const values = new Set();
  rows.forEach((row) => {
    const value = optionLabel(row?.[key]);
    if (value) values.add(value);
  });
  return [...values].sort((a, b) => a.localeCompare(b, 'vi'));
}

function matchesOptionalFilter(rowValue, selected) {
  if (!selected || selected === 'all') return true;
  return optionLabel(rowValue) === selected;
}

export function buildDashboardModel({ mktRows, vanDonRows, salesRows, usersRows, branch, market, product, department, team, person, from, to, periodMode = 'month' }) {
  const periodBuckets = buildLastFourPeriodBuckets(periodMode, from, to);
  const branchMktRows = branch === 'all' ? mktRows : mktRows.filter((r) => r.branch === branch);
  const branchVanDonRows = branch === 'all' ? vanDonRows : vanDonRows.filter((r) => r.branch === branch);
  const branchSalesRows = branch === 'all' ? salesRows : salesRows.filter((r) => r.branch === branch);
  const filteredUsersRows = branch === 'all' ? usersRows : usersRows.filter((r) => r.branch === branch);
  const marketOptions = buildValueOptions([...branchMktRows, ...branchVanDonRows, ...branchSalesRows], 'market');
  const marketScopedRows = [...branchMktRows, ...branchVanDonRows, ...branchSalesRows].filter((r) => matchesOptionalFilter(r.market, market));
  const productOptions = buildValueOptions(marketScopedRows, 'product');
  const filteredMktRowsHistory = branchMktRows.filter((r) => matchesOptionalFilter(r.market, market) && matchesOptionalFilter(r.product, product));
  const filteredVanDonRowsHistory = branchVanDonRows.filter((r) => matchesOptionalFilter(r.market, market) && matchesOptionalFilter(r.product, product));
  const filteredSalesRowsHistory = branchSalesRows.filter((r) => matchesOptionalFilter(r.market, market) && matchesOptionalFilter(r.product, product));
  const filteredMktRows = filteredMktRowsHistory.filter((r) => rowInDateRange(r, from, to));
  const filteredVanDonRows = filteredVanDonRowsHistory.filter((r) => rowInDateRange(r, from, to));
  const filteredSalesRows = filteredSalesRowsHistory.filter((r) => rowInDateRange(r, from, to));
  const monthly = summarizeByPeriod(filteredMktRowsHistory, filteredVanDonRowsHistory, periodBuckets);

  const mkt = emptyMktAgg('Tổng MKT');
  const vd = emptyVdAgg('Tổng vận đơn');
  filteredMktRows.forEach((r) => addMkt(mkt, r));
  filteredVanDonRows.forEach((r) => addVd(vd, r));
  const current = finalizeCompany(mkt, vd);
  const previous = monthly.length >= 2 ? monthly[monthly.length - 2] : null;
  const selectedDepartmentValue = department === 'all' ? 'mkt' : department;
  const selectedTeam = team || 'all';

  const companyKpis = COMPANY_METRICS.map((metric) => ({
    ...metric,
    value: current[metric.key],
    display: formatByType(current[metric.key], metric.format),
    delta: calcDelta(current[metric.key], averagePreviousPeriodValue(monthly, metric.key)),
    status: statusKind(current[metric.key], metric.threshold, metric.direction),
    note: thresholdText(metric),
  }));

  const departmentRows = DEPARTMENT_FILTERS.map((item) =>
    getDepartmentConfig(item.value, { current, salesRows: filteredSalesRows, usersRows: filteredUsersRows })
  );

  const branchRows = BRANCHES.filter((item) => item.value !== 'all').map((item) => {
    const bMkt = emptyMktAgg(item.label);
    const bVd = emptyVdAgg(item.label);
    mktRows
      .filter((r) => r.branch === item.value && rowInDateRange(r, from, to) && matchesOptionalFilter(r.market, market) && matchesOptionalFilter(r.product, product))
      .forEach((r) => addMkt(bMkt, r));
    vanDonRows
      .filter((r) => r.branch === item.value && rowInDateRange(r, from, to) && matchesOptionalFilter(r.market, market) && matchesOptionalFilter(r.product, product))
      .forEach((r) => addVd(bVd, r));
    const summary = finalizeCompany(bMkt, bVd);
    return {
      branch: item.value,
      label: item.label,
      ...summary,
      risk:
        summary.adsRate > 0.35 ||
        summary.closeRate < 0.08 ||
        summary.deliverySuccessRate < 0.9 ||
        summary.cancelReturnRate > 0.08 ||
        summary.collectionRate < 0.8,
    };
  });

  const teamOptions = buildTeamOptions({
    selectedDepartmentValue,
    filteredMktRows: filteredMktRowsHistory,
    filteredSalesRows: filteredSalesRowsHistory,
    filteredUsersRows,
    filteredVanDonRows: filteredVanDonRowsHistory,
  });

  const teamFilteredMktRows = selectedDepartmentValue === 'mkt'
    ? filteredMktRows.filter((r) => matchesOptionalFilter(r.team, selectedTeam))
    : filteredMktRows;
  const teamFilteredMktRowsHistory = selectedDepartmentValue === 'mkt'
    ? filteredMktRowsHistory.filter((r) => matchesOptionalFilter(r.team, selectedTeam))
    : filteredMktRowsHistory;
  const teamFilteredSalesRows = ['sale', 'cskh', 'rnd'].includes(selectedDepartmentValue)
    ? filteredSalesRows.filter((r) => matchesOptionalFilter(r.team, selectedTeam))
    : filteredSalesRows;
  const teamFilteredSalesRowsHistory = ['sale', 'cskh', 'rnd'].includes(selectedDepartmentValue)
    ? filteredSalesRowsHistory.filter((r) => matchesOptionalFilter(r.team, selectedTeam))
    : filteredSalesRowsHistory;
  const teamFilteredUsersRows = selectedDepartmentValue === 'hcns'
    ? filteredUsersRows.filter((r) => matchesOptionalFilter(r.team, selectedTeam))
    : filteredUsersRows;
  const teamFilteredVanDonRows = selectedDepartmentValue === 'delivery'
    ? filteredVanDonRows.filter((r) => matchesOptionalFilter(r.team, selectedTeam))
    : filteredVanDonRows;
  const teamFilteredVanDonRowsHistory = selectedDepartmentValue === 'delivery'
    ? filteredVanDonRowsHistory.filter((r) => matchesOptionalFilter(r.team, selectedTeam))
    : filteredVanDonRowsHistory;

  const selectedDepartmentMkt = emptyMktAgg('Bộ phận MKT');
  const selectedDepartmentVd = emptyVdAgg('Bộ phận vận đơn');
  teamFilteredMktRows.forEach((r) => addMkt(selectedDepartmentMkt, r));
  teamFilteredVanDonRows.forEach((r) => addVd(selectedDepartmentVd, r));
  const selectedDepartmentCurrent = finalizeCompany(selectedDepartmentMkt, selectedDepartmentVd);
  const selectedDepartment = getDepartmentConfig(selectedDepartmentValue, {
    current: selectedDepartmentCurrent,
    salesRows: teamFilteredSalesRows,
    usersRows: teamFilteredUsersRows,
  });

  const personOptions = buildPersonOptions({
    selectedDepartmentValue,
    filteredMktRows: teamFilteredMktRows,
    filteredSalesRows: teamFilteredSalesRows,
    filteredUsersRows: teamFilteredUsersRows,
    filteredVanDonRows: teamFilteredVanDonRows,
  });

  const individualDeltaCtx = {
    selectedDepartmentValue,
    monthBuckets: periodBuckets,
    periodBuckets,
    filteredMktRows: teamFilteredMktRowsHistory,
    filteredSalesRows: teamFilteredSalesRowsHistory,
    filteredUsersRows: teamFilteredUsersRows,
    filteredVanDonRows: teamFilteredVanDonRowsHistory,
  };

  const allIndividualRows = attachIndividualMetricDeltas(buildIndividualRows({
    selectedDepartmentValue,
    filteredMktRows: teamFilteredMktRows,
    filteredSalesRows: teamFilteredSalesRows,
    filteredUsersRows: teamFilteredUsersRows,
    filteredVanDonRows: teamFilteredVanDonRows,
    person: 'all',
  }), individualDeltaCtx);

  const individualRows = attachIndividualMetricDeltas(buildIndividualRows({
    selectedDepartmentValue,
    filteredMktRows: teamFilteredMktRows,
    filteredSalesRows: teamFilteredSalesRows,
    filteredUsersRows: teamFilteredUsersRows,
    filteredVanDonRows: teamFilteredVanDonRows,
    person,
  }), individualDeltaCtx);

  const departmentPeriodRows = buildDepartmentPeriodRows({
    selectedDepartmentValue,
    monthBuckets: periodBuckets,
    filteredMktRows: teamFilteredMktRowsHistory,
    filteredSalesRows: teamFilteredSalesRowsHistory,
    filteredUsersRows: teamFilteredUsersRows,
    filteredVanDonRows: teamFilteredVanDonRowsHistory,
  });

  const individualPeriodRows = buildIndividualPeriodRows({
    selectedDepartmentValue,
    monthBuckets: periodBuckets,
    filteredMktRows: teamFilteredMktRowsHistory,
    filteredSalesRows: teamFilteredSalesRowsHistory,
    filteredUsersRows: teamFilteredUsersRows,
    filteredVanDonRows: teamFilteredVanDonRowsHistory,
    individualRows,
    person,
  });

  const alerts = buildAlerts({ companyKpis, departmentRows, individualRows, current });

  return {
    monthBuckets: periodBuckets,
    filteredCounts: {
      mkt: filteredMktRows.length,
      sales: filteredSalesRows.length,
      users: filteredUsersRows.length,
      delivery: filteredVanDonRows.length,
    },
    monthly,
    current,
    previous,
    marketOptions,
    productOptions,
    teamOptions,
    companyKpis,
    companyPeriodRows: buildCompanyPeriodRows(monthly),
    branchRows,
    departmentRows,
    selectedDepartmentValue,
    selectedDepartment: attachDepartmentMetricDeltas(selectedDepartment, departmentPeriodRows),
    departmentPeriodRows,
    personOptions,
    allIndividualRows,
    individualRows,
    individualPeriodRows,
    productRows: buildProductRows(filteredMktRows),
    deliveryStatusRows: buildDeliveryStatusRows(current.vd),
    alerts,
  };
}

function buildProductRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const product = normalizePick(row.product || '');
    if (!product) continue;
    if (!map.has(product)) {
      map.set(product, {
        product,
        market: row.market || '',
        orders: 0,
        ordersForCloseRate: 0,
        revenue: 0,
        revenueForAdsRate: 0,
        messages: 0,
        adsCost: 0,
      });
    }
    const agg = map.get(product);
    agg.orders += Number(row.orders || 0);
    agg.ordersForCloseRate += Number(row.ordersForCloseRate ?? row.orders ?? 0);
    agg.revenue += Number(row.revenue || 0);
    agg.revenueForAdsRate += Number(row.revenueForAdsRate ?? row.revenue ?? 0);
    agg.messages += Number(row.messages || 0);
    agg.adsCost += Number(row.adsCost || 0);
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      adsRate: ratio(row.adsCost, row.revenueForAdsRate || row.revenue),
      closeRate: ratio(row.ordersForCloseRate || row.orders, row.messages),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
}

function buildDeliveryStatusRows(vd) {
  const rows = [
    { key: 'success', label: 'Giao TC', value: vd.success, color: '#2864d9' },
    { key: 'shipping', label: 'Đang vận chuyển', value: vd.shipping, color: '#44c5b6' },
    { key: 'notDelivered', label: 'Chưa giao', value: vd.notDelivered, color: '#55dbe8' },
    { key: 'checking', label: 'Chờ check', value: vd.checking, color: '#ffd447' },
    { key: 'cancel', label: 'Đã hủy', value: vd.cancel, color: '#ff8a1f' },
    { key: 'returned', label: 'Hoàn hàng', value: vd.returned, color: '#e57373' },
    { key: 'emptyStatus', label: 'Trống trạng thái', value: vd.emptyStatus, color: '#94a3b8' },
  ];
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  return rows
    .filter((row) => Number(row.value || 0) > 0)
    .map((row) => ({ ...row, pct: ratio(row.value, total) }));
}

function buildTeamOptions({ selectedDepartmentValue, filteredMktRows, filteredSalesRows, filteredUsersRows, filteredVanDonRows }) {
  if (selectedDepartmentValue === 'mkt') return buildValueOptions(filteredMktRows, 'team');
  if (selectedDepartmentValue === 'delivery') return buildValueOptions(filteredVanDonRows, 'team');
  if (selectedDepartmentValue === 'hcns') return buildValueOptions(filteredUsersRows.filter((r) => r.teamKind === 'hcns'), 'team');
  return buildValueOptions(filteredSalesRows.filter((r) => r.teamKind === selectedDepartmentValue), 'team');
}

function buildPersonOptions({ selectedDepartmentValue, filteredMktRows, filteredSalesRows, filteredUsersRows, filteredVanDonRows }) {
  const names = new Set();
  if (selectedDepartmentValue === 'delivery') filteredVanDonRows.forEach((r) => names.add(r.name));
  else if (selectedDepartmentValue === 'mkt') filteredMktRows.forEach((r) => names.add(r.name));
  else if (selectedDepartmentValue === 'hcns') filteredUsersRows.filter((r) => r.teamKind === 'hcns').forEach((r) => names.add(r.name));
  else filteredSalesRows.filter((r) => r.teamKind === selectedDepartmentValue).forEach((r) => names.add(r.name));
  return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));
}

function compactTeamLabels(values, fallback) {
  const labels = [...new Set(values.map(optionLabel).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  if (labels.length === 0) return fallback;
  if (labels.length <= 2) return labels.join(', ');
  return `${labels[0]} +${labels.length - 1}`;
}

function buildTeamLabelByName(rows, fallback) {
  const map = new Map();
  rows.forEach((row) => {
    const name = optionLabel(row.name);
    if (!name) return;
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(row.team);
  });
  return new Map([...map.entries()].map(([name, values]) => [name, compactTeamLabels(values, fallback)]));
}

function buildIndividualRows({ selectedDepartmentValue, filteredMktRows, filteredSalesRows, filteredUsersRows, filteredVanDonRows, person }) {
  if (selectedDepartmentValue === 'delivery') {
    return aggregateNamed(filteredVanDonRows, addVd, emptyVdAgg, (r) => r.name)
      .map((a) => ({
        label: a.label,
        team: 'Vận đơn',
        rankValue: a.billAmount,
        primary: formatMoney(a.billAmount),
        secondary: formatPercent(ratio(a.billOrders, a.success)),
        third: formatNumber(a.stale24h),
        risk: a.stale24h > 0 || ratio(a.billOrders, a.success) < 0.8,
        metrics: [
          { label: 'Tiền đã thu', value: formatMoney(a.billAmount), raw: a.billAmount, status: 'good' },
          { label: 'TL Thu tiền', value: formatPercent(ratio(a.billOrders, a.success)), raw: ratio(a.billOrders, a.success), status: ratio(a.billOrders, a.success) < 0.8 ? 'danger' : 'good' },
          { label: 'Hủy + Hoàn', value: formatPercent(ratio(a.cancel + a.returned, a.totalOrders)), raw: ratio(a.cancel + a.returned, a.totalOrders), status: ratio(a.cancel + a.returned, a.totalOrders) > 0.08 ? 'danger' : 'good' },
          { label: 'Quá 24h', value: formatNumber(a.stale24h), raw: a.stale24h, status: a.stale24h > 0 ? 'danger' : 'good' },
        ],
      }))
      .filter((r) => person === 'all' || r.label === person)
      .sort((a, b) => b.rankValue - a.rankValue);
  }
  if (selectedDepartmentValue === 'hcns') {
    return aggregateNamed(filteredUsersRows.filter((r) => r.teamKind === 'hcns'), addUser, emptyUserAgg, (r) => r.name)
      .map((a) => ({
        label: a.label,
        team: 'HCNS',
        rankValue: a.active,
        primary: a.active ? 'Đang hoạt động' : 'Không hoạt động',
        secondary: formatPercent(ratio(a.active, a.total)),
        third: formatNumber(a.newHires),
        risk: a.active === 0,
        metrics: [
          { label: 'Trạng thái', value: a.active ? 'Active' : 'Inactive', status: a.active ? 'good' : 'danger' },
          { label: 'TL giữ người', value: formatPercent(ratio(a.active, a.total)), raw: ratio(a.active, a.total), status: ratio(a.active, a.total) < 0.9 ? 'danger' : 'good' },
          { label: 'Tuyển mới', value: formatNumber(a.newHires), raw: a.newHires, status: 'good' },
          { label: 'Tổng dòng', value: formatNumber(a.total), raw: a.total, status: 'good' },
        ],
      }))
      .filter((r) => person === 'all' || r.label === person)
      .sort((a, b) => b.rankValue - a.rankValue);
  }
  if (selectedDepartmentValue !== 'mkt') {
    const teamByName = buildTeamLabelByName(
      filteredSalesRows.filter((r) => r.teamKind === selectedDepartmentValue),
      departmentLabel(selectedDepartmentValue)
    );
    return aggregateNamed(filteredSalesRows.filter((r) => r.teamKind === selectedDepartmentValue), addSales, emptySalesAgg, (r) => r.name)
      .map((a) => ({
        label: a.label,
        team: teamByName.get(a.label) || departmentLabel(selectedDepartmentValue),
        rankValue: selectedDepartmentValue === 'rnd' ? a.products.size : a.revenue,
        primary: selectedDepartmentValue === 'rnd' ? formatNumber(a.products.size) : formatMoney(a.revenue),
        secondary: selectedDepartmentValue === 'cskh' ? formatPercent(ratio(a.customerOld + a.crossSale, a.orders || a.responses)) : formatPercent(ratio(a.orders, a.messages)),
        third: selectedDepartmentValue === 'rnd' ? formatNumber(a.orders) : formatPercent(ratio(a.cancelOrders, a.orders)),
        risk: selectedDepartmentValue === 'sale' && (ratio(a.orders, a.messages) < 0.08 || ratio(a.cancelOrders, a.orders) > 0.08),
        metrics: [
          { label: selectedDepartmentValue === 'rnd' ? 'SP qua bước' : 'Doanh thu', value: selectedDepartmentValue === 'rnd' ? formatNumber(a.products.size) : formatMoney(a.revenue), raw: selectedDepartmentValue === 'rnd' ? a.products.size : a.revenue, status: 'good' },
          { label: selectedDepartmentValue === 'cskh' ? 'Mua lại' : 'TL chốt', value: selectedDepartmentValue === 'cskh' ? formatPercent(ratio(a.customerOld + a.crossSale, a.orders || a.responses)) : formatPercent(ratio(a.orders, a.messages)), raw: selectedDepartmentValue === 'cskh' ? ratio(a.customerOld + a.crossSale, a.orders || a.responses) : ratio(a.orders, a.messages), status: selectedDepartmentValue === 'sale' && ratio(a.orders, a.messages) < 0.08 ? 'danger' : 'good' },
          { label: 'Số đơn', value: formatNumber(a.orders), raw: a.orders, status: 'good' },
          { label: 'TL hủy', value: formatPercent(ratio(a.cancelOrders, a.orders)), raw: ratio(a.cancelOrders, a.orders), status: ratio(a.cancelOrders, a.orders) > 0.08 ? 'danger' : 'good' },
        ],
      }))
      .filter((r) => person === 'all' || r.label === person)
      .sort((a, b) => b.rankValue - a.rankValue);
  }
  const teamByName = buildTeamLabelByName(filteredMktRows, 'MKT');
  return aggregateNamed(filteredMktRows, addMkt, emptyMktAgg, (r) => r.name)
    .map((a) => ({
      label: a.label,
      team: teamByName.get(a.label) || 'MKT',
      rankValue: a.revenue,
      primary: formatMoney(a.revenue),
      secondary: formatPercent(ratio(a.adsCost, a.revenueForAdsRate || a.revenue)),
      third: formatPercent(ratio(a.ordersForCloseRate || a.orders, a.messages)),
      risk: ratio(a.adsCost, a.revenueForAdsRate || a.revenue) > 0.35 || ratio(a.ordersForCloseRate || a.orders, a.messages) < 0.08,
      metrics: [
        { label: 'Doanh thu', value: formatMoney(a.revenue), raw: a.revenue, status: 'good' },
        { label: 'TL Ads/DT', value: formatPercent(ratio(a.adsCost, a.revenueForAdsRate || a.revenue)), raw: ratio(a.adsCost, a.revenueForAdsRate || a.revenue), status: ratio(a.adsCost, a.revenueForAdsRate || a.revenue) > 0.35 ? 'danger' : 'good' },
        { label: 'Tin nhắn', value: formatNumber(a.messages), raw: a.messages, status: 'good' },
        { label: 'TL chốt', value: formatPercent(ratio(a.ordersForCloseRate || a.orders, a.messages)), raw: ratio(a.ordersForCloseRate || a.orders, a.messages), status: ratio(a.ordersForCloseRate || a.orders, a.messages) < 0.08 ? 'danger' : 'good' },
      ],
    }))
    .filter((r) => person === 'all' || r.label === person)
    .sort((a, b) => b.rankValue - a.rankValue);
}

function buildDepartmentPeriodRows({ selectedDepartmentValue, monthBuckets, filteredMktRows, filteredSalesRows, filteredUsersRows, filteredVanDonRows }) {
  return monthBuckets.map((bucket) => {
    const mkt = emptyMktAgg(bucket.label);
    const vd = emptyVdAgg(bucket.label);
    filteredMktRows.filter((r) => rowInBucket(r, bucket)).forEach((r) => addMkt(mkt, r));
    filteredVanDonRows.filter((r) => rowInBucket(r, bucket)).forEach((r) => addVd(vd, r));
    const cfg = getDepartmentConfig(selectedDepartmentValue, {
      current: finalizeCompany(mkt, vd),
      salesRows: filteredSalesRows.filter((r) => rowInBucket(r, bucket)),
      usersRows: filteredUsersRows.filter((r) => rowInBucket(r, bucket)),
    });
    return {
      label: bucket.label,
      rangeLabel: bucket.rangeLabel,
      key: bucket.key,
      metrics: cfg.metrics,
      trendValue: cfg.trendValue,
      trendDisplay: cfg.trendFormat(cfg.trendValue),
    };
  });
}

function attachDepartmentMetricDeltas(departmentConfig, periodRows) {
  return {
    ...departmentConfig,
    metrics: (departmentConfig.metrics || []).map((metric) => {
      if (metric.raw == null) return metric;
      return { ...metric, delta: calcDelta(metric.raw, averagePreviousMetricRaw(periodRows, metric.label)) };
    }),
  };
}

function snapshotIndividual(name, bucket, ctx) {
  const { selectedDepartmentValue, filteredMktRows, filteredSalesRows, filteredUsersRows, filteredVanDonRows } = ctx;
  const nameFilter = (r) => r.name === name;
  if (selectedDepartmentValue === 'delivery') {
    const agg = emptyVdAgg(bucket.label);
    filteredVanDonRows.filter((r) => rowInBucket(r, bucket) && nameFilter(r)).forEach((r) => addVd(agg, r));
    const value = ratio(agg.billOrders, agg.success);
    return { value, display: formatPercent(value), risk: value < 0.8 || agg.stale24h > 0, note: agg.stale24h > 0 ? `Quá 24h: ${formatNumber(agg.stale24h)}` : '' };
  }
  if (selectedDepartmentValue === 'hcns') {
    const agg = emptyUserAgg(bucket.label);
    filteredUsersRows.filter((r) => rowInBucket(r, bucket) && r.teamKind === 'hcns' && nameFilter(r)).forEach((r) => addUser(agg, r));
    const value = ratio(agg.active, agg.total);
    return { value, display: formatPercent(value), risk: value < 0.9, note: '' };
  }
  if (selectedDepartmentValue !== 'mkt') {
    const agg = emptySalesAgg(bucket.label);
    filteredSalesRows.filter((r) => rowInBucket(r, bucket) && r.teamKind === selectedDepartmentValue && nameFilter(r)).forEach((r) => addSales(agg, r));
    if (selectedDepartmentValue === 'sale') {
      const value = ratio(agg.orders, agg.messages);
      return { value, display: formatPercent(value), risk: value < 0.08, note: `Hủy: ${formatPercent(ratio(agg.cancelOrders, agg.orders))}` };
    }
    if (selectedDepartmentValue === 'cskh') {
      const value = ratio(agg.customerOld + agg.crossSale, agg.orders || agg.responses);
      return { value, display: formatPercent(value), risk: false, note: '' };
    }
    const value = agg.products.size;
    return { value, display: formatNumber(value), risk: false, note: `Đơn: ${formatNumber(agg.orders)}` };
  }
  const agg = emptyMktAgg(bucket.label);
  filteredMktRows.filter((r) => rowInBucket(r, bucket) && nameFilter(r)).forEach((r) => addMkt(agg, r));
  const value = ratio(agg.adsCost, agg.revenueForAdsRate || agg.revenue);
  return { value, display: formatPercent(value), risk: value > 0.35, note: `Chốt: ${formatPercent(ratio(agg.ordersForCloseRate || agg.orders, agg.messages))}` };
}

function snapshotIndividualMetricRawMap(name, bucket, ctx) {
  const { selectedDepartmentValue, filteredMktRows, filteredSalesRows, filteredUsersRows, filteredVanDonRows } = ctx;
  const nameFilter = (r) => r.name === name;
  if (selectedDepartmentValue === 'delivery') {
    const agg = emptyVdAgg(bucket.label);
    filteredVanDonRows.filter((r) => rowInBucket(r, bucket) && nameFilter(r)).forEach((r) => addVd(agg, r));
    return new Map([
      ['Tiền đã thu', agg.billAmount],
      ['TL Thu tiền', ratio(agg.billOrders, agg.success)],
      ['Hủy + Hoàn', ratio(agg.cancel + agg.returned, agg.totalOrders)],
      ['Quá 24h', agg.stale24h],
    ]);
  }
  if (selectedDepartmentValue === 'mkt') {
    const agg = emptyMktAgg(bucket.label);
    filteredMktRows.filter((r) => rowInBucket(r, bucket) && nameFilter(r)).forEach((r) => addMkt(agg, r));
    return new Map([
      ['Doanh thu', agg.revenue],
      ['TL Ads/DT', ratio(agg.adsCost, agg.revenueForAdsRate || agg.revenue)],
      ['Tin nhắn', agg.messages],
      ['TL chốt', ratio(agg.ordersForCloseRate || agg.orders, agg.messages)],
    ]);
  }
  if (selectedDepartmentValue === 'hcns') {
    const agg = emptyUserAgg(bucket.label);
    filteredUsersRows.filter((r) => rowInBucket(r, bucket) && r.teamKind === 'hcns' && nameFilter(r)).forEach((r) => addUser(agg, r));
    return new Map([
      ['TL giữ người', ratio(agg.active, agg.total)],
      ['Tuyển mới', agg.newHires],
      ['Tổng dòng', agg.total],
    ]);
  }
  const agg = emptySalesAgg(bucket.label);
  filteredSalesRows.filter((r) => rowInBucket(r, bucket) && r.teamKind === selectedDepartmentValue && nameFilter(r)).forEach((r) => addSales(agg, r));
  if (selectedDepartmentValue === 'cskh') {
    return new Map([
      ['Doanh thu', agg.revenue],
      ['Mua lại', ratio(agg.customerOld + agg.crossSale, agg.orders || agg.responses)],
      ['Số đơn', agg.orders],
      ['TL hủy', ratio(agg.cancelOrders, agg.orders)],
    ]);
  }
  if (selectedDepartmentValue === 'rnd') {
    return new Map([
      ['SP qua bước', agg.products.size],
      ['TL chốt', ratio(agg.orders, agg.messages)],
      ['Số đơn', agg.orders],
      ['TL hủy', ratio(agg.cancelOrders, agg.orders)],
    ]);
  }
  return new Map([
    ['Doanh thu', agg.revenue],
    ['TL chốt', ratio(agg.orders, agg.messages)],
    ['Số đơn', agg.orders],
    ['TL hủy', ratio(agg.cancelOrders, agg.orders)],
  ]);
}

function attachIndividualMetricDeltas(rows, ctx) {
  const previousBuckets = (ctx.monthBuckets || []).slice(0, -1);
  if (previousBuckets.length === 0) return rows;
  return rows.map((row) => {
    const previousByLabel = new Map();
    previousBuckets.forEach((bucket) => {
      const snapshot = snapshotIndividualMetricRawMap(row.label, bucket, ctx);
      snapshot.forEach((value, label) => {
        if (!previousByLabel.has(label)) previousByLabel.set(label, []);
        previousByLabel.get(label).push(value);
      });
    });
    return {
      ...row,
      metrics: (row.metrics || []).map((metric) => {
        if (metric.raw == null || !previousByLabel.has(metric.label)) return metric;
        return { ...metric, delta: calcDelta(metric.raw, averageNumbers(previousByLabel.get(metric.label))) };
      }),
    };
  });
}

function buildIndividualPeriodRows(ctx) {
  const names = ctx.person === 'all' ? ctx.individualRows.map((row) => row.label) : [ctx.person].filter(Boolean);
  return names.map((name) => {
    const values = ctx.monthBuckets.map((bucket, index) => {
      const currentValue = snapshotIndividual(name, bucket, ctx);
      const previousValue = index === 0 ? null : snapshotIndividual(name, ctx.monthBuckets[index - 1], ctx);
      return {
        ...currentValue,
        label: bucket.label,
        rangeLabel: bucket.rangeLabel,
        delta: previousValue ? calcDelta(currentValue.value, previousValue.value) : 0,
      };
    });
    return { label: name, values };
  });
}

const TEMP_DISABLED_COMPANY_ALERT_KEYS = new Set(['deliverySuccessRate', 'collectionRate']);
const TEMP_DISABLED_DEPARTMENT_ALERTS = new Set(['delivery:ty le thu tien']);
const UNTRACKED_ZERO_ALERT_DEPARTMENTS = new Set(['hcns', 'rnd']);

function departmentAlertKey(dept, metric) {
  return `${dept?.value || ''}:${normalizeText(metric?.label)}`;
}

function isUntrackedZeroDepartmentMetric(dept, metric) {
  if (!UNTRACKED_ZERO_ALERT_DEPARTMENTS.has(dept?.value)) return false;
  const raw = Number(metric?.raw ?? 0);
  return Number.isFinite(raw) && raw === 0;
}

function deliveryStaleCount(row) {
  return Number(String(row?.third || '').replace(/\D/g, ''));
}

function buildAlerts({ companyKpis, departmentRows, individualRows }) {
  const companyAlerts = companyKpis
    .filter((kpi) => kpi.status === 'danger' && !TEMP_DISABLED_COMPANY_ALERT_KEYS.has(kpi.key))
    .map((kpi) => ({
      type: 'company',
      level: kpi.direction === 'min' ? 'bad' : 'warn',
      title: `${kpi.label} - Công ty`,
      body: `${kpi.label} hiện đạt ${kpi.display}, ${kpi.note.toLowerCase()}.`,
      target: 'Ban Giám đốc + Team Leader',
      channel: 'Zalo hằng ngày 08:00',
    }));

  const departmentAlerts = departmentRows
    .flatMap((dept) =>
      dept.metrics
        .filter(
          (metric) =>
            metric.danger &&
            !TEMP_DISABLED_DEPARTMENT_ALERTS.has(departmentAlertKey(dept, metric)) &&
            !isUntrackedZeroDepartmentMetric(dept, metric)
        )
        .map((metric) => ({
          type: 'department',
          level: metric.direction === 'min' ? 'bad' : 'warn',
          title: `${metric.label} - ${dept.label}`,
          body: `${metric.label} của ${dept.label} hiện đạt ${metric.value}.`,
          target: `${dept.label} Leader`,
          channel: 'Zalo hằng ngày 08:00',
        }))
    );

  const individualAlerts = individualRows
    .filter((row) => row.risk && (row.team !== 'Vận đơn' || deliveryStaleCount(row) > 0))
    .slice(0, 8)
    .map((row) => ({
      type: 'individual',
      level: row.team === 'Vận đơn' && deliveryStaleCount(row) > 0 ? 'bad' : 'warn',
      title: `${row.label} - ${row.team}`,
      body: row.team === 'Vận đơn' ? `Có ${row.third} đơn chưa xử lý quá 24h.` : `KPI chính hiện tại: ${row.secondary}.`,
      target: `${row.label} + ${row.team}`,
      channel: row.team === 'Vận đơn' ? 'Zalo hằng ngày 08:00' : 'Zalo T2/T5 08:00',
    }));

  return [...companyAlerts, ...departmentAlerts, ...individualAlerts];
}
