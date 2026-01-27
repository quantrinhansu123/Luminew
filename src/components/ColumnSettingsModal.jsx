import React from 'react';
import { X } from 'lucide-react';

function ColumnSettingsModal({ 
  isOpen, 
  onClose, 
  allColumns, 
  visibleColumns, 
  onToggleColumn, 
  onSelectAll, 
  onDeselectAll, 
  onResetDefault,
  defaultColumns = []
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">Cài đặt hiển thị cột</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Action Buttons */}
          <div className="flex gap-2 mb-4 pb-4 border-b border-gray-200">
            <button
              onClick={onSelectAll}
              className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm font-medium transition-colors"
            >
              Chọn tất cả
            </button>
            <button
              onClick={onDeselectAll}
              className="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white rounded text-sm font-medium transition-colors"
            >
              Bỏ chọn tất cả
            </button>
            {defaultColumns.length > 0 && (
              <button
                onClick={onResetDefault}
                className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-medium transition-colors"
              >
                Mặc định
              </button>
            )}
          </div>

          {/* Column List */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700 mb-3">
              Chọn các cột để hiển thị trong bảng ({Object.values(visibleColumns).filter(v => v === true).length} / {allColumns.length} đã chọn):
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {allColumns.map((column) => (
                <label
                  key={column}
                  className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer border border-transparent hover:border-gray-200"
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns[column] === true}
                    onChange={() => onToggleColumn(column)}
                    className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021] focus:ring-2"
                  />
                  <span className="text-sm text-gray-700 flex-1">{column}</span>
                  {defaultColumns.includes(column) && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Mặc định</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            Đóng
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded-lg text-sm font-medium transition-colors"
          >
            Áp dụng
          </button>
        </div>
      </div>
    </div>
  );
}

export default ColumnSettingsModal;








