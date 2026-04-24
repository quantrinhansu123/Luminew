import React from 'react';
import { Download, Users } from 'lucide-react';
import * as XLSX from 'xlsx';

export function F3SummaryTab({ data, startDate, endDate }) {
  if (!data || (!data.mkt.length && !data.sales.length && !data.delivery.length)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl shadow-sm border border-gray-100">
        <Users className="w-16 h-16 text-gray-200 mb-4" />
        <p className="text-gray-500 font-medium">Không có dữ liệu thực tế cho khoảng thời gian này</p>
      </div>
    );
  }

  const formatCurrency = (val) => {
    if (val === null || val === undefined || val === '') return '0';
    const num = parseFloat(String(val).replace(/[^\d.-]/g, ''));
    if (isNaN(num)) return val;
    return new Intl.NumberFormat('vi-VN').format(num);
  };

  const exportToExcel = () => {
    // Chuyển đổi object sang AOAs cho excel
    const aoa = [
      ["PHÒNG MARKETING", "", "", "", "", "", "PHÒNG SALES", "", "", "", "", "", "BỘ PHẬN VẬN ĐƠN"],
      ["Nhân viên", "Tiền về", "Ship", "Tiền về sau ship", "DS đi", "Tỉ lệ", "Nhân viên", "Tiền về", "Ship", "Tiền về sau ship", "DS đi", "Tỉ lệ", "Nhân viên", "Tiền về", "Ship", "Tiền về sau ship", "DS đi", "Tỉ lệ"]
    ];

    const maxRows = Math.max(data.mkt.length, data.sales.length, data.delivery.length);
    for (let i = 0; i < maxRows; i++) {
      const row = [];
      [data.mkt, data.sales, data.delivery].forEach(list => {
        if (list[i]) {
          row.push(list[i].name, list[i].tienVe, list[i].ship, list[i].dsSauShip, list[i].dsDi, list[i].tile);
        } else {
          row.push("", 0, 0, 0, 0, "0%");
        }
      });
      aoa.push(row);
    }
    
    // Add Totals
    const totalRow = [];
    ['mkt', 'sales', 'delivery'].forEach(dept => {
      const t = data.totals[dept];
      const tile = t.dsDi > 0 ? ((t.tienVe / t.dsDi) * 100).toFixed(2) + '%' : '0%';
      totalRow.push("TỔNG CỘNG", t.tienVe, t.ship, t.tienVe - t.ship, t.dsDi, tile);
    });
    aoa.push(totalRow);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TongHopF3");
    XLSX.writeFile(wb, `F3_Summary_${startDate || 'all'}_to_${endDate || 'all'}.xlsx`);
  };

  const RenderTable = ({ title, list, total, colorClass, bgClass, textClass }) => (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden ring-1 ring-black/5 flex flex-col">
      <div className={`px-6 py-4 flex items-center justify-between ${bgClass}`}>
        <h3 className={`text-sm font-black uppercase tracking-widest ${textClass}`}>{title}</h3>
        <span className="text-[10px] font-bold text-gray-400 bg-white/50 px-2 py-1 rounded-md">
          {list.length} nhân sự
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50/50">
            <tr className="text-[10px] text-gray-400 uppercase font-black text-center">
              <th className="px-3 py-3 text-left">Nhân viên</th>
              <th className="px-3 py-3 text-right">Tiền về</th>
              <th className="px-3 py-3 text-right">Ship</th>
              <th className="px-3 py-3 text-right">Tiền về sau ship</th>
              <th className="px-3 py-3 text-right">DS Đi</th>
              <th className="px-3 py-3 text-right">Tỉ lệ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.map((s, idx) => (
              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2.5 text-xs font-bold text-gray-700">{s.name}</td>
                <td className="px-3 py-2.5 text-xs text-right text-gray-600 font-medium">{formatCurrency(s.tienVe)}</td>
                <td className="px-3 py-2.5 text-xs text-right text-gray-400">{formatCurrency(s.ship)}</td>
                <td className="px-3 py-2.5 text-xs text-right text-gray-600">{formatCurrency(s.dsSauShip)}</td>
                <td className="px-3 py-2.5 text-xs text-right text-gray-600">{formatCurrency(s.dsDi)}</td>
                <td className={`px-3 py-2.5 text-xs text-right font-bold ${colorClass}`}>{s.tile}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-900">
            <tr className="text-[10px] font-black text-white uppercase">
              <td className="px-3 py-3 bg-gray-800">TỔNG CỘNG</td>
              <td className="px-3 py-3 text-right text-orange-400">{formatCurrency(total.tienVe)}</td>
              <td className="px-3 py-3 text-right text-gray-400">{formatCurrency(total.ship)}</td>
              <td className="px-3 py-3 text-right text-white">{formatCurrency(total.tienVe - total.ship)}</td>
              <td className="px-3 py-3 text-right text-white">{formatCurrency(total.dsDi)}</td>
              <td className={`px-3 py-3 text-right ${textClass}`}>
                {total.dsDi > 0 ? ((total.tienVe / total.dsDi) * 100).toFixed(2) + '%' : '0%'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-gray-800 tracking-tight">Kết Quả Kinh Doanh F3</h2>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Dữ liệu thực tế: {startDate && endDate ? `${startDate} — ${endDate}` : 'Toàn thời gian'}
          </p>
        </div>
        <button
          onClick={exportToExcel}
          className="flex items-center gap-2 px-6 py-3 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold transition-all shadow-xl active:scale-95 group"
        >
          <Download className="w-5 h-5" />
          Xuất Full Báo Cáo
        </button>
      </div>

      <div className="flex flex-col gap-10">
        <RenderTable 
          title="Phòng Marketing" 
          list={data.mkt} 
          total={data.totals.mkt}
          colorClass="text-orange-600"
          bgClass="bg-orange-50/50"
          textClass="text-orange-600"
        />
        <RenderTable 
          title="Phòng Sales" 
          list={data.sales} 
          total={data.totals.sales}
          colorClass="text-blue-600"
          bgClass="bg-blue-50/50"
          textClass="text-blue-600"
        />
        <RenderTable 
          title="Bộ phận Vận Đơn" 
          list={data.delivery} 
          total={data.totals.delivery}
          colorClass="text-purple-600"
          bgClass="bg-purple-50/50"
          textClass="text-purple-600"
        />
      </div>

      <p className="text-[10px] text-gray-400 text-center font-medium italic mt-6">
        * Dữ liệu được tính toán dựa trên các đơn có Mã Đơn Hàng hợp lệ. DS Đi là tổng doanh số của các đơn đã có Mã Tracking (đơn đi hàng). Tiền về là số tiền thực nhận đã được Kế toán xác nhận. Phí ship chỉ cộng trên nhóm đơn đã có tiền về. Tiền về sau ship = Tiền về − Phí ship.
      </p>
    </div>
  );
}
