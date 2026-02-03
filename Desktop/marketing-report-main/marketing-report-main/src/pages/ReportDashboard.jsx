import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { ref, get, update, remove } from "firebase/database";
import { database } from "../firebase/config";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useReportData } from "../hooks/useReportData";
import { F3ReportTab } from "../components/tabs/F3ReportTab";
import { KPIReportTab } from "../components/tabs/KPIReportTab";
import { MarketEffectivenessTab } from "../components/tabs/MarketEffectivenessTab";
import { UserManagementTab } from "../components/tabs/UserManagementTab";
import { BaoCaoThuCongTab } from "../components/tabs/BaoCaoThuCongTab";
import FilterPanel from "../components/FilterPanel";
import { ChevronLeft } from 'lucide-react';

function ReportDashboard() {
  // Load user info from localStorage
  const [userTeam, setUserTeam] = useState("");
  const [userRole, setUserRole] = useState("user");
  const [userEmail, setUserEmail] = useState("");

  // Use custom hook to fetch data
  const { masterData, firebaseReports, loading, error } = useReportData(userRole, userTeam, userEmail);
  
  const [filteredData, setFilteredData] = useState([]);
  const [filteredFirebaseReports, setFilteredFirebaseReports] = useState([]);
  const [f3Data, setF3Data] = useState([]);
  const [filteredF3Data, setFilteredF3Data] = useState([]);
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [activeTab, setActiveTab] = useState("kpi");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50); // Show 50 items per page

  // Filter states
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    products: [],
    shifts: [],
    markets: [],
    teams: [],
    searchText: "", // Added for firebase reports search
  });

  const [availableFilters, setAvailableFilters] = useState({
    products: [],
    shifts: ["Giữa ca", "Hết ca"],
    markets: [],
    teams: [],
  });

  // Quick select state
  const [quickSelectValue, setQuickSelectValue] = useState("");

  useEffect(() => {
    // Load user team, role and email from localStorage
    const team = localStorage.getItem("userTeam") || "";
    const role = localStorage.getItem("userRole") || "user";
    const email = localStorage.getItem("userEmail") || "";
    setUserTeam(team);
    setUserRole(role);
    setUserEmail(email);

    // Set default dates (current month)
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    setFilters((prev) => ({
      ...prev,
      startDate: firstDay.toISOString().split("T")[0],
      endDate: lastDay.toISOString().split("T")[0],
    }));

    // Fetch F3 data
    fetchF3Data();

    // Fetch users if admin or leader
    if (role === "admin" || role === "leader") {
      fetchUsers();
    }
  }, []);

  // Update available filters when masterData changes
  useEffect(() => {
    if (masterData.length > 0) {
      const products = [
        ...new Set(masterData.map((r) => r.product).filter(Boolean)),
      ];
      const markets = [
        ...new Set(masterData.map((r) => r.market).filter(Boolean)),
      ];

      setAvailableFilters((prev) => ({
        ...prev,
        products: products.sort(),
        markets: markets.sort(),
      }));
    }
  }, [masterData]);

  // Fetch teams from Firebase human_resources for team filter
  useEffect(() => {
    const fetchTeamsFromFirebase = async () => {
      try {
        const hrRef = ref(database, "human_resources");
        const snapshot = await get(hrRef);

        if (snapshot.exists()) {
          const hrData = snapshot.val();
          const teams = [
            ...new Set(
              Object.values(hrData)
                .map((user) => user.Team)
                .filter(Boolean)
            ),
          ];

          setAvailableFilters((prev) => ({
            ...prev,
            teams: teams.sort(),
          }));
        }
      } catch (error) {
        console.error("Error loading teams from Firebase:", error);
      }
    };

    fetchTeamsFromFirebase();
  }, []);

  const fetchF3Data = async () => {
    try {
      const f3Ref = ref(database, "f3_data");
      const snapshot = await get(f3Ref);

      if (snapshot.exists()) {
        const f3DataObj = snapshot.val();
        const totalKeys = Object.keys(f3DataObj).length;

        // Convert to array efficiently
        const f3Array = Object.entries(f3DataObj)
          .filter(([_, data]) => data) // Skip null/undefined
          .map(([id, data]) => ({
            id,
            ...data,
            "Ngày lên đơn": data["Ngày lên đơn"]
              ? new Date(data["Ngày lên đơn"])
              : null,
            "Thời gian lên đơn": data["Thời gian lên đơn"]
              ? new Date(data["Thời gian lên đơn"])
              : null,
          }));

        // Sort by timestamp or date
        f3Array.sort((a, b) => {
          const dateA =
            a["Thời gian lên đơn"] || a["Ngày lên đơn"] || new Date(0);
          const dateB =
            b["Thời gian lên đơn"] || b["Ngày lên đơn"] || new Date(0);
          return dateB - dateA;
        });

        setF3Data(f3Array);
        setFilteredF3Data(f3Array);

        if (f3Array.length < totalKeys) {
          console.warn(
            `⚠️ Skipped ${totalKeys - f3Array.length} invalid records`
          );
        }
      } else {
        setF3Data([]);
        setFilteredF3Data([]);
        toast.warning("Không có dữ liệu F3 trong Firebase", {
          position: "top-right",
          autoClose: 3000,
        });
      }
    } catch (error) {
      console.error("❌ Error loading F3 data:", error);
      toast.error("Lỗi khi tải dữ liệu F3: " + error.message, {
        position: "top-right",
        autoClose: 5000,
      });
    }
  };

  const fetchUsers = async () => {
    try {
      const usersRef = ref(database, "human_resources");
      const snapshot = await get(usersRef);

      if (snapshot.exists()) {
        const usersData = snapshot.val();

        const usersArray = Object.entries(usersData).map(
          ([firebaseKey, data]) => ({
            firebaseKey, // This is the actual Firebase key for updates/deletes
            ...data, // This spreads all fields including 'id' field if it exists
          })
        );

        // Sort by name (Họ Và Tên)
        usersArray.sort((a, b) =>
          (a["Họ Và Tên"] || "").localeCompare(b["Họ Và Tên"] || "")
        );

        // Filter by team for leader role
        let filteredArray = usersArray;
        if (userRole === "leader" && userTeam) {
          filteredArray = usersArray.filter((user) => user.Team === userTeam);
        }

        setUsers(usersArray);
        setFilteredUsers(filteredArray);
      } else {
        setUsers([]);
        setFilteredUsers([]);
      }
    } catch (error) {
      console.error("Error loading users:", error);
      toast.error("Lỗi khi tải danh sách nhân sự: " + error.message, {
        position: "top-right",
        autoClose: 5000,
      });
    }
  };

  const handleUpdateUser = async (userId, updates) => {
    try {
      const userRef = ref(database, `human_resources/${userId}`);
      await update(userRef, updates);

      // Refresh users list
      await fetchUsers();
      setEditingUser(null);
      toast.success("Cập nhật nhân viên thành công!", {
        position: "top-right",
        autoClose: 3000,
      });
    } catch (error) {
      console.error("Error updating user:", error);
      toast.error("Lỗi khi cập nhật: " + error.message, {
        position: "top-right",
        autoClose: 5000,
      });
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa nhân viên này?")) {
      return;
    }

    try {
      const userRef = ref(database, `human_resources/${userId}`);
      await remove(userRef);

      // Refresh users list
      await fetchUsers();
      toast.success("Xóa nhân viên thành công!", {
        position: "top-right",
        autoClose: 3000,
      });
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error("Lỗi khi xóa: " + error.message, {
        position: "top-right",
        autoClose: 5000,
      });
    }
  };

  // Memoize filtered F3 data for better performance
  const filteredF3DataMemo = useMemo(() => {
    let filtered = [...f3Data];

    // Search by text (Name, Email, Team, Mã đơn hàng, etc.)
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          (item["Name*"] &&
            item["Name*"].toLowerCase().includes(searchLower)) ||
          (item["Nhân viên Marketing"] &&
            item["Nhân viên Marketing"].toLowerCase().includes(searchLower)) ||
          (item["Nhân viên Sale"] &&
            item["Nhân viên Sale"].toLowerCase().includes(searchLower)) ||
          (item["Mã đơn hàng"] &&
            item["Mã đơn hàng"].toLowerCase().includes(searchLower)) ||
          (item["Team"] && item["Team"].toLowerCase().includes(searchLower))
      );
    }

    // Date filter by Ngày lên đơn
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      startDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter((item) => {
        const itemDate = item["Ngày lên đơn"] || item["Thời gian lên đơn"];
        if (!itemDate) return true;
        return itemDate >= startDate;
      });
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((item) => {
        const itemDate = item["Ngày lên đơn"] || item["Thời gian lên đơn"];
        if (!itemDate) return true;
        return itemDate <= endDate;
      });
    }

    // Shift filter by Ca
    if (filters.shifts.length > 0) {
      filtered = filtered.filter((item) => filters.shifts.includes(item["Ca"]));
    }

    // Team filter
    if (filters.teams.length > 0 && userRole === "admin") {
      filtered = filtered.filter(
        (item) => item["Team"] && filters.teams.includes(item["Team"])
      );
    }

    // Access control: Only leader and admin can view F3 data
    const allowedRoles = ["admin", "leader"];
    if (!allowedRoles.includes(userRole)) {
      filtered = [];
    }

    return filtered;
  }, [filters, f3Data, userRole]);

  // Update filteredF3Data when memo changes
  useEffect(() => {
    setFilteredF3Data(filteredF3DataMemo);
    setCurrentPage(1); // Reset to page 1 when filters change
  }, [filteredF3DataMemo]);

  // Paginated F3 data for rendering
  const paginatedF3Data = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredF3DataMemo.slice(startIndex, endIndex);
  }, [filteredF3DataMemo, currentPage, itemsPerPage]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredF3DataMemo.length / itemsPerPage);
  }, [filteredF3DataMemo.length, itemsPerPage]);

  // Note: Removed auto-clear filters when switching to F3 tab
  // Users can manually clear filters if needed

  useEffect(() => {
    applyFilters();
  }, [filters, masterData, userTeam, userRole, userEmail]);

  useEffect(() => {
    applyFirebaseFilters();
  }, [filters, firebaseReports, userTeam, userRole, userEmail]);

  const applyFirebaseFilters = () => {
    let filtered = [...firebaseReports];

    // Search by text (name, email, TKQC)
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      filtered = filtered.filter(
        (report) =>
          (report.name && report.name.toLowerCase().includes(searchLower)) ||
          (report.email && report.email.toLowerCase().includes(searchLower)) ||
          (report.tkqc && report.tkqc.toLowerCase().includes(searchLower))
      );
    }

    // Date filter
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      startDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter((report) => {
        const reportDate =
          report.date instanceof Date ? report.date : new Date(report.date);
        return reportDate >= startDate;
      });
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((report) => {
        const reportDate =
          report.date instanceof Date ? report.date : new Date(report.date);
        return reportDate <= endDate;
      });
    }

    // Product filter
    if (filters.products.length > 0) {
      filtered = filtered.filter((report) =>
        filters.products.includes(report.product)
      );
    }

    // Market filter
    if (filters.markets.length > 0) {
      filtered = filtered.filter((report) =>
        filters.markets.includes(report.market)
      );
    }

    // Shift filter
    if (filters.shifts.length > 0) {
      filtered = filtered.filter((report) =>
        filters.shifts.includes(report.shift)
      );
    }

    // Access control:
    // - Admin: Xem TẤT CẢ báo cáo (full access)
    // - Leader: Xem báo cáo của team mình
    // - User: Chỉ xem báo cáo của bản thân
    if (userRole === "admin") {
      // Admin sees all reports - no access restriction
    } else if (userRole === "leader" && userTeam) {
      // Leader sees their team's reports
      filtered = filtered.filter((report) => report.team === userTeam);
    } else if (userEmail) {
      // Regular user sees only their own reports
      filtered = filtered.filter((report) => report.email === userEmail);
    }

    setFilteredFirebaseReports(filtered);
  };

  const applyFilters = () => {
    let filtered = [...masterData];

    // Access control:
    // - Admin: Xem TẤT CẢ dữ liệu không bị giới hạn (full access)
    // - Leader: Xem theo team của mình
    // - User: Chỉ xem dữ liệu của bản thân
    if (userRole === "admin") {
      // Admin sees ALL data - no access restriction
    } else if (userRole === "leader" && userTeam) {
      // Leader sees their team's reports only
      filtered = filtered.filter((r) => r.team === userTeam);
    } else if (userEmail) {
      // Regular user sees only their own reports
      filtered = filtered.filter((r) => r.email === userEmail);
    }

    // Search by text (name, email, team, product, market)
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          (r.name && r.name.toLowerCase().includes(searchLower)) ||
          (r.email && r.email.toLowerCase().includes(searchLower)) ||
          (r.team && r.team.toLowerCase().includes(searchLower)) ||
          (r.product && r.product.toLowerCase().includes(searchLower)) ||
          (r.market && r.market.toLowerCase().includes(searchLower))
      );
    }

    // Date filter
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      startDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter((r) => r.date >= startDate);
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((r) => r.date <= endDate);
    }

    // Product filter
    if (filters.products.length > 0) {
      filtered = filtered.filter((r) => filters.products.includes(r.product));
    }

    // Shift filter
    if (filters.shifts.length > 0) {
      filtered = filtered.filter((r) => filters.shifts.includes(r.shift));
    }

    // Market filter
    if (filters.markets.length > 0) {
      filtered = filtered.filter((r) => filters.markets.includes(r.market));
    }

    // Team filter (only applicable for admin to filter specific teams)
    if (filters.teams.length > 0 && userRole === "admin") {
      filtered = filtered.filter(
        (r) => r.team && filters.teams.includes(r.team)
      );
    }

    setFilteredData(filtered);
  };

  const handleFilterChange = (filterType, value) => {
    setFilters((prev) => {
      // If caller supplies an array, use it directly (compatibility with FilterPanel)
      if (Array.isArray(value)) {
        return { ...prev, [filterType]: value };
      }

      if (Array.isArray(prev[filterType])) {
        const newValues = prev[filterType].includes(value)
          ? prev[filterType].filter((v) => v !== value)
          : [...prev[filterType], value];
        return { ...prev, [filterType]: newValues };
      }
      return { ...prev, [filterType]: value };
    });
  };

  // Handle quick date range selection
  const handleQuickDateSelect = (e) => {
    const value = e.target.value;
    setQuickSelectValue(value);
    if (!value) return;

    const today = new Date();
    let startDate = new Date();
    let endDate = new Date();

    switch (value) {
      case "today":
        // Hôm nay
        startDate = new Date(today);
        endDate = new Date(today);
        break;
      case "yesterday":
        // Hôm qua
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 1);
        endDate = new Date(startDate);
        break;
      case "last-week":
        // Tuần trước
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
        const lastWeekEnd = new Date(lastWeekStart);
        lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
        startDate = lastWeekStart;
        endDate = lastWeekEnd;
        break;
      case "this-week":
        // Tuần này
        const thisWeekStart = new Date(today);
        thisWeekStart.setDate(today.getDate() - today.getDay());
        const thisWeekEnd = new Date(thisWeekStart);
        thisWeekEnd.setDate(thisWeekStart.getDate() + 6);
        startDate = thisWeekStart;
        endDate = thisWeekEnd;
        break;
      case "next-week":
        // Tuần sau
        const nextWeekStart = new Date(today);
        nextWeekStart.setDate(today.getDate() - today.getDay() + 7);
        const nextWeekEnd = new Date(nextWeekStart);
        nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
        startDate = nextWeekStart;
        endDate = nextWeekEnd;
        break;
      case "this-month":
        // Tháng này
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case "month-1":
      case "month-2":
      case "month-3":
      case "month-4":
      case "month-5":
      case "month-6":
      case "month-7":
      case "month-8":
      case "month-9":
      case "month-10":
      case "month-11":
      case "month-12":
        // Tháng cụ thể
        const month = parseInt(value.split("-")[1]) - 1;
        startDate = new Date(today.getFullYear(), month, 1);
        endDate = new Date(today.getFullYear(), month + 1, 0);
        break;
      case "q1":
        // Quý 1 (T1-T3)
        startDate = new Date(today.getFullYear(), 0, 1);
        endDate = new Date(today.getFullYear(), 2, 31);
        break;
      case "q2":
        // Quý 2 (T4-T6)
        startDate = new Date(today.getFullYear(), 3, 1);
        endDate = new Date(today.getFullYear(), 5, 30);
        break;
      case "q3":
        // Quý 3 (T7-T9)
        startDate = new Date(today.getFullYear(), 6, 1);
        endDate = new Date(today.getFullYear(), 8, 30);
        break;
      case "q4":
        // Quý 4 (T10-T12)
        startDate = new Date(today.getFullYear(), 9, 1);
        endDate = new Date(today.getFullYear(), 11, 31);
        break;
      default:
        return;
    }

    setFilters((prev) => ({
      ...prev,
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    }));
  };

  // Clear all filters
  const clearAllFilters = () => {
    setFilters({
      startDate: "",
      endDate: "",
      products: [],
      shifts: [],
      markets: [],
      teams: [],
      searchText: "",
    });
    setQuickSelectValue(""); // Reset quick select to default
  };

  // Check if any filters are active
  const hasActiveFilters = () => {
    return (
      filters.searchText ||
      filters.startDate ||
      filters.endDate ||
      filters.products.length > 0 ||
      filters.shifts.length > 0 ||
      filters.markets.length > 0 ||
      filters.teams.length > 0
    );
  };

  const formatDate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-lumi-orange mx-auto"></div>
          <p className="mt-4 text-lumi-gray">Đang tải dữ liệu từ API...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-5xl mb-4">Warning</div>
          <h2 className="text-2xl font-bold text-lumi-dark mb-2">Lỗi tải dữ liệu</h2>
          <p className="text-lumi-gray mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-lumi-orange text-white px-6 py-2 rounded-lg hover:bg-lumi-light-orange transition"
          >
            Tải lại trang
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto px-8 py-8 bg-white">
      {/* Header */}
      <div className="mb-6">
        <Link to="/" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 mb-2">
          <ChevronLeft className="w-4 h-4" />
          Quay lại
        </Link>
      </div>
      {/* <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center">
          <img
            src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Ff930e667.%E1%BA%A2nh.025539.jpg"
            alt="LUMI GLOBAL"
            className="h-16 w-16 rounded-full shadow-lg mr-4"
          />
          <div>
            <h1 className="text-3xl font-bold text-lumi-blue">
              DỮ LIỆU CHI PHÍ ADS
            </h1>
            <p className="text-lumi-gray">Báo cáo chi phí tổng hợp</p>
          </div>
        </div>
      </div> */}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-md mb-6">
        <div className="border-b border-lumi-gray-200">
          <div className="flex items-center justify-between">
            <nav className="flex -mb-px">
              {[
                { id: "kpi", label: "Báo cáo KPI" },
                { id: "market", label: "Hiệu quả MKT" },
                { id: "thucong", label: "Báo cáo thực công" },
                // { id: "f3", label: "Báo cáo F3" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-6 font-medium text-sm border-b-2 transition ${
                    activeTab === tab.id
                      ? "border-lumi-blue text-lumi-blue"
                      : "border-transparent text-lumi-gray hover:text-lumi-dark hover:border-lumi-gray"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
        {activeTab !== "thucong" && (
          <FilterPanel
            activeTab={activeTab}
            filters={filters}
            handleFilterChange={handleFilterChange}
            quickSelectValue={quickSelectValue}
            handleQuickDateSelect={handleQuickDateSelect}
            availableFilters={availableFilters}
            userRole={userRole}
            hasActiveFilters={hasActiveFilters}
            clearAllFilters={clearAllFilters}
          />
        )}

        <div className={activeTab !== "thucong" ? "lg:col-span-5" : "lg:col-span-6"}>
          {activeTab === "kpi" && <KPIReportTab data={filteredData} filters={filters} />}
          {activeTab === "market" && <MarketEffectivenessTab data={filteredData} filters={filters} />}
          {activeTab === "thucong" && <BaoCaoThuCongTab tableName="Báo cáo MKT" />}
          {activeTab === "f3" && (
            <F3ReportTab filters={filters} setFilters={setFilters} userRole={userRole} userEmail={userEmail} />
          )}
        </div>
      </div>

      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
        toastClassName="!bg-white !text-lumi-dark"
        progressClassName="!bg-lumi-orange"
      />
    </div>
  );
}

export default ReportDashboard;