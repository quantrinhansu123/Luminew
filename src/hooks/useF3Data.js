import { useState, useEffect, useMemo } from "react";

export function useF3Data(filters, userRole, userEmail, userTeam = '') {
  const [f3Data, setF3Data] = useState([]);
  const [humanResources, setHumanResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch F3 data and human resources from Firebase
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch F3 data from direct URL
        const F3_URL = "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3.json";
        const f3Response = await fetch(F3_URL);
        const f3DataRaw = await f3Response.json();

        if (Array.isArray(f3DataRaw)) {
          const dataArray = f3DataRaw.map((item, index) => ({
            id: index.toString(),
            ...item,
          }));
          setF3Data(dataArray);
        } else {
          console.warn("⚠️ F3 data is not an array");
          setF3Data([]);
        }

        // Fetch human resources data from direct URL
        const HR_URL = "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Tài_khoản.json";
        const hrResponse = await fetch(HR_URL);
        const hrDataRaw = await hrResponse.json();

        if (Array.isArray(hrDataRaw)) {
          const hrArray = hrDataRaw.map((item, index) => ({
            id: index.toString(),
            ...item,
          }));
          setHumanResources(hrArray);
        } else {
          console.warn("⚠️ Human resources data is not an array");
          setHumanResources([]);
        }
      } catch (err) {
        console.error("❌ Error fetching data:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filtered F3 data with memoization
  const filteredF3Data = useMemo(() => {
    let filtered = [...f3Data];

    // If the user's team explicitly contains 'vận đơn', treat them like a full-access role
    const hasVanDonTeam = String(userTeam || '').toLowerCase().includes('vận đơn');

    // Role-based access control
    if (userRole === "user") {
      // Regular user: only see their own data (match by name in NV Marketing or NV Sale)
      // Get user's name from human_resources
      const currentUser = humanResources.find(
        (hr) =>
          hr["email"]?.toLowerCase().trim() === userEmail.toLowerCase().trim()
      );

      if (currentUser) {
        const userName =
          currentUser["Tên nhân viên"] ||
          currentUser["Họ Và Tên"] ||
          currentUser["Name"] ||
          "";

        if (userName) {
          // Filter F3 data by user's name
          filtered = filtered.filter((item) => {
            const marketingStaff = item["Nhân viên Marketing"] || "";
            const salesStaff = item["Nhân viên Sale"] || "";

            // Match by full name or partial name
            const matchMarketing = marketingStaff
              .toLowerCase()
              .includes(userName.toLowerCase());
            const matchSales = salesStaff
              .toLowerCase()
              .includes(userName.toLowerCase());
            const matchEmailMarketing = marketingStaff
              .toLowerCase()
              .includes(userEmail.split("@")[0].toLowerCase());
            const matchEmailSales = salesStaff
              .toLowerCase()
              .includes(userEmail.split("@")[0].toLowerCase());

            return (
              matchMarketing ||
              matchSales ||
              matchEmailMarketing ||
              matchEmailSales
            );
          });
        } else {
          filtered = [];
        }
      } else {
        filtered = [];
      }
    } else if (userRole === "leader" && !hasVanDonTeam) {
      // Leader: see data from their team members
      // Find current user's team from human_resources
      const currentUser = humanResources.find(
        (hr) =>
          hr["email"]?.toLowerCase().trim() === userEmail.toLowerCase().trim()
      );

      if (currentUser && currentUser["Team"]) {
        const userTeam = currentUser["Team"];

        // Get all team members
        const teamMembers = humanResources
          .filter((hr) => hr["Team"] === userTeam)
          .map(
            (hr) =>
              hr["Tên nhân viên"] ||
              hr["Họ Và Tên"] ||
              hr["Name"] ||
              hr["Email"]
          );

        // Filter F3 data by team members
        filtered = filtered.filter((item) => {
          const marketingStaff = item["Nhân viên Marketing"] || "";
          const salesStaff = item["Nhân viên Sale"] || "";

          return teamMembers.some((member) =>
            marketingStaff.toLowerCase().includes(String(member || '').toLowerCase()) ||
            salesStaff.toLowerCase().includes(String(member || '').toLowerCase())
          );
        });
      } else {
        filtered = [];
      }
    } else if (
      userRole === "admin" ||
      userRole === "accountant" ||
      userRole === "kế toán" ||
      userRole === "vận đơn" ||
      hasVanDonTeam
    ) {
      // Admin and Accountant: see all data (no filtering needed)
      // filtered remains as is
    } else {
      // Unknown role: no access
      return [];
    }

    // Search text filter (tìm trong tên khách hàng, mã đơn, điện thoại, địa chỉ, NV Marketing, NV Sale)
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      filtered = filtered.filter((item) => {
        const searchFields = [
          item["Name*"],
          item["Tên lên đơn"],
          item["Mã đơn hàng"],
          item["Phone*"],
          item["Add"],
          item["City"],
          item["State"],
          item["Nhân viên Marketing"],
          item["Nhân viên Sale"],
        ];
        return searchFields.some(
          (field) => field && String(field).toLowerCase().includes(searchLower)
        );
      });
    }

    // Date filter - using 'Ngày lên đơn'
    if (filters.startDate || filters.endDate) {
      filtered = filtered.filter((item) => {
        const dateStr = item["Ngày lên đơn"];
        if (!dateStr) return true; // Keep records without dates

        try {
          // Try parsing as ISO date or Vietnamese format
          let itemDate;
          if (dateStr.includes("/")) {
            const parts = dateStr.split("/");
            if (parts.length !== 3) return true;
            itemDate = new Date(parts[2], parts[1] - 1, parts[0]);
          } else {
            itemDate = new Date(dateStr);
          }

          if (isNaN(itemDate.getTime())) return true;

          if (filters.startDate) {
            const start = new Date(filters.startDate);
            start.setHours(0, 0, 0, 0);
            if (itemDate < start) return false;
          }

          if (filters.endDate) {
            const end = new Date(filters.endDate);
            end.setHours(23, 59, 59, 999);
            if (itemDate > end) return false;
          }

          return true;
        } catch (e) {
          return true;
        }
      });
    }

    // Product filter - match with 'Mặt hàng' or 'Tên mặt hàng 1'
    if (filters.products && filters.products.length > 0) {
      filtered = filtered.filter((item) => {
        const product = item["Mặt hàng"] || item["Tên mặt hàng 1"];
        return filters.products.some((p) =>
          product && String(product).toLowerCase().includes(String(p || '').toLowerCase())
        );
      });
    }

    // Shift filter - match with 'Ca'
    if (filters.shifts && filters.shifts.length > 0) {
      filtered = filtered.filter((item) => filters.shifts.includes(item["Ca"]));
    }

    // Market filter - can be inferred from address or stored separately
    if (filters.markets && filters.markets.length > 0) {
      filtered = filtered.filter((item) => {
        const market = item["Thị trường"] || item["Market"];
        return filters.markets.some((m) =>
          market && String(market).toLowerCase().includes(String(m || '').toLowerCase())
        );
      });
    }

    // Team filter
    if (filters.teams && filters.teams.length > 0) {
      filtered = filtered.filter((item) =>
        filters.teams.includes(item["Team"])
      );
    }

    // Payment method filter (supports array of selected methods)
    if (Array.isArray(filters.paymentMethod) && filters.paymentMethod.length > 0) {
      const lowers = filters.paymentMethod.map((p) => String(p || '').toLowerCase());
      filtered = filtered.filter((item) => {
        const method = item['Hình thức thanh toán'] || item['Hình thức TT'] || '';
        const m = String(method).toLowerCase();
        return lowers.some((l) => m.includes(l));
      });
    } else if (filters.paymentMethod && typeof filters.paymentMethod === 'string') {
      // backward-compat: single-string filter
      const payLower = String(filters.paymentMethod).toLowerCase();
      filtered = filtered.filter((item) => {
        const method = item['Hình thức thanh toán'] || item['Hình thức TT'] || '';
        return String(method).toLowerCase().includes(payLower);
      });
    }

    return filtered;
  }, [f3Data, filters, userRole, userEmail, humanResources, userTeam]);

  return {
    f3Data: filteredF3Data,
    loading,
    error,
    totalRecords: f3Data.length,
  };
}
