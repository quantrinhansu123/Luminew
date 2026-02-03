import { ChevronLeft } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import usePermissions from '../hooks/usePermissions';
import { supabase } from '../supabase/config';
import { isDateInRange, parseSmartDate } from '../utils/dateParsing';
import './XemBaoCaoMKT.css'; // Reuse CSS

const MARKET_GROUPS = {
    'Ngoài Châu Á': ['US', 'Canada', 'Úc', 'Anh', 'Khác'],
    'Châu Á': ['Nhật Bản', 'Hàn Quốc', 'Đài Loan', 'Malaysia', 'Singapore']
};

export default function XemBaoCaoRnD() {
    const { canView, role, team, loading: permLoading } = usePermissions();


    const [activeTab, setActiveTab] = useState('DetailedReport');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 3); // Last 3 Days default
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        return new Date().toISOString().split('T')[0];
    });
    const [selectedTeam, setSelectedTeam] = useState('ALL');
    const [teams, setTeams] = useState([]);

    // Column Visibility State
    const [visibleColumns, setVisibleColumns] = useState(() => {
        const saved = localStorage.getItem('rdReport_visibleColumns');
        return saved ? JSON.parse(saved) : {
            stt: true, team: true, marketing: true, cpqc: true, mess: true, orders: true,
            dsChot: true, tiLeChot: true, giaMess: true, cps: true, cp_ds: true, giaTBDon: true,
            ordersTT: true, soDonHuy: true, dsChotTT: true, dsHuy: true, tiLeChotTT: true
        };
    });

    useEffect(() => {
        localStorage.setItem('rdReport_visibleColumns', JSON.stringify(visibleColumns));
    }, [visibleColumns]);

    // Filters for Market Tab
    const [selectedProduct, setSelectedProduct] = useState('ALL');
    const [products, setProducts] = useState([]);
    const [selectedMarket, setSelectedMarket] = useState('ALL');
    const [markets, setMarkets] = useState([]);

    useEffect(() => {
        if (!permLoading && (activeTab === 'DetailedReport' || activeTab === 'KpiReport' || activeTab === 'MarketReport')) {
            fetchData();
        }
    }, [startDate, endDate, activeTab, role, permLoading]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch Detail Reports for RD
            let query = supabase
                .from('detail_reports')
                .select('*')
                .eq('department', 'RD');

            // Permission-based filtering
            const hasFullAccess = ['ADMIN', 'SUPER_ADMIN', 'DIRECTOR', 'MANAGER'].includes(role);

            if (!hasFullAccess && role) {
                if (role.toUpperCase() === 'LEADER') {
                    if (team) {
                        query = query.eq('Team', team);
                    } else {
                        // Fallback if no team found
                        const uName = localStorage.getItem('userName');
                        if (uName) query = query.ilike('Tên', uName);
                    }
                } else {
                    const uName = localStorage.getItem('userName');
                    if (uName) {
                        query = query.ilike('Tên', uName);
                    }
                }
            }

            if (startDate && endDate) {
                query = query
                    .gte('Ngày', startDate)
                    .lte('Ngày', endDate);
            }

            const { data: reports, error } = await query;

            if (error) throw error;

            const allReports = reports || [];
            const filteredReports = allReports.filter(r => isDateInRange(r['Ngày'], startDate, endDate));

            setData(filteredReports);

            // Extract unique teams
            const uniqueTeams = [...new Set(reports.map(r => r.Team).filter(Boolean))].sort();
            setTeams(uniqueTeams);

            const uniqueProducts = [...new Set(reports.map(r => r['Sản_phẩm']).filter(Boolean))].sort();
            setProducts(uniqueProducts);

            const uniqueMarkets = [...new Set(reports.map(r => r['Thị_trường']).filter(Boolean))].sort();
            setMarkets(uniqueMarkets);

        } catch (err) {
            console.error('Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    };

    const processData = useMemo(() => {
        if (!data.length) return { rows: [], total: {}, dailyData: [] };

        const grouped = {};

        data.forEach(row => {
            if (selectedTeam !== 'ALL' && row.Team !== selectedTeam) return;

            const key = `${row.Team}_${row['Tên']}`;
            if (!grouped[key]) {
                grouped[key] = {
                    team: row.Team,
                    name: row['Tên'],
                    mess: 0,
                    cpqc: 0,
                    orders: 0,
                    ordersTT: 0,
                    dsChot: 0,
                    dsChotTT: 0,
                    soDonHuy: 0,
                    soDonHuyTT: 0,
                    dsHuy: 0,
                    dsHuyTT: 0,
                    dsSauShip: 0,
                    dsThanhCong: 0,
                    dsThanhCongTT: 0,
                    kpiValue: 0,
                    via_log: 0
                };
            }

            grouped[key].mess += Number(row['Số_Mess_Cmt'] || 0);
            grouped[key].cpqc += Number(row['CPQC'] || 0);
            grouped[key].orders += Number(row['Số đơn'] || 0);
            grouped[key].ordersTT += Number(row['Số đơn thực tế'] || 0);

            grouped[key].dsChot += Number(row['Doanh số'] || 0);
            grouped[key].dsChotTT += Number(row['Doanh thu chốt thực tế'] || 0);

            grouped[key].soDonHuy += Number(row['Số đơn hoàn hủy'] || 0);
            grouped[key].soDonHuyTT += Number(row['Số đơn hoàn hủy thực tế'] || 0);

            grouped[key].dsHuy += Number(row['DS sau hoàn hủy'] || 0);
            grouped[key].dsHuyTT += Number(row['Doanh số hoàn hủy thực tế'] || 0);

            grouped[key].dsSauShip += Number(row['Doanh số sau ship'] || 0);
            grouped[key].dsThanhCong += Number(row['Doanh số TC'] || 0);
            grouped[key].dsThanhCongTT += Number(row['Doanh số sau hoàn hủy thực tế'] || 0);

            grouped[key].kpiValue += Number(row['KPIs'] || 0);
        });

        const rows = Object.values(grouped).map(item => {
            const tiLeChot = item.mess ? (item.orders / item.mess) * 100 : 0;
            const tiLeChotTT = item.mess ? (item.ordersTT / item.mess) * 100 : 0;
            const giaMess = item.mess ? item.cpqc / item.mess : 0;
            const cps = item.orders ? item.cpqc / item.orders : 0;
            const cp_ds = item.dsChot ? (item.cpqc / item.dsChot) * 100 : 0;
            const giaTBDon = item.orders ? item.dsChot / item.orders : 0;

            const cp_ds_sau_ship = item.dsSauShip ? (item.cpqc / item.dsSauShip) * 100 : 0;
            const kpi_percent = item.kpiValue ? (item.dsSauShip / item.kpiValue) * 100 : 0;

            return {
                ...item,
                tiLeChot, tiLeChotTT, giaMess, cps, cp_ds, giaTBDon,
                cp_ds_sau_ship, kpi_percent
            };
        });

        rows.sort((a, b) => (a.team || '').localeCompare(b.team || '') || (a.name || '').localeCompare(b.name || ''));

        const total = rows.reduce((acc, cur) => ({
            mess: acc.mess + cur.mess,
            cpqc: acc.cpqc + cur.cpqc,
            orders: acc.orders + cur.orders,
            ordersTT: acc.ordersTT + cur.ordersTT,
            dsChot: acc.dsChot + cur.dsChot,
            dsChotTT: acc.dsChotTT + cur.dsChotTT,
            soDonHuy: acc.soDonHuy + cur.soDonHuy,
            soDonHuyTT: acc.soDonHuyTT + cur.soDonHuyTT,
            dsHuyTT: acc.dsHuyTT + cur.dsHuyTT,
            dsSauShip: acc.dsSauShip + cur.dsSauShip,
            dsThanhCongTT: acc.dsThanhCongTT + cur.dsThanhCongTT,
            dsThanhCong: acc.dsThanhCong + cur.dsThanhCong,
            kpiValue: acc.kpiValue + cur.kpiValue,
        }), {
            mess: 0, cpqc: 0, orders: 0, ordersTT: 0, dsChot: 0, dsChotTT: 0,
            soDonHuy: 0, soDonHuyTT: 0, dsHuyTT: 0, dsSauShip: 0, dsThanhCongTT: 0, dsThanhCong: 0,
            kpiValue: 0
        });

        const totalRates = {
            tiLeChot: total.mess ? (total.orders / total.mess) * 100 : 0,
            tiLeChotTT: total.mess ? (total.ordersTT / total.mess) * 100 : 0,
            giaMess: total.mess ? total.cpqc / total.mess : 0,
            cps: total.orders ? total.cpqc / total.orders : 0,
            cp_ds: total.dsChot ? (total.cpqc / total.dsChot) * 100 : 0,
            giaTBDon: total.orders ? total.dsChot / total.orders : 0,
            cp_ds_sau_ship: total.dsSauShip ? (total.cpqc / total.dsSauShip) * 100 : 0,
            kpi_percent: total.kpiValue ? (total.dsSauShip / total.kpiValue) * 100 : 0,
        };

        const dailyGroups = {};
        if (activeTab === 'DetailedReport') {
            data.forEach(row => {
                if (selectedTeam !== 'ALL' && row.Team !== selectedTeam) return;
                if (!row['Ngày']) return;

                const dObj = parseSmartDate(row['Ngày']);
                if (!dObj) return;
                const date = dObj.toISOString().split('T')[0];

                if (!dailyGroups[date]) dailyGroups[date] = [];
                dailyGroups[date].push(row);
            });
        }

        const sortedDates = Object.keys(dailyGroups).sort((a, b) => new Date(b) - new Date(a));

        const dailyData = sortedDates.map(date => {
            const dayRows = dailyGroups[date];
            const dayGrouped = {};

            dayRows.forEach(row => {
                const key = `${row.Team}_${row['Tên']}`;
                if (!dayGrouped[key]) {
                    dayGrouped[key] = {
                        team: row.Team,
                        name: row['Tên'],
                        mess: 0, cpqc: 0, orders: 0, ordersTT: 0,
                        dsChot: 0, dsChotTT: 0
                    };
                }
                const g = dayGrouped[key];
                g.mess += Number(row['Số_Mess_Cmt'] || 0);
                g.cpqc += Number(row['CPQC'] || 0);
                g.orders += Number(row['Số đơn'] || 0);
                g.ordersTT += Number(row['Số đơn thực tế'] || 0);
                g.dsChot += Number(row['Doanh số'] || 0);
                g.dsChotTT += Number(row['Doanh thu chốt thực tế'] || 0);
            });

            const currentDayRows = Object.values(dayGrouped).map(item => {
                const tiLeChot = item.mess ? (item.orders / item.mess) * 100 : 0;
                const tiLeChotTT = item.mess ? (item.ordersTT / item.mess) * 100 : 0;
                const giaMess = item.mess ? item.cpqc / item.mess : 0;
                const cps = item.orders ? item.cpqc / item.orders : 0;
                const cp_ds = item.dsChot ? (item.cpqc / item.dsChot) * 100 : 0;
                const giaTBDon = item.orders ? item.dsChot / item.orders : 0;

                return { ...item, tiLeChot, tiLeChotTT, giaMess, cps, cp_ds, giaTBDon };
            });

            currentDayRows.sort((a, b) => (a.team || '').localeCompare(b.team || '') || (a.name || '').localeCompare(b.name || ''));

            const dTotal = currentDayRows.reduce((acc, cur) => ({
                mess: acc.mess + cur.mess,
                cpqc: acc.cpqc + cur.cpqc,
                orders: acc.orders + cur.orders,
                ordersTT: acc.ordersTT + cur.ordersTT,
                dsChot: acc.dsChot + cur.dsChot,
                dsChotTT: acc.dsChotTT + cur.dsChotTT
            }), { mess: 0, cpqc: 0, orders: 0, ordersTT: 0, dsChot: 0, dsChotTT: 0 });

            const dTotalRates = {
                tiLeChot: dTotal.mess ? (dTotal.orders / dTotal.mess) * 100 : 0,
                tiLeChotTT: dTotal.mess ? (dTotal.ordersTT / dTotal.mess) * 100 : 0,
                giaMess: dTotal.mess ? dTotal.cpqc / dTotal.mess : 0,
                cps: dTotal.orders ? dTotal.cpqc / dTotal.orders : 0,
                cp_ds: dTotal.dsChot ? (dTotal.cpqc / dTotal.dsChot) * 100 : 0,
                giaTBDon: dTotal.orders ? dTotal.dsChot / dTotal.orders : 0
            };

            return { date, rows: currentDayRows, total: { ...dTotal, ...dTotalRates } };
        });

        return { rows, total: { ...total, ...totalRates }, dailyData };
    }, [data, selectedTeam, activeTab]);

    const processMarketData = useMemo(() => {
        if (!data.length) return { asia: [], nonAsia: [], summary: [] };

        const processGroup = (records, showMarketColumns = true) => {
            const productGroups = {};

            records.forEach(r => {
                if (selectedProduct !== 'ALL' && r['Sản_phẩm'] !== selectedProduct) return;
                if (selectedMarket !== 'ALL' && r['Thị_trường'] !== selectedMarket) return;
                if (selectedTeam !== 'ALL' && r.Team !== selectedTeam) return;

                const productKey = r['Sản_phẩm'] || 'Chưa xác định';
                const marketKey = showMarketColumns ? (r['Thị_trường'] || 'Không xác định') : '_TOTAL_';

                if (!productGroups[productKey]) productGroups[productKey] = {};
                if (!productGroups[productKey][marketKey]) {
                    productGroups[productKey][marketKey] = {
                        product: productKey,
                        market: marketKey,
                        cpqc: 0, soDon: 0, soDonThucTe: 0, soMessCmt: 0,
                        dsChot: 0, dsChotThucTe: 0, dsHoanHuyThucTe: 0,
                        dsSauHoanHuyThucTe: 0
                    };
                }

                const g = productGroups[productKey][marketKey];
                g.cpqc += Number(r['CPQC'] || 0);
                g.soDon += Number(r['Số đơn'] || 0);
                g.soDonThucTe += Number(r['Số đơn thực tế'] || 0);
                g.soMessCmt += Number(r['Số_Mess_Cmt'] || 0);
                g.dsChot += Number(r['Doanh số'] || 0);
                g.dsChotThucTe += Number(r['Doanh thu chốt thực tế'] || 0);
                g.dsHoanHuyThucTe += Number(r['Doanh số hoàn hủy thực tế'] || 0);
                g.dsSauHoanHuyThucTe += Number(r['Doanh số sau hoàn hủy thực tế'] || 0);
            });

            let flattened = [];
            Object.keys(productGroups).sort().forEach(pKey => {
                const markets = productGroups[pKey];
                const pTotal = {
                    product: pKey, market: 'Tổng',
                    cpqc: 0, soDon: 0, soDonThucTe: 0, soMessCmt: 0,
                    dsChot: 0, dsChotThucTe: 0, dsHoanHuyThucTe: 0,
                    dsSauHoanHuyThucTe: 0,
                    isHeader: true
                };

                Object.keys(markets).sort().forEach(mKey => {
                    const mData = markets[mKey];
                    flattened.push(calculateMarketMetrics(mData));
                    pTotal.cpqc += mData.cpqc;
                    pTotal.soDon += mData.soDon;
                    pTotal.soDonThucTe += mData.soDonThucTe;
                    pTotal.soMessCmt += mData.soMessCmt;
                    pTotal.dsChot += mData.dsChot;
                    pTotal.dsChotThucTe += mData.dsChotThucTe;
                    pTotal.dsHoanHuyThucTe += mData.dsHoanHuyThucTe;
                    pTotal.dsSauHoanHuyThucTe += mData.dsSauHoanHuyThucTe;
                });

                if (showMarketColumns && Object.keys(markets).length > 1) {
                    flattened.push(calculateMarketMetrics(pTotal));
                }
            });

            return flattened;
        };

        const calculateMarketMetrics = (d) => {
            const costPercent = d.dsSauHoanHuyThucTe > 0 ? (d.cpqc / d.dsSauHoanHuyThucTe) * 100 : 0;
            const cps = d.soDon ? d.cpqc / d.soDon : 0;
            const avgOrderValue = d.soDon ? d.dsSauHoanHuyThucTe / d.soDon : 0;
            const closingRate = d.soMessCmt ? (d.soDon / d.soMessCmt) * 100 : 0;
            const closingRateThucTe = d.soMessCmt ? (d.soDonThucTe / d.soMessCmt) * 100 : 0;

            return { ...d, costPercent, cps, avgOrderValue, closingRate, closingRateThucTe };
        };

        const asiaList = [];
        const nonAsiaList = [];
        const nonAsiaMarketsLower = MARKET_GROUPS['Ngoài Châu Á'].map(m => m.toLowerCase());

        data.forEach(r => {
            const market = (r['Thị_trường'] || '').toLowerCase();
            if (nonAsiaMarketsLower.some(m => market.includes(m))) {
                nonAsiaList.push(r);
            } else {
                asiaList.push(r);
            }
        });

        return {
            nonAsia: processGroup(nonAsiaList, true),
            asia: processGroup(asiaList, true),
            summary: processGroup(data, false)
        };

    }, [data, selectedProduct, selectedMarket, selectedTeam]);

    // Format Helper
    const fmtNum = (n) => n ? Math.round(n).toLocaleString('vi-VN') : '0';
    const fmtCurrency = (n) => n ? Math.round(n).toLocaleString('vi-VN') + ' ₫' : '0 ₫';
    const fmtPct = (n) => n ? n.toFixed(2) + '%' : '0.00%';

    const getCpsCellStyle = (cps) => {
        const hasAsia = selectedMarket === 'ALL' || MARKET_GROUPS['Châu Á'].includes(selectedMarket);
        const hasNonAsia = selectedMarket === 'ALL' || MARKET_GROUPS['Ngoài Châu Á'].includes(selectedMarket);

        if (hasAsia && !hasNonAsia && selectedMarket !== 'ALL') {
            if (cps > 1e6) return 'bg-lightred';
            if (cps > 7e5) return 'bg-yellow';
        } else {
            if (cps > 1.5e6) return 'bg-lightred';
            if (cps > 1e6) return 'bg-yellow';
        }
        return '';
    };

    const getRateClass = (rate) => {
        if (rate > 10) return 'bg-green';
        if (rate > 5) return 'bg-yellow';
        return '';
    };

    const renderMarketTable = (rows, title) => {
        if (!rows || rows.length === 0) return null;

        const total = {
            cpqc: 0, soDon: 0, soDonThucTe: 0, soMessCmt: 0,
            dsChot: 0, dsChotThucTe: 0, dsHoanHuyThucTe: 0, dsSauHoanHuyThucTe: 0
        };

        rows.forEach(r => {
            if (!r.isHeader) {
                total.cpqc += r.cpqc;
                total.soDon += r.soDon;
                total.soDonThucTe += r.soDonThucTe;
                total.soMessCmt += r.soMessCmt;
                total.dsChot += r.dsChot;
                total.dsChotThucTe += r.dsChotThucTe;
                total.dsHoanHuyThucTe += r.dsHoanHuyThucTe;
                total.dsSauHoanHuyThucTe += r.dsSauHoanHuyThucTe;
            }
        });

        const totalMetrics = {
            costPercent: total.dsSauHoanHuyThucTe > 0 ? (total.cpqc / total.dsSauHoanHuyThucTe) * 100 : 0,
            cps: total.soDon ? total.cpqc / total.soDon : 0,
            avgOrderValue: total.soDon ? total.dsSauHoanHuyThucTe / total.soDon : 0,
            closingRate: total.soMessCmt ? (total.soDon / total.soMessCmt) * 100 : 0,
            closingRateThucTe: total.soMessCmt ? (total.soDonThucTe / total.soMessCmt) * 100 : 0
        };

        return (
            <div className="table-responsive-container" style={{ marginTop: '20px' }}>
                <h3 style={{ color: '#db2777', marginBottom: '10px' }}>{title}</h3>
                <table className="report-table">
                    <thead>
                        <tr>
                            <th className="pink-header text-left">Sản phẩm</th>
                            <th className="pink-header text-left">Thị trường</th>
                            <th className="pink-header">CPQC</th>
                            <th className="pink-header">Số Đơn</th>
                            <th className="pink-header">Số Đơn (TT)</th>
                            <th className="pink-header">Số Mess</th>
                            <th className="pink-header">DS Chốt</th>
                            <th className="pink-header">DS Chốt (TT)</th>
                            <th className="pink-header">DS Hoàn Hủy (TT)</th>
                            <th className="pink-header">DS Sau HH (TT)</th>
                            <th className="yellow-header">%CP/DS</th>
                            <th className="yellow-header">CPS</th>
                            <th className="yellow-header">Giá TB Đơn</th>
                            <th className="yellow-header">Tỉ lệ chốt</th>
                            <th className="yellow-header">TL Chốt (TT)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="total-row">
                            <td colSpan={2} className="text-center">TỔNG CỘNG</td>
                            <td>{fmtCurrency(total.cpqc)}</td>
                            <td>{fmtNum(total.soDon)}</td>
                            <td>{fmtNum(total.soDonThucTe)}</td>
                            <td>{fmtNum(total.soMessCmt)}</td>
                            <td>{fmtCurrency(total.dsChot)}</td>
                            <td>{fmtCurrency(total.dsChotThucTe)}</td>
                            <td>{fmtCurrency(total.dsHoanHuyThucTe)}</td>
                            <td>{fmtCurrency(total.dsSauHoanHuyThucTe)}</td>
                            <td className="text-center">{fmtPct(totalMetrics.costPercent)}</td>
                            <td>{fmtCurrency(totalMetrics.cps)}</td>
                            <td>{fmtCurrency(totalMetrics.avgOrderValue)}</td>
                            <td className="text-center">{fmtPct(totalMetrics.closingRate)}</td>
                            <td className="text-center">{fmtPct(totalMetrics.closingRateThucTe)}</td>
                        </tr>
                        {rows.map((r, i) => (
                            <tr key={i} style={r.isHeader ? { fontWeight: 'bold', backgroundColor: '#fdf2f8' } : {}}>
                                <td className="text-left">{r.isHeader ? 'Tổng ' + r.product : r.product}</td>
                                <td className="text-left">{r.market === '_TOTAL_' ? '' : r.market}</td>
                                <td>{fmtCurrency(r.cpqc)}</td>
                                <td>{fmtNum(r.soDon)}</td>
                                <td>{fmtNum(r.soDonThucTe)}</td>
                                <td>{fmtNum(r.soMessCmt)}</td>
                                <td>{fmtCurrency(r.dsChot)}</td>
                                <td>{fmtCurrency(r.dsChotThucTe)}</td>
                                <td>{fmtCurrency(r.dsHoanHuyThucTe)}</td>
                                <td>{fmtCurrency(r.dsSauHoanHuyThucTe)}</td>
                                <td className="text-center">{fmtPct(r.costPercent)}</td>
                                <td>{fmtCurrency(r.cps)}</td>
                                <td>{fmtCurrency(r.avgOrderValue)}</td>
                                <td className={`text-center ${getRateClass(r.closingRate)}`}>{fmtPct(r.closingRate)}</td>
                                <td className={`text-center ${getRateClass(r.closingRateThucTe)}`}>{fmtPct(r.closingRateThucTe)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    if (!canView('RND_VIEW')) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này (RND_VIEW).</div>;
    }

    return (
        <div className="report-view-container">
            <Link to="/trang-chu" className="back-button">
                <ChevronLeft size={20} /> Quay lại
            </Link>

            <div className="tab-container">
                <button
                    className={`tablinks ${activeTab === 'DetailedReport' ? 'active-rd' : ''}`}
                    onClick={() => setActiveTab('DetailedReport')}
                >
                    Báo cáo chi tiết R&D
                </button>
                <button
                    className={`tablinks ${activeTab === 'KpiReport' ? 'active-rd' : ''}`}
                    onClick={() => setActiveTab('KpiReport')}
                >
                    Báo cáo KPI R&D
                </button>
                <button
                    className={`tablinks ${activeTab === 'HieuSuatKPI' ? 'active-rd' : ''}`}
                    onClick={() => setActiveTab('HieuSuatKPI')}
                >
                    Hiệu suất KPI R&D
                </button>
                <button
                    className={`tablinks ${activeTab === 'MarketReport' ? 'active-rd' : ''}`}
                    onClick={() => setActiveTab('MarketReport')}
                >
                    Hiệu quả R&D
                </button>
            </div>

            {(activeTab === 'DetailedReport' || activeTab === 'KpiReport' || activeTab === 'MarketReport') && (
                <>
                    {activeTab !== 'DetailedReport' && (
                        <div className="report-header-section">
                            <h2 style={{ color: '#db2777' }}>
                                {activeTab === 'KpiReport' ? 'BÁO CÁO HIỆU SUẤT KPI (R&D)' :
                                    'HIỆU QUẢ R&D THEO SẢN PHẨM & THỊ TRƯỜNG'}
                            </h2>
                        </div>
                    )}
                    <div className="filter-sidebar">
                        <div className="filter-row">
                            <div className="filter-group">
                                <label>Từ ngày:</label>
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                            </div>
                            <div className="filter-group">
                                <label>Đến ngày:</label>
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                            </div>
                            <div className="filter-group">
                                <label>Team:</label>
                                <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}>
                                    <option value="ALL">Tất cả</option>
                                    {teams.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>

                            {activeTab === 'MarketReport' && (
                                <>
                                    <div className="filter-group">
                                        <label>Sản phẩm:</label>
                                        <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
                                            <option value="ALL">Tất cả</option>
                                            {products.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </div>
                                    <div className="filter-group">
                                        <label>Thị trường:</label>
                                        <select value={selectedMarket} onChange={e => setSelectedMarket(e.target.value)}>
                                            <option value="ALL">Tất cả</option>
                                            {markets.map(m => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                    </div>
                                </>
                            )}

                            <button onClick={fetchData} style={{
                                padding: '8px 16px',
                                backgroundColor: '#db2777', // Pink 600
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                height: 'fit-content',
                                marginTop: '19px'
                            }}>Áp dụng</button>
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'DetailedReport' && (
                <div className="table-responsive-container">
                    <div className="bg-white p-4 mb-4 rounded-lg shadow-sm border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-700 mb-3">Cột hiển thị</h3>
                        <div className="flex flex-wrap gap-3">
                            {[
                                { key: 'stt', label: 'STT' },
                                { key: 'team', label: 'Team' },
                                { key: 'marketing', label: 'R&D Staff' },
                                { key: 'cpqc', label: 'CPQC' },
                                { key: 'mess', label: 'Số Mess' },
                                { key: 'orders', label: 'Số Đơn' },
                                { key: 'dsChot', label: 'DS Chốt' },
                                { key: 'tiLeChot', label: 'Tỉ lệ chốt' },
                                { key: 'giaMess', label: 'Giá Mess' },
                                { key: 'cps', label: 'CPS' },
                                { key: 'cp_ds', label: '%CP/DS' },
                                { key: 'giaTBDon', label: 'Giá TB Đơn' },
                                { key: 'ordersTT', label: 'Số Đơn (TT)' },
                                { key: 'soDonHuy', label: 'Số đơn Huỷ' },
                                { key: 'dsChotTT', label: 'DS Chốt (TT)' },
                                { key: 'dsHuy', label: 'DS Huỷ' },
                                { key: 'tiLeChotTT', label: 'Tỉ lệ chốt (TT)' }
                            ].map(col => (
                                <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={visibleColumns[col.key]}
                                        onChange={() => setVisibleColumns(prev => ({ ...prev, [col.key]: !prev[col.key] }))}
                                        className="w-4 h-4 text-pink-600 rounded focus:ring-pink-500"
                                    />
                                    {col.label}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="bg-pink-600 text-white p-3 font-bold text-lg uppercase mb-0 rounded-t-lg">
                        BÁO CÁO TỔNG HỢP R&D
                    </div>

                    {loading ? (
                        <div style={{ padding: '20px', textAlign: 'center' }}>Đang tải dữ liệu...</div>
                    ) : (
                        <>
                            <table className="report-table" style={{ marginTop: 0 }}>
                                <thead>
                                    <tr>
                                        {visibleColumns.stt && <th className="pink-header">STT</th>}
                                        {visibleColumns.team && <th className="pink-header">TEAM</th>}
                                        {visibleColumns.marketing && <th className="pink-header">R&D STAFF</th>}
                                        {visibleColumns.cpqc && <th className="pink-header">CPQC<br /><span className="text-xs font-normal">(R&D)</span></th>}
                                        {visibleColumns.mess && <th className="pink-header">SỐ MESS<br /><span className="text-xs font-normal">(R&D)</span></th>}
                                        {visibleColumns.orders && <th className="pink-header">SỐ ĐƠN<br /><span className="text-xs font-normal">(R&D)</span></th>}
                                        {visibleColumns.dsChot && <th className="pink-header">DS CHỐT<br /><span className="text-xs font-normal">(R&D)</span></th>}

                                        {visibleColumns.tiLeChot && <th className="yellow-header">TỈ LỆ CHỐT</th>}
                                        {visibleColumns.giaMess && <th className="yellow-header">GIÁ MESS</th>}
                                        {visibleColumns.cps && <th className="yellow-header">CPS</th>}
                                        {visibleColumns.cp_ds && <th className="yellow-header">%CP/DS</th>}
                                        {visibleColumns.giaTBDon && <th className="yellow-header">GIÁ TB ĐƠN</th>}

                                        {visibleColumns.ordersTT && <th className="blue-header">SỐ ĐƠN (TT)<br /><span className="text-xs font-normal">(F3)</span></th>}
                                        {visibleColumns.soDonHuy && <th className="blue-header">SỐ ĐƠN HỦY<br /><span className="text-xs font-normal">(F3)</span></th>}
                                        {visibleColumns.dsChotTT && <th className="blue-header">DS CHỐT (TT)<br /><span className="text-xs font-normal">(F3)</span></th>}
                                        {visibleColumns.dsHuy && <th className="blue-header">DS HỦY<br /><span className="text-xs font-normal">(F3)</span></th>}

                                        {visibleColumns.tiLeChotTT && <th className="yellow-header">TỈ LỆ CHỐT (TT)</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="total-row">
                                        {(visibleColumns.stt || visibleColumns.team || visibleColumns.marketing) && (
                                            <td colSpan={(visibleColumns.stt ? 1 : 0) + (visibleColumns.team ? 1 : 0) + (visibleColumns.marketing ? 1 : 0)} className="text-center">TỔNG CỘNG</td>
                                        )}
                                        {visibleColumns.cpqc && <td>{fmtCurrency(processData.total.cpqc)}</td>}
                                        {visibleColumns.mess && <td>{fmtNum(processData.total.mess)}</td>}
                                        {visibleColumns.orders && <td>{fmtNum(processData.total.orders)}</td>}
                                        {visibleColumns.dsChot && <td>{fmtCurrency(processData.total.dsChot)}</td>}
                                        {visibleColumns.tiLeChot && <td>{fmtPct(processData.total.tiLeChot)}</td>}
                                        {visibleColumns.giaMess && <td>{fmtCurrency(processData.total.giaMess)}</td>}
                                        {visibleColumns.cps && <td>{fmtCurrency(processData.total.cps)}</td>}
                                        {visibleColumns.cp_ds && <td>{fmtPct(processData.total.cp_ds)}</td>}
                                        {visibleColumns.giaTBDon && <td>{fmtCurrency(processData.total.giaTBDon)}</td>}
                                        {visibleColumns.ordersTT && <td>{fmtNum(processData.total.ordersTT)}</td>}
                                        {visibleColumns.soDonHuy && <td>{fmtNum(processData.total.soDonHuyTT)}</td>}
                                        {visibleColumns.dsChotTT && <td>{fmtCurrency(processData.total.dsChotTT)}</td>}
                                        {visibleColumns.dsHuy && <td>{fmtCurrency(processData.total.dsHuyTT)}</td>}
                                        {visibleColumns.tiLeChotTT && <td>{fmtPct(processData.total.tiLeChotTT)}</td>}
                                    </tr>
                                    {processData.rows.map((row, index) => (
                                        <tr key={index}>
                                            {visibleColumns.stt && <td className="text-center">{index + 1}</td>}
                                            {visibleColumns.team && <td>{row.team}</td>}
                                            {visibleColumns.marketing && <td>{row.name}</td>}
                                            {visibleColumns.cpqc && <td>{fmtCurrency(row.cpqc)}</td>}
                                            {visibleColumns.mess && <td>{fmtNum(row.mess)}</td>}
                                            {visibleColumns.orders && <td>{fmtNum(row.orders)}</td>}
                                            {visibleColumns.dsChot && <td>{fmtCurrency(row.dsChot)}</td>}
                                            {visibleColumns.tiLeChot && <td className={`text-center ${getRateClass(row.tiLeChot)}`}>{fmtPct(row.tiLeChot)}</td>}
                                            {visibleColumns.giaMess && <td>{fmtCurrency(row.giaMess)}</td>}
                                            {visibleColumns.cps && <td className={getCpsCellStyle(row.cps)}>{fmtCurrency(row.cps)}</td>}
                                            {visibleColumns.cp_ds && <td className={`text-center ${row.cp_ds > 33 ? 'bg-yellow' : ''}`}>{fmtPct(row.cp_ds)}</td>}
                                            {visibleColumns.giaTBDon && <td>{fmtCurrency(row.giaTBDon)}</td>}
                                            {visibleColumns.ordersTT && <td>{fmtNum(row.ordersTT)}</td>}
                                            {visibleColumns.soDonHuy && <td>{fmtNum(row.soDonHuyTT)}</td>}
                                            {visibleColumns.dsChotTT && <td>{fmtCurrency(row.dsChotTT)}</td>}
                                            {visibleColumns.dsHuy && <td>{fmtCurrency(row.dsHuyTT)}</td>}
                                            {visibleColumns.tiLeChotTT && <td className={`text-center ${getRateClass(row.tiLeChotTT)}`}>{fmtPct(row.tiLeChotTT)}</td>}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {processData.dailyData && processData.dailyData.length > 0 && processData.dailyData.map((dayData, dIdx) => (
                                <div key={dIdx} style={{ marginTop: '30px' }}>
                                    <h3 style={{ borderBottom: '2px solid #db2777', paddingBottom: '5px', marginBottom: '10px' }}>
                                        {dayData.date.split('-').reverse().join('/')}
                                    </h3>
                                    <table className="report-table" style={{ marginTop: '10px' }}>
                                        <thead>
                                            <tr>
                                                {visibleColumns.stt && <th className="pink-header">STT</th>}
                                                {visibleColumns.team && <th className="pink-header">TEAM</th>}
                                                {visibleColumns.marketing && <th className="pink-header">R&D STAFF</th>}
                                                {visibleColumns.cpqc && <th className="pink-header">CPQC<br /><span className="text-xs font-normal">(R&D)</span></th>}
                                                {visibleColumns.mess && <th className="pink-header">SỐ MESS<br /><span className="text-xs font-normal">(R&D)</span></th>}
                                                {visibleColumns.orders && <th className="pink-header">SỐ ĐƠN<br /><span className="text-xs font-normal">(R&D)</span></th>}
                                                {visibleColumns.dsChot && <th className="pink-header">DS CHỐT<br /><span className="text-xs font-normal">(R&D)</span></th>}

                                                {visibleColumns.tiLeChot && <th className="yellow-header">TỈ LỆ CHỐT</th>}
                                                {visibleColumns.giaMess && <th className="yellow-header">GIÁ MESS</th>}
                                                {visibleColumns.cps && <th className="yellow-header">CPS</th>}
                                                {visibleColumns.cp_ds && <th className="yellow-header">%CP/DS</th>}
                                                {visibleColumns.giaTBDon && <th className="yellow-header">GIÁ TB ĐƠN</th>}

                                                {visibleColumns.ordersTT && <th className="blue-header">SỐ ĐƠN (TT)<br /><span className="text-xs font-normal">(F3)</span></th>}
                                                {visibleColumns.soDonHuy && <th className="blue-header">SỐ ĐƠN HỦY<br /><span className="text-xs font-normal">(F3)</span></th>}
                                                {visibleColumns.dsChotTT && <th className="blue-header">DS CHỐT (TT)<br /><span className="text-xs font-normal">(F3)</span></th>}
                                                {visibleColumns.dsHuy && <th className="blue-header">DS HỦY<br /><span className="text-xs font-normal">(F3)</span></th>}

                                                {visibleColumns.tiLeChotTT && <th className="yellow-header">TỈ LỆ CHỐT (TT)</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr className="total-row">
                                                {(visibleColumns.stt || visibleColumns.team || visibleColumns.marketing) && (
                                                    <td colSpan={(visibleColumns.stt ? 1 : 0) + (visibleColumns.team ? 1 : 0) + (visibleColumns.marketing ? 1 : 0)} className="text-center">TỔNG CỘNG</td>
                                                )}
                                                {visibleColumns.cpqc && <td>{fmtCurrency(dayData.total.cpqc)}</td>}
                                                {visibleColumns.mess && <td>{fmtNum(dayData.total.mess)}</td>}
                                                {visibleColumns.orders && <td>{fmtNum(dayData.total.orders)}</td>}
                                                {visibleColumns.dsChot && <td>{fmtCurrency(dayData.total.dsChot)}</td>}
                                                {visibleColumns.tiLeChot && <td>{fmtPct(dayData.total.tiLeChot)}</td>}
                                                {visibleColumns.giaMess && <td>{fmtCurrency(dayData.total.giaMess)}</td>}
                                                {visibleColumns.cps && <td>{fmtCurrency(dayData.total.cps)}</td>}
                                                {visibleColumns.cp_ds && <td>{fmtPct(dayData.total.cp_ds)}</td>}
                                                {visibleColumns.giaTBDon && <td>{fmtCurrency(dayData.total.giaTBDon)}</td>}
                                                {visibleColumns.ordersTT && <td>{fmtNum(dayData.total.ordersTT)}</td>}
                                                {visibleColumns.soDonHuy && <td>{fmtNum(dayData.total.soDonHuyTT)}</td>}
                                                {visibleColumns.dsChotTT && <td>{fmtCurrency(dayData.total.dsChotTT)}</td>}
                                                {visibleColumns.dsHuy && <td>{fmtCurrency(dayData.total.dsHuyTT)}</td>}
                                                {visibleColumns.tiLeChotTT && <td>{fmtPct(dayData.total.tiLeChotTT)}</td>}
                                            </tr>
                                            {dayData.rows.map((row, rIdx) => (
                                                <tr key={rIdx}>
                                                    {visibleColumns.stt && <td className="text-center">{rIdx + 1}</td>}
                                                    {visibleColumns.team && <td>{row.team}</td>}
                                                    {visibleColumns.marketing && <td>{row.name}</td>}
                                                    {visibleColumns.cpqc && <td>{fmtCurrency(row.cpqc)}</td>}
                                                    {visibleColumns.mess && <td>{fmtNum(row.mess)}</td>}
                                                    {visibleColumns.orders && <td>{fmtNum(row.orders)}</td>}
                                                    {visibleColumns.dsChot && <td>{fmtCurrency(row.dsChot)}</td>}
                                                    {visibleColumns.tiLeChot && <td className={`text-center ${getRateClass(row.tiLeChot)}`}>{fmtPct(row.tiLeChot)}</td>}
                                                    {visibleColumns.giaMess && <td>{fmtCurrency(row.giaMess)}</td>}
                                                    {visibleColumns.cps && <td className={getCpsCellStyle(row.cps)}>{fmtCurrency(row.cps)}</td>}
                                                    {visibleColumns.cp_ds && <td className={`text-center ${row.cp_ds > 33 ? 'bg-yellow' : ''}`}>{fmtPct(row.cp_ds)}</td>}
                                                    {visibleColumns.giaTBDon && <td>{fmtCurrency(row.giaTBDon)}</td>}
                                                    {visibleColumns.ordersTT && <td>{fmtNum(row.ordersTT)}</td>}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            )}

            {/* TAB 2: KPI Report */}
            {activeTab === 'KpiReport' && (
                <div className="table-responsive-container">
                    {loading ? (
                        <div style={{ padding: '20px', textAlign: 'center' }}>Đang tải dữ liệu...</div>
                    ) : (
                        <table className="report-table">
                            <thead>
                                <tr>
                                    <th className="pink-header">STT</th>
                                    <th className="pink-header">Team</th>
                                    <th className="pink-header">R&D Staff</th>
                                    <th className="pink-header">CPQC</th>
                                    <th className="pink-header">DS Chốt</th>
                                    <th className="blue-header">DS Chốt (TT)</th>
                                    <th className="blue-header">Số đơn hủy (TT)</th>
                                    <th className="blue-header">Doanh số Hủy (TT)</th>
                                    <th className="blue-header">DS Thành Công (TT)</th>
                                    <th className="yellow-header">%CP/DS</th>
                                    <th className="yellow-header">% KPI</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="total-row">
                                    <td colSpan={3} className="text-center">TỔNG CỘNG</td>
                                    <td>{fmtCurrency(processData.total.cpqc)}</td>
                                    <td>{fmtCurrency(processData.total.dsChot)}</td>
                                    <td>{fmtCurrency(processData.total.dsChotTT)}</td>
                                    <td>{fmtNum(processData.total.soDonHuyTT)}</td>
                                    <td>{fmtCurrency(processData.total.dsHuyTT)}</td>
                                    <td>{fmtCurrency(processData.total.dsThanhCongTT)}</td>
                                    <td>{fmtPct(processData.total.cp_ds_sau_ship)}</td>
                                    <td>{fmtPct(processData.total.kpi_percent)}</td>
                                </tr>
                                {processData.rows.map((row, index) => (
                                    <tr key={index}>
                                        <td className="text-center">{index + 1}</td>
                                        <td>{row.team}</td>
                                        <td>{row.name}</td>
                                        <td>{fmtCurrency(row.cpqc)}</td>
                                        <td>{fmtCurrency(row.dsChot)}</td>
                                        <td>{fmtCurrency(row.dsChotTT)}</td>
                                        <td>{fmtNum(row.soDonHuyTT)}</td>
                                        <td>{fmtCurrency(row.dsHuyTT)}</td>
                                        <td>{fmtCurrency(row.dsThanhCongTT)}</td>
                                        <td className="text-center">{fmtPct(row.cp_ds_sau_ship)}</td>
                                        <td className="text-center">{fmtPct(row.kpi_percent)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* TAB 3: Hieu Suat KPI */}
            {activeTab === 'HieuSuatKPI' && (
                <div style={{ width: '100%', height: 'calc(100vh - 100px)' }}>
                    <iframe
                        src="/baocaokpiCEO.html"
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        title="Hiệu suất KPI"
                    />
                </div>
            )}

            {/* TAB 4: Market Report */}
            {activeTab === 'MarketReport' && (
                <>
                    {renderMarketTable(processMarketData.nonAsia, 'THỊ TRƯỜNG NGOÀI CHÂU Á (R&D)')}
                    {renderMarketTable(processMarketData.asia, 'THỊ TRƯỜNG CHÂU Á (R&D)')}
                    {renderMarketTable(processMarketData.summary, 'TỔNG HỢP (R&D)')}
                </>
            )}

        </div>
    );
}
