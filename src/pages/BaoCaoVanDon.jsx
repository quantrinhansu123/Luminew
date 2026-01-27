
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Title, Tooltip } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import React, { useEffect, useMemo, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';

import { Download, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { fetchVanDon } from '../services/api';
import { supabase } from '../supabase/config';
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

// Mapping Helper to ensure fields match HTML logic
const mapOrderToReportFormat = (order) => {
    return {
        ...order,
        "Ngày lên đơn": order["Ngày lên đơn"] || order["Thời gian lên đơn"],
        "Tổng tiền VNĐ": order["Tổng tiền VNĐ"] || order["Tổng_tiền_VNĐ"],
        "NV Vận đơn": order["NV Vận đơn"] || order["NV_Vận_đơn"],
        "Đơn vị vận chuyển": order["Đơn vị vận chuyển"] || order["Đơn_vị_vận_chuyển"],
        // Map DB status to Report status expectation if needed, otherwise keep as is
        "Trạng thái giao hàng NB": order["Trạng thái giao hàng"] || order["Trạng thái giao hàng NB"],
        "khu vực": order["Khu vực"] || order["khu vực"]
    };
};

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


export default function BaoCaoVanDon() {
    console.log("BaoCaoVanDon rendering..."); // Debug log

    // --- STATE ---
    const [activeTab, setActiveTab] = useState('VanDonReport');
    const [loading, setLoading] = useState(false);
    const [rawData, setRawData] = useState([]);
    const [error, setError] = useState(null);

    // --- REPORT FILTERS ---
    const [reportFilters, setReportFilters] = useState({
        dateRange: 'last3Days', // Default to last 3 days for speed
        startDate: '',
        endDate: '',
        product: '',
        market: '',
        staff: [] // Array of selected staff names
    });
    const [showStaffDropdown, setShowStaffDropdown] = useState(false);


    // --- DETAILED FILTERS ---
    const [detailFilters, setDetailFilters] = useState({
        checkResult: '',
        deliveryStatus: '',
        paymentStatus: '',
        search: ''
    });

    // --- DERIVED LISTS ---
    const uniqueProducts = useMemo(() => [...new Set(rawData.map(r => r["Mặt hàng"]).filter(Boolean))].sort(), [rawData]);
    const uniqueMarkets = useMemo(() => [...new Set(rawData.map(r => r["khu vực"] || r["Khu vực"]).filter(Boolean))].sort(), [rawData]);
    const uniqueStaff = useMemo(() => [...new Set(rawData.map(r => r["NV Vận đơn"] || r["NV_Vận_đơn"]).filter(Boolean))].sort(), [rawData]);

    const uniqueCheckResults = useMemo(() => [...new Set(rawData.map(r => r["Kết quả check"]).filter(Boolean))].sort(), [rawData]);
    const uniqueDeliveryStatuses = useMemo(() => [...new Set(rawData.map(r => r["Trạng thái giao hàng NB"]).filter(Boolean))].sort(), [rawData]);
    const uniquePaymentStatuses = useMemo(() => [...new Set(rawData.map(r => r["Trạng thái thu tiền"]).filter(Boolean))].sort(), [rawData]);

    // --- FETCH DATA ---
    useEffect(() => {
        // Only fetch if dates are set (or if we want to allow initial fetch)
        // Since we default to last3Days, dates should be set quickly by the other useEffect
        if (reportFilters.startDate && reportFilters.endDate) {
            fetchData();
        }
    }, [reportFilters.startDate, reportFilters.endDate]); // Refetch when dates change

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            // Use fetchVanDon for server-side filtering logic
            console.log(`Fetching report data for: ${reportFilters.startDate} to ${reportFilters.endDate}`);

            const response = await fetchVanDon({
                page: 1,
                limit: 3000, // Large limit for report
                dateFrom: reportFilters.startDate,
                dateTo: reportFilters.endDate
            });

            let data = [];
            if (response && response.data && Array.isArray(response.data)) {
                data = response.data;
            } else if (Array.isArray(response)) {
                data = response;
            } else {
                throw new Error('Dữ liệu không đúng định dạng');
            }

            // Map data to ensure compatibility with Report logic
            const mappedData = data.map(mapOrderToReportFormat);
            setRawData(mappedData);
        } catch (err) {
            console.error("Fetch error:", err);
            setError(err.message);
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
            setReportFilters(prev => {
                const newStart = formatDateForInput(start);
                const newEnd = formatDateForInput(end);
                // Only update if changed to avoid loop
                if (prev.startDate !== newStart || prev.endDate !== newEnd) {
                    return { ...prev, startDate: newStart, endDate: newEnd };
                }
                return prev;
            });
        }
    }, [reportFilters.dateRange]);


    // --- FILTER LOGIC: REPORT TAB ---
    const filteredReportData = useMemo(() => {
        return rawData.filter(row => {
            // Date Filter
            if (reportFilters.startDate || reportFilters.endDate) {
                const rowDate = parseDateString(row["Ngày lên đơn"] || row["Thời gian lên đơn"]);
                if (!rowDate) return false;
                const start = reportFilters.startDate ? new Date(reportFilters.startDate) : null;
                const end = reportFilters.endDate ? new Date(reportFilters.endDate) : null;
                if (start) start.setHours(0, 0, 0, 0);
                if (end) end.setHours(23, 59, 59, 999);

                if (start && rowDate < start) return false;
                if (end && rowDate > end) return false;
            }

            // Product Filter
            if (reportFilters.product && row["Mặt hàng"] !== reportFilters.product) return false;

            // Market Filter
            if (reportFilters.market && (row["khu vực"] || row["Khu vực"]) !== reportFilters.market) return false;

            // Staff Filter
            if (reportFilters.staff.length > 0) {
                const rowStaff = row["NV Vận đơn"] || row["NV_Vận_đơn"];
                if (!reportFilters.staff.includes(rowStaff)) return false;
            }

            return true;
        });
    }, [rawData, reportFilters]);

    // --- STATISTICS CALCULATION ---
    const reportStats = useMemo(() => {
        const staffStats = {};
        const grandTotal = createEmptyStats();

        filteredReportData.forEach(row => {
            const staffName = row["NV Vận đơn"] || row["NV_Vận_đơn"] || "Chưa có NV";
            const company = row["Đơn vị vận chuyển"] || row["Đơn_vị_vận_chuyển"] || "Không xác định";

            if (!staffStats[staffName]) staffStats[staffName] = { _total: createEmptyStats(), byCompany: {} };
            if (!staffStats[staffName].byCompany[company]) staffStats[staffName].byCompany[company] = createEmptyStats();

            const targets = [staffStats[staffName].byCompany[company], staffStats[staffName]._total, grandTotal];

            const amount = parseFloat(String(row["Tổng tiền VNĐ"] || row["Tổng_tiền_VNĐ"] || 0).replace(/[^\d.-]/g, '')) || 0;
            const pStatus = row["Trạng thái thu tiền"] || "";
            const dStatus = row["Trạng thái giao hàng NB"] || "";

            targets.forEach(t => {
                if (pStatus.includes("Có bill")) {
                    t["Đã Thanh Toán (có bill)"].count++;
                    t["Đã Thanh Toán (có bill)"].amount += amount;
                } else if (pStatus.includes("Có bill 1 phần")) {
                    t["Bill 1 phần"].count++;
                }

                if (dStatus.includes("Giao Thành Công")) t["Giao Thành Công"].count++;
                else if (dStatus.includes("Đang Giao")) t["Đang Giao"].count++;
                else if (dStatus.includes("Chưa Giao")) t["Chưa Giao"].count++;
                else if (dStatus.toLowerCase().includes("huỷ") || dStatus.toLowerCase().includes("hủy") || dStatus.toLowerCase().includes("cancel")) t["Hủy"].count++;
                else if (dStatus.includes("Hoàn")) t["Hoàn"].count++;
                else if (dStatus.includes("chờ check")) t["chờ check"].count++;
                else if (!dStatus) t["Trống trạng thái"].count++;

                t["Tổng đơn lên nội bộ"].count++;
                if (pStatus.includes("Có bill") || pStatus.includes("Có bill 1 phần")) t["Tổng đơn đủ đkien đẩy vh"].count++;
                if (dStatus && !dStatus.includes("Chưa Giao") && !dStatus.includes("chờ check") && !dStatus.toLowerCase().includes("huỷ") && !dStatus.toLowerCase().includes("hủy") && !dStatus.toLowerCase().includes("cancel")) t["Tổng đơn lên vận hành"].count++;
            });
        });

        return { staffStats, grandTotal };
    }, [filteredReportData]);

    // --- CHART DATA PREP ---
    const chartsData = useMemo(() => {
        // 1. Status Breakdown
        const statusCounts = { 'Giao Thành Công': 0, 'Hoàn': 0, 'Hủy': 0, 'Đang Giao': 0, 'chờ check': 0, 'Khác': 0 };
        filteredReportData.forEach(r => {
            const s = (r["Trạng thái giao hàng NB"] || "").toLowerCase();
            if (s.includes("giao thành công")) statusCounts['Giao Thành Công']++;
            else if (s.includes("hoàn")) statusCounts['Hoàn']++;
            else if (s.includes("huỷ") || s.includes("hủy") || s.includes("cancel")) statusCounts['Hủy']++;
            else if (s.includes("đang giao")) statusCounts['Đang Giao']++;
            else if (s.includes("chờ check")) statusCounts['chờ check']++;
            else if (s) statusCounts['Khác']++;
        });

        const statusChart = {
            labels: Object.keys(statusCounts),
            datasets: [{
                data: Object.values(statusCounts),
                backgroundColor: ['#2ecc71', '#e74c3c', '#8e44ad', '#3498db', '#f1c40f', '#95a5a6'],
            }]
        };

        // 2. Funnel
        const funnelStats = reportStats.grandTotal;
        const funnelChart = {
            labels: ['Tổng đơn nội bộ', 'Đơn lên vận hành', 'Giao thành công'],
            datasets: [{
                label: 'Số đơn',
                data: [funnelStats["Tổng đơn lên nội bộ"].count, funnelStats["Tổng đơn lên vận hành"].count, funnelStats["Giao Thành Công"].count],
                backgroundColor: ['#3498db', '#f39c12', '#27ae60']
            }]
        };

        // 3. Staff Performance (Top 10 by Vol)
        const staffPerf = Object.entries(reportStats.staffStats).map(([name, data]) => ({
            name,
            success: data._total["Giao Thành Công"].count,
            returned: data._total["Hoàn"].count,
            canceled: data._total["Hủy"].count
        })).sort((a, b) => (b.success + b.returned + b.canceled) - (a.success + a.returned + a.canceled)).slice(0, 10);

        const staffChart = {
            labels: staffPerf.map(s => s.name),
            datasets: [
                { label: 'Thành Công', data: staffPerf.map(s => s.success), backgroundColor: '#2ecc71' },
                { label: 'Hoàn', data: staffPerf.map(s => s.returned), backgroundColor: '#e74c3c' },
                { label: 'Hủy', data: staffPerf.map(s => s.canceled), backgroundColor: '#8e44ad' }
            ]
        };

        // 4. Carrier Performance
        const carrierStats = {};
        filteredReportData.forEach(r => {
            const c = r["Đơn vị vận chuyển"] || "Không xác định";
            if (!carrierStats[c]) carrierStats[c] = { success: 0, returned: 0, canceled: 0 };
            const s = (r["Trạng thái giao hàng NB"] || "").toLowerCase();
            if (s.includes("giao thành công")) carrierStats[c].success++;
            else if (s.includes("hoàn")) carrierStats[c].returned++;
            else if (s.includes("huỷ") || s.includes("hủy") || s.includes("cancel")) carrierStats[c].canceled++;
        });
        const carrierChart = {
            labels: Object.keys(carrierStats),
            datasets: [
                { label: 'Thành Công', data: Object.values(carrierStats).map(d => d.success), backgroundColor: '#2ecc71' },
                { label: 'Hoàn', data: Object.values(carrierStats).map(d => d.returned), backgroundColor: '#e74c3c' },
                { label: 'Hủy', data: Object.values(carrierStats).map(d => d.canceled), backgroundColor: '#8e44ad' }
            ]
        };

        return { statusChart, funnelChart, staffChart, carrierChart };
    }, [filteredReportData, reportStats]);


    // --- FILTER LOGIC: DETAIL TAB ---
    const filteredDetailData = useMemo(() => {
        return rawData.filter(row => {
            const rowDate = parseDateString(row["Ngày lên đơn"] || row["Thời gian lên đơn"]);

            // Filter logic using reportFilters (Shared Date)
            if (reportFilters.startDate || reportFilters.endDate) {
                if (!rowDate) return false;
                const start = reportFilters.startDate ? new Date(reportFilters.startDate) : null;
                const end = reportFilters.endDate ? new Date(reportFilters.endDate) : null;
                if (start) start.setHours(0, 0, 0, 0);
                if (end) end.setHours(23, 59, 59, 999);

                if (start && rowDate < start) return false;
                if (end && rowDate > end) return false;
            }

            if (detailFilters.checkResult && row["Kết quả check"] !== detailFilters.checkResult) return false;
            if (detailFilters.deliveryStatus && row["Trạng thái giao hàng NB"] !== detailFilters.deliveryStatus) return false;
            if (detailFilters.paymentStatus && row["Trạng thái thu tiền"] !== detailFilters.paymentStatus) return false;

            if (detailFilters.search) {
                const s = detailFilters.search.toLowerCase();
                const name = (row["Name*"] || "").toLowerCase();
                const phone = (row["Phone*"] || "").toString().toLowerCase();
                const code = (row["Mã đơn hàng"] || "").toLowerCase();
                if (!name.includes(s) && !phone.includes(s) && !code.includes(s)) return false;
            }

            return true;
        });
    }, [rawData, detailFilters, reportFilters]);

    // --- EXCEL HANDLERS ---
    const handleExportExcel = () => {
        // Export filteredDetailData
        const dataToExport = filteredDetailData.map(row => ({
            'Ngày lên đơn': row["Ngày lên đơn"] || row["Thời gian lên đơn"],
            'Mã đơn hàng': row["Mã đơn hàng"],
            'NV Vận đơn': row["NV Vận đơn"] || row["NV_Vận_đơn"],
            'Đơn vị vận chuyển': row["Đơn vị vận chuyển"] || row["Đơn_vị_vận_chuyển"],
            'Tên khách hàng': row["Name*"],
            'SĐT': row["Phone*"],
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
        return filteredReportData.filter(r => {
            const status = (r["Trạng thái giao hàng NB"] || "").toLowerCase();
            return status.includes("hoàn") || status.includes("huỷ") || status.includes("hủy") || status.includes("cancel");
        });
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
                    <div>Đang tải dữ liệu...</div>
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
                        <div className="left-controls">
                            <span style={{ fontWeight: 'bold', fontSize: '16px' }}>Tùy chọn Báo cáo</span>
                        </div>
                        <div className="right-controls">
                            <label>Chọn nhanh:
                                <select
                                    className="bcvd-filter-select"
                                    value={reportFilters.dateRange}
                                    onChange={(e) => setReportFilters(p => ({ ...p, dateRange: e.target.value }))}
                                >
                                    <option value="">-- Tùy chọn --</option>
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

                            <div className="date-filter">
                                <span>Từ:</span>
                                <input
                                    type="date"
                                    value={reportFilters.startDate}
                                    onChange={(e) => setReportFilters(p => ({ ...p, startDate: e.target.value }))}
                                />
                                <span>Đến:</span>
                                <input
                                    type="date"
                                    value={reportFilters.endDate}
                                    onChange={(e) => setReportFilters(p => ({ ...p, endDate: e.target.value }))}
                                />
                            </div>

                            <div className="bcvd-multi-select-container">
                                <button className="bcvd-btn" onClick={() => setShowStaffDropdown(!showStaffDropdown)}>
                                    {reportFilters.staff.length > 0 ? `${reportFilters.staff.length} NV đã chọn` : 'Tất cả NV Vận đơn'}
                                </button>
                                {showStaffDropdown && (
                                    <div className="bcvd-checkbox-dropdown show">
                                        <label onClick={() => {
                                            if (reportFilters.staff.length === uniqueStaff.length) setReportFilters(p => ({ ...p, staff: [] }));
                                            else setReportFilters(p => ({ ...p, staff: uniqueStaff }));
                                        }}>
                                            <input type="checkbox" checked={reportFilters.staff.length === uniqueStaff.length && uniqueStaff.length > 0} readOnly />
                                            <b>Chọn tất cả</b>
                                        </label>
                                        {uniqueStaff.map(s => (
                                            <label key={s} onClick={(e) => { e.stopPropagation(); }}>
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
                                                />
                                                {s}
                                            </label>
                                        ))}
                                    </div>
                                )}
                                {showStaffDropdown && (
                                    <div className="fixed inset-0 z-[100]" onClick={() => setShowStaffDropdown(false)} style={{ pointerEvents: 'none' }} />
                                )}
                            </div>

                            <select value={reportFilters.product} onChange={(e) => setReportFilters(p => ({ ...p, product: e.target.value }))}>
                                <option value="">Tất cả sản phẩm</option>
                                {uniqueProducts.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>

                            <select value={reportFilters.market} onChange={(e) => setReportFilters(p => ({ ...p, market: e.target.value }))}>
                                <option value="">Tất cả khu vực</option>
                                {uniqueMarkets.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>

                            <button className="bcvd-btn bcvd-clear-filter-btn" onClick={() => setReportFilters({
                                dateRange: '', startDate: '', endDate: '', product: '', market: '', staff: []
                            })}>Xóa lọc</button>
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

                                {/* Staff Rows */}
                                {Object.keys(reportStats.staffStats).sort().map(staffName => {
                                    const sData = reportStats.staffStats[staffName];
                                    return (
                                        <React.Fragment key={staffName}>
                                            <tr className="bcvd-summary-staff-header"><td colSpan={17}>Nhân viên: {staffName}</td></tr>
                                            {/* Companies */}
                                            {Object.keys(sData.byCompany).sort().map(comp =>
                                                renderSummaryRow(staffName, comp, sData.byCompany[comp])
                                            )}
                                            {/* Staff Total */}
                                            <tr className="bcvd-summary-staff-total">
                                                <td>{staffName}</td>
                                                <td>Tổng cộng</td>
                                                <td>{sData._total["Đã Thanh Toán (có bill)"].count}</td>
                                                <td>{formatCurrency(sData._total["Đã Thanh Toán (có bill)"].amount)}</td>
                                                <td>{sData._total["Bill 1 phần"].count}</td>
                                                <td>{sData._total["Tổng đơn lên nội bộ"].count}</td>
                                                <td>{sData._total["Tổng đơn đủ đkien đẩy vh"].count}</td>
                                                <td>{sData._total["Tổng đơn lên vận hành"].count}</td>
                                                <td>...</td>
                                                <td>{sData._total["Giao Thành Công"].count}</td>
                                                <td>...</td>
                                                <td>...</td>
                                                <td>...</td>
                                                <td>...</td>
                                                <td>...</td>
                                                <td>...</td>
                                                <td>...</td>
                                            </tr>
                                        </React.Fragment>
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
                                    checkResult: '', deliveryStatus: '', paymentStatus: '', search: ''
                                })}>Xóa lọc</button>
                                <button
                                    onClick={handleExportExcel}
                                    className="bcvd-btn"
                                    style={{ backgroundColor: '#20744a', color: 'white' }}
                                >
                                    <Download size={14} style={{ marginRight: '4px' }} /> Xuất Excel
                                </button>
                                <label
                                    className="bcvd-btn"
                                    style={{ backgroundColor: '#2b579a', color: 'white', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                                >
                                    <Upload size={14} style={{ marginRight: '4px' }} /> Nhập Excel
                                    <input type="file" accept=".xlsx, .xls" onChange={handleImportExcel} style={{ display: 'none' }} />
                                </label>
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

                        {['HCM', 'Hà Nội'].map(regionLabel => {
                            const regionData = filteredDetailData.filter(r => (r["Team"] || "").toLowerCase().includes(regionLabel.toLowerCase() === 'hcm' ? 'hcm' : 'hà nội'));
                            if (regionData.length === 0) return null;

                            return (
                                <div className="bcvd-region-container" key={regionLabel}>
                                    <h3 className="bcvd-region-header">{regionLabel === 'HCM' ? 'Hồ Chí Minh' : 'Hà Nội'}</h3>
                                    <div className="bcvd-table-wrapper">
                                        <table className="bcvd-data-table">
                                            <thead>
                                                <tr>
                                                    <th>Mã đơn</th>
                                                    <th>Ngày lên đơn</th>
                                                    <th>Tên khách hàng</th>
                                                    <th>SĐT</th>
                                                    <th>Mặt hàng</th>
                                                    <th>Tổng tiền VNĐ</th>
                                                    <th>NV Vận đơn</th>
                                                    <th>Đơn vị vận chuyển</th>
                                                    <th>Trạng thái giao hàng NB</th>
                                                    <th>Trạng thái thu tiền</th>
                                                    <th>Kết quả check</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {regionData.map((row, idx) => (
                                                    <tr key={idx}>
                                                        <td>{row["Mã đơn hàng"]}</td>
                                                        <td>{row["Ngày lên đơn"] || row["Thời gian lên đơn"]}</td>
                                                        <td>{row["Name*"]}</td>
                                                        <td>{row["Phone*"]}</td>
                                                        <td>{row["Mặt hàng"]}</td>
                                                        <td>{formatCurrency(row["Tổng tiền VNĐ"])}</td>
                                                        <td>{row["NV Vận đơn"] || row["NV_Vận_đơn"]}</td>
                                                        <td>{row["Đơn vị vận chuyển"] || row["Đơn_vị_vận_chuyển"]}</td>
                                                        <td>{row["Trạng thái giao hàng NB"]}</td>
                                                        <td>{row["Trạng thái thu tiền"]}</td>
                                                        <td>{row["Kết quả check"]}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })}
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
                                        <th>Tên khách hàng</th>
                                        <th>SĐT</th>
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

                                        return (
                                            <tr key={idx}>
                                                <td>{row["Mã đơn hàng"]}</td>
                                                <td>{row["Ngày lên đơn"] || row["Thời gian lên đơn"]}</td>
                                                <td>{row["Name*"]}</td>
                                                <td>{row["Phone*"]}</td>
                                                <td>{row["Mặt hàng"]}</td>
                                                <td>{formatCurrency(row["Tổng tiền VNĐ"])}</td>
                                                <td>{row["NV Vận đơn"] || row["NV_Vận_đơn"]}</td>
                                                <td>{row["Đơn vị vận chuyển"] || row["Đơn_vị_vận_chuyển"]}</td>
                                                <td style={{ color: statusColor, fontWeight: 'bold' }}>{row["Trạng thái giao hàng NB"]}</td>
                                                <td>{row["Lý do"] || row["Ghi chú"] || "-"}</td>
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
