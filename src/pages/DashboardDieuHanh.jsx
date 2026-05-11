import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Banknote,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Megaphone,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import usePermissions from '../hooks/usePermissions';
import { useUserDepartment } from '../hooks/useUserDepartment';
import { supabase } from '../supabase/config';
import { dedupeMktDetailReportRows } from '../services/mktRecalcSoDonThucTeFromOrders';
import {
  isGiaoHangHistogramSyntheticKey,
  parseBaoCaoVanDonHistogram,
  sumBaoCaoVanDonHistogramValues,
  sumDonCoBillFullAmount,
  sumDonCoBillFullCount,
} from '../utils/baoCaoVanDonFormat';
import { isExecutiveDashboardAudience } from '../utils/executiveAccess';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

const PAGE_SIZE = 1000;
const MAX_PAGES = 60;
const MKT_DATE_COL = '"Ngày"';
const DEPARTMENTS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'mkt', label: 'MKT' },
  { value: 'sale', label: 'Sale' },
  { value: 'cskh', label: 'CSKH' },
  { value: 'delivery', label: 'Vận đơn' },
  { value: 'hcns', label: 'HCNS' },
  { value: 'rnd', label: 'R&D' },
];
const DEPARTMENT_FILTERS = DEPARTMENTS.filter((item) => item.value !== 'all');
const BRANCHES = [
  { value: 'all', label: 'Tổng' },
  { value: 'hn', label: 'Hà Nội' },
  { value: 'hcm', label: 'Hồ Chí Minh' },
];
const COMPANY_THRESHOLD_DATASETS = [
  { label: 'Ngưỡng Ads 35%', value: 35, color: '#f97316' },
  { label: 'Ngưỡng chốt 8%', value: 8, color: '#9333ea' },
  { label: 'Ngưỡng giao TC 90%', value: 90, color: '#16a34a' },
  { label: 'Ngưỡng Hủy + Hoàn 8%', value: 8, color: '#ef4444' },
  { label: 'Ngưỡng thu tiền 80%', value: 80, color: '#2563eb' },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatLocalYmd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function defaultDateRange() {
  const end = new Date();
  const start = startOfMonth(addMonths(end, -3));
  return { from: formatLocalYmd(start), to: formatLocalYmd(end) };
}

function normalizeYmd(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (slash) return `${slash[3]}-${pad2(slash[2])}-${pad2(slash[1])}`;
  return raw.slice(0, 10);
}

function monthKeyFromYmd(ymd) {
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

function ageHoursFromNow(value) {
  const d = parseDateLike(value);
  if (!d) return 0;
  return (Date.now() - d.getTime()) / 36e5;
}

function buildLastFourMonthBuckets(toYmd) {
  const endRaw = normalizeYmd(toYmd) || formatLocalYmd(new Date());
  const end = new Date(Number(endRaw.slice(0, 4)), Number(endRaw.slice(5, 7)) - 1, 1);
  return [3, 2, 1, 0].map((offset) => {
    const d = addMonths(end, -offset);
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    return {
      key,
      label: `${pad2(d.getMonth() + 1)}/${d.getFullYear()}`,
      start: `${key}-01`,
    };
  });
}

function parseNumberLoose(value) {
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

function getFirst(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

function normalizePick(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function branchKeyFromText(value, fallback = 'hn') {
  const n = normalizeText(value);
  if (n.includes('hcm') || n.includes('ho chi minh') || n.includes('sai gon')) return 'hcm';
  if (n.includes('ha noi') || n.includes('hn')) return 'hn';
  return fallback;
}

function branchLabelFromKey(value) {
  if (value === 'hcm') return 'Hồ Chí Minh';
  if (value === 'hn') return 'Hà Nội';
  return 'Tổng hợp';
}

function classifyBusinessTeam(value) {
  const n = normalizeText(value);
  if (n.includes('cskh') || n.includes('cham soc')) return 'cskh';
  if (n.includes('van don') || n.includes('delivery') || n.includes('ffm') || n.includes('van hanh')) return 'delivery';
  if (n.includes('hcns') || n.includes('nhan su') || n.includes('hanh chinh') || n.includes('hr')) return 'hcns';
  if (n.includes('r&d') || n === 'rd' || n.includes('rnd') || n.includes('sp test')) return 'rnd';
  if (n.includes('mkt') || n.includes('marketing')) return 'mkt';
  if (n.includes('sale')) return 'sale';
  return 'sale';
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function formatMoney(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} triệu`;
  return `${formatNumber(n)} đ`;
}

function formatPercent(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0.0%';
  return `${(n * 100).toFixed(1)}%`;
}

function parseDisplayPercent(value) {
  const raw = String(value ?? '').replace(',', '.');
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function ratio(n, d) {
  const dd = Number(d || 0);
  if (!dd) return 0;
  return Number(n || 0) / dd;
}

function calcDelta(current, previous) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (!prev) return cur ? 1 : 0;
  return (cur - prev) / Math.abs(prev);
}

function statusKind(value, threshold, direction) {
  const n = Number(value || 0);
  if (direction === 'max') return n > threshold ? 'danger' : 'good';
  return n < threshold ? 'danger' : 'good';
}

function lineDataset(label, data, borderColor, backgroundColor) {
  return {
    label,
    data,
    borderColor,
    backgroundColor,
    fill: true,
    tension: 0.35,
  };
}

function thresholdDataset(label, dataLength, value, color) {
  return {
    label,
    data: Array.from({ length: dataLength }, () => value),
    borderColor: color,
    borderDash: [6, 5],
    pointRadius: 0,
    fill: false,
    tension: 0,
  };
}

function metricPercent(periodRow, label) {
  const metric = periodRow?.metrics?.find((item) => normalizeText(item.label) === normalizeText(label));
  return parseDisplayPercent(metric?.value);
}

function departmentTrendDatasets(periodRows, departmentValue) {
  const count = periodRows.length;
  const dataByMetric = (label) => periodRows.map((row) => Number(metricPercent(row, label).toFixed(2)));

  if (departmentValue === 'mkt') {
    return [
      lineDataset('Tỷ lệ Ads', dataByMetric('Tỷ lệ Ads'), '#dc2626', 'rgba(220, 38, 38, 0.10)'),
      lineDataset('Tỷ lệ Hủy', dataByMetric('Tỷ lệ Hủy'), '#f97316', 'rgba(249, 115, 22, 0.10)'),
      thresholdDataset('Ngưỡng Ads 35%', count, 35, '#dc2626'),
      thresholdDataset('Ngưỡng Hủy 8%', count, 8, '#f97316'),
    ];
  }

  if (departmentValue === 'sale') {
    return [
      lineDataset('Tỉ lệ chốt đơn', dataByMetric('Tỉ lệ chốt đơn'), '#0f766e', 'rgba(15, 118, 110, 0.10)'),
      lineDataset('Tỷ lệ Hủy', dataByMetric('Tỷ lệ Hủy'), '#f97316', 'rgba(249, 115, 22, 0.10)'),
      thresholdDataset('Ngưỡng chốt 8%', count, 8, '#0f766e'),
      thresholdDataset('Ngưỡng Hủy 8%', count, 8, '#f97316'),
    ];
  }

  if (departmentValue === 'delivery') {
    return [
      lineDataset('Tỷ lệ thu tiền', dataByMetric('Tỷ lệ thu tiền'), '#2563eb', 'rgba(37, 99, 235, 0.10)'),
      lineDataset('Hủy + Hoàn', dataByMetric('Hủy + Hoàn'), '#ef4444', 'rgba(239, 68, 68, 0.10)'),
      thresholdDataset('Ngưỡng thu tiền 80%', count, 80, '#2563eb'),
      thresholdDataset('Ngưỡng Hủy + Hoàn 8%', count, 8, '#ef4444'),
    ];
  }

  if (departmentValue === 'hcns') {
    return [
      lineDataset('Tỷ lệ giữ người', dataByMetric('Tỷ lệ giữ người'), '#0f766e', 'rgba(15, 118, 110, 0.10)'),
      thresholdDataset('Ngưỡng giữ người 90%', count, 90, '#0f766e'),
    ];
  }

  if (departmentValue === 'rnd') {
    return [
      lineDataset(
        'Sản phẩm kiểm duyệt',
        periodRows.map((row) => Number(row.trendValue || 0)),
        '#0f766e',
        'rgba(15, 118, 110, 0.10)'
      ),
    ];
  }

  return [
    lineDataset(
      'Tỷ lệ mua lại',
      periodRows.map((row) => Number(((row.trendValue || 0) * 100).toFixed(2))),
      '#0f766e',
      'rgba(15, 118, 110, 0.10)'
    ),
  ];
}

function tableMissing(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache');
}

async function fetchPagedQuery(buildQuery) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadMktTable(tableName, from, to) {
  try {
    return await fetchPagedQuery(() =>
      supabase
        .from(tableName)
        .select('*')
        .gte(MKT_DATE_COL, from)
        .lte(MKT_DATE_COL, to)
        .order(MKT_DATE_COL, { ascending: true })
    );
  } catch (error) {
    if (tableMissing(error)) return { __missing: true, rows: [] };
    throw error;
  }
}

async function loadVanDonTable(from, to) {
  try {
    return await fetchPagedQuery(() =>
      supabase
        .from('bao_cao_van_don')
        .select(
          'id,ngay,nhan_vien,san_pham,thi_truong,trang_thai_giao_hang,ket_qua_check,trang_thai_thanh_toan,tien_trang_thai_thanh_toan'
        )
        .gte('ngay', from)
        .lte('ngay', to)
        .order('ngay', { ascending: true })
    );
  } catch (error) {
    if (tableMissing(error)) return { __missing: true, rows: [] };
    throw error;
  }
}

async function loadSalesReportsTable(from, to) {
  try {
    return await fetchPagedQuery(() =>
      supabase
        .from('sales_reports')
        .select('*')
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true })
    );
  } catch (error) {
    if (tableMissing(error)) return { __missing: true, rows: [] };
    throw error;
  }
}

async function loadUsersTable() {
  try {
    return await fetchPagedQuery(() =>
      supabase
        .from('users')
        .select('*')
        .order('name', { ascending: true })
    );
  } catch (error) {
    if (tableMissing(error)) return { __missing: true, rows: [] };
    throw error;
  }
}

async function loadOrdersTable(tableName, from, to) {
  try {
    return await fetchPagedQuery(() => {
      let q = supabase
        .from(tableName)
        .select(
          'id,order_code,order_date,created_at,country,delivery_staff,delivery_status_nb,delivery_status,check_result,payment_status,payment_status_detail,total_amount_vnd,tong_tien_vnd,van_don_line_total_vnd,sale_price,goods_amount,tracking_code,shipping_unit,reconciled_vnd,reconciled_amount,payment_bill,payment_image,ngayupbill,team'
        )
        .gte('order_date', from)
        .lte('order_date', to);

      if (String(tableName || '').trim() === 'orders') {
        q = q.or('team.is.null,team.neq.HCM');
      }

      return q.order('order_date', { ascending: true });
    });
  } catch (error) {
    if (tableMissing(error)) return { __missing: true, rows: [] };
    throw error;
  }
}

function mapMktRow(row, source) {
  const date = normalizeYmd(getFirst(row, ['Ngày']));
  if (!date) return null;
  const soDonInput = parseNumberLoose(getFirst(row, ['Số đơn', 'Số_đơn', 'So don']));
  const soDonActual = parseNumberLoose(getFirst(row, ['Số đơn thực tế', 'Số đơn TT', 'so_don_thuc_te']));
  const revenueInput = parseNumberLoose(getFirst(row, ['Doanh số', 'Doanh_số', 'Doanh so']));
  const revenueActual = parseNumberLoose(
    getFirst(row, [
      'Doanh thu chốt thực tế',
      'Doanh số TT',
      'Doanh số thực tế',
      'DS chốt',
      'Doanh số sau ship',
      'doanh_so_tt',
    ])
  );
  const cancelOrders = parseNumberLoose(getFirst(row, ['Số đơn hoàn hủy', 'Số đơn hoàn hủy thực tế', 'So don huy']));
  return {
    source,
    branch: source === 'hcm' ? 'hcm' : 'hn',
    branchLabel: source === 'hcm' ? 'Hồ Chí Minh' : 'Hà Nội',
    date,
    monthKey: monthKeyFromYmd(date),
    name: normalizePick(getFirst(row, ['Tên', 'name']) || 'Không xác định'),
    team: normalizePick(getFirst(row, ['Team', 'team']) || (source === 'hcm' ? 'MKT HCM' : 'MKT')),
    product: normalizePick(getFirst(row, ['Sản_phẩm', 'Sản phẩm', 'product']) || ''),
    market: normalizePick(getFirst(row, ['Thị_trường', 'Thị trường', 'market']) || ''),
    messages: parseNumberLoose(getFirst(row, ['Số_Mess_Cmt', 'Số Mess', 'so_mess_cmt'])),
    adsCost: parseNumberLoose(getFirst(row, ['CPQC theo TKQC', 'CPQC', 'cpqc'])),
    orders: soDonActual || soDonInput,
    revenue: revenueActual || revenueInput,
    cancelOrders,
  };
}

function mapSalesReportRow(row) {
  const date = normalizeYmd(row?.date);
  if (!date) return null;
  const branch = branchKeyFromText(row?.branch || row?.team, 'hn');
  const teamKind = classifyBusinessTeam(row?.team || row?.department || row?.position);
  return {
    branch,
    branchLabel: branchLabelFromKey(branch),
    date,
    monthKey: monthKeyFromYmd(date),
    name: normalizePick(row?.name || row?.username || 'Không xác định'),
    team: normalizePick(row?.team || ''),
    teamKind,
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

function mapUserRow(row) {
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
    row?.total_amount_vnd,
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
  const candidates = [row?.reconciled_vnd, row?.reconciled_amount, row?.total_amount_vnd, row?.tong_tien_vnd];
  for (const v of candidates) {
    if (v == null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return 0;
}

function paymentLabelForOrder(row) {
  const detail = String(row?.payment_status_detail ?? '').trim();
  if (detail) return detail;
  return String(row?.payment_status ?? '').trim();
}

function isFullBill(label) {
  const n = normalizeText(label);
  if (!n) return false;
  if (n.includes('1 phan') && n.includes('bill')) return false;
  return n.includes('co bill');
}

function orderHasBillEvidence(row) {
  return Boolean(
    String(row?.ngayupbill ?? '').trim() ||
      String(row?.payment_bill ?? '').trim() ||
      String(row?.payment_image ?? '').trim()
  );
}

function mapOrderToVanDonRow(row, branch) {
  const date = normalizeYmd(row?.order_date) || normalizeYmd(row?.created_at);
  if (!date) return null;
  const deliveryLabel = String(row?.delivery_status_nb ?? row?.delivery_status ?? '').trim();
  const bucket = classifyDeliveryKey(deliveryLabel);
  const paymentLabel = paymentLabelForOrder(row);
  const hasBill = orderHasBillEvidence(row) || isFullBill(paymentLabel);
  const name = normalizePick(row?.delivery_staff || 'Chưa phân công');
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
    name,
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

function mapVanDonRow(row) {
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

function emptyMktAgg(label = '') {
  return { label, messages: 0, adsCost: 0, orders: 0, revenue: 0, cancelOrders: 0 };
}

function emptyVdAgg(label = '') {
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

function emptySalesAgg(label = '') {
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

function emptyUserAgg(label = '') {
  return { label, total: 0, active: 0, inactive: 0, newHires: 0 };
}

function addMkt(agg, row) {
  agg.messages += row.messages;
  agg.adsCost += row.adsCost;
  agg.orders += row.orders;
  agg.revenue += row.revenue;
  agg.cancelOrders += row.cancelOrders;
}

function addVd(agg, row) {
  for (const key of Object.keys(emptyVdAgg())) {
    if (key !== 'label') agg[key] += Number(row[key] || 0);
  }
}

function addSales(agg, row) {
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

function addUser(agg, row) {
  agg.total += 1;
  if (row.active) agg.active += 1;
  else agg.inactive += 1;
  if (row.date) agg.newHires += 1;
}

function finalizeCompany(mkt, vd) {
  return {
    orders: mkt.orders,
    revenue: mkt.revenue,
    adsRate: ratio(mkt.adsCost, mkt.revenue),
    closeRate: ratio(mkt.orders, mkt.messages),
    deliverySuccessRate: ratio(vd.success, vd.totalOrders),
    cancelReturnRate: ratio(vd.cancel + vd.returned, vd.totalOrders),
    collectionRate: ratio(vd.billOrders, vd.success),
    collectedAmount: vd.billAmount,
    mkt,
    vd,
  };
}

function summarizeByMonth(mktRows, vdRows, buckets) {
  return buckets.map((bucket) => {
    const mkt = emptyMktAgg(bucket.label);
    const vd = emptyVdAgg(bucket.label);
    mktRows.filter((r) => r.monthKey === bucket.key).forEach((r) => addMkt(mkt, r));
    vdRows.filter((r) => r.monthKey === bucket.key).forEach((r) => addVd(vd, r));
    return { ...finalizeCompany(mkt, vd), label: bucket.label, key: bucket.key };
  });
}

function aggregateNamed(rows, addFn, emptyFn, keyFn) {
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

function departmentLabel(value) {
  return DEPARTMENTS.find((item) => item.value === value)?.label || 'Tất cả';
}

function getDepartmentConfig(value, ctx) {
  const { current, salesRows, usersRows } = ctx;
  const sale = aggregateSalesRows(salesRows.filter((r) => r.teamKind === 'sale'), 'Sale');
  const cskh = aggregateSalesRows(salesRows.filter((r) => r.teamKind === 'cskh'), 'CSKH');
  const rnd = aggregateSalesRows(salesRows.filter((r) => r.teamKind === 'rnd'), 'R&D');
  const hcns = aggregateUserRows(usersRows.filter((r) => r.teamKind === 'hcns'), 'HCNS');
  const mkt = current.mkt;
  const vd = current.vd;

  if (value === 'mkt') {
    return {
      value,
      label: 'MKT',
      revenue: mkt.revenue,
      trendLabel: 'Ads / doanh thu',
      trendValue: ratio(mkt.adsCost, mkt.revenue),
      trendFormat: formatPercent,
      risk: ratio(mkt.adsCost, mkt.revenue) > 0.35 || ratio(mkt.cancelOrders, mkt.orders) > 0.08,
      metrics: [
        { label: 'Doanh thu', value: formatMoney(mkt.revenue) },
        { label: 'Tỷ lệ Ads', value: formatPercent(ratio(mkt.adsCost, mkt.revenue)), danger: ratio(mkt.adsCost, mkt.revenue) > 0.35 },
        { label: 'Số Mes', value: formatNumber(mkt.messages) },
        { label: 'Tỷ lệ Hủy', value: formatPercent(ratio(mkt.cancelOrders, mkt.orders)), danger: ratio(mkt.cancelOrders, mkt.orders) > 0.08 },
      ],
    };
  }

  if (value === 'sale') {
    const source = sale.orders || sale.revenue || sale.messages ? sale : { ...sale, revenue: mkt.revenue, orders: mkt.orders, messages: mkt.messages, cancelOrders: mkt.cancelOrders };
    return {
      value,
      label: 'Sale',
      revenue: source.revenue,
      trendLabel: 'Tỉ lệ chốt đơn',
      trendValue: ratio(source.orders, source.messages),
      trendFormat: formatPercent,
      risk: ratio(source.orders, source.messages) < 0.08 || ratio(source.cancelOrders, source.orders) > 0.08,
      metrics: [
        { label: 'Doanh thu', value: formatMoney(source.revenue) },
        { label: 'Tỉ lệ chốt đơn', value: formatPercent(ratio(source.orders, source.messages)), danger: ratio(source.orders, source.messages) < 0.08 },
        { label: 'Tỷ lệ Hủy', value: formatPercent(ratio(source.cancelOrders, source.orders)), danger: ratio(source.cancelOrders, source.orders) > 0.08 },
        { label: 'Số đơn', value: formatNumber(source.orders) },
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
        { label: 'Doanh thu', value: formatMoney(cskh.revenue) },
        { label: 'Tỷ lệ CSKH', value: formatPercent(ratio(cared, cskh.messages || cskh.orders)) },
        { label: 'Mua lại', value: formatPercent(ratio(repurchase, cskh.orders || cared)) },
        { label: 'Khách cũ/Cross', value: formatNumber(repurchase) },
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
        { label: 'Doanh thu/tiền thu', value: formatMoney(vd.billAmount) },
        { label: 'Tỷ lệ thu tiền', value: formatPercent(ratio(vd.billOrders, vd.success)), danger: ratio(vd.billOrders, vd.success) < 0.8 },
        { label: 'Hủy + Hoàn', value: formatPercent(ratio(vd.cancel + vd.returned, vd.totalOrders)), danger: ratio(vd.cancel + vd.returned, vd.totalOrders) > 0.08 },
        { label: 'Quá 24h', value: formatNumber(vd.stale24h), danger: vd.stale24h > 0 },
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
        { label: 'Tỷ lệ tuyển dụng', value: formatPercent(ratio(hcns.newHires, hcns.total)) },
        { label: 'Tỷ lệ giữ người', value: formatPercent(ratio(hcns.active, hcns.total)), danger: ratio(hcns.active, hcns.total) < 0.9 },
        { label: 'Nhân sự active', value: formatNumber(hcns.active) },
        { label: 'Tổng nhân sự', value: formatNumber(hcns.total) },
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
      { label: 'Doanh thu SP Test', value: formatMoney(rnd.revenue) },
      { label: 'Sản phẩm qua bước', value: formatNumber(rnd.products.size) },
      { label: 'Số Mes', value: formatNumber(rnd.messages) },
      { label: 'Số đơn', value: formatNumber(rnd.orders) },
    ],
  };
}

function buildCompanyPeriodRows(monthly) {
  const rows = [
    ['Doanh số thực tế', (m) => m.orders, formatNumber],
    ['Doanh thu thực', (m) => m.revenue, formatMoney],
    ['% Ads / Doanh thu', (m) => m.adsRate, formatPercent],
    ['Tỉ lệ chốt đơn', (m) => m.closeRate, formatPercent],
    ['Tỉ lệ giao thành công', (m) => m.deliverySuccessRate, formatPercent],
    ['Tỉ lệ Hủy + Hoàn', (m) => m.cancelReturnRate, formatPercent],
    ['Tỉ lệ thu tiền', (m) => m.collectionRate, formatPercent],
    ['Tiền đã thu', (m) => m.collectedAmount, formatMoney],
  ];
  return rows.map(([label, getter, formatter]) => ({
    label,
    values: monthly.map((m, index) => ({
      label: m.label,
      value: getter(m),
      display: formatter(getter(m)),
      delta: index === 0 ? 0 : calcDelta(getter(m), getter(monthly[index - 1])),
    })),
  }));
}

function KpiCard({ item }) {
  const Icon = item.icon;
  const dangerous = item.kind === 'danger';
  const deltaUp = Number(item.delta || 0) >= 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-md p-2 ${dangerous ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div
          className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
            dangerous ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {deltaUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {formatPercent(Math.abs(item.delta || 0))}
        </div>
      </div>
      <div className="mt-4 text-sm font-medium text-slate-500">{item.label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-950">{item.value}</div>
      <div className="mt-2 min-h-[1.25rem] text-xs text-slate-500">{item.note}</div>
    </div>
  );
}

function MiniStat({ label, value, danger }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${danger ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-sm font-bold ${danger ? 'text-red-700' : 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

function useDashboardAllowed() {
  const { canView, loading: permLoading, role: dbRoleCode } = usePermissions();
  const { department, loading: deptLoading } = useUserDepartment();
  return useMemo(() => {
    const userRole = (localStorage.getItem('userRole') || '').toLowerCase();
    const isAdminOrLeadership = ['admin', 'leader', 'director', 'boss', 'manager', 'administrator', 'super_admin'].includes(userRole);
    const allowed =
      isAdminOrLeadership ||
      canView('DASHBOARD_QUAN_TRI') ||
      (canView('SALE_VIEW') && canView('MKT_VIEW')) ||
      isExecutiveDashboardAudience(department, dbRoleCode);
    return { allowed, loading: permLoading || deptLoading };
  }, [canView, department, dbRoleCode, permLoading, deptLoading]);
}

export default function DashboardDieuHanh() {
  const { allowed, loading: allowedLoading } = useDashboardAllowed();
  const initialRange = useMemo(() => defaultDateRange(), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [activeTab, setActiveTab] = useState('company');
  const [branch, setBranch] = useState('all');
  const [department, setDepartment] = useState('all');
  const [person, setPerson] = useState('all');
  const [mktRows, setMktRows] = useState([]);
  const [vanDonRows, setVanDonRows] = useState([]);
  const [salesRows, setSalesRows] = useState([]);
  const [usersRows, setUsersRows] = useState([]);
  const [rankingLimit, setRankingLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);

  const loadData = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setErrors([]);
    try {
      const [mktHnRes, mktHcmRes, vanDonHnRes, vanDonHcmRes, vanDonSummaryRes, salesReportsRes, usersRes] = await Promise.allSettled([
        loadMktTable('detail_reports', from, to),
        loadMktTable('marketing_report_hcm', from, to),
        loadOrdersTable('orders', from, to),
        loadOrdersTable('order_code_hcm', from, to),
        loadVanDonTable(from, to),
        loadSalesReportsTable(from, to),
        loadUsersTable(),
      ]);

      const nextErrors = [];
      const unwrap = (res, label) => {
        if (res.status === 'rejected') {
          nextErrors.push(`${label}: ${res.reason?.message || String(res.reason)}`);
          return [];
        }
        if (res.value?.__missing) {
          nextErrors.push(`${label}: chưa có bảng hoặc chưa reload schema`);
          return [];
        }
        return Array.isArray(res.value) ? res.value : res.value?.rows || [];
      };

      const hn = unwrap(mktHnRes, 'detail_reports');
      const hcm = unwrap(mktHcmRes, 'marketing_report_hcm');
      const ordersHn = unwrap(vanDonHnRes, 'orders');
      const ordersHcm = unwrap(vanDonHcmRes, 'order_code_hcm');
      const vdSummary = unwrap(vanDonSummaryRes, 'bao_cao_van_don');
      const salesReports = unwrap(salesReportsRes, 'sales_reports');
      const users = unwrap(usersRes, 'users');

      const mappedMkt = [
        ...dedupeMktDetailReportRows(hn).map((r) => mapMktRow(r, 'hn')).filter(Boolean),
        ...dedupeMktDetailReportRows(hcm).map((r) => mapMktRow(r, 'hcm')).filter(Boolean),
      ];
      let mappedVd = [
        ...ordersHn.map((r) => mapOrderToVanDonRow(r, 'hn')).filter(Boolean),
        ...ordersHcm.map((r) => mapOrderToVanDonRow(r, 'hcm')).filter(Boolean),
      ];
      if (mappedVd.length === 0 && vdSummary.length > 0) {
        mappedVd = vdSummary.map(mapVanDonRow).filter(Boolean);
        nextErrors.push('Vận đơn: đang dùng fallback bao_cao_van_don nên chưa tách được Hà Nội/Hồ Chí Minh.');
      }

      setMktRows(mappedMkt);
      setVanDonRows(mappedVd);
      setSalesRows(salesReports.map(mapSalesReportRow).filter(Boolean));
      setUsersRows(users.map(mapUserRow).filter(Boolean));
      setErrors(nextErrors);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (!allowed) return;
    loadData();
  }, [allowed, loadData]);

  const monthBuckets = useMemo(() => buildLastFourMonthBuckets(to), [to]);
  const filteredMktRows = useMemo(
    () => (branch === 'all' ? mktRows : mktRows.filter((r) => r.branch === branch)),
    [branch, mktRows]
  );
  const filteredVanDonRows = useMemo(
    () => (branch === 'all' ? vanDonRows : vanDonRows.filter((r) => r.branch === branch)),
    [branch, vanDonRows]
  );
  const filteredSalesRows = useMemo(
    () => (branch === 'all' ? salesRows : salesRows.filter((r) => r.branch === branch)),
    [branch, salesRows]
  );
  const filteredUsersRows = useMemo(
    () => (branch === 'all' ? usersRows : usersRows.filter((r) => r.branch === branch)),
    [branch, usersRows]
  );
  const monthly = useMemo(
    () => summarizeByMonth(filteredMktRows, filteredVanDonRows, monthBuckets),
    [filteredMktRows, filteredVanDonRows, monthBuckets]
  );
  const current = useMemo(() => {
    const mkt = emptyMktAgg('Tổng MKT');
    const vd = emptyVdAgg('Tổng vận đơn');
    filteredMktRows.forEach((r) => addMkt(mkt, r));
    filteredVanDonRows.forEach((r) => addVd(vd, r));
    return finalizeCompany(mkt, vd);
  }, [filteredMktRows, filteredVanDonRows]);

  const previous = monthly.length >= 2 ? monthly[monthly.length - 2] : null;
  const kpis = useMemo(
    () => [
      {
        label: 'Doanh số thực tế',
        value: formatNumber(current.orders),
        delta: calcDelta(current.orders, previous?.orders),
        icon: BarChart3,
        kind: 'good',
        note: 'Từ báo cáo MKT',
      },
      {
        label: 'Doanh thu thực',
        value: formatMoney(current.revenue),
        delta: calcDelta(current.revenue, previous?.revenue),
        icon: CircleDollarSign,
        kind: 'good',
        note: 'Ưu tiên doanh thu chốt thực tế',
      },
      {
        label: '% Ads / Doanh thu',
        value: formatPercent(current.adsRate),
        delta: calcDelta(current.adsRate, previous?.adsRate),
        icon: Megaphone,
        kind: statusKind(current.adsRate, 0.35, 'max'),
        note: 'Cảnh báo khi > 35%',
      },
      {
        label: 'Tỉ lệ chốt đơn',
        value: formatPercent(current.closeRate),
        delta: calcDelta(current.closeRate, previous?.closeRate),
        icon: CheckCircle2,
        kind: statusKind(current.closeRate, 0.08, 'min'),
        note: 'Cảnh báo khi < 8%',
      },
      {
        label: 'Tỉ lệ giao thành công',
        value: formatPercent(current.deliverySuccessRate),
        delta: calcDelta(current.deliverySuccessRate, previous?.deliverySuccessRate),
        icon: Truck,
        kind: statusKind(current.deliverySuccessRate, 0.9, 'min'),
        note: 'Cảnh báo khi < 90%',
      },
      {
        label: 'Tỉ lệ Hủy + Hoàn',
        value: formatPercent(current.cancelReturnRate),
        delta: calcDelta(current.cancelReturnRate, previous?.cancelReturnRate),
        icon: AlertTriangle,
        kind: statusKind(current.cancelReturnRate, 0.08, 'max'),
        note: 'Cảnh báo khi > 8%',
      },
      {
        label: 'Tỉ lệ thu tiền',
        value: formatPercent(current.collectionRate),
        delta: calcDelta(current.collectionRate, previous?.collectionRate),
        icon: Banknote,
        kind: statusKind(current.collectionRate, 0.8, 'min'),
        note: 'Có bill / giao thành công',
      },
      {
        label: 'Tiền đã thu',
        value: formatMoney(current.collectedAmount),
        delta: calcDelta(current.collectedAmount, previous?.collectedAmount),
        icon: Activity,
        kind: 'good',
        note: 'Từ tiền trạng thái thanh toán vận đơn',
      },
    ],
    [current, previous]
  );

  const departmentRows = useMemo(() => {
    return DEPARTMENT_FILTERS.map((item) =>
      getDepartmentConfig(item.value, { current, salesRows: filteredSalesRows, usersRows: filteredUsersRows })
    );
  }, [current, filteredSalesRows, filteredUsersRows]);

  const selectedDepartmentValue = department === 'all' ? 'mkt' : department;
  const selectedDepartment = useMemo(
    () => getDepartmentConfig(selectedDepartmentValue, { current, salesRows: filteredSalesRows, usersRows: filteredUsersRows }),
    [current, filteredSalesRows, filteredUsersRows, selectedDepartmentValue]
  );

  const branchRows = useMemo(() => {
    return BRANCHES.filter((item) => item.value !== 'all').map((item) => {
      const mkt = emptyMktAgg(item.label);
      const vd = emptyVdAgg(item.label);
      mktRows.filter((r) => r.branch === item.value).forEach((r) => addMkt(mkt, r));
      vanDonRows.filter((r) => r.branch === item.value).forEach((r) => addVd(vd, r));
      const summary = finalizeCompany(mkt, vd);
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
  }, [mktRows, vanDonRows]);

  const personOptions = useMemo(() => {
    const names = new Set();
    if (selectedDepartmentValue === 'delivery') filteredVanDonRows.forEach((r) => names.add(r.name));
    else if (selectedDepartmentValue === 'mkt') filteredMktRows.forEach((r) => names.add(r.name));
    else if (selectedDepartmentValue === 'hcns') filteredUsersRows.filter((r) => r.teamKind === 'hcns').forEach((r) => names.add(r.name));
    else filteredSalesRows.filter((r) => r.teamKind === selectedDepartmentValue).forEach((r) => names.add(r.name));
    return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [filteredMktRows, filteredSalesRows, filteredUsersRows, filteredVanDonRows, selectedDepartmentValue]);

  useEffect(() => {
    setPerson('all');
    setRankingLimit(10);
  }, [branch, department]);

  const individualRows = useMemo(() => {
    if (selectedDepartmentValue === 'delivery') {
      return aggregateNamed(filteredVanDonRows, addVd, emptyVdAgg, (r) => r.name)
        .map((a) => ({
          label: a.label,
          rankValue: a.billAmount,
          primary: formatMoney(a.billAmount),
          secondary: formatPercent(ratio(a.billOrders, a.success)),
          third: formatNumber(a.stale24h),
          risk: a.stale24h > 0,
        }))
        .filter((r) => person === 'all' || r.label === person)
        .sort((a, b) => b.rankValue - a.rankValue);
    }
    if (selectedDepartmentValue === 'hcns') {
      return aggregateNamed(filteredUsersRows.filter((r) => r.teamKind === 'hcns'), addUser, emptyUserAgg, (r) => r.name)
        .map((a) => ({
          label: a.label,
          rankValue: a.active,
          primary: a.active ? 'Đang hoạt động' : 'Không hoạt động',
          secondary: formatPercent(ratio(a.active, a.total)),
          third: formatNumber(a.newHires),
          risk: a.active === 0,
        }))
        .filter((r) => person === 'all' || r.label === person)
        .sort((a, b) => b.rankValue - a.rankValue);
    }
    if (selectedDepartmentValue !== 'mkt') {
      return aggregateNamed(filteredSalesRows.filter((r) => r.teamKind === selectedDepartmentValue), addSales, emptySalesAgg, (r) => r.name)
        .map((a) => ({
          label: a.label,
          rankValue: selectedDepartmentValue === 'rnd' ? a.products.size : a.revenue,
          primary: selectedDepartmentValue === 'rnd' ? formatNumber(a.products.size) : formatMoney(a.revenue),
          secondary: selectedDepartmentValue === 'cskh' ? formatPercent(ratio(a.customerOld + a.crossSale, a.orders || a.responses)) : formatPercent(ratio(a.orders, a.messages)),
          third: selectedDepartmentValue === 'rnd' ? formatNumber(a.orders) : formatPercent(ratio(a.cancelOrders, a.orders)),
          risk: selectedDepartmentValue === 'sale' && (ratio(a.orders, a.messages) < 0.08 || ratio(a.cancelOrders, a.orders) > 0.08),
        }))
        .filter((r) => person === 'all' || r.label === person)
        .sort((a, b) => b.rankValue - a.rankValue);
    }
    return aggregateNamed(filteredMktRows, addMkt, emptyMktAgg, (r) => r.name)
      .map((a) => ({
        label: a.label,
        rankValue: a.revenue,
        primary: formatMoney(a.revenue),
        secondary: formatPercent(ratio(a.adsCost, a.revenue)),
        third: formatPercent(ratio(a.orders, a.messages)),
        risk: ratio(a.adsCost, a.revenue) > 0.35 || ratio(a.orders, a.messages) < 0.08,
      }))
      .filter((r) => person === 'all' || r.label === person)
      .sort((a, b) => b.rankValue - a.rankValue);
  }, [filteredMktRows, filteredSalesRows, filteredUsersRows, filteredVanDonRows, person, selectedDepartmentValue]);

  const lineData = useMemo(
    () => ({
      labels: monthly.map((m) => m.label),
      datasets: [
        lineDataset('% Ads / Doanh thu', monthly.map((m) => Number((m.adsRate * 100).toFixed(2))), '#dc2626', 'rgba(220, 38, 38, 0.10)'),
        lineDataset('Tỉ lệ chốt đơn', monthly.map((m) => Number((m.closeRate * 100).toFixed(2))), '#9333ea', 'rgba(147, 51, 234, 0.08)'),
        lineDataset('Tỉ lệ giao thành công', monthly.map((m) => Number((m.deliverySuccessRate * 100).toFixed(2))), '#059669', 'rgba(5, 150, 105, 0.08)'),
        lineDataset('Tỉ lệ Hủy + Hoàn', monthly.map((m) => Number((m.cancelReturnRate * 100).toFixed(2))), '#ef4444', 'rgba(239, 68, 68, 0.08)'),
        lineDataset('Tỉ lệ thu tiền', monthly.map((m) => Number((m.collectionRate * 100).toFixed(2))), '#2563eb', 'rgba(37, 99, 235, 0.08)'),
        ...COMPANY_THRESHOLD_DATASETS.map((item) => thresholdDataset(item.label, monthly.length, item.value, item.color)),
      ],
    }),
    [monthly]
  );

  const barData = useMemo(
    () => ({
      labels: individualRows.slice(0, rankingLimit).map((r) => r.label),
      datasets: [
        {
          label: selectedDepartmentValue === 'delivery' ? 'Tiền đã thu' : selectedDepartmentValue === 'rnd' ? 'Sản phẩm qua bước' : 'Doanh thu',
          data: individualRows.slice(0, rankingLimit).map((r) => r.rankValue),
          backgroundColor: individualRows.slice(0, rankingLimit).map((_, index) => (index < 3 ? '#0f766e' : '#64748b')),
          borderRadius: 4,
        },
      ],
    }),
    [individualRows, rankingLimit, selectedDepartmentValue]
  );

  const companyPeriodRows = useMemo(() => buildCompanyPeriodRows(monthly), [monthly]);

  const departmentPeriodRows = useMemo(() => {
    return monthBuckets.map((bucket) => {
      const mkt = emptyMktAgg(bucket.label);
      const vd = emptyVdAgg(bucket.label);
      filteredMktRows.filter((r) => r.monthKey === bucket.key).forEach((r) => addMkt(mkt, r));
      filteredVanDonRows.filter((r) => r.monthKey === bucket.key).forEach((r) => addVd(vd, r));
      const cfg = getDepartmentConfig(selectedDepartmentValue, {
        current: finalizeCompany(mkt, vd),
        salesRows: filteredSalesRows.filter((r) => r.monthKey === bucket.key),
        usersRows: filteredUsersRows.filter((r) => r.monthKey === bucket.key),
      });
      return { label: bucket.label, metrics: cfg.metrics, trendValue: cfg.trendValue, trendDisplay: cfg.trendFormat(cfg.trendValue) };
    });
  }, [filteredMktRows, filteredSalesRows, filteredUsersRows, filteredVanDonRows, monthBuckets, selectedDepartmentValue]);

  const individualGrowthData = useMemo(() => {
    const values = monthBuckets.map((bucket) => {
      const nameFilter = (r) => person === 'all' || r.name === person;
      if (selectedDepartmentValue === 'delivery') {
        const agg = emptyVdAgg(bucket.label);
        filteredVanDonRows.filter((r) => r.monthKey === bucket.key && nameFilter(r)).forEach((r) => addVd(agg, r));
        return agg.billAmount;
      }
      if (selectedDepartmentValue === 'hcns') {
        const agg = emptyUserAgg(bucket.label);
        filteredUsersRows.filter((r) => r.monthKey === bucket.key && r.teamKind === 'hcns' && nameFilter(r)).forEach((r) => addUser(agg, r));
        return agg.newHires;
      }
      if (selectedDepartmentValue !== 'mkt') {
        const agg = emptySalesAgg(bucket.label);
        filteredSalesRows.filter((r) => r.monthKey === bucket.key && r.teamKind === selectedDepartmentValue && nameFilter(r)).forEach((r) => addSales(agg, r));
        return selectedDepartmentValue === 'rnd' ? agg.products.size : agg.revenue;
      }
      const agg = emptyMktAgg(bucket.label);
      filteredMktRows.filter((r) => r.monthKey === bucket.key && nameFilter(r)).forEach((r) => addMkt(agg, r));
      return agg.revenue;
    });
    return {
      labels: monthBuckets.map((b) => b.label),
      datasets: [
        {
          label: selectedDepartmentValue === 'delivery' ? 'Tiền đã thu' : selectedDepartmentValue === 'hcns' ? 'Tuyển dụng' : selectedDepartmentValue === 'rnd' ? 'Sản phẩm qua bước' : 'Doanh thu',
          data: values,
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124, 58, 237, 0.10)',
          fill: true,
          tension: 0.35,
        },
      ],
    };
  }, [filteredMktRows, filteredSalesRows, filteredUsersRows, filteredVanDonRows, monthBuckets, person, selectedDepartmentValue]);

  const individualPeriodRows = useMemo(() => {
    const names = person === 'all' ? individualRows.map((row) => row.label) : [person].filter(Boolean);

    const snapshot = (name, bucket) => {
      const nameFilter = (r) => r.name === name;
      if (selectedDepartmentValue === 'delivery') {
        const agg = emptyVdAgg(bucket.label);
        filteredVanDonRows.filter((r) => r.monthKey === bucket.key && nameFilter(r)).forEach((r) => addVd(agg, r));
        const value = ratio(agg.billOrders, agg.success);
        return {
          value,
          display: formatPercent(value),
          risk: value < 0.8 || agg.stale24h > 0,
          note: agg.stale24h > 0 ? `Quá 24h: ${formatNumber(agg.stale24h)}` : '',
        };
      }

      if (selectedDepartmentValue === 'hcns') {
        const agg = emptyUserAgg(bucket.label);
        filteredUsersRows.filter((r) => r.monthKey === bucket.key && r.teamKind === 'hcns' && nameFilter(r)).forEach((r) => addUser(agg, r));
        const value = ratio(agg.active, agg.total);
        return { value, display: formatPercent(value), risk: value < 0.9, note: '' };
      }

      if (selectedDepartmentValue !== 'mkt') {
        const agg = emptySalesAgg(bucket.label);
        filteredSalesRows.filter((r) => r.monthKey === bucket.key && r.teamKind === selectedDepartmentValue && nameFilter(r)).forEach((r) => addSales(agg, r));
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
      filteredMktRows.filter((r) => r.monthKey === bucket.key && nameFilter(r)).forEach((r) => addMkt(agg, r));
      const value = ratio(agg.adsCost, agg.revenue);
      return { value, display: formatPercent(value), risk: value > 0.35, note: `Chốt: ${formatPercent(ratio(agg.orders, agg.messages))}` };
    };

    return names.map((name) => {
      const values = monthBuckets.map((bucket, index) => {
        const currentValue = snapshot(name, bucket);
        const previousValue = index === 0 ? null : snapshot(name, monthBuckets[index - 1]);
        return {
          ...currentValue,
          label: bucket.label,
          delta: previousValue ? calcDelta(currentValue.value, previousValue.value) : 0,
        };
      });
      return { label: name, values };
    });
  }, [
    filteredMktRows,
    filteredSalesRows,
    filteredUsersRows,
    filteredVanDonRows,
    individualRows,
    monthBuckets,
    person,
    selectedDepartmentValue,
  ]);

  const departmentChartIsPercent = selectedDepartmentValue !== 'rnd';
  const departmentTrendChartData = useMemo(
    () => ({
      labels: departmentPeriodRows.map((r) => r.label),
      datasets: departmentTrendDatasets(departmentPeriodRows, selectedDepartmentValue),
    }),
    [departmentPeriodRows, selectedDepartmentValue]
  );

  if (allowedLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-600">Đang kiểm tra quyền...</div>;
  }

  if (!allowed) {
    return (
      <div className="p-8 text-center font-medium text-red-600">
        Bạn không có quyền truy cập Dashboard điều hành.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1560px]">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link to="/" className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950">
              <ArrowLeft className="h-4 w-4" />
              Quay lại Home
            </Link>
            <h1 className="text-2xl font-bold text-slate-950">Dashboard điều hành</h1>
            <p className="mt-1 text-sm text-slate-600">
              Nguồn dữ liệu: <code>detail_reports</code>, <code>marketing_report_hcm</code>, <code>orders</code>,{' '}
              <code>order_code_hcm</code>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-5">
            <label className="text-xs font-semibold text-slate-600">
              Chi nhánh
              <select value={branch} onChange={(e) => setBranch(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm">
                {BRANCHES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            {activeTab !== 'company' && (
              <label className="text-xs font-semibold text-slate-600">
                Team
                <select value={department} onChange={(e) => setDepartment(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm">
                  {DEPARTMENTS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
            )}
            {activeTab === 'individual' && (
              <label className="text-xs font-semibold text-slate-600">
                Cá nhân
                <select value={person} onChange={(e) => setPerson(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm">
                  <option value="all">All</option>
                  {personOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-xs font-semibold text-slate-600">
              Từ ngày
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Đến ngày
              <div className="mt-1 flex gap-2">
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-2 text-sm" />
                <button
                  type="button"
                  onClick={loadData}
                  disabled={loading}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-400"
                  title="Tải lại"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </label>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {errors.map((err) => (
              <div key={err}>{err}</div>
            ))}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-100/90 p-1 shadow-sm sm:w-auto sm:min-w-[520px]">
            <TabsTrigger value="company" className="rounded-md border border-transparent py-2 text-sm font-semibold text-slate-600 shadow-none transition-all data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm">
              Công ty
            </TabsTrigger>
            <TabsTrigger value="department" className="rounded-md border border-transparent py-2 text-sm font-semibold text-slate-600 shadow-none transition-all data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm">
              Bộ phận
            </TabsTrigger>
            <TabsTrigger value="individual" className="rounded-md border border-transparent py-2 text-sm font-semibold text-slate-600 shadow-none transition-all data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm">
              Cá nhân
            </TabsTrigger>
          </TabsList>

          <TabsContent value="company" className="m-0 space-y-0 outline-none ring-0 focus-visible:ring-0 data-[state=inactive]:hidden">
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {kpis.map((item) => (
                <KpiCard key={item.label} item={item} />
              ))}
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">Xu hướng 4 tháng gần nhất</h2>
                    <p className="text-xs text-slate-500">Có đủ ngưỡng Ads, chốt đơn, giao thành công, hủy hoàn và thu tiền.</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </div>
                <div className="h-[320px]">
                  <Line
                    data={lineData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { position: 'bottom' } },
                      scales: { y: { beginAtZero: true, ticks: { callback: (v) => `${v}%` } } },
                    }}
                  />
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-base font-bold text-slate-950">Cảnh báo nhanh</h2>
                <div className="mt-3 grid gap-2">
                  <MiniStat label="Ads / doanh thu" value={formatPercent(current.adsRate)} danger={current.adsRate > 0.35} />
                  <MiniStat label="Tỉ lệ chốt" value={formatPercent(current.closeRate)} danger={current.closeRate < 0.08} />
                  <MiniStat label="Giao thành công" value={formatPercent(current.deliverySuccessRate)} danger={current.deliverySuccessRate < 0.9} />
                  <MiniStat label="Hủy + Hoàn" value={formatPercent(current.cancelReturnRate)} danger={current.cancelReturnRate > 0.08} />
                  <MiniStat label="Thu tiền" value={formatPercent(current.collectionRate)} danger={current.collectionRate < 0.8} />
                </div>
              </section>
            </div>

            <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-bold text-slate-950">Bảng 8 chỉ số qua 4 tháng</h2>
              <div className="mt-3 overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Chỉ số</th>
                      {monthly.map((m) => (
                        <th key={m.key} className="px-3 py-2 text-right">{m.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {companyPeriodRows.map((row) => (
                      <tr key={row.label}>
                        <td className="px-3 py-3 font-semibold text-slate-900">{row.label}</td>
                        {row.values.map((v) => (
                          <td key={v.label} className="px-3 py-3 text-right">
                            <div className="font-medium text-slate-900">{v.display}</div>
                            <div className={`text-xs ${v.delta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatPercent(v.delta)}</div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-bold text-slate-950">Bảng dữ liệu theo chi nhánh</h2>
              <div className="mt-3 overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Chi nhánh</th>
                      <th className="px-3 py-2 text-right">Doanh số</th>
                      <th className="px-3 py-2 text-right">Doanh thu</th>
                      <th className="px-3 py-2 text-right">Ads / DT</th>
                      <th className="px-3 py-2 text-right">Tỉ lệ chốt</th>
                      <th className="px-3 py-2 text-right">Giao TC</th>
                      <th className="px-3 py-2 text-right">Hủy + Hoàn</th>
                      <th className="px-3 py-2 text-right">Thu tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {branchRows.map((row) => (
                      <tr key={row.branch} className={row.risk ? 'bg-red-50/70' : 'bg-white'}>
                        <td className="px-3 py-3 font-semibold text-slate-900">{row.label}</td>
                        <td className="px-3 py-3 text-right">{formatNumber(row.orders)}</td>
                        <td className="px-3 py-3 text-right font-medium">{formatMoney(row.revenue)}</td>
                        <td className={`px-3 py-3 text-right font-semibold ${row.adsRate > 0.35 ? 'text-red-700' : 'text-slate-900'}`}>{formatPercent(row.adsRate)}</td>
                        <td className={`px-3 py-3 text-right font-semibold ${row.closeRate < 0.08 ? 'text-red-700' : 'text-slate-900'}`}>{formatPercent(row.closeRate)}</td>
                        <td className={`px-3 py-3 text-right font-semibold ${row.deliverySuccessRate < 0.9 ? 'text-red-700' : 'text-slate-900'}`}>{formatPercent(row.deliverySuccessRate)}</td>
                        <td className={`px-3 py-3 text-right font-semibold ${row.cancelReturnRate > 0.08 ? 'text-red-700' : 'text-slate-900'}`}>{formatPercent(row.cancelReturnRate)}</td>
                        <td className={`px-3 py-3 text-right font-semibold ${row.collectionRate < 0.8 ? 'text-red-700' : 'text-slate-900'}`}>{formatPercent(row.collectionRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="department" className="m-0 space-y-0 outline-none ring-0 focus-visible:ring-0 data-[state=inactive]:hidden">
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {selectedDepartment.metrics.map((item) => (
                <MiniStat key={item.label} label={item.label} value={item.value} danger={item.danger} />
              ))}
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
                <h2 className="text-base font-bold text-slate-950">Xu hướng {selectedDepartment.label} 4 tháng</h2>
                <div className="mt-3 h-[320px]">
                  <Line
                    data={departmentTrendChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { position: 'bottom' } },
                      scales: { y: { beginAtZero: true, ticks: { callback: (v) => (departmentChartIsPercent ? `${v}%` : formatNumber(v)) } } },
                    }}
                  />
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-base font-bold text-slate-950">Phạm vi đang xem</h2>
                <div className="mt-3 grid gap-2">
                  <MiniStat label="Team" value={selectedDepartment.label} />
                  <MiniStat label="Chi nhánh" value={BRANCHES.find((item) => item.value === branch)?.label || 'Tổng'} />
                  <MiniStat label="Dòng MKT" value={formatNumber(filteredMktRows.length)} />
                  <MiniStat label="Dòng báo cáo Sale/CSKH/R&D" value={formatNumber(filteredSalesRows.length)} />
                  <MiniStat label="Dòng vận đơn" value={formatNumber(filteredVanDonRows.length)} />
                </div>
              </section>
            </div>

            <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-bold text-slate-950">Bảng dữ liệu cấp bộ phận</h2>
              <div className="mt-3 overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Bộ phận</th>
                      <th className="px-3 py-2 text-right">Doanh thu / quy mô</th>
                      <th className="px-3 py-2 text-right">KPI chính</th>
                      <th className="px-3 py-2 text-right">KPI phụ</th>
                      <th className="px-3 py-2 text-right">KPI khác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {departmentRows.map((row) => (
                      <tr key={row.value} className={row.risk ? 'bg-red-50/70' : 'bg-white'}>
                        <td className="px-3 py-3 font-semibold text-slate-900">{row.label}</td>
                        {row.metrics.slice(0, 4).map((metric) => (
                          <td key={metric.label} className={`px-3 py-3 text-right font-medium ${metric.danger ? 'text-red-700' : 'text-slate-900'}`}>{metric.value}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-bold text-slate-950">So sánh {selectedDepartment.label} qua 4 kỳ</h2>
              <div className="mt-3 overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Kỳ</th>
                      {selectedDepartment.metrics.map((metric) => (
                        <th key={metric.label} className="px-3 py-2 text-right">{metric.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {departmentPeriodRows.map((row) => (
                      <tr key={row.label}>
                        <td className="px-3 py-3 font-semibold text-slate-900">{row.label}</td>
                        {row.metrics.map((metric) => (
                          <td key={metric.label} className={`px-3 py-3 text-right font-medium ${metric.danger ? 'text-red-700' : 'text-slate-900'}`}>{metric.value}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="individual" className="m-0 space-y-0 outline-none ring-0 focus-visible:ring-0 data-[state=inactive]:hidden">
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">Xếp hạng cá nhân {departmentLabel(selectedDepartmentValue)}</h2>
                    <p className="text-xs text-slate-500">Top 3 được tô nổi bật, kéo thanh để xem thêm nhân sự.</p>
                  </div>
                  <label className="text-xs font-semibold text-slate-600">
                    Hiển thị {Math.min(rankingLimit, individualRows.length)}
                    <input
                      type="range"
                      min={3}
                      max={Math.max(3, individualRows.length)}
                      value={Math.min(rankingLimit, Math.max(3, individualRows.length))}
                      onChange={(e) => setRankingLimit(Number(e.target.value))}
                      className="mt-1 block w-44"
                    />
                  </label>
                </div>
                <div className="h-[360px]">
                  <Bar
                    data={barData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      indexAxis: 'y',
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { ticks: { callback: (v) => (selectedDepartmentValue === 'rnd' || selectedDepartmentValue === 'hcns' ? formatNumber(v) : formatMoney(v)) } },
                      },
                    }}
                  />
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-base font-bold text-slate-950">Tăng trưởng cá nhân</h2>
                <p className="text-xs text-slate-500">{person === 'all' ? 'Đang xem All' : person}</p>
                <div className="mt-3 h-[320px]">
                  <Line
                    data={individualGrowthData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: { y: { beginAtZero: true } },
                    }}
                  />
                </div>
              </section>
            </div>

            <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-base font-bold text-slate-950">Bảng dữ liệu cấp cá nhân</h2>
                  <p className="text-xs text-slate-500">
                    {selectedDepartmentValue === 'delivery'
                      ? 'Cột cảnh báo là số đơn chưa xử lý quá 24h.'
                      : 'Chỉ số thay đổi theo KPI của team đang chọn.'}
                  </p>
                </div>
                <div className="text-xs text-slate-500">Hiển thị {individualRows.length} nhân sự</div>
              </div>
              <div className="overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Nhân sự</th>
                      <th className="px-3 py-2 text-right">{selectedDepartmentValue === 'delivery' ? 'Tiền đã thu' : selectedDepartmentValue === 'rnd' ? 'Sản phẩm qua bước' : 'Doanh thu / trạng thái'}</th>
                      <th className="px-3 py-2 text-right">KPI chính</th>
                      <th className="px-3 py-2 text-right">{selectedDepartmentValue === 'delivery' ? 'Quá 24h' : 'KPI phụ'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {individualRows.map((row, index) => (
                      <tr key={row.label} className={row.risk ? 'bg-red-50/70' : 'bg-white'}>
                        <td className="px-3 py-3">
                          <span className={`mr-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${index < 3 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                            {index + 1}
                          </span>
                          <span className="font-semibold text-slate-900">{row.label}</span>
                        </td>
                        <td className="px-3 py-3 text-right font-medium">{row.primary}</td>
                        <td className={`px-3 py-3 text-right font-semibold ${row.risk ? 'text-red-700' : 'text-slate-900'}`}>{row.secondary}</td>
                        <td className="px-3 py-3 text-right">{row.third}</td>
                      </tr>
                    ))}
                    {individualRows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                          Chưa có dữ liệu trong khoảng ngày đang chọn.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-base font-bold text-slate-950">Biến động cá nhân qua 4 kỳ</h2>
                  <p className="text-xs text-slate-500">
                    KPI chính theo team: MKT Ads, Sale chốt đơn, CSKH mua lại, Vận đơn thu tiền, HCNS giữ người, R&D sản phẩm.
                  </p>
                </div>
                <div className="text-xs text-slate-500">{person === 'all' ? 'Theo từng nhân sự' : `Đang xem ${person}`}</div>
              </div>
              <div className="overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">{person === 'all' ? 'Nhân sự' : 'KPI'}</th>
                      {monthBuckets.map((bucket) => (
                        <th key={bucket.key} className="px-3 py-2 text-right">{bucket.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {individualPeriodRows.map((row) => (
                      <tr key={row.label}>
                        <td className="px-3 py-3 font-semibold text-slate-900">{row.label}</td>
                        {row.values.map((value) => (
                          <td key={value.label} className={`px-3 py-3 text-right ${value.risk ? 'bg-red-50 text-red-700' : 'text-slate-900'}`}>
                            <div className="font-semibold">{value.display}</div>
                            <div className={`text-xs ${value.delta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                              {formatPercent(value.delta)}
                            </div>
                            {value.note && <div className="text-xs text-slate-500">{value.note}</div>}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {individualPeriodRows.length === 0 && (
                      <tr>
                        <td colSpan={monthBuckets.length + 1} className="px-3 py-8 text-center text-slate-500">
                          Chưa có dữ liệu biến động trong 4 kỳ gần nhất.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </TabsContent>
        </Tabs>

        {loading && (
          <div className="fixed bottom-4 right-4 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            Đang tải Dashboard điều hành...
          </div>
        )}
      </div>
    </div>
  );
}
