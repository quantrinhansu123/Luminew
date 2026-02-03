
import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Header from './components/Layout/Header';
import SummaryCard from './components/Dashboard/SummaryCard';
import GrowthCharts from './components/Dashboard/GrowthCharts';
import TeamView from './components/Dashboard/TeamView';
import IndividualView from './components/Dashboard/IndividualView';
import KPIDashboard from './components/Dashboard/KPIDashboard';
import { DashboardTab, ViewLevel } from './types';
import { MOCK_SUMMARY_CARDS, MOCK_KPI_SUMMARY } from './services/mockData';

// Tab Selection Component
const TabSelector: React.FC<{ currentTab: DashboardTab; onTabChange: (tab: DashboardTab) => void }> = ({ currentTab, onTabChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 right-4 z-50 bg-white border-2 border-slate-300 rounded-full p-3 shadow-lg hover:shadow-xl transition-all hover:scale-110"
        title="Chuyển tab"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>

      {/* Tab Selection Panel */}
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed top-16 right-4 z-50 bg-white border-2 border-slate-200 rounded-2xl shadow-2xl p-4 min-w-[280px] animate-in slide-in-from-top-2">
            <div className="space-y-3">
              <button 
                onClick={() => { onTabChange(DashboardTab.GROWTH); setIsOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${currentTab === DashboardTab.GROWTH ? 'bg-green-50 border-green-300 shadow-md ring-2 ring-green-100' : 'bg-white hover:bg-gray-50 border-gray-200'}`}
              >
                <div className={`p-3 rounded-xl text-white text-xl shadow-sm ${currentTab === DashboardTab.GROWTH ? 'bg-[#50a050]' : 'bg-slate-300'}`}>📈</div>
                <div className="text-left">
                  <h4 className={`font-bold text-sm ${currentTab === DashboardTab.GROWTH ? 'text-slate-800' : 'text-slate-400'}`}>Dashboard Tăng trưởng</h4>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${currentTab === DashboardTab.GROWTH ? 'text-green-600' : 'text-slate-400'}`}>Ưu tiên cao</p>
                </div>
              </button>
              
              <button 
                onClick={() => { onTabChange(DashboardTab.KPI); setIsOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${currentTab === DashboardTab.KPI ? 'bg-emerald-50 border-emerald-300 shadow-md ring-2 ring-emerald-100' : 'bg-white hover:bg-gray-50 border-gray-200'}`}
              >
                <div className={`p-3 rounded-xl text-white text-xl shadow-sm ${currentTab === DashboardTab.KPI ? 'bg-[#2e8b57]' : 'bg-slate-300'}`}>📊</div>
                <div className="text-left">
                  <h4 className={`font-bold text-sm ${currentTab === DashboardTab.KPI ? 'text-slate-800' : 'text-slate-400'}`}>Dashboard KPI</h4>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${currentTab === DashboardTab.KPI ? 'text-emerald-600' : 'text-slate-400'}`}>Theo mục tiêu</p>
                </div>
              </button>

              <button 
                onClick={() => { onTabChange(DashboardTab.OKR); setIsOpen(false); }}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${currentTab === DashboardTab.OKR ? 'bg-green-50 border-green-300 shadow-md ring-2 ring-green-100' : 'bg-white hover:bg-gray-50 border-gray-200'}`}
              >
                <div className={`p-3 rounded-xl text-white text-xl shadow-sm ${currentTab === DashboardTab.OKR ? 'bg-green-600' : 'bg-slate-300'}`}>🎯</div>
                <div className="text-left">
                  <h4 className={`font-bold text-sm ${currentTab === DashboardTab.OKR ? 'text-slate-800' : 'text-slate-400'}`}>Dashboard OKR</h4>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${currentTab === DashboardTab.OKR ? 'text-green-600' : 'text-slate-400'}`}>Chiến lược</p>
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

// Growth Dashboard Component
const GrowthDashboard: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewLevel>(ViewLevel.COMPANY);
  const navigate = useNavigate();
  const location = useLocation();

  const getCurrentTab = (): DashboardTab => {
    if (location.pathname.includes('/kpi')) return DashboardTab.KPI;
    if (location.pathname.includes('/okr')) return DashboardTab.OKR;
    return DashboardTab.GROWTH;
  };

  const handleTabChange = (tab: DashboardTab) => {
    if (tab === DashboardTab.GROWTH) navigate('/growth');
    else if (tab === DashboardTab.KPI) navigate('/kpi');
    else if (tab === DashboardTab.OKR) navigate('/okr');
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <TabSelector currentTab={getCurrentTab()} onTabChange={handleTabChange} />
      
      <div className="min-h-screen pb-20 bg-[#f8fafc]">
        <Header />
        
        <main className="max-w-[1400px] mx-auto px-6">
          {/* View Level Toggles */}
          <div className="flex items-center gap-2 mb-6 mt-2 border-b border-slate-200 overflow-x-auto whitespace-nowrap scrollbar-hide">
            <button 
              onClick={() => setActiveView(ViewLevel.COMPANY)}
              className={`px-8 py-3 text-[11px] font-black uppercase tracking-widest rounded-t-xl transition-all border-x border-t ${activeView === ViewLevel.COMPANY ? 'bg-white text-[#2e8b57] -mb-[1px] border-b-transparent shadow-[0_-2px_10px_rgba(0,0,0,0.05)]' : 'bg-slate-100 text-slate-400 border-transparent hover:bg-slate-200'}`}
            >
              CẤP CÔNG TY
            </button>
            <button 
              onClick={() => setActiveView(ViewLevel.TEAM)}
              className={`px-8 py-3 text-[11px] font-black uppercase tracking-widest rounded-t-xl transition-all border-x border-t ${activeView === ViewLevel.TEAM ? 'bg-white text-[#2e8b57] -mb-[1px] border-b-transparent shadow-[0_-2px_10px_rgba(0,0,0,0.05)]' : 'bg-slate-100 text-slate-400 border-transparent hover:bg-slate-200'}`}
            >
              CẤP BỘ PHẬN (TEAM)
            </button>
            <button 
              onClick={() => setActiveView(ViewLevel.INDIVIDUAL)}
              className={`px-8 py-3 text-[11px] font-black uppercase tracking-widest rounded-t-xl transition-all border-x border-t ${activeView === ViewLevel.INDIVIDUAL ? 'bg-white text-[#2e8b57] -mb-[1px] border-b-transparent shadow-[0_-2px_10px_rgba(0,0,0,0.05)]' : 'bg-slate-100 text-slate-400 border-transparent hover:bg-slate-200'}`}
            >
              CẤP CÁ NHÂN
            </button>
          </div>

          {/* Summary Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {MOCK_SUMMARY_CARDS.map((card, i) => (
              <SummaryCard key={i} data={card} />
            ))}
          </div>

          {/* Content Area */}
          <div className="space-y-10 animate-in fade-in duration-700">
            {activeView === ViewLevel.COMPANY && (
              <>
                <GrowthCharts />
                {/* Area C - Detailed Data Table */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mt-10">
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="text-xs font-black text-[#50a050] uppercase tracking-widest">BẢNG SỐ LIỆU TĂNG TRƯỞNG DOANH THU THEO THÁNG</h3>
                    <div className="flex gap-2">
                      <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase"><div className="w-2 h-2 rounded-full bg-red-500"></div> Cảnh báo</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                          <th className="p-4 border-r border-slate-200 font-black uppercase tracking-tighter">Kỳ (Tháng)</th>
                          <th className="p-4 border-r border-slate-200 font-black uppercase tracking-tighter">Tổng Doanh Thu</th>
                          <th className="p-4 border-r border-slate-200 font-black uppercase tracking-tighter">Xu hướng %</th>
                          <th className="p-4 border-r border-slate-200 font-black uppercase tracking-tighter">Doanh thu Lumora</th>
                          <th className="p-4 border-r border-slate-200 font-black uppercase tracking-tighter">Xu hướng %</th>
                          <th className="p-4 border-r border-slate-200 font-black uppercase tracking-tighter">Tỷ lệ Ads/DT</th>
                          <th className="p-4 border-r border-slate-200 font-black uppercase tracking-tighter">Xu hướng %</th>
                          <th className="p-4 font-black uppercase tracking-tighter">Tỷ lệ LN/DT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <tr className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 border-r border-slate-100 font-bold text-slate-700">Tháng 9</td>
                          <td className="p-4 border-r border-slate-100 font-black text-slate-800">150 tỷ</td>
                          <td className="p-4 border-r border-slate-100 text-slate-400 italic">--</td>
                          <td className="p-4 border-r border-slate-100">80 tỷ</td>
                          <td className="p-4 border-r border-slate-100 text-slate-400 italic">--</td>
                          <td className="p-4 border-r border-slate-100">28%</td>
                          <td className="p-4 border-r border-slate-100 text-slate-400 italic">--</td>
                          <td className="p-4 font-bold text-emerald-600">25%</td>
                        </tr>
                        <tr className="hover:bg-slate-50 transition-colors bg-red-50">
                          <td className="p-4 border-r border-slate-100 font-bold text-slate-700">Tháng 10</td>
                          <td className="p-4 border-r border-slate-100 font-black text-slate-800">135 tỷ</td>
                          <td className="p-4 border-r border-slate-100 font-black text-red-600">-10%</td>
                          <td className="p-4 border-r border-slate-100">72 tỷ</td>
                          <td className="p-4 border-r border-slate-100 font-black text-red-600">-10%</td>
                          <td className="p-4 border-r border-slate-100 font-black text-orange-600">31%</td>
                          <td className="p-4 border-r border-slate-100 font-black text-orange-600">+10%</td>
                          <td className="p-4 font-bold text-red-600">8%</td>
                        </tr>
                        <tr className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 border-r border-slate-100 font-bold text-slate-700">Tháng 11</td>
                          <td className="p-4 border-r border-slate-100 font-black text-slate-800">175 tỷ</td>
                          <td className="p-4 border-r border-slate-100 font-black text-emerald-600">+29%</td>
                          <td className="p-4 border-r border-slate-100">100 tỷ</td>
                          <td className="p-4 border-r border-slate-100 font-black text-emerald-600">+38%</td>
                          <td className="p-4 border-r border-slate-100">30%</td>
                          <td className="p-4 border-r border-slate-100 text-emerald-600 font-bold">-3%</td>
                          <td className="p-4 font-bold text-emerald-600">32%</td>
                        </tr>
                        <tr className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 border-r border-slate-100 font-bold text-slate-700">Tháng 12</td>
                          <td className="p-4 border-r border-slate-100 font-black text-slate-800">180 tỷ</td>
                          <td className="p-4 border-r border-slate-100 font-black text-emerald-600">+3%</td>
                          <td className="p-4 border-r border-slate-100">106 tỷ</td>
                          <td className="p-4 border-r border-slate-100 font-black text-emerald-600">+6%</td>
                          <td className="p-4 border-r border-slate-100 font-black text-red-600">33%</td>
                          <td className="p-4 border-r border-slate-100 font-black text-red-600">+10%</td>
                          <td className="p-4 font-bold text-emerald-600">30%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {activeView === ViewLevel.TEAM && <TeamView />}
            {activeView === ViewLevel.INDIVIDUAL && <IndividualView />}
          </div>
        </main>
      </div>
    </div>
  );
};

// KPI Dashboard Component
const KPIDashboardPage: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewLevel>(ViewLevel.COMPANY);
  const navigate = useNavigate();
  const location = useLocation();

  const getCurrentTab = (): DashboardTab => {
    if (location.pathname.includes('/kpi')) return DashboardTab.KPI;
    if (location.pathname.includes('/okr')) return DashboardTab.OKR;
    return DashboardTab.GROWTH;
  };

  const handleTabChange = (tab: DashboardTab) => {
    if (tab === DashboardTab.GROWTH) navigate('/growth');
    else if (tab === DashboardTab.KPI) navigate('/kpi');
    else if (tab === DashboardTab.OKR) navigate('/okr');
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <TabSelector currentTab={getCurrentTab()} onTabChange={handleTabChange} />
      
      <div className="min-h-screen pb-20 bg-[#f8fafc]">
        <main className="max-w-[1400px] mx-auto px-6 py-6">
          {/* View Level Toggles for KPI */}
          <div className="flex items-center gap-2 mb-6 border-b border-slate-200 overflow-x-auto whitespace-nowrap scrollbar-hide">
            <button 
              onClick={() => setActiveView(ViewLevel.COMPANY)}
              className={`px-8 py-3 text-[11px] font-black uppercase tracking-widest rounded-t-xl transition-all border-x border-t ${activeView === ViewLevel.COMPANY ? 'bg-white text-[#2e8b57] -mb-[1px] border-b-transparent shadow-[0_-2px_10px_rgba(0,0,0,0.05)]' : 'bg-slate-100 text-slate-400 border-transparent hover:bg-slate-200'}`}
            >
              CẤP CÔNG TY
            </button>
            <button 
              onClick={() => setActiveView(ViewLevel.TEAM)}
              className={`px-8 py-3 text-[11px] font-black uppercase tracking-widest rounded-t-xl transition-all border-x border-t ${activeView === ViewLevel.TEAM ? 'bg-white text-[#2e8b57] -mb-[1px] border-b-transparent shadow-[0_-2px_10px_rgba(0,0,0,0.05)]' : 'bg-slate-100 text-slate-400 border-transparent hover:bg-slate-200'}`}
            >
              CẤP BỘ PHẬN (TEAM)
            </button>
            <button 
              onClick={() => setActiveView(ViewLevel.INDIVIDUAL)}
              className={`px-8 py-3 text-[11px] font-black uppercase tracking-widest rounded-t-xl transition-all border-x border-t ${activeView === ViewLevel.INDIVIDUAL ? 'bg-white text-[#2e8b57] -mb-[1px] border-b-transparent shadow-[0_-2px_10px_rgba(0,0,0,0.05)]' : 'bg-slate-100 text-slate-400 border-transparent hover:bg-slate-200'}`}
            >
              CẤP CÁ NHÂN
            </button>
          </div>
          <KPIDashboard level={activeView} />
        </main>
      </div>
    </div>
  );
};

// OKR Dashboard Component
const OKRDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const getCurrentTab = (): DashboardTab => {
    if (location.pathname.includes('/kpi')) return DashboardTab.KPI;
    if (location.pathname.includes('/okr')) return DashboardTab.OKR;
    return DashboardTab.GROWTH;
  };

  const handleTabChange = (tab: DashboardTab) => {
    if (tab === DashboardTab.GROWTH) navigate('/growth');
    else if (tab === DashboardTab.KPI) navigate('/kpi');
    else if (tab === DashboardTab.OKR) navigate('/okr');
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <TabSelector currentTab={getCurrentTab()} onTabChange={handleTabChange} />
      
      <div className="min-h-screen pb-20 bg-[#f8fafc]">
        <main className="max-w-[1400px] mx-auto px-6 py-6">
          <div className="flex flex-col items-center justify-center py-24 text-slate-400 bg-white border border-slate-200 rounded-3xl border-dashed">
            <span className="text-6xl mb-6">🎯</span>
            <h2 className="text-2xl font-black text-[#50a050]">OKR DASHBOARD</h2>
            <p className="text-sm max-w-sm text-center mt-2 leading-relaxed">Phân hệ quản trị mục tiêu (Objectives and Key Results) đang được chuẩn bị dữ liệu chiến lược.</p>
          </div>
        </main>
      </div>
    </div>
  );
};

// Main App Component with Router
const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/growth" replace />} />
        <Route path="/growth" element={<GrowthDashboard />} />
        <Route path="/kpi" element={<KPIDashboardPage />} />
        <Route path="/okr" element={<OKRDashboardPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
