
import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, AreaChart, Area, ComposedChart } from 'recharts';
import { TEAM_PERFORMANCE, MOCK_CHART_DATA, TEAM_SPECIFIC_DETAILS } from '../../services/mockData';

const TeamView: React.FC = () => {
  const [selectedTeam, setSelectedTeam] = useState('MKT');

  const chartData = [
    { name: 'Sale ngày', t9: 40, t10: 30, t11: 20, t12: 15 },
    { name: 'Sale đêm', t9: 10, t10: 15, t11: 12, t12: 8 },
    { name: 'MKT', t9: 80, t10: 95, t11: 45, t12: 35 },
    { name: 'Vận đơn', t9: 60, t10: 75, t11: 65, t12: 55 },
    { name: 'CSKH', t9: 55, t10: 70, t11: 15, t12: 12 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Area A - All Teams Chart */}
      <div className="bg-white p-6 border rounded-xl shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-6 border-l-4 border-green-500 pl-3 uppercase">SO SÁNH DOANH THU CÁC TEAM TRONG 4 KỲ</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip cursor={{ fill: '#f8fafc' }} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="t9" name="Tháng 9" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="t10" name="Tháng 10" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="t11" name="Tháng 11" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="t12" name="Tháng 12" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Area B - Team Selector & Drill-down */}
      <div className="bg-white p-6 border rounded-xl shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-sm font-bold text-slate-800 uppercase">TĂNG TRƯỞNG ĐẶC THÙ: {selectedTeam}</h3>
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="border text-xs rounded-lg px-3 py-1.5 bg-slate-50 focus:ring-1 focus:ring-green-500 outline-none"
          >
            {['MKT', 'Sale', 'CSKH', 'Vận đơn', 'HCNS', 'R&D'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 border rounded-lg p-4 bg-slate-50">
            <p className="text-[10px] font-bold text-gray-500 mb-4 uppercase">{selectedTeam} - Tổng quan & Xu hướng</p>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={TEAM_SPECIFIC_DETAILS[selectedTeam]?.metrics || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} orientation="left" />
                <YAxis yAxisId="right" tick={{ fontSize: 10 }} orientation="right" />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {TEAM_SPECIFIC_DETAILS[selectedTeam]?.chartConfig?.lines.map((line: any, i: number) => {
                  if (line.type === 'bar') return <Bar key={i} yAxisId="left" dataKey={line.key} name={line.name} fill={line.color} radius={[4, 4, 0, 0]} barSize={30} />;
                  if (line.type === 'area') return <Area key={i} yAxisId="right" type="monotone" dataKey={line.key} name={line.name} stroke={line.color} fill={`${line.color}33`} />;
                  return <Line key={i} yAxisId="right" type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} dot={{ r: 3 }} />;
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="h-64 border rounded-lg p-4 bg-slate-50">
            <p className="text-[10px] font-bold text-gray-500 mb-4 uppercase">{selectedTeam} - {TEAM_SPECIFIC_DETAILS[selectedTeam]?.secondaryChart?.title || 'Hiệu suất'}</p>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={TEAM_SPECIFIC_DETAILS[selectedTeam]?.metrics || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {TEAM_SPECIFIC_DETAILS[selectedTeam]?.secondaryChart?.lines.map((line: any, i: number) => (
                  <Line key={i} type="stepAfter" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Area C - Detailed Data Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mt-6">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">CHI TIẾT CHỈ SỐ: {selectedTeam}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                  <th className="p-3 border-r border-slate-200 font-black uppercase tracking-tighter w-24">Kỳ</th>
                  {TEAM_SPECIFIC_DETAILS[selectedTeam]?.metrics && Object.keys(TEAM_SPECIFIC_DETAILS[selectedTeam].metrics[0])
                    .filter(k => k !== 'month')
                    .map((key) => (
                      <th key={key} className="p-3 border-r border-slate-200 font-black uppercase tracking-tighter">
                        {key === 'revenue' ? 'Doanh số (Tỷ)' :
                          key === 'adsRatio' ? 'Tỷ lệ ADS (%)' :
                            key === 'mesCount' ? 'Số Mes' :
                              key === 'mesCommit' ? 'Mes Cam Kết' :
                                key === 'closeRate' ? 'Tỷ lệ chốt (%)' :
                                  key === 'callCount' ? 'Số cuộc gọi' :
                                    key === 'costPerMes' ? 'Chi phí/Mes' :
                                      key === 'responseTime' ? 'Phản hồi (phút)' :
                                        key === 'satisfaction' ? 'Hài lòng (điểm)' :
                                          key === 'ticketCount' ? 'Số sự vụ' :
                                            key === 'shipTime' ? 'TG Giao (ngày)' :
                                              key === 'returnRate' ? 'Tỷ lệ hoàn (%)' :
                                                key === 'shipCost' ? 'Chi phí vận chuyển' :
                                                  key === 'staffCount' ? 'Nhân sự' :
                                                    key === 'turnover' ? 'Biến động (%)' :
                                                      key === 'trainingHours' ? 'Giờ đào tạo' :
                                                        key === 'newProducts' ? 'Sản phẩm mới' :
                                                          key === 'successRate' ? 'Thành công (%)' :
                                                            key === 'cycleTime' ? 'Cycle Time' :
                                                              key}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {TEAM_SPECIFIC_DETAILS[selectedTeam]?.metrics?.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 border-r border-slate-100 font-bold text-slate-700">{row.month}</td>
                    {Object.keys(row).filter(k => k !== 'month').map((key, j) => (
                      <td key={j} className="p-3 border-r border-slate-100 font-medium text-slate-600">
                        {typeof row[key] === 'number' ? row[key].toLocaleString() : row[key]}
                        {key.toLowerCase().includes('rate') || key.toLowerCase().includes('ratio') ? '%' : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamView;
