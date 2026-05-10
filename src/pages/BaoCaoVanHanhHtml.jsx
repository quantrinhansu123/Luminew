import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import MultiSelect from '../components/MultiSelect';
import * as rbacService from '../services/rbacService';
import { supabase } from '../supabase/config';
import { formatBaoCaoVanDonStatusHistogram, isGiaoHangHistogramSyntheticKey } from '../utils/baoCaoVanDonFormat';
import { buildBaoCaoVanHanhMatrix, formatPct, formatSlVi } from '../utils/baoCaoVanDonMarketMatrix';
import {
    buildPushDonByDayMatrix,
    buildPushDonByDayMatrixFromFfmLogs,
    buildTrangThaiDonByDay,
    isoToViDisplay
} from '../utils/baoCaoVanHanhTabsData';
import {
    aggregateOperationalReportSlice,
    BC_VH_PAYMENT_COLUMNS,
    bcvhDrillMetricTitle,
    filterSliceByBcvhDrillMetric,
    filterSliceForCriteriaRow,
    formatNumVi,
    formatPctComma
} from '../utils/baoCaoVanDonOperationalReport';
import { parseDashboardGlobalDateMessage, readDashboardGlobalDateRange } from '../utils/dashboardGlobalDateRange';
import * as XLSX from 'xlsx';
import './BaoCaoVanHanh.css';

const formatDateForInput = (date) => {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** SP/TT trên dòng BC VH: luôn dùng mảng (tương thích localStorage chuỗi cũ). */
function normalizeBcvhPmArrays(product, market) {
    const pa = Array.isArray(product)
        ? product.map((x) => String(x).trim()).filter(Boolean)
        : product != null && String(product).trim() !== ''
          ? [String(product).trim()]
          : [];
    const ma = Array.isArray(market)
        ? market.map((x) => String(x).trim()).filter(Boolean)
        : market != null && String(market).trim() !== ''
          ? [String(market).trim()]
          : [];
    return { product: pa, market: ma };
}

/** Hai mảng chọn (bỏ thứ tự) có cùng tập giá trị. */
function bcvhSelectedSetsEqual(sel, globalArr) {
    const g = [...globalArr].map(String).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));
    const s = [...sel].map(String).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));
    if (g.length !== s.length) return false;
    return g.every((x, i) => x === s[i]);
}

/**
 * SP/TT hiệu lực trên dòng BC VH = bộ lọc trang (Mặt hàng / khu vực khi Tìm) + lọc trên dòng.
 * Dòng để trống SP/TT → kế thừa toàn bộ phần đang lọc ở trang (nếu có).
 */
function getEffectiveBcvhPmForRow(reportFilters, row) {
    const rowPm = normalizeBcvhPmArrays(row.product, row.market);
    const gP = Array.isArray(reportFilters?.product) ? reportFilters.product.map(String).filter(Boolean) : [];
    const gM = Array.isArray(reportFilters?.market) ? reportFilters.market.map(String).filter(Boolean) : [];

    let effP;
    if (gP.length > 0) {
        effP = rowPm.product.length > 0 ? rowPm.product.filter((x) => gP.includes(String(x))) : [...gP];
    } else {
        effP = [...rowPm.product];
    }

    let effM;
    if (gM.length > 0) {
        effM = rowPm.market.length > 0 ? rowPm.market.filter((x) => gM.includes(String(x))) : [...gM];
    } else {
        effM = [...rowPm.market];
    }

    return { product: effP, market: effM };
}

/** Chuỗi chọn trên MultiSelect → giá trị lưu trên dòng ([] = dùng hết bộ lọc trang). */
function decodeBcvhRowProductFromUi(sel, globalProduct) {
    const g = Array.isArray(globalProduct) ? globalProduct.map(String).filter(Boolean) : [];
    if (g.length === 0) return [...sel].map(String).filter(Boolean);
    const filtered = [...sel].map(String).filter(Boolean).filter((x) => g.includes(x));
    if (bcvhSelectedSetsEqual(filtered, g)) return [];
    return filtered;
}

function decodeBcvhRowMarketFromUi(sel, globalMarket) {
    const g = Array.isArray(globalMarket) ? globalMarket.map(String).filter(Boolean) : [];
    if (g.length === 0) return [...sel].map(String).filter(Boolean);
    const filtered = [...sel].map(String).filter(Boolean).filter((x) => g.includes(x));
    if (bcvhSelectedSetsEqual(filtered, g)) return [];
    return filtered;
}

function getBcvhCriteriaSlice(rawData, reportFilters, row) {
    const rowPm = normalizeBcvhPmArrays(row.product, row.market);
    const gP = Array.isArray(reportFilters?.product) ? reportFilters.product.map(String).filter(Boolean) : [];
    const gM = Array.isArray(reportFilters?.market) ? reportFilters.market.map(String).filter(Boolean) : [];
    if (gP.length > 0 && rowPm.product.length > 0 && !rowPm.product.some((x) => gP.includes(String(x)))) {
        return [];
    }
    if (gM.length > 0 && rowPm.market.length > 0 && !rowPm.market.some((x) => gM.includes(String(x)))) {
        return [];
    }
    const eff = getEffectiveBcvhPmForRow(reportFilters, row);
    return filterSliceForCriteriaRow(rawData, {
        startDate: row.startDate,
        endDate: row.endDate,
        product: eff.product,
        market: eff.market
    });
}

const newBcvhRowId = () =>
    `bcvh-${
        typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    }`;

const TABS = ['tab1', 'tab2', 'tab3', 'tab4', 'tab5'];
const BCVH_CRITERIA_STORAGE_KEY = 'bao_cao_van_hanh_tab2_criteria_v1';
/** Tổng số dòng (dòng tiêu chí auto + dòng thêm tay). */
const MAX_BCVH_ROWS_TOTAL = 60;

/** Preset «Chọn nhanh» → khoảng ngày (local). */
function computePresetDateRange(dateRangeKey) {
    if (!dateRangeKey) return null;
    const now = new Date();
    const year = now.getFullYear();
    let start;
    let end;
    switch (dateRangeKey) {
        case 'last10Days':
            start = new Date(now);
            start.setDate(now.getDate() - 9);
            end = new Date(now);
            break;
        case 'last3Days':
            start = new Date(now);
            start.setDate(now.getDate() - 3);
            end = new Date(now);
            break;
        case 'thisWeek': {
            const day = now.getDay() || 7;
            start = new Date(now);
            start.setDate(now.getDate() - day + 1);
            end = new Date(start);
            end.setDate(start.getDate() + 6);
            break;
        }
        case 'lastWeek': {
            const day = now.getDay() || 7;
            start = new Date(now);
            start.setDate(now.getDate() - day - 6);
            end = new Date(start);
            end.setDate(start.getDate() + 6);
            break;
        }
        case 'thisMonth':
            start = new Date(year, now.getMonth(), 1);
            end = new Date(year, now.getMonth() + 1, 0);
            break;
        default:
            if (dateRangeKey.startsWith('month_')) {
                const m = parseInt(dateRangeKey.split('_')[1], 10) - 1;
                start = new Date(year, m, 1);
                end = new Date(year, m + 1, 0);
            } else if (dateRangeKey.startsWith('quarter_')) {
                const q = parseInt(dateRangeKey.split('_')[1], 10);
                start = new Date(year, (q - 1) * 3, 1);
                end = new Date(year, (q - 1) * 3 + 3, 0);
            }
    }
    if (!start || !end) return null;
    return { start, end };
}

function bcvhPmConfigKey(pm) {
    const p = [...pm.product].map(String).sort((a, b) => a.localeCompare(b, 'vi')).join('\0');
    const m = [...pm.market].map(String).sort((a, b) => a.localeCompare(b, 'vi')).join('\0');
    return `${p}\n${m}`;
}

/**
 * Mỗi dòng auto = cả khoảng Từ–Đến; gom theo tổ hợp SP/TT (bỏ trùng).
 */
function reconcileAutoBcvhRowsToDateRange(prevAutoRows, newStart, newEnd, idFactory) {
    /** @type {Map<string, { product: string[]; market: string[] }>} */
    const byPm = new Map();
    for (const r of prevAutoRows) {
        if (r?.isManual) continue;
        const pm = normalizeBcvhPmArrays(r.product, r.market);
        const k = bcvhPmConfigKey(pm);
        if (!byPm.has(k)) byPm.set(k, pm);
    }
    if (byPm.size === 0) {
        return [
            {
                id: idFactory(),
                startDate: newStart,
                endDate: newEnd,
                product: [],
                market: [],
                isManual: false
            }
        ];
    }
    return [...byPm.values()].map((pm) => ({
        id: idFactory(),
        startDate: newStart,
        endDate: newEnd,
        product: [...pm.product],
        market: [...pm.market],
        isManual: false
    }));
}

/** Khôi phục dòng auto từ localStorage — ngày trên dòng = khoảng Từ–Đến hiện tại, giữ tổ hợp SP/TT. */
function buildInitialAutoBcvhRowsFromStorage(startIso, endIso, idFactory, parsed) {
    /** @type {Map<string, { product: string[]; market: string[] }>} */
    const byPm = new Map();
    try {
        if (Array.isArray(parsed)) {
            for (const item of parsed) {
                if (item?.isManual) continue;
                const pm = normalizeBcvhPmArrays(item?.product, item?.market);
                const k = bcvhPmConfigKey(pm);
                if (!byPm.has(k)) byPm.set(k, pm);
            }
        }
    } catch {
        // ignore
    }
    if (byPm.size === 0) {
        return [
            {
                id: idFactory(),
                startDate: startIso,
                endDate: endIso,
                product: [],
                market: [],
                isManual: false
            }
        ];
    }
    return [...byPm.values()].map((pm) => ({
        id: idFactory(),
        startDate: startIso,
        endDate: endIso,
        product: [...pm.product],
        market: [...pm.market],
        isManual: false
    }));
}

/** Từ bulk SP/TT → danh sách tổ hợp lọc (mỗi phần tử = một dòng trên bảng, một khoảng Từ–Đến). */
function buildBcvhBulkFilterTuples(pIn, mIn) {
    const p = [...pIn];
    const m = [...mIn];
    const tuples = [];
    if (p.length > 0 && m.length > 0) {
        for (const pi of p) {
            for (const mj of m) {
                tuples.push({ product: [pi], market: [mj] });
            }
        }
    } else if (p.length > 0) {
        for (const pi of p) {
            tuples.push({ product: [pi], market: [...m] });
        }
    } else if (m.length > 0) {
        for (const mj of m) {
            tuples.push({ product: [...p], market: [mj] });
        }
    }
    return tuples;
}

/**
 * Gộp dòng auto từ SP/TT hàng loạt + giữ dòng tay (cùng logic «Tạo dòng từ lựa chọn»).
 * Trả về null nếu khoảng ngày không hợp lệ.
 */
function computeBcvhCriteriaAfterBulkApply(prevCriteriaRows, bulkP, bulkM, start, end, idFactory = newBcvhRowId) {
    const startY = String(start || '').slice(0, 10);
    const endY = String(end || '').slice(0, 10);
    if (!YMD_RE.test(startY) || !YMD_RE.test(endY) || startY > endY) return null;

    const p = [...bulkP];
    const m = [...bulkM];
    const manual = prevCriteriaRows.filter((r) => r.isManual);
    const cap = Math.max(0, MAX_BCVH_ROWS_TOTAL - manual.length);

    let autoRows;
    if (p.length === 0 && m.length === 0) {
        autoRows = [
            {
                id: idFactory(),
                startDate: startY,
                endDate: endY,
                product: [],
                market: [],
                isManual: false
            }
        ];
    } else {
        const tuples = buildBcvhBulkFilterTuples(p, m);
        if (tuples.length === 0) return null;
        autoRows = [];
        for (const t of tuples) {
            if (autoRows.length >= cap) break;
            autoRows.push({
                id: idFactory(),
                startDate: startY,
                endDate: endY,
                product: [...t.product],
                market: [...t.market],
                isManual: false
            });
        }
    }
    return [...autoRows, ...manual];
}

function createInitialBcvhDailyRows(urlStartDate, urlEndDate, inIframeFlag) {
    let start = String(urlStartDate || '').slice(0, 10);
    let end = String(urlEndDate || '').slice(0, 10);
    if (!YMD_RE.test(start) || !YMD_RE.test(end)) {
        if (inIframeFlag && typeof window !== 'undefined') {
            const g = readDashboardGlobalDateRange();
            if (g?.from && g?.to) {
                start = g.from.slice(0, 10);
                end = g.to.slice(0, 10);
            }
        }
    }
    if (!YMD_RE.test(start) || !YMD_RE.test(end)) {
        const endD = new Date();
        const startD = new Date();
        startD.setDate(endD.getDate() - 9);
        start = formatDateForInput(startD);
        end = formatDateForInput(endD);
    }
    let parsed = null;
    try {
        if (typeof window !== 'undefined') {
            const raw = window.localStorage.getItem(BCVH_CRITERIA_STORAGE_KEY);
            if (raw) parsed = JSON.parse(raw);
        }
    } catch {
        parsed = null;
    }
    let rows = buildInitialAutoBcvhRowsFromStorage(start, end, newBcvhRowId, parsed);
    if (rows.length > MAX_BCVH_ROWS_TOTAL) {
        rows = rows.slice(0, MAX_BCVH_ROWS_TOTAL);
    }
    try {
        if (!Array.isArray(parsed)) return rows;
        const manual = parsed
            .filter((item) => item?.isManual)
            .map((item) => {
                const pm = normalizeBcvhPmArrays(item?.product, item?.market);
                return {
                    id: newBcvhRowId(),
                    startDate: String(item?.startDate || '').slice(0, 10),
                    endDate: String(item?.endDate || '').slice(0, 10),
                    product: pm.product,
                    market: pm.market,
                    isManual: true
                };
            })
            .filter((r) => YMD_RE.test(r.startDate) && YMD_RE.test(r.endDate));
        const cap = Math.max(0, MAX_BCVH_ROWS_TOTAL - rows.length);
        return [...rows, ...manual.slice(0, cap)];
    } catch {
        return rows;
    }
}

const normalizeYmd = (value) => {
    if (!value) return '';
    const s = String(value).trim();
    if (!s) return '';
    if (s.includes('T')) return s.slice(0, 10);
    return s.slice(0, 10);
};

/** Có mã tracking / ĐVVC: không tính chỉ khoảng trắng (NBSP → space rồi trim). */
const meaningfulTrim = (value) =>
    String(value ?? '')
        .replace(/\u00a0/g, ' ')
        .trim();

/** Không tính đơn chi nhánh `team = HCM` (cột `orders.team`), so khớp các tab dùng `rawData`. */
const isOrdersRowTeamHcm = (row) => String(row?.team ?? '').trim().toLowerCase() === 'hcm';

/**
 * Tiền đơn cho báo cáo (Tab1 «Đơn có mã», v.v.) — khớp `orders.van_don_line_total_vnd`:
 * coalesce(nullif(tong_tien_vnd, 0), total_amount_vnd, sale_price, goods_amount, 0).
 * Trước đây `tong_tien_vnd === 0` vẫn được dùng → bỏ qua total_amount_vnd → sai tổng tiền.
 */
function sqlCoalesceNumbers(...vals) {
    for (const v of vals) {
        if (v == null || v === '') continue;
        const n = Number(v);
        if (!Number.isNaN(n)) return n;
    }
    return 0;
}

function resolveVanDonDisplayTotalVnd(row) {
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

const paymentLabelForOrder = (order) => {
    const d = String(order?.payment_status_detail ?? '').trim();
    if (d) return d;
    return String(order?.payment_status ?? '').trim();
};

const paymentLabelIsCoBillOnly = (label) => {
    const s = String(label ?? '').trim().toLowerCase();
    if (!s) return false;
    if (s.includes('1 phần') && s.includes('bill')) return false;
    return s.includes('có bill');
};

const mapOrderRowToVirtual = (row) => {
    const deliveryLabelRaw = String(row?.delivery_status_nb ?? row?.delivery_status ?? '').trim();
    const deliveryLabel = deliveryLabelRaw || '(Trống)';
    const safeDeliveryLabel = isGiaoHangHistogramSyntheticKey(deliveryLabel) ? '(Trống)' : deliveryLabel;
    const paymentLabelRaw = paymentLabelForOrder(row);
    const paymentLabel = paymentLabelRaw || '(Trống)';
    const tongTienVnd = Number(row?.total_amount_vnd) || 0;
    const tongTienCoMaRaw = row?.tong_tien_vnd ?? row?.tong_tien_VND;
    /** Tab1 «Đơn có mã» / tổng tiền đơn: khớp nullif(tong_tien_vnd,0) + coalesce (xem resolveVanDonDisplayTotalVnd). */
    const tongTienCoMa = resolveVanDonDisplayTotalVnd(row);
    /** Tab 5 DS — chỉ cộng `tong_tien_vnd` từ DB (không fallback total_amount_vnd); chỉ sửa map JS, không đụng DB. */
    const dsTongTienVnd =
        tongTienCoMaRaw != null && tongTienCoMaRaw !== '' && !Number.isNaN(Number(tongTienCoMaRaw))
            ? Number(tongTienCoMaRaw)
            : 0;
    const trackingCount = meaningfulTrim(row?.tracking_code) !== '' ? 1 : 0;
    const shippingUnitNorm = meaningfulTrim(row?.shipping_unit);
    const lenVhCount = shippingUnitNorm !== '' ? 1 : 0;
    const ngay = normalizeYmd(row?.order_date) || normalizeYmd(row?.created_at);
    const checkResult = String(row?.check_result ?? '').trim() || '(Trống)';
    return {
        _source: 'orders',
        id: row?.id || row?.order_code || `${ngay}-${Math.random().toString(36).slice(2, 8)}`,
        _ket_qua_check: { [checkResult]: 1 },
        _trang_thai_giao_hang: {
            [safeDeliveryLabel]: 1,
            'Mã Tracking': trackingCount,
            'Lên vận hành': lenVhCount
        },
        _trang_thai_thanh_toan: { [paymentLabel]: 1 },
        _tien_trang_thai_thanh_toan: { [paymentLabel]: paymentLabelIsCoBillOnly(paymentLabel) ? tongTienVnd : 0 },
        _tong_tien_vnd: tongTienCoMa,
        _ds_tong_tien_vnd: dsTongTienVnd,
        /** BC VH: «lên vận hành» = có ĐVVC thật (không cộng dồn từ histogram — tránh lệch 1). */
        _len_vh_don_vi: lenVhCount,
        order_code: String(row?.order_code ?? '').trim(),
        'Ngày lên đơn': ngay,
        'NV Vận đơn': String(row?.delivery_staff ?? '').trim(),
        'Mặt hàng': String(row?.product ?? '').trim(),
        'khu vực': String(row?.country ?? '').trim(),
        'Kết quả check': formatBaoCaoVanDonStatusHistogram({ [checkResult]: 1 }),
        'Trạng thái giao hàng NB': formatBaoCaoVanDonStatusHistogram({
            [safeDeliveryLabel]: 1,
            'Mã Tracking': trackingCount,
            'Lên vận hành': lenVhCount
        }),
        'Trạng thái thu tiền': formatBaoCaoVanDonStatusHistogram({ [paymentLabel]: 1 })
    };
};

const mapBaoCaoRowToVirtual = (row) => {
    const ngay = row.ngay;
    let dateStr = '';
    if (ngay) {
        dateStr = typeof ngay === 'string' ? String(ngay).slice(0, 10) : formatDateForInput(new Date(ngay));
    }
    return {
        _source: 'bao_cao',
        id: row.id,
        order_code: String(row?.order_code ?? row?.['Mã đơn hàng'] ?? '').trim(),
        _ket_qua_check: row.ket_qua_check,
        _trang_thai_giao_hang: row.trang_thai_giao_hang,
        _trang_thai_thanh_toan: row.trang_thai_thanh_toan,
        _tien_trang_thai_thanh_toan: row.tien_trang_thai_thanh_toan ?? {},
        _tong_tien_vnd: resolveVanDonDisplayTotalVnd(row),
        _ds_tong_tien_vnd:
            row.tong_tien_vnd != null && row.tong_tien_vnd !== '' && !Number.isNaN(Number(row.tong_tien_vnd))
                ? Number(row.tong_tien_vnd)
                : row.tong_tien_VND != null && row.tong_tien_VND !== '' && !Number.isNaN(Number(row.tong_tien_VND))
                  ? Number(row.tong_tien_VND)
                  : 0,
        'Ngày lên đơn': dateStr,
        'NV Vận đơn': row.nhan_vien || '',
        'Mặt hàng': row.san_pham || '',
        'khu vực': row.thi_truong || '',
        'Kết quả check': formatBaoCaoVanDonStatusHistogram(row.ket_qua_check),
        'Trạng thái giao hàng NB': formatBaoCaoVanDonStatusHistogram(row.trang_thai_giao_hang),
        'Trạng thái thu tiền': formatBaoCaoVanDonStatusHistogram(row.trang_thai_thanh_toan)
    };
};

export default function BaoCaoVanHanhHtml() {
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();
    const isHcmVariant = typeof location?.pathname === 'string' && location.pathname.includes('bao-cao-van-hanh-hcm');
    const inIframe = typeof window !== 'undefined' && window.self !== window.top;
    const urlStartDate = searchParams.get('from_date');
    const urlEndDate = searchParams.get('to_date');
    const userRole = localStorage.getItem('userRole') || '';
    const isAdmin =
        ['admin', 'super_admin', 'administrator'].includes(userRole.toLowerCase()) ||
        ['ADMIN', 'SUPER_ADMIN', 'ADMINISTRATOR'].includes(userRole);

    const getDefaultDates = useCallback(() => {
        if (urlStartDate && urlEndDate) {
            return { startDate: urlStartDate, endDate: urlEndDate };
        }
        if (inIframe) {
            const g = readDashboardGlobalDateRange();
            if (g) return { startDate: g.from, endDate: g.to };
        }
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 9);
        return { startDate: formatDateForInput(start), endDate: formatDateForInput(end) };
    }, [inIframe, urlStartDate, urlEndDate]);

    const [reportFilters, setReportFilters] = useState(() => {
        const d = getDefaultDates();
        const fromUrl = Boolean(urlStartDate && urlEndDate);
        const fromDashEmbed = Boolean(inIframe && readDashboardGlobalDateRange());
        return {
            dateRange: fromUrl || fromDashEmbed ? '' : 'last10Days',
            startDate: d.startDate,
            endDate: d.endDate,
            product: [],
            market: [],
            staff: []
        };
    });

    const tabFromUrl = searchParams.get('tab');
    const [activeTab, setActiveTab] = useState(() =>
        TABS.includes(tabFromUrl) ? tabFromUrl : 'tab1'
    );

    useEffect(() => {
        const t = searchParams.get('tab');
        if (TABS.includes(t)) setActiveTab(t);
    }, [searchParams]);

    const setTab = (t) => {
        setActiveTab(t);
        const p = new URLSearchParams(searchParams);
        p.set('tab', t);
        setSearchParams(p, { replace: true });
    };

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [rawData, setRawData] = useState([]);
    const [ffmPushRows, setFfmPushRows] = useState([]);
    const [bcvhCriteriaRows, setBcvhCriteriaRows] = useState(() =>
        createInitialBcvhDailyRows(urlStartDate, urlEndDate, inIframe)
    );
    const [bcvhBulkProduct, setBcvhBulkProduct] = useState([]);
    const [bcvhBulkMarket, setBcvhBulkMarket] = useState([]);
    /** SP/TT lấy sẵn từ DB khi chưa bấm Tìm (rawData rỗng) — MultiSelect không trống. */
    const [bcvhPrefetchProducts, setBcvhPrefetchProducts] = useState([]);
    const [bcvhPrefetchMarkets, setBcvhPrefetchMarkets] = useState([]);
    /** Tab 2: drill-down danh sách đơn theo ô số đã bấm */
    const [bcvhDrill, setBcvhDrill] = useState(null);
    const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]);

    const [showStaffDropdown, setShowStaffDropdown] = useState(false);
    const staffDropdownRef = useRef(null);
    const staffButtonRef = useRef(null);
    const [staffDropdownPosition, setStaffDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
    const bcvhWrapRef = useRef(null);
    const bcvhLeftColumnRef = useRef(null);
    const bcvhFixedPaneRef = useRef(null);
    const bcvhFixedHeadTableRef = useRef(null);
    const bcvhFixedTableRef = useRef(null);
    const bcvhMetricHeadScrollRef = useRef(null);
    const bcvhScrollHeadTableRef = useRef(null);
    const bcvhScrollTableRef = useRef(null);
    const bcvhScrollRef = useRef(null);

    useEffect(() => {
        if (showStaffDropdown && staffButtonRef.current) {
            const rect = staffButtonRef.current.getBoundingClientRect();
            setStaffDropdownPosition({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: Math.max(rect.width, 200)
            });
        }
    }, [showStaffDropdown]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                staffDropdownRef.current &&
                !staffDropdownRef.current.contains(event.target) &&
                staffButtonRef.current &&
                !staffButtonRef.current.contains(event.target)
            ) {
                setShowStaffDropdown(false);
            }
        };
        if (showStaffDropdown) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showStaffDropdown]);

    useEffect(() => {
        if (!bcvhDrill) return;
        const onKey = (e) => {
            if (e.key === 'Escape') setBcvhDrill(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [bcvhDrill]);

    useEffect(() => {
        if (!inIframe) return undefined;
        const onMsg = (e) => {
            const r = parseDashboardGlobalDateMessage(e.data);
            if (!r) return;
            setReportFilters((p) => ({ ...p, startDate: r.from, endDate: r.to, dateRange: '' }));
        };
        window.addEventListener('message', onMsg);
        return () => window.removeEventListener('message', onMsg);
    }, [inIframe]);

    useEffect(() => {
        if (!urlStartDate || !urlEndDate) return;
        setReportFilters((prev) => ({
            ...prev,
            startDate: urlStartDate,
            endDate: urlEndDate,
            dateRange: ''
        }));
    }, [urlStartDate, urlEndDate]);

    useEffect(() => {
        try {
            const payload = bcvhCriteriaRows.map((row) => {
                const pm = normalizeBcvhPmArrays(row.product, row.market);
                return {
                    startDate: row.startDate || '',
                    endDate: row.endDate || '',
                    product: pm.product,
                    market: pm.market,
                    isManual: Boolean(row.isManual)
                };
            });
            localStorage.setItem(BCVH_CRITERIA_STORAGE_KEY, JSON.stringify(payload));
        } catch {
            // Ignore localStorage write errors (private mode/quota).
        }
    }, [bcvhCriteriaRows]);

    useEffect(() => {
        const load = async () => {
            try {
                const userEmail = localStorage.getItem('userEmail');
                if (!userEmail) {
                    setSelectedPersonnelNames([]);
                    return;
                }
                const personnelMap = await rbacService.getSelectedPersonnel([userEmail.toLowerCase().trim()]);
                const names = personnelMap[userEmail.toLowerCase().trim()] || [];
                setSelectedPersonnelNames(
                    names.filter((n) => String(n).trim().length > 0 && !String(n).includes('@'))
                );
            } catch {
                setSelectedPersonnelNames([]);
            }
        };
        load();
    }, []);

    useEffect(() => {
        if (!reportFilters.dateRange) return;
        const range = computePresetDateRange(reportFilters.dateRange);
        if (!range) return;
        const sd = formatDateForInput(range.start);
        const ed = formatDateForInput(range.end);
        setReportFilters((p) => ({
            ...p,
            startDate: sd,
            endDate: ed
        }));
    }, [reportFilters.dateRange]);

    /** BC VH: mỗi dòng auto = cả khoảng Từ–Đến; giữ tách dòng theo tổ hợp SP/TT đã chọn. */
    useEffect(() => {
        const a = String(reportFilters.startDate || '').slice(0, 10);
        const b = String(reportFilters.endDate || '').slice(0, 10);
        if (!YMD_RE.test(a) || !YMD_RE.test(b) || a > b) return;
        setBcvhCriteriaRows((prev) => {
            const manual = prev.filter((r) => r.isManual);
            const autoPrev = prev.filter((r) => !r.isManual);
            let autoRows = reconcileAutoBcvhRowsToDateRange(autoPrev, a, b, newBcvhRowId);
            const cap = Math.max(0, MAX_BCVH_ROWS_TOTAL - manual.length);
            if (autoRows.length > cap) {
                autoRows = autoRows.slice(0, cap);
            }
            return [...autoRows, ...manual];
        });
    }, [reportFilters.startDate, reportFilters.endDate]);

    const [hcmProductOptions, setHcmProductOptions] = useState([]);
    useEffect(() => {
        let cancelled = false;
        const loadHcmProducts = async () => {
            if (!isHcmVariant) {
                setHcmProductOptions([]);
                return;
            }
            try {
                // Lấy distinct sản phẩm từ bảng HCM để sổ xuống trong cột Mặt hàng
                const { data, error } = await supabase
                    .from('marketing_report_hcm')
                    .select('Sản_phẩm')
                    .not('Sản_phẩm', 'is', null)
                    .neq('Sản_phẩm', '')
                    .limit(10000);
                if (error) {
                    console.warn('⚠️ loadHcmProducts error:', error.message);
                    setHcmProductOptions([]);
                    return;
                }
                const vals = [...new Set((data || []).map((r) => String(r['Sản_phẩm'] || '').trim()).filter(Boolean))].sort();
                if (!cancelled) setHcmProductOptions(vals);
            } catch (e) {
                console.warn('⚠️ loadHcmProducts unexpected error:', e);
                if (!cancelled) setHcmProductOptions([]);
            }
        };
        loadHcmProducts();
        return () => { cancelled = true; };
    }, [isHcmVariant]);

    useEffect(() => {
        if (rawData.length > 0) return undefined;
        let cancelled = false;
        const load = async () => {
            const ordersTable = isHcmVariant ? 'order_code_hcm' : 'orders';
            const PAGE = 2500;
            const productSet = new Set();
            const marketSet = new Set();
            try {
                for (let page = 0; page < 6; page += 1) {
                    const from = page * PAGE;
                    const to = from + PAGE - 1;
                    const { data, error } = await supabase
                        .from(ordersTable)
                        .select(isHcmVariant ? 'product, country' : 'product, country, team')
                        .not('order_date', 'is', null)
                        .order('order_date', { ascending: false })
                        .range(from, to);
                    if (error) throw error;
                    const batch = data || [];
                    for (const row of batch) {
                        if (!isHcmVariant && isOrdersRowTeamHcm(row)) continue;
                        const p = String(row?.product ?? '').trim();
                        const c = String(row?.country ?? '').trim();
                        if (p) productSet.add(p);
                        if (c) marketSet.add(c);
                    }
                    if (batch.length < PAGE) break;
                }
                if (!cancelled) {
                    setBcvhPrefetchProducts([...productSet].sort((a, b) => a.localeCompare(b, 'vi')));
                    setBcvhPrefetchMarkets([...marketSet].sort((a, b) => a.localeCompare(b, 'vi')));
                }
            } catch (e) {
                console.warn('⚠️ bcvhPrefetchDistinctProductsMarkets:', e?.message || e);
                if (!cancelled) {
                    setBcvhPrefetchProducts([]);
                    setBcvhPrefetchMarkets([]);
                }
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [rawData.length, isHcmVariant]);

    const uniqueProducts = useMemo(() => {
        const fromOrders = [...new Set(rawData.map((r) => r['Mặt hàng']).filter(Boolean))];
        const merged = new Set([
            ...fromOrders,
            ...(isHcmVariant ? hcmProductOptions : []),
            ...bcvhPrefetchProducts
        ]);
        return [...merged].sort((a, b) => a.localeCompare(b, 'vi'));
    }, [rawData, isHcmVariant, hcmProductOptions, bcvhPrefetchProducts]);
    const uniqueMarkets = useMemo(
        () =>
            [
                ...new Set([
                    ...rawData.map((r) => r['khu vực']).filter(Boolean),
                    ...bcvhPrefetchMarkets
                ])
            ].sort((a, b) => a.localeCompare(b, 'vi')),
        [rawData, bcvhPrefetchMarkets]
    );
    const uniqueStaff = useMemo(() => {
        // Admin cần “tất cả NV” nên danh sách NV cho dropdown lấy từ dữ liệu (rawData),
        // tránh bị giới hạn bởi selectedPersonnelNames/RBAC.
        if (isAdmin) {
            const fromData = [...new Set(rawData.map((r) => r['NV Vận đơn']).filter(Boolean))].sort();
            if (fromData.length) return fromData;
            // Trước khi load data mà rawData rỗng: fallback để dropdown không bị rỗng.
            if (selectedPersonnelNames?.length) return [...new Set(selectedPersonnelNames)].sort();
            return [];
        }
        if (selectedPersonnelNames?.length) return [...new Set(selectedPersonnelNames)].sort();
        return [...new Set(rawData.map((r) => r['NV Vận đơn']).filter(Boolean))].sort();
    }, [rawData, selectedPersonnelNames, isAdmin]);

    const matrix = useMemo(() => buildBaoCaoVanHanhMatrix(rawData), [rawData]);
    const pushMatrix = useMemo(() => {
        if (activeTab === 'tab4') {
            // Tab 4 bắt buộc lấy từ ffm_push_logs (kể cả không có dòng -> số = 0).
            return buildPushDonByDayMatrixFromFfmLogs(
                ffmPushRows,
                reportFilters.startDate,
                reportFilters.endDate
            );
        }
        return buildPushDonByDayMatrix(rawData, reportFilters.startDate, reportFilters.endDate);
    }, [activeTab, ffmPushRows, rawData, reportFilters.startDate, reportFilters.endDate]);
    /** Tab 5 — chỉ đếm từ đơn bảng `orders` (virtual row _source orders), không trộn nguồn bao_cao. */
    const ordersRowsForTrangThai = useMemo(
        () => rawData.filter((r) => r._source !== 'bao_cao'),
        [rawData]
    );
    const statusByDay = useMemo(
        () => buildTrangThaiDonByDay(ordersRowsForTrangThai, reportFilters.startDate, reportFilters.endDate),
        [ordersRowsForTrangThai, reportFilters.startDate, reportFilters.endDate]
    );

    const { bcvhLines, bcvhTotal, bcvhSlicesByRow } = useMemo(() => {
        // "TỔNG" phải theo đúng các dòng tiêu chí đang hiển thị trong tab 2.
        // Gộp bộ lọc SP/TT trang (reportFilters) vào từng dòng để không lệch "Tất cả" vs dữ liệu đã Tìm.
        const slicesByRow = bcvhCriteriaRows.map((row) => getBcvhCriteriaSlice(rawData, reportFilters, row));
        const lines = bcvhCriteriaRows.map((row, idx) => ({
            ...row,
            metrics: aggregateOperationalReportSlice(slicesByRow[idx])
        }));
        return {
            bcvhLines: lines,
            // Nếu nhiều dòng tiêu chí chồng lấn, phép cộng theo slice sẽ tự double-count,
            // tương tự cách Excel "tổng các hàng" (mỗi hàng là một breakdown riêng).
            bcvhTotal: aggregateOperationalReportSlice(slicesByRow.flat()),
            bcvhSlicesByRow: slicesByRow
        };
    }, [rawData, bcvhCriteriaRows, reportFilters.product, reportFilters.market]);

    /** Tab 1: một khoảng ngày + bộ lọc đã tải — cùng rule aggregateOperationalReportSlice với BC Vận Hành (tab 2). */
    const tab1Operational = useMemo(() => {
        const slice = filterSliceForCriteriaRow(rawData, {
            startDate: reportFilters.startDate,
            endDate: reportFilters.endDate,
            product: '',
            market: ''
        });
        return aggregateOperationalReportSlice(slice);
    }, [rawData, reportFilters.startDate, reportFilters.endDate]);

    const runTabSearch = async () => {
        await fetchData();
        const p = new URLSearchParams(searchParams);
        p.set('from_date', reportFilters.startDate);
        p.set('to_date', reportFilters.endDate);
        p.set('tab', activeTab);
        setSearchParams(p, { replace: true });
    };

    /** Cùng tập đơn với dòng tổng tab 1 (Ngày lên đơn trong khoảng; rawData đã lọc SP/khu vực/NV nếu có). */
    const exportTab1MaDonExcel = useCallback(() => {
        const slice = filterSliceForCriteriaRow(rawData, {
            startDate: reportFilters.startDate,
            endDate: reportFilters.endDate,
            product: '',
            market: ''
        });
        const codes = [
            ...new Set(slice.map((r) => String(r.order_code || '').trim()).filter(Boolean))
        ].sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }));
        if (codes.length === 0) {
            alert(
                'Không có mã đơn hàng — chọn khoảng ngày, bấm Tìm, hoặc kiểm tra bộ lọc Mặt hàng / khu vực / NV Vận đơn.'
            );
            return;
        }
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([['Mã đơn hàng'], ...codes.map((c) => [c])]);
        XLSX.utils.book_append_sheet(wb, ws, 'Ma_don');
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        XLSX.writeFile(wb, `BaoCaoVH_ma_don_tab1_${stamp}.xlsx`);
    }, [rawData, reportFilters.startDate, reportFilters.endDate]);

    const patchBcvhRow = (id, patch) => {
        setBcvhCriteriaRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    };

    const addBcvhRow = () => {
        setBcvhCriteriaRows((prev) => {
            if (prev.length >= MAX_BCVH_ROWS_TOTAL) return prev;
            const last = prev[prev.length - 1];
            let day = String(last?.endDate || reportFilters.endDate || '').slice(0, 10);
            if (!YMD_RE.test(day)) day = String(reportFilters.endDate || '').slice(0, 10);
            if (!YMD_RE.test(day)) day = String(reportFilters.startDate || '').slice(0, 10);
            return [
                ...prev,
                {
                    id: newBcvhRowId(),
                    startDate: day,
                    endDate: day,
                    product: [],
                    market: [],
                    isManual: true
                }
            ];
        });
    };

    const removeBcvhRow = (id) => {
        setBcvhCriteriaRows((prev) => prev.filter((r) => !(r.id === id && r.isManual)));
    };

    const clearAllBcvhProductMarketFilters = () => {
        setBcvhBulkProduct([]);
        setBcvhBulkMarket([]);
        setBcvhCriteriaRows([]);
    };

    const bcvhRowContextLabel = (line) => {
        const pm = getEffectiveBcvhPmForRow(reportFilters, line);
        const p = pm.product.length ? pm.product.join(', ') : 'Tất cả';
        const m = pm.market.length ? pm.market.join(', ') : 'Tất cả';
        return `${p} / ${m}`;
    };

    const openBcvhDrill = (slice, metricId, rowCtx) => {
        if (!slice || !metricId) return;
        const rows = filterSliceByBcvhDrillMetric(slice, metricId);
        setBcvhDrill({
            title: `${rowCtx} — ${bcvhDrillMetricTitle(metricId)} (${rows.length} đơn)`,
            rows
        });
    };

    const renderBcvhDrillableCell = (slice, metricId, rowCtx, num) => (
        <td className="bcvh-cell align-middle">
            <button
                type="button"
                className="max-w-full cursor-pointer text-left font-inherit tabular-nums text-blue-800 underline decoration-dotted underline-offset-2 hover:text-blue-950"
                onClick={() => openBcvhDrill(slice, metricId, rowCtx)}
            >
                {formatNumVi(num)}
            </button>
        </td>
    );

    const renderBcvhMetricCells = (m, slice, rowCtx) => (
        <>
            {renderBcvhDrillableCell(slice, 'donCoBill', rowCtx, m.donCoBill)}
            {renderBcvhDrillableCell(slice, 'donCoBillAmount', rowCtx, m.donCoBillAmount)}
            {renderBcvhDrillableCell(slice, 'tongNoiBo', rowCtx, m.tongNoiBo)}
            {renderBcvhDrillableCell(slice, 'tongDonLenVanHanh', rowCtx, m.tongDonLenVanHanh)}
            {renderBcvhDrillableCell(slice, 'chuaCoMa', rowCtx, m.chuaCoMa)}
            <td className="bcvh-cell">{formatPctComma(m.tyLeVHNoiBo)}</td>
            <td className="bcvh-cell">{formatPctComma(m.tyLeTTTrenPhi)}</td>
            <td className="bcvh-cell">{formatPctComma(m.tyLeTTThanhCong)}</td>
            {renderBcvhDrillableCell(slice, 'giaoTC', rowCtx, m.giaoTC)}
            {renderBcvhDrillableCell(slice, 'dangGiao', rowCtx, m.dangGiao)}
            {renderBcvhDrillableCell(slice, 'chuaGiao', rowCtx, m.chuaGiao)}
            {renderBcvhDrillableCell(slice, 'hoan', rowCtx, m.hoan)}
            {renderBcvhDrillableCell(slice, 'huyVH', rowCtx, m.huyVH)}
            {renderBcvhDrillableCell(slice, 'choCheck', rowCtx, m.choCheck)}
            {renderBcvhDrillableCell(slice, 'tongThanhToanGiaoHangNb', rowCtx, m.tongThanhToanGiaoHangNb)}
            {renderBcvhDrillableCell(slice, 'huyNoiBo', rowCtx, m.huyNoiBo)}
            {renderBcvhDrillableCell(slice, 'doiHang', rowCtx, m.doiHang)}
            {renderBcvhDrillableCell(slice, 'khachHen', rowCtx, m.khachHen)}
            {renderBcvhDrillableCell(slice, 'treo', rowCtx, m.treo)}
            {renderBcvhDrillableCell(slice, 'vanDonXL', rowCtx, m.vanDonXL)}
            {renderBcvhDrillableCell(slice, 'daCkChuaDay', rowCtx, m.daCkChuaDay)}
            {BC_VH_PAYMENT_COLUMNS.map((c) => (
                <td key={c.id} className="bcvh-cell align-middle">
                    <button
                        type="button"
                        className="max-w-full cursor-pointer text-left font-inherit tabular-nums text-blue-800 underline decoration-dotted underline-offset-2 hover:text-blue-950"
                        onClick={() => openBcvhDrill(slice, `payment:${c.id}`, rowCtx)}
                    >
                        {formatNumVi(m.payment[c.id] || 0)}
                    </button>
                </td>
            ))}
        </>
    );

    const renderBcvhMetricThead = () => (
        <thead>
            <tr>
                <th colSpan={2} className="bcvh-h-cyan">
                    Đã Thanh Toán
                    <br />
                    (có bill)
                </th>
                <th rowSpan={2} className="bcvh-h-cyan leading-tight">
                    TỔNG ĐƠN
                    <br />
                    SALE LÊN FILE
                    <br />
                    NỘI BỘ
                </th>
                <th rowSpan={2} className="bcvh-h-cyan leading-tight">
                    TỔNG ĐƠN
                    <br />
                    LÊN VẬN HÀNH
                </th>
                <th rowSpan={2} className="bcvh-h-cyan leading-tight">
                    TỔNG ĐƠN
                    <br />
                    CHƯA CÓ MÃ
                    <br />
                    <span className="font-normal">(đã lên VH, trống mã)</span>
                </th>
                <th colSpan={3} className="bcvh-h-yellow">
                    TỶ LỆ
                </th>
                <th colSpan={7} className="bcvh-h-green leading-tight">
                    TRẠNG THÁI GIAO HÀNG NB
                </th>
                <th colSpan={6} className="bcvh-h-red leading-tight">
                    TỔNG ĐƠN THEO KẾT QUẢ CHECK
                </th>
                <th colSpan={8} className="bcvh-h-grey leading-tight">
                    TRẠNG THÁI THU TIỀN
                </th>
            </tr>
            <tr>
                <th className="bcvh-h-cyan">Số đơn</th>
                <th className="bcvh-h-cyan">Thành tiền</th>
                <th className="bcvh-h-yellow leading-tight">
                    TỈ LỆ ĐƠN LÊN VH
                    <br />
                    / ĐƠN NỘI BỘ
                </th>
                <th className="bcvh-h-yellow leading-tight">
                    Tỉ lệ TT thành công
                    <br />
                    / đơn tính phí
                </th>
                <th className="bcvh-h-yellow leading-tight">
                    Tỉ lệ TT thành công
                    <br />
                    / đơn giao TC
                </th>
                <th className="bcvh-h-green">Giao Thành Công</th>
                <th className="bcvh-h-green">Đang Giao</th>
                <th className="bcvh-h-green">Chưa Giao</th>
                <th className="bcvh-h-green">Hoàn</th>
                <th className="bcvh-h-green leading-tight">Hủy vận hành</th>
                <th className="bcvh-h-green">Chờ check</th>
                <th className="bcvh-h-green leading-tight">
                    Tổng thanh toán
                    <br />
                    giao hàng NB
                </th>
                <th className="bcvh-h-red">Huỷ nội bộ</th>
                <th className="bcvh-h-red">Đợi hàng</th>
                <th className="bcvh-h-red">Khách hẹn</th>
                <th className="bcvh-h-red">Treo</th>
                <th className="bcvh-h-red">Vận đơn XL</th>
                <th className="bcvh-h-red leading-tight">
                    Đơn Ok nhưng
                    <br />
                    chưa có mã
                </th>
                {BC_VH_PAYMENT_COLUMNS.map((col) => (
                    <th key={col.id} className="bcvh-h-grey leading-tight">
                        {col.label}
                    </th>
                ))}
            </tr>
        </thead>
    );

    const fetchData = async (opts) => {
        const PAGE_SIZE = 1000; // phân trang để lấy full dữ liệu theo khoảng ngày
        if (!reportFilters.startDate || !reportFilters.endDate) {
            alert('Vui lòng chọn khoảng thời gian.');
            return;
        }
        const criteriaRowsForQuery = opts?.bcvhCriteriaRowsOverride ?? bcvhCriteriaRows;
        const rowStarts = criteriaRowsForQuery.map((r) => r.startDate).filter(Boolean);
        const rowEnds = criteriaRowsForQuery.map((r) => r.endDate).filter(Boolean);
        const allStarts = [reportFilters.startDate, ...rowStarts];
        const allEnds = [reportFilters.endDate, ...rowEnds];
        const qStart = allStarts.reduce((a, b) => (a < b ? a : b));
        const qEnd = allEnds.reduce((a, b) => (a > b ? a : b));
        setLoading(true);
        setError(null);
        try {
            // Xác định tổng số bản ghi (để không dừng nhầm ở đúng ngưỡng 1000)
            const ordersTable = isHcmVariant ? 'order_code_hcm' : 'orders';
            let totalRows = null;
            try {
                const { count } = await supabase
                    .from(ordersTable)
                    .select('id', { count: 'exact', head: true })
                    .gte('order_date', qStart)
                    .lte('order_date', qEnd);
                totalRows = typeof count === 'number' ? count : null;
            } catch {
                totalRows = null;
            }

            // Lấy FULL dữ liệu trong khoảng ngày bằng cách phân trang 1000 bản ghi/lần
            let allOrderRows = [];
            let page = 0;
            const MAX_PAGES = 5000; // an toàn
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const from = page * PAGE_SIZE;
                const to = from + PAGE_SIZE - 1;
                // Cần cột tong_tien_vnd (migration 20260403180000_orders_tong_tien_vnd.sql) — tab 5 DS chỉ cộng trường này.
                const { data, error: qErr } = await supabase
                    .from(ordersTable)
                    .select(
                        'id, order_code, order_date, created_at, team, delivery_staff, product, country, delivery_status_nb, delivery_status, check_result, payment_status, payment_status_detail, total_amount_vnd, tong_tien_vnd, van_don_line_total_vnd, sale_price, goods_amount, tracking_code, shipping_unit'
                    )
                    .gte('order_date', qStart)
                    .lte('order_date', qEnd)
                    .order('order_date', { ascending: false })
                    .range(from, to);
                if (qErr) throw qErr;
                const batch = data || [];
                if (batch.length === 0) break;
                allOrderRows = allOrderRows.concat(batch);
                if (batch.length < PAGE_SIZE) break;
                if (totalRows != null && allOrderRows.length >= totalRows) break;
                page += 1;
                if (page >= MAX_PAGES) break;
            }

            // Trang HCM: KHÔNG loại team HCM; Trang thường: loại team HCM để chỉ tính HN
            if (!isHcmVariant) {
                allOrderRows = (allOrderRows || []).filter((row) => !isOrdersRowTeamHcm(row));
            }

            let rows = (allOrderRows || []).map(mapOrderRowToVirtual);
            if (reportFilters.product?.length > 0) {
                const ps = new Set(reportFilters.product);
                rows = rows.filter((r) => ps.has(r['Mặt hàng']));
            }
            if (reportFilters.market?.length > 0) {
                const ms = new Set(reportFilters.market);
                rows = rows.filter((r) => ms.has(r['khu vực']));
            }
            const afterProductMarketCount = rows.length;
            let staffFilterReducedToZero = false;
            const staffAllow = (() => {
                // Admin: mặc định lấy toàn bộ NV (không lọc theo selectedPersonnelNames/RBAC).
                // Chỉ lọc khi người dùng chọn cụ thể trong dropdown (reportFilters.staff).
                if (isAdmin) {
                    return reportFilters.staff?.length ? new Set(reportFilters.staff) : null;
                }
                // Non-admin: vẫn giới hạn theo RBAC.
                if (selectedPersonnelNames?.length) return new Set(selectedPersonnelNames);
                return null;
            })();

            const normalizeForNameMatch = (s) =>
                String(s ?? '')
                    .normalize('NFC')
                    .trim()
                    .replace(/\s+/g, ' ')
                    .toLowerCase()
                    // Remove accents for better matching (e.g. "Nguyễn" vs "Nguyen")
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '');

            if (staffAllow) {
                const allowedNames = Array.from(staffAllow)
                    .map(normalizeForNameMatch)
                    .filter(Boolean);

                rows = rows.filter((r) => {
                    const rowStaff = String(r?.['NV Vận đơn'] ?? '').trim();
                    // If a row is not assigned any NV Vận đơn, don't hide it for everyone.
                    if (!rowStaff) return true;

                    const nRow = normalizeForNameMatch(rowStaff);
                    return allowedNames.some((nAllowed) => {
                        if (!nAllowed || !nRow) return false;
                        if (nAllowed === nRow) return true;
                        // Allow substring match to handle minor formatting differences.
                        return nAllowed.length >= 4 && nRow.length >= 4 && (nAllowed.includes(nRow) || nRow.includes(nAllowed));
                    });
                });

                if (rows.length === 0 && afterProductMarketCount > 0) {
                    staffFilterReducedToZero = true;
                }
            }
            if (rows.length === 0) {
                setError(
                    staffFilterReducedToZero
                        ? 'Không có đơn orders phù hợp bộ lọc (lọc NV Vận đơn theo quyền không khớp).'
                        : 'Không có đơn orders phù hợp bộ lọc.'
                );
            } else {
                setError(null);
            }
            setRawData(rows);

            // Tab 4: nguồn dữ liệu theo yêu cầu lấy từ ffm_push_logs (HCM → ffm_push_logs_hcm).
            // Tải theo khoảng ngày đang lọc (ưu tiên pushed_at; fallback theo cột timestamp khác nếu thiếu pushed_at).
            if (activeTab === 'tab4') {
                setError(null);
                const fromIso = `${reportFilters.startDate}T00:00:00`;
                const toIso = `${reportFilters.endDate}T23:59:59`;
                const logsTable = isHcmVariant ? 'ffm_push_logs_hcm' : 'ffm_push_logs';
                const { data: pushedRows, error: pushedErr } = await supabase
                    .from(logsTable)
                    .select('*')
                    .gte('pushed_at', fromIso)
                    .lte('pushed_at', toIso)
                    .order('pushed_at', { ascending: false })
                    .limit(20000);
                if (pushedErr) throw pushedErr;

                // Fallback 1: inserted_at
                let fallbackRows = [];
                let fallbackErr = null;
                try {
                    const r1 = await supabase
                        .from(logsTable)
                        .select('*')
                        .is('pushed_at', null)
                        .gte('inserted_at', fromIso)
                        .lte('inserted_at', toIso)
                        .order('inserted_at', { ascending: false })
                        .limit(20000);
                    fallbackRows = r1.data || [];
                    fallbackErr = r1.error;
                } catch (e) {
                    fallbackErr = e;
                }

                // Fallback 2: updated_at (nếu inserted_at không có cột)
                if (fallbackErr) {
                    const msg = String(fallbackErr?.message || fallbackErr).toLowerCase();
                    const insertedMissing =
                        msg.includes('inserted_at') &&
                        (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache'));
                    // Nếu inserted_at không tồn tại thì thử updated_at.
                    if (insertedMissing) {
                        try {
                            const r2 = await supabase
                                .from(logsTable)
                                .select('*')
                                .is('pushed_at', null)
                                .gte('updated_at', fromIso)
                                .lte('updated_at', toIso)
                                .order('updated_at', { ascending: false })
                                .limit(20000);
                            fallbackRows = r2.data || [];
                            if (r2.error) {
                                const r2Msg = String(r2.error?.message || r2.error).toLowerCase();
                                const updatedMissing =
                                    r2Msg.includes('updated_at') && (r2Msg.includes('does not exist') || r2Msg.includes('could not find') || r2Msg.includes('schema cache'));
                                if (!updatedMissing) throw r2.error;
                            }
                        } catch (e2) {
                            // Nếu vẫn lỗi vì cột không tồn tại thì chỉ bỏ fallback.
                            const m2 = String(e2?.message || e2).toLowerCase();
                            const updatedMissing =
                                m2.includes('updated_at') &&
                                (m2.includes('does not exist') || m2.includes('could not find') || m2.includes('schema cache'));
                            fallbackRows = updatedMissing ? [] : fallbackRows;
                        }
                    }
                }

                let merged = [...(pushedRows || []), ...(fallbackRows || [])];

                // Áp dụng filter sản phẩm/khu vực từ UI lên dữ liệu ffm_push_logs
                if (reportFilters.product?.length) {
                    const ps = new Set(reportFilters.product);
                    merged = merged.filter((r) => ps.has(String(r?.product ?? r?.['Mặt hàng'] ?? '').trim()));
                }
                if (reportFilters.market?.length) {
                    const ms = new Set(reportFilters.market);
                    merged = merged.filter((r) => ms.has(String(r?.country ?? r?.['Khu vực'] ?? r?.khu_vuc ?? '').trim()));
                }

                setFfmPushRows(merged);
                if ((merged || []).length === 0) {
                    setError('Không có dữ liệu ffm_push_logs phù hợp khoảng ngày / bộ lọc.');
                }
            } else {
                setFfmPushRows([]);
            }

        } catch (err) {
            console.error(err);
            setError(err.message || 'Lỗi tải dữ liệu orders');
            setRawData([]);
        } finally {
            setLoading(false);
        }
    };

    /** Tab 2: áp dụng SP/TT hàng loạt lên các dòng auto rồi tải dữ liệu (một nút). */
    const runTab2SearchWithBulk = async () => {
        if (!reportFilters.startDate || !reportFilters.endDate) {
            alert('Vui lòng chọn khoảng thời gian.');
            return;
        }
        const start = String(reportFilters.startDate || '').slice(0, 10);
        const end = String(reportFilters.endDate || '').slice(0, 10);
        if (!YMD_RE.test(start) || !YMD_RE.test(end) || start > end) {
            alert('Vui lòng chọn khoảng thời gian.');
            return;
        }
        const next = computeBcvhCriteriaAfterBulkApply(
            bcvhCriteriaRows,
            bcvhBulkProduct,
            bcvhBulkMarket,
            start,
            end
        );
        if (next === null) {
            alert('Vui lòng chọn khoảng thời gian.');
            return;
        }
        setBcvhCriteriaRows(next);
        setBcvhBulkProduct([]);
        setBcvhBulkMarket([]);
        await fetchData({ bcvhCriteriaRowsOverride: next });
        const p = new URLSearchParams(searchParams);
        p.set('from_date', reportFilters.startDate);
        p.set('to_date', reportFilters.endDate);
        p.set('tab', activeTab);
        setSearchParams(p, { replace: true });
    };

    /** Tab3 matrix: SL + Thành tiền (tổng `_tong_tien_vnd` các dòng thỏa cùng điều kiện với SL). */
    const renderMetricPair = (sl, tienVnd) => (
        <>
            <td className="border border-black px-3 py-2 text-right font-extrabold tabular-nums">
                {formatSlVi(sl)}
            </td>
            <td className="border border-black px-3 py-2 text-right font-extrabold tabular-nums">
                {formatNumVi(tienVnd ?? 0)}
            </td>
        </>
    );

    const renderCoBillPair = (count, amountVnd) => (
        <>
            <td className="border border-black px-3 py-2 text-right font-extrabold tabular-nums">
                {formatSlVi(count)}
            </td>
            <td className="border border-black px-3 py-2 text-right font-extrabold tabular-nums">
                {formatNumVi(amountVnd)}
            </td>
        </>
    );

    const renderPctPair = (pctStr) => (
        <>
            <td className="border border-black px-3 py-2 text-right font-extrabold tabular-nums">{pctStr}</td>
            <td className="border border-black px-3 py-2 text-right font-extrabold tabular-nums text-gray-500">
                {pctStr}
            </td>
        </>
    );

    /** 4 cột đầu nằm ngoài bcvh-scroll — đo bề ngang cột trái (header + body) cho spacer thanh kéo */
    const syncBcvhFixedPaneWidth = useCallback(() => {
        const col = bcvhLeftColumnRef.current;
        const wrap = bcvhWrapRef.current;
        if (col && wrap) {
            wrap.style.setProperty('--bcvh-fixed-measured-width', `${col.offsetWidth}px`);
        }
    }, []);

    /** Hai bảng tách — đồng bộ chiều cao từng dòng tbody + khối thead (thead nằm ngoài vùng cuộn dọc) */
    const syncBcvhSplitTableHeights = useCallback(() => {
        if (activeTab !== 'tab2') return;
        const leftHead = bcvhFixedHeadTableRef.current?.querySelector('thead');
        const rightHead = bcvhScrollHeadTableRef.current?.querySelector('thead');
        const leftBody = bcvhFixedTableRef.current?.querySelector('tbody');
        const rightBody = bcvhScrollTableRef.current?.querySelector('tbody');
        if (!leftHead || !rightHead || !leftBody || !rightBody) return;

        const ltr = leftHead.querySelectorAll('tr');
        const rtr = rightHead.querySelectorAll('tr');
        /* Trái: 1 hàng thead (4 ô rowspan 2); phải: 2 hàng thead số liệu */
        if (ltr[0] && rtr[0] && rtr[1]) {
            const hRow1 = rtr[0].offsetHeight;
            const hBlock = hRow1 + rtr[1].offsetHeight;
            ltr[0].style.height = `${hBlock}px`;
            for (let i = 1; i < ltr.length; i += 1) {
                ltr[i].style.height = '0';
                ltr[i].style.minHeight = '0';
                ltr[i].style.overflow = 'hidden';
            }
            const wrap = bcvhWrapRef.current;
            if (wrap) {
                wrap.style.setProperty('--bcvh-head-row-1-height', `${hRow1}px`);
            }
        }

        const leftRows = leftBody.querySelectorAll('tr');
        const rightRows = rightBody.querySelectorAll('tr');
        const n = Math.min(leftRows.length, rightRows.length);
        for (let i = 0; i < n; i += 1) {
            const lr = leftRows[i];
            const rr = rightRows[i];
            lr.style.height = '';
            rr.style.height = '';
            const h = Math.ceil(
                Math.max(lr.getBoundingClientRect().height, rr.getBoundingClientRect().height)
            );
            lr.style.height = `${h}px`;
            rr.style.height = `${h}px`;
        }
    }, [activeTab]);

    /** Hai bảng metric tách nhau — đo cột từ body ở chế độ auto, rồi gán cùng colgroup + fixed cho cả hai */
    const syncBcvhMetricColumnWidths = useCallback(() => {
        if (activeTab !== 'tab2') return;
        const bodyTable = bcvhScrollTableRef.current;
        const headTable = bcvhScrollHeadTableRef.current;
        if (!bodyTable || !headTable) return;
        const tbody = bodyTable.querySelector('tbody');
        if (!tbody) return;
        const rows = tbody.querySelectorAll('tr');
        if (rows.length === 0) return;
        if (!headTable.querySelector('thead tr:nth-child(2)')) return;

        headTable.querySelectorAll('colgroup.bcvh-metric-colgroup').forEach((el) => el.remove());
        bodyTable.querySelectorAll('colgroup.bcvh-metric-colgroup').forEach((el) => el.remove());
        headTable.style.width = '';
        bodyTable.style.width = '';
        void bodyTable.offsetWidth;

        const n = rows[0].cells.length;
        const maxW = new Array(n).fill(0);
        const cellPx = (td) =>
            Math.max(
                td.offsetWidth,
                td.scrollWidth,
                td.getBoundingClientRect().width
            );
        rows.forEach((tr) => {
            const { cells } = tr;
            const len = Math.min(cells.length, n);
            for (let i = 0; i < len; i += 1) {
                maxW[i] = Math.max(maxW[i], cellPx(cells[i]));
            }
        });

        const theadEl = headTable.querySelector('thead');
        if (theadEl) {
            const hRows = theadEl.querySelectorAll('tr');
            const numHeadRows = hRows.length;
            if (numHeadRows >= 1) {
                const grid = Array.from({ length: numHeadRows }, () => Array(n).fill(null));
                for (let ri = 0; ri < numHeadRows; ri += 1) {
                    const tr = hRows[ri];
                    let col = 0;
                    for (const cell of tr.cells) {
                        while (col < n && grid[ri][col] != null) col += 1;
                        if (col >= n) break;
                        const cs = cell.colSpan || 1;
                        const rs = cell.rowSpan || 1;
                        for (let r = 0; r < rs; r += 1) {
                            for (let k = 0; k < cs; k += 1) {
                                const rr = ri + r;
                                const cc = col + k;
                                if (rr < numHeadRows && cc < n) grid[rr][cc] = cell;
                            }
                        }
                        col += cs;
                    }
                }
                for (let c = 0; c < n; c += 1) {
                    const seen = new Set();
                    for (let r = 0; r < numHeadRows; r += 1) {
                        const cell = grid[r][c];
                        if (!cell || cell.tagName !== 'TH' || seen.has(cell)) continue;
                        seen.add(cell);
                        const cs = cell.colSpan || 1;
                        const raw = Math.max(
                            cell.scrollWidth,
                            cell.offsetWidth,
                            cell.getBoundingClientRect().width
                        );
                        const share = Math.ceil(raw / cs);
                        maxW[c] = Math.max(maxW[c], share);
                    }
                }
            }
        }

        const MIN_COL = 88;
        const buildColgroup = () => {
            const cg = document.createElement('colgroup');
            cg.className = 'bcvh-metric-colgroup';
            maxW.forEach((w) => {
                const col = document.createElement('col');
                const px = Math.max(MIN_COL, Math.ceil(w));
                col.style.width = `${px}px`;
                col.style.minWidth = `${px}px`;
                cg.appendChild(col);
            });
            return cg;
        };

        const cgHead = buildColgroup();
        const cgBody = buildColgroup();
        headTable.insertBefore(cgHead, headTable.firstChild);
        bodyTable.insertBefore(cgBody, bodyTable.firstChild);
        void bodyTable.offsetWidth;
        void headTable.offsetWidth;

        /* border-separate + làm tròn: tổng bề ngang head/body hoặc scrollWidth vùng cuộn lệch → kéo hết ngang bị trôi */
        const bumpLastCols = (deltaPx) => {
            const lastH = cgHead.querySelector('col:last-child');
            const lastB = cgBody.querySelector('col:last-child');
            if (!lastH || !lastB) return;
            const cur = parseFloat(lastH.style.width) || MIN_COL;
            const next = Math.max(MIN_COL, Math.round(cur + deltaPx));
            lastH.style.width = `${next}px`;
            lastH.style.minWidth = `${next}px`;
            lastB.style.width = `${next}px`;
            lastB.style.minWidth = `${next}px`;
        };

        const tableGapPx = () =>
            bodyTable.getBoundingClientRect().width - headTable.getBoundingClientRect().width;

        for (let pass = 0; pass < 8; pass += 1) {
            void bodyTable.offsetWidth;
            void headTable.offsetWidth;
            const gap = tableGapPx();
            if (Math.abs(gap) < 0.75) break;
            bumpLastCols(gap);
        }

        const headScroll = bcvhMetricHeadScrollRef.current;
        const bodyScroll = bcvhScrollRef.current;
        if (headScroll && bodyScroll) {
            void bodyScroll.offsetWidth;
            void headScroll.offsetWidth;
            const swGap = bodyScroll.scrollWidth - headScroll.scrollWidth;
            if (Math.abs(swGap) > 1) {
                bumpLastCols(swGap);
                void bodyScroll.offsetWidth;
                void headScroll.offsetWidth;
            }
        }
    }, [activeTab]);

    /** Pane phải có scrollbar ngang → chiếm chiều cao viewport; bù padding-bottom pane trái cho khớp clientHeight khi đồng bộ scrollTop */
    const syncBcvhPaneScrollbarAlign = useCallback(() => {
        if (activeTab !== 'tab2') {
            bcvhFixedPaneRef.current?.style.removeProperty('padding-bottom');
            return;
        }
        const mainScroll = bcvhScrollRef.current;
        const leftPane = bcvhFixedPaneRef.current;
        if (!mainScroll || !leftPane) return;
        const needsHorizontal = mainScroll.scrollWidth > mainScroll.clientWidth + 0.5;
        let hBar = 0;
        if (needsHorizontal) {
            hBar = mainScroll.offsetHeight - mainScroll.clientHeight;
            if (hBar < 8 || hBar > 48) hBar = 17;
        }
        if (hBar > 0) leftPane.style.paddingBottom = `${hBar}px`;
        else leftPane.style.removeProperty('padding-bottom');
    }, [activeTab]);

    /** Header metric không có thanh dọc nhưng body có → clientWidth khác → max scrollLeft khác, kéo ngang cuối thead lệch body */
    const syncBcvhMetricScrollViewportMatch = useCallback(() => {
        if (activeTab !== 'tab2') {
            bcvhMetricHeadScrollRef.current?.style.removeProperty('padding-right');
            return;
        }
        const head = bcvhMetricHeadScrollRef.current;
        const body = bcvhScrollRef.current;
        if (!head || !body) return;
        void head.offsetWidth;
        void body.offsetWidth;
        const pad = head.clientWidth - body.clientWidth;
        if (pad > 0.5) head.style.paddingRight = `${pad}px`;
        else head.style.removeProperty('padding-right');
    }, [activeTab]);

    useLayoutEffect(() => {
        if (activeTab !== 'tab2') return;
        syncBcvhFixedPaneWidth();
        syncBcvhSplitTableHeights();
        syncBcvhMetricColumnWidths();
        syncBcvhPaneScrollbarAlign();
        syncBcvhMetricScrollViewportMatch();
        syncBcvhSplitTableHeights();
        requestAnimationFrame(() => {
            syncBcvhFixedPaneWidth();
            syncBcvhSplitTableHeights();
            syncBcvhMetricColumnWidths();
            syncBcvhPaneScrollbarAlign();
            syncBcvhMetricScrollViewportMatch();
            syncBcvhSplitTableHeights();
            const head = bcvhMetricHeadScrollRef.current;
            const main = bcvhScrollRef.current;
            if (head && main) head.scrollLeft = main.scrollLeft;
        });
    }, [
        activeTab,
        syncBcvhFixedPaneWidth,
        syncBcvhSplitTableHeights,
        syncBcvhMetricColumnWidths,
        syncBcvhPaneScrollbarAlign,
        syncBcvhMetricScrollViewportMatch,
        bcvhLines.length,
        rawData.length
    ]);

    useEffect(() => {
        syncBcvhFixedPaneWidth();
        requestAnimationFrame(() => syncBcvhFixedPaneWidth());
    }, [syncBcvhFixedPaneWidth, bcvhLines.length, rawData.length]);

    useEffect(() => {
        const onResize = () => {
            syncBcvhFixedPaneWidth();
            requestAnimationFrame(() => {
                syncBcvhSplitTableHeights();
                syncBcvhMetricColumnWidths();
                syncBcvhPaneScrollbarAlign();
                syncBcvhMetricScrollViewportMatch();
                syncBcvhSplitTableHeights();
                requestAnimationFrame(() => {
                    syncBcvhMetricColumnWidths();
                    syncBcvhPaneScrollbarAlign();
                    syncBcvhMetricScrollViewportMatch();
                    syncBcvhSplitTableHeights();
                });
            });
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [
        syncBcvhFixedPaneWidth,
        syncBcvhSplitTableHeights,
        syncBcvhMetricColumnWidths,
        syncBcvhPaneScrollbarAlign,
        syncBcvhMetricScrollViewportMatch
    ]);

    useEffect(() => {
        if (activeTab !== 'tab2') return;
        const main = bcvhScrollRef.current;
        if (!main) return;
        const scheduleSync = () => {
            syncBcvhFixedPaneWidth();
            requestAnimationFrame(() => {
                syncBcvhFixedPaneWidth();
                syncBcvhSplitTableHeights();
                syncBcvhMetricColumnWidths();
                syncBcvhPaneScrollbarAlign();
                syncBcvhMetricScrollViewportMatch();
                syncBcvhSplitTableHeights();
                requestAnimationFrame(() => {
                    syncBcvhMetricColumnWidths();
                    syncBcvhPaneScrollbarAlign();
                    syncBcvhMetricScrollViewportMatch();
                    syncBcvhSplitTableHeights();
                    const head = bcvhMetricHeadScrollRef.current;
                    if (head) head.scrollLeft = main.scrollLeft;
                });
            });
        };
        scheduleSync();
        let ro;
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(() => scheduleSync());
            ro.observe(main);
        }
        window.addEventListener('resize', scheduleSync);
        return () => {
            if (ro) ro.disconnect();
            window.removeEventListener('resize', scheduleSync);
        };
    }, [
        activeTab,
        syncBcvhFixedPaneWidth,
        syncBcvhSplitTableHeights,
        syncBcvhMetricColumnWidths,
        syncBcvhPaneScrollbarAlign,
        syncBcvhMetricScrollViewportMatch,
        bcvhLines.length,
        rawData.length
    ]);

    useEffect(() => {
        if (activeTab !== 'tab2') return;
        const rightPane = bcvhScrollRef.current;
        const leftPane = bcvhFixedPaneRef.current;
        if (!rightPane || !leftPane) return;

        const syncFromRight = () => {
            leftPane.scrollTop = rightPane.scrollTop;
        };

        const syncHeadH = () => {
            const head = bcvhMetricHeadScrollRef.current;
            if (head) head.scrollLeft = rightPane.scrollLeft;
        };
        const onScroll = () => {
            syncFromRight();
            syncHeadH();
            syncBcvhPaneScrollbarAlign();
        };
        rightPane.addEventListener('scroll', onScroll);
        onScroll();
        return () => {
            rightPane.removeEventListener('scroll', onScroll);
        };
    }, [activeTab, bcvhLines.length, syncBcvhPaneScrollbarAlign]);

    const { markets, byMarket, total } = matrix;
    const colSpanMain = 1 + markets.length * 2 + 2;

    /** Nhúng dashboard: padding & khối điều khiển mỏng để ưu tiên bảng */
    const c = inIframe;
    /** Tab2: chiều cao cố định để cuộn nằm trong pane — sticky thead chỉ bám theo scroll nội bộ */
    const bcvhCardLayout = c
        ? 'flex flex-col min-h-0 h-[calc(100vh-6.5rem)] max-h-[calc(100vh-6.5rem)] overflow-hidden'
        : 'flex flex-col min-h-0 h-[calc(100vh-160px)] max-h-[calc(100vh-160px)] overflow-hidden';

    return (
        <div
            className={`${c ? 'min-h-screen' : 'min-h-[calc(100vh-64px)]'} bg-gray-100 ${c ? 'p-1.5' : 'p-4 md:p-6'} overflow-y-auto overflow-x-hidden`}
        >
            {loading && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/20">
                    <div className="rounded-lg bg-white px-6 py-4 shadow-lg">Đang tải dữ liệu…</div>
                </div>
            )}

            {!inIframe && <h1 className="text-xl font-bold text-gray-800 mb-4">Báo cáo vận hành</h1>}

            {error && (
                <div
                    className={`rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-800 sm:text-sm ${c ? 'mb-2' : 'mb-4'}`}
                    role="alert"
                >
                    {error}
                </div>
            )}

            {activeTab !== 'tab2' && (
                <div
                    className={`flex flex-wrap items-center rounded-lg bg-white shadow ${c ? 'mb-2 gap-2 p-2' : 'mb-4 gap-3 p-4 items-end'}`}
                >
                    <label className="text-xs text-gray-700">
                        Chọn nhanh
                        <select
                            className="ml-1 rounded border border-gray-300 px-2 py-1 text-xs"
                            value={reportFilters.dateRange}
                            onChange={(e) => setReportFilters((p) => ({ ...p, dateRange: e.target.value }))}
                        >
                            <option value="">— Tùy chọn —</option>
                            <option value="last10Days">10 ngày gần nhất</option>
                            <option value="last3Days">3 ngày gần nhất</option>
                            <option value="thisWeek">Tuần này</option>
                            <option value="lastWeek">Tuần trước</option>
                            <option value="thisMonth">Tháng này</option>
                        </select>
                    </label>
                    <label className="text-xs text-gray-700">
                        Từ
                        <input
                            type="date"
                            className="ml-1 rounded border border-gray-300 px-2 py-1 text-xs"
                            value={reportFilters.startDate}
                            onChange={(e) => setReportFilters((p) => ({ ...p, startDate: e.target.value, dateRange: '' }))}
                        />
                    </label>
                    <label className="text-xs text-gray-700">
                        Đến
                        <input
                            type="date"
                            className="ml-1 rounded border border-gray-300 px-2 py-1 text-xs"
                            value={reportFilters.endDate}
                            onChange={(e) => setReportFilters((p) => ({ ...p, endDate: e.target.value, dateRange: '' }))}
                        />
                    </label>
                    {isAdmin && (
                        <div className="relative">
                            <button
                                ref={staffButtonRef}
                                type="button"
                                className="rounded border border-gray-400 bg-white px-3 py-1 text-xs hover:bg-gray-50"
                                onClick={() => setShowStaffDropdown(!showStaffDropdown)}
                            >
                                {reportFilters.staff.length > 0 ? `${reportFilters.staff.length} NV` : 'NV Vận đơn'}
                            </button>
                            {showStaffDropdown &&
                                createPortal(
                                    <div
                                        ref={staffDropdownRef}
                                        className="fixed z-[10000] max-h-72 min-w-[200px] overflow-y-auto rounded border border-gray-300 bg-white shadow-lg"
                                        style={{
                                            top: staffDropdownPosition.top,
                                            left: staffDropdownPosition.left,
                                            width: staffDropdownPosition.width
                                        }}
                                    >
                                        <button
                                            type="button"
                                            className="block w-full border-b px-3 py-2 text-left text-xs hover:bg-gray-50"
                                            onClick={() => {
                                                if (reportFilters.staff.length === uniqueStaff.length) {
                                                    setReportFilters((p) => ({ ...p, staff: [] }));
                                                } else {
                                                    setReportFilters((p) => ({ ...p, staff: [...uniqueStaff] }));
                                                }
                                            }}
                                        >
                                            Chọn tất cả
                                        </button>
                                        {uniqueStaff.map((s) => (
                                            <label
                                                key={s}
                                                className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-xs hover:bg-gray-50"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={reportFilters.staff.includes(s)}
                                                    onChange={(e) => {
                                                        const on = e.target.checked;
                                                        setReportFilters((p) => ({
                                                            ...p,
                                                            staff: on ? [...p.staff, s] : p.staff.filter((x) => x !== s)
                                                        }));
                                                    }}
                                                />
                                                {s}
                                            </label>
                                        ))}
                                    </div>,
                                    document.body
                                )}
                        </div>
                    )}
                    <div className="min-w-[140px]">
                        <MultiSelect
                            label="Mặt hàng"
                            options={uniqueProducts}
                            selected={reportFilters.product}
                            onChange={(sel) => setReportFilters((p) => ({ ...p, product: sel }))}
                            placeholder="Mặt hàng"
                            mainFilter
                        />
                    </div>
                    <div className="min-w-[140px]">
                        <MultiSelect
                            label="Khu vực"
                            options={uniqueMarkets}
                            selected={reportFilters.market}
                            onChange={(sel) => setReportFilters((p) => ({ ...p, market: sel }))}
                            placeholder="Khu vực"
                            mainFilter
                        />
                    </div>
                    <button
                        type="button"
                        disabled={loading}
                        className={`rounded bg-[#20744a] font-semibold text-white disabled:bg-gray-400 ${c ? 'px-2 py-1 text-[11px]' : 'px-4 py-1.5 text-xs'}`}
                        onClick={runTabSearch}
                    >
                        {loading ? 'Đang tải…' : '🔍 Tìm'}
                    </button>
                    <button
                        type="button"
                        className={`rounded border border-gray-400 text-xs ${c ? 'px-2 py-1' : 'px-3 py-1.5'}`}
                        onClick={() => {
                            setReportFilters({
                                dateRange: '',
                                startDate: '',
                                endDate: '',
                                product: [],
                                market: [],
                                staff: []
                            });
                            setRawData([]);
                            setError(null);
                            const p = new URLSearchParams(searchParams);
                            p.delete('from_date');
                            p.delete('to_date');
                            setSearchParams(p, { replace: true });
                        }}
                    >
                        Xóa lọc
                    </button>
                </div>
            )}

            <div className="mb-0 flex w-full flex-wrap gap-0 border-b-2 border-[#FFA500]">
                {[
                    { id: 'tab1', label: 'Thống kê giao dịch' },
                    { id: 'tab2', label: 'BC Vận Hành' },
                    { id: 'tab3', label: 'Thống Kê Đơn' },
                    { id: 'tab4', label: 'Đẩy đơn theo ngày' },
                    { id: 'tab5', label: 'Trạng thái đơn' }
                ].map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={`rounded-t border border-gray-400 border-b-0 font-semibold transition-colors ${
                            c
                                ? 'px-2 py-0.5 text-[10px] leading-tight sm:text-[11px]'
                                : 'rounded-t-md px-3 py-2 text-xs sm:px-4 sm:text-sm font-bold'
                        } ${activeTab === t.id ? 'bg-[#FFA500] text-black' : 'bg-gray-200 text-gray-800'}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Tab 1 — Thống kê giao dịch (1 dòng tổng, giống mẫu HTML) */}
            {activeTab === 'tab1' && (
                <div className={`overflow-x-auto rounded-b-md rounded-tr-md bg-white shadow-lg ${c ? 'p-2' : 'p-4'}`}>
                    <div className={`flex flex-wrap justify-end ${c ? 'mb-2 gap-2' : 'mb-3 gap-3'}`}>
                        <button
                            type="button"
                            disabled={loading || rawData.length === 0}
                            className="rounded bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white disabled:bg-gray-400"
                            onClick={exportTab1MaDonExcel}
                            title="Xuất Excel một cột «Mã đơn hàng» theo ngày tab 1 và bộ lọc đã tải (Mặt hàng / khu vực / NV)"
                        >
                            📥 Excel mã đơn
                        </button>
                        <button
                            type="button"
                            disabled={loading}
                            className="rounded bg-[#20744a] px-4 py-1.5 text-xs font-semibold text-white disabled:bg-gray-400"
                            onClick={runTabSearch}
                        >
                            {loading ? 'Đang tải…' : '🔍 Tìm'}
                        </button>
                    </div>
                    <table className="min-w-max w-full border-collapse text-sm text-black">
                        <thead>
                            <tr>
                                <th rowSpan={2} className="bg-[#679B48] px-3 py-2 font-normal">
                                    Ngày đầu
                                </th>
                                <th rowSpan={2} className="bg-[#679B48] px-3 py-2 font-normal">
                                    Ngày cuối
                                </th>
                                <th colSpan={2} className="bg-[#A9D08E] px-3 py-2 font-normal">
                                    Đã thanh toán
                                </th>
                                <th
                                    rowSpan={2}
                                    className="bg-lime-400 px-3 py-2 font-normal leading-tight"
                                    title="Tổng trọng số nhóm «giao OK» trên histogram NB: gồm nhãn chứa «giao thành công» hoặc «đơn thành công». Khác với lọc Vận đơn theo đúng một chuỗi (ví dụ chỉ «Đơn thành công»)."
                                >
                                    Đơn
                                    <br />
                                    thành
                                    <br />
                                    công
                                </th>
                                <th colSpan={2} className="bg-[#FFFF00] px-3 py-2 font-normal">
                                    Đơn có mã
                                </th>
                                <th rowSpan={2} className="bg-[#F4B084] px-3 py-2 font-normal leading-tight">
                                    tổng đơn đẩy
                                    <br />
                                    VH chưa mã
                                </th>
                                <th rowSpan={2} className="bg-[#F4B084] px-3 py-2 font-normal leading-tight">
                                    Doanh số đơn
                                    <br />
                                    chưa mã
                                </th>
                                <th
                                    rowSpan={2}
                                    className="bg-[#FFC000] px-3 py-2 font-normal"
                                    title="Công thức: (Số đơn «Đã thanh toán») ÷ (số «Đơn thành công» — cột histogram giao TC) × 100"
                                >
                                    Tỉ lệ/đơn giao tc
                                </th>
                                <th
                                    rowSpan={2}
                                    className="bg-[#FFC000] px-3 py-2 font-normal leading-tight"
                                    title="Công thức: (Số đơn «Đã thanh toán») ÷ (Số đơn «Đơn có mã») × 100"
                                >
                                    Tỉ lệ
                                    <br />
                                    / đơn có mã
                                </th>
                            </tr>
                            <tr>
                                <th className="bg-[#A9D08E] px-3 py-2 font-normal">Số đơn</th>
                                <th className="bg-[#A9D08E] px-3 py-2 font-normal">Số tiền</th>
                                <th className="bg-[#FFFF00] px-3 py-2 font-normal">Số đơn</th>
                                <th className="bg-[#FFFF00] px-3 py-2 font-normal">Số tiền</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="px-3 py-2 align-middle">
                                    <input
                                        type="date"
                                        className="w-full min-w-[9.5rem] rounded border border-gray-300 px-2 py-1 text-sm"
                                        value={reportFilters.startDate}
                                        onChange={(e) =>
                                            setReportFilters((p) => ({
                                                ...p,
                                                startDate: e.target.value,
                                                dateRange: ''
                                            }))
                                        }
                                    />
                                </td>
                                <td className="px-3 py-2 align-middle">
                                    <input
                                        type="date"
                                        className="w-full min-w-[9.5rem] rounded border border-gray-300 px-2 py-1 text-sm"
                                        value={reportFilters.endDate}
                                        onChange={(e) =>
                                            setReportFilters((p) => ({
                                                ...p,
                                                endDate: e.target.value,
                                                dateRange: ''
                                            }))
                                        }
                                    />
                                </td>
                                <td className="px-3 py-2 font-extrabold tabular-nums">
                                    {formatSlVi(tab1Operational.donCoBill)}
                                </td>
                                <td className="px-3 py-2 font-extrabold tabular-nums">
                                    {formatNumVi(tab1Operational.donCoBillAmount)}
                                </td>
                                <td className="px-3 py-2 font-extrabold tabular-nums">
                                    {formatSlVi(tab1Operational.giaoTC)}
                                </td>
                                <td className="px-3 py-2 font-extrabold tabular-nums">
                                    {formatSlVi(tab1Operational.coMa)}
                                </td>
                                <td className="px-3 py-2 font-extrabold tabular-nums">
                                    {formatNumVi(tab1Operational.coMaAmount)}
                                </td>
                                <td className="bg-[#F4B084] px-3 py-2 font-extrabold tabular-nums">
                                    {formatSlVi(tab1Operational.chuaCoMa)}
                                </td>
                                <td className="bg-[#F4B084] px-3 py-2 font-extrabold tabular-nums">
                                    {formatNumVi(tab1Operational.doanhSoDonChuaMa)}
                                </td>
                                <td
                                    className="px-3 py-2 font-extrabold tabular-nums"
                                    title="(Số đơn «Đã thanh toán») ÷ (cột «Đơn thành công») × 100"
                                >
                                    {formatPct(tab1Operational.donCoBill, tab1Operational.giaoTC)}
                                </td>
                                <td
                                    className="px-3 py-2 font-extrabold tabular-nums"
                                    title="(Số đơn cột «Đã thanh toán») ÷ (Số đơn cột «Đơn có mã») × 100 — cùng số với hai ô bên trái"
                                >
                                    {formatPct(tab1Operational.donCoBill, tab1Operational.coMa)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    {rawData.length === 0 && !loading && (
                        <p className="mt-3 text-center text-sm text-gray-500">Chưa có dữ liệu — chọn ngày và bấm Tìm.</p>
                    )}
                </div>
            )}

            {/* Tab 2 — BC Vận Hành (layout mẫu Excel) */}
            {activeTab === 'tab2' && (
                <div
                    ref={bcvhWrapRef}
                    className={`bcvh-wrap rounded-b-md rounded-tr-md bg-white shadow-lg ${c ? 'p-2' : 'p-4'} ${bcvhCardLayout}`}
                >
                    <div className="bcvh-sticky-head shrink-0">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                        {/* Bộ lọc + nhãn cố định cột — cùng một hàng phía trái */}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
                            <div className="fixed-col-control shrink-0 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-xs">
                                Cố định 4 cột đầu
                            </div>
                            <label className="flex items-center gap-1">
                                Chọn nhanh
                                <select
                                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                                    value={reportFilters.dateRange}
                                    onChange={(e) => setReportFilters((p) => ({ ...p, dateRange: e.target.value }))}
                                >
                                    <option value="">— Tùy chọn —</option>
                                    <option value="last10Days">10 ngày gần nhất</option>
                                    <option value="last3Days">3 ngày gần nhất</option>
                                    <option value="thisWeek">Tuần này</option>
                                    <option value="lastWeek">Tuần trước</option>
                                    <option value="thisMonth">Tháng này</option>
                                </select>
                            </label>
                            <label className="flex items-center gap-1">
                                Từ ngày
                                <input
                                    type="date"
                                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                                    value={reportFilters.startDate}
                                    onChange={(e) =>
                                        setReportFilters((p) => ({
                                            ...p,
                                            startDate: e.target.value,
                                            dateRange: ''
                                        }))
                                    }
                                />
                            </label>
                            <label className="flex items-center gap-1">
                                Đến ngày
                                <input
                                    type="date"
                                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                                    value={reportFilters.endDate}
                                    onChange={(e) =>
                                        setReportFilters((p) => ({
                                            ...p,
                                            endDate: e.target.value,
                                            dateRange: ''
                                        }))
                                    }
                                />
                            </label>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={addBcvhRow}
                                disabled={bcvhCriteriaRows.length >= MAX_BCVH_ROWS_TOTAL}
                                className="shrink-0 rounded border border-gray-400 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                                title={
                                    bcvhCriteriaRows.length >= MAX_BCVH_ROWS_TOTAL
                                        ? `Tối đa ${MAX_BCVH_ROWS_TOTAL} dòng`
                                        : 'Thêm dòng (chỉnh ngày & bộ lọc riêng)'
                                }
                            >
                                + Thêm dòng
                            </button>
                        </div>
                    </div>
                    <div className="mb-2 flex flex-wrap items-end gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700">
                        <span className="self-center font-medium text-gray-600">Áp dụng hàng loạt:</span>
                        <div className="min-w-[9.5rem] max-w-[14rem] flex-1">
                            <MultiSelect
                                label="Sản phẩm"
                                placeholder="Sản phẩm"
                                options={uniqueProducts}
                                selected={bcvhBulkProduct}
                                onChange={setBcvhBulkProduct}
                                compact
                            />
                        </div>
                        <div className="min-w-[9.5rem] max-w-[14rem] flex-1">
                            <MultiSelect
                                label="Thị trường"
                                placeholder="Thị trường"
                                options={uniqueMarkets}
                                selected={bcvhBulkMarket}
                                onChange={setBcvhBulkMarket}
                                compact
                            />
                        </div>
                        <button
                            type="button"
                            disabled={loading}
                            className="rounded bg-[#20744a] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#1a5f3c] disabled:bg-gray-400"
                            onClick={runTab2SearchWithBulk}
                            title="Áp dụng SP/TT hàng loạt lên các dòng báo cáo (để trống = một dòng không lọc SP/TT), rồi tải dữ liệu."
                        >
                            {loading ? 'Đang tải…' : '🔍 Tìm'}
                        </button>
                        <button
                            type="button"
                            className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50"
                            onClick={clearAllBcvhProductMarketFilters}
                            title="Xóa hết các dòng trong bảng (và bộ lọc hàng loạt)"
                        >
                            Xóa tất cả dòng
                        </button>
                    </div>
                    <div className="bcvh-split-title">
                        <div className="bcvh-title-row text-center uppercase tracking-wide">BÁO CÁO VẬN HÀNH</div>
                    </div>
                    </div>
                    <div className="bcvh-split bcvh-split-stack flex min-h-0 flex-1 flex-row items-stretch gap-2">
                        <div
                            ref={bcvhLeftColumnRef}
                            className="flex min-h-0 shrink-0 flex-col"
                        >
                            <div className="bcvh-fixed-pane bcvh-fixed-pane-head shrink-0">
                                <table
                                    ref={bcvhFixedHeadTableRef}
                                    className="bcvh-fixed-table min-w-max border-separate border-spacing-0"
                                >
                                    <thead>
                                        <tr>
                                            <th
                                                rowSpan={2}
                                                className="bcvh-h-info whitespace-nowrap bcvh-col-1"
                                            >
                                                Ngày đầu
                                            </th>
                                            <th
                                                rowSpan={2}
                                                className="bcvh-h-info whitespace-nowrap bcvh-col-2"
                                            >
                                                Ngày cuối
                                            </th>
                                            <th rowSpan={2} className="bcvh-h-info bcvh-col-3">
                                                Sản phẩm
                                            </th>
                                            <th rowSpan={2} className="bcvh-h-info bcvh-col-4">
                                                Thị Trường
                                            </th>
                                        </tr>
                                        {/* Hàng thứ hai để rowspan=2 hợp lệ khi thead tách khỏi tbody */}
                                        <tr aria-hidden="true" />
                                    </thead>
                                </table>
                            </div>
                            <div
                                ref={bcvhFixedPaneRef}
                                className="bcvh-fixed-pane bcvh-fixed-pane-scroll min-h-0 flex-1"
                            >
                                <table
                                    ref={bcvhFixedTableRef}
                                    className="bcvh-fixed-table bcvh-fixed-body-table relative z-[1] -mt-px min-w-max border-separate border-spacing-0"
                                >
                                    <tbody>
                                        {bcvhLines.map((line) => (
                                            <tr key={line.id}>
                                                <td
                                                    className="bcvh-cell bcvh-cell-left whitespace-nowrap bcvh-col-1"
                                                >
                                                    <input
                                                        type="date"
                                                        readOnly={!line.isManual}
                                                        title={
                                                            line.isManual
                                                                ? 'Dòng thêm tay — chỉnh ngày'
                                                                : 'Bắt đầu khoảng (theo Từ ngày ở bộ lọc trên)'
                                                        }
                                                        className={`bcvh-cell-input text-gray-700 ${line.isManual ? '' : 'cursor-default bg-gray-50'}`}
                                                        value={line.startDate || ''}
                                                        onChange={
                                                            line.isManual
                                                                ? (e) =>
                                                                      patchBcvhRow(line.id, {
                                                                          startDate: e.target.value
                                                                      })
                                                                : undefined
                                                        }
                                                    />
                                                </td>
                                                <td
                                                    className="bcvh-cell bcvh-cell-left whitespace-nowrap bcvh-col-2"
                                                >
                                                    <input
                                                        type="date"
                                                        readOnly={!line.isManual}
                                                        title={
                                                            line.isManual
                                                                ? 'Dòng thêm tay — chỉnh ngày'
                                                                : 'Kết thúc khoảng (theo Đến ngày ở bộ lọc trên)'
                                                        }
                                                        className={`bcvh-cell-input text-gray-700 ${line.isManual ? '' : 'cursor-default bg-gray-50'}`}
                                                        value={line.endDate || ''}
                                                        onChange={
                                                            line.isManual
                                                                ? (e) =>
                                                                      patchBcvhRow(line.id, {
                                                                          endDate: e.target.value
                                                                      })
                                                                : undefined
                                                        }
                                                    />
                                                </td>
                                                <td className="bcvh-cell bcvh-cell-left bcvh-col-3 align-middle">
                                                    <div className="min-w-[7rem] max-w-[11rem]">
                                                        <MultiSelect
                                                            label="SP"
                                                            placeholder="SP"
                                                            options={uniqueProducts}
                                                            selected={
                                                                getEffectiveBcvhPmForRow(reportFilters, line)
                                                                    .product
                                                            }
                                                            onChange={(sel) =>
                                                                patchBcvhRow(line.id, {
                                                                    product: decodeBcvhRowProductFromUi(
                                                                        sel,
                                                                        reportFilters.product
                                                                    )
                                                                })
                                                            }
                                                            compact
                                                        />
                                                    </div>
                                                </td>
                                                <td className="bcvh-cell bcvh-cell-left bcvh-col-4 align-middle">
                                                    <div className="flex min-w-[7rem] max-w-[11rem] items-center gap-1">
                                                        <div className="min-w-0 flex-1">
                                                            <MultiSelect
                                                                label="TT"
                                                                placeholder="TT"
                                                                options={uniqueMarkets}
                                                                selected={
                                                                    getEffectiveBcvhPmForRow(reportFilters, line)
                                                                        .market
                                                                }
                                                                onChange={(sel) =>
                                                                    patchBcvhRow(line.id, {
                                                                        market: decodeBcvhRowMarketFromUi(
                                                                            sel,
                                                                            reportFilters.market
                                                                        )
                                                                    })
                                                                }
                                                                compact
                                                            />
                                                        </div>
                                                        {line.isManual && (
                                                            <button
                                                                type="button"
                                                                className="shrink-0 rounded border border-red-300 px-1.5 py-0.5 text-xs text-red-700 hover:bg-red-50"
                                                                title="Xóa dòng thêm tay"
                                                                onClick={() => removeBcvhRow(line.id)}
                                                            >
                                                                ×
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {rawData.length > 0 && (
                                            <tr className="bcvh-total-row">
                                                <td
                                                    colSpan={4}
                                                    className="bcvh-cell bcvh-cell-left font-bold uppercase"
                                                >
                                                    TỔNG
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                            <div className="bcvh-metric-head-band flex shrink-0 items-stretch">
                                <div
                                    ref={bcvhMetricHeadScrollRef}
                                    className="bcvh-scroll-main bcvh-metric-head-scroll min-h-0 min-w-0 flex-1"
                                >
                                    <table
                                        ref={bcvhScrollHeadTableRef}
                                        className="bcvh-metric-table bcvh-metric-colsync border-separate border-spacing-0"
                                    >
                                        {renderBcvhMetricThead()}
                                    </table>
                                </div>
                            </div>
                            <div className="bcvh-metric-scroll-wrap flex min-h-0 min-w-0 flex-1 flex-col">
                                <div
                                    ref={bcvhScrollRef}
                                    className="bcvh-scroll bcvh-scroll-metric bcvh-scroll-main bcvh-metric-body-scroll min-h-0 min-w-0 flex-1 overflow-auto"
                                >
                                    <table
                                        ref={bcvhScrollTableRef}
                                        className="bcvh-metric-table bcvh-metric-colsync relative z-[1] -mt-px border-separate border-spacing-0"
                                    >
                                        <tbody>
                                            {bcvhLines.map((line, idx) => (
                                                <tr key={line.id}>
                                                    {renderBcvhMetricCells(
                                                        line.metrics,
                                                        bcvhSlicesByRow[idx],
                                                        bcvhRowContextLabel(line)
                                                    )}
                                                </tr>
                                            ))}
                                            {rawData.length > 0 && (
                                                <tr className="bcvh-total-row">
                                                    {renderBcvhMetricCells(
                                                        bcvhTotal,
                                                        bcvhSlicesByRow.flat(),
                                                        'TỔNG'
                                                    )}
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {bcvhDrill &&
                createPortal(
                    <div
                        className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/40 p-4"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="bcvh-drill-title"
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget) setBcvhDrill(null);
                        }}
                    >
                        <div
                            className="flex max-h-[85vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl select-text"
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <div className="flex shrink-0 flex-col gap-1 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                <div className="min-w-0 select-text">
                                    <h2 id="bcvh-drill-title" className="text-sm font-bold text-gray-900">
                                        {bcvhDrill.title}
                                    </h2>
                                    <p className="mt-1 text-[11px] text-gray-500">
                                        Bôi đen một hoặc nhiều ô (kéo qua nhiều dòng/cột), rồi Ctrl+C — dán vào Excel
                                        được tách cột bằng tab.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="shrink-0 select-none rounded border border-gray-400 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                    onClick={() => setBcvhDrill(null)}
                                >
                                    Đóng (Esc)
                                </button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-auto p-4 select-text">
                                {bcvhDrill.rows.length === 0 ? (
                                    <p className="text-center text-sm text-gray-500 select-text">Không có đơn.</p>
                                ) : (
                                    <table className="bcvh-drill-table min-w-full border-collapse text-xs text-black">
                                        <thead className="sticky top-0 z-[1] bg-gray-100">
                                            <tr>
                                                <th className="border border-gray-300 px-2 py-1.5 text-left">
                                                    Mã đơn
                                                </th>
                                                <th className="border border-gray-300 px-2 py-1.5 text-left">
                                                    Ngày lên đơn
                                                </th>
                                                <th className="border border-gray-300 px-2 py-1.5 text-left">
                                                    Mặt hàng
                                                </th>
                                                <th className="border border-gray-300 px-2 py-1.5 text-left">
                                                    Khu vực
                                                </th>
                                                <th className="border border-gray-300 px-2 py-1.5 text-left">
                                                    NV vận đơn
                                                </th>
                                                <th className="border border-gray-300 px-2 py-1.5 text-left">
                                                    Kết quả check
                                                </th>
                                                <th className="border border-gray-300 px-2 py-1.5 text-left">
                                                    Giao hàng NB
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bcvhDrill.rows.map((r) => {
                                                const code =
                                                    (r.order_code && String(r.order_code).trim()) ||
                                                    String(r.id ?? '');
                                                return (
                                                    <tr key={String(r.id)} className="hover:bg-gray-50">
                                                        <td className="border border-gray-300 px-2 py-1.5 align-top">
                                                            <span className="font-medium text-gray-900">
                                                                {code || '—'}
                                                            </span>
                                                            {r._source === 'orders' && code ? (
                                                                <Link
                                                                    to="/van-don"
                                                                    className="ml-2 inline-block align-baseline text-[11px] text-blue-700 hover:underline"
                                                                    onClick={() => setBcvhDrill(null)}
                                                                >
                                                                    Mở
                                                                </Link>
                                                            ) : null}
                                                        </td>
                                                        <td className="whitespace-nowrap border border-gray-300 px-2 py-1.5">
                                                            {r['Ngày lên đơn'] || '—'}
                                                        </td>
                                                        <td className="border border-gray-300 px-2 py-1.5">
                                                            {r['Mặt hàng'] || '—'}
                                                        </td>
                                                        <td className="border border-gray-300 px-2 py-1.5">
                                                            {r['khu vực'] || '—'}
                                                        </td>
                                                        <td className="border border-gray-300 px-2 py-1.5">
                                                            {r['NV Vận đơn'] || '—'}
                                                        </td>
                                                        <td className="max-w-[200px] whitespace-pre-wrap border border-gray-300 px-2 py-1.5">
                                                            {r['Kết quả check'] ?? '—'}
                                                        </td>
                                                        <td className="max-w-[220px] border border-gray-300 px-2 py-1.5 text-[11px] whitespace-pre-wrap">
                                                            {r['Trạng thái giao hàng NB'] ?? '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

            {/* Tab 3 — Thống Kê Đơn (matrix) */}
            {activeTab === 'tab3' && (
            <div className={`overflow-x-auto rounded-b-md rounded-tr-md bg-white shadow-lg ${c ? 'p-2' : 'p-4'}`}>
                <table className="min-w-max w-full border-collapse text-[13px] text-black">
                    <thead>
                        <tr>
                            <th
                                colSpan={colSpanMain}
                                className="border border-black bg-[#38761D] py-2 text-lg font-bold tracking-wide text-white"
                            >
                                THỐNG KÊ ĐƠN (THEO THỊ TRƯỜNG)
                            </th>
                        </tr>
                        <tr>
                            <th
                                rowSpan={2}
                                className="w-48 border border-black bg-[#A9D08E] px-3 py-2 font-bold"
                            >
                                Thị trường / Tiêu chí
                            </th>
                            {markets.map((mk) => (
                                <th
                                    key={mk}
                                    colSpan={2}
                                    className="border border-black bg-[#A9D08E] px-3 py-2 font-bold"
                                >
                                    {mk}
                                </th>
                            ))}
                            <th colSpan={2} className="border border-black bg-[#FFFF00] px-3 py-2 font-bold">
                                TỔNG
                            </th>
                        </tr>
                        <tr>
                            {markets.map((mk) => (
                                <React.Fragment key={`${mk}-sub`}>
                                    <th className="border border-black bg-[#A9D08E] px-3 py-2 font-bold">SL đơn</th>
                                    <th className="border border-black bg-[#A9D08E] px-3 py-2 font-bold">Thành tiền</th>
                                </React.Fragment>
                            ))}
                            <th className="border border-black bg-[#FFFF00] px-3 py-2 font-bold">SL đơn</th>
                            <th className="border border-black bg-[#FFFF00] px-3 py-2 font-bold">Thành tiền</th>
                        </tr>
                    </thead>
                    <tbody className="bg-[#FDE9D9]">
                        <tr className="bg-lime-400 font-bold">
                            <td className="border border-black px-3 py-2">Tổng lên đơn</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`tl-${mk}`}>
                                    {renderMetricPair(byMarket[mk].tongLenDon, byMarket[mk].tongLenDonAmount)}
                                </React.Fragment>
                            ))}
                            {renderMetricPair(total.tongLenDon, total.tongLenDonAmount)}
                        </tr>
                        <tr>
                            <td className="border border-black px-3 py-2 font-bold">OK</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`ok-${mk}`}>
                                    {renderMetricPair(byMarket[mk].ok, byMarket[mk].okAmount)}
                                </React.Fragment>
                            ))}
                            {renderMetricPair(total.ok, total.okAmount)}
                        </tr>
                        <tr className="bg-yellow-300 font-bold">
                            <td className="border border-black px-3 py-2">Tỷ lệ OK / Tổng đơn (%)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`tok-${mk}`}>
                                    {renderPctPair(formatPct(byMarket[mk].ok, byMarket[mk].tongLenDon))}
                                </React.Fragment>
                            ))}
                            {renderPctPair(formatPct(total.ok, total.tongLenDon))}
                        </tr>
                        <tr>
                            <td className="border border-black px-3 py-2">Treo</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`tr-${mk}`}>
                                    {renderMetricPair(byMarket[mk].treo, byMarket[mk].treoAmount)}
                                </React.Fragment>
                            ))}
                            {renderMetricPair(total.treo, total.treoAmount)}
                        </tr>
                        <tr>
                            <td className="border border-black px-3 py-2">Đợi hàng</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`dh-${mk}`}>
                                    {renderMetricPair(byMarket[mk].doiHang, byMarket[mk].doiHangAmount)}
                                </React.Fragment>
                            ))}
                            {renderMetricPair(total.doiHang, total.doiHangAmount)}
                        </tr>
                        <tr>
                            <td className="border border-black px-3 py-2">Khách hẹn (kết quả check)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`kh-${mk}`}>
                                    {renderMetricPair(byMarket[mk].khachHen, byMarket[mk].khachHenAmount)}
                                </React.Fragment>
                            ))}
                            {renderMetricPair(total.khachHen, total.khachHenAmount)}
                        </tr>
                        <tr className="text-red-600">
                            <td className="border border-black px-3 py-2">Tổng hủy (kq check)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`hc-${mk}`}>
                                    {renderMetricPair(byMarket[mk].huyCheck, byMarket[mk].huyCheckAmount)}
                                </React.Fragment>
                            ))}
                            {renderMetricPair(total.huyCheck, total.huyCheckAmount)}
                        </tr>
                        <tr className="text-red-700 font-semibold">
                            <td className="border border-black px-3 py-2 leading-tight">
                                Huỷ vận hành
                                <span className="block text-xs font-normal font-sans">
                                    (có Đơn vị vận chuyển + kết quả check Huỷ)
                                </span>
                            </td>
                            {markets.map((mk) => (
                                <React.Fragment key={`hvh-${mk}`}>
                                    {renderMetricPair(byMarket[mk].huyVanHanh, byMarket[mk].huyVanHanhAmount)}
                                </React.Fragment>
                            ))}
                            {renderMetricPair(total.huyVanHanh, total.huyVanHanhAmount)}
                        </tr>
                        <tr className="font-bold text-red-600">
                            <td className="border border-black px-3 py-2">Tổng đơn sau hủy</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`sh-${mk}`}>
                                    {renderMetricPair(byMarket[mk].sauHuy, byMarket[mk].sauHuyAmount)}
                                </React.Fragment>
                            ))}
                            {renderMetricPair(total.sauHuy, total.sauHuyAmount)}
                        </tr>
                        <tr className="italic text-red-600">
                            <td className="border border-black px-3 py-2 not-italic">Tỷ lệ hủy (%)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`th-${mk}`}>
                                    {renderPctPair(formatPct(byMarket[mk].huyCheck, byMarket[mk].tongLenDon))}
                                </React.Fragment>
                            ))}
                            {renderPctPair(formatPct(total.huyCheck, total.tongLenDon))}
                        </tr>
                        <tr className="bg-yellow-300 font-bold">
                            <td className="border border-black px-3 py-2 leading-tight">
                                Đơn đẩy vận hành
                                <span className="block text-xs font-normal">
                                    (đơn có cột Đơn vị vận chuyển không trống)
                                </span>
                            </td>
                            {markets.map((mk) => (
                                <React.Fragment key={`ddvh-${mk}`}>
                                    {renderMetricPair(byMarket[mk].donDayVanHanh, byMarket[mk].donDayVanHanhAmount)}
                                </React.Fragment>
                            ))}
                            {renderMetricPair(total.donDayVanHanh, total.donDayVanHanhAmount)}
                        </tr>
                        <tr className="bg-yellow-300 font-bold">
                            <td className="border border-black px-3 py-2">Tỷ lệ đẩy / Tổng đơn (%)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`tdt-${mk}`}>
                                    {renderPctPair(
                                        formatPct(byMarket[mk].donDayVanHanh, byMarket[mk].tongLenDon)
                                    )}
                                </React.Fragment>
                            ))}
                            {renderPctPair(formatPct(total.donDayVanHanh, total.tongLenDon))}
                        </tr>
                        <tr>
                            <td className="border border-black px-3 py-2">Giao Thành Công</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`gtc-${mk}`}>
                                    {renderMetricPair(byMarket[mk].giaoTC, byMarket[mk].giaoTCAmount)}
                                </React.Fragment>
                            ))}
                            {renderMetricPair(total.giaoTC, total.giaoTCAmount)}
                        </tr>
                        {/* Bỏ dòng MGT (theo key histogram) theo yêu cầu */}
                        <tr className="bg-cyan-200 font-bold">
                            <td className="border border-black px-3 py-2">Đơn có mã (Mã tracking)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`cm-${mk}`}>
                                    {renderMetricPair(byMarket[mk].coMa, byMarket[mk].coMaAmount)}
                                </React.Fragment>
                            ))}
                            {renderMetricPair(total.coMa, total.coMaAmount)}
                        </tr>
                        <tr className="bg-cyan-200 font-bold">
                            <td className="border border-black px-3 py-2">Đơn có bill (có bill, trừ 1 phần)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`bl-${mk}`}>
                                    {renderCoBillPair(byMarket[mk].donCoBill, byMarket[mk].donCoBillAmount)}
                                </React.Fragment>
                            ))}
                            {renderCoBillPair(total.donCoBill, total.donCoBillAmount)}
                        </tr>
                        <tr className="bg-yellow-300 font-bold">
                            <td className="border border-black px-3 py-2">Tỷ lệ thu tiền / đơn thành công (%)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`tcm-${mk}`}>
                                    {renderPctPair(formatPct(byMarket[mk].donCoBill, byMarket[mk].giaoTC))}
                                </React.Fragment>
                            ))}
                            {renderPctPair(formatPct(total.donCoBill, total.giaoTC))}
                        </tr>
                        <tr className="bg-yellow-300 font-bold">
                            <td className="border border-black px-3 py-2">Tỷ lệ vận hành (Giao TC / Tổng lên đơn)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`tvh-${mk}`}>
                                    {renderPctPair(formatPct(byMarket[mk].giaoTC, byMarket[mk].tongLenDon))}
                                </React.Fragment>
                            ))}
                            {renderPctPair(formatPct(total.giaoTC, total.tongLenDon))}
                        </tr>
                    </tbody>
                </table>
                {rawData.length === 0 && !loading && (
                    <p className="mt-3 text-center text-sm text-gray-500">Chưa có dữ liệu — chọn ngày và bấm Tìm.</p>
                )}
            </div>
            )}

            {/* Tab 4 — Đẩy đơn theo ngày (Mã tracking); 3 cột đầu sticky khi cuộn ngang */}
            {activeTab === 'tab4' && (
                <div className={`overflow-x-auto rounded-b-md rounded-tr-md bg-white shadow-lg ${c ? 'p-2' : 'p-4'}`}>
                    <table className="min-w-max w-full border-separate border-spacing-0 text-[11px] text-black">
                        <thead>
                            <tr className="bg-[#548235] text-white">
                                <th className="sticky left-0 z-20 w-16 min-w-[4rem] border border-black bg-[#548235] px-2 py-2 font-bold shadow-[4px_0_8px_-2px_rgba(0,0,0,0.2)]">
                                    Thị trường
                                </th>
                                <th className="sticky left-16 z-20 w-48 min-w-[12rem] border border-black bg-[#548235] px-2 py-2 font-bold shadow-[4px_0_8px_-2px_rgba(0,0,0,0.2)]">
                                    Sản phẩm
                                </th>
                                <th className="sticky left-64 z-20 border border-black bg-[#548235] px-2 py-2 font-bold leading-tight shadow-[4px_0_8px_-2px_rgba(0,0,0,0.2)]">
                                    TỔNG
                                    <br />
                                    lũy kế
                                </th>
                                {pushMatrix.dates.map((d) => (
                                    <th key={d} className="border border-black px-2 py-2 font-bold whitespace-nowrap">
                                        {isoToViDisplay(d)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="bg-lime-400 text-center font-bold">
                                <td
                                    colSpan={2}
                                    className="sticky left-0 z-10 box-border w-64 min-w-[16rem] border border-black bg-lime-400 px-2 py-1 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.15)]"
                                >
                                    Tổng
                                </td>
                                <td className="sticky left-64 z-10 border border-black bg-lime-400 px-2 py-1 font-extrabold tabular-nums shadow-[4px_0_8px_-2px_rgba(0,0,0,0.15)]">
                                    {formatSlVi(pushMatrix.grandTotal)}
                                </td>
                                {pushMatrix.dates.map((d) => (
                                    <td
                                        key={d}
                                        className="border border-black px-2 py-1 font-extrabold tabular-nums"
                                    >
                                        {formatSlVi(pushMatrix.colTotals[d] || 0)}
                                    </td>
                                ))}
                            </tr>
                            {(() => {
                                const list = pushMatrix.rows;
                                const rows = [];
                                let i = 0;
                                while (i < list.length) {
                                    let j = i + 1;
                                    while (j < list.length && list[j].market === list[i].market) j++;
                                    const rs = j - i;
                                    for (let k = 0; k < rs; k++) {
                                        const e = list[i + k];
                                        rows.push(
                                            <tr
                                                key={`${e.market}-${e.product}`}
                                                className={`text-center ${k % 2 === 0 ? 'bg-[#E6E6FA]' : 'bg-[#E6E6FA]'}`}
                                            >
                                                {k === 0 ? (
                                                    <td
                                                        rowSpan={rs}
                                                        className="sticky left-0 z-10 w-16 min-w-[4rem] border border-black bg-[#E6E6FA] px-2 py-1 font-bold shadow-[4px_0_8px_-2px_rgba(0,0,0,0.12)]"
                                                    >
                                                        {e.market}
                                                    </td>
                                                ) : null}
                                                <td className="sticky left-16 z-10 w-48 min-w-[12rem] border border-black bg-[#E6E6FA] px-2 py-1 text-left shadow-[4px_0_8px_-2px_rgba(0,0,0,0.12)]">
                                                    {e.product}
                                                </td>
                                                <td className="sticky left-64 z-10 border border-black bg-[#E6E6FA] px-2 py-1 font-extrabold tabular-nums shadow-[4px_0_8px_-2px_rgba(0,0,0,0.12)]">
                                                    {formatSlVi(e.total)}
                                                </td>
                                                {pushMatrix.dates.map((d) => (
                                                    <td
                                                        key={d}
                                                        className="border border-black px-2 py-1 font-extrabold tabular-nums"
                                                    >
                                                        {e.byDate[d] ? formatSlVi(e.byDate[d]) : ''}
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    }
                                    i = j;
                                }
                                return rows;
                            })()}
                        </tbody>
                    </table>
                    {!loading && (ffmPushRows?.length ?? 0) === 0 && (
                        <p className="mt-3 text-center text-sm text-gray-500">
                            Chưa có dữ liệu ffm_push_logs trong khoảng ngày — chọn ngày và bấm Tìm.
                        </p>
                    )}
                </div>
            )}

            {/* Tab 5 — Trạng thái đơn (theo ngày; DS = tổng tiền VNĐ theo cùng điều kiện ô SL) */}
            {activeTab === 'tab5' && (
                <div className={`overflow-x-auto rounded-b-md rounded-tr-md bg-white shadow-lg ${c ? 'p-2' : 'p-4'}`}>
                    <table className="min-w-max w-full border-collapse text-[11px] text-black">
                        <thead>
                            <tr className="text-center font-bold">
                                <th rowSpan={2} className="border border-black bg-lime-400 px-2 py-1">
                                    Ngày
                                </th>
                                <th rowSpan={2} className="border border-black bg-[#A9D08E] px-2 py-1 leading-tight">
                                    Có mã
                                    <br />
                                    (tracking)
                                </th>
                                <th rowSpan={2} className="border border-black bg-[#A9D08E] px-2 py-1 leading-tight">
                                    OK chưa
                                    <br />
                                    đẩy
                                </th>
                                <th rowSpan={2} className="border border-black bg-[#FFFF00] px-2 py-1 leading-tight">
                                    % Đẩy / OK
                                </th>
                                <th colSpan={2} className="border border-black bg-[#FFFF00] px-2 py-1">
                                    Tổng
                                </th>
                                <th colSpan={2} className="border border-black bg-lime-400 px-2 py-1">
                                    OK
                                </th>
                                <th colSpan={2} className="border border-black bg-lime-400 px-2 py-1">
                                    Treo
                                </th>
                                <th colSpan={2} className="border border-black bg-lime-400 px-2 py-1">
                                    Đợi hàng
                                </th>
                                <th colSpan={2} className="border border-black bg-lime-400 px-2 py-1">
                                    Khách hẹn
                                </th>
                                <th colSpan={2} className="border border-black bg-lime-400 px-2 py-1">
                                    Vận đơn XL
                                </th>
                                <th colSpan={2} className="border border-black bg-lime-400 px-2 py-1">
                                    Hủy (kq)
                                </th>
                                <th colSpan={2} className="border border-black bg-lime-400 px-2 py-1">
                                    Hủy (GH)
                                </th>
                                <th rowSpan={2} className="border border-black bg-lime-400 px-2 py-1 leading-tight">
                                    % hủy / tổng check
                                </th>
                            </tr>
                            <tr className="text-center font-bold">
                                <th className="border border-black bg-[#FFFF00] px-2 py-1">SL</th>
                                <th className="border border-black bg-[#FFFF00] px-2 py-1">DS</th>
                                <th className="border border-black bg-lime-400 px-2 py-1">SL</th>
                                <th className="border border-black bg-lime-400 px-2 py-1">DS</th>
                                <th className="border border-black bg-lime-400 px-2 py-1">SL</th>
                                <th className="border border-black bg-lime-400 px-2 py-1">DS</th>
                                <th className="border border-black bg-lime-400 px-2 py-1">SL</th>
                                <th className="border border-black bg-lime-400 px-2 py-1">DS</th>
                                <th className="border border-black bg-lime-400 px-2 py-1">SL</th>
                                <th className="border border-black bg-lime-400 px-2 py-1">DS</th>
                                <th className="border border-black bg-lime-400 px-2 py-1">SL</th>
                                <th className="border border-black bg-lime-400 px-2 py-1">DS</th>
                                <th className="border border-black bg-lime-400 px-2 py-1">SL</th>
                                <th className="border border-black bg-lime-400 px-2 py-1">DS</th>
                                <th className="border border-black bg-lime-400 px-2 py-1">SL</th>
                                <th className="border border-black bg-lime-400 px-2 py-1">DS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                {
                                    key: 'total',
                                    row: statusByDay.monthRow,
                                    trClass: 'bg-gray-50 font-bold text-red-600'
                                },
                                ...statusByDay.dayRows.map((r) => ({
                                    key: r.dateIso,
                                    row: r,
                                    trClass: 'text-black'
                                }))
                            ].map(({ key, row, trClass }) => (
                                <tr key={key} className={`text-center ${trClass}`}>
                                    <td className="border border-black px-2 py-1 text-left italic">{row.label}</td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums">
                                        {formatSlVi(row.coMa)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums text-red-600">
                                        {formatSlVi(row.okChuaDay)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums italic">
                                        {row.pctDayOk != null
                                            ? `${(100 * row.pctDayOk).toFixed(2).replace('.', ',')}%`
                                            : '—'}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums">
                                        {formatSlVi(row.tongLenDon)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums">
                                        {formatNumVi(row.dsTongLenDon)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums">
                                        {formatSlVi(row.ok)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums">
                                        {formatNumVi(row.dsOk)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums">
                                        {formatSlVi(row.treo)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums">
                                        {formatNumVi(row.dsTreo)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums">
                                        {formatSlVi(row.doiHang)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums">
                                        {formatNumVi(row.dsDoiHang)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums">
                                        {formatSlVi(row.khachHen)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums">
                                        {formatNumVi(row.dsKhachHen)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums">
                                        {formatSlVi(row.vanDonXL)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums">
                                        {formatNumVi(row.dsVanDonXL)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums">
                                        {formatSlVi(row.huyCheck)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums">
                                        {formatNumVi(row.dsHuyCheck)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums">
                                        {formatSlVi(row.huyGiao)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums">
                                        {formatNumVi(row.dsHuyGiao)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-extrabold tabular-nums text-red-600">
                                        {row.avgPctHuyVsTong != null
                                            ? `${(100 * row.avgPctHuyVsTong).toFixed(2).replace('.', ',')}%`
                                            : formatPct(row.huyCheck, row.tongLenDon)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {ordersRowsForTrangThai.length === 0 && !loading && (
                        <p className="mt-3 text-center text-sm text-gray-500">
                            Chưa có đơn từ bảng orders trong khoảng ngày — chọn ngày và bấm Tìm.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
