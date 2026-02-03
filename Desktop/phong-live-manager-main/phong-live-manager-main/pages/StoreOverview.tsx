import React, { useState, useMemo, useEffect } from 'react';
import { fetchLiveReports, fetchStores } from '../services/dataService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency, matchNames } from '../utils/formatUtils';
import { LiveReport, Store, StoreOverview } from '../types';
import { isPartner, getPartnerId, isAdmin, getCurrentUserName, isRegularEmployee, isTrungKhong } from '../utils/permissionUtils';

export const StoreOverviewPage: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [reports, setReports] = useState<LiveReport[]>([]);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      let [storeData, reportData] = await Promise.all([
        fetchStores(),
        fetchLiveReports()
      ]);
      
      // Nếu là nhân viên có department "Đối tác", chỉ hiển thị stores được gán cho họ
      if (isPartner() && !isAdmin()) {
        const partnerId = getPartnerId();
        if (partnerId) {
          storeData = storeData.filter(s => s.partnerId === partnerId);
          const allowedStoreIds = storeData.map(s => s.id);
          reportData = reportData.filter(r => allowedStoreIds.includes(r.channelId));
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
            reportData = reportData.filter(r => matchNames(r.hostName, currentUserName));
          }
        }
      }
      
      const filteredStores = storeData.filter(s => s.id !== 'all');
      setStores(filteredStores);
      setReports(reportData);
      // Select all stores by default
      setSelectedStores(filteredStores.map(s => s.id));
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter reports by selected stores and date range
  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      const matchStore = selectedStores.length === 0 || selectedStores.includes(report.channelId);
      const reportDate = new Date(report.date);
      const fromDate = new Date(dateFrom);
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      const matchDate = reportDate >= fromDate && reportDate <= toDate;
      return matchStore && matchDate;
    });
  }, [reports, selectedStores, dateFrom, dateTo]);

  // Calculate overview for each store
  const storeOverviews = useMemo(() => {
    const overviewMap: Record<string, StoreOverview> = {};

    stores.forEach(store => {
      if (selectedStores.length === 0 || selectedStores.includes(store.id)) {
        overviewMap[store.id] = {
          storeId: store.id,
          storeName: store.name,
          totalGMV: 0,
          totalAdCost: 0,
          totalOrders: 0,
          totalViews: 0,
          roi: 0,
          conversionRate: 0,
          reportCount: 0
        };
      }
    });

    filteredReports.forEach(report => {
      const storeId = report.channelId;
      if (overviewMap[storeId]) {
        overviewMap[storeId].totalGMV += Number(report.gmv) || 0;
        overviewMap[storeId].totalAdCost += Number(report.adCost) || 0;
        overviewMap[storeId].totalOrders += Number(report.orders) || 0;
        overviewMap[storeId].totalViews += Number(report.totalViews) || 0;
        overviewMap[storeId].reportCount += 1;
      }
    });

    // Calculate ROI and conversion rate
    Object.values(overviewMap).forEach(overview => {
      overview.roi = overview.totalAdCost > 0 
        ? overview.totalGMV / overview.totalAdCost 
        : 0;
      
      const storeReports = filteredReports.filter(r => r.channelId === overview.storeId);
      const totalClicks = storeReports.reduce((sum, r) => sum + (Number(r.productClicks) || Number(r.viewers) || 0), 0);
      overview.conversionRate = totalClicks > 0 ? (overview.totalOrders / totalClicks) * 100 : 0;
    });

    return Object.values(overviewMap).sort((a, b) => b.totalGMV - a.totalGMV);
  }, [stores, selectedStores, filteredReports]);

  // Chart data
  const chartData = useMemo(() => {
    return storeOverviews.map(overview => ({
      name: overview.storeName,
      gmv: overview.totalGMV,
      adCost: overview.totalAdCost,
      profit: overview.totalGMV - overview.totalAdCost,
      roi: overview.roi,
      orders: overview.totalOrders,
      views: overview.totalViews
    }));
  }, [storeOverviews]);


  const handleStoreToggle = (storeId: string) => {
    setSelectedStores(prev => {
      if (prev.includes(storeId)) {
        return prev.filter(id => id !== storeId);
      } else {
        return [...prev, storeId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedStores.length === stores.length) {
      setSelectedStores([]);
    } else {
      setSelectedStores(stores.map(s => s.id));
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Đang tải dữ liệu... (正在加载数据...)</div>
      </div>
    );
  }

  const totalGMV = storeOverviews.reduce((sum, s) => sum + s.totalGMV, 0);
  const totalAdCost = storeOverviews.reduce((sum, s) => sum + s.totalAdCost, 0);
  const totalOrders = storeOverviews.reduce((sum, s) => sum + s.totalOrders, 0);
  const totalViews = storeOverviews.reduce((sum, s) => sum + s.totalViews, 0);
  const avgROI = storeOverviews.length > 0 
    ? storeOverviews.reduce((sum, s) => sum + s.roi, 0) / storeOverviews.length 
    : 0;

  const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800 uppercase">Tổng Quan Tất Cả Cửa Hàng (所有店铺总览)</h2>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex items-center gap-2 border border-gray-300 rounded px-3 py-2 bg-white">
            <button
              onClick={handleSelectAll}
                className="text-sm font-medium text-brand-navy hover:underline"
            >
              {selectedStores.length === stores.length ? 'Bỏ chọn tất cả (取消全选)' : 'Chọn tất cả (全选)'}
            </button>
          </div>
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

      {/* Store Selection */}
      <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
        <h3 className="text-sm font-bold text-gray-800 mb-3">Chọn cửa hàng: (选择店铺:)</h3>
        <div className="flex flex-wrap gap-2">
          {stores.map(store => (
            <label key={store.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedStores.includes(store.id)}
                onChange={() => handleStoreToggle(store.id)}
                className="w-4 h-4 text-brand-navy border-gray-300 rounded focus:ring-brand-navy"
              />
              <span className="text-sm text-gray-700">{store.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-blue-500">
          <p className="text-xs text-gray-500 uppercase font-bold">Tổng GMV (总GMV)</p>
          <p className="text-xl font-bold text-blue-600 mt-1">{formatCurrency(totalGMV)}</p>
        </div>
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-red-500">
          <p className="text-xs text-gray-500 uppercase font-bold">Tổng Chi Phí QC (总广告费)</p>
          <p className="text-xl font-bold text-red-600 mt-1">{formatCurrency(totalAdCost)}</p>
        </div>
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-green-500">
          <p className="text-xs text-gray-500 uppercase font-bold">ROI Trung Bình (平均ROI)</p>
          <p className="text-xl font-bold text-green-600 mt-1">{avgROI.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-1">= GMV / CPQC</p>
        </div>
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-purple-500">
          <p className="text-xs text-gray-500 uppercase font-bold">Tổng Đơn Hàng (总订单)</p>
          <p className="text-xl font-bold text-purple-600 mt-1">{totalOrders.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-orange-500">
          <p className="text-xs text-gray-500 uppercase font-bold">Tổng Lượt Xem (总浏览量)</p>
          <p className="text-xl font-bold text-orange-600 mt-1">{totalViews.toLocaleString()}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GMV by Store */}
        <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-4">GMV Theo Cửa Hàng (按店铺GMV)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="gmv" name="GMV" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="adCost" name="Chi phí QC (广告费)" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ROI by Store */}
        <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-4">ROI Theo Cửa Hàng (按店铺ROI)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip formatter={(value: number) => value.toFixed(2)} />
              <Legend />
              <Bar dataKey="roi" name="ROI" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* GMV Distribution */}
        <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Phân Bố GMV (GMV分布)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="gmv"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Orders by Store */}
        <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Đơn Hàng Theo Cửa Hàng (按店铺订单)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip formatter={(value: number) => value.toLocaleString()} />
              <Legend />
              <Bar dataKey="orders" name="Số đơn hàng (订单数)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Store Overview Table */}
      <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-bold text-gray-800">Chi Tiết Cửa Hàng (店铺详情)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy text-white border-b">
              <tr>
                <th className="px-4 py-3 text-left">Cửa hàng (店铺)</th>
                <th className="px-4 py-3 text-right">Tổng GMV (总GMV)</th>
                <th className="px-4 py-3 text-right">Chi phí QC (广告费)</th>
                <th className="px-4 py-3 text-right">Lợi nhuận (利润)</th>
                <th className="px-4 py-3 text-right">ROI (投资回报率)</th>
                <th className="px-4 py-3 text-right">Tỉ lệ chuyển đổi (转化率)</th>
                <th className="px-4 py-3 text-right">Đơn hàng (订单)</th>
                <th className="px-4 py-3 text-right">Lượt xem (浏览量)</th>
                <th className="px-4 py-3 text-center">Số báo cáo (报告数)</th>
              </tr>
            </thead>
            <tbody>
              {storeOverviews.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    Chưa có dữ liệu (暂无数据)
                  </td>
                </tr>
              ) : (
                storeOverviews.map((overview) => (
                  <tr key={overview.storeId} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-bold text-gray-800">{overview.storeName}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">{formatCurrency(overview.totalGMV)}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrency(overview.totalAdCost)}</td>
                    <td className="px-4 py-3 text-right font-bold text-green-600">
                      {formatCurrency(overview.totalGMV - overview.totalAdCost)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`px-2 py-1 rounded text-xs font-bold border ${
                        overview.roi >= 4 ? 'bg-green-100 text-green-800 border-green-300' :
                        overview.roi >= 2 ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                        'bg-red-100 text-red-800 border-red-300'
                      }`}>
                        {overview.roi.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">
                        {overview.conversionRate.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{overview.totalOrders.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-medium">{overview.totalViews.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center font-medium">{overview.reportCount}</td>
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

