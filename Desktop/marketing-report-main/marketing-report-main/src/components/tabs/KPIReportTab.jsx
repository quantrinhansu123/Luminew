import { useMemo } from 'react';

export function KPIReportTab({ data }) {
  // Helper functions
  const formatNumber = (num) => {
    return num ? num.toLocaleString('vi-VN') : '0';
  };

  const formatCurrency = (num) => {
    return num ? num.toLocaleString('vi-VN') + 'đ' : '0đ';
  };

  const formatPercent = (num) => {
    return (num * 100).toFixed(2) + '%';
  };

  // Calculate summary data
  const summaryData = useMemo(() => {
    const grouped = {};
    
    data.forEach(item => {
      const key = `${item.team}_${item.name}`;
      if (!grouped[key]) {
        grouped[key] = {
          team: item.team,
          name: item.name,
          cpqc: 0,
          revenue: 0,
          revenueReal: 0,
          soDonHuy: 0,
          soDonHuyThucTe: 0,
          doanhSoHuy: 0,
          dsHoanHuyThucTe: 0,
          dsSauShip: 0,
          dsThanhCongThucTe: 0,
          dsThanhCong: 0,
          kpiValue: item.kpiValue || 0
        };
      }
      
      grouped[key].cpqc += item.cpqc || 0;
      grouped[key].revenue += item.revenue || 0;
      grouped[key].revenueReal += item.revenueReal || 0;
      grouped[key].soDonHuy += item.soDonHuy || 0;
      grouped[key].soDonHuyThucTe += item.soDonHuyThucTe || 0;
      grouped[key].doanhSoHuy += item.doanhSoHuy || 0;
      grouped[key].dsHoanHuyThucTe += item.dsHoanHuyThucTe || 0;
      grouped[key].dsSauShip += item.dsSauShip || 0;
      grouped[key].dsThanhCongThucTe += item.dsThanhCongThucTe || 0;
      grouped[key].dsThanhCong += item.dsThanhCong || 0;
    });
    
    return Object.values(grouped);
  }, [data]);

  // Calculate totals
  const totals = useMemo(() => {
    return summaryData.reduce((acc, row) => ({
      cpqc: acc.cpqc + row.cpqc,
      revenue: acc.revenue + row.revenue,
      revenueReal: acc.revenueReal + row.revenueReal,
      soDonHuy: acc.soDonHuy + row.soDonHuy,
      soDonHuyThucTe: acc.soDonHuyThucTe + row.soDonHuyThucTe,
      doanhSoHuy: acc.doanhSoHuy + row.doanhSoHuy,
      dsHoanHuyThucTe: acc.dsHoanHuyThucTe + row.dsHoanHuyThucTe,
      dsSauShip: acc.dsSauShip + row.dsSauShip,
      dsThanhCongThucTe: acc.dsThanhCongThucTe + row.dsThanhCongThucTe,
      dsThanhCong: acc.dsThanhCong + row.dsThanhCong,
      kpiValue: acc.kpiValue + row.kpiValue
    }), {
      cpqc: 0,
      revenue: 0,
      revenueReal: 0,
      soDonHuy: 0,
      soDonHuyThucTe: 0,
      doanhSoHuy: 0,
      dsHoanHuyThucTe: 0,
      dsSauShip: 0,
      dsThanhCongThucTe: 0,
      dsThanhCong: 0,
      kpiValue: 0
    });
  }, [summaryData]);

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
          <thead className="bg-secondary">
            <tr>
              <th className="px-2 py-2 text-center text-xs font-semibold text-white uppercase border border-gray-400 whitespace-nowrap">STT</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-white uppercase border border-gray-400 whitespace-nowrap">Team</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-white uppercase border border-gray-400 whitespace-nowrap">Marketing</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-white uppercase border border-gray-400 whitespace-nowrap">CPQC</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-white uppercase border border-gray-400 whitespace-nowrap">DS</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-blue-100 uppercase border border-gray-400 whitespace-nowrap">DS (TT)</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-white uppercase border border-gray-400 whitespace-nowrap">Số đơn hủy</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-blue-100 uppercase border border-gray-400 whitespace-nowrap">Đơn hủy (TT)</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-white uppercase border border-gray-400 whitespace-nowrap">DS hủy</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-blue-100 uppercase border border-gray-400 whitespace-nowrap">DS hủy (TT)</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-white uppercase border border-gray-400 whitespace-nowrap">DS sau ship</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-blue-100 uppercase border border-gray-400 whitespace-nowrap">DS TC (TT)</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-white uppercase border border-gray-400 whitespace-nowrap">DS TC</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-white uppercase border border-gray-400 whitespace-nowrap">%CP/DS</th>
              <th className="px-2 py-2 text-center text-xs font-semibold text-white uppercase border border-gray-400 whitespace-nowrap">% KPI</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {/* Total Row */}
            <tr className="bg-primary text-white font-bold">
              <td className="px-2 py-2 text-xs border border-gray-400" colSpan="3">TỔNG CỘNG</td>
              <td className="px-2 py-2 text-xs text-right border border-gray-400">{formatCurrency(totals.cpqc)}</td>
              <td className="px-2 py-2 text-xs text-right border border-gray-400">{formatCurrency(totals.revenue)}</td>
              <td className="px-2 py-2 text-xs text-right border border-gray-400">{formatCurrency(totals.revenueReal)}</td>
              <td className="px-2 py-2 text-xs text-right border border-gray-400">{formatNumber(totals.soDonHuy)}</td>
              <td className="px-2 py-2 text-xs text-right border border-gray-400">{formatNumber(totals.soDonHuyThucTe)}</td>
              <td className="px-2 py-2 text-xs text-right border border-gray-400">{formatCurrency(totals.doanhSoHuy)}</td>
              <td className="px-2 py-2 text-xs text-right border border-gray-400">{formatCurrency(totals.dsHoanHuyThucTe)}</td>
              <td className="px-2 py-2 text-xs text-right border border-gray-400">{formatCurrency(totals.dsSauShip)}</td>
              <td className="px-2 py-2 text-xs text-right border border-gray-400">{formatCurrency(totals.dsThanhCongThucTe)}</td>
              <td className="px-2 py-2 text-xs text-right border border-gray-400">{formatCurrency(totals.dsThanhCong)}</td>
              <td className="px-2 py-2 text-xs text-center border border-gray-400">
                {formatPercent(totals.dsSauShip ? totals.cpqc / totals.dsSauShip : 0)}
              </td>
              <td className="px-2 py-2 text-xs text-center border border-gray-400">
                {formatPercent(totals.kpiValue ? totals.dsSauShip / totals.kpiValue : 0)}
              </td>
            </tr>

            {/* Data Rows */}
            {summaryData.map((row, index) => {
              const cpds = row.dsSauShip ? row.cpqc / row.dsSauShip : 0;
              const kpiPercent = row.kpiValue ? row.dsSauShip / row.kpiValue : 0;
              
              return (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-2 py-2 text-xs font-medium text-gray-900 border border-gray-300 whitespace-nowrap">{index + 1}</td>
                  <td className="px-2 py-2 text-xs font-medium text-gray-900 border border-gray-300 whitespace-nowrap">{row.team}</td>
                  <td className="px-2 py-2 text-xs font-medium text-gray-900 border border-gray-300 whitespace-nowrap">{row.name}</td>
                  <td className="px-2 py-2 text-xs font-medium text-gray-900 text-right border border-gray-300 whitespace-nowrap">{formatCurrency(row.cpqc)}</td>
                  <td className="px-2 py-2 text-xs font-medium text-gray-900 text-right border border-gray-300 whitespace-nowrap">{formatCurrency(row.revenue)}</td>
                  <td className="px-2 py-2 text-xs font-medium text-blue-600 text-right border border-gray-300 whitespace-nowrap">{formatCurrency(row.revenueReal)}</td>
                  <td className="px-2 py-2 text-xs font-medium text-gray-900 text-right border border-gray-300 whitespace-nowrap">{formatNumber(row.soDonHuy)}</td>
                  <td className="px-2 py-2 text-xs font-medium text-blue-600 text-right border border-gray-300 whitespace-nowrap">{formatNumber(row.soDonHuyThucTe)}</td>
                  <td className="px-2 py-2 text-xs font-medium text-gray-900 text-right border border-gray-300 whitespace-nowrap">{formatCurrency(row.doanhSoHuy)}</td>
                  <td className="px-2 py-2 text-xs font-medium text-blue-600 text-right border border-gray-300 whitespace-nowrap">{formatCurrency(row.dsHoanHuyThucTe)}</td>
                  <td className="px-2 py-2 text-xs font-medium text-gray-900 text-right border border-gray-300 whitespace-nowrap">{formatCurrency(row.dsSauShip)}</td>
                  <td className="px-2 py-2 text-xs font-medium text-blue-600 text-right border border-gray-300 whitespace-nowrap">{formatCurrency(row.dsThanhCongThucTe)}</td>
                  <td className="px-2 py-2 text-xs font-medium text-gray-900 text-right border border-gray-300 whitespace-nowrap">{formatCurrency(row.dsThanhCong)}</td>
                  <td className={`px-2 py-2 text-xs font-medium text-center border border-gray-300 whitespace-nowrap ${
                    cpds > 0.33 ? 'bg-yellow-100 text-yellow-800' : ''
                  }`}>
                    {formatPercent(cpds)}
                  </td>
                  <td className={`px-2 py-2 text-xs font-medium text-center border border-gray-300 whitespace-nowrap ${
                    kpiPercent >= 1 ? 'bg-green-100 text-green-800' : kpiPercent >= 0.8 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {formatPercent(kpiPercent)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {summaryData.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">Không có dữ liệu phù hợp với bộ lọc</p>
        </div>
      )}
    </div>
  );
}
