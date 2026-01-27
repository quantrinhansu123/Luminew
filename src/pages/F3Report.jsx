import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { F3ReportTab } from "../components/tabs/F3ReportTab";
import FilterPanel from "../components/FilterPanel";
import ColumnSettingsModal from "../components/ColumnSettingsModal";
import { ChevronLeft, Settings } from 'lucide-react';

export default function F3Report() {
  const [userTeam, setUserTeam] = useState("");
  const [userRole, setUserRole] = useState("user");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    setUserTeam(localStorage.getItem("userTeam") || "");
    setUserRole(localStorage.getItem("userRole") || "user");
    setUserEmail(localStorage.getItem("userEmail") || "");
  }, []);

  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    products: [],
    shifts: [],
    markets: [],
    teams: [],
    searchText: "",
  });

  const [availableFilters, setAvailableFilters] = useState({
    products: [],
    shifts: ["Giữa ca", "Hết ca"],
    markets: [],
    teams: [],
  });

  const [quickSelectValue, setQuickSelectValue] = useState("");
  const [enableDateFilter, setEnableDateFilter] = useState(true);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  
  // Column config
  const columnsConfig = [
    { key: 'orderCode', label: 'Mã đơn' },
    { key: 'date', label: 'Ngày' },
    { key: 'name', label: 'Tên' },
    { key: 'product', label: 'Sản phẩm' },
    { key: 'market', label: 'Thị trường' },
    { key: 'status', label: 'Trạng thái' },
    { key: 'revenue', label: 'Doanh số' },
  ];
  
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const obj = {};
    columnsConfig.forEach(c => { obj[c.key] = true; });
    return obj;
  });

  const handleFilterChange = (filterType, value) => {
    setFilters((prev) => {
      if (Array.isArray(value)) {
        return { ...prev, [filterType]: value };
      }

      if (Array.isArray(prev[filterType])) {
        const newValues = prev[filterType].includes(value) ? prev[filterType].filter((v) => v !== value) : [...prev[filterType], value];
        return { ...prev, [filterType]: newValues };
      }
      return { ...prev, [filterType]: value };
    });
  };

  const handleQuickDateSelect = (e) => {
    const value = e.target.value;
    setQuickSelectValue(value);
    if (!value) return;

    const today = new Date();
    let startDate = new Date();
    let endDate = new Date();

    switch (value) {
      case "today":
        startDate = new Date(today);
        endDate = new Date(today);
        break;
      case "yesterday":
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 1);
        endDate = new Date(startDate);
        break;
      case "last-week": {
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
        const lastWeekEnd = new Date(lastWeekStart);
        lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
        startDate = lastWeekStart;
        endDate = lastWeekEnd;
        break;
      }
      case "this-week": {
        const thisWeekStart = new Date(today);
        thisWeekStart.setDate(today.getDate() - today.getDay());
        const thisWeekEnd = new Date(thisWeekStart);
        thisWeekEnd.setDate(thisWeekStart.getDate() + 6);
        startDate = thisWeekStart;
        endDate = thisWeekEnd;
        break;
      }
      case "next-week": {
        const nextWeekStart = new Date(today);
        nextWeekStart.setDate(today.getDate() - today.getDay() + 7);
        const nextWeekEnd = new Date(nextWeekStart);
        nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
        startDate = nextWeekStart;
        endDate = nextWeekEnd;
        break;
      }
      case "this-month":
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      default:
        if (value.startsWith("month-")) {
          const month = parseInt(value.split("-")[1]) - 1; // 0-based
          startDate = new Date(today.getFullYear(), month, 1);
          endDate = new Date(today.getFullYear(), month + 1, 0);
        } else if (value.startsWith("q")) {
          const quarter = parseInt(value.slice(1)); // 1-4
          const quarterStartMonth = (quarter - 1) * 3;
          startDate = new Date(today.getFullYear(), quarterStartMonth, 1);
          endDate = new Date(today.getFullYear(), quarterStartMonth + 3, 0);
        }
        break;
    }

    setFilters((prev) => ({ ...prev, startDate: startDate.toISOString().split("T")[0], endDate: endDate.toISOString().split("T")[0] }));
  };

  const clearAllFilters = () => {
    setFilters({ startDate: "", endDate: "", products: [], shifts: [], markets: [], teams: [], searchText: "" });
    setQuickSelectValue("");
  };

  const hasActiveFilters = () => {
    return (
      filters.searchText || filters.startDate || filters.endDate || filters.products.length > 0 || filters.shifts.length > 0 || filters.markets.length > 0 || filters.teams.length > 0
    );
  };

  return (
    <div className="mx-auto px-8 py-8 bg-white">
      <div className="mb-6">
        <Link to="/" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 mb-2">
          <ChevronLeft className="w-4 h-4" />
          Quay lại
        </Link>
        <h1 className="text-2xl font-bold text-gray-800 mt-2">Báo cáo F3</h1>
      </div>

      <div className="grid grid-cols-1 lg:col-span-6 gap-6">
        <div className="lg:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Bộ lọc</span>
            <button
              onClick={() => setShowColumnSettings(true)}
              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded text-xs font-medium transition-colors flex items-center gap-1"
            >
              <Settings className="w-3 h-3" />
              Cột
            </button>
          </div>
          <FilterPanel
            activeTab={"f3"}
            filters={filters}
            handleFilterChange={(type, value) => handleFilterChange(type, value)}
            quickSelectValue={quickSelectValue}
            handleQuickDateSelect={(e) => handleQuickDateSelect(e)}
            availableFilters={availableFilters}
            userRole={userRole}
            hasActiveFilters={() => hasActiveFilters()}
            clearAllFilters={() => clearAllFilters()}
            enableDateFilter={enableDateFilter}
            onEnableDateFilterChange={setEnableDateFilter}
          />
        </div>

        <div className="lg:col-span-5">
          <F3ReportTab filters={filters} setFilters={setFilters} userRole={userRole} userEmail={userEmail} />
        </div>
      </div>

      {/* Column Settings Modal */}
      <ColumnSettingsModal
        isOpen={showColumnSettings}
        onClose={() => setShowColumnSettings(false)}
        allColumns={columnsConfig.map(c => c.key)}
        visibleColumns={visibleColumns}
        onToggleColumn={(key) => {
          const next = { ...visibleColumns };
          next[key] = !next[key];
          setVisibleColumns(next);
        }}
        onSelectAll={() => {
          const all = {};
          columnsConfig.forEach(c => { all[c.key] = true; });
          setVisibleColumns(all);
        }}
        onDeselectAll={() => {
          const none = {};
          columnsConfig.forEach(c => { none[c.key] = false; });
          setVisibleColumns(none);
        }}
        onResetDefault={() => {
          const defaultCols = {};
          columnsConfig.forEach(c => { defaultCols[c.key] = true; });
          setVisibleColumns(defaultCols);
        }}
        defaultColumns={columnsConfig.map(c => c.key)}
      />
    </div>
  );
}