// BaoCaoHieuSuatKPI.jsx
import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, RefreshCw, Settings } from "lucide-react";
import { toast } from "react-toastify";
import FilterPanel from "../components/FilterPanel";
import ColumnSettingsModal from "../components/ColumnSettingsModal";

export default function BaoCaoHieuSuatKPI() {
  const [userTeam, setUserTeam] = useState("");
  const [userRole, setUserRole] = useState("user");
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");

  const [masterData, setMasterData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cpqcByMarketing, setCpqcByMarketing] = useState({});
  const [cpqcSourceRows, setCpqcSourceRows] = useState([]);

  // Dropdown data from database
  const [products, setProducts] = useState([]);
  const [teams, setTeams] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [shifts, setShifts] = useState([]);

  // HR data for team filtering
  const [hrData, setHrData] = useState([]);
  const [hrLoading, setHrLoading] = useState(false);

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

  // Quick select value for date filter
  const [quickSelectValue, setQuickSelectValue] = useState("");
  const [enableDateFilter, setEnableDateFilter] = useState(true);
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  // Column visibility states
  const [visibleColumns, setVisibleColumns] = useState({
    cpqc: true,
    chot: true,
    huy: true,
    sauHuy: true,
    di: true,
    thuTien: true,
    ship: true,
    dThuKpi: true,
    tyLeThuTien: true,
    tyLeDatKpi: true,
    cpds: true,
  });

  // Configuration for columns shown in the FilterPanel
  const columnsConfig = [
    { key: "cpqc", label: "CPQC" },
    { key: "chot", label: "Chốt (Số đơn/DS)" },
    { key: "huy", label: "Hủy (Số đơn/DS)" },
    { key: "sauHuy", label: "Sau hủy (Số đơn/DS)" },
    { key: "di", label: "Đi (Số đơn/DS)" },
    { key: "thuTien", label: "Thu tiền (Số đơn/DS)" },
    { key: "ship", label: "Ship" },
    { key: "dThuKpi", label: "DThu tính KPI" },
    { key: "tyLeThuTien", label: "Tỷ lệ thu tiền" },
    { key: "tyLeDatKpi", label: "Tỷ lệ đạt KPI" },
    { key: "cpds", label: "%CP/DS" },
  ];

  // Handler passed to FilterPanel to update visible columns
  const handleVisibleColumnsChange = (next) => {
    if (typeof next === "function") {
      // allow functional updates
      setVisibleColumns(next);
    } else {
      setVisibleColumns((prev) => ({ ...prev, ...next }));
    }
  };

  // Load user info from localStorage
  useEffect(() => {
    setUserTeam(localStorage.getItem("userTeam") || "");
    setUserRole(localStorage.getItem("userRole") || "user");
    setUserEmail(localStorage.getItem("userEmail") || "");
    setUserName(localStorage.getItem("userName") || "");
  }, []);

  // Load user info và HR data
  useEffect(() => {
    const loadUserAndHRData = async () => {
      try {
        setHrLoading(true);

        // Load user info từ localStorage
        const userTeam = localStorage.getItem("userTeam") || "";
        const userRole = localStorage.getItem("userRole") || "user";
        const userEmail = localStorage.getItem("userEmail") || "";
        const username = localStorage.getItem("username") || "";

        setUserTeam(userTeam);
        setUserRole(userRole);
        setUserEmail(userEmail);
        setUserName(username);

        // Fetch HR data để lấy thông tin đầy đủ
        const response = await fetch(
          "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Nh%C3%A2n_s%E1%BB%B1.json"
        );
        if (response.ok) {
          const hrData = await response.json();
          setHrData(hrData);

          // Tìm thông tin đầy đủ của user từ HR data
          if (userEmail) {
            const userInfo = hrData.find(
              (hr) =>
                hr.email && hr.email.toLowerCase() === userEmail.toLowerCase()
            );
            if (userInfo && userInfo["Họ Và Tên"]) {
              setUserName(userInfo["Họ Và Tên"]);
            }
          }
        }
      } catch (error) {
        console.error("Error loading HR data:", error);
      } finally {
        setHrLoading(false);
      }
    };

    loadUserAndHRData();
  }, []);

  // Hàm chuẩn hóa tên để so sánh - SỬA LẠI
  const normalizeName = (name) => {
    if (!name) return "";
    return name
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/\s+/g, " ") // Normalize spaces
      .replace(/\s+\d+$/, ""); // Remove trailing numbers like "2", "3", etc.
  };

  // Hàm kiểm tra tên có khớp không - SỬA LẠI
  const isNameMatch = (name1, name2) => {
    if (!name1 || !name2) return false;

    const normalized1 = normalizeName(name1);
    const normalized2 = normalizeName(name2);

    // Chỉ khớp khi chuẩn hóa hoàn toàn giống nhau
    return normalized1 === normalized2;
  };

  // Hàm mới: kiểm tra xem tên có phải là biến thể số của nhau không
  const isNumberedVariant = (name1, name2) => {
    if (!name1 || !name2) return false;

    const base1 = name1.replace(/\s+\d+$/, "").trim();
    const base2 = name2.replace(/\s+\d+$/, "").trim();

    return base1 === base2 && name1 !== name2;
  };

  // Hàm lấy danh sách thành viên trong team (cho leader)
  const getTeamMembers = useMemo(() => {
    if (userRole !== "leader" || !userTeam) return [];

    return hrData
      .filter((hr) => {
        const team = hr["Team"] || hr["Team Sale_mar"] || "";
        return team.toLowerCase() === userTeam.toLowerCase();
      })
      .map((hr) => hr["Họ Và Tên"])
      .filter((name) => name && name.trim() !== "");
  }, [hrData, userRole, userTeam]);

  // Update available filters when data changes
  useEffect(() => {
    setAvailableFilters((prev) => ({
      ...prev,
      products: products,
      markets: markets,
      teams: teams,
      shifts: shifts,
    }));
  }, [products, markets, teams, shifts]);

  const handleFilterChange = (filterType, value) => {
    setFilters((prev) => {
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

  // Format date for filter (YYYY-MM-DD) without timezone issues
  const formatDateForFilter = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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
        const lastWeekMonday = new Date(today);
        const daysToSubtract = ((today.getDay() + 6) % 7) + 7;
        lastWeekMonday.setDate(today.getDate() - daysToSubtract);

        const lastWeekEnd = new Date(lastWeekMonday);
        lastWeekEnd.setDate(lastWeekMonday.getDate() + 6);

        startDate = lastWeekMonday;
        endDate = lastWeekEnd;
        break;
      }
      case "this-week": {
        const thisWeekMonday = new Date(today);
        const daysToSubtract = (today.getDay() + 6) % 7;
        thisWeekMonday.setDate(today.getDate() - daysToSubtract);

        const thisWeekEnd = new Date(thisWeekMonday);
        thisWeekEnd.setDate(thisWeekMonday.getDate() + 6);

        startDate = thisWeekMonday;
        endDate = thisWeekEnd;
        break;
      }
      case "next-week": {
        const nextWeekMonday = new Date(today);
        let daysToAdd = (8 - today.getDay()) % 7;
        if (daysToAdd === 0) daysToAdd = 7;
        nextWeekMonday.setDate(today.getDate() + daysToAdd);

        const nextWeekEnd = new Date(nextWeekMonday);
        nextWeekEnd.setDate(nextWeekMonday.getDate() + 6);

        startDate = nextWeekMonday;
        endDate = nextWeekEnd;
        break;
      }
      case "this-month":
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      default:
        if (value.startsWith("month-")) {
          const month = parseInt(value.split("-")[1]) - 1;
          startDate = new Date(today.getFullYear(), month, 1);
          endDate = new Date(today.getFullYear(), month + 1, 0);
        } else if (value.startsWith("q")) {
          const quarter = parseInt(value.slice(1));
          const quarterStartMonth = (quarter - 1) * 3;
          startDate = new Date(today.getFullYear(), quarterStartMonth, 1);
          endDate = new Date(today.getFullYear(), quarterStartMonth + 3, 0);
        }
        break;
    }

    setFilters((prev) => ({
      ...prev,
      startDate: formatDateForFilter(startDate),
      endDate: formatDateForFilter(endDate),
    }));
  };

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
  };

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

  // Fetch Firebase data
  const fetchFirebaseData = async () => {
    try {
      setLoading(true);

      const F3_URL =
        "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3.json";
      const API_URL =
        "https://n-api-gamma.vercel.app/report/generate?tableName=Báo cáo MKT";

      // Fetch both data sources in parallel
      const [f3Response, apiResponse] = await Promise.all([
        fetch(F3_URL),
        fetch(API_URL),
      ]);

      let f3Data = [];
      let cpqcByMarketing = {};
      let cpqcSourceRows = [];
      let mktTeamByName = {};

      // Process F3 data
      try {
        if (!f3Response.ok) {
          console.error(`F3 API Error ${f3Response.status}: ${f3Response.statusText}`);
          f3Data = [];
        } else {
          f3Data = await f3Response.json();
        }

        // Normalize F3 data: Firebase may return an object keyed by id instead of an array.
        if (!f3Data) {
          f3Data = [];
        } else if (!Array.isArray(f3Data) && typeof f3Data === "object") {
          f3Data = Object.values(f3Data);
        }
      } catch (f3Error) {
        console.warn("Error fetching F3 data:", f3Error);
      }

      // Process API data for CPQC - SỬA LẠI: không đọc response ở đây nữa
      let apiData = null;
      try {
        // Check if response is OK before parsing JSON
        if (!apiResponse.ok) {
          const errorText = await apiResponse.text();
          console.error(`API Error ${apiResponse.status}: ${apiResponse.statusText}`, errorText);
          // Don't throw, just log and continue without API data
          console.warn('Continuing without API data due to server error');
        } else {
          apiData = await apiResponse.json(); // CHỈ ĐỌC 1 LẦN
        }

        // Build CPQC map from API data
        if (apiData && apiData.success) {
          const dataArray = apiData.data || [];
          const employeeDataArray = apiData.employeeData || [];

          // XỬ LÝ DATA ARRAY CHO CPQC VÀ TEAM
          dataArray.forEach((row, index) => {
            if (!row || typeof row !== "object") return;

            const nameRaw = row["Tên"] || "";
            const marketingName = String(nameRaw).trim();
            const cpqcValue = Number(row["CPQC"] ?? 0) || 0;
            const ngayStr = row["Ngày"] || "";
            const ngay = ngayStr ? new Date(ngayStr) : null;
            const teamRaw = row["Team"] || "";

            // Xử lý CPQC
            if (marketingName && cpqcValue > 0) {
              cpqcByMarketing[marketingName] =
                (cpqcByMarketing[marketingName] || 0) + cpqcValue;
              cpqcSourceRows.push({
                ten: marketingName,
                ngay,
                cpqc: cpqcValue,
              });
            }

            // Xử lý TEAM từ data array
            if (marketingName && teamRaw) {
              const teamName = String(teamRaw).trim();
              if (teamName && teamName !== "N/A" && teamName !== "") {
                mktTeamByName[marketingName] = teamName;
                mktTeamByName[normalizeName(marketingName)] = teamName;
              }
            }
          });

          // XỬ LÝ EMPLOYEE DATA ARRAY CHO TEAM (bổ sung)
          employeeDataArray.forEach((row, index) => {
            if (!row || typeof row !== "object") return;

            const nameRaw = row["Họ Và Tên"] || "";
            const teamRaw = row["Team"] || "";
            const marketingName = String(nameRaw).trim();
            const teamName = String(teamRaw).trim();

            if (
              marketingName &&
              teamName &&
              teamName !== "N/A" &&
              teamName !== ""
            ) {
              // Ưu tiên giữ nguyên nếu đã có từ data array, nếu không thì thêm mới
              if (!mktTeamByName[marketingName]) {
                mktTeamByName[marketingName] = teamName;
              }
              if (!mktTeamByName[normalizeName(marketingName)]) {
                mktTeamByName[normalizeName(marketingName)] = teamName;
              }
            }
          });
        }
      } catch (apiError) {
        console.warn("Error processing API data:", apiError);
      }

      // Process F3 data into masterData với team từ API
      const processedData = Array.isArray(f3Data)
        ? f3Data
            .filter((o) => o && o["Nhân viên Marketing"])
            .map((order) => {
              const marketing = String(order["Nhân viên Marketing"]).trim();

              // Ưu tiên team từ API MKT report, fallback to F3 Team
              let team = "Khác";
              let source = "F3";

              // Thử lấy team từ API mapping
              if (mktTeamByName[marketing]) {
                team = mktTeamByName[marketing];
                source = "API-original";
              } else if (mktTeamByName[normalizeName(marketing)]) {
                team = mktTeamByName[normalizeName(marketing)];
                source = "API-normalized";
              } else if (order["Team"]) {
                team = String(order["Team"]).trim();
                source = "F3";
              }

              const ngayLenDonRaw = order["Ngày lên đơn"];
              const ngay = ngayLenDonRaw ? new Date(ngayLenDonRaw) : new Date();
              const sanPham = order["Mặt hàng"] || "N/A";
              const thiTruong = order["Khu vực"] || "N/A";
              const ketQuaCheck = order["Kết quả Check"] || "";
              const maTracking = String(order["Mã Tracking"] || "").trim();
              const tongTien = Number(order["Tổng tiền VNĐ"]) || 0;
              const phiShip = Number(order["Phí ship"]) || 0;
              const doiSoatRaw = order["Tiền Việt đã đối soát"];
              const tienVietDoiSoat =
                typeof doiSoatRaw === "number"
                  ? doiSoatRaw
                  : Number(doiSoatRaw) || 0;

              // Phân loại đơn
              const isHuy = ketQuaCheck === "Huỷ";
              const isDi = maTracking !== "";
              const isThanhCong = ketQuaCheck === "OK" && isDi;

              // Calculate metrics following HTML logic
              const soDonThucTe = 1;
              const dsChotThucTe = tongTien;
              const soDonHuyThucTe = isHuy ? 1 : 0;
              const dsHoanHuyThucTe = isHuy ? tongTien : 0;
              const dsSauHoanHuyThucTe = isHuy ? 0 : tongTien;
              const dsThanhCongThucTe = isThanhCong ? tongTien : 0;
              const soDonThanhCongThucTe = isThanhCong ? 1 : 0;
              const soDonThuTienThucTe = tienVietDoiSoat > 0 ? 1 : 0;
              const dThuThanhCongThucTe = tienVietDoiSoat;

              return {
                ten: marketing,
                team,
                ngay,
                sanPham,
                thiTruong,
                ca: order["Ca"] || "N/A",
                isHuy: isHuy,
                // Legacy fields for compatibility
                dsChot: tongTien,
                ship: phiShip,
                cpqc: 0, // Will be set from CPQC map
                soDon: 1,
                soDonHuy: soDonHuyThucTe,
                doanhSoHuy: dsHoanHuyThucTe,
                dsSauHoanHuy: dsSauHoanHuyThucTe,
                dsThanhCong: dsThanhCongThucTe,
                soDonThanhCong: soDonThanhCongThucTe,
                soDonThuTien: soDonThuTienThucTe,
                dThuThanhCong: dThuThanhCongThucTe,
                // New detailed fields matching HTML logic
                soDonThucTe,
                dsChotThucTe,
                soDonHuyThucTe,
                dsHoanHuyThucTe,
                dsSauHoanHuyThucTe,
                dsThanhCongThucTe,
                soDonThuTienThucTe,
                dThuThanhCongThucTe,
              };
            })
        : [];

      setMasterData(processedData);
      setCpqcByMarketing(cpqcByMarketing);
      setCpqcSourceRows(cpqcSourceRows);

      // THỐNG KÊ TEAM ASSIGNMENT
      const teamStats = processedData.reduce((acc, item) => {
        const marketing = item.ten;
        let source = "F3";
        if (mktTeamByName[marketing]) {
          source = "API-original";
        } else if (mktTeamByName[normalizeName(marketing)]) {
          source = "API-normalized";
        }
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {});
    } catch (err) {
      console.error("Error fetching Firebase data:", err);
      toast.error("Lỗi khi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  const fetchFilterData = async () => {
    try {
      const F3_URL =
        "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3.json";

      // CHỈ fetch F3, không fetch API lại
      const response = await fetch(F3_URL);
      let data = await response.json();

      // Firebase Realtime Database may return an object keyed by id instead of an array.
      // Normalize to an array so `forEach` works regardless of format.
      if (!data) {
        data = [];
      } else if (!Array.isArray(data) && typeof data === "object") {
        data = Object.values(data);
      }

      const productsSet = new Set();
      const marketsSet = new Set();
      const shiftsSet = new Set();

      // Chỉ lấy teams từ F3, teams từ API sẽ được xử lý trong fetchFirebaseData
      const teamsSet = new Set();

      data.forEach((item) => {
        if (item["Mặt hàng"]) productsSet.add(String(item["Mặt hàng"]).trim());
        if (item["Team"]) teamsSet.add(String(item["Team"]).trim());
        if (item["Khu vực"]) marketsSet.add(String(item["Khu vực"]).trim());
        if (item["Ca"]) shiftsSet.add(String(item["Ca"]).trim());
      });

      setProducts(Array.from(productsSet).sort());
      setTeams(Array.from(teamsSet).sort()); // Teams từ F3 (fallback)
      setMarkets(Array.from(marketsSet).sort());
      setShifts(Array.from(shiftsSet).sort());
    } catch (error) {
      console.error("Error fetching filter data:", error);
    }
  };

  useEffect(() => {
    fetchFirebaseData();
  }, []);

  useEffect(() => {
    fetchFilterData();
  }, []);

  // Filter data với phân quyền tối ưu
  const filteredData = useMemo(() => {
    let filtered = [...masterData];

    // Phân quyền dựa trên role
    if (userRole === "admin") {
      // Admin xem tất cả - không lọc
    } else if (userRole === "leader") {
      // Leader chỉ xem dữ liệu của team mình
      const teamMembers = getTeamMembers;
      if (teamMembers.length > 0) {
        filtered = filtered.filter((report) =>
          teamMembers.some((memberName) => isNameMatch(report.ten, memberName))
        );
      }
    } else if (userRole === "user") {
      // User chỉ xem dữ liệu của chính mình - CHÍNH XÁC HƠN
      filtered = filtered.filter((report) => {
        // So sánh chính xác tên, không dùng includes
        const reportName = report.ten?.trim() || "";
        const currentUserName = userName?.trim() || "";

        // Chỉ khớp khi tên hoàn toàn giống nhau sau khi chuẩn hóa
        return isNameMatch(reportName, currentUserName);
      });
    }

    // Áp dụng các filter khác (giữ nguyên)
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      filtered = filtered.filter(
        (report) => report.ten && report.ten.toLowerCase().includes(searchLower)
      );
    }

    // Date filter (only if enabled)
    if (enableDateFilter && (filters.startDate || filters.endDate)) {
      filtered = filtered.filter((report) => {
        if (!report.ngay) return false;
        const reportDate = new Date(report.ngay);

        if (filters.startDate) {
          const start = new Date(filters.startDate);
          start.setHours(0, 0, 0, 0);
          if (reportDate < start) return false;
        }

        if (filters.endDate) {
          const end = new Date(filters.endDate);
          end.setHours(23, 59, 59, 999);
          if (reportDate > end) return false;
        }

        return true;
      });
    }

    if (filters.products && filters.products.length > 0) {
      filtered = filtered.filter((report) =>
        filters.products.includes(report.sanPham)
      );
    }

    if (filters.shifts && filters.shifts.length > 0) {
      filtered = filtered.filter((report) =>
        filters.shifts.includes(report.ca)
      );
    }

    if (filters.markets && filters.markets.length > 0) {
      filtered = filtered.filter((report) =>
        filters.markets.includes(report.thiTruong)
      );
    }

    if (filters.teams && filters.teams.length > 0) {
      filtered = filtered.filter((report) =>
        filters.teams.includes(report.team)
      );
    }

    return filtered;
  }, [masterData, filters, userRole, userName, getTeamMembers, enableDateFilter]);

  // Generate KPI table data với phân quyền tối ưu
  const kpiData = useMemo(() => {
    // Lọc CPQC theo phân quyền
    let filteredCpqcByMarketing = { ...cpqcByMarketing };
    let filteredCpqcSourceRows = [...cpqcSourceRows];

    // Phân quyền cho CPQC data - SỬA LẠI
    if (userRole === "leader") {
      const teamMembers = getTeamMembers;
      if (teamMembers.length > 0) {
        filteredCpqcByMarketing = {};
        filteredCpqcSourceRows = cpqcSourceRows.filter((row) => {
          const isInTeam = teamMembers.some((memberName) =>
            isNameMatch(row.ten, memberName)
          );
          if (isInTeam && row.ten) {
            filteredCpqcByMarketing[row.ten] =
              (filteredCpqcByMarketing[row.ten] || 0) + row.cpqc;
          }
          return isInTeam;
        });
      }
    } else if (userRole === "user") {
      // SỬA LẠI: chỉ lấy đúng tên của user hiện tại
      filteredCpqcByMarketing = {};
      filteredCpqcSourceRows = cpqcSourceRows.filter((row) => {
        const isOwnData = isNameMatch(row.ten, userName);
        if (isOwnData && row.ten) {
          filteredCpqcByMarketing[row.ten] =
            (filteredCpqcByMarketing[row.ten] || 0) + row.cpqc;
        }
        return isOwnData;
      });
    }

    // Tính CPQC theo khoảng ngày đang lọc
    try {
      const startDateVal = filters.startDate;
      const endDateVal = filters.endDate;
      const rows = filteredCpqcSourceRows;

      if (rows.length && startDateVal && endDateVal) {
        const s = new Date(startDateVal);
        s.setHours(0, 0, 0, 0);
        const e = new Date(endDateVal);
        e.setHours(23, 59, 59, 999);
        const map = {};

        rows.forEach((r) => {
          if (!r || !r.ngay) {
            if (r && r.ten && r.cpqc) {
              map[r.ten] = (map[r.ten] || 0) + (Number(r.cpqc) || 0);
            }
            return;
          }
          const d = new Date(r.ngay);
          if (isNaN(d.getTime())) {
            console.warn("Invalid date in CPQC record:", r.ngay, r);
            return;
          }
          if (d >= s && d <= e) {
            map[r.ten] = (map[r.ten] || 0) + (Number(r.cpqc) || 0);
          }
        });

        filteredCpqcByMarketing = map;
      }
    } catch (e) {
      console.warn("Không thể lọc CPQC theo ngày:", e);
    }

    const summary = {};
    const cpqcMap = filteredCpqcByMarketing || {};

    // Xử lý dữ liệu F3 - CHỈ LẤY TỪ FILTEREDDATA (F3)
    filteredData.forEach((r) => {
      const key = r.ten || "N/A";
      if (!summary[key]) {
        summary[key] = {
          name: r.ten,
          team: r.team,
          cpqc: cpqcMap[key] || 0, // Vẫn lấy CPQC từ API nếu có
          soDonChot: 0,
          dsChot: 0,
          soDonHuy: 0,
          dsHuy: 0,
          soDonSauHuy: 0,
          dsSauHuy: 0,
          soDonDi: 0,
          dsDi: 0,
          soDonThuTien: 0,
          dThuThanhCong: 0,
          ship: 0,
          dThuTinhKpi: 0,
        };
      }
      const S = summary[key];

      // Tính toán các metrics...
      const soDonThucTe = Number(r.soDonThucTe) || 0;
      const dsChotBase = Number(r.dsChotThucTe) || Number(r.dsChot) || 0;
      const dsHuyVal = Number(r.dsHoanHuyThucTe) || 0;
      const soDonHuyThucTe = Number(r.soDonHuyThucTe) || 0;

      S.soDonChot += soDonThucTe;
      S.dsChot += dsChotBase;
      S.soDonHuy += soDonHuyThucTe;
      S.dsHuy += dsHuyVal;
      S.soDonSauHuy += Math.max(0, soDonThucTe - soDonHuyThucTe);
      S.soDonDi += r.soDonThanhCongThucTe || 0;
      S.dsDi += r.dsThanhCongThucTe || r.dsThanhCong || 0;
      S.soDonThuTien += r.soDonThuTienThucTe || 0;
      S.dThuThanhCong += r.dThuThanhCongThucTe || 0;
      if (!r.isHuy) {
        S.ship += r.ship || 0;
      }
    });

    // Tính DS sau hủy và DThu tính KPI
    const result = Object.values(summary).map((s) => {
      s.dsSauHuy = Math.max(0, s.dsChot - s.dsHuy);
      s.dThuTinhKpi = (s.dsSauHuy || 0) - (s.ship || 0);
      return s;
    });

    return result;
  }, [
    filteredData,
    cpqcByMarketing,
    cpqcSourceRows,
    filters.startDate,
    filters.endDate,
    userRole,
    userName,
    getTeamMembers,
  ]);

  // Calculate totals with percentages
  const totals = useMemo(() => {
    const total = kpiData.reduce(
      (acc, item) => {
        acc.cpqc += item.cpqc || 0;
        acc.soDonChot += item.soDonChot || 0;
        acc.dsChot += item.dsChot || 0;
        acc.soDonHuy += item.soDonHuy || 0;
        acc.dsHuy += item.dsHuy || 0;
        acc.soDonSauHuy += item.soDonSauHuy || 0;
        acc.dsSauHuy += item.dsSauHuy || 0;
        acc.soDonDi += item.soDonDi || 0;
        acc.dsDi += item.dsDi || 0;
        acc.soDonThuTien += item.soDonThuTien || 0;
        acc.dThuThanhCong += item.dThuThanhCong || 0;
        acc.ship += item.ship || 0;
        acc.dThuTinhKpi += item.dThuTinhKpi || 0;
        return acc;
      },
      {
        cpqc: 0,
        soDonChot: 0,
        dsChot: 0,
        soDonHuy: 0,
        dsHuy: 0,
        soDonSauHuy: 0,
        dsSauHuy: 0,
        soDonDi: 0,
        dsDi: 0,
        soDonThuTien: 0,
        dThuThanhCong: 0,
        ship: 0,
        dThuTinhKpi: 0,
      }
    );

    // Calculate percentages
    total.tyLeThuTien = total.dsDi > 0 ? total.dThuThanhCong / total.dsDi : 0;
    total.cpds = total.dsSauHuy > 0 ? total.cpqc / total.dsSauHuy : 0;

    return total;
  }, [kpiData]);

  // Format functions
  const formatCurrency = (value) => {
    return Number(value || 0).toLocaleString("vi-VN", {
      style: "currency",
      currency: "VND",
    });
  };

  const formatNumber = (value) => {
    return Number(value || 0).toLocaleString("vi-VN");
  };

  const formatPercent = (value) => {
    if (!isFinite(value)) return "0.00%";
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
  };

  if (loading || hrLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Đang tải báo cáo Hiệu suất KPI...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto px-8 py-8 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          to="/"
          className="text-sm text-gray-600 hover:text-gray-800 flex-shrink-0 flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Quay lại
        </Link>
        <h2 className="text-2xl font-bold text-primary uppercase text-center flex-1">
          Báo cáo hiệu suất KPI
        </h2>
        <button
          onClick={fetchFirebaseData}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-green-700 transition flex-shrink-0 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <input
            type="text"
            value={filters.searchText || ""}
            onChange={(e) => handleFilterChange("searchText", e.target.value)}
            placeholder="Tìm kiếm tên marketing..."
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm transition-all"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* FilterPanel */}
      <div className="flex items-center justify-between mb-4">
        <FilterPanel
          activeTab="kpi"
          filters={filters}
          handleFilterChange={handleFilterChange}
          quickSelectValue={quickSelectValue}
          handleQuickDateSelect={handleQuickDateSelect}
          availableFilters={availableFilters}
          userRole={userRole}
          hasActiveFilters={hasActiveFilters}
          clearAllFilters={clearAllFilters}
          variant="topbar"
          columnsConfig={columnsConfig}
          visibleColumns={visibleColumns}
          onVisibleColumnsChange={handleVisibleColumnsChange}
          enableDateFilter={enableDateFilter}
          onEnableDateFilterChange={setEnableDateFilter}
        />
        <button
          onClick={() => setShowColumnSettings(true)}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2 ml-4"
        >
          <Settings className="w-4 h-4" />
          Cài đặt cột
        </button>
      </div>

      {/* Bảng và nội dung liên quan - Có background và border */}
      <div className="bg-white rounded-lg shadow-md border border-gray-300 overflow-hidden mt-6">
        {kpiData.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">Chưa có dữ liệu KPI</p>
            <p className="text-gray-400 text-sm mt-2">
              Hãy kiểm tra dữ liệu từ Firebase
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-gray-600 px-6 pt-4">
              Hiển thị:{" "}
              <span className="font-semibold text-primary">
                {kpiData.length}
              </span>{" "}
              marketing
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
                <thead className="bg-secondary">
                  <tr>
                    <th
                      rowSpan="2"
                      className="px-1.5 py-1.5 text-center text-xs font-semibold text-white uppercase tracking-wider border border-gray-400 whitespace-nowrap"
                    >
                      STT
                    </th>
                    <th
                      rowSpan="2"
                      className="px-1.5 py-1.5 text-center text-xs font-semibold text-white uppercase tracking-wider border border-gray-400 whitespace-nowrap"
                    >
                      Team
                    </th>
                    <th
                      rowSpan="2"
                      className="px-1.5 py-1.5 text-center text-xs font-semibold text-white uppercase tracking-wider border border-gray-400 whitespace-nowrap"
                    >
                      Marketing
                    </th>
                    {visibleColumns.cpqc && (
                      <th
                        rowSpan="2"
                        className="px-1.5 py-1.5 text-center text-xs font-semibold text-white uppercase tracking-wider border border-gray-400 whitespace-nowrap"
                      >
                        CPQC
                      </th>
                    )}
                    {visibleColumns.chot && (
                      <th
                        colSpan="2"
                        className="px-1.5 py-1.5 text-center text-xs font-semibold text-white uppercase tracking-wider border border-gray-400 whitespace-nowrap"
                      >
                        Số đơn và DS chốt
                      </th>
                    )}
                    {visibleColumns.huy && (
                      <th
                        colSpan="2"
                        className="px-1.5 py-1.5 text-center text-xs font-semibold text-white tracking-wider border border-gray-400 whitespace-nowrap"
                      >
                        Số đơn và DS hủy
                      </th>
                    )}
                    {visibleColumns.sauHuy && (
                      <th
                        colSpan="2"
                        className="px-1.5 py-1.5 text-center text-xs font-semibold text-white tracking-wider border border-gray-400 whitespace-nowrap"
                      >
                        Số đơn và DS sau hủy
                      </th>
                    )}
                    {visibleColumns.di && (
                      <th
                        colSpan="2"
                        className="px-1.5 py-1.5 text-center text-xs font-semibold text-white tracking-wider border border-gray-400 whitespace-nowrap"
                      >
                        Số đơn và DS đi
                      </th>
                    )}
                    {visibleColumns.thuTien && (
                      <th
                        colSpan="2"
                        className="px-1.5 py-1.5 bg-yellow-500 text-center text-xs font-semibold text-black tracking-wider border border-gray-400 whitespace-nowrap"
                      >
                        Số đơn và DThu thành công
                      </th>
                    )}
                    {visibleColumns.ship && (
                      <th
                        rowSpan="2"
                        className="px-1.5 py-1.5 text-center text-xs font-semibold text-white tracking-wider border border-gray-400 whitespace-nowrap"
                      >
                        Ship
                      </th>
                    )}
                    {visibleColumns.dThuKpi && (
                      <th
                        rowSpan="2"
                        className="px-1.5 py-1.5 bg-yellow-500 text-black text-center text-xs font-semibold tracking-wider border border-gray-400 whitespace-nowrap"
                      >
                        DThu tính KPI
                      </th>
                    )}
                    {visibleColumns.tyLeThuTien && (
                      <th
                        rowSpan="2"
                        className="px-1.5 py-1.5 bg-yellow-500 text-black text-center text-xs font-semibold tracking-wider border border-gray-400 whitespace-nowrap"
                      >
                        Tỷ lệ thu tiền
                      </th>
                    )}
                    {visibleColumns.tyLeDatKpi && (
                      <th
                        rowSpan="2"
                        className="px-1.5 py-1.5 bg-yellow-500 text-black text-center text-xs font-semibold tracking-wider border border-gray-400 whitespace-nowrap"
                      >
                        Tỷ lệ đạt KPI
                      </th>
                    )}
                    {visibleColumns.cpds && (
                      <th
                        rowSpan="2"
                        className="px-1.5 py-1.5 bg-yellow-500 text-black text-center text-xs font-semibold tracking-wider border border-gray-400 whitespace-nowrap"
                      >
                        %CP/DS
                      </th>
                    )}
                  </tr>
                  <tr className="bg-secondary text-white">
                    {visibleColumns.chot && (
                      <>
                        <th className="px-1.5 py-1.5 text-center text-xs font-semibold tracking-wider border border-gray-400 whitespace-nowrap">
                          Số đơn
                        </th>
                        <th className="px-1.5 py-1.5 text-center text-xs font-semibold tracking-wider border border-gray-400 whitespace-nowrap">
                          DS chốt
                        </th>
                      </>
                    )}
                    {visibleColumns.huy && (
                      <>
                        <th className="px-1.5 py-1.5 text-center text-xs font-semibold tracking-wider border border-gray-400 whitespace-nowrap">
                          Số đơn
                        </th>
                        <th className="px-1.5 py-1.5 text-center text-xs font-semibold tracking-wider border border-gray-400 whitespace-nowrap">
                          DS hủy
                        </th>
                      </>
                    )}
                    {visibleColumns.sauHuy && (
                      <>
                        <th className="px-1.5 py-1.5 text-center text-xs font-semibold tracking-wider border border-gray-400 whitespace-nowrap">
                          Số đơn
                        </th>
                        <th className="px-1.5 py-1.5 text-center text-xs font-semibold tracking-wider border border-gray-400 whitespace-nowrap">
                          DS sau hủy
                        </th>
                      </>
                    )}
                    {visibleColumns.di && (
                      <>
                        <th className="px-1.5 py-1.5 text-center text-xs font-semibold tracking-wider border border-gray-400 whitespace-nowrap">
                          Số đơn
                        </th>
                        <th className="px-1.5 py-1.5 text-center text-xs font-semibold tracking-wider border border-gray-400 whitespace-nowrap">
                          DS đi
                        </th>
                      </>
                    )}
                    {visibleColumns.thuTien && (
                      <>
                        <th className="px-1.5 py-1.5 bg-yellow-500 text-black text-center text-xs font-semibold tracking-wider border border-gray-400 whitespace-nowrap">
                          Số đơn
                        </th>
                        <th className="px-1.5 py-1.5 bg-yellow-500 text-black text-center text-xs font-semibold tracking-wider border border-gray-400 whitespace-nowrap">
                          DThu TC
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {/* Total row */}
                  <tr className="bg-green-700 font-semibold border-b-4 border-yellow-500">
                    <td
                      colSpan="3"
                      className="px-1.5 py-2 text-left pl-5 text-xs font-bold text-white border border-gray-300"
                    >
                      TỔNG CỘNG
                    </td>
                    {visibleColumns.cpqc && (
                      <td className="px-1.5 py-2 whitespace-nowrap text-xs font-bold text-right text-white border border-gray-300">
                        {totals.cpqc.toLocaleString("vi-VN")} đ
                      </td>
                    )}
                    {visibleColumns.chot && (
                      <>
                        <td className="px-1.5 py-2 whitespace-nowrap text-xs font-bold text-center text-white border border-gray-300">
                          {totals.soDonChot.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-1.5 py-2 whitespace-nowrap text-xs font-bold text-right text-white border border-gray-300">
                          {totals.dsChot.toLocaleString("vi-VN")} đ
                        </td>
                      </>
                    )}
                    {visibleColumns.huy && (
                      <>
                        <td className="px-1.5 py-2 whitespace-nowrap text-xs font-bold text-center text-white border border-gray-300">
                          {totals.soDonHuy.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-1.5 py-2 whitespace-nowrap text-xs font-bold text-right text-white border border-gray-300">
                          {totals.dsHuy.toLocaleString("vi-VN")} đ
                        </td>
                      </>
                    )}
                    {visibleColumns.sauHuy && (
                      <>
                        <td className="px-1.5 py-2 whitespace-nowrap text-xs font-bold text-center text-white border border-gray-300">
                          {totals.soDonSauHuy.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-1.5 py-2 whitespace-nowrap text-xs font-bold text-right text-white border border-gray-300">
                          {totals.dsSauHuy.toLocaleString("vi-VN")} đ
                        </td>
                      </>
                    )}
                    {visibleColumns.di && (
                      <>
                        <td className="px-1.5 py-2 whitespace-nowrap text-xs font-bold text-center text-white border border-gray-300">
                          {totals.soDonDi.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-1.5 py-2 whitespace-nowrap text-xs font-bold text-right text-white border border-gray-300">
                          {totals.dsDi.toLocaleString("vi-VN")} đ
                        </td>
                      </>
                    )}
                    {visibleColumns.thuTien && (
                      <>
                        <td className="px-1.5 py-2 whitespace-nowrap text-xs font-bold text-center text-white border border-gray-300">
                          {totals.soDonThuTien.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-1.5 py-2 whitespace-nowrap text-xs font-bold text-right text-white border border-gray-300">
                          {totals.dThuThanhCong.toLocaleString("vi-VN")} đ
                        </td>
                      </>
                    )}
                    {visibleColumns.ship && (
                      <td className="px-1.5 py-2 whitespace-nowrap text-xs font-bold text-right text-white border border-gray-300">
                        {totals.ship.toLocaleString("vi-VN")} đ
                      </td>
                    )}
                    {visibleColumns.dThuKpi && (
                      <td className="px-1.5 py-2 whitespace-nowrap text-xs font-bold text-right text-white border border-gray-300">
                        {totals.dThuTinhKpi.toLocaleString("vi-VN")} đ
                      </td>
                    )}
                    {visibleColumns.tyLeThuTien && (
                      <td className="px-1.5 py-2 whitespace-nowrap text-xs font-bold text-right text-white border border-gray-300">
                        {((totals.tyLeThuTien || 0) * 100).toFixed(2)}%
                      </td>
                    )}
                    {visibleColumns.tyLeDatKpi && (
                      <td className="px-1.5 py-2 whitespace-nowrap text-xs font-medium border border-gray-300 text-center">
                        -
                      </td>
                    )}
                    {visibleColumns.cpds && (
                      <td className="px-1.5 py-2 whitespace-nowrap text-xs font-bold text-right text-white border border-gray-300">
                        {((totals.cpds || 0) * 100).toFixed(2)}%
                      </td>
                    )}
                  </tr>
                  {kpiData.map((item, index) => {
                    const tyLeThuTien =
                      item.dsDi > 0 ? item.dThuThanhCong / item.dsDi : 0;
                    const cpds =
                      item.dsSauHuy > 0 ? item.cpqc / item.dsSauHuy : 0;
                    return (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-gray-900 border border-gray-300">
                          {index + 1}
                        </td>
                        <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-gray-900 border border-gray-300">
                          {item.team}
                        </td>
                        <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-gray-900 border border-gray-300">
                          {item.name}
                        </td>
                        {visibleColumns.cpqc && (
                          <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-right text-gray-900 border border-gray-300">
                            {item.cpqc?.toLocaleString("vi-VN")}đ
                          </td>
                        )}
                        {visibleColumns.chot && (
                          <>
                            <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-center text-gray-900 border border-gray-300">
                              {item.soDonChot?.toLocaleString("vi-VN")}
                            </td>
                            <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-right text-gray-900 border border-gray-300">
                              {item.dsChot?.toLocaleString("vi-VN")}đ
                            </td>
                          </>
                        )}
                        {visibleColumns.huy && (
                          <>
                            <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-center text-gray-900 border border-gray-300">
                              {item.soDonHuy?.toLocaleString("vi-VN")}
                            </td>
                            <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-right text-gray-900 border border-gray-300">
                              {item.dsHuy?.toLocaleString("vi-VN")}đ
                            </td>
                          </>
                        )}
                        {visibleColumns.sauHuy && (
                          <>
                            <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-center text-gray-900 border border-gray-300">
                              {item.soDonSauHuy?.toLocaleString("vi-VN")}
                            </td>
                            <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-right text-gray-900 border border-gray-300">
                              {item.dsSauHuy?.toLocaleString("vi-VN")}đ
                            </td>
                          </>
                        )}
                        {visibleColumns.di && (
                          <>
                            <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-center text-gray-900 border border-gray-300">
                              {item.soDonDi?.toLocaleString("vi-VN")}
                            </td>
                            <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-right text-gray-900 border border-gray-300">
                              {item.dsDi?.toLocaleString("vi-VN")}đ
                            </td>
                          </>
                        )}
                        {visibleColumns.thuTien && (
                          <>
                            <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-center text-gray-900 border border-gray-300">
                              {item.soDonThuTien?.toLocaleString("vi-VN")}
                            </td>
                            <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-right text-gray-900 border border-gray-300">
                              {item.dThuThanhCong?.toLocaleString("vi-VN")}đ
                            </td>
                          </>
                        )}
                        {visibleColumns.ship && (
                          <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-right text-gray-900 border border-gray-300">
                            {item.ship?.toLocaleString("vi-VN")}đ
                          </td>
                        )}
                        {visibleColumns.dThuKpi && (
                          <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-right text-gray-900 border border-gray-300">
                            {item.dThuTinhKpi?.toLocaleString("vi-VN")}đ
                          </td>
                        )}
                        {visibleColumns.tyLeThuTien && (
                          <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-right text-gray-900 border border-gray-300">
                            {((tyLeThuTien || 0) * 100).toFixed(2)}%
                          </td>
                        )}
                        {visibleColumns.tyLeDatKpi && (
                          <td className="px-1.5 py-1.5 whitespace-nowrap text-xs font-medium border border-gray-300 text-center">
                            -
                          </td>
                        )}
                        {visibleColumns.cpds && (
                          <td
                            className={`px-1.5 py-1.5 whitespace-nowrap text-xs font-medium text-right text-gray-900 border border-gray-300 ${
                              cpds > 0.33 ? "bg-yellow-200" : ""
                            }`}
                          >
                            {((cpds || 0) * 100).toFixed(2)}%
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
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
