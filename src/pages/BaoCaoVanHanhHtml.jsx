import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';

import MultiSelect from '../components/MultiSelect';
import * as rbacService from '../services/rbacService';
import { supabase } from '../supabase/config';
import usePermissions from '../hooks/usePermissions';
import { formatBaoCaoVanDonStatusHistogram } from '../utils/baoCaoVanDonFormat';
import {
    buildBaoCaoVanHanhMatrix,
    formatPct,
    formatSlVi,
    NO_AMOUNT
} from '../utils/baoCaoVanDonMarketMatrix';
import {
    buildPushDonByDayMatrix,
    buildPushDonByDayMatrixFromFfmLogs,
    buildTrangThaiDonByDay,
    isoToViDisplay
} from '../utils/baoCaoVanHanhTabsData';
import {
    aggregateOperationalReportSlice,
    BC_VH_PAYMENT_COLUMNS,
    filterSliceForCriteriaRow,
    formatNumVi,
    formatPctComma
} from '../utils/baoCaoVanDonOperationalReport';
import './BaoCaoVanHanh.css';

const formatDateForInput = (date) => {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const newBcvhRowId = () =>
    `bcvh-${
        typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    }`;

const TABS = ['tab1', 'tab2', 'tab3', 'tab4', 'tab5'];
const BCVH_CRITERIA_STORAGE_KEY = 'bao_cao_van_hanh_tab2_criteria_v1';
const mapBaoCaoRowToVirtual = (row) => {
    const ngay = row.ngay;
    let dateStr = '';
    if (ngay) {
        dateStr = typeof ngay === 'string' ? String(ngay).slice(0, 10) : formatDateForInput(new Date(ngay));
    }
    return {
        _source: 'bao_cao',
        id: row.id,
        _ket_qua_check: row.ket_qua_check,
        _trang_thai_giao_hang: row.trang_thai_giao_hang,
        _trang_thai_thanh_toan: row.trang_thai_thanh_toan,
        _tien_trang_thai_thanh_toan: row.tien_trang_thai_thanh_toan ?? {},
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
    const { canView } = usePermissions();
    const [searchParams, setSearchParams] = useSearchParams();
    const urlStartDate = searchParams.get('from_date');
    const urlEndDate = searchParams.get('to_date');
    const buildDefaultBcvhRows = useCallback(() => {
        if (urlStartDate && urlEndDate) {
            return [
                {
                    id: newBcvhRowId(),
                    startDate: urlStartDate,
                    endDate: urlEndDate,
                    product: '',
                    market: ''
                }
            ];
        }
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 9);
        return [
            {
                id: newBcvhRowId(),
                startDate: formatDateForInput(start),
                endDate: formatDateForInput(end),
                product: '',
                market: ''
            }
        ];
    }, [urlEndDate, urlStartDate]);

    const readStoredBcvhRows = useCallback(() => {
        try {
            const raw = localStorage.getItem(BCVH_CRITERIA_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length === 0) return null;
            const sanitized = parsed
                .map((row) => ({
                    id: newBcvhRowId(),
                    startDate: String(row?.startDate || ''),
                    endDate: String(row?.endDate || ''),
                    product: String(row?.product || ''),
                    market: String(row?.market || '')
                }))
                .filter((row) => row.startDate || row.endDate || row.product || row.market);
            return sanitized.length > 0 ? sanitized : null;
        } catch {
            return null;
        }
    }, []);

    const userRole = localStorage.getItem('userRole') || '';
    const isAdmin =
        ['admin', 'super_admin', 'administrator'].includes(userRole.toLowerCase()) ||
        ['ADMIN', 'SUPER_ADMIN', 'ADMINISTRATOR'].includes(userRole);

    const getDefaultDates = useCallback(() => {
        if (urlStartDate && urlEndDate) {
            return { startDate: urlStartDate, endDate: urlEndDate };
        }
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 9);
        return { startDate: formatDateForInput(start), endDate: formatDateForInput(end) };
    }, [urlStartDate, urlEndDate]);

    const [reportFilters, setReportFilters] = useState(() => {
        const d = getDefaultDates();
        return {
            dateRange: urlStartDate && urlEndDate ? '' : 'last10Days',
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
    const [bcvhCriteriaRows, setBcvhCriteriaRows] = useState(() => {
        const stored = readStoredBcvhRows();
        return stored || buildDefaultBcvhRows();
    });
    const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]);

    const [showStaffDropdown, setShowStaffDropdown] = useState(false);
    const staffDropdownRef = useRef(null);
    const staffButtonRef = useRef(null);
    const [staffDropdownPosition, setStaffDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
    const bcvhWrapRef = useRef(null);
    const bcvhFixedPaneRef = useRef(null);
    const bcvhFixedTableRef = useRef(null);
    const bcvhScrollTableRef = useRef(null);
    const bcvhScrollRef = useRef(null);
    const bcvhRightScrollbarRef = useRef(null);
    const bcvhRightScrollbarInnerRef = useRef(null);

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
            const payload = bcvhCriteriaRows.map((row) => ({
                startDate: row.startDate || '',
                endDate: row.endDate || '',
                product: row.product || '',
                market: row.market || ''
            }));
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
        const now = new Date();
        const year = now.getFullYear();
        let start;
        let end;
        switch (reportFilters.dateRange) {
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
                if (reportFilters.dateRange.startsWith('month_')) {
                    const m = parseInt(reportFilters.dateRange.split('_')[1], 10) - 1;
                    start = new Date(year, m, 1);
                    end = new Date(year, m + 1, 0);
                } else if (reportFilters.dateRange.startsWith('quarter_')) {
                    const q = parseInt(reportFilters.dateRange.split('_')[1], 10);
                    start = new Date(year, (q - 1) * 3, 1);
                    end = new Date(year, (q - 1) * 3 + 3, 0);
                }
        }
        if (start && end) {
            setReportFilters((p) => ({
                ...p,
                startDate: formatDateForInput(start),
                endDate: formatDateForInput(end)
            }));
        }
    }, [reportFilters.dateRange]);

    const uniqueProducts = useMemo(
        () => [...new Set(rawData.map((r) => r['Mặt hàng']).filter(Boolean))].sort(),
        [rawData]
    );
    const uniqueMarkets = useMemo(
        () => [...new Set(rawData.map((r) => r['khu vực']).filter(Boolean))].sort(),
        [rawData]
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
    const statusByDay = useMemo(
        () => buildTrangThaiDonByDay(rawData, reportFilters.startDate, reportFilters.endDate),
        [rawData, reportFilters.startDate, reportFilters.endDate]
    );

    const { bcvhLines, bcvhTotal } = useMemo(() => {
        // "TỔNG" phải theo đúng các dòng tiêu chí đang hiển thị trong tab 2.
        // Hiện tại bcvhTotal đang cộng rawData (bỏ qua product/market/start-end của từng dòng),
        // nên khi user sửa các dòng tiêu chí mà không bấm "Tìm", hàng "TỔNG" sẽ lệch.
        const slicesByRow = bcvhCriteriaRows.map((row) => filterSliceForCriteriaRow(rawData, row));
        const lines = bcvhCriteriaRows.map((row, idx) => ({
            ...row,
            metrics: aggregateOperationalReportSlice(slicesByRow[idx])
        }));
        return {
            bcvhLines: lines,
            // Nếu nhiều dòng tiêu chí chồng lấn, phép cộng theo slice sẽ tự double-count,
            // tương tự cách Excel "tổng các hàng" (mỗi hàng là một breakdown riêng).
            bcvhTotal: aggregateOperationalReportSlice(slicesByRow.flat())
        };
    }, [rawData, bcvhCriteriaRows]);

    const addBcvhRow = () => {
        setBcvhCriteriaRows((prev) => {
            const last = prev[prev.length - 1];
            return [
                ...prev,
                {
                    id: newBcvhRowId(),
                    startDate: last?.startDate || reportFilters.startDate,
                    endDate: last?.endDate || reportFilters.endDate,
                    product: '',
                    market: ''
                }
            ];
        });
    };

    const removeBcvhRow = (id) => {
        setBcvhCriteriaRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
    };

    const patchBcvhRow = (id, patch) => {
        setBcvhCriteriaRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    };

    const renderBcvhMetricCells = (m) => (
        <>
            <td className="bcvh-cell">{formatNumVi(m.donCoBill)}</td>
            <td className="bcvh-cell">{formatNumVi(m.donCoBillAmount)}</td>
            <td className="bcvh-cell">{formatNumVi(m.tongNoiBo)}</td>
            <td className="bcvh-cell">{formatNumVi(m.coMa)}</td>
            <td className="bcvh-cell">{formatNumVi(m.chuaCoMa)}</td>
            <td className="bcvh-cell">{formatPctComma(m.tyLeVHNoiBo)}</td>
            <td className="bcvh-cell">{formatPctComma(m.tyLeTTTrenPhi)}</td>
            <td className="bcvh-cell">{formatPctComma(m.tyLeTTThanhCong)}</td>
            <td className="bcvh-cell">{formatNumVi(m.giaoTC)}</td>
            <td className="bcvh-cell">{formatNumVi(m.dangGiao)}</td>
            <td className="bcvh-cell">{formatNumVi(m.chuaGiao)}</td>
            <td className="bcvh-cell">{formatNumVi(m.hoan)}</td>
            <td className="bcvh-cell">{formatNumVi(m.huyVH)}</td>
            <td className="bcvh-cell">{formatNumVi(m.choCheck)}</td>
            <td className="bcvh-cell">{formatNumVi(m.tongThanhToanGiaoHangNb)}</td>
            <td className="bcvh-cell">{formatNumVi(m.huyNoiBo)}</td>
            <td className="bcvh-cell">{formatNumVi(m.doiHang)}</td>
            <td className="bcvh-cell">{formatNumVi(m.khachHen)}</td>
            <td className="bcvh-cell">{formatNumVi(m.treo)}</td>
            <td className="bcvh-cell">{formatNumVi(m.vanDonXL)}</td>
            <td className="bcvh-cell">{formatNumVi(m.daCkChuaDay)}</td>
            {BC_VH_PAYMENT_COLUMNS.map((c) => (
                <td key={c.id} className="bcvh-cell">
                    {formatNumVi(m.payment[c.id] || 0)}
                </td>
            ))}
        </>
    );

    const fetchData = async () => {
        const PAGE_SIZE = 1000; // phân trang để lấy full dữ liệu theo khoảng ngày
        if (!reportFilters.startDate || !reportFilters.endDate) {
            alert('Vui lòng chọn khoảng thời gian.');
            return;
        }
        const rowStarts = bcvhCriteriaRows.map((r) => r.startDate).filter(Boolean);
        const rowEnds = bcvhCriteriaRows.map((r) => r.endDate).filter(Boolean);
        const allStarts = [reportFilters.startDate, ...rowStarts];
        const allEnds = [reportFilters.endDate, ...rowEnds];
        const qStart = allStarts.reduce((a, b) => (a < b ? a : b));
        const qEnd = allEnds.reduce((a, b) => (a > b ? a : b));
        setLoading(true);
        setError(null);
        try {
            // Lấy FULL dữ liệu trong khoảng ngày bằng cách phân trang 1000 bản ghi/lần
            let allBaoCaoRows = [];
            let page = 0;
            const MAX_PAGES = 100; // an toàn: tối đa ~100.000 bản ghi
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const from = page * PAGE_SIZE;
                const to = from + PAGE_SIZE - 1;
                const { data, error: qErr } = await supabase
                    .from('bao_cao_van_don')
                    .select(
                        'id, ngay, nhan_vien, san_pham, thi_truong, trang_thai_giao_hang, ket_qua_check, trang_thai_thanh_toan, tien_trang_thai_thanh_toan'
                    )
                    .gte('ngay', qStart)
                    .lte('ngay', qEnd)
                    .order('ngay', { ascending: false })
                    .range(from, to);
                if (qErr) throw qErr;
                const batch = data || [];
                if (batch.length === 0) break;
                allBaoCaoRows = allBaoCaoRows.concat(batch);
                if (batch.length < PAGE_SIZE) break;
                page += 1;
                if (page >= MAX_PAGES) break;
            }

            let rows = (allBaoCaoRows || []).map(mapBaoCaoRowToVirtual);
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
                        ? 'Không có dòng bao_cao_van_don phù hợp bộ lọc (lọc NV Vận đơn theo quyền không khớp).'
                        : 'Không có dòng bao_cao_van_don phù hợp bộ lọc.'
                );
            } else {
                setError(null);
            }
            setRawData(rows);

            // Tab 4: nguồn dữ liệu theo yêu cầu lấy từ ffm_push_logs.
            // Tải theo khoảng ngày đang lọc (ưu tiên pushed_at; fallback theo cột timestamp khác nếu thiếu pushed_at).
            if (activeTab === 'tab4') {
                setError(null);
                const fromIso = `${reportFilters.startDate}T00:00:00`;
                const toIso = `${reportFilters.endDate}T23:59:59`;
                const { data: pushedRows, error: pushedErr } = await supabase
                    .from('ffm_push_logs')
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
                        .from('ffm_push_logs')
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
                                .from('ffm_push_logs')
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
            setError(err.message || 'Lỗi tải bao_cao_van_don');
            setRawData([]);
        } finally {
            setLoading(false);
        }
    };

    const renderMetricPair = (m) => (
        <>
            <td className="border border-black px-2 py-1 text-right tabular-nums">{formatSlVi(m)}</td>
            <td className="border border-black px-2 py-1 text-right text-gray-500">{NO_AMOUNT}</td>
        </>
    );

    const renderCoBillPair = (count, amountVnd) => (
        <>
            <td className="border border-black px-2 py-1 text-right tabular-nums">{formatSlVi(count)}</td>
            <td className="border border-black px-2 py-1 text-right tabular-nums">{formatNumVi(amountVnd)}</td>
        </>
    );

    const renderPctPair = (pctStr) => (
        <>
            <td className="border border-black px-2 py-1 text-right">{pctStr}</td>
            <td className="border border-black px-2 py-1 text-right text-gray-500">{pctStr}</td>
        </>
    );

    /** 4 cột đầu nằm ngoài bcvh-scroll — đo bề ngang pane trái cho spacer thanh kéo */
    const syncBcvhFixedPaneWidth = useCallback(() => {
        const pane = bcvhFixedPaneRef.current;
        const wrap = bcvhWrapRef.current;
        if (pane && wrap) {
            wrap.style.setProperty('--bcvh-fixed-measured-width', `${pane.offsetWidth}px`);
        }
    }, []);

    /** Hai bảng tách — đồng bộ chiều cao từng dòng tbody + header */
    const syncBcvhSplitTableHeights = useCallback(() => {
        if (activeTab !== 'tab2') return;
        const leftHead = bcvhFixedTableRef.current?.querySelector('thead');
        const rightHead = bcvhScrollTableRef.current?.querySelector('thead');
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
            const h = Math.max(lr.getBoundingClientRect().height, rr.getBoundingClientRect().height);
            lr.style.height = `${h}px`;
            rr.style.height = `${h}px`;
        }
    }, [activeTab]);

    useEffect(() => {
        syncBcvhFixedPaneWidth();
        requestAnimationFrame(() => {
            syncBcvhFixedPaneWidth();
            syncBcvhSplitTableHeights();
        });
    }, [syncBcvhFixedPaneWidth, syncBcvhSplitTableHeights, bcvhLines.length, rawData.length]);

    useEffect(() => {
        const onResize = () => {
            syncBcvhFixedPaneWidth();
            requestAnimationFrame(() => syncBcvhSplitTableHeights());
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [syncBcvhFixedPaneWidth, syncBcvhSplitTableHeights]);

    useEffect(() => {
        if (activeTab !== 'tab2') return;
        const main = bcvhScrollRef.current;
        if (!main) return;
        const scheduleSync = () => {
            syncBcvhFixedPaneWidth();
            requestAnimationFrame(() => {
                syncBcvhFixedPaneWidth();
                syncBcvhSplitTableHeights();
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
    }, [activeTab, syncBcvhFixedPaneWidth, syncBcvhSplitTableHeights, bcvhLines.length, rawData.length]);

    useEffect(() => {
        if (activeTab !== 'tab2') return;
        const rightPane = bcvhScrollRef.current;
        const leftPane = bcvhFixedPaneRef.current;
        if (!rightPane || !leftPane) return;

        const syncFromRight = () => {
            leftPane.scrollTop = rightPane.scrollTop;
        };

        rightPane.addEventListener('scroll', syncFromRight);
        syncFromRight();
        return () => {
            rightPane.removeEventListener('scroll', syncFromRight);
        };
    }, [activeTab, bcvhLines.length]);

    useEffect(() => {
        if (activeTab !== 'tab2') return;
        const main = bcvhScrollRef.current;
        const rightBar = bcvhRightScrollbarRef.current;
        const rightInner = bcvhRightScrollbarInnerRef.current;
        if (!main || !rightBar || !rightInner) return;

        let syncing = false;
        const syncHeight = () => {
            /* Inner phải cao = scrollHeight của bảng để thanh dọc có phạm vi kéo; viewport là chính cột (flex, height cố định). */
            rightInner.style.height = `${main.scrollHeight}px`;
        };
        const onMainScroll = () => {
            if (syncing) return;
            syncing = true;
            rightBar.scrollTop = main.scrollTop;
            syncing = false;
        };
        const onBarScroll = () => {
            if (syncing) return;
            syncing = true;
            main.scrollTop = rightBar.scrollTop;
            syncing = false;
        };

        const schedule = () => {
            syncHeight();
            requestAnimationFrame(() => {
                syncHeight();
                rightBar.scrollTop = main.scrollTop;
            });
        };

        schedule();
        let ro;
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(schedule);
            ro.observe(main);
        }
        window.addEventListener('resize', schedule);
        main.addEventListener('scroll', onMainScroll);
        rightBar.addEventListener('scroll', onBarScroll);

        return () => {
            if (ro) ro.disconnect();
            window.removeEventListener('resize', schedule);
            main.removeEventListener('scroll', onMainScroll);
            rightBar.removeEventListener('scroll', onBarScroll);
        };
    }, [activeTab, bcvhLines.length, rawData.length]);

    if (!canView('ORDERS_REPORT')) {
        return (
            <div className="p-8 text-center text-red-600 font-bold">
                Bạn không có quyền truy cập trang này (ORDERS_REPORT).
            </div>
        );
    }

    const { markets, byMarket, total } = matrix;
    const colSpanMain = 1 + markets.length * 2 + 2;

    return (
        <div className="min-h-[calc(100vh-64px)] bg-gray-100 p-4 md:p-6 overflow-y-auto overflow-x-hidden">
            {loading && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/20">
                    <div className="rounded-lg bg-white px-6 py-4 shadow-lg">Đang tải bao_cao_van_don…</div>
                </div>
            )}

            <h1 className="text-xl font-bold text-gray-800 mb-2">Báo cáo vận hành</h1>
            <p className="text-sm text-gray-600 mb-4 max-w-4xl">
                Số liệu gom từ bảng <strong>bao_cao_van_don</strong> (histogram kết quả check / giao hàng / thanh toán).
                Cột <strong>Thành tiền</strong> đối với <strong>Đã thanh toán (có bill)</strong> lấy từ{' '}
                <strong>tien_trang_thai_thanh_toan</strong> (đồng bộ từ <strong>orders.reconciled_vnd</strong>); các
                block khác vẫn có thể hiển thị &quot;—&quot; khi không có số tiền tương ứng trong tổng hợp.
            </p>

            {error && (
                <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800" role="alert">
                    {error}
                </div>
            )}

            {activeTab !== 'tab2' && (
                <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 shadow">
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
                        className="rounded bg-[#20744a] px-4 py-1.5 text-xs font-semibold text-white disabled:bg-gray-400"
                        onClick={async () => {
                            await fetchData();
                            const p = new URLSearchParams(searchParams);
                            p.set('from_date', reportFilters.startDate);
                            p.set('to_date', reportFilters.endDate);
                            p.set('tab', activeTab);
                            setSearchParams(p, { replace: true });
                        }}
                    >
                        {loading ? 'Đang tải…' : '🔍 Tìm'}
                    </button>
                    <button
                        type="button"
                        className="rounded border border-gray-400 px-3 py-1.5 text-xs"
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
                        className={`rounded-t-md border border-gray-400 border-b-0 px-3 py-2 text-xs font-bold transition-colors sm:px-4 sm:text-sm ${
                            activeTab === t.id ? 'bg-[#FFA500] text-black' : 'bg-gray-200 text-gray-800'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Tab 1 — Thống kê giao dịch (1 dòng tổng, giống mẫu HTML) */}
            {activeTab === 'tab1' && (
                <div className="overflow-x-auto rounded-b-md rounded-tr-md bg-white p-4 shadow-lg">
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
                                <th rowSpan={2} className="bg-lime-400 px-3 py-2 font-normal leading-tight">
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
                                    Dso đơn chưa
                                    <br />
                                    mã
                                </th>
                                <th rowSpan={2} className="bg-[#FFC000] px-3 py-2 font-normal">
                                    Tỉ lệ/đơn giao tc
                                </th>
                                <th rowSpan={2} className="bg-[#FFC000] px-3 py-2 font-normal leading-tight">
                                    tỷ lệ/đơn
                                    <br />
                                    có mã
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
                                <td className="px-3 py-2">{isoToViDisplay(reportFilters.startDate)}</td>
                                <td className="px-3 py-2">{isoToViDisplay(reportFilters.endDate)}</td>
                                <td className="px-3 py-2">{formatSlVi(total.donCoBill)}</td>
                                <td className="px-3 py-2">{formatNumVi(total.donCoBillAmount)}</td>
                                <td className="px-3 py-2">{formatSlVi(total.giaoTC)}</td>
                                <td className="px-3 py-2">{formatSlVi(total.coMa)}</td>
                                <td className="px-3 py-2 text-gray-500">{NO_AMOUNT}</td>
                                <td className="bg-[#F4B084] px-3 py-2">{formatSlVi(total.dangGiao)}</td>
                                <td className="bg-[#F4B084] px-3 py-2 text-gray-500">{NO_AMOUNT}</td>
                                <td className="px-3 py-2">{formatPct(total.giaoTC, total.tongLenDon)}</td>
                                <td className="px-3 py-2">{formatPct(total.coMa, total.sauHuy)}</td>
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
                <div ref={bcvhWrapRef} className="bcvh-wrap rounded-b-md rounded-tr-md bg-white p-4 shadow-lg">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                        {/* Bộ lọc khoảng ngày cho link & query */}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
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

                        <div className="flex items-center gap-2">
                            <div className="fixed-col-control rounded border border-gray-300 bg-gray-50 px-2 py-1 text-xs">
                                Cố định 4 cột đầu
                            </div>
                            <button
                                type="button"
                                disabled={loading}
                                className="rounded bg-[#20744a] px-4 py-1.5 text-xs font-semibold text-white disabled:bg-gray-400"
                                onClick={async () => {
                                    await fetchData();
                                    const p = new URLSearchParams(searchParams);
                                    p.set('from_date', reportFilters.startDate);
                                    p.set('to_date', reportFilters.endDate);
                                    p.set('tab', activeTab);
                                    setSearchParams(p, { replace: true });
                                }}
                            >
                                {loading ? 'Đang tải…' : '🔍 Tìm'}
                            </button>
                            <button
                                type="button"
                                onClick={addBcvhRow}
                                className="shrink-0 rounded border border-gray-400 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                                title="Thêm dòng tiêu chí"
                            >
                                + Thêm dòng
                            </button>
                        </div>
                    </div>
                    {rawData.length === 0 && !loading && (
                        <p className="mb-2 text-sm text-amber-800">
                            Chưa có dữ liệu đã tải — chọn khoảng ngày trên thanh lọc và bấm <strong>Tìm</strong> (hệ
                            thống lấy min–max ngày của thanh lọc và từng dòng bên dưới).
                        </p>
                    )}
                    <div className="bcvh-split-title">
                        <div className="bcvh-title-row text-center uppercase tracking-wide">BÁO CÁO VẬN HÀNH</div>
                    </div>
                    <div className="bcvh-split flex items-stretch">
                        <div
                            ref={bcvhFixedPaneRef}
                            className="bcvh-fixed-pane bcvh-fixed-pane-scroll max-h-[calc(100vh-160px)] shrink-0 self-start"
                        >
                            <table
                                ref={bcvhFixedTableRef}
                                className="bcvh-fixed-table bcvh-fixed-header-sticky min-w-max border-separate border-spacing-0"
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
                                </thead>
                                <tbody>
                                    {bcvhLines.map((line) => (
                                        <tr key={line.id}>
                                            <td
                                                className="bcvh-cell bcvh-cell-left whitespace-nowrap bcvh-col-1"
                                            >
                                                <input
                                                    type="date"
                                                    className="bcvh-cell-input"
                                                    value={line.startDate || ''}
                                                    onChange={(e) =>
                                                        patchBcvhRow(line.id, { startDate: e.target.value })
                                                    }
                                                />
                                            </td>
                                            <td
                                                className="bcvh-cell bcvh-cell-left whitespace-nowrap bcvh-col-2"
                                            >
                                                <input
                                                    type="date"
                                                    className="bcvh-cell-input"
                                                    value={line.endDate || ''}
                                                    onChange={(e) =>
                                                        patchBcvhRow(line.id, { endDate: e.target.value })
                                                    }
                                                />
                                            </td>
                                            <td
                                                className="bcvh-cell bcvh-cell-left whitespace-nowrap bcvh-col-3"
                                            >
                                                <select
                                                    className="bcvh-cell-select"
                                                    value={line.product}
                                                    onChange={(e) =>
                                                        patchBcvhRow(line.id, { product: e.target.value })
                                                    }
                                                >
                                                    <option value="">Tất cả</option>
                                                    {uniqueProducts.map((p) => (
                                                        <option key={p} value={p}>
                                                            {p}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td
                                                className="bcvh-cell bcvh-cell-left whitespace-nowrap bcvh-col-4"
                                            >
                                                <div className="flex items-center gap-1">
                                                    <select
                                                        className="bcvh-cell-select min-w-[100px] flex-1"
                                                        value={line.market}
                                                        onChange={(e) =>
                                                            patchBcvhRow(line.id, { market: e.target.value })
                                                        }
                                                    >
                                                        <option value="">Tất cả</option>
                                                        {uniqueMarkets.map((m) => (
                                                            <option key={m} value={m}>
                                                                {m}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {bcvhCriteriaRows.length > 1 && (
                                                        <button
                                                            type="button"
                                                            className="shrink-0 rounded border border-red-300 px-1.5 py-0.5 text-xs text-red-700 hover:bg-red-50"
                                                            title="Xóa dòng"
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
                        <div className="bcvh-metric-scroll-wrap flex min-h-0 flex-1 min-w-0 max-h-[calc(100vh-160px)] items-stretch">
                        <div
                            ref={bcvhScrollRef}
                            className="bcvh-scroll bcvh-scroll-metric bcvh-scroll-main min-h-0 flex-1 overflow-auto"
                        >
                            <table
                                ref={bcvhScrollTableRef}
                                className="bcvh-metric-table min-w-max border-separate border-spacing-0"
                            >
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
                                        <span className="font-normal">(đang/chưa giao)</span>
                                    </th>
                                    <th colSpan={3} className="bcvh-h-yellow">
                                        TỶ LỆ
                                    </th>
                                    <th colSpan={7} className="bcvh-h-green leading-tight">
                                        TỔNG ĐƠN LÊN VẬN HÀNH
                                    </th>
                                    <th colSpan={6} className="bcvh-h-red leading-tight">
                                        TỔNG ĐƠN CHƯA LÊN VẬN HÀNH
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
                                    {BC_VH_PAYMENT_COLUMNS.map((c) => (
                                        <th key={c.id} className="bcvh-h-grey leading-tight">
                                            {c.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {bcvhLines.map((line) => (
                                    <tr key={line.id}>{renderBcvhMetricCells(line.metrics)}</tr>
                                ))}
                                {rawData.length > 0 && (
                                    <tr className="bcvh-total-row">{renderBcvhMetricCells(bcvhTotal)}</tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                        <div
                            ref={bcvhRightScrollbarRef}
                            className="bcvh-right-scrollbar min-h-0 w-[14px] shrink-0 self-stretch"
                            aria-label="Thanh kéo dọc bảng"
                        >
                            <div ref={bcvhRightScrollbarInnerRef} className="bcvh-right-scrollbar-inner" />
                        </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab 3 — Thống Kê Đơn (matrix) */}
            {activeTab === 'tab3' && (
            <div className="overflow-x-auto rounded-b-md rounded-tr-md bg-white p-4 shadow-lg">
                <table className="min-w-max w-full border-collapse text-xs text-black">
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
                                className="w-48 border border-black bg-[#A9D08E] px-2 py-1 font-bold"
                            >
                                Thị trường / Tiêu chí
                            </th>
                            {markets.map((mk) => (
                                <th
                                    key={mk}
                                    colSpan={2}
                                    className="border border-black bg-[#A9D08E] px-2 py-1 font-bold"
                                >
                                    {mk}
                                </th>
                            ))}
                            <th colSpan={2} className="border border-black bg-[#FFFF00] px-2 py-1 font-bold">
                                TỔNG
                            </th>
                        </tr>
                        <tr>
                            {markets.map((mk) => (
                                <React.Fragment key={`${mk}-sub`}>
                                    <th className="border border-black bg-[#A9D08E] px-2 py-1 font-bold">SL đơn</th>
                                    <th className="border border-black bg-[#A9D08E] px-2 py-1 font-bold">Thành tiền</th>
                                </React.Fragment>
                            ))}
                            <th className="border border-black bg-[#FFFF00] px-2 py-1 font-bold">SL đơn</th>
                            <th className="border border-black bg-[#FFFF00] px-2 py-1 font-bold">Thành tiền</th>
                        </tr>
                    </thead>
                    <tbody className="bg-[#FDE9D9]">
                        <tr className="bg-lime-400 font-bold">
                            <td className="border border-black px-2 py-1">Tổng lên đơn</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`tl-${mk}`}>
                                    {renderMetricPair(byMarket[mk].tongLenDon)}
                                </React.Fragment>
                            ))}
                            {renderMetricPair(total.tongLenDon)}
                        </tr>
                        <tr>
                            <td className="border border-black px-2 py-1 font-bold">OK</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`ok-${mk}`}>{renderMetricPair(byMarket[mk].ok)}</React.Fragment>
                            ))}
                            {renderMetricPair(total.ok)}
                        </tr>
                        <tr>
                            <td className="border border-black px-2 py-1">Treo</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`tr-${mk}`}>{renderMetricPair(byMarket[mk].treo)}</React.Fragment>
                            ))}
                            {renderMetricPair(total.treo)}
                        </tr>
                        <tr>
                            <td className="border border-black px-2 py-1">Đợi hàng</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`dh-${mk}`}>{renderMetricPair(byMarket[mk].doiHang)}</React.Fragment>
                            ))}
                            {renderMetricPair(total.doiHang)}
                        </tr>
                        <tr className="text-red-600">
                            <td className="border border-black px-2 py-1">Tổng hủy (kq check)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`hc-${mk}`}>{renderMetricPair(byMarket[mk].huyCheck)}</React.Fragment>
                            ))}
                            {renderMetricPair(total.huyCheck)}
                        </tr>
                        <tr className="font-bold text-red-600">
                            <td className="border border-black px-2 py-1">Tổng đơn sau hủy</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`sh-${mk}`}>{renderMetricPair(byMarket[mk].sauHuy)}</React.Fragment>
                            ))}
                            {renderMetricPair(total.sauHuy)}
                        </tr>
                        <tr className="italic text-red-600">
                            <td className="border border-black px-2 py-1 not-italic">Tỷ lệ hủy (%)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`th-${mk}`}>
                                    {renderPctPair(formatPct(byMarket[mk].huyCheck, byMarket[mk].tongLenDon))}
                                </React.Fragment>
                            ))}
                            {renderPctPair(formatPct(total.huyCheck, total.tongLenDon))}
                        </tr>
                        <tr className="bg-yellow-300 font-bold">
                            <td className="border border-black px-2 py-1">Tỷ lệ đẩy / tổng đơn sau hủy (%)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`td-${mk}`}>
                                    {renderPctPair(formatPct(byMarket[mk].coMa, byMarket[mk].sauHuy))}
                                </React.Fragment>
                            ))}
                            {renderPctPair(formatPct(total.coMa, total.sauHuy))}
                        </tr>
                        <tr className="bg-yellow-300 font-bold">
                            <td className="border border-black px-2 py-1">Tỷ lệ đẩy / đơn OK (%)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`tok-${mk}`}>
                                    {renderPctPair(formatPct(byMarket[mk].coMa, byMarket[mk].ok))}
                                </React.Fragment>
                            ))}
                            {renderPctPair(formatPct(total.coMa, total.ok))}
                        </tr>
                        <tr>
                            <td className="border border-black px-2 py-1">Giao Thành Công</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`gtc-${mk}`}>{renderMetricPair(byMarket[mk].giaoTC)}</React.Fragment>
                            ))}
                            {renderMetricPair(total.giaoTC)}
                        </tr>
                        <tr className="bg-[#F8CBAD] font-bold">
                            <td className="border border-black px-2 py-1">MGT (theo key histogram)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`mgt-${mk}`}>{renderMetricPair(byMarket[mk].mgt)}</React.Fragment>
                            ))}
                            {renderMetricPair(total.mgt)}
                        </tr>
                        <tr className="bg-cyan-200 font-bold">
                            <td className="border border-black px-2 py-1">Đơn có mã (Mã tracking)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`cm-${mk}`}>{renderMetricPair(byMarket[mk].coMa)}</React.Fragment>
                            ))}
                            {renderMetricPair(total.coMa)}
                        </tr>
                        <tr className="bg-cyan-200 font-bold">
                            <td className="border border-black px-2 py-1">Tổng đơn đẩy VH (mã + đang giao)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`vh-${mk}`}>{renderMetricPair(byMarket[mk].dayVH)}</React.Fragment>
                            ))}
                            {renderMetricPair(total.dayVH)}
                        </tr>
                        <tr className="bg-cyan-200 font-bold">
                            <td className="border border-black px-2 py-1">Đơn có bill (có bill, trừ 1 phần)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`bl-${mk}`}>
                                    {renderCoBillPair(byMarket[mk].donCoBill, byMarket[mk].donCoBillAmount)}
                                </React.Fragment>
                            ))}
                            {renderCoBillPair(total.donCoBill, total.donCoBillAmount)}
                        </tr>
                        <tr className="bg-yellow-300 font-bold">
                            <td className="border border-black px-2 py-1">Tỷ lệ thu tiền / đơn TC (%)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`ttc-${mk}`}>
                                    {renderPctPair(formatPct(byMarket[mk].donCoBill, byMarket[mk].giaoTC))}
                                </React.Fragment>
                            ))}
                            {renderPctPair(formatPct(total.donCoBill, total.giaoTC))}
                        </tr>
                        <tr className="bg-yellow-300 font-bold">
                            <td className="border border-black px-2 py-1">Tỷ lệ thu tiền / đơn có mã (%)</td>
                            {markets.map((mk) => (
                                <React.Fragment key={`tcm-${mk}`}>
                                    {renderPctPair(formatPct(byMarket[mk].donCoBill, byMarket[mk].coMa))}
                                </React.Fragment>
                            ))}
                            {renderPctPair(formatPct(total.donCoBill, total.coMa))}
                        </tr>
                        <tr className="bg-yellow-300 font-bold">
                            <td className="border border-black px-2 py-1">Tỷ lệ vận hành (Giao TC / Tổng lên đơn)</td>
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

            {/* Tab 4 — Đẩy đơn theo ngày (Mã tracking) */}
            {activeTab === 'tab4' && (
                <div className="overflow-x-auto rounded-b-md rounded-tr-md bg-white p-4 shadow-lg">
                    <p className="mb-2 text-xs text-gray-600">
                        Mỗi ô: số đơn có <strong>Mã tracking</strong> (histogram) theo ngày — thị trường / sản phẩm.
                    </p>
                    <table className="min-w-max w-full border-collapse text-[11px] text-black">
                        <thead>
                            <tr className="bg-[#548235] text-white">
                                <th className="w-16 border border-black px-2 py-2 font-bold">Thị trường</th>
                                <th className="w-48 border border-black px-2 py-2 font-bold">Sản phẩm</th>
                                <th className="border border-black px-2 py-2 font-bold leading-tight">
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
                                <td colSpan={2} className="border border-black px-2 py-1">
                                    Tổng
                                </td>
                                <td className="border border-black px-2 py-1">{formatSlVi(pushMatrix.grandTotal)}</td>
                                {pushMatrix.dates.map((d) => (
                                    <td key={d} className="border border-black px-2 py-1">
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
                                                    <td rowSpan={rs} className="border border-black px-2 py-1 font-bold">
                                                        {e.market}
                                                    </td>
                                                ) : null}
                                                <td className="border border-black px-2 py-1 text-left">{e.product}</td>
                                                <td className="border border-black px-2 py-1 font-bold">
                                                    {formatSlVi(e.total)}
                                                </td>
                                                {pushMatrix.dates.map((d) => (
                                                    <td key={d} className="border border-black px-2 py-1">
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
                    {rawData.length === 0 && !loading && (
                        <p className="mt-3 text-center text-sm text-gray-500">Chưa có dữ liệu — chọn ngày và bấm Tìm.</p>
                    )}
                </div>
            )}

            {/* Tab 5 — Trạng thái đơn (theo ngày, rút gọn cột; doanh số = —) */}
            {activeTab === 'tab5' && (
                <div className="overflow-x-auto rounded-b-md rounded-tr-md bg-white p-4 shadow-lg">
                    <p className="mb-2 text-xs text-gray-600">
                        Theo từng ngày trong khoảng lọc; dòng đầu = lũy kế từ đầu tháng của &quot;Đến ngày&quot;. Cột
                        doanh số không có trong DB.
                    </p>
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
                                { key: 'mtd', row: statusByDay.monthRow, trClass: 'bg-gray-50 font-bold text-red-600' },
                                ...statusByDay.dayRows.map((r) => ({
                                    key: r.dateIso,
                                    row: r,
                                    trClass: 'text-black'
                                }))
                            ].map(({ key, row, trClass }) => (
                                <tr key={key} className={`text-center ${trClass}`}>
                                    <td className="border border-black px-2 py-1 text-left italic">{row.label}</td>
                                    <td className="border border-black px-2 py-1 font-bold">{formatSlVi(row.coMa)}</td>
                                    <td className="border border-black px-2 py-1 font-bold text-red-600">
                                        {formatSlVi(row.okChuaDay)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-bold italic">
                                        {row.pctDayOk != null
                                            ? `${(100 * row.pctDayOk).toFixed(2).replace('.', ',')}%`
                                            : '—'}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-bold">
                                        {formatSlVi(row.tongLenDon)}
                                    </td>
                                    <td className="border border-black px-2 py-1 font-bold">{NO_AMOUNT}</td>
                                    <td className="border border-black px-2 py-1">{formatSlVi(row.ok)}</td>
                                    <td className="border border-black px-2 py-1">{NO_AMOUNT}</td>
                                    <td className="border border-black px-2 py-1">{formatSlVi(row.treo)}</td>
                                    <td className="border border-black px-2 py-1">{NO_AMOUNT}</td>
                                    <td className="border border-black px-2 py-1">{formatSlVi(row.doiHang)}</td>
                                    <td className="border border-black px-2 py-1">{NO_AMOUNT}</td>
                                    <td className="border border-black px-2 py-1">{formatSlVi(row.khachHen)}</td>
                                    <td className="border border-black px-2 py-1">{NO_AMOUNT}</td>
                                    <td className="border border-black px-2 py-1">{formatSlVi(row.vanDonXL)}</td>
                                    <td className="border border-black px-2 py-1">{NO_AMOUNT}</td>
                                    <td className="border border-black px-2 py-1">{formatSlVi(row.huyCheck)}</td>
                                    <td className="border border-black px-2 py-1">{NO_AMOUNT}</td>
                                    <td className="border border-black px-2 py-1">{formatSlVi(row.huyGiao)}</td>
                                    <td className="border border-black px-2 py-1">{NO_AMOUNT}</td>
                                    <td className="border border-black px-2 py-1 text-red-600">
                                        {formatPct(row.huyCheck, row.tongLenDon)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {rawData.length === 0 && !loading && (
                        <p className="mt-3 text-center text-sm text-gray-500">Chưa có dữ liệu — chọn ngày và bấm Tìm.</p>
                    )}
                </div>
            )}
        </div>
    );
}
