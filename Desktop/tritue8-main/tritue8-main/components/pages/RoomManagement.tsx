import { useState, useEffect, useMemo } from "react";
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  message,
  Space,
  Popconfirm,
  Tag,
  Typography,
  Badge,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CalendarOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { ref, onValue, push, update, remove } from "firebase/database";
import { database } from "../../firebase";
import WrapperContent from "@/components/WrapperContent";

const { Text } = Typography;

interface Room {
  id: string;
  "Tên phòng": string;
  "Địa điểm": string;
  "Sức chứa"?: number;
  "Ghi chú"?: string;
}

interface Class {
  id: string;
  "Tên lớp": string;
  "Mã lớp": string;
  "Môn học": string;
  "Khối": string;
  "Giáo viên chủ nhiệm": string;
  "Phòng học"?: string;
  "Lịch học": Array<{
    "Thứ": number;
    "Giờ bắt đầu": string;
    "Giờ kết thúc": string;
    "Địa điểm"?: string;
  }>;
  "Học sinh": string[];
  "Trạng thái": "active" | "inactive";
}

const RoomManagement = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [form] = Form.useForm();

  // Load rooms and classes from Firebase
  useEffect(() => {
    const roomsRef = ref(database, "datasheet/Phòng_học");
    const classesRef = ref(database, "datasheet/Lớp_học");

    const unsubscribeRooms = onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const roomsList = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<Room, "id">),
        }));
        setRooms(roomsList);
      } else {
        setRooms([]);
      }
      setLoading(false);
    });

    const unsubscribeClasses = onValue(classesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const classList = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<Class, "id">),
        }));
        setClasses(classList);
      } else {
        setClasses([]);
      }
    });

    return () => {
      unsubscribeRooms();
      unsubscribeClasses();
    };
  }, []);

  // Map classes to rooms by Room ID
  const roomClassesMap = useMemo(() => {
    const map: Record<string, Class[]> = {};
    
    console.log("🏫 Total classes:", classes.length);
    console.log("🏫 Total rooms:", rooms.length);
    
    classes.forEach((cls) => {
      // Get room ID from class
      const roomId = 
        cls["Phòng học"] || 
        cls["Lịch học"]?.[0]?.["Địa điểm"] || 
        "";
      
      console.log(`📚 Class: ${cls["Tên lớp"]}, Room ID: "${roomId}", Status: ${cls["Trạng thái"]}`);
      
      if (roomId && cls["Trạng thái"] === "active") {
        if (!map[roomId]) {
          map[roomId] = [];
        }
        map[roomId].push(cls);
      }
    });
    
    console.log("🗺️ Room Classes Map (by ID):", map);
    return map;
  }, [classes, rooms]);

  const handleAdd = () => {
    setEditingRoom(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEdit = (room: Room) => {
    setEditingRoom(room);
    form.setFieldsValue({
      name: room["Tên phòng"],
      location: room["Địa điểm"],
      capacity: room["Sức chứa"],
      note: room["Ghi chú"],
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (roomId: string) => {
    try {
      const roomRef = ref(database, `datasheet/Phòng_học/${roomId}`);
      await remove(roomRef);
      message.success("Đã xóa phòng học thành công!");
    } catch (error) {
      console.error("Error deleting room:", error);
      message.error("Lỗi khi xóa phòng học");
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const roomData = {
        "Tên phòng": values.name,
        "Địa điểm": values.location,
        "Sức chứa": values.capacity || null,
        "Ghi chú": values.note || "",
      };

      if (editingRoom) {
        // Update existing room
        const roomRef = ref(database, `datasheet/Phòng_học/${editingRoom.id}`);
        await update(roomRef, roomData);
        message.success("Đã cập nhật phòng học thành công!");
      } else {
        // Add new room
        const roomsRef = ref(database, "datasheet/Phòng_học");
        await push(roomsRef, roomData);
        message.success("Đã thêm phòng học thành công!");
      }

      setIsModalOpen(false);
      form.resetFields();
    } catch (error) {
      console.error("Error saving room:", error);
      message.error("Lỗi khi lưu phòng học");
    }
  };

  const columns = [
    {
      title: "STT",
      key: "index",
      width: 60,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: "Tên phòng",
      dataIndex: "Tên phòng",
      key: "name",
      render: (text: string, record: Room) => {
        const classCount = roomClassesMap[record.id]?.length || 0;
        return (
          <Space>
            <strong>{text}</strong>
            {classCount > 0 && (
              <Badge count={classCount} style={{ backgroundColor: "#52c41a" }} />
            )}
          </Space>
        );
      },
    },
    {
      title: "Địa điểm",
      dataIndex: "Địa điểm",
      key: "location",
    },
    {
      title: "Sức chứa",
      dataIndex: "Sức chứa",
      key: "capacity",
      width: 120,
      render: (capacity: number) => (capacity ? `${capacity} người` : "-"),
    },
    {
      title: "Số lớp",
      key: "classCount",
      width: 100,
      render: (_: any, record: Room) => {
        const classCount = roomClassesMap[record.id]?.length || 0;
        return (
          <Tag color={classCount > 0 ? "green" : "default"}>
            {classCount} lớp
          </Tag>
        );
      },
    },
    {
      title: "Ghi chú",
      dataIndex: "Ghi chú",
      key: "note",
      render: (note: string) => note || "-",
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 150,
      render: (_: any, record: Room) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Sửa
          </Button>
          <Popconfirm
            title="Xóa phòng học"
            description="Bạn có chắc chắn muốn xóa phòng học này?"
            onConfirm={() => handleDelete(record.id)}
            okText="Xóa"
            cancelText="Hủy"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              Xóa
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Expandable row render
  const expandedRowRender = (room: Room) => {
    const roomName = room["Tên phòng"];
    const roomId = room.id;
    const roomClasses = roomClassesMap[roomId] || [];
    
    console.log(`🔍 Expanding room: "${roomName}" (ID: ${roomId}), Found classes:`, roomClasses.length);

    if (roomClasses.length === 0) {
      // Show all classes for debugging
      const allClassRooms = classes.map(c => ({
        name: c["Tên lớp"],
        room: c["Phòng học"] || c["Lịch học"]?.[0]?.["Địa điểm"] || "N/A",
        status: c["Trạng thái"]
      }));
      
      return (
        <div style={{ padding: "20px" }}>
          <div style={{ textAlign: "center", color: "#999", marginBottom: "16px" }}>
            Chưa có lớp học nào sử dụng phòng này
          </div>
          <details style={{ fontSize: "12px", color: "#666" }}>
            <summary style={{ cursor: "pointer", marginBottom: "8px" }}>
              🔍 Debug: Xem tất cả lớp học và phòng của chúng
            </summary>
            <pre style={{ background: "#f5f5f5", padding: "12px", borderRadius: "4px", overflow: "auto" }}>
              {JSON.stringify(allClassRooms, null, 2)}
            </pre>
          </details>
        </div>
      );
    }

    const classColumns = [
      {
        title: "Mã lớp",
        dataIndex: "Mã lớp",
        key: "code",
        width: 120,
        render: (text: string) => <Tag color="blue">{text}</Tag>,
      },
      {
        title: "Tên lớp",
        dataIndex: "Tên lớp",
        key: "name",
        render: (text: string) => <strong>{text}</strong>,
      },
      {
        title: "Môn học",
        dataIndex: "Môn học",
        key: "subject",
        width: 150,
      },
      {
        title: "Khối",
        dataIndex: "Khối",
        key: "grade",
        width: 80,
        render: (grade: string) => <Tag color="purple">Khối {grade}</Tag>,
      },
      {
        title: "Giáo viên",
        dataIndex: "Giáo viên chủ nhiệm",
        key: "teacher",
        width: 180,
        render: (text: string) => (
          <Space>
            <UserOutlined />
            {text}
          </Space>
        ),
      },
      {
        title: "Số học sinh",
        dataIndex: "Học sinh",
        key: "students",
        width: 120,
        render: (students: string[]) => (
          <Space>
            <TeamOutlined />
            <Text>{students?.length || 0} HS</Text>
          </Space>
        ),
      },
      {
        title: "Lịch học",
        dataIndex: "Lịch học",
        key: "schedule",
        render: (schedule: Class["Lịch học"]) => (
          <Space direction="vertical" size="small">
            {schedule?.map((s, idx) => {
              const dayNames = ["", "", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
              return (
                <Tag key={idx} icon={<CalendarOutlined />} color="cyan">
                  {dayNames[s["Thứ"]]} {s["Giờ bắt đầu"]}-{s["Giờ kết thúc"]}
                </Tag>
              );
            })}
          </Space>
        ),
      },
    ];

    return (
      <div style={{ padding: "0 24px 16px" }}>
        <Table
          columns={classColumns}
          dataSource={roomClasses}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </div>
    );
  };

  return (
    <WrapperContent title="Quản lý phòng học" isLoading={loading}>
      <Card
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            Thêm phòng học
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={rooms}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          expandable={{
            expandedRowRender,
            defaultExpandAllRows: false,
          }}
        />
      </Card>

      <Modal
        title={editingRoom ? "Sửa phòng học" : "Thêm phòng học"}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText={editingRoom ? "Cập nhật" : "Thêm"}
        cancelText="Hủy"
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label="Tên phòng"
            name="name"
            rules={[{ required: true, message: "Vui lòng nhập tên phòng" }]}
          >
            <Input placeholder="Ví dụ: Phòng 101, Phòng A1" />
          </Form.Item>

          <Form.Item
            label="Địa điểm"
            name="location"
            rules={[{ required: true, message: "Vui lòng nhập địa điểm" }]}
          >
            <Input placeholder="Ví dụ: Tầng 1, Tòa nhà A" />
          </Form.Item>

          <Form.Item label="Sức chứa" name="capacity">
            <Input type="number" placeholder="Số lượng học sinh tối đa" />
          </Form.Item>

          <Form.Item label="Ghi chú" name="note">
            <Input.TextArea rows={3} placeholder="Ghi chú về phòng học" />
          </Form.Item>
        </Form>
      </Modal>
    </WrapperContent>
  );
};

export default RoomManagement;
