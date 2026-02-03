import React, { useState, useEffect, useMemo } from 'react';
import { Store, Personnel, LiveReport } from '../types';
import { fetchPersonnel, fetchLiveReports, MOCK_STORES, MOCK_AD_DATA, MOCK_VIDEO_METRICS } from '../services/dataService';
import { AdShiftData, VideoMetric } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Bar, BarChart } from 'recharts';
import { FilterBar } from '../components/FilterBar';
import { exportToExcel, importFromExcel } from '../utils/excelUtils';
import { formatCurrency } from '../utils/formatUtils';

interface StoreDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: Store | null;
}

export const StoreDetailModal: React.FC<StoreDetailModalProps> = ({ isOpen, onClose, store }) => {
  const [activeTab, setActiveTab] = useState<'personnel' | 'metrics' | 'history'>('personnel');
  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
  const [liveReports, setLiveReports] = useState<LiveReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Filter states for history tab
  const [historySearchText, setHistorySearchText] = useState('');
  const [historySelectedFilters, setHistorySelectedFilters] = useState<Record<string, string[]>>({});
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [historyDateFrom, setHistoryDateFrom] = useState<string>(firstDayOfMonth.toISOString().split('T')[0]);
  const [historyDateTo, setHistoryDateTo] = useState<string>(today.toISOString().split('T')[0]);

  useEffect(() => {
    if (isOpen && store) {
      loadData();
    }
  }, [isOpen, store]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [personnel, reports] = await Promise.all([
        fetchPersonnel(),
        fetchLiveReports()
      ]);
      setPersonnelList(personnel);
      setLiveReports(reports);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Lấy nhân sự phụ trách từ store.personnelIds hoặc từ các báo cáo
  const responsiblePersonnel = useMemo(() => {
    if (!store) return [];
    
    // Ưu tiên lấy từ store.personnelIds nếu có
    if (store.personnelIds && store.personnelIds.length > 0) {
      return personnelList.filter(person => 
        store.personnelIds!.includes(person.id || '')
      );
    }
    
    // Fallback: Lấy từ các báo cáo của cửa hàng
    const reporters = liveReports
      .filter(report => report.channelId === store.id && report.reporter)
      .map(report => report.reporter!)
      .filter((value, index, self) => self.indexOf(value) === index); // unique
    
    // Tìm nhân sự tương ứng
    return personnelList.filter(person => 
      reporters.some(reporter => 
        person.fullName.toLowerCase().includes(reporter.toLowerCase()) ||
        person.email?.toLowerCase().includes(reporter.toLowerCase())
      )
    );
  }, [store, liveReports, personnelList]);

  // Tính toán chỉ số cửa hàng
  const storeMetrics = useMemo(() => {
    if (!store) return null;

    const storeReports = liveReports.filter(r => r.channelId === store.id);
    const storeAdData = MOCK_AD_DATA.filter(a => a.storeId === store.id);
    const storeVideos = MOCK_VIDEO_METRICS.filter(v => v.storeId === store.id);

    const totalGMV = storeReports.reduce((sum, r) => sum + (Number(r.gmv) || 0), 0);
    const totalAdCost = storeReports.reduce((sum, r) => sum + (Number(r.adCost) || 0), 0);
    const totalOrders = storeReports.reduce((sum, r) => sum + (Number(r.orders) || 0), 0);
    const totalViews = storeReports.reduce((sum, r) => sum + (Number(r.totalViews) || 0), 0);
    const totalViewers = storeReports.reduce((sum, r) => sum + (Number(r.viewers) || 0), 0);
    const videoViews = storeVideos.reduce((sum, v) => sum + (v.views || 0), 0);
    const videoSales = storeVideos.reduce((sum, v) => sum + (v.sales || 0), 0);
    
    const roi = totalAdCost > 0 ? totalGMV / totalAdCost : 0;
    const avgOrderValue = totalOrders > 0 ? totalGMV / totalOrders : 0;

    return {
      totalGMV,
      totalAdCost,
      totalOrders,
      totalViews,
      totalViewers,
      videoViews,
      videoSales,
      roi,
      avgOrderValue,
      reportCount: storeReports.length,
      videoCount: storeVideos.length
    };
  }, [store, liveReports]);

  // Chart data theo thời gian
  const chartData = useMemo(() => {
    if (!store) return [];
    
    const storeReports = liveReports.filter(r => r.channelId === store.id);
    const map: Record<string, { 
      date: string; 
      gmv: number; 
      adCost: number; 
      roi: number; 
      orders: number;
      totalViews: number;
      totalViewers: number;
      avgOrderValue: number;
      reportCount: number;
    }> = {};
    
    storeReports.forEach(report => {
      if (!map[report.date]) {
        map[report.date] = { 
          date: report.date, 
          gmv: 0, 
          adCost: 0,
          roi: 0,
          orders: 0,
          totalViews: 0,
          totalViewers: 0,
          avgOrderValue: 0,
          reportCount: 0
        };
      }
      map[report.date].gmv += Number(report.gmv) || 0;
      map[report.date].adCost += Number(report.adCost) || 0;
      map[report.date].orders += Number(report.orders) || 0;
      map[report.date].totalViews += Number(report.totalViews) || 0;
      map[report.date].totalViewers += Number(report.viewers) || 0;
      map[report.date].reportCount += 1;
    });
    
    // Calculate ROI and avgOrderValue for each date
    Object.keys(map).forEach(date => {
      const data = map[date];
      data.roi = data.adCost > 0 ? data.gmv / data.adCost : 0;
      data.avgOrderValue = data.orders > 0 ? data.gmv / data.orders : 0;
    });
    
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [store, liveReports]);


  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  };

  // Lịch sử hoạt động gần đây
  const recentHistory = useMemo(() => {
    if (!store) return [];
    
    return liveReports
      .filter(r => r.channelId === store.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [store, liveReports]);

  // Filtered history với search và filters
  const filteredRecentHistory = useMemo(() => {
    if (!store) return [];
    
    let filtered = recentHistory;

    // Filter by date range
    filtered = filtered.filter(item => {
      const itemDate = new Date(item.date);
      const fromDate = new Date(historyDateFrom);
      const toDate = new Date(historyDateTo);
      toDate.setHours(23, 59, 59, 999);
      return itemDate >= fromDate && itemDate <= toDate;
    });

    // Filter by search text
    if (historySearchText) {
      const searchLower = historySearchText.toLowerCase();
      filtered = filtered.filter(item => {
        return (
          item.hostName.toLowerCase().includes(searchLower) ||
          item.reporter?.toLowerCase().includes(searchLower) ||
          item.date.includes(searchLower)
        );
      });
    }

    // Filter by selected filters
    if (historySelectedFilters.hosts && historySelectedFilters.hosts.length > 0) {
      filtered = filtered.filter(item => historySelectedFilters.hosts!.includes(item.hostName));
    }
    if (historySelectedFilters.shifts && historySelectedFilters.shifts.length > 0) {
      filtered = filtered.filter(item => item.shift && historySelectedFilters.shifts!.includes(item.shift));
    }
    if (historySelectedFilters.reporters && historySelectedFilters.reporters.length > 0) {
      filtered = filtered.filter(item => item.reporter && historySelectedFilters.reporters!.includes(item.reporter));
    }

    return filtered;
  }, [recentHistory, historySearchText, historySelectedFilters, historyDateFrom, historyDateTo, store]);

  if (!isOpen || !store) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] overflow-y-auto p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 uppercase">{store.name}</h2>
            <p className="text-sm text-gray-500 mt-1">ID: {store.id}</p>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 bg-white">
          <div className="flex">
            <button
              onClick={() => setActiveTab('personnel')}
              className={`px-6 py-3 font-medium text-sm transition-colors ${
                activeTab === 'personnel'
                  ? 'border-b-2 border-brand-navy text-brand-navy bg-blue-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              Nhân sự phụ trách (负责人事)
            </button>
            <button
              onClick={() => setActiveTab('metrics')}
              className={`px-6 py-3 font-medium text-sm transition-colors ${
                activeTab === 'metrics'
                  ? 'border-b-2 border-brand-navy text-brand-navy bg-blue-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              Chỉ số cửa hàng (店铺指标)
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-3 font-medium text-sm transition-colors ${
                activeTab === 'history'
                  ? 'border-b-2 border-brand-navy text-brand-navy bg-blue-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              Lịch sử hoạt động (活动历史)
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="text-center py-12 text-gray-500">Đang tải dữ liệu...</div>
          ) : (
            <>
              {/* Tab 1: Nhân sự phụ trách */}
              {activeTab === 'personnel' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">Danh sách nhân sự phụ trách</h3>
                  {responsiblePersonnel.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 bg-gray-50 rounded border border-gray-200">
                      <p>Chưa có nhân sự phụ trách được gán cho cửa hàng này</p>
                      <p className="text-xs mt-2 text-gray-500">Nhân sự sẽ được tự động xác định từ các báo cáo Live</p>
                    </div>
                  ) : (
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-xs text-white uppercase bg-brand-navy border-b">
                            <tr>
                              <th className="px-4 py-3 text-left">Tên</th>
                              <th className="px-4 py-3 text-left">Vị trí</th>
                              <th className="px-4 py-3 text-left">Phòng ban</th>
                              <th className="px-4 py-3 text-left">SĐT</th>
                              <th className="px-4 py-3 text-left">Email</th>
                              <th className="px-4 py-3 text-left">Vai trò</th>
                            </tr>
                          </thead>
                          <tbody>
                            {responsiblePersonnel.map((person) => (
                              <tr key={person.id} className="border-b hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium text-gray-800">{person.fullName}</td>
                                <td className="px-4 py-3 text-gray-600">{person.position || '-'}</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded text-xs font-medium border ${
                                    person.department === 'Live' ? 'bg-red-50 text-red-700 border-red-200' :
                                    person.department === 'Media' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                    'bg-gray-50 text-gray-600 border-gray-200'
                                  }`}>
                                    {person.department || '-'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-gray-600">{person.phoneNumber || '-'}</td>
                                <td className="px-4 py-3 text-gray-600">{person.email || '-'}</td>
                                <td className="px-4 py-3">
                                  {person.role === 'admin' ? (
                                    <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded border border-purple-200 font-medium">
                                      Admin
                                    </span>
                                  ) : (
                                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded border border-gray-200 font-medium">
                                      User
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Chỉ số cửa hàng */}
              {activeTab === 'metrics' && storeMetrics && (
                <div className="space-y-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">Tổng quan chỉ số (指标总览)</h3>
                  
                  {/* KPI Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded shadow-sm">
                      <p className="text-xs text-gray-600 uppercase font-bold mb-1">Tổng GMV</p>
                      <p className="text-2xl font-bold text-blue-600">{formatCurrency(storeMetrics.totalGMV)}</p>
                    </div>
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm">
                      <p className="text-xs text-gray-600 uppercase font-bold mb-1">Tổng Chi phí QC</p>
                      <p className="text-2xl font-bold text-red-600">{formatCurrency(storeMetrics.totalAdCost)}</p>
                    </div>
                    <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded shadow-sm">
                      <p className="text-xs text-gray-600 uppercase font-bold mb-1">ROI</p>
                      <p className="text-2xl font-bold text-green-600">{storeMetrics.roi.toFixed(2)}</p>
                      <p className="text-xs text-gray-400">= GMV / CPQC</p>
                    </div>
                  </div>

                  {/* Chi tiết chỉ số */}
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b border-gray-200">
                      <h4 className="font-bold text-gray-800">Chi tiết chỉ số</h4>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-bold mb-1">Tổng đơn hàng</p>
                          <p className="text-lg font-bold text-gray-800">{storeMetrics.totalOrders}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-bold mb-1">Giá trị đơn TB</p>
                          <p className="text-lg font-bold text-gray-800">{formatCurrency(storeMetrics.avgOrderValue)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-bold mb-1">Tổng lượt xem Live</p>
                          <p className="text-lg font-bold text-gray-800">{storeMetrics.totalViews.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-bold mb-1">Người xem Live</p>
                          <p className="text-lg font-bold text-gray-800">{storeMetrics.totalViewers.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-bold mb-1">Lượt xem Video</p>
                          <p className="text-lg font-bold text-gray-800">{storeMetrics.videoViews.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-bold mb-1">Doanh số Video</p>
                          <p className="text-lg font-bold text-gray-800">{formatCurrency(storeMetrics.videoSales)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-bold mb-1">Số báo cáo</p>
                          <p className="text-lg font-bold text-gray-800">{storeMetrics.reportCount}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-bold mb-1">Số video</p>
                          <p className="text-lg font-bold text-gray-800">{storeMetrics.videoCount}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Biểu đồ theo thời gian */}
                  {chartData.length > 0 && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* GMV & Chi phí QC theo thời gian */}
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b border-gray-200">
                          <h4 className="font-bold text-gray-800">GMV & Chi phí QC Theo Thời Gian (GMV和广告费时间图表)</h4>
                        </div>
                        <div className="p-4">
                          <ResponsiveContainer width="100%" height={300}>
                            <ComposedChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis 
                                dataKey="date" 
                                tickFormatter={formatDate}
                                angle={-45}
                                textAnchor="end"
                                height={80}
                              />
                              <YAxis yAxisId="left" />
                              <YAxis yAxisId="right" orientation="right" />
                              <Tooltip 
                                formatter={(value: number, name: string) => {
                                  if (name === 'GMV' || name === 'Chi phí QC') {
                                    return formatCurrency(value);
                                  }
                                  return value.toLocaleString();
                                }}
                                labelFormatter={(label) => `Ngày (日期): ${formatDate(label)}`}
                              />
                              <Legend />
                              <Bar yAxisId="left" dataKey="gmv" name="GMV (交易额)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                              <Bar yAxisId="left" dataKey="adCost" name="Chi phí QC (广告费)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* ROI theo thời gian */}
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b border-gray-200">
                          <h4 className="font-bold text-gray-800">ROI Theo Thời Gian (ROI时间图表)</h4>
                        </div>
                        <div className="p-4">
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
                                formatter={(value: number) => value.toFixed(2)}
                                labelFormatter={(label) => `Ngày (日期): ${formatDate(label)}`}
                              />
                              <Legend />
                              <Line type="monotone" dataKey="roi" name="ROI (投资回报率)" stroke="#10b981" strokeWidth={2} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Đơn hàng theo thời gian */}
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b border-gray-200">
                          <h4 className="font-bold text-gray-800">Đơn Hàng Theo Thời Gian (订单时间图表)</h4>
                        </div>
                        <div className="p-4">
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

                      {/* Giá trị đơn TB theo thời gian */}
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b border-gray-200">
                          <h4 className="font-bold text-gray-800">Giá Trị Đơn TB Theo Thời Gian (平均订单价值时间图表)</h4>
                        </div>
                        <div className="p-4">
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
                                formatter={(value: number) => formatCurrency(value)}
                                labelFormatter={(label) => `Ngày (日期): ${formatDate(label)}`}
                              />
                              <Legend />
                              <Line type="monotone" dataKey="avgOrderValue" name="Giá trị đơn TB (平均订单价值)" stroke="#f59e0b" strokeWidth={2} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Lượt xem & Người xem Live theo thời gian */}
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b border-gray-200">
                          <h4 className="font-bold text-gray-800">Lượt Xem & Người Xem Live Theo Thời Gian (直播观看和观看者时间图表)</h4>
                        </div>
                        <div className="p-4">
                          <ResponsiveContainer width="100%" height={300}>
                            <ComposedChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis 
                                dataKey="date" 
                                tickFormatter={formatDate}
                                angle={-45}
                                textAnchor="end"
                                height={80}
                              />
                              <YAxis yAxisId="left" />
                              <YAxis yAxisId="right" orientation="right" />
                              <Tooltip 
                                formatter={(value: number) => value.toLocaleString()}
                                labelFormatter={(label) => `Ngày (日期): ${formatDate(label)}`}
                              />
                              <Legend />
                              <Bar yAxisId="left" dataKey="totalViews" name="Tổng lượt xem Live (总直播观看)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                              <Line yAxisId="right" type="monotone" dataKey="totalViewers" name="Người xem Live (直播观看者)" stroke="#10b981" strokeWidth={2} />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Số báo cáo theo thời gian */}
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b border-gray-200">
                          <h4 className="font-bold text-gray-800">Số Báo Cáo Theo Thời Gian (报告数量时间图表)</h4>
                        </div>
                        <div className="p-4">
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={chartData}>
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
                              <Bar dataKey="reportCount" name="Số báo cáo (报告数)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Lịch sử hoạt động */}
              {activeTab === 'history' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">Lịch sử báo cáo gần đây (最近报告历史)</h3>
                  
                  {/* Filter Bar */}
                  <FilterBar
                    onSearch={setHistorySearchText}
                    onExportExcel={() => {
                      const exportData = filteredRecentHistory.map(report => {
                        const gmv = Number(report.gmv) || 0;
                        const adCost = Number(report.adCost) || 0;
                        const roi = adCost > 0 ? gmv / adCost : 0;
                        return {
                          'Ngày': report.date,
                          'Host': report.hostName,
                          'Thời gian': `${report.startTime} - ${report.endTime}`,
                          'GMV': gmv,
                          'Chi phí QC': adCost,
                          'ROI': roi.toFixed(2),
                          'Người báo cáo': report.reporter || '',
                          'Ca': report.shift || '',
                        };
                      });
                      exportToExcel(exportData, `store-history-${store?.id}-${new Date().toISOString().split('T')[0]}.xlsx`);
                    }}
                    onImportExcel={async (file) => {
                      try {
                        const data = await importFromExcel(file);
                        alert(`Đã import ${data.length} bản ghi từ Excel. Vui lòng kiểm tra dữ liệu.`);
                        // TODO: Implement import logic
                      } catch (error) {
                        alert('Lỗi khi import Excel: ' + (error as Error).message);
                      }
                    }}
                    onReset={() => {
                      setHistorySearchText('');
                      setHistorySelectedFilters({});
                      const today = new Date();
                      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                      setHistoryDateFrom(firstDayOfMonth.toISOString().split('T')[0]);
                      setHistoryDateTo(today.toISOString().split('T')[0]);
                    }}
                    filterFields={[
                      {
                        key: 'hosts',
                        label: 'Host',
                        type: 'checkbox',
                        options: Array.from(new Set(recentHistory.map(r => r.hostName).filter(Boolean))).map(host => ({ value: host, label: host }))
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
                        key: 'reporters',
                        label: 'Người báo cáo',
                        type: 'checkbox',
                        options: Array.from(new Set(recentHistory.map(r => r.reporter).filter(Boolean))).map(reporter => ({ value: reporter!, label: reporter! }))
                      }
                    ]}
                    selectedFilters={historySelectedFilters}
                    onFilterChange={(field, values) => {
                      setHistorySelectedFilters(prev => ({ ...prev, [field]: values }));
                    }}
                    dateFrom={historyDateFrom}
                    dateTo={historyDateTo}
                    onDateFromChange={setHistoryDateFrom}
                    onDateToChange={setHistoryDateTo}
                    onQuickDateSelect={(from, to) => {
                      setHistoryDateFrom(from);
                      setHistoryDateTo(to);
                    }}
                  />

                  {filteredRecentHistory.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 bg-gray-50 rounded border border-gray-200">
                      <p>Chưa có báo cáo nào cho cửa hàng này</p>
                    </div>
                  ) : (
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-brand-navy text-white border-b border-gray-200">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase">Ngày</th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase">Host</th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase">Thời gian</th>
                              <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase">GMV</th>
                              <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase">Chi phí QC</th>
                              <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase">ROI</th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase">Người báo cáo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredRecentHistory.map((report) => {
                              const gmv = Number(report.gmv) || 0;
                              const adCost = Number(report.adCost) || 0;
                              const roi = adCost > 0 ? gmv / adCost : 0;
                              
                              return (
                                <tr key={report.id} className="border-b border-gray-100 hover:bg-gray-50">
                                  <td className="px-4 py-3 font-medium text-gray-800">{report.date}</td>
                                  <td className="px-4 py-3 text-gray-600">{report.hostName}</td>
                                  <td className="px-4 py-3 text-gray-600 text-xs">
                                    {report.startTime} - {report.endTime}
                                  </td>
                                  <td className="px-4 py-3 text-right font-bold text-blue-600">{formatCurrency(gmv)}</td>
                                  <td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrency(adCost)}</td>
                                  <td className="px-4 py-3 text-right">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                      roi >= 4 ? 'bg-green-100 text-green-800' :
                                      roi >= 2 ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-red-100 text-red-800'
                                    }`}>
                                      {roi.toFixed(2)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-gray-600">{report.reporter || '-'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

