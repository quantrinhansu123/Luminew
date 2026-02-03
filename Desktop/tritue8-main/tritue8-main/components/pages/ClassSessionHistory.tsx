import { useState, useEffect } from "react";
import {
  Card,
  Table,
  Tag,
  Button,
  Modal,
  Descriptions,
  Space,
  Input,
  InputNumber,
  Checkbox,
  Popconfirm,
  message,
} from "antd";
import { EyeOutlined, EditOutlined, DeleteOutlined, DownloadOutlined, PrinterOutlined, ClockCircleOutlined, LoginOutlined, LogoutOutlined } from "@ant-design/icons";
import { useParams, useNavigate } from "react-router-dom";
import { ref, onValue, update, remove } from "firebase/database";
import { database } from "../../firebase";
import { AttendanceSession, AttendanceRecord } from "../../types";
import dayjs from "dayjs";


const ClassSessionHistory = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] =
    useState<AttendanceSession | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecords, setEditingRecords] = useState<AttendanceRecord[]>([]);
  const [editingHomework, setEditingHomework] = useState({
    description: "",
    total: 0,
  });
  const [commonTestName, setCommonTestName] = useState<string>("");
  const [classData, setClassData] = useState<any>(null);

  // Load class data first
  useEffect(() => {
    if (!classId) {
      setLoading(false);
      setSessions([]);
      return;
    }

    const classRef = ref(database, `datasheet/Lớp_học/${classId}`);
    const unsubscribe = onValue(classRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setClassData({ id: classId, ...data });
      }
    });

    return () => unsubscribe();
  }, [classId]);

  useEffect(() => {
    if (!classId) {
      setLoading(false);
      setSessions([]);
      return;
    }

    const sessionsRef = ref(database, "datasheet/Điểm_danh_sessions");
    const unsubscribe = onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const allSessions = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<AttendanceSession, "id">),
        }));

        // Filter sessions for this class - try both "Class ID" and "Mã lớp"
        const classSessions = allSessions
          .filter((s) => {
            // Try Class ID first
            if (s["Class ID"] === classId) return true;
            // Fallback to Mã lớp if Class ID doesn't match
            if (classData && s["Mã lớp"] === classData["Mã lớp"]) return true;
            return false;
          })
          .sort(
            (a, b) =>
              new Date(b["Ngày"]).getTime() - new Date(a["Ngày"]).getTime()
          );

        setSessions(classSessions);
      } else {
        setSessions([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [classId, classData]);

  // Helper function to filter attendance records by enrollment date
  const filterAttendanceByEnrollment = (session: AttendanceSession): AttendanceRecord[] => {
    if (!classData || !session["Điểm danh"]) return session["Điểm danh"] || [];
    
    const enrollments = classData["Student Enrollments"] || {};
    const sessionDate = session["Ngày"];
    
    return session["Điểm danh"].filter((record: AttendanceRecord) => {
      const studentId = record["Student ID"];
      // Nếu không có enrollment date (backward compatibility), hiển thị học sinh
      if (!enrollments[studentId]) return true;
      
      // Chỉ hiển thị nếu học sinh đã đăng ký trước hoặc trong ngày session
      const enrollmentDate = enrollments[studentId].enrollmentDate;
      return enrollmentDate <= sessionDate;
    });
  };

  const handleView = (session: AttendanceSession) => {
    setSelectedSession(session);
    setIsViewModalOpen(true);
  };

  const handleEdit = (session: AttendanceSession) => {
    setSelectedSession(session);
    // Filter attendance records theo enrollment date
    const filteredRecords = filterAttendanceByEnrollment(session);
    setEditingRecords(filteredRecords);
    setEditingHomework({
      description: session["Bài tập"]?.["Mô tả"] || "",
      total: session["Bài tập"]?.["Tổng số bài"] || 0,
    });
    // Get common test name from first record (if exists)
    const firstTestName = filteredRecords[0]?.["Bài kiểm tra"] || "";
    setCommonTestName(firstTestName);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedSession) return;

    try {
      const cleanData = (obj: any): any => {
        if (Array.isArray(obj)) {
          return obj.map((item) => cleanData(item));
        }
        if (obj !== null && typeof obj === "object") {
          return Object.entries(obj).reduce((acc, [key, value]) => {
            if (value !== undefined) {
              acc[key] = cleanData(value);
            }
            return acc;
          }, {} as any);
        }
        return obj;
      };

      const updateData = {
        "Điểm danh": editingRecords,
        "Bài tập":
          editingHomework.description || editingHomework.total
            ? {
                "Mô tả": editingHomework.description,
                "Tổng số bài": editingHomework.total,
                "Người giao": selectedSession["Bài tập"]?.["Người giao"] || "",
                "Thời gian giao":
                  selectedSession["Bài tập"]?.["Thời gian giao"] ||
                  new Date().toISOString(),
              }
            : undefined,
      };

      const cleanedData = cleanData(updateData);
      const sessionRef = ref(
        database,
        `datasheet/Điểm_danh_sessions/${selectedSession.id}`
      );
      await update(sessionRef, cleanedData);

      message.success("Đã cập nhật buổi học");
      setIsEditModalOpen(false);
    } catch (error) {
      console.error("Error updating session:", error);
      message.error("Không thể cập nhật buổi học");
    }
  };

  const handleDelete = async (sessionId: string) => {
    try {
      const sessionRef = ref(
        database,
        `datasheet/Điểm_danh_sessions/${sessionId}`
      );
      await remove(sessionRef);
      message.success("Đã xóa buổi học");
    } catch (error) {
      console.error("Error deleting session:", error);
      message.error("Không thể xóa buổi học");
    }
  };

  const handleRecordChange = async (
    studentId: string,
    field: keyof AttendanceRecord,
    value: any
  ) => {
    // Update local state first
    const updatedRecords = editingRecords.map((record) => {
      if (record["Student ID"] === studentId) {
        const updated = { ...record };
        if (value !== null && value !== undefined && value !== "") {
          (updated as any)[field] = value;
          
          // Calculate % Hoàn thành BTVN if Bài tập hoàn thành changes
          if (field === "Bài tập hoàn thành" && editingHomework.total > 0) {
            updated["% Hoàn thành BTVN"] = Math.round((value / editingHomework.total) * 100);
          }
        } else if (field === "Điểm" || field === "Bài tập hoàn thành") {
          delete (updated as any)[field];
          if (field === "Bài tập hoàn thành") {
            delete updated["% Hoàn thành BTVN"];
          }
        }

        return updated;
      }
      return record;
    });
    
    setEditingRecords(updatedRecords);
    
    // Auto-save to Firebase if session exists
    if (selectedSession?.id) {
      try {
        const cleanData = (obj: any): any => {
          if (Array.isArray(obj)) {
            return obj.map((item) => cleanData(item));
          }
          if (obj !== null && typeof obj === "object") {
            return Object.entries(obj).reduce((acc, [key, val]) => {
              if (val !== undefined) {
                acc[key] = cleanData(val);
              }
              return acc;
            }, {} as any);
          }
          return obj;
        };

        const updateData = {
          "Điểm danh": updatedRecords,
        };

        const cleanedData = cleanData(updateData);
        const sessionRef = ref(
          database,
          `datasheet/Điểm_danh_sessions/${selectedSession.id}`
        );
        await update(sessionRef, cleanedData);
        
        // Show success message only for score-related fields
        if (field === "Điểm kiểm tra" || field === "Điểm thưởng" || field === "Bài tập hoàn thành") {
          message.success("Đã cập nhật", 1);
        }
      } catch (error) {
        console.error("Error auto-saving:", error);
        // Don't show error for every keystroke, only log it
      }
    }
  };

  // Apply common test name to all students
  const handleApplyCommonTestName = (testName: string) => {
    setCommonTestName(testName);
    setEditingRecords((prev) =>
      prev.map((record) => ({
        ...record,
        "Bài kiểm tra": testName,
      }))
    );
  };

  const columns = [
    {
      title: "Ngày",
      dataIndex: "Ngày",
      key: "date",
      render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
      width: 120,
    },
    {
      title: "Giờ học",
      key: "time",
      render: (_: any, record: AttendanceSession) =>
        `${record["Giờ bắt đầu"]} - ${record["Giờ kết thúc"]}`,
      width: 120,
    },
    {
      title: "Giáo viên",
      dataIndex: "Giáo viên",
      key: "teacher",
      width: 150,
    },
    {
      title: "Có mặt",
      key: "present",
      render: (_: any, record: AttendanceSession) => {
        const filteredRecords = filterAttendanceByEnrollment(record);
        const presentCount = filteredRecords.filter((r) => r["Có mặt"]).length;
        const total = filteredRecords.length;
        return (
          <Tag color="green">
            {presentCount}/{total}
          </Tag>
        );
      },
      width: 100,
    },
    {
      title: "Trạng thái",
      dataIndex: "Trạng thái",
      key: "status",
      render: (status: string) => {
        const statusMap = {
          not_started: <Tag color="default">Chưa bắt đầu</Tag>,
          in_progress: <Tag color="blue">Đang diễn ra</Tag>,
          completed: <Tag color="green">Hoàn thành</Tag>,
        };
        return statusMap[status as keyof typeof statusMap];
      },
      width: 120,
    },
    {
      title: "Thao tác",
      key: "action",
      fixed: "right" as const,
      width: 200,
      render: (_: any, record: AttendanceSession) => (
        <Space onClick={(e) => e.stopPropagation()}>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              handleView(record);
            }}
            size="small"
          >
            Xem
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(record);
            }}
            size="small"
          >
            Sửa
          </Button>
          <Popconfirm
            title="Xóa buổi học"
            description="Bạn có chắc chắn muốn xóa buổi học này?"
            onConfirm={(e) => {
              e?.stopPropagation();
              handleDelete(record.id);
            }}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" danger icon={<DeleteOutlined />} size="small">
              Xóa
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const editColumns = [
    {
      title: "STT",
      key: "index",
      width: 60,
      fixed: "left" as const,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: "Tên học sinh",
      dataIndex: "Tên học sinh",
      key: "name",
      width: 150,
      fixed: "left" as const,
    },
    {
      title: "Có mặt",
      key: "present",
      width: 80,
      render: (_: any, record: AttendanceRecord) => (
        <Checkbox
          checked={record["Có mặt"]}
          onChange={(e) =>
            handleRecordChange(record["Student ID"], "Có mặt", e.target.checked)
          }
        />
      ),
    },
    {
      title: "Đi muộn",
      key: "late",
      width: 80,
      render: (_: any, record: AttendanceRecord) => (
        <Checkbox
          checked={record["Đi muộn"] || false}
          onChange={(e) =>
            handleRecordChange(
              record["Student ID"],
              "Đi muộn",
              e.target.checked
            )
          }
          disabled={!record["Có mặt"]}
        />
      ),
    },
    {
      title: "Giờ check-in",
      key: "checkin",
      width: 100,
      render: (_: any, record: AttendanceRecord) => {
        if (!record["Có mặt"]) return "-";
        return record["Giờ check-in"] ? (
          <Tag icon={<LoginOutlined />} color="success">
            {record["Giờ check-in"]}
          </Tag>
        ) : "-";
      },
    },
    {
      title: "Giờ check-out",
      key: "checkout",
      width: 100,
      render: (_: any, record: AttendanceRecord) => {
        if (!record["Có mặt"]) return "-";
        return record["Giờ check-out"] ? (
          <Tag icon={<LogoutOutlined />} color="warning">
            {record["Giờ check-out"]}
          </Tag>
        ) : "-";
      },
    },
    {
      title: "Vắng có phép",
      key: "permission",
      width: 100,
      render: (_: any, record: AttendanceRecord) => (
        <Checkbox
          checked={record["Vắng có phép"] || false}
          onChange={(e) =>
            handleRecordChange(
              record["Student ID"],
              "Vắng có phép",
              e.target.checked
            )
          }
          disabled={record["Có mặt"]}
        />
      ),
    },
    {
      title: "% Hoàn thành BTVN",
      key: "homework_percentage",
      width: 120,
      render: (_: any, record: AttendanceRecord) => {
        const completed = record["Bài tập hoàn thành"] || 0;
        const total = editingHomework.total || 0;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        return (
          <InputNumber
            min={0}
            max={100}
            value={record["% Hoàn thành BTVN"] ?? percentage}
            onChange={(value) =>
              handleRecordChange(
                record["Student ID"],
                "% Hoàn thành BTVN",
                value
              )
            }
            disabled={!record["Có mặt"]}
            formatter={(value) => `${value}%`}
            parser={(value) => value?.replace('%', '') as any}
            style={{ width: "100%" }}
          />
        );
      },
    },
    {
      title: "Điểm sao thưởng",
      key: "bonus_points",
      width: 100,
      render: (_: any, record: AttendanceRecord) => (
        <InputNumber
          min={0}
          step={1}
          value={record["Điểm thưởng"] ?? null}
          onChange={(value) =>
            handleRecordChange(record["Student ID"], "Điểm thưởng", value)
          }
          onBlur={() => {
            // Ensure save on blur
            const currentRecord = editingRecords.find(
              (r) => r["Student ID"] === record["Student ID"]
            );
            if (currentRecord && selectedSession?.id) {
              handleRecordChange(record["Student ID"], "Điểm thưởng", currentRecord["Điểm thưởng"] ?? null);
            }
          }}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "Bài kiểm tra",
      key: "test_name",
      width: 150,
      render: (_: any, record: AttendanceRecord) => (
        <span style={{ color: record["Bài kiểm tra"] ? "#000" : "#ccc" }}>
          {record["Bài kiểm tra"] || "(Chưa có)"}
        </span>
      ),
    },
    {
      title: "Điểm kiểm tra",
      key: "test_score",
      width: 100,
      render: (_: any, record: AttendanceRecord) => (
        <InputNumber
          min={0}
          max={10}
          step={0.5}
          value={record["Điểm kiểm tra"] ?? null}
          onChange={(value) =>
            handleRecordChange(record["Student ID"], "Điểm kiểm tra", value)
          }
          onBlur={() => {
            // Ensure save on blur
            const currentRecord = editingRecords.find(
              (r) => r["Student ID"] === record["Student ID"]
            );
            if (currentRecord && selectedSession?.id) {
              handleRecordChange(record["Student ID"], "Điểm kiểm tra", currentRecord["Điểm kiểm tra"] ?? null);
            }
          }}
          disabled={!record["Có mặt"]}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "Ghi chú",
      key: "note",
      width: 150,
      render: (_: any, record: AttendanceRecord) => (
        <Input
          value={record["Ghi chú"]}
          onChange={(e) =>
            handleRecordChange(record["Student ID"], "Ghi chú", e.target.value)
          }
        />
      ),
    },
  ];

  const getStatusTags = (record: AttendanceRecord) => {
    const tags = [];
    if (record["Có mặt"]) {
      tags.push(
        <Tag key="present" color="green">
          Có mặt
        </Tag>
      );
      if (record["Đi muộn"]) {
        tags.push(
          <Tag key="late" color="orange">
            Đi muộn
          </Tag>
        );
      }
    } else {
      tags.push(
        <Tag key="absent" color="red">
          Vắng
        </Tag>
      );
      if (record["Vắng có phép"]) {
        tags.push(
          <Tag key="permission" color="blue">
            Có phép
          </Tag>
        );
      }
    }
    return tags;
  };

  const handleExportScoreTable = () => {
    if (sessions.length === 0) {
      message.warning("Không có dữ liệu để xuất");
      return;
    }

    // Get class name from first session
    const className = sessions[0]?.["Tên lớp"] || "Lớp học";
    const subject = className.split(" - ")[0] || className;

    // Sort sessions by date
    const sortedSessions = [...sessions].sort(
      (a, b) => new Date(a["Ngày"]).getTime() - new Date(b["Ngày"]).getTime()
    );

    // Get all unique students (only from filtered records)
    const studentsMap = new Map<string, string>();
    sortedSessions.forEach((session) => {
      const filteredRecords = filterAttendanceByEnrollment(session);
      filteredRecords.forEach((record) => {
        if (!studentsMap.has(record["Student ID"])) {
          studentsMap.set(record["Student ID"], record["Tên học sinh"]);
        }
      });
    });

    // Generate CSV content
    let csvContent = "\uFEFF"; // UTF-8 BOM for Excel compatibility
    csvContent += `Môn ${subject},,,,,,,\n`;
    csvContent += "Ngày,Tên HS,Chuyên cần,% BTVN,Tên bài kiểm tra,Điểm,Điểm thưởng,Nhận xét\n";

    // Add data rows for each session
    sortedSessions.forEach((session) => {
      const filteredRecords = filterAttendanceByEnrollment(session);
      filteredRecords.forEach((record) => {
        const date = dayjs(session["Ngày"]).format("DD/MM/YYYY");
        const studentName = record["Tên học sinh"];
        const attendance = record["Có mặt"]
          ? record["Đi muộn"]
            ? "Đi muộn"
            : "Có mặt"
          : record["Vắng có phép"]
          ? "Vắng có phép"
          : "Vắng";
        const homeworkPercent = record["% Hoàn thành BTVN"] ?? "";
        const testName = record["Bài kiểm tra"] || "";
        const score = record["Điểm kiểm tra"] ?? "";
        const bonusScore = record["Điểm thưởng"] ?? "";
        const note = (record["Ghi chú"] || "").replace(/,/g, ";");

        csvContent += `${date},${studentName},${attendance},${homeworkPercent},${testName},${score},${bonusScore},${note}\n`;
      });
    });

    // Download CSV file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `bang_diem_${className}_${dayjs().format("YYYYMMDD")}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    message.success("Đã xuất bảng điểm");
  };

  const handlePrintScoreTable = () => {
    if (sessions.length === 0) {
      message.warning("Không có dữ liệu để in");
      return;
    }

    const className = sessions[0]?.["Tên lớp"] || "Lớp học";
    const subject = className.split(" - ")[0] || className;

    const sortedSessions = [...sessions].sort(
      (a, b) => new Date(a["Ngày"]).getTime() - new Date(b["Ngày"]).getTime()
    );

    // Create print window
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      message.error("Không thể mở cửa sổ in");
      return;
    }

    let tableRows = "";
    sortedSessions.forEach((session) => {
      const filteredRecords = filterAttendanceByEnrollment(session);
      filteredRecords.forEach((record) => {
        const date = dayjs(session["Ngày"]).format("DD/MM/YYYY");
        const studentName = record["Tên học sinh"];
        const attendance = record["Có mặt"]
          ? record["Đi muộn"]
            ? "Đi muộn"
            : "Có mặt"
          : record["Vắng có phép"]
          ? "Vắng có phép"
          : "Vắng";
        const homeworkPercent = record["% Hoàn thành BTVN"] ?? "-";
        const testName = record["Bài kiểm tra"] || "-";
        const bonusScore = record["Điểm thưởng"] ?? "-";
        const note = record["Ghi chú"] || "-";

        tableRows += `
          <tr>
            <td>${date}</td>
            <td>${studentName}</td>
            <td>${attendance}</td>
            <td>${homeworkPercent}</td>
            <td>${testName}</td>
            <td>${bonusScore}</td>
            <td style="text-align: left;">${note}</td>
          </tr>
        `;
      });
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Bảng điểm ${className}</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 15mm;
            }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
            }
            h1 {
              text-align: center;
              color: #1890ff;
              margin-bottom: 10px;
            }
            h2 {
              text-align: center;
              color: #333;
              margin-bottom: 20px;
            }
            .info {
              text-align: center;
              margin-bottom: 20px;
              color: #666;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th, td {
              border: 1px solid #000;
              padding: 8px;
              text-align: center;
              font-size: 11px;
            }
            th {
              background: #f0f0f0;
              font-weight: bold;
            }
            .subject-header {
              background: #e6f7ff;
              font-weight: bold;
              font-size: 14px;
              text-align: left;
              padding: 10px;
            }
            @media print {
              button {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <h1>BẢNG ĐIỂM CHI TIẾT</h1>
          <h2>Trung tâm Trí Tuệ 8+</h2>
          <div class="info">
            <p>Lớp: ${className}</p>
            <p>Ngày xuất: ${dayjs().format("DD/MM/YYYY HH:mm")}</p>
          </div>
          
          <div class="subject-header">Môn ${subject}</div>
          <table>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Tên HS</th>
                <th>Chuyên cần</th>
                <th>% BTVN</th>
                <th>Tên bài kiểm tra</th>
                <th>Điểm thưởng</th>
                <th>Nhận xét</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div style={{ padding: "24px" }}>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2>Lịch sử buổi học</h2>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleExportScoreTable}>
            Xuất bảng điểm CSV
          </Button>
          <Button icon={<PrinterOutlined />} onClick={handlePrintScoreTable}>
            In bảng điểm
          </Button>
          <Button onClick={() => navigate(-1)}>Quay lại</Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={sessions}
        rowKey="id"
        loading={loading}
        scroll={{ x: 900 }}
        onRow={(record) => ({
          onClick: () => handleView(record),
          style: { cursor: "pointer" },
        })}
      />

      {/* View Modal */}
      <Modal
        title={`Chi tiết buổi học - ${selectedSession?.["Ngày"] ? dayjs(selectedSession["Ngày"]).format("DD/MM/YYYY") : ""}`}
        open={isViewModalOpen}
        onCancel={() => setIsViewModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setIsViewModalOpen(false)}>
            Đóng
          </Button>,
        ]}
        width={1400}
      >
        {selectedSession && (
          <div>
            <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Lớp học">
                {selectedSession["Tên lớp"]}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày">
                {dayjs(selectedSession["Ngày"]).format("DD/MM/YYYY")}
              </Descriptions.Item>
              <Descriptions.Item label="Giờ học">
                {selectedSession["Giờ bắt đầu"]} -{" "}
                {selectedSession["Giờ kết thúc"]}
              </Descriptions.Item>
              <Descriptions.Item label="Giáo viên">
                {selectedSession["Giáo viên"]}
              </Descriptions.Item>
              {selectedSession["Thời gian điểm danh"] && (
                <Descriptions.Item label="Thời gian điểm danh" span={2}>
                  {dayjs(selectedSession["Thời gian điểm danh"]).format(
                    "DD/MM/YYYY HH:mm:ss"
                  )}
                  {selectedSession["Người điểm danh"] &&
                    ` - ${selectedSession["Người điểm danh"]}`}
                </Descriptions.Item>
              )}
              {selectedSession["Thời gian hoàn thành"] && (
                <Descriptions.Item label="Thời gian hoàn thành" span={2}>
                  {dayjs(selectedSession["Thời gian hoàn thành"]).format(
                    "DD/MM/YYYY HH:mm:ss"
                  )}
                  {selectedSession["Người hoàn thành"] &&
                    ` - ${selectedSession["Người hoàn thành"]}`}
                </Descriptions.Item>
              )}
            </Descriptions>

            {selectedSession["Bài tập"] && (
              <Card title="Bài tập" size="small" style={{ marginBottom: 16 }}>
                <p>
                  <strong>Mô tả:</strong> {selectedSession["Bài tập"]["Mô tả"]}
                </p>
                <p>
                  <strong>Tổng số bài:</strong>{" "}
                  {selectedSession["Bài tập"]["Tổng số bài"]}
                </p>
              </Card>
            )}

            <div style={{ marginBottom: 16 }}>
              <h4 style={{ marginBottom: 12 }}>Bảng điểm chi tiết</h4>
              <table style={{ 
                width: "100%", 
                borderCollapse: "collapse",
                fontSize: "12px"
              }}>
                <thead>
                  <tr style={{ background: "#f0f0f0" }}>
                    <th style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>Ngày</th>
                    <th style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>Tên HS</th>
                    <th style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>Chuyên cần</th>
                    <th style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>% BTVN</th>
                    <th style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>Tên bài kiểm tra</th>
                    <th style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>Điểm thưởng</th>
                    <th style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>Nhận xét</th>
                  </tr>
                </thead>
                <tbody>
                  {filterAttendanceByEnrollment(selectedSession).map((record, index) => {
                    const attendance = record["Có mặt"]
                      ? record["Đi muộn"]
                        ? "Đi muộn"
                        : "Có mặt"
                      : record["Vắng có phép"]
                      ? "Vắng có phép"
                      : "Vắng";
                    
                    return (
                      <tr key={record["Student ID"]}>
                        <td style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>
                          {dayjs(selectedSession["Ngày"]).format("DD/MM/YYYY")}
                        </td>
                        <td style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>
                          {record["Tên học sinh"]}
                        </td>
                        <td style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>
                          {attendance}
                        </td>
                        <td style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>
                          {record["% Hoàn thành BTVN"] ?? "-"}
                        </td>
                        <td style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>
                          {record["Bài kiểm tra"] || "-"}
                        </td>
                        <td style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "center" }}>
                          {record["Điểm thưởng"] ?? "-"}
                        </td>
                        <td style={{ border: "1px solid #d9d9d9", padding: "8px", textAlign: "left", paddingLeft: "12px" }}>
                          {record["Ghi chú"] || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal
        title={`Chỉnh sửa buổi học - ${selectedSession?.["Ngày"] ? dayjs(selectedSession["Ngày"]).format("DD/MM/YYYY") : ""}`}
        open={isEditModalOpen}
        onCancel={() => setIsEditModalOpen(false)}
        onOk={handleSaveEdit}
        okText="Lưu"
        cancelText="Hủy"
        width={1400}
      >
        {selectedSession && (
          <div>
            <Card title="Bài tập" size="small" style={{ marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: "100%" }}>
                <div>
                  <label>Mô tả bài tập:</label>
                  <Input.TextArea
                    rows={2}
                    value={editingHomework.description}
                    onChange={(e) =>
                      setEditingHomework((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <label>Tổng số bài:</label>
                  <InputNumber
                    min={0}
                    value={editingHomework.total}
                    onChange={(value) =>
                      setEditingHomework((prev) => ({
                        ...prev,
                        total: value || 0,
                      }))
                    }
                    style={{ width: 200 }}
                  />
                </div>
              </Space>
            </Card>

            <Card 
              title="Bài kiểm tra chung" 
              size="small" 
              style={{ marginBottom: 16, background: "#f0f5ff" }}
            >
              <Space direction="vertical" style={{ width: "100%" }}>
                <div style={{ color: "#666", fontSize: 12, marginBottom: 8 }}>
                  💡 Nhập tên bài kiểm tra một lần, áp dụng cho tất cả học sinh
                </div>
                <Space>
                  <label style={{ fontWeight: 500 }}>Tên bài kiểm tra:</label>
                  <Input
                    placeholder="Ví dụ: Kiểm tra 15 phút, Giữa kỳ, Cuối kỳ..."
                    value={commonTestName}
                    onChange={(e) => handleApplyCommonTestName(e.target.value)}
                    style={{ width: 400 }}
                  />
                  {commonTestName && (
                    <Tag color="green">✓ Đã áp dụng cho {editingRecords.length} học sinh</Tag>
                  )}
                </Space>
              </Space>
            </Card>

            <Table
              columns={editColumns}
              dataSource={editingRecords}
              rowKey="Student ID"
              pagination={false}
              scroll={{ x: 1500 }}
              size="small"
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ClassSessionHistory;
