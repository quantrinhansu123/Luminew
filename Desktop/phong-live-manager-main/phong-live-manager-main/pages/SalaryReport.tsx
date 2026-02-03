import React, { useState, useMemo, useEffect } from 'react';
import { fetchLiveReports, fetchPersonnel, fetchStores } from '../services/dataService';
import { formatCurrency, matchNames } from '../utils/formatUtils';
import { LiveReport, Personnel, Store } from '../types';
import { isPartner, getPartnerId, isAdmin } from '../utils/permissionUtils';

export const SalaryReport: React.FC = () => {
  const [reports, setReports] = useState<LiveReport[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
  const [isLoading, setIsLoading] = useState(true);

  // Threshold values for color coding (可调整的阈值)
  const [kpiGreenThreshold, setKpiGreenThreshold] = useState(100); // KPI Green: >= 100%
  const [kpiYellowThreshold, setKpiYellowThreshold] = useState(80); // KPI Yellow: >= 80%

  // Salary status thresholds: GMV required per 1 million VND salary (每百万工资需要的GMV)
  const [gmvPerSalaryGreen, setGmvPerSalaryGreen] = useState(22); // Green: GMV > 22M per 1M salary (超过要求)
  const [gmvPerSalaryYellow, setGmvPerSalaryYellow] = useState(21); // Yellow: GMV = 21M per 1M salary (刚好达标/盈亏平衡)

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      let [reportData, personnelData, storeData] = await Promise.all([
        fetchLiveReports(),
        fetchPersonnel(),
        fetchStores()
      ]);

      // Nếu là nhân viên có department "Đối tác", chỉ hiển thị stores được gán cho họ
      if (isPartner() && !isAdmin()) {
        const partnerId = getPartnerId();
        if (partnerId) {
          storeData = storeData.filter(s => s.partnerId === partnerId);
          const allowedStoreIds = storeData.map(s => s.id);
          reportData = reportData.filter(r => allowedStoreIds.includes(r.channelId));
        }
      }

      setReports(reportData);
      setPersonnel(personnelData);
      setStores(storeData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter reports by month
  const monthlyReports = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    return reports.filter(report => {
      const reportDate = new Date(report.date);
      return reportDate.getFullYear() === year && reportDate.getMonth() + 1 === month;
    });
  }, [reports, selectedMonth]);

  // Calculate salary and revenue data for each personnel
  const salaryData = useMemo(() => {
    const dataMap: Record<string, {
      person: Personnel;
      totalGMV: number;
      totalAdCost: number;
      profit: number;
      roi: number;
      reportCount: number;
      baseSalary: number;
      kpiTarget: number;
      kpiAchievement: number;
      kpiStatus: 'green' | 'yellow' | 'red';
      salaryStatus: 'green' | 'yellow' | 'red';
      requiredGMV: number; // GMV required to cover salary (支付工资所需的GMV)
      gmvToSalaryRatio: number; // Actual GMV per 1M salary (实际每百万工资的GMV)
    }> = {};

    // Initialize with all personnel
    personnel.forEach(person => {
      dataMap[person.id || person.fullName] = {
        person,
        totalGMV: 0,
        totalAdCost: 0,
        profit: 0,
        roi: 0,
        reportCount: 0,
        baseSalary: person.baseSalary || 0,
        kpiTarget: person.monthlyKPITarget || 0,
        kpiAchievement: 0,
        kpiStatus: 'red',
        salaryStatus: 'red',
        requiredGMV: 0,
        gmvToSalaryRatio: 0
      };
    });

    // Aggregate data from reports - tính theo hostName (tên host) thay vì reporter (người nhập)
    monthlyReports.forEach(report => {
      if (!report.hostName) return;

      // Find matching personnel - tìm theo hostName (sử dụng matchNames để xử lý khoảng trắng và ký tự đặc biệt)
      const matchingPerson = personnel.find(person => {
        return matchNames(report.hostName, person.fullName) ||
          matchNames(report.hostName, person.email);
      });

      if (matchingPerson) {
        const personId = matchingPerson.id || matchingPerson.fullName;
        if (!dataMap[personId]) {
          dataMap[personId] = {
            person: matchingPerson,
            totalGMV: 0,
            totalAdCost: 0,
            profit: 0,
            roi: 0,
            reportCount: 0,
            baseSalary: matchingPerson.baseSalary || 0,
            kpiTarget: matchingPerson.monthlyKPITarget || 0,
            kpiAchievement: 0,
            kpiStatus: 'red',
            salaryStatus: 'red',
            requiredGMV: 0,
            gmvToSalaryRatio: 0
          };
        }

        const gmv = Number(report.gmv) || 0;
        const adCost = Number(report.adCost) || 0;

        dataMap[personId].totalGMV += gmv;
        dataMap[personId].totalAdCost += adCost;
        dataMap[personId].reportCount += 1;
      }
    });

    // Calculate metrics and status
    Object.values(dataMap).forEach(item => {
      item.profit = item.totalGMV - item.totalAdCost;
      item.roi = item.totalAdCost > 0 ? item.totalGMV / item.totalAdCost : 0;
      item.kpiAchievement = item.kpiTarget > 0 ? (item.totalGMV / item.kpiTarget) * 100 : 0;

      // KPI Status: Use dynamic thresholds
      if (item.kpiAchievement >= kpiGreenThreshold) {
        item.kpiStatus = 'green';
      } else if (item.kpiAchievement >= kpiYellowThreshold) {
        item.kpiStatus = 'yellow';
      } else {
        item.kpiStatus = 'red';
      }

      // Salary Status: Based on GMV-to-Salary ratio (基于GMV与工资的比率)
      // Calculate required GMV and actual ratio
      const salaryInMillions = item.baseSalary / 1_000_000; // Convert to millions
      item.requiredGMV = salaryInMillions * gmvPerSalaryYellow * 1_000_000; // Required GMV for break-even
      item.gmvToSalaryRatio = salaryInMillions > 0 ? item.totalGMV / (salaryInMillions * 1_000_000) : 0;

      // Determine status based on actual GMV vs required GMV
      if (item.totalGMV > salaryInMillions * gmvPerSalaryGreen * 1_000_000) {
        item.salaryStatus = 'green'; // Exceeds requirement (超过要求)
      } else if (item.totalGMV >= item.requiredGMV) {
        item.salaryStatus = 'yellow'; // Meets requirement / Break-even (达标/盈亏平衡)
      } else {
        item.salaryStatus = 'red'; // Below requirement / Warning (低于要求/警告)
      }
    });

    return Object.values(dataMap).sort((a, b) => b.totalGMV - a.totalGMV);
  }, [monthlyReports, personnel, kpiGreenThreshold, kpiYellowThreshold, gmvPerSalaryGreen, gmvPerSalaryYellow]);


  const getStatusColor = (status: 'green' | 'yellow' | 'red') => {
    switch (status) {
      case 'green':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'yellow':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'red':
        return 'bg-red-100 text-red-800 border-red-300';
    }
  };

  const getStatusIcon = (status: 'green' | 'yellow' | 'red') => {
    switch (status) {
      case 'green':
        return '✓';
      case 'yellow':
        return '⚠';
      case 'red':
        return '✗';
    }
  };

  // Check if user is logged in
  const currentUser = localStorage.getItem('currentUser');
  if (!currentUser) {
    window.location.hash = '#/login';
    return null;
  }

  if (isLoading) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Đang tải dữ liệu... (正在加载数据...)</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen w-screen font-sans space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800 uppercase">Báo Cáo Doanh Số / Lương (营收/工资报告)</h2>
        <div className="flex gap-2 items-center">
          <label className="text-sm font-medium text-gray-700">Tháng: (月份:)</label>
          <input
            type="month"
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-navy bg-white shadow-sm"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-blue-500">
          <p className="text-xs text-gray-500 uppercase font-bold">Tổng GMV (总GMV)</p>
          <p className="text-xl font-bold text-blue-600 mt-1">
            {formatCurrency(salaryData.reduce((sum, item) => sum + item.totalGMV, 0))}
          </p>
        </div>
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-red-500">
          <p className="text-xs text-gray-500 uppercase font-bold">Tổng Chi Phí QC (总广告费)</p>
          <p className="text-xl font-bold text-red-600 mt-1">
            {formatCurrency(salaryData.reduce((sum, item) => sum + item.totalAdCost, 0))}
          </p>
        </div>
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-green-500">
          <p className="text-xs text-gray-500 uppercase font-bold">Tổng Lợi Nhuận (总利润)</p>
          <p className="text-xl font-bold text-green-600 mt-1">
            {formatCurrency(salaryData.reduce((sum, item) => sum + item.profit, 0))}
          </p>
        </div>
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-purple-500">
          <p className="text-xs text-gray-500 uppercase font-bold">Số Nhân Viên (员工人数)</p>
          <p className="text-xl font-bold text-purple-600 mt-1">{salaryData.length}</p>
        </div>
      </div>

      {/* Legend with Editable Thresholds */}
      <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
        <h3 className="text-sm font-bold text-gray-800 mb-3">Chú thích màu sắc: (颜色说明:)</h3>

        {/* Threshold Controls */}
        <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* KPI Thresholds */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-600 uppercase">Ngưỡng KPI (KPI阈值):</p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 w-24">Xanh (绿色) ≥</label>
                <input
                  type="number"
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-20 focus:outline-none focus:border-brand-navy"
                  value={kpiGreenThreshold}
                  onChange={(e) => setKpiGreenThreshold(Number(e.target.value))}
                  min="0"
                  max="200"
                />
                <span className="text-xs text-gray-600">%</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 w-24">Vàng (黄色) ≥</label>
                <input
                  type="number"
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-20 focus:outline-none focus:border-brand-navy"
                  value={kpiYellowThreshold}
                  onChange={(e) => setKpiYellowThreshold(Number(e.target.value))}
                  min="0"
                  max="200"
                />
                <span className="text-xs text-gray-600">%</span>
              </div>
            </div>

            {/* Salary GMV Ratio Thresholds */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-600 uppercase">Tỷ lệ GMV/Lương (GMV/工资比率):</p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 w-32">Xanh (绿色) &gt;</label>
                <input
                  type="number"
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-20 focus:outline-none focus:border-brand-navy"
                  value={gmvPerSalaryGreen}
                  onChange={(e) => setGmvPerSalaryGreen(Number(e.target.value))}
                  min="1"
                  max="100"
                  step="0.5"
                />
                <span className="text-xs text-gray-600">triệu GMV / 1tr lương</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 w-32">Vàng (黄色) ≥</label>
                <input
                  type="number"
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-20 focus:outline-none focus:border-brand-navy"
                  value={gmvPerSalaryYellow}
                  onChange={(e) => setGmvPerSalaryYellow(Number(e.target.value))}
                  min="1"
                  max="100"
                  step="0.5"
                />
                <span className="text-xs text-gray-600">triệu GMV / 1tr lương</span>
              </div>
            </div>
          </div>
        </div>

        {/* Color Legend */}
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-100 border-2 border-green-300"></div>
            <span className="text-sm text-gray-700">Xanh: Tốt (绿色: 良好) - KPI ≥ {kpiGreenThreshold}% | Lương: GMV &gt; {gmvPerSalaryGreen}tr/1tr lương</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-yellow-100 border-2 border-yellow-300"></div>
            <span className="text-sm text-gray-700">Vàng: Hòa vốn (黄色: 盈亏平衡) - KPI ≥ {kpiYellowThreshold}% | Lương: GMV ≥ {gmvPerSalaryYellow}tr/1tr lương</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-100 border-2 border-red-300"></div>
            <span className="text-sm text-gray-700">Đỏ: Báo động (红色: 警告) - KPI &lt; {kpiYellowThreshold}% | Lương: GMV &lt; {gmvPerSalaryYellow}tr/1tr lương</span>
          </div>
        </div>
      </div>

      {/* Salary Report Table */}
      <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-bold text-gray-800">Chi Tiết Doanh Số / Lương (营收/工资详情)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy text-white border-b">
              <tr>
                <th className="px-4 py-3 text-left">Nhân viên (员工)</th>
                <th className="px-4 py-3 text-left">Phòng ban (部门)</th>
                <th className="px-4 py-3 text-right">Lương cứng (固定工资)</th>
                <th className="px-4 py-3 text-right">Mục tiêu KPI (KPI目标)</th>
                <th className="px-4 py-3 text-right">Tổng GMV (总GMV)</th>
                <th className="px-4 py-3 text-right">Chi phí QC (广告费)</th>
                <th className="px-4 py-3 text-right">Lợi nhuận (利润)</th>
                <th className="px-4 py-3 text-right">ROI (投资回报率)</th>
                <th className="px-4 py-3 text-center">Đạt KPI (KPI达成率)</th>
                <th className="px-4 py-3 text-center">Trạng thái KPI (KPI状态)</th>
                <th className="px-4 py-3 text-center">Trạng thái Lương (工资状态)</th>
                <th className="px-4 py-3 text-center">Số báo cáo (报告数)</th>
              </tr>
            </thead>
            <tbody>
              {salaryData.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-gray-400">
                    Chưa có dữ liệu cho tháng này (本月暂无数据)
                  </td>
                </tr>
              ) : (
                salaryData.map((item) => (
                  <tr key={item.person.id || item.person.fullName} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-bold text-gray-800">
                      {item.person.fullName}
                      {item.person.role === 'admin' && (
                        <span className="ml-2 bg-purple-100 text-purple-800 text-xs px-1.5 rounded border border-purple-200">Admin</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${item.person.department === 'Live' ? 'bg-red-50 text-red-700 border-red-200' :
                        item.person.department === 'Media' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-gray-50 text-gray-600 border-gray-200'
                        }`}>
                        {item.person.department || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.baseSalary)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.kpiTarget)}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">{formatCurrency(item.totalGMV)}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrency(item.totalAdCost)}</td>
                    <td className="px-4 py-3 text-right font-bold text-green-600">{formatCurrency(item.profit)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`px-2 py-1 rounded text-xs font-bold border ${getStatusColor(item.salaryStatus)}`}>
                        {item.roi.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-medium">
                      {item.kpiAchievement.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold border-2 ${getStatusColor(item.kpiStatus)}`}>
                        {getStatusIcon(item.kpiStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold border-2 ${getStatusColor(item.salaryStatus)}`}>
                        {getStatusIcon(item.salaryStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-medium">{item.reportCount}</td>
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

