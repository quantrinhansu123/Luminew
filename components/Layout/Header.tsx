
import React from 'react';

const Header: React.FC = () => {
  return (
    <div className="w-full">
      {/* Top Green Bar */}
      <div className="bg-[#50a050] text-white px-6 py-2 flex justify-between items-center text-sm shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-full p-1.5 flex items-center justify-center">
             <img src="https://lh3.googleusercontent.com/pw/AP1GczPrvN4K-E_O3m9E_L_0Z_8z2lU3fS0kXnI=w128" alt="Lumi" className="w-6 h-6 object-contain" />
          </div>
          <span className="font-bold text-lg tracking-wide">Lumi Global</span>
        </div>
        
        <div className="flex items-center gap-6">
          <a href="#" className="text-white hover:text-gray-200 font-medium text-xs">Trang chủ</a>
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="text-gray-100/70">👤</span>
            <span>admin</span>
          </div>
          <button className="bg-[#d9534f] hover:bg-[#c9302c] px-4 py-1.5 rounded text-[11px] font-bold transition-colors">
            Đăng xuất
          </button>
        </div>
      </div>
      
      {/* Title and Action Buttons Row */}
      <div className="bg-white px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <button className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div>
            <h1 className="text-[#a52a2a] font-bold text-base uppercase tracking-tight">DASHBOARD TĂNG TRƯỞNG</h1>
            <p className="text-gray-400 text-[10px] font-medium">Dữ liệu từ Database</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button className="flex items-center gap-2 bg-[#4caeac] text-white px-4 py-2 rounded-md text-xs font-bold shadow-sm hover:opacity-90 transition">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
            Excel
          </button>
          <button className="flex items-center gap-2 bg-[#8a4af3] text-white px-4 py-2 rounded-md text-xs font-bold shadow-sm hover:opacity-90 transition">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0V3m0 18L7 16m5 5 5-5"/></svg>
            Đồng bộ F3
          </button>
          <button className="flex items-center gap-2 bg-[#f0ad4e] text-white px-4 py-2 rounded-md text-xs font-bold shadow-sm hover:opacity-90 transition">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
            Tải lại
          </button>
        </div>
      </div>

      {/* Filters Section matching the screenshot */}
      <div className="bg-[#fcfcfc] border-y border-gray-100 px-8 py-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-end">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-[#a52a2a] uppercase">Thời gian <span className="text-gray-400 font-normal">(Tuần/Tháng)</span></label>
            <div className="flex gap-2">
              <select className="border border-gray-200 p-2 rounded-md text-[11px] w-full bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-green-200">
                <option>Tuần</option>
                <option>Tháng</option>
              </select>
              <select className="border border-gray-200 p-2 rounded-md text-[11px] w-full bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-green-200">
                <option>Tuần này</option>
                <option>Tuần trước</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-[#a52a2a] uppercase">Chi nhánh</label>
            <select className="border border-gray-200 p-2 rounded-md text-[11px] w-full bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-green-200">
              <option>Tất cả</option>
              <option>Miền Bắc</option>
              <option>Miền Nam</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-[#a52a2a] uppercase">Khu vực</label>
            <select className="border border-gray-200 p-2 rounded-md text-[11px] w-full bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-green-200">
              <option>Tất cả</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-[#a52a2a] uppercase">Mặt hàng</label>
            <select className="border border-gray-200 p-2 rounded-md text-[11px] w-full bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-green-200">
              <option>Tất cả</option>
            </select>
          </div>
          <div className="pb-0.5">
            {/* Empty space or additional filter if needed */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;
