// src/components/filter-panel/FilterPanel.jsx
import React, { useState, memo, useCallback, useRef, useEffect } from "react";
import { Search, X, Trash2, Calendar, ChevronDown, Sliders, Package, Clock, MapPin, CreditCard, Users } from "lucide-react";

// Minimal Icon wrapper (original project has a custom Icon component; keep simple)
const Icon = ({ children }) => <span className="inline-flex items-center">{children}</span>;

const CheckboxGroup = memo(({ title, items = [], selected = [], onToggle, visible = true, icon, maxHeight = "max-h-40" }) => {
  if (!visible) return null;
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 mb-3">
        <Icon>{icon}</Icon>
        <h4 className="font-semibold text-gray-800 text-sm">{title}</h4>
      </div>
      <div className={`overflow-y-auto ${maxHeight} space-y-1`}>
        {items.map((item) => (
          <label key={item} className="flex items-center px-3 py-2 hover:bg-green-50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-green-200">
            <input type="checkbox" checked={selected.includes(item)} onChange={() => onToggle(item)} className="w-4 h-4 rounded text-green-600" />
            <span className="ml-3 text-sm text-gray-700 flex-1">{item}</span>
          </label>
        ))}
        {items.length === 0 && <div className="text-center text-gray-500 text-sm py-2">Không có dữ liệu</div>}
      </div>
    </div>
  );
});

const SearchInput = memo(({ placeholder = "Tìm...", value = "", onChange }) => {
  return (
    <div className="relative mb-2">
      <input type="text" placeholder={placeholder} defaultValue={value} onChange={(e) => onChange && onChange(e.target.value)} className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg" />
      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
    </div>
  );
});

const FilterGroup = memo(({ config, filters = {}, availableFilters = {}, variant = 'sidebar', openGroup, setOpenGroup, onToggle }) => {
  const { key, title, icon: IconComponent = Package, visible = true, keyFilter } = config;
  if (!visible) return null;
  const filterKey = keyFilter || key;
  const items = availableFilters[key] || [];
  const selected = filters[filterKey] || [];

  const wrapperClass = variant === 'topbar' ? 'inline-block align-top mr-3' : 'mb-6 pb-4 border-b border-gray-100';

  if (variant === 'topbar') {
    const open = openGroup === filterKey;
    return (
      <div className={`relative ${wrapperClass}`}>
        <button type="button" onClick={() => setOpenGroup(open ? null : filterKey)} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-md shadow-sm text-sm w-44 justify-between">
          <span className="flex items-center gap-2 truncate"><IconComponent className="w-4 h-4 text-gray-600" /><span className="truncate">{title}</span></span>
          <ChevronDown className={`w-4 h-4 text-gray-500 ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute z-50 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg w-64 p-3">
            <SearchInput placeholder={`Tìm ${title.toLowerCase()}...`} onChange={() => {}} />
            <div className="max-h-48 overflow-y-auto space-y-1 mt-2">
              {items.length === 0 && <div className="text-center text-gray-500 text-sm py-2">Không có dữ liệu</div>}
              {items.map((item) => (
                <label key={item} className="flex items-center px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selected.includes(item)} onChange={() => onToggle(filterKey, item)} className="w-4 h-4 rounded text-green-600" />
                  <span className="ml-2 text-sm text-gray-700 truncate">{item}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <CheckboxGroup title={title} items={items} selected={selected} onToggle={(v) => onToggle(filterKey, v)} icon={<IconComponent className="w-4 h-4" />} />
      <SearchInput placeholder={`Tìm ${title.toLowerCase()}...`} onChange={() => {}} />
    </div>
  );
});

function FilterPanel({
  activeTab,
  filters = {},
  handleFilterChange = () => {},
  quickSelectValue,
  handleQuickDateSelect = () => {},
  availableFilters = {},
  userRole,
  hasActiveFilters = () => false,
  clearAllFilters = () => {},
  columnsConfig = [],
  visibleColumns = {},
  onVisibleColumnsChange = () => {},
  showMarkets = true,
  showPaymentMethodSearch = false,
  variant = 'sidebar',
  enableDateFilter = true,
  onEnableDateFilterChange = null,
}) {
  const [openGroup, setOpenGroup] = useState(null);
  const panelRef = useRef(null);

  // Close open dropdown when clicking outside the panel or pressing Escape
  useEffect(() => {
    const onPointerDown = (ev) => {
      const el = panelRef.current;
      if (!el) return;
      // If there's an open group and click is outside the panel, close it
      if (openGroup && !el.contains(ev.target)) {
        setOpenGroup(null);
      }
    };

    const onKeyDown = (ev) => {
      if (ev.key === "Escape" && openGroup) {
        setOpenGroup(null);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openGroup]);

  const filterConfigs = [
    { key: 'products', title: 'Sản phẩm', icon: Package, visible: activeTab !== 'users' },
    { key: 'shifts', title: 'Ca làm việc', icon: Clock },
    { key: 'markets', title: 'Thị trường', icon: MapPin, visible: showMarkets && activeTab !== 'users' },
    { key: 'paymentMethods', title: 'Thanh toán', icon: CreditCard, visible: showPaymentMethodSearch, keyFilter: 'paymentMethod' },
    { key: 'teams', title: 'Team', icon: Users, visible: userRole === 'admin' || activeTab === 'detailed' },
  ];

  const toggleColumn = useCallback((key) => {
    const next = { ...(visibleColumns || {}) };
    next[key] = !next[key];
    onVisibleColumnsChange(next);
  }, [visibleColumns, onVisibleColumnsChange]);

  const setAllColumns = useCallback((val) => {
    const next = {};
    (columnsConfig || []).forEach(c => { next[c.key] = !!val; });
    onVisibleColumnsChange(next);
  }, [columnsConfig, onVisibleColumnsChange]);

  const outerClass = variant === 'topbar' ? 'w-full' : 'lg:col-span-1';
  const innerPanelClass = variant === 'topbar'
    ? 'bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100 p-4 w-full flex flex-wrap items-start gap-4 sticky top-0 z-40'
    : 'bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto';

  const handleQuickDateSelectWrapper = (e) => {
    // Pass the original event to parent so parent can read `e.target.value`.
    handleQuickDateSelect && handleQuickDateSelect(e);
  };

  const handleToggle = (filterKey, value) => {
    // toggles on parent filters structure
    const current = filters[filterKey] || [];
    const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
    handleFilterChange(filterKey, next);
  };

  const handleDateChange = (key, v) => {
    handleFilterChange(key, v);
  };

  return (
    <div className={outerClass}>
      <div ref={panelRef} className={innerPanelClass}>
        {activeTab !== 'users' && variant === 'topbar' ? (
          <>
            <div className="w-full flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-gray-600" />
                    <h4 className="font-semibold text-gray-800 text-sm">Ngày tháng</h4>
                  </div>

                  <div className="relative">
                    <select onChange={handleQuickDateSelectWrapper} value={quickSelectValue || ''} className="appearance-none px-3 py-2 pr-8 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm shadow-sm hover:border-blue-300 transition-all cursor-pointer w-56">
                      <option value="">-- Chọn nhanh --</option>
                      <optgroup label="Ngày"><option value="today">Hôm nay</option><option value="yesterday">Hôm qua</option></optgroup>
                      <optgroup label="Tuần"><option value="this-week">Tuần này</option><option value="last-week">Tuần trước</option><option value="next-week">Tuần sau</option></optgroup>
                      <optgroup label="Tháng"><option value="this-month">Tháng này</option>{[...Array(12)].map((_, i) => (<option key={i+1} value={`month-${i+1}`}>Tháng {i+1}</option>))}</optgroup>
                      <optgroup label="Quý">{[1,2,3,4].map(q => (<option key={q} value={`q${q}`}>Quý {q}</option>))}</optgroup>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  </div>

                  {onEnableDateFilterChange && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableDateFilter}
                        onChange={(e) => onEnableDateFilterChange(e.target.checked)}
                        className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                      />
                      <span className="text-xs font-medium text-gray-600">Bật lọc ngày</span>
                    </label>
                  )}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-gray-600">Từ</label>
                      <input 
                        type="date" 
                        disabled={onEnableDateFilterChange && !enableDateFilter}
                        value={filters.startDate || ''} 
                        onChange={(e) => handleDateChange('startDate', e.target.value)} 
                        className="px-3 py-2 text-sm border border-gray-200 rounded-lg disabled:bg-gray-100 disabled:cursor-not-allowed" 
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-gray-600">Đến</label>
                      <input 
                        type="date" 
                        disabled={onEnableDateFilterChange && !enableDateFilter}
                        value={filters.endDate || ''} 
                        onChange={(e) => handleDateChange('endDate', e.target.value)} 
                        className="px-3 py-2 text-sm border border-gray-200 rounded-lg disabled:bg-gray-100 disabled:cursor-not-allowed" 
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Sliders className="w-5 h-5 text-gray-600" />
                  <div className="flex items-center gap-3">
                    {filterConfigs.map((config) => (
                      <FilterGroup key={config.key} config={config} filters={filters} availableFilters={availableFilters} variant={variant} openGroup={openGroup} setOpenGroup={setOpenGroup} onToggle={handleToggle} />
                    ))}
                  </div>
                </div>
              </div>

              {hasActiveFilters?.() && (
                <div className="flex-shrink-0">
                  <button onClick={clearAllFilters} className="px-3 py-2 bg-red-500 text-white text-sm font-semibold rounded-md hover:shadow-md flex items-center gap-2">
                    <Trash2 className="w-4 h-4" /> Xóa tất cả
                  </button>
                </div>
              )}
            </div>

            <div className="w-full mt-2">
              <div className="text-sm font-semibold mb-1">Cột hiển thị</div>
              <div className="flex flex-wrap gap-2">
                {(columnsConfig || []).map(col => (
                  <label key={col.key} className="flex items-center gap-2 px-2 py-1 bg-white border border-gray-200 rounded-md text-sm cursor-pointer">
                    <input type="checkbox" checked={visibleColumns?.[col.key] !== false} onChange={() => toggleColumn(col.key)} className="w-4 h-4 rounded text-green-600" />
                    <span className="truncate">{col.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {activeTab !== 'users' && (
              <div className={variant === 'topbar' ? 'mr-3' : 'mb-4'}>
                <div className="flex items-center gap-2 mb-2"><Calendar className="w-5 h-5 text-gray-600" /><h4 className="font-semibold text-gray-800 text-sm">Ngày tháng</h4></div>
                <div className="relative">
                  <select onChange={handleQuickDateSelectWrapper} value={quickSelectValue || ''} className="appearance-none w-full px-4 py-3 pr-10 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white text-sm shadow-sm hover:border-blue-300 transition-all cursor-pointer">
                    <option value="">-- Chọn nhanh --</option>
                    <optgroup label="Ngày"><option value="today">Hôm nay</option><option value="yesterday">Hôm qua</option></optgroup>
                    <optgroup label="Tuần"><option value="this-week">Tuần này</option><option value="last-week">Tuần trước</option><option value="next-week">Tuần sau</option></optgroup>
                    <optgroup label="Tháng"><option value="this-month">Tháng này</option>{[...Array(12)].map((_, i) => (<option key={i+1} value={`month-${i+1}`}>Tháng {i+1}</option>))}</optgroup>
                    <optgroup label="Quý">{[1,2,3,4].map(q => (<option key={q} value={`q${q}`}>Quý {q}</option>))}</optgroup>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                </div>
                {onEnableDateFilterChange && (
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={enableDateFilter}
                      onChange={(e) => onEnableDateFilterChange(e.target.checked)}
                      className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                    />
                    <span className="text-xs font-medium text-gray-600">Bật lọc ngày</span>
                  </label>
                )}
                <div className="grid grid-cols-1 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Từ</label>
                    <input 
                      type="date" 
                      disabled={onEnableDateFilterChange && !enableDateFilter}
                      value={filters.startDate || ''} 
                      onChange={(e) => handleDateChange('startDate', e.target.value)} 
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl disabled:bg-gray-100 disabled:cursor-not-allowed" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Đến</label>
                    <input 
                      type="date" 
                      disabled={onEnableDateFilterChange && !enableDateFilter}
                      value={filters.endDate || ''} 
                      onChange={(e) => handleDateChange('endDate', e.target.value)} 
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl disabled:bg-gray-100 disabled:cursor-not-allowed" 
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="w-full">
              <div className="flex items-center gap-2 mb-2"><Sliders className="w-5 h-5 text-gray-600" /><h4 className="font-semibold text-gray-800 text-sm">Bộ lọc chi tiết</h4></div>
              <div className="flex flex-wrap items-start gap-3 w-full">
                {filterConfigs.map((config) => (
                  <FilterGroup key={config.key} config={config} filters={filters} availableFilters={availableFilters} variant={variant} openGroup={openGroup} setOpenGroup={setOpenGroup} onToggle={handleToggle} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default FilterPanel;