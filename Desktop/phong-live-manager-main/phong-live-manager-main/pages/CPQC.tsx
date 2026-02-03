import React, { useState, useMemo, useEffect } from 'react';
import { fetchLiveReports, fetchStores, fetchPersonnel } from '../services/dataService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, ComposedChart } from 'recharts';
import { FilterBar } from '../components/FilterBar';
import { exportToExcel, importFromExcel } from '../utils/excelUtils';
import { formatCurrency, matchNames } from '../utils/formatUtils';
import { LiveReport, Store } from '../types';
import { isPartner, getPartnerId, isAdmin, getCurrentUserName, isRegularEmployee, isTrungKhong } from '../utils/permissionUtils';

export const CPQC: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [reports, setReports] = useState<LiveReport[]>([]);
  const [allReports, setAllReports] = useState<LiveReport[]>([]); // Lưu toàn bộ reports không filter
  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [viewMode, setViewMode] = useState<'day' | 'shift'>('day');
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [storeData, reportData, personnelData] = await Promise.all([
        fetchStores(),
        fetchLiveReports(),
        fetchPersonnel()
      ]);
      
      // Lưu toàn bộ reports không filter
      setAllReports(reportData);
      setPersonnelList(personnelData);
      
      // Nếu là nhân viên có department "Đối tác", chỉ hiển thị stores được gán cho họ
      let filteredStores = storeData;
      let filteredReports = reportData;
      
      if (isPartner() && !isAdmin()) {
        const partnerId = getPartnerId();
        if (partnerId) {
          filteredStores = storeData.filter(s => s.partnerId === partnerId);
          const allowedStoreIds = filteredStores.map(s => s.id);
          filteredReports = reportData.filter(r => allowedStoreIds.includes(r.channelId));
        }
      } else if (isRegularEmployee()) {
        // Nếu là TRỢ LIVE 中控 thì xem tất cả data được cấp quyền, không filter theo hostName
        if (isTrungKhong()) {
          // TRỢ LIVE 中控 xem tất cả data (không filter theo hostName)
          // Data đã được filter theo menu permissions và department/store permissions
        } else {
          // Nhân viên thường chỉ thấy data của chính mình (dựa trên hostName)
          const currentUserName = getCurrentUserName();
          if (currentUserName) {
            filteredReports = reportData.filter(r => matchNames(r.hostName, currentUserName));
          }
        }
      }
      
      setStores(filteredStores);
      setReports(filteredReports);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter reports
  const filteredReports = useMemo(() => {
    let filtered = reports;

    // Filter by date range
    filtered = filtered.filter(report => {
      const reportDate = new Date(report.date);
      const fromDate = new Date(dateFrom);
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      return reportDate >= fromDate && reportDate <= toDate;
    });

    // Filter by selected filters
    if (selectedFilters.stores && selectedFilters.stores.length > 0) {
      filtered = filtered.filter(item => selectedFilters.stores!.includes(item.channelId));
    }
    if (selectedFilters.hosts && selectedFilters.hosts.length > 0) {
      filtered = filtered.filter(item => selectedFilters.hosts!.includes(item.hostName));
    }
    if (selectedFilters.shifts && selectedFilters.shifts.length > 0) {
      filtered = filtered.filter(item => item.shift && selectedFilters.shifts!.includes(item.shift));
    }
    if (selectedFilters.customerGroups && selectedFilters.customerGroups.length > 0) {
      filtered = filtered.filter(item => item.customerGroup && selectedFilters.customerGroups!.includes(item.customerGroup));
    }
    if (selectedFilters.sources && selectedFilters.sources.length > 0) {
      filtered = filtered.filter(item => item.source && selectedFilters.sources!.includes(item.source));
    }
    if (selectedFilters.salesPersons && selectedFilters.salesPersons.length > 0) {
      filtered = filtered.filter(item => item.salesPerson && selectedFilters.salesPersons!.includes(item.salesPerson));
    }
    if (selectedFilters.callCounts && selectedFilters.callCounts.length > 0) {
      filtered = filtered.filter(item => item.callCount !== undefined && selectedFilters.callCounts!.includes(item.callCount.toString()));
    }
    if (selectedFilters.statuses && selectedFilters.statuses.length > 0) {
      filtered = filtered.filter(item => item.status && selectedFilters.statuses!.includes(item.status));
    }

    // Search filter
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(item => {
        const storeName = stores.find(s => s.id === item.channelId)?.name || '';
        return (
          item.date.toLowerCase().includes(searchLower) ||
          storeName.toLowerCase().includes(searchLower) ||
          item.hostName.toLowerCase().includes(searchLower) ||
          item.customerGroup?.toLowerCase().includes(searchLower) ||
          item.source?.toLowerCase().includes(searchLower) ||
          item.salesPerson?.toLowerCase().includes(searchLower) ||
          item.status?.toLowerCase().includes(searchLower) ||
          item.gmv.toString().includes(searchLower) ||
          item.adCost.toString().includes(searchLower)
        );
      });
    }

    return filtered;
  }, [reports, dateFrom, dateTo, selectedFilters, searchText, stores]);

  // CPQC Data by Day
  const cpqcByDay = useMemo(() => {
    const map: Record<string, {
      date: string;
      adCost: number;
      gmv: number;
      orders: number;
      conversionRate: number;
      roi: number;
      reportCount: number;
    }> = {};

    filteredReports.forEach(report => {
      if (!map[report.date]) {
        map[report.date] = {
          date: report.date,
          adCost: 0,
          gmv: 0,
          orders: 0,
          conversionRate: 0,
          roi: 0,
          reportCount: 0
        };
      }
      map[report.date].adCost += Number(report.adCost) || 0;
      map[report.date].gmv += Number(report.gmv) || 0;
      map[report.date].orders += Number(report.orders) || 0;
      map[report.date].reportCount += 1;
    });

    // Calculate ROI and conversion rate
    Object.values(map).forEach(day => {
      day.roi = day.adCost > 0 ? day.gmv / day.adCost : 0;
      day.conversionRate = day.orders > 0 && filteredReports.length > 0 
        ? (day.orders / filteredReports.filter(r => r.date === day.date).reduce((sum, r) => sum + (Number(r.productClicks) || Number(r.viewers) || 0), 0)) * 100 
        : 0;
    });

    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredReports]);

  // CPQC Data by Shift
  const cpqcByShift = useMemo(() => {
    const map: Record<string, {
      shift: string;
      adCost: number;
      gmv: number;
      orders: number;
      conversionRate: number;
      roi: number;
      reportCount: number;
    }> = {};

    filteredReports.forEach(report => {
      const shift = report.shift || 'Chưa xác định';
      if (!map[shift]) {
        map[shift] = {
          shift,
          adCost: 0,
          gmv: 0,
          orders: 0,
          conversionRate: 0,
          roi: 0,
          reportCount: 0
        };
      }
      map[shift].adCost += Number(report.adCost) || 0;
      map[shift].gmv += Number(report.gmv) || 0;
      map[shift].orders += Number(report.orders) || 0;
      map[shift].reportCount += 1;
    });

    // Calculate ROI and conversion rate
    Object.values(map).forEach(shiftData => {
      shiftData.roi = shiftData.adCost > 0 ? shiftData.gmv / shiftData.adCost : 0;
      const shiftReports = filteredReports.filter(r => (r.shift || 'Chưa xác định') === shiftData.shift);
      const totalClicks = shiftReports.reduce((sum, r) => sum + (Number(r.productClicks) || Number(r.viewers) || 0), 0);
      shiftData.conversionRate = totalClicks > 0 ? (shiftData.orders / totalClicks) * 100 : 0;
    });

    return Object.values(map).sort((a, b) => {
      const order = ['Sáng', 'Chiều', 'Tối', 'Chưa xác định'];
      return order.indexOf(a.shift) - order.indexOf(b.shift);
    });
  }, [filteredReports]);

  // Hotlive Ranking
  const hotliveRanking = useMemo(() => {
    const map: Record<string, {
      hostName: string;
      storeName: string;
      totalAdCost: number;
      totalGMV: number;
      totalOrders: number;
      roi: number;
      conversionRate: number;
      reportCount: number;
      score: number; // Combined score for ranking
    }> = {};

    filteredReports.forEach(report => {
      const key = `${report.hostName}_${report.channelId}`;
      if (!map[key]) {
        const store = stores.find(s => s.id === report.channelId);
        map[key] = {
          hostName: report.hostName,
          storeName: store?.name || 'Unknown',
          totalAdCost: 0,
          totalGMV: 0,
          totalOrders: 0,
          roi: 0,
          conversionRate: 0,
          reportCount: 0,
          score: 0
        };
      }
      map[key].totalAdCost += Number(report.adCost) || 0;
      map[key].totalGMV += Number(report.gmv) || 0;
      map[key].totalOrders += Number(report.orders) || 0;
      map[key].reportCount += 1;
    });

    // Calculate metrics and score
    Object.values(map).forEach(item => {
      item.roi = item.totalAdCost > 0 ? item.totalGMV / item.totalAdCost : 0;
      const hostReports = filteredReports.filter(r => r.hostName === item.hostName && r.channelId === item.storeName);
      const totalClicks = hostReports.reduce((sum, r) => sum + (Number(r.productClicks) || Number(r.viewers) || 0), 0);
      item.conversionRate = totalClicks > 0 ? (item.totalOrders / totalClicks) * 100 : 0;
      
      // Score = ROI * 0.4 + ConversionRate * 0.3 + (GMV/1000000) * 0.3
      item.score = (item.roi * 0.4) + (item.conversionRate * 0.3) + ((item.totalGMV / 1000000) * 0.3);
    });

    return Object.values(map)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); // Top 10
  }, [filteredReports, stores]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  };

  const currentData = viewMode === 'day' ? cpqcByDay : cpqcByShift;
  const dataKey = viewMode === 'day' ? 'date' : 'shift';

  if (isLoading) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Đang tải dữ liệu... (正在加载数据...)</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800 uppercase">CPQC - Chi Phí Quản Lý Chất Lượng (CPQC - 质量管理成本)</h2>
        <div className="flex gap-2 border border-gray-300 rounded overflow-hidden">
          <button
            onClick={() => setViewMode('day')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              viewMode === 'day' 
                ? 'bg-brand-navy text-white' 
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Theo Ngày (按日)
          </button>
          <button
            onClick={() => setViewMode('shift')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              viewMode === 'shift' 
                ? 'bg-brand-navy text-white' 
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Theo Ca (按班次)
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        onSearch={setSearchText}
        onExportExcel={() => {
          const exportData = viewMode === 'day' 
            ? cpqcByDay.map(item => ({
                'Ngày': item.date,
                'Chi phí QC': item.adCost,
                'GMV': item.gmv,
                'Đơn hàng': item.orders,
                'ROI': item.roi.toFixed(2),
                'Tỉ lệ chuyển đổi': item.conversionRate.toFixed(2) + '%',
                'Số báo cáo': item.reportCount
              }))
            : cpqcByShift.map(item => ({
                'Ca': item.shift,
                'Chi phí QC': item.adCost,
                'GMV': item.gmv,
                'Đơn hàng': item.orders,
                'ROI': item.roi.toFixed(2),
                'Tỉ lệ chuyển đổi': item.conversionRate.toFixed(2) + '%',
                'Số báo cáo': item.reportCount
              }));
          exportToExcel(exportData, `cpqc-${viewMode}-${new Date().toISOString().split('T')[0]}.xlsx`);
        }}
        onImportExcel={async (file) => {
          try {
            const data = await importFromExcel(file);
            alert(`Đã import ${data.length} bản ghi từ Excel.`);
          } catch (error) {
            alert('Lỗi khi import Excel: ' + (error as Error).message);
          }
        }}
        onReset={() => {
          setSearchText('');
          setSelectedFilters({});
          const date = new Date();
          date.setDate(date.getDate() - 30);
          setDateFrom(date.toISOString().split('T')[0]);
          setDateTo(new Date().toISOString().split('T')[0]);
        }}
        filterFields={[
          {
            key: 'stores',
            label: 'Cửa hàng',
            type: 'checkbox',
            options: stores.filter(s => s.id !== 'all').map(s => ({ value: s.id, label: s.name }))
          },
          {
            key: 'hosts',
            label: 'Host',
            type: 'checkbox',
            // Lấy từ allReports và personnelList để có đầy đủ danh sách host, không phụ thuộc vào reports đã filter
            options: Array.from(new Set([
              ...allReports.map(r => r.hostName).filter(Boolean),
              ...personnelList.map(p => p.fullName).filter(Boolean)
            ])).sort().map(host => ({ value: host, label: host }))
          },
          {
            key: 'shifts',
            label: 'Ca',
            type: 'checkbox',
            options: [
              { value: 'Sáng', label: 'Sáng' },
              { value: 'Chiều', label: 'Chiều' },
              { value: 'Tối', label: 'Tối' }
            ]
          },
          {
            key: 'customerGroups',
            label: 'Nhóm KH',
            type: 'checkbox',
            options: Array.from(new Set(reports.map(r => r.customerGroup).filter(Boolean))).map(group => ({ value: group!, label: group! }))
          },
          {
            key: 'sources',
            label: 'Nguồn tới',
            type: 'checkbox',
            options: Array.from(new Set(reports.map(r => r.source).filter(Boolean))).map(source => ({ value: source!, label: source! }))
          },
          {
            key: 'salesPersons',
            label: 'NV sale',
            type: 'checkbox',
            options: Array.from(new Set(reports.map(r => r.salesPerson).filter(Boolean))).map(sales => ({ value: sales!, label: sales! }))
          },
          {
            key: 'callCounts',
            label: 'Lần gọi',
            type: 'checkbox',
            options: Array.from(new Set(reports.map(r => r.callCount).filter(c => c !== undefined))).sort((a, b) => Number(a || 0) - Number(b || 0)).map(count => ({ value: count!.toString(), label: count!.toString() }))
          },
          {
            key: 'statuses',
            label: 'Trạng thái',
            type: 'checkbox',
            options: Array.from(new Set(reports.map(r => r.status).filter(Boolean))).map(status => ({ value: status!, label: status! }))
          }
        ]}
        selectedFilters={selectedFilters}
        onFilterChange={(field, values) => {
          setSelectedFilters(prev => ({ ...prev, [field]: values }));
        }}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onQuickDateSelect={(from, to) => {
          setDateFrom(from);
          setDateTo(to);
        }}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-red-500">
          <p className="text-xs text-gray-500 uppercase font-bold">Tổng Chi Phí QC (总广告费)</p>
          <p className="text-xl font-bold text-red-600 mt-1">
            {formatCurrency(currentData.reduce((sum, item) => sum + item.adCost, 0))}
          </p>
        </div>
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-blue-500">
          <p className="text-xs text-gray-500 uppercase font-bold">Tổng GMV (总GMV)</p>
          <p className="text-xl font-bold text-blue-600 mt-1">
            {formatCurrency(currentData.reduce((sum, item) => sum + item.gmv, 0))}
          </p>
        </div>
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-green-500">
          <p className="text-xs text-gray-500 uppercase font-bold">ROI Trung Bình (平均ROI)</p>
          <p className="text-xl font-bold text-green-600 mt-1">
            {currentData.length > 0 
              ? (currentData.reduce((sum, item) => sum + item.roi, 0) / currentData.length).toFixed(2)
              : '0'
            }
          </p>
          <p className="text-xs text-gray-400 mt-1">= GMV / CPQC</p>
        </div>
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-purple-500">
          <p className="text-xs text-gray-500 uppercase font-bold">Tỉ Lệ Chuyển Đổi TB (平均转化率)</p>
          <p className="text-xl font-bold text-purple-600 mt-1">
            {currentData.length > 0 
              ? (currentData.reduce((sum, item) => sum + item.conversionRate, 0) / currentData.length).toFixed(2)
              : '0'
            }%
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chi phí Chart */}
        <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Chi Phí QC (广告费) {viewMode === 'day' ? 'Theo Ngày (按日)' : 'Theo Ca (按班次)'}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={currentData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey={dataKey} 
                tickFormatter={viewMode === 'day' ? formatDate : undefined}
                angle={viewMode === 'day' ? -45 : 0}
                textAnchor={viewMode === 'day' ? 'end' : 'middle'}
                height={viewMode === 'day' ? 80 : 40}
              />
              <YAxis />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="adCost" name="Chi phí QC (广告费)" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ROI Chart */}
        <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-4">ROI (投资回报率) {viewMode === 'day' ? 'Theo Ngày (按日)' : 'Theo Ca (按班次)'}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={currentData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey={dataKey} 
                tickFormatter={viewMode === 'day' ? formatDate : undefined}
                angle={viewMode === 'day' ? -45 : 0}
                textAnchor={viewMode === 'day' ? 'end' : 'middle'}
                height={viewMode === 'day' ? 80 : 40}
              />
              <YAxis />
              <Tooltip formatter={(value: number) => value.toFixed(2)} />
              <Legend />
              <Line type="monotone" dataKey="roi" name="ROI (投资回报率)" stroke="#10b981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Conversion Rate Chart */}
        <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Tỉ Lệ Chuyển Đổi (转化率) {viewMode === 'day' ? 'Theo Ngày (按日)' : 'Theo Ca (按班次)'}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={currentData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey={dataKey} 
                tickFormatter={viewMode === 'day' ? formatDate : undefined}
                angle={viewMode === 'day' ? -45 : 0}
                textAnchor={viewMode === 'day' ? 'end' : 'middle'}
                height={viewMode === 'day' ? 80 : 40}
              />
              <YAxis />
              <Tooltip formatter={(value: number) => `${value.toFixed(2)}%`} />
              <Legend />
              <Line type="monotone" dataKey="conversionRate" name="Tỉ lệ chuyển đổi (%) (转化率)" stroke="#8b5cf6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Combined Chart */}
        <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Tổng Hợp (汇总) {viewMode === 'day' ? 'Theo Ngày (按日)' : 'Theo Ca (按班次)'}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={currentData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey={dataKey} 
                tickFormatter={viewMode === 'day' ? formatDate : undefined}
                angle={viewMode === 'day' ? -45 : 0}
                textAnchor={viewMode === 'day' ? 'end' : 'middle'}
                height={viewMode === 'day' ? 80 : 40}
              />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip 
                formatter={(value: number, name: string) => {
                  if (name === 'Chi phí QC' || name === 'GMV') return formatCurrency(value);
                  return `${value.toFixed(2)}%`;
                }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="adCost" name="Chi phí QC (广告费)" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="left" dataKey="gmv" name="GMV (交易额)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="roi" name="ROI (投资回报率)" stroke="#10b981" strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="conversionRate" name="Tỉ lệ chuyển đổi (%) (转化率)" stroke="#8b5cf6" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Hotlive Ranking */}
      <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-bold text-gray-800">Xếp Hạng Hotlive (Hotlive排名)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy text-white border-b">
              <tr className="text-white">
                <th className="px-4 py-3 text-left">Hạng (排名)</th>
                <th className="px-4 py-3 text-left">Host (主播)</th>
                <th className="px-4 py-3 text-left">Cửa hàng (店铺)</th>
                <th className="px-4 py-3 text-right">Tổng GMV (总GMV)</th>
                <th className="px-4 py-3 text-right">Chi phí QC (广告费)</th>
                <th className="px-4 py-3 text-right">ROI (投资回报率)</th>
                <th className="px-4 py-3 text-right">Tỉ lệ chuyển đổi (转化率)</th>
                <th className="px-4 py-3 text-right">Điểm số (分数)</th>
              </tr>
            </thead>
            <tbody>
              {hotliveRanking.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    Chưa có dữ liệu (暂无数据)
                  </td>
                </tr>
              ) : (
                hotliveRanking.map((item, index) => (
                  <tr key={`${item.hostName}_${item.storeName}`} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                        index === 0 ? 'bg-yellow-100 text-yellow-800' :
                        index === 1 ? 'bg-gray-100 text-gray-800' :
                        index === 2 ? 'bg-orange-100 text-orange-800' :
                        'bg-gray-50 text-gray-600'
                      }`}>
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{item.hostName}</td>
                    <td className="px-4 py-3 text-gray-600">{item.storeName}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">{formatCurrency(item.totalGMV)}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrency(item.totalAdCost)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        item.roi >= 4 ? 'bg-green-100 text-green-800' :
                        item.roi >= 2 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {item.roi.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">
                        {item.conversionRate.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-800">{item.score.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-bold text-gray-800">Chi Tiết CPQC {viewMode === 'day' ? 'Theo Ngày (按日详情)' : 'Theo Ca (按班次详情)'}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy text-white border-b">
              <tr>
                <th className="px-4 py-3 text-left">{viewMode === 'day' ? 'Ngày (日期)' : 'Ca (班次)'}</th>
                <th className="px-4 py-3 text-right">Chi phí QC (广告费)</th>
                <th className="px-4 py-3 text-right">GMV (交易额)</th>
                <th className="px-4 py-3 text-right">Đơn hàng (订单数)</th>
                <th className="px-4 py-3 text-right">ROI (投资回报率)</th>
                <th className="px-4 py-3 text-right">Tỉ lệ chuyển đổi (转化率)</th>
                <th className="px-4 py-3 text-center">Số báo cáo (报告数)</th>
              </tr>
            </thead>
            <tbody>
              {currentData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Chưa có dữ liệu (暂无数据)
                  </td>
                </tr>
              ) : (
                currentData.map((item, index) => (
                  <tr key={index} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {viewMode === 'day' ? formatDate(item.date) : item.shift}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrency(item.adCost)}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">{formatCurrency(item.gmv)}</td>
                    <td className="px-4 py-3 text-right">{item.orders.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        item.roi >= 4 ? 'bg-green-100 text-green-800' :
                        item.roi >= 2 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {item.roi.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">
                        {item.conversionRate.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">{item.reportCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

