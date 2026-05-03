import JSZip from 'jszip';
import { Activity, AlertCircle, AlertTriangle, ArrowLeft, BarChart3, CheckCircle, Clock, CloudUpload, Database, Download, FileJson, Globe, Key, List, Lock, Package, RefreshCw, Save, Search, Settings, Shield, Table, Tag, Trash2, Upload, UserCheck, Users, X, Calendar, User, ArrowRight, GitMerge, LayoutGrid, GitBranch, PlayCircle } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import PermissionManager from '../components/admin/PermissionManager';
import usePermissions from '../hooks/usePermissions';
import { performEndOfShiftSnapshot } from '../services/snapshotService';
import { supabase } from '../supabase/config';
import { resolveTrangThaiThuTienFromOrder } from '../utils/orderTracking';
import * as ApiService from '../services/api';
import { runChiaDonVanDon } from '../services/chiaDonVanDon';

// Constants for LocalStorage Keys
export const SETTINGS_KEY = 'system_settings';

const DEFAULT_SETTINGS = {
    thresholds: {
        inventoryLow: 10,
        shippingDelay: 3
    },
    normalProducts: ["Bakuchiol Retinol", "Nám DR Hancy"], // List of manually added 'Normal' products
    rndProducts: ["Glutathione Collagen NEW", "Dragon Blood Cream", "Gel XK Thái", "Gel XK Phi"],
    keyProducts: ["Glutathione Collagen", "Kem Body", "DG", "Kẹo Táo"],
    keyMarkets: ["US", "Nhật Bản", "Hàn Quốc"],
    dataSource: 'prod' // 'prod' | 'test'
};

const CURRENCY_OPTIONS = [
    { key: 'usd', label: 'USD', symbol: '$' },
    { key: 'jpy', label: 'JPY (YEN)', symbol: '¥' },
    { key: 'cad', label: 'CAD', symbol: 'C$' },
    { key: 'aud', label: 'AUD', symbol: 'A$' },
    { key: 'gbp', label: 'GBP', symbol: '£' },
    { key: 'krw', label: 'KRW', symbol: '₩' },
];

// Helper to get settings
export const getSystemSettings = () => {

    try {
        const s = localStorage.getItem(SETTINGS_KEY);
        return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS;
    } catch {
        return DEFAULT_SETTINGS;
    }
};

const GLOBAL_SETTINGS_ID = 'global_config';

const CSKH_ORDER_TABLE_HN = 'orders';
const CSKH_ORDER_TABLE_HCM = 'order_code_hcm';

const ACCOUNT_TEMPLATE_ROWS = [
    {
        email: 'user01@example.com',
        username: 'user01',
        name: 'Nguyen Van A',
        password: '123456',
        role: 'user',
        branch: 'HCM',
        department: 'CSKH',
        can_day_ffm: 0
    }
];

function parseChiTietChiaForMerge(raw) {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
    if (typeof raw === 'string') {
        try {
            const p = JSON.parse(raw);
            return p && typeof p === 'object' && !Array.isArray(p) ? { ...p } : null;
        } catch {
            return null;
        }
    }
    return null;
}

function inferBranchLabelFromOrderTeam(teamRaw) {
    const t = String(teamRaw || '').toLowerCase();
    if (!t) return null;
    const hanoi = /\bhanoi\b|hà nội|ha noi|\bhn\b/.test(t);
    const hcm = /\bhcm\b|hồ chí minh|ho chi minh|tp\.?\s*hcm| tphcm/.test(t);
    if (hanoi && !hcm) return 'Hà Nội';
    if (hcm && !hanoi) return 'HCM';
    if (hanoi) return 'Hà Nội';
    if (hcm) return 'HCM';
    return null;
}

/** yyyy-MM-dd calendar day in VN (+07). */
function yyyyMmDdVietNamFromTimestamp(isoLike) {
    const d = new Date(isoLike);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
}

function inferOrderRowBranchForChiReport(row) {
    const p = parseChiTietChiaForMerge(row?.chi_tiet_chia);
    return inferBranchLabelFromOrderTeam(row?.team ?? p?.order_team ?? p?.branch);
}

/** Sắp xếp đơn chia: ưu tiên thu_tu_chia hợp lệ, rồi order_date, mã đơn. */
function sortChiaDonViewOrdersList(list) {
    return [...list].sort((a, b) => {
        const t1 = Number(a.thu_tu_chia);
        const t2 = Number(b.thu_tu_chia);
        const ok1 = Number.isFinite(t1) && t1 > 0;
        const ok2 = Number.isFinite(t2) && t2 > 0;
        if (ok1 && ok2 && t1 !== t2) return t1 - t2;
        if (ok1 && !ok2) return -1;
        if (!ok1 && ok2) return 1;
        const d1 = a.order_date ? new Date(a.order_date) : new Date(0);
        const d2 = b.order_date ? new Date(b.order_date) : new Date(0);
        if (d1.getTime() !== d2.getTime()) return d1 - d2;
        return (a.order_code || '').localeCompare(b.order_code || '');
    });
}

const CHI_TIET_CHIA_COLUMN_HINT =
    'Thiếu cột chi_tiet_chia trên Supabase: chạy SQL migration 20260502133000_orders_chi_tiet_chia_jsonb.sql, rồi Dashboard → Settings → API → Reload schema.';

function supabaseErrorLooksLikeMissingChiTietChia(err) {
    const m = String(err?.message || '').toLowerCase();
    return (
        err?.code === 'PGRST204' ||
        m.includes('chi_tiet_chia') ||
        /column.*does not exist/i.test(m) ||
        m.includes('could not find') && m.includes('chi_tiet')
    );
}

function normalizeFingerprintStaffKey(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function accumulateStaffFingerprints(acc, rawName, add) {
    const k = normalizeFingerprintStaffKey(rawName);
    if (!k) return;
    acc[k] = (acc[k] || 0) + add;
}

function stringifyStaffFingerprint(acc) {
    const e = Object.entries(acc).sort(([a], [b]) =>
        String(a).localeCompare(String(b), 'vi')
    );
    return JSON.stringify(e);
}

/** Giống `normalizeHistoryBranchKey` trong component — dùng khi prefetch khớp phiên. */
function normalizeHistoryBranchForChiReport(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return null;
    if (s.includes('hcm') || s.includes('hồ chí minh') || s.includes('ho chi minh') || s.includes('tp.hcm')) return 'HCM';
    if (s.includes('hà nội') || s.includes('ha noi') || s.includes('hanoi') || s === 'hn') return 'Hà Nội';
    return null;
}

function fingerprintDeliveriesPairs(pairs) {
    const acc = {};
    pairs.forEach(({ row, parsed }) => {
        const nv = parsed?.delivery_staff ?? row?.delivery_staff;
        accumulateStaffFingerprints(acc, nv, 1);
    });
    return stringifyStaffFingerprint(acc);
}

function fingerprintFromHistoryStaffStats(stats) {
    const acc = {};
    Object.entries(stats || {}).forEach(([k, v]) => {
        accumulateStaffFingerprints(acc, k, Number(v) || 0);
    });
    return stringifyStaffFingerprint(acc);
}

function mergeOrderChiRowsPreferHcmClone(rowsHcm, rowsOrders) {
    const map = new Map();
    for (const r of rowsOrders || []) {
        const k = String(r.order_code ?? '').trim();
        if (k) map.set(k, r);
    }
    for (const r of rowsHcm || []) {
        const k = String(r.order_code ?? '').trim();
        if (!k) continue;
        map.set(k, r);
    }
    return [...map.values()];
}

function clusterChiTietOrderRowsMerged(rows) {
    const groups = new Map();
    for (const row of rows || []) {
        const parsed = parseChiTietChiaForMerge(row.chi_tiet_chia);
        if (!parsed) continue;
        const brGuess = inferBranchLabelFromOrderTeam(row.team ?? parsed.order_team ?? parsed.branch);
        if (brGuess !== 'HCM' && brGuess !== 'Hà Nội') continue;

        const tv = String(parsed.ten_vong || '').trim();
        /** Cùng một lần bấm Chia dùng chung `ten_vong`; không có hoặc STT chỉnh tay ⇒ mỗi đơn một cụm. */
        const sharedSession =
            tv &&
            (/\bVòng\s*\d+/i.test(tv) ||
                tv.includes('Phiên chia') ||
                tv.includes('Vòng chia') ||
                tv.includes('Đã chỉnh STT') ||
                (tv.includes('•') && /\bVòng\b/i.test(tv)));
        const ck = sharedSession
            ? `${brGuess}|||${tv}`
            : `${brGuess}|||solo|||${String(row.order_code || '').trim()}`;

        if (!groups.has(ck)) groups.set(ck, { branch: brGuess, pairs: [] });
        groups.get(ck).pairs.push({ row, parsed });
    }

    const clusters = [];
    for (const [, bundle] of groups) {
        let maxTs = 0;
        bundle.pairs.forEach(({ row }) => {
            const ts = row.updated_at ? Date.parse(row.updated_at) : 0;
            if (Number.isFinite(ts)) maxTs = Math.max(maxTs, ts);
        });
        clusters.push({
            branch: bundle.branch,
            pairs: bundle.pairs,
            maxUpdatedMs: maxTs,
            length: bundle.pairs.length,
            fingerprint: fingerprintDeliveriesPairs(bundle.pairs),
        });
    }
    return clusters;
}

function assignListFromChiDetailCluster(cluster) {
    const shaped = cluster.pairs.map(({ row, parsed }) => {
        const p = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...parsed } : {};
        return {
            order_code: row.order_code,
            order_date: row.order_date,
            thu_tu_chia: p.thu_tu_chia ?? row.thu_tu_chia,
            delivery_staff: row.delivery_staff,
            chi_tiet_chia: p,
        };
    });
    const sorted = sortChiaDonViewOrdersList(shaped);
    return sorted.map((o) => ({
        order_code: o.order_code,
        delivery_staff: o.delivery_staff,
        chi_tiet_chia: o.chi_tiet_chia,
    }));
}

/** Danh sách I. — từ mảng đơn thô đã prefetch (không qua cụm). */
function assignListFromOrderRowsFlat(rows) {
    const shaped = (rows || []).map((row) => {
        const raw = parseChiTietChiaForMerge(row.chi_tiet_chia) || {};
        const p =
            raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
        return {
            order_code: row.order_code,
            order_date: row.order_date,
            thu_tu_chia: p.thu_tu_chia ?? row.thu_tu_chia,
            delivery_staff: row.delivery_staff,
            chi_tiet_chia: p,
        };
    });
    const sorted = sortChiaDonViewOrdersList(shaped);
    return sorted.map((o) => ({
        order_code: o.order_code,
        delivery_staff: o.delivery_staff,
        chi_tiet_chia: o.chi_tiet_chia,
    }));
}

/**
 * Chuỗi fallback cho bảng I.: (1) lookup khớp phiên (2) cùng ngày chia VN + chi nhánh
 * (3) mọi đơn trong khoảng ngày prefetch + chi nhánh.
 */
function resolveAssignListForHistorySession(historyRow, branchKeyUi, lookupMap, mergedRowsAll) {
    const hid =
        historyRow?.id != null && historyRow.id !== ''
            ? String(historyRow.id)
            : '';
    const fromMatch = hid && lookupMap ? lookupMap[hid] : null;
    if (Array.isArray(fromMatch) && fromMatch.length > 0) {
        return { list: fromMatch, source: 'match' };
    }

    const pool = mergedRowsAll || [];
    const vnPhi = yyyyMmDdVietNamFromTimestamp(historyRow.created_at);

    const sameDayBranch = pool.filter((row) => {
        if (inferOrderRowBranchForChiReport(row) !== branchKeyUi) return false;
        const ngayIso = chiNgayYyyyMmDdFromRow(row);
        return ngayIso && vnPhi && ngayIso === vnPhi;
    });

    if (sameDayBranch.length > 0) {
        return { list: assignListFromOrderRowsFlat(sameDayBranch), source: 'day_branch' };
    }

    const rangeBranch = pool.filter((row) => inferOrderRowBranchForChiReport(row) === branchKeyUi);
    if (rangeBranch.length > 0) {
        return { list: assignListFromOrderRowsFlat(rangeBranch), source: 'range_branch' };
    }

    return { list: [], source: 'none' };
}

/** Thứ tự cột ưu tiên cho bảng I. — các key còn lại của JSON được sort sau. */
const CHI_TIET_CHIA_REPORT_KEY_ORDER = [
    'ngay_chia_van_don',
    'ten_vong',
    'thu_tu_chia',
    'reason',
    'queue_before',
    'staff_chi_nhanh',
    'eligible_staff',
];

function chiTietChiaKeyLabelVi(k) {
    const map = {
        ngay_chia_van_don: 'Ngày chia',
        ten_vong: 'Tên vòng',
        thu_tu_chia: 'STT chia (JSON)',
        reason: 'Lý do',
        queue_before: 'Hàng đợi xoay vòng',
        staff_chi_nhanh: 'NV chi nhánh',
        eligible_staff: 'NV đủ điều kiện',
    };
    return map[k] || k;
}

function collectChiTietChiaKeysForRows(rows) {
    const set = new Set();
    for (const r of rows || []) {
        const o = r?.chi_tiet_chia;
        if (o && typeof o === 'object' && !Array.isArray(o)) {
            Object.keys(o).forEach((k) => set.add(k));
        }
    }
    const rest = [...set].filter((k) => !CHI_TIET_CHIA_REPORT_KEY_ORDER.includes(k)).sort();
    return [...CHI_TIET_CHIA_REPORT_KEY_ORDER.filter((k) => set.has(k)), ...rest];
}

/** Giá trị ô (không gồm queue_before đặc biệt — render riêng trong JSX). */
function formatChiTietChiaReportCell(key, val) {
    if (val == null || val === '') return '—';
    if (key === 'queue_before') return '—';
    if (Array.isArray(val)) {
        try {
            return JSON.stringify(val);
        } catch {
            return String(val);
        }
    }
    if (typeof val === 'object') {
        try {
            return JSON.stringify(val);
        } catch {
            return String(val);
        }
    }
    return String(val);
}

function matchHistorySessionsToChiDetailClusters(historyRows, clusters) {
    const out = new Map();
    const pool = clusters.map((c, i) => ({ ...c, i, used: false }));

    const sessions = [...historyRows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const tryAssign = (h, useFingerprint) => {
        const histBranch = normalizeHistoryBranchForChiReport(h.branch);
        if (histBranch !== 'HCM' && histBranch !== 'Hà Nội') return false;
        const wantFp = fingerprintFromHistoryStaffStats(h.staff_stats);
        const wantN = Number(h.total_orders) || 0;

        let bestIdx = -1;
        let bestDiff = Infinity;
        pool.forEach((c, ci) => {
            if (c.used || c.branch !== histBranch) return;
            if (wantN >= 1 && c.length !== wantN) return;
            if (useFingerprint && c.fingerprint !== wantFp) return;
            const tH = new Date(h.created_at).getTime();
            const diff = Math.abs((c.maxUpdatedMs || 0) - tH);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestIdx = ci;
            }
        });

        if (bestIdx !== -1) {
            pool[bestIdx].used = true;
            const hid = h.id;
            if (hid != null) out.set(String(hid), assignListFromChiDetailCluster(pool[bestIdx]));
            return true;
        }
        return false;
    };

    for (const h of sessions) {
        tryAssign(h, true);
    }
    for (const h of sessions) {
        if (h.id != null && out.has(String(h.id))) continue;
        tryAssign(h, false);
    }

    return out;
}

/** Ngày chia thực tế: cột đơn hoặc trong JSON chi_tiet_chia (YYYY-MM-DD). */
function chiNgayYyyyMmDdFromRow(row) {
    const parsed = parseChiTietChiaForMerge(row?.chi_tiet_chia);
    return String(row?.ngay_chia_van_don ?? parsed?.ngay_chia_van_don ?? '').slice(0, 10);
}

/** Đơn có chi_tiet_chia nằm trong khoảng ngày chia (ưu tiên cột hoặc JSON). */
function rowChiTietInNgayRange(row, start, end) {
    const d = chiNgayYyyyMmDdFromRow(row);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= start && d <= end;
}

async function fetchOrderRowsWithChiTietForReportRange(start, end) {
    const sel =
        'order_code, team, chi_tiet_chia, delivery_staff, thu_tu_chia, order_date, updated_at, ngay_chia_van_don';
    const [rOrd, rHcm, rOrdNgayNull, rHcmNgayNull] = await Promise.all([
        supabase
            .from('orders')
            .select(sel)
            .gte('ngay_chia_van_don', start)
            .lte('ngay_chia_van_don', end)
            .not('chi_tiet_chia', 'is', null),
        supabase
            .from('order_code_hcm')
            .select(sel)
            .gte('ngay_chia_van_don', start)
            .lte('ngay_chia_van_don', end)
            .not('chi_tiet_chia', 'is', null),
        supabase.from('orders').select(sel).is('ngay_chia_van_don', null).not('chi_tiet_chia', 'is', null).limit(3000),
        supabase.from('order_code_hcm').select(sel).is('ngay_chia_van_don', null).not('chi_tiet_chia', 'is', null).limit(3000),
    ]);

    const ordOk = !(rOrd || {}).error;
    const hcmOk = !(rHcm || {}).error;
    const ordNullOk = !(rOrdNgayNull || {}).error;
    const hcmNullOk = !(rHcmNgayNull || {}).error;

    if (!ordOk && (rOrd || {}).error) {
        console.warn('[Báo cáo I.] orders chi_tiet_chia:', rOrd.error.message);
    }
    if (!hcmOk && (rHcm || {}).error) {
        console.warn('[Báo cáo I.] order_code_hcm chi_tiet_chia:', rHcm.error.message);
    }
    if (!ordNullOk && (rOrdNgayNull || {}).error) {
        console.warn('[Báo cáo I.] orders chi_tiet (ngày chia null):', rOrdNgayNull.error.message);
    }
    if (!hcmNullOk && (rHcmNgayNull || {}).error) {
        console.warn('[Báo cáo I.] order_code_hcm chi_tiet (ngày chia null):', rHcmNgayNull.error.message);
    }

    const mergedMain = mergeOrderChiRowsPreferHcmClone(
        hcmOk ? rHcm.data || [] : [],
        ordOk ? rOrd.data || [] : []
    );
    const keysMain = new Set(
        mergedMain.map((r) => String(r?.order_code ?? '').trim()).filter(Boolean)
    );
    const mergedAux = mergeOrderChiRowsPreferHcmClone(
        hcmNullOk ? rHcmNgayNull.data || [] : [],
        ordNullOk ? rOrdNgayNull.data || [] : []
    ).filter((row) => rowChiTietInNgayRange(row, start, end));

    for (const r of mergedAux) {
        const k = String(r?.order_code ?? '').trim();
        if (!k || keysMain.has(k)) continue;
        keysMain.add(k);
        mergedMain.push(r);
    }

    return mergedMain;
}

/** `history_chia_don.phien_chia` / `chi_tiet_chia` — có thể jsonb hoặc chuỗi JSON */
function parseHistoryChiaDonStoredJson(raw) {
    if (raw == null || raw === '') return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
        return JSON.parse(String(raw));
    } catch {
        return {};
    }
}

/** Khớp logic chi nhánh trong `chiaDonVanDon.js` (U1 từ danh_sach_van_don, sort `ho_va_ten` vi). */
function ultraNormChiaDonBranchKey(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[.\-_/]/g, ' ')
        .replace(/\s+/g, '')
        .trim();
}

function buildVanDonU1StaffOrderFromRows(rows) {
    const u1 = (rows || []).filter(
        (r) => String(r.trang_thai_chia || '').trim().toUpperCase() === 'U1'
    );
    const sorted = [...u1].sort((a, b) =>
        String(a.ho_va_ten || '')
            .trim()
            .localeCompare(String(b.ho_va_ten || '').trim(), 'vi')
    );
    const orderHCM = [];
    const orderHN = [];
    sorted.forEach((item) => {
        const name = String(item.ho_va_ten || '').trim();
        if (!name) return;
        const n = ultraNormChiaDonBranchKey(item.chi_nhanh);
        if (n === 'hcm' || n === 'tphcm' || n === 'hochiminh' || n.includes('hcm')) {
            orderHCM.push(name);
        } else if (n === 'hanoi' || n === 'hn' || n.includes('hanoi')) {
            orderHN.push(name);
        }
    });
    return { HCM: orderHCM, 'Hà Nội': orderHN };
}

function normalizeNameKeyForStaffSort(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function sortStatsEntriesByVanDonOrder(entries, canonicalNames) {
    const idx = new Map(
        (canonicalNames || []).map((n, i) => [normalizeNameKeyForStaffSort(n), i])
    );
    return [...entries].sort((a, b) => {
        const ia = idx.get(normalizeNameKeyForStaffSort(a[0]));
        const ib = idx.get(normalizeNameKeyForStaffSort(b[0]));
        if (ia !== undefined && ib !== undefined) return ia - ib;
        if (ia !== undefined) return -1;
        if (ib !== undefined) return 1;
        return String(a[0]).trim().localeCompare(String(b[0]).trim(), 'vi');
    });
}

function compactStaffTotalsLine(sortedEntries) {
    if (!sortedEntries.length) return null;
    return sortedEntries.map(([name, c]) => `${name}: ${Number(c) || 0}`).join(' · ');
}

const getSupabaseFetchHint = (err) => {
    const msg = String(err?.message || err || '');
    if (!/failed to fetch/i.test(msg)) return '';
    return ' Kiểm tra mạng/VPN, cấu hình .env (VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY), dự án Supabase có bị pause không, rồi thử lại.';
};

function normalizeVietnamesePaymentLabel(s) {
    return String(s ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/\s+/g, ' ');
}

/** Trạng thái thanh toán: ưu tiên payment_status_detail, fallback payment_status — khớp "Có Bill" (không phân biệt hoa thường/dấu). */
function orderTrangThaiThanhToanIsCoBill(order) {
    return (
        normalizeVietnamesePaymentLabel(resolveTrangThaiThuTienFromOrder(order)) ===
        normalizeVietnamesePaymentLabel('Có Bill')
    );
}

/** So sánh chuỗi branch/team (giữ dấu — khớp "Hà Nội", "HCM"). */
function normalizeDeptBranchCompare(str) {
    return String(str ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

/** Bộ phận được coi là CSKH (không phân biệt hoa thường). */
function userDepartmentIsCSKH(dept) {
    const d = normalizeDeptBranchCompare(dept);
    if (!d) return false;
    return d === 'cskh' || d.includes('cskh');
}

/**
 * Khớp users.branch hoặc users.team với team đơn hàng (vd. 'Hà Nội', 'HCM').
 */
function userBranchMatchesOrderTeam(branchOrTeam, orderTeamFilter) {
    const b = normalizeDeptBranchCompare(branchOrTeam);
    const t = normalizeDeptBranchCompare(orderTeamFilter);
    if (!t || !b) return false;

    const isOrderHcm =
        t === 'hcm' ||
        t.includes('hcm') ||
        t.includes('hồ chí minh') ||
        t.includes('ho chi minh') ||
        t.includes('tp.hcm') ||
        t.includes('tp hcm');
    const isOrderHanoi =
        t.includes('hà nội') ||
        t.includes('ha noi') ||
        t === 'hn' ||
        t.includes('hanoi');

    if (isOrderHcm) {
        return (
            b === 'hcm' ||
            b.includes('hcm') ||
            b.includes('hồ chí minh') ||
            b.includes('ho chi minh') ||
            b.includes('tp.hcm') ||
            b.includes('tp hcm') ||
            b.includes('sài gòn') ||
            b.includes('sai gon')
        );
    }
    if (isOrderHanoi) {
        return b.includes('hà nội') || b.includes('ha noi') || b === 'hn' || b.includes('hanoi');
    }
    return b === t || b.includes(t) || t.includes(b);
}

const AdminTools = () => {
    const { canView } = usePermissions();


    // --- TABS STATE ---
    const [activeTab, setActiveTab] = useState('settings'); // 'settings' | 'upload_download' | 'permissions' | 'auto_assign' | 'account_management'

    // --- MAINTENANCE STATE ---
    const [loading, setLoading] = useState(false);
    const [checkLoading, setCheckLoading] = useState(false);
    const [dbStatus, setDbStatus] = useState(null);
    const [lastSnapshot, setLastSnapshot] = useState(null);
    const userEmail = localStorage.getItem('userEmail') || 'unknown';

    // --- SETTINGS STATE ---
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [productSuggestions, setProductSuggestions] = useState([]); // Suggested from DB history (loại bỏ các SP đã có trong DB)
    const [availableMarkets, setAvailableMarkets] = useState([]); // Managed + Suggested markets for autocomplete
    const [loadingData, setLoadingData] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [loadingSettings, setLoadingSettings] = useState(false);

    // State để lưu danh sách sản phẩm từ database (bảng system_settings với 2 cột)
    const [dbProducts, setDbProducts] = useState([]); // [{id, name, type}, ...]

    // --- EXCHANGE RATES (TỶ GIÁ) STATE ---
    const [exchangeRates, setExchangeRates] = useState([]); // [{id, ti_gia, gia_tri}, ...]
    const [exchangeLoading, setExchangeLoading] = useState(false);
    const [exchangeSaving, setExchangeSaving] = useState(false);
    const [syncMktTeamLoading, setSyncMktTeamLoading] = useState(false);
    const [editingRateId, setEditingRateId] = useState(null); // ID của dòng đang được edit
    const [editValues, setEditValues] = useState({}); // {rateId: {ti_gia: '', gia_tri: ''}} để lưu giá trị đang edit

    // --- AUTO ASSIGN STATE ---
    const [autoAssignLoading, setAutoAssignLoading] = useState(false);
    const [autoAssignResult, setAutoAssignResult] = useState(null);
    const [notDividedOrders, setNotDividedOrders] = useState([]); // Danh sách đơn không được chia
    const [selectedTeam, setSelectedTeam] = useState('Hà Nội');
    const [stepLogs, setStepLogs] = useState([]); // Log từng bước để hiển thị trong UI
    
    // --- AUTO CHIA ĐƠN VẬN ĐƠN THEO GIỜ CHẴN ---
    const [autoChiaDonEnabled, setAutoChiaDonEnabled] = useState(() => {
        const saved = localStorage.getItem('autoChiaDonEnabled');
        return saved === 'true';
    });
    const [lastAutoChiaHour, setLastAutoChiaHour] = useState(null); // Lưu giờ cuối cùng đã chạy
    /** Tránh chạy trùng trong cùng một khung giờ (YYYY-MM-DDTHH) khi poll nhiều lần tại phút :00 */
    const lastAutoChiaSlotRef = useRef(null);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [activeStaffPreview, setActiveStaffPreview] = useState([]);
    const [isPreviewStaffLoading, setIsPreviewStaffLoading] = useState(false);
    const [showStaffPreviewModal, setShowStaffPreviewModal] = useState(false);

    const [historyChiaDon, setHistoryChiaDon] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyStartDate, setHistoryStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().slice(0, 10)); // Mặc định 7 ngày trước
    const [historyEndDate, setHistoryEndDate] = useState(new Date().toISOString().slice(0, 10));
    const [staffStatsReport, setStaffStatsReport] = useState({});
    const [staffStatsReportByBranch, setStaffStatsReportByBranch] = useState({ HCM: {}, 'Hà Nội': {} });
    const [successSessionCountByBranch, setSuccessSessionCountByBranch] = useState({ HCM: 0, 'Hà Nội': 0 });
    const [successTotalOrdersByBranch, setSuccessTotalOrdersByBranch] = useState({ HCM: 0, 'Hà Nội': 0 });
    /** Thứ tự U1 theo trang danh_sach_van_don (để sort bảng tổng hợp báo cáo chia đơn). */
    const [chiaDonVanDonStaffOrder, setChiaDonVanDonStaffOrder] = useState({
        HCM: [],
        'Hà Nội': [],
    });
    /** Mục I.: map history id → list khớp cụm (nếu có); luôn prefetch merged rows cho fallback “hiện hết”. */
    const [chiTietFromOrdersLookup, setChiTietFromOrdersLookup] = useState({});
    const [chiaReportMergedChiTietRows, setChiaReportMergedChiTietRows] = useState([]);

    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [cskhStaff, setCskhStaff] = useState([]);

    // --- ACCOUNT MANAGEMENT STATE ---
    const [authAccounts, setAuthAccounts] = useState([]);
    const [accountLoading, setAccountLoading] = useState(false);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [accountForm, setAccountForm] = useState({
        email: '',
        username: '',
        name: '',
        password: '',
        user_id: '',
        role: 'user',
        branch: '',
        department: '',
        status: 'active',
        must_change_password: false
    });
    const [loginHistory, setLoginHistory] = useState([]);
    const [showLoginHistory, setShowLoginHistory] = useState(false);
    const [showPasswords, setShowPasswords] = useState({}); // Track which passwords are visible
    const [passwordInputs, setPasswordInputs] = useState({}); // Store password inputs for quick edit
    const [nameSearchQuery, setNameSearchQuery] = useState(''); // Search query for account name
    const [branchFilter, setBranchFilter] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [selectedAccountIds, setSelectedAccountIds] = useState([]);
    const [bulkDeletingAccounts, setBulkDeletingAccounts] = useState(false);
    const [bulkAssignTeamValue, setBulkAssignTeamValue] = useState('');
    const [bulkAssigningTeam, setBulkAssigningTeam] = useState(false);
    const [accountImportLoading, setAccountImportLoading] = useState(false);
    const accountImportInputRef = useRef(null);

    // --- AUTO FILL TEAM STATE ---
    const [isFillingTeam, setIsFillingTeam] = useState(false);
    const [fillTeamProgress, setFillTeamProgress] = useState({
        current: 0,
        total: 0,
        success: 0,
        failed: 0,
        currentUser: ''
    });

    // --- SEARCH HELPERS ---
    const matchesSearch = (text) => {
        return text && text.toLowerCase().includes(searchQuery.toLowerCase());
    };

    const isSectionVisible = (title, keywords = []) => {
        if (!searchQuery) return true;
        if (matchesSearch(title)) return true;
        if (keywords.some(k => matchesSearch(k))) return true;
        return false;
    };

    // Tab Definitions with Keywords
    const TABS = [
        {
            id: 'settings',
            label: 'Cài đặt hệ thống',
            icon: Settings,
            keywords: [
                'cài đặt',
                'cấu hình',
                'setting',
                'sản phẩm',
                'product',
                'thị trường',
                'market',
                'ngưỡng',
                'threshold',
                'chỉ số',
                'sale'
            ]
        },
        { id: 'upload_download', label: 'Upload và Tải về', icon: Download, keywords: ['upload', 'download', 'excel', 'tải về', 'nhập', 'xuất'] },
        { id: 'permissions', label: 'Phân quyền (RBAC)', icon: Shield, keywords: ['phân quyền', 'rbac', 'nhân viên', 'user', 'role', 'nhóm quyền', 'matrix'] },
        { id: 'auto_assign', label: 'Chia đơn tự động', icon: Users, keywords: ['chia đơn', 'tự động', 'phân bổ', 'cskh', 'auto assign', 'hạch toán'] },
        { id: 'account_management', label: 'Quản lý tài khoản mật khẩu', icon: Key, keywords: ['tài khoản', 'mật khẩu', 'password', 'account', 'đăng nhập', 'login', 'auth', 'authentication'] },
    ];

    const visibleTabs = TABS.filter(tab => isSectionVisible(tab.label, tab.keywords));

    // Auto-switch tab if active one is hidden
    useEffect(() => {
        if (searchQuery && visibleTabs.length > 0) {
            const isCurrentVisible = visibleTabs.find(t => t.id === activeTab);
            if (!isCurrentVisible) {
                setActiveTab(visibleTabs[0].id);
            }
        }
    }, [searchQuery, visibleTabs, activeTab]);

    // Auto-load accounts when entering account management tab
    useEffect(() => {
        if (activeTab === 'account_management' && authAccounts.length === 0 && !accountLoading) {
            loadAuthAccounts();
        }
    }, [activeTab]);

    // Auto-load exchange rates when entering settings tab
    useEffect(() => {
        if (activeTab === 'settings' && exchangeRates.length === 0 && !exchangeLoading) {
            loadExchangeRates();
        }
    }, [activeTab]);

    // --- TỰ ĐỘNG CHIA ĐƠN VẬN ĐƠN VÀO ĐẦU MỖI GIỜ (phút :00 theo đồng hồ máy) ---
    // Lưu ý: chỉ chạy khi trang Admin Tools còn mở trong tab trình duyệt (không có cron server).
    // Trước đây dùng setInterval(60s) lệch so với biên phút nên gần như không bao giờ trùng currentMinute===0.
    useEffect(() => {
        if (!autoChiaDonEnabled) return;

        const slotKey = (d) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}`;

        const checkAndRunAutoChia = () => {
            const now = new Date();
            if (now.getMinutes() !== 0) return;

            const sk = slotKey(now);
            if (lastAutoChiaSlotRef.current === sk) return;
            lastAutoChiaSlotRef.current = sk;

            console.log(`🕐 [Tự động chia đơn] Đến giờ ${now.getHours()}:00, bắt đầu chia đơn vận đơn...`);
            setLastAutoChiaHour(now.getHours());

            handleChiaDonVanDon('HCM')
                .then(() => {
                    setTimeout(() => {
                        handleChiaDonVanDon('Hà Nội').catch((err) => {
                            console.error('❌ [Tự động chia đơn] Lỗi khi chia đơn Hà Nội:', err);
                        });
                    }, 2000);
                })
                .catch((err) => {
                    console.error('❌ [Tự động chia đơn] Lỗi khi chia đơn HCM:', err);
                });
        };

        checkAndRunAutoChia();
        const interval = setInterval(checkAndRunAutoChia, 30_000);

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoChiaDonEnabled]);

    useEffect(() => {
        if (!autoChiaDonEnabled) {
            lastAutoChiaSlotRef.current = null;
        }
    }, [autoChiaDonEnabled]);

    // Lưu trạng thái autoChiaDonEnabled vào localStorage
    useEffect(() => {
        localStorage.setItem('autoChiaDonEnabled', String(autoChiaDonEnabled));
    }, [autoChiaDonEnabled]);

    // Thứ tự nhân sự U1 (theo danh_sach_van_don) khi mở modal báo cáo chia đơn
    useEffect(() => {
        if (!isStatsModalOpen) return;
        let cancelled = false;
        (async () => {
            try {
                const { data, error } = await supabase
                    .from('danh_sach_van_don')
                    .select('ho_va_ten, chi_nhanh, trang_thai_chia')
                    .order('ho_va_ten', { ascending: true });
                if (cancelled) return;
                if (error) {
                    console.error('❌ [Báo cáo chia đơn] Không tải thứ tự U1:', error);
                    return;
                }
                setChiaDonVanDonStaffOrder(buildVanDonU1StaffOrderFromRows(data || []));
            } catch (e) {
                if (!cancelled) console.error('❌ [Báo cáo chia đơn] Exception tải U1:', e);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isStatsModalOpen]);

    // Mục I. modal báo cáo: prefetch đơn có chi_tiet_chia (ngày chia); lookup khớp phiên + merged cho fallback đầy đủ
    useEffect(() => {
        if (!isStatsModalOpen) return;
        let cancelled = false;
        (async () => {
            try {
                const merged = await fetchOrderRowsWithChiTietForReportRange(historyStartDate, historyEndDate);
                if (cancelled) return;
                setChiaReportMergedChiTietRows(Array.isArray(merged) ? merged : []);
                if (!historyChiaDon?.length) {
                    setChiTietFromOrdersLookup({});
                    return;
                }
                const clusters = clusterChiTietOrderRowsMerged(merged || []);
                const mapObj = {};
                matchHistorySessionsToChiDetailClusters(historyChiaDon, clusters).forEach((list, hid) => {
                    mapObj[String(hid)] = list;
                });
                if (!cancelled) setChiTietFromOrdersLookup(mapObj);
            } catch (e) {
                if (!cancelled) {
                    console.warn('[Báo cáo I.]Prefetch chi_tiet_chia:', e);
                    setChiTietFromOrdersLookup({});
                    setChiaReportMergedChiTietRows([]);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isStatsModalOpen, historyChiaDon, historyStartDate, historyEndDate]);

    // --- VERIFICATION STATE ---
    const [verifyResult, setVerifyResult] = useState(null);
    const [verifying, setVerifying] = useState(false);

    const [downloadMode, setDownloadMode] = useState(false);
    const [uploadMode, setUploadMode] = useState(false);
    // Initialize date filters: Default to current month or reasonable range
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    useEffect(() => {
        // Load settings on mount
        fetchSettingsFromSupabase();
    }, []);

    // Reload reference data khi dbProducts thay đổi (để loại bỏ các SP đã có khỏi gợi ý)
    useEffect(() => {
        if (dbProducts.length >= 0) {
            fetchReferenceData();
        }
    }, [dbProducts]);

    const AVAILABLE_TABLES = [
        // SALES
        // { id: 'sale_orders', name: 'Danh sách đơn (Sale)', desc: 'Danh sách đơn hàng của bộ phận Sale' },
        { id: 'sale_reports', name: 'Xem báo cáo (Sale)', desc: 'Dữ liệu báo cáo doanh số Sale' },

        // LOGISTICS (Vận đơn)
        { id: 'delivery_orders', name: 'Quản lý vận đơn', desc: 'Danh sách vận đơn (Delivery)' },
        // { id: 'delivery_reports', name: 'Báo cáo vận đơn', desc: 'Dữ liệu báo cáo vận đơn' },

        // MARKETING
        // { id: 'mkt_orders', name: 'Danh sách đơn (MKT)', desc: 'Danh sách đơn hàng Marketing' },
        { id: 'mkt_reports', name: 'Xem báo cáo (MKT)', desc: 'Báo cáo chi tiết Marketing (detail_reports)' },

        // CSKH (Customer Service)
        // { id: 'cskh_all', name: 'Danh sách đơn (CSKH)', desc: 'Toàn bộ đơn hàng (Dùng cho CSKH)' },
        // { id: 'cskh_money', name: 'Đơn đã thu tiền/cần CS (CSKH)', desc: 'Đơn hàng có trạng thái thu tiền/cần xử lý' },
        { id: 'cskh_report', name: 'Xem báo cáo CSKH', desc: 'Dữ liệu nguồn cho báo cáo CSKH' },

        // SYSTEM
        { id: 'users', name: 'Quản lý nhân sự (Users)', desc: 'Danh sách tài khoản và nhân sự hệ thống' },
    ];

    const handleDownloadTable = async (tableId) => {
        const tableName = getRealTableName(tableId);

        let confirmMsg = `Bạn có muốn tải dữ liệu [${tableId}] về không?`;
        if (dateFrom || dateTo) {
            confirmMsg += `\n(Bộ lọc: ${dateFrom || '...'} đến ${dateTo || '...'})`;
        }
        if (!window.confirm(confirmMsg)) return;

        try {
            toast.info(`Đang tải dữ liệu [${tableId}]...`);

            // Custom logic for filtered downloads can go here
            let query = supabase.from(tableName).select('*');

            // --- DATE FILTER LOGIC ---
            if (dateFrom || dateTo) {
                // Determine date column based on table
                let dateCol = 'created_at';
                if (tableName === 'orders') {
                    // EXCLUDE R&D DATA for Admin Tools/General Reporting
                    query = query.neq('team', 'RD');

                    if (dateFrom) query = query.gte('order_date', dateFrom);
                    if (dateTo) query = query.lte('order_date', dateTo);
                } else if (tableName === 'sales_reports') {
                    if (dateFrom) query = query.gte('date', dateFrom);
                    if (dateTo) query = query.lte('date', dateTo);
                } else if (tableName === 'detail_reports') {
                    if (dateFrom) query = query.gte('Ngày', dateFrom);
                    if (dateTo) query = query.lte('Ngày', dateTo);
                } else {
                    if (dateFrom) query = query.gte('created_at', dateFrom);
                    if (dateTo) query = query.lte('created_at', dateTo);
                }
            } else {
                // Default limit if no filter
                query = query.limit(10000);
            }

            const { data, error } = await query;
            if (error) throw error;

            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const tableInfo = AVAILABLE_TABLES.find(t => t.id === tableId);
            const fileName = tableInfo ? tableInfo.name.replace(/\//g, '-') : tableId;
            link.download = `${fileName}_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success(`Đã tải xong [${tableName}]!`);
        } catch (err) {
            console.error(err);
            toast.error(`Lỗi tải bảng ${tableName}: ${err.message}`);
        }
    };

    const handleUploadToDrive = async (tableId, event) => {
        // Prevent card click event from firing
        event.stopPropagation();
        
        const tableName = getRealTableName(tableId);

        let confirmMsg = `Bạn có muốn đẩy dữ liệu [${tableId}] lên Google Drive không?`;
        if (dateFrom || dateTo) {
            confirmMsg += `\n(Bộ lọc: ${dateFrom || '...'} đến ${dateTo || '...'})`;
        }
        if (!window.confirm(confirmMsg)) return;

        try {
            toast.info(`Đang tải dữ liệu [${tableId}]...`);

            // Custom logic for filtered downloads can go here
            let query = supabase.from(tableName).select('*');

            // --- DATE FILTER LOGIC ---
            if (dateFrom || dateTo) {
                // Determine date column based on table
                let dateCol = 'created_at';
                if (tableName === 'orders') {
                    // EXCLUDE R&D DATA for Admin Tools/General Reporting
                    query = query.neq('team', 'RD');

                    if (dateFrom) query = query.gte('order_date', dateFrom);
                    if (dateTo) query = query.lte('order_date', dateTo);
                } else if (tableName === 'sales_reports') {
                    if (dateFrom) query = query.gte('date', dateFrom);
                    if (dateTo) query = query.lte('date', dateTo);
                } else if (tableName === 'detail_reports') {
                    if (dateFrom) query = query.gte('Ngày', dateFrom);
                    if (dateTo) query = query.lte('Ngày', dateTo);
                } else {
                    if (dateFrom) query = query.gte('created_at', dateFrom);
                    if (dateTo) query = query.lte('created_at', dateTo);
                }
            } else {
                // Default limit if no filter
                query = query.limit(10000);
            }

            const { data, error } = await query;
            if (error) throw error;

            // Format file name: table name + date + time
            const tableInfo = AVAILABLE_TABLES.find(t => t.id === tableId);
            const tableDisplayName = tableInfo ? tableInfo.name.replace(/\//g, '-') : tableId;
            
            // Get current date/time in Vietnam timezone (UTC+7)
            const now = new Date();
            const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
            const year = vietnamTime.getUTCFullYear();
            const month = String(vietnamTime.getUTCMonth() + 1).padStart(2, '0');
            const day = String(vietnamTime.getUTCDate()).padStart(2, '0');
            const hours = String(vietnamTime.getUTCHours()).padStart(2, '0');
            const minutes = String(vietnamTime.getUTCMinutes()).padStart(2, '0');
            const seconds = String(vietnamTime.getUTCSeconds()).padStart(2, '0');
            
            const dateStr = `${year}${month}${day}`;
            const timeStr = `${hours}${minutes}${seconds}`;
            const fileName = `${tableDisplayName}_${dateStr}_${timeStr}.json`;

            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });

            // Upload to Google Drive using Google Apps Script or backend endpoint
            // Folder ID: 1Jg0XAV5-5FFosEbl6FK2kZ-M_7-Qro_5
            const DRIVE_FOLDER_ID = '1Jg0XAV5-5FFosEbl6FK2kZ-M_7-Qro_5';
            
            // Convert blob to base64
            toast.info(`Đang đẩy file [${fileName}] lên Google Drive...`);
            
            const reader = new FileReader();
            reader.onloadend = async () => {
                try {
                    const base64Data = reader.result.split(',')[1];
                    
                    // Try to use Google Apps Script web app if available
                    const appsScriptUrl = import.meta.env.VITE_GOOGLE_DRIVE_UPLOAD_URL || 'https://script.google.com/macros/s/AKfycbw-y-vLK1sDH15ski_IgTY31AletNjknER04FcZTtZDql36pHWTg1YsIGQ4Gl72U6ow3Q/exec';
                    
                    if (appsScriptUrl) {
                        // Use Google Apps Script web app
                        try {
                            // Check if file is too large (Google Apps Script has ~6MB limit for POST)
                            if (base64Data.length > 5000000) {
                                toast.warn('File khá lớn, có thể mất thời gian upload...');
                            }
                            
                            console.log('Starting upload to Google Drive...', {
                                fileName,
                                base64Length: base64Data.length,
                                url: appsScriptUrl
                            });
                            
                            // Try using fetch with proper error handling
                            const payload = {
                                folderId: DRIVE_FOLDER_ID,
                                fileName: fileName,
                                fileContent: base64Data,
                                mimeType: 'application/json'
                            };
                            
                            console.log('Sending request...');
                            
                            // Try multiple methods to ensure compatibility
                            let response;
                            let lastError;
                            
                            // Method 1: Try fetch with no-cors mode (may not read response but upload might work)
                            try {
                                console.log('Attempting Method 1: fetch with no-cors...');
                                const testResponse = await fetch(appsScriptUrl, {
                                    method: 'POST',
                                    mode: 'no-cors', // This bypasses CORS but we can't read response
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify(payload)
                                });
                                
                                // With no-cors, response is opaque, but request might have succeeded
                                // Wait a bit and assume success (user can check Drive folder)
                                console.log('No-cors request sent (response opaque)');
                                toast.success(`Đã gửi yêu cầu đẩy file [${fileName}] lên Google Drive. Vui lòng kiểm tra folder Google Drive để xác nhận file đã được upload.`);
                                return; // Exit early since we can't verify with no-cors
                                
                            } catch (noCorsError) {
                                console.warn('Method 1 (no-cors) failed:', noCorsError);
                                lastError = noCorsError;
                            }
                            
                            // Method 2: Try XMLHttpRequest with proper error handling
                            try {
                                console.log('Attempting Method 2: XMLHttpRequest...');
                                response = await new Promise((resolve, reject) => {
                                    const xhr = new XMLHttpRequest();
                                    
                                    xhr.addEventListener('load', function() {
                                        console.log('XHR load event:', {
                                            status: xhr.status,
                                            statusText: xhr.statusText,
                                            responseText: xhr.responseText.substring(0, 200)
                                        });
                                        
                                        if (xhr.status === 200 || xhr.status === 0) {
                                            resolve({
                                                ok: true,
                                                status: xhr.status,
                                                text: () => Promise.resolve(xhr.responseText)
                                            });
                                        } else {
                                            reject(new Error(`XHR HTTP error: ${xhr.status} ${xhr.statusText}`));
                                        }
                                    });
                                    
                                    xhr.addEventListener('error', function(e) {
                                        console.error('XHR error event:', e);
                                        reject(new Error('XMLHttpRequest network error'));
                                    });
                                    
                                    xhr.addEventListener('timeout', function() {
                                        reject(new Error('XMLHttpRequest timeout'));
                                    });
                                    
                                    xhr.addEventListener('abort', function() {
                                        reject(new Error('XMLHttpRequest aborted'));
                                    });
                                    
                                    xhr.open('POST', appsScriptUrl, true);
                                    xhr.setRequestHeader('Content-Type', 'application/json');
                                    xhr.timeout = 120000; // 2 minutes for large files
                                    
                                    console.log('XHR sending payload, size:', JSON.stringify(payload).length);
                                    xhr.send(JSON.stringify(payload));
                                });
                                
                                console.log('Method 2 (XHR) succeeded');
                                
                            } catch (xhrError) {
                                console.warn('Method 2 (XHR) failed:', xhrError);
                                lastError = xhrError;
                                
                                // Method 3: Try fetch with cors as last resort
                                try {
                                    console.log('Attempting Method 3: fetch with cors...');
                                    response = await fetch(appsScriptUrl, {
                                        method: 'POST',
                                        mode: 'cors',
                                        headers: {
                                            'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify(payload),
                                        redirect: 'follow'
                                    });
                                    console.log('Method 3 (fetch cors) succeeded');
                                } catch (fetchError) {
                                    console.error('All methods failed:', { xhrError, fetchError });
                                    throw new Error(`Tất cả phương thức upload đều thất bại. Lỗi cuối cùng: ${lastError?.message || fetchError.message}. Vui lòng kiểm tra:\n1. Kết nối internet\n2. Google Apps Script đã được deploy với quyền "Anyone"\n3. Thử lại sau vài giây`);
                                }
                            }
                            
                            console.log('Response received:', {
                                status: response.status,
                                statusText: response.statusText,
                                ok: response.ok
                            });
                            
                            // Get response text first to see what we got
                            const responseText = await response.text();
                            console.log('Response text:', responseText.substring(0, 200)); // First 200 chars
                            
                            if (!response.ok && response.status !== 0) {
                                throw new Error(`HTTP error! status: ${response.status}, response: ${responseText.substring(0, 100)}`);
                            }
                            
                            // Try to parse as JSON
                            let result;
                            try {
                                result = JSON.parse(responseText);
                            } catch (parseError) {
                                // If not JSON, check if it contains success indicators
                                if (responseText.includes('success') || response.status === 200 || response.status === 0) {
                                    result = { success: true, message: 'Upload may have succeeded (unable to parse response)' };
                                } else {
                                    throw new Error('Response is not valid JSON: ' + responseText.substring(0, 200));
                                }
                            }
                            
                            if (result.success) {
                                toast.success(`Đã đẩy file [${fileName}] lên Google Drive thành công!`);
                                if (result.fileUrl) {
                                    console.log('File URL:', result.fileUrl);
                                }
                            } else {
                                throw new Error(result.error || 'Lỗi không xác định từ server');
                            }
                            
                        } catch (fetchError) {
                            console.error('Upload error details:', {
                                error: fetchError,
                                message: fetchError.message,
                                stack: fetchError.stack
                            });
                            
                            // More specific error messages
                            if (fetchError.message.includes('Failed to fetch') || fetchError.message.includes('NetworkError')) {
                                throw new Error('Không thể kết nối đến Google Apps Script. Vui lòng kiểm tra:\n1. URL có đúng không\n2. Script đã được deploy với quyền "Anyone"\n3. Kết nối internet của bạn');
                            } else if (fetchError.message.includes('timeout')) {
                                throw new Error('Request timeout. File có thể quá lớn hoặc server mất quá nhiều thời gian xử lý.');
                            } else {
                                throw new Error(`Lỗi đẩy file: ${fetchError.message}`);
                            }
                        }
                    } else {
                        // Fallback: Show helpful error message
                        toast.error('Vui lòng cấu hình VITE_GOOGLE_DRIVE_UPLOAD_URL trong file .env để sử dụng tính năng đẩy lên Google Drive. Xem file scripts/google-drive-upload-handler.gs để biết cách setup.');
                        console.log('File data ready for upload:', {
                            fileName,
                            size: blob.size,
                            folderId: DRIVE_FOLDER_ID,
                            base64Length: base64Data.length
                        });
                    }
                } catch (err) {
                    console.error('Upload error:', err);
                    toast.error(`Lỗi đẩy file lên Google Drive: ${err.message}`);
                }
            };
            reader.onerror = () => {
                toast.error('Lỗi đọc file để upload');
            };
            reader.readAsDataURL(blob);

        } catch (err) {
            console.error(err);
            toast.error(`Lỗi tải dữ liệu bảng ${tableName}: ${err.message}`);
        }
    };

    const handleDownloadAll = async () => {
        let confirmMsg = "Bạn có muốn tải toàn bộ dữ liệu (Backup) không?";
        if (dateFrom || dateTo) {
            confirmMsg += `\n(Bộ lọc ngày: ${dateFrom || '...'} đến ${dateTo || '...'})`;
        }
        confirmMsg += "\n\nHệ thống sẽ tạo 1 file ZIP chứa các file riêng biệt với tên Tiếng Việt tương ứng (Ví dụ: Danh sách đơn (Sale).json...).";

        if (!window.confirm(confirmMsg)) return;

        try {
            toast.info("Đang tổng hợp và nén dữ liệu...");

            const zip = new JSZip();

            // Loop through ALL defined cards in AVAILABLE_TABLES to simulate distinct downloads
            for (const card of AVAILABLE_TABLES) {
                const tableId = card.id;
                const tableName = getRealTableName(tableId);

                let query = supabase.from(tableName).select('*');

                // Reuse query logic from handleDownloadTable
                if (tableName === 'orders') {
                    query = query.neq('team', 'RD');
                    if (dateFrom) query = query.gte('order_date', dateFrom);
                    if (dateTo) query = query.lte('order_date', dateTo);
                } else {
                    let dateCol = 'created_at';
                    if (tableName === 'sales_reports') dateCol = 'date';
                    if (tableName === 'detail_reports') dateCol = 'Ngày';

                    if (dateFrom) query = query.gte(dateCol, dateFrom);
                    if (dateTo) query = query.lte(dateCol, dateTo);
                }

                const { data, error } = await query;
                if (error) {
                    console.error(`Error fetching ${tableId}`, error);
                    continue; // Skip failed table but continue others
                }

                // Save file using Vietnamese Name (sanitized)
                const safeName = card.name.replace(/\//g, '-');
                zip.file(`${safeName}.json`, JSON.stringify(data, null, 2));
            }

            const content = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = url;
            link.download = `SYSTEM_BACKUP_${new Date().toISOString().slice(0, 10)}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            toast.success("✅ Đã tải backup toàn bộ (ZIP) thành công!");
        } catch (err) {
            console.error("Download All Error:", err);
            toast.error(`❌ Lỗi backup: ${err.message}`);
        }
    };

    // --- UPLOAD LOGIC ---
    const [selectedUploadTableId, setSelectedUploadTableId] = useState(null);

    const getRealTableName = (tableId) => {
        if (['cskh_all', 'cskh_money', 'cskh_report', 'sale_orders', 'delivery_orders', 'delivery_reports', 'mkt_orders'].includes(tableId)) {
            return 'orders';
        } else if (tableId === 'sale_reports') {
            return 'sales_reports';
        } else if (tableId === 'mkt_reports') {
            return 'detail_reports';
        }
        return tableId;
    };

    const handleUploadCardClick = (tableId) => {
        setSelectedUploadTableId(tableId);
        // Trigger hidden input
        document.getElementById('json-upload-input').click();
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const tableId = selectedUploadTableId;
        const tableName = getRealTableName(tableId);

        if (!window.confirm(`Bạn có chắc muốn UPLOAD dữ liệu vào bảng [${tableName}] (ID: ${tableId})?\nHành động này sẽ ghi đè/thêm mới dữ liệu.`)) {
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = JSON.parse(e.target.result);
                if (!Array.isArray(json)) {
                    toast.error("File JSON phải là một danh sách (Array) các đối tượng.");
                    return;
                }

                toast.info(`Đang upload ${json.length} dòng vào [${tableName}]...`);

                // Chunking upsert to avoid payload limits
                const CHUNK_SIZE = 100;
                let successCount = 0;
                let errorCount = 0;

                const salesReportsIntegerFields = new Set([
                    'mess_count', 'response_count', 'order_count',
                    'order_count_actual', 'order_cancel_count_actual',
                    'order_cancel_count', 'order_success_count',
                    'customer_old', 'customer_new', 'cross_sale'
                ]);

                const salesReportsNumericFields = new Set([
                    'revenue_mess', 'revenue_actual', 'revenue_go_actual',
                    'revenue_cancel_actual', 'revenue_after_cancel_actual',
                    'revenue_go', 'revenue_cancel', 'revenue_success'
                ]);

                const normalizeSalesReportsRow = (row) => {
                    const normalized = { ...row };

                    Object.keys(normalized).forEach((key) => {
                        const rawValue = normalized[key];

                        if (salesReportsIntegerFields.has(key) || salesReportsNumericFields.has(key)) {
                            if (rawValue === '' || rawValue === null || rawValue === undefined) {
                                normalized[key] = 0;
                                return;
                            }

                            if (typeof rawValue === 'string') {
                                // Handle values like "1.234.567" or "1,234,567"
                                const sign = rawValue.trim().startsWith('-') ? '-' : '';
                                const digits = rawValue.replace(/[^0-9]/g, '');
                                normalized[key] = digits ? Number(sign + digits) : 0;
                                return;
                            }

                            const parsed = Number(rawValue);
                            normalized[key] = Number.isFinite(parsed) ? parsed : 0;
                        }
                    });

                    return normalized;
                };

                const normalizeDetailReportsRow = (row) => {
                    const normalized = { ...row };

                    // Prevent invalid date syntax: "" -> null for DATE columns
                    ['Ngày', 'ngay', 'date'].forEach((dateKey) => {
                        if (Object.prototype.hasOwnProperty.call(normalized, dateKey)) {
                            const val = normalized[dateKey];
                            if (val === '' || val === undefined) {
                                normalized[dateKey] = null;
                            }
                        }
                    });

                    return normalized;
                };

                for (let i = 0; i < json.length; i += CHUNK_SIZE) {
                    const chunkRaw = json.slice(i, i + CHUNK_SIZE);
                    const chunk = tableName === 'sales_reports'
                        ? chunkRaw.map(normalizeSalesReportsRow)
                        : tableName === 'detail_reports'
                            ? chunkRaw.map(normalizeDetailReportsRow)
                            : chunkRaw;
                    // Sanitizing data: Remove implicit fields if necessary, or let Supabase handle it.
                    // Ideally we should strip 'id' if we want auto-increment, but usually we keep it for sync.


                    // Determine Conflict Key
                    let conflictKey = 'id';
                    if (tableName === 'orders' && chunk[0]?.order_code) {
                        conflictKey = 'order_code';
                    }

                    let error = null;
                    try {
                        const res = await supabase.from(tableName).upsert(chunk, { onConflict: conflictKey, ignoreDuplicates: false });
                        error = res.error;
                        if (error && conflictKey !== 'id') {
                            // Fallback to ID if custom key fails (e.g. no constraint)
                            console.warn(`Upsert with ${conflictKey} failed, retrying with id...`);
                            const res2 = await supabase.from(tableName).upsert(chunk, { onConflict: 'id', ignoreDuplicates: false });
                            error = res2.error;
                        }
                    } catch (e) { error = e; }

                    if (error) {
                        console.error(`Chunk ${i} error:`, error);
                        errorCount += chunk.length;
                    } else {
                        successCount += chunk.length;
                    }
                }

                if (errorCount > 0) {
                    toast.warn(`Upload hoàn tất: ${successCount} thành công, ${errorCount} thất bại.`);
                } else {
                    toast.success(`Upload thành công toàn bộ ${successCount} dòng!`);
                }

            } catch (err) {
                console.error("Parse error:", err);
                toast.error("Lỗi đọc file JSON: " + err.message);
            } finally {
                // Reset input
                event.target.value = null;
                setSelectedUploadTableId(null);
            }
        };
        reader.readAsText(file);
    };

    // Load danh sách sản phẩm từ database (bảng mới với 2 cột)
    const fetchProductsFromDatabase = async () => {
        try {
            const { data, error } = await supabase
                .from('system_settings')
                .select('id, name, type')
                .order('name', { ascending: true });

            if (error) {
                // Nếu bảng chưa có hoặc lỗi, bỏ qua
                console.log("Error loading products from database:", error);
                setDbProducts([]);
                return;
            }

            if (data && data.length > 0) {
                setDbProducts(data);
                console.log(`✅ Loaded ${data.length} products from database`);
            } else {
                setDbProducts([]);
            }
        } catch (err) {
            console.error("Error fetching products from database:", err);
            setDbProducts([]);
        }
    };

    const fetchSettingsFromSupabase = async () => {
        setLoadingSettings(true);
        try {
            // Load products từ bảng mới (2 cột: name, type)
            await fetchProductsFromDatabase();

            // Schema mới không còn dùng id='global_config' với settings JSONB
            // Thay vào đó, sản phẩm được lưu trực tiếp với name và type
            // Nên không cần query theo id nữa

            // Fallback to local settings
            setSettings(getSystemSettings());
        } catch (err) {
            console.error("Error loading settings:", err);
            // Fallback to local
            setSettings(getSystemSettings());
        } finally {
            setLoadingSettings(false);
        }
    };

    const fetchReferenceData = async () => {
        setLoadingData(true);
        try {
            // Fetch unique Products and Markets from orders for suggestions
            const { data, error } = await supabase
                .from('orders')
                .select('product_name_1, product, country, city')
                .limit(1000); // Sample data

            if (error) throw error;

            if (data) {
                const products = new Set();
                const markets = new Set();
                data.forEach(r => {
                    if (r.product) products.add(r.product); // Bỏ qua product_main, chỉ dùng product
                    if (r.product_name_1) products.add(r.product_name_1);
                    if (r.country) markets.add(r.country);
                });

                // Merge with defaults to ensure basic list exists
                ["Glutathione Collagen", "Bakuchiol Retinol", "Nám DR Hancy", "Kem Body", "Glutathione Collagen NEW", "DG", "Dragon Blood Cream"].forEach(p => products.add(p));
                ["US", "Nhật Bản", "Hàn Quốc", "Canada", "Úc", "Anh"].forEach(m => markets.add(m));

                // Loại bỏ các sản phẩm đã có trong database khỏi gợi ý
                const existingProductNames = new Set(dbProducts.map(p => p.name.toLowerCase().trim()));
                const filteredProducts = Array.from(products).filter(p => {
                    const normalizedName = p.toLowerCase().trim();
                    return !existingProductNames.has(normalizedName);
                });

                setProductSuggestions(filteredProducts.sort());
                setAvailableMarkets(Array.from(markets).sort());
            }
        } catch (err) {
            console.error("Error fetching ref data", err);
            // Fallback
            const existingProductNames = new Set(dbProducts.map(p => p.name.toLowerCase().trim()));
            const defaultProducts = ["Glutathione Collagen", "Bakuchiol Retinol", "Nám DR Hancy", "Kem Body", "Glutathione Collagen NEW", "DG", "Dragon Blood Cream"];
            const filteredProducts = defaultProducts.filter(p => !existingProductNames.has(p.toLowerCase().trim()));
            setProductSuggestions(filteredProducts);
            setAvailableMarkets(["US", "Nhật Bản", "Hàn Quốc", "Canada", "Úc", "Anh"]);
        } finally {
            setLoadingData(false);
        }
    };

    // Load tỷ giá từ database
    const loadExchangeRates = async () => {
        setExchangeLoading(true);
        try {
            const { data, error } = await supabase
                .from('exchange_rates')
                .select('*')
                .order('ti_gia', { ascending: true });

            if (error) {
                throw error;
            } else if (data && data.length > 0) {
                setExchangeRates(data);
            } else {
                // Nếu chưa có dữ liệu, insert dữ liệu mặc định vào database
                const defaultRates = [
                    { ti_gia: 'USD', gia_tri: 25000 },
                    { ti_gia: 'JPY', gia_tri: 180 },
                    { ti_gia: 'CAD', gia_tri: 19000 },
                    { ti_gia: 'AUD', gia_tri: 18000 },
                    { ti_gia: 'GBP', gia_tri: 32000 },
                    { ti_gia: 'KRW', gia_tri: 20 },
                ];
                
                const { data: insertedData, error: insertError } = await supabase
                    .from('exchange_rates')
                    .insert(defaultRates)
                    .select();

                if (insertError) {
                    console.error('Error inserting default rates:', insertError);
                    // Nếu insert lỗi, vẫn set vào state để hiển thị
                    setExchangeRates(defaultRates);
                } else {
                    setExchangeRates(insertedData || defaultRates);
                }
            }
        } catch (error) {
            console.error('Error loading exchange rates:', error);
            const errorMessage = String(error?.message || '');
            const isMissingTable = error?.code === 'PGRST205' || errorMessage.includes("Could not find table 'public.exchange_rates'");

            if (isMissingTable) {
                setExchangeRates([
                    { ti_gia: 'USD', gia_tri: 25000 },
                    { ti_gia: 'JPY', gia_tri: 180 },
                    { ti_gia: 'CAD', gia_tri: 19000 },
                    { ti_gia: 'AUD', gia_tri: 18000 },
                    { ti_gia: 'GBP', gia_tri: 32000 },
                    { ti_gia: 'KRW', gia_tri: 20 },
                ]);
                toast.error('Thiếu bảng exchange_rates trên Supabase. Hãy chạy migration rồi tải lại.');
            } else {
                toast.error('Lỗi khi tải tỷ giá: ' + error.message);
            }
        } finally {
            setExchangeLoading(false);
        }
    };

    // Save tỷ giá đơn lẻ vào database (khi edit từng dòng)
    const handleSaveSingleRate = async (rateId) => {
        try {
            const rateData = exchangeRates.find(r => r.id === rateId);
            if (!rateData) {
                toast.error('Không tìm thấy tỷ giá cần cập nhật');
                return;
            }

            const editData = editValues[rateId];
            if (!editData) {
                toast.error('Không có dữ liệu để lưu');
                return;
            }

            const updateData = {
                gia_tri: parseFloat(editData.gia_tri) || 0,
                updated_at: new Date().toISOString(),
            };

            // Nếu ti_gia thay đổi, cập nhật cả ti_gia
            if (editData.ti_gia && editData.ti_gia.trim() !== rateData.ti_gia) {
                updateData.ti_gia = editData.ti_gia.trim().toUpperCase();
            }

            const { error } = await supabase
                .from('exchange_rates')
                .update(updateData)
                .eq('id', rateId);

            if (error) throw error;
            
            // Reload để đảm bảo đồng bộ với database
            await loadExchangeRates();
            setEditingRateId(null);
            setEditValues(prev => {
                const newVals = { ...prev };
                delete newVals[rateId];
                return newVals;
            });
            toast.success('Đã cập nhật tỷ giá thành công!');
        } catch (error) {
            console.error('Error saving exchange rate:', error);
            toast.error('Lỗi khi lưu tỷ giá: ' + error.message);
        }
    };

    // Save tất cả tỷ giá vào database (khi nhấn nút Lưu tỷ giá)
    const handleSaveExchangeRates = async () => {
        setExchangeSaving(true);
        try {
            // Upsert tất cả các tỷ giá
            const updates = exchangeRates.map(rate => ({
                ti_gia: rate.ti_gia,
                gia_tri: rate.gia_tri,
                updated_at: new Date().toISOString(),
            }));

            // Sử dụng upsert với onConflict để update nếu đã tồn tại
            const { error } = await supabase
                .from('exchange_rates')
                .upsert(updates, {
                    onConflict: 'ti_gia',
                    ignoreDuplicates: false
                });

            if (error) throw error;
            
            // Reload để lấy ID mới nếu có
            await loadExchangeRates();
            toast.success('Đã lưu tất cả tỷ giá thành công!');
        } catch (error) {
            console.error('Error saving exchange rates:', error);
            toast.error('Lỗi khi lưu tỷ giá: ' + error.message);
        } finally {
            setExchangeSaving(false);
        }
    };

    // Đồng bộ users.team theo dữ liệu MKT (detail_reports) khớp theo tên nhân sự.
    const handleSyncMktTeamsToUsers = async () => {
        if (!window.confirm('Đồng bộ toàn bộ cột team trong bảng users theo tên từ dữ liệu MKT?')) return;

        setSyncMktTeamLoading(true);
        try {
            const normalizeName = (v) =>
                String(v || '')
                    .trim()
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/\s+/g, ' ');

            const normalizeTeam = (v) => String(v || '').trim();

            // 1) Đọc users để biết danh sách cần update
            const { data: users, error: usersErr } = await supabase
                .from('users')
                .select('id, name, team');
            if (usersErr) throw usersErr;

            // 2) Đọc nguồn MKT team từ detail_reports (ưu tiên schema snake_case)
            let mktRows = [];
            const { data: snakeRows, error: snakeErr } = await supabase
                .from('detail_reports')
                .select('ten, team')
                .not('team', 'is', null)
                .neq('team', '');

            if (!snakeErr) {
                mktRows = (snakeRows || []).map((r) => ({ name: r.ten, team: r.team }));
            } else {
                // Fallback nếu DB đang dùng cột tiếng Việt
                const { data: viRows, error: viErr } = await supabase
                    .from('detail_reports')
                    .select('"Tên", "Team"')
                    .not('"Team"', 'is', null)
                    .neq('"Team"', '');
                if (viErr) throw viErr;
                mktRows = (viRows || []).map((r) => ({ name: r['Tên'], team: r['Team'] }));
            }

            // 3) Gom team theo tên và chọn team xuất hiện nhiều nhất
            const nameTeamCounter = new Map(); // normalizedName -> Map(team -> count)
            (mktRows || []).forEach((row) => {
                const n = normalizeName(row?.name);
                const t = normalizeTeam(row?.team);
                if (!n || !t) return;
                if (!nameTeamCounter.has(n)) nameTeamCounter.set(n, new Map());
                const teamMap = nameTeamCounter.get(n);
                teamMap.set(t, (teamMap.get(t) || 0) + 1);
            });

            const nameToBestTeam = new Map();
            nameTeamCounter.forEach((teamMap, n) => {
                let bestTeam = '';
                let bestCount = -1;
                teamMap.forEach((count, teamName) => {
                    if (count > bestCount) {
                        bestCount = count;
                        bestTeam = teamName;
                    }
                });
                if (bestTeam) nameToBestTeam.set(n, bestTeam);
            });

            // 4) Tạo danh sách update: chỉ update khi team tìm thấy và khác team hiện tại
            const updates = [];
            (users || []).forEach((u) => {
                const n = normalizeName(u?.name);
                if (!n) return;
                const mappedTeam = nameToBestTeam.get(n);
                if (!mappedTeam) return;
                const currentTeam = normalizeTeam(u?.team);
                if (currentTeam === mappedTeam) return;
                updates.push({ id: u.id, team: mappedTeam, name: u.name || '' });
            });

            if (updates.length === 0) {
                toast.info('Không có dữ liệu cần đồng bộ team.');
                return;
            }

            // 5) Update theo lô
            const CHUNK_SIZE = 100;
            let done = 0;
            for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
                const chunk = updates.slice(i, i + CHUNK_SIZE);
                await Promise.all(
                    chunk.map((u) =>
                        supabase
                            .from('users')
                            .update({ team: u.team })
                            .eq('id', u.id)
                    )
                );
                done += chunk.length;
            }

            toast.success(`Đã đồng bộ team MKT cho ${done} nhân sự (khớp theo Tên).`);
        } catch (error) {
            console.error('Error syncing MKT teams to users:', error);
            toast.error('Lỗi đồng bộ team MKT: ' + (error?.message || 'Unknown error'));
        } finally {
            setSyncMktTeamLoading(false);
        }
    };

    // Lưu sản phẩm vào database (bảng mới với 2 cột)
    const saveProductToDatabase = async (productName, productType) => {
        try {
            const normalizedName = String(productName || '').trim();
            const { data: existingRows, error: checkError } = await supabase
                .from('system_settings')
                .select('id')
                .eq('name', normalizedName)
                .limit(1);

            if (checkError) throw checkError;

            if (existingRows && existingRows.length > 0) {
                const { error: updateError } = await supabase
                    .from('system_settings')
                    .update({ type: productType })
                    .eq('id', existingRows[0].id);

                if (updateError) throw updateError;
            } else {
                const { error: insertError } = await supabase
                    .from('system_settings')
                    .insert({
                        name: normalizedName,
                        type: productType
                    });

                if (insertError) throw insertError;
            }

            return true;
        } catch (err) {
            console.error("Error saving product to database:", err);
            throw err;
        }
    };

    // Xóa sản phẩm khỏi database
    const deleteProductFromDatabase = async (productName) => {
        try {
            const { error } = await supabase
                .from('system_settings')
                .delete()
                .eq('name', productName.trim());

            if (error) throw error;
            return true;
        } catch (err) {
            console.error("Error deleting product from database:", err);
            throw err;
        }
    };

    // Cập nhật loại sản phẩm trong database
    const updateProductTypeInDatabase = async (productName, newType) => {
        try {
            const { error } = await supabase
                .from('system_settings')
                .update({
                    type: newType
                })
                .eq('name', productName.trim());

            if (error) throw error;
            return true;
        } catch (err) {
            console.error("Error updating product type in database:", err);
            throw err;
        }
    };

    const handleSaveSettings = async () => {
        setLoadingSettings(true);
        try {
            // Save to LocalStorage as backup/cache
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

            // Lưu tất cả sản phẩm từ dbProducts vào database
            if (dbProducts.length > 0) {
                const savePromises = dbProducts.map(product =>
                    saveProductToDatabase(product.name, product.type)
                );
                await Promise.all(savePromises);
            }

            toast.success("✅ Đã lưu danh sách sản phẩm lên Server thành công!");
            window.dispatchEvent(new Event('storage'));
            window.dispatchEvent(new Event('settingsUpdated'));

            // Reload để cập nhật lại danh sách
            await fetchProductsFromDatabase();
        } catch (err) {
            console.error("Save error:", err);
            if (err.message && err.message.includes('relation "system_settings" does not exist')) {
                toast.error("❌ Bảng system_settings chưa được tạo trên Supabase.");
            } else {
                toast.error(`❌ Lỗi lưu cấu hình: ${err.message}`);
            }
            toast.warn("Đã lưu tạm vào máy cá nhân (Local).");
        } finally {
            setLoadingSettings(false);
        }
    };

    const toggleItem = (category, item) => {
        setSettings(prev => {
            const currentList = prev[category];
            if (currentList.includes(item)) {
                return { ...prev, [category]: currentList.filter(i => i !== item) };
            } else {
                return { ...prev, [category]: [...currentList, item] };
            }
        });
    };

    // --- SNAPSHOT ACTIONS ---
    const handleSnapshot = async () => {
        if (!window.confirm('Bạn có chắc chắn muốn chốt ca? \nViệc này sẽ cập nhật dữ liệu báo cáo từ dữ liệu hiện tại.')) {
            return;
        }

        setLoading(true);
        try {
            await performEndOfShiftSnapshot(userEmail);
            toast.success('Đã chốt ca thành công! Dữ liệu báo cáo đã được cập nhật.');
            setLastSnapshot(new Date());
        } catch (error) {
            console.error(error);
            toast.error('Có lỗi xảy ra khi chốt ca: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const checkSystem = async () => {
        setCheckLoading(true);
        setDbStatus(null);
        try {
            const results = {};

            // 1. Check Supabase (Connection & Tables)
            const tables = [
                // Core Data
                'orders', 'detail_reports', 'blacklist',
                // RBAC
                'app_roles', 'app_user_roles', 'app_permissions',
                // System & Logs
                'change_logs', 'system_settings', 'f3_data_snapshot'
            ];
            const startSupabase = performance.now();

            for (const table of tables) {
                const { error, count } = await supabase
                    .from(table)
                    .select('*', { count: 'exact', head: true });

                if (error) {
                    // Ignore 404 for system_settings if it's new
                    if (table === 'system_settings' && error.code === '42P01') {
                        results[table] = { status: 'WARNING', message: 'Table not created yet', code: 'MISSING' };
                    } else if (error.code === '42P01') { // Undefined Table
                        results[table] = { status: 'ERROR', message: `MISSING TABLE: ${table}`, code: error.code };
                    } else {
                        results[table] = { status: 'ERROR', message: error.message, code: error.code };
                    }
                } else {
                    results[table] = { status: 'OK', count: count };
                }
            }
            const endSupabase = performance.now();
            results['Supabase Latency'] = { status: 'INFO', message: `${(endSupabase - startSupabase).toFixed(0)} ms`, type: 'latency' };

            // 2. Check Firebase (API Connection)
            const hrUrl = import.meta.env.VITE_HR_URL;
            if (hrUrl) {
                const startFirebase = performance.now();
                try {
                    const res = await fetch(hrUrl);
                    if (res.ok) {
                        const endFirebase = performance.now();
                        results['Firebase API (HR)'] = { status: 'OK', message: 'Connected' };
                        results['Firebase Latency'] = { status: 'INFO', message: `${(endFirebase - startFirebase).toFixed(0)} ms`, type: 'latency' };
                    } else {
                        results['Firebase API (HR)'] = { status: 'ERROR', message: `Status: ${res.status}` };
                    }
                } catch (e) {
                    results['Firebase API (HR)'] = { status: 'ERROR', message: e.message };
                }
            }

            // 3. Network Check (Ping Google)
            const startNet = performance.now();
            try {
                // Using a no-cors request just to check network reachability
                await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors', cache: 'no-cache' });
                const endNet = performance.now();
                results['Server Network'] = { status: 'OK', message: 'Online' };
                results['Internet Latency'] = { status: 'INFO', message: `${(endNet - startNet).toFixed(0)} ms`, type: 'latency' };
            } catch (e) {
                results['Server Network'] = { status: 'ERROR', message: 'Offline / Blocked' };
            }

            setDbStatus(results);
            toast.success("Đã hoàn tất quét toàn bộ hệ thống API & Mạng");
        } catch (err) {
            console.error(err);
            toast.error("Lỗi khi kiểm tra: " + err.message);
        } finally {
            setCheckLoading(false);
        }
    };

    // --- VERIFICATION ACTIONS ---
    const compareTables = async () => {
        setVerifying(true);
        setVerifyResult(null);
        try {
            console.log("Starting comparison...");
            const { data: supabaseOrders, error: errOrders } = await supabase.from('orders').select('order_code, created_at');
            if (errOrders) throw errOrders;

            const sheetData = await ApiService.fetchGoogleSheetData();

            const supabaseCodes = new Set(supabaseOrders.map(o => o.order_code));
            const sheetCodes = new Set(sheetData.map(r => r["Mã đơn hàng"]));

            const missingInSupabase = sheetData.filter(r => !supabaseCodes.has(r["Mã đơn hàng"]));
            const missingInSheet = supabaseOrders.filter(o => !sheetCodes.has(o.order_code));

            setVerifyResult({
                orders: supabaseOrders.length,
                reports: sheetData.length,
                diff: supabaseOrders.length - sheetData.length,
                details: {
                    missingInSupabase: missingInSupabase.length,
                    missingInSheet: missingInSheet.length,
                    sampleMissing: missingInSupabase.slice(0, 5).map(r => r["Mã đơn hàng"]),
                    missingData: missingInSupabase // Store full data for sync
                }
            });
            toast.success("Đối soát hoàn tất!");
        } catch (e) {
            console.error(e);
            toast.error("Lỗi đối soát: " + e.message);
        } finally {
            setVerifying(false);
        }
    };

    const handleSync = async () => {
        if (!verifyResult || !verifyResult.details.missingData || verifyResult.details.missingData.length === 0) {
            toast.info("Không có dữ liệu thiếu để đồng bộ.");
            return;
        }

        if (!window.confirm(`Bạn có chắc muốn đồng bộ ${verifyResult.details.missingInSupabase} đơn hàng từ Sheet vào Web không?`)) return;

        setVerifying(true);
        try {
            const dataToSync = verifyResult.details.missingData;
            const CHUNK_SIZE = 50;
            let processed = 0;

            for (let i = 0; i < dataToSync.length; i += CHUNK_SIZE) {
                const chunk = dataToSync.slice(i, i + CHUNK_SIZE);
                await ApiService.updateBatch(chunk, user?.email || 'admin_sync_tool');
                processed += chunk.length;
                console.log(`Synced ${processed}/${dataToSync.length}`);
            }

            toast.success(`Đồng bộ thành công ${processed} đơn hàng!`);
            await compareTables(); // Re-verify
        } catch (e) {
            console.error(e);
            toast.error("Lỗi đồng bộ: " + e.message);
        } finally {
            setVerifying(false);
        }
    };

    const handleUpdateActiveTab = (tab) => {
        setActiveTab(tab);
    };

    // --- HÀM XEM TRƯỚC NHÂN SỰ ĐI LÀM ---
    const handlePreviewActiveStaff = async () => {
        setIsPreviewStaffLoading(true);
        setShowStaffPreviewModal(true);
        try {
            const { data, error } = await supabase
                .from('danh_sach_van_don')
                .select('ho_va_ten, chi_nhanh, trang_thai_chia');
            
            if (error) throw error;

            const ultraNormalize = (s) => {
                return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.\-_/]/g, ' ').replace(/\s+/g, '').trim();
            };

            const processed = (data || []).map(item => {
                const status = String(item.trang_thai_chia || '').trim().toUpperCase();
                const branchRaw = String(item.chi_nhanh || '').trim();
                const norm = ultraNormalize(branchRaw);
                
                let detectedBranch = 'Không xác định';
                let isValid = false;

                if (norm === 'hcm' || norm === 'tphcm' || norm === 'hochiminh' || norm.includes('hcm')) {
                    detectedBranch = 'HCM';
                    isValid = true;
                } else if (norm === 'hanoi' || norm === 'hn' || norm.includes('hanoi')) {
                    detectedBranch = 'Hà Nội';
                    isValid = true;
                }

                return {
                    name: item.ho_va_ten,
                    status: status,
                    rawBranch: branchRaw,
                    detectedBranch: detectedBranch,
                    isU1: status === 'U1',
                    isValid: isValid && status === 'U1'
                };
            }).filter(p => p.isU1); // Chỉ xem những người đang để U1

            setActiveStaffPreview(processed);
        } catch (err) {
            console.error(err);
            toast.error('Không thể tải danh sách nhân sự: ' + err.message);
        } finally {
            setIsPreviewStaffLoading(false);
        }
    };

    // --- AUTO ASSIGN FUNCTIONS ---
    /** Danh sách CSKH: bảng users, bộ phận CSKH + cùng chi nhánh với team đơn (branch hoặc team). */
    const loadCSKHStaffForBranch = async (orderTeamBranch) => {
        const branchKey = String(orderTeamBranch ?? '').trim();
        if (!branchKey) {
            toast.error('Thiếu chi nhánh để tải danh sách CSKH');
            return [];
        }
        try {
            const { data, error } = await supabase
                .from('users')
                .select('name, email, department, position, branch, team')
                .order('name', { ascending: true });

            if (error) throw error;

            const staffNames = (data || [])
                .filter((u) => {
                    if (!userDepartmentIsCSKH(u.department)) return false;
                    const br = u.branch ?? u.team ?? '';
                    return userBranchMatchesOrderTeam(br, branchKey);
                })
                .map((u) => u.name)
                .filter(Boolean);

            setCskhStaff(staffNames);
            return staffNames;
        } catch (error) {
            console.error('Error loading CSKH staff:', error);
            toast.error('Lỗi khi tải danh sách nhân sự CSKH theo chi nhánh');
            return [];
        }
    };

    async function runPhanBoCskhOrders(
        ordersTable,
        { requireCoBillPayment = false, team, manageGlobalLoading = true } = {}
    ) {
        if (manageGlobalLoading) {
            setAutoAssignLoading(true);
            setAutoAssignResult(null);
            setNotDividedOrders([]);
        }

        const teamFilter = String(team ?? '').trim();
        if (!teamFilter) {
            if (manageGlobalLoading) setAutoAssignLoading(false);
            throw new Error('Thiếu chi nhánh (team) để lọc đơn');
        }

        try {
            const staffList = await loadCSKHStaffForBranch(teamFilter);
            if (staffList.length === 0) {
                throw new Error(
                    `Không có nhân sự CSKH cho chi nhánh "${teamFilter}". Kiểm tra users: department (CSKH) và branch/team khớp chi nhánh.`
                );
            }

            // Parse selectedMonth để filter đơn hàng
            const [year, month] = selectedMonth.split('-').map(Number);
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59);

            const { data: ordersRaw, error: ordersError } = await supabase
                .from(ordersTable)
                .select('*')
                .eq('team', teamFilter)
                .gte('order_date', startDate.toISOString().split('T')[0])
                .lte('order_date', endDate.toISOString().split('T')[0]);

            if (ordersError) throw ordersError;

            let orders = ordersRaw;
            if (requireCoBillPayment) {
                orders = (ordersRaw || []).filter(orderTrangThaiThanhToanIsCoBill);
                if (!orders.length && (ordersRaw || []).length > 0) {
                    toast.info(
                        'Không có đơn nào có Trạng thái thanh toán = "Có Bill" (payment_status_detail / payment_status) trong khoảng đã chọn.'
                    );
                }
            }

            // --- Bước bổ sung: Điền chi nhánh (team) cho đơn hàng trống ---
            const ordersWithoutTeam = orders?.filter(o => !o.team || o.team.toString().trim() === '') || [];

            if (ordersWithoutTeam.length > 0) {
                console.log(`🔍 [Chia đơn CSKH] Có ${ordersWithoutTeam.length} đơn chưa có chi nhánh (team), đang điền lại...`);

                const { data: allUsers, error: usersError } = await supabase
                    .from('users')
                    .select('name, branch');

                if (usersError) {
                    console.warn('⚠️ [Chia đơn CSKH] Lỗi query users để lấy branch:', usersError);
                } else {
                    const nameToBranch = {};
                    (allUsers || []).forEach(u => {
                        if (u.name && u.branch) {
                            nameToBranch[u.name.trim()] = u.branch.trim();
                        }
                    });

                    const branchUpdates = [];
                    ordersWithoutTeam.forEach(order => {
                        const saleName = order.sale_staff?.toString().trim();
                        if (saleName && nameToBranch[saleName]) {
                            branchUpdates.push({
                                order_code: order.order_code,
                                team: nameToBranch[saleName]
                            });
                            order.team = nameToBranch[saleName];
                        }
                    });

                    if (branchUpdates.length > 0) {
                        console.log(`📝 [Chia đơn CSKH] Đang cập nhật chi nhánh cho ${branchUpdates.length} đơn...`);
                        const CHUNK_SIZE = 50;
                        for (let i = 0; i < branchUpdates.length; i += CHUNK_SIZE) {
                            const chunk = branchUpdates.slice(i, i + CHUNK_SIZE);
                            const updatePromises = chunk.map(u =>
                                supabase
                                    .from(ordersTable)
                                    .update({ team: u.team })
                                    .eq('order_code', u.order_code)
                            );
                            await Promise.all(updatePromises);
                        }
                        console.log(`✅ [Chia đơn CSKH] Đã điền chi nhánh cho ${branchUpdates.length} đơn`);
                        toast.info(`Đã điền chi nhánh cho ${branchUpdates.length} đơn trước khi chia`);
                    } else {
                        console.log(`⚠️ [Chia đơn CSKH] Không tìm được branch cho ${ordersWithoutTeam.length} đơn (sale_staff không có trong bảng users)`);
                    }
                }
            }

            const eligibleOrders = orders?.filter(order => {
                const hasCSKH = order.cskh && order.cskh.toString().trim() !== '';
                return !hasCSKH;
            }) || [];

            const getMonthKey = (orderDate) => {
                if (!orderDate) return null;
                const date = new Date(orderDate);
                if (isNaN(date.getTime())) return null;
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                return `${y}-${m}`;
            };

            const counter = {};
            staffList.forEach(name => {
                counter[name] = {};
            });

            orders?.forEach(order => {
                const cskh = order.cskh?.toString().trim();
                const sale = order.sale_staff?.toString().trim();
                const monthKey = getMonthKey(order.order_date);

                if (cskh && staffList.includes(cskh) && cskh !== sale && monthKey) {
                    counter[cskh][monthKey] = (counter[cskh][monthKey] || 0) + 1;
                }
            });

            const waitingRows = [];
            const updates = [];

            eligibleOrders.forEach(order => {
                const sale = order.sale_staff?.toString().trim();

                if (sale && staffList.includes(sale)) {
                    updates.push({
                        order_code: order.order_code,
                        cskh: sale
                    });
                } else {
                    waitingRows.push(order);
                }
            });

            waitingRows.forEach(order => {
                const monthKey = getMonthKey(order.order_date);
                if (!monthKey) {
                    console.warn(`Đơn ${order.order_code} không có order_date hợp lệ`);
                    return;
                }

                let selectedName = null;
                let minVal = Infinity;

                staffList.forEach(name => {
                    const val = counter[name][monthKey] || 0;
                    if (val < minVal) {
                        minVal = val;
                        selectedName = name;
                    }
                });

                if (selectedName) {
                    updates.push({
                        order_code: order.order_code,
                        cskh: selectedName
                    });
                    counter[selectedName][monthKey] = (counter[selectedName][monthKey] || 0) + 1;
                }
            });

            if (updates.length > 0) {
                const CHUNK_SIZE = 50;
                for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
                    const chunk = updates.slice(i, i + CHUNK_SIZE);
                    const updatePromises = chunk.map(update =>
                        supabase
                            .from(ordersTable)
                            .update({ cskh: update.cskh })
                            .eq('order_code', update.order_code)
                    );
                    await Promise.all(updatePromises);
                }
            }

            const tableHint =
                ordersTable === CSKH_ORDER_TABLE_HCM
                    ? '\n- Nguồn: bảng order_code_hcm; chỉ đơn có Trạng thái thu tiền = \"Có Bill\" (ưu tiên payment_status_detail).'
                    : '\n- Nguồn: bảng orders; chỉ đơn có Trạng thái thu tiền = \"Có Bill\" (ưu tiên payment_status_detail).';

            const message =
                `✅ Phân bổ đơn hàng thành công! (${teamFilter})${tableHint}\n\n` +
                `- Tổng đơn đã xử lý: ${updates.length}\n` +
                `- Đơn Sale tự chăm: ${updates.filter(u => orders?.find(o => o.order_code === u.order_code)?.sale_staff === u.cskh).length}\n` +
                `- Đơn được chia mới: ${updates.length - updates.filter(u => orders?.find(o => o.order_code === u.order_code)?.sale_staff === u.cskh).length}\n` +
                `- Nhân sự CSKH (${teamFilter}): ${staffList.length} người`;

            setAutoAssignResult({ success: true, message });
            toast.success(`Đã phân bổ ${updates.length} đơn hàng!`);
        } catch (error) {
            console.error('Error in runPhanBoCskhOrders:', error);
            setAutoAssignResult({ success: false, message: `Lỗi: ${error.message}` });
            toast.error('Lỗi phân bổ đơn hàng: ' + error.message);
        } finally {
            if (manageGlobalLoading) setAutoAssignLoading(false);
        }
    }

    /** Phân bổ CSKH — bảng `orders`, team Hà Nội (độc lập với HCM). */
    const handlePhanBoDonHangHaNoi = async () => {
        await runPhanBoCskhOrders(CSKH_ORDER_TABLE_HN, {
            requireCoBillPayment: true,
            team: 'Hà Nội',
        });
    };

    /** Phân bổ CSKH — bảng `order_code_hcm`, team HCM. */
    const handlePhanBoDonHangHcm = async () => {
        await runPhanBoCskhOrders(CSKH_ORDER_TABLE_HCM, {
            requireCoBillPayment: true,
            team: 'HCM',
        });
    };

    const handleHachToanBaoCao = async () => {
        setAutoAssignLoading(true);
        setAutoAssignResult(null);
        setNotDividedOrders([]);

        try {
            const staffList = await loadCSKHStaffForBranch(selectedTeam);
            if (staffList.length === 0) {
                throw new Error(
                    `Không có nhân sự CSKH cho chi nhánh "${selectedTeam}". Kiểm tra users: department (CSKH) và branch/team.`
                );
            }

            // Lấy tất cả đơn hàng thỏa điều kiện (không filter theo tháng)
            const { data: orders, error: ordersError } = await supabase
                .from('orders')
                .select('*')
                .eq('team', selectedTeam)
                .eq('accountant_confirm', 'Đã thu tiền');

            if (ordersError) throw ordersError;

            const stats = {};
            staffList.forEach(name => {
                stats[name] = { sale: 0, done: 0, waiting: 0, assigned: 0 };
            });

            orders?.forEach(order => {
                const sale = order.sale_staff?.toString().trim();
                const cskh = order.cskh?.toString().trim();
                const hasCutoff = order.cutoff_time && order.cutoff_time.toString().trim() !== '';

                if (sale && stats[sale]) {
                    stats[sale].sale++;
                }

                if (cskh && stats[cskh]) {
                    if (hasCutoff) {
                        stats[cskh].done++;
                    } else {
                        stats[cskh].waiting++;
                    }
                    if (cskh !== sale) {
                        stats[cskh].assigned++;
                    }
                }
            });

            // Tạo báo cáo
            let report = '📊 Hạch toán báo cáo:\n\n';
            report += 'Tên nhân sự | Số đơn cá nhân | Đơn đã xử lý | Số đơn mới được chia | Đơn chia sau\n';
            report += '-'.repeat(80) + '\n';

            staffList.forEach(name => {
                const s = stats[name];
                report += `${name.padEnd(20)} | ${String(s.sale).padStart(15)} | ${String(s.done).padStart(15)} | ${String(s.waiting).padStart(25)} | ${String(s.assigned).padStart(15)}\n`;
            });

            setAutoAssignResult({ success: true, message: report });
            toast.success('Hạch toán báo cáo thành công!');
        } catch (error) {
            console.error('Error in handleHachToanBaoCao:', error);
            setAutoAssignResult({ success: false, message: `Lỗi: ${error.message}` });
            toast.error('Lỗi hạch toán báo cáo: ' + error.message);
        } finally {
            setAutoAssignLoading(false);
        }
    };

    const handleRunAll = async () => {
        if (
            !window.confirm(
                'Chạy toàn bộ: Phân bổ Hà Nội (orders) → Phân bổ HCM (order_code_hcm) → Hạch toán (chi nhánh đã chọn trong cấu hình)?'
            )
        )
            return;

        setAutoAssignLoading(true);
        setAutoAssignResult(null);
        setNotDividedOrders([]);

        try {
            await runPhanBoCskhOrders(CSKH_ORDER_TABLE_HN, {
                requireCoBillPayment: true,
                team: 'Hà Nội',
                manageGlobalLoading: false,
            });
            await new Promise((resolve) => setTimeout(resolve, 800));
            await runPhanBoCskhOrders(CSKH_ORDER_TABLE_HCM, {
                requireCoBillPayment: true,
                team: 'HCM',
                manageGlobalLoading: false,
            });
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await handleHachToanBaoCao();

            toast.success('Đã hoàn tất toàn bộ quy trình!');
        } catch (error) {
            console.error('Error in handleRunAll:', error);
            toast.error('Lỗi: ' + error.message);
        } finally {
            setAutoAssignLoading(false);
        }
    };

    // --- LOAD LỊCH SỬ CHIA ĐƠN TỪ BẢNG history_chia_don ---
    const handleLoadHistoryChiaDon = async () => {
        setHistoryLoading(true);
        try {
            /** Bộ lọc theo ngày chia thực tế (VN +07), khớp `ngay_chia_van_don` trên đơn / phiên chạy trong ngày VN. */
            const { data, error } = await supabase
                .from('history_chia_don')
                .select('*')
                .gte('created_at', `${historyStartDate}T00:00:00+07:00`)
                .lte('created_at', `${historyEndDate}T23:59:59.999+07:00`)
                .order('created_at', { ascending: false });

            if (error) throw error;

            setHistoryChiaDon(data || []);
            
            // Tính toán thống kê nhân viên gộp từ tất cả các phiên
            const totalStats = {};
            data?.forEach(session => {
                const stats = session.staff_stats || {};
                Object.entries(stats).forEach(([name, count]) => {
                    totalStats[name] = (totalStats[name] || 0) + count;
                });
            });
            setStaffStatsReport(totalStats);

            // --- THỐNG KÊ TÁCH RIÊNG HCM / HÀ NỘI ---
            const isSuccess = (raw) => String(raw || '').trim().toLowerCase() === 'success';

            const byBranch = { HCM: {}, 'Hà Nội': {} };
            const sessionCount = { HCM: 0, 'Hà Nội': 0 };
            const totalOrders = { HCM: 0, 'Hà Nội': 0 };

            (data || [])
                .filter((s) => isSuccess(s.status))
                .forEach((session) => {
                    const br = normalizeHistoryBranchKey(session.branch);
                    if (!br) return; // bỏ qua "Tất cả" / không xác định vì không tách được

                    sessionCount[br] += 1;
                    totalOrders[br] += Number(session.total_orders) || 0;

                    const stats = session.staff_stats || {};
                    Object.entries(stats).forEach(([name, count]) => {
                        byBranch[br][name] = (byBranch[br][name] || 0) + (Number(count) || 0);
                    });
                });

            setStaffStatsReportByBranch(byBranch);
            setSuccessSessionCountByBranch(sessionCount);
            setSuccessTotalOrdersByBranch(totalOrders);
        } catch (err) {
            console.error('❌ [Lịch sử chia đơn] Lỗi:', err);
            toast.error('Lỗi khi tải lịch sử chia đơn');
        } finally {
            setHistoryLoading(false);
        }
    };

    // --- CHIA ĐƠN VẬN ĐƠN ---
    // branchFilter: 'HCM' | 'Hà Nội' | undefined (undefined = cả hai)
    const handleChiaDonVanDon = async (branchFilter) => {
        if (autoAssignLoading) {
            toast.info('Hệ thống đang chia đơn, vui lòng đợi...');
            return;
        }
        setAutoAssignLoading(true);
        setAutoAssignResult(null);
        setNotDividedOrders([]);
        setStepLogs([]); // Reset log

        // Helper function để thêm log vào state và console
        const addLog = (message, type = 'info') => {
            const timestamp = new Date().toLocaleTimeString('vi-VN');
            const logEntry = {
                timestamp,
                type, // 'info', 'success', 'warning', 'error'
                message
            };
            setStepLogs(prev => [...prev, logEntry]);
            // Vẫn log vào console để debug
            if (type === 'error') {
                console.error(`[${timestamp}] ${message}`);
            } else if (type === 'warning') {
                console.warn(`[${timestamp}] ${message}`);
            } else {
                console.log(`[${timestamp}] ${message}`);
            }
        };

        try {
            await runChiaDonVanDon({
                supabase,
                branchFilter,
                addLog,
                setNotDividedOrders,
                setAutoAssignResult,
            });
        } catch (error) {
            console.error('Error in handleChiaDonVanDon:', error);
            setAutoAssignResult({ success: false, message: `Lỗi: ${error.message}` });
            toast.error('Lỗi chia đơn vận đơn: ' + error.message);
        } finally {
            setAutoAssignLoading(false);
            // Refresh lịch sử chia đơn sau khi chia xong
            handleLoadHistoryChiaDon();
        }
    };

    // Helper function để normalize string
    const normalizeStr = (str) => {
        if (!str) return '';
        return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
    };

    const normalizeHistoryBranchKey = (raw) => {
        const s = String(raw || '').trim().toLowerCase();
        if (!s) return null;
        if (s.includes('hcm') || s.includes('hồ chí minh') || s.includes('ho chi minh') || s.includes('tp.hcm')) return 'HCM';
        if (s.includes('hà nội') || s.includes('ha noi') || s.includes('hanoi') || s === 'hn') return 'Hà Nội';
        return null;
    };

    // Xóa toàn bộ dữ liệu trong cột CSKH

    // --- ACCOUNT MANAGEMENT FUNCTIONS ---
    const normalizeHeaderKey = (value) =>
        String(value || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '');

    const getAccountField = (row, aliases) => {
        const normalizedAliases = aliases.map(normalizeHeaderKey);
        for (const key of Object.keys(row || {})) {
            if (normalizedAliases.includes(normalizeHeaderKey(key))) {
                return row[key];
            }
        }
        return '';
    };

    const parseBooleanField = (value) => {
        const normalized = normalizeStr(value);
        return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'co' || normalized === 'x';
    };

    const parseAccountImportRow = (row) => {
        const roleRaw = String(getAccountField(row, ['role', 'vai trò', 'vai tro']) || 'user')
            .trim()
            .toLowerCase();
        const safeRole = ['user', 'leader', 'admin', 'super_admin'].includes(roleRaw) ? roleRaw : 'user';

        const email = String(getAccountField(row, ['email', 'mail', 'email address', 'dia chi email']) || '').trim().toLowerCase();
        const usernameRaw = String(
            getAccountField(row, [
                'username',
                'user name',
                'user',
                'account',
                'account name',
                'tai khoan',
                'tên đăng nhập',
                'ten dang nhap'
            ]) || ''
        ).trim();
        const emailPrefix = email.includes('@') ? email.split('@')[0] : email;
        const username = usernameRaw || emailPrefix;

        const nameRaw = String(
            getAccountField(row, [
                'name',
                'full name',
                'full_name',
                'display name',
                'display_name',
                'họ tên',
                'ho ten',
                'ten',
                'tên'
            ]) || ''
        ).trim();
        const name = nameRaw || username || emailPrefix;

        return {
            email,
            username,
            name,
            password: String(getAccountField(row, ['password', 'password_hash', 'mật khẩu', 'mat khau']) || '').trim(),
            role: safeRole,
            branch: String(getAccountField(row, ['branch', 'chi nhánh', 'chi nhanh', 'team']) || '').trim(),
            department: String(getAccountField(row, ['department', 'phòng ban', 'phong ban']) || '').trim(),
            can_day_ffm: parseBooleanField(getAccountField(row, ['can_day_ffm', 'can day ffm', 'đẩy ffm', 'day ffm']))
        };
    };

    const handleDownloadAccountTemplate = () => {
        try {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(ACCOUNT_TEMPLATE_ROWS);
            XLSX.utils.book_append_sheet(wb, ws, 'Accounts_Template');
            XLSX.writeFile(wb, `Mau_TaiKhoan_${new Date().toISOString().slice(0, 10)}.xlsx`);
            toast.success('Đã tải mẫu Excel tài khoản');
        } catch (error) {
            console.error('Error downloading account template:', error);
            toast.error('Không thể tạo file mẫu Excel: ' + (error?.message || 'Unknown error'));
        }
    };

    const handleImportAccountsFromExcel = async (event) => {
        const file = event?.target?.files?.[0];
        if (!file) return;

        setAccountImportLoading(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const wb = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheetName = wb.SheetNames?.[0];
            if (!firstSheetName) {
                toast.error('File Excel không có sheet dữ liệu.');
                return;
            }

            const ws = wb.Sheets[firstSheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

            if (!rows || rows.length === 0) {
                toast.warning('File Excel trống, không có dữ liệu để nhập.');
                return;
            }

            const bcrypt = await import('bcryptjs');
            let createdCount = 0;
            let updatedCount = 0;
            let skippedCount = 0;
            let failedCount = 0;
            const errorLines = [];

            for (let idx = 0; idx < rows.length; idx++) {
                const lineNo = idx + 2; // +1 for header, +1 for 1-indexed line
                const parsed = parseAccountImportRow(rows[idx]);

                if (!parsed.email || !parsed.username || !parsed.name) {
                    skippedCount++;
                    errorLines.push(`Dòng ${lineNo}: thiếu email/username/name`);
                    continue;
                }

                try {
                    const { data: existingRows, error: checkError } = await supabase
                        .from('users')
                        .select('id')
                        .eq('email', parsed.email)
                        .limit(1);
                    if (checkError) throw checkError;

                    const isBcryptHash = typeof parsed.password === 'string' && /^\$2[aby]\$\d{2}\$/.test(parsed.password);
                    const passwordHash = parsed.password
                        ? (isBcryptHash ? parsed.password : bcrypt.default.hashSync(parsed.password, 10))
                        : null;

                    if (existingRows && existingRows.length > 0) {
                        const updateData = {
                            name: parsed.name,
                            role: parsed.role,
                            branch: parsed.branch || null,
                            department: parsed.department || null,
                            can_day_ffm: parsed.can_day_ffm
                        };
                        if (passwordHash) updateData.password = passwordHash;

                        const { error: updateError } = await supabase
                            .from('users')
                            .update(updateData)
                            .eq('id', existingRows[0].id);
                        if (updateError) throw updateError;
                        updatedCount++;
                    } else {
                        if (!passwordHash) {
                            skippedCount++;
                            errorLines.push(`Dòng ${lineNo}: tài khoản mới bắt buộc có password`);
                            continue;
                        }

                        const { error: insertError } = await supabase
                            .from('users')
                            .insert({
                                email: parsed.email,
                                password: passwordHash,
                                name: parsed.name,
                                role: parsed.role,
                                branch: parsed.branch || null,
                                department: parsed.department || null,
                                can_day_ffm: parsed.can_day_ffm
                            });
                        if (insertError) throw insertError;
                        createdCount++;
                    }
                } catch (rowError) {
                    failedCount++;
                    errorLines.push(`Dòng ${lineNo}: ${rowError?.message || 'Lỗi không xác định'}`);
                }
            }

            const totalHandled = createdCount + updatedCount;
            if (totalHandled > 0) {
                toast.success(`Import xong: tạo ${createdCount}, cập nhật ${updatedCount}, bỏ qua ${skippedCount}, lỗi ${failedCount}.`);
                await loadAuthAccounts();
            } else {
                const reasonPreview = errorLines.slice(0, 3).join(' | ');
                toast.warning(
                    reasonPreview
                        ? `Không có dòng nào được import. Bỏ qua ${skippedCount}, lỗi ${failedCount}. ${reasonPreview}`
                        : `Không có dòng nào được import. Bỏ qua ${skippedCount}, lỗi ${failedCount}.`
                );
            }

            if (errorLines.length > 0) {
                console.warn('[Account Import] Details:', errorLines.slice(0, 50));
            }
        } catch (error) {
            console.error('Error importing accounts from Excel:', error);
            toast.error('Lỗi import tài khoản: ' + (error?.message || 'Unknown error'));
        } finally {
            setAccountImportLoading(false);
            if (event?.target) {
                event.target.value = '';
            }
        }
    };

    const loadAuthAccounts = async () => {
        setAccountLoading(true);
        try {
            // Lấy linh hoạt toàn bộ cột để tránh crash khi schema users khác nhau giữa môi trường
            const { data, error } = await supabase
                .from('users')
                .select('*');

            if (error) {
                throw error;
            }

            const sortedUsers = [...(data || [])].sort((a, b) => {
                const aTs = a?.created_at ? new Date(a.created_at).getTime() : 0;
                const bTs = b?.created_at ? new Date(b.created_at).getTime() : 0;
                return bTs - aTs;
            });

            // Map dữ liệu và thêm thông tin has_password
            const accounts = sortedUsers.map(user => {
                const fallbackUsername = (user?.email ? String(user.email).split('@')[0] : '') || '';
                const resolvedId = user?.id || user?.user_id || user?.id_appsheet || user?.email;
                return {
                    ...user,
                    id: resolvedId,
                    username: user?.username || user?.user_name || fallbackUsername,
                    can_day_ffm: user?.can_day_ffm ?? user?.canDayFfm ?? false,
                    has_password: !!user.password,
                    status: user.password ? 'active' : 'inactive',
                    user_id: resolvedId // Để tương thích với auth_accounts structure
                };
            });

            // Hide system accounts from the user/account list UI
            const visibleAccounts = accounts.filter((a) => a.role !== 'super_admin');
            setAuthAccounts(visibleAccounts);
            setSelectedAccountIds((prev) => {
                const ids = new Set(visibleAccounts.map((a) => a.id).filter(Boolean));
                return prev.filter((id) => ids.has(id));
            });
            console.log(
                `✅ Đã tải ${visibleAccounts.length} tài khoản (đã ẩn super_admin) từ bảng users`
            );
        } catch (error) {
            console.error('Error loading users:', error);
            toast.error('Lỗi khi tải danh sách tài khoản: ' + error.message);
            setAuthAccounts([]);
        } finally {
            setAccountLoading(false);
        }
    };

    const toggleAccountSelected = (accountId, checked) => {
        if (!accountId) return;
        setSelectedAccountIds((prev) => {
            if (checked) {
                return prev.includes(accountId) ? prev : [...prev, accountId];
            }
            return prev.filter((id) => id !== accountId);
        });
    };

    const handleDeleteSelectedAccounts = async () => {
        if (selectedAccountIds.length === 0) {
            toast.info('Chưa chọn tài khoản nào để xóa.');
            return;
        }

        if (!window.confirm(`Bạn có chắc muốn xóa ${selectedAccountIds.length} tài khoản đã chọn?`)) {
            return;
        }

        setBulkDeletingAccounts(true);
        try {
            const { error } = await supabase
                .from('users')
                .delete()
                .in('id', selectedAccountIds);

            if (error) throw error;

            setSelectedAccountIds([]);
            setShowPasswords((prev) => {
                const next = { ...prev };
                selectedAccountIds.forEach((id) => {
                    delete next[id];
                });
                return next;
            });
            setPasswordInputs((prev) => {
                const next = { ...prev };
                selectedAccountIds.forEach((id) => {
                    delete next[id];
                });
                return next;
            });

            toast.success(`Đã xóa ${selectedAccountIds.length} tài khoản.`);
            await loadAuthAccounts();
        } catch (error) {
            console.error('Error deleting selected accounts:', error);
            toast.error('Lỗi xóa tài khoản hàng loạt: ' + (error?.message || 'Unknown error'));
        } finally {
            setBulkDeletingAccounts(false);
        }
    };

    const handleAssignTeamSelectedAccounts = async () => {
        if (selectedAccountIds.length === 0) {
            toast.info('Chưa chọn tài khoản nào để gán team.');
            return;
        }

        const teamValue = String(bulkAssignTeamValue || '').trim();
        if (!teamValue) {
            toast.error('Vui lòng nhập Team trước khi gán hàng loạt.');
            return;
        }

        if (!window.confirm(`Gán Team "${teamValue}" cho ${selectedAccountIds.length} tài khoản đã chọn?`)) {
            return;
        }

        setBulkAssigningTeam(true);
        try {
            const { error } = await supabase
                .from('users')
                .update({
                    team: teamValue,
                    branch: teamValue
                })
                .in('id', selectedAccountIds);

            if (error) throw error;

            toast.success(`Đã gán Team "${teamValue}" cho ${selectedAccountIds.length} tài khoản.`);
            await loadAuthAccounts();
        } catch (error) {
            console.error('Error assigning team for selected accounts:', error);
            toast.error('Lỗi gán team hàng loạt: ' + (error?.message || 'Unknown error'));
        } finally {
            setBulkAssigningTeam(false);
        }
    };

    const handleViewLoginHistory = async (accountId) => {
        try {
            // Lấy lịch sử đăng nhập từ login_history dựa trên user_id hoặc email
            const account = authAccounts.find(a => a.id === accountId || a.user_id === accountId);
            if (!account) {
                toast.error('Không tìm thấy tài khoản');
                return;
            }

            // Thử query từ login_history nếu bảng tồn tại
            const { data, error } = await supabase
                .from('login_history')
                .select('*')
                .or(`user_id.eq.${accountId},email.eq.${account.email}`)
                .order('login_at', { ascending: false })
                .limit(50);

            if (error) {
                // Nếu bảng không tồn tại, hiển thị thông báo
                if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
                    toast.info('Bảng login_history chưa được tạo. Lịch sử đăng nhập sẽ được lưu sau khi bảng được tạo.');
                    setLoginHistory([]);
                    setShowLoginHistory(true);
                    return;
                }
                throw error;
            }

            setLoginHistory(data || []);
            setShowLoginHistory(true);
        } catch (error) {
            console.error('Error loading login history:', error);
            toast.error('Lỗi khi tải lịch sử đăng nhập: ' + error.message);
        }
    };

    const handleEditAccount = (account) => {
        setSelectedAccount(account);
        setAccountForm({
            email: account.email || '',
            username: account.username || '',
            name: account.name || '',
            password: '', // Không hiển thị password
            user_id: account.id || account.user_id || '',
            role: account.role || 'user',
            branch: account.branch || account.team || '',
            department: account.department || '',
            status: account.has_password ? 'active' : 'inactive',
            must_change_password: false
        });
        setShowAccountModal(true);
    };

    const handleLockAccount = async (accountId) => {
        if (!window.confirm('Bạn có chắc muốn vô hiệu hóa tài khoản này? (Sẽ xóa mật khẩu để ngăn đăng nhập)')) return;

        try {
            // Xóa mật khẩu để khóa tài khoản (hoặc có thể thêm cột status vào users)
            const { error } = await supabase
                .from('users')
                .update({
                    password: null // Xóa mật khẩu để khóa
                })
                .eq('id', accountId);

            if (error) throw error;

            toast.success('Đã vô hiệu hóa tài khoản thành công!');
            loadAuthAccounts();
        } catch (error) {
            console.error('Error locking account:', error);
            toast.error('Lỗi khi vô hiệu hóa tài khoản: ' + error.message);
        }
    };

    const handleUnlockAccount = async (accountId) => {
        try {
            // Để mở khóa, cần set lại mật khẩu tạm thời hoặc yêu cầu user đặt lại
            const newPassword = prompt('Nhập mật khẩu mới cho tài khoản này (hoặc để trống để user tự đặt):');

            if (newPassword === null) return; // User hủy

            if (newPassword) {
                // Hash password mới
                const bcrypt = await import('bcryptjs');
                const passwordHash = bcrypt.default.hashSync(newPassword, 10);

                const { error } = await supabase
                    .from('users')
                    .update({ password: passwordHash })
                    .eq('id', accountId);

                if (error) throw error;
                toast.success('Đã mở khóa tài khoản và set mật khẩu mới thành công!');
            } else {
                toast.info('Tài khoản đã được mở khóa nhưng cần user tự đặt mật khẩu mới khi đăng nhập.');
            }

            loadAuthAccounts();
        } catch (error) {
            console.error('Error unlocking account:', error);
            toast.error('Lỗi khi mở khóa tài khoản: ' + error.message);
        }
    };

    const handleSaveAccount = async () => {
        if (!accountForm.email) {
            toast.error('Email là bắt buộc!');
            return;
        }

        try {
            // Nếu có password, cần hash trước khi lưu
            let passwordHash = null;
            if (accountForm.password) {
                // Import bcryptjs để hash password
                const bcrypt = await import('bcryptjs');
                passwordHash = bcrypt.default.hashSync(accountForm.password, 10);
            }

            if (selectedAccount) {
                // Update existing user in users table
                const updateData = {
                    email: accountForm.email,
                    name: accountForm.name,
                    role: accountForm.role || 'user'
                };

                if (passwordHash) {
                    updateData.password = passwordHash;
                }

                if (accountForm.branch !== undefined) {
                    updateData.branch = accountForm.branch || null;
                }
                if (accountForm.department !== undefined) {
                    updateData.department = accountForm.department || null;
                }

                const { error } = await supabase
                    .from('users')
                    .update(updateData)
                    .eq('id', selectedAccount.id);

                if (error) throw error;
                toast.success('Đã cập nhật tài khoản thành công!');
            } else {
                // Create new user in users table
                if (!passwordHash) {
                    toast.error('Mật khẩu là bắt buộc khi tạo tài khoản mới!');
                    return;
                }

                if (!accountForm.name) {
                    toast.error('Tên là bắt buộc!');
                    return;
                }

                const { error } = await supabase
                    .from('users')
                    .insert({
                        email: accountForm.email,
                        password: passwordHash,
                        name: accountForm.name,
                        role: accountForm.role || 'user',
                        branch: accountForm.branch || null,
                        department: accountForm.department || null
                    });

                if (error) {
                    // Nếu user đã tồn tại, update thông tin
                    if (error.code === '23505') { // Unique violation
                        const updateData = {
                            password: passwordHash,
                            name: accountForm.name,
                            role: accountForm.role || 'user'
                        };
                        if (accountForm.branch) updateData.branch = accountForm.branch;
                        if (accountForm.department) updateData.department = accountForm.department;

                        const { error: updateError } = await supabase
                            .from('users')
                            .update(updateData)
                            .eq('email', accountForm.email);

                        if (updateError) throw updateError;
                        toast.success('Tài khoản đã tồn tại, đã cập nhật thông tin!');
                    } else {
                        throw error;
                    }
                } else {
                    toast.success('Đã tạo tài khoản thành công!');
                }
            }

            setShowAccountModal(false);
            setSelectedAccount(null);
            loadAuthAccounts();
        } catch (error) {
            console.error('Error saving account:', error);
            toast.error('Lỗi khi lưu tài khoản: ' + error.message);
        }
    };

    // Load accounts on mount if tab is active
    useEffect(() => {
        if (activeTab === 'account_management') {
            loadAuthAccounts();
        }
    }, [activeTab]);

    // Tự động điền Team từ bảng nhân sự vào orders
    const handleAutoFillTeam = async () => {
        if (!window.confirm('Bạn có chắc muốn tự động điền Team cho tất cả đơn hàng chưa có team?\n\nQuá trình này sẽ lấy dữ liệu từ bảng nhân sự (users/human_resources) dựa trên tên nhân viên sale.')) {
            return;
        }

        try {
            setIsFillingTeam(true);
            setFillTeamProgress({ current: 0, total: 0, success: 0, failed: 0, currentUser: '' });

            // 1. Lấy tất cả orders chưa có team (hoặc team rỗng/null)
            const { data: ordersWithoutTeam, error: ordersError } = await supabase
                .from('orders')
                .select('id, sale_staff, team')
                .not('sale_staff', 'is', null)
                .neq('sale_staff', '')
                .or('team.is.null,team.eq.');

            if (ordersError) throw ordersError;

            if (!ordersWithoutTeam || ordersWithoutTeam.length === 0) {
                toast.info('Tất cả đơn hàng đã có team!');
                setIsFillingTeam(false);
                return;
            }

            setFillTeamProgress(prev => ({ ...prev, total: ordersWithoutTeam.length }));

            // 2. Lấy dữ liệu từ bảng users (cột branch - sẽ dùng làm team)
            const { data: usersData, error: usersError } = await supabase
                .from('users')
                .select('name, branch')
                .not('branch', 'is', null)
                .neq('branch', '');

            if (usersError) throw usersError;

            // 3. Lấy dữ liệu từ bảng human_resources (cột "chi nhánh")
            const { data: hrData, error: hrError } = await supabase
                .from('human_resources')
                .select('"Họ Và Tên", "chi nhánh"')
                .not('"chi nhánh"', 'is', null)
                .neq('"chi nhánh"', '');

            if (hrError) {
                console.warn('Warning: Could not fetch human_resources:', hrError);
            }

            // 4. Tạo map: tên nhân viên -> branch (team)
            // Ưu tiên từ users, sau đó từ human_resources
            const nameToTeam = new Map();

            // Từ bảng users
            (usersData || []).forEach(user => {
                const name = normalizeStr(user.name);
                const branch = String(user.branch || '').trim();
                if (name && branch) {
                    nameToTeam.set(name, branch);
                }
            });

            // Từ bảng human_resources (nếu có, và chưa có trong map)
            (hrData || []).forEach(hr => {
                const name = normalizeStr(hr['Họ Và Tên']);
                const branch = String(hr['chi nhánh'] || '').trim();
                if (name && branch && !nameToTeam.has(name)) {
                    nameToTeam.set(name, branch);
                }
            });

            // 5. Điền team cho từng order
            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < ordersWithoutTeam.length; i++) {
                const order = ordersWithoutTeam[i];
                const saleName = normalizeStr(order.sale_staff);

                setFillTeamProgress({
                    current: i + 1,
                    total: ordersWithoutTeam.length,
                    success: successCount,
                    failed: failCount,
                    currentUser: order.sale_staff || 'N/A'
                });

                if (!saleName) {
                    failCount++;
                    continue;
                }

                const team = nameToTeam.get(saleName);

                if (!team) {
                    failCount++;
                    continue;
                }

                // Update team trong orders
                const { error: updateError } = await supabase
                    .from('orders')
                    .update({ team: team })
                    .eq('id', order.id);

                if (updateError) {
                    console.error(`Error updating order ${order.id}:`, updateError);
                    failCount++;
                } else {
                    successCount++;
                }
            }

            // 6. Kết quả
            toast.success(`✅ Hoàn thành! Đã điền team cho ${successCount} đơn hàng. ${failCount} đơn hàng không tìm thấy dữ liệu.`);
            setIsFillingTeam(false);
            setFillTeamProgress({ current: 0, total: 0, success: 0, failed: 0, currentUser: '' });
        } catch (err) {
            console.error('Error auto-filling team:', err);
            toast.error('Lỗi khi tự động điền team: ' + err.message);
            setIsFillingTeam(false);
            setFillTeamProgress({ current: 0, total: 0, success: 0, failed: 0, currentUser: '' });
        }
    };

    // Lấy danh sách sản phẩm từ database để hiển thị
    const displayedProducts = dbProducts
        .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));

    /** Sổ xuống «Thêm sản phẩm»: đủ mục từ Quản lý Danh sách + gợi ý từ đơn (chưa có trong danh mục). */
    const productDatalistOptions = useMemo(() => {
        const seen = new Set();
        const out = [];
        const add = (raw) => {
            const s = String(raw ?? '').trim();
            if (!s) return;
            const k = s.toLowerCase();
            if (seen.has(k)) return;
            seen.add(k);
            out.push(s);
        };
        dbProducts.forEach((p) => add(p.name));
        productSuggestions.forEach(add);
        return out.sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base', numeric: true }));
    }, [dbProducts, productSuggestions]);

    /** Sổ xuống «Thêm thị trường»: theo Quản lý Thị trường Trọng điểm (keyMarkets). */
    const marketDatalistOptions = useMemo(() => {
        const arr = Array.isArray(settings.keyMarkets) ? settings.keyMarkets : [];
        return arr
            .map((m) => String(m ?? '').trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base', numeric: true }));
    }, [settings.keyMarkets]);

    if (!canView('ADMIN_TOOLS')) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này (ADMIN_TOOLS).</div>;
    }

    return (
        <div className="w-full max-w-none mx-auto px-3 md:px-4 lg:px-5 py-4 md:py-6 min-h-screen bg-gray-50">
            <h1 className="text-3xl font-bold mb-8 text-gray-800 flex items-center gap-3">
                <Settings className="w-8 h-8 text-gray-600" />
                Công cụ quản trị & Cấu hình
            </h1>

            {/* TAB NAVIGATION */}
            <div className="flex gap-4 mb-6 border-b border-gray-200 overflow-x-auto">
                {visibleTabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`pb-3 px-4 font-medium transition-all whitespace-nowrap ${activeTab === tab.id ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <div className="flex items-center gap-2">
                                <Icon size={18} />
                                {tab.label}
                            </div>
                        </button>
                    );
                })}

                {/* SEARCH BAR (Right Aligned) */}
                <div className="ml-auto relative min-w-[250px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Tìm kiếm..."
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>





            {/* TAB CONTENT: UPLOAD & DOWNLOAD */}
            {activeTab === 'upload_download' && (
                <div className="bg-white rounded-xl shadow-md border border-gray-100 animate-fadeIn p-6">
                    <input type="file" id="json-upload-input" accept=".json" hidden onChange={handleFileUpload} />

                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
                            <Download size={24} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800">Upload & Tải dữ liệu</h2>
                            <p className="text-sm text-gray-500">Công cụ nhập và xuất dữ liệu hệ thống</p>
                        </div>
                    </div>

                    {downloadMode ? (
                        <div className="animate-fadeIn">
                            <button
                                onClick={() => setDownloadMode(false)}
                                className="mb-4 flex items-center gap-2 text-gray-500 hover:text-gray-800 transition-colors font-medium"
                            >
                                <ArrowLeft size={18} /> Quay lại
                            </button>
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <Table size={20} className="text-blue-600" />
                                Chọn bảng dữ liệu cần tải về (JSON)
                            </h3>

                            {/* ACTION BUTTONS */}
                            <div className="flex flex-wrap items-center gap-4 mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <div className="text-sm text-gray-600">
                                    Hệ thống sẽ tự động đẩy dữ liệu của ngày hôm nay lên Google Drive vào 23h hàng ngày.
                                </div>
                                <div className="ml-auto flex gap-2">
                                    <button
                                        onClick={handleDownloadAll}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow flex items-center gap-2 font-medium transition-colors"
                                    >
                                        <Download size={18} />
                                        Tải Tất Cả (Backup)
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!window.confirm('Bạn có muốn đẩy dữ liệu ngày hôm nay lên Google Drive không?\n\nHệ thống sẽ tự động đẩy tất cả các bảng với dữ liệu của ngày hôm nay.')) return;
                                            try {
                                                toast.info('Đang đẩy dữ liệu ngày hôm nay lên Google Drive...');
                                                const { performDailyDriveUpload } = await import('../services/dailyDriveUploadService');
                                                const result = await performDailyDriveUpload('manual');
                                                if (result.success) {
                                                    toast.success(`Đã đẩy thành công ${result.tablesSucceeded}/${result.tablesProcessed} bảng (${result.totalRecords} bản ghi) lên Google Drive!`);
                                                } else {
                                                    toast.error('Có lỗi xảy ra khi đẩy dữ liệu');
                                                }
                                            } catch (err) {
                                                console.error(err);
                                                toast.error(`Lỗi: ${err.message}`);
                                            }
                                        }}
                                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow flex items-center gap-2 font-medium transition-colors"
                                    >
                                        <CloudUpload size={18} />
                                        Đẩy Hôm Nay
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                {AVAILABLE_TABLES.map(table => (
                                    <div
                                        key={table.id}
                                        className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-blue-50 hover:border-blue-300 transition-all hover:shadow-md group"
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="p-2 bg-white rounded-md border border-gray-100 group-hover:border-blue-200">
                                                <Database size={20} className="text-gray-500 group-hover:text-blue-600" />
                                            </div>
                                        </div>
                                        <h4 className="font-bold text-gray-700 group-hover:text-blue-700 mb-2">{table.name}</h4>
                                        <p className="text-xs text-gray-500 mb-3">{table.desc}</p>
                                        <div className="flex gap-2 mt-3">
                                            <button
                                                onClick={() => handleDownloadTable(table.id)}
                                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                                            >
                                                <Download size={14} />
                                                Tải về
                                            </button>
                                            <button
                                                onClick={(e) => handleUploadToDrive(table.id, e)}
                                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                                            >
                                                <CloudUpload size={14} />
                                                Đẩy Drive
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : uploadMode ? (
                        <div className="animate-fadeIn">
                            <button
                                onClick={() => setUploadMode(false)}
                                className="mb-4 flex items-center gap-2 text-gray-500 hover:text-gray-800 transition-colors font-medium"
                            >
                                <ArrowLeft size={18} /> Quay lại
                            </button>
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <Upload size={20} className="text-green-600" />
                                Chọn bảng để Upload dữ liệu (JSON)
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                {AVAILABLE_TABLES.map(table => (
                                    <div
                                        key={table.id}
                                        onClick={() => handleUploadCardClick(table.id)}
                                        className="bg-green-50 border border-green-200 rounded-lg p-4 cursor-pointer hover:bg-green-100 hover:border-green-300 transition-all hover:shadow-md group"
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="p-2 bg-white rounded-md border border-green-100 group-hover:border-green-200">
                                                <Database size={20} className="text-gray-500 group-hover:text-green-600" />
                                            </div>
                                            <Upload size={16} className="text-gray-400 group-hover:text-green-500" />
                                        </div>
                                        <h4 className="font-bold text-gray-700 group-hover:text-green-700">{table.name}</h4>
                                        <p className="text-xs text-gray-500 mt-1">{table.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* DOWNLOAD SECTION */}
                            <div className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
                                <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                                    <FileJson size={18} className="text-blue-600" />
                                    Tải dữ liệu JSON
                                </h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    Xuất dữ liệu hệ thống ra file JSON để lưu trữ hoặc xử lý offline.
                                </p>
                                <button
                                    onClick={() => setDownloadMode(true)}
                                    className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm flex items-center justify-center gap-2"
                                >
                                    <Table size={16} /> Chọn bảng để tải về
                                </button>
                            </div>

                            {/* UPLOAD SECTION */}
                            <div className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
                                <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                                    <Upload size={18} className="text-green-600" />
                                    Upload dữ liệu JSON
                                </h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    Nhập dữ liệu mới hoặc cập nhật từ file JSON vào hệ thống.
                                </p>
                                <button
                                    onClick={() => setUploadMode(true)}
                                    className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors shadow-sm flex items-center justify-center gap-2"
                                >
                                    <Table size={16} /> Chọn bảng để Upload
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB CONTENT: SETTINGS */}
            {activeTab === 'settings' && (
                <div className="bg-white rounded-xl shadow-md border border-gray-100 animate-fadeIn overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">Cấu hình tham số hệ thống</h2>
                            <p className="text-sm text-gray-500 mt-1">Quản lý các thông số vận hành toàn hệ thống</p>
                        </div>
                        <button
                            onClick={handleSaveSettings}
                            className="bg-[#2d7c2d] text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-[#256625] transition-colors shadow-sm"
                        >
                            <Save size={18} /> Lưu Cấu hình
                        </button>
                    </div>

                    <div className="p-6 space-y-8">
                        {/* 1. Thresholds */}
                        {isSectionVisible('Ngưỡng cảnh báo chỉ số', ['threshold', 'chỉ số', 'cảnh báo', 'kpi', 'tồn kho', 'hoàn', 'ads']) && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                    <AlertCircle className="w-5 h-5 text-orange-500" />
                                    1. Ngưỡng cảnh báo chỉ số
                                </h3>
                                <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                                    {/* Dynamic Threshold List */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {Object.entries(settings.thresholds).map(([key, val]) => {
                                            const METRIC_LABELS = {
                                                inventoryLow: "Cảnh báo tồn kho thấp (đơn vị)",
                                                shippingDelay: "Cảnh báo giao hàng chậm (ngày)",
                                                maxReturnRate: "Tỉ lệ hoàn tối đa (%)",
                                                minProfitMargin: "Biên lợi nhuận tối thiểu (%)",
                                                maxAdsBudget: "Ngân sách Ads tối đa (VND)",
                                                kpiOrders: "KPI Đơn hàng / ngày"
                                            };
                                            return (
                                                <div key={key} className="relative group">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <label className="block text-sm font-medium text-gray-700">
                                                            {METRIC_LABELS[key] || key}
                                                        </label>
                                                        <button
                                                            onClick={() => {
                                                                if (window.confirm("Xóa chỉ số này?")) {
                                                                    const newT = { ...settings.thresholds };
                                                                    delete newT[key];
                                                                    setSettings({ ...settings, thresholds: newT });
                                                                }
                                                            }}
                                                            className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            title="Xóa chỉ số"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        className="w-full border-gray-300 rounded-md shadow-sm p-2 border focus:ring-[#2d7c2d]"
                                                        value={val}
                                                        onChange={(e) => setSettings({
                                                            ...settings,
                                                            thresholds: { ...settings.thresholds, [key]: parseInt(e.target.value) || 0 }
                                                        })}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Add New Threshold */}
                                    <div className="border-t pt-4 mt-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Thêm chỉ số mới</label>
                                        <div className="flex flex-wrap gap-2 items-end">
                                            <div className="flex-1 min-w-[200px]">
                                                <label className="text-xs text-gray-600 mb-1 block">Chọn chỉ số</label>
                                                <select
                                                    id="new-metric-select"
                                                    className="w-full border-gray-300 rounded-md shadow-sm p-2 border focus:ring-[#2d7c2d] text-sm"
                                                >
                                                    <option value="inventoryLow">Cảnh báo tồn kho thấp</option>
                                                    <option value="shippingDelay">Cảnh báo giao hàng chậm</option>
                                                    <option value="maxReturnRate">Tỉ lệ hoàn tối đa (%)</option>
                                                    <option value="minProfitMargin">Biên lợi nhuận tối thiểu (%)</option>
                                                    <option value="maxAdsBudget">Ngân sách Ads tối đa (VND)</option>
                                                    <option value="kpiOrders">KPI Đơn hàng / ngày</option>
                                                </select>
                                            </div>
                                            <div className="w-32">
                                                <label className="text-xs text-gray-600 mb-1 block">Giá trị ngưỡng</label>
                                                <input
                                                    id="new-metric-value"
                                                    type="number"
                                                    placeholder="0"
                                                    className="w-full border-gray-300 rounded-md shadow-sm p-2 border focus:ring-[#2d7c2d] text-sm"
                                                />
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const select = document.getElementById('new-metric-select');
                                                    const input = document.getElementById('new-metric-value');
                                                    const key = select.value;
                                                    const val = parseInt(input.value);

                                                    if (!isNaN(val)) {
                                                        setSettings(prev => ({
                                                            ...prev,
                                                            thresholds: { ...prev.thresholds, [key]: val }
                                                        }));
                                                        input.value = '';
                                                        toast.success("Đã thêm chỉ số cảnh báo mới");
                                                    } else {
                                                        toast.error("Vui lòng nhập giá trị hợp lệ");
                                                    }
                                                }}
                                                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium shadow-sm flex items-center gap-1"
                                            >
                                                <Activity size={16} /> Thêm
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}


                        {/* 2 & 3. UNIFIED PRODUCT MANAGEMENT */}
                        {(isSectionVisible('Quản lý Danh sách Sản phẩm', ['product', 'sản phẩm', 'skus']) || displayedProducts.length > 0) && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                    <Tag className="w-5 h-5 text-purple-600" />
                                    2. Quản lý Danh sách Sản phẩm
                                </h3>
                                <p className="text-sm text-gray-500">
                                    Quản lý danh sách sản phẩm, định nghĩa sản phẩm R&D (SP test) và sản phẩm trọng điểm.
                                </p>

                                <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                                    <div className="max-h-[500px] overflow-y-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-gray-50 text-gray-700 font-semibold sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-4 py-3 border-b w-16 text-center">STT</th>
                                                    <th className="px-4 py-3 border-b">Tên sản phẩm</th>
                                                    <th className="px-4 py-3 border-b w-48">Loại sản phẩm</th>
                                                    <th className="px-4 py-3 border-b w-24 text-center">Hành động</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {displayedProducts.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                                                            Chưa có sản phẩm nào. Hãy thêm sản phẩm mới ở bên dưới.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    displayedProducts.map((product, index) => {
                                                        return (
                                                            <tr key={product.id || product.name} className="hover:bg-gray-50">
                                                                <td className="px-4 py-2 text-center text-gray-500">{index + 1}</td>
                                                                <td className="px-4 py-2 font-medium">{product.name}</td>
                                                                <td className="px-4 py-2">
                                                                    <select
                                                                        value={product.type}
                                                                        onChange={async (e) => {
                                                                            const newType = e.target.value;
                                                                            try {
                                                                                await updateProductTypeInDatabase(product.name, newType);
                                                                                // Cập nhật local state
                                                                                setDbProducts(prev => prev.map(p =>
                                                                                    p.name === product.name ? { ...p, type: newType } : p
                                                                                ));
                                                                                toast.success(`Đã cập nhật loại sản phẩm "${product.name}"`);
                                                                            } catch (err) {
                                                                                toast.error(`Lỗi cập nhật: ${err.message}`);
                                                                            }
                                                                        }}
                                                                        className={`w-full text-xs py-1 px-2 rounded border focus:outline-none focus:ring-2 
                                                                        ${product.type === 'test' ? 'bg-purple-50 text-purple-700 border-purple-200 focus:ring-purple-500' :
                                                                                product.type === 'key' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 focus:ring-indigo-500' :
                                                                                    'bg-white text-gray-700 border-gray-300 focus:ring-gray-500'}`}
                                                                    >
                                                                        <option value="normal">SP thường</option>
                                                                        <option value="test">SP Test (R&D)</option>
                                                                        <option value="key">SP Trọng điểm</option>
                                                                    </select>
                                                                </td>
                                                                <td className="px-4 py-2 text-center">
                                                                    <button
                                                                        onClick={async () => {
                                                                            if (window.confirm(`Bạn có chắc muốn xóa sản phẩm "${product.name}" khỏi danh sách?`)) {
                                                                                try {
                                                                                    await deleteProductFromDatabase(product.name);
                                                                                    // Cập nhật local state
                                                                                    setDbProducts(prev => prev.filter(p => p.name !== product.name));
                                                                                    toast.success(`Đã xóa sản phẩm "${product.name}"`);
                                                                                    // Reload reference data để cập nhật gợi ý
                                                                                    await fetchReferenceData();
                                                                                } catch (err) {
                                                                                    toast.error(`Lỗi xóa: ${err.message}`);
                                                                                }
                                                                            }
                                                                        }}
                                                                        className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Add Product Footer */}
                                    <div className="bg-gray-50 p-3 border-t flex gap-2">
                                        <input
                                            type="text"
                                            list="product-suggestions"
                                            placeholder="Nhập tên sản phẩm mới (có thể gõ tay)..."
                                            className="flex-1 text-sm border-gray-300 rounded px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                            onKeyDown={async (e) => {
                                                if (e.key === 'Enter') {
                                                    const val = e.target.value.trim();
                                                    if (!val) return;

                                                    // Kiểm tra xem đã có trong database chưa
                                                    const existsInDb = dbProducts.some(p =>
                                                        p.name.toLowerCase().trim() === val.toLowerCase().trim()
                                                    );

                                                    if (existsInDb) {
                                                        toast.warning('Sản phẩm này đã có trong danh sách!');
                                                        return;
                                                    }

                                                    try {
                                                        // Lưu vào database với type mặc định là 'normal'
                                                        await saveProductToDatabase(val, 'normal');
                                                        // Reload danh sách từ database
                                                        await fetchProductsFromDatabase();
                                                        e.target.value = '';
                                                        toast.success(`Đã thêm sản phẩm "${val}"`);
                                                    } catch (err) {
                                                        toast.error(`Lỗi thêm sản phẩm: ${err.message}${getSupabaseFetchHint(err)}`);
                                                    }
                                                }
                                            }}
                                            id="new-product-input"
                                        />
                                        <datalist id="product-suggestions">
                                            {productDatalistOptions.map((p) => (
                                                <option key={p} value={p} />
                                            ))}
                                        </datalist>
                                        <button
                                            onClick={async () => {
                                                const input = document.getElementById('new-product-input');
                                                const val = input.value.trim();
                                                if (!val) {
                                                    toast.warning('Vui lòng nhập tên sản phẩm');
                                                    return;
                                                }

                                                // Kiểm tra xem đã có trong database chưa
                                                const existsInDb = dbProducts.some(p =>
                                                    p.name.toLowerCase().trim() === val.toLowerCase().trim()
                                                );

                                                if (existsInDb) {
                                                    toast.warning('Sản phẩm này đã có trong danh sách!');
                                                    return;
                                                }

                                                try {
                                                    // Lưu vào database với type mặc định là 'normal'
                                                    await saveProductToDatabase(val, 'normal');
                                                    // Reload danh sách từ database
                                                    await fetchProductsFromDatabase();
                                                    input.value = '';
                                                    toast.success(`Đã thêm sản phẩm "${val}"`);
                                                } catch (err) {
                                                    toast.error(`Lỗi thêm sản phẩm: ${err.message}${getSupabaseFetchHint(err)}`);
                                                }
                                            }}
                                            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700"
                                        >
                                            Thêm
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 4. Market Management */}
                        {isSectionVisible('Quản lý Thị trường Trọng điểm', ['market', 'thị trường', 'khu vực']) && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                    <Globe className="w-5 h-5 text-teal-600" />
                                    3. Quản lý Thị trường Trọng điểm
                                </h3>
                                <p className="text-sm text-gray-500">Các thị trường (Khu vực) chính cần theo dõi trong báo cáo.</p>

                                <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-700 font-semibold sticky top-0">
                                            <tr>
                                                <th className="px-4 py-3 border-b w-16 text-center">STT</th>
                                                <th className="px-4 py-3 border-b">Tên Thị trường</th>
                                                <th className="px-4 py-3 border-b w-24 text-center">Hành động</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {settings.keyMarkets
                                                .filter(m => m.toLowerCase().includes(searchQuery.toLowerCase()))
                                                .map((market, index) => (
                                                    <tr key={market} className="hover:bg-gray-50">
                                                        <td className="px-4 py-2 text-center text-gray-500">{index + 1}</td>
                                                        <td className="px-4 py-2 font-medium">{market}</td>
                                                        <td className="px-4 py-2 text-center">
                                                            <button
                                                                onClick={() => {
                                                                    if (window.confirm(`Xóa thị trường "${market}"?`)) {
                                                                        setSettings(prev => ({
                                                                            ...prev,
                                                                            keyMarkets: prev.keyMarkets.filter(m => m !== market)
                                                                        }));
                                                                    }
                                                                }}
                                                                className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>

                                    {/* Add Market Footer */}
                                    <div className="bg-gray-50 p-3 border-t flex gap-2">
                                        <input
                                            type="text"
                                            list="market-suggestions"
                                            placeholder="Nhập tên thị trường mới..."
                                            className="flex-1 text-sm border-gray-300 rounded px-3 py-1.5 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    const val = e.target.value.trim();
                                                    if (val && !settings.keyMarkets.includes(val)) {
                                                        setSettings(prev => ({ ...prev, keyMarkets: [...prev.keyMarkets, val].sort() }));
                                                        // Also add to availableMarkets if not there
                                                        if (!availableMarkets.includes(val)) setAvailableMarkets(prev => [...prev, val].sort());
                                                        e.target.value = '';
                                                    }
                                                }
                                            }}
                                            id="new-market-input"
                                        />
                                        <datalist id="market-suggestions">
                                            {marketDatalistOptions.map((m) => (
                                                <option key={m} value={m} />
                                            ))}
                                        </datalist>
                                        <button
                                            onClick={() => {
                                                const input = document.getElementById('new-market-input');
                                                const val = input.value.trim();
                                                if (val && !settings.keyMarkets.includes(val)) {
                                                    setSettings(prev => ({ ...prev, keyMarkets: [...prev.keyMarkets, val].sort() }));
                                                    if (!availableMarkets.includes(val)) setAvailableMarkets(prev => [...prev, val].sort());
                                                    input.value = '';
                                                    toast.success('Đã thêm thị trường mới');
                                                } else if (settings.keyMarkets.includes(val)) {
                                                    toast.warning('Thị trường này đã có!');
                                                }
                                            }}
                                            className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-teal-700"
                                        >
                                            Thêm
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 4. Đồng bộ Team MKT -> Users */}
                        {isSectionVisible('Đồng bộ Team MKT', ['mkt', 'team', 'đồng bộ', 'users', 'detail_reports']) && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                    <Users className="w-5 h-5 text-emerald-600" />
                                    4. Đồng bộ Team MKT vào Users
                                </h3>
                                <p className="text-sm text-gray-500">
                                    Đồng bộ toàn bộ cột <code>users.team</code> theo dữ liệu MKT trong <code>detail_reports</code>, khớp theo cột Tên.
                                </p>

                                <div className="bg-white border rounded-lg shadow-sm p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="text-xs text-gray-600 space-y-1">
                                            <div>• Nguồn team: bảng <code>detail_reports</code></div>
                                            <div>• Điều kiện: khớp theo <code>Tên</code> (normalize dấu + khoảng trắng)</div>
                                            <div>• Chỉ cập nhật khi team mới khác team hiện tại trong <code>users</code></div>
                                        </div>
                                        <button
                                            onClick={handleSyncMktTeamsToUsers}
                                            disabled={syncMktTeamLoading}
                                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                                        >
                                            <RefreshCw className={`w-4 h-4 ${syncMktTeamLoading ? 'animate-spin' : ''}`} />
                                            {syncMktTeamLoading ? 'Đang đồng bộ...' : 'Đồng bộ Team MKT'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 5. Exchange Rates Management */}
                        {isSectionVisible('Quản lý tỷ giá', ['tỷ giá', 'exchange', 'rate', 'tiền tệ', 'currency']) && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                    <Package className="w-5 h-5 text-blue-600" />
                                    5. Quản lý tỷ giá
                                </h3>
                                <p className="text-sm text-gray-500">
                                    Cài đặt tỷ giá quy đổi các loại tiền tệ sang VNĐ. Tỷ giá sẽ được tự động áp dụng khi chọn đơn vị tiền tệ trong bảng đối soát bill cước.
                                </p>

                                <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                                    <div className="p-4 border-b border-gray-200 bg-gray-50">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="text-sm font-semibold text-gray-800">Tỷ giá quy đổi (1 đơn vị = ? VNĐ)</h4>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Nhập tỷ giá quy đổi từ các loại tiền tệ sang VNĐ. Ví dụ: 1 USD = 25,000 VNĐ
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={loadExchangeRates}
                                                    disabled={exchangeLoading}
                                                    className="flex items-center gap-2 px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                                                >
                                                    <RefreshCw className={`w-4 h-4 ${exchangeLoading ? 'animate-spin' : ''}`} />
                                                    {exchangeLoading ? 'Đang tải...' : 'Tải lại'}
                                                </button>
                                                <button
                                                    onClick={handleSaveExchangeRates}
                                                    disabled={exchangeSaving}
                                                    className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                                                >
                                                    <Save className="w-4 h-4" />
                                                    {exchangeSaving ? 'Đang lưu...' : 'Lưu tỷ giá'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-100">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200">
                                                        Loại tiền tệ
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200">
                                                        Ký hiệu
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200">
                                                        Tỷ giá (VNĐ)
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200">
                                                        Ví dụ
                                                    </th>
                                                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase border-b border-gray-200 w-32">
                                                        Hành động
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {exchangeRates.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                                            {exchangeLoading ? 'Đang tải...' : 'Chưa có dữ liệu tỷ giá'}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    exchangeRates.map((rateData) => {
                                                        const rateValue = rateData?.gia_tri || 0;
                                                        const isEditing = editingRateId === rateData?.id;
                                                        const editData = editValues[rateData?.id] || { ti_gia: rateData.ti_gia, gia_tri: rateValue.toString() };
                                                        
                                                        // Tìm currency option để lấy symbol và label
                                                        const currencyOption = CURRENCY_OPTIONS.find(c => c.key.toUpperCase() === rateData.ti_gia.toUpperCase());
                                                        const currencyLabel = currencyOption?.label || rateData.ti_gia;
                                                        const currencySymbol = currencyOption?.symbol || '';

                                                        return (
                                                            <tr key={rateData.id} className="hover:bg-gray-50">
                                                                <td className="px-6 py-4">
                                                                    {isEditing ? (
                                                                        <input
                                                                            type="text"
                                                                            value={editData.ti_gia || ''}
                                                                            onChange={(e) => {
                                                                                setEditValues(prev => ({
                                                                                    ...prev,
                                                                                    [rateData.id]: {
                                                                                        ...prev[rateData.id],
                                                                                        ti_gia: e.target.value
                                                                                    }
                                                                                }));
                                                                            }}
                                                                            className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                                            placeholder="USD, JPY, CAD..."
                                                                        />
                                                                    ) : (
                                                                        <span className="text-sm font-medium text-gray-900">
                                                                            {rateData.ti_gia}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="px-6 py-4 text-sm text-gray-700">
                                                                    {currencySymbol || '-'}
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    {isEditing ? (
                                                                        <input
                                                                            type="number"
                                                                            step="0.01"
                                                                            value={editData.gia_tri || ''}
                                                                            onChange={(e) => {
                                                                                setEditValues(prev => ({
                                                                                    ...prev,
                                                                                    [rateData.id]: {
                                                                                        ...prev[rateData.id],
                                                                                        gia_tri: e.target.value
                                                                                    }
                                                                                }));
                                                                            }}
                                                                            className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                                            placeholder="0.00"
                                                                        />
                                                                    ) : (
                                                                        <span className="text-sm text-gray-700 font-medium">
                                                                            {rateValue > 0 ? rateValue.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="px-6 py-4 text-sm text-gray-600">
                                                                    {rateValue > 0 ? (
                                                                        <>
                                                                            1 {rateData.ti_gia} = {rateValue.toLocaleString('vi-VN')} VNĐ
                                                                        </>
                                                                    ) : (
                                                                        <span className="text-gray-400">-</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-6 py-4 text-center">
                                                                    {isEditing ? (
                                                                        <div className="flex items-center justify-center gap-2">
                                                                            <button
                                                                                onClick={() => {
                                                                                    if (rateData?.id) {
                                                                                        handleSaveSingleRate(rateData.id);
                                                                                    }
                                                                                }}
                                                                                className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-xs font-medium transition"
                                                                            >
                                                                                Lưu
                                                                            </button>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setEditingRateId(null);
                                                                                    setEditValues(prev => {
                                                                                        const newVals = { ...prev };
                                                                                        delete newVals[rateData.id];
                                                                                        return newVals;
                                                                                    });
                                                                                }}
                                                                                className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded text-xs font-medium transition"
                                                                            >
                                                                                Hủy
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => {
                                                                                if (rateData?.id) {
                                                                                    setEditingRateId(rateData.id);
                                                                                    setEditValues(prev => ({
                                                                                        ...prev,
                                                                                        [rateData.id]: {
                                                                                            ti_gia: rateData.ti_gia,
                                                                                            gia_tri: rateValue.toString()
                                                                                        }
                                                                                    }));
                                                                                }
                                                                            }}
                                                                            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs font-medium transition"
                                                                        >
                                                                            Edit
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Info Box */}
                                    <div className="p-4 bg-blue-50 border-t border-gray-200">
                                        <div className="text-sm text-blue-800">
                                            <p className="font-semibold mb-2">📝 Lưu ý:</p>
                                            <ul className="list-disc list-inside space-y-1 text-blue-700">
                                                <li>Tỷ giá sẽ được tự động áp dụng khi chọn đơn vị tiền tệ trong bảng đối soát bill cước</li>
                                                <li>Vui lòng cập nhật tỷ giá thường xuyên để đảm bảo tính chính xác</li>
                                                <li>Sau khi thay đổi, nhấn "Lưu tỷ giá" để lưu vào database</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            )}

            {/* TAB CONTENT: PERMISSIONS */}
            {activeTab === 'permissions' && (
                <PermissionManager searchQuery={searchQuery} />
            )}

            {/* TAB CONTENT: AUTO ASSIGN */}
            {activeTab === 'auto_assign' && (
                <div className="bg-white rounded-xl shadow-md border border-gray-100 animate-fadeIn overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Users className="w-6 h-6 text-blue-600" />
                            Chia đơn tự động cho CSKH
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Phân bổ đơn hàng và hạch toán báo cáo tự động</p>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Configuration */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h3 className="font-semibold text-gray-800 mb-3">Cấu hình</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Chi nhánh (Hạch toán báo cáo &amp; Chạy toàn bộ)
                                    </label>
                                    <select
                                        value={selectedTeam}
                                        onChange={(e) => setSelectedTeam(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    >
                                        <option value="Hà Nội">Hà Nội</option>
                                        <option value="HCM">HCM</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tháng (Ngày lên đơn)</label>
                                    <input
                                        type="month"
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Actions - Chia đơn CSKH và Chia đơn vận đơn song song */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Cột trái: Chia đơn CSKH */}
                            <div className="space-y-4">
                                <h3 className="font-semibold text-gray-700">Chia đơn CSKH</h3>
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <button
                                            type="button"
                                            onClick={handlePhanBoDonHangHaNoi}
                                            disabled={autoAssignLoading}
                                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                                        >
                                            {autoAssignLoading ? (
                                                <>
                                                    <RefreshCw className="w-5 h-5 animate-spin shrink-0" />
                                                    Đang xử lý...
                                                </>
                                            ) : (
                                                <>
                                                    <Users className="w-5 h-5 shrink-0" />
                                                    Phân bổ — Hà Nội (orders)
                                                </>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handlePhanBoDonHangHcm}
                                            disabled={autoAssignLoading}
                                            className="flex-1 bg-sky-600 hover:bg-sky-700 text-white px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                                        >
                                            {autoAssignLoading ? (
                                                <>
                                                    <RefreshCw className="w-5 h-5 animate-spin shrink-0" />
                                                    Đang xử lý...
                                                </>
                                            ) : (
                                                <>
                                                    <Users className="w-5 h-5 shrink-0" />
                                                    Phân bổ — HCM (order_code_hcm)
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <button
                                            type="button"
                                            onClick={handleHachToanBaoCao}
                                            disabled={autoAssignLoading}
                                            className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {autoAssignLoading ? (
                                                <>
                                                    <RefreshCw className="w-5 h-5 animate-spin" />
                                                    Đang xử lý...
                                                </>
                                            ) : (
                                                <>
                                                    <Activity className="w-5 h-5" />
                                                    Hạch toán báo cáo
                                                </>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleRunAll}
                                            disabled={autoAssignLoading}
                                            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {autoAssignLoading ? (
                                                <>
                                                    <RefreshCw className="w-5 h-5 animate-spin" />
                                                    Đang xử lý...
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle className="w-5 h-5" />
                                                    Chạy toàn bộ
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Cột phải: Chia đơn vận đơn */}
                            <div className="space-y-4">
                                <h3 className="font-semibold text-gray-700">Chia đơn vận đơn</h3>
                                
                                {/* Toggle tự động chia đơn vào giờ chẵn */}
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Clock className="w-5 h-5 text-blue-600" />
                                            <div>
                                                <p className="text-sm font-semibold text-gray-800">Tự động chia đơn vào giờ chẵn</p>
                                                <p className="text-xs text-gray-600 mt-1">
                                                    Vào phút :00 mỗi giờ (theo giờ máy tính), chạy lần lượt HCM rồi Hà Nội. Cần{' '}
                                                    <strong>giữ mở tab Admin Tools</strong> — trình duyệt tắt hoặc chuyển trang thì không
                                                    chạy nền.
                                                </p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={autoChiaDonEnabled}
                                                onChange={(e) => {
                                                    setAutoChiaDonEnabled(e.target.checked);
                                                    if (e.target.checked) {
                                                        toast.info('Đã bật tự động chia đơn vào giờ chẵn');
                                                    } else {
                                                        toast.info('Đã tắt tự động chia đơn');
                                                        setLastAutoChiaHour(null);
                                                        lastAutoChiaSlotRef.current = null;
                                                    }
                                                }}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                        </label>
                                    </div>
                                    {autoChiaDonEnabled && lastAutoChiaHour !== null && (
                                        <p className="text-xs text-blue-700 mt-2">
                                            ⏰ Lần chạy cuối: {lastAutoChiaHour}:00
                                        </p>
                                    )}
                                </div>

                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                                    <p className="text-xs text-gray-700 mb-2"><strong>Logic chia đơn vận đơn (Đã cập nhật: Chia tiếp sức xuyên suốt):</strong></p>
                                    <ol className="list-decimal list-inside space-y-1 text-xs text-gray-600">
                                        <li>Lọc nhân viên có trạng thái "U1" từ danh sách vận đơn</li>
                                        <li>Phân loại theo chi nhánh (HCM và Hà Nội)</li>
                                        <li>
                                            <strong>Carry-over + vòng trong phiên:</strong> Dò đơn đã chia gần nhất trong dữ liệu tham chiếu để xác định “cuối vòng” trước phiên; phiên mới bắt đầu từ{' '}
                                            <strong>người đứng kế trong thứ tự U1</strong>. Mỗi đơn: NV khớp team/chi nhánh xếp hàng — chọn đầu hàng rồi người đó{' '}
                                            <strong>xuống cuối hàng trong phiên</strong>. Không ép cân bằng tải — số đơn có thể lệch nếu team không đều; xem mục Logic phiên trong Báo cáo chia đơn.
                                        </li>
                                        <li>Lọc đơn: delivery_staff trống, loại trừ "Nhật Bản" và "CĐ Nhật Bản"</li>
                                        <li>Chỉ gán khi team đơn khớp chi nhánh của NV U1</li>
                                        <li>Tự động dò tìm Team dựa trên Sale Staff nếu đơn trống thông tin Team</li>
                                    </ol>
                                </div>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <button
                                            onClick={() => handleChiaDonVanDon('HCM')}
                                            disabled={autoAssignLoading}
                                            className="w-full bg-orange-600 hover:bg-orange-700 text-white px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {autoAssignLoading ? (
                                                <>
                                                    <RefreshCw className="w-5 h-5 animate-spin" />
                                                    Đang xử lý...
                                                </>
                                            ) : (
                                                <>
                                                    <Package className="w-5 h-5" />
                                                    Chia đơn HCM
                                                </>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => handleChiaDonVanDon('Hà Nội')}
                                            disabled={autoAssignLoading}
                                            className="w-full bg-orange-500 hover:bg-orange-600 text-white px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {autoAssignLoading ? (
                                                <>
                                                    <RefreshCw className="w-5 h-5 animate-spin" />
                                                    Đang xử lý...
                                                </>
                                            ) : (
                                                <>
                                                    <Package className="w-5 h-5" />
                                                    Chia đơn Hà Nội
                                                </>
                                            )}
                                        </button>
                                        <button
                                            onClick={handlePreviewActiveStaff}
                                            className="w-full mt-2 bg-white border border-blue-600 text-blue-600 hover:bg-blue-50 rounded-lg px-4 py-2 text-xs font-bold transition-all flex items-center justify-center gap-2"
                                        >
                                            <Users className="w-4 h-4" />
                                            Kiểm tra danh sách U1 đang đi làm
                                        </button>
                                    </div>
                                </div>

                                {/* --- NÂNG CẤP: NÚT MỞ MODAL BÁO CÁO --- */}
                                <div className="mt-6 flex justify-center">
                                    <button
                                        onClick={() => {
                                            setIsStatsModalOpen(true);
                                            if (historyChiaDon.length === 0) handleLoadHistoryChiaDon();
                                        }}
                                        className="group flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all hover:scale-105 active:scale-95"
                                    >
                                        <div className="bg-white/20 p-2 rounded-xl">
                                            <BarChart3 className="w-6 h-6" />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm">Xem Thống kê &</p>
                                            <p className="text-lg leading-tight">Báo cáo Chia đơn Chi tiết</p>
                                        </div>
                                        <ArrowLeft className="w-5 h-5 rotate-180 group-hover:translate-x-1 transition-transform" />
                                    </button>
                                </div>

                        {/* --- MODAL BÁO CÁO CHI TIẾT (toàn màn hình) --- */}
                        {isStatsModalOpen && (
                            <div className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen min-h-0 flex-col bg-gray-50">
                                <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-gray-50 animate-in fade-in duration-200">
                                    {/* Header Modal */}
                                    <div className="flex shrink-0 items-center justify-between border-b bg-white px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-100 rounded-lg">
                                                <BarChart3 className="w-6 h-6 text-blue-600" />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold text-gray-900">Báo cáo Phân bổ Đơn hàng</h3>
                                                <p className="text-xs text-gray-500">Chi tiết phiên chia đơn & Tổng hợp sản lượng nhân sự</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setIsStatsModalOpen(false)}
                                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                                        >
                                            <X className="w-6 h-6 text-gray-400" />
                                        </button>
                                    </div>

                                    {/* Bộ lọc trong Modal */}
                                    <div className="shrink-0 border-b bg-white px-6 py-4">
                                        <div className="flex flex-wrap items-end gap-4">
                                            <div className="w-52">
                                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                                                    Từ ngày chia
                                                </label>
                                                <input 
                                                    type="date" 
                                                    value={historyStartDate}
                                                    onChange={(e) => setHistoryStartDate(e.target.value)}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                                                />
                                                <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">
                                                    Lịch VN (+07); lệnh chia + đơn dùng cùng ngày chia
                                                </p>
                                            </div>
                                            <div className="w-52">
                                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                                                    Đến ngày chia
                                                </label>
                                                <input 
                                                    type="date" 
                                                    value={historyEndDate}
                                                    onChange={(e) => setHistoryEndDate(e.target.value)}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                                                />
                                                <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">
                                                    Phiên trong khoảng; đơn lọc theo ngày chia vận đơn
                                                </p>
                                            </div>
                                            <button 
                                                onClick={handleLoadHistoryChiaDon}
                                                disabled={historyLoading}
                                                className="bg-gray-900 hover:bg-black text-white rounded-lg px-6 py-2 text-sm font-bold transition-all flex items-center gap-2 disabled:opacity-50"
                                            >
                                                {historyLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                                Cập nhật dữ liệu
                                            </button>
                                            
                                            <div className="ml-auto text-right">
                                                <p className="text-xs text-gray-400 italic">Dữ liệu được cập nhật thời gian thực từ Database</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Nội dung Modal (cuộn, chiếm hết chỗ còn lại) */}
                                    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                                            
                                            {/* CỘT TỔNG HỢP — một bảng chung HCM + Hà Nội */}
                                            <div className="space-y-3 lg:col-span-3">
                                                {(() => {
                                                    const branchDefs = [
                                                        {
                                                            key: 'HCM',
                                                            headerShort: 'HCM',
                                                            badgeChip:
                                                                'bg-orange-100 text-orange-800 border-orange-200/80 ring-1 ring-orange-500/15',
                                                            countBg: 'bg-orange-50 text-orange-800',
                                                        },
                                                        {
                                                            key: 'Hà Nội',
                                                            headerShort: 'Hà Nội',
                                                            badgeChip:
                                                                'bg-indigo-100 text-indigo-900 border-indigo-200/80 ring-1 ring-indigo-500/15',
                                                            countBg: 'bg-indigo-50 text-indigo-900',
                                                        },
                                                    ];
                                                    const sessHCM = Number(successSessionCountByBranch?.HCM) || 0;
                                                    const sessHN = Number(successSessionCountByBranch?.['Hà Nội']) || 0;
                                                    const ordHCM = Number(successTotalOrdersByBranch?.HCM) || 0;
                                                    const ordHN = Number(successTotalOrdersByBranch?.['Hà Nội']) || 0;

                                                    const flatRows = [];
                                                    for (const bd of branchDefs) {
                                                        const statsObj = staffStatsReportByBranch?.[bd.key] || {};
                                                        const canonical = chiaDonVanDonStaffOrder?.[bd.key] || [];
                                                        const allEntriesMap = new Map();
                                                        canonical.forEach((name) =>
                                                            allEntriesMap.set(normalizeNameKeyForStaffSort(name), [
                                                                name,
                                                                0,
                                                            ])
                                                        );
                                                        Object.entries(statsObj).forEach(([name, count]) => {
                                                            const nk = normalizeNameKeyForStaffSort(name);
                                                            if (allEntriesMap.has(nk)) {
                                                                allEntriesMap.get(nk)[1] += Number(count) || 0;
                                                            } else {
                                                                allEntriesMap.set(nk, [name, Number(count) || 0]);
                                                            }
                                                        });
                                                        const rowsSorted = sortStatsEntriesByVanDonOrder(
                                                            Array.from(allEntriesMap.values()),
                                                            canonical
                                                        );
                                                        rowsSorted.forEach(([name, count], idx) => {
                                                            flatRows.push({
                                                                branchKey: bd.key,
                                                                branchBadge: bd.headerShort,
                                                                badgeChip: bd.badgeChip,
                                                                countBg: bd.countBg,
                                                                stt: idx + 1,
                                                                name,
                                                                count: Number(count) || 0,
                                                            });
                                                        });
                                                    }

                                                    return (
                                                        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                                                            <div className="bg-gradient-to-r from-orange-700 to-indigo-700 px-3 py-2">
                                                                <p className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-white">
                                                                    <span className="flex min-w-0 items-center gap-1.5">
                                                                        <UserCheck className="h-4 w-4 shrink-0 opacity-95" />
                                                                        <span>Tổng hợp sản lượng</span>
                                                                    </span>
                                                                    <span className="shrink-0 text-[10px] font-semibold leading-tight opacity-95">
                                                                        HCM: {sessHCM} phiên · {ordHCM} đơn
                                                                        <span className="mx-1.5 opacity-60">·</span>
                                                                        Hà Nội: {sessHN} phiên · {ordHN} đơn
                                                                    </span>
                                                                </p>
                                                            </div>
                                                            <div className="max-h-[min(360px,40vh)] overflow-y-auto overscroll-contain border-t border-gray-100">
                                                                <table className="w-full table-fixed text-left text-[11px]">
                                                                    <thead className="sticky top-0 z-[1] border-b bg-gray-50 shadow-sm">
                                                                        <tr>
                                                                            <th className="w-[4.75rem] px-2 py-1.5 font-bold text-gray-600">
                                                                                Chi nhánh
                                                                            </th>
                                                                            <th className="w-9 px-1 py-1.5 text-center font-bold text-gray-600">
                                                                                #
                                                                            </th>
                                                                            <th className="px-2 py-1.5 font-bold text-gray-600">
                                                                                <span className="block truncate">Nhân sự</span>
                                                                                <span className="mt-px block truncate text-[9px] font-normal text-gray-400">
                                                                                    DS vận đơn U1
                                                                                </span>
                                                                            </th>
                                                                            <th className="w-[4.25rem] px-2 py-1.5 text-right align-bottom font-bold text-gray-600">
                                                                                Tổng
                                                                            </th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {flatRows.length > 0 ? (
                                                                            flatRows.map((r) => (
                                                                                <tr
                                                                                    key={`${r.branchKey}-${r.name}`}
                                                                                    className="border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50"
                                                                                >
                                                                                    <td className="px-2 py-1 align-middle">
                                                                                        <span
                                                                                            className={`inline-block max-w-[4.5rem] truncate rounded border px-1.5 py-0.5 text-center text-[9px] font-bold ${r.badgeChip}`}
                                                                                        >
                                                                                            {r.branchBadge}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="px-1 py-1 text-center align-middle font-mono text-[10px] text-gray-500">
                                                                                        {r.stt}
                                                                                    </td>
                                                                                    <td className="px-2 py-1 align-middle">
                                                                                        <span className="block truncate font-medium text-gray-800">
                                                                                            {r.name}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="px-2 py-1 text-right align-middle">
                                                                                        <span
                                                                                            className={`inline-block min-w-[1.75rem] rounded px-1.5 py-0.5 text-center text-xs font-bold ${r.countBg}`}
                                                                                        >
                                                                                            {r.count}
                                                                                        </span>
                                                                                    </td>
                                                                                </tr>
                                                                            ))
                                                                        ) : (
                                                                            <tr>
                                                                                <td
                                                                                    colSpan={4}
                                                                                    className="p-3 text-center text-[10px] italic text-gray-400"
                                                                                >
                                                                                    Chưa có dữ liệu (phiên{' '}
                                                                                    <strong>thành công</strong>)
                                                                                </td>
                                                                            </tr>
                                                                        )}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                <div className="rounded-lg border border-orange-100 bg-orange-50 p-2.5">
                                                    <p className="text-[10px] leading-snug text-orange-800">
                                                        <strong>* Lưu ý:</strong> Bảng tổng hợp gộp <strong>HCM</strong> + <strong>Hà Nội</strong>; chỉ tính các phiên{' '}
                                                        <strong>thành công</strong>. Lịch sử chi tiết: mỗi chi nhánh <strong>một bảng I + một bảng II</strong> gộp mọi phiên trong kết quả lọc (cột Phiên · thời điểm · người chạy).
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Lịch sử từng vòng chia: tóm tắt + thứ tự U1 + lượt gán đơn */}
                                            <div className="space-y-4 lg:col-span-9">
                                                {[
                                                    {
                                                        key: 'HCM',
                                                        title: 'Lịch sử chia — HCM',
                                                        headClass: 'bg-orange-700',
                                                        cardTint: 'border-orange-100 bg-orange-50/50',
                                                        badgeSoft: 'bg-orange-100 text-orange-900',
                                                        listMarker: 'text-orange-700',
                                                    },
                                                    {
                                                        key: 'Hà Nội',
                                                        title: 'Lịch sử chia — Hà Nội',
                                                        headClass: 'bg-indigo-700',
                                                        cardTint: 'border-indigo-100 bg-indigo-50/50',
                                                        badgeSoft: 'bg-indigo-100 text-indigo-900',
                                                        listMarker: 'text-indigo-700',
                                                    },
                                                ].map((b) => {
                                                    const list = (historyChiaDon || [])
                                                        .filter((h) => normalizeHistoryBranchKey(h.branch) === b.key)
                                                        .filter((h) => {
                                                            const totalOrders = Number(h?.total_orders) || 0;
                                                            const stats = h?.staff_stats || {};
                                                            const hasStats = Object.keys(stats).length > 0;
                                                            return totalOrders > 0 && hasStats;
                                                        });
                                                    const total = list.length;

                                                    const sessions = [...list].sort(
                                                        (a, b) =>
                                                            new Date(a.created_at).getTime() -
                                                            new Date(b.created_at).getTime()
                                                    );

                                                    const flatDetailRows = [];
                                                    let sessionOrdinal = 0;
                                                    for (const h of sessions) {
                                                        sessionOrdinal += 1;
                                                        const dt = new Date(h.created_at);
                                                        const timeStr = dt.toLocaleString('vi-VN', {
                                                            day: '2-digit',
                                                            month: '2-digit',
                                                            year: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        });
                                                        const performer = String(h.performed_by || '').trim();
                                                        const { list: assignList } = resolveAssignListForHistorySession(
                                                            h,
                                                            b.key,
                                                            chiTietFromOrdersLookup,
                                                            chiaReportMergedChiTietRows
                                                        );
                                                        for (let oi = 0; oi < assignList.length; oi++) {
                                                            flatDetailRows.push({
                                                                sessionOrdinal,
                                                                timeStr,
                                                                performer,
                                                                orderIndexInSession: oi + 1,
                                                                row: assignList[oi],
                                                            });
                                                        }
                                                    }

                                                    const chiTietColKeys = collectChiTietChiaKeysForRows(
                                                        flatDetailRows.map((x) => x.row)
                                                    );
                                                    const chiaTietTableColSpan = Math.max(6, 6 + chiTietColKeys.length);

                                                    /** Khớp với chính bảng I: đếm đơn theo NV qua các dòng gán trong assignList/chi_tiet_chia — không lấy cộng dồn JSON staff_stats các phiên (dễ lệch phiên/ghi NH). */
                                                    const staffCountByNk = new Map();
                                                    const staffLabelByNk = new Map();
                                                    for (const fr of flatDetailRows) {
                                                        const ds = String(fr.row?.delivery_staff || '').trim();
                                                        if (!ds) continue;
                                                        const nk = normalizeNameKeyForStaffSort(ds);
                                                        staffCountByNk.set(nk, (staffCountByNk.get(nk) || 0) + 1);
                                                        if (!staffLabelByNk.has(nk)) staffLabelByNk.set(nk, ds);
                                                    }
                                                    const staffEntries = sortStatsEntriesByVanDonOrder(
                                                        Array.from(staffCountByNk.entries()).map(([nk, c]) => [
                                                            staffLabelByNk.get(nk) || nk,
                                                            c,
                                                        ]),
                                                        chiaDonVanDonStaffOrder?.[b.key] || []
                                                    );

                                                    return (
                                                        <div
                                                            key={b.key}
                                                            className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
                                                        >
                                                            <div className={`${b.headClass} px-4 py-3 flex items-center justify-between`}>
                                                                <h3 className="text-white text-sm font-bold flex items-center gap-2">
                                                                    <List className="w-5 h-5" />
                                                                    Báo cáo phân bổ — {b.title}
                                                                </h3>
                                                                <span className="text-[11px] font-semibold bg-white/20 px-2 py-1 rounded text-white border border-white/10">
                                                                    Tổng {total} phiên · 1 bảng chi tiết + 1 bảng NV
                                                                </span>
                                                            </div>
                                                            <div className="max-h-[min(calc(100dvh-12rem),1400px)] space-y-5 overflow-y-auto bg-gray-50/30 p-4">
                                                                {total > 0 ? (
                                                                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                                                                        <div className="p-4">
                                                                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-8 items-start">
                                                                                <div className="space-y-2 min-w-0">
                                                                                    <h5 className="text-[11px] font-bold text-blue-600 uppercase tracking-wider flex flex-wrap items-center gap-2 mb-2">
                                                                                        <span className="flex items-center gap-2">
                                                                                            <GitMerge className="w-3.5 h-3.5" /> I.
                                                                                            CHI TIẾT TRÌNH TỰ CHIA (gộp phiên)
                                                                                        </span>
                                                                                        <span className="text-[10px] font-semibold uppercase text-emerald-700 normal-case px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50">
                                                                                            chi_tiet_chia · mỗi dòng: Phiên · thời điểm · người
                                                                                            chạy
                                                                                        </span>
                                                                                    </h5>
                                                                                    <div className="overflow-x-auto border border-gray-200 rounded shadow-sm xl:max-h-[min(70vh,900px)] xl:overflow-y-auto">
                                                                                        <table className="w-full text-left border-collapse">
                                                                                            <thead className="bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase">
                                                                                                <tr>
                                                                                                    <th className="px-2 py-2 w-11 border-r text-center whitespace-nowrap">
                                                                                                        Phiên
                                                                                                    </th>
                                                                                                    <th className="px-2 py-2 min-w-[130px] border-r whitespace-normal">
                                                                                                        Thời điểm
                                                                                                    </th>
                                                                                                    <th className="px-2 py-2 min-w-[96px] border-r whitespace-normal">
                                                                                                        Chạy bởi
                                                                                                    </th>
                                                                                                    <th className="px-2 py-2 w-9 border-r text-center">#</th>
                                                                                                    <th className="px-3 py-2 min-w-[120px] border-r">Mã đơn</th>
                                                                                                    <th className="px-3 py-2 min-w-[140px] border-r">NV vận đơn</th>
                                                                                                    {chiTietColKeys.map((ck) => (
                                                                                                        <th
                                                                                                            key={ck}
                                                                                                            className="px-3 py-2 border-r whitespace-nowrap min-w-[96px] last:border-r-0"
                                                                                                        >
                                                                                                            {chiTietChiaKeyLabelVi(ck)}
                                                                                                            <span className="block font-normal text-[9px] text-gray-400 font-mono tracking-tight mt-0.5 normal-case">
                                                                                                                {ck}
                                                                                                            </span>
                                                                                                        </th>
                                                                                                    ))}
                                                                                                </tr>
                                                                                            </thead>
                                                                                            <tbody className="text-xs divide-y divide-gray-100">
                                                                                                {flatDetailRows.length === 0 ? (
                                                                                                    <tr>
                                                                                                        <td
                                                                                                            colSpan={chiaTietTableColSpan}
                                                                                                            className="px-3 py-4 text-center text-[11px] text-gray-500 italic bg-gray-50/40 leading-relaxed"
                                                                                                        >
                                                                                                            Không có đơn có cột{' '}
                                                                                                            <strong>chi_tiet_chia</strong> trong phạm vi
                                                                                                            lọc (&quot;Từ / Đến ngày chia&quot;) — mở rộng khoảng
                                                                                                            ngày và bấm Cập nhật dữ liệu hoặc chạy chia đơn /
                                                                                                            Điền STT.
                                                                                                        </td>
                                                                                                    </tr>
                                                                                                ) : (
                                                                                                    flatDetailRows.map((fr, gi) => {
                                                                                                        const nv = String(fr.row.delivery_staff || '').trim();
                                                                                                        const phienData = fr.phienData;
                                                                                                        return (
                                                                                                            <tr
                                                                                                                key={`${fr.sessionOrdinal}-${fr.orderIndexInSession}-${fr.row.order_code}-${gi}`}
                                                                                                                className="hover:bg-blue-50/40 transition-colors"
                                                                                                            >
                                                                                                                <td className="px-2 py-1.5 border-r text-center font-mono font-bold text-gray-700 bg-gray-50/50">
                                                                                                                    {fr.sessionOrdinal}
                                                                                                                </td>
                                                                                                                <td className="px-2 py-1.5 border-r text-[10px] text-gray-800 whitespace-nowrap">
                                                                                                                    {fr.timeStr}
                                                                                                                </td>
                                                                                                                <td className="px-2 py-1.5 border-r text-[10px] font-medium text-gray-800">
                                                                                                                    {fr.performer || 'Admin'}
                                                                                                                </td>
                                                                                                                <td className="px-2 py-1.5 border-r text-center font-mono text-gray-500 bg-gray-50/30">
                                                                                                                    {gi + 1}
                                                                                                                </td>
                                                                                                                <td className="px-3 py-1.5 border-r font-mono font-bold text-blue-700">
                                                                                                                    {fr.row.order_code}
                                                                                                                </td>
                                                                                                                <td className="px-3 py-1.5 border-r font-bold text-gray-900">
                                                                                                                    {nv || '—'}
                                                                                                                </td>
                                                                                                                {chiTietColKeys.map((ck) => {
                                                                                                                    const cell = fr.row.chi_tiet_chia?.[ck];
                                                                                                                    const stepQueue =
                                                                                                                        ck === 'queue_before' &&
                                                                                                                        Array.isArray(cell)
                                                                                                                            ? cell
                                                                                                                            : null;
                                                                                                                    return (
                                                                                                                        <td
                                                                                                                            key={ck}
                                                                                                                            className="px-3 py-1.5 border-r align-top last:border-r-0"
                                                                                                                        >
                                                                                                                            {stepQueue ? (
                                                                                                                                <div className="flex flex-wrap items-center gap-1">
                                                                                                                                    {stepQueue.map((q, qi) => {
                                                                                                                                        const active =
                                                                                                                                            String(
                                                                                                                                                q || ''
                                                                                                                                            )
                                                                                                                                                .trim()
                                                                                                                                                .toLowerCase() ===
                                                                                                                                            nv.toLowerCase();
                                                                                                                                        return (
                                                                                                                                            <React.Fragment key={qi}>
                                                                                                                                                <span
                                                                                                                                                    className={`text-[9px] px-1.5 py-0.5 rounded border leading-none ${active ? 'bg-blue-600 border-blue-600 text-white font-bold' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                                                                                                                                                >
                                                                                                                                                    {q}
                                                                                                                                                </span>
                                                                                                                                                {qi <
                                                                                                                                                    stepQueue.length -
                                                                                                                                                        1 && (
                                                                                                                                                    <span className="text-gray-300 text-[10px]">
                                                                                                                                                        ›
                                                                                                                                                    </span>
                                                                                                                                                )}
                                                                                                                                            </React.Fragment>
                                                                                                                                        );
                                                                                                                                    })}
                                                                                                                                </div>
                                                                                                                            ) : (
                                                                                                                                <span className="text-gray-800 break-words">
                                                                                                                                    {formatChiTietChiaReportCell(
                                                                                                                                        ck,
                                                                                                                                        cell
                                                                                                                                    )}
                                                                                                                                </span>
                                                                                                                            )}
                                                                                                                        </td>
                                                                                                                    );
                                                                                                                })}
                                                                                                            </tr>
                                                                                                        );
                                                                                                    })
                                                                                                )}
                                                                                            </tbody>
                                                                                        </table>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="space-y-2 min-w-0">
                                                                                    <h5 className="text-[11px] font-bold text-blue-600 uppercase tracking-wider flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                                                                                        <span className="flex items-center gap-2">
                                                                                            <LayoutGrid className="w-3.5 h-3.5" /> II.
                                                                                            THỐNG KÊ NHÂN SỰ
                                                                                        </span>
                                                                                        <span className="text-[9px] font-normal normal-case text-slate-500">
                                                                                            (sản lượng = số dòng NV trên bảng I · lượt Vn-m cùng nguồn)
                                                                                        </span>
                                                                                    </h5>
                                                                                    <div className="border border-gray-200 rounded shadow-sm overflow-hidden xl:max-h-[min(70vh,900px)] xl:overflow-y-auto">
                                                                                        <table className="w-full text-left border-collapse">
                                                                                            <thead className="bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase">
                                                                                                <tr>
                                                                                                    <th className="px-3 py-2 w-12 border-r text-center">STT</th>
                                                                                                    <th className="px-3 py-2 border-r">Nhân sự (Tên-Vòng-Lượt)</th>
                                                                                                    <th className="px-3 py-2 text-right">Sản lượng</th>
                                                                                                </tr>
                                                                                            </thead>
                                                                                            <tbody className="text-xs divide-y divide-gray-100">
                                                                                                {staffEntries.map(([name, count], si) => {
                                                                                                    const nkTarget = normalizeNameKeyForStaffSort(name);
                                                                                                    const myTurns =
                                                                                                        flatDetailRows.length > 0
                                                                                                            ? flatDetailRows
                                                                                                                  .filter(
                                                                                                                      (r) =>
                                                                                                                          normalizeNameKeyForStaffSort(
                                                                                                                              r.row
                                                                                                                                  ?.delivery_staff
                                                                                                                          ) === nkTarget
                                                                                                                  )
                                                                                                                  .map(
                                                                                                                      (r) =>
                                                                                                                          `V${r.sessionOrdinal}-${r.orderIndexInSession}`
                                                                                                                  )
                                                                                                            : [];
                                                                                                    return (
                                                                                                        <tr key={name} className="hover:bg-gray-50 group">
                                                                                                            <td className="px-3 py-2 border-r text-center text-gray-400">
                                                                                                                {si + 1}
                                                                                                            </td>
                                                                                                            <td className="px-3 py-2 border-r">
                                                                                                                <div className="font-bold text-gray-800 mb-1 text-left">
                                                                                                                    {name}
                                                                                                                </div>
                                                                                                                {myTurns.length > 0 && (
                                                                                                                    <div className="flex flex-wrap gap-1 items-center">
                                                                                                                        {myTurns.map((t, ti) => (
                                                                                                                            <span
                                                                                                                                key={`${si}-${ti}-${t}`}
                                                                                                                                className="text-[8px] bg-blue-50 text-blue-500 px-1 rounded border border-blue-100 leading-tight"
                                                                                                                            >
                                                                                                                                {t}
                                                                                                                            </span>
                                                                                                                        ))}
                                                                                                                        {(() => {
                                                                                                                            const isStarter = flatDetailRows.some(r => 
                                                                                                                                r.orderIndexInSession === 1 && 
                                                                                                                                normalizeNameKeyForStaffSort(r.row?.delivery_staff) === nkTarget
                                                                                                                            );
                                                                                                                            return isStarter ? (
                                                                                                                                <span className="text-[7px] bg-emerald-100 text-emerald-700 px-1 rounded border border-emerald-200 font-bold uppercase">Starter</span>
                                                                                                                            ) : null;
                                                                                                                        })()}
                                                                                                                    </div>
                                                                                                                )}
                                                                                                            </td>
                                                                                                            <td className="px-3 py-2 text-right font-black text-blue-700 bg-blue-50/10">
                                                                                                                {count} đơn
                                                                                                            </td>
                                                                                                        </tr>
                                                                                                    );
                                                                                                })}
                                                                                            </tbody>
                                                                                        </table>
                                                                                    <div className="pt-4 border-t border-dashed border-gray-200">
                                                                                        <h5 className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-2 mb-3">
                                                                                            <GitBranch className="w-3.5 h-3.5" /> III. LOGIC TIẾP NỐI VÒNG CHIA (CARRY-OVER)
                                                                                        </h5>
                                                                                        <div className="overflow-x-auto border border-gray-200 rounded shadow-sm">
                                                                                            <table className="w-full text-left border-collapse">
                                                                                                <thead className="bg-gray-50 border-b border-gray-200 text-[9px] font-bold text-gray-500 uppercase">
                                                                                                    <tr>
                                                                                                        <th className="px-2 py-1.5 border-r text-center w-10">Phiên</th>
                                                                                                        <th className="px-2 py-1.5 border-r">Người cuối (Phiên trước)</th>
                                                                                                        <th className="px-2 py-1.5 border-r">Bắt đầu từ (Phiên này)</th>
                                                                                                        <th className="px-2 py-1.5 text-center">Tiếp theo (Dự kiến)</th>
                                                                                                    </tr>
                                                                                                </thead>
                                                                                                <tbody className="text-[10px] divide-y divide-gray-100">
                                                                                                    {sessions.map((s, idx) => {
                                                                                                        let phienData = {};
                                                                                                        try {
                                                                                                            const raw = typeof s.phien_chia === 'string' ? JSON.parse(s.phien_chia) : s.phien_chia;
                                                                                                            const key = b.key === 'Hà Nội' ? 'hanoi' : 'hcm';
                                                                                                            phienData = raw?.[key] || {};
                                                                                                        } catch(e) {}
                                                                                                        
                                                                                                        if (!phienData.bat_dau_phien_tu && !phienData.nguoi_cuoi_vong_truoc) return null;

                                                                                                        return (
                                                                                                            <tr key={s.id || idx} className="hover:bg-indigo-50/30">
                                                                                                                <td className="px-2 py-1.5 border-r text-center font-bold text-gray-600 bg-gray-50/30">{idx + 1}</td>
                                                                                                                <td className="px-2 py-1.5 border-r text-gray-700">
                                                                                                                    {phienData.nguoi_cuoi_vong_truoc ? (
                                                                                                                        <span className="flex items-center gap-1">
                                                                                                                            <CheckCircle className="w-3 h-3 text-emerald-500" />
                                                                                                                            {phienData.nguoi_cuoi_vong_truoc}
                                                                                                                        </span>
                                                                                                                    ) : <span className="text-gray-300 italic">Bắt đầu mới</span>}
                                                                                                                </td>
                                                                                                                <td className="px-2 py-1.5 border-r text-blue-700 font-bold">
                                                                                                                    <span className="flex items-center gap-1">
                                                                                                                        <PlayCircle className="w-3 h-3" />
                                                                                                                        {phienData.bat_dau_phien_tu || '—'}
                                                                                                                    </span>
                                                                                                                </td>
                                                                                                                <td className="px-2 py-1.5 text-center font-medium text-purple-600">
                                                                                                                    {phienData.goi_y_nhan_luot_tiep_theo || '—'}
                                                                                                                </td>
                                                                                                            </tr>
                                                                                                        );
                                                                                                    })}
                                                                                                </tbody>
                                                                                            </table>
                                                                                        </div>
                                                                                        <p className="text-[9px] text-gray-400 mt-2 italic px-1">
                                                                                            * Giải thích: Hệ thống nhớ người cuối cùng nhận đơn ở phiên trước để bắt đầu người kế tiếp ở phiên này (Round-robin liên tục). 
                                                                                            Nếu bạn ít đơn, có thể do bạn đứng cuối hàng đợi lúc phiên bắt đầu hoặc không khớp chi nhánh đơn.
                                                                                        </p>
                                                                                    </div>
                                                                                    </div>

                                                                                    {/* IV. ĐỐI SOÁT NHÂN SỰ VẮNG MẶT (Bịt miệng cãi cọ) */}
                                                                                    <div className="pt-4 border-t border-dashed border-gray-200">
                                                                                        <h5 className="text-[11px] font-bold text-red-500 uppercase tracking-wider flex items-center gap-2 mb-3">
                                                                                            <AlertCircle className="w-3.5 h-3.5" /> IV. ĐỐI SOÁT NHÂN SỰ VẮNG MẶT (KHÔNG THAM GIA VÒNG NÀY)
                                                                                        </h5>
                                                                                        {(() => {
                                                                                            const fullTeam = (chiaDonVanDonStaffOrder?.[b.key] || []).filter(Boolean);
                                                                                            const participating = staffEntries.map(([name]) => name.toLowerCase());
                                                                                            const absent = fullTeam.filter(name => !participating.includes(name.toLowerCase()));
                                                                                            
                                                                                            return absent.length > 0 ? (
                                                                                                <div className="bg-red-50/50 border border-red-100 rounded p-3">
                                                                                                    <div className="flex flex-wrap gap-2">
                                                                                                        {absent.map(name => (
                                                                                                            <div key={name} className="flex items-center gap-2 bg-white border border-red-200 px-3 py-1 rounded shadow-sm">
                                                                                                                <span className="text-xs font-bold text-gray-700">{name}</span>
                                                                                                                <span className="text-[10px] bg-red-100 text-red-600 px-1.5 rounded-full font-black uppercase">VẮNG</span>
                                                                                                            </div>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                    <p className="text-[10px] text-red-400 mt-2 italic">
                                                                                                        * Những nhân sự trên không có tên trong danh sách trực/xoay vòng tại thời điểm này, do đó không được hệ thống gán đơn.
                                                                                                    </p>
                                                                                                </div>
                                                                                            ) : (
                                                                                                <div className="bg-green-50/50 border border-green-100 rounded p-2 text-center">
                                                                                                    <p className="text-[10px] text-green-600 font-bold uppercase tracking-widest">Toàn bộ nhân sự đều tham gia trực (Đầy đủ 100%)</p>
                                                                                                </div>
                                                                                            );
                                                                                        })()}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-center py-20 bg-white rounded border-2 border-dashed border-gray-200">
                                                                        <Package className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                                                                        <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Không có dữ liệu lịch sử</h4>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );

                                                })}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Footer Modal */}
                                    <div className="flex shrink-0 items-center justify-between border-t bg-white px-6 py-4 text-xs text-gray-500">
                                        <p>Hệ thống tự động cập nhật mỗi khi có phiên chia đơn mới.</p>
                                        <button 
                                            onClick={() => setIsStatsModalOpen(false)}
                                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-bold transition-all"
                                        >
                                            Đóng báo cáo
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                                {/* Hiển thị kết quả chia đơn */}
                                {autoAssignResult && (
                                    <div className={`mt-4 p-4 rounded-lg border ${autoAssignResult.success ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                                        <h4 className={`font-semibold mb-2 ${autoAssignResult.success ? 'text-green-800' : 'text-yellow-800'}`}>
                                            {autoAssignResult.success ? '✅ Kết quả chia đơn' : '⚠️ Kết quả chia đơn'}
                                        </h4>
                                        <pre className="text-xs whitespace-pre-wrap text-gray-700 bg-white p-3 rounded border max-h-60 overflow-y-auto">
                                            {autoAssignResult.message}
                                        </pre>
                                    </div>
                                )}

                                {/* Hiển thị danh sách đơn không được chia */}
                                {notDividedOrders.length > 0 ? (
                                    <div className="mt-4 p-4 rounded-lg border bg-red-50 border-red-200">
                                        <h4 className="font-semibold text-red-800 mb-3">
                                            ⚠️ Danh sách đơn không được chia ({notDividedOrders.length} đơn)
                                            <span className="text-xs font-normal text-gray-600 ml-2">(Sắp xếp theo ngày, mới nhất lên đầu)</span>
                                        </h4>
                                        <div className="max-h-60 overflow-y-auto">
                                            <div className="space-y-2">
                                                {notDividedOrders.slice(0, 50).map((order, idx) => {
                                                    // Format order_date để hiển thị
                                                    let orderDateDisplay = 'N/A';
                                                    if (order.order_date) {
                                                        try {
                                                            const date = new Date(order.order_date);
                                                            if (!isNaN(date.getTime())) {
                                                                orderDateDisplay = date.toLocaleDateString('vi-VN', {
                                                                    year: 'numeric',
                                                                    month: '2-digit',
                                                                    day: '2-digit'
                                                                });
                                                            }
                                                        } catch (e) {
                                                            orderDateDisplay = String(order.order_date);
                                                        }
                                                    }
                                                    
                                                    return (
                                                        <div key={idx} className="bg-white p-3 rounded border border-red-200 text-sm">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="flex-1">
                                                                    <div className="font-semibold text-gray-800 flex items-center gap-2">
                                                                        <span>Mã đơn: <span className="font-mono text-blue-600">{order.order_code || 'N/A'}</span></span>
                                                                        <span className="text-xs font-normal text-gray-500">({orderDateDisplay})</span>
                                                                    </div>
                                                                    <div className="mt-1 text-xs text-gray-600 space-y-1">
                                                                        <div>Team: <span className="font-medium">{order.team || '(null/empty)'}</span></div>
                                                                        <div>Country: <span className="font-medium">{order.country || '(null/empty)'}</span></div>
                                                                        <div>Delivery Staff: <span className="font-medium">{order.delivery_staff || '(null/empty)'}</span></div>
                                                                        {order.sale_staff && (
                                                                            <div>Sale Staff: <span className="font-medium">{order.sale_staff}</span></div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="flex-shrink-0">
                                                                    <span className="inline-block px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                                                                        Không chia
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            {order.reason && (
                                                                <div className="mt-2 text-xs text-red-700 bg-red-100 p-2 rounded">
                                                                    <strong>Lý do:</strong> {order.reason}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                {notDividedOrders.length > 50 && (
                                                    <div className="text-center text-xs text-gray-500 py-2">
                                                        ... và {notDividedOrders.length - 50} đơn khác (chỉ hiển thị 50 đơn đầu)
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-3 text-xs text-red-700 bg-red-100 p-2 rounded">
                                            <strong>💡 Lưu ý:</strong> Đơn không được chia thường do:
                                            <ul className="list-disc list-inside mt-1 space-y-1">
                                                <li>Team không phải HCM/Hà Nội (cần điền team dựa trên sale_staff)</li>
                                                <li>Country = Nhật Bản (bị loại trừ)</li>
                                                <li>Delivery_staff đã có giá trị (không trống)</li>
                                            </ul>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-4 p-4 rounded-lg border bg-green-50 border-green-200">
                                        <h4 className="font-semibold text-green-800 mb-2">
                                            ✅ Không có đơn nào không được chia
                                        </h4>
                                        <p className="text-sm text-green-700">
                                            Tất cả các đơn có delivery_staff trống đều đã được chia thành công (trừ đơn Nhật Bản - đã được loại trừ theo quy tắc).
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* --- MODAL XEM TRƯỚC NHÂN SỰ U1 --- */}
                        {showStaffPreviewModal && (
                            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                                <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                                    <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
                                        <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                                            <Users className="w-5 h-5 text-blue-600" />
                                            Danh sách nhân sự U1 đang đi làm
                                        </h3>
                                        <button onClick={() => setShowStaffPreviewModal(false)} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
                                            <X className="w-6 h-6 text-gray-400" />
                                        </button>
                                    </div>
                                    
                                    <div className="p-6 overflow-y-auto max-h-[60vh]">
                                        {isPreviewStaffLoading ? (
                                            <div className="py-12 flex flex-col items-center justify-center gap-3 text-gray-400">
                                                <RefreshCw className="w-8 h-8 animate-spin" />
                                                <p>Đang kiểm tra dữ liệu...</p>
                                            </div>
                                        ) : activeStaffPreview.length > 0 ? (
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-12 gap-2 px-2 text-[10px] font-bold text-gray-400 uppercase">
                                                    <div className="col-span-5">Họ và tên</div>
                                                    <div className="col-span-4">Chi nhánh (Gốc / Máy hiểu)</div>
                                                    <div className="col-span-3 text-right">Trạng thái</div>
                                                </div>
                                                {activeStaffPreview.map((p, i) => (
                                                    <div key={i} className={`grid grid-cols-12 items-center gap-2 p-3 rounded-xl border ${p.isValid ? 'bg-white border-gray-100' : 'bg-red-50 border-red-100'}`}>
                                                        <div className="col-span-5">
                                                            <p className="font-bold text-gray-800">{p.name}</p>
                                                            {!p.isValid && <p className="text-[10px] text-red-600 font-medium">Bị loại: {p.detectedBranch === 'Không xác định' ? 'Sai chi nhánh' : 'Lỗi hệ thống'}</p>}
                                                        </div>
                                                        <div className="col-span-4 text-xs">
                                                            <span className="text-gray-400 italic">{p.rawBranch || '(Trống)'}</span>
                                                            <span className="mx-1 text-gray-300">→</span>
                                                            <span className={`font-bold ${p.detectedBranch === 'Không xác định' ? 'text-red-500' : 'text-blue-600'}`}>
                                                                {p.detectedBranch}
                                                            </span>
                                                        </div>
                                                        <div className="col-span-3 text-right">
                                                            <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-[10px] font-bold">U1</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="py-12 text-center text-gray-400 italic">
                                                Không tìm thấy nhân sự nào đang để trạng thái U1.
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="p-4 bg-blue-50 text-[11px] text-blue-700 leading-relaxed border-t">
                                        💡 <strong>Mẹo:</strong> Nếu nhân sự không có tên ở đây, hãy kiểm tra cột "Trạng thái chia" trong bảng vận đơn. Nếu tên hiển thị đỏ, hãy sửa lại cột "Chi nhánh" cho đúng (Hà Nội hoặc HCM).
                                    </div>
                                    
                                    <div className="p-4 flex justify-end">
                                        <button onClick={() => setShowStaffPreviewModal(false)} className="px-6 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-black transition-colors">
                                            Đã hiểu
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB CONTENT: ACCOUNT MANAGEMENT */}
            {activeTab === 'account_management' && (
                <div className="bg-white rounded-xl shadow-md border border-gray-100 animate-fadeIn overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Key className="w-6 h-6 text-blue-600" />
                            Quản lý tài khoản đăng nhập và mật khẩu
                        </h2>
                        <p className="text-sm text-gray-600 mt-2">
                            Quản lý tài khoản đăng nhập, mật khẩu và lịch sử đăng nhập của người dùng
                        </p>
                    </div>

                    <div className="p-6">
                        {/* Action Buttons */}
                        <div className="flex gap-3 mb-6">
                            <button
                                onClick={loadAuthAccounts}
                                disabled={accountLoading}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                title="Lấy dữ liệu trực tiếp từ bảng users"
                            >
                                <RefreshCw className={`w-4 h-4 ${accountLoading ? 'animate-spin' : ''}`} />
                                {accountLoading ? 'Đang lấy users...' : 'Lấy data từ users'}
                            </button>
                            <button
                                onClick={() => {
                                    setAccountForm({
                                        email: '',
                                        username: '',
                                        name: '',
                                        password: '',
                                        user_id: '',
                                        role: 'user',
                                        branch: '',
                                        department: '',
                                        status: 'active',
                                        must_change_password: false
                                    });
                                    setSelectedAccount(null);
                                    setShowAccountModal(true);
                                }}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center gap-2"
                            >
                                <Users className="w-4 h-4" />
                                Tạo tài khoản mới
                            </button>
                            <button
                                onClick={handleDownloadAccountTemplate}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors flex items-center gap-2"
                            >
                                <Download className="w-4 h-4" />
                                Tải mẫu Excel
                            </button>
                            <button
                                onClick={() => accountImportInputRef.current?.click()}
                                disabled={accountImportLoading}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Upload className="w-4 h-4" />
                                {accountImportLoading ? 'Đang tải lên...' : 'Tải lên'}
                            </button>
                            <input
                                ref={accountImportInputRef}
                                type="file"
                                accept=".xlsx,.xls"
                                className="hidden"
                                onChange={handleImportAccountsFromExcel}
                            />
                        </div>

                        {/* Search + filters */}
                        <div className="mb-4 flex flex-wrap gap-3 items-end">
                            <div className="relative max-w-md flex-1 min-w-[260px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder="Tìm kiếm theo tên..."
                                    value={nameSearchQuery}
                                    onChange={(e) => setNameSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div className="min-w-[180px]">
                                <label className="block text-xs text-gray-600 mb-1">Chi nhánh</label>
                                <select
                                    value={branchFilter}
                                    onChange={(e) => setBranchFilter(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="">Tất cả chi nhánh</option>
                                    {Array.from(new Set(authAccounts.map((a) => (a.branch || a.team || '').trim()).filter(Boolean)))
                                        .sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }))
                                        .map((branch) => (
                                            <option key={branch} value={branch}>{branch}</option>
                                        ))}
                                </select>
                            </div>
                            <div className="min-w-[180px]">
                                <label className="block text-xs text-gray-600 mb-1">Phòng ban</label>
                                <select
                                    value={departmentFilter}
                                    onChange={(e) => setDepartmentFilter(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="">Tất cả phòng ban</option>
                                    {Array.from(new Set(authAccounts.map((a) => (a.department || '').trim()).filter(Boolean)))
                                        .sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }))
                                        .map((department) => (
                                            <option key={department} value={department}>{department}</option>
                                        ))}
                                </select>
                            </div>
                            <button
                                onClick={() => {
                                    setNameSearchQuery('');
                                    setBranchFilter('');
                                    setDepartmentFilter('');
                                }}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                            >
                                Xóa lọc
                            </button>
                        </div>

                        {/* Accounts List */}
                        {accountLoading ? (
                            <div className="text-center py-8">
                                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600" />
                                <p className="mt-2 text-gray-600">Đang tải danh sách tài khoản...</p>
                            </div>
                        ) : authAccounts.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p>Chưa có tài khoản nào. Nhấn "Tạo tài khoản mới" để bắt đầu.</p>
                            </div>
                        ) : (() => {
                            // Filter accounts by name search query
                            const filteredAccounts = authAccounts.filter(account => {
                                const accountBranch = (account.branch || account.team || '').trim();
                                const accountDepartment = (account.department || '').trim();

                                if (branchFilter && accountBranch !== branchFilter) return false;
                                if (departmentFilter && accountDepartment !== departmentFilter) return false;

                                if (!nameSearchQuery.trim()) return true;
                                const searchLower = nameSearchQuery.toLowerCase();
                                const name = (account.name || '').toLowerCase();
                                const email = (account.email || '').toLowerCase();
                                const username = (account.username || '').toLowerCase();
                                return name.includes(searchLower) || email.includes(searchLower) || username.includes(searchLower);
                            });

                            if (filteredAccounts.length === 0) {
                                return (
                                    <div className="text-center py-8 text-gray-500">
                                        <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                        <p>Không tìm thấy tài khoản nào khớp bộ lọc hiện tại</p>
                                    </div>
                                );
                            }

                            return (
                                <div className="overflow-x-auto">
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                        <div className="text-sm text-gray-600">
                                            Hiển thị {filteredAccounts.length} / {authAccounts.length} tài khoản
                                            {selectedAccountIds.length > 0 ? ` - Đã chọn ${selectedAccountIds.length}` : ''}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={bulkAssignTeamValue}
                                                onChange={(e) => setBulkAssignTeamValue(e.target.value)}
                                                placeholder="Nhập Team..."
                                                className="px-3 py-1.5 border border-gray-300 rounded text-sm min-w-[140px]"
                                                disabled={bulkAssigningTeam || bulkDeletingAccounts}
                                                title="Nhập Team để gán hàng loạt"
                                            />
                                            <button
                                                onClick={handleAssignTeamSelectedAccounts}
                                                disabled={
                                                    selectedAccountIds.length === 0 ||
                                                    bulkAssigningTeam ||
                                                    bulkDeletingAccounts ||
                                                    !bulkAssignTeamValue.trim()
                                                }
                                                className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                                title="Gán Team hàng loạt cho tài khoản đã chọn"
                                            >
                                                <Tag className="w-4 h-4" />
                                                {bulkAssigningTeam ? 'Đang gán team...' : 'Gán Team đã chọn'}
                                            </button>
                                            <button
                                                onClick={() => setSelectedAccountIds([])}
                                                disabled={selectedAccountIds.length === 0 || bulkDeletingAccounts || bulkAssigningTeam}
                                                className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                Bỏ chọn
                                            </button>
                                            <button
                                                onClick={handleDeleteSelectedAccounts}
                                                disabled={selectedAccountIds.length === 0 || bulkDeletingAccounts || bulkAssigningTeam}
                                                className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                {bulkDeletingAccounts ? 'Đang xóa...' : 'Xóa đã chọn'}
                                            </button>
                                        </div>
                                    </div>
                                    <table className="min-w-full border-collapse border border-gray-300">
                                        <thead>
                                            <tr className="bg-gray-100">
                                                <th className="border border-gray-300 px-4 py-3 text-center font-semibold">
                                                    <input
                                                        type="checkbox"
                                                        checked={
                                                            filteredAccounts.length > 0 &&
                                                            filteredAccounts.every((account) => selectedAccountIds.includes(account.id))
                                                        }
                                                        onChange={(e) => {
                                                            const visibleIds = filteredAccounts.map((account) => account.id).filter(Boolean);
                                                            const checked = e.target.checked;
                                                            setSelectedAccountIds((prev) => {
                                                                if (checked) {
                                                                    return Array.from(new Set([...prev, ...visibleIds]));
                                                                }
                                                                const hiddenSelected = prev.filter((id) => !visibleIds.includes(id));
                                                                return hiddenSelected;
                                                            });
                                                        }}
                                                        className="w-4 h-4"
                                                        title="Chọn tất cả tài khoản đang hiển thị"
                                                    />
                                                </th>
                                                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Email</th>
                                                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Username</th>
                                                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Tên</th>
                                                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Password</th>
                                                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Role</th>
                                                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Chi nhánh</th>
                                                <th className="border border-gray-300 px-4 py-3 text-center font-semibold">Đẩy FFM</th>
                                                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Trạng thái</th>
                                                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredAccounts.map((account) => (
                                            <tr key={account.id} className="hover:bg-gray-50">
                                                <td className="border border-gray-300 px-4 py-3 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedAccountIds.includes(account.id)}
                                                        onChange={(e) => toggleAccountSelected(account.id, e.target.checked)}
                                                        className="w-4 h-4"
                                                    />
                                                </td>
                                                <td className="border border-gray-300 px-4 py-3">{account.email}</td>
                                                <td className="border border-gray-300 px-4 py-3">{account.username || '-'}</td>
                                                <td className="border border-gray-300 px-4 py-3">{account.name || '-'}</td>
                                                <td className="border border-gray-300 px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        {showPasswords[account.id] ? (
                                                            <>
                                                                <input
                                                                    type="text"
                                                                    value={passwordInputs[account.id] !== undefined ? passwordInputs[account.id] : ''}
                                                                    onChange={(e) => setPasswordInputs({ ...passwordInputs, [account.id]: e.target.value })}
                                                                    className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                                                                    placeholder="Nhập mật khẩu mới"
                                                                />
                                                                <button
                                                                    onClick={async () => {
                                                                        const newPassword = passwordInputs[account.id];
                                                                        if (newPassword && newPassword.trim()) {
                                                                            const bcrypt = await import('bcryptjs');
                                                                            const passwordHash = bcrypt.default.hashSync(newPassword, 10);
                                                                            const { error } = await supabase
                                                                                .from('users')
                                                                                .update({ password: passwordHash })
                                                                                .eq('id', account.id);
                                                                            if (error) {
                                                                                toast.error('Lỗi: ' + error.message);
                                                                            } else {
                                                                                toast.success('Đã cập nhật mật khẩu!');
                                                                                loadAuthAccounts();
                                                                                setShowPasswords({ ...showPasswords, [account.id]: false });
                                                                                delete passwordInputs[account.id];
                                                                            }
                                                                        }
                                                                    }}
                                                                    className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200"
                                                                    title="Lưu mật khẩu"
                                                                >
                                                                    <Save className="w-3 h-3" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="text-xs text-gray-600 font-mono max-w-xs truncate" title={account.password || 'Chưa có mật khẩu'}>
                                                                    {account.password ? account.password.substring(0, 30) + '...' : 'Chưa có'}
                                                                </span>
                                                                <button
                                                                    onClick={() => {
                                                                        setShowPasswords({ ...showPasswords, [account.id]: true });
                                                                        setPasswordInputs({ ...passwordInputs, [account.id]: '' });
                                                                    }}
                                                                    className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                                                                    title="Đặt mật khẩu mới"
                                                                >
                                                                    <Key className="w-3 h-3" />
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                setShowPasswords({ ...showPasswords, [account.id]: !showPasswords[account.id] });
                                                                if (showPasswords[account.id]) {
                                                                    const newInputs = { ...passwordInputs };
                                                                    delete newInputs[account.id];
                                                                    setPasswordInputs(newInputs);
                                                                }
                                                            }}
                                                            className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200"
                                                            title={showPasswords[account.id] ? 'Hủy' : 'Sửa mật khẩu'}
                                                        >
                                                            {showPasswords[account.id] ? <X className="w-3 h-3" /> : <Settings className="w-3 h-3" />}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="border border-gray-300 px-4 py-3">
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${account.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                                        account.role === 'leader' ? 'bg-blue-100 text-blue-800' :
                                                            'bg-gray-100 text-gray-800'
                                                        }`}>
                                                        {account.role || 'user'}
                                                    </span>
                                                </td>
                                                <td className="border border-gray-300 px-4 py-3">{account.branch || account.team || '-'}</td>
                                                <td className="border border-gray-300 px-4 py-3">
                                                    <label className="flex items-center justify-center cursor-pointer group">
                                                        <div className="relative">
                                                            <input
                                                                type="checkbox"
                                                                checked={account.can_day_ffm === true}
                                                                onChange={async (e) => {
                                                                    const newValue = e.target.checked;
                                                                    try {
                                                                        const { error } = await supabase
                                                                            .from('users')
                                                                            .update({ can_day_ffm: newValue })
                                                                            .eq('id', account.id);

                                                                        if (error) {
                                                                            toast.error('Lỗi cập nhật quyền đẩy FFM: ' + error.message);
                                                                        } else {
                                                                            toast.success(newValue ? 'Đã cấp quyền đẩy FFM' : 'Đã thu hồi quyền đẩy FFM');
                                                                            loadAuthAccounts(); // Reload để cập nhật UI
                                                                        }
                                                                    } catch (err) {
                                                                        toast.error('Lỗi: ' + err.message);
                                                                    }
                                                                }}
                                                                className="sr-only"
                                                            />
                                                            <div className={`
                                                                w-11 h-6 rounded-full transition-all duration-200 ease-in-out
                                                                ${account.can_day_ffm
                                                                    ? 'bg-green-500'
                                                                    : 'bg-gray-300'
                                                                }
                                                                group-hover:opacity-80
                                                            `}>
                                                                <div className={`
                                                                    w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-200 ease-in-out
                                                                    ${account.can_day_ffm
                                                                        ? 'translate-x-5'
                                                                        : 'translate-x-0.5'
                                                                    }
                                                                    mt-0.5
                                                                `}></div>
                                                            </div>
                                                        </div>
                                                        <span className={`ml-2 text-xs font-medium ${account.can_day_ffm ? 'text-green-700' : 'text-gray-500'
                                                            }`}>
                                                            {account.can_day_ffm ? 'Có' : 'Không'}
                                                        </span>
                                                    </label>
                                                </td>
                                                <td className="border border-gray-300 px-4 py-3">
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${account.status === 'active' ? 'bg-green-100 text-green-800' :
                                                        account.status === 'locked' ? 'bg-red-100 text-red-800' :
                                                            account.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                                                                'bg-yellow-100 text-yellow-800'
                                                        }`}>
                                                        {account.has_password ? 'Có mật khẩu' : 'Chưa có mật khẩu'}
                                                    </span>
                                                </td>
                                                <td className="border border-gray-300 px-4 py-3">
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleViewLoginHistory(account.id)}
                                                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                                                            title="Xem lịch sử đăng nhập"
                                                        >
                                                            <Clock className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleEditAccount(account)}
                                                            className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs hover:bg-yellow-200"
                                                            title="Sửa tài khoản"
                                                        >
                                                            <Settings className="w-4 h-4" />
                                                        </button>
                                                        {account.has_password ? (
                                                            <button
                                                                onClick={() => handleLockAccount(account.id)}
                                                                className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
                                                                title="Vô hiệu hóa tài khoản (xóa mật khẩu)"
                                                            >
                                                                <Lock className="w-4 h-4" />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleUnlockAccount(account.id)}
                                                                className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200"
                                                                title="Kích hoạt tài khoản (set mật khẩu)"
                                                            >
                                                                <Lock className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            );
                        })()}

                        {/* Account Modal */}
                        {showAccountModal && (
                            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                                <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-xl font-bold text-gray-800">
                                            {selectedAccount ? 'Sửa tài khoản' : 'Tạo tài khoản mới'}
                                        </h3>
                                        <button
                                            onClick={() => {
                                                setShowAccountModal(false);
                                                setSelectedAccount(null);
                                            }}
                                            className="text-gray-500 hover:text-gray-700"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Email <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="email"
                                                value={accountForm.email}
                                                onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="user@example.com"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Username <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={accountForm.username}
                                                onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="username"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Tên <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={accountForm.name}
                                                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Họ và tên"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Mật khẩu {selectedAccount ? '(để trống nếu không đổi)' : <span className="text-red-500">*</span>}
                                            </label>
                                            <input
                                                type="password"
                                                value={accountForm.password}
                                                onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder={selectedAccount ? 'Nhập mật khẩu mới (nếu muốn đổi)' : 'Nhập mật khẩu'}
                                                required={!selectedAccount}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Role
                                            </label>
                                            <select
                                                value={accountForm.role}
                                                onChange={(e) => setAccountForm({ ...accountForm, role: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                <option value="user">User</option>
                                                <option value="leader">Leader</option>
                                                <option value="admin">Admin</option>
                                                <option value="super_admin">Super admin</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Chi nhánh
                                            </label>
                                            <input
                                                type="text"
                                                value={accountForm.branch}
                                                onChange={(e) => setAccountForm({ ...accountForm, branch: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="HCM, Hà Nội, ..."
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Department
                                            </label>
                                            <input
                                                type="text"
                                                value={accountForm.department}
                                                onChange={(e) => setAccountForm({ ...accountForm, department: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Marketing, Sales, CSKH, ..."
                                            />
                                        </div>

                                        <div className="flex gap-3 pt-4">
                                            <button
                                                onClick={handleSaveAccount}
                                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                                            >
                                                {selectedAccount ? 'Cập nhật' : 'Tạo mới'}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowAccountModal(false);
                                                    setSelectedAccount(null);
                                                }}
                                                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition-colors"
                                            >
                                                Hủy
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Login History Modal */}
                        {showLoginHistory && (
                            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                                <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-xl font-bold text-gray-800">Lịch sử đăng nhập</h3>
                                        <button
                                            onClick={() => setShowLoginHistory(false)}
                                            className="text-gray-500 hover:text-gray-700"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>

                                    {loginHistory.length === 0 ? (
                                        <p className="text-gray-500 text-center py-8">Chưa có lịch sử đăng nhập</p>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full border-collapse border border-gray-300">
                                                <thead>
                                                    <tr className="bg-gray-100">
                                                        <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Thời gian</th>
                                                        <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Trạng thái</th>
                                                        <th className="border border-gray-300 px-4 py-2 text-left font-semibold">IP</th>
                                                        <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Thiết bị</th>
                                                        <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Lý do</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {loginHistory.map((history) => (
                                                        <tr key={history.id} className="hover:bg-gray-50">
                                                            <td className="border border-gray-300 px-4 py-2 text-sm">
                                                                {new Date(history.login_at).toLocaleString('vi-VN')}
                                                            </td>
                                                            <td className="border border-gray-300 px-4 py-2">
                                                                <span className={`px-2 py-1 rounded text-xs font-medium ${history.status === 'success' ? 'bg-green-100 text-green-800' :
                                                                    history.status === 'failed' ? 'bg-red-100 text-red-800' :
                                                                        'bg-yellow-100 text-yellow-800'
                                                                    }`}>
                                                                    {history.status === 'success' ? 'Thành công' :
                                                                        history.status === 'failed' ? 'Thất bại' :
                                                                            history.status}
                                                                </span>
                                                            </td>
                                                            <td className="border border-gray-300 px-4 py-2 text-sm">{history.login_ip || '-'}</td>
                                                            <td className="border border-gray-300 px-4 py-2 text-sm">{history.user_agent || '-'}</td>
                                                            <td className="border border-gray-300 px-4 py-2 text-sm text-red-600">{history.failure_reason || '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
};

export default AdminTools;
