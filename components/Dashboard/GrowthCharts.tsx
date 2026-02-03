
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ReferenceLine, Legend } from 'recharts';
import { MOCK_CHART_DATA } from '../../services/mockData';

const GrowthCharts: React.FC = () => {
  return (
    <div className="space-y-6 mt-6">
      {/* B1. Line Chart Revenue */}
      <div className="bg-white p-5 border rounded-xl shadow-sm">
        <h3 className="text-xs font-bold text-slate-700 uppercase mb-6 border-l-4 border-[#50a050] pl-3">BIỂU ĐỒ DOANH THU (4 THÁNG GẦN NHẤT)</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={MOCK_CHART_DATA} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{fontSize: 11, fontWeight: 500}} axisLine={false} tickLine={false} />
              <YAxis tick={{fontSize: 11}} axisLine={false} tickLine={false} label={{ value: 'Tỷ VNĐ', angle: -90, position: 'insideLeft', fontSize: 10 }} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
              <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '11px', paddingBottom: '20px' }} />
              <Line type="monotone" dataKey="totalDT" name="Tổng doanh thu" stroke="#50a050" strokeWidth={3} dot={{ r: 5, fill: '#50a050', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 7 }} />
              <Line type="monotone" dataKey="lumoraDT" name="Doanh thu Lumora" stroke="#1e293b" strokeWidth={3} strokeDasharray="8 5" dot={{ r: 5, fill: '#1e293b', strokeWidth: 2, stroke: '#fff' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* B2. Ads/DT Chart */}
        <div className="bg-white p-5 border rounded-xl shadow-sm">
          <h3 className="text-xs font-bold text-slate-700 uppercase mb-6 border-l-4 border-emerald-400 pl-3">TỶ LỆ ADS / DOANH THU</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_CHART_DATA}>
                <defs>
                  <linearGradient id="colorAds" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{fontSize: 10}} axisLine={false} />
                <YAxis tick={{fontSize: 10}} unit="%" axisLine={false} />
                <Tooltip />
                <ReferenceLine y={32} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" label={{ position: 'right', value: 'Ngưỡng 32%', fill: '#ef4444', fontSize: 10, fontWeight: 'bold' }} />
                <Area type="monotone" dataKey="adsRatio" name="Tỷ lệ Ads" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorAds)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* B3. LN/DT Chart */}
        <div className="bg-white p-5 border rounded-xl shadow-sm">
          <h3 className="text-xs font-bold text-slate-700 uppercase mb-6 border-l-4 border-green-500 pl-3">TỶ LỆ LN / DOANH THU (ƯỚC TÍNH)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_CHART_DATA}>
                <defs>
                  <linearGradient id="colorLn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2e7d32" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2e7d32" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{fontSize: 10}} axisLine={false} />
                <YAxis tick={{fontSize: 10}} unit="%" axisLine={false} />
                <Tooltip />
                <ReferenceLine y={12} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" label={{ position: 'right', value: 'Ngưỡng 12%', fill: '#ef4444', fontSize: 10, fontWeight: 'bold' }} />
                <Area type="monotone" dataKey="lnRatio" name="Tỷ lệ LN" stroke="#2e7d32" strokeWidth={2} fillOpacity={1} fill="url(#colorLn)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GrowthCharts;
