import React, { useState, useEffect, useMemo } from "react";
import {
  Table,
  Card,
  DatePicker,
  Space,
  Button,
  Tag,
  Statistic,
  Row,
  Col,
  Select,
  Input,
  message,
  Empty,
  Tooltip,
} from "antd";
import {
  DownloadOutlined,
  SearchOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  ClockCircleFilled,
  ClearOutlined,
} from "@ant-design/icons";
import { ref, onValue } from "firebase/database";
import { database } from "../../firebase";
import dayjs, { Dayjs } from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import WrapperContent from "@/components/WrapperContent";
import * as XLSX from "xlsx";

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

interface StaffMember {
  id: string;
  "Họ và tên": string;
  "Email"?: string;
  "Email công ty"?: string;
  "Số điện thoại"?: string;
  "Vị trí"?: string;
  "Trạng thái"?: string;
  "Lương cơ bản"?: number;
  "Lương theo ngày"?: number;
  "Lương theo giờ"?: number;
  [key: string]: any;
}

interface StaffAttendanceSession {
  id: string;
  "Ngày": string;
  "Giờ vào"?: string;
  "Giờ ra"?: string;
  "Nhân viên": string;
  "Staff ID": string;
  "Trạng thái": "present" | "absent" | "late" | "leave";
  "Ghi chú"?: string;
  "Người điểm danh"?: string;
  "Thời gian điểm danh"?: string;
  "Timestamp": string;
}

interface TimesheetRecord {
  staffId: string;
  staffName: string;
  position: string;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  leaveDays: number;
  totalHours: number;
  attendanceDetails: StaffAttendanceSession[];
  estimatedSalary?: number;
}

const StaffTimesheet = () => {
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<StaffAttendanceSession[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPosition, setFilterPosition] = useState<string>("all");
  const [filterStaff, setFilterStaff] = useState<string>("all");

  // Load staff members
  useEffect(() => {
    const staffRef = ref(database, "datasheet/Giáo_viên");
    const unsubscribe = onValue(staffRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const staffList = Object.entries(data)
          .map(([id, value]) => ({
            id,
            ...(value as Omit<StaffMember, "id">),
          }))
          .filter((staff): staff is StaffMember => 
            staff["Họ và tên"] != null && typeof staff["Họ và tên"] === "string"
          );
        setStaffMembers(staffList);
      } else {
        setStaffMembers([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load attendance sessions
  useEffect(() => {
    const sessionsRef = ref(database, "datasheet/Điểm_danh_nhân_sự");
    const unsubscribe = onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const sessionsList = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<StaffAttendanceSession, "id">),
        }));
        setAttendanceSessions(sessionsList);
      } else {
        setAttendanceSessions([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Calculate timesheet data
  const timesheetData = useMemo(() => {
    const monthStart = selectedMonth.startOf("month");
    const monthEnd = selectedMonth.endOf("month");

    // Get all days in the month
    const daysInMonth = monthEnd.diff(monthStart, "day") + 1;

    // Filter attendance sessions for selected month
    const monthSessions = attendanceSessions.filter((session) => {
      const sessionDate = dayjs(session["Ngày"]);
      if (!sessionDate.isValid()) return false;
      return (
        sessionDate.isSameOrAfter(monthStart, "day") &&
        sessionDate.isSameOrBefore(monthEnd, "day")
      );
    });

    // Group by staff member
    const staffMap: Record<string, TimesheetRecord> = {};

    staffMembers.forEach((staff) => {
      const staffSessions = monthSessions.filter(
        (s) => s["Staff ID"] === staff.id
      );

      const presentDays = staffSessions.filter(
        (s) => s["Trạng thái"] === "present"
      ).length;
      const absentDays = staffSessions.filter(
        (s) => s["Trạng thái"] === "absent"
      ).length;
      const lateDays = staffSessions.filter(
        (s) => s["Trạng thái"] === "late"
      ).length;
      const leaveDays = staffSessions.filter(
        (s) => s["Trạng thái"] === "leave"
      ).length;

      // Calculate total hours
      let totalHours = 0;
      staffSessions.forEach((session) => {
        if (session["Giờ vào"] && session["Giờ ra"]) {
          const checkIn = dayjs(session["Giờ vào"], "HH:mm");
          const checkOut = dayjs(session["Giờ ra"], "HH:mm");
          if (checkIn.isValid() && checkOut.isValid()) {
            const hours = checkOut.diff(checkIn, "hour", true);
            if (hours > 0) {
              totalHours += hours;
            }
          }
        }
      });

      // Calculate estimated salary
      let estimatedSalary = 0;
      if (staff["Lương theo ngày"]) {
        estimatedSalary = presentDays * staff["Lương theo ngày"];
      } else if (staff["Lương theo giờ"]) {
        estimatedSalary = totalHours * staff["Lương theo giờ"];
      } else if (staff["Lương cơ bản"]) {
        // Assume 22 working days per month
        estimatedSalary = (presentDays / 22) * staff["Lương cơ bản"];
      }

      staffMap[staff.id] = {
        staffId: staff.id,
        staffName: staff["Họ và tên"],
        position: staff["Vị trí"] || "Chưa xác định",
        totalDays: daysInMonth,
        presentDays,
        absentDays,
        lateDays,
        leaveDays,
        totalHours: Math.round(totalHours * 10) / 10,
        attendanceDetails: staffSessions,
        estimatedSalary: Math.round(estimatedSalary),
      };
    });

    return Object.values(staffMap);
  }, [staffMembers, attendanceSessions, selectedMonth]);

  // Filter timesheet data
  const filteredTimesheet = useMemo(() => {
    return timesheetData.filter((record) => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchName = record.staffName.toLowerCase().includes(search);
        const matchPosition = record.position.toLowerCase().includes(search);
        if (!matchName && !matchPosition) return false;
      }

      // Position filter
      if (filterPosition !== "all" && record.position !== filterPosition) {
        return false;
      }

      // Staff filter
      if (filterStaff !== "all" && record.staffId !== filterStaff) {
        return false;
      }

      return true;
    });
  }, [timesheetData, searchTerm, filterPosition, filterStaff]);

  // Get unique positions
  const uniquePositions = useMemo(() => {
    const positions = new Set(
      timesheetData.map((r) => r.position).filter((p) => !!p)
    );
    return Array.from(positions).sort();
  }, [timesheetData]);

  // Get all days in selected month
  const monthDays = useMemo(() => {
    const monthStart = selectedMonth.startOf("month");
    const monthEnd = selectedMonth.endOf("month");
    const days: Dayjs[] = [];
    let current = monthStart;
    while (current.isSameOrBefore(monthEnd, "day")) {
      days.push(current);
      current = current.add(1, "day");
    }
    return days;
  }, [selectedMonth]);

  // Get attendance for a specific staff and date
  const getAttendanceForDate = (staffId: string, date: Dayjs): StaffAttendanceSession | null => {
    const dateStr = date.format("YYYY-MM-DD");
    return attendanceSessions.find(
      (s) => s["Staff ID"] === staffId && s["Ngày"] === dateStr
    ) || null;
  };

  // Render attendance icon for a date
  const renderAttendanceIcon = (record: TimesheetRecord, date: Dayjs) => {
    const session = getAttendanceForDate(record.staffId, date);
    if (!session) {
      return <span style={{ color: "#d9d9d9" }}>-</span>;
    }

    const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
      present: {
        icon: <CheckCircleOutlined />,
        color: "#52c41a",
        label: "Có mặt",
      },
      absent: {
        icon: <CloseCircleOutlined />,
        color: "#ff4d4f",
        label: "Vắng",
      },
      late: {
        icon: <WarningOutlined />,
        color: "#faad14",
        label: "Đi muộn",
      },
      leave: {
        icon: <ClockCircleFilled />,
        color: "#1890ff",
        label: "Nghỉ phép",
      },
    };

    const config = statusConfig[session["Trạng thái"]] || statusConfig.present;
    const tooltipText = `${config.label}${session["Giờ vào"] ? ` - ${session["Giờ vào"]}` : ""}${session["Giờ ra"] ? ` / ${session["Giờ ra"]}` : ""}${session["Ghi chú"] ? `\nGhi chú: ${session["Ghi chú"]}` : ""}`;

    return (
      <Tooltip title={tooltipText}>
        <span style={{ color: config.color, fontSize: "16px", cursor: "pointer" }}>
          {config.icon}
        </span>
      </Tooltip>
    );
  };

  // Statistics
  const stats = useMemo(() => {
    const total = filteredTimesheet.length;
    const totalPresentDays = filteredTimesheet.reduce(
      (sum, r) => sum + r.presentDays,
      0
    );
    const totalAbsentDays = filteredTimesheet.reduce(
      (sum, r) => sum + r.absentDays,
      0
    );
    const totalLateDays = filteredTimesheet.reduce(
      (sum, r) => sum + r.lateDays,
      0
    );
    const totalLeaveDays = filteredTimesheet.reduce(
      (sum, r) => sum + r.leaveDays,
      0
    );
    const totalHours = filteredTimesheet.reduce(
      (sum, r) => sum + r.totalHours,
      0
    );
    const totalSalary = filteredTimesheet.reduce(
      (sum, r) => sum + (r.estimatedSalary || 0),
      0
    );

    return {
      total,
      totalPresentDays,
      totalAbsentDays,
      totalLateDays,
      totalLeaveDays,
      totalHours: Math.round(totalHours * 10) / 10,
      totalSalary,
    };
  }, [filteredTimesheet]);

  // Export to Excel
  const exportToExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Summary sheet
      const summaryData = [
        ["BẢNG CHẤM CÔNG NHÂN SỰ"],
        [`Tháng: ${selectedMonth.format("MM/YYYY")}`],
        [`Ngày xuất: ${dayjs().format("DD/MM/YYYY HH:mm")}`],
        [],
        [
          "STT",
          "Họ và tên",
          "Vị trí",
          "Tổng ngày",
          "Có mặt",
          "Vắng",
          "Đi muộn",
          "Nghỉ phép",
          "Tổng giờ",
          "Lương ước tính",
        ],
        ...filteredTimesheet.map((record, index) => [
          index + 1,
          record.staffName,
          record.position,
          record.totalDays,
          record.presentDays,
          record.absentDays,
          record.lateDays,
          record.leaveDays,
          record.totalHours,
          record.estimatedSalary || 0,
        ]),
        [],
        ["Tổng cộng:", "", "", "", stats.totalPresentDays, stats.totalAbsentDays, stats.totalLateDays, stats.totalLeaveDays, stats.totalHours, stats.totalSalary],
      ];

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);

      // Set column widths
      summarySheet["!cols"] = [
        { wch: 5 }, // STT
        { wch: 25 }, // Họ và tên
        { wch: 20 }, // Vị trí
        { wch: 10 }, // Tổng ngày
        { wch: 10 }, // Có mặt
        { wch: 10 }, // Vắng
        { wch: 10 }, // Đi muộn
        { wch: 10 }, // Nghỉ phép
        { wch: 12 }, // Tổng giờ
        { wch: 15 }, // Lương ước tính
      ];

      XLSX.utils.book_append_sheet(wb, summarySheet, "Bảng chấm công");

      // Detail sheet (one per staff member)
      filteredTimesheet.forEach((record) => {
        const detailData = [
          [`BẢNG CHẤM CÔNG CHI TIẾT - ${record.staffName}`],
          [`Tháng: ${selectedMonth.format("MM/YYYY")}`],
          [`Vị trí: ${record.position}`],
          [],
          ["Ngày", "Trạng thái", "Giờ vào", "Giờ ra", "Số giờ", "Ghi chú"],
          ...record.attendanceDetails.map((session) => {
            const sessionDate = dayjs(session["Ngày"]);
            let hours = 0;
            if (session["Giờ vào"] && session["Giờ ra"]) {
              const checkIn = dayjs(session["Giờ vào"], "HH:mm");
              const checkOut = dayjs(session["Giờ ra"], "HH:mm");
              if (checkIn.isValid() && checkOut.isValid()) {
                hours = checkOut.diff(checkIn, "hour", true);
              }
            }

            const statusLabels: Record<string, string> = {
              present: "Có mặt",
              absent: "Vắng",
              late: "Đi muộn",
              leave: "Nghỉ phép",
            };

            return [
              sessionDate.format("DD/MM/YYYY"),
              statusLabels[session["Trạng thái"]] || session["Trạng thái"],
              session["Giờ vào"] || "-",
              session["Giờ ra"] || "-",
              hours > 0 ? hours.toFixed(1) : "-",
              session["Ghi chú"] || "-",
            ];
          }),
        ];

        const detailSheet = XLSX.utils.aoa_to_sheet(detailData);
        detailSheet["!cols"] = [
          { wch: 12 },
          { wch: 12 },
          { wch: 10 },
          { wch: 10 },
          { wch: 10 },
          { wch: 30 },
        ];

        // Limit sheet name to 31 characters (Excel limit)
        const sheetName = record.staffName.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, detailSheet, sheetName);
      });

      // Save file
      const fileName = `Bang_cham_cong_${selectedMonth.format("YYYYMM")}.xlsx`;
      XLSX.writeFile(wb, fileName);
      message.success("Đã xuất file Excel thành công!");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      message.error("Lỗi khi xuất file Excel");
    }
  };

  // Build calendar columns
  const columns = useMemo(() => {
    const baseColumns = [
      {
        title: "STT",
        key: "index",
        width: 60,
        fixed: "left" as const,
        align: "center" as const,
        render: (_: any, __: any, index: number) => index + 1,
      },
      {
        title: "Họ và tên",
        dataIndex: "staffName",
        key: "staffName",
        width: 180,
        fixed: "left" as const,
        render: (name: string, record: TimesheetRecord) => (
          <div>
            <strong>{name}</strong>
            <div style={{ fontSize: "12px", color: "#999" }}>{record.position}</div>
          </div>
        ),
      },
    ];

    // Add day columns
    const dayColumns = monthDays.map((date) => ({
      title: (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: "bold" }}>{date.format("DD")}</div>
          <div style={{ fontSize: "11px", color: "#999" }}>
            {date.format("ddd")}
          </div>
        </div>
      ),
      key: `day-${date.format("YYYY-MM-DD")}`,
      width: 50,
      align: "center" as const,
      render: (_: any, record: TimesheetRecord) => renderAttendanceIcon(record, date),
    }));

    // Add summary columns
    const summaryColumns = [
      {
        title: "Tổng",
        key: "summary",
        width: 200,
        fixed: "right" as const,
        children: [
          {
            title: "Có mặt",
            key: "presentDays",
            width: 80,
            align: "center" as const,
            render: (_: any, record: TimesheetRecord) => (
              <Tag color="green">{record.presentDays}</Tag>
            ),
          },
          {
            title: "Vắng",
            key: "absentDays",
            width: 80,
            align: "center" as const,
            render: (_: any, record: TimesheetRecord) =>
              record.absentDays > 0 ? (
                <Tag color="red">{record.absentDays}</Tag>
              ) : (
                <span>0</span>
              ),
          },
          {
            title: "Giờ",
            key: "totalHours",
            width: 80,
            align: "center" as const,
            render: (_: any, record: TimesheetRecord) => (
              <span>{record.totalHours.toFixed(1)}h</span>
            ),
          },
        ],
      },
    ];

    return [...baseColumns, ...dayColumns, ...summaryColumns];
  }, [monthDays, filteredTimesheet, attendanceSessions]);

  return (
    <WrapperContent
      title="Bảng chấm công nhân sự"
      toolbar={
        <Space>
          <DatePicker
            picker="month"
            value={selectedMonth}
            onChange={(date) => setSelectedMonth(date || dayjs())}
            format="MM/YYYY"
            allowClear={false}
          />
          <Input
            placeholder="Tìm kiếm theo tên, vị trí..."
            prefix={<SearchOutlined />}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: 250 }}
            allowClear
          />
          <Select
            value={filterPosition}
            onChange={setFilterPosition}
            style={{ width: 150 }}
            allowClear
          >
            <Select.Option value="all">Tất cả vị trí</Select.Option>
            {uniquePositions.map((pos) => (
              <Select.Option key={pos} value={pos}>
                {pos}
              </Select.Option>
            ))}
          </Select>
          <Select
            value={filterStaff}
            onChange={setFilterStaff}
            style={{ width: 200 }}
            showSearch
            placeholder="Chọn nhân sự"
            optionFilterProp="children"
            filterOption={(input, option) =>
              (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
            }
            allowClear
          >
            <Select.Option value="all">Tất cả nhân sự</Select.Option>
            {staffMembers.map((staff) => (
              <Select.Option key={staff.id} value={staff.id}>
                {staff["Họ và tên"]}
              </Select.Option>
            ))}
          </Select>
          <Button
            icon={<ClearOutlined />}
            onClick={() => {
              setSearchTerm("");
              setFilterPosition("all");
              setFilterStaff("all");
            }}
          >
            Xóa bộ lọc
          </Button>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={exportToExcel}
          >
            Xuất Excel
          </Button>
        </Space>
      }
    >
      {/* Statistics Cards */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Tổng nhân sự"
              value={stats.total}
              prefix={<CalendarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Tổng ngày có mặt"
              value={stats.totalPresentDays}
              valueStyle={{ color: "#52c41a" }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Tổng ngày đi muộn"
              value={stats.totalLateDays}
              valueStyle={{ color: "#faad14" }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Tổng ngày nghỉ phép"
              value={stats.totalLeaveDays}
              valueStyle={{ color: "#1890ff" }}
              prefix={<ClockCircleFilled />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Tổng ngày vắng"
              value={stats.totalAbsentDays}
              valueStyle={{ color: "#ff4d4f" }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Tổng giờ làm việc"
              value={stats.totalHours}
              suffix="giờ"
              valueStyle={{ color: "#1890ff" }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Tổng lương ước tính"
              value={stats.totalSalary}
              suffix="đ"
              precision={0}
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
      </Row>

      {/* Legend */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space size="large">
          <span style={{ fontWeight: 500 }}>Chú thích:</span>
          <Space>
            <CheckCircleOutlined style={{ color: "#52c41a", fontSize: "16px" }} />
            <span>Có mặt</span>
          </Space>
          <Space>
            <CloseCircleOutlined style={{ color: "#ff4d4f", fontSize: "16px" }} />
            <span>Vắng</span>
          </Space>
          <Space>
            <WarningOutlined style={{ color: "#faad14", fontSize: "16px" }} />
            <span>Đi muộn</span>
          </Space>
          <Space>
            <ClockCircleFilled style={{ color: "#1890ff", fontSize: "16px" }} />
            <span>Nghỉ phép</span>
          </Space>
          <Space>
            <span style={{ color: "#d9d9d9" }}>-</span>
            <span>Chưa điểm danh</span>
          </Space>
        </Space>
      </Card>

      {/* Timesheet Table */}
      <Table
        columns={columns}
        dataSource={filteredTimesheet}
        rowKey="staffId"
        loading={loading}
        scroll={{ x: "max-content" }}
        pagination={{
          pageSize: 20,
          showTotal: (total) => `Tổng ${total} nhân sự`,
        }}
        locale={{
          emptyText: <Empty description="Không có dữ liệu chấm công" />,
        }}
        size="small"
      />
    </WrapperContent>
  );
};

export default StaffTimesheet;
