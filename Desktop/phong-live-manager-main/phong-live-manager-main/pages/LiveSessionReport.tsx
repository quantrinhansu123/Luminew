import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MOCK_STORES, fetchLiveReports, createLiveReport, updateLiveReport, deleteLiveReport, fetchPersonnel, fetchStores } from '../services/dataService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Line } from 'recharts';
import { LiveReportModal } from '../components/LiveReportModal';
import { FilterBar, FilterField } from '../components/FilterBar';
import { exportToExcel, importFromExcel } from '../utils/excelUtils';
import { formatCurrency, matchNames } from '../utils/formatUtils';
import { LiveReport, Personnel, Store } from '../types';
import { isPartner, getPartnerId, isAdmin, getCurrentUserName, isRegularEmployee, isTrungKhong } from '../utils/permissionUtils';

export const LiveSessionReport: React.FC = () => {
  const [reports, setReports] = useState<LiveReport[]>([]);
  const [allReports, setAllReports] = useState<LiveReport[]>([]); // Lưu toàn bộ reports không filter
  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<LiveReport | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);
  
  // Filter states
  const [searchText, setSearchText] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [dateFrom, setDateFrom] = useState<string>(firstDayOfMonth.toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState<string>(today.toISOString().split('T')[0]);
  
  // Date range filter for personnel summary
  const [personnelDateFrom, setPersonnelDateFrom] = useState<string>(firstDayOfMonth.toISOString().split('T')[0]);
  const [personnelDateTo, setPersonnelDateTo] = useState<string>(today.toISOString().split('T')[0]);
  
  // Weekly report filter
  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
  };
  const weekStart = getWeekStart(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const [weekStartDate, setWeekStartDate] = useState<string>(weekStart.toISOString().split('T')[0]);
  const [weekEndDate, setWeekEndDate] = useState<string>(weekEnd.toISOString().split('T')[0]);

  // Fetch data on mount
  const loadData = async () => {
    setIsLoading(true);
    let [reportData, personnelData, storeData] = await Promise.all([
      fetchLiveReports(),
      fetchPersonnel(),
      fetchStores()
    ]);
    
    // Lưu toàn bộ reports gốc cho báo cáo tổng kết
    setAllReports(reportData);
    
    // Nếu là nhân viên có department "Đối tác", chỉ hiển thị stores được gán cho họ
    if (isPartner() && !isAdmin()) {
      const partnerId = getPartnerId();
      if (partnerId) {
        storeData = storeData.filter(s => s.partnerId === partnerId);
        const allowedStoreIds = storeData.map(s => s.id);
        reportData = reportData.filter(r => allowedStoreIds.includes(r.channelId));
        // Filter personnel để chỉ hiển thị host từ stores của đối tác (sử dụng matchNames để xử lý khoảng trắng)
        const allowedHostNames = reportData.map(r => r.hostName).filter(Boolean);
        personnelData = personnelData.filter(p => 
          allowedHostNames.some(hostName => matchNames(hostName, p.fullName))
        );
      }
    } else if (isRegularEmployee()) {
      // Nếu là TRỢ LIVE 中控 thì xem tất cả data được cấp quyền, không filter theo hostName
      const isTrungKhongUser = isTrungKhong();
      console.log('[LiveSessionReport] isRegularEmployee, isTrungKhong:', isTrungKhongUser);
      
      if (isTrungKhongUser) {
        // TRỢ LIVE 中控 xem tất cả data (không filter theo hostName)
        // Data đã được filter theo menu permissions và department/store permissions
        console.log('[LiveSessionReport] TRỢ LIVE 中控 - showing all data, count:', reportData.length);
      } else {
        // Nhân viên thường chỉ thấy data của chính mình (dựa trên hostName)
        const currentUserName = getCurrentUserName();
        if (currentUserName) {
          const beforeCount = reportData.length;
          reportData = reportData.filter(r => matchNames(r.hostName, currentUserName));
          console.log('[LiveSessionReport] Regular employee - filtered from', beforeCount, 'to', reportData.length);
          // Chỉ hiện thị chính mình trong danh sách personnel
          personnelData = personnelData.filter(p => matchNames(p.fullName, currentUserName));
        }
      }
    }
    
    setReports(reportData);
    setPersonnelList(personnelData);
    setStores(storeData);
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateReport = async (newReport: Omit<LiveReport, 'id'>) => {
    await createLiveReport(newReport);
    await loadData(); // Reload data after creation
  };

  const handleUpdateReport = async (id: string, updatedReport: Partial<LiveReport>) => {
    await updateLiveReport(id, updatedReport);
    await loadData();
    setIsEditModalOpen(false);
    setSelectedReport(null);
  };

  const handleDeleteReport = async (id: string) => {
    await deleteLiveReport(id);
    await loadData();
    setReportToDelete(null);
  };

  const handleViewReport = (report: LiveReport) => {
    setSelectedReport(report);
    setIsViewModalOpen(true);
  };

  const handleEditReport = (report: LiveReport) => {
    setSelectedReport(report);
    setIsEditModalOpen(true);
  };

  // Filter Data with search and filters
  const filteredData = useMemo(() => {
    let filtered = reports;

    // Filter by date range
    filtered = filtered.filter(item => {
      const itemDate = new Date(item.date);
      const fromDate = new Date(dateFrom);
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      return itemDate >= fromDate && itemDate <= toDate;
    });

    // Filter by selected filters (stores, hosts, etc.)
    if (selectedFilters.stores && selectedFilters.stores.length > 0) {
      filtered = filtered.filter(item => selectedFilters.stores!.includes(item.channelId));
    }
    if (selectedFilters.hosts && selectedFilters.hosts.length > 0) {
      filtered = filtered.filter(item => selectedFilters.hosts!.includes(item.hostName));
    }
    if (selectedFilters.shifts && selectedFilters.shifts.length > 0) {
      filtered = filtered.filter(item => item.shift && selectedFilters.shifts!.includes(item.shift));
    }
    if (selectedFilters.reporters && selectedFilters.reporters.length > 0) {
      filtered = filtered.filter(item => item.reporter && selectedFilters.reporters!.includes(item.reporter));
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

    // Search in all fields
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(item => {
        const storeName = stores.find(s => s.id === item.channelId)?.name || '';
        return (
          item.date.toLowerCase().includes(searchLower) ||
          storeName.toLowerCase().includes(searchLower) ||
          item.hostName.toLowerCase().includes(searchLower) ||
          item.reporter?.toLowerCase().includes(searchLower) ||
          item.shift?.toLowerCase().includes(searchLower) ||
          item.customerGroup?.toLowerCase().includes(searchLower) ||
          item.source?.toLowerCase().includes(searchLower) ||
          item.salesPerson?.toLowerCase().includes(searchLower) ||
          item.status?.toLowerCase().includes(searchLower) ||
          item.callCount?.toString().includes(searchLower) ||
          item.gmv.toString().includes(searchLower) ||
          item.adCost.toString().includes(searchLower) ||
          item.orders?.toString().includes(searchLower) ||
          item.viewers?.toString().includes(searchLower)
        );
      });
    }

    return filtered;
  }, [reports, dateFrom, dateTo, selectedFilters, searchText, stores]);

  // Calculations for KPI Cards
  const metrics = useMemo(() => {
    let totalGMV = 0;
    let totalAdCost = 0;

    filteredData.forEach(item => {
      totalGMV += Number(item.gmv);
      totalAdCost += Number(item.adCost);
    });

    const roi = totalAdCost > 0 ? totalGMV / totalAdCost : 0;

    return { totalGMV, totalAdCost, roi };
  }, [filteredData]);

  // Chart Data Aggregation (by Date)
  const chartData = useMemo(() => {
    const map: Record<string, any> = {};
    filteredData.forEach(item => {
      if (!map[item.date]) {
        map[item.date] = { date: item.date, gmv: 0, adCost: 0, profit: 0 };
      }
      map[item.date].gmv += Number(item.gmv);
      map[item.date].adCost += Number(item.adCost);
      map[item.date].profit += (Number(item.gmv) - Number(item.adCost));
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredData]);

  const formatROI = (val: number) => val.toFixed(2);

  const getStatusColor = (roi: number) => {
    if (roi >= 4) return 'bg-green-100 text-green-800 border-green-200';
    if (roi >= 2) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-brand-navy border-red-200';
  };

  // Personnel Summary by Date Range - tính dựa trên hostName (tên host live)
  // Sử dụng allReports (không filter) để báo cáo tổng kết hiển thị tất cả nhân viên
  const personnelSummary = useMemo(() => {
    const summaryMap: Record<string, {
      person: Personnel;
      totalGMV: number;
      totalAdCost: number;
      reportCount: number;
      avgROI: number;
    }> = {};

    // Filter reports by date range - lấy từ allReports
    const dateRangeReports = allReports.filter(report => {
      const reportDate = new Date(report.date);
      const fromDate = new Date(personnelDateFrom);
      const toDate = new Date(personnelDateTo);
      toDate.setHours(23, 59, 59, 999); // Include full end date
      return reportDate >= fromDate && reportDate <= toDate;
    });

    // Group by personnel (hostName - tên host)
    dateRangeReports.forEach(report => {
      if (!report.hostName) return;

      // Find matching personnel - lấy từ tất cả personnel
      const allPersonnel = personnelList.length > 0 ? personnelList : allReports.map(r => ({ fullName: r.hostName } as Personnel)).filter((p, i, arr) => arr.findIndex(item => item.fullName === p.fullName) === i);
      
      const matchingPerson = allPersonnel.find(person => {
        // Sử dụng matchNames để xử lý khoảng trắng và ký tự đặc biệt
        return matchNames(report.hostName, person.fullName);
      });

      if (matchingPerson) {
        const personId = matchingPerson.id || matchingPerson.fullName;
        if (!summaryMap[personId]) {
          summaryMap[personId] = {
            person: matchingPerson,
            totalGMV: 0,
            totalAdCost: 0,
            reportCount: 0,
            avgROI: 0
          };
        }

        const gmv = Number(report.gmv) || 0;
        const adCost = Number(report.adCost) || 0;

        summaryMap[personId].totalGMV += gmv;
        summaryMap[personId].totalAdCost += adCost;
        summaryMap[personId].reportCount += 1;
      }
    });

    // Calculate average ROI for each person
    return Object.values(summaryMap).map(item => ({
      ...item,
      avgROI: item.totalAdCost > 0 ? item.totalGMV / item.totalAdCost : 0
    })).sort((a, b) => b.totalGMV - a.totalGMV);
  }, [allReports, personnelList, personnelDateFrom, personnelDateTo]);

  // Weekly Report by Host
  const weeklyReportData = useMemo(() => {
    // Get all unique hosts from reports
    const allHosts = Array.from(new Set(reports.map(r => r.hostName).filter(Boolean))).sort();
    
    // Filter reports by week date range
    const weekReports = reports.filter(report => {
      const reportDate = new Date(report.date);
      const fromDate = new Date(weekStartDate);
      const toDate = new Date(weekEndDate);
      toDate.setHours(23, 59, 59, 999);
      return reportDate >= fromDate && reportDate <= toDate;
    });

    // Get all dates in the week
    const dates: string[] = [];
    const currentDate = new Date(weekStartDate);
    const endDate = new Date(weekEndDate);
    while (currentDate <= endDate) {
      dates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Build data structure: date -> host -> revenue
    const dateHostMap: Record<string, Record<string, number>> = {};
    dates.forEach(date => {
      dateHostMap[date] = {};
      allHosts.forEach(host => {
        dateHostMap[date][host] = 0;
      });
    });

    // Fill in revenue data
    weekReports.forEach(report => {
      const date = report.date;
      const host = report.hostName;
      const gmv = Number(report.gmv) || 0;
      if (dateHostMap[date] && host) {
        dateHostMap[date][host] = (dateHostMap[date][host] || 0) + gmv;
      }
    });

    // Calculate totals
    const totals: Record<string, number> = {};
    allHosts.forEach(host => {
      totals[host] = dates.reduce((sum, date) => sum + (dateHostMap[date][host] || 0), 0);
    });
    const grandTotal = Object.values(totals).reduce((sum, val) => sum + val, 0);

    return {
      dates,
      hosts: allHosts,
      dateHostMap,
      totals,
      grandTotal,
      weekRange: `${new Date(weekStartDate).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' })} - ${new Date(weekEndDate).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' })}`
    };
  }, [reports, weekStartDate, weekEndDate]);

  // Host Ranking (BXH) - Top 5 tốt nhất
  const hostRanking = useMemo(() => {
    const hostMap: Record<string, {
      hostName: string;
      totalGMV: number;
      totalAdCost: number;
      reportCount: number;
      avgROI: number;
      profit: number;
    }> = {};

    // Tính toán thống kê cho mỗi host từ filteredData
    filteredData.forEach(report => {
      if (!report.hostName) return;
      
      const host = report.hostName;
      if (!hostMap[host]) {
        hostMap[host] = {
          hostName: host,
          totalGMV: 0,
          totalAdCost: 0,
          reportCount: 0,
          avgROI: 0,
          profit: 0
        };
      }

      const gmv = Number(report.gmv) || 0;
      const adCost = Number(report.adCost) || 0;
      
      hostMap[host].totalGMV += gmv;
      hostMap[host].totalAdCost += adCost;
      hostMap[host].reportCount += 1;
    });

    // Tính ROI và profit cho mỗi host
    const hostList = Object.values(hostMap).map(host => ({
      ...host,
      profit: host.totalGMV - host.totalAdCost,
      avgROI: host.totalAdCost > 0 ? host.totalGMV / host.totalAdCost : 0
    }));

    // Sắp xếp theo GMV (doanh số) - cao nhất trước
    const sortedByGMV = [...hostList].sort((a, b) => b.totalGMV - a.totalGMV);
    
    // Top 5 tốt nhất (GMV cao nhất)
    const top5 = sortedByGMV.slice(0, 5);

    return { top5 };
  }, [filteredData]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans space-y-6">
      <LiveReportModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateReport}
        reports={reports}
      />
      <LiveReportModal
        isOpen={isEditModalOpen}
        onClose={() => { setIsEditModalOpen(false); setSelectedReport(null); }}
        onSubmit={async (data) => {
          if (selectedReport?.id) {
            await handleUpdateReport(selectedReport.id, data);
          }
        }}
        initialData={selectedReport || undefined}
        isEdit={true}
        reports={reports}
      />

      {/* View Report Modal */}
      {isViewModalOpen && selectedReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] overflow-y-auto p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-brand-navy to-blue-700 p-6 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold uppercase mb-2">Chi tiết Báo Cáo Live (直播报告详情)</h2>
                  <p className="text-red-100 text-sm">ID: {selectedReport.id || 'N/A'}</p>
                </div>
                <button 
                  onClick={() => { setIsViewModalOpen(false); setSelectedReport(null); }} 
                  className="text-white hover:text-red-200 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Section 1: Thông tin cơ bản */}
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Thông tin cơ bản (基本信息)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Ngày (日期)</p>
                    <p className="text-lg font-bold text-gray-800">{selectedReport.date}</p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Kênh Live (直播频道)</p>
                    <p className="text-lg font-bold text-gray-800">{MOCK_STORES.find(s => s.id === selectedReport.channelId)?.name || 'Unknown'}</p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Host (主播)</p>
                    <p className="text-lg font-bold text-gray-800">{selectedReport.hostName}</p>
                  </div>
                  <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Thời gian (时间)</p>
                    <p className="text-lg font-bold text-gray-800">{selectedReport.startTime} - {selectedReport.endTime}</p>
                  </div>
                  <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Thời lượng (时长)</p>
                    <p className="text-lg font-bold text-gray-800">{selectedReport.duration}</p>
                  </div>
                  <div className="bg-pink-50 p-4 rounded-lg border border-pink-200">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Người báo cáo (报告人)</p>
                    <p className="text-lg font-bold text-gray-800">{selectedReport.reporter || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Section 2: Tài chính */}
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200 flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Tài chính & Hiệu quả (财务与效果)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-5 rounded-lg border-2 border-blue-300">
                    <p className="text-xs text-blue-700 uppercase font-bold mb-2">GMV (交易额)</p>
                    <p className="text-2xl font-bold text-blue-800">{formatCurrency(Number(selectedReport.gmv))}</p>
                  </div>
                  <div className="bg-gradient-to-br from-red-50 to-red-100 p-5 rounded-lg border-2 border-red-300">
                    <p className="text-xs text-red-700 uppercase font-bold mb-2">Chi phí QC (广告费)</p>
                    <p className="text-2xl font-bold text-red-800">{formatCurrency(Number(selectedReport.adCost))}</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 p-5 rounded-lg border-2 border-green-300">
                    <p className="text-xs text-green-700 uppercase font-bold mb-2">Lợi nhuận (利润)</p>
                    <p className="text-2xl font-bold text-green-800">{formatCurrency(Number(selectedReport.gmv) - Number(selectedReport.adCost))}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-600 uppercase font-bold mb-1">Tổng GMV (总交易额)</p>
                    <p className="text-lg font-bold text-gray-800">{formatCurrency(Number(selectedReport.totalGmv))}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-600 uppercase font-bold mb-1">ROI</p>
                    <p className="text-lg font-bold text-gray-800">
                      {Number(selectedReport.adCost) > 0 
                        ? (Number(selectedReport.gmv) / Number(selectedReport.adCost)).toFixed(2)
                        : '0'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">= GMV / CPQC</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-600 uppercase font-bold mb-1">GPM (直播千次金额)</p>
                    <p className="text-lg font-bold text-gray-800">{selectedReport.gpm ? formatCurrency(Number(selectedReport.gpm)) : '-'}</p>
                  </div>
                </div>
              </div>

              {/* Section 3: Chỉ số chi tiết */}
              {(selectedReport.orders || selectedReport.viewers || selectedReport.conversionRate) && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200 flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Chỉ số chi tiết (详细指标)
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {selectedReport.orders !== undefined && selectedReport.orders !== null && (
                      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">Số lượt bán (订单数)</p>
                        <p className="text-xl font-bold text-gray-800">{selectedReport.orders || 0}</p>
                      </div>
                    )}
                    {selectedReport.averagePrice && (
                      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">Giá TB (平均价格)</p>
                        <p className="text-xl font-bold text-gray-800">{formatCurrency(Number(selectedReport.averagePrice))}</p>
                      </div>
                    )}
                    {selectedReport.conversionRate && (
                      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">Tỉ lệ chuyển đổi (转化率 %)</p>
                        <p className="text-xl font-bold text-gray-800">{Number(selectedReport.conversionRate).toFixed(2)}%</p>
                      </div>
                    )}
                    {selectedReport.productClicks && (
                      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">Click SP (产品点击次数)</p>
                        <p className="text-xl font-bold text-gray-800">{selectedReport.productClicks}</p>
                      </div>
                    )}
                    {selectedReport.productClickRate && (
                      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">Tỉ lệ Click SP (点击率 %)</p>
                        <p className="text-xl font-bold text-gray-800">{Number(selectedReport.productClickRate).toFixed(2)}%</p>
                      </div>
                    )}
                    {selectedReport.ctr && (
                      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">CTR vào phòng (进房率 %)</p>
                        <p className="text-xl font-bold text-gray-800">{Number(selectedReport.ctr).toFixed(2)}%</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Section 4: Lượng xem & Tương tác */}
              {(selectedReport.viewers || selectedReport.totalViews || selectedReport.newFollowers) && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200 flex items-center gap-2">
                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Người xem & Tương tác (观看与互动)
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {selectedReport.totalViews !== undefined && selectedReport.totalViews !== null && (
                      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">Tổng lượt xem (直播观看次数)</p>
                        <p className="text-xl font-bold text-gray-800">{(selectedReport.totalViews || 0).toLocaleString()}</p>
                      </div>
                    )}
                    {selectedReport.viewers !== undefined && selectedReport.viewers !== null && (
                      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">Người xem (场观人数)</p>
                        <p className="text-xl font-bold text-gray-800">{(selectedReport.viewers || 0).toLocaleString()}</p>
                      </div>
                    )}
                    {selectedReport.avgWatchTime && (
                      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">TG xem TB (平均观看时长)</p>
                        <p className="text-xl font-bold text-gray-800">{selectedReport.avgWatchTime}</p>
                      </div>
                    )}
                    {selectedReport.newFollowers !== undefined && selectedReport.newFollowers !== null && (
                      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">FL mới (关注人数)</p>
                        <p className="text-xl font-bold text-gray-800">{(selectedReport.newFollowers || 0).toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 bg-gray-50 p-4 flex justify-end gap-3">
              <button 
                onClick={() => { setIsViewModalOpen(false); setSelectedReport(null); }} 
                className="px-6 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-100 font-medium transition-colors"
              >
                Đóng (关闭)
              </button>
              <button
                onClick={() => {
                  setIsViewModalOpen(false);
                  handleEditReport(selectedReport);
                }}
                className="px-6 py-2 bg-brand-navy text-white rounded font-bold hover:bg-brand-darkNavy transition-colors"
              >
                Sửa (编辑)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {reportToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80]">
          <div className="bg-white p-6 rounded shadow-lg max-w-sm w-full text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
              <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Xác nhận xóa? (确认删除?)</h3>
            <p className="text-sm text-gray-500 mb-6">Bạn có chắc chắn muốn xóa báo cáo này không? Hành động này không thể hoàn tác. (您确定要删除此报告吗? 此操作无法撤销。)</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setReportToDelete(null)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-gray-800">Hủy (取消)</button>
              <button onClick={() => handleDeleteReport(reportToDelete)} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Xóa (删除)</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800 uppercase">Quản lý Live (直播管理)</h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-brand-navy hover:bg-brand-darkNavy text-white px-4 py-2 rounded shadow text-sm font-bold flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nhập Báo Cáo (输入报告)
        </button>
      </div>

      {/* Filter Bar */}
      <FilterBar
        onSearch={setSearchText}
        onExportExcel={() => {
          const exportData = filteredData.map(report => ({
            'Ngày': report.date,
            'Cửa hàng': stores.find(s => s.id === report.channelId)?.name || '',
            'Host': report.hostName,
            'Ca': report.shift || '',
            'Thời gian': `${report.startTime} - ${report.endTime}`,
            'GMV': report.gmv,
            'Chi phí QC': report.adCost,
            'ROI': report.adCost > 0 ? (Number(report.gmv) / Number(report.adCost)).toFixed(2) : '0',
            'Đơn hàng': report.orders || 0,
            'Người xem': report.viewers || 0,
            'Người báo cáo': report.reporter || ''
          }));
          exportToExcel(exportData, `live-reports-${new Date().toISOString().split('T')[0]}.xlsx`);
        }}
        onImportExcel={async (file) => {
          try {
            const data = await importFromExcel(file);
            // Process imported data and create reports
            alert(`Đã import ${data.length} bản ghi từ Excel. Vui lòng kiểm tra dữ liệu.`);
            // TODO: Implement import logic
          } catch (error) {
            alert('Lỗi khi import Excel: ' + (error as Error).message);
          }
        }}
        onReset={() => {
          setSearchText('');
          setSelectedFilters({});
          const today = new Date();
          const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          setDateFrom(firstDayOfMonth.toISOString().split('T')[0]);
          setDateTo(today.toISOString().split('T')[0]);
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
            // Lấy từ allReports để có đầy đủ danh sách host, không phụ thuộc vào reports đã filter
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
            key: 'reporters',
            label: 'Người báo cáo',
            type: 'checkbox',
            options: Array.from(new Set(reports.map(r => r.reporter).filter(Boolean))).map(reporter => ({ value: reporter!, label: reporter! }))
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

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Đang tải dữ liệu... (正在加载数据...)</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded shadow-sm border-l-4 border-blue-500">
              <p className="text-xs text-gray-500 uppercase font-bold">Tổng GMV (总GMV)</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{formatCurrency(metrics.totalGMV)}</p>
            </div>
            <div className="bg-white p-4 rounded shadow-sm border-l-4 border-brand-navy">
              <p className="text-xs text-gray-500 uppercase font-bold">Tổng Chi Phí QC (总广告费)</p>
              <p className="text-xl font-bold text-brand-navy mt-1">{formatCurrency(metrics.totalAdCost)}</p>
            </div>
            <div className="bg-white p-4 rounded shadow-sm border-l-4 border-green-500">
              <p className="text-xs text-gray-500 uppercase font-bold">ROI Tổng (总ROI)</p>
              <p className="text-xl font-bold text-green-600 mt-1">{formatROI(metrics.roi)}</p>
              <p className="text-xs text-gray-400 mt-1">= GMV / CPQC</p>
            </div>
          </div>

          {/* Host Ranking (BXH) */}
          <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-green-600 to-green-700 p-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-white">
                🏆 BXH Top 5 Host Tốt Nhất (最佳主播排行榜 Top 5)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-green-50 text-xs text-gray-700 uppercase border-b">
                  <tr>
                      <th className="px-4 py-3 text-center font-bold w-12">#</th>
                      <th className="px-4 py-3 text-left font-bold">Host (主播)</th>
                      <th className="px-4 py-3 text-right font-bold">Tổng GMV (总GMV)</th>
                      <th className="px-4 py-3 text-right font-bold">Chi phí QC (广告费)</th>
                      <th className="px-4 py-3 text-right font-bold">Lợi nhuận (利润)</th>
                      <th className="px-4 py-3 text-right font-bold">ROI</th>
                      <th className="px-4 py-3 text-center font-bold">Số báo cáo (报告数)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hostRanking.top5.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-400">
                          Chưa có dữ liệu (暂无数据)
                        </td>
                      </tr>
                    ) : (
                      hostRanking.top5.map((host, index) => (
                        <tr key={host.hostName} className="border-b hover:bg-green-50">
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-white ${
                              index === 0 ? 'bg-yellow-500' :
                              index === 1 ? 'bg-gray-400' :
                              index === 2 ? 'bg-orange-600' :
                              'bg-gray-300'
                            }`}>
                              {index + 1}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-gray-800">{host.hostName}</td>
                          <td className="px-4 py-3 text-right font-bold text-blue-600">
                            {formatCurrency(host.totalGMV)}
                          </td>
                          <td className="px-4 py-3 text-right text-red-600">
                            {formatCurrency(host.totalAdCost)}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-green-600">
                            {formatCurrency(host.profit)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`px-2 py-1 rounded text-xs font-bold border ${getStatusColor(host.avgROI)}`}>
                              {formatROI(host.avgROI)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">
                            {host.reportCount}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          {/* Charts */}
          <div className="bg-white p-4 rounded shadow-sm border border-gray-200 h-80">
            <h3 className="text-sm font-bold text-gray-700 uppercase mb-4">Biểu đồ Hiệu Quả (Doanh thu vs Chi phí)</h3>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(t) => t.split('-').slice(1).join('/')} />
                <YAxis yAxisId="left" />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Bar yAxisId="left" dataKey="gmv" name="Doanh số (GMV)" fill="#3b82f6" barSize={30} radius={[4, 4, 0, 0]} />
                <Bar yAxisId="left" dataKey="adCost" name="Chi phí QC" fill="#ef4444" barSize={30} radius={[4, 4, 0, 0]} />
                <Line yAxisId="left" type="monotone" dataKey="profit" name="Lợi nhuận tạm tính" stroke="#10b981" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Weekly Report by Host */}
          <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <h3 className="text-lg font-bold text-gray-800">Báo Cáo Theo Tuần (周报) - Tổng Doanh Thu Theo Host (按主播总营收)</h3>
              <div className="flex gap-2 items-center flex-wrap">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Từ ngày:</label>
                <input
                  type="date"
                  value={weekStartDate}
                  onChange={(e) => setWeekStartDate(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-navy bg-white shadow-sm"
                />
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Đến ngày:</label>
                <input
                  type="date"
                  value={weekEndDate}
                  onChange={(e) => setWeekEndDate(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-navy bg-white shadow-sm"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  {/* First header row with merged cells */}
                  <tr>
                    <th rowSpan={2} className="px-4 py-3 border-r text-center font-bold text-white bg-brand-navy sticky left-0 z-20 min-w-[120px]">
                      NGÀY (日期)
                    </th>
                    <th colSpan={weeklyReportData.hosts.length} className="px-4 py-3 border-r text-center font-bold text-white bg-brand-darkNavy">
                      TÊN HOST (主播名称)
                    </th>
                    <th rowSpan={2} className="px-4 py-3 text-center font-bold text-white bg-brand-darkNavy min-w-[140px]">
                      TỔNG DOANH THU TUẦN (周总营收)
                    </th>
                  </tr>
                  {/* Second header row with host names */}
                  <tr>
                    {weeklyReportData.hosts.map(host => (
                      <th key={host} className="px-4 py-3 border-r text-center font-bold text-white bg-brand-darkNavy min-w-[140px]">
                        {host}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeklyReportData.dates.map(date => {
                    const dateObj = new Date(date);
                    const dateStr = dateObj.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' });
                    const dayTotal = weeklyReportData.hosts.reduce((sum, host) => sum + (weeklyReportData.dateHostMap[date][host] || 0), 0);
                    return (
                      <tr key={date} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 border-r font-medium text-gray-800 bg-blue-100 sticky left-0 z-10">
                          {dateStr}
                        </td>
                        {weeklyReportData.hosts.map(host => {
                          const revenue = weeklyReportData.dateHostMap[date][host] || 0;
                          return (
                            <td key={host} className="px-4 py-3 border-r text-right bg-white">
                              {revenue > 0 ? (
                                <span className="font-medium text-gray-800">{formatCurrency(revenue)}</span>
                              ) : (
                                <span className="text-gray-500 font-medium">x</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-right font-bold text-gray-800 bg-red-100">
                          {dayTotal > 0 ? formatCurrency(dayTotal) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-gray-700 font-bold">
                    <td className="px-4 py-3 border-r bg-amber-800 text-white sticky left-0 z-10">
                      TOTAL
                    </td>
                    {weeklyReportData.hosts.map(host => {
                      const total = weeklyReportData.totals[host] || 0;
                      return (
                        <td key={host} className="px-4 py-3 border-r text-right bg-amber-100">
                          {total > 0 ? (
                            <span className="text-gray-800 font-bold">{formatCurrency(total)}</span>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right text-white bg-red-700 font-bold">
                      {formatCurrency(weeklyReportData.grandTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Personnel Summary Table */}
          <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <h3 className="text-lg font-bold text-gray-800">Báo Cáo Tổng Kết Nhân Viên (员工汇总报告)</h3>
              <div className="flex gap-2 items-center flex-wrap">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Từ ngày: (从日期:)</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-navy bg-white shadow-sm"
                />
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Đến ngày: (至日期:)</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-navy bg-white shadow-sm"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-white uppercase bg-brand-navy border-b">
                  <tr>
                    <th className="px-6 py-3 border-r text-left">Nhân viên (员工)</th>
                    <th className="px-6 py-3 border-r text-left">Phòng ban (部门)</th>
                    <th className="px-6 py-3 border-r text-right">Tổng GMV (总GMV)</th>
                    <th className="px-6 py-3 border-r text-right">Tổng Chi phí QC (总广告费)</th>
                    <th className="px-6 py-3 border-r text-right">ROI TB (平均ROI)</th>
                    <th className="px-6 py-3 border-r text-center">Số báo cáo (报告数)</th>
                    <th className="px-6 py-3 text-right">Lợi nhuận (利润)</th>
                    <th className="px-6 py-3 text-center">Thao tác (操作)</th>
                  </tr>
                </thead>
                <tbody>
                  {personnelSummary.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-400">
                        Chưa có dữ liệu trong khoảng thời gian này (此时间段暂无数据)
                      </td>
                    </tr>
                  ) : (
                    personnelSummary.map((item) => {
                      const profit = item.totalGMV - item.totalAdCost;
                      return (
                        <tr key={item.person.id || item.person.fullName} className="border-b hover:bg-gray-50">
                          <td className="px-6 py-4 border-r font-bold text-gray-800">
                            {item.person.fullName}
                            {item.person.role === 'admin' && (
                              <span className="ml-2 bg-purple-100 text-purple-800 text-xs px-1.5 rounded border border-purple-200">Admin</span>
                            )}
                          </td>
                          <td className="px-6 py-4 border-r">
                            <span className={`px-2 py-1 rounded text-xs font-medium border ${
                              item.person.department === 'Live' ? 'bg-red-50 text-red-700 border-red-200' :
                              item.person.department === 'Media' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              'bg-gray-50 text-gray-600 border-gray-200'
                            }`}>
                              {item.person.department || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4 border-r text-right font-bold text-blue-600">
                            {formatCurrency(item.totalGMV)}
                          </td>
                          <td className="px-6 py-4 border-r text-right font-bold text-red-600">
                            {formatCurrency(item.totalAdCost)}
                          </td>
                          <td className="px-6 py-4 border-r text-right">
                            <span className={`px-2 py-1 rounded text-xs font-bold border ${getStatusColor(item.avgROI)}`}>
                              {formatROI(item.avgROI)}
                            </span>
                          </td>
                          <td className="px-6 py-4 border-r text-center font-medium text-gray-600">
                            {item.reportCount}
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-green-600">
                            {formatCurrency(profit)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => {
                                // Xem chi tiết nhân viên - có thể mở modal hoặc điều hướng
                                const personReports = reports.filter(r => {
                                  if (!r.reporter) return false;
                                  const reporterName = r.reporter.toLowerCase();
                                  const personName = item.person.fullName.toLowerCase();
                                  return reporterName.includes(personName) || personName.includes(reporterName);
                                });
                                // Có thể tạo modal xem chi tiết hoặc filter bảng
                                alert(`Xem chi tiết ${item.person.fullName} - ${personReports.length} báo cáo`);
                              }}
                              className="text-green-600 hover:text-green-800 font-medium text-xs border border-green-200 rounded px-2 py-1 bg-green-50 hover:bg-green-100"
                            >
                              Xem (查看)
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Link to Detail Page */}
          <div className="bg-white rounded shadow-sm border border-gray-200 p-4 text-center">
            <p className="text-gray-600 mb-3">Xem bảng chi tiết đầy đủ với tất cả các trường dữ liệu: (查看包含所有数据字段的详细表格:)</p>
            <Link
              to="/live-report-detail"
              className="inline-block bg-brand-navy hover:bg-brand-darkNavy text-white px-6 py-2 rounded font-bold transition-colors"
            >
              Xem Chi Tiết Báo Cáo Live (直播报告详情)
            </Link>
          </div>
        </>
      )}
    </div>
  );
};