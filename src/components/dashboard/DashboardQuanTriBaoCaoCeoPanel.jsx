import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import '../../pages/BaoCaoSale.css';
import { supabase } from '../../supabase/config';
import { formatCurrency, formatNumber, filterRawData } from '../../utils/nhanSuSaleLumiMoiLogic';
import { aggregateVanHanhSlice, formatPct, formatSlVi } from '../../utils/baoCaoVanDonMarketMatrix';
import {
  normalizeMktHcmDetailReportRow,
  normalizeMktHnDetailReportRow,
} from '../../utils/mktNormalizeDetailReportRows';
import {
  dedupeMktDetailReportRows,
  overlayHcmMarketingReportRowsFromOrders,
} from '../../services/mktRecalcSoDonThucTeFromOrders';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend, ChartDataLabels);

const CEO_CHART_COLORS = ['#2563eb', '#16a34a', '#ca8a04', '#dc2626', '#9333ea', '#0891b2', '#ea580c', '#4f46e5'];
/** Màu nền mờ theo thị trường trên biểu đồ cột tổng (cùng palette, ổn định theo tên TT) */
const CEO_MARKET_ZONE_ALPHA = 0.14;

function hexToRgba(hex, alpha) {
  const h = String(hex || '').replace('#', '').trim();
  if (h.length !== 3 && h.length !== 6) return `rgba(148, 163, 184, ${alpha})`;
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((x) => Number.isNaN(x))) return `rgba(148, 163, 184, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Map thị trường → màu chính (thứ tự tên sort vi — khớp vùng nền biểu đồ tổng & cột TT) */
function ceoMarketColorByName(marketNames) {
  const unique = [...new Set((marketNames || []).map((m) => String(m || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'vi')
  );
  const map = new Map();
  unique.forEach((m, i) => {
    map.set(m, CEO_CHART_COLORS[i % CEO_CHART_COLORS.length]);
  });
  return map;
}

const CEO_REV_CHART_TOP_N = 18;
/** Giới hạn số series sản phẩm trên biểu đồ cột ghép — phần còn lại gộp «Khác» để legend và cột gọn */
const CEO_GROUPED_BAR_TOP_PRODUCTS = 7;
/** Độ rộng tối thiểu mỗi cụm (chi nhánh × thị trường) trên biểu đồ 1 — mobile cuộn ngang thay vì ép nhỏ cột */
const CEO_MAIN_BAR_MIN_PX_PER_CATEGORY = 150;

function formatAxisMoneyShort(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '';
  if (Math.abs(x) >= 1e9) return `${(x / 1e9).toFixed(1)}B`;
  if (Math.abs(x) >= 1e6) return `${(x / 1e6).toFixed(0)}M`;
  if (Math.abs(x) >= 1e3) return `${(x / 1e3).toFixed(0)}k`;
  return String(Math.round(x));
}

function createCeoMainGroupedBarPlugins({ categoryTotals, dividerAfterIndex, categoryZoneFills }) {
  return [
    {
      id: 'ceoMarketCategoryZones',
      beforeDatasetsDraw(chart) {
        const fills = categoryZoneFills;
        if (!fills?.length) return;
        const xScale = chart.scales.x;
        const { ctx, chartArea } = chart;
        if (!xScale || !chartArea) return;
        const n = Math.min(fills.length, chart.data?.labels?.length ?? 0);
        if (!n) return;
        ctx.save();
        for (let i = 0; i < n; i += 1) {
          const fill = fills[i];
          if (!fill) continue;
          const xC = xScale.getPixelForTick(i);
          if (!Number.isFinite(xC)) continue;
          const xL = i <= 0 ? chartArea.left : (xScale.getPixelForTick(i - 1) + xC) / 2;
          const xR = i >= n - 1 ? chartArea.right : (xC + xScale.getPixelForTick(i + 1)) / 2;
          if (!Number.isFinite(xL) || !Number.isFinite(xR) || xR <= xL) continue;
          ctx.fillStyle = fill;
          ctx.fillRect(xL, chartArea.top, xR - xL, chartArea.bottom - chartArea.top);
        }
        ctx.restore();
      },
    },
    {
      id: 'ceoBranchDivider',
      afterDraw(chart) {
        const xScale = chart.scales.x;
        if (!xScale || dividerAfterIndex <= 0 || dividerAfterIndex >= chart.data.labels.length) return;
        const { ctx, chartArea } = chart;
        const xMid =
          (xScale.getPixelForTick(dividerAfterIndex - 1) + xScale.getPixelForTick(dividerAfterIndex)) / 2;
        if (!Number.isFinite(xMid)) return;
        ctx.save();
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(xMid, chartArea.top);
        ctx.lineTo(xMid, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
      },
    },
    {
      id: 'ceoCategoryTotals',
      afterDatasetsDraw(chart) {
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        const { ctx, chartArea } = chart;
        if (!xScale || !yScale || !categoryTotals?.length) return;
        const n = Math.min(categoryTotals.length, chart.data.labels.length);
        ctx.save();
        ctx.font = '600 11px system-ui,-apple-system,sans-serif';
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        for (let i = 0; i < n; i += 1) {
          const t = Number(categoryTotals[i] || 0);
          if (!t) continue;
          const xPos = xScale.getPixelForTick(i);
          const yAtVal = yScale.getPixelForValue(t);
          const yPos = Math.max(chartArea.top + 2, yAtVal - 5);
          const text = formatAxisMoneyShort(t);
          ctx.strokeStyle = 'rgba(255,255,255,0.92)';
          ctx.lineWidth = 4;
          ctx.strokeText(text, xPos, yPos);
          ctx.fillStyle = '#0f172a';
          ctx.fillText(text, xPos, yPos);
        }
        ctx.restore();
      },
    },
  ];
}

function buildCeoNestedGroupedBarModel(rows) {
  const BRANCHES = [
    { key: 'hn', label: 'Hà Nội' },
    { key: 'hcm', label: 'HCM' },
  ];
  /** @type {Map<string, Map<string, Map<string, number>>>} */
  const nest = new Map();
  for (const b of BRANCHES) nest.set(b.key, new Map());

  for (const r of rows || []) {
    const src = String(r?.__ceo_source || '').toLowerCase();
    if (src !== 'hn' && src !== 'hcm') continue;
    const market = normalizePickValue(r?.thiTruong) || '(Trống)';
    const product = normalizePickValue(r?.sanPham) || '(Trống)';
    const v = Number(r?.doanhThuChotThucTe || 0);
    const mm = nest.get(src);
    if (!mm.has(market)) mm.set(market, new Map());
    const pm = mm.get(market);
    pm.set(product, (pm.get(product) || 0) + v);
  }

  const productTotals = new Map();
  nest.forEach((mm) => {
    mm.forEach((pm) => {
      pm.forEach((val, p) => {
        productTotals.set(p, (productTotals.get(p) || 0) + val);
      });
    });
  });
  const productsAll = Array.from(productTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p);
  const mainProducts = productsAll.slice(0, CEO_GROUPED_BAR_TOP_PRODUCTS);
  const tailProducts = productsAll.slice(CEO_GROUPED_BAR_TOP_PRODUCTS);

  const categories = [];
  for (const { key, label } of BRANCHES) {
    const mm = nest.get(key);
    const markets = Array.from(mm.keys()).sort((a, b) => a.localeCompare(b, 'vi'));
    for (const m of markets) {
      categories.push({ branchKey: key, branchLabel: label, market: m });
    }
  }

  const hnCatCount = categories.filter((c) => c.branchKey === 'hn').length;
  const hasHcm = categories.some((c) => c.branchKey === 'hcm');
  const dividerAfterIndex = hnCatCount > 0 && hasHcm ? hnCatCount : -1;

  function cellAt(cat, product) {
    const mm = nest.get(cat.branchKey);
    return Number(mm?.get(cat.market)?.get(product) || 0);
  }

  const datasets = mainProducts.map((p, idx) => {
    const color = CEO_CHART_COLORS[idx % CEO_CHART_COLORS.length];
    return {
      label: p,
      data: categories.map((c) => cellAt(c, p)),
      backgroundColor: color,
      borderColor: color,
      borderWidth: 1,
      borderRadius: 4,
      maxBarThickness: 80,
    };
  });

  if (tailProducts.length) {
    const khacData = categories.map((cat) =>
      tailProducts.reduce((s, p) => s + cellAt(cat, p), 0)
    );
    if (khacData.some((v) => Number(v) > 0)) {
      const color = '#64748b';
      datasets.push({
        label: `Khác (${tailProducts.length} SP)`,
        data: khacData,
        backgroundColor: color,
        borderColor: color,
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 80,
      });
    }
  }

  const categoryTotals = categories.map((_, i) =>
    datasets.reduce((s, ds) => s + Number(ds.data[i] || 0), 0)
  );

  const labels = categories.map((c) => `${c.branchLabel}\n${c.market}`);

  const colorByMarket = ceoMarketColorByName(categories.map((c) => c.market));
  const categoryZoneFills = categories.map((c) => {
    const m = c.market;
    if (!m || m === '(Trống)') return `rgba(148, 163, 184, ${CEO_MARKET_ZONE_ALPHA})`;
    const hex = colorByMarket.get(m);
    return hexToRgba(hex || '#94a3b8', CEO_MARKET_ZONE_ALPHA);
  });

  return {
    labels,
    datasets,
    categoryTotals,
    categoryZoneFills,
    /** Cùng quy tắc gán màu theo tên TT (sort vi) — dùng cho biểu đồ xếp hạng TT */
    marketColorByName: colorByMarket,
    dividerAfterIndex,
    categoryCount: categories.length,
    /** Số SP gộp vào series «Khác» (0 = không gộp) */
    otherProductsGrouped: tailProducts.length,
  };
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 80;

function mktRowHasTen(r) {
  const t = String(r?.['Tên'] ?? r?.ten ?? '').trim();
  return Boolean(t);
}

// Bộ lọc Ca mặc định tick toàn bộ — khớp đúng tab "Báo cáo chi tiết" của trang Báo cáo MKT
// (`viewNsMoiNhanh.html`), nơi mọi ca được check sẵn khi mở. Trước đây panel CEO mặc định
// chỉ tick "Hết ca" nên tổng DS Chốt / CPQC / Số Mess đều thiếu so với báo cáo MKT.

function normalizePickValue(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeShiftLabel(value) {
  const s = normalizePickValue(value);
  const l = s.toLowerCase();
  if (!l) return '';
  // Ca gộp legacy: coi như "Hết ca" để tránh cộng trùng khi lọc theo ca.
  // (Khớp quy ước recalc MKT: ca trống/gộp ưu tiên gom về Hết ca.)
  const hasHet = l.includes('het ca') || l.includes('hết ca');
  const hasGiua = l.includes('giua ca') || l.includes('giữa ca');
  if (hasHet && hasGiua) return 'Hết ca';
  if (l === 'het ca' || l === 'hết ca') return 'Hết ca';
  if (l === 'giua ca' || l === 'giữa ca') return 'Giữa ca';
  // fallback: giữ nguyên nhưng chuẩn hoá kiểu Title-case đơn giản cho bớt lệch
  return s;
}

// CEO MKT: đọc trực tiếp bảng MKT (HN + HCM). Các cột tiếng Việt cần quote đúng key.
const MKT_DATE_COL = '"Ngày"';
// HN (`detail_reports`): khớp đúng filter của `/xem-bao-cao-mkt`
// (`viewNsMoiNhanh.html` → `MKT_ALLOWED_TEAMS = ['HN-MKT', 'Team Test']`).
// Trước đây panel CEO dùng OR-scope dựa trên `department` quá rộng nên cộng dồn
// cả các team không thuộc báo cáo MKT HN → tổng Số Mess / Doanh số TT bị "phình".
const MKT_HN_ALLOWED_TEAMS = ['HN-MKT', 'Team Test'];
// HCM (`marketing_report_hcm`): khớp `/xem-bao-cao-mkt-hcm`
// (`viewNsMoiNhanh-HCM.html` → mặc định team `MKT - Đức Anh`).
const MKT_HCM_ALLOWED_TEAMS = ['MKT - Đức Anh'];
const MKT_REPORTS_SELECT_BASE = [
  'id',
  '"Ngày"',
  'ca',
  '"Tên"',
  '"Team"',
  '"Sản_phẩm"',
  '"Thị_trường"',
  '"Số_Mess_Cmt"',
  '"CPQC"',
  '"Số đơn"',
  '"Doanh số"',
].join(',');

// Một số DB dùng tên khác nhau cho “doanh số TT” (vd. “Doanh số đi thực tế”).
// Không được select cột không tồn tại — PostgREST sẽ 400. Vì vậy ta thử nhiều candidates.
const MKT_REPORTS_SELECT_CANDIDATES = [
  '*',
  `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh số TT","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
  `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh thu chốt thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
  `${MKT_REPORTS_SELECT_BASE},"Số đơn TT","Doanh số TT","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
  `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh số thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
  `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh số đi thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
  `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
  MKT_REPORTS_SELECT_BASE,
];

function selectCandidatesForTable(tableName) {
  const t = String(tableName || '').trim();
  if (t === 'detail_reports') {
    // Bảng HN (detail_reports) — luôn ưu tiên lấy "Doanh số TT" (đúng cột DS Chốt TT mà
    // trang Báo cáo MKT dùng); không lấy "Doanh số đi thực tế" vì đó là khái niệm khác
    // (doanh số đã ship đi) và không phải DS Chốt TT.
    return [
      `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh số TT","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh thu chốt thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      MKT_REPORTS_SELECT_BASE,
    ];
  }
  if (t === 'marketing_report_hcm') {
    // Bảng HCM hay lệch schema: fallback cực "defensive" để tránh 400.
    const baseNoDims = ['id', '"Ngày"', 'ca', '"Team"', '"Số đơn"', '"Doanh số"'].join(',');
    const baseBare = ['id', '"Ngày"', 'ca', '"Team"'].join(',');
    return [
      '*',
      // try full KPI first
      `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh số TT","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh thu chốt thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${MKT_REPORTS_SELECT_BASE},"Số đơn TT","Doanh số TT","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh số thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh số đi thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      // drop dim columns that are most likely to differ
      `${baseNoDims},"Số đơn thực tế","Doanh số TT","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${baseNoDims},"Số đơn thực tế","Doanh thu chốt thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${baseNoDims},"Số đơn TT","Doanh số TT","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${baseNoDims},"Số đơn thực tế","Doanh số thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${baseNoDims},"Số đơn thực tế","Doanh số đi thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${baseNoDims},"Số đơn thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      // minimal safe
      baseNoDims,
      baseBare,
    ];
  }
  return MKT_REPORTS_SELECT_CANDIDATES;
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function getFirstDefined(row, keys) {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return null;
}

function parseNumberLoose(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value).trim();
  if (!raw) return 0;
  const negative = raw.startsWith('-');
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return 0;
  const n = Number((negative ? '-' : '') + digits);
  return Number.isFinite(n) ? n : 0;
}

function normalizeYmd(value) {
  if (!value) return '';
  const s = String(value).trim();
  if (!s) return '';
  if (s.includes('T')) return s.slice(0, 10);
  return s.slice(0, 10);
}

function sqlCoalesceNumbers(...vals) {
  for (const v of vals) {
    if (v == null || v === '') continue;
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

function resolveOrderDisplayTotalVnd(row) {
  if (row?.van_don_line_total_vnd != null && row.van_don_line_total_vnd !== '') {
    const v = Number(row.van_don_line_total_vnd);
    if (!Number.isNaN(v)) return v;
  }
  const rawTong = row?.tong_tien_vnd ?? row?.tong_tien_VND;
  if (rawTong != null && rawTong !== '' && !Number.isNaN(Number(rawTong))) {
    const tn = Number(rawTong);
    if (tn !== 0) return tn;
  }
  return sqlCoalesceNumbers(row?.total_amount_vnd, row?.sale_price, row?.goods_amount, 0);
}

function paymentLabelForOrder(order) {
  const d = String(order?.payment_status_detail ?? '').trim();
  if (d) return d;
  return String(order?.payment_status ?? '').trim();
}

function paymentLabelIsCoBillOnly(label) {
  const s = String(label ?? '').trim().toLowerCase();
  if (!s) return false;
  if (s.includes('1 phần') && s.includes('bill')) return false;
  return s.includes('có bill');
}

function orderHasBillEvidence(row) {
  if (!row || typeof row !== 'object') return false;
  const up = String(row.ngayupbill ?? row['Ngày up bill'] ?? '').trim();
  const img = String(row.payment_image ?? row['Payment Image'] ?? '').trim();
  const pb = String(row.payment_bill ?? row['Payment Bill'] ?? '').trim();
  return Boolean(up || img || pb);
}

function resolveReconciledVnd(row) {
  const v1 = row?.reconciled_vnd;
  if (v1 != null && v1 !== '' && Number.isFinite(Number(v1))) return Number(v1);
  const v2 = row?.reconciled_amount;
  if (v2 != null && v2 !== '' && Number.isFinite(Number(v2))) return Number(v2);
  const v3 = row?.total_amount_vnd;
  if (v3 != null && v3 !== '' && Number.isFinite(Number(v3))) return Number(v3);
  return 0;
}

function mapOrderRowToVanDonVirtual(row, branchLabel) {
  if (!row || typeof row !== 'object') return null;
  const ngay = normalizeYmd(row?.order_date) || normalizeYmd(row?.created_at);
  const __ceo_branch = String(branchLabel || '').toUpperCase() === 'HCM' ? 'HCM' : 'HN';
  const checkResult = String(row?.check_result ?? '').trim() || '(Trống)';
  const deliveryStatus = String(row?.delivery_status_nb ?? row?.delivery_status ?? '').trim() || '(Trống)';
  const paymentLabelRaw = paymentLabelForOrder(row) || '(Trống)';
  const hasBill = orderHasBillEvidence(row) || paymentLabelIsCoBillOnly(paymentLabelRaw);
  const paymentLabel = hasBill ? 'Có bill' : paymentLabelRaw;
  const tracking = String(row?.tracking_code ?? '').trim();
  const shippingUnit = String(row?.shipping_unit ?? '').trim();
  const lenVh = shippingUnit ? 1 : 0;
  const amt = resolveOrderDisplayTotalVnd(row);
  const recVnd = resolveReconciledVnd(row);

  const giaoHang = {
    [deliveryStatus]: 1,
    'Mã Tracking': tracking ? 1 : 0,
    'Lên vận hành': lenVh,
  };
  if (/mgt/i.test(shippingUnit)) {
    giaoHang.MGT = 1;
  }

  return {
    _source: 'orders',
    id: row?.id || row?.order_code || `${ngay}-${Math.random().toString(36).slice(2, 8)}`,
    __ceo_branch,
    _ket_qua_check: { [checkResult]: 1 },
    _trang_thai_giao_hang: giaoHang,
    _trang_thai_thanh_toan: { [paymentLabel]: 1 },
    _tien_trang_thai_thanh_toan: { [paymentLabel]: hasBill ? recVnd : 0 },
    _tong_tien_vnd: amt,
    _len_vh_don_vi: lenVh,
    'khu vực': String(row?.country ?? '').trim() || 'Không xác định',
    'Ngày lên đơn': ngay,
  };
}

function mapMktReportRowToVirtual(row, source) {
  if (!row || typeof row !== 'object') return null;
  // PostgREST trả key theo đúng tên cột (không có dấu quote trong key).
  const ngay = String(getFirstDefined(row, ['Ngày']) ?? '').slice(0, 10);
  const ca = normalizeShiftLabel(getFirstDefined(row, ['ca']) ?? '');
  const team = normalizePickValue(getFirstDefined(row, ['Team']) ?? '');
  const sanPham = normalizePickValue(getFirstDefined(row, ['Sản_phẩm']) ?? '');
  const thiTruong = normalizePickValue(getFirstDefined(row, ['Thị_trường']) ?? '');
  const soMessCmt = parseNumberLoose(getFirstDefined(row, ['Số_Mess_Cmt', 'Số Mess', 'So_Mess_Cmt']) ?? 0);
  const cpqc = parseNumberLoose(getFirstDefined(row, ['CPQC', 'Cpqc', 'cpqc']) ?? 0);
  const soDonTay = parseNumberLoose(getFirstDefined(row, ['Số đơn', 'Số_đơn', 'So don', 'So_don']) ?? 0);
  const doanhSoTay = parseNumberLoose(
    getFirstDefined(row, ['Doanh số', 'Doanh_số', 'Doanh so', 'Doanh_so']) ?? 0
  );

  // TT: chỉ dùng cột TT (Số đơn thực tế / Doanh số TT). Trang Báo cáo MKT
  // (`viewNsMoiNhanh.html`) cũng dùng đúng cột này — không fallback sang
  // "Số đơn" / "Doanh số" nhập tay khi TT = 0. Trước đây panel CEO fallback
  // sang giá trị nhập tay nên DS Chốt (TT) và Số đơn TT bị lệch (thường cao
  // hơn) so với báo cáo MKT.
  const soDonTT = parseNumberLoose(
    getFirstDefined(row, ['Số đơn thực tế', 'Số đơn TT', 'So don thuc te', 'So don tt', 'So don TT']) ?? 0
  );
  const dsTT = parseNumberLoose(
    getFirstDefined(row, [
      // Ưu tiên DS chốt TT (đã trừ huỷ) đúng nghĩa — khớp viewNsMoiNhanh.html.
      'Doanh số TT',
      'Doanh thu chốt thực tế',
      'Doanh thu chot thuc te',
      'Doanh số thực tế',
      // Fallback legacy label (chỉ khi DB còn dữ liệu cũ chưa migrate).
      'DS chốt',
      'DS chot',
      'Doanh so thuc te',
    ]) ?? 0
  );
  const soDonHuyTT = parseNumberLoose(
    getFirstDefined(row, ['Số đơn hoàn hủy', 'Số đơn hủy', 'So don huy']) ?? 0
  );
  const dsHuyTT = parseNumberLoose(
    getFirstDefined(row, ['Doanh số hoàn hủy thực tế', 'Doanh số hủy TT', 'Doanh so huy thuc te']) ?? 0
  );

  const soDonThucTe = soDonTT;
  const doanhThuChotThucTe = dsTT;

  return {
    __ceo_source: source, // 'hn' | 'hcm'
    ngay,
    ca,
    team,
    sanPham,
    thiTruong,
    soMessCmt,
    cpqc,
    soDonTay,
    doanhSoTay,
    soDonThucTe,
    doanhThuChotThucTe,
    soDonHoanHuyThucTe: soDonHuyTT,
    doanhSoHoanHuyThucTe: dsHuyTT,
  };
}

function emptyAgg(label) {
  return {
    label,
    mess: 0,
    cpqc: 0,
    soDonTay: 0,
    doanhSoTay: 0,
    soDonTT: 0,
    doanhSoTT: 0,
    /** Tử số «Tỉ lệ chốt» khớp MKT: HN = tổng TT/đơn thực tế; HCM = tổng «Số đơn» nhập tay (xem masterData viewNsMoiNhanh*.html). */
    soDonForTiLeChot: 0,
    /** Mẫu số «%CP/DS» khớp MKT: = CPQC / DS Chốt nhập tay (doanhSoTay). */
    doanhSoForCpDs: 0,
  };
}

function addRow(agg, r) {
  agg.mess += Number(r.soMessCmt || 0);
  agg.cpqc += Number(r.cpqc || 0);
  agg.soDonTay += Number(r.soDonTay || 0);
  agg.doanhSoTay += Number(r.doanhSoTay || 0);
  agg.soDonTT += Number(r.soDonThucTe || 0);
  agg.doanhSoTT += Number(r.doanhThuChotThucTe || 0);
  const src = String(r.__ceo_source || '').toLowerCase();
  const donMkt = src === 'hcm' ? Number(r.soDonTay || 0) : Number(r.soDonThucTe || 0);
  agg.soDonForTiLeChot += donMkt;
  // %CP/DS: HCM dùng DS Chốt nhập tay (cột «Doanh số»);
  // HN dùng DS Chốt TT (vì HN map dsChot = dsChotThucTe trong viewNsMoiNhanh.html).
  const dsForCpDs = src === 'hcm' ? Number(r.doanhSoTay || 0) : Number(r.doanhThuChotThucTe || 0);
  agg.doanhSoForCpDs += dsForCpDs;
}

function addAgg(dst, src) {
  dst.mess += Number(src.mess || 0);
  dst.cpqc += Number(src.cpqc || 0);
  dst.soDonTay += Number(src.soDonTay || 0);
  dst.doanhSoTay += Number(src.doanhSoTay || 0);
  dst.soDonTT += Number(src.soDonTT || 0);
  dst.doanhSoTT += Number(src.doanhSoTT || 0);
  dst.soDonForTiLeChot += Number(src.soDonForTiLeChot || 0);
  dst.doanhSoForCpDs += Number(src.doanhSoForCpDs || 0);
}

function pct(n, d) {
  if (!d) return '0.00%';
  return `${((Number(n || 0) / Number(d || 0)) * 100).toFixed(2)}%`;
}

function moneyDiv(n, d) {
  const nn = Number(n || 0);
  const dd = Number(d || 0);
  if (!dd) return 0;
  return nn / dd;
}

function warnStyle(kind) {
  if (kind === 'bad') return { background: '#fde2e2', color: '#991b1b', fontWeight: 700 };
  if (kind === 'warn') return { background: '#fef3c7', color: '#92400e', fontWeight: 700 };
  if (kind === 'good') return { background: '#dcfce7', color: '#166534', fontWeight: 700 };
  return null;
}

function cpOverDsKind(cp, ds) {
  if (!Number(ds || 0)) return null;
  const r = moneyDiv(cp, ds);
  if (r >= 0.35) return 'bad';
  if (r >= 0.25) return 'warn';
  return 'good';
}

function chotKind(soDon, mess) {
  if (!Number(mess || 0)) return null;
  const r = moneyDiv(soDon, mess);
  if (r < 0.02) return 'bad';
  if (r < 0.03) return 'warn';
  return 'good';
}

function finalizeCeoAgg(a) {
  return {
    ...a,
    tiLeChot: moneyDiv(a.soDonForTiLeChot, a.mess),
    tiLeChotTT: moneyDiv(a.soDonTT, a.mess),
    giaMess: moneyDiv(a.cpqc, a.mess),
    cps: moneyDiv(a.cpqc, a.soDonForTiLeChot),
    // %CP/DS: khớp MKT → CPQC / DS Chốt nhập tay (doanhSoForCpDs)
    cpDs: moneyDiv(a.cpqc, a.doanhSoForCpDs),
    // Giá TB Đơn: khớp MKT → DS Chốt / Số đơn (HCM: nhập tay, HN: TT)
    giaTbDon: moneyDiv(a.doanhSoForCpDs, a.soDonForTiLeChot),
  };
}

function aggregateRevenuePairs(rows, keyFn) {
  const map = new Map();
  for (const r of rows || []) {
    const raw = keyFn(r);
    const k = normalizePickValue(String(raw ?? '')) || '(Trống)';
    const v = Number(r?.doanhThuChotThucTe || 0);
    map.set(k, (map.get(k) || 0) + v);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

function topNWithOther(pairs, n) {
  if (!pairs.length) return [];
  if (pairs.length <= n) return pairs;
  const top = pairs.slice(0, n);
  const rest = pairs.slice(n).reduce((s, [, v]) => s + Number(v || 0), 0);
  if (rest > 0) top.push(['Khác', rest]);
  return top;
}

export default function DashboardQuanTriBaoCaoCeoPanel({ globalFrom, globalTo, onChangeFrom, onChangeTo }) {
  const [rowsHn, setRowsHn] = useState([]);
  const [rowsHcm, setRowsHcm] = useState([]);
  const [rowsOrdersHn, setRowsOrdersHn] = useState([]);
  const [rowsOrdersHcm, setRowsOrdersHcm] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState({
    shifts: [],
    teams: [],
    products: [],
    markets: [],
  });
  const [branchPick, setBranchPick] = useState('all'); // all | hcm | hn
  const didInitFiltersRef = useState(false);
  const lastAllOptionsRef = useState(() => ({ shifts: [], teams: [], products: [], markets: [] }));
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const toggleInList = (list, value) => {
    const v = normalizePickValue(value);
    const next = new Set((list || []).map((x) => normalizePickValue(x)).filter(Boolean));
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return Array.from(next.values());
  };

  const uniqueSorted = (arr, pick) => {
    const s = new Set();
    (arr || []).forEach((x) => {
      const v = normalizePickValue(pick(x));
      if (v) s.add(v);
    });
    return Array.from(s.values()).sort((a, b) => a.localeCompare(b, 'vi'));
  };

  const load = useCallback(async () => {
    if (!globalFrom || !globalTo) return;
    if (globalFrom > globalTo) {
      if (isMountedRef.current) setError('Từ ngày phải ≤ Đến ngày.');
      return;
    }
    if (!isMountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const isMissingColumnErr = (err) => {
        const code = String(err?.code || '');
        const msg = String(err?.message || '').toLowerCase();
        const status = Number(err?.status || err?.statusCode || 0);
        // PostgREST hay trả 400 cho lỗi select sai cột; supabase-js đôi khi không set code/message rõ ràng.
        if (status === 400) return true;
        return code === '42703' || msg.includes('does not exist') || msg.includes('could not find');
      };

      const loadTable = async (tableName) => {
        const all = [];
        let lastErr = null;

        // Retry với select ngắn hơn nếu thiếu cột
        const candidates = selectCandidatesForTable(tableName);
        for (const selectStr of candidates) {
          try {
            all.length = 0;
            for (let page = 0; page < MAX_PAGES; page += 1) {
              const from = page * PAGE_SIZE;
              const to = from + PAGE_SIZE - 1;
              let q = supabase
                .from(tableName)
                .select(selectStr)
                // PostgREST: cột tiếng Việt / chữ hoa cần quote trong filter key, nếu không sẽ 400.
                .gte(MKT_DATE_COL, globalFrom)
                .lte(MKT_DATE_COL, globalTo);

              // Lọc team đúng theo trang Báo cáo MKT để Số Mess / Doanh số TT
              // khớp `/xem-bao-cao-mkt` (HN) và `/xem-bao-cao-mkt-hcm` (HCM).
              const tNorm = String(tableName || '').trim();
              if (tNorm === 'detail_reports' && MKT_HN_ALLOWED_TEAMS.length > 0) {
                q = q.in('Team', MKT_HN_ALLOWED_TEAMS);
              } else if (tNorm === 'marketing_report_hcm' && MKT_HCM_ALLOWED_TEAMS.length > 0) {
                q =
                  MKT_HCM_ALLOWED_TEAMS.length === 1
                    ? q.eq('Team', MKT_HCM_ALLOWED_TEAMS[0])
                    : q.in('Team', MKT_HCM_ALLOWED_TEAMS);
              }

              const { data, error: qErr } = await q
                .order(MKT_DATE_COL, { ascending: true })
                .range(from, to);
              if (qErr) throw qErr;
              const batch = data || [];
              all.push(...batch);
              if (batch.length < PAGE_SIZE) break;
            }
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            if (!isMissingColumnErr(e)) break;
          }
        }

        if (lastErr) throw lastErr;
        return all;
      };

      const ORDERS_SELECT_HN =
        'id, order_code, order_date, created_at, country, delivery_status_nb, delivery_status, check_result, payment_status, payment_status_detail, total_amount_vnd, tong_tien_vnd, van_don_line_total_vnd, sale_price, goods_amount, tracking_code, shipping_unit, reconciled_vnd, reconciled_amount, payment_bill, payment_image, ngayupbill';
      const ORDERS_SELECT_HCM = `${ORDERS_SELECT_HN}, marketing_staff, product, shift, total_vnd`;

      const loadOrdersTable = async (tableName) => {
        const all = [];
        const selectStr =
          String(tableName || '').trim() === 'order_code_hcm' ? ORDERS_SELECT_HCM : ORDERS_SELECT_HN;
        for (let page = 0; page < MAX_PAGES; page += 1) {
          const from = page * PAGE_SIZE;
          const to = from + PAGE_SIZE - 1;
          let q = supabase.from(tableName).select(selectStr)
            .gte('order_date', globalFrom)
            .lte('order_date', globalTo);

          // Đồng bộ logic trang Vận đơn Hà Nội: loại riêng chi nhánh HCM khỏi bảng `orders`.
          if (String(tableName || '').trim() === 'orders') {
            q = q.or('team.is.null,team.neq.HCM');
          }

          const { data, error: qErr } = await q
            .order('order_date', { ascending: true })
            .range(from, to);
          if (qErr) throw qErr;
          const batch = data || [];
          all.push(...batch);
          if (batch.length < PAGE_SIZE) break;
        }
        return all;
      };

      const [hn, hcm, ordersHn, ordersHcm] = await Promise.all([
        loadTable('detail_reports'),
        loadTable('marketing_report_hcm'),
        loadOrdersTable('orders'),
        loadOrdersTable('order_code_hcm'),
      ]);
      if (!isMountedRef.current) return;
      setRowsHn(hn);
      setRowsHcm(hcm);
      setRowsOrdersHn(ordersHn);
      setRowsOrdersHcm(ordersHcm);
    } catch (e) {
      console.error(e);
      if (!isMountedRef.current) return;
      setError(e?.message || 'Không tải được detail_reports / marketing_report_hcm');
      setRowsHn([]);
      setRowsHcm([]);
      setRowsOrdersHn([]);
      setRowsOrdersHcm([]);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [globalFrom, globalTo]);

  useEffect(() => {
    load();
  }, [load]);

  const mappedAll = useMemo(() => {
    const out = [];
    // Khử trùng giống trang Báo cáo MKT để tránh cộng trùng số liệu (trùng key/ngày+tên+sp+tt+ca).
    // HN: normalize → lọc dòng có Tên → dedupe (giống viewNsMoiNhanh.html).
    const hnDeduped = dedupeMktDetailReportRows(
      (rowsHn || []).map(normalizeMktHnDetailReportRow).filter(mktRowHasTen)
    );
    // HCM: normalize → lọc Tên → phủ TT từ đơn → dedupe (giống viewNsMoiNhanh-HCM.html).
    const hcmNorm = (rowsHcm || []).map(normalizeMktHcmDetailReportRow).filter(mktRowHasTen);
    const hcmActualized = overlayHcmMarketingReportRowsFromOrders(hcmNorm, rowsOrdersHcm || []);
    const hcmDeduped = dedupeMktDetailReportRows(hcmActualized);
    for (const r of hnDeduped) {
      const m = mapMktReportRowToVirtual(r, 'hn');
      if (m) out.push(m);
    }
    for (const r of hcmDeduped) {
      const m = mapMktReportRowToVirtual(r, 'hcm');
      if (m) out.push(m);
    }
    return out;
  }, [rowsHn, rowsHcm, rowsOrdersHcm]);

  const bucketFromRow = useCallback((r) => {
    const src = String(r?.__ceo_source || '').toLowerCase();
    if (src === 'hcm') return 'hcm';
    if (src === 'hn') return 'hn';
    return 'other';
  }, []);

  const filterOptions = useMemo(() => {
    return {
      products: uniqueSorted(mappedAll, (r) => r.sanPham),
      markets: uniqueSorted(mappedAll, (r) => r.thiTruong),
      shifts: uniqueSorted(mappedAll, (r) => r.ca),
      teams: uniqueSorted(mappedAll, (r) => r.team),
    };
  }, [mappedAll]);

  // Init filter giống kiểu "Tất cả" của tab báo cáo chi tiết MKT: mặc định tick hết option có sẵn.
  useEffect(() => {
    if (didInitFiltersRef[0]) return;
    if (
      filterOptions.products.length === 0 &&
      filterOptions.markets.length === 0 &&
      filterOptions.shifts.length === 0 &&
      filterOptions.teams.length === 0
    ) {
      return;
    }
    setFilters({
      // Tick toàn bộ Ca giống tab "Báo cáo chi tiết" trên trang Báo cáo MKT.
      shifts: [...filterOptions.shifts],
      teams: [...filterOptions.teams],
      products: [...filterOptions.products],
      markets: [...filterOptions.markets],
    });
    didInitFiltersRef[1](true);
  }, [filterOptions.products, filterOptions.markets, filterOptions.shifts, filterOptions.teams, didInitFiltersRef]);

  // Khi options thay đổi sau khi đã init: giữ các value còn tồn tại, và auto-add value mới (để vẫn "tất cả").
  useEffect(() => {
    if (!didInitFiltersRef[0]) return;
    const prevAll = lastAllOptionsRef[0] || { shifts: [], teams: [], products: [], markets: [] };
    setFilters((prev) => {
      const reconcile = (prevSelected, allOptions, prevAllOptions) => {
        const allNorm = (allOptions || []).map((x) => normalizePickValue(x)).filter(Boolean);
        const allSet = new Set(allNorm);
        const prevSelNorm = (prevSelected || []).map((x) => normalizePickValue(x)).filter(Boolean);
        const kept = prevSelNorm.filter((x) => allSet.has(x));
        const wasAll = (prevAllOptions || []).length > 0 && prevSelNorm.length === (prevAllOptions || []).length;
        if (!wasAll) return kept;
        const keptSet = new Set(kept);
        const added = allNorm.filter((x) => !keptSet.has(x));
        return [...kept, ...added];
      };
      const next = {
        shifts: reconcile(prev.shifts, filterOptions.shifts, prevAll.shifts),
        teams: reconcile(prev.teams, filterOptions.teams, prevAll.teams),
        products: reconcile(prev.products, filterOptions.products, prevAll.products),
        markets: reconcile(prev.markets, filterOptions.markets, prevAll.markets),
      };
      if (
        arraysEqual(prev.shifts, next.shifts) &&
        arraysEqual(prev.teams, next.teams) &&
        arraysEqual(prev.products, next.products) &&
        arraysEqual(prev.markets, next.markets)
      ) {
        return prev;
      }
      return next;
    });
    lastAllOptionsRef[1]({
      shifts: (filterOptions.shifts || []).map((x) => normalizePickValue(x)).filter(Boolean),
      teams: (filterOptions.teams || []).map((x) => normalizePickValue(x)).filter(Boolean),
      products: (filterOptions.products || []).map((x) => normalizePickValue(x)).filter(Boolean),
      markets: (filterOptions.markets || []).map((x) => normalizePickValue(x)).filter(Boolean),
    });
  }, [filterOptions.products, filterOptions.markets, filterOptions.shifts, filterOptions.teams, didInitFiltersRef]);

  const allSelected = useMemo(() => {
    // Nếu allOptions rỗng => coi như "Tất cả" (không lọc theo nhóm đó) để tránh lọc sạch dữ liệu.
    const eqAll = (sel, all) => all.length === 0 || sel.length === all.length;
    return {
      shifts: eqAll(filters.shifts, filterOptions.shifts),
      teams: eqAll(filters.teams, filterOptions.teams),
      products: eqAll(filters.products, filterOptions.products),
      markets: eqAll(filters.markets, filterOptions.markets),
    };
  }, [filters, filterOptions]);

  const mappedFiltered = useMemo(() => {
    const productAll = allSelected.products;
    const marketAll = allSelected.markets;
    const caAll = allSelected.shifts;
    const teamAll = allSelected.teams;
    let base = filterRawData({
      rawData: mappedAll,
      isRestrictedView: false,
      allowedBranch: null,
      allowedTeam: null,
      allowedNames: [],
      allowedUserEmail: null,
      allowedPersonnelNames: null,
      startDateStr: globalFrom,
      endDateStr: globalTo,
      productAll,
      selectedProducts: productAll ? null : filters.products,
      caAll,
      selectedShifts: caAll ? null : filters.shifts,
      teamAll,
      selectedTeams: teamAll ? null : filters.teams,
      marketAll,
      selectedMarkets: marketAll ? null : filters.markets,
      nameAll: true,
      selectedNames: null,
      boPhanPick: '',
      chucVuPick: '',
    });
    if (branchPick === 'hcm') {
      base = base.filter((r) => bucketFromRow(r) === 'hcm');
    } else if (branchPick === 'hn') {
      base = base.filter((r) => bucketFromRow(r) === 'hn');
    }
    return base;
  }, [mappedAll, globalFrom, globalTo, filters, allSelected, branchPick, bucketFromRow]);

  const summary = useMemo(() => {
    const hcm = emptyAgg('HCM');
    const hn = emptyAgg('HN');

    for (const r of mappedFiltered) {
      const b = bucketFromRow(r);
      if (b === 'hcm') addRow(hcm, r);
      else if (b === 'hn') addRow(hn, r);
    }

    // Tổng = HCM + HN (đúng yêu cầu CEO; bỏ qua các dòng khác/không phân loại).
    const total = emptyAgg('Tổng');
    addAgg(total, hcm);
    addAgg(total, hn);

    const finalize = finalizeCeoAgg;

    return [finalize(total), finalize(hcm), finalize(hn)];
  }, [mappedFiltered, bucketFromRow]);

  const vanDonOrdersMapped = useMemo(() => {
    const out = [];
    for (const r of rowsOrdersHn || []) {
      const m = mapOrderRowToVanDonVirtual(r, 'HN');
      if (m) out.push(m);
    }
    for (const r of rowsOrdersHcm || []) {
      const m = mapOrderRowToVanDonVirtual(r, 'HCM');
      if (m) out.push(m);
    }
    return out;
  }, [rowsOrdersHn, rowsOrdersHcm]);

  const vanDonByBranch = useMemo(() => {
    const by = { HCM: [], HN: [] };
    for (const r of vanDonOrdersMapped) {
      const b = String(r?.__ceo_branch || 'HN').toUpperCase() === 'HCM' ? 'HCM' : 'HN';
      by[b].push(r);
    }
    const rows = [
      { label: 'HCM', m: aggregateVanHanhSlice(by.HCM) },
      { label: 'HN', m: aggregateVanHanhSlice(by.HN) },
    ];
    const total = aggregateVanHanhSlice(vanDonOrdersMapped);
    return { rows, total };
  }, [vanDonOrdersMapped]);

  const ceoVizModels = useMemo(() => {
    const rows = mappedFiltered || [];
    const nestedGrouped = buildCeoNestedGroupedBarModel(rows);
    let hnRev = 0;
    let hcmRev = 0;
    for (const r of rows) {
      const src = String(r?.__ceo_source || '').toLowerCase();
      const v = Number(r?.doanhThuChotThucTe || 0);
      if (src === 'hn') hnRev += v;
      else if (src === 'hcm') hcmRev += v;
    }
    const byMarket = topNWithOther(aggregateRevenuePairs(rows, (r) => r.thiTruong), CEO_REV_CHART_TOP_N);
    const byProduct = topNWithOther(aggregateRevenuePairs(rows, (r) => r.sanPham), CEO_REV_CHART_TOP_N);
    return { nestedGrouped, branchPie: { hnRev, hcmRev }, byMarket, byProduct };
  }, [mappedFiltered]);

  const ceoMainBarData = useMemo(
    () => ({
      labels: ceoVizModels.nestedGrouped.labels,
      datasets: ceoVizModels.nestedGrouped.datasets,
    }),
    [ceoVizModels]
  );

  const ceoMainBarPlugins = useMemo(
    () =>
      createCeoMainGroupedBarPlugins({
        categoryTotals: ceoVizModels.nestedGrouped.categoryTotals,
        dividerAfterIndex: ceoVizModels.nestedGrouped.dividerAfterIndex,
        categoryZoneFills: ceoVizModels.nestedGrouped.categoryZoneFills,
      }),
    [ceoVizModels]
  );

  const ceoMainBarOptions = useMemo(() => {
    const totals = ceoVizModels.nestedGrouped.categoryTotals;
    const maxY = Math.max(1, ...totals.map((t) => Number(t || 0)));
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      datasets: {
        bar: {
          categoryPercentage: 0.98,
          barPercentage: 0.98,
        },
      },
      plugins: {
        datalabels: {
          display: (ctx) => Number(ctx?.parsed?.y ?? 0) > 0,
          anchor: 'end',
          align: 'end',
          offset: -2,
          formatter: (ctx) => formatAxisMoneyShort(Number(ctx?.parsed?.y ?? 0)),
          color: '#0f172a',
          backgroundColor: 'rgba(255,255,255,0.82)',
          borderRadius: 4,
          padding: { top: 2, right: 4, bottom: 2, left: 4 },
          font: { size: 10, weight: '700' },
          clamp: true,
        },
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 10,
            padding: 10,
            font: { size: 11 },
            usePointStyle: true,
            pointStyle: 'rect',
          },
        },
        tooltip: {
          filter: (item) => Number(item.raw || 0) !== 0,
          callbacks: {
            label: (ctx) => {
              const name = ctx.dataset?.label || '';
              return ` ${name}: ${formatCurrency(Number(ctx.raw || 0))}`;
            },
            footer: (items) => {
              const idx = items[0]?.dataIndex;
              if (idx == null) return '';
              return `Tổng (các SP hiển thị): ${formatCurrency(Number(totals[idx] || 0))}`;
            },
          },
        },
      },
      layout: { padding: { top: 20, left: 2, right: 6, bottom: 2 } },
      scales: {
        x: {
          stacked: false,
          ticks: {
            maxRotation: 40,
            minRotation: 0,
            autoSkip: false,
            font: { size: 10 },
          },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          suggestedMax: maxY * 1.1,
          ticks: {
            callback: (v) => formatAxisMoneyShort(v),
          },
          grid: { color: 'rgba(148, 163, 184, 0.25)' },
        },
      },
    };
  }, [ceoVizModels]);

  const ceoMainBarScrollWidth = useMemo(() => {
    const n = ceoVizModels.nestedGrouped.categoryCount || 0;
    return Math.max(400, n * CEO_MAIN_BAR_MIN_PX_PER_CATEGORY);
  }, [ceoVizModels]);

  const ceoDoughnutData = useMemo(() => {
    const { hnRev, hcmRev } = ceoVizModels.branchPie;
    return {
      labels: ['Hà Nội', 'HCM'],
      datasets: [
        {
          data: [hnRev, hcmRev],
          backgroundColor: ['#2563eb', '#16a34a'],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    };
  }, [ceoVizModels]);

  const ceoDoughnutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        datalabels: { display: false },
        legend: { position: 'bottom', labels: { font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = Number(ctx.raw || 0);
              const arr = ctx.chart?.data?.datasets?.[0]?.data || [];
              const sum = arr.reduce((a, b) => a + Number(b || 0), 0);
              const pct = sum ? ((v / sum) * 100).toFixed(1) : '0.0';
              return ` ${formatCurrency(v)} (${pct}%)`;
            },
          },
        },
      },
    }),
    []
  );

  const ceoMarketRankBarData = useMemo(() => {
    const pairs = ceoVizModels.byMarket;
    const labels = pairs.map(([k]) => k);
    const data = pairs.map(([, v]) => Number(v || 0));
    const marketColors = ceoVizModels.nestedGrouped.marketColorByName;
    const bg = labels.map((k) => marketColors.get(k) || '#64748b');
    return {
      labels,
      datasets: [
        {
          label: 'DS Chốt (TT)',
          data,
          backgroundColor: bg,
          borderWidth: 1,
        },
      ],
    };
  }, [ceoVizModels]);

  const ceoMarketRankBarOptions = useMemo(
    () => ({
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        datalabels: {
          display: (ctx) => Number(ctx?.parsed?.x ?? 0) > 0,
          anchor: 'end',
          align: 'end',
          offset: 4,
          formatter: (ctx) => formatAxisMoneyShort(Number(ctx?.parsed?.x ?? 0)),
          color: '#0f172a',
          backgroundColor: 'rgba(255,255,255,0.82)',
          borderRadius: 4,
          padding: { top: 2, right: 4, bottom: 2, left: 4 },
          font: { size: 10, weight: '700' },
          clamp: true,
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${formatCurrency(Number(ctx.raw || 0))}`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback: (v) => formatAxisMoneyShort(v),
          },
        },
      },
    }),
    []
  );

  const ceoProductRankBarData = useMemo(() => {
    const pairs = ceoVizModels.byProduct;
    const labels = pairs.map(([k]) => k);
    const data = pairs.map(([, v]) => Number(v || 0));
    const palette = ceoMarketColorByName(labels);
    const bg = labels.map((k) => palette.get(k) || '#64748b');
    return {
      labels,
      datasets: [
        {
          label: 'DS Chốt (TT)',
          data,
          backgroundColor: bg,
          borderWidth: 1,
        },
      ],
    };
  }, [ceoVizModels]);

  // Đã bỏ phần bảng theo ngày theo yêu cầu.

  return (
    <div className="h-full min-h-0 w-full min-w-0 overflow-x-hidden overflow-y-auto">
      {/* Dashboard quản trị bọc TabsContent bằng overflow-hidden; tab CEO cần tự tạo vùng scroll. */}
      <div
        className="bao-cao-sale-container ceo-panel-root relative"
        style={{ minHeight: 'auto', padding: 12 }}
      >
        {loading && (
          <div className="loading-overlay loading-overlay--panel-scoped">Đang tải dữ liệu...</div>
        )}

        <div className="report-container">
          <div className="sidebar ceo-panel-sidebar" style={{ overscrollBehavior: 'contain' }}>
          <FilterHeader title="Bộ lọc" />

          <label style={labelStyle}>
            Chọn nhánh:
            <select
              value={branchPick}
              onChange={(e) => setBranchPick(e.target.value)}
              style={selectStyle}
            >
              <option value="all">-- Chọn nhánh --</option>
              <option value="all">Tổng</option>
              <option value="hcm">HCM</option>
              <option value="hn">HN</option>
            </select>
          </label>

          <label style={labelStyle}>
            Từ ngày:
            <input
              type="date"
              value={globalFrom || ''}
              disabled={typeof onChangeFrom !== 'function'}
              onChange={(e) => onChangeFrom?.(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Đến ngày:
            <input
              type="date"
              value={globalTo || ''}
              disabled={typeof onChangeTo !== 'function'}
              onChange={(e) => onChangeTo?.(e.target.value)}
              style={inputStyle}
            />
          </label>

          {error && (
            <div style={{ marginBottom: '10px', padding: '8px', border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: '6px', fontSize: '12px' }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: '10px' }}>
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition flex items-center gap-2"
              title="Tải lại dữ liệu theo khoảng ngày trên Dashboard"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Tải lại
            </button>
          </div>

          <FilterHeader title="Sản phẩm" />
          <CheckboxList
            values={filterOptions.products}
            selected={filters.products}
            allChecked={allSelected.products}
            onToggleAll={(checked) => setFilters((prev) => ({ ...prev, products: checked ? [...filterOptions.products] : [] }))}
            onToggle={(v) => setFilters((prev) => ({ ...prev, products: toggleInList(prev.products, v) }))}
            emptyLabel="Chưa có giá trị Sản phẩm trong dữ liệu đã tải"
          />

          <FilterHeader title="Thị trường" />
          <CheckboxList
            values={filterOptions.markets}
            selected={filters.markets}
            allChecked={allSelected.markets}
            onToggleAll={(checked) => setFilters((prev) => ({ ...prev, markets: checked ? [...filterOptions.markets] : [] }))}
            onToggle={(v) => setFilters((prev) => ({ ...prev, markets: toggleInList(prev.markets, v) }))}
            emptyLabel="Chưa có giá trị Thị trường trong dữ liệu đã tải"
          />

          <FilterHeader title="Ca" />
          <CheckboxList
            values={filterOptions.shifts}
            selected={filters.shifts}
            allChecked={allSelected.shifts}
            onToggleAll={(checked) => setFilters((prev) => ({ ...prev, shifts: checked ? [...filterOptions.shifts] : [] }))}
            onToggle={(v) => setFilters((prev) => ({ ...prev, shifts: toggleInList(prev.shifts, v) }))}
            emptyLabel="Chưa có giá trị Ca trong dữ liệu đã tải"
          />

          <FilterHeader title="Team" />
          <CheckboxList
            values={filterOptions.teams}
            selected={filters.teams}
            allChecked={allSelected.teams}
            onToggleAll={(checked) => setFilters((prev) => ({ ...prev, teams: checked ? [...filterOptions.teams] : [] }))}
            onToggle={(v) => setFilters((prev) => ({ ...prev, teams: toggleInList(prev.teams, v) }))}
            emptyLabel="Chưa có giá trị Team trong dữ liệu đã tải"
          />
          </div>

          <div className="main-detailed">
          <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h2>BÁO CÁO CEO</h2>
            <div style={{ fontSize: '12px', color: '#666' }}>
              Tải được: <strong>{rowsHn.length}</strong> (HN) + <strong>{rowsHcm.length}</strong> (HCM)
            </div>
          </div>

            <section style={{ marginTop: 8, marginBottom: 28 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '1.1em' }}>Sơ đồ tổng — phân bổ doanh thu chi tiết (cột ghép)</h3>
              <div
                className="ceo-nested-bar-scroll"
                style={{
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  WebkitOverflowScrolling: 'touch',
                  marginBottom: 4,
                  maxWidth: '100%',
                }}
              >
                <div style={{ width: ceoMainBarScrollWidth, minWidth: '100%', height: 520 }}>
                  {ceoVizModels.nestedGrouped.categoryCount === 0 ? (
                    <div style={{ padding: 24, color: '#888' }}>Không có dữ liệu sau lọc.</div>
                  ) : (
                    <Bar data={ceoMainBarData} options={ceoMainBarOptions} plugins={ceoMainBarPlugins} />
                  )}
                </div>
              </div>
            </section>

            <div className="ceo-charts-grid-below" style={{ marginBottom: 28 }}>
              <section className="ceo-chart-cell ceo-chart-cell--branch">
                <h3 style={{ margin: '0 0 8px', fontSize: '1.1em' }}>Cơ cấu doanh thu theo chi nhánh</h3>
                <div
                  className="ceo-chart-doughnut-wrap"
                  style={{ height: 300, maxWidth: 360, margin: '0 auto' }}
                >
                  {ceoVizModels.branchPie.hnRev + ceoVizModels.branchPie.hcmRev <= 0 ? (
                    <div style={{ padding: 24, color: '#888', textAlign: 'center' }}>Không có dữ liệu sau lọc.</div>
                  ) : (
                    <Doughnut data={ceoDoughnutData} options={ceoDoughnutOptions} />
                  )}
                </div>
              </section>

              <section className="ceo-chart-cell ceo-chart-cell--market">
                <h3 style={{ margin: '0 0 8px', fontSize: '1.1em' }}>Xếp hạng doanh thu theo thị trường (toàn quốc)</h3>
                <div style={{ height: Math.min(520, 40 + ceoVizModels.byMarket.length * 36), minHeight: 200 }}>
                  {ceoVizModels.byMarket.length === 0 ? (
                    <div style={{ padding: 24, color: '#888' }}>Không có dữ liệu sau lọc.</div>
                  ) : (
                    <Bar data={ceoMarketRankBarData} options={ceoMarketRankBarOptions} />
                  )}
                </div>
              </section>

              <section className="ceo-chart-cell ceo-chart-cell--product">
                <h3 style={{ margin: '0 0 8px', fontSize: '1.1em' }}>Xếp hạng doanh thu theo sản phẩm (toàn quốc)</h3>
                <div style={{ height: Math.min(520, 40 + ceoVizModels.byProduct.length * 36), minHeight: 200 }}>
                  {ceoVizModels.byProduct.length === 0 ? (
                    <div style={{ padding: 24, color: '#888' }}>Không có dữ liệu sau lọc.</div>
                  ) : (
                    <Bar data={ceoProductRankBarData} options={ceoMarketRankBarOptions} />
                  )}
                </div>
              </section>
            </div>

            <div style={{ marginTop: 22, marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: '1.05em' }}>Toàn bộ (theo bộ lọc)</h3>
              <div
                className="table-responsive-container ceo-kpi-table-wrap"
                style={{
                  borderRadius: 8,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: 'rgba(248, 250, 252, 0.85)',
                }}
              >
                <table className="ceo-kpi-table">
                  <thead>
                    <tr>
                      <th className="text-left">Khu vực</th>
                      <th>Số Mess</th>
                      <th>CPQC</th>
                      <th>Số Đơn</th>
                      <th>DS Chốt</th>
                      <th>DS Chốt (TT)</th>
                      <th>Số Đơn (TT)</th>
                      <th>Tỉ lệ chốt (TT)</th>
                      <th>Giá Mess</th>
                      <th>CPS</th>
                      <th>%CP/DS</th>
                      <th>Giá TB Đơn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((a) => (
                      <tr key={a.label} className={a.label === 'Tổng' ? 'total-row' : ''}>
                        <td className={a.label === 'Tổng' ? 'total-label' : 'text-left'}>{a.label}</td>
                        <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatNumber(a.mess)}</td>
                        <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatCurrency(a.cpqc)}</td>
                        <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatNumber(a.soDonForTiLeChot)}</td>
                        <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatCurrency(a.doanhSoForCpDs)}</td>
                        <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatCurrency(a.doanhSoTT)}</td>
                        <td className={a.label === 'Tổng' ? 'total-value' : ''}>
                          {formatNumber(a.soDonTT)}
                        </td>
                        <td style={warnStyle(chotKind(a.soDonTT, a.mess))} className={a.label === 'Tổng' ? 'total-value' : ''}>
                          {pct(a.soDonTT, a.mess)}
                        </td>
                        <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatCurrency(a.giaMess)}</td>
                        <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatCurrency(a.cps)}</td>
                        <td style={warnStyle(cpOverDsKind(a.cpqc, a.doanhSoForCpDs))} className={a.label === 'Tổng' ? 'total-value' : ''}>
                          {pct(a.cpqc, a.doanhSoForCpDs)}
                        </td>
                        <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatCurrency(a.giaTbDon)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ marginTop: 18 }}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>Vận đơn (orders)</h3>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                Đã tải: <strong>{rowsOrdersHn.length}</strong> (HN: <code>orders</code>) +{' '}
                <strong>{rowsOrdersHcm.length}</strong> (HCM: <code>order_code_hcm</code>) — theo <code>order_date</code>,{' '}
                {globalFrom} → {globalTo}
              </div>

              <div className="table-responsive-container">
                <table>
                  <thead>
                    <tr>
                      <th className="text-left">Khu vực</th>
                      <th>Tổng đơn</th>
                      <th>OK</th>
                      <th>Huỷ</th>
                      <th>Sau huỷ</th>
                      <th>Lên VH</th>
                      <th>Có mã</th>
                      <th>Đang giao</th>
                      <th>Giao TC</th>
                      <th>Có bill</th>
                      <th>%Thu/TC</th>
                      <th>Tổng tiền (VND)</th>
                      <th>Tiền đã thu (bill)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="total-row">
                      <td className="total-label text-left">Tổng</td>
                      <td className="total-value">{formatSlVi(vanDonByBranch.total.tongLenDon)}</td>
                      <td className="total-value">{formatSlVi(vanDonByBranch.total.ok)}</td>
                      <td className="total-value">{formatSlVi(vanDonByBranch.total.huyCheck)}</td>
                      <td className="total-value">{formatSlVi(vanDonByBranch.total.sauHuy)}</td>
                      <td className="total-value">{formatSlVi(vanDonByBranch.total.donDayVanHanh)}</td>
                      <td className="total-value">{formatSlVi(vanDonByBranch.total.coMa)}</td>
                      <td className="total-value">{formatSlVi(vanDonByBranch.total.dangGiao)}</td>
                      <td className="total-value">{formatSlVi(vanDonByBranch.total.giaoTC)}</td>
                      <td className="total-value">{formatSlVi(vanDonByBranch.total.donCoBill)}</td>
                      <td className="total-value">{formatPct(vanDonByBranch.total.donCoBill, vanDonByBranch.total.giaoTC)}</td>
                      <td className="total-value">{formatCurrency(vanDonByBranch.total.tongLenDonAmount)}</td>
                      <td className="total-value">{formatCurrency(vanDonByBranch.total.donCoBillAmount)}</td>
                    </tr>
                    {vanDonByBranch.rows.map(({ label, m }) => (
                      <tr key={label}>
                        <td className="text-left">{label}</td>
                        <td>{formatSlVi(m.tongLenDon)}</td>
                        <td>{formatSlVi(m.ok)}</td>
                        <td>{formatSlVi(m.huyCheck)}</td>
                        <td>{formatSlVi(m.sauHuy)}</td>
                        <td>{formatSlVi(m.donDayVanHanh)}</td>
                        <td>{formatSlVi(m.coMa)}</td>
                        <td>{formatSlVi(m.dangGiao)}</td>
                        <td>{formatSlVi(m.giaoTC)}</td>
                        <td>{formatSlVi(m.donCoBill)}</td>
                        <td>{formatPct(m.donCoBill, m.giaoTC)}</td>
                        <td>{formatCurrency(m.tongLenDonAmount)}</td>
                        <td>{formatCurrency(m.donCoBillAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

        </div>
      </div>
    </div>
    </div>
  );
}

function mergeKeepAndAddNew(prevSelected, allOptions) {
  const normAll = (allOptions || []).map((x) => normalizePickValue(x)).filter(Boolean);
  const allSet = new Set(normAll);
  const kept = (prevSelected || []).map((x) => normalizePickValue(x)).filter((x) => allSet.has(x));
  const keptSet = new Set(kept);
  const added = normAll.filter((x) => !keptSet.has(x));
  return [...kept, ...added];
}

const labelStyle = { display: 'block', margin: '12px 0', fontSize: '0.95em', color: 'var(--text-medium)', fontWeight: 500 };
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', margin: '6px 0 12px', border: '1px solid var(--border-color)', borderRadius: 6, fontWeight: 500, fontSize: '0.95em' };
const selectStyle = { ...inputStyle, background: '#f3f4f6' };

function FilterHeader({ title }) {
  return <h3 style={{ marginTop: 16 }}>{title}</h3>;
}

function CheckboxList({ values, selected, allChecked, onToggleAll, onToggle, emptyLabel }) {
  const selectedSet = new Set((selected || []).map((x) => normalizePickValue(x)).filter(Boolean));
  return (
    <div style={{ marginTop: 8 }}>
      <label style={{ display: 'block', marginBottom: 8, fontSize: 12, cursor: 'pointer' }}>
        <input type="checkbox" style={{ marginRight: 6 }} checked={allChecked} onChange={(e) => onToggleAll(e.target.checked)} />
        Tất cả
      </label>
      <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 6, padding: 8, background: '#fff' }}>
        {values.length === 0 ? (
          <div style={{ fontSize: 12, color: '#999' }}>{emptyLabel}</div>
        ) : (
          values.map((v) => (
            <label key={v} style={{ display: 'block', marginBottom: 6, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                style={{ marginRight: 6 }}
                checked={selectedSet.has(normalizePickValue(v))}
                onChange={() => onToggle(v)}
              />
              {v}
            </label>
          ))
        )}
      </div>
    </div>
  );
}

