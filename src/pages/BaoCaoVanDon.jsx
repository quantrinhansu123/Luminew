// Columns to always hide (tab Hoàn/Hủy)
const HIDDEN_COLUMNS = ['Thuê TK', 'Thời gian cutoff', 'Tiền Hàng'];

import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Title, Tooltip } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Bar, Doughnut } from 'react-chartjs-2';
import * as XLSX from 'xlsx';
import MultiSelect from '../components/MultiSelect';
import * as rbacService from '../services/rbacService';
import { supabase } from '../supabase/config';
import {
    baoCaoHistogramHasKey,
    collectBaoCaoHistogramKeys,
    formatBaoCaoVanDonStatusHistogram,
    isGiaoHangHistogramSyntheticKey,
    parseBaoCaoVanDonHistogram,
    sumBaoCaoVanDonHistogramValues,
    sumDonCoBillFullAmount
} from '../utils/baoCaoVanDonFormat';
import './BaoCaoVanDon.css';

// Register ChartJS
ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
    ChartDataLabels
);

// --- UTILS ---
const formatDateForInput = (date) => {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const parseDateString = (dateString) => {
    if (!dateString || typeof dateString !== 'string') return null;
    const cleanedDateString = dateString.trim().replace(/[^\d\/\-\s]/g, '');
    if (/^\d{4}-\d{2}-\d{2}/.test(cleanedDateString)) {
        const d = new Date(cleanedDateString);
        if (!isNaN(d.getTime())) return d;
    }
    const parts = cleanedDateString.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
    if (parts) {
        const month = parseInt(parts[2], 10);
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[3], 10);
        if (year > 1000 && month > 0 && month <= 12 && day > 0 && day <= 31) {
            const d = new Date(Date.UTC(year, month - 1, day));
            return d;
        }
    }
    return null;
};

const formatCurrency = (value) => {
    const n = parseFloat(String(value).replace(/[^\d.-]/g, ''));
    if (isNaN(n)) return '0 ₫';
    return n.toLocaleString('vi-VN') + ' ₫';
};

const createEmptyStats = () => ({
    "Đã Thanh Toán (có bill)": { count: 0, amount: 0 },
    "Bill 1 phần": { count: 0 },
    "Tổng đơn lên nội bộ": { count: 0 },
    "Tổng đơn đủ đkien đẩy vh": { count: 0 },
    "Tổng đơn lên vận hành": { count: 0 },
    "Giao Thành Công": { count: 0 },
    "Đang Giao": { count: 0 },
    "Chưa Giao": { count: 0 },
    "Hoàn": { count: 0 },
    "Hủy": { count: 0 }, // New status
    "chờ check": { count: 0 },
    "Trống trạng thái": { count: 0 }
});

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
        'Chi nhánh': '',
        'Đơn vị vận chuyển': '—',
        'Kết quả check': formatBaoCaoVanDonStatusHistogram(row.ket_qua_check),
        'Trạng thái giao hàng NB': formatBaoCaoVanDonStatusHistogram(row.trang_thai_giao_hang),
        'Trạng thái thu tiền': formatBaoCaoVanDonStatusHistogram(row.trang_thai_thanh_toan),
        'Tổng tiền VNĐ': 0,
        'Mã đơn hàng': row.id || '',
        'Mã Tracking': '',
        'Name*': '',
        'Phone*': '',
        'Ghi chú': '',
        'Lý do': ''
    };
};

/** @param {Record<string, { count: number; amount?: number }>} targets */
const addPaymentHistogramToStats = (payH, targets) => {
    const o = parseBaoCaoVanDonHistogram(payH);
    for (const [key, raw] of Object.entries(o)) {
        const n = Number(raw) || 0;
        if (n <= 0) continue;
        const k = String(key);
        targets.forEach((t) => {
            if (k.includes('Có bill 1 phần') || (k.includes('1 phần') && k.toLowerCase().includes('bill'))) {
                t['Bill 1 phần'].count += n;
            } else if (k.includes('Có bill') || k.toLowerCase().includes('có bill')) {
                t['Đã Thanh Toán (có bill)'].count += n;
            }
        });
    }
};

const addCoBillAmountFromPaymentMoney = (payMoneyH, targets) => {
    const add = sumDonCoBillFullAmount(payMoneyH);
    if (add <= 0) return;
    targets.forEach((t) => {
        t['Đã Thanh Toán (có bill)'].amount += add;
    });
};

const addEligiblePushFromKetQuaOk = (ketQuaCheck, targets) => {
    const o = parseBaoCaoVanDonHistogram(ketQuaCheck);
    for (const [key, raw] of Object.entries(o)) {
        const n = Number(raw) || 0;
        if (n <= 0) continue;
        if (String(key).trim().toLowerCase() === 'ok') {
            targets.forEach((t) => {
                t['Tổng đơn đủ đkien đẩy vh'].count += n;
            });
        }
    }
};

const classifyTrangThaiGiaoHangKey = (key) => {
    const d = String(key).trim();
    if (!d) return 'Trống trạng thái';
    const l = d.toLowerCase();
    if (
        l === 'trống' ||
        l === 'là trống' ||
        l.includes('là trống') ||
        l === 'trống trạng thái' ||
        /^trống\s*trạng\s*thái$/i.test(d)
    ) {
        return 'Trống trạng thái';
    }
    if (l.includes('giao thành công')) return 'Giao Thành Công';
    if (l.includes('đang giao')) return 'Đang Giao';
    if (l.includes('chưa giao')) return 'Chưa Giao';
    if (l.includes('huỷ') || l.includes('hủy') || l.includes('cancel')) return 'Hủy';
    if (l.includes('hoàn')) return 'Hoàn';
    if (l.includes('chờ check')) return 'chờ check';
    return 'Trống trạng thái';
};

const normalizeHistogramKeyLabel = (key) =>
    String(key)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

const isMaTrackingHistogramKey = (key) => normalizeHistogramKeyLabel(key) === 'mã tracking';

const sumMaTrackingInGiaoHistogram = (delH) => {
    const o = parseBaoCaoVanDonHistogram(delH);
    let s = 0;
    for (const [key, raw] of Object.entries(o)) {
        if (!isMaTrackingHistogramKey(key)) continue;
        s += Number(raw) || 0;
    }
    return s;
};

const sumTrangThaiGiaoExcludingTracking = (delH) => {
    const o = parseBaoCaoVanDonHistogram(delH);
    let s = 0;
    for (const [key, raw] of Object.entries(o)) {
        if (isGiaoHangHistogramSyntheticKey(key)) continue;
        s += Number(raw) || 0;
    }
    return s;
};

const sumKetQuaOkFromHistogram = (ketQuaCheck) => {
    const o = parseBaoCaoVanDonHistogram(ketQuaCheck);
    let s = 0;
    for (const [key, raw] of Object.entries(o)) {
        if (String(key).trim().toLowerCase() === 'ok') s += Number(raw) || 0;
    }
    return s;
};

const newCriteriaRowId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? `cr-${crypto.randomUUID()}`
        : `cr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const deriveFetchParamsFromCriteria = (rows) => {
    const withDates = rows.filter((r) => r.startDate && r.endDate);
    if (!withDates.length) return null;
    const startDate = withDates.reduce((m, r) => (r.startDate < m ? r.startDate : m), withDates[0].startDate);
    const endDate = withDates.reduce((m, r) => (r.endDate > m ? r.endDate : m), withDates[0].endDate);
    const anyOpenProduct = rows.some((r) => !r.product);
    const anyOpenMarket = rows.some((r) => !r.market);
    const product = anyOpenProduct ? [] : [...new Set(rows.map((r) => r.product).filter(Boolean))];
    const market = anyOpenMarket ? [] : [...new Set(rows.map((r) => r.market).filter(Boolean))];
    return { startDate, endDate, product, market };
};

const addDeliveryHistogramToStats = (delH, targets) => {
    const o = parseBaoCaoVanDonHistogram(delH);
    for (const [key, raw] of Object.entries(o)) {
        const n = Number(raw) || 0;
        if (n <= 0) continue;
        if (isGiaoHangHistogramSyntheticKey(key)) continue;
        const bucket = classifyTrangThaiGiaoHangKey(key);
        targets.forEach((t) => {
            t[bucket].count += n;
        });
    }
};

const addTongDonLenVanHanhFromMaTracking = (delH, targets) => {
    const n = sumMaTrackingInGiaoHistogram(delH);
    targets.forEach((t) => {
        t['Tổng đơn lên vận hành'].count += n;
    });
};

const rowHasRefundHistogram = (row) => {
    const o = parseBaoCaoVanDonHistogram(row._trang_thai_giao_hang);
    for (const [k, v] of Object.entries(o)) {
        const n = Number(v) || 0;
        if (n <= 0) continue;
        const b = classifyTrangThaiGiaoHangKey(k);
        if (b === 'Hoàn' || b === 'Hủy') return true;
    }
    return false;
};

const refundSubtotalFromRow = (row) => {
    const o = parseBaoCaoVanDonHistogram(row._trang_thai_giao_hang);
    let s = 0;
    for (const [k, v] of Object.entries(o)) {
        const n = Number(v) || 0;
        if (n <= 0) continue;
        const b = classifyTrangThaiGiaoHangKey(k);
        if (b === 'Hoàn' || b === 'Hủy') s += n;
    }
    return s;
};

export default function BaoCaoVanDon() {
    console.log("BaoCaoVanDon rendering..."); // Debug log

    // --- URL PARAMS ---
    const [searchParams, setSearchParams] = useSearchParams();
    
    // Đọc dates từ URL nếu có
    const urlStartDate = searchParams.get('from_date');
    const urlEndDate = searchParams.get('to_date');

    // --- STATE ---
    const [activeTab, setActiveTab] = useState('VanDonReport');
    const [loading, setLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0, message: '' });
    const [rawData, setRawData] = useState([]);
    const [error, setError] = useState(null);
    const [showCharts, setShowCharts] = useState(false); // Mặc định ẩn biểu đồ
    const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]); // Selected personnel từ tài khoản đăng nhập

    // Kiểm tra xem user có phải Admin không
    const userRole = localStorage.getItem('userRole') || '';
    const isAdmin = userRole.toLowerCase() === 'admin' || 
                    userRole.toLowerCase() === 'super_admin' || 
                    userRole.toLowerCase() === 'administrator' ||
                    userRole === 'ADMIN' || 
                    userRole === 'SUPER_ADMIN' || 
                    userRole === 'ADMINISTRATOR';

    // --- REPORT FILTERS ---
    // Tính toán 10 ngày gần nhất làm default
    const getDefaultDates = () => {
        if (urlStartDate && urlEndDate) {
            return { startDate: urlStartDate, endDate: urlEndDate };
        }
        // Default: 10 ngày gần nhất
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 9); // 10 ngày (bao gồm hôm nay)
        return {
            startDate: formatDateForInput(start),
            endDate: formatDateForInput(end)
        };
    };
    
    const [reportFilters, setReportFilters] = useState(() => {
        const defaultDates = getDefaultDates();
        return {
            dateRange: urlStartDate && urlEndDate ? '' : 'last10Days', // Default to last 10 days
            startDate: defaultDates.startDate,
            endDate: defaultDates.endDate,
            product: [], // Array of selected products
            market: [], // Array of selected markets
            staff: [], // Array of selected staff names
            team: []
        };
    });

    const [criteriaRows, setCriteriaRows] = useState(() => {
        const d = getDefaultDates();
        return [{ id: newCriteriaRowId(), startDate: d.startDate, endDate: d.endDate, product: '', market: '' }];
    });

    const [showStaffDropdown, setShowStaffDropdown] = useState(false);
    const staffDropdownRef = useRef(null);
    const staffButtonRef = useRef(null);
    const [staffDropdownPosition, setStaffDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
    
    // Tính toán vị trí dropdown khi mở (giống MultiSelect)
    useEffect(() => {
        if (showStaffDropdown && staffButtonRef.current) {
            const rect = staffButtonRef.current.getBoundingClientRect();
            setStaffDropdownPosition({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: Math.max(rect.width, 200) // Tối thiểu 200px
            });
        }
    }, [showStaffDropdown]);
    
    // Đóng dropdown khi click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (staffDropdownRef.current && !staffDropdownRef.current.contains(event.target) && 
                staffButtonRef.current && !staffButtonRef.current.contains(event.target)) {
                setShowStaffDropdown(false);
            }
        };
        if (showStaffDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showStaffDropdown]);
    
    // Không tự động cập nhật URL khi dates thay đổi
    // URL chỉ được cập nhật khi user click "Tìm kiếm" hoặc thay đổi từ URL trực tiếp

    // Không auto-fetch khi URL có dates - user phải click "Tìm kiếm" để fetch
    // Chỉ cập nhật dates vào state từ URL
    useEffect(() => {
        if (!urlStartDate || !urlEndDate) return;
        setCriteriaRows((prev) => {
            if (!prev.length) {
                return [{ id: newCriteriaRowId(), startDate: urlStartDate, endDate: urlEndDate, product: '', market: '' }];
            }
            const next = [...prev];
            const first = next[0];
            if (first.startDate === urlStartDate && first.endDate === urlEndDate) return prev;
            next[0] = { ...first, startDate: urlStartDate, endDate: urlEndDate };
            return next;
        });
    }, [urlStartDate, urlEndDate]);

    useEffect(() => {
        const fp = deriveFetchParamsFromCriteria(criteriaRows);
        if (!fp) return;
        setReportFilters((prev) => {
            const sameProd =
                JSON.stringify([...prev.product].sort()) === JSON.stringify([...fp.product].sort());
            const sameMkt =
                JSON.stringify([...prev.market].sort()) === JSON.stringify([...fp.market].sort());
            if (prev.startDate === fp.startDate && prev.endDate === fp.endDate && sameProd && sameMkt) {
                return prev;
            }
            return { ...prev, startDate: fp.startDate, endDate: fp.endDate, product: fp.product, market: fp.market };
        });
    }, [criteriaRows]);


    // --- DETAILED FILTERS ---
    const [detailFilters, setDetailFilters] = useState({
        checkResult: '',
        deliveryStatus: '',
        paymentStatus: '',
        staff: '',
        search: ''
    });

    // --- DERIVED LISTS ---
    // Extract unique values từ mapped data (đã được map từ API format)
    const uniqueProducts = useMemo(() => [...new Set(rawData.map(r => r["Mặt hàng"]).filter(Boolean))].sort(), [rawData]);
    const uniqueMarkets = useMemo(() => [...new Set(rawData.map(r => r["khu vực"] || r["Khu vực"]).filter(Boolean))].sort(), [rawData]);
    const uniqueTeams = useMemo(
        () => [...new Set(rawData.map((r) => r['Chi nhánh'] || r['Chi_nhánh'] || r['Team']).filter(Boolean))].sort(),
        [rawData]
    );
    // uniqueStaff: Chỉ lấy từ selectedPersonnelNames (giới hạn dropdown)
    // Nếu có selectedPersonnelNames, chỉ hiển thị những người trong đó
    // Nếu không có selectedPersonnelNames, lấy từ rawData (fallback)
    const uniqueStaff = useMemo(() => {
        if (selectedPersonnelNames && selectedPersonnelNames.length > 0) {
            // Chỉ hiển thị staff trong selectedPersonnelNames
            return [...new Set(selectedPersonnelNames)].sort();
        }
        // Fallback: lấy từ rawData nếu không có selectedPersonnelNames
        return [...new Set(rawData.map(r => r["NV Vận đơn"] || r["NV_Vận_đơn"]).filter(Boolean))].sort();
    }, [rawData, selectedPersonnelNames]);
    const uniqueCheckResults = useMemo(
        () => collectBaoCaoHistogramKeys(rawData, (r) => r._ket_qua_check),
        [rawData]
    );
    const uniqueDeliveryStatuses = useMemo(
        () => collectBaoCaoHistogramKeys(rawData, (r) => r._trang_thai_giao_hang),
        [rawData]
    );
    const uniquePaymentStatuses = useMemo(
        () => collectBaoCaoHistogramKeys(rawData, (r) => r._trang_thai_thanh_toan),
        [rawData]
    );

    const criteriaRowMetrics = useMemo(() => {
        return criteriaRows.map((row) => {
            const slice = rawData.filter((r) => {
                const d = r['Ngày lên đơn'] || '';
                if (row.startDate && d && d < row.startDate) return false;
                if (row.endDate && d && d > row.endDate) return false;
                if (row.product && r['Mặt hàng'] !== row.product) return false;
                if (row.market && r['khu vực'] !== row.market) return false;
                return true;
            });
            let sumGh = 0;
            let sumOk = 0;
            let sumTk = 0;
            for (const r of slice) {
                sumGh += sumTrangThaiGiaoExcludingTracking(r._trang_thai_giao_hang);
                sumOk += sumKetQuaOkFromHistogram(r._ket_qua_check);
                sumTk += sumMaTrackingInGiaoHistogram(r._trang_thai_giao_hang);
            }
            return { sumGh, sumOk, sumTk };
        });
    }, [criteriaRows, rawData]);

    const fetchParamsOk = Boolean(deriveFetchParamsFromCriteria(criteriaRows));

    // --- LOAD SELECTED PERSONNEL ---
    // Load selected_personnel từ tài khoản đăng nhập
    useEffect(() => {
        const loadSelectedPersonnel = async () => {
            try {
                const userEmail = localStorage.getItem('userEmail');
                if (!userEmail) {
                    console.log('⚠️ [BaoCaoVanDon] Không tìm thấy userEmail trong localStorage');
                    setSelectedPersonnelNames([]);
                    return;
                }

                const userEmailLower = userEmail.toLowerCase().trim();
                console.log('📧 [BaoCaoVanDon] Loading selected personnel for:', userEmailLower);

                // Get selected personnel (tên nhân viên)
                const personnelMap = await rbacService.getSelectedPersonnel([userEmailLower]);
                const personnelNames = personnelMap[userEmailLower] || [];

                console.log('📋 [BaoCaoVanDon] Personnel map from DB:', personnelMap);
                console.log('👥 [BaoCaoVanDon] Selected personnel names:', personnelNames);

                // Lọc chỉ lấy tên hợp lệ (không phải email)
                const validNames = personnelNames.filter(name => {
                    const nameStr = String(name).trim();
                    return nameStr.length > 0 && !nameStr.includes('@');
                });

                console.log('✅ [BaoCaoVanDon] Loaded', validNames.length, 'selected personnel:', validNames);
                setSelectedPersonnelNames(validNames);
            } catch (error) {
                console.error('❌ [BaoCaoVanDon] Error loading selected personnel:', error);
                setSelectedPersonnelNames([]);
            }
        };

        loadSelectedPersonnel();
    }, []);

    // --- FETCH DATA ---
    // Tắt auto-fetch - chỉ fetch khi user chọn dates và click button hoặc thay đổi dates
    // useEffect tự động fetch đã bị tắt - chỉ fetch khi user thao tác

    const fetchData = async () => {
        const fp = deriveFetchParamsFromCriteria(criteriaRows);
        if (!fp) {
            alert('Vui lòng chọn Ngày đầu và Ngày cuối cho ít nhất một dòng trong bảng tiêu chí.');
            return;
        }
        setLoading(true);
        setError(null);
        setLoadingProgress({ current: 0, total: 0, message: 'Đang tải bảng bao_cao_van_don...' });
        try {
            console.log(`📡 [BaoCaoVanDon] Supabase bao_cao_van_don ${fp.startDate} → ${fp.endDate}`);
            const { data, error: qErr } = await supabase
                .from('bao_cao_van_don')
                .select(
                    'id, ngay, nhan_vien, san_pham, thi_truong, trang_thai_giao_hang, ket_qua_check, trang_thai_thanh_toan, tien_trang_thai_thanh_toan'
                )
                .gte('ngay', fp.startDate)
                .lte('ngay', fp.endDate)
                .order('ngay', { ascending: false });
            if (qErr) throw qErr;
            let rows = (data || []).map(mapBaoCaoRowToVirtual);
            if (fp.product?.length > 0) {
                const ps = new Set(fp.product);
                rows = rows.filter((r) => ps.has(r['Mặt hàng']));
            }
            if (fp.market?.length > 0) {
                const ms = new Set(fp.market);
                rows = rows.filter((r) => ms.has(r['khu vực']));
            }
            const staffAllow = (() => {
                if (isAdmin) {
                    const parts = [];
                    if (selectedPersonnelNames?.length) parts.push(...selectedPersonnelNames);
                    if (reportFilters.staff?.length) parts.push(...reportFilters.staff);
                    const u = [...new Set(parts)];
                    return u.length ? new Set(u) : null;
                }
                if (selectedPersonnelNames?.length) return new Set(selectedPersonnelNames);
                return null;
            })();
            if (staffAllow) {
                rows = rows.filter((r) => staffAllow.has(r['NV Vận đơn']));
            }
            setLoadingProgress({
                current: rows.length,
                total: rows.length,
                message: 'Hoàn tất'
            });
            if (rows.length === 0) {
                const filterDetails = [];
                if (fp.product?.length) filterDetails.push(`Mặt hàng: ${fp.product.join(', ')}`);
                if (fp.market?.length) filterDetails.push(`Khu vực: ${fp.market.join(', ')}`);
                if (staffAllow) filterDetails.push('NV Vận đơn (theo tài khoản / lọc)');
                setError(
                    filterDetails.length > 0
                        ? `Không có dòng tổng hợp phù hợp: ${filterDetails.join('; ')}.`
                        : 'Không có dữ liệu trong bảng bao_cao_van_don cho khoảng ngày đã chọn.'
                );
            } else {
                setError(null);
            }
            setRawData(rows);
        } catch (err) {
            console.error('❌ [BaoCaoVanDon] Fetch error:', err);
            setError(err.message || 'Lỗi khi tải bao_cao_van_don');
        } finally {
            setLoading(false);
        }
    };

    // --- QUICK DATE LOGIC ---
    useEffect(() => {
        // Calculate dates locally when dateRange changes
        if (!reportFilters.dateRange) return;

        const now = new Date();
        const year = now.getFullYear();
        let start, end;

        switch (reportFilters.dateRange) {
            case 'last10Days': {
                start = new Date(now);
                start.setDate(now.getDate() - 9); // 10 ngày (bao gồm hôm nay)
                end = new Date(now);
                break;
            }
            case 'last3Days': {
                start = new Date(now);
                start.setDate(now.getDate() - 3);
                end = new Date(now);
                break;
            }
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
                    const m = parseInt(reportFilters.dateRange.split('_')[1]) - 1;
                    start = new Date(year, m, 1);
                    end = new Date(year, m + 1, 0);
                } else if (reportFilters.dateRange.startsWith('quarter_')) {
                    const q = parseInt(reportFilters.dateRange.split('_')[1]);
                    start = new Date(year, (q - 1) * 3, 1);
                    end = new Date(year, (q - 1) * 3 + 3, 0);
                }
        }

        if (start && end) {
            const newStart = formatDateForInput(start);
            const newEnd = formatDateForInput(end);
            setCriteriaRows((prev) => {
                if (!prev.length) {
                    return [{ id: newCriteriaRowId(), startDate: newStart, endDate: newEnd, product: '', market: '' }];
                }
                const next = [...prev];
                const f = next[0];
                if (f.startDate === newStart && f.endDate === newEnd) return prev;
                next[0] = { ...f, startDate: newStart, endDate: newEnd };
                return next;
            });
        }
    }, [reportFilters.dateRange]);


    // --- FILTER LOGIC: REPORT TAB ---
    // Không filter ở client-side vì đã filter ở API
    // rawData đã được filter bởi API với các filters: dates, product, market, staff
    const filteredReportData = useMemo(() => {
        // API đã filter theo dates, product, market, staff
        // Chỉ trả về rawData vì đã được filter ở server-side
        return rawData;
    }, [rawData]);

    const mergePaymentHistogramInto = (payH, map) => {
        const o = parseBaoCaoVanDonHistogram(payH);
        for (const [key, raw] of Object.entries(o)) {
            const n = Number(raw) || 0;
            if (n <= 0) continue;
            map[key] = (map[key] || 0) + n;
        }
    };

    const reportStats = useMemo(() => {
        const staffStats = {};
        const grandTotal = { ...createEmptyStats(), paymentByKey: {} };

        filteredReportData.forEach((row) => {
            const staffName = row['NV Vận đơn'] || row['NV_Vận_đơn'] || 'Chưa có NV';
            const company = row['Đơn vị vận chuyển'] || row['Đơn_vị_vận_chuyển'] || '—';

            if (!staffStats[staffName]) {
                staffStats[staffName] = { _total: createEmptyStats(), byCompany: {}, paymentByKey: {} };
            }
            if (!staffStats[staffName].byCompany[company]) {
                staffStats[staffName].byCompany[company] = createEmptyStats();
            }

            const targets = [staffStats[staffName].byCompany[company], staffStats[staffName]._total, grandTotal];

            const nInternal = sumBaoCaoVanDonHistogramValues(row._ket_qua_check);
            targets.forEach((t) => {
                t['Tổng đơn lên nội bộ'].count += nInternal;
            });

            addPaymentHistogramToStats(row._trang_thai_thanh_toan, targets);
            addCoBillAmountFromPaymentMoney(row._tien_trang_thai_thanh_toan, targets);
            addEligiblePushFromKetQuaOk(row._ket_qua_check, targets);
            addDeliveryHistogramToStats(row._trang_thai_giao_hang, targets);
            addTongDonLenVanHanhFromMaTracking(row._trang_thai_giao_hang, targets);

            mergePaymentHistogramInto(row._trang_thai_thanh_toan, grandTotal.paymentByKey);
            mergePaymentHistogramInto(row._trang_thai_thanh_toan, staffStats[staffName].paymentByKey);
        });

        return { staffStats, grandTotal };
    }, [filteredReportData]);

    const chartsData = useMemo(() => {
        const statusCounts = {
            'Giao Thành Công': 0,
            'Đang Giao': 0,
            'Chưa Giao': 0,
            Hoàn: 0,
            Hủy: 0,
            'chờ check': 0,
            'Trống trạng thái': 0
        };
        filteredReportData.forEach((r) => {
            const o = parseBaoCaoVanDonHistogram(r._trang_thai_giao_hang);
            for (const [key, raw] of Object.entries(o)) {
                const n = Number(raw) || 0;
                if (n <= 0) continue;
                if (isGiaoHangHistogramSyntheticKey(key)) continue;
                const bucket = classifyTrangThaiGiaoHangKey(key);
                statusCounts[bucket] += n;
            }
        });

        const statusChart = {
            labels: Object.keys(statusCounts),
            datasets: [
                {
                    data: Object.values(statusCounts),
                    backgroundColor: ['#2ecc71', '#3498db', '#95a5a6', '#e74c3c', '#8e44ad', '#f1c40f', '#bdc3c7']
                }
            ]
        };

        const funnelStats = reportStats.grandTotal;
        const funnelChart = {
            labels: ['Tổng đơn nội bộ', 'Đơn lên vận hành', 'Giao thành công'],
            datasets: [
                {
                    label: 'Số đơn',
                    data: [
                        funnelStats['Tổng đơn lên nội bộ'].count,
                        funnelStats['Tổng đơn lên vận hành'].count,
                        funnelStats['Giao Thành Công'].count
                    ],
                    backgroundColor: ['#3498db', '#f39c12', '#27ae60']
                }
            ]
        };

        const staffPerf = Object.entries(reportStats.staffStats)
            .map(([name, data]) => ({
                name,
                success: data._total['Giao Thành Công'].count,
                returned: data._total['Hoàn'].count,
                canceled: data._total['Hủy'].count
            }))
            .sort((a, b) => b.success + b.returned + b.canceled - (a.success + a.returned + a.canceled))
            .slice(0, 10);

        const staffChart = {
            labels: staffPerf.map((s) => s.name),
            datasets: [
                { label: 'Thành Công', data: staffPerf.map((s) => s.success), backgroundColor: '#2ecc71' },
                { label: 'Hoàn', data: staffPerf.map((s) => s.returned), backgroundColor: '#e74c3c' },
                { label: 'Hủy', data: staffPerf.map((s) => s.canceled), backgroundColor: '#8e44ad' }
            ]
        };

        const carrierAgg = { success: 0, returned: 0, canceled: 0 };
        filteredReportData.forEach((r) => {
            const o = parseBaoCaoVanDonHistogram(r._trang_thai_giao_hang);
            for (const [key, raw] of Object.entries(o)) {
                const n = Number(raw) || 0;
                if (n <= 0) continue;
                if (isGiaoHangHistogramSyntheticKey(key)) continue;
                const bucket = classifyTrangThaiGiaoHangKey(key);
                if (bucket === 'Giao Thành Công') carrierAgg.success += n;
                else if (bucket === 'Hoàn') carrierAgg.returned += n;
                else if (bucket === 'Hủy') carrierAgg.canceled += n;
            }
        });
        const carrierChart = {
            labels: ['Tổng hợp (theo dòng báo cáo)'],
            datasets: [
                { label: 'Thành Công', data: [carrierAgg.success], backgroundColor: '#2ecc71' },
                { label: 'Hoàn', data: [carrierAgg.returned], backgroundColor: '#e74c3c' },
                { label: 'Hủy', data: [carrierAgg.canceled], backgroundColor: '#8e44ad' }
            ]
        };

        return { statusChart, funnelChart, staffChart, carrierChart };
    }, [filteredReportData, reportStats]);


    const filteredDetailData = useMemo(() => {
        return rawData.filter((row) => {
            if (detailFilters.checkResult && !baoCaoHistogramHasKey(row._ket_qua_check, detailFilters.checkResult)) {
                return false;
            }
            if (
                detailFilters.deliveryStatus &&
                !baoCaoHistogramHasKey(row._trang_thai_giao_hang, detailFilters.deliveryStatus)
            ) {
                return false;
            }
            if (
                detailFilters.paymentStatus &&
                !baoCaoHistogramHasKey(row._trang_thai_thanh_toan, detailFilters.paymentStatus)
            ) {
                return false;
            }
            
            // Staff filter trong detail tab (single select)
            if (detailFilters.staff) {
                const rowStaff = row["NV Vận đơn"] || row["NV_Vận_đơn"] || "";
                if (rowStaff !== detailFilters.staff) return false;
            }

            if (detailFilters.search) {
                const s = detailFilters.search.toLowerCase();
                const hay = [
                    row.id,
                    row['Ngày lên đơn'],
                    row['Mặt hàng'],
                    row['khu vực'],
                    row['NV Vận đơn'],
                    row['Kết quả check'],
                    row['Trạng thái giao hàng NB'],
                    row['Trạng thái thu tiền']
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                if (!hay.includes(s)) return false;
            }

            return true;
        });
    }, [rawData, detailFilters]);

    // --- EXCEL HANDLERS ---
    const handleExportExcel = () => {
        // Export filteredDetailData
        const dataToExport = filteredDetailData.map(row => ({
            'Ngày lên đơn': row["Ngày lên đơn"] || row["Thời gian lên đơn"],
            'Mã đơn hàng': row["Mã đơn hàng"],
            'NV Vận đơn': row["NV Vận đơn"] || row["NV_Vận_đơn"],
            'Đơn vị vận chuyển': row["Đơn vị vận chuyển"] || row["Đơn_vị_vận_chuyển"],
            'Sản phẩm': row["Mặt hàng"],
            'Tổng tiền': row["Tổng tiền VNĐ"] || row["Tổng_tiền_VNĐ"],
            'Kết quả check': row["Kết quả check"],
            'Trạng thái giao hàng': row["Trạng thái giao hàng NB"],
            'Trạng thái thu tiền': row["Trạng thái thu tiền"],
            'Mã Tracking': row["Mã Tracking"],
            'Ghi chú': row["Ghi chú"]
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        XLSX.utils.book_append_sheet(wb, ws, "ChiTietVanDon");
        XLSX.writeFile(wb, `ChiTietVanDon_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const handleImportExcel = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!window.confirm("Bạn có chắc chắn muốn nhập dữ liệu? Dữ liệu sẽ update theo 'Mã đơn hàng' (Order Code) nếu tìm thấy.")) return;

        setLoading(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const wb = XLSX.read(arrayBuffer);
            const ws = wb.Sheets[wb.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(ws);

            if (jsonData.length === 0) {
                alert("File không có dữ liệu!");
                setLoading(false);
                return;
            }

            // Helper
            const parseNum = (v) => {
                if (v === undefined || v === null || String(v).trim() === '') return undefined;
                return parseInt(String(v).replace(/\D/g, '')) || 0;
            };

            const validItems = jsonData.map(item => {
                const orderCode = item['Mã đơn hàng'] || item['Order Code'] || item['order_code'];
                if (!orderCode) return null;

                return {
                    order_code: orderCode,
                    // Allow updating fields relevant to Delivery Report Context
                    tracking_code: item['Mã Tracking'] || item['Tracking Code'] || undefined,
                    delivery_status: item['Trạng thái'] || item['Status'] || item['Trạng thái giao hàng'] || undefined,
                    payment_status: item['Trạng thái thu tiền'] || item['Payment Status'] || undefined,
                    shipping_unit: item['Đơn vị vận chuyển'] || item['Carrier'] || undefined,
                    shipping_fee: parseNum(item['Phí ship']),
                    note: item['Ghi chú'] || item['Note'] || undefined,
                    // Add more if needed
                };
            }).filter(Boolean);

            if (validItems.length === 0) {
                alert("Không tìm thấy mã đơn hàng trong file!");
                setLoading(false);
                return;
            }

            const { error } = await supabase
                .from('orders') // Assuming same table as VanDon
                .upsert(validItems, { onConflict: 'order_code' });

            if (error) throw error;

            alert(`✅ Đã nhập thành công ${validItems.length} dòng!`);
            fetchData(); // Reload data

        } catch (err) {
            console.error("Import Error:", err);
            alert("❌ Lỗi nhập file: " + err.message);
        } finally {
            e.target.value = '';
            setLoading(false);
        }
    };
    // --- END EXCEL HANDLERS ---

    // --- REFUND LIST LOGIC ---
    const refundData = useMemo(() => {
        return filteredReportData.filter((r) => rowHasRefundHistogram(r));
    }, [filteredReportData]);

    const detailTotalAmount = useMemo(() => {
        return filteredDetailData.reduce((sum, r) => sum + (parseFloat(String(r["Tổng tiền VNĐ"] || r["Tổng_tiền_VNĐ"] || 0).replace(/[^\d.-]/g, '')) || 0), 0);
    }, [filteredDetailData]);


    // --- RENDER HELPERS ---
    // --- RENDER HELPERS ---
    const renderSummaryRow = (label, subLabel, data, isTotal = false) => {
        const totalOps = data["Tổng đơn lên nội bộ"].count;
        const totalShipped = data["Tổng đơn lên vận hành"].count;
        const success = data["Giao Thành Công"].count;

        const shipRate = totalOps > 0 ? (totalShipped / totalOps * 100) : 0;
        const payRate = success > 0 ? (data["Đã Thanh Toán (có bill)"].count / success * 100) : 0;
        const feeRate = totalShipped > 0 ? (success / totalShipped * 100) : 0;

        return (
            <tr key={`${label}-${subLabel}`} className={isTotal ? 'bcvd-total-row' : ''}>
                <td>{label}</td>
                <td>{subLabel}</td>
                <td>{data["Đã Thanh Toán (có bill)"].count}</td>
                <td>{formatCurrency(data["Đã Thanh Toán (có bill)"].amount)}</td>
                <td>{data["Bill 1 phần"].count}</td>
                <td>{data["Tổng đơn lên nội bộ"].count}</td>
                <td>{data["Tổng đơn đủ đkien đẩy vh"].count}</td>
                <td>{data["Tổng đơn lên vận hành"].count}</td>
                <td className={shipRate > 70 ? 'bcvd-text-positive' : 'bcvd-text-negative'}>{shipRate.toFixed(1)}%</td>
                <td>{success}</td>
                <td>{data["Đang Giao"].count}</td>
                <td>{data["Chưa Giao"].count}</td>
                <td>{data["Hoàn"].count}</td>
                <td>{data["Hủy"].count}</td>
                <td>{data["chờ check"].count}</td>
                <td>{data["Trống trạng thái"].count}</td>
                <td className={payRate > 80 ? 'bcvd-text-positive' : 'bcvd-text-negative'}>{payRate.toFixed(1)}%</td>
                <td className={feeRate > 80 ? 'bcvd-text-positive' : 'bcvd-text-negative'}>{feeRate.toFixed(1)}%</td>
            </tr>
        );
    };

    return (
        <div className="bcvd-container">
            {loading && (
                <div className="bcvd-loading-overlay">
                    <div className="bcvd-loading-spinner"></div>
                    <div style={{ marginTop: '10px' }}>
                        {loadingProgress.message || 'Đang tải dữ liệu...'}
                    </div>
                    {loadingProgress.total > 0 && (
                        <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                            Đã tải: {loadingProgress.current.toLocaleString()} / {loadingProgress.total.toLocaleString()} đơn hàng
                        </div>
                    )}
                    {loadingProgress.current > 0 && loadingProgress.total === 0 && (
                        <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                            Đã tải: {loadingProgress.current.toLocaleString()} đơn hàng
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50" role="alert">
                    <span className="font-medium">Lỗi!</span> {error}
                </div>
            )}

            <div className="bcvd-tab-container">
                <button
                    className={`bcvd-tab-btn ${activeTab === 'VanDonReport' ? 'active' : ''}`}
                    onClick={() => setActiveTab('VanDonReport')}
                >
                    Báo cáo Tổng kết
                </button>
                <button
                    className={`bcvd-tab-btn ${activeTab === 'DonChiTiet' ? 'active' : ''}`}
                    onClick={() => setActiveTab('DonChiTiet')}
                >
                    Chi tiết Vận đơn
                </button>
                <button
                    className={`bcvd-tab-btn ${activeTab === 'DonHoan' ? 'active' : ''}`}
                    onClick={() => setActiveTab('DonHoan')}
                >
                    Danh sách Hoàn/Hủy
                </button>
            </div>

            {/* TAB 1: BÁO CÁO */}
            {activeTab === 'VanDonReport' && (
                <div className="bcvd-tab-content">
                    <h2 className="bcvd-h2">BÁO CÁO TỔNG KẾT VẬN ĐƠN</h2>

                    <div className="bcvd-controls">
                        <div className="right-controls" style={{ width: '100%', justifyContent: 'flex-start' }}>
                            <label style={{ fontSize: '12px', marginRight: '4px' }}>Chọn nhanh:
                                <select
                                    className="bcvd-filter-select"
                                    value={reportFilters.dateRange}
                                    onChange={(e) => setReportFilters(p => ({ ...p, dateRange: e.target.value }))}
                                    style={{ marginLeft: '4px', fontSize: '12px', padding: '6px 8px' }}
                                >
                                    <option value="">-- Tùy chọn --</option>
                                    <option value="last10Days">10 ngày gần nhất</option>
                                    <option value="last3Days">3 ngày gần nhất</option>
                                    <optgroup label="Tuần">
                                        <option value="lastWeek">Tuần trước</option>
                                        <option value="thisWeek">Tuần này</option>
                                    </optgroup>
                                    <optgroup label="Tháng">
                                        <option value="thisMonth">Tháng này</option>
                                        <option value="month_1">Tháng 1</option>
                                        <option value="month_2">Tháng 2</option>
                                        <option value="month_3">Tháng 3</option>
                                        <option value="month_4">Tháng 4</option>
                                        <option value="month_5">Tháng 5</option>
                                        <option value="month_6">Tháng 6</option>
                                        <option value="month_7">Tháng 7</option>
                                        <option value="month_8">Tháng 8</option>
                                        <option value="month_9">Tháng 9</option>
                                        <option value="month_10">Tháng 10</option>
                                        <option value="month_11">Tháng 11</option>
                                        <option value="month_12">Tháng 12</option>
                                    </optgroup>
                                    <optgroup label="Quý">
                                        <option value="quarter_1">Quý 1</option>
                                        <option value="quarter_2">Quý 2</option>
                                        <option value="quarter_3">Quý 3</option>
                                        <option value="quarter_4">Quý 4</option>
                                    </optgroup>
                                </select>
                            </label>

                            <div className="date-filter" style={{ fontSize: '12px' }}>
                                <span>Từ:</span>
                                <input
                                    type="date"
                                    value={reportFilters.startDate}
                                    onChange={(e) => setReportFilters(p => ({ ...p, startDate: e.target.value }))}
                                    style={{ fontSize: '12px', padding: '6px 8px', width: '130px' }}
                                />
                                <span>Đến:</span>
                                <input
                                    type="date"
                                    value={reportFilters.endDate}
                                    onChange={(e) => setReportFilters(p => ({ ...p, endDate: e.target.value }))}
                                    style={{ fontSize: '12px', padding: '6px 8px', width: '130px' }}
                                />
                            </div>

                            {/* Chỉ hiển thị dropdown "NV Vận đơn" nếu là Admin */}
                            {isAdmin && (
                                <div className="bcvd-multi-select-container" style={{ position: 'relative', zIndex: 100 }}>
                                    <button 
                                        ref={staffButtonRef}
                                        className="bcvd-btn" 
                                        onClick={() => setShowStaffDropdown(!showStaffDropdown)}
                                        style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
                                    >
                                        {reportFilters.staff.length > 0 ? `${reportFilters.staff.length} NV` : 'NV Vận đơn'}
                                    </button>
                                {showStaffDropdown && createPortal(
                                    <div 
                                        ref={staffDropdownRef}
                                        className="fixed bg-white border border-gray-300 rounded shadow-lg max-h-72 overflow-y-auto"
                                        style={{ 
                                            zIndex: 10000,
                                            top: `${staffDropdownPosition.top}px`,
                                            left: `${staffDropdownPosition.left}px`,
                                            width: `${staffDropdownPosition.width || 200}px`,
                                            minWidth: '200px'
                                        }}
                                    >
                                        <div
                                            className="px-3 py-2 cursor-pointer hover:bg-gray-100 flex items-center border-b border-gray-100 text-sm"
                                            onClick={() => {
                                                if (reportFilters.staff.length === uniqueStaff.length) setReportFilters(p => ({ ...p, staff: [] }));
                                                else setReportFilters(p => ({ ...p, staff: uniqueStaff }));
                                            }}
                                        >
                                            <input 
                                                type="checkbox" 
                                                checked={reportFilters.staff.length === uniqueStaff.length && uniqueStaff.length > 0} 
                                                readOnly 
                                                className="mr-2 h-4 w-4"
                                            />
                                            <span className="font-bold">Chọn tất cả</span>
                                        </div>
                                        {uniqueStaff.map(s => (
                                            <div
                                                key={s}
                                                className="px-3 py-2 cursor-pointer hover:bg-gray-100 flex items-center border-b border-gray-50 last:border-0 text-sm"
                                                onClick={(e) => { e.stopPropagation(); }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={reportFilters.staff.includes(s)}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setReportFilters(p => ({
                                                            ...p,
                                                            staff: checked ? [...p.staff, s] : p.staff.filter(x => x !== s)
                                                        }));
                                                    }}
                                                    className="mr-2 h-4 w-4"
                                                />
                                                <span className="text-gray-700">{s}</span>
                                            </div>
                                        ))}
                                    </div>,
                                    document.body
                                )}
                                </div>
                            )}

                            <div style={{ minWidth: '140px' }}>
                                <MultiSelect
                                    label="Mặt hàng"
                                    options={uniqueProducts || []}
                                    selected={reportFilters.product || []}
                                    onChange={(selected) => setReportFilters(p => ({ ...p, product: selected }))}
                                    placeholder="Mặt hàng"
                                    mainFilter={true}
                                />
                            </div>

                            <div style={{ minWidth: '140px' }}>
                                <MultiSelect
                                    label="Khu vực"
                                    options={uniqueMarkets || []}
                                    selected={reportFilters.market || []}
                                    onChange={(selected) => setReportFilters(p => ({ ...p, market: selected }))}
                                    placeholder="Khu vực"
                                    mainFilter={true}
                                />
                            </div>

                            <div style={{ minWidth: '140px' }}>
                                <MultiSelect
                                    label="Chi nhánh"
                                    options={uniqueTeams || []}
                                    selected={reportFilters.team || []}
                                    onChange={(selected) => setReportFilters(p => ({ ...p, team: selected }))}
                                    placeholder="Chi nhánh"
                                    mainFilter={true}
                                />
                            </div>

                            <button 
                                className="bcvd-btn" 
                                onClick={() => {
                                    if (reportFilters.startDate && reportFilters.endDate) {
                                        fetchData();
                                    } else {
                                        alert('Vui lòng chọn khoảng thời gian');
                                    }
                                }}
                                disabled={loading || !reportFilters.startDate || !reportFilters.endDate}
                                style={{ 
                                    backgroundColor: loading ? '#ccc' : '#20744a', 
                                    color: 'white',
                                    cursor: loading || !reportFilters.startDate || !reportFilters.endDate ? 'not-allowed' : 'pointer',
                                    fontSize: '12px',
                                    padding: '6px 12px',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {loading ? 'Đang tải...' : '🔍 Tìm'}
                            </button>
                            <button 
                                className="bcvd-btn bcvd-clear-filter-btn" 
                                onClick={() => {
                                    // Xóa tất cả filters
                                    setReportFilters({
                                        dateRange: '', startDate: '', endDate: '', product: [], market: [], staff: [], team: []
                                    });
                                    // Xóa filters khỏi URL
                                    const params = new URLSearchParams(searchParams);
                                    params.delete('from_date');
                                    params.delete('to_date');
                                    setSearchParams(params, { replace: true });
                                    console.log('🗑️ Đã xóa tất cả filters và cập nhật URL');
                                }}
                                style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
                            >
                                Xóa lọc
                            </button>
                        </div>
                    </div>

                    {/* REFUND / RETURN SECTION */}
                    <div className="bcvd-refund-section">
                        <div className="bcvd-refund-info">
                            Báo cáo Đơn Hoàn / Huỷ: <span style={{ color: '#e74c3c', marginLeft: '8px' }}>
                                {reportStats.grandTotal["Hoàn"].count + reportStats.grandTotal["Hủy"].count} đơn
                            </span>
                            <span className="text-sm text-gray-500 ml-2 font-normal">
                                (Hoàn: {reportStats.grandTotal["Hoàn"].count} | Hủy: {reportStats.grandTotal["Hủy"].count})
                            </span>
                        </div>
                        <button
                            className="bcvd-refund-btn"
                            onClick={() => setActiveTab('DonHoan')}
                        >
                            Xem chi tiết
                        </button>
                    </div>

                    {/* CHART TOGGLE BUTTON */}
                    <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            className="bcvd-btn"
                            onClick={() => setShowCharts(!showCharts)}
                            style={{
                                backgroundColor: showCharts ? '#f39c12' : '#27ae60',
                                fontSize: '14px',
                                padding: '10px 20px'
                            }}
                        >
                            {showCharts ? '📊 Ẩn Biểu Đồ' : '📊 Hiện Biểu Đồ'}
                        </button>
                    </div>

                    {/* CHARTS */}
                    {showCharts && (
                    <div className="bcvd-charts-container">
                        <div className="bcvd-chart-wrapper">
                            <h3>Phân tích Trạng thái Giao hàng</h3>
                            <div className="bcvd-chart-content">
                                <Doughnut data={chartsData.statusChart} options={{ responsive: true, maintainAspectRatio: false }} />
                            </div>
                        </div>
                        <div className="bcvd-chart-wrapper">
                            <h3>Phân tích Kênh Vận hành</h3>
                            <div className="bcvd-chart-content">
                                <Bar
                                    data={chartsData.funnelChart}
                                    options={{
                                        indexAxis: 'y',
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: { legend: { display: false } }
                                    }}
                                />
                            </div>
                        </div>
                        <div className="bcvd-chart-wrapper">
                            <h3>Hiệu suất theo NV Vận đơn (Top 10)</h3>
                            <div className="bcvd-chart-content">
                                <Bar
                                    data={chartsData.staffChart}
                                    options={{ responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }}
                                />
                            </div>
                        </div>
                        <div className="bcvd-chart-wrapper">
                            <h3>Hiệu suất theo Đơn vị Vận chuyển</h3>
                            <div className="bcvd-chart-content">
                                <Bar
                                    data={chartsData.carrierChart}
                                    options={{ responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }}
                                />
                            </div>
                        </div>
                    </div>
                    )}

                    <div className="bcvd-table-wrapper">
                        <h3 style={{ textAlign: 'center', color: '#2c3e50', marginBottom: '10px' }}>Báo cáo chi tiết</h3>
                        <table className="bcvd-summary-table">
                            <thead>
                                <tr>
                                    <th rowSpan={2}>NV Vận đơn</th>
                                    <th rowSpan={2}>Đơn vị vận chuyển</th>
                                    <th colSpan={2}>Đã Thanh Toán (có bill)</th>
                                    <th rowSpan={2}>Bill 1 phần</th>
                                    <th rowSpan={2}>Tổng đơn lên nội bộ</th>
                                    <th rowSpan={2}>Tổng đơn đủ đkien đẩy vh</th>
                                    <th rowSpan={2}>Tổng đơn lên vận hành</th>
                                    <th rowSpan={2}>Tỷ lệ đơn lên vận hành</th>
                                    <th rowSpan={2}>Giao Thành Công</th>
                                    <th rowSpan={2}>Đang Giao</th>
                                    <th rowSpan={2}>Chưa Giao</th>
                                    <th rowSpan={2}>Hoàn</th>
                                    <th rowSpan={2}>Hủy</th>
                                    <th rowSpan={2}>chờ check</th>
                                    <th rowSpan={2}>Trống trạng thái</th>
                                    <th rowSpan={2}>Tỷ lệ thu tiền/giao thành công</th>
                                    <th rowSpan={2}>Tỷ lệ đơn tính phí vc</th>
                                </tr>
                                <tr>
                                    <th>Số đơn</th>
                                    <th>Thành Tiền</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Grand Total */}
                                {renderSummaryRow("TỔNG TOÀN BỘ", "Tất cả NV & DVVC", reportStats.grandTotal, true)}

                                {/* Staff Rows - Mỗi nhân viên chỉ 1 dòng */}
                                {Object.keys(reportStats.staffStats).sort().map(staffName => {
                                    const sData = reportStats.staffStats[staffName];
                                    const totalOps = sData._total["Tổng đơn lên nội bộ"].count;
                                    const totalShipped = sData._total["Tổng đơn lên vận hành"].count;
                                    const success = sData._total["Giao Thành Công"].count;
                                    const shipRate = totalOps > 0 ? (totalShipped / totalOps * 100) : 0;
                                    const payRate = success > 0 ? (sData._total["Đã Thanh Toán (có bill)"].count / success * 100) : 0;
                                    const feeRate = totalShipped > 0 ? (success / totalShipped * 100) : 0;
                                    
                                    return (
                                        <tr key={staffName} className="bcvd-summary-staff-total">
                                            <td>{staffName}</td>
                                            <td>Tổng cộng</td>
                                            <td>{sData._total["Đã Thanh Toán (có bill)"].count}</td>
                                            <td>{formatCurrency(sData._total["Đã Thanh Toán (có bill)"].amount)}</td>
                                            <td>{sData._total["Bill 1 phần"].count}</td>
                                            <td>{sData._total["Tổng đơn lên nội bộ"].count}</td>
                                            <td>{sData._total["Tổng đơn đủ đkien đẩy vh"].count}</td>
                                            <td>{sData._total["Tổng đơn lên vận hành"].count}</td>
                                            <td className={shipRate > 70 ? 'bcvd-text-positive' : 'bcvd-text-negative'}>{shipRate.toFixed(1)}%</td>
                                            <td>{success}</td>
                                            <td>{sData._total["Đang Giao"].count}</td>
                                            <td>{sData._total["Chưa Giao"].count}</td>
                                            <td>{sData._total["Hoàn"].count}</td>
                                            <td>{sData._total["Hủy"].count}</td>
                                            <td>{sData._total["chờ check"].count}</td>
                                            <td>{sData._total["Trống trạng thái"].count}</td>
                                            <td className={payRate > 80 ? 'bcvd-text-positive' : 'bcvd-text-negative'}>{payRate.toFixed(1)}%</td>
                                            <td className={feeRate > 80 ? 'bcvd-text-positive' : 'bcvd-text-negative'}>{feeRate.toFixed(1)}%</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )
            }

            {/* TAB 2: CHI TIẾT */}
            {
                activeTab === 'DonChiTiet' && (
                    <div className="bcvd-tab-content">
                        <h2 className="bcvd-h2">CHI TIẾT VẬN ĐƠN</h2>

                        <div className="bcvd-controls">
                            <div className="left-controls">
                                <select value={detailFilters.checkResult} onChange={(e) => setDetailFilters(p => ({ ...p, checkResult: e.target.value }))}>
                                    <option value="">Tất cả Kết quả check</option>
                                    {uniqueCheckResults.map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                                <select value={detailFilters.deliveryStatus} onChange={(e) => setDetailFilters(p => ({ ...p, deliveryStatus: e.target.value }))}>
                                    <option value="">Tất cả Trạng thái giao hàng</option>
                                    {uniqueDeliveryStatuses.map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                                <select value={detailFilters.paymentStatus} onChange={(e) => setDetailFilters(p => ({ ...p, paymentStatus: e.target.value }))}>
                                    <option value="">Tất cả Trạng thái thu tiền</option>
                                    {uniquePaymentStatuses.map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                                <select value={detailFilters.staff} onChange={(e) => setDetailFilters(p => ({ ...p, staff: e.target.value }))}>
                                    <option value="">Tất cả NV Vận đơn</option>
                                    {uniqueStaff.map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                            </div>
                            <div className="right-controls">
                                <div className="date-filter">
                                    <span>Từ:</span>
                                    <input type="date" value={reportFilters.startDate} onChange={(e) => setReportFilters(p => ({ ...p, startDate: e.target.value }))} />
                                    <span>Đến:</span>
                                    <input type="date" value={reportFilters.endDate} onChange={(e) => setReportFilters(p => ({ ...p, endDate: e.target.value }))} />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Tìm theo Tên, SĐT, Mã đơn..."
                                    value={detailFilters.search}
                                    onChange={(e) => setDetailFilters(p => ({ ...p, search: e.target.value }))}
                                />
                                <button className="bcvd-btn bcvd-clear-filter-btn" onClick={() => setDetailFilters({
                                    checkResult: '', deliveryStatus: '', paymentStatus: '', staff: '', search: ''
                                })}>Xóa lọc</button>
                            </div>
                        </div>

                        <div className="bcvd-summary-bar">
                            <div className="bcvd-summary-item">
                                <div className="label">Tổng số đơn</div>
                                <div className="value">{filteredDetailData.length}</div>
                            </div>
                            <div className="bcvd-summary-item">
                                <div className="label">Tổng thành tiền</div>
                                <div className="value">{formatCurrency(detailTotalAmount)}</div>
                            </div>
                        </div>

                        {/* Hiển thị tất cả các đơn trong bộ lọc */}
                        <div className="bcvd-table-wrapper">
                            <table className="bcvd-data-table">
                                <thead>
                                    <tr>
                                        <th>Mã đơn</th>
                                        <th>Ngày lên đơn</th>
                                        <th>Mặt hàng</th>
                                        <th>Tổng tiền VNĐ</th>
                                        <th>NV Vận đơn</th>
                                        <th>Đơn vị vận chuyển</th>
                                        <th>Chi nhánh</th>
                                        <th>Trạng thái giao hàng NB</th>
                                        <th>Trạng thái thu tiền</th>
                                        <th>Kết quả check</th>
                                        <th>Mã Tracking</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredDetailData.length === 0 ? (
                                        <tr>
                                            <td colSpan="11" style={{ textAlign: 'center', padding: '20px' }}>
                                                Không có dữ liệu phù hợp với bộ lọc
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredDetailData.map((row, idx) => (
                                            <tr key={idx}>
                                                <td>{row["Mã đơn hàng"] || "-"}</td>
                                                <td>{row["Ngày lên đơn"] || row["Thời gian lên đơn"] || "-"}</td>
                                                <td>{row["Mặt hàng"] || "-"}</td>
                                                <td>{formatCurrency(row["Tổng tiền VNĐ"] || row["Tổng_tiền_VNĐ"] || 0)}</td>
                                                <td>{row["NV Vận đơn"] || row["NV_Vận_đơn"] || "-"}</td>
                                                <td>{row["Đơn vị vận chuyển"] || row["Đơn_vị_vận_chuyển"] || "-"}</td>
                                                <td>{row["Chi nhánh"] || row["Team"] || "-"}</td>
                                                <td>{row["Trạng thái giao hàng NB"] || "-"}</td>
                                                <td>{row["Trạng thái thu tiền"] || "-"}</td>
                                                <td>{row["Kết quả check"] || "-"}</td>
                                                <td>{row["Mã Tracking"] || "-"}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            }

            {/* TAB 3: DANH SÁCH HOÀN / HUỶ */}
            {
                activeTab === 'DonHoan' && (
                    <div className="bcvd-tab-content">
                        <h2 className="bcvd-h2">DANH SÁCH ĐƠN HOÀN / HUỶ</h2>

                        <div className="bcvd-controls">
                            <div className="right-controls" style={{ marginLeft: 'auto' }}>
                                <div className="date-filter">
                                    <span>Từ:</span>
                                    <input type="date" value={reportFilters.startDate} onChange={(e) => setReportFilters(p => ({ ...p, startDate: e.target.value }))} />
                                    <span>Đến:</span>
                                    <input type="date" value={reportFilters.endDate} onChange={(e) => setReportFilters(p => ({ ...p, endDate: e.target.value }))} />
                                </div>
                            </div>
                        </div>

                        <div className="bcvd-summary-bar">
                            <div className="bcvd-summary-item" style={{ borderColor: '#e74c3c' }}>
                                <div className="label" style={{ color: '#c0392b' }}>Tổng đơn Hoàn/Hủy</div>
                                <div className="value" style={{ color: '#e74c3c' }}>
                                    {refundData.length}
                                </div>
                            </div>
                        </div>

                        <div className="bcvd-table-wrapper">
                            <table className="bcvd-data-table">
                                <thead>
                                    <tr>
                                        <th>Mã đơn</th>
                                        <th>Ngày lên đơn</th>
                                        <th>Mặt hàng</th>
                                        <th>Tổng tiền VNĐ</th>
                                        <th>NV Vận đơn</th>
                                        <th>Đơn vị vận chuyển</th>
                                        <th>Trạng thái giao hàng NB</th>
                                        <th>Lý do / Ghi chú</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {refundData.map((row, idx) => {
                                        const status = (row["Trạng thái giao hàng NB"] || "").toLowerCase();
                                        const isCancel = status.includes("huỷ") || status.includes("hủy") || status.includes("cancel");
                                        const statusColor = isCancel ? '#8e44ad' : '#e74c3c';

                                        // Define columns for refund table, filter out hidden columns
                                        const refundColumns = [
                                            { key: "Mã đơn hàng", label: "Mã đơn" },
                                            { key: "Ngày lên đơn", label: "Ngày lên đơn" },
                                            { key: "Mặt hàng", label: "Mặt hàng" },
                                            { key: "Tổng tiền VNĐ", label: "Tổng tiền VNĐ" },
                                            { key: "NV Vận đơn", label: "NV Vận đơn" },
                                            { key: "Đơn vị vận chuyển", label: "Đơn vị vận chuyển" },
                                            { key: "Trạng thái giao hàng NB", label: "Trạng thái giao hàng NB" },
                                            { key: "Lý do", label: "Lý do / Ghi chú" }
                                        ].filter(col => !HIDDEN_COLUMNS.includes(col.label));

                                        return (
                                            <tr key={idx}>
                                                {refundColumns.map(col => (
                                                    <td key={col.key} style={col.key === "Trạng thái giao hàng NB" ? { color: statusColor, fontWeight: 'bold' } : {}}>
                                                        {col.key === "Tổng tiền VNĐ"
                                                            ? formatCurrency(row[col.key])
                                                            : col.key === "Lý do"
                                                                ? (row["Lý do"] || row["Ghi chú"] || "-")
                                                                : row[col.key] || (col.key === "Ngày lên đơn" ? row["Thời gian lên đơn"] : "-")}
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    })}
                                    {refundData.length === 0 && (
                                        <tr>
                                            <td colSpan={10} className="bcvd-no-data">Không có đơn hoàn/huỷ trong khoảng thời gian này.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
