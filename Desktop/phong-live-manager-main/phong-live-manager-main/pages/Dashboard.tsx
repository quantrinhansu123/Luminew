import React, { useState, useMemo, useEffect } from 'react';
import { fetchLiveReports, fetchStores } from '../services/dataService';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { formatCurrency, matchNames } from '../utils/formatUtils';
import { LiveReport, Store } from '../types';
import { isPartner, getPartnerId, isAdmin, getCurrentUserId, getCurrentUserName, isRegularEmployee, isTrungKhong } from '../utils/permissionUtils';

export const Dashboard: React.FC = () => {
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [stores, setStores] = useState<Store[]>([]);
  const [reports, setReports] = useState<LiveReport[]>([]);
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30); // 30 ngày trước
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  // Date filter for GMV chart
  const [chartDateFrom, setChartDateFrom] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  });
  const [chartDateTo, setChartDateTo] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [storeData, reportData] = await Promise.all([
        fetchStores(),
        fetchLiveReports()
      ]);
      
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
            filteredReports = reportData.filter(r => {
              // Sử dụng matchNames để xử lý khoảng trắng và ký tự đặc biệt
              return matchNames(r.hostName, currentUserName);
            });
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

  // Filter reports by store and date range
  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      const matchStore = selectedStore === 'all' || report.channelId === selectedStore;
      const reportDate = new Date(report.date);
      const fromDate = new Date(dateFrom);
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      const matchDate = reportDate >= fromDate && reportDate <= toDate;
      return matchStore && matchDate;
    });
  }, [reports, selectedStore, dateFrom, dateTo]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalGMV = filteredReports.reduce((sum, r) => sum + (Number(r.gmv) || 0), 0);
    const totalAdCost = filteredReports.reduce((sum, r) => sum + (Number(r.adCost) || 0), 0);
    const totalOrders = filteredReports.reduce((sum, r) => sum + (Number(r.orders) || 0), 0);
    const totalViews = filteredReports.reduce((sum, r) => sum + (Number(r.totalViews) || 0), 0);
    const roi = totalAdCost > 0 ? totalGMV / totalAdCost : 0;
    return { totalGMV, totalAdCost, totalOrders, totalViews, roi };
  }, [filteredReports]);

  // Chart data by date (for GMV chart with separate date filter)
  const gmvChartData = useMemo(() => {
    // Filter reports by chart date range
    const chartFilteredReports = reports.filter(report => {
      const matchStore = selectedStore === 'all' || report.channelId === selectedStore;
      const reportDate = new Date(report.date);
      const fromDate = new Date(chartDateFrom);
      const toDate = new Date(chartDateTo);
      toDate.setHours(23, 59, 59, 999);
      const matchDate = reportDate >= fromDate && reportDate <= toDate;
      return matchStore && matchDate;
    });

    const map: Record<string, { date: string; gmv: number; adCost: number }> = {};
    
    chartFilteredReports.forEach(report => {
      if (!map[report.date]) {
        map[report.date] = { 
          date: report.date, 
          gmv: 0, 
          adCost: 0
        };
      }
      map[report.date].gmv += Number(report.gmv) || 0;
      map[report.date].adCost += Number(report.adCost) || 0;
    });
    
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [reports, selectedStore, chartDateFrom, chartDateTo]);

  // Chart data by date (for other charts)
  const chartData = useMemo(() => {
    const map: Record<string, { date: string; gmv: number; adCost: number; profit: number; orders: number }> = {};
    
    filteredReports.forEach(report => {
      if (!map[report.date]) {
        map[report.date] = { 
          date: report.date, 
          gmv: 0, 
          adCost: 0, 
          profit: 0,
          orders: 0
        };
      }
      map[report.date].gmv += Number(report.gmv) || 0;
      map[report.date].adCost += Number(report.adCost) || 0;
      map[report.date].profit += (Number(report.gmv) || 0) - (Number(report.adCost) || 0);
      map[report.date].orders += Number(report.orders) || 0;
    });
    
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredReports]);

  // Chart data by store (if all stores selected)
  const storeChartData = useMemo(() => {
    if (selectedStore !== 'all') return [];
    
    const map: Record<string, { storeName: string; gmv: number; adCost: number; roi: number }> = {};
    
    filteredReports.forEach(report => {
      const store = stores.find(s => s.id === report.channelId);
      const storeName = store?.name || 'Unknown';
      
      if (!map[report.channelId]) {
        map[report.channelId] = { 
          storeName, 
          gmv: 0, 
          adCost: 0,
          roi: 0
        };
      }
      map[report.channelId].gmv += Number(report.gmv) || 0;
      map[report.channelId].adCost += Number(report.adCost) || 0;
    });
    
    // Calculate ROI for each store
    Object.keys(map).forEach(storeId => {
      const data = map[storeId];
      data.roi = data.adCost > 0 ? data.gmv / data.adCost : 0;
    });
    
    return Object.values(map).sort((a, b) => b.gmv - a.gmv);
  }, [filteredReports, stores, selectedStore]);


  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  };

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
        <h2 className="text-2xl font-bold text-gray-800 uppercase">Dashboard - Số Liệu Quan Trọng (仪表板 - 重要数据)</h2>
        <div className="flex gap-2 flex-wrap items-center">
          <select
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-navy bg-white shadow-sm"
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
          >
            <option value="all">Tất cả cửa hàng (所有店铺)</option>
            {stores.filter(s => s.id !== 'all').map(store => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
          <input
            type="date"
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-navy bg-white shadow-sm"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="text-gray-600">đến (至)</span>
          <input
            type="date"
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-navy bg-white shadow-sm"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-blue-500">
          <p className="text-xs text-gray-500 uppercase font-bold">Tổng GMV (总GMV)</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{formatCurrency(totals.totalGMV)}</p>
        </div>
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-red-500">
          <p className="text-xs text-gray-500 uppercase font-bold">Tổng Chi Phí QC (总广告费)</p>
          <p className="text-xl font-bold text-red-600 mt-1">{formatCurrency(totals.totalAdCost)}</p>
        </div>
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-green-500">
          <p className="text-xs text-gray-500 uppercase font-bold">ROI (投资回报率)</p>
          <p className="text-xl font-bold text-green-600 mt-1">{totals.roi.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-1">= GMV / CPQC</p>
        </div>
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-purple-500">
          <p className="text-xs text-gray-500 uppercase font-bold">Tổng Đơn Hàng (总订单)</p>
          <p className="text-xl font-bold text-purple-600 mt-1">{totals.totalOrders.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-orange-500">
          <p className="text-xs text-gray-500 uppercase font-bold">Tổng Lượt Xem (总浏览量)</p>
          <p className="text-xl font-bold text-orange-600 mt-1">{totals.totalViews.toLocaleString()}</p>
        </div>
      </div>

      {/* GMV Chart by Date */}
      <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <h3 className="text-lg font-bold text-gray-800">Biểu Đồ GMV Theo Thời Gian (GMV时间图表)</h3>
          <div className="flex gap-2 items-center flex-wrap">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Từ ngày (从日期):</label>
            <input
              type="date"
              value={chartDateFrom}
              onChange={(e) => setChartDateFrom(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-navy bg-white shadow-sm"
            />
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Đến ngày (至日期):</label>
            <input
              type="date"
              value={chartDateTo}
              onChange={(e) => setChartDateTo(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-navy bg-white shadow-sm"
            />
          </div>
        </div>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={gmvChartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis />
            <Tooltip 
              formatter={(value: number) => formatCurrency(value)}
              labelFormatter={(label) => `Ngày: ${formatDate(label)}`}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="gmv" 
              name="Doanh số (GMV) (销售额)" 
              stroke="#10b981" 
              strokeWidth={3}
              dot={{ fill: '#10b981', r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line 
              type="monotone" 
              dataKey="adCost" 
              name="Chi phí QC (广告费)" 
              stroke="#ef4444" 
              strokeWidth={3}
              dot={{ fill: '#ef4444', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* GMV Chart by Store (if all stores selected) */}
      {selectedStore === 'all' && storeChartData.length > 0 && (
        <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-4">GMV Theo Cửa Hàng (按店铺GMV)</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={storeChartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey="storeName" 
                angle={-45}
                textAnchor="end"
                height={100}
              />
              <YAxis />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="gmv" name="GMV" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="adCost" name="Chi phí QC (广告费)" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Orders Chart */}
      <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Biểu Đồ Đơn Hàng Theo Thời Gian (订单时间图表)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis />
            <Tooltip 
              formatter={(value: number) => value.toLocaleString()}
              labelFormatter={(label) => `Ngày (日期): ${formatDate(label)}`}
            />
            <Legend />
            <Line type="monotone" dataKey="orders" name="Số đơn hàng (订单数)" stroke="#8b5cf6" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

