import React, { useState, useRef } from "react";
import domtoimage from "dom-to-image-more";
import {
  Button,
  Input,
  Tabs,
  Form,
  Card,
  Row,
  Col,
  Typography,
  Space,
  message,
} from "antd";
import {
  DownloadOutlined,
  MoneyCollectOutlined,
  PayCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

// Helper functions
const parseMoney = (value: any) => {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return parseFloat(value.toString().replace(/,/g, ""));
};

const formatVND = (value: any) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(parseMoney(value));
};


const { TextArea } = Input;
const { Title, Text } = Typography;
const { TabPane } = Tabs;

const COLORS = {
  default: "#36797f",
  dark: "#36797f",
  light: "#a2e1e6",
};

interface TuitionData {
  studentName: string;
  month: string;
  totalSessions: number;
  pricePerSession: string;
  totalAmount: string;
  note: string;
  studentClass?: string; // Khối lớp
  discount?: string; // Miễn giảm
  debtDetail1?: string; // Chi tiết nợ dòng 1
  debtDetail2?: string; // Chi tiết nợ dòng 2
  subjects?: Array<{
    subject: string;
    class: string;
    sessions: number;
    pricePerSession: string;
    total: string;
  }>; // Danh sách môn học (optional, nếu không có thì dùng dữ liệu tổng hợp)
}

interface SalaryData {
  teacherName: string;
  month: string;
  subjects?: string[];
  subject?: string;
  totalSessions?: number;
  totalSalary?: number;
  tongLuong?: any;
  caTH?: any;
  luongTH?: any;
  caTHCS?: any;
  luongTHCS?: any;
  caTHPT?: any;
  luongTHPT?: any;
  details?: any[];
  [key: string]: any;
}

// Generate VietQR URL with hardcoded bank info
const generateVietQR = (
  amount: string,
  studentName: string,
  month: string
): string => {
  const bankId = "VPB"; // VPBank
  const accountNo = "4319888";
  const accountName = "NGUYEN THI HOA";
  const numericAmount = amount.replace(/[^0-9]/g, "");
  const description = `HP T${month} ${studentName}`;
  return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact.png?amount=${numericAmount}&addInfo=${encodeURIComponent(
    description
  )}&accountName=${encodeURIComponent(accountName)}`;
};

// Helper function to export as image
const exportAsImage = async (element: HTMLElement, filename: string) => {
  try {
    console.log("Starting export...");

    // Use the statically imported domtoimage (pre-bundled by Vite).
    // If for some reason it's not available, attempt a dynamic import as a fallback.
    const impl =
      (domtoimage as any) || (await import("dom-to-image-more")).default;

    if (!impl || typeof impl.toBlob !== "function") {
      throw new Error("dom-to-image-more is not available in this environment");
    }

    // Convert to blob. Measure element and apply scale so the full area is captured
    const rect = element.getBoundingClientRect();
    const scale = 2; // increase for higher-resolution output
    const width = Math.round(rect.width * scale);
    const height = Math.round(rect.height * scale);

    const blob = await impl.toBlob(element, {
      bgcolor: "#ffffff",
      quality: 1,
      // supply scaled pixel dimensions to the library
      width,
      height,
      // keep the visual size the same while scaling the rendering
      style: {
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        width: `${Math.round(rect.width)}px`,
        height: `${Math.round(rect.height)}px`,
      },
      // make the canvas used by dom-to-image-more high-DPI aware
      // (some versions support 'canvas' or 'canvasWidth' options; leaving defaults)
    });

    console.log("Image created successfully");

    // Download
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = filename;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log("Image downloaded successfully");
  } catch (error) {
    console.error("Error exporting image:", error);
    message.error(
      `Lỗi khi xuất ảnh: ${error instanceof Error ? error.message : "Không xác định"
      }\n\nThử refresh lại trang, xóa cache dev server (node_modules/.vite) và khởi động lại dev server!`
    );
  }
};

export const TuitionReceipt: React.FC<{
  data: TuitionData;
  onExport: () => void;
}> = ({ data, onExport }) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (receiptRef.current) {
      try {
        setIsExporting(true);
        await exportAsImage(
          receiptRef.current,
          `Hoc_Phi_${data.studentName.replace(/\s+/g, "_")}_Thang_${data.month
          }.png`
        );
        onExport();
      } catch (error) {
        console.error("Export failed:", error);
      } finally {
        setIsExporting(false);
      }
    }
  };

  // Get bank info for payment info
  const bankId = "VPB"; // VPBank
  const accountNo = "4319888";
  const accountName = "NGUYEN THI HOA";

  // Map subject icons
  const getSubjectIcon = (subject: string) => {
    const lowerSubject = subject.toLowerCase();
    if (lowerSubject.includes("toán") || lowerSubject.includes("math")) return "fa-calculator";
    if (lowerSubject.includes("văn") || lowerSubject.includes("literature")) return "fa-pen-nib";
    if (lowerSubject.includes("anh") || lowerSubject.includes("english")) return "fa-language";
    if (lowerSubject.includes("khoa") || lowerSubject.includes("science")) return "fa-flask";
    if (lowerSubject.includes("thuyết trình") || lowerSubject.includes("presentation")) return "fa-user-tie";
    if (lowerSubject.includes("kỹ năng") || lowerSubject.includes("skill")) return "fa-gear";
    return "fa-book";
  };

  // Prepare subjects array - if data.subjects exists use it, otherwise create from total data
  const subjects = data.subjects && data.subjects.length > 0
    ? data.subjects
    : [{
      subject: "Học phí",
      class: data.studentClass || "Lớp",
      sessions: data.totalSessions,
      pricePerSession: data.pricePerSession.replace(/[^0-9]/g, ""),
      total: data.totalAmount.replace(/[^0-9]/g, ""),
    }];

  // Calculate totals
  const totalSessions = subjects.reduce((sum, s) => sum + s.sessions, 0);
  const totalAmount = subjects.reduce((sum, s) => sum + parseInt(s.total.replace(/[^0-9]/g, "") || "0"), 0);

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: "20px", backgroundColor: "#f0f0f0", fontFamily: "'Roboto', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: "800px" }}>
        <div style={{ marginBottom: "20px", display: "flex", justifyContent: "flex-end" }}>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExport}
            loading={isExporting}
            style={{ backgroundColor: "#103458" }}
          >
            {isExporting ? "Đang xuất..." : "📸 Xuất ảnh"}
          </Button>
        </div>

        <div
          ref={receiptRef}
          style={{
            width: "100%",
            maxWidth: "800px",
            background: "#fff",
            boxShadow: "0 5px 15px rgba(0,0,0,0.1)",
            overflow: "hidden",
            position: "relative",
            borderRadius: "8px",
          }}
        >
          {/* Background Logo */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <img
              src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2F5efd9944.%E1%BA%A2nh.120320.png"
              alt="Background Logo"
              style={{
                width: "auto",
                height: "400px",
                maxWidth: "400px",
                objectFit: "contain",
                opacity: 0.3,
                filter: "grayscale(20%) brightness(1.1)",
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
          </div>

          {/* Watermark */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              fontSize: "40px",
              fontWeight: "bold",
              color: "rgba(0,0,0,0.03)",
              zIndex: 0,
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            TRUNG TÂM HỌC TẬP
          </div>

          {/* Header */}
          <div
            style={{
              backgroundColor: "#103458",
              color: "#fccf6e",
              textAlign: "center",
              padding: "25px 10px",
              position: "relative",
              zIndex: 1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "15px", marginBottom: "15px" }}>
              <img
                src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2F323065b6.%E1%BA%A2nh.115930.png"
                alt="Logo Trí Tuệ 8+"
                style={{
                  height: "50px",
                  width: "auto",
                  objectFit: "contain",
                }}
              />
              <div style={{ fontSize: "20px", fontWeight: 500, color: "#fccf6e" }}>
                Trung tâm trí tuệ 8+
              </div>
            </div>
            <h1 style={{ textTransform: "uppercase", fontSize: "28px", fontWeight: 700, letterSpacing: "1px", margin: 0 }}>
              PHIẾU THU HỌC PHÍ THÁNG {data.month}
            </h1>
          </div>

          {/* Info Section */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "30px 40px",
              color: "#103458",
              position: "relative",
              zIndex: 1,
            }}
          >
            <div style={{ width: "48%" }}>
              <h3 style={{ textTransform: "uppercase", fontSize: "18px", marginBottom: "15px", fontWeight: 700 }}>
                THÔNG TIN HỌC SINH
              </h3>
              <div style={{ marginBottom: "8px", fontSize: "15px", color: "#444" }}>
                <strong>Họ và tên:</strong> {data.studentName}
              </div>
              <div style={{ marginBottom: "8px", fontSize: "15px", color: "#444" }}>
                <strong>Khối lớp:</strong> {data.studentClass || "Chưa xác định"}
              </div>
            </div>
            <div style={{ width: "48%" }}>
              <h3 style={{ textTransform: "uppercase", fontSize: "18px", marginBottom: "15px", fontWeight: 700 }}>
                THÔNG TIN THANH TOÁN
              </h3>
              <div style={{ marginBottom: "8px", fontSize: "15px", color: "#444" }}>
                <strong>Tên người nhận:</strong> {accountName}
              </div>
              <div style={{ marginBottom: "8px", fontSize: "15px", color: "#444" }}>
                <strong>Số tài khoản:</strong> {accountNo}
              </div>
            </div>
          </div>

          {/* Table */}
          <div style={{ padding: "0 40px", position: "relative", zIndex: 1 }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                borderRadius: "10px 10px 0 0",
                overflow: "hidden",
              }}
            >
              <thead style={{ backgroundColor: "#103458", color: "white" }}>
                <tr>
                  <th style={{ padding: "15px", textAlign: "center", fontWeight: 500 }}>Môn học</th>
                  <th style={{ padding: "15px", textAlign: "center", fontWeight: 500 }}>Lớp</th>
                  <th style={{ padding: "15px", textAlign: "center", fontWeight: 500 }}>Số buổi</th>
                  <th style={{ padding: "15px", textAlign: "center", fontWeight: 500 }}>Giá/buổi</th>
                  <th style={{ padding: "15px", textAlign: "center", fontWeight: 500 }}>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((item, index) => {
                  const priceNum = parseInt(item.pricePerSession.replace(/[^0-9]/g, "") || "0");
                  const totalNum = parseInt(item.total.replace(/[^0-9]/g, "") || "0");
                  return (
                    <tr
                      key={index}
                      style={{
                        backgroundColor: index % 2 === 0 ? "#fff" : "#eef6fb",
                      }}
                    >
                      <td style={{ padding: "12px 15px 12px 20px", textAlign: "left", color: "#333", borderBottom: "1px solid #ddd" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: 500 }}>
                          <i className={`fa-solid ${getSubjectIcon(item.subject)}`} style={{ color: "#103458", width: "20px" }}></i>
                          {item.subject}
                        </div>
                      </td>
                      <td style={{ padding: "12px 15px", textAlign: "center", color: "#333", borderBottom: "1px solid #ddd" }}>
                        {item.class}
                      </td>
                      <td style={{ padding: "12px 15px", textAlign: "center", color: "#333", borderBottom: "1px solid #ddd" }}>
                        {item.sessions}
                      </td>
                      <td style={{ padding: "12px 15px", textAlign: "center", color: "#333", borderBottom: "1px solid #ddd" }}>
                        {priceNum.toLocaleString("vi-VN")}
                      </td>
                      <td style={{ padding: "12px 15px", textAlign: "center", color: "#333", borderBottom: "1px solid #ddd" }}>
                        {totalNum.toLocaleString("vi-VN")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "20px 40px 40px 40px",
              position: "relative",
              zIndex: 1,
            }}
          >
            {/* Tags Section */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px", justifyContent: "flex-end" }}>
              {data.discount && (
                <span
                  style={{
                    backgroundColor: "#f25c78",
                    color: "white",
                    padding: "5px 10px",
                    borderRadius: "5px",
                    fontSize: "14px",
                    fontWeight: "bold",
                    display: "inline-block",
                  }}
                >
                  Miễn giảm
                </span>
              )}
              <span
                style={{
                  backgroundColor: "#f25c78",
                  color: "white",
                  padding: "5px 10px",
                  borderRadius: "5px",
                  fontSize: "14px",
                  fontWeight: "bold",
                  display: "inline-block",
                }}
              >
                Tổng học phí
              </span>
            </div>

            <div
              style={{
                display: "flex",
                gap: "30px",
                marginBottom: "30px",
              }}
            >
              <div style={{ flex: "1.2", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div
                    style={{
                      backgroundColor: "#f25c78",
                      color: "white",
                      display: "inline-block",
                      padding: "8px 15px",
                      borderRadius: "6px",
                      fontWeight: "bold",
                      marginBottom: "10px",
                      width: "fit-content",
                    }}
                  >
                    Chi tiết nợ
                  </div>
                  <div
                    style={{
                      width: "100%",
                      backgroundColor: "#eef6fb",
                      border: "none",
                      height: "40px",
                      borderRadius: "8px",
                      marginBottom: "10px",
                      padding: "8px 12px",
                      fontSize: "14px",
                      color: "#333",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {data.debtDetail1 || ""}
                  </div>
                  <div
                    style={{
                      width: "100%",
                      backgroundColor: "#eef6fb",
                      border: "none",
                      height: "40px",
                      borderRadius: "8px",
                      marginBottom: "10px",
                      padding: "8px 12px",
                      fontSize: "14px",
                      color: "#333",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {data.debtDetail2 || ""}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: "#103458",
                    color: "#fccf6e",
                    padding: "15px",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    marginTop: "10px",
                  }}
                >
                  <span style={{ fontSize: "18px", fontWeight: "bold", color: "white", marginRight: "5px" }}>
                    TỔNG TIỀN: <span style={{ backgroundColor: "#f25c78", color: "white", padding: "3px 8px", borderRadius: "4px", marginLeft: "5px", fontSize: "0.9em" }}>T{data.month}</span>
                  </span>
                  <span style={{ color: "#fccf6e", fontWeight: "bold", fontSize: "20px" }}>
                    {totalAmount.toLocaleString("vi-VN")} đ
                  </span>
                </div>
              </div>
            </div>

            {/* QR Code Section - Moved to bottom */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%" }}>
              <div
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "15px",
                  padding: "10px",
                  textAlign: "center",
                  background: "white",
                  width: "100%",
                  maxWidth: "200px",
                  position: "relative",
                  marginBottom: "15px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginBottom: "5px", color: "red", fontWeight: "bold", fontSize: "12px" }}>
                  <span>VIETQR</span> <span>VIETQR</span>
                </div>
                <img
                  src={generateVietQR(data.totalAmount, data.studentName, data.month)}
                  alt="QR Code"
                  style={{ width: "100%", height: "auto", display: "block" }}
                  crossOrigin="anonymous"
                />
                <div style={{ fontSize: "12px", marginTop: "5px", fontWeight: "bold" }}>
                  Quét mã để thanh toán
                </div>
              </div>

              <div style={{ fontSize: "11px", color: "#666", textAlign: "center", lineHeight: "1.4", maxWidth: "500px" }}>
                Ghi chú: Vui lòng ghi rõ nội dung chuyển khoản: {data.studentName} - T{data.month}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SalarySlip: React.FC<{
  data: SalaryData;
  onExport: () => void;
}> = ({ data, onExport }) => {
  const salaryRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Adapter: Convert old data structure to new detail structure if details is missing
  const derivedDetails: {
    className: string;
    subject: string;
    sessionCount: number | string;
    totalSalary: number | string;
  }[] = data.details || [];

  if (derivedDetails.length === 0) {
    if (data.caTH && parseMoney(data.caTH) > 0) {
      derivedDetails.push({
        className: "Khối Tiểu Học",
        subject: data.subject || "Toán",
        sessionCount: data.caTH,
        totalSalary: parseMoney(data.luongTH),
      });
    }
    if (data.caTHCS && parseMoney(data.caTHCS) > 0) {
      derivedDetails.push({
        className: "Khối THCS",
        subject: data.subject || "Toán",
        sessionCount: data.caTHCS,
        totalSalary: parseMoney(data.luongTHCS),
      });
    }
    if (data.caTHPT && parseMoney(data.caTHPT) > 0) {
      derivedDetails.push({
        className: "Khối THPT",
        subject: data.subject || "Toán",
        sessionCount: data.caTHPT,
        totalSalary: parseMoney(data.luongTHPT),
      });
    }
  }

  const subjects =
    data.subjects && data.subjects.length > 0
      ? data.subjects
      : [data.subject].filter(Boolean);
  const totalSessions =
    data.totalSessions !== undefined
      ? data.totalSessions
      : parseMoney(data.caTH) +
      parseMoney(data.caTHCS) +
      parseMoney(data.caTHPT);

  const totalSalaryValue =
    data.totalSalary !== undefined
      ? data.totalSalary
      : parseMoney(data.tongLuong);

  const currentData = {
    ...data,
    details: derivedDetails,
    subjects,
    totalSessions,
    totalSalary: totalSalaryValue,
  };

  const handleExport = async () => {
    if (salaryRef.current) {
      try {
        setIsExporting(true);
        await exportAsImage(
          salaryRef.current,
          `Phieu_Luong_${data.teacherName.replace(/\s+/g, "_")}_Thang_${data.month
          }.png`
        );
        onExport();
      } catch (error) {
        console.error("Export failed:", error);
      } finally {
        setIsExporting(false);
      }
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 0" }}>
      {/* Export Button */}
      <div style={{ width: "210mm", marginBottom: "16px", display: "flex", justifyContent: "flex-end" }}>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={handleExport}
          loading={isExporting}
          style={{ backgroundColor: "#003a6b" }}
        >
          {isExporting ? "Đang xuất..." : "📸 Xuất ảnh A5"}
        </Button>
      </div>

      {/* Main Salary Slip Container - A5 Landscape Size (210mm x ~148mm) */}
      <div
        ref={salaryRef}
        style={{
          width: "210mm", // Chiều rộng chuẩn A5 Landscape (bằng chiều rộng A4 dọc)
          minHeight: "148mm", // Chiều cao chuẩn A5 Landscape
          backgroundColor: "white",
          borderRadius: "0", // Bỏ border radius để in ra vuông vắn hơn
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)", // Shadow nhẹ
          border: "1px solid #e0e0e0",
          position: "relative",
          overflow: "hidden",
          fontFamily: "'Times New Roman', Times, serif",
          fontSize: "12px", // Giảm nhẹ font size cho hợp khổ A5
          boxSizing: "border-box"
        }}
      >
        {/* Header Section */}
        <div
          style={{
            backgroundColor: "#003a6b",
            padding: "10px 20px", // Giảm padding vertical
            color: "white",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <img
                src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2F323065b6.%E1%BA%A2nh.115930.png"
                alt="Logo"
                style={{
                  width: "40px",
                  height: "40px",
                  objectFit: "contain",
                  marginRight: "12px",
                  backgroundColor: "white",
                  borderRadius: "50%",
                  padding: "2px",
                }}
              />
              <div>
                <div style={{ fontSize: "11px", fontWeight: 500, textTransform: "uppercase", opacity: 0.9, fontFamily: "'Times New Roman', Times, serif" }}>
                  TRUNG TÂM TRI TUỆ 8+
                </div>
                <div style={{ fontSize: "18px", fontWeight: "bold", textTransform: "uppercase", lineHeight: "1.2", fontFamily: "'Times New Roman', Times, serif" }}>
                  Phiếu Lương Giáo Viên
                </div>
              </div>
            </div>

            {/* Đưa Tháng lên header cùng hàng để tiết kiệm diện tích dọc */}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "14px", fontWeight: "bold", textTransform: "uppercase" }}>
                THÁNG {currentData.month}
              </div>
              <div style={{ fontSize: "11px", fontStyle: "italic", opacity: 0.8 }}>
                {dayjs().format("DD/MM/YYYY")}
              </div>
            </div>
          </div>
        </div>

        {/* Body Section */}
        <div style={{ padding: "16px 20px", position: "relative" }}>
          {/* Background Logo Watermark */}
          <div
            style={{
              position: "absolute",
              top: "55%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 0,
              pointerEvents: "none",
            }}
          >
            <img
              src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2F323065b6.%E1%BA%A2nh.115930.png"
              alt="Background Logo"
              style={{
                width: "200px",
                opacity: 0.06,
                filter: "grayscale(100%)",
              }}
            />
          </div>

          <div style={{ position: "relative", zIndex: 10 }}>
            {/* Info Columns: Adjusted Ratios */}
            <div style={{ display: "flex", gap: "15px", marginBottom: "15px" }}>

              {/* Teacher Info - Reduced Width (30%) */}
              <div style={{ flex: "0.3" }}>
                <div
                  style={{
                    borderLeft: "3px solid #003a6b",
                    paddingLeft: "8px",
                    marginBottom: "8px",
                    color: "#003a6b",
                    fontWeight: "bold",
                    fontSize: "12px",
                    textTransform: "uppercase",
                  }}
                >
                  GIÁO VIÊN
                </div>
                <div
                  style={{
                    backgroundColor: "#f9fbfd",
                    padding: "10px",
                    borderRadius: "6px",
                    height: "100%", // Fill height
                  }}
                >
                  <div style={{ marginBottom: "6px" }}>
                    <div style={{ color: "#666", fontSize: "11px" }}>Họ và tên</div>
                    <strong style={{ color: "#333", fontSize: "13px", display: 'block' }}>{currentData.teacherName}</strong>
                  </div>
                  <div style={{ marginBottom: "6px" }}>
                    <div style={{ color: "#666", fontSize: "11px" }}>Môn chính</div>
                    <strong style={{ color: "#333", fontSize: "12px" }}>{currentData.subjects.join(", ")}</strong>
                  </div>
                  <div>
                    <span style={{ color: "#666", fontSize: "11px" }}>Số buổi: </span>
                    <strong style={{ color: "#333", fontSize: "12px" }}>{currentData.totalSessions}</strong>
                  </div>
                </div>
              </div>

              {/* Bank Info & Total - Increased Width (70%) */}
              <div style={{ flex: "0.7" }}>
                <div
                  style={{
                    borderLeft: "3px solid #003a6b",
                    paddingLeft: "8px",
                    marginBottom: "8px",
                    color: "#003a6b",
                    fontWeight: "bold",
                    fontSize: "12px",
                    textTransform: "uppercase",
                  }}
                >
                  THANH TOÁN
                </div>
                <div
                  style={{
                    backgroundColor: "#f9fbfd",
                    padding: "10px",
                    borderRadius: "6px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    height: "100%"
                  }}
                >
                  {/* Hàng thông tin bank rút gọn */}
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", borderBottom: "1px dashed #eee", paddingBottom: "4px" }}>
                    <span style={{ color: "#666" }}>Ngân hàng/STK:</span>
                    <strong style={{ color: "#333" }}>---</strong>
                  </div>

                  {/* Tổng lương to rõ */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
                    <span style={{ color: "#666", fontWeight: 600 }}>THỰC NHẬN:</span>
                    <strong style={{ color: "#d32f2f", fontSize: "20px" }}>
                      {formatVND(currentData.totalSalary)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Salary Table */}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                borderRadius: "6px 6px 0 0",
                overflow: "hidden",
                fontSize: "12px",
                border: "1px solid #eee"
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#003a6b", color: "white" }}>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, width: "45%" }}>LỚP HỌC</th>
                  <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 600 }}>SỐ BUỔI</th>
                  <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>THÀNH TIỀN</th>
                </tr>
              </thead>
              <tbody>
                {currentData.details.map((detail, index) => (
                  <tr key={index} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "8px 10px", color: "#333", borderRight: "1px solid #eee" }}>
                      <div style={{ fontWeight: 600 }}>{detail.className}</div>
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "center",
                        color: "#333",
                        borderRight: "1px solid #eee",
                      }}
                    >
                      {detail.sessionCount}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                        fontWeight: 500,
                        color: "#333",
                      }}
                    >
                      {formatVND(detail.totalSalary)}
                    </td>
                  </tr>
                ))}

                {/* Tổng cộng Row */}
                <tr style={{ backgroundColor: "#f0f7ff", fontWeight: "bold", borderTop: "2px solid #003a6b" }}>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "#003a6b" }}>TỔNG</td>
                  <td style={{ padding: "8px 10px", textAlign: "center", color: "#003a6b" }}>
                    {currentData.totalSessions}
                  </td>
                  <td
                    style={{
                      padding: "8px 10px",
                      textAlign: "right",
                      color: "#003a6b",
                      fontSize: "14px",
                    }}
                  >
                    {formatVND(currentData.totalSalary)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Footer Note */}
            <div
              style={{
                marginTop: "15px",
                fontSize: "11px",
                color: "#888",
                fontStyle: "italic",
                borderTop: "1px solid #eee",
                paddingTop: "8px",
                textAlign: "center"
              }}
            >
              Vui lòng kiểm tra và báo lại sai sót (nếu có) trong vòng 3 ngày.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Receipts: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"tuition" | "salary">("tuition");

  // Tuition form state
  const [tuitionData, setTuitionData] = useState<TuitionData>({
    studentName: "Con Phạm Hữu Minh",
    month: "10",
    totalSessions: 9,
    pricePerSession: "150,000",
    totalAmount: "1,350,000",
    note: "Phụ huynh vui lòng hoàn thành học phí cho con bằng cách quét mã QR.",
    studentClass: "",
    discount: "",
    debtDetail1: "",
    debtDetail2: "",
  });

  // Salary form state
  const [salaryData, setSalaryData] = useState<SalaryData>({
    teacherName: "Nguyễn Văn A",
    month: "10",
    subject: "Tiếng Anh",
    caTH: "10",
    luongTH: "500,000",
    caTHCS: "8",
    luongTHCS: "400,000",
    caTHPT: "6",
    luongTHPT: "300,000",
    tongLuong: "1,200,000",
    note: "Thầy Cô kiểm tra kỹ thông tin và tiền lương.",
  });

  // Calculate total amount for tuition
  const calculateTuitionTotal = () => {
    const sessions = Number(tuitionData.totalSessions) || 0;
    const price =
      Number(tuitionData.pricePerSession.replace(/[^0-9]/g, "")) || 0;
    const total = sessions * price;
    setTuitionData({
      ...tuitionData,
      totalAmount: total.toLocaleString("vi-VN"),
    });
  };

  // Calculate total salary
  const calculateSalaryTotal = () => {
    const th = Number(salaryData.luongTH.replace(/[^0-9]/g, "")) || 0;
    const thcs = Number(salaryData.luongTHCS.replace(/[^0-9]/g, "")) || 0;
    const thpt = Number(salaryData.luongTHPT.replace(/[^0-9]/g, "")) || 0;
    const total = th + thcs + thpt;
    setSalaryData({
      ...salaryData,
      tongLuong: total.toLocaleString("vi-VN"),
    });
  };

  return (
    <Card style={{ marginBottom: 32 }}>
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as "tuition" | "salary")}
        type="card"
      >
        <TabPane
          tab={
            <Space>
              <MoneyCollectOutlined />
              Phiếu Thu Học Phí
            </Space>
          }
          key="tuition"
        >
          <div className="p-6">
            <div className="space-y-8">
              {/* Form */}
              <div className="space-y-4">
                <Title level={4} style={{ color: "#36797f", marginBottom: 16 }}>
                  📝 Nhập thông tin học phí
                </Title>

                <Row gutter={[16, 16]}>
                  <Col xs={24} md={12}>
                    <div>
                      <Text
                        strong
                        style={{ display: "block", marginBottom: 8 }}
                      >
                        Tên học sinh
                      </Text>
                      <Input
                        value={tuitionData.studentName}
                        onChange={(e) =>
                          setTuitionData({
                            ...tuitionData,
                            studentName: e.target.value,
                          })
                        }
                        placeholder="VD: Con Phạm Hữu Minh"
                      />
                    </div>
                  </Col>

                  <Col xs={24} md={12}>
                    <div>
                      <Text
                        strong
                        style={{ display: "block", marginBottom: 8 }}
                      >
                        Tháng
                      </Text>
                      <Input
                        value={tuitionData.month}
                        onChange={(e) =>
                          setTuitionData({
                            ...tuitionData,
                            month: e.target.value,
                          })
                        }
                        placeholder="VD: 10"
                      />
                    </div>
                  </Col>
                </Row>

                <Row gutter={[16, 16]}>
                  <Col xs={24} md={8}>
                    <div>
                      <Text
                        strong
                        style={{ display: "block", marginBottom: 8 }}
                      >
                        Tổng số buổi học
                      </Text>
                      <Input
                        type="number"
                        value={tuitionData.totalSessions}
                        onChange={(e) =>
                          setTuitionData({
                            ...tuitionData,
                            totalSessions: Number(e.target.value),
                          })
                        }
                        onBlur={calculateTuitionTotal}
                        placeholder="VD: 9"
                      />
                    </div>
                  </Col>

                  <Col xs={24} md={8}>
                    <div>
                      <Text
                        strong
                        style={{ display: "block", marginBottom: 8 }}
                      >
                        Học phí/buổi (VNĐ)
                      </Text>
                      <Input
                        value={tuitionData.pricePerSession}
                        onChange={(e) =>
                          setTuitionData({
                            ...tuitionData,
                            pricePerSession: e.target.value,
                          })
                        }
                        onBlur={calculateTuitionTotal}
                        placeholder="VD: 150,000"
                      />
                    </div>
                  </Col>

                  <Col xs={24} md={8}>
                    <div>
                      <Text
                        strong
                        style={{ display: "block", marginBottom: 8 }}
                      >
                        Tổng học phí (VNĐ)
                      </Text>
                      <Input
                        value={tuitionData.totalAmount}
                        readOnly
                        style={{ fontWeight: "bold", color: "#36797f" }}
                      />
                    </div>
                  </Col>
                </Row>

                <Row gutter={[16, 16]}>
                  <Col xs={24} md={12}>
                    <div>
                      <Text strong style={{ display: "block", marginBottom: 8 }}>
                        Khối lớp
                      </Text>
                      <Input
                        value={tuitionData.studentClass || ""}
                        onChange={(e) =>
                          setTuitionData({ ...tuitionData, studentClass: e.target.value })
                        }
                        placeholder="VD: Lớp 5"
                      />
                    </div>
                  </Col>
                  <Col xs={24} md={12}>
                    <div>
                      <Text strong style={{ display: "block", marginBottom: 8 }}>
                        Miễn giảm (VNĐ)
                      </Text>
                      <Input
                        value={tuitionData.discount || ""}
                        onChange={(e) =>
                          setTuitionData({ ...tuitionData, discount: e.target.value })
                        }
                        placeholder="VD: 100,000"
                      />
                    </div>
                  </Col>
                </Row>

                <Row gutter={[16, 16]}>
                  <Col xs={24} md={12}>
                    <div>
                      <Text strong style={{ display: "block", marginBottom: 8 }}>
                        Chi tiết nợ (Dòng 1)
                      </Text>
                      <Input
                        value={tuitionData.debtDetail1 || ""}
                        onChange={(e) =>
                          setTuitionData({ ...tuitionData, debtDetail1: e.target.value })
                        }
                        placeholder="Nhập chi tiết nợ..."
                      />
                    </div>
                  </Col>
                  <Col xs={24} md={12}>
                    <div>
                      <Text strong style={{ display: "block", marginBottom: 8 }}>
                        Chi tiết nợ (Dòng 2)
                      </Text>
                      <Input
                        value={tuitionData.debtDetail2 || ""}
                        onChange={(e) =>
                          setTuitionData({ ...tuitionData, debtDetail2: e.target.value })
                        }
                        placeholder="Nhập chi tiết nợ..."
                      />
                    </div>
                  </Col>
                </Row>

                <div>
                  <Text strong style={{ display: "block", marginBottom: 8 }}>
                    Ghi chú
                  </Text>
                  <TextArea
                    rows={3}
                    value={tuitionData.note}
                    onChange={(e) =>
                      setTuitionData({ ...tuitionData, note: e.target.value })
                    }
                    placeholder="Ghi chú cho phụ huynh..."
                  />
                </div>
              </div>

              {/* Preview */}
              <div>
                <Title level={4} style={{ color: "#36797f", marginBottom: 16 }}>
                  👁️ Xem trước phiếu thu
                </Title>
                <TuitionReceipt
                  data={{
                    ...tuitionData,
                    pricePerSession: `${tuitionData.pricePerSession} Đ`,
                    totalAmount: `${tuitionData.totalAmount} Đ`,
                  }}
                  onExport={() => {
                    message.success("Đã xuất ảnh thành công!");
                  }}
                />
              </div>
            </div>
          </div>
        </TabPane>
        <TabPane
          tab={
            <Space>
              <PayCircleOutlined />
              Phiếu Lương Giáo Viên
            </Space>
          }
          key="salary"
        >
          <div className="p-6">
            <div className="space-y-8">
              {/* Form */}
              <div className="space-y-4">
                <Title level={4} style={{ color: "#36797f", marginBottom: 16 }}>
                  📝 Nhập thông tin lương
                </Title>

                <Row gutter={[16, 16]}>
                  <Col xs={24} md={12}>
                    <div>
                      <Text
                        strong
                        style={{ display: "block", marginBottom: 8 }}
                      >
                        Tên giáo viên
                      </Text>
                      <Input
                        value={salaryData.teacherName}
                        onChange={(e) =>
                          setSalaryData({
                            ...salaryData,
                            teacherName: e.target.value,
                          })
                        }
                        placeholder="VD: Nguyễn Văn A"
                      />
                    </div>
                  </Col>

                  <Col xs={24} md={12}>
                    <div>
                      <Text
                        strong
                        style={{ display: "block", marginBottom: 8 }}
                      >
                        Tháng
                      </Text>
                      <Input
                        value={salaryData.month}
                        onChange={(e) =>
                          setSalaryData({
                            ...salaryData,
                            month: e.target.value,
                          })
                        }
                        placeholder="VD: 10"
                      />
                    </div>
                  </Col>
                </Row>

                <Row gutter={[16, 16]}>
                  <Col xs={24} md={12}>
                    <div>
                      <Text
                        strong
                        style={{ display: "block", marginBottom: 8 }}
                      >
                        Ca TH
                      </Text>
                      <Input
                        value={salaryData.caTH}
                        onChange={(e) =>
                          setSalaryData({ ...salaryData, caTH: e.target.value })
                        }
                      />
                    </div>
                  </Col>

                  <Col xs={24} md={12}>
                    <div>
                      <Text
                        strong
                        style={{ display: "block", marginBottom: 8 }}
                      >
                        Lương TH (VNĐ)
                      </Text>
                      <Input
                        value={salaryData.luongTH}
                        onChange={(e) =>
                          setSalaryData({
                            ...salaryData,
                            luongTH: e.target.value,
                          })
                        }
                        onBlur={calculateSalaryTotal}
                      />
                    </div>
                  </Col>
                </Row>

                <Row gutter={[16, 16]}>
                  <Col xs={24} md={12}>
                    <div>
                      <Text
                        strong
                        style={{ display: "block", marginBottom: 8 }}
                      >
                        Ca THCS
                      </Text>
                      <Input
                        value={salaryData.caTHCS}
                        onChange={(e) =>
                          setSalaryData({
                            ...salaryData,
                            caTHCS: e.target.value,
                          })
                        }
                      />
                    </div>
                  </Col>

                  <Col xs={24} md={12}>
                    <div>
                      <Text
                        strong
                        style={{ display: "block", marginBottom: 8 }}
                      >
                        Lương THCS (VNĐ)
                      </Text>
                      <Input
                        value={salaryData.luongTHCS}
                        onChange={(e) =>
                          setSalaryData({
                            ...salaryData,
                            luongTHCS: e.target.value,
                          })
                        }
                        onBlur={calculateSalaryTotal}
                      />
                    </div>
                  </Col>
                </Row>

                <Row gutter={[16, 16]}>
                  <Col xs={24} md={12}>
                    <div>
                      <Text
                        strong
                        style={{ display: "block", marginBottom: 8 }}
                      >
                        Ca THPT
                      </Text>
                      <Input
                        value={salaryData.caTHPT}
                        onChange={(e) =>
                          setSalaryData({
                            ...salaryData,
                            caTHPT: e.target.value,
                          })
                        }
                      />
                    </div>
                  </Col>

                  <Col xs={24} md={12}>
                    <div>
                      <Text
                        strong
                        style={{ display: "block", marginBottom: 8 }}
                      >
                        Lương THPT (VNĐ)
                      </Text>
                      <Input
                        value={salaryData.luongTHPT}
                        onChange={(e) =>
                          setSalaryData({
                            ...salaryData,
                            luongTHPT: e.target.value,
                          })
                        }
                        onBlur={calculateSalaryTotal}
                      />
                    </div>
                  </Col>
                </Row>

                <div>
                  <Text strong style={{ display: "block", marginBottom: 8 }}>
                    Tổng lương (VNĐ)
                  </Text>
                  <Input
                    value={salaryData.tongLuong}
                    readOnly
                    style={{ fontWeight: "bold", color: "#36797f" }}
                  />
                </div>

                <div>
                  <Text strong style={{ display: "block", marginBottom: 8 }}>
                    Ghi chú
                  </Text>
                  <TextArea
                    rows={3}
                    value={salaryData.note}
                    onChange={(e) =>
                      setSalaryData({ ...salaryData, note: e.target.value })
                    }
                    placeholder="Ghi chú cho giáo viên..."
                  />
                </div>
              </div>

              {/* Preview */}
              <div>
                <Title level={4} style={{ color: "#36797f", marginBottom: 16 }}>
                  👁️ Xem trước phiếu lương
                </Title>
                <SalarySlip
                  data={salaryData}
                  onExport={() => {
                    message.success("Đã xuất ảnh thành công!");
                  }}
                />
              </div>
            </div>
          </div>
        </TabPane>
      </Tabs>
    </Card>
  );
};

export default Receipts;
