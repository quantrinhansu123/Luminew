import { useEffect, useMemo, useState } from 'react';
import './BaoCaoSale.css';

const API_HOST = 'https://n-api-gamma.vercel.app';

// Helpers
const formatCurrency = (value) => Number(value || 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
const formatNumber = (value) => Number(value || 0).toLocaleString('vi-VN');
const formatPercent = (value) => {
    if (value === null || value === undefined || !Number.isFinite(+value)) return '0.00%';
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
};
const formatDate = (dateValue) => {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return dateValue;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

export default function BaoCaoSale() {
    // --- State ---
    const [loading, setLoading] = useState(true);
    const [rawData, setRawData] = useState([]);
    const [currentUserInfo, setCurrentUserInfo] = useState(null);
    const [isRestrictedView, setIsRestrictedView] = useState(false);

    // Filters State
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        products: [], // active selected
        shifts: [],
        teams: [],
        markets: []
    });

    // Options for filters (derived from data)
    const [options, setOptions] = useState({
        products: [],
        shifts: [],
        teams: [],
        markets: []
    });

    // Validations for Restricted View
    const [permissions, setPermissions] = useState({
        allowedNames: [],
        allowedTeam: null,
        allowedBranch: null,
        title: 'DỮ LIỆU TỔNG HỢP'
    });

    // Active Tab
    const [activeTab, setActiveTab] = useState('sau-huy'); // 'sau-huy', 'chot', 'kpi-sale', 'van-don-sale', 'thu-cong'

    // --- Effects ---

    // 1. Initialize Dates
    useEffect(() => {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        const formatDateForInput = (date) => date.toISOString().split('T')[0];

        setFilters(prev => ({
            ...prev,
            startDate: formatDateForInput(firstDay),
            endDate: formatDateForInput(lastDay)
        }));
    }, []);

    // 2. Fetch Data
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await fetch(`${API_HOST}/report/generate?tableName=Báo cáo sale`);
                const result = await res.json();
                const apiData = result.data;
                const employeeData = result.employeeData;

                // --- Permissions Logic based on URL Param 'id' ---
                const params = new URLSearchParams(window.location.search);
                const idFromUrl = params.get('id');

                let newPermissions = { ...permissions };
                let userInfo = null;

                if (idFromUrl) {
                    const currentUserRecord = employeeData.find(record => record['id'] === idFromUrl && record['Email']);
                    if (currentUserRecord) {
                        setIsRestrictedView(true);
                        const cleanName = (currentUserRecord['Họ Và Tên'] || '').trim();
                        const userRole = (currentUserRecord['Chức vụ'] || currentUserRecord['Vị trí'] || '').trim();
                        const userBranch = (currentUserRecord['chi nhánh'] || currentUserRecord['Chi nhánh'] || '').trim() || 'Không xác định';
                        const userTeam = (currentUserRecord['Team'] || '').trim();

                        userInfo = { ten: cleanName, email: (currentUserRecord['Email'] || '').trim() };
                        setCurrentUserInfo(userInfo);

                        if (userRole === 'Sale Leader') {
                            newPermissions = {
                                allowedBranch: userBranch,
                                allowedTeam: null,
                                allowedNames: [],
                                title: `DỮ LIỆU CHI NHÁNH - ${userBranch}`
                            };
                        } else if (userRole === 'Leader') {
                            newPermissions = {
                                allowedBranch: null,
                                allowedTeam: userTeam ? userTeam.trim() : null,
                                allowedNames: [],
                                title: `DỮ LIỆU TEAM - ${userTeam}`
                            };
                        } else {
                            // NV or others
                            newPermissions = {
                                allowedBranch: null,
                                allowedTeam: null,
                                allowedNames: [cleanName],
                                title: `DỮ LIỆU CÁ NHÂN - ${cleanName}`
                            };
                        }
                    } else {
                        newPermissions.title = 'KHÔNG TÌM THẤY DỮ LIỆU NGƯỜI DÙNG';
                    }
                } else {
                    setIsRestrictedView(false);
                    newPermissions.title = 'DỮ LIỆU TỔNG HỢP';
                }
                setPermissions(newPermissions);

                // --- Process Data ---
                const processed = apiData
                    .filter(r => r['Tên'] && String(r['Tên']).trim() !== '' && r['Team'] && String(r['Team']).trim() !== '')
                    .map(r => ({
                        chucVu: (r['Chức vụ'] || '').trim(),
                        ten: (r['Tên'] || '').trim(),
                        email: (r['Email'] || '').trim(),
                        team: (r['Team'] || '').trim(),
                        chiNhanh: (r['Chi nhánh'] || r['chi nhánh'] || '').trim() || 'Không xác định',
                        ngay: r['Ngày'],
                        ca: r['Ca'],
                        sanPham: r['Sản phẩm'],
                        thiTruong: r['Thị trường'],
                        soMessCmt: Number(r['Số Mess']) || 0,
                        soDon: Number(r['Đơn Mess']) || 0,
                        dsChot: Number(r['Doanh số Mess']) || 0,
                        phanHoi: Number(r['Phản hồi']) || 0,
                        doanhSoDi: Number(r['Doanh số đi']) || 0,
                        soDonHuy: Number(r['Số đơn Hoàn huỷ']) || 0,
                        doanhSoHuy: Number(r['Doanh số hoàn huỷ']) || 0,
                        soDonThanhCong: Number(r['Số đơn thành công']) || 0,
                        doanhSoThanhCong: Number(r['Doanh số thành công']) || 0,
                        soDonThucTe: Number(r['Số đơn thực tế']) || 0,
                        doanhThuChotThucTe: Number(r['Doanh thu chốt thực tế']) || 0,
                        doanhSoDiThucTe: Number(r['Doanh số đi thực tế']) || 0,
                        soDonHoanHuyThucTe: Number(r['Số đơn hoàn hủy thực tế']) || 0,
                        doanhSoHoanHuyThucTe: Number(r['Doanh số hoàn hủy thực tế']) || 0,
                        doanhSoSauHoanHuyThucTe: Number(r['Doanh số sau hoàn hủy thực tế']) || 0,
                        originalRecord: r // Keep ref if needed
                    }));

                // Pre-filter stats based on permission strictness? 
                // The requirements say populate filters first.

                // Extract unique options for filters
                // Filter data primarily by Permissions FIRST before extracting options?
                // The provided code populates options based on 'dataForFilters' 

                let visibleData = processed;
                if (isRestrictedView || idFromUrl) { // Logic from code: use isRestrictedView flag derived earlier
                    visibleData = processed.filter(r => {
                        if (newPermissions.allowedBranch && r.chiNhanh.toLowerCase() !== newPermissions.allowedBranch.toLowerCase()) return false;
                        if (newPermissions.allowedTeam && r.team !== newPermissions.allowedTeam) return false;
                        if (newPermissions.allowedNames.length > 0 && !newPermissions.allowedNames.includes(r.ten)) return false;
                        return true;
                    });
                }

                setRawData(visibleData);

                // Populate Options
                const unique = (key) => [...new Set(visibleData.map(d => d[key]).filter(Boolean))].sort();
                setOptions({
                    products: unique('sanPham'),
                    markets: unique('thiTruong'),
                    shifts: unique('ca'),
                    teams: unique('team')
                });

                // Initial Select All
                setFilters(prev => ({
                    ...prev,
                    products: unique('sanPham'),
                    markets: unique('thiTruong'),
                    shifts: unique('ca'),
                    teams: unique('team')
                }));

            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    // --- Filtering Logic ---
    const filteredData = useMemo(() => {
        if (loading) return [];
        return rawData.filter(r => {
            // Date Filter
            const rDate = new Date(r.ngay);
            rDate.setHours(12, 0, 0, 0);
            const sDate = filters.startDate ? new Date(filters.startDate) : null;
            if (sDate) sDate.setHours(0, 0, 0, 0);
            const eDate = filters.endDate ? new Date(filters.endDate) : null;
            if (eDate) eDate.setHours(23, 59, 59, 999);

            if (sDate && rDate < sDate) return false;
            if (eDate && rDate > eDate) return false;

            // Checkboxes
            if (!filters.products.includes(r.sanPham)) return false;
            if (!filters.markets.includes(r.thiTruong)) return false;
            if (!filters.shifts.includes(String(r.ca))) return false;
            if (!filters.teams.includes(String(r.team))) return false;

            return true;
        });
    }, [rawData, filters, loading]);

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
        const summary = {};
        const initial = {
            mess: 0, don: 0, chot: 0, phanHoi: 0,
            doanhSoDi: 0, soDonHuy: 0, doanhSoHuy: 0,
            soDonThanhCong: 0, doanhSoThanhCong: 0,
            soDonThucTe: 0, doanhThuChotThucTe: 0, doanhSoDiThucTe: 0,
            soDonHoanHuyThucTe: 0, doanhSoHoanHuyThucTe: 0, doanhSoSauHoanHuyThucTe: 0
        };

        data.forEach(r => {
            if (!summary[r.ten]) {
                summary[r.ten] = {
                    name: r.ten, chiNhanh: r.chiNhanh, team: r.team, ...initial
                };
            }
            const s = summary[r.ten];
            s.mess += r.soMessCmt;
            s.don += r.soDon;
            s.chot += r.dsChot;
            s.phanHoi += r.phanHoi;
            s.soDonThucTe += r.soDonThucTe;
            s.doanhThuChotThucTe += r.doanhThuChotThucTe;
            s.soDonHoanHuyThucTe += r.soDonHoanHuyThucTe;
            s.doanhSoHoanHuyThucTe += r.doanhSoHoanHuyThucTe;
            s.doanhSoDi += r.doanhSoDi;
            s.soDonHuy += r.soDonHuy;
            s.doanhSoHuy += r.doanhSoHuy;
            s.soDonThanhCong += r.soDonThanhCong;
            s.doanhSoThanhCong += r.doanhSoThanhCong;
        });

        const flatList = Object.values(summary).sort((a, b) => a.team.localeCompare(b.team) || b.chot - a.chot || a.name.localeCompare(b.name));

        const total = flatList.reduce((acc, item) => {
            Object.keys(initial).forEach(k => acc[k] += item[k]);
            return acc;
        }, { ...initial });

        return { flatList, total };
    };

    // --- Derived Data for Rendering ---
    const { flatList: summaryList, total: summaryTotal } = useMemo(() => summarizeData(filteredData), [filteredData]);

    // Group by Date for Breakdowns
    const dailyBreakdown = useMemo(() => {
        const groups = {};
        filteredData.forEach(r => {
            const d = formatDate(r.ngay); // dd/mm/yyyy
            if (!groups[d]) groups[d] = [];
            groups[d].push(r);
        });

        // Sort keys by date descending
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            const [d1, m1, y1] = a.split('/').map(Number);
            const [d2, m2, y2] = b.split('/').map(Number);
            return new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1);
        });

        return sortedKeys.map(date => ({
            date,
            data: summarizeData(groups[date])
        }));
    }, [filteredData]);


    // --- Render Helpers ---
    const getRateClass = (rate) => rate >= 0.1 ? 'bg-green' : (rate > 0.05 ? 'bg-yellow' : '');

    return (
        <div className="bao-cao-sale-container">
            {loading && <div className="loading-overlay">Đang tải dữ liệu...</div>}

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

                    {/* Product Filter */}
                    <h3>Sản phẩm</h3>
                    <label>
                        <input type="checkbox"
                            checked={filters.products.length === options.products.length}
                            onChange={(e) => handleSelectAll('products', e.target.checked)}
                        /> Tất cả
                    </label>
                    <div className="indent">
                        {options.products.map(opt => (
                            <label key={opt}>
                                <input type="checkbox" checked={filters.products.includes(opt)} onChange={(e) => handleFilterChange('products', opt, e.target.checked)} />
                                {opt}
                            </label>
                        ))}
                    </div>

                    {/* Shift Filter */}
                    <h3>Ca</h3>
                    <label>
                        <input type="checkbox"
                            checked={filters.shifts.length === options.shifts.length}
                            onChange={(e) => handleSelectAll('shifts', e.target.checked)}
                        /> Tất cả
                    </label>
                    <div className="indent">
                        {options.shifts.map(opt => (
                            <label key={opt}>
                                <input type="checkbox" checked={filters.shifts.includes(opt)} onChange={(e) => handleFilterChange('shifts', opt, e.target.checked)} />
                                {opt}
                            </label>
                        ))}
                    </div>

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

                    {/* Market Filter */}
                    <h3>Thị trường</h3>
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
                        <button className={`tab-button ${activeTab === 'sau-huy' ? 'active' : ''}`} onClick={() => setActiveTab('sau-huy')}>Sale đã trừ hủy</button>
                        <button className={`tab-button ${activeTab === 'chot' ? 'active' : ''}`} onClick={() => setActiveTab('chot')}>Dữ liệu báo cáo tay</button>
                        <button className={`tab-button ${activeTab === 'kpi-sale' ? 'active' : ''}`} onClick={() => setActiveTab('kpi-sale')}>KPIs Sale</button>
                        <button className={`tab-button ${activeTab === 'van-don-sale' ? 'active' : ''}`} onClick={() => setActiveTab('van-don-sale')}>Vận đơn Sale</button>
                        {currentUserInfo && (
                            <button className={`tab-button ${activeTab === 'thu-cong' ? 'active' : ''}`} onClick={() => setActiveTab('thu-cong')}>Báo cáo thủ công</button>
                        )}
                    </div>

                    {/* Tab 1: Sau Huy */}
                    <div className={`tab-content ${activeTab === 'sau-huy' ? 'active' : ''}`}>
                        <div className="table-responsive-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>STT</th><th>Chi nhánh</th><th>Team</th><th>Sale</th>
                                        <th>Số Mess</th><th>Phản hồi</th><th>Số đơn sau huỷ</th>
                                        <th>DS Sau Hủy TT</th><th>Tỉ lệ chốt</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Total Row */}
                                    {(() => {
                                        const totalSoDon = summaryTotal.soDonThucTe - summaryTotal.soDonHoanHuyThucTe;
                                        const totalDS = summaryTotal.doanhThuChotThucTe - summaryTotal.doanhSoHoanHuyThucTe;
                                        const totalRate = summaryTotal.mess ? totalSoDon / summaryTotal.mess : 0;
                                        return (
                                            <tr className="total-row">
                                                <td className="total-label" colSpan={4}>TỔNG CỘNG</td>
                                                <td className="total-value">{formatNumber(summaryTotal.mess)}</td>
                                                <td className="total-value">{formatNumber(summaryTotal.phanHoi)}</td>
                                                <td className="total-value">{formatNumber(totalSoDon)}</td>
                                                <td className="total-value">{formatCurrency(totalDS)}</td>
                                                <td className="total-value">{formatPercent(totalRate)}</td>
                                            </tr>
                                        )
                                    })()}
                                    {/* Rows */}
                                    {summaryList.map((item, index) => {
                                        const soDon = item.soDonThucTe - item.soDonHoanHuyThucTe;
                                        const ds = item.doanhThuChotThucTe - item.doanhSoHoanHuyThucTe;
                                        const rate = item.mess ? soDon / item.mess : 0;
                                        return (
                                            <tr key={index} style={{ '--row-index': index }}>
                                                <td className="text-center">{index + 1}</td>
                                                <td className="text-left">{item.chiNhanh}</td>
                                                <td className="text-left">{item.team}</td>
                                                <td className="text-left">{item.name}</td>
                                                <td>{formatNumber(item.mess)}</td>
                                                <td>{formatNumber(item.phanHoi)}</td>
                                                <td>{formatNumber(soDon)}</td>
                                                <td>{formatCurrency(ds)}</td>
                                                <td className={getRateClass(rate)}>{formatPercent(rate)}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Daily Breakdown for Tab 1 */}
                        <div className="daily-breakdown">
                            {dailyBreakdown.map((dayItem) => {
                                const { total, flatList } = dayItem.data;
                                const totalSoDon = total.soDonThucTe - total.soDonHoanHuyThucTe;
                                const totalDS = total.doanhThuChotThucTe - total.doanhSoHoanHuyThucTe;
                                const totalRate = total.mess ? totalSoDon / total.mess : 0;

                                return (
                                    <div key={dayItem.date}>
                                        <h3>Chi tiết ngày: {dayItem.date}</h3>
                                        <div className="table-responsive-container">
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th>STT</th><th>Chi nhánh</th><th>Team</th><th>Sale</th>
                                                        <th>Số Mess</th><th>Phản hồi</th><th>Số đơn sau huỷ</th>
                                                        <th>DS Sau Hủy TT</th><th>Tỉ lệ chốt</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr className="total-row">
                                                        <td className="total-label" colSpan={4}>TỔNG NGÀY {dayItem.date}</td>
                                                        <td className="total-value">{formatNumber(total.mess)}</td>
                                                        <td className="total-value">{formatNumber(total.phanHoi)}</td>
                                                        <td className="total-value">{formatNumber(totalSoDon)}</td>
                                                        <td className="total-value">{formatCurrency(totalDS)}</td>
                                                        <td className="total-value">{formatPercent(totalRate)}</td>
                                                    </tr>
                                                    {flatList.map((item, index) => {
                                                        const soDon = item.soDonThucTe - item.soDonHoanHuyThucTe;
                                                        const ds = item.doanhThuChotThucTe - item.doanhSoHoanHuyThucTe;
                                                        const rate = item.mess ? soDon / item.mess : 0;
                                                        return (
                                                            <tr key={index}>
                                                                <td className="text-center">{index + 1}</td>
                                                                <td className="text-left">{item.chiNhanh}</td>
                                                                <td className="text-left">{item.team}</td>
                                                                <td className="text-left">{item.name}</td>
                                                                <td>{formatNumber(item.mess)}</td>
                                                                <td>{formatNumber(item.phanHoi)}</td>
                                                                <td>{formatNumber(soDon)}</td>
                                                                <td>{formatCurrency(ds)}</td>
                                                                <td className={getRateClass(rate)}>{formatPercent(rate)}</td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Tab 2: Chot (Manual Report) */}
                    <div className={`tab-content ${activeTab === 'chot' ? 'active' : ''}`}>
                        <div className="table-responsive-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>STT</th><th>Chi nhánh</th><th>Team</th><th>Sale</th>
                                        <th>Số Mess</th><th>Phản hồi</th><th>Số Đơn</th><th>Số Đơn TT</th>
                                        <th>DS Chốt</th><th>DS Chốt TT</th><th>Tỉ lệ chốt</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Total Row */}
                                    {(() => {
                                        const totalRate = summaryTotal.mess ? summaryTotal.soDonThucTe / summaryTotal.mess : 0;
                                        return (
                                            <tr className="total-row">
                                                <td className="total-label" colSpan={4}>TỔNG CỘNG</td>
                                                <td className="total-value">{formatNumber(summaryTotal.mess)}</td>
                                                <td className="total-value">{formatNumber(summaryTotal.phanHoi)}</td>
                                                <td className="total-value">{formatNumber(summaryTotal.don)}</td>
                                                <td className="total-value">{formatNumber(summaryTotal.soDonThucTe)}</td>
                                                <td className="total-value">{formatCurrency(summaryTotal.chot)}</td>
                                                <td className="total-value">{formatCurrency(summaryTotal.doanhThuChotThucTe)}</td>
                                                <td className="total-value">{formatPercent(totalRate)}</td>
                                            </tr>
                                        )
                                    })()}
                                    {/* Rows */}
                                    {summaryList.map((item, index) => {
                                        const rate = item.mess ? item.soDonThucTe / item.mess : 0;
                                        return (
                                            <tr key={index} style={{ '--row-index': index }}>
                                                <td className="text-center">{index + 1}</td>
                                                <td className="text-left">{item.chiNhanh}</td>
                                                <td className="text-left">{item.team}</td>
                                                <td className="text-left">{item.name}</td>
                                                <td>{formatNumber(item.mess)}</td>
                                                <td>{formatNumber(item.phanHoi)}</td>
                                                <td>{formatNumber(item.don)}</td>
                                                <td>{formatNumber(item.soDonThucTe)}</td>
                                                <td>{formatCurrency(item.chot)}</td>
                                                <td>{formatCurrency(item.doanhThuChotThucTe)}</td>
                                                <td className={getRateClass(rate)}>{formatPercent(rate)}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Daily Breakdown for Tab 2 */}
                        <div className="daily-breakdown">
                            {dailyBreakdown.map((dayItem) => {
                                const { total, flatList } = dayItem.data;
                                const totalRate = total.mess ? total.soDonThucTe / total.mess : 0;

                                return (
                                    <div key={dayItem.date}>
                                        <h3>Chi tiết ngày: {dayItem.date}</h3>
                                        <div className="table-responsive-container">
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th>STT</th><th>Chi nhánh</th><th>Team</th><th>Sale</th>
                                                        <th>Số Mess</th><th>Phản hồi</th><th>Số Đơn</th><th>Số Đơn TT</th>
                                                        <th>DS Chốt</th><th>DS Chốt TT</th><th>Tỉ lệ chốt</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr className="total-row">
                                                        <td className="total-label" colSpan={4}>TỔNG NGÀY {dayItem.date}</td>
                                                        <td className="total-value">{formatNumber(total.mess)}</td>
                                                        <td className="total-value">{formatNumber(total.phanHoi)}</td>
                                                        <td className="total-value">{formatNumber(total.don)}</td>
                                                        <td className="total-value">{formatNumber(total.soDonThucTe)}</td>
                                                        <td className="total-value">{formatCurrency(total.chot)}</td>
                                                        <td className="total-value">{formatCurrency(total.doanhThuChotThucTe)}</td>
                                                        <td className="total-value">{formatPercent(totalRate)}</td>
                                                    </tr>
                                                    {flatList.map((item, index) => {
                                                        const rate = item.mess ? item.soDonThucTe / item.mess : 0;
                                                        return (
                                                            <tr key={index}>
                                                                <td className="text-center">{index + 1}</td>
                                                                <td className="text-left">{item.chiNhanh}</td>
                                                                <td className="text-left">{item.team}</td>
                                                                <td className="text-left">{item.name}</td>
                                                                <td>{formatNumber(item.mess)}</td>
                                                                <td>{formatNumber(item.phanHoi)}</td>
                                                                <td>{formatNumber(item.don)}</td>
                                                                <td>{formatNumber(item.soDonThucTe)}</td>
                                                                <td>{formatCurrency(item.chot)}</td>
                                                                <td>{formatCurrency(item.doanhThuChotThucTe)}</td>
                                                                <td className={getRateClass(rate)}>{formatPercent(rate)}</td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Tab 3: KPI Sale */}
                    <div className={`tab-content ${activeTab === 'kpi-sale' ? 'active' : ''}`}>
                        <iframe
                            src={`https://nguyenbatyads37.github.io/static-html-show-data/KPisale.html${window.location.search}`}
                            title="KPIs Sale"
                        />
                    </div>

                    {/* Tab 4: Van Don Sale */}
                    <div className={`tab-content ${activeTab === 'van-don-sale' ? 'active' : ''}`}>
                        <iframe
                            src={`https://nguyenbatyads37.github.io/static-html-show-data/Vandonsale.html${window.location.search}`}
                            title="Vận đơn Sale"
                        />
                    </div>

                    {/* Tab 5: Thu Cong */}
                    {activeTab === 'thu-cong' && currentUserInfo && (
                        <div className={`tab-content active`}>
                            <iframe
                                src={`https://nguyenbatyads37.github.io/static-html-show-data/baoCaoThuCong.html?hoten=${encodeURIComponent(currentUserInfo.ten)}&email=${encodeURIComponent(currentUserInfo.email)}&tableName=Báo cáo sale`}
                                title="Báo cáo thủ công"
                            />
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
