
import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { INDIVIDUAL_RANKING } from '../../services/mockData';
import { ViewLevel } from '../../types';

const KPIDashboard: React.FC<{ level: ViewLevel }> = ({ level }) => {
  const [selectedTeam, setSelectedTeam] = useState('Sale');

  // Gauge data for Master KPI
  const masterKPIs = [
    { name: 'Doanh thu', actual: 150, target: 180, percentage: 80, color: '#556b2f' },
    { name: 'DT Lumora', actual: 98, target: 120, percentage: 75, color: '#800040' }
  ];

  const subKPIs = [
    { name: 'Tỷ lệ Ads', percentage: 54, mt: '22%', kq: '25%', color: '#d9534f' },
    { name: 'Tỷ lệ chốt', percentage: 87, mt: '12%', kq: '10,1%', color: '#7b68ee' },
    { name: 'Tỷ lệ thu tiền', percentage: 78, mt: '92%', kq: '89%', color: '#a2cd5a' },
    { name: 'Tỷ lệ resale', percentage: 69, mt: '14%', kq: '9%', color: '#8b4513' }
  ];

  const teamKPICharts = [
    { title: 'KPI Doanh thu', data: [{ month: 'T9', val: 80 }, { month: 'T10', val: 72 }, { month: 'T11', val: 82 }, { month: 'T12', val: 81 }] },
    { title: 'KPI Tỷ lệ Ads', data: [{ month: 'T9', val: 82 }, { month: 'T10', val: 74 }, { month: 'T11', val: 82 }, { month: 'T12', val: 82 }] },
    { title: 'KPI Mes cam kết', data: [{ month: 'T9', val: 80 }, { month: 'T10', val: 72 }, { month: 'T11', val: 80 }, { month: 'T12', val: 80 }] }
  ];

  const individualRankingData = INDIVIDUAL_RANKING.map(p => ({
    name: p.name,
    kpi: Math.floor(Math.random() * 20) + 80
  })).sort((a, b) => b.kpi - a.kpi);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {level === ViewLevel.COMPANY && (
        <>
          <div className="bg-white p-10 border rounded-2xl shadow-sm">
            <h3 className="text-sm font-black text-[#50a050] uppercase tracking-widest mb-12 border-l-4 border-[#50a050] pl-4">KPI MASTER - CẤP CÔNG TY</h3>
            <div className="flex flex-col lg:flex-row gap-16 items-center justify-center">
              {/* Left Column: Scaled Up Big Gauges */}
              <div className="flex flex-col md:flex-row lg:flex-col gap-16">
                {masterKPIs.map((kpi, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <div className="relative w-64 h-64 scale-110 lg:scale-125"> {/* Increased size from 48 to 64 + scaling */}
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[{ value: kpi.actual }, { value: Math.max(0, kpi.target - kpi.actual) }]}
                            innerRadius={85}
                            outerRadius={115}
                            startAngle={225}
                            endAngle={-45}
                            dataKey="value"
                            stroke="none"
                          >
                            <Cell fill={kpi.color} />
                            <Cell fill="#f1f5f9" />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-black text-slate-800 border-b-2 border-red-700 pb-1">{kpi.actual} tỷ</span>
                        <span className="text-3xl font-black text-slate-400 mt-1">{kpi.percentage}%</span>
                      </div>
                    </div>
                    <div className="text-center mt-12 lg:mt-16">
                      <p className="font-black text-[#a52a2a] uppercase text-lg tracking-tight">{kpi.name}</p>
                      <p className="text-xs font-bold text-slate-400">MT: {kpi.target} tỷ</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right Column: Scaled Up Mini Gauges */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-12 lg:ml-12">
                {subKPIs.map((kpi, idx) => (
                  <div key={idx} className="flex items-center gap-8 group">
                    <div className="relative w-32 h-32 scale-110"> {/* Increased size from 24 to 32 */}
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[{ value: kpi.percentage }, { value: 100 - kpi.percentage }]}
                            innerRadius={45}
                            outerRadius={58}
                            startAngle={225}
                            endAngle={-45}
                            dataKey="value"
                            stroke="none"
                          >
                            <Cell fill={kpi.color} />
                            <Cell fill="#f1f5f9" />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-sm font-black" style={{ color: kpi.color }}>{kpi.percentage}%</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-black text-[#a52a2a] uppercase tracking-tighter mb-1">{kpi.name}</p>
                      <div className="text-xs font-bold text-slate-500 space-y-1">
                        <p>MT: {kpi.mt}</p>
                        <p>KQ: {kpi.kq}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b"><h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Khu vực B – BẢNG KPI</h3></div>
            <table className="w-full text-[11px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b">
                  <th className="p-4 font-black text-slate-800 border-r">KPI</th>
                  <th className="p-4 font-black text-slate-800 border-r text-center">Mục tiêu</th>
                  <th className="p-4 font-black text-slate-800 border-r text-center">Hoàn thành</th>
                  <th className="p-4 font-black text-slate-800 border-r text-center">Tỷ lệ %</th>
                  <th className="p-4 font-black text-slate-800 text-center">Tỷ lệ sau quy đổi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {['KPI.1', '...', 'KPI.n'].map((name) => (
                  <tr key={name} className="hover:bg-slate-50">
                    <td className="p-4 font-bold border-r">{name}</td>
                    <td className="p-4 border-r text-center text-slate-400">--</td>
                    <td className="p-4 border-r text-center text-slate-400">--</td>
                    <td className="p-4 border-r text-center text-slate-400">--</td>
                    <td className="p-4 text-center font-black text-[#50a050]">--</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {level === ViewLevel.TEAM && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {teamKPICharts.map((chart, i) => (
              <div key={i} className="bg-white p-5 border rounded-xl shadow-sm">
                <h4 className="text-[10px] font-black text-[#a52a2a] text-center uppercase mb-6">{chart.title}</h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chart.data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{fontSize: 10, fill: '#a52a2a', fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{fontSize: 10}} axisLine={false} tickLine={false} unit="%" />
                      <Tooltip cursor={{fill: '#f1f5f9'}} />
                      <Bar dataKey="val" fill="#5c7ead" barSize={25} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
             <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center"><h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Khu vực C – BẢNG</h3></div>
             <table className="w-full text-[11px] text-left border-collapse">
               <thead>
                 <tr className="bg-slate-100 font-bold border-b border-slate-200 text-slate-700">
                   <th className="p-4 border-r">Tháng</th>
                   <th className="p-4 border-r">Team</th>
                   <th className="p-4 border-r">Cá nhân</th>
                   <th className="p-4 border-r">KPI</th>
                   <th className="p-4 border-r">Mục tiêu</th>
                   <th className="p-4 border-r">Hoàn thành</th>
                   <th className="p-4 border-r">Tỷ lệ %</th>
                   <th className="p-4">Tỷ lệ sau quy đổi</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                 {['T9', 'T10', 'T11', 'T12'].map((month) => (
                   <tr key={month} className="hover:bg-slate-50">
                     <td className="p-4 border-r font-black text-slate-800">{month}</td>
                     <td className="p-4 border-r">--</td><td className="p-4 border-r">--</td><td className="p-4 border-r">--</td><td className="p-4 border-r">--</td><td className="p-4 border-r">--</td><td className="p-4 border-r">--</td><td className="p-4 font-black text-[#50a050]">--</td>
                   </tr>
                 ))}
               </tbody>
             </table>
          </div>
        </div>
      )}

      {level === ViewLevel.INDIVIDUAL && (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="flex gap-4 items-end bg-white p-4 border rounded-xl shadow-sm">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Khu vực A – Chọn Team</label>
              <select className="border text-xs p-2 rounded bg-slate-50 focus:ring-1 focus:ring-green-500" value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
                {['MKT', 'Sale', 'CSKH', 'Vận đơn', 'HCNS', 'R&D'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Chọn Cá nhân</label>
              <select className="border text-xs p-2 rounded bg-slate-50 focus:ring-1 focus:ring-green-500"><option>Tất cả (All)</option>{INDIVIDUAL_RANKING.map(p => <option key={p.id}>{p.name}</option>)}</select>
            </div>
            <button className="bg-[#50a050] text-white text-xs px-8 py-2 rounded-md font-bold hover:bg-green-700 transition shadow-sm uppercase tracking-wider">Lọc KPI</button>
          </div>

          <div className="bg-white p-6 border rounded-xl shadow-sm">
            <h3 className="text-xs font-black text-[#a52a2a] uppercase tracking-widest mb-6 border-l-4 border-[#a52a2a] pl-3">Khu vực B – BIỂU ĐỒ XẾP HẠNG KPI</h3>
            <div className="h-80 overflow-y-auto custom-scrollbar pr-4">
              <ResponsiveContainer width="100%" height={individualRankingData.length * 60}>
                <BarChart data={individualRankingData} layout="vertical" margin={{ left: 60, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis dataKey="name" type="category" tick={{fontSize: 10, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{fill: '#f8fafc'}} />
                  <Bar dataKey="kpi" fill="#50a050" radius={[0, 4, 4, 0]} barSize={30}>
                    {individualRankingData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index < 3 ? '#50a050' : '#a2cd5a'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
             <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center"><h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">BẢNG KPI CÁ NHÂN</h3></div>
             <table className="w-full text-[11px] text-left border-collapse">
               <thead>
                 <tr className="bg-slate-100 font-bold border-b border-slate-200">
                   <th className="p-4 border-r">Tháng</th>
                   <th className="p-4 border-r">Team</th>
                   <th className="p-4 border-r">Cá nhân</th>
                   <th className="p-4 border-r">KPI Tổng quát</th>
                   <th className="p-4 border-r">Mục tiêu</th>
                   <th className="p-4 border-r">Hoàn thành</th>
                   <th className="p-4 border-r">Tỷ lệ %</th>
                   <th className="p-4">Tỷ lệ sau quy đổi</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                 {['T9', 'T10', 'T11', 'T12'].map((month) => (
                   <tr key={month} className="hover:bg-slate-50 transition-colors">
                     <td className="p-4 border-r font-black text-slate-800">{month}</td>
                     <td className="p-4 border-r">{selectedTeam}</td>
                     <td className="p-4 border-r">Cá nhân A</td>
                     <td className="p-4 border-r">--</td><td className="p-4 border-r">--</td><td className="p-4 border-r">--</td><td className="p-4 border-r">--</td>
                     <td className="p-4 font-black text-[#50a050]">--</td>
                   </tr>
                 ))}
               </tbody>
             </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default KPIDashboard;
