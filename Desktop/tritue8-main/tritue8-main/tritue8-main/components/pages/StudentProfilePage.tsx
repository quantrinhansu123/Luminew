import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Card,
  Row,
  Col,
  Input,
  DatePicker,
  Select,
  Button,
  Form,
  Avatar,
  Tag,
  Space,
  Divider,
  message,
} from "antd";
import {
  UserOutlined,
  BookOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  GiftOutlined,
  StarOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import { ref, onValue, update } from "firebase/database";
import { database } from "../../firebase";
import dayjs from "dayjs";

const { TextArea } = Input;

interface Student {
  id: string;
  "Họ và tên": string;
  "Mã học sinh"?: string;
  "Ngày sinh"?: string;
  "Giới tính"?: string;
  "Số điện thoại"?: string;
  "SĐT phụ huynh"?: string;
  "Họ tên phụ huynh"?: string;
  "Địa chỉ"?: string;
  "Trường"?: string;
  "Khối"?: string;
  "Username"?: string;
  "Password"?: string;
  "Điểm số"?: number;
  "Trạng thái"?: string;
  [key: string]: any;
}

const StudentProfilePage = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("profile");
  const [form] = Form.useForm();
  const [parentForm] = Form.useForm();
  const [portalForm] = Form.useForm();

  // Load student data
  useEffect(() => {
    if (!studentId) return;

    const studentRef = ref(database, `datasheet/Danh_sách_học_sinh/${studentId}`);
    const unsubscribe = onValue(studentRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const studentData = { id: studentId, ...data };
        setStudent(studentData);
        
        // Set form values
        form.setFieldsValue({
          name: studentData["Họ và tên"],
          birthDate: studentData["Ngày sinh"] ? dayjs(studentData["Ngày sinh"], "YYYY-MM-DD") : null,
          gender: studentData["Giới tính"] || "Nam",
          phone: studentData["Số điện thoại"] || "",
          school: studentData["Trường"] || "",
          grade: studentData["Khối"] || "",
        });

        parentForm.setFieldsValue({
          parentName: studentData["Họ tên phụ huynh"] || studentData["Phụ huynh"] || "",
          parentPhone: studentData["SĐT phụ huynh"] || "",
          address: studentData["Địa chỉ"] || "",
        });

        portalForm.setFieldsValue({
          username: studentData["Username"] || "",
          password: studentData["Password"] || "",
        });

        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [studentId, form, parentForm, portalForm]);

  // Handle save student info
  const handleSaveStudentInfo = async () => {
    if (!studentId) return;

    try {
      const values = await form.validateFields();
      const studentRef = ref(database, `datasheet/Danh_sách_học_sinh/${studentId}`);
      
      await update(studentRef, {
        "Họ và tên": values.name,
        "Ngày sinh": values.birthDate ? values.birthDate.format("YYYY-MM-DD") : "",
        "Giới tính": values.gender,
        "Số điện thoại": values.phone,
        "Trường": values.school,
        "Khối": values.grade,
      });

      message.success("Đã cập nhật thông tin học sinh");
    } catch (error) {
      console.error("Error saving student info:", error);
      message.error("Lỗi khi cập nhật thông tin");
    }
  };

  // Handle save parent info
  const handleSaveParentInfo = async () => {
    if (!studentId) return;

    try {
      const values = await parentForm.validateFields();
      const studentRef = ref(database, `datasheet/Danh_sách_học_sinh/${studentId}`);
      
      await update(studentRef, {
        "Họ tên phụ huynh": values.parentName,
        "SĐT phụ huynh": values.parentPhone,
        "Địa chỉ": values.address,
      });

      message.success("Đã cập nhật thông tin phụ huynh");
    } catch (error) {
      console.error("Error saving parent info:", error);
      message.error("Lỗi khi cập nhật thông tin phụ huynh");
    }
  };

  // Handle save portal info
  const handleSavePortalInfo = async () => {
    if (!studentId) return;

    try {
      const values = await portalForm.validateFields();
      const studentRef = ref(database, `datasheet/Danh_sách_học_sinh/${studentId}`);
      
      await update(studentRef, {
        "Username": values.username,
        "Password": values.password,
      });

      message.success("Đã cập nhật tài khoản portal");
    } catch (error) {
      console.error("Error saving portal info:", error);
      message.error("Lỗi khi cập nhật tài khoản portal");
    }
  };

  if (loading || !student) {
    return <div>Đang tải...</div>;
  }

  const getInitials = (name: string) => {
    const words = name.split(" ");
    if (words.length >= 2) {
      return (words[words.length - 2][0] + words[words.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const navItems = [
    { key: "profile", label: "Hồ sơ", icon: <UserOutlined /> },
    { key: "academics", label: "Học vụ", icon: <BookOutlined /> },
    { key: "results", label: "Kết quả & Nhận xét", icon: <FileTextOutlined /> },
    { key: "history", label: "Lịch sử", icon: <ClockCircleOutlined /> },
    { key: "finance", label: "Tài chính & Quà", icon: <GiftOutlined /> },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#f5f5f5" }}>
      {/* Left Sidebar */}
      <div style={{ width: "300px", backgroundColor: "#fff", padding: "20px", borderRight: "1px solid #e8e8e8" }}>
        {/* User Profile Card */}
        <Card
          style={{
            borderRadius: "16px",
            marginBottom: "20px",
            padding: 0,
            overflow: "hidden",
          }}
          bodyStyle={{ padding: 0 }}
        >
          <div
            style={{
              backgroundColor: "#722ed1",
              padding: "30px 20px 50px",
              textAlign: "center",
              position: "relative",
            }}
          >
            <Avatar
              size={100}
              style={{
                backgroundColor: "#fff",
                color: "#722ed1",
                fontSize: "36px",
                fontWeight: "bold",
                border: "4px solid #fff",
                marginBottom: "10px",
              }}
            >
              {getInitials(student["Họ và tên"])}
            </Avatar>
            <div style={{ color: "#fff", marginTop: "10px" }}>
              <div style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "5px" }}>
                {student["Họ và tên"]}
              </div>
              <div style={{ fontSize: "14px", opacity: 0.9 }}>
                #{student["Mã học sinh"] || student.id.substring(0, 6).toUpperCase()}
              </div>
            </div>
          </div>
          <div style={{ padding: "20px" }}>
            <Space size="small" style={{ width: "100%", justifyContent: "center", marginBottom: "10px" }}>
              <Button
                type="default"
                icon={<StarOutlined />}
                style={{
                  backgroundColor: "#ffc107",
                  borderColor: "#ffc107",
                  color: "#000",
                  fontWeight: "bold",
                }}
              >
                {student["Điểm số"] || 0}
              </Button>
              <Tag
                color={student["Trạng thái"] === "active" ? "green" : "default"}
                style={{ fontSize: "14px", padding: "4px 12px" }}
              >
                {student["Trạng thái"] === "active" ? "Đã đóng" : student["Trạng thái"] || "Chưa xác định"}
              </Tag>
            </Space>
          </div>
        </Card>

        {/* Navigation */}
        <div>
          {navItems.map((item) => (
            <Button
              key={item.key}
              type={activeTab === item.key ? "primary" : "text"}
              icon={item.icon}
              block
              style={{
                height: "50px",
                marginBottom: "8px",
                textAlign: "left",
                fontSize: "15px",
                fontWeight: activeTab === item.key ? "bold" : "normal",
                backgroundColor: activeTab === item.key ? "#722ed1" : "transparent",
                borderColor: activeTab === item.key ? "#722ed1" : "transparent",
                color: activeTab === item.key ? "#fff" : "#666",
              }}
              onClick={() => setActiveTab(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: "30px", overflow: "auto" }}>
        <div style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "30px", color: "#333" }}>
          Hồ sơ: {student["Họ và tên"]}
        </div>

        {activeTab === "profile" && (
          <div>
            {/* Student Information */}
            <Card
              title="1. THÔNG TIN HỌC SINH"
              style={{ marginBottom: "20px", borderRadius: "8px" }}
            >
              <Form form={form} layout="vertical">
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item
                      name="name"
                      label="Họ và tên"
                      rules={[{ required: true, message: "Vui lòng nhập họ và tên" }]}
                    >
                      <Input size="large" placeholder="Họ và tên" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="birthDate" label="Ngày sinh">
                      <DatePicker
                        size="large"
                        format="DD/MM/YYYY"
                        placeholder="dd/mm/yyyy"
                        style={{ width: "100%" }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="gender" label="Giới tính">
                      <Select size="large" placeholder="Chọn giới tính">
                        <Select.Option value="Nam">Nam</Select.Option>
                        <Select.Option value="Nữ">Nữ</Select.Option>
                        <Select.Option value="Khác">Khác</Select.Option>
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item name="phone" label="SĐT HỌC SINH">
                      <Input size="large" placeholder="Số điện thoại" />
                    </Form.Item>
                  </Col>
                  <Col span={16}>
                    <Form.Item label="TRƯỜNG/KHỐI">
                      <Row gutter={8}>
                        <Col span={16}>
                          <Form.Item name="school" noStyle>
                            <Input size="large" placeholder="Trường..." />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="grade" noStyle>
                            <Select size="large" placeholder="Khối" style={{ width: "100%" }}>
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((grade) => (
                                <Select.Option key={grade} value={grade.toString()}>
                                  Khối {grade}
                                </Select.Option>
                              ))}
                            </Select>
                          </Form.Item>
                        </Col>
                      </Row>
                    </Form.Item>
                  </Col>
                </Row>
                <Button type="primary" size="large" onClick={handleSaveStudentInfo}>
                  Lưu thông tin học sinh
                </Button>
              </Form>
            </Card>

            {/* Parent Information */}
            <Card
              title={
                <div style={{ backgroundColor: "#f0f0f0", padding: "10px 15px", margin: "-16px -16px 16px", borderRadius: "8px 8px 0 0" }}>
                  2. THÔNG TIN PHỤ HUYNH
                </div>
              }
              style={{ marginBottom: "20px", borderRadius: "8px" }}
            >
              <Form form={parentForm} layout="vertical">
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="parentName" label="HỌ TÊN PH">
                      <Input size="large" placeholder="Họ tên phụ huynh" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="parentPhone" label="SĐT PHỤ HUYNH">
                      <Input size="large" placeholder="Số điện thoại phụ huynh" />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="address" label="ĐỊA CHỈ">
                  <TextArea
                    size="large"
                    rows={3}
                    placeholder="Nhập địa chỉ"
                  />
                </Form.Item>
                <Button type="primary" size="large" onClick={handleSaveParentInfo}>
                  Lưu thông tin phụ huynh
                </Button>
              </Form>
            </Card>

            {/* Portal Account */}
            <Card
              title={
                <div style={{ backgroundColor: "#fff7e6", padding: "10px 15px", margin: "-16px -16px 16px", borderRadius: "8px 8px 0 0", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>🔑</span>
                  <span>3. TÀI KHOẢN PORTAL</span>
                </div>
              }
              style={{ borderRadius: "8px" }}
            >
              <Form form={portalForm} layout="vertical">
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="username" label="USERNAME">
                      <Input size="large" placeholder="Tên đăng nhập" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="password" label="PASSWORD">
                      <Input.Password size="large" placeholder="Mật khẩu" />
                    </Form.Item>
                  </Col>
                </Row>
                <Button type="primary" size="large" onClick={handleSavePortalInfo}>
                  Lưu tài khoản portal
                </Button>
              </Form>
            </Card>
          </div>
        )}

        {activeTab === "academics" && (
          <Card>
            <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
              Tính năng Học vụ đang được phát triển
            </div>
          </Card>
        )}

        {activeTab === "results" && (
          <Card>
            <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
              Tính năng Kết quả & Nhận xét đang được phát triển
            </div>
          </Card>
        )}

        {activeTab === "history" && (
          <Card>
            <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
              Tính năng Lịch sử đang được phát triển
            </div>
          </Card>
        )}

        {activeTab === "finance" && (
          <Card>
            <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
              Tính năng Tài chính & Quà đang được phát triển
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default StudentProfilePage;
