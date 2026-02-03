import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  Descriptions,
  Table,
  Tag,
  Divider,
  Row,
  Col,
  Statistic,
  Spin,
  Empty,
  DatePicker,
  Input,
  Space,
  Modal,
  Form,
  InputNumber,
} from "antd";
import {
  ArrowLeftOutlined,
  PrinterOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  FilterOutlined,
  DownloadOutlined,
  GiftOutlined,
} from "@ant-design/icons";
import { ref, onValue } from "firebase/database";
import { database } from "../../firebase";
import { useAttendanceStats } from "../../hooks/useAttendanceStats";
import { AttendanceSession } from "../../types";
import ScoreDetailModal from "../ScoreDetailModal";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import "dayjs/locale/vi";

dayjs.extend(isBetween);
dayjs.locale("vi");

interface Student {
  id: string;
  "Họ và tên": string;
  "Mã học sinh"?: string;
  "Ngày sinh"?: string;
  "Số điện thoại"?: string;
  Email?: string;
  "Địa chỉ"?: string;
  [key: string]: any;
}

const StudentReportPage = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);

  const [student, setStudent] = useState<Student | null>(null);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [dateFilter, setDateFilter] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [scoreNameFilter, setScoreNameFilter] = useState<string>("");
  
  // Score detail modal
  const [isScoreModalVisible, setIsScoreModalVisible] = useState(false);
  const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null);
  const [scoreForm] = Form.useForm();

  const { getStudentStats } = useAttendanceStats();

  // Load student data
  useEffect(() => {
    if (!studentId) return;

    const studentRef = ref(
      database,
      `datasheet/Danh_sách_học_sinh/${studentId}`
    );
    const unsubscribe = onValue(studentRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setStudent({ id: studentId, ...data });
      }
    });

    return () => unsubscribe();
  }, [studentId]);

  // Load classes
  useEffect(() => {
    const classesRef = ref(database, "datasheet/Lớp_học");
    const unsubscribe = onValue(classesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const classesList = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as any),
        }));
        setClasses(classesList);
      } else {
        setClasses([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load sessions
  useEffect(() => {
    const sessionsRef = ref(database, "datasheet/Điểm_danh_sessions");
    const unsubscribe = onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const sessionsList = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<AttendanceSession, "id">),
        }));
        setSessions(sessionsList);
      } else {
        setSessions([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading || !student) {
    return (
      <div style={{ padding: "24px", textAlign: "center" }}>
        <Spin />
      </div>
    );
  }

  const stats = getStudentStats(student.id);

  // Filter sessions for this student - chỉ hiển thị sessions sau ngày đăng ký
  const studentSessions = sessions
    .filter((session) => {
      // Check if student has attendance record
      const hasRecord = session["Điểm danh"]?.some(
        (record) => record["Student ID"] === student.id
      );
      if (!hasRecord) return false;
      
      // Check enrollment date if class data available
      const classId = session["Class ID"];
      const classData = classes.find(c => c.id === classId);
      if (classData) {
        const enrollments = classData["Student Enrollments"] || {};
        if (enrollments[student.id]) {
          const enrollmentDate = enrollments[student.id].enrollmentDate;
          const sessionDate = session["Ngày"];
          // Chỉ hiển thị nếu học sinh đã đăng ký trước hoặc trong ngày session
          if (enrollmentDate > sessionDate) return false;
        }
      }
      
      return true;
    })
    .sort(
      (a, b) => new Date(b["Ngày"]).getTime() - new Date(a["Ngày"]).getTime()
    );

  // Calculate attendance rate
  const attendanceRate =
    stats.totalSessions > 0
      ? Math.round((stats.presentSessions / stats.totalSessions) * 100)
      : 0;

  // Get status tag
  const getStatusTag = (record: any) => {
    if (record["Có mặt"]) {
      if (record["Đi muộn"]) {
        return <Tag color="orange">Đi muộn</Tag>;
      }
      return <Tag color="green">Có mặt</Tag>;
    } else {
      if (record["Vắng có phép"]) {
        return <Tag color="blue">Vắng có phép</Tag>;
      }
      if (record["Vắng không phép"]) {
        return <Tag color="red">Vắng không phép</Tag>;
      }
      // Default to unexcused absence if not explicitly marked
      return <Tag color="red">Vắng không phép</Tag>;
    }
  };

  // Filter sessions
  const filteredSessions = studentSessions.filter((session) => {
    // Date filter
    if (dateFilter && dateFilter[0] && dateFilter[1]) {
      const sessionDate = dayjs(session["Ngày"]);
      if (
        !sessionDate.isBetween(dateFilter[0], dateFilter[1], "day", "[]")
      ) {
        return false;
      }
    }

    // Score name filter
    if (scoreNameFilter) {
      const studentRecord = session["Điểm danh"]?.find(
        (r) => r["Student ID"] === student.id
      );
      const hasMatchingScore = studentRecord?.["Chi tiết điểm"]?.some((score) =>
        score["Tên điểm"]
          .toLowerCase()
          .includes(scoreNameFilter.toLowerCase())
      );
      if (!hasMatchingScore) return false;
    }

    return true;
  });

  const handleOpenScoreModal = (session: AttendanceSession) => {
    setSelectedSession(session);
    setIsScoreModalVisible(true);
  };

  const columns = [
    {
      title: "Ngày",
      dataIndex: "Ngày",
      key: "date",
      render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
      width: 100,
    },
    {
      title: "Lớp học",
      dataIndex: "Tên lớp",
      key: "class",
      width: 150,
    },
    {
      title: "Giờ học",
      key: "time",
      render: (_: any, record: AttendanceSession) =>
        `${record["Giờ bắt đầu"]} - ${record["Giờ kết thúc"]}`,
      width: 100,
    },
    {
      title: "Trạng thái",
      key: "status",
      render: (_: any, record: AttendanceSession) => {
        const studentRecord = record["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        return studentRecord ? getStatusTag(studentRecord) : "-";
      },
      width: 120,
    },
    {
      title: "Bài tập",
      key: "homework",
      render: (_: any, record: AttendanceSession) => {
        const studentRecord = record["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        const completed = studentRecord?.["Bài tập hoàn thành"];
        const total = record["Bài tập"]?.["Tổng số bài"];
        if (completed !== undefined && total) {
          return `${completed}/${total}`;
        }
        return "-";
      },
      width: 80,
    },
    {
      title: "% BTVN",
      key: "homework_percentage",
      render: (_: any, record: AttendanceSession) => {
        const studentRecord = record["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        const percent = studentRecord?.["% Hoàn thành BTVN"];
        return percent !== null && percent !== undefined ? `${percent}%` : "-";
      },
      width: 80,
    },
    {
      title: "Điểm thưởng",
      key: "bonus_points",
      render: (_: any, record: AttendanceSession) => {
        const studentRecord = record["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        return studentRecord?.["Điểm thưởng"] ?? "-";
      },
      width: 90,
    },
    {
      title: "Bài kiểm tra",
      key: "test_name",
      render: (_: any, record: AttendanceSession) => {
        const studentRecord = record["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        return studentRecord?.["Bài kiểm tra"] || "-";
      },
      width: 150,
    },
    {
      title: "Điểm KT",
      key: "test_score",
      render: (_: any, record: AttendanceSession) => {
        const studentRecord = record["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        return studentRecord?.["Điểm kiểm tra"] ?? "-";
      },
      width: 80,
    },
    {
      title: "Điểm",
      key: "score",
      render: (_: any, record: AttendanceSession) => {
        const studentRecord = record["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        return studentRecord?.["Điểm"] ?? "-";
      },
      width: 80,
    },
    {
      title: "Chi tiết điểm",
      key: "scoreDetail",
      width: 120,
      render: (_: any, record: AttendanceSession) => {
        const studentRecord = record["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        const scoreCount = studentRecord?.["Chi tiết điểm"]?.length || 0;
        return (
          <Button
            size="small"
            type="link"
            onClick={() => handleOpenScoreModal(record)}
          >
            {scoreCount > 0 ? `${scoreCount} điểm` : "Xem"}
          </Button>
        );
      },
    },
    {
      title: "Ghi chú",
      key: "note",
      render: (_: any, record: AttendanceSession) => {
        const studentRecord = record["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        return studentRecord?.["Ghi chú"] || "-";
      },
    },
  ];

  const handlePrint = () => {
    // Add print styles
    const style = document.createElement('style');
    style.innerHTML = `
      @media print {
        @page {
          size: A4 landscape;
          margin: 10mm;
        }
        
        body * {
          visibility: hidden;
        }
        
        .print-content, .print-content * {
          visibility: visible;
        }
        
        .print-content {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          background: white;
        }
        
        /* Hide buttons and filters when printing */
        button, .ant-btn, .ant-space-compact, .ant-picker, .ant-input, .no-print {
          display: none !important;
        }
        
        /* Better table styling for print */
        .ant-table {
          font-size: 11px !important;
        }
        
        .ant-table-thead > tr > th {
          background: #f0f0f0 !important;
          font-weight: bold !important;
          padding: 8px 4px !important;
          border: 1px solid #d9d9d9 !important;
        }
        
        .ant-table-tbody > tr > td {
          padding: 6px 4px !important;
          border: 1px solid #d9d9d9 !important;
        }
        
        /* Card styling */
        .ant-card {
          border: 1px solid #d9d9d9 !important;
          box-shadow: none !important;
          page-break-inside: avoid;
        }
        
        .ant-card-head {
          background: #fafafa !important;
          border-bottom: 2px solid #d9d9d9 !important;
        }
        
        /* Statistics cards */
        .ant-statistic {
          page-break-inside: avoid;
        }
        
        /* Descriptions */
        .ant-descriptions-item-label {
          font-weight: bold !important;
        }
        
        /* Tags */
        .ant-tag {
          border: 1px solid currentColor !important;
        }
        
        /* Divider */
        .ant-divider {
          border-color: #d9d9d9 !important;
        }
        
        /* Page breaks */
        .page-break {
          page-break-after: always;
        }
        
        /* Header styling */
        h1, h2, h3, h4 {
          color: #000 !important;
          page-break-after: avoid;
        }
        
        /* Score table styling */
        .score-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          font-size: 10px;
        }
        
        .score-table th,
        .score-table td {
          border: 1px solid #000;
          padding: 4px;
          text-align: center;
        }
        
        .score-table th {
          background: #f0f0f0;
          font-weight: bold;
        }
        
        .subject-header {
          background: #e6f7ff !important;
          font-weight: bold;
          font-size: 12px;
        }
      }
    `;
    document.head.appendChild(style);
    
    setTimeout(() => {
      window.print();
      document.head.removeChild(style);
    }, 250);
  };

  const handleExportScoreTable = () => {
    // Group sessions by subject
    const sessionsBySubject: { [subject: string]: AttendanceSession[] } = {};
    
    filteredSessions.forEach((session) => {
      const subject = session["Tên lớp"]?.split(" - ")[0] || "Chưa phân loại";
      if (!sessionsBySubject[subject]) {
        sessionsBySubject[subject] = [];
      }
      sessionsBySubject[subject].push(session);
    });

    // Generate CSV content
    let csvContent = "\uFEFF"; // UTF-8 BOM for Excel compatibility
    
    Object.entries(sessionsBySubject).forEach(([subject, subjectSessions]) => {
      // Subject header
      csvContent += `Môn ${subject},,,,,,,\n`;
      csvContent += "Ngày,Tên HS,Chuyên cần,% BTVN,Tên bài kiểm tra,Điểm,Điểm thưởng,Nhận xét\n";
      
      // Sort sessions by date
      const sortedSessions = [...subjectSessions].sort(
        (a, b) => new Date(a["Ngày"]).getTime() - new Date(b["Ngày"]).getTime()
      );
      
      // Add data rows
      sortedSessions.forEach((session) => {
        const studentRecord = session["Điểm danh"]?.find(
          (r) => r["Student ID"] === student.id
        );
        
        if (studentRecord) {
          const date = dayjs(session["Ngày"]).format("DD/MM/YYYY");
          const studentName = student["Họ và tên"];
          const attendance = studentRecord["Có mặt"] 
            ? (studentRecord["Đi muộn"] ? "Đi muộn" : "Có mặt")
            : (studentRecord["Vắng có phép"] ? "Vắng có phép" : "Vắng");
          const homeworkPercent = studentRecord["% Hoàn thành BTVN"] ?? "";
          const testName = studentRecord["Bài kiểm tra"] || "";
          const score = studentRecord["Điểm kiểm tra"] ?? studentRecord["Điểm"] ?? "";
          const bonusScore = studentRecord["Điểm thưởng"] ?? "";
          const note = (studentRecord["Ghi chú"] || "").replace(/,/g, ";");
          
          csvContent += `${date},${studentName},${attendance},${homeworkPercent},${testName},${score},${bonusScore},${note}\n`;
        }
      });
      
      csvContent += "\n"; // Empty line between subjects
    });

    // Download CSV file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `bang_diem_${student["Họ và tên"]}_${dayjs().format("YYYYMMDD")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (studentSessions.length === 0) {
    return (
      <div style={{ padding: "24px" }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          style={{ marginBottom: 16 }}
        >
          Quay lại
        </Button>
        <Empty description="Học sinh chưa có lịch sử học tập" />
      </div>
    );
  }

  return (
    <>
      <style>{`
        .score-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          font-size: 12px;
        }
        
        .score-table th,
        .score-table td {
          border: 1px solid #d9d9d9;
          padding: 8px;
          text-align: center;
        }
        
        .score-table th {
          background: #f0f0f0;
          font-weight: bold;
        }
        
        .score-table td:last-child {
          text-align: left;
        }
      `}</style>
      <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
        {/* Action Buttons */}
      <div
        className="no-print"
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          Quay lại
        </Button>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleExportScoreTable}>
            Xuất bảng điểm CSV
          </Button>
          <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>
            In báo cáo
          </Button>
        </Space>
      </div>

      {/* Print Content */}
      <div ref={printRef} className="print-content">
        {/* Header */}
        <div
          style={{
            textAlign: "center",
            marginBottom: 24,
            borderBottom: "3px solid #1890ff",
            paddingBottom: 16,
          }}
        >
          <h1 style={{ color: "#1890ff", margin: 0, fontSize: "28px", fontWeight: "bold" }}>
            BÁO CÁO HỌC TẬP
          </h1>
          <h2 style={{ margin: "8px 0", fontSize: "18px", color: "#333" }}>
            Trung tâm Trí Tuệ 8+
          </h2>
          <p style={{ margin: "4px 0 0 0", color: "#666", fontSize: "14px" }}>
            Ngày xuất: {dayjs().format("DD/MM/YYYY HH:mm")}
          </p>
        </div>

        {/* Student Info */}
        <Card
          title="Thông tin học sinh"
          size="small"
          style={{ marginBottom: 16 }}
        >
          <Descriptions column={2} size="small">
            <Descriptions.Item label="Họ và tên">
              <strong>{student["Họ và tên"]}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="Mã học sinh">
              {student["Mã học sinh"] || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Ngày sinh">
              {student["Ngày sinh"]
                ? dayjs(student["Ngày sinh"]).format("DD/MM/YYYY")
                : "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Số điện thoại">
              {student["Số điện thoại"] || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Email" span={2}>
              {student["Email"] || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Địa chỉ" span={2}>
              {student["Địa chỉ"] || "-"}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* Statistics */}
        <Card
          title="Thống kê chuyên cần"
          size="small"
          style={{ marginBottom: 16 }}
        >
          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title="Tổng số buổi"
                value={stats.totalSessions}
                prefix={<ClockCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Số buổi có mặt"
                value={stats.presentSessions}
                valueStyle={{ color: "#3f8600" }}
                prefix={<CheckCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Số buổi vắng"
                value={stats.absentSessions}
                valueStyle={{ color: "#cf1322" }}
                prefix={<CloseCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Tỷ lệ tham gia"
                value={attendanceRate}
                suffix="%"
                valueStyle={{
                  color: attendanceRate >= 80 ? "#3f8600" : "#cf1322",
                }}
              />
            </Col>
          </Row>
          <Divider />
          <Row gutter={16}>
            <Col span={8}>
              <Statistic
                title="Tổng số giờ học"
                value={stats.totalHours}
                suffix="giờ"
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="Điểm trung bình"
                value={(() => {
                  const allScores: number[] = [];
                  
                  // Collect all scores from sessions
                  studentSessions.forEach((s) => {
                    const studentRecord = s["Điểm danh"]?.find(
                      (r) => r["Student ID"] === student.id
                    );
                    
                    if (studentRecord) {
                      // Check all possible score fields: "Điểm kiểm tra", "Điểm", " Điểm"
                      const singleScore = studentRecord["Điểm kiểm tra"] ?? studentRecord["Điểm"] ?? studentRecord[" Điểm"];
                      if (singleScore !== undefined && singleScore !== null && !isNaN(Number(singleScore))) {
                        allScores.push(Number(singleScore));
                      }
                      
                      // Add all detailed scores if exist
                      const detailedScores = studentRecord["Chi tiết điểm"];
                      if (detailedScores && Array.isArray(detailedScores)) {
                        detailedScores.forEach((detail: any) => {
                          const scoreValue = detail["Điểm"];
                          if (scoreValue !== undefined && scoreValue !== null && !isNaN(Number(scoreValue))) {
                            allScores.push(Number(scoreValue));
                          }
                        });
                      }
                    }
                  });
                  
                  if (allScores.length === 0) return "0.0";
                  return (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1);
                })()}
                suffix="/ 10"
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="Tổng điểm thưởng"
                value={(() => {
                  const bonusPoints = studentSessions
                    .map(
                      (s) =>
                        s["Điểm danh"]?.find(
                          (r) => r["Student ID"] === student.id
                        )?.["Điểm thưởng"]
                    )
                    .filter(
                      (bonus) => bonus !== undefined && bonus !== null
                    ) as number[];
                  if (bonusPoints.length === 0) return 0;
                  return bonusPoints.reduce((a, b) => a + b, 0);
                })()}
                valueStyle={{ color: "#722ed1" }}
                prefix={<GiftOutlined />}
              />
            </Col>
          </Row>
        </Card>

        {/* Filters */}
        <Card title="Bộ lọc" size="small" style={{ marginBottom: 16 }} className="no-print">
          <Space wrap>
            <Space direction="vertical" size="small">
              <span>Lọc theo ngày:</span>
              <DatePicker.RangePicker
                value={dateFilter}
                onChange={(dates) => setDateFilter(dates)}
                format="DD/MM/YYYY"
                placeholder={["Từ ngày", "Đến ngày"]}
              />
            </Space>
            <Space direction="vertical" size="small">
              <span>Lọc theo tên điểm:</span>
              <Input
                placeholder="VD: Kiểm tra 15 phút"
                value={scoreNameFilter}
                onChange={(e) => setScoreNameFilter(e.target.value)}
                allowClear
                style={{ width: 200 }}
                prefix={<FilterOutlined />}
              />
            </Space>
            <Button
              onClick={() => {
                setDateFilter(null);
                setScoreNameFilter("");
              }}
            >
              Xóa bộ lọc
            </Button>
          </Space>
        </Card>

        {/* Session History */}
        <Card title="Lịch sử học tập" size="small">
          <Table
            columns={columns}
            dataSource={filteredSessions}
            rowKey="id"
            pagination={{ pageSize: 20, showSizeChanger: false }}
            size="small"
          />
        </Card>

        {/* Score Tables by Subject - For Print */}
        <div style={{ pageBreakBefore: "always", marginTop: 32 }}>
          <h2 style={{ textAlign: "center", marginBottom: 24 }}>BẢNG ĐIỂM CHI TIẾT</h2>
          {(() => {
            // Group sessions by subject
            const sessionsBySubject: { [subject: string]: AttendanceSession[] } = {};
            
            filteredSessions.forEach((session) => {
              const subject = session["Tên lớp"]?.split(" - ")[0] || "Chưa phân loại";
              if (!sessionsBySubject[subject]) {
                sessionsBySubject[subject] = [];
              }
              sessionsBySubject[subject].push(session);
            });

            return Object.entries(sessionsBySubject).map(([subject, subjectSessions]) => {
              // Sort sessions by date
              const sortedSessions = [...subjectSessions].sort(
                (a, b) => new Date(a["Ngày"]).getTime() - new Date(b["Ngày"]).getTime()
              );

              return (
                <div key={subject} style={{ marginBottom: 32, pageBreakInside: "avoid" }}>
                  <h3 style={{ marginBottom: 16 }}>Môn {subject}</h3>
                  <table className="score-table">
                    <thead>
                      <tr>
                        <th>Ngày</th>
                        <th>Tên HS</th>
                        <th>Chuyên cần</th>
                        <th>% BTVN</th>
                        <th>Tên bài kiểm tra</th>
                        <th>Điểm</th>
                        <th>Điểm thưởng</th>
                        <th>Nhận xét</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSessions.map((session) => {
                        const studentRecord = session["Điểm danh"]?.find(
                          (r) => r["Student ID"] === student.id
                        );
                        
                        if (!studentRecord) return null;

                        const attendance = studentRecord["Có mặt"] 
                          ? (studentRecord["Đi muộn"] ? "Đi muộn" : "Có mặt")
                          : (studentRecord["Vắng có phép"] ? "Vắng có phép" : "Vắng");

                        return (
                          <tr key={session.id}>
                            <td>{dayjs(session["Ngày"]).format("DD/MM/YYYY")}</td>
                            <td>{student["Họ và tên"]}</td>
                            <td>{attendance}</td>
                            <td>{studentRecord["% Hoàn thành BTVN"] ?? "-"}</td>
                            <td>{studentRecord["Bài kiểm tra"] || "-"}</td>
                            <td>{studentRecord["Điểm kiểm tra"] ?? studentRecord["Điểm"] ?? "-"}</td>
                            <td>{studentRecord["Điểm thưởng"] ?? "-"}</td>
                            <td style={{ textAlign: "left" }}>{studentRecord["Ghi chú"] || "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            });
          })()}
        </div>
        
        {/* Score Detail Modal */}
        <ScoreDetailModal
          visible={isScoreModalVisible}
          onClose={() => {
            setIsScoreModalVisible(false);
            setSelectedSession(null);
          }}
          session={selectedSession}
          studentId={student.id}
          studentName={student["Họ và tên"]}
        />

        {/* Footer */}
        <div
          style={{
            marginTop: 32,
            paddingTop: 16,
            borderTop: "2px solid #d9d9d9",
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <div style={{ textAlign: "center" }}>
                <p style={{ margin: "8px 0", fontWeight: "bold" }}>Giáo viên</p>
                <p style={{ margin: "40px 0 8px 0" }}>................................</p>
                <p style={{ margin: 0, fontSize: "12px", color: "#666" }}>(Ký và ghi rõ họ tên)</p>
              </div>
            </Col>
            <Col span={12}>
              <div style={{ textAlign: "center" }}>
                <p style={{ margin: "8px 0", fontWeight: "bold" }}>Phụ huynh</p>
                <p style={{ margin: "40px 0 8px 0" }}>................................</p>
                <p style={{ margin: 0, fontSize: "12px", color: "#666" }}>(Ký và ghi rõ họ tên)</p>
              </div>
            </Col>
          </Row>
          <Divider />
          <div style={{ textAlign: "center", fontSize: 12, color: "#999" }}>
            <p style={{ margin: "4px 0" }}>Báo cáo này được tạo tự động từ hệ thống quản lý học sinh</p>
            <p style={{ margin: "4px 0" }}>Mọi thắc mắc xin liên hệ với giáo viên hoặc ban quản lý</p>
            <p style={{ margin: "4px 0", fontWeight: "bold" }}>Trung tâm Trí Tuệ 8+ - Hotline: [Số điện thoại]</p>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default StudentReportPage;
