import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
// Use REST calls to Firebase Realtime Database; avoid using the Firebase SDK here
import { ChevronLeft } from 'lucide-react';
import { toast } from "react-toastify";
import { logDataChange as logDataChangeService } from '../services/logging';
import { supabase } from '../supabase/config';

const getChangeTypeColor = (type) => {
  switch (type) {
    case 'status_change':
      return 'bg-blue-100 text-blue-800';
    case 'full_update':
      return 'bg-purple-100 text-purple-800';
    case 'SYNC_F3':
      return 'bg-indigo-100 text-indigo-800';
    case 'UPDATE':
      return 'bg-yellow-100 text-yellow-800';
    case 'INSERT':
      return 'bg-green-100 text-green-800';
    case 'reverted':
    case 'revert_status':
    case 'revert_full_update':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const renderValue = (val) => {
  if (val === null || val === undefined) return 'N/A';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

const formatChangeValue = (val) => renderValue(val);

const OrderDataView = ({ orderData, newValue }) => {
  if (!orderData) return null;
  // Combine keys from both objects
  const allKeys = new Set([...Object.keys(orderData), ...(newValue ? Object.keys(newValue) : [])]);

  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trường thông tin</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Giá trị cũ</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Giá trị mới</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {Array.from(allKeys).map(key => {
            const oldVal = orderData[key];
            const newVal = newValue ? newValue[key] : undefined;
            const isDiff = String(oldVal) !== String(newVal) && newVal !== undefined;

            // Skip internal fields if needed, or show all
            if (key === 'id' || key === 'timestamp') return null;

            return (
              <tr key={key} className={isDiff ? "bg-yellow-50" : "hover:bg-gray-50"}>
                <td className="px-4 py-2 text-sm font-medium text-gray-900">{key}</td>
                <td className="px-4 py-2 text-sm text-gray-500 break-words max-w-xs">{renderValue(oldVal)}</td>
                <td className="px-4 py-2 text-sm text-gray-900 break-words max-w-xs">
                  {newVal !== undefined ? (
                    <span className={isDiff ? "text-green-700 font-medium" : ""}>{renderValue(newVal)}</span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default function ChangeLogViewer() {
  const [changeLogs, setChangeLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);
  const [showConfirmRevert, setShowConfirmRevert] = useState(false);
  const [logToRevert, setLogToRevert] = useState(null);
  const [lastLogCount, setLastLogCount] = useState(0);
  const [fullOrderData, setFullOrderData] = useState(null);
  const [loadingFullOrder, setLoadingFullOrder] = useState(false);
  const [filters, setFilters] = useState({
    orderCode: "",
    userEmail: "",
    changeType: "",
    startDate: "",
    endDate: "",
  });

  // Get user info from localStorage
  const userRole = localStorage.getItem("userRole") || "user";
  const userEmail = localStorage.getItem("userEmail") || "";
  const userTeam = localStorage.getItem("userTeam") || "";

  // Human resources data for role-based filtering
  const [humanResources, setHumanResources] = useState([]);

  // Check if user can revert a specific log
  const canRevertThisLog = (log) => {
    if (userRole === "admin") return true;
    if (userRole === "leader") {
      // Leader can revert logs of their team members
      const userRecord = humanResources.find((hr) => hr && hr["email"] === userEmail);
      if (userRecord) {
        const leaderTeam = userRecord["Team"];
        const teamMemberEmails = humanResources
          .filter((hr) => hr && hr["Team"] === leaderTeam)
          .map((hr) => hr["email"]);
        return teamMemberEmails.includes(log.userEmail);
      }
      return false;
    }
    if (userRole === "user") {
      // User can only revert their own logs
      return log.userEmail === userEmail;
    }
    return false;
  };

  // Log change function
  const logChange = async (
    orderId,
    changeType,
    oldValue,
    newValue,
    orderData = null
  ) => {
    try {
      await logDataChangeService({
        action: changeType,
        table_name: 'F3', // Assuming Revert affects F3
        record_id: orderId,
        old_value: oldValue,
        new_value: newValue,
        user_email: userEmail,
        details: {
          userRole,
          orderCode: orderData ? (orderData["Mã đơn hàng"] || orderData.orderCode) : null,
          customerName: orderData
            ? orderData["Name*"] || orderData["Tên lên đơn"] || orderData.customerName
            : null,
          reverted: false
        }
      });
    } catch (error) {
      console.error("Error logging change:", error);
    }
  };

  useEffect(() => {
    const fetchChangeLogs = async () => {
      try {
        const { data, error } = await supabase
          .from('change_logs')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        if (data) {
          const logsArray = data.map((log) => ({
            id: log.id,
            orderId: log.record_id,
            changeType: log.action,
            oldValue: log.old_value,
            newValue: log.new_value,
            userEmail: log.user_email,
            userRole: log.details?.userRole || 'unknown',
            timestamp: new Date(log.created_at),
            orderCode: log.details?.orderCode || '',
            customerName: log.details?.customerName || '',
            reverted: log.details?.reverted || false,
            // Keep original log object properties mapped if needed
            details: log.details, // Explicitly keep details
            ...log.details
          }));

          setChangeLogs(logsArray);
          setLastLogCount(logsArray.length);
        } else {
          setChangeLogs([]);
          setLastLogCount(0);
        }
      } catch (error) {
        console.error("Error fetching change logs:", error);
        toast.error("Lỗi Supabase: " + (error.message || JSON.stringify(error)), {
          position: "top-right",
          autoClose: 10000, // Longer duration to read
        });
      } finally {
        setLoading(false);
      }
    };

    fetchChangeLogs();
  }, []);

  // Fetch human resources data for role-based filtering
  useEffect(() => {
    const fetchHRData = async () => {
      try {
        const response = await fetch(
          "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Nh%C3%A2n_s%E1%BB%B1.json"
        );
        if (!response.ok) {
          throw new Error("Failed to fetch HR data");
        }
        const hrData = await response.json();
        setHumanResources(Array.isArray(hrData) ? hrData : []);
      } catch (error) {
        console.error("Error fetching HR data:", error);
        // Don't show error toast for HR data, as it's not critical for basic functionality
      }
    };

    fetchHRData();
  }, []);

  // Base filtered logs with role-based access control
  const baseFilteredLogs = useMemo(() => {
    console.log("Filtering logs for user:", { userRole, userEmail, userTeam });
    console.log("Human resources loaded:", humanResources.length, "records");

    if (userRole === "admin") {
      console.log("Admin user - showing all logs");
      return changeLogs;
    } else if (userRole === "leader") {
      console.log("Leader user - filtering by team");
      console.log("Looking for userEmail:", userEmail);
      console.log(
        "Sample HR emails:",
        humanResources.slice(0, 5).map((hr) => hr["email"])
      );

      const userRecord = humanResources.find((hr) => hr && hr["email"] === userEmail);
      console.log("User record found:", userRecord);

      if (userRecord) {
        const leaderTeam = userRecord["Team"];
        console.log("Leader team:", leaderTeam);

        const teamMemberEmails = humanResources
          .filter((hr) => hr && hr["Team"] === leaderTeam)
          .map((hr) => hr["email"]);
        console.log(
          "Team members found:",
          humanResources.filter((hr) => hr["Team"] === leaderTeam).length
        );
        console.log(
          "Sample team member records:",
          humanResources
            .filter((hr) => hr["Team"] === leaderTeam)
            .slice(0, 3)
            .map((hr) => ({ name: hr["Họ Và Tên"], email: hr["email"] }))
        );
        console.log("Team member emails:", teamMemberEmails);

        const filtered = changeLogs.filter((log) =>
          teamMemberEmails.includes(log.userEmail)
        );
        console.log(
          "Filtered logs for leader:",
          filtered.length,
          "out of",
          changeLogs.length
        );
        return filtered;
      } else {
        console.log("No user record found for leader - showing no logs");
        return [];
      }
    } else if (userRole === "user") {
      console.log("User role - showing only own logs");
      const filtered = changeLogs.filter((log) => log.userEmail === userEmail);
      console.log(
        "Filtered logs for user:",
        filtered.length,
        "out of",
        changeLogs.length
      );
      return filtered;
    } else {
      console.log("Unknown role - showing no logs");
      return [];
    }
  }, [changeLogs, userRole, userEmail, humanResources]);

  // Filter logs based on current filters
  const filteredLogs = useMemo(() => {
    return baseFilteredLogs.filter((log) => {
      const matchesOrderCode =
        !filters.orderCode ||
        (log.orderCode &&
          log.orderCode
            .toLowerCase()
            .includes(filters.orderCode.toLowerCase()));

      const matchesUserEmail =
        !filters.userEmail ||
        (log.userEmail &&
          log.userEmail
            .toLowerCase()
            .includes(filters.userEmail.toLowerCase()));

      const matchesChangeType =
        !filters.changeType ||
        (filters.changeType === "reverted"
          ? Boolean(log.reverted)
          : log.changeType === filters.changeType);

      const matchesDateRange =
        (!filters.startDate || log.timestamp >= new Date(filters.startDate)) &&
        (!filters.endDate ||
          log.timestamp <= new Date(filters.endDate + "T23:59:59"));

      return (
        matchesOrderCode &&
        matchesUserEmail &&
        matchesChangeType &&
        matchesDateRange
      );
    });
  }, [baseFilteredLogs, filters]);

  const clearFilters = () => {
    setFilters({
      orderCode: "",
      userEmail: "",
      changeType: "",
      startDate: "",
      endDate: "",
    });
    toast.info("Đã xóa tất cả bộ lọc", {
      position: "top-right",
      autoClose: 2000,
    });
  };

  // Open modal to view change details
  const openModal = (log) => {
    setSelectedLog(log);
    setShowModal(true);
    setShowAllFields(false);
    setFullOrderData(null);
  };

  // Fetch full order data for status changes when showing all fields
  const fetchFullOrderData = async (orderId) => {
    setLoadingFullOrder(true);
    try {
      // f3_data is the source used elsewhere (revert, updates). Use REST to
      // fetch the canonical order state for status_change show-all view.
      const url = `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/f3_data/${orderId}.json`;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Failed to fetch order data: ${resp.status}`);
      }
      const data = await resp.json();
      if (data) {
        setFullOrderData(data);
      } else {
        toast.error("Không tìm thấy dữ liệu đơn hàng");
      }
    } catch (error) {
      console.error("Error fetching full order data:", error);
      toast.error("Lỗi khi tải dữ liệu đơn hàng");
    } finally {
      setLoadingFullOrder(false);
    }
  };

  // Handle showing all fields
  const handleShowAllFields = async () => {
    if (
      selectedLog &&
      selectedLog.changeType === "status_change" &&
      !showAllFields
    ) {
      await fetchFullOrderData(selectedLog.orderId);
    }
    setShowAllFields(!showAllFields);
  };

  // Close modal
  const closeModal = () => {
    setSelectedLog(null);
    setShowModal(false);
    setShowAllFields(false);
    toast.dismiss(); // Dismiss any existing toasts
  };

  // Open confirm revert modal
  const openConfirmRevert = (log) => {
    if (log.reverted) {
      toast.info("Thay đổi này đã được hoàn tác trước đó");
      return;
    }
    setLogToRevert(log);
    setShowConfirmRevert(true);
  };

  // Close confirm revert modal
  const closeConfirmRevert = () => {
    setLogToRevert(null);
    setShowConfirmRevert(false);
    toast.dismiss(); // Dismiss confirmation toast
  };

  // Highlight differences between old and new values
  const highlightDifferences = (
    oldValue,
    newValue,
    showAll = false,
    logContext = null
  ) => {
    if (!oldValue || !newValue)
      return { old: oldValue || "N/A", new: newValue || "N/A" };

    const fieldLabels = {
      'order_code': 'Mã đơn hàng',
      'customer_name': 'Tên khách hàng',
      'customer_phone': 'Số điện thoại',
      'customer_address': 'Địa chỉ',
      'total_amount_vnd': 'Tổng tiền',
      'payment_status': 'Thanh toán',
      'delivery_status': 'Trạng thái giao hàng',
      'note': 'Ghi chú',
      'marketing_staff': 'Nhân viên MKT',
      'sale_staff': 'Nhân viên Sale',
      'product': 'Sản phẩm',
      'shipping_fee': 'Phí ship',
      'created_at': 'Ngày tạo',
      'updated_at': 'Cập nhật lần cuối',
      'order_date': 'Ngày lên đơn',
      'city': 'Thành phố',
      'state': 'Quận/Huyện',
      'goods_amount': 'Tiền hàng',
      'reconciled_amount': 'Đã đối soát',
      'status': 'Trạng thái đơn',
      'total': 'Tổng tiền',
      'Trạng thái đơn': 'Trạng thái đơn'
    };

    let oldParsed = oldValue;
    let newParsed = newValue;

    // Parse JSON strings if needed
    if (typeof oldValue === "string") {
      try {
        oldParsed = JSON.parse(oldValue);
      } catch (e) {
        oldParsed = oldValue;
      }
    }

    if (typeof newValue === "string") {
      try {
        newParsed = JSON.parse(newValue);
      } catch (e) {
        newParsed = newValue;
      }
    }

    // Special handling for status_change: oldValue is full object, newValue is status string
    if (
      logContext &&
      logContext.changeType === "status_change" &&
      typeof oldParsed === "object" &&
      typeof newParsed === "string"
    ) {
      const differences = [];
      const newStatus = newParsed;

      // Build per-field differences based on oldParsed keys
      for (const key of Object.keys(oldParsed)) {
        const oldVal = oldParsed[key];
        if (key === "Trạng thái đơn") {
          // Status field changed
          if (String(oldVal || "") !== String(newStatus || "")) {
            differences.push({
              field: fieldLabels[key] || key,
              oldValue:
                typeof oldVal === "object"
                  ? JSON.stringify(oldVal, null, 2)
                  : String(oldVal || "N/A"),
              newValue: String(newStatus || "N/A"),
              changed: true,
            });
          } else if (showAll) {
            differences.push({
              field: fieldLabels[key] || key,
              oldValue:
                typeof oldVal === "object"
                  ? JSON.stringify(oldVal, null, 2)
                  : String(oldVal || "N/A"),
              newValue: String(newStatus || "N/A"),
              changed: false,
            });
          }
        } else if (showAll) {
          // include other fields as unchanged when showAll is requested
          const otherOld = oldParsed[key];
          differences.push({
            field: fieldLabels[key] || key,
            oldValue:
              typeof otherOld === "object"
                ? JSON.stringify(otherOld, null, 2)
                : String(otherOld || "N/A"),
            newValue:
              typeof otherOld === "object"
                ? JSON.stringify(otherOld, null, 2)
                : String(otherOld || "N/A"),
            changed: false,
          });
        }
      }

      return differences;
    }

    // If both are objects, compare field by field
    if (
      typeof oldParsed === "object" &&
      typeof newParsed === "object" &&
      oldParsed !== null &&
      newParsed !== null
    ) {
      const allKeys = new Set([
        ...Object.keys(oldParsed),
        ...Object.keys(newParsed),
      ]);
      const differences = [];

      for (const key of allKeys) {
        const oldVal = oldParsed[key];
        const newVal = newParsed[key];

        if (oldVal !== newVal) {
          differences.push({
            field: fieldLabels[key] || key,
            oldValue:
              typeof oldVal === "object"
                ? JSON.stringify(oldVal, null, 2)
                : String(oldVal || "N/A"),
            newValue:
              typeof newVal === "object"
                ? JSON.stringify(newVal, null, 2)
                : String(newVal || "N/A"),
            changed: true,
          });
        } else if (showAll) {
          differences.push({
            field: fieldLabels[key] || key,
            oldValue:
              typeof oldVal === "object"
                ? JSON.stringify(oldVal, null, 2)
                : String(oldVal || "N/A"),
            newValue:
              typeof newVal === "object"
                ? JSON.stringify(newVal, null, 2)
                : String(newVal || "N/A"),
            changed: false,
          });
        }
      }

      return differences;
    }

    // If not objects, just return as is
    return {
      old:
        typeof oldParsed === "object"
          ? JSON.stringify(oldParsed, null, 2)
          : String(oldParsed || "N/A"),
      new:
        typeof newParsed === "object"
          ? JSON.stringify(newParsed, null, 2)
          : String(newParsed || "N/A"),
      isSimple: true,
    };
  };

  // Check if filters are active
  const hasActiveFilters = Object.values(filters).some((value) => value !== "");

  // Show toast when no results found with active filters
  useEffect(() => {
    if (
      hasActiveFilters &&
      changeLogs.length > 0 &&
      filteredLogs.length === 0
    ) {
      toast.warning("Không tìm thấy kết quả phù hợp với bộ lọc hiện tại", {
        position: "top-right",
        autoClose: 4000,
      });
    }
  }, [filteredLogs.length, hasActiveFilters, changeLogs.length]);

  // Handle revert change (called after confirmation)
  const confirmRevert = async () => {
    if (!logToRevert) return;

    try {
      // Use REST endpoint for canonical f3_data updates (avoid Firebase SDK)
      const orderUrlBase = "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3.json";

      if (logToRevert.changeType === "status_change") {
        // Revert status change - get old status from the oldValue object
        let oldStatus;
        if (
          typeof logToRevert.oldValue === "object" &&
          logToRevert.oldValue !== null
        ) {
          oldStatus = logToRevert.oldValue["Trạng thái đơn"];
        } else {
          // Fallback for old format
          oldStatus = logToRevert.oldValue;
        }

        // PATCH the canonical order object at /f3_data/<orderId>.json
        try {
          const patchUrl = `${orderUrlBase}/${logToRevert.orderId}.json`;
          await fetch(patchUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 'Trạng thái đơn': oldStatus }),
          });
        } catch (err) {
          console.error('Failed to PATCH canonical f3_data entry (status_change):', err);
          // continue - datasheet patch below is non-fatal
        }

        // Update existing datasheet entry for this order
        try {
          const f3Url =
            "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3.json";
          const resp = await fetch(f3Url);
          const f3Data = await resp.json();

          const orderCode =
            logToRevert.orderCode ||
            (logToRevert.oldValue &&
              (logToRevert.oldValue["Mã đơn hàng"] ||
                logToRevert.oldValue["Mã đơn"]));

          if (Array.isArray(f3Data)) {
            const idx = f3Data.findIndex((item) => {
              if (!item) return false;
              const code =
                item["Mã đơn hàng"] ||
                item["Mã đơn"] ||
                item["Mã Đơn"] ||
                item["OrderCode"] ||
                item["Mã"];
              return code && String(code).trim() === String(orderCode).trim();
            });

            if (idx !== -1) {
              const entryUrl = `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3/${idx}.json`;
              await fetch(entryUrl, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ "Trạng thái đơn": oldStatus }),
              });
            }
          } else if (f3Data && typeof f3Data === "object") {
            const foundKey = Object.keys(f3Data).find((k) => {
              const item = f3Data[k];
              if (!item) return false;
              const code =
                item["Mã đơn hàng"] ||
                item["Mã đơn"] ||
                item["Mã Đơn"] ||
                item["OrderCode"] ||
                item["Mã"];
              return code && String(code).trim() === String(orderCode).trim();
            });

            if (foundKey) {
              const entryUrl = `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3/${foundKey}.json`;
              await fetch(entryUrl, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ "Trạng thái đơn": oldStatus }),
              });
            }
          }
        } catch (err) {
          console.error(
            "Revert: failed to update datasheet entry (non-fatal):",
            err
          );
        }

        // Log the revert
        await logChange(
          logToRevert.orderId,
          "revert_status",
          logToRevert.newValue,
          oldStatus,
          logToRevert.oldValue
        );

        toast.success("Đã hoàn tác thay đổi trạng thái");
      } else if (logToRevert.changeType === "full_update") {
        // Revert full update - restore old values
        let oldValues = logToRevert.oldValue;

        // Parse JSON string if needed, or use object directly
        if (typeof oldValues === "string") {
          try {
            oldValues = JSON.parse(oldValues);
          } catch (e) {
            toast.error("Không thể hoàn tác: dữ liệu cũ không hợp lệ");
            return;
          }
        }

        // Ensure oldValues is an object
        if (typeof oldValues !== "object" || oldValues === null) {
          toast.error("Không thể hoàn tác: dữ liệu cũ không đúng định dạng");
          return;
        }

        // PATCH the canonical order object at /f3_data/<orderId>.json
        try {
          const patchUrl = `${orderUrlBase}/${logToRevert.orderId}.json`;
          await fetch(patchUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(oldValues),
          });
        } catch (err) {
          console.error('Failed to PATCH canonical f3_data entry (full_update):', err);
          // continue - datasheet patch below is non-fatal
        }

        // Update existing datasheet entry for this order
        try {
          const f3Url =
            "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3.json";
          const resp = await fetch(f3Url);
          const f3Data = await resp.json();

          const orderCode =
            logToRevert.orderCode ||
            (oldValues && (oldValues["Mã đơn hàng"] || oldValues["Mã đơn"]));

          if (Array.isArray(f3Data)) {
            const idx = f3Data.findIndex((item) => {
              if (!item) return false;
              const code =
                item["Mã đơn hàng"] ||
                item["Mã đơn"] ||
                item["Mã Đơn"] ||
                item["OrderCode"] ||
                item["Mã"];
              return code && String(code).trim() === String(orderCode).trim();
            });

            if (idx !== -1) {
              const entryUrl = `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3/${idx}.json`;
              await fetch(entryUrl, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(oldValues),
              });
            }
          } else if (f3Data && typeof f3Data === "object") {
            const foundKey = Object.keys(f3Data).find((k) => {
              const item = f3Data[k];
              if (!item) return false;
              const code =
                item["Mã đơn hàng"] ||
                item["Mã đơn"] ||
                item["Mã Đơn"] ||
                item["OrderCode"] ||
                item["Mã"];
              return code && String(code).trim() === String(orderCode).trim();
            });

            if (foundKey) {
              const entryUrl = `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3/${foundKey}.json`;
              await fetch(entryUrl, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(oldValues),
              });
            }
          }
        } catch (err) {
          console.error(
            "Revert full_update: failed to update datasheet entry (non-fatal):",
            err
          );
        }

        // Log the revert
        await logChange(
          logToRevert.orderId,
          "revert_full_update",
          logToRevert.newValue,
          oldValues,
          oldValues
        );

        toast.success("Đã hoàn tác cập nhật đầy đủ");
      }

      // Mark the original log as reverted in Supabase
      // We need to fetch the current details first to avoid overwriting other detail fields
      // Optimization: use the 'logToRevert' object which contains the details from the list view (mapped)
      // but 'logToRevert' in state has flattened props. We need to construct the new details object.

      const newDetails = {
        ...logToRevert, // This has flattened props like userRole, orderCode, etc.
        reverted: true
      };
      // Clean up top-level props that are not in details (id, timestamp, etc are top level in state, but were flattened from details?)
      // Actually, my fetchChangeLogs mapped: userRole: details.userRole.
      // So I should reconstruct 'details' from the flattened object OR just patch the 'details' column if possible.
      // Safest way: Just update the specific key in the JSONB column if Supabase supported it easily via JS client, 
      // but standard update replaces the column.

      // Since I don't want to break other details, I'll assume logToRevert has all I need or I can just set reverted: true in details if I don't care about others?
      // No, better to get the current row.

      const { data: currentLog } = await supabase.from('change_logs').select('details').eq('id', logToRevert.id).single();
      if (currentLog) {
        await supabase.from('change_logs').update({
          details: { ...currentLog.details, reverted: true }
        }).eq('id', logToRevert.id);
      }

      // Update local state to reflect the change immediately
      setChangeLogs((prevLogs) =>
        prevLogs.map((log) =>
          log.id === logToRevert.id ? { ...log, reverted: true } : log
        )
      );

      // Close modals
      closeConfirmRevert();
      closeModal();

      toast.success(
        `Hoàn tác thành công! Đơn ${logToRevert.orderCode || "N/A"
        } đã được khôi phục.`,
        {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        }
      );
    } catch (error) {
      console.error("Error reverting change:", error);
      toast.error("Lỗi khi hoàn tác thay đổi: " + error.message, {
        position: "top-right",
        autoClose: 6000,
      });
    }
  };

  const getChangeTypeColor = (changeType) => {
    switch (changeType) {
      case "status_change":
        return "bg-green-100 text-green-800";
      case "full_update":
        return "bg-green-100 text-green-800";
      case "revert_status":
        return "bg-orange-100 text-orange-800";
      case "revert_full_update":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatChangeValue = (value) => {
    if (!value) return "N/A";

    // Try to parse JSON string
    let parsedValue = value;
    if (typeof value === "string") {
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
        // Not a JSON string, use as is
        return value;
      }
    }

    // If it's an object, format it nicely
    if (typeof parsedValue === "object" && parsedValue !== null) {
      const entries = Object.entries(parsedValue);
      if (entries.length === 0) return "N/A";

      // For status changes (usually just one field)
      if (entries.length === 1) {
        const [key, val] = entries[0];
        return (
          <div className="text-sm">
            <span className="font-semibold">{key}:</span> {val || "N/A"}
          </div>
        );
      }

      // For full updates, show key-value pairs
      return (
        <ul className="list-disc list-inside text-sm space-y-1">
          {entries.map(([key, val]) => (
            <li key={key} className="break-words">
              <span className="font-semibold">{key}:</span> {String(val || "N/A")}
            </li>
          ))}
        </ul>
      );
    }

    // Ensure we always return a string, never an object
    return String(parsedValue || "N/A");
  };

  // Helper to safely render any value as a string (objects -> JSON)
  const renderValue = (value) => {
    return typeof value === "object"
      ? JSON.stringify(value, null, 2)
      : String(value || "N/A");
  };

  // Small shared component to render order data (status first then other fields)
  // It supports both: showing only old values (when newValue isn't an object)
  // and showing side-by-side old vs new when newValue is an object (full_update)
  const OrderDataView = ({ orderData, newValue }) => {
    if (!orderData) return null;

    const fieldLabels = {
      'order_code': 'Mã đơn hàng',
      'customer_name': 'Tên khách hàng',
      'customer_phone': 'Số điện thoại',
      'customer_address': 'Địa chỉ',
      'total_amount_vnd': 'Tổng tiền',
      'payment_status': 'Thanh toán',
      'delivery_status': 'Trạng thái giao hàng',
      'note': 'Ghi chú',
      'marketing_staff': 'Nhân viên MKT',
      'sale_staff': 'Nhân viên Sale',
      'product': 'Sản phẩm',
      'shipping_fee': 'Phí ship',
      'created_at': 'Ngày tạo',
      'updated_at': 'Cập nhật lần cuối',
      'order_date': 'Ngày lên đơn',
      'city': 'Thành phố',
      'state': 'Quận/Huyện',
      'goods_amount': 'Tiền hàng',
      'reconciled_amount': 'Đã đối soát',
      'status': 'Trạng thái đơn',
      'total': 'Tổng tiền',
      'Trạng thái đơn': 'Trạng thái đơn'
    };

    // Try to normalize newValue into an object when possible
    let newOrderData = null;
    if (typeof newValue === "object" && newValue !== null) {
      newOrderData = newValue;
    } else if (typeof newValue === "string") {
      try {
        const parsed = JSON.parse(newValue);
        if (typeof parsed === "object" && parsed !== null)
          newOrderData = parsed;
      } catch (e) {
        newOrderData = null;
      }
    }

    const allFields = Object.entries(orderData);
    // Include status field in the normal field list and skip internal id
    const otherFields = allFields.filter(([key]) => key !== "id");

    // Prefer showing Trạng thái đơn first (if present)
    otherFields.sort((a, b) => {
      if (a[0] === "Trạng thái đơn") return -1;
      if (b[0] === "Trạng thái đơn") return 1;
      return 0;
    });

    return (
      <div className="space-y-4">
        {/* Status is shown inline with other fields; removed the separate status panel */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {otherFields.map(([key, value], index) => {
            const newValForKey = newOrderData ? newOrderData[key] : null;
            const changed = newOrderData
              ? String(renderValue(value)) !== String(renderValue(newValForKey))
              : false;

            return (
              <div
                key={index}
                className={`p-3 rounded border ${changed
                  ? "border-orange-400 bg-orange-50"
                  : "border-gray-200 bg-gray-50"
                  }`}
              >
                <div className="font-medium text-gray-700 mb-1">{fieldLabels[key] || key}</div>
                {newOrderData ? (
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <div className="text-xs font-medium text-red-700 mb-1 uppercase tracking-wide">
                        Giá trị cũ
                      </div>
                      <div className="text-sm text-red-900 font-medium break-words">
                        {renderValue(value)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-green-700 mb-1 uppercase tracking-wide">
                        Giá trị mới
                      </div>
                      <div className="text-sm text-green-900 font-medium break-words">
                        {renderValue(newValForKey)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-600 break-words">
                    {renderValue(value)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Đang tải lịch sử thay đổi...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-6">
      {/* Header */}
      <div className="mb-6">
        <Link to="/" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 mb-4">
          <ChevronLeft className="w-4 h-4" />
          Quay lại
        </Link>
        <h2 className="text-2xl font-bold text-primary">
          Lịch sử thay đổi vận đơn
        </h2>
        <p className="text-gray-600 mt-2">
          Theo dõi tất cả các thay đổi được thực hiện trên vận đơn
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-700">Bộ lọc</h3>
          {hasActiveFilters && (
            <div>
              <button
                onClick={clearFilters}
                className="px-3 py-1.5 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 active:bg-red-700 transition-colors duration-200 flex items-center gap-1.5 shadow-sm hover:shadow"
                title="Xóa tất cả bộ lọc"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Xóa tất cả bộ lọc
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mã đơn hàng
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Tìm theo mã đơn..."
              value={filters.orderCode}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, orderCode: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email người dùng
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Tìm theo email..."
              value={filters.userEmail}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, userEmail: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Loại thay đổi
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.changeType}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, changeType: e.target.value }))
              }
            >
              <option value="">Tất cả</option>
              <option value="status_change">Thay đổi trạng thái</option>
              <option value="full_update">Cập nhật đầy đủ</option>
              <option value="reverted">Đã hoàn tác</option>
            </select>
          </div>


          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Từ ngày
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.startDate}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, startDate: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Đến ngày
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.endDate}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, endDate: e.target.value }))
              }
            />
          </div>
        </div>

        {/* bottom action row intentionally left empty - clear button moved to header */}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-1">Tổng thay đổi</p>
              <p className="text-3xl font-bold">{filteredLogs.length}</p>
            </div>
            <svg
              className="w-12 h-12 opacity-80"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                clipRule="evenodd"
              ></path>
            </svg>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-1">Thay đổi trạng thái</p>
              <p className="text-3xl font-bold">
                {
                  filteredLogs.filter(
                    (log) => log.changeType === "status_change"
                  ).length
                }
              </p>
            </div>
            <svg
              className="w-12 h-12 opacity-80"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              ></path>
            </svg>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-1">Cập nhật đầy đủ</p>
              <p className="text-3xl font-bold">
                {
                  filteredLogs.filter((log) => log.changeType === "full_update")
                    .length
                }
              </p>
            </div>
            <svg
              className="w-12 h-12 opacity-80"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"></path>
              <path
                fillRule="evenodd"
                d="M10 5a2 2 0 00-2 2v6a2 2 0 004 0V7a2 2 0 00-2-2zm3 8a1 1 0 01-1 1H8a1 1 0 110-2h4a1 1 0 011 1z"
                clipRule="evenodd"
              ></path>
            </svg>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-1">Đã hoàn tác</p>
              <p className="text-3xl font-bold">
                {filteredLogs.filter((log) => log.reverted).length}
              </p>
            </div>
            <svg
              className="w-12 h-12 opacity-80"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              ></path>
            </svg>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-1">Người dùng hoạt động</p>
              <p className="text-3xl font-bold">
                {new Set(filteredLogs.map((log) => log.userEmail)).size}
              </p>
            </div>
            <svg
              className="w-12 h-12 opacity-80"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"></path>
            </svg>
          </div>
        </div>
      </div>

      {/* Change Logs Table */}
      {filteredLogs.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.29-.966-5.5-2.5M12 4.5C7.305 4.5 3.5 7.305 3.5 12s3.805 7.5 8.5 7.5 8.5-3.805 8.5-8.5-3.805-7.5-8.5-7.5z"
            />
          </svg>
          <p className="text-gray-500 text-lg mb-2">
            Không có lịch sử thay đổi nào
          </p>
          <p className="text-gray-400 text-sm">
            {changeLogs.length > 0
              ? "Thử điều chỉnh bộ lọc để tìm kiếm"
              : "Chưa có thay đổi nào được ghi lại"}
          </p>
          {changeLogs.length > 0 && filteredLogs.length === 0 && (
            <div className="mt-4">
              <button
                onClick={clearFilters}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all duration-200"
              >
                Xóa bộ lọc
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto shadow-md rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-green-600 to-purple-600">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Thời gian
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Mã đơn hàng
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Loại thay đổi
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Người thực hiện
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Nội dung
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Tên khách hàng
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                  Hoàn tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.timestamp && !isNaN(log.timestamp) ? log.timestamp.toLocaleString("vi-VN") : "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {log.orderCode || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${getChangeTypeColor(
                        log.changeType
                      )}`}
                    >
                      {log.changeType === "status_change"
                        ? "Thay đổi trạng thái"
                        : log.changeType === "full_update"
                          ? "Cập nhật đầy đủ"
                          : log.changeType === "SYNC_F3"
                            ? "Đồng bộ F3"
                            : log.changeType === "UPDATE"
                              ? "Cập nhật"
                              : log.changeType === "INSERT"
                                ? "Thêm mới"
                                : log.changeType === "revert_status"
                                  ? "Hoàn tác trạng thái"
                                  : log.changeType === "revert_full_update"
                                    ? "Hoàn tác cập nhật"
                                    : log.changeType}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div>
                      <div className="font-medium">{log.userEmail}</div>
                      <div className="text-xs text-gray-500">
                        {log.userRole}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-xs break-words">
                    {log.details?.note ? (
                      <div className="space-y-1">
                        {log.details.note.split(';').map((part, idx) => (
                          <div key={idx} className="font-medium text-blue-800 text-xs">
                            - {part.trim()}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <button
                        onClick={() => openModal(log)}
                        className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition-all duration-200 transform hover:scale-105"
                        title="Xem chi tiết thay đổi"
                      >
                        <svg
                          className="w-4 h-4 inline mr-1"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"></path>
                          <path
                            fillRule="evenodd"
                            d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                            clipRule="evenodd"
                          ></path>
                        </svg>
                        Xem chi tiết
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.customerName || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.reverted ? (
                      <span className="px-3 py-1 bg-green-100 text-green-800 text-xs rounded font-medium">
                        <svg
                          className="w-4 h-4 inline mr-1"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          ></path>
                        </svg>
                        Đã hoàn tác
                      </span>
                    ) : canRevertThisLog(log) ? (
                      <button
                        onClick={() => {
                          openConfirmRevert(log);
                        }}
                        className="px-3 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 transition-all duration-200 transform hover:scale-105"
                        title="Hoàn tác thay đổi này"
                      >
                        <svg
                          className="w-4 h-4 inline mr-1"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                            clipRule="evenodd"
                          ></path>
                        </svg>
                        Hoàn tác
                      </button>
                    ) : (
                      <span className="px-3 py-1 bg-gray-100 text-gray-500 text-xs rounded font-medium">
                        Không thể hoàn tác
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal for viewing change details */}
      {showModal && selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-800">
                  Chi tiết thay đổi
                </h3>
                <button
                  onClick={closeModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Change Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-700 mb-2">
                    Thông tin cơ bản
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium">Thời gian:</span>{" "}
                      {selectedLog.timestamp.toLocaleString("vi-VN")}
                    </div>
                    <div>
                      <span className="font-medium">Mã đơn hàng:</span>{" "}
                      {selectedLog.orderCode || "N/A"}
                    </div>
                    <div>
                      <span className="font-medium">Loại thay đổi:</span>
                      <span
                        className={`ml-2 px-2 py-1 text-xs rounded-full ${getChangeTypeColor(
                          selectedLog.changeType
                        )}`}
                      >
                        {selectedLog.changeType === "status_change"
                          ? "Thay đổi trạng thái"
                          : selectedLog.changeType === "full_update"
                            ? "Cập nhật đầy đủ"
                            : selectedLog.changeType === "revert_status"
                              ? "Hoàn tác trạng thái"
                              : selectedLog.changeType === "revert_full_update"
                                ? "Hoàn tác cập nhật"
                                : selectedLog.changeType}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Người thực hiện:</span>{" "}
                      {selectedLog.userEmail} ({selectedLog.userRole})
                    </div>
                    <div>
                      <span className="font-medium">Tên khách hàng:</span>{" "}
                      {selectedLog.customerName || "N/A"}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-700 mb-2">
                    Tóm tắt thay đổi
                  </h4>
                  <div className="text-sm text-gray-600">
                    {(() => {
                      // Build a concise summary using existing diff helper
                      const summary = highlightDifferences(
                        selectedLog.oldValue,
                        selectedLog.newValue,
                        false,
                        selectedLog
                      );

                      // Simple scalar values (fallback)
                      if (summary && summary.isSimple) {
                        return (
                          <div>
                            <div className="mb-1">
                              <span className="font-medium">Giá trị cũ:</span>{" "}
                              <div className="text-gray-700 mt-1">
                                {formatChangeValue(summary.old)}
                              </div>
                            </div>
                            <div className="mt-2">
                              <span className="font-medium">Giá trị mới:</span>{" "}
                              <div className="text-gray-700 mt-1">
                                {formatChangeValue(summary.new)}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // Array of field diffs
                      if (Array.isArray(summary)) {
                        const changed = summary.filter((d) => d.changed);
                        if (changed.length === 0) {
                          return <div>Không có thay đổi đáng kể</div>;
                        }

                        // If this is a single-field status_change, show compact old→new
                        if (changed.length === 1) {
                          const d = changed[0];
                          return (
                            <div>
                              <div className="font-medium text-gray-700 mb-1">
                                {d.field}
                              </div>
                              <div className="text-sm text-gray-700">
                                <span className="text-red-700">
                                  {renderValue(d.oldValue)}
                                </span>
                                <span className="mx-2">→</span>
                                <span className="text-green-700">
                                  {renderValue(d.newValue)}
                                </span>
                              </div>
                            </div>
                          );
                        }

                        // Multiple fields: list up to 3 field names and counts
                        return (
                          <div>
                            <div className="mb-1">
                              Đã thay đổi{" "}
                              <span className="font-semibold">
                                {changed.length}
                              </span>{" "}
                              trường
                            </div>
                            <div className="text-sm text-gray-700 space-y-1">
                              {changed.slice(0, 3).map((d, i) => (
                                <div key={i} className="flex items-center">
                                  <span className="mr-2 text-gray-600">•</span>
                                  <span className="font-medium mr-2">
                                    {d.field}:
                                  </span>
                                  <span className="text-red-700 mr-1">
                                    {renderValue(d.oldValue)}
                                  </span>
                                  <span className="mx-1">→</span>
                                  <span className="text-green-700 ml-1">
                                    {renderValue(d.newValue)}
                                  </span>
                                </div>
                              ))}
                              {changed.length > 3 && (
                                <div className="text-xs text-gray-500">
                                  và {changed.length - 3} trường khác
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      // Fallback: keep previous textual description
                      return (
                        <div>
                          {selectedLog.changeType === "status_change" &&
                            "Thay đổi trạng thái đơn hàng"}
                          {selectedLog.changeType === "full_update" &&
                            "Cập nhật nhiều trường thông tin"}
                          {selectedLog.changeType === "revert_status" &&
                            "Hoàn tác thay đổi trạng thái"}
                          {selectedLog.changeType === "revert_full_update" &&
                            "Hoàn tác cập nhật đầy đủ"}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Change Details: only render when user requests full details */}
              {showAllFields && (
                <div className="bg-white border rounded-lg p-4">
                  <div className="flex items-center mb-4">
                    {/* Left: compact summary (count or simple old->new preview) - hidden until user expands */}
                    {(() => {
                      const summary = highlightDifferences(
                        selectedLog.oldValue,
                        selectedLog.newValue,
                        false,
                        selectedLog
                      );

                      if (summary && summary.isSimple) {
                        return (
                          <div className="truncate max-w-md text-sm text-gray-600 mr-4">
                            <span className="font-medium">Tóm tắt:</span>{" "}
                            <span className="text-gray-700">
                              {renderValue(summary.old)} {"→"}{" "}
                              {renderValue(summary.new)}
                            </span>
                          </div>
                        );
                      }

                      if (Array.isArray(summary)) {
                        const changed = summary.filter((d) => d.changed);
                        if (changed.length === 0)
                          return (
                            <div className="text-sm text-gray-600 mr-4">
                              Không có thay đổi
                            </div>
                          );
                        // Only show the count of changed fields (do not list field names)
                        return (
                          <div className="truncate max-w-md text-sm text-gray-600 mr-4">
                            <span className="font-medium">
                              {changed.length} thay đổi
                            </span>
                          </div>
                        );
                      }

                      if (selectedLog.changeType === "status_change")
                        return (
                          <div className="text-sm text-gray-600 mr-4">
                            Thay đổi trạng thái đơn hàng
                          </div>
                        );
                      if (selectedLog.changeType === "full_update")
                        return (
                          <div className="text-sm text-gray-600 mr-4">
                            Cập nhật nhiều trường thông tin
                          </div>
                        );
                      return null;
                    })()}
                  </div>

                  {/* Render full details only when requested via the button above */}
                  {showAllFields &&
                    (selectedLog.changeType === "status_change" ||
                      selectedLog.changeType === "full_update") &&
                    (() => {
                      if (loadingFullOrder) {
                        return (
                          <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
                            <p className="text-gray-600">
                              Đang tải dữ liệu đơn hàng...
                            </p>
                          </div>
                        );
                      }

                      let orderDataToShow = null;
                      if (
                        selectedLog.changeType === "status_change" &&
                        fullOrderData
                      ) {
                        orderDataToShow = fullOrderData;
                      } else if (typeof selectedLog.oldValue === "object") {
                        orderDataToShow = selectedLog.oldValue;
                      } else {
                        try {
                          orderDataToShow = JSON.parse(selectedLog.oldValue);
                        } catch (e) {
                          return (
                            <div className="text-center py-8 text-gray-500">
                              <p>
                                Không thể tải dữ liệu đơn hàng trước khi thay
                                đổi
                              </p>
                            </div>
                          );
                        }
                      }

                      if (!orderDataToShow) {
                        return (
                          <div className="text-center py-8 text-gray-500">
                            <p>Không có dữ liệu đơn hàng</p>
                          </div>
                        );
                      }

                      const newValueForView =
                        selectedLog.changeType === "status_change"
                          ? {
                            ...orderDataToShow,
                            "Trạng thái đơn": selectedLog.newValue,
                          }
                          : selectedLog.newValue;

                      return (
                        <OrderDataView
                          orderData={orderDataToShow}
                          newValue={newValueForView}
                        />
                      );
                    })()}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 mt-6 items-center">
                {/* Moved 'Xem toàn bộ' button here so it sits next to the revert/close controls */}
                <button
                  onClick={handleShowAllFields}
                  disabled={
                    selectedLog.changeType === "status_change" &&
                    !showAllFields &&
                    loadingFullOrder
                  }
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mr-2"
                >
                  {loadingFullOrder ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Đang tải...
                    </div>
                  ) : showAllFields ? (
                    "Ẩn chi tiết"
                  ) : (
                    "Xem toàn bộ"
                  )}
                </button>

                {canRevertThisLog(selectedLog) &&
                  (selectedLog.reverted ? (
                    <span className="px-4 py-2 bg-green-100 text-green-800 rounded-lg font-medium">
                      <svg
                        className="w-4 h-4 inline mr-2"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        ></path>
                      </svg>
                      Đã hoàn tác
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        openConfirmRevert(selectedLog);
                        toast.info(
                          `Chuẩn bị hoàn tác thay đổi của đơn ${selectedLog.orderCode || "N/A"
                          }`,
                          {
                            position: "top-right",
                            autoClose: 2000,
                          }
                        );
                      }}
                      className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all duration-200"
                    >
                      <svg
                        className="w-4 h-4 inline mr-2"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                          clipRule="evenodd"
                        ></path>
                      </svg>
                      Hoàn tác thay đổi
                    </button>
                  ))}

                <button
                  onClick={closeModal}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all duration-200"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Revert Modal */}
      {showConfirmRevert && logToRevert && !logToRevert.reverted && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center mb-6">
                <div className="flex-shrink-0">
                  <svg
                    className="w-12 h-12 text-orange-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="text-xl font-bold text-gray-800">
                    Xác nhận hoàn tác
                  </h3>
                  <p className="text-gray-600 mt-1">
                    Bạn có chắc chắn muốn hoàn tác thay đổi này?
                  </p>
                </div>
              </div>

              {/* Change Details */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h4 className="font-semibold text-gray-700 mb-3">
                  Thông tin thay đổi sẽ được hoàn tác:
                </h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Mã đơn hàng:</span>{" "}
                    {logToRevert.orderCode || "N/A"}
                  </div>
                  <div>
                    <span className="font-medium">Thời gian:</span>{" "}
                    {logToRevert.timestamp.toLocaleString("vi-VN")}
                  </div>
                  <div>
                    <span className="font-medium">Loại thay đổi:</span>
                    <span
                      className={`ml-2 px-2 py-1 text-xs rounded-full ${getChangeTypeColor(
                        logToRevert.changeType
                      )}`}
                    >
                      {logToRevert.changeType === "status_change"
                        ? "Thay đổi trạng thái"
                        : logToRevert.changeType === "full_update"
                          ? "Cập nhật đầy đủ"
                          : logToRevert.changeType === "revert_status"
                            ? "Hoàn tác trạng thái"
                            : logToRevert.changeType === "revert_full_update"
                              ? "Hoàn tác cập nhật"
                              : logToRevert.changeType}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Người thực hiện:</span>{" "}
                    {logToRevert.userEmail}
                  </div>
                </div>
              </div>

              {/* Preview of changes to be reverted */}
              <div className="bg-white border border-orange-200 rounded-lg p-4 mb-6">
                <h4 className="font-semibold text-orange-700 mb-3 flex items-center">
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  Dữ liệu sẽ được khôi phục về:
                </h4>

                {(() => {
                  // For revert confirmation, show full order data that will be restored
                  let orderDataToShow = null;
                  if (typeof logToRevert.oldValue === "object") {
                    orderDataToShow = logToRevert.oldValue;
                  } else {
                    // Fallback: try to parse if it's a string
                    try {
                      orderDataToShow = JSON.parse(logToRevert.oldValue);
                    } catch (e) {
                      return (
                        <div className="text-center py-8 text-gray-500">
                          <p>
                            Không thể tải dữ liệu đơn hàng trước khi thay đổi
                          </p>
                        </div>
                      );
                    }
                  }

                  if (!orderDataToShow) {
                    return (
                      <div className="text-center py-8 text-gray-500">
                        <p>Không có dữ liệu đơn hàng</p>
                      </div>
                    );
                  }

                  // Use shared view to display the order data that will be restored
                  // For status changes, synthesize a newValue object so the
                  // shared OrderDataView can show the side-by-side old vs new
                  // state (status) consistently with full_update view.
                  const newValueForView =
                    logToRevert.changeType === "status_change"
                      ? {
                        ...orderDataToShow,
                        "Trạng thái đơn": logToRevert.newValue,
                      }
                      : logToRevert.newValue;

                  return (
                    <OrderDataView
                      orderData={orderDataToShow}
                      newValue={newValueForView}
                    />
                  );
                })()}
              </div>

              {/* Warning */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <div className="flex items-start">
                  <svg
                    className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <div>
                    <h5 className="text-yellow-800 font-medium">
                      Lưu ý quan trọng
                    </h5>
                    <p className="text-yellow-700 text-sm mt-1">
                      Hành động này sẽ khôi phục dữ liệu về trạng thái cũ. Thay
                      đổi này sẽ được ghi lại trong lịch sử và có thể được hoàn
                      tác lại nếu cần.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={closeConfirmRevert}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all duration-200"
                >
                  Hủy bỏ
                </button>
                <button
                  onClick={confirmRevert}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all duration-200"
                >
                  <svg
                    className="w-4 h-4 inline mr-2"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  Xác nhận hoàn tác
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
