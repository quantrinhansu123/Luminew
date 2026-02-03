import React from 'react';

const SyncPopover = ({
    isOpen,
    onClose,
    pendingChanges,
    legacyChanges,
    onApply,
    onDiscard
}) => {
    if (!isOpen) return null;

    const renderChangeTable = (changes, title) => {
        if (changes.size === 0) {
            return (
                <div className="mb-4">
                    <h5 className="text-primary font-bold border-b-2 border-gray-100 pb-1 mb-2">{title}</h5>
                    <p className="text-gray-400 italic text-sm">Không có.</p>
                </div>
            );
        }

        const rows = [];
        changes.forEach((colChanges, orderId) => {
            colChanges.forEach((info, colName) => {
                rows.push(
                    <tr key={`${orderId}-${colName}`} className="border-b border-gray-200 text-sm">
                        <td className="p-2 border border-gray-200">{orderId}</td>
                        <td className="p-2 border border-gray-200">{colName}</td>
                        <td className="p-2 border border-gray-200">
                            <span className="line-through text-danger mr-2">{info.originalValue || '(trống)'}</span>
                            <span className="font-bold text-success">{info.newValue || '(trống)'}</span>
                        </td>
                    </tr>
                );
            });
        });

        return (
            <div className="mb-6">
                <h5 className="text-primary font-bold border-b-2 border-gray-100 pb-1 mb-2">{title}</h5>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="border border-gray-200 p-2 text-left">Mã Đơn Hàng</th>
                                <th className="border border-gray-200 p-2 text-left">Cột Thay Đổi</th>
                                <th className="border border-gray-200 p-2 text-left">Giá Trị</th>
                            </tr>
                        </thead>
                        <tbody>{rows}</tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[1050] flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b border-gray-200">
                    <h4 className="text-lg font-bold text-gray-800">Quản lý các thay đổi đang chờ</h4>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">&times;</button>
                </div>

                <div className="p-5 overflow-y-auto flex-1">
                    {renderChangeTable(legacyChanges, "Dữ liệu từ phiên trước (chưa được đồng bộ)")}
                    {renderChangeTable(pendingChanges, "Thay đổi trong phiên này")}
                </div>

                <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
                    <button
                        onClick={onDiscard}
                        className="px-4 py-2 bg-danger text-white rounded hover:bg-dangerHover transition"
                    >
                        Hủy bỏ tất cả
                    </button>
                    <button
                        onClick={onApply}
                        className="px-4 py-2 bg-success text-white rounded hover:bg-successHover transition"
                    >
                        Lưu tất cả
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SyncPopover;
