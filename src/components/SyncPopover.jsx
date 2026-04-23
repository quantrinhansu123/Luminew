import React from 'react';

const SyncPopover = ({
    isOpen,
    onClose,
    pendingChanges = new Map(),
    legacyChanges = new Map(),
    onApply,
    onDiscard,
    onDiscardRow,
    applyButtonLabel = 'Lưu tất cả',
    /** (colKey) => string — nhãn hiển thị thay cho khóa kỹ thuật */
    formatColumnLabel = (colKey) => String(colKey ?? ''),
}) => {
    if (!isOpen) return null;

    const renderChangeTable = (changes, title, isLegacy = false) => {
        if (changes.size === 0) {
            return (
                <div className="mb-6 opacity-60">
                    <h5 className={`font-bold border-b-2 border-gray-100 pb-1 mb-2 text-sm uppercase tracking-wider ${isLegacy ? 'text-amber-600' : 'text-blue-600'}`}>{title}</h5>
                    <p className="text-gray-400 italic text-sm py-2">Không có thay đổi nào.</p>
                </div>
            );
        }

        const rows = [];
        changes.forEach((colChanges, orderId) => {
            colChanges.forEach((info, colName) => {
                const colLabel = formatColumnLabel(colName);
                rows.push(
                    <tr key={`${orderId}-${colName}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors group">
                        <td className="p-3 font-medium text-slate-700">{orderId}</td>
                        <td className="p-3 text-slate-600">
                            <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-semibold" title={String(colName)}>
                                {colLabel}
                            </span>
                        </td>
                        <td className="p-3">
                            <div className="flex flex-col gap-1">
                                <span className="line-through text-rose-500 text-xs italic">{info.originalValue || '(trống)'}</span>
                                <span className="font-bold text-emerald-600">{info.newValue || '(trống)'}</span>
                            </div>
                        </td>
                        {!isLegacy && onDiscardRow && (
                            <td className="p-3 text-right">
                                <button 
                                    onClick={() => onDiscardRow(orderId, colName)}
                                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-70 group-hover:opacity-100 focus:opacity-100"
                                    title="Hủy bỏ thay đổi này"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </td>
                        )}
                    </tr>
                );
            });
        });

        return (
            <div className="mb-8 last:mb-0">
                <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2">
                    <div className={`w-1.5 h-4 rounded-full ${isLegacy ? 'bg-amber-500' : 'bg-blue-500'}`}></div>
                    <h5 className={`font-bold text-sm uppercase tracking-wider ${isLegacy ? 'text-amber-700' : 'text-blue-700'}`}>{title}</h5>
                    <span className="ml-auto text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                        {rows.length} mục
                    </span>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="overflow-x-auto max-h-[40vh]">
                        <table className="w-full border-collapse text-left text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th className="p-3 text-slate-500 font-semibold border-b border-slate-200">Mã Đơn Hàng</th>
                                    <th className="p-3 text-slate-500 font-semibold border-b border-slate-200">Cột Thay Đổi</th>
                                    <th className="p-3 text-slate-500 font-semibold border-b border-slate-200">Giá Trị</th>
                                    {!isLegacy && onDiscardRow && (
                                        <th className="p-3 text-slate-500 font-semibold border-b border-slate-200 text-right">Tác vụ</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">{rows}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[30000] flex justify-center items-center p-4">
            <div 
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" 
                onClick={onClose}
            ></div>
            
            <div className="relative bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-white/20">
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                            <span className="text-xl">🔄</span>
                        </div>
                        <div>
                            <h4 className="text-lg font-bold text-slate-800">Quản lý thay đổi</h4>
                            <p className="text-[11px] text-slate-500 font-medium">Xem và xác nhận các thay đổi trước khi lưu xuống máy chủ</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-all text-xl font-bold"
                    >
                        &times;
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                    {renderChangeTable(legacyChanges, "Dữ liệu từ phiên trước", true)}
                    {renderChangeTable(pendingChanges, "Thay đổi mới trong phiên này", false)}
                </div>

                <div className="p-4 px-6 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="text-[11px] text-slate-500 italic">
                        * Các thay đổi này chỉ được lưu vĩnh viễn khi bạn nhấn nút "{applyButtonLabel}"
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button
                            type="button"
                            onClick={onDiscard}
                            className="flex-1 sm:flex-none px-6 py-2.5 bg-white border border-rose-200 text-rose-600 rounded-xl hover:bg-rose-50 font-bold transition-all active:scale-[0.98] shadow-sm"
                        >
                            Bỏ thay đổi
                        </button>
                        <button
                            type="button"
                            onClick={onApply}
                            className="flex-1 sm:flex-none px-8 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98]"
                        >
                            {applyButtonLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SyncPopover;
