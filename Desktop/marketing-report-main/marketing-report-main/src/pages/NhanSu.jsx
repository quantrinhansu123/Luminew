import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { UserManagementTab } from "../components/tabs/UserManagementTab";
import FilterPanel from "../components/FilterPanel";
import { ChevronLeft } from 'lucide-react';

export default function NhanSu() {
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
        <h1 className="text-2xl font-bold text-gray-800 mt-2">Quản lý Nhân sự</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
        <FilterPanel
          activeTab={"users"}
          filters={filters}
          handleFilterChange={(type, value) => handleFilterChange(type, value)}
          quickSelectValue={quickSelectValue}
          handleQuickDateSelect={(e) => handleQuickDateSelect(e)}
          availableFilters={availableFilters}
          userRole={userRole}
          hasActiveFilters={() => hasActiveFilters()}
          clearAllFilters={() => clearAllFilters()}
        />

        <div className="lg:col-span-5">
          <UserManagementTab userRole={userRole} userTeam={userTeam} searchText={filters.searchText} teamFilter={filters.teams} />
        </div>
      </div>
    </div>
  );
}