import { useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  formatFfmOrderHistoryAuditColumnName,
  formatFfmOrderHistoryAuditValueForUi,
  formatFfmOrderHistoryDateTime,
  getFfmOrderHistoryYmdFromTs,
} from '../utils/ffmOrderHistoryUi';
import { ORDER_LOG_TAC_NHAN_HE_THONG, ORDER_LOG_TAC_NHAN_NGUOI_DUNG } from '../utils/orderLogJsonb';

/**
 * Modal lịch sử ffm_log tổng hợp nhiều đơn — lọc client-side (ngày, NV, mã đơn, cột, tác nhân).
 */
export default function FfmAggregateHistoryModal({
  isOpen,
  onClose,
  rows,
  loading,
  dateFrom,
  dateTo,
  onDateFrom,
  onDateTo,
  staffFilter,
  onStaffFilter,
  orderFilter,
  onOrderFilter,
  columnFilter,
  onColumnFilter,
  tacNhanFilter,
  onTacNhanFilter,
  onResetToDefaults,
  addToast,
  subtitle = 'Theo các đơn đã tải trên lưới — cột ffm_log (jsonb).',
}) {
  const filteredRows = useMemo(() => {
    if (!rows?.length) return [];
    const staffQ = String(staffFilter || '').trim().toLowerCase();
    const orderQ = String(orderFilter || '').trim().toLowerCase();
    const colQ = String(columnFilter || '').trim().toLowerCase();

    return rows.filter((row) => {
      const ymd = getFfmOrderHistoryYmdFromTs(row?.changed_at);
      if (dateFrom && (!ymd || ymd < dateFrom)) return false;
      if (dateTo && (!ymd || ymd > dateTo)) return false;

      if (staffQ) {
        const by = String(row?.changed_by || '').toLowerCase();
        if (!by.includes(staffQ)) return false;
      }
      if (orderQ) {
        const oid = String(row?.orderId || '').toLowerCase();
        if (!oid.includes(orderQ)) return false;
      }
      if (tacNhanFilter === 'nguoi_dung' && row.tac_nhan !== ORDER_LOG_TAC_NHAN_NGUOI_DUNG) return false;
      if (tacNhanFilter === 'he_thong' && row.tac_nhan !== ORDER_LOG_TAC_NHAN_HE_THONG) return false;

      if (colQ) {
        const fields = row?.changed_fields && typeof row.changed_fields === 'object' ? row.changed_fields : {};
        const keys = Object.keys(fields);
        if (keys.length === 0) return false;
        const ok = keys.some((k) => {
          const disp = formatFfmOrderHistoryAuditColumnName(k).toLowerCase();
          return k.toLowerCase().includes(colQ) || disp.includes(colQ);
        });
        if (!ok) return false;
      }
      return true;
    });
  }, [rows, dateFrom, dateTo, staffFilter, orderFilter, columnFilter, tacNhanFilter]);

  if (!isOpen) return null;

  const handleExport = () => {
    const exportRows = [];
    filteredRows.forEach((row) => {
      const oid = String(row?.orderId || '');
      const fields = row?.changed_fields && typeof row.changed_fields === 'object' ? row.changed_fields : {};
      const entries = Object.entries(fields);
      if (entries.length === 0) {
        exportRows.push({
          'Mã đơn hàng': oid,
          'Thời gian thao tác': formatFfmOrderHistoryDateTime(row?.changed_at),
          'Người thao tác': String(row?.changed_by || 'hệ thống'),
          'Tác nhân': row?.tac_nhan_label || 'Người dùng',
          'Cột thay đổi': '',
          'Giá trị cũ': '',
          'Giá trị mới': '',
        });
        return;
      }
      entries.forEach(([colName, diff]) => {
        exportRows.push({
          'Mã đơn hàng': oid,
          'Thời gian thao tác': formatFfmOrderHistoryDateTime(row?.changed_at),
          'Người thao tác': String(row?.changed_by || 'hệ thống'),
          'Tác nhân': row?.tac_nhan_label || 'Người dùng',
          'Cột thay đổi': formatFfmOrderHistoryAuditColumnName(colName),
          'Giá trị cũ': formatFfmOrderHistoryAuditValueForUi(diff?.old),
          'Giá trị mới': formatFfmOrderHistoryAuditValueForUi(diff?.new),
        });
      });
    });
    if (exportRows.length === 0) {
      addToast('Không có dữ liệu theo bộ lọc để xuất Excel.', 'error');
      return;
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Lich_su_tong_hop');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    XLSX.writeFile(wb, `LichSuFFM_TongHop_${stamp}.xlsx`);
    addToast(`Đã xuất ${exportRows.length} dòng.`, 'success');
  };

  return (
    <div className="fixed inset-0 z-[22000] flex items-center justify-center pointer-events-auto">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 px-6 py-5 max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h3 className="text-lg font-bold text-slate-900">Lịch sử thay đổi — tổng hợp</h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-900 font-bold text-xl" aria-label="Đóng">
            ×
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3 shrink-0">{subtitle}</p>

        <div className="flex flex-wrap items-end gap-3 mb-3 shrink-0">
          <div>
            <label className="block text-[11px] text-gray-600 mb-1">Từ ngày thao tác</label>
            <input type="date" value={dateFrom} onChange={(e) => onDateFrom(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 mb-1">Đến ngày thao tác</label>
            <input type="date" value={dateTo} onChange={(e) => onDateTo(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 mb-1">Người thao tác (chứa)</label>
            <input
              type="text"
              value={staffFilter}
              onChange={(e) => onStaffFilter(e.target.value)}
              placeholder="Tên / username…"
              className="border rounded px-2 py-1 text-sm w-44"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 mb-1">Mã đơn (chứa)</label>
            <input
              type="text"
              value={orderFilter}
              onChange={(e) => onOrderFilter(e.target.value)}
              placeholder="Mã đơn…"
              className="border rounded px-2 py-1 text-sm w-36"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 mb-1">Cột thay đổi (chứa)</label>
            <input
              type="text"
              value={columnFilter}
              onChange={(e) => onColumnFilter(e.target.value)}
              placeholder="VD: tracking, giao hàng…"
              className="border rounded px-2 py-1 text-sm w-40"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 mb-1">Tác nhân</label>
            <select
              value={tacNhanFilter}
              onChange={(e) => onTacNhanFilter(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="all">Tất cả</option>
              <option value="nguoi_dung">Người dùng</option>
              <option value="he_thong">Hệ thống</option>
            </select>
          </div>
          {onResetToDefaults && (
            <button
              type="button"
              onClick={onResetToDefaults}
              className="px-3 py-1.5 text-xs rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            >
              Mặc định: hôm nay + NV đăng nhập
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-2 text-xs text-gray-600 shrink-0">
          {loading ? (
            <span className="text-indigo-600 font-medium">Đang tải ffm_log…</span>
          ) : (
            <>
              <span>
                Hiển thị <strong>{filteredRows.length}</strong> / <strong>{rows?.length || 0}</strong> lần thao tác
              </span>
              <button
                type="button"
                onClick={handleExport}
                className="px-3 py-1.5 text-xs rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                Xuất Excel (theo lọc)
              </button>
            </>
          )}
        </div>

        <div className="border rounded-xl overflow-auto flex-1 min-h-[200px] max-h-[60vh]">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-slate-50 border-b z-10">
              <tr>
                <th className="text-left px-3 py-2 w-32">Mã đơn</th>
                <th className="text-left px-3 py-2 w-44">Thời gian</th>
                <th className="text-left px-3 py-2 w-36">Người sửa</th>
                <th className="text-left px-3 py-2 w-32">Tác nhân</th>
                <th className="text-left px-3 py-2 w-40">Cột</th>
                <th className="text-left px-3 py-2">Giá trị cũ</th>
                <th className="text-left px-3 py-2">Giá trị mới</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-8 text-center text-gray-500" colSpan={7}>
                    Đang tải…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-gray-500" colSpan={7}>
                    Không có lịch sử khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const oid = String(row?.orderId || '');
                  const fields = row?.changed_fields && typeof row.changed_fields === 'object' ? row.changed_fields : {};
                  const entries = Object.entries(fields);
                  if (entries.length === 0) {
                    return (
                      <tr key={row.id} className="border-b last:border-b-0">
                        <td className="px-3 py-2 align-top font-medium">{oid}</td>
                        <td className="px-3 py-2 align-top">{formatFfmOrderHistoryDateTime(row.changed_at)}</td>
                        <td className="px-3 py-2 align-top">{String(row.changed_by || 'hệ thống')}</td>
                        <td className="px-3 py-2 align-top font-medium text-slate-700">{row.tac_nhan_label || 'Người dùng'}</td>
                        <td className="px-3 py-2 align-top text-gray-400" colSpan={3}>
                          Không có chi tiết cột đổi
                        </td>
                      </tr>
                    );
                  }
                  return entries.map(([colName, diff], idx) => (
                    <tr key={`${row.id}-${colName}`} className="border-b last:border-b-0">
                      {idx === 0 ? (
                        <>
                          <td className="px-3 py-2 align-top font-medium" rowSpan={entries.length}>
                            {oid}
                          </td>
                          <td className="px-3 py-2 align-top" rowSpan={entries.length}>
                            {formatFfmOrderHistoryDateTime(row.changed_at)}
                          </td>
                          <td className="px-3 py-2 align-top" rowSpan={entries.length}>
                            {String(row.changed_by || 'hệ thống')}
                          </td>
                          <td className="px-3 py-2 align-top font-medium text-slate-700" rowSpan={entries.length}>
                            {row.tac_nhan_label || 'Người dùng'}
                          </td>
                        </>
                      ) : null}
                      <td className="px-3 py-2 align-top font-medium">{formatFfmOrderHistoryAuditColumnName(colName)}</td>
                      <td className="px-3 py-2 align-top text-rose-700 whitespace-pre-wrap break-words">
                        {formatFfmOrderHistoryAuditValueForUi(diff?.old)}
                      </td>
                      <td className="px-3 py-2 align-top text-emerald-700 whitespace-pre-wrap break-words">
                        {formatFfmOrderHistoryAuditValueForUi(diff?.new)}
                      </td>
                    </tr>
                  ));
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
