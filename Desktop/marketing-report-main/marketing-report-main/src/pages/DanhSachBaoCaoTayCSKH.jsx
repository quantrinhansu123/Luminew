import { useEffect, useState } from 'react';
import usePermissions from '../hooks/usePermissions';
import { supabase } from '../services/supabaseClient';
import './BaoCaoSale.css'; // Reusing styles

// Helpers
const formatCurrency = (value) => Number(value || 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
const formatNumber = (value) => Number(value || 0).toLocaleString('vi-VN');
const formatDate = (dateValue) => {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return dateValue;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

export default function DanhSachBaoCaoTayCSKH() {
    const { canView } = usePermissions();



    const [loading, setLoading] = useState(true);
    const [reports, setReports] = useState([]);
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: ''
    });

    // Initialize Dates
    useEffect(() => {
        const today = new Date();
        const d = new Date();
        d.setDate(d.getDate() - 7); // Last 7 days
        const formatDateForInput = (date) => date.toISOString().split('T')[0];

        setFilters({
            startDate: formatDateForInput(d),
            endDate: formatDateForInput(today)
        });
    }, []);

    // Fetch Data
    useEffect(() => {
        const fetchData = async () => {
            if (!filters.startDate || !filters.endDate) return;
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('cskh_reports')
                    .select('*')
                    .gte('report_date', filters.startDate)
                    .lte('report_date', filters.endDate)
                    .order('report_date', { ascending: false });

                if (error) throw error;
                setReports(data || []);
            } catch (error) {
                console.error('Error fetching CSKH manual reports:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [filters.startDate, filters.endDate]);

    if (!canView('CSKH_VIEW')) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này (CSKH_VIEW).</div>;
    }

    return (
        <div className="bao-cao-sale-container">
            {loading && <div className="loading-overlay">Đang tải dữ liệu...</div>}

            <div className="report-container">
                {/* Sidebar Filter */}
                <div className="sidebar" style={{ width: '250px', minWidth: '250px' }}>
                    <h3>Bộ lọc</h3>
                    <label>
                        Từ ngày:
                        <input type="date" value={filters.startDate} onChange={e => setFilters(prev => ({ ...prev, startDate: e.target.value }))} />
                    </label>
                    <label>
                        Đến ngày:
                        <input type="date" value={filters.endDate} onChange={e => setFilters(prev => ({ ...prev, endDate: e.target.value }))} />
                    </label>
                </div>

                <div className="main-detailed">
                    <div className="header">
                        <h2>DANH SÁCH BÁO CÁO TAY CSKH</h2>
                    </div>

                    <div className="table-responsive-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>STT</th>
                                    <th>Ngày</th>
                                    <th>Ca</th>
                                    <th>Nhân viên</th>
                                    <th>Sản phẩm</th>
                                    <th>Thị trường</th>
                                    <th>Số mess</th>
                                    <th>Phản hồi</th>
                                    <th>Số đơn</th>
                                    <th>Doanh số</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reports.length === 0 ? (
                                    <tr>
                                        <td colSpan="10" className="text-center">{loading ? 'Đang tải...' : 'Không có dữ liệu trong khoảng thời gian này.'}</td>
                                    </tr>
                                ) : (
                                    reports.map((item, index) => (
                                        <tr key={item.id || index}>
                                            <td className="text-center">{index + 1}</td>
                                            <td>{formatDate(item.report_date)}</td>
                                            <td>{item.shift}</td>
                                            <td className="font-semibold">{item.name}</td>
                                            <td>{item.product}</td>
                                            <td>{item.market}</td>
                                            <td>{formatNumber(item.mess_count)}</td>
                                            <td>{formatNumber(item.response_count)}</td>
                                            <td>{formatNumber(item.order_count)}</td>
                                            <td className="text-blue-600 font-medium">{formatCurrency(item.revenue_mess)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
