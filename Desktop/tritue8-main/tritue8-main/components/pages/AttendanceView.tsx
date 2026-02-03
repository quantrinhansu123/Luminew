import { useAuth } from "@/contexts/AuthContext";
import { DATABASE_URL_BASE as BASE_URL } from "@/firebase";
import React, { useState, useEffect } from "react";
import {
  DatePicker,
  Input,
  Table,
  Checkbox,
  Button,
  Card,
  Spin,
  Space,
  Statistic,
  message,
} from "antd";
import {
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import WrapperContent from "@/components/WrapperContent";
import Loader from "@/components/Loader";

let DATABASE_URL_BASE = BASE_URL + "/datasheet";

const STUDENT_LIST_URL = `${DATABASE_URL_BASE}/Danh_s%C3%A1ch_h%E1%BB%8Dc_sinh.json`;
const ATTENDANCE_URL = `${DATABASE_URL_BASE}/Di%E1%BB%87m_danh.json`;

interface Student {
  id: string;
  "Họ và tên": string;
  "Mã học sinh"?: string;
  "Số điện thoại"?: string;
  [key: string]: any;
}

interface AttendanceRecord {
  studentId: string;
  studentName: string;
  studentCode?: string;
  date: string;
  present: boolean;
  submittedBy: string;
  timestamp: string;
}

interface HomeworkInfo {
  totalExercises: number;
  description: string;
  assignedBy: string;
}

interface StudentAttendance {
  studentName: string;
  present: boolean;
  score?: number;
  submittedBy: string;
  timestamp: string;
}

const AttendanceView: React.FC = () => {
  const { currentUser, userProfile } = useAuth();

  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<{ [key: string]: boolean }>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [searchTerm, setSearchTerm] = useState("");

  // Homework fields
  const [totalExercises, setTotalExercises] = useState<number>(0);
  const [homeworkDescription, setHomeworkDescription] = useState<string>("");
  const [scores, setScores] = useState<{ [key: string]: number }>({});

  // Fetch students
  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const timestamp = new Date().getTime();
        const response = await fetch(`${STUDENT_LIST_URL}?_=${timestamp}`, {
          cache: "no-cache",
        });
        const data = await response.json();
        if (data) {
          let studentsArray = Object.keys(data).map((key) => ({
            id: key,
            ...data[key],
          }));

          // Filter students if teacher (not admin)
          if (!userProfile?.isAdmin && userProfile?.teacherName) {
            // Get schedule to find which students this teacher teaches
            const scheduleResponse = await fetch(
              `${DATABASE_URL_BASE}/Th%E1%BB%9Di_kho%C3%A1_bi%E1%BB%83u.json`
            );
            const scheduleData = await scheduleResponse.json();

            if (scheduleData) {
              const teacherStudentNames = new Set<string>();
              Object.values(scheduleData).forEach((event: any) => {
                if (
                  event["Teacher ID"] === userProfile.uid &&
                  event["Học sinh"]
                ) {
                  event["Học sinh"].forEach((name: string) =>
                    teacherStudentNames.add(name)
                  );
                }
              });

              studentsArray = studentsArray.filter((student) =>
                teacherStudentNames.has(student["Họ và tên"])
              );
            }
          }

          setStudents(studentsArray);
        }
        setLoading(false);
      } catch (error) {
        console.error("Error fetching students:", error);
        setLoading(false);
      }
    };
    fetchStudents();
  }, [userProfile]);

  // Load existing attendance for selected date
  useEffect(() => {
    const loadAttendance = async () => {
      console.log(currentUser, "sdfsdfsdfsd", userProfile, selectedDate);
      try {
        if (!currentUser) return;

        const dateUrl = `${DATABASE_URL_BASE}/Di%E1%BB%87m_danh/${selectedDate}.json`;
        const response = await fetch(dateUrl, {
          cache: "no-cache",
        });
        const data = await response.json();

        if (data) {
          // Load homework info
          if (data.homework) {
            setTotalExercises(data.homework.totalExercises || 0);
            setHomeworkDescription(data.homework.description || "");
          } else {
            setTotalExercises(0);
            setHomeworkDescription("");
          }

          // Load student attendance
          if (data.students) {
            const todayAttendance: { [key: string]: boolean } = {};
            const todayScores: { [key: string]: number } = {};

            Object.entries(data.students).forEach(
              ([studentId, studentData]: [string, any]) => {
                todayAttendance[studentId] = studentData.present || false;
                if (studentData.score !== undefined) {
                  todayScores[studentId] = studentData.score;
                }
              }
            );

            setAttendance(todayAttendance);
            setScores(todayScores);
          } else {
            setAttendance({});
            setScores({});
          }
        } else {
          // No data for this date
          setAttendance({});
          setScores({});
          setTotalExercises(0);
          setHomeworkDescription("");
        }
      } catch (error) {
        console.error("Error loading attendance:", error);
      }
    };
    loadAttendance();
  }, [selectedDate, currentUser, userProfile]);

  const handleCheckboxChange = (studentId: string, checked: boolean) => {
    setAttendance((prev) => ({
      ...prev,
      [studentId]: checked,
    }));
  };

  const handleSelectAll = (checked: boolean) => {
    const newAttendance: { [key: string]: boolean } = {};
    filteredStudents.forEach((student) => {
      newAttendance[student.id] = checked;
    });
    setAttendance(newAttendance);
  };

  const handleSubmit = async () => {
    if (submitting) return;

    try {
      setSubmitting(true);
      const now = new Date();
      const submittedBy =
        userProfile?.teacherName || currentUser?.email || "Unknown";

      if (!currentUser) {
        message.error("Người dùng chưa đăng nhập!");
        return;
      }

      // Prepare homework data
      const homeworkData: HomeworkInfo = {
        totalExercises: totalExercises || 0,
        description: homeworkDescription || "",
        assignedBy: submittedBy,
      };

      // Prepare student attendance data
      const studentsData: { [key: string]: StudentAttendance } = {};

      filteredStudents.forEach((student) => {
        if (attendance[student.id]) {
          studentsData[student.id] = {
            studentName: student["Họ và tên"],
            present: attendance[student.id],
            score: scores[student.id],
            submittedBy,
            timestamp: now.toISOString(),
          };
        }
      });

      // Prepare the complete data structure for this date
      const dateData = {
        homework: homeworkData,
        students: studentsData,
      };

      console.log("Submitting attendance for date:", selectedDate, dateData);

      // Save to Firebase under the date node
      const dateUrl = `${DATABASE_URL_BASE}/Di%E1%BB%87m_danh/${selectedDate}.json`;
      const response = await fetch(dateUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dateData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save attendance: ${response.status}`);
      }

      const presentCount = Object.values(studentsData).length;
      message.success(
        `Điểm danh thành công cho ngày ${new Date(
          selectedDate
        ).toLocaleDateString(
          "vi-VN"
        )}!\nĐã điểm danh ${presentCount} học sinh.\nBài tập: ${
          totalExercises || 0
        } bài.`
      );
    } catch (error) {
      console.error("Error submitting attendance:", error);
      message.error("Lỗi khi lưu điểm danh. Vui lòng thử lại!");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredStudents = students.filter((student) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      student["Họ và tên"]?.toLowerCase().includes(search) ||
      student["Mã học sinh"]?.toLowerCase().includes(search) ||
      student["Số điện thoại"]?.toLowerCase().includes(search)
    );
  });

  const presentCount = Object.values(attendance).filter(
    (present) => present
  ).length;
  const absentCount = filteredStudents.length - presentCount;

  return (
    <WrapperContent title="Điểm danh">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Date Selector */}
        <Card title="📅 Chọn ngày" size="small">
          <DatePicker
            value={dayjs(selectedDate)}
            onChange={(date) =>
              setSelectedDate(
                date
                  ? date.format("YYYY-MM-DD")
                  : new Date().toISOString().split("T")[0]
              )
            }
            disabledDate={(current) =>
              current && current > dayjs().endOf("day")
            }
            className="w-full"
          />
        </Card>

        {/* Stats */}
        <Card title="Thống kê điểm danh" size="small">
          <Space direction="horizontal">
            <Statistic
              title="Có mặt"
              value={presentCount}
              valueStyle={{ color: "#3f8600" }}
              prefix={<CheckCircleOutlined />}
            />
            <Statistic
              title="Vắng"
              value={absentCount}
              valueStyle={{ color: "#cf1322" }}
              prefix={<CloseCircleOutlined />}
            />
          </Space>
        </Card>

        {/* Search */}
        <Card title="🔍 Tìm kiếm học sinh" size="small">
          <Input
            placeholder="Tìm kiếm theo tên, mã học sinh..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            prefix={<SearchOutlined />}
          />
        </Card>
      </div>
      {/* Homework Information */}
      <Card title="📚 Thông tin bài tập về nhà" className="mb-6" size="small">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Số bài tập</label>
            <Input
              type="number"
              value={totalExercises}
              onChange={(e) => setTotalExercises(Number(e.target.value))}
              placeholder="Nhập số bài tập"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Mô tả</label>
            <Input
              value={homeworkDescription}
              onChange={(e) => setHomeworkDescription(e.target.value)}
              placeholder="Ví dụ: Trang 42-45, bài tập 1-5"
            />
          </div>
        </div>
      </Card>

      {/* Attendance Table */}
      {loading ? (
        <div className="flex h-full items-center justify-center">
          <Loader />
        </div>
      ) : (
        <Card>
          <Table
            dataSource={filteredStudents.map((student, index) => ({
              key: student.id,
              index: index + 1,
              name: student["Họ và tên"],
              code: student["Mã học sinh"] || "-",
              phone: student["Số điện thoại"] || "-",
              present: attendance[student.id] || false,
              score: scores[student.id] || 0,
              id: student.id,
            }))}
            columns={[
              {
                title: "#",
                dataIndex: "index",
                key: "index",
                width: 60,
                align: "center",
              },
              {
                title: "Tên học sinh",
                dataIndex: "name",
                key: "name",
                render: (text) => <strong>{text}</strong>,
              },
              {
                title: "Mã học sinh",
                dataIndex: "code",
                key: "code",
              },
              {
                title: "Số điện thoại",
                dataIndex: "phone",
                key: "phone",
              },
              {
                title: (
                  <div className="flex items-center justify-center gap-2">
                    <span>Có mặt</span>
                    <Checkbox
                      checked={
                        filteredStudents.length > 0 &&
                        filteredStudents.every((s) => attendance[s.id])
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                    />
                  </div>
                ),
                dataIndex: "present",
                key: "present",
                align: "center",
                render: (present, record) => (
                  <Checkbox
                    checked={present}
                    onChange={(e) =>
                      handleCheckboxChange(record.id, e.target.checked)
                    }
                  />
                ),
              },
              {
                title: "Điểm",
                dataIndex: "score",
                key: "score",
                align: "center",
                width: 120,
                render: (score, record) => (
                  <Input
                    type="number"
                    value={score}
                    onChange={(e) =>
                      setScores({
                        ...scores,
                        [record.id]: Number(e.target.value),
                      })
                    }
                    placeholder="0-10"
                    min={0}
                    max={10}
                    disabled={!attendance[record.id]}
                    size="small"
                  />
                ),
              },
            ]}
            pagination={false}
            scroll={{ x: 800 }}
            rowClassName={(record) =>
              attendance[record.id] ? "bg-green-50" : ""
            }
          />

          {/* Submit Button */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                <span className="font-semibold">{filteredStudents.length}</span>{" "}
                học sinh |
                <span className="text-green-600 font-semibold ml-2">
                  {presentCount} có mặt
                </span>{" "}
                |
                <span className="text-red-600 font-semibold ml-2">
                  {absentCount} vắng
                </span>
              </div>
              <Button
                type="primary"
                onClick={handleSubmit}
                disabled={submitting || filteredStudents.length === 0}
                loading={submitting}
                icon={<CheckCircleOutlined />}
              >
                {submitting ? "Đang gửi..." : "Lưu buổi học"}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </WrapperContent>
  );
};

export default AttendanceView;
