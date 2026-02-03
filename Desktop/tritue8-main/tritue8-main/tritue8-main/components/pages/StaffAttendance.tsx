import { useState, useEffect, useMemo } from "react";
import {
  Card,
  Button,
  Table,
  DatePicker,
  Select,
  Space,
  Tag,
  Popconfirm,
  message,
  Row,
  Col,
  Statistic,
  Empty,
  Tabs,
} from "antd";
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  UserOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import { useAuth } from "../../contexts/AuthContext";
import { ref, onValue, remove, push, set, update } from "firebase/database";
import { database } from "../../firebase";
import dayjs, { Dayjs } from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import WrapperContent from "@/components/WrapperContent";
import StaffTimesheet from "./StaffTimesheet";

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
  [key: string]: any;
}

interface StaffAttendanceSession {
  id: string;
  "Ngày": string; // Date (YYYY-MM-DD)
  "Giờ vào"?: string; // Check-in time (HH:mm)
  "Giờ ra"?: string; // Check-out time (HH:mm)
  "Nhân viên": string; // Staff name
  "Staff ID": string; // Staff ID
  "Trạng thái": "present" | "absent" | "late" | "leave" | "checkin" | "checkout"; // Attendance status
  "Ghi chú"?: string; // Note
  "Người điểm danh"?: string; // Person who took attendance
  "Thời gian điểm danh"?: string; // Attendance taken time
  "Timestamp": string; // Created timestamp
}

const StaffAttendance = () => {
  const { userProfile } = useAuth();
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<StaffAttendanceSession[]>([]);
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("daily");

  const isAdmin = userProfile?.isAdmin === true || userProfile?.role === "admin";

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

  // Get attendance for selected date
  const dayAttendance = useMemo(() => {
    const dateStr = selectedDate.format("YYYY-MM-DD");
    return attendanceSessions
      .filter((session) => session["Ngày"] === dateStr)
      .sort((a, b) => {
        // Sort by check-in time if available
        if (a["Giờ vào"] && b["Giờ vào"]) {
          return a["Giờ vào"].localeCompare(b["Giờ vào"]);
        }
        return 0;
      });
  }, [attendanceSessions, selectedDate]);

  // Count staff on duty (has check-in but no check-out)
  const staffOnDuty = useMemo(() => {
    return dayAttendance.filter(
      (session) => session["Giờ vào"] && !session["Giờ ra"]
    ).length;
  }, [dayAttendance]);

  // Handle check-in
  const handleCheckIn = async () => {
    if (!selectedStaffId) {
      message.warning("Vui lòng chọn nhân viên");
      return;
    }

    const selectedStaff = staffMembers.find((s) => s.id === selectedStaffId);
    if (!selectedStaff) {
      message.error("Không tìm thấy nhân viên");
      return;
    }

    const dateStr = selectedDate.format("YYYY-MM-DD");
    const checkInTime = dayjs().format("HH:mm");
    const existingSession = dayAttendance.find(
      (s) => s["Staff ID"] === selectedStaffId
    );

    try {
      if (existingSession) {
        // Update existing session with check-in
        if (existingSession["Giờ vào"]) {
          message.warning("Nhân viên đã check-in rồi");
          return;
        }
        const sessionRef = ref(
          database,
          `datasheet/Điểm_danh_nhân_sự/${existingSession.id}`
        );
        await update(sessionRef, {
          "Giờ vào": checkInTime,
          "Trạng thái": "checkin",
          "Thời gian điểm danh": dayjs().format("YYYY-MM-DD HH:mm:ss"),
          "Người điểm danh": userProfile?.email || userProfile?.displayName || "System",
        });
        message.success(`Đã check-in cho ${selectedStaff["Họ và tên"]} lúc ${checkInTime}`);
      } else {
        // Create new session
        const sessionsRef = ref(database, "datasheet/Điểm_danh_nhân_sự");
        const newSessionRef = push(sessionsRef);
        await set(newSessionRef, {
          "Ngày": dateStr,
          "Nhân viên": selectedStaff["Họ và tên"],
          "Staff ID": selectedStaffId,
          "Giờ vào": checkInTime,
          "Trạng thái": "checkin",
          "Thời gian điểm danh": dayjs().format("YYYY-MM-DD HH:mm:ss"),
          "Người điểm danh": userProfile?.email || userProfile?.displayName || "System",
          "Timestamp": dayjs().toISOString(),
        });
        message.success(`Đã check-in cho ${selectedStaff["Họ và tên"]} lúc ${checkInTime}`);
      }
      setSelectedStaffId("");
    } catch (error) {
      console.error("Error checking in:", error);
      message.error("Lỗi khi check-in");
    }
  };

  // Handle check-out
  const handleCheckOut = async (sessionId: string, staffName: string) => {
    const checkOutTime = dayjs().format("HH:mm");
    try {
      const sessionRef = ref(database, `datasheet/Điểm_danh_nhân_sự/${sessionId}`);
      await update(sessionRef, {
        "Giờ ra": checkOutTime,
        "Trạng thái": "checkout",
        "Thời gian điểm danh": dayjs().format("YYYY-MM-DD HH:mm:ss"),
      });
      message.success(`Đã check-out cho ${staffName} lúc ${checkOutTime}`);
    } catch (error) {
      console.error("Error checking out:", error);
      message.error("Lỗi khi check-out");
    }
  };

  // Calculate total hours
  const calculateTotalHours = (checkIn: string, checkOut: string): number => {
    if (!checkIn || !checkOut) return 0;
    try {
      const inTime = dayjs(checkIn, "HH:mm");
      const outTime = dayjs(checkOut, "HH:mm");
      if (inTime.isValid() && outTime.isValid()) {
        const hours = outTime.diff(inTime, "hour", true);
        return hours > 0 ? Math.round(hours * 10) / 10 : 0;
      }
    } catch (error) {
      console.error("Error calculating hours:", error);
    }
    return 0;
  };

  // Get status label and color
  const getStatusInfo = (session: StaffAttendanceSession) => {
    if (session["Giờ vào"] && session["Giờ ra"]) {
      return { label: "Đã hoàn thành", color: "green" };
    }
    if (session["Giờ vào"] && !session["Giờ ra"]) {
      return { label: "Đang làm việc", color: "blue" };
    }
    if (session["Trạng thái"] === "absent") {
      return { label: "Vắng", color: "red" };
    }
    if (session["Trạng thái"] === "leave") {
      return { label: "Nghỉ phép", color: "orange" };
    }
    return { label: "Chưa check-in", color: "default" };
  };

  // Delete attendance record
  const handleDelete = async (sessionId: string) => {
    try {
      const sessionRef = ref(database, `datasheet/Điểm_danh_nhân_sự/${sessionId}`);
      await remove(sessionRef);
      message.success("Đã xóa bản ghi chấm công");
    } catch (error) {
      console.error("Error deleting attendance:", error);
      message.error("Lỗi khi xóa bản ghi");
    }
  };

  // Columns for daily attendance log
  const dailyColumns = [
    {
      title: "NHÂN VIÊN",
      dataIndex: "Nhân viên",
      key: "staff",
      width: 250,
      render: (name: string) => (
        <Space>
          <UserOutlined style={{ fontSize: "18px" }} />
          <strong style={{ fontSize: "16px" }}>{name}</strong>
        </Space>
      ),
    },
    {
      title: "GIỜ VÀO",
      dataIndex: "Giờ vào",
      key: "checkIn",
      width: 150,
      align: "center" as const,
      render: (time: string) =>
        time ? (
          <Tag color="green" icon={<CheckCircleOutlined />} style={{ fontSize: "15px", padding: "6px 12px" }}>
            {time}
          </Tag>
        ) : (
          <span style={{ color: "#999", fontSize: "15px" }}>-</span>
        ),
    },
    {
      title: "GIỜ RA",
      dataIndex: "Giờ ra",
      key: "checkOut",
      width: 180,
      align: "center" as const,
      render: (time: string, record: StaffAttendanceSession) =>
        time ? (
          <Tag color="blue" icon={<ClockCircleOutlined />} style={{ fontSize: "15px", padding: "6px 12px" }}>
            {time}
          </Tag>
        ) : record["Giờ vào"] ? (
          <Button
            size="large"
            type="primary"
            onClick={() => handleCheckOut(record.id, record["Nhân viên"])}
            style={{ fontSize: "15px", height: "40px", padding: "0 20px" }}
          >
            Check-out
          </Button>
        ) : (
          <span style={{ color: "#999", fontSize: "15px" }}>-</span>
        ),
    },
    {
      title: "TỔNG GIỜ",
      key: "totalHours",
      width: 150,
      align: "center" as const,
      render: (_: any, record: StaffAttendanceSession) => {
        const hours = calculateTotalHours(record["Giờ vào"] || "", record["Giờ ra"] || "");
        return hours > 0 ? (
          <Tag color="blue" style={{ fontSize: "15px", padding: "6px 12px" }}>{hours.toFixed(1)}h</Tag>
        ) : (
          <span style={{ color: "#999", fontSize: "15px" }}>-</span>
        );
      },
    },
    {
      title: "TRẠNG THÁI",
      key: "status",
      width: 180,
      align: "center" as const,
      render: (_: any, record: StaffAttendanceSession) => {
        const statusInfo = getStatusInfo(record);
        return <Tag color={statusInfo.color} style={{ fontSize: "15px", padding: "6px 12px" }}>{statusInfo.label}</Tag>;
      },
    },
    {
      title: "TÁC VỤ",
      key: "action",
      width: 120,
      align: "center" as const,
      render: (_: any, record: StaffAttendanceSession) => (
        <Popconfirm
          title="Xóa bản ghi chấm công"
          description="Bạn có chắc chắn muốn xóa bản ghi này?"
          onConfirm={() => handleDelete(record.id)}
          okText="Xóa"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
        >
          <Button size="large" danger icon={<DeleteOutlined />} style={{ fontSize: "16px", height: "40px", width: "40px" }} />
        </Popconfirm>
      ),
    },
  ];

  const tabItems = [
    {
      key: "daily",
      label: "Chấm công ngày",
      children: (
        <Row gutter={16}>
          {/* Left Panel */}
          <Col xs={24} md={8}>
            <Space direction="vertical" style={{ width: "100%" }} size="large">
              {/* Check-In/Out Section */}
              <Card title="Check-In / Out" size="small">
                <Space direction="vertical" style={{ width: "100%" }} size="middle">
                  <div>
                    <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
                      NGÀY LÀM VIỆC
                    </label>
                    <DatePicker
                      value={selectedDate}
                      onChange={(date) => setSelectedDate(date || dayjs())}
                      format="DD/MM/YYYY"
                      style={{ width: "100%" }}
                      allowClear={false}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
                      CHỌN NHÂN VIÊN
                    </label>
                    <Select
                      value={selectedStaffId}
                      onChange={setSelectedStaffId}
                      placeholder="-- Chọn nhân sự --"
                      style={{ width: "100%" }}
                      showSearch
                      optionFilterProp="children"
                      filterOption={(input, option) =>
                        (option?.children as unknown as string)
                          ?.toLowerCase()
                          .includes(input.toLowerCase())
                      }
                    >
                      {staffMembers.map((staff) => (
                        <Select.Option key={staff.id} value={staff.id}>
                          {staff["Họ và tên"]}
                        </Select.Option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    type="primary"
                    block
                    size="large"
                    onClick={handleCheckIn}
                    disabled={!selectedStaffId}
                  >
                    Xác nhận Check-in
                  </Button>
                </Space>
              </Card>

              {/* Staff On Duty Stats */}
              <Card size="small">
                <Statistic
                  title="NHÂN SỰ ĐANG TRỰC"
                  value={staffOnDuty}
                  prefix={<UserOutlined />}
                  valueStyle={{ fontSize: "32px", fontWeight: "bold" }}
                />
                <div style={{ marginTop: 8, color: "#999", fontSize: "12px" }}>
                  Tổng số ca trong ngày: {dayAttendance.length}
                </div>
              </Card>
            </Space>
          </Col>

          {/* Right Panel - Attendance Log */}
          <Col xs={24} md={16}>
            <Card
              title={`Nhật ký chấm công - ${selectedDate.format("YYYY-MM-DD")}`}
              size="small"
            >
              <Table
                columns={dailyColumns}
                dataSource={dayAttendance}
                rowKey="id"
                loading={loading}
                pagination={false}
                locale={{
                  emptyText: (
                    <Empty description="Chưa có dữ liệu chấm công ngày này." />
                  ),
                }}
                size="small"
              />
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: "monthly",
      label: "Báo cáo tháng",
      children: <StaffTimesheet />,
    },
  ];

  return (
    <WrapperContent title="Quản Lý Chấm Công">
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="large"
      />
    </WrapperContent>
  );
};

export default StaffAttendance;
