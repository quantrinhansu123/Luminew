import { useAuth } from "@/contexts/AuthContext";
import React, { useLayoutEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Form, Input, Button, Alert, Tabs } from "antd";
import { UserOutlined, LockOutlined, IdcardOutlined } from "@ant-design/icons";

const Login: React.FC = () => {
  const { signInWithTeacherCredentials, signInWithParentCredentials } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState("teacher");
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, userProfile, loading: authLoading } = useAuth();

  const handleEmailPasswordSubmit = async (values: any) => {
    setError("");
    setSuccess("");

    const { email, password } = values;

    try {
      setLoading(true);
      await signInWithTeacherCredentials(email.trim(), password);
      setSuccess("Đăng nhập thành công! Chuyển hướng...");
      // Get the redirect path from location state, or default to /workspace
      const from = (location.state as any)?.from?.pathname || "/workspace";
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error("Login error:", err);

      // Handle specific errors
      if (err.message === "Invalid email or password") {
        setError(
          "Email hoặc mật khẩu không hợp lệ. Vui lòng liên hệ quản trị viên nếu bạn cần quyền truy cập tài khoản."
        );
      } else if (err.message === "Failed to fetch teachers data") {
        setError("Không thể kết nối với máy chủ. Vui lòng thử lại sau.");
      } else if (err.message === "No teachers found") {
        setError(
          "Không tìm thấy tài khoản giáo viên nào. Vui lòng liên hệ quản trị viên."
        );
      } else {
        setError("Đăng nhập không thành công. Vui lòng thử lại.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleParentSubmit = async (values: any) => {
    setError("");
    setSuccess("");

    const { studentCode, password } = values;

    try {
      setLoading(true);
      await signInWithParentCredentials(studentCode.trim(), password);
      setSuccess("Đăng nhập thành công! Chuyển hướng...");
      navigate("/parent-portal", { replace: true });
    } catch (err: any) {
      console.error("Parent login error:", err);
      setError(err.message || "Đăng nhập không thành công. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  // Only redirect if we're on the login page and user is authenticated
  // Don't redirect if auth is still loading (to avoid flickering)
  useLayoutEffect(() => {
    if (!authLoading && currentUser && userProfile && location.pathname === "/login") {
      if (userProfile.role === "parent") {
        navigate("/parent-portal", { replace: true });
      } else {
        // Redirect to workspace, let the router handle the rest
        navigate("/workspace", { replace: true });
      }
    }
  }, [currentUser, userProfile, navigate, location.pathname, authLoading]);

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        backgroundImage: 'url(/img/banner.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Overlay mờ chuyên nghiệp */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.35)',
          backdropFilter: 'blur(6px)',
        }}
      />
      
      {/* Nội dung chính */}
      <div className="max-w-md w-full relative z-10">
        {/* Logo and Title */}
        <div className="text-center mb-6 sm:mb-8">
          <img
            src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2F323065b6.%E1%BA%A2nh.115930.png"
            alt="Trí Tuệ 8+ Logo"
            className="mx-auto mb-4 w-36 h-36 drop-shadow-lg"
          />
          <h1
            className="text-3xl sm:text-4xl font-bold text-[#36797f] mb-2 drop-shadow-sm"
            style={{
              WebkitTextStroke: "1.2px white",
              textShadow:
                "0 0 8px rgba(255,255,255,0.8), 0 0 12px rgba(255,255,255,0.6)",
            }}
          >
            Trí Tuệ 8+
          </h1>
          <p
            className="text-gray-600 text-base sm:text-lg drop-shadow-sm"
            style={{
              WebkitTextStroke: "0.8px white",
              textShadow: "0 0 6px rgba(255,255,255,0.7)",
            }}
          >
            Hệ thống quản lý giáo dục thông minh
          </p>
        </div>

        {/* Login Card */}
        <div 
          className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 border-2 border-[#36797f]"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <h2 className="text-xl sm:text-2xl font-bold text-center text-gray-800 mb-2">
            Đăng nhập hệ thống
          </h2>
          <p className="text-center text-sm text-gray-600 mb-4 sm:mb-6">
            Chọn loại tài khoản để đăng nhập
          </p>

          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              closable
              onClose={() => setError("")}
              className="mb-4"
            />
          )}

          {success && (
            <Alert
              message={success}
              type="success"
              showIcon
              closable
              onClose={() => setSuccess("")}
              className="mb-4"
            />
          )}

          <Tabs
            activeKey={activeTab}
            onChange={(key) => {
              setActiveTab(key);
              setError("");
              setSuccess("");
            }}
            items={[
              {
                key: "teacher",
                label: (
                  <span>
                    <UserOutlined /> Giáo viên / Quản trị
                  </span>
                ),
                children: (
                  <Form
                    onFinish={handleEmailPasswordSubmit}
                    layout="vertical"
                    className="mb-4"
                  >
                    <Form.Item
                      label={
                        <span className="text-sm font-semibold text-gray-700">
                          Email
                        </span>
                      }
                      name="email"
                      rules={[
                        { required: true, message: "Vui lòng nhập email của bạn" },
                        { type: "email", message: "Vui lòng nhập email hợp lệ" },
                      ]}
                    >
                      <Input
                        prefix={<UserOutlined />}
                        placeholder="email@example.com"
                        disabled={loading}
                      />
                    </Form.Item>

                    <Form.Item
                      label={
                        <span className="text-sm font-semibold text-gray-700">
                          Mật khẩu
                        </span>
                      }
                      name="password"
                      rules={[{ required: true, message: "Vui lòng điền mật khẩu" }]}
                    >
                      <Input.Password
                        prefix={<LockOutlined />}
                        placeholder="••••••••"
                        disabled={loading}
                      />
                    </Form.Item>

                    <Form.Item>
                      <Button
                        type="primary"
                        htmlType="submit"
                        block
                        loading={loading}
                        style={{
                          backgroundColor: "#36797f",
                          borderColor: "#36797f",
                          fontWeight: "bold",
                          fontSize: "16px",
                          height: "48px",
                        }}
                      >
                        {loading ? "Đang đăng nhập..." : "Đăng nhập"}
                      </Button>
                    </Form.Item>

                    <div className="mt-4 text-center">
                      <p className="text-sm text-gray-600">
                        Bạn chưa có tài khoản? Liên hệ quản trị viên để được cấp quyền truy cập.
                      </p>
                    </div>
                  </Form>
                ),
              },
              {
                key: "parent",
                label: (
                  <span>
                    <IdcardOutlined /> Phụ huynh
                  </span>
                ),
                children: (
                  <Form
                    onFinish={handleParentSubmit}
                    layout="vertical"
                    className="mb-4"
                  >
                    <Form.Item
                      label={
                        <span className="text-sm font-semibold text-gray-700">
                          Mã học sinh
                        </span>
                      }
                      name="studentCode"
                      rules={[
                        { required: true, message: "Vui lòng nhập mã học sinh" },
                      ]}
                    >
                      <Input
                        prefix={<IdcardOutlined />}
                        placeholder="VD: HS001"
                        disabled={loading}
                      />
                    </Form.Item>

                    <Form.Item
                      label={
                        <span className="text-sm font-semibold text-gray-700">
                          Mật khẩu
                        </span>
                      }
                      name="password"
                      rules={[{ required: true, message: "Vui lòng điền mật khẩu" }]}
                    >
                      <Input.Password
                        prefix={<LockOutlined />}
                        placeholder="••••••••"
                        disabled={loading}
                      />
                    </Form.Item>

                    <Form.Item>
                      <Button
                        type="primary"
                        htmlType="submit"
                        block
                        loading={loading}
                        style={{
                          backgroundColor: "#36797f",
                          borderColor: "#36797f",
                          fontWeight: "bold",
                          fontSize: "16px",
                          height: "48px",
                        }}
                      >
                        {loading ? "Đang đăng nhập..." : "Đăng nhập"}
                      </Button>
                    </Form.Item>

                    <div className="mt-4 text-center">
                      <p className="text-sm text-gray-600">
                        Chưa có mật khẩu? Liên hệ nhà trường để được cấp tài khoản.
                      </p>
                    </div>
                  </Form>
                ),
              },
            ]}
          />
        </div>

        {/* Footer */}
        <p className="mt-6 sm:mt-8 text-center text-gray-500 text-xs sm:text-sm">
          © 2025 Trí Tuệ 8+. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Login;
