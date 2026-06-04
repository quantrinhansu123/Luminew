import { supabase } from '../supabase/config';

export function parseChiTietChiaForMerge(raw) {
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

export function inferBranchLabelFromOrderTeam(teamRaw) {
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
export function yyyyMmDdVietNamFromTimestamp(isoLike) {
    const d = new Date(isoLike);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
}

export function inferOrderRowBranchForChiReport(row) {
    const p = parseChiTietChiaForMerge(row?.chi_tiet_chia);
    return inferBranchLabelFromOrderTeam(row?.team ?? p?.order_team ?? p?.branch);
}

/** Sắp xếp đơn chia: ưu tiên thu_tu_chia hợp lệ, rồi order_date, mã đơn. */
export function sortChiaDonViewOrdersList(list) {
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

export function supabaseErrorLooksLikeMissingChiTietChia(err) {
    const m = String(err?.message || '').toLowerCase();
    return (
        err?.code === 'PGRST204' ||
        m.includes('chi_tiet_chia') ||
        /column.*does not exist/i.test(m) ||
        m.includes('could not find') && m.includes('chi_tiet')
    );
}

export function normalizeFingerprintStaffKey(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

export function accumulateStaffFingerprints(acc, rawName, add) {
    const k = normalizeFingerprintStaffKey(rawName);
    if (!k) return;
    acc[k] = (acc[k] || 0) + add;
}

export function stringifyStaffFingerprint(acc) {
    const e = Object.entries(acc).sort(([a], [b]) =>
        String(a).localeCompare(String(b), 'vi')
    );
    return JSON.stringify(e);
}

/** Giống `normalizeHistoryBranchKey` trong component — dùng khi prefetch khớp phiên. */
export function normalizeHistoryBranchForChiReport(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return null;
    if (s.includes('hcm') || s.includes('hồ chí minh') || s.includes('ho chi minh') || s.includes('tp.hcm')) return 'HCM';
    if (s.includes('hà nội') || s.includes('ha noi') || s.includes('hanoi') || s === 'hn') return 'Hà Nội';
    return null;
}

export function fingerprintDeliveriesPairs(pairs) {
    const acc = {};
    pairs.forEach(({ row, parsed }) => {
        const nv = parsed?.delivery_staff ?? row?.delivery_staff;
        accumulateStaffFingerprints(acc, nv, 1);
    });
    return stringifyStaffFingerprint(acc);
}

export function fingerprintFromHistoryStaffStats(stats) {
    const acc = {};
    Object.entries(stats || {}).forEach(([k, v]) => {
        accumulateStaffFingerprints(acc, k, Number(v) || 0);
    });
    return stringifyStaffFingerprint(acc);
}

export function mergeOrderChiRowsPreferHcmClone(rowsHcm, rowsOrders) {
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

export function clusterChiTietOrderRowsMerged(rows) {
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

export function assignListFromChiDetailCluster(cluster) {
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
export function assignListFromOrderRowsFlat(rows) {
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
export function resolveAssignListForHistorySession(historyRow, branchKeyUi, lookupMap, mergedRowsAll) {
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
        let list = assignListFromOrderRowsFlat(rangeBranch);
        const cap = Number(historyRow?.total_orders);
        if (Number.isFinite(cap) && cap > 0 && list.length > cap) {
            list = list.slice(0, cap);
        }
        return { list, source: 'range_branch' };
    }

    return { list: [], source: 'none' };
}

/** Thứ tự cột ưu tiên cho bảng I. — các key còn lại của JSON được sort sau. */
export const CHI_TIET_CHIA_REPORT_KEY_ORDER = [
    'ngay_chia_van_don',
    'ten_vong',
    'thu_tu_chia',
    'reason',
    'queue_before',
    'staff_chi_nhanh',
    'eligible_staff',
];

export function chiTietChiaKeyLabelVi(k) {
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

export function collectChiTietChiaKeysForRows(rows) {
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
export function formatChiTietChiaReportCell(key, val) {
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

export function matchHistorySessionsToChiDetailClusters(historyRows, clusters) {
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
export function chiNgayYyyyMmDdFromRow(row) {
    const parsed = parseChiTietChiaForMerge(row?.chi_tiet_chia);
    return String(row?.ngay_chia_van_don ?? parsed?.ngay_chia_van_don ?? '').slice(0, 10);
}

/** Đơn có chi_tiet_chia nằm trong khoảng ngày chia (ưu tiên cột hoặc JSON). */
export function rowChiTietInNgayRange(row, start, end) {
    const d = chiNgayYyyyMmDdFromRow(row);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= start && d <= end;
}

/** PostgREST thường giới hạn ~1000 dòng/request — tải nhiều đợt cho báo cáo chia đơn. */
const REPORT_PAGE_SIZE = 1000;

/** Giới hạn trang khi prefetch đơn cho báo cáo phân bổ (tránh lag). */
export const PHAN_BO_REPORT_MAX_PAGES = 20;

/** Số dòng tối đa bảng I trên UI (bấm «Xem thêm» để mở rộng). */
export const PHAN_BO_DETAIL_ROW_LIMIT = 200;

export function parseStaffStatsForReport(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }
    return {};
}

export async function fetchPagedSupabaseSelect(
    tableName,
    selectColumns,
    applyFilters,
    { orderColumn = 'order_code', ascending = true, maxPages = 500 } = {}
) {
    const all = [];
    let from = 0;
    for (let page = 0; page < maxPages; page++) {
        let q = supabase.from(tableName).select(selectColumns);
        if (typeof applyFilters === 'function') {
            q = applyFilters(q);
        }
        const { data, error } = await q
            .order(orderColumn, { ascending })
            .range(from, from + REPORT_PAGE_SIZE - 1);
        if (error) {
            return { data: all, error };
        }
        const chunk = data || [];
        all.push(...chunk);
        if (chunk.length < REPORT_PAGE_SIZE) {
            break;
        }
        from += REPORT_PAGE_SIZE;
    }
    return { data: all, error: null };
}

export async function fetchOrderRowsWithChiTietForReportRange(start, end, options = {}) {
    const {
        maxPages = PHAN_BO_REPORT_MAX_PAGES,
        includeNullNgayFallback = false,
    } = options;
    const pageOpts = { maxPages };
    const sel =
        'order_code, team, chi_tiet_chia, delivery_staff, thu_tu_chia, order_date, updated_at, ngay_chia_van_don';

    const fetches = [
        fetchPagedSupabaseSelect('orders', sel, (q) =>
            q
                .gte('ngay_chia_van_don', start)
                .lte('ngay_chia_van_don', end)
                .not('chi_tiet_chia', 'is', null),
            pageOpts
        ),
        fetchPagedSupabaseSelect('order_code_hcm', sel, (q) =>
            q
                .gte('ngay_chia_van_don', start)
                .lte('ngay_chia_van_don', end)
                .not('chi_tiet_chia', 'is', null),
            pageOpts
        ),
    ];

    if (includeNullNgayFallback) {
        const startIso = `${start}T00:00:00+07:00`;
        const endIso = `${end}T23:59:59.999+07:00`;
        fetches.push(
            fetchPagedSupabaseSelect('orders', sel, (q) =>
                q
                    .is('ngay_chia_van_don', null)
                    .not('chi_tiet_chia', 'is', null)
                    .gte('updated_at', startIso)
                    .lte('updated_at', endIso),
                { maxPages: 5 }
            ),
            fetchPagedSupabaseSelect('order_code_hcm', sel, (q) =>
                q
                    .is('ngay_chia_van_don', null)
                    .not('chi_tiet_chia', 'is', null)
                    .gte('updated_at', startIso)
                    .lte('updated_at', endIso),
                { maxPages: 5 }
            )
        );
    }

    const results = await Promise.all(fetches);
    const [rOrd, rHcm, rOrdNgayNull, rHcmNgayNull] = results;

    const ordOk = !(rOrd || {}).error;
    const hcmOk = !(rHcm || {}).error;
    const ordNullOk = includeNullNgayFallback && !(rOrdNgayNull || {}).error;
    const hcmNullOk = includeNullNgayFallback && !(rHcmNgayNull || {}).error;

    if (!ordOk && (rOrd || {}).error) {
        console.warn('[Báo cáo I.] orders chi_tiet_chia:', rOrd.error.message);
    }
    if (!hcmOk && (rHcm || {}).error) {
        console.warn('[Báo cáo I.] order_code_hcm chi_tiet_chia:', rHcm.error.message);
    }

    const mergedMain = mergeOrderChiRowsPreferHcmClone(
        hcmOk ? rHcm.data || [] : [],
        ordOk ? rOrd.data || [] : []
    );
    const keysMain = new Set(
        mergedMain.map((r) => String(r?.order_code ?? '').trim()).filter(Boolean)
    );

    if (includeNullNgayFallback) {
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
    }

    return mergedMain;
}

/** `history_chia_don.phien_chia` / `chi_tiet_chia` — có thể jsonb hoặc chuỗi JSON */
export function parseHistoryChiaDonStoredJson(raw) {
    if (raw == null || raw === '') return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
        return JSON.parse(String(raw));
    } catch {
        return {};
    }
}

/** Khớp logic chi nhánh trong `chiaDonVanDon.js` (U1 từ danh_sach_van_don, sort `ho_va_ten` vi). */
export function ultraNormChiaDonBranchKey(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[.\-_/]/g, ' ')
        .replace(/\s+/g, '')
        .trim();
}

export function resolveVanDonBranchKey(chiNhanhRaw) {
    const n = ultraNormChiaDonBranchKey(chiNhanhRaw);
    if (n === 'hcm' || n === 'tphcm' || n === 'hochiminh' || n.includes('hcm')) return 'HCM';
    if (n === 'hanoi' || n === 'hn' || n.includes('hanoi')) return 'Hà Nội';
    return null;
}

export function resolveUserVanDonBranchFromRoster(rows, identityCandidates) {
    for (const row of rows || []) {
        const status = String(row.trang_thai_chia || '').trim().toUpperCase();
        if (status !== 'U1') continue;
        if (!isVanDonU1StaffName(row.ho_va_ten, identityCandidates)) continue;
        return resolveVanDonBranchKey(row.chi_nhanh);
    }
    return null;
}

export function buildVanDonU1StaffOrderFromRows(rows) {
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
        const branchKey = resolveVanDonBranchKey(item.chi_nhanh);
        if (branchKey === 'HCM') orderHCM.push(name);
        else if (branchKey === 'Hà Nội') orderHN.push(name);
    });
    return { HCM: orderHCM, 'Hà Nội': orderHN };
}

export function normalizeNameKeyForStaffSort(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/** Khớp tên đăng nhập với `ho_va_ten` trên danh_sach_van_don. */
export function personNameLooselyMatches(a, b) {
    const x = normalizeNameKeyForStaffSort(a);
    const y = normalizeNameKeyForStaffSort(b);
    if (!x || !y) return false;
    if (x === y) return true;
    if (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))) return true;
    return false;
}

export function isVanDonU1StaffName(staffName, identityCandidates) {
    const name = String(staffName || '').trim();
    if (!name) return false;
    const ids = (Array.isArray(identityCandidates) ? identityCandidates : [identityCandidates]).filter(
        (v) => v != null && String(v).trim() !== ''
    );
    return ids.some((id) => personNameLooselyMatches(id, name));
}

/** User hiện tại có trong roster U1 (trang_thai_chia = U1) hay không. */
export function userIsInVanDonU1Roster(rows, identityCandidates) {
    return (rows || []).some((row) => {
        const status = String(row.trang_thai_chia || '').trim().toUpperCase();
        if (status !== 'U1') return false;
        return isVanDonU1StaffName(row.ho_va_ten, identityCandidates);
    });
}

export function sortStatsEntriesByVanDonOrder(entries, canonicalNames) {
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

export function compactStaffTotalsLine(sortedEntries) {
    if (!sortedEntries.length) return null;
    return sortedEntries.map(([name, c]) => `${name}: ${Number(c) || 0}`).join(' · ');
}

/** Alias dùng trong UI báo cáo. */
export function normalizeHistoryBranchKey(raw) {
  return normalizeHistoryBranchForChiReport(raw);
}

const PHAN_BO_BRANCH_UI = {
    HCM: {
        key: 'HCM',
        title: 'Lịch sử chia — HCM',
        headClass: 'bg-orange-700',
    },
    'Hà Nội': {
        key: 'Hà Nội',
        title: 'Lịch sử chia — Hà Nội',
        headClass: 'bg-indigo-700',
    },
};

/** Tổng hợp sản lượng (cột trái) — tính một lần, tránh lặp trong render. */
export function buildPhanBoSummaryFlatRows(staffStatsReportByBranch, chiaDonVanDonStaffOrder) {
    const branchDefs = [
        {
            key: 'HCM',
            headerShort: 'HCM',
            badgeChip: 'bg-orange-100 text-orange-800 border-orange-200/80 ring-1 ring-orange-500/15',
            countBg: 'bg-orange-50 text-orange-800',
        },
        {
            key: 'Hà Nội',
            headerShort: 'Hà Nội',
            badgeChip: 'bg-indigo-100 text-indigo-900 border-indigo-200/80 ring-1 ring-indigo-500/15',
            countBg: 'bg-indigo-50 text-indigo-900',
        },
    ];
    const flatRows = [];
    for (const bd of branchDefs) {
        const statsObj = staffStatsReportByBranch?.[bd.key] || {};
        const canonical = chiaDonVanDonStaffOrder?.[bd.key] || [];
        const allEntriesMap = new Map();
        canonical.forEach((name) =>
            allEntriesMap.set(normalizeNameKeyForStaffSort(name), [name, 0])
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
    return flatRows;
}

/** Dữ liệu đã xử lý cho một chi nhánh — dùng useMemo thay vì tính trong JSX. */
export function buildPhanBoBranchReportModel({
    branchKey,
    historyChiaDon,
    chiTietFromOrdersLookup,
    chiaReportMergedChiTietRows,
    chiaDonVanDonStaffOrder,
}) {
    const ui = PHAN_BO_BRANCH_UI[branchKey] || { key: branchKey, title: branchKey, headClass: 'bg-gray-700' };
    const list = (historyChiaDon || [])
        .filter((h) => normalizeHistoryBranchKey(h.branch) === branchKey)
        .filter((h) => {
            const totalOrders = Number(h?.total_orders) || 0;
            const stats = parseStaffStatsForReport(h?.staff_stats);
            return totalOrders > 0 && Object.keys(stats).length > 0;
        });

    const sessions = [...list].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
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
            branchKey,
            chiTietFromOrdersLookup,
            chiaReportMergedChiTietRows
        );
        const cap = Number(h.total_orders) > 0 ? Number(h.total_orders) : assignList.length;
        const bounded = assignList.slice(0, cap);
        for (let oi = 0; oi < bounded.length; oi++) {
            flatDetailRows.push({
                sessionOrdinal,
                timeStr,
                performer,
                orderIndexInSession: oi + 1,
                row: bounded[oi],
            });
        }
    }

    const chiTietColKeys = collectChiTietChiaKeysForRows(flatDetailRows.map((x) => x.row));
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
        Array.from(staffCountByNk.entries()).map(([nk, c]) => [staffLabelByNk.get(nk) || nk, c]),
        chiaDonVanDonStaffOrder?.[branchKey] || []
    );
    const fullTeamRoster = (chiaDonVanDonStaffOrder?.[branchKey] || []).filter(Boolean);
    const participatingNames = staffEntries.map(([n]) => n.toLowerCase());
    const absentStaff = fullTeamRoster.filter((n) => !participatingNames.includes(n.toLowerCase()));

    return {
        ...ui,
        total: list.length,
        sessions,
        flatDetailRows,
        chiTietColKeys,
        chiaTietTableColSpan: Math.max(6, 6 + chiTietColKeys.length),
        staffEntries,
        absentStaff,
    };
}
