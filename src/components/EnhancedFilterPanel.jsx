import React from 'react';
import { Search } from 'lucide-react';

function EnhancedFilterPanel({
  // Search
  searchText,
  onSearchChange,
  searchPlaceholder = "Tìm kiếm...",
  
  // Quick filter
  quickFilter,
  onQuickFilterChange,
  
  // Date range with checkbox
  enableDateFilter,
  onEnableDateFilterChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  
  // Other filters (custom render)
  children,
  
  // Actions
  onClearFilters,
  hasActiveFilters = false
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div className="flex flex-wrap items-end gap-4">
        {/* Search */}
        {onSearchChange && (
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tìm kiếm</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
                value={searchText || ''}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Quick Filter */}
        {onQuickFilterChange && (
          <div className="min-w-[180px]">
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Lọc nhanh</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] bg-white"
              value={quickFilter || ''}
              onChange={(e) => onQuickFilterChange(e.target.value)}
            >
              <option value="">-- Chọn --</option>
              <option value="today">Hôm nay</option>
              <option value="yesterday">Hôm qua</option>
              <option value="this-week">Tuần này</option>
              <option value="last-week">Tuần trước</option>
              <option value="this-month">Tháng này</option>
              <option value="last-month">Tháng trước</option>
              <option value="this-year">Năm nay</option>
            </select>
          </div>
        )}

        {/* Date Range Filter with Checkbox */}
        {onEnableDateFilterChange && (
          <div className="min-w-[200px]">
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block flex items-center gap-2">
              <input
                type="checkbox"
                checked={enableDateFilter || false}
                onChange={(e) => onEnableDateFilterChange(e.target.checked)}
                className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
              />
              <span>Thời gian (Từ - Đến)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                disabled={!enableDateFilter}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] disabled:bg-gray-100 disabled:cursor-not-allowed"
                value={dateFrom || ''}
                onChange={(e) => onDateFromChange(e.target.value)}
              />
              <input
                type="date"
                disabled={!enableDateFilter}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021] disabled:bg-gray-100 disabled:cursor-not-allowed"
                value={dateTo || ''}
                onChange={(e) => onDateToChange(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Custom filters */}
        {children}

        {/* Clear Filters Button */}
        {hasActiveFilters && onClearFilters && (
          <button
            onClick={onClearFilters}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            Xóa lọc
          </button>
        )}
      </div>
    </div>
  );
}

export default EnhancedFilterPanel;








