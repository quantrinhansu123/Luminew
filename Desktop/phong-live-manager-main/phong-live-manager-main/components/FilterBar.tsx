import React, { useState } from 'react';

export interface FilterField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'checkbox';
  options?: { value: string; label: string }[];
}

export interface QuickDateFilter {
  label: string;
  getDateRange: () => { from: string; to: string };
}

interface FilterBarProps {
  onSearch: (searchText: string) => void;
  onExportExcel: () => void;
  onImportExcel: (file: File) => void;
  onReset: () => void;
  filterFields?: FilterField[];
  selectedFilters: Record<string, string[]>;
  onFilterChange: (field: string, values: string[]) => void;
  quickDateFilters?: QuickDateFilter[];
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
  onQuickDateSelect: (from: string, to: string) => void;
  inline?: boolean; // New prop for inline layout
}

export const FilterBar: React.FC<FilterBarProps> = ({
  onSearch,
  onExportExcel,
  onImportExcel,
  onReset,
  filterFields = [],
  selectedFilters,
  onFilterChange,
  quickDateFilters = [],
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onQuickDateSelect,
  inline = false,
}) => {
  const [searchText, setSearchText] = useState('');
  const [showFilters, setShowFilters] = useState(!inline); // Always show if inline
  const [storeSearchText, setStoreSearchText] = useState('');
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchText(value);
    onSearch(value);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportExcel(file);
    }
    // Reset input để có thể chọn lại file cùng tên
    e.target.value = '';
  };

  // Quick date filters
  const defaultQuickFilters: QuickDateFilter[] = [
    {
      label: 'Hôm nay (今天)',
      getDateRange: () => {
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        return { from: dateStr, to: dateStr };
      },
    },
    {
      label: 'Hôm qua (昨天)',
      getDateRange: () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];
        return { from: dateStr, to: dateStr };
      },
    },
    {
      label: 'Tuần này (本周)',
      getDateRange: () => {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const weekStart = new Date(today.setDate(diff));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        return {
          from: weekStart.toISOString().split('T')[0],
          to: weekEnd.toISOString().split('T')[0],
        };
      },
    },
    {
      label: 'Tuần trước (上周)',
      getDateRange: () => {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const weekStart = new Date(today.setDate(diff - 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        return {
          from: weekStart.toISOString().split('T')[0],
          to: weekEnd.toISOString().split('T')[0],
        };
      },
    },
    {
      label: 'Tháng này (本月)',
      getDateRange: () => {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return {
          from: firstDay.toISOString().split('T')[0],
          to: lastDay.toISOString().split('T')[0],
        };
      },
    },
    {
      label: 'Tháng trước (上月)',
      getDateRange: () => {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
        return {
          from: firstDay.toISOString().split('T')[0],
          to: lastDay.toISOString().split('T')[0],
        };
      },
    },
    {
      label: '30 ngày qua (过去30天)',
      getDateRange: () => {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return {
          from: thirtyDaysAgo.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0],
        };
      },
    },
  ];

  const allQuickFilters = [...defaultQuickFilters, ...quickDateFilters];

  const handleQuickDateClick = (filter: QuickDateFilter) => {
    const range = filter.getDateRange();
    onQuickDateSelect(range.from, range.to);
  };

  const handleCheckboxChange = (field: string, value: string, checked: boolean) => {
    const currentValues = selectedFilters[field] || [];
    if (checked) {
      onFilterChange(field, [...currentValues, value]);
    } else {
      onFilterChange(field, currentValues.filter(v => v !== value));
    }
  };

  // Filter stores by search text
  const filteredStoreOptions = filterFields.find(f => f.key === 'stores')?.options?.filter(opt =>
    opt.label.toLowerCase().includes(storeSearchText.toLowerCase())
  ) || [];

  if (inline) {
    // Inline layout: all filters on one row
    const storeField = filterFields.find(f => f.key === 'stores');
    const selectedStoreValues = selectedFilters['stores'] || [];
    
    return (
      <div className="bg-white rounded shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-gray-600 mb-1 block">Tìm kiếm (搜索):</label>
            <input
              type="text"
              placeholder="Tìm kiếm tổng..."
              value={searchText}
              onChange={handleSearch}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
            />
          </div>

          {/* Store Filter - Searchable Dropdown */}
          {storeField && (
            <div className="min-w-[200px]">
              <label className="text-xs text-gray-600 mb-1 block">Cửa hàng (商店):</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder={selectedStoreValues.length > 0 ? `${selectedStoreValues.length} đã chọn` : "Gõ để tìm..."}
                  value={storeSearchText}
                  onChange={(e) => {
                    setStoreSearchText(e.target.value);
                    setShowStoreDropdown(true);
                  }}
                  onFocus={() => setShowStoreDropdown(true)}
                  onBlur={() => {
                    // Delay to allow click on dropdown items
                    setTimeout(() => setShowStoreDropdown(false), 200);
                  }}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-navy"
                />
                {(showStoreDropdown && (storeSearchText || storeField.options)) && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto">
                    {(storeSearchText ? filteredStoreOptions : storeField.options || []).map((option) => (
                      <div
                        key={option.value}
                        onMouseDown={(e) => {
                          e.preventDefault(); // Prevent blur
                          const isSelected = selectedStoreValues.includes(option.value);
                          if (isSelected) {
                            onFilterChange('stores', selectedStoreValues.filter(v => v !== option.value));
                          } else {
                            onFilterChange('stores', [...selectedStoreValues, option.value]);
                          }
                          setStoreSearchText('');
                          setShowStoreDropdown(false);
                        }}
                        className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${
                          selectedStoreValues.includes(option.value) ? 'bg-blue-50 font-medium' : ''
                        }`}
                      >
                        {selectedStoreValues.includes(option.value) && '✓ '}
                        {option.label}
                      </div>
                    ))}
                    {storeSearchText && filteredStoreOptions.length === 0 && (
                      <div className="px-3 py-2 text-sm text-gray-500">Không tìm thấy</div>
                    )}
                  </div>
                )}
                {selectedStoreValues.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedStoreValues.map((value) => {
                      const option = storeField.options?.find(opt => opt.value === value);
                      return option ? (
                        <span
                          key={value}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded"
                        >
                          {option.label}
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              onFilterChange('stores', selectedStoreValues.filter(v => v !== value));
                            }}
                            className="hover:text-blue-600"
                          >
                            ×
                          </button>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick Date Filter Dropdown */}
          <div className="min-w-[180px]">
            <label className="text-xs text-gray-600 mb-1 block">Lọc nhanh (快速筛选):</label>
            <select
              value=""
              onChange={(e) => {
                const selectedIndex = e.target.selectedIndex;
                if (selectedIndex > 0) {
                  const filter = allQuickFilters[selectedIndex - 1];
                  handleQuickDateClick(filter);
                }
                e.target.value = '';
              }}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-navy bg-white"
            >
              <option value="">Chọn thời gian...</option>
              {allQuickFilters.map((filter, index) => (
                <option key={index} value={filter.label}>
                  {filter.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date From */}
          <div className="min-w-[140px]">
            <label className="text-xs text-gray-600 mb-1 block">Từ ngày (从日期):</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:border-brand-navy"
            />
          </div>

          {/* Date To */}
          <div className="min-w-[140px]">
            <label className="text-xs text-gray-600 mb-1 block">Đến ngày (至日期):</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:border-brand-navy"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={onExportExcel}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition text-sm font-medium flex items-center gap-2"
              title="Tải xuống Excel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Excel
            </button>
            <label className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm font-medium flex items-center gap-2 cursor-pointer" title="Tải lên Excel">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload
            </label>
            <button
              onClick={onReset}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition text-sm font-medium"
              title="Reset"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Original layout (non-inline)
  return (
    <div className="bg-white rounded shadow-sm border border-gray-200 p-4 space-y-4">
      {/* Dòng 1: Tìm kiếm, Export, Import, Reset */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Tìm kiếm tổng (tất cả các giá trị trong bảng)... (搜索全部 (表格中的所有值)...)"
            value={searchText}
            onChange={handleSearch}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
          />
        </div>
        <button
          onClick={onExportExcel}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition text-sm font-medium flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Tải xuống Excel (下载Excel)
        </button>
        <label className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm font-medium flex items-center gap-2 cursor-pointer">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Tải lên Excel (上传Excel)
        </label>
        <button
          onClick={onReset}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition text-sm font-medium flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Quay lại (重置)
        </button>
      </div>

      {/* Dòng 2: Bộ lọc */}
      <div className="border-t border-gray-200 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-700">Bộ lọc (筛选)</h3>
          {!inline && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="text-sm text-brand-navy hover:underline"
            >
              {showFilters ? 'Ẩn bộ lọc (隐藏筛选)' : 'Hiện bộ lọc (显示筛选)'}
            </button>
          )}
        </div>

        {showFilters && (
          <div className="space-y-4">
            {/* Bộ lọc thời gian */}
            <div className="bg-gray-50 p-3 rounded border border-gray-200">
              <h4 className="text-xs font-bold text-gray-700 mb-2 uppercase">Lọc theo thời gian (按时间筛选)</h4>
              <div className="space-y-2">
                {/* Lọc nhanh */}
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Lọc nhanh: (快速筛选:)</label>
                  <div className="flex flex-wrap gap-2">
                    {allQuickFilters.map((filter, index) => (
                      <button
                        key={index}
                        onClick={() => handleQuickDateClick(filter)}
                        className="px-3 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 hover:border-brand-navy transition"
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Từ ngày đến ngày */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-gray-600 mb-1 block">Từ ngày: (从日期:)</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => onDateFromChange(e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-brand-navy"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-600 mb-1 block">Đến ngày: (至日期:)</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => onDateToChange(e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-brand-navy"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Bộ lọc theo các trường */}
            {filterFields.length > 0 && (
              <div className="bg-gray-50 p-3 rounded border border-gray-200">
                <h4 className="text-xs font-bold text-gray-700 mb-2 uppercase">Lọc theo trường (按字段筛选)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filterFields.map((field) => (
                    <div key={field.key}>
                      <label className="text-xs font-medium text-gray-700 mb-2 block">
                        {field.label}:
                      </label>
                      {(field.type === 'checkbox' || field.type === 'select') && field.options ? (
                        <select
                          multiple
                          value={selectedFilters[field.key] || []}
                          onChange={(e) => {
                            const values = Array.from(e.target.selectedOptions, (option) => option.value);
                            onFilterChange(field.key, values);
                          }}
                          className="w-full border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:border-brand-navy bg-white"
                          size={Math.min(field.options.length, 6)}
                        >
                          {field.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};


