import CourseCard from "@/components/CourseCard";
import TestimonialCard from "@/components/TestimonialCard";
import { Col, Row, Typography, Spin, Button, Modal, Table, Tag } from "antd";
import React, { useState, useEffect } from "react";
import { DATABASE_URL_BASE } from "@/firebase";
import { EyeOutlined, DashboardOutlined } from "@ant-design/icons";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
const { Title, Text } = Typography;
interface Testimonial {
  name: string;
  image: string;
  content: string;
}

const testimonials: Testimonial[] = [
  {
    name: "Lê Quang Đại",
    image: "Lê Quang Đại.png",
    content:
      "Tôi luôn cảm thấy tự hào khi thấy học sinh tiến bộ từng ngày. Các em rất chăm chỉ và chủ động trong học tập.",
  },
  {
    name: "Lê Đặng Bảo Khanh",
    image: "Lê Đặng Bảo Khanh (1).png",
    content:
      "Điều khiến tôi ấn tượng nhất là tinh thần ham học hỏi của các em. Mỗi buổi học đều là một hành trình khám phá mới.",
  },
  {
    name: "Nguyễn Duy Nam",
    image: "Nguyễn Duy Nam (4).png",
    content:
      "Các em tiếp thu nhanh và luôn nỗ lực hết mình. Tôi rất vui khi được đồng hành và chứng kiến sự tiến bộ rõ rệt của từng học sinh.",
  },
  {
    name: "Nguyễn Sĩ Hoàng",
    image: "Nguyễn Sĩ Hoàng.png",
    content:
      "Giảng dạy ở đây giúp tôi cảm nhận được niềm vui thật sự trong nghề. Học sinh năng động, lớp học luôn tràn đầy năng lượng.",
  },
  {
    name: "Nguyễn Thị Hòa",
    image: "Nguyễn Thị Hòa (1).png",
    content:
      "Tôi đánh giá cao tinh thần hợp tác và sự nỗ lực của học sinh. Mỗi buổi học đều là cơ hội để cùng nhau trưởng thành.",
  },
  {
    name: "Nguyễn Trúc Linh",
    image: "Nguyễn Trúc Linh (1).png",
    content:
      "Tôi rất hạnh phúc khi thấy học sinh của mình ngày càng tự tin hơn, đặc biệt là trong các hoạt động thảo luận và thực hành.",
  },
  {
    name: "Nguyễn Trần Hương Ly",
    image: "Nguyễn Trần Hương Ly.png",
    content:
      "Là giảng viên, tôi luôn cố gắng tạo môi trường học tập thoải mái để học sinh phát huy tối đa khả năng của mình.",
  },
  {
    name: "Trần Hải Yến",
    image: "Trần Hải Yến.png",
    content:
      "Niềm vui lớn nhất của tôi là được chứng kiến học sinh yêu thích môn học và đạt được những kết quả xứng đáng.",
  },
];

const teachers: Testimonial[] = [
  ...testimonials,
  ...testimonials,
  ...testimonials,
  ...testimonials,
];

interface Course {
  title: string;
  description: string;
  icon: React.ReactNode;
  buttonText: string;
  buttonColor: string;
  gradientColors: string;
}

// Map subject names to icons and colors
const subjectConfig: Record<string, { icon: React.ReactNode; gradientColors: string; buttonColor: string }> = {
  "Toán": {
    icon: <span className="text-5xl">x = +/c</span>,
    gradientColors: "bg-gradient-to-br from-yellow-200 via-orange-200 to-yellow-300",
    buttonColor: "bg-green-500 hover:bg-green-600",
  },
  "Mathematics": {
    icon: <span className="text-5xl">x = +/c</span>,
    gradientColors: "bg-gradient-to-br from-yellow-200 via-orange-200 to-yellow-300",
    buttonColor: "bg-green-500 hover:bg-green-600",
  },
  "Khoa học": {
    icon: <span className="text-6xl">🔬</span>,
    gradientColors: "bg-gradient-to-br from-green-200 via-emerald-200 to-green-300",
    buttonColor: "bg-green-500 hover:bg-green-600",
  },
  "Science": {
    icon: <span className="text-6xl">🔬</span>,
    gradientColors: "bg-gradient-to-br from-green-200 via-emerald-200 to-green-300",
    buttonColor: "bg-green-500 hover:bg-green-600",
  },
  "Tiếng Anh": {
    icon: (
      <div className="flex items-center justify-center gap-2 text-5xl">
        <span>A</span>
        <span>B</span>
        <span>C</span>
      </div>
    ),
    gradientColors: "bg-gradient-to-br from-blue-200 via-cyan-200 to-blue-300",
    buttonColor: "bg-yellow-500 hover:bg-yellow-600",
  },
  "English": {
    icon: (
      <div className="flex items-center justify-center gap-2 text-5xl">
        <span>A</span>
        <span>B</span>
        <span>C</span>
      </div>
    ),
    gradientColors: "bg-gradient-to-br from-blue-200 via-cyan-200 to-blue-300",
    buttonColor: "bg-yellow-500 hover:bg-yellow-600",
  },
  "Vật lý": {
    icon: <span className="text-6xl">⚛️</span>,
    gradientColors: "bg-gradient-to-br from-purple-200 via-indigo-200 to-purple-300",
    buttonColor: "bg-purple-500 hover:bg-purple-600",
  },
  "Physics": {
    icon: <span className="text-6xl">⚛️</span>,
    gradientColors: "bg-gradient-to-br from-purple-200 via-indigo-200 to-purple-300",
    buttonColor: "bg-purple-500 hover:bg-purple-600",
  },
  "Hóa học": {
    icon: <span className="text-6xl">🧪</span>,
    gradientColors: "bg-gradient-to-br from-pink-200 via-rose-200 to-pink-300",
    buttonColor: "bg-pink-500 hover:bg-pink-600",
  },
  "Chemistry": {
    icon: <span className="text-6xl">🧪</span>,
    gradientColors: "bg-gradient-to-br from-pink-200 via-rose-200 to-pink-300",
    buttonColor: "bg-pink-500 hover:bg-pink-600",
  },
  "Sinh học": {
    icon: <span className="text-6xl">🧬</span>,
    gradientColors: "bg-gradient-to-br from-teal-200 via-cyan-200 to-teal-300",
    buttonColor: "bg-teal-500 hover:bg-teal-600",
  },
  "Biology": {
    icon: <span className="text-6xl">🧬</span>,
    gradientColors: "bg-gradient-to-br from-teal-200 via-cyan-200 to-teal-300",
    buttonColor: "bg-teal-500 hover:bg-teal-600",
  },
  "Văn": {
    icon: <span className="text-6xl">📚</span>,
    gradientColors: "bg-gradient-to-br from-amber-200 via-yellow-200 to-amber-300",
    buttonColor: "bg-amber-500 hover:bg-amber-600",
  },
  "Literature": {
    icon: <span className="text-6xl">📚</span>,
    gradientColors: "bg-gradient-to-br from-amber-200 via-yellow-200 to-amber-300",
    buttonColor: "bg-amber-500 hover:bg-amber-600",
  },
};

// Default 3 courses to display
const defaultCourses: Course[] = [
  {
    title: "Toán Học",
    description: "Chương trình Chuẩn",
    icon: <span className="text-5xl">x = +/c</span>,
    buttonText: "Xem Khóa Học",
    buttonColor: "bg-green-500 hover:bg-green-600",
    gradientColors:
      "bg-gradient-to-br from-yellow-200 via-orange-200 to-yellow-300",
  },
  {
    title: "Khoa Học",
    description: "Tư duy Khoa học thông qua thí nghiệm",
    icon: <span className="text-6xl">🔬</span>,
    buttonText: "Xem Khóa Học",
    buttonColor: "bg-green-500 hover:bg-green-600",
    gradientColors:
      "bg-gradient-to-br from-green-200 via-emerald-200 to-green-300",
  },
  {
    title: "Tiếng Anh",
    description: "Đội ngũ giáo viên bản ngữ Tăng cường kỹ năng giao tiếp",
    icon: (
      <div className="flex items-center justify-center gap-2 text-5xl">
        <span>A</span>
        <span>B</span>
        <span>C</span>
      </div>
    ),
    buttonText: "Tư vấn miễn phí",
    buttonColor: "bg-yellow-500 hover:bg-yellow-600",
    gradientColors: "bg-gradient-to-br from-blue-200 via-cyan-200 to-blue-300",
  },
];

const HomePage = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [allCourses, setAllCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchAllCourses = async () => {
    if (allCourses.length > 0) {
      setModalVisible(true);
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(`${DATABASE_URL_BASE}/datasheet/Kh%C3%B3a_h%E1%BB%8Dc.json`);
      const data = await response.json();
      
      if (data) {
        const coursesArray = Object.entries(data).map(([id, course]: [string, any]) => ({
          id,
          ...course,
        }));
        setAllCourses(coursesArray);
        setModalVisible(true);
      }
    } catch (error) {
      console.error("Error fetching courses:", error);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div>
      {/* Dashboard Button - Only show when logged in */}
      {currentUser && (
        <div style={{ 
          position: "fixed", 
          top: "20px", 
          right: "20px", 
          zIndex: 1000,
        }}>
          <Button
            type="primary"
            size="large"
            icon={<DashboardOutlined />}
            onClick={() => navigate("/workspace/admin-schedule")}
            style={{
              height: "48px",
              fontSize: "16px",
              paddingLeft: "24px",
              paddingRight: "24px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            }}
          >
            Trở lại Dashboard
          </Button>
        </div>
      )}

      {/* Hero Banner */}
      <div>
        <img
          src="/img/banner.png"
          alt="Hero Banner"
          className="mx-auto w-auto"
        />
      </div>

      {/* Chương trình Học */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <Title level={2} className="mb-12 text-center">
            Chương trình Học
          </Title>
          <Row gutter={[24, 24]} justify="center">
            {defaultCourses.map((course, index) => (
              <Col key={index} xs={24} sm={12} lg={8}>
                <CourseCard {...course} />
              </Col>
            ))}
          </Row>
          <div className="mt-8 text-center">
            <Button
              type="primary"
              size="large"
              icon={<EyeOutlined />}
              onClick={fetchAllCourses}
              loading={loading}
              style={{ 
                height: "48px",
                fontSize: "16px",
                paddingLeft: "32px",
                paddingRight: "32px",
              }}
            >
              Xem thêm các khóa học
            </Button>
          </div>
        </div>
      </section>

      {/* Modal hiển thị danh sách đầy đủ */}
      <Modal
        title={
          <div style={{ textAlign: "center", paddingBottom: "16px" }}>
            <Title level={3} style={{ margin: 0, color: "#1890ff" }}>
              Danh sách khóa học
            </Title>
            <Text type="secondary" style={{ fontSize: "14px" }}>
              Chương trình học chất lượng cao cho mọi cấp độ
            </Text>
          </div>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={900}
        styles={{
          body: { paddingTop: 0 },
        }}
      >
        <Table
          dataSource={allCourses}
          rowKey="id"
          pagination={{ 
            pageSize: 10,
            showTotal: (total) => `Tổng ${total} khóa học`,
          }}
          size="middle"
          columns={[
            {
              title: "Môn học",
              dataIndex: "Môn học",
              key: "subject",
              width: 200,
              render: (text: string) => (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "20px" }}>
                    {text === "Toán" || text === "Mathematics" ? "📐" :
                     text === "Tiếng Anh" || text === "English" ? "🇬🇧" :
                     text === "Khoa học" || text === "Science" ? "🔬" :
                     text === "Vật lý" || text === "Physics" ? "⚛️" :
                     text === "Hóa học" || text === "Chemistry" ? "🧪" :
                     text === "Sinh học" || text === "Biology" ? "🧬" :
                     text === "Văn" || text === "Literature" ? "📚" : "📖"}
                  </span>
                  <Text strong style={{ fontSize: "15px" }}>{text}</Text>
                </div>
              ),
            },
            {
              title: "Khối",
              dataIndex: "Khối",
              key: "grade",
              width: 100,
              align: "center" as const,
              render: (grade: number) => (
                <Tag 
                  color="blue" 
                  style={{ 
                    fontSize: "13px", 
                    padding: "4px 12px",
                    fontWeight: 500,
                  }}
                >
                  Khối {grade}
                </Tag>
              ),
              sorter: (a: any, b: any) => a.Khối - b.Khối,
            },
            {
              title: "Học phí / buổi",
              dataIndex: "Giá",
              key: "price",
              width: 180,
              align: "right" as const,
              render: (price: number) => (
                <div style={{ 
                  display: "flex", 
                  flexDirection: "column",
                  alignItems: "flex-end",
                }}>
                  <Text 
                    style={{ 
                      color: "#1890ff", 
                      fontWeight: "bold",
                      fontSize: "16px",
                    }}
                  >
                    {price?.toLocaleString("vi-VN")} đ
                  </Text>
                  <Text 
                    type="secondary" 
                    style={{ fontSize: "12px" }}
                  >
                    {Math.round(price / 1000)}k / buổi
                  </Text>
                </div>
              ),
              sorter: (a: any, b: any) => a.Giá - b.Giá,
            },
          ]}
        />
      </Modal>

      {/* Testimonials */}
      <section className="bg-gray-50 py-16">
        <div className="container mx-auto px-6">
          <Title level={2} className="mb-12 text-center text-gray-800">
            Đội ngũ giảng viên
          </Title>
          <style>{`
                        @keyframes scroll-horizontal {
                            0% {
                                transform: translateX(0);
                            }
                            100% {
                                transform: translateX(-50%);
                            }
                        }
                        .testimonial-track {
                            display: flex;
                            align-items: stretch; /* Đảm bảo tất cả cards có cùng height */
                            animation: scroll-horizontal 80s linear infinite;
                            width: fit-content;
                            height: 320px; /* Set height cố định cho track */
                        }
                        .testimonial-track:hover {
                            animation-play-state: paused;
                        }
                        .testimonial-wrapper {
                            overflow: hidden;
                            position: relative;
                            height: 320px; /* Match với track height */
                        }
                        .testimonial-track > * {
                            height: 100%; /* Đảm bảo mỗi card chiếm hết height của track */
                        }
                    `}</style>
          <div className="testimonial-wrapper">
            <div className="testimonial-track">
              {/* First set */}
              {teachers.map((testimonial, index) => (
                <TestimonialCard key={`first-${index}`} {...testimonial} />
              ))}

              {/* Duplicate set for seamless loop */}
              {/* {testimonials.map((testimonial, index) => (
                <TestimonialCard key={`second-${index}`} {...testimonial} />
              ))} */}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
