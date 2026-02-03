
import React, { useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ComposedChart, Line, Area, Legend } from 'recharts';
import { INDIVIDUAL_RANKING, INDIVIDUAL_DETAILS } from '../../services/mockData';

const IndividualView: React.FC = () => {
  const [selectedTeam, setSelectedTeam] = useState('Sale');
  const [selectedPersonId, setSelectedPersonId] = useState<number>(1);

  const selectedPersonData = INDIVIDUAL_DETAILS[selectedPersonId];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Area A - Dropdown */}
      <div className="flex gap-4 items-end bg-white p-4 border rounded-xl shadow-sm">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase">Chọn Bộ phận</label>
          <select
            className="border text-xs p-2 rounded bg-slate-50 focus:ring-1 focus:ring-green-500"
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
          >
            {['MKT', 'Sale', 'CSKH', 'Vận đơn', 'HCNS', 'R&D'].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase">Chọn Cá nhân</label>
          <select
            className="border text-xs p-2 rounded bg-slate-50 focus:ring-1 focus:ring-green-500 outline-none"
            value={selectedPersonId}
            onChange={(e) => setSelectedPersonId(Number(e.target.value))}
          >
            {INDIVIDUAL_RANKING.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <button className="bg-[#50a050] text-white text-xs px-6 py-2 rounded font-bold hover:bg-green-700 transition h-fit self-end">LỌC DỮ LIỆU</button>
      </div>

      {/* Area B - Ranking */}
      <div className="bg-white p-6 border rounded-xl shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏆</span>
            <h3 className="font-bold text-green-900 uppercase tracking-tight">BXH DOANH SỐ - TEAM {selectedTeam.toUpperCase()}</h3>
          </div>
        </div>

        <div className="space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
          {INDIVIDUAL_RANKING.map((person, index) => (
            <div key={person.id} className={`flex items-center gap-4 p-4 rounded-xl border transition-all hover:shadow-md ${index === 0 ? 'bg-green-50 border-green-200' : 'bg-white'}`}>
              <div className={`text-2xl font-black italic w-10 ${index === 0 ? 'text-green-600' : index === 1 ? 'text-gray-400' : 'text-slate-400'}`}>
                #{index + 1}
              </div>
              <img src={person.avatar} className="w-12 h-12 rounded-full border-2 border-white shadow-sm" alt="" />
              <div className="flex-1">
                <h4 className="font-bold text-gray-800">{person.name}</h4>
                <div className="flex gap-4 text-[10px] text-gray-500">
                  <span>Tỷ lệ chốt: <strong className="text-green-600">{person.rate}</strong></span>
                  <span>Số mess: <strong>{person.mess}</strong></span>
                  <span>Số đơn: <strong>{person.orders}</strong></span>
                </div>
              </div>
              <div className="w-48 bg-gray-200 rounded-full h-4 overflow-hidden relative">
                <div className="h-full bg-gradient-to-r from-green-400 to-green-700" style={{ width: `${90 - index * 10}%` }}></div>
                <span className="absolute inset-0 flex items-center justify-end px-2 text-[10px] font-bold text-white drop-shadow-sm">{person.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Area C - Tables */}

      {/* Area C - Individual Detail Charts */}
      {
        selectedPersonData && (
          <div className="space-y-6">
            <div className="bg-white p-6 border rounded-xl shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-6 border-l-4 border-[#50a050] pl-3 uppercase">HIỆU SUẤT CÁ NHÂN: {selectedPersonData.name} ({selectedPersonData.role})</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Chart 1: Revenue & ADS */}
                <div className="h-72 border rounded-xl p-4 bg-slate-50">
                  <p className="text-[10px] font-bold text-gray-500 mb-4 uppercase">Doanh thu & Tỷ lệ ADS</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={selectedPersonData.metrics}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10 }} orientation="left" />
                      <YAxis yAxisId="right" tick={{ fontSize: 10 }} orientation="right" unit="%" />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar yAxisId="left" dataKey="revenue" name="Doanh thu (Tr)" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={30} />
                      <Line yAxisId="right" type="monotone" dataKey="adsRatio" name="Tỷ lệ ADS %" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Chart 2: Mes Commit vs Actual */}
                <div className="h-72 border rounded-xl p-4 bg-slate-50">
                  <p className="text-[10px] font-bold text-gray-500 mb-4 uppercase">Cam kết vs Thực tế (Mes/Lead)</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedPersonData.metrics}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip cursor={{ fill: '#f8fafc' }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="mesCommit" name="Cam kết" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="mesActual" name="Thực tế" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Area D - Detail Tables */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Table 1: Revenue History */}
              <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">LỊCH SỬ DOANH THU & HIỆU QUẢ</h3>
                </div>
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                      <th className="p-3 border-r border-slate-200 font-bold">Tháng</th>
                      <th className="p-3 border-r border-slate-200 font-bold">Doanh thu</th>
                      <th className="p-3 border-r border-slate-200 font-bold">ADS %</th>
                      <th className="p-3 font-bold">Mes/Lead</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPersonData.metrics.map((m: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-3 border-r border-slate-100 font-bold text-slate-700">{m.month}</td>
                        <td className="p-3 border-r border-slate-100 font-bold text-amber-600">{m.revenue} Tr</td>
                        <td className="p-3 border-r border-slate-100 font-bold text-red-500">{m.adsRatio}%</td>
                        <td className="p-3 font-bold text-blue-600">{m.mesActual.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Table 2: KPI Metrics */}
              <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">CHỈ SỐ KPI KHÁC</h3>
                </div>
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                      <th className="p-3 border-r border-slate-200 font-bold">Chỉ số</th>
                      <th className="p-3 border-r border-slate-200 font-bold">Thực đạt</th>
                      <th className="p-3 border-r border-slate-200 font-bold">Mục tiêu</th>
                      <th className="p-3 font-bold">Đánh giá</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPersonData.kpis.map((k: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-3 border-r border-slate-100 font-bold text-slate-700">{k.name}</td>
                        <td className="p-3 border-r border-slate-100 font-bold">{k.value}</td>
                        <td className="p-3 border-r border-slate-100 text-slate-500">{k.target}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded text-[10px] font-bold ${k.status === 'success' ? 'bg-green-100 text-green-700' : k.status === 'warning' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                            {k.status === 'success' ? 'Đạt' : 'Cảnh báo'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default IndividualView;
