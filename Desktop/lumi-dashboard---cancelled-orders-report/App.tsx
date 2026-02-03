
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Stats } from './types';

const App: React.FC = () => {
  const [allData, setAllData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Mặc định lọc 1 tuần trước
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  });

  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [selectedStaffs, setSelectedStaffs] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch('https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3.json');
        const jsonData = await response.json();
        const rawData = jsonData ? Object.values(jsonData) : [];

        const uniqueDataMap = new Map();

        rawData.forEach((d: any) => {
          if (!d) return;
          const maDon = d["Mã_đơn_hàng"] || d["Mã_đơn"];
          if (!maDon) return;

          if (!uniqueDataMap.has(maDon)) {
            const rawRevenue = d["Tổng_tiền_VNĐ"] || 0;
            const processedRevenue = typeof rawRevenue === 'string' 
              ? parseFloat(rawRevenue.replace(/[^0-9.-]+/g, "")) || 0 
              : (Number(rawRevenue) || 0);

            uniqueDataMap.set(maDon, {
              ...d,
              "Mã Đơn": maDon,
              "Doanh số": processedRevenue,
              "Ngày": d["Ngày_lên_đơn"] || d["Ngày"] || d["Ngày_tháng"] || "",
              "Trạng thái": d["Kết_quả_Check"] || d["Trạng_thái"] || "N/A",
              "Lý do hủy": d["Lý_do"] || d["Lý_do_huỷ"] || "",
              "Sản phẩm": d["Mặt_hàng"] || d["Sản_phẩm"] || "N/A",
              "Khu vực": d["Khu_vực"] || "N/A",
              "Nhân viên": d["NV_Vận_đơn"] || d["Nhân_viên"] || "N/A",
              "Thị trường": d["Thị_trường"] || "N/A",
              "Team": d["Team"] || "N/A"
            });
          }
        });

        setAllData(Array.from(uniqueDataMap.values()));
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const options = useMemo(() => ({
    products: Array.from(new Set(allData.map(d => d["Sản phẩm"]).filter(Boolean))).sort(),
    // Lấy thị trường từ Khu vực theo yêu cầu
    markets: Array.from(new Set(allData.map(d => d["Khu vực"]).filter(Boolean))).sort(),
    staffs: Array.from(new Set(allData.map(d => d["Nhân viên"]).filter(Boolean))).sort(),
    teams: Array.from(new Set(allData.map(d => d["Team"]).filter(Boolean))).sort(),
  }), [allData]);

  const filteredData = useMemo(() => {
    return allData.filter(order => {
      const matchProduct = selectedProducts.length === 0 || selectedProducts.includes(order["Sản phẩm"]);
      const matchMarket = selectedMarkets.length === 0 || selectedMarkets.includes(order["Khu vực"]);
      const matchStaff = selectedStaffs.length === 0 || selectedStaffs.includes(order["Nhân viên"]);
      const matchTeam = selectedTeams.length === 0 || selectedTeams.includes(order["Team"]);
      
      const orderDateStr = order["Ngày"] ? new Date(order["Ngày"]).toISOString().split('T')[0] : "";
      const matchStart = !dateRange.start || orderDateStr >= dateRange.start;
      const matchEnd = !dateRange.end || orderDateStr <= dateRange.end;

      return matchProduct && matchMarket && matchStaff && matchTeam && matchStart && matchEnd;
    });
  }, [allData, selectedProducts, selectedMarkets, selectedStaffs, selectedTeams, dateRange]);

  const cancelledOnlyData = useMemo(() => {
    return filteredData.filter(o => {
      const st = String(o["Trạng thái"]).toLowerCase();
      return st.includes('huỷ') || st.includes('hủy');
    });
  }, [filteredData]);

  const stats = useMemo<Stats>(() => {
    const totalOrders = filteredData.length;
    const totalRevenue = filteredData.reduce((acc, curr) => acc + curr["Doanh số"], 0);
    const cancelledCount = cancelledOnlyData.length;
    const cancelledRevenue = cancelledOnlyData.reduce((acc, curr) => acc + curr["Doanh số"], 0);
    return {
      totalOrders,
      totalRevenue,
      cancelledCount,
      cancelledRevenue,
      cancellationRate: totalOrders > 0 ? (cancelledCount / totalOrders) * 100 : 0
    };
  }, [filteredData, cancelledOnlyData]);

  const chartData = useMemo(() => {
    const getTop = (key: string) => {
      const counts: Record<string, number> = {};
      cancelledOnlyData.forEach(o => { counts[o[key]] = (counts[o[key]] || 0) + 1; });
      return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    };
    return {
      staff: getTop("Nhân viên"),
      product: getTop("Sản phẩm"),
      region: getTop("Khu vực")
    };
  }, [cancelledOnlyData]);

  const setQuickDate = (type: string) => {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    if (type === 'yesterday') { start.setDate(now.getDate() - 1); end.setDate(now.getDate() - 1); }
    else if (type === 'thisweek') { start.setDate(now.getDate() - now.getDay()); }
    else if (type === 'lastweek') { start.setDate(now.getDate() - now.getDay() - 7); end.setDate(now.getDate() - now.getDay() - 1); }
    else if (type === 'thismonth') { start.setDate(1); }
    setDateRange({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] });
  };

  const toggleFilter = (list: string[], setList: (l: string[]) => void, item: string) => {
    if (list.includes(item)) setList(list.filter(i => i !== item));
    else setList([...list, item]);
  };

  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = cancelledOnlyData.slice(indexOfFirstRow, indexOfLastRow);

  if (loading) return <div className="flex h-screen items-center justify-center bg-white text-xs font-bold uppercase tracking-widest text-emerald-600 italic">Lumi is analyzing data...</div>;

  return (
    <div className="min-h-screen bg-[#f0f9f4] p-2 md:p-4 text-[11px] font-medium text-slate-700">
      <div className="mx-auto max-w-[1600px]">
        {/* Header & Quick Dates */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-emerald-100 shadow-sm">
          <div>
            <h1 className="text-lg font-black uppercase tracking-tight text-emerald-900">Lumi <span className="text-emerald-500 text-sm">Cancel-Report</span></h1>
            <p className="text-[9px] text-emerald-400 font-bold uppercase mt-0.5 tracking-wider">Smart Analysis Dashboard</p>
          </div>
          
          <div className="flex flex-wrap gap-1.5">
            {['today', 'yesterday', 'thisweek', 'lastweek', 'thismonth'].map(t => (
              <button key={t} onClick={() => setQuickDate(t)} className="rounded-md bg-emerald-50 px-2 py-1 text-[9px] font-bold uppercase border border-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-all">
                {t === 'today' ? 'Hôm nay' : t === 'yesterday' ? 'Hôm qua' : t === 'thisweek' ? 'Tuần này' : t === 'lastweek' ? 'Tuần trước' : 'Tháng này'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
             <input type="date" value={dateRange.start} onChange={e => setDateRange(r => ({...r, start: e.target.value}))} className="bg-emerald-50 border border-emerald-100 rounded px-2 py-1 text-[10px] font-bold outline-none focus:ring-1 focus:ring-emerald-500 text-emerald-900"/>
             <span className="text-emerald-200">→</span>
             <input type="date" value={dateRange.end} onChange={e => setDateRange(r => ({...r, end: e.target.value}))} className="bg-emerald-50 border border-emerald-100 rounded px-2 py-1 text-[10px] font-bold outline-none focus:ring-1 focus:ring-emerald-500 text-emerald-900"/>
          </div>
        </div>

        {/* Stats Row */}
        <div className="mb-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          <SmallStatCard label="Tổng Đơn" value={stats.totalOrders} color="border-teal-500 text-teal-700" />
          <SmallStatCard label="Doanh Số" value={stats.totalRevenue.toLocaleString()} color="border-emerald-600 text-emerald-700" />
          <SmallStatCard label="Đơn Huỷ" value={stats.cancelledCount} color="border-rose-500 text-rose-700" />
          <SmallStatCard label="DS Huỷ" value={stats.cancelledRevenue.toLocaleString()} color="border-rose-400 text-rose-600" />
          <SmallStatCard label="Tỉ lệ huỷ" value={`${stats.cancellationRate.toFixed(1)}%`} color="border-amber-500 text-amber-700" />
        </div>

        {/* Searchable Dropdown Filters */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-3 z-50">
           <SearchableDropdown title="Sản Phẩm" items={options.products} selected={selectedProducts} onToggle={(i) => toggleFilter(selectedProducts, setSelectedProducts, i)} onClear={() => setSelectedProducts([])} />
           <SearchableDropdown title="Thị Trường (Khu vực)" items={options.markets} selected={selectedMarkets} onToggle={(i) => toggleFilter(selectedMarkets, setSelectedMarkets, i)} onClear={() => setSelectedMarkets([])} />
           <SearchableDropdown title="Nhân Viên" items={options.staffs} selected={selectedStaffs} onToggle={(i) => toggleFilter(selectedStaffs, setSelectedStaffs, i)} onClear={() => setSelectedStaffs([])} />
           <SearchableDropdown title="Team" items={options.teams} selected={selectedTeams} onToggle={(i) => toggleFilter(selectedTeams, setSelectedTeams, i)} onClear={() => setSelectedTeams([])} />
        </div>

        {/* Charts Row */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <ChartCard title="Top Huỷ / Nhân viên" data={chartData.staff} color="#10b981" />
          <ChartCard title="Top Huỷ / Sản phẩm" data={chartData.product} color="#059669" />
          <ChartCard title="Top Huỷ / Khu vực" data={chartData.region} color="#34d399" />
        </div>

        {/* Table Section */}
        <div className="rounded-xl bg-white shadow-sm border border-emerald-100 overflow-hidden">
          <div className="bg-emerald-50/50 px-4 py-2 border-b border-emerald-100 flex justify-between items-center">
            <h3 className="font-black uppercase text-emerald-900 tracking-wider">Báo cáo chi tiết đơn huỷ</h3>
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-bold text-emerald-400 uppercase">Hiển thị:</span>
              <select value={rowsPerPage} onChange={(e) => setRowsPerPage(Number(e.target.value))} className="bg-white border border-emerald-100 rounded text-[10px] py-0.5 px-1 outline-none text-emerald-800 font-bold">
                <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-emerald-50/20 text-[9px] font-black uppercase text-emerald-600 border-b border-emerald-50">
                  <th className="px-4 py-3">Mã</th>
                  <th className="px-4 py-3">Ngày Lên Đơn</th>
                  <th className="px-4 py-3">Sản phẩm</th>
                  <th className="px-4 py-3">Nhân viên</th>
                  <th className="px-4 py-3">Khu vực</th>
                  <th className="px-4 py-3 bg-rose-50 text-rose-500">Lý do huỷ</th>
                  <th className="px-4 py-3 text-right">Doanh số</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50">
                {currentRows.map((o, idx) => (
                  <tr key={idx} className="hover:bg-emerald-50/30 transition-colors">
                    <td className="px-4 py-2.5 font-bold text-slate-900">#{o["Mã Đơn"]}</td>
                    <td className="px-4 py-2.5 text-slate-400">{o["Ngày"]}</td>
                    <td className="px-4 py-2.5 font-bold text-emerald-800">{o["Sản phẩm"]}</td>
                    <td className="px-4 py-2.5 text-teal-600 font-bold">{o["Nhân viên"]}</td>
                    <td className="px-4 py-2.5 text-[10px] text-slate-400 italic">{o["Khu vực"]}</td>
                    <td className="px-4 py-2.5 text-rose-500 font-bold bg-rose-50/30">{o["Lý do hủy"] || "---"}</td>
                    <td className="px-4 py-2.5 text-right font-black">{(o["Doanh số"] || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cancelledOnlyData.length === 0 && (
            <div className="py-20 text-center text-emerald-300 font-black uppercase italic tracking-widest">Không có dữ liệu phù hợp</div>
          )}
        </div>
      </div>
    </div>
  );
};

const SmallStatCard = ({ label, value, color }: any) => (
  <div className={`bg-white rounded-xl p-3 border-l-4 shadow-sm ${color} transition-all`}>
    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    <p className="text-base font-black mt-0.5">{value}</p>
  </div>
);

const SearchableDropdown = ({ title, items, selected, onToggle, onClear }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredItems = items.filter((i: string) => 
    i.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white border border-emerald-100 rounded-xl px-3 py-2 text-left flex justify-between items-center shadow-sm hover:border-emerald-500 transition-colors"
      >
        <span className="truncate pr-2">
          <span className="font-black uppercase text-[8px] text-emerald-700 mr-2">{title}:</span>
          <span className="text-[10px] text-slate-600">
            {selected.length === 0 ? 'Tất cả' : `${selected.length} đã chọn`}
          </span>
        </span>
        <span className={`text-[10px] transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 w-full mt-1 bg-white border border-emerald-100 rounded-xl shadow-xl z-[100] p-2 flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex gap-1 items-center bg-emerald-50 rounded-lg px-2 py-1">
            <span className="text-emerald-400">🔍</span>
            <input 
              type="text" 
              placeholder="Tìm kiếm..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent border-none outline-none text-[10px] w-full font-bold text-emerald-900 placeholder-emerald-300"
              autoFocus
            />
          </div>
          
          <div className="flex justify-between px-1">
            <button onClick={onClear} className="text-[8px] font-black uppercase text-rose-500 hover:underline">Xóa hết</button>
            <span className="text-[8px] font-bold text-slate-400">{filteredItems.length} kết quả</span>
          </div>

          <div className="max-h-[200px] overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
            {filteredItems.map((item: string) => (
              <label key={item} className={`flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer transition-colors ${selected.includes(item) ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                <input 
                  type="checkbox" 
                  checked={selected.includes(item)} 
                  onChange={() => onToggle(item)} 
                  className="w-3 h-3 rounded border-emerald-200 text-emerald-600 focus:ring-0"
                />
                <span className={`text-[10px] truncate ${selected.includes(item) ? 'font-black text-emerald-700' : 'text-slate-600'}`}>{item}</span>
              </label>
            ))}
            {filteredItems.length === 0 && <span className="text-center py-4 text-slate-300 italic">Không tìm thấy</span>}
          </div>
        </div>
      )}
    </div>
  );
};

const ChartCard = ({ title, data, color }: any) => (
  <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-sm h-[220px]">
    <h4 className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-2">{title}</h4>
    <ResponsiveContainer width="100%" height="90%">
      <BarChart data={data} layout="vertical" margin={{ left: -20, right: 10 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#ecfdf5" />
        <XAxis type="number" hide />
        <YAxis dataKey="name" type="category" fontSize={8} tick={{fill: '#065f46'}} axisLine={false} tickLine={false} width={80} />
        <Tooltip cursor={{fill: '#f0fdf4'}} contentStyle={{fontSize: '9px', fontWeight: 'bold', borderRadius: '6px', border: '1px solid #10b981'}} />
        <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} barSize={10} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export default App;
