import { useEffect, useMemo, useState } from 'react';
import usePermissions from '../hooks/usePermissions';
import { supabase } from '../supabase/config';
import './BaoCaoSale.css'; // Reuse CSS

// Helpers
const formatCurrency = (value) => Number(value || 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
const formatNumber = (value) => Number(value || 0).toLocaleString('vi-VN');
const formatPercent = (value) => {
    if (value === null || value === undefined || !Number.isFinite(+value)) return '0.00%';
    return `${(Number(value || 0) * 100).toFixed(2)}% `;
};
const formatDate = (dateValue) => {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return dateValue;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

export default function XemBaoCaoCSKH() {
    // Permission Logic
    const { canView } = usePermissions();


    // --- State ---
    const [loading, setLoading] = useState(true);
    const [rawData, setRawData] = useState([]);
    const [permissions, setPermissions] = useState({
        title: 'BÁO CÁO HIỆU SUẤT CSKH'
    });

    // Filters State
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        teams: [],
        markets: []
    });

    // Options for filters (derived from data)
    const [options, setOptions] = useState({
        teams: [],
        markets: []
    });

    // Active Tab
    const [activeTab, setActiveTab] = useState('tong-hop');

    // --- Effects ---

    // 1. Initialize Dates
    useEffect(() => {
        const today = new Date();
        const d = new Date();
        d.setDate(d.getDate() - 30); // Default last 30 days for better overview
        const formatDateForInput = (date) => date.toISOString().split('T')[0];

        setFilters(prev => ({
            ...prev,
            startDate: formatDateForInput(d),
            endDate: formatDateForInput(today)
        }));
    }, []);

    // 2. Fetch Data from Supabase Orders
    useEffect(() => {
        const fetchData = async () => {
            if (!filters.startDate || !filters.endDate) return;

            setLoading(true);

            try {
                // Fetch orders directly from Supabase
                const { data, error } = await supabase
                    .from('orders')
                    .select('*')
                    .gte('order_date', filters.startDate)
                    .lte('order_date', filters.endDate);

                if (error) throw error;

                processFetchedData(data);
            } catch (err) {
                console.error("Error fetching CSKH report data:", err);
                setLoading(false);
            }
        };

        const processFetchedData = (orders) => {
            // Aggregate orders by CSKH staff
            const aggregated = {};

            orders.forEach(order => {
                // Determine CSKH Name. 
                // Prioritize 'cskh' column. If empty, check if we can infer or fallback.
                let staffName = (order.cskh || order.Cskh || order.CSKH || '').trim();

                // If staffName is empty, we might skip or categorize as "Chưa phân bổ"
                if (!staffName) staffName = 'Chưa phân bổ';

                if (!aggregated[staffName]) {
                    aggregated[staffName] = {
                        ten: staffName,
                        team: (order.team || 'Chưa phân nhóm').trim(),
                        chiNhanh: (order.country || 'N/A').trim(), // Map country/area to Chi Nhanh roughly

                        // Metrics
                        soDon: 0,
                        doanhSo: 0,
                        soDonHuy: 0,
                        doanhSoHuy: 0,
                        soDonThanhCong: 0,
                        doanhSoThanhCong: 0,
                        rawOrders: [] // Keep raw for drilling down if needed
                    };
                }

                const entry = aggregated[staffName];
                const amount = parseFloat(order.total_amount_vnd) || 0;
                const status = (order.delivery_status || '').toLowerCase();

                entry.soDon++;
                entry.doanhSo += amount;
                entry.rawOrders.push(order);

                // Calcluate Cancelled/Refunded
                if (status.includes('hủy') || status.includes('hoàn') || status.includes('huỷ')) {
                    entry.soDonHuy++;
                    entry.doanhSoHuy += amount;
                }

                // Calculate Successful
                if (status.includes('thành công') || status.includes('đã giao') || status.includes('đối soát')) {
                    entry.soDonThanhCong++;
                    entry.doanhSoThanhCong += amount;
                }
            });

            const processedList = Object.values(aggregated);
            setRawData(processedList);

            // Populate Options
            const unique = (key) => [...new Set(processedList.map(d => d[key]).filter(Boolean))].sort();
            setOptions({
                markets: unique('chiNhanh'), // Using Country/Area as Market
                teams: unique('team')
            });

            // Initial Select All
            setFilters(prev => ({
                ...prev,
                markets: unique('chiNhanh'),
                teams: unique('team')
            }));

            setLoading(false);
        };

        fetchData();
    }, [filters.startDate, filters.endDate]);

    // --- Filtering Logic ---
    const filteredData = useMemo(() => {
        if (loading) return [];
        return rawData.filter(r => {
            if (!filters.teams.includes(r.team)) return false;
            // Market/Branch filter might vary
            if (options.markets.length > 0 && !filters.markets.includes(r.chiNhanh)) return false;
            return true;
        });
    }, [rawData, filters, loading, options.markets]);

    // --- Handlers ---
    const handleFilterChange = (type, value, checked) => {
        setFilters(prev => {
            const list = prev[type];
            if (checked) return { ...prev, [type]: [...list, value] };
            return { ...prev, [type]: list.filter(item => item !== value) };
        });
    };

    const handleSelectAll = (type, checked) => {
        setFilters(prev => ({
            ...prev,
            [type]: checked ? options[type] : []
        }));
    };

    // --- Summarization Logic ---
    const summarizeData = (data) => {
        const total = {
            soDon: 0, doanhSo: 0,
            soDonHuy: 0, doanhSoHuy: 0,
            soDonThanhCong: 0, doanhSoThanhCong: 0
        };

        data.forEach(item => {
            total.soDon += item.soDon;
            total.doanhSo += item.doanhSo;
            total.soDonHuy += item.soDonHuy;
            total.doanhSoHuy += item.doanhSoHuy;
            total.soDonThanhCong += item.soDonThanhCong;
            total.doanhSoThanhCong += item.doanhSoThanhCong;
        });

        // Sort by Revenue Descending
        const flatList = [...data].sort((a, b) => b.doanhSo - a.doanhSo);

        return { flatList, total };
    };

    const { flatList: summaryList, total: summaryTotal } = useMemo(() => summarizeData(filteredData), [filteredData]);

    if (!canView('CSKH_VIEW')) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này (CSKH_VIEW).</div>;
    }

    return (
        <div className="bao-cao-sale-container">
            {loading && <div className="loading-overlay">Đang tải dữ liệu thực tế từ hệ thống...</div>}

            <div className="report-container">
                {/* SIDEBAR FILTERS */}
                <div className="sidebar">
                    <h3>Bộ lọc</h3>
                    <label>
                        Từ ngày:
                        <input type="date" value={filters.startDate} onChange={e => setFilters(prev => ({ ...prev, startDate: e.target.value }))} />
                    </label>
                    <label>
                        Đến ngày:
                        <input type="date" value={filters.endDate} onChange={e => setFilters(prev => ({ ...prev, endDate: e.target.value }))} />
                    </label>

                    {/* Team Filter */}
                    <h3>Team</h3>
                    <label>
                        <input type="checkbox"
                            checked={filters.teams.length === options.teams.length}
                            onChange={(e) => handleSelectAll('teams', e.target.checked)}
                        /> Tất cả
                    </label>
                    <div className="indent">
                        {options.teams.map(opt => (
                            <label key={opt}>
                                <input type="checkbox" checked={filters.teams.includes(opt)} onChange={(e) => handleFilterChange('teams', opt, e.target.checked)} />
                                {opt}
                            </label>
                        ))}
                    </div>

                    {/* Market/Branch Filter */}
                    <h3>Khu vực</h3>
                    <label>
                        <input type="checkbox"
                            checked={filters.markets.length === options.markets.length}
                            onChange={(e) => handleSelectAll('markets', e.target.checked)}
                        /> Tất cả
                    </label>
                    <div className="indent">
                        {options.markets.map(opt => (
                            <label key={opt}>
                                <input type="checkbox" checked={filters.markets.includes(opt)} onChange={(e) => handleFilterChange('markets', opt, e.target.checked)} />
                                {opt}
                            </label>
                        ))}
                    </div>
                </div>

                {/* MAIN CONTENT */}
                <div className="main-detailed">
                    <div className="header">
                        <img src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Ff930e667.%E1%BA%A2nh.025539.jpg" alt="Logo" />
                        <h2>{permissions.title}</h2>
                    </div>

                    <div className="tabs-container">
                        <button className={`tab-button ${activeTab === 'tong-hop' ? 'active' : ''}`} onClick={() => setActiveTab('tong-hop')}>Tổng hợp hiệu suất</button>
                    </div>

                    {/* Tab Content */}
                    <div className={`tab-content active`}>
                        <div className="table-responsive-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>STT</th>
                                        <th>Team</th>
                                        <th>Nhân sự CSKH</th>
                                        <th>Tổng số đơn</th>
                                        <th>Tổng Doanh số</th>
                                        <th>Đơn Hoàn/Hủy</th>
                                        <th>DS Hoàn/Hủy</th>
                                        <th>Đơn Thành công</th>
                                        <th>DS Thành công</th>
                                        <th>Tỉ lệ Hoàn/Hủy</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Total Row */}
                                    <tr className="total-row">
                                        <td className="total-label" colSpan={3}>TỔNG CỘNG</td>
                                        <td className="total-value">{formatNumber(summaryTotal.soDon)}</td>
                                        <td className="total-value">{formatCurrency(summaryTotal.doanhSo)}</td>
                                        <td className="total-value text-red-600">{formatNumber(summaryTotal.soDonHuy)}</td>
                                        <td className="total-value text-red-600">{formatCurrency(summaryTotal.doanhSoHuy)}</td>
                                        <td className="total-value text-green-600">{formatNumber(summaryTotal.soDonThanhCong)}</td>
                                        <td className="total-value text-green-600">{formatCurrency(summaryTotal.doanhSoThanhCong)}</td>
                                        <td className="total-value text-red-600">
                                            {formatPercent(summaryTotal.soDon ? summaryTotal.soDonHuy / summaryTotal.soDon : 0)}
                                        </td>
                                    </tr>

                                    {/* Rows */}
                                    {summaryList.map((item, index) => {
                                        const cancelRate = item.soDon ? item.soDonHuy / item.soDon : 0;
                                        return (
                                            <tr key={index}>
                                                <td className="text-center">{index + 1}</td>
                                                <td className="text-left">{item.team}</td>
                                                <td className="text-left font-semibold">{item.ten}</td>
                                                <td>{formatNumber(item.soDon)}</td>
                                                <td className="font-medium text-blue-700">{formatCurrency(item.doanhSo)}</td>
                                                <td className="text-red-500">{formatNumber(item.soDonHuy)}</td>
                                                <td className="text-red-500">{formatCurrency(item.doanhSoHuy)}</td>
                                                <td className="text-green-600">{formatNumber(item.soDonThanhCong)}</td>
                                                <td className="text-green-600">{formatCurrency(item.doanhSoThanhCong)}</td>
                                                <td className={cancelRate > 0.1 ? 'bg-red-100 font-bold text-red-700' : ''}>{formatPercent(cancelRate)}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>
        </div >
    );
}
