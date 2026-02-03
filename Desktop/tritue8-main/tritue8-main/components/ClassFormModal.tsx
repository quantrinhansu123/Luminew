import { useEffect, useState } from "react";
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  Space,
  TimePicker,
  DatePicker,
} from "antd";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { useClasses } from "../hooks/useClasses";
import { Class, ClassSchedule } from "../types";
import dayjs from "dayjs";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { gradeOptions, subjectOptions } from "@/utils/selectOptions";

interface ClassFormModalProps {
  open: boolean;
  onClose: () => void;
  editingClass: Class | null;
}

interface Teacher {
  id: string;
  "Họ và tên": string;
  "Mã giáo viên": string;
}

interface Room {
  id: string;
  "Tên phòng": string;
  "Địa điểm": string;
}

const ClassFormModal = ({
  open,
  onClose,
  editingClass,
}: ClassFormModalProps) => {
  const [form] = Form.useForm();
  const { addClass, updateClass, classes } = useClasses();
  const [loading, setLoading] = useState(false);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(true);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  // Load teachers
  useEffect(() => {
    setLoadingTeachers(true);
    const teachersRef = ref(database, "datasheet/Giáo_viên");
    const unsubscribe = onValue(
      teachersRef,
      (snapshot) => {
        const data = snapshot.val();
        console.log("ClassFormModal - Raw teacher data:", data);
        if (data) {
          const teacherList = Object.entries(data).map(([id, value]) => ({
            id,
            ...(value as Omit<Teacher, "id">),
          }));
          console.log("ClassFormModal - Processed teacher list:", teacherList);
          setTeachers(teacherList);
        } else {
          console.warn("ClassFormModal - No teacher data found");
          setTeachers([]);
        }
        setLoadingTeachers(false);
      },
      (error) => {
        console.error("ClassFormModal - Error loading teachers:", error);
        setLoadingTeachers(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Load rooms
  useEffect(() => {
    setLoadingRooms(true);
    const roomsRef = ref(database, "datasheet/Phòng_học");
    const unsubscribe = onValue(
      roomsRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const roomList = Object.entries(data).map(([id, value]) => ({
            id,
            ...(value as Omit<Room, "id">),
          }));
          setRooms(roomList);
        } else {
          setRooms([]);
        }
        setLoadingRooms(false);
      },
      (error) => {
        console.error("Error loading rooms:", error);
        setLoadingRooms(false);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (editingClass) {
      const schedules = editingClass["Lịch học"]?.map((s) => ({
        day: s["Thứ"],
        startTime: dayjs(s["Giờ bắt đầu"], "HH:mm"),
        endTime: dayjs(s["Giờ kết thúc"], "HH:mm"),
        location: s["Địa điểm"],
        room: s["Phòng học"] || "",
        className: s["Tên lớp"] || "",
      }));

      form.setFieldsValue({
        className: editingClass["Tên lớp"],
        classCode: editingClass["Mã lớp"],
        subject: editingClass["Môn học"],
        grade: editingClass["Khối"],
        teacherId: editingClass["Teacher ID"],
        teacherSalary: editingClass["Lương GV"] || 0,
        tuitionPerSession: editingClass["Học phí mỗi buổi"] || 0,
        status: editingClass["Trạng thái"],
        notes: editingClass["Ghi chú"],
        schedules: schedules || [],
      });
    } else {
      form.resetFields();
    }
  }, [editingClass, form]);

  // Check for schedule conflicts
  const checkScheduleConflict = (
    schedules: any[],
    currentClassId?: string
  ): { hasConflict: boolean; conflictDetails: string[] } => {
    const conflicts: string[] = [];

    schedules.forEach((schedule: any) => {
      const day = schedule.day;
      const startTime = schedule.startTime.format("HH:mm");
      const endTime = schedule.endTime.format("HH:mm");
      const roomId = schedule.room;

      // Skip if no room selected for this schedule
      if (!roomId) return;

      // Check all other classes
      classes.forEach((cls) => {
        // Skip current class when editing
        if (currentClassId && cls.id === currentClassId) return;

        // Check schedules
        cls["Lịch học"]?.forEach((clsSchedule) => {
          if (clsSchedule["Thứ"] !== day) return;

          // Check if same room
          const clsRoomId = clsSchedule["Phòng học"];
          if (clsRoomId !== roomId) return;

          const clsStart = clsSchedule["Giờ bắt đầu"];
          const clsEnd = clsSchedule["Giờ kết thúc"];

          // Check time overlap
          const isOverlap =
            (startTime >= clsStart && startTime < clsEnd) ||
            (endTime > clsStart && endTime <= clsEnd) ||
            (startTime <= clsStart && endTime >= clsEnd);

          if (isOverlap) {
            const dayNames = ["", "", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
            conflicts.push(
              `${dayNames[day]} ${clsStart}-${clsEnd}: Trùng với lớp "${cls["Tên lớp"]}"`
            );
          }
        });
      });
    });

    return {
      hasConflict: conflicts.length > 0,
      conflictDetails: conflicts,
    };
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const selectedTeacher = teachers.find((t) => t.id === values.teacherId);
      if (!selectedTeacher) {
        throw new Error("Teacher not found");
      }

      const schedules: ClassSchedule[] =
        values.schedules?.map((s: any) => ({
          Thứ: s.day,
          "Giờ bắt đầu": s.startTime.format("HH:mm"),
          "Giờ kết thúc": s.endTime.format("HH:mm"),
          "Địa điểm": s.location || "",
          "Phòng học": s.room || "",
          "Tên lớp": s.className || "",
        })) || [];

      // Check for schedule conflicts
      if (schedules.length > 0) {
        const conflictCheck = checkScheduleConflict(
          values.schedules || [],
          editingClass?.id
        );

        if (conflictCheck.hasConflict) {
          Modal.error({
            title: "Trùng lịch phòng học",
            content: (
              <div>
                <p>Phòng học đã có lớp khác trong các khung giờ sau:</p>
                <ul>
                  {conflictCheck.conflictDetails.map((detail, idx) => (
                    <li key={idx}>{detail}</li>
                  ))}
                </ul>
                <p>Vui lòng chọn phòng khác hoặc thay đổi lịch học.</p>
              </div>
            ),
          });
          setLoading(false);
          return;
        }
      }

      // Get room from first schedule entry (for backward compatibility)
      const firstScheduleRoom = schedules.length > 0 ? schedules[0]["Phòng học"] : "";
      const selectedRoom = rooms.find((r) => r.id === firstScheduleRoom);

      const classData = {
        "Tên lớp": values.className,
        "Mã lớp": values.classCode,
        "Môn học": values.subject,
        Khối: values.grade,
        "Giáo viên chủ nhiệm": selectedTeacher["Họ và tên"],
        "Teacher ID": values.teacherId,
        "Học sinh": editingClass?.["Học sinh"] || [],
        "Student IDs": editingClass?.["Student IDs"] || [],
        "Lịch học": schedules,
        "Phòng học": firstScheduleRoom || "",
        "Địa điểm": selectedRoom ? `${selectedRoom["Địa điểm"]} - ${selectedRoom["Tên phòng"]}` : "",
        "Học phí mỗi buổi": values.tuitionPerSession || 0,
        "Lương GV": values.teacherSalary || 0,
        "Ghi chú": values.notes || "",
        "Trạng thái": values.status,
        "Ngày tạo": editingClass?.["Ngày tạo"] || new Date().toISOString(),
        "Người tạo": editingClass?.["Người tạo"] || "admin", // Should be current user email
      };

      if (editingClass) {
        await updateClass(editingClass.id, classData);
      } else {
        await addClass(classData);
      }

      form.resetFields();
      onClose();
    } catch (error) {
      console.error("Error submitting form:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={editingClass ? "Chỉnh sửa lớp học" : "Thêm lớp học mới"}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      width={800}
      okText={editingClass ? "Cập nhật" : "Thêm"}
      cancelText="Hủy"
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          status: "active",
          schedules: [],
        }}
      >
        <Form.Item
          name="className"
          label="Tên lớp"
          rules={[{ required: true, message: "Vui lòng nhập tên lớp" }]}
        >
          <Input placeholder="VD: Lớp Toán 10A1" />
        </Form.Item>

        <Form.Item
          name="classCode"
          label="Mã lớp"
          rules={[{ required: true, message: "Vui lòng nhập mã lớp" }]}
        >
          <Input placeholder="VD: TOAN10A1" />
        </Form.Item>

        <Space style={{ width: "100%" }}>
          <Form.Item
            name="subject"
            label="Môn học"
            rules={[{ required: true, message: "Vui lòng nhập môn học" }]}
            style={{ flex: 1, minWidth: 200 }}
          >
            <Select placeholder="-- Chọn môn học --" options={subjectOptions} />
          </Form.Item>

          <Form.Item
            name="grade"
            label="Khối"
            rules={[{ required: true, message: "Vui lòng chọn khối" }]}
            style={{ flex: 1, minWidth: 200 }}
          >
            <Select placeholder="-- Chọn khối --" options={gradeOptions} />
          </Form.Item>
        </Space>

        <Form.Item
          name="teacherId"
          label={`Giáo viên chủ nhiệm ${teachers.length > 0 ? `(${teachers.length} giáo viên)` : ""}`}
          rules={[{ required: true, message: "Vui lòng chọn giáo viên" }]}
        >
          <Select
            placeholder={
              loadingTeachers
                ? "Đang tải danh sách giáo viên..."
                : "Chọn giáo viên"
            }
            showSearch
            loading={loadingTeachers}
            disabled={loadingTeachers}
            filterOption={(input, option) =>
              (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
            }
            options={teachers.map((t) => ({
              value: t.id,
              label: `${t["Họ và tên"]} (${t["Mã giáo viên"]})`,
            }))}
            notFoundContent={
              loadingTeachers ? "Đang tải..." : "Không tìm thấy giáo viên"
            }
          />
        </Form.Item>

        <Form.Item 
          name="tuitionPerSession" 
          label="Học phí mỗi buổi"
          rules={[{ required: true, message: "Vui lòng nhập học phí" }]}
        >
          <InputNumber<number>
            min={0}
            step={10000}
            placeholder="Nhập học phí mỗi buổi"
            style={{ width: "100%" }}
            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => {
              const parsed = value!.replace(/\$\s?|(,*)/g, '');
              return parsed === '' ? 0 : Number(parsed);
            }}
            addonAfter="VNĐ"
          />
        </Form.Item>

        <Form.Item
          name="teacherSalary"
          label="Lương GV"
        >
          <InputNumber<number>
            min={0}
            step={10000}
            placeholder="Nhập lương giáo viên"
            style={{ width: "100%" }}
            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => {
              const parsed = value!.replace(/\$\s?|(,*)/g, '');
              return parsed === '' ? 0 : Number(parsed);
            }}
            addonAfter="VNĐ"
          />
        </Form.Item>

        <Form.Item label="Lịch học trong tuần">
          <Form.List name="schedules">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Space
                    key={key}
                    style={{ display: "flex", marginBottom: 8 }}
                    align="baseline"
                  >
                    <Form.Item
                      {...restField}
                      name={[name, "day"]}
                      rules={[{ required: true, message: "Chọn thứ" }]}
                    >
                      <Select placeholder="Thứ" style={{ width: 100 }}>
                        <Select.Option value={2}>Thứ 2</Select.Option>
                        <Select.Option value={3}>Thứ 3</Select.Option>
                        <Select.Option value={4}>Thứ 4</Select.Option>
                        <Select.Option value={5}>Thứ 5</Select.Option>
                        <Select.Option value={6}>Thứ 6</Select.Option>
                        <Select.Option value={7}>Thứ 7</Select.Option>
                        <Select.Option value={8}>Chủ nhật</Select.Option>
                      </Select>
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, "className"]}
                    >
                      <Input 
                        placeholder="Tên lớp" 
                        style={{ width: 150 }}
                      />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, "startTime"]}
                      rules={[{ required: true, message: "Chọn giờ bắt đầu" }]}
                    >
                      <TimePicker format="HH:mm" placeholder="Giờ bắt đầu" />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, "endTime"]}
                      rules={[{ required: true, message: "Chọn giờ kết thúc" }]}
                    >
                      <TimePicker format="HH:mm" placeholder="Giờ kết thúc" />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, "room"]}
                    >
                      <Select 
                        placeholder="Phòng học" 
                        style={{ width: 180 }}
                        allowClear
                        showSearch
                        filterOption={(input, option) =>
                          (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                        options={[
                          { value: "", label: "Không chọn" },
                          ...rooms.map((room) => ({
                            value: room.id,
                            label: `${room["Tên phòng"]}`,
                          })),
                        ]}
                      />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(name)} />
                  </Space>
                ))}
                <Form.Item>
                  <Button
                    type="dashed"
                    onClick={() => add()}
                    block
                    icon={<PlusOutlined />}
                  >
                    Thêm lịch học
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </Form.Item>

        <Form.Item
          name="status"
          label="Trạng thái"
          rules={[{ required: true }]}
        >
          <Select>
            <Select.Option value="active">Hoạt động</Select.Option>
            <Select.Option value="inactive">Ngừng hoạt động</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item name="notes" label="Ghi chú">
          <Input.TextArea rows={3} placeholder="Ghi chú về lớp học" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ClassFormModal;
