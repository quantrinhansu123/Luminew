import { useState, useEffect, useRef, useMemo } from "react";
import {
  Card,
  Button,
  Space,
  Empty,
  Select,
  Checkbox,
  Calendar as AntCalendar,
  Modal,
  Form,
  TimePicker,
  DatePicker,
  message,
  Tag,
  Popover,
  Input,
} from "antd";
import {
  LeftOutlined,
  RightOutlined,
  CalendarOutlined,
  BookOutlined,
  EnvironmentOutlined,
  EditOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  ExpandOutlined,
  CompressOutlined,
} from "@ant-design/icons";
import { useClasses } from "../../hooks/useClasses";
import { useAuth } from "../../contexts/AuthContext";
import { Class, ClassSchedule } from "../../types";
import { ref, onValue, push, set, remove, update } from "firebase/database";
import { database } from "../../firebase";
import { useNavigate } from "react-router-dom";
import dayjs, { Dayjs } from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isoWeek from "dayjs/plugin/isoWeek";
import "dayjs/locale/vi";
import WrapperContent from "@/components/WrapperContent";
import { subjectMap } from "@/utils/selectOptions";

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(isoWeek);
dayjs.locale("vi");

interface ScheduleEvent {
  class: Class;
  schedule: ClassSchedule;
  date: string;
  scheduleId?: string; // ID from Thời_khoá_biểu if exists
  isCustomSchedule?: boolean; // True if from Thời_khoá_biểu
}

interface TimetableEntry {
  id: string;
  "Class ID": string;
  "Mã lớp": string;
  "Tên lớp": string;
  "Ngày": string;
  "Thứ": number;
  "Giờ bắt đầu": string;
  "Giờ kết thúc": string;
  "Phòng học"?: string;
  "Ghi chú"?: string;
  "Thay thế ngày"?: string;
  "Thay thế thứ"?: number;
}

type ViewMode = "subject" | "all" | "location";

// Generate hourly time slots from 6:00 to 22:00
const HOUR_SLOTS = Array.from({ length: 17 }, (_, i) => {
  const hour = i + 6;
  return {
    hour,
    label: `${hour.toString().padStart(2, '0')}:00`,
    start: `${hour.toString().padStart(2, '0')}:00`,
    end: `${(hour + 1).toString().padStart(2, '0')}:00`,
  };
});

// Màu sắc nhạt hơn (đồng bộ với AdminSchedule)
const TEACHER_COLOR_PALETTE = [
  { bg: "#e6f4ff", border: "#91caff", text: "#0050b3" }, // light blue
  { bg: "#fff7e6", border: "#ffd591", text: "#d46b08" }, // light orange
  { bg: "#f6ffed", border: "#b7eb8f", text: "#389e0d" }, // light green
  { bg: "#fff0f6", border: "#ffadd2", text: "#c41d7f" }, // light pink
  { bg: "#f9f0ff", border: "#d3adf7", text: "#531dab" }, // light purple
  { bg: "#e6fffb", border: "#87e8de", text: "#08979c" }, // light cyan
  { bg: "#fffbe6", border: "#ffe58f", text: "#d48806" }, // light yellow
  { bg: "#e6f7ff", border: "#91d5ff", text: "#1d39c4" }, // light geekblue
  { bg: "#fcffe6", border: "#eaff8f", text: "#7cb305" }, // light lime
  { bg: "#fff1f0", border: "#ffa39e", text: "#cf1322" }, // light red
];

// Map lưu màu đã assign cho giáo viên
const teacherColorMap = new Map<string, { bg: string; border: string; text: string }>();
let colorAssignIndex = 0;

const getTeacherColor = (teacherId: string, teacherName: string) => {
  const key = teacherId || teacherName || 'unknown';
  if (!teacherColorMap.has(key)) {
    teacherColorMap.set(key, TEACHER_COLOR_PALETTE[colorAssignIndex % TEACHER_COLOR_PALETTE.length]);
    colorAssignIndex++;
  }
  return teacherColorMap.get(key)!;
};

const TeacherSchedule = () => {
  const { userProfile } = useAuth();
  const { classes, loading } = useClasses();
  const navigate = useNavigate();
  const [teacherData, setTeacherData] = useState<any>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState<Dayjs>(
    dayjs().startOf("isoWeek")
  );
  const [viewMode, setViewMode] = useState<ViewMode>("subject");
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [rooms, setRooms] = useState<Map<string, any>>(new Map());
  
  // Drag & Drop và Edit states
  const [timetableEntries, setTimetableEntries] = useState<Map<string, TimetableEntry>>(new Map());
  const [draggingEvent, setDraggingEvent] = useState<ScheduleEvent | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [editForm] = Form.useForm();
  
  // State cho modal xác nhận loại sửa đổi
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmModalType, setConfirmModalType] = useState<'edit' | 'drag'>('edit');
  const [pendingAction, setPendingAction] = useState<{
    event: ScheduleEvent;
    targetDate?: Dayjs;
    newValues?: any;
  } | null>(null);
  
  // State để ẩn/hiện bộ lọc và fullscreen
  const [showFilter, setShowFilter] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // State để mở rộng một ngày cụ thể
  const [expandedDay, setExpandedDay] = useState<Dayjs | null>(null);

  const teacherId =
    teacherData?.id || userProfile?.teacherId || userProfile?.uid || "";

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) =>
      currentWeekStart.clone().add(i, "day")
    );
  }, [currentWeekStart]);

  // Load rooms
  useEffect(() => {
    const roomsRef = ref(database, "datasheet/Phòng_học");
    const unsubscribe = onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const roomsMap = new Map();
        Object.entries(data).forEach(([id, room]: [string, any]) => {
          roomsMap.set(id, room);
        });
        setRooms(roomsMap);
      }
    });
    return () => unsubscribe();
  }, []);

  // Load timetable entries (lịch học bù)
  useEffect(() => {
    const timetableRef = ref(database, "datasheet/Thời_khoá_biểu");
    const unsubscribe = onValue(timetableRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const entriesMap = new Map<string, TimetableEntry>();
        Object.entries(data).forEach(([id, value]: [string, any]) => {
          const key = `${value["Class ID"]}_${value["Ngày"]}_${value["Thứ"]}`;
          entriesMap.set(key, { id, ...value });
        });
        setTimetableEntries(entriesMap);
      } else {
        setTimetableEntries(new Map());
      }
    });
    return () => unsubscribe();
  }, []);

  // Helper: Check if a date is replaced by a custom schedule
  const isDateReplacedByCustomSchedule = (classId: string, dateStr: string, dayOfWeek: number): boolean => {
    for (const [, entry] of timetableEntries) {
      if (
        entry["Class ID"] === classId &&
        entry["Thay thế ngày"] === dateStr &&
        entry["Thay thế thứ"] === dayOfWeek
      ) {
        return true;
      }
    }
    return false;
  };

  useEffect(() => {
    if (!userProfile?.email) return;

    const teachersRef = ref(database, "datasheet/Giáo_viên");
    const unsubscribe = onValue(teachersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const teacherEntry = Object.entries(data).find(
          ([_, teacher]: [string, any]) =>
            teacher.Email === userProfile.email ||
            teacher["Email công ty"] === userProfile.email
        );
        if (teacherEntry) {
          const [id, teacher] = teacherEntry;
          setTeacherData({ id, ...(teacher as any) });
        }
      }
    });
    return () => unsubscribe();
  }, [userProfile?.email]);

  // Helper to get room name from ID
  const getRoomName = (roomId: string): string => {
    if (!roomId) return "";
    const room = rooms.get(roomId);
    if (room) {
      return `${room["Tên phòng"]} - ${room["Địa điểm"]}`;
    }
    return roomId; // Fallback to ID if room not found
  };

  // Teacher's classes (for subject mode)
  const myClasses = useMemo(() => {
    return classes.filter((c) => {
      const match = c["Teacher ID"] === teacherId;
      return match && c["Trạng thái"] === "active";
    });
  }, [classes, teacherId]);

  // All active classes (for all and location modes)
  const allActiveClasses = useMemo(() => {
    return classes.filter((c) => c["Trạng thái"] === "active");
  }, [classes]);

  const subjects = Array.from(new Set(myClasses.map((c) => c["Môn học"]))).sort();

  // Get unique rooms from all active classes
  const locations = (() => {
    const roomSet = new Set<string>();
    allActiveClasses.forEach((c) => {
      if (c["Phòng học"] && c["Phòng học"].trim() !== "") {
        roomSet.add(c["Phòng học"]);
      }
    });
    return Array.from(roomSet).sort();
  })();

  const filteredClasses = useMemo(() => {
    if (viewMode === "subject") {
      // Lịch phân môn: Show only teacher's classes, optionally filtered by subject
      return selectedSubjects.size === 0
        ? myClasses
        : myClasses.filter((c) => selectedSubjects.has(c["Môn học"]));
    }
    
    if (viewMode === "all") {
      // Lịch tổng hợp: Show all active classes (like admin)
      return allActiveClasses;
    }
    
    if (viewMode === "location") {
      // Lịch theo phòng: Show all active classes, optionally filtered by room
      return selectedLocations.size === 0
        ? allActiveClasses
        : allActiveClasses.filter((c) => 
            c["Phòng học"] && selectedLocations.has(c["Phòng học"])
          );
    }
    
    return myClasses;
  }, [viewMode, selectedSubjects, selectedLocations, myClasses, allActiveClasses]);

  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  // Helper to calculate event position and height based on time
  const getEventStyle = (event: ScheduleEvent) => {
    const startTime = event.schedule["Giờ bắt đầu"];
    const endTime = event.schedule["Giờ kết thúc"];
    
    if (!startTime || !endTime) return { top: 0, height: 60 };
    
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    // Calculate position from 6:00 (first hour slot)
    const startOffset = (startHour - 6) * 60 + startMin;
    const endOffset = (endHour - 6) * 60 + endMin;
    const duration = endOffset - startOffset;
    
    // Each hour = 60px
    const top = startOffset;
    const height = Math.max(duration, 30); // minimum 30px height
    
    return { top, height };
  };

  // Group overlapping events for positioning
  const groupOverlappingEvents = (events: ScheduleEvent[]): { event: ScheduleEvent; column: number; totalColumns: number }[] => {
    if (events.length === 0) return [];
    
    // Sort by start time
    const sorted = [...events].sort((a, b) => {
      return a.schedule["Giờ bắt đầu"].localeCompare(b.schedule["Giờ bắt đầu"]);
    });
    
    // Find overlapping groups and assign columns
    const positioned: { event: ScheduleEvent; column: number; totalColumns: number }[] = [];
    
    sorted.forEach((event) => {
      const eventStart = event.schedule["Giờ bắt đầu"];
      const eventEnd = event.schedule["Giờ kết thúc"];
      
      // Find overlapping events already positioned
      const overlapping = positioned.filter((p) => {
        const pStart = p.event.schedule["Giờ bắt đầu"];
        const pEnd = p.event.schedule["Giờ kết thúc"];
        return eventStart < pEnd && eventEnd > pStart;
      });
      
      // Find first available column
      const usedColumns = new Set(overlapping.map(p => p.column));
      let column = 0;
      while (usedColumns.has(column)) column++;
      
      positioned.push({ event, column, totalColumns: 1 });
    });
    
    // Update totalColumns for all events in each overlapping group
    positioned.forEach((p) => {
      const overlapping = positioned.filter((other) => {
        const pStart = p.event.schedule["Giờ bắt đầu"];
        const pEnd = p.event.schedule["Giờ kết thúc"];
        const otherStart = other.event.schedule["Giờ bắt đầu"];
        const otherEnd = other.event.schedule["Giờ kết thúc"];
        return pStart < otherEnd && pEnd > otherStart;
      });
      p.totalColumns = Math.max(...overlapping.map(o => o.column)) + 1;
    });
    
    return positioned;
  };

  // Get all events for a specific date
  const getEventsForDate = (date: Dayjs): ScheduleEvent[] => {
    const events: ScheduleEvent[] = [];
    const dayOfWeek = date.day() === 0 ? 8 : date.day() + 1;
    const dateStr = date.format("YYYY-MM-DD");

    filteredClasses.forEach((classData) => {
      // First, check if there's a custom schedule in Thời_khoá_biểu
      const timetableKey = `${classData.id}_${dateStr}_${dayOfWeek}`;
      const customSchedule = timetableEntries.get(timetableKey);

      if (customSchedule) {
        events.push({
          class: classData,
          schedule: {
            "Thứ": customSchedule["Thứ"],
            "Giờ bắt đầu": customSchedule["Giờ bắt đầu"],
            "Giờ kết thúc": customSchedule["Giờ kết thúc"],
          },
          date: dateStr,
          scheduleId: customSchedule.id,
          isCustomSchedule: true,
        });
      } else {
        // Check if this date has been replaced by a custom schedule (moved to another day)
        if (isDateReplacedByCustomSchedule(classData.id, dateStr, dayOfWeek)) {
          return; // Skip this class
        }

        // Fallback to class schedule
        if (!classData["Lịch học"] || classData["Lịch học"].length === 0) {
          return; // Skip this class
        }

        classData["Lịch học"].filter((s) => s && s["Thứ"] === dayOfWeek).forEach((schedule) => {
          events.push({ class: classData, schedule, date: dateStr, isCustomSchedule: false });
        });
      }
    });

    return events;
  };

  const goToPreviousWeek = () =>
    setCurrentWeekStart((prev) => prev.subtract(1, "week"));
  const goToNextWeek = () => setCurrentWeekStart((prev) => prev.add(1, "week"));
  const goToToday = () => setCurrentWeekStart(dayjs().startOf("isoWeek"));

  const isToday = (date: Dayjs) => date.isSame(dayjs(), "day");
  
  // Refs để scroll đến các cột ngày
  const dayRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  
  // Helper to get subject abbreviation (1 chữ): Vật lý -> Lý, Toán -> Toán, Tiếng Anh -> Anh
  const getSubjectAbbreviation = (subjectName: string): string => {
    if (!subjectName) return "";
    
    // Map tên môn đầy đủ sang 1 chữ
    const subjectMap: Record<string, string> = {
      "Toán": "Toán",
      "Vật lý": "Lý",
      "Lý": "Lý",
      "Tiếng Anh": "Anh",
      "Anh": "Anh",
      "T.Anh": "Anh",
      "Hóa học": "Hóa",
      "Hóa": "Hóa",
      "Ngữ văn": "Văn",
      "Văn": "Văn",
      "Sinh học": "Sinh",
      "Sinh": "Sinh",
      "Lịch sử": "Sử",
      "Sử": "Sử",
      "Địa lý": "Địa",
      "Địa": "Địa",
      "GDCD": "GDCD",
      "Tin học": "Tin",
      "Tin": "Tin",
      "Thể dục": "TD",
      "Mỹ thuật": "MT",
      "Âm nhạc": "AN",
    };
    
    // Tìm trong map - ưu tiên match chính xác trước
    if (subjectMap[subjectName]) {
      return subjectMap[subjectName];
    }
    
    // Sau đó tìm partial match
    for (const [full, abbrev] of Object.entries(subjectMap)) {
      if (subjectName.includes(full)) {
        return abbrev;
      }
    }
    
    // Nếu không tìm thấy, trả về chữ đầu tiên
    return subjectName.charAt(0).toUpperCase();
  };

  // Helper to format class name with full Vietnamese name: T5 -> Toán 5, L5 -> Lý 5
  const formatShortClassName = (className: string, subjectName?: string): string => {
    if (!className) return "";
    
    // Lấy số từ tên lớp (ví dụ: "Toán 5" -> "5")
    const numberMatch = className.match(/\d+/);
    const number = numberMatch ? numberMatch[0] : "";
    
    // Nếu có subjectName, dùng nó để lấy tên môn đầy đủ
    if (subjectName) {
      // Convert từ key tiếng Anh sang tiếng Việt nếu cần (ví dụ: "Literature" -> "Ngữ văn")
      const vietnameseSubject = subjectMap[subjectName] || subjectName;
      const subjectAbbrev = getSubjectAbbreviation(vietnameseSubject);
      return number ? `${subjectAbbrev} ${number}` : subjectAbbrev;
    }
    
    // Nếu không có subjectName, tìm từ className
    // Map viết tắt sang tên đầy đủ tiếng Việt
    const abbrevToFull: Record<string, string> = {
      "T": "Toán",
      "Toán": "Toán",
      "TA": "Anh",
      "A": "Anh",
      "Anh": "Anh",
      "L": "Lý",
      "Lý": "Lý",
      "H": "Hóa",
      "Hóa": "Hóa",
      "V": "Văn",
      "Văn": "Văn",
      "S": "Sinh",
      "Sinh": "Sinh",
      "Đ": "Địa",
      "Địa": "Địa",
      "GD": "GDCD",
      "TD": "Thể dục",
      "MT": "Mỹ thuật",
      "AN": "Âm nhạc",
      "Tin": "Tin",
    };
    
    // Loại bỏ số và khoảng trắng để tìm viết tắt
    const abbrev = className.replace(/\d+/g, "").trim();
    
    // Tìm trong map
    for (const [key, value] of Object.entries(abbrevToFull)) {
      if (abbrev.includes(key) || className.includes(key)) {
        return number ? `${value} ${number}` : value;
      }
    }
    
    // Nếu không tìm thấy, trả về tên gốc
    return className;
  };

  // Helper to format full class name (T5 -> Toán 5, TA 5 -> T.Anh 5, etc.)
  const formatFullClassName = (className: string): string => {
    if (!className) return "";
    
    // Nếu tên lớp đã đầy đủ (chứa "Toán", "Anh", v.v.), trả về nguyên nhưng chuyển "T.Anh" thành "Anh"
    if (className.includes("Toán") || className.includes("T.Anh") || 
        className.includes("Lý") || className.includes("Hóa") || 
        className.includes("Văn") || className.includes("Anh") ||
        className.includes("Sinh") || className.includes("Sử") ||
        className.includes("Địa") || className.includes("GDCD") ||
        className.includes("Tin") || className.includes("Thể dục") ||
        className.includes("Mỹ thuật") || className.includes("Âm nhạc")) {
      // Chuyển "T.Anh" thành "Anh"
      return className.replace(/T\.Anh/g, "Anh");
    }
    
    // Map viết tắt sang tên đầy đủ
    const abbrevToFull: Record<string, string> = {
      "T": "Toán",
      "TA": "Anh",
      "A": "Anh",
      "L": "Lý",
      "H": "Hóa",
      "V": "Văn",
      "S": "Sinh",
      "Đ": "Địa",
      "GD": "GDCD",
      "TD": "Thể dục",
      "MT": "Mỹ thuật",
      "AN": "Âm nhạc",
    };
    
    // Tìm số trong tên lớp (ví dụ: "T5" -> "5")
    const numberMatch = className.match(/\d+/);
    const number = numberMatch ? numberMatch[0] : "";
    
    // Loại bỏ số và khoảng trắng để tìm viết tắt
    const abbrev = className.replace(/\d+/g, "").trim();
    
    // Tìm môn học từ viết tắt
    if (abbrevToFull[abbrev] && number) {
      return `${abbrevToFull[abbrev]} ${number}`;
    }
    
    // Nếu không tìm thấy, trả về tên gốc
    return className;
  };

  // Helper to abbreviate room name
  const abbreviateRoomName = (roomName: string): string => {
    if (!roomName) return "";
    const numberMatch = roomName.match(/\d+/);
    const number = numberMatch ? numberMatch[0] : "";
    if (roomName.includes("Phòng") || roomName.includes("phòng") || roomName.match(/^P\d+/i)) {
      return `P${number}`;
    }
    if (number) {
      const firstChar = roomName.charAt(0).toUpperCase();
      return `${firstChar}${number}`;
    }
    return roomName.substring(0, 3).toUpperCase();
  };

  const handleSubjectToggle = (subject: string) => {
    const newSelected = new Set(selectedSubjects);
    if (newSelected.has(subject)) {
      newSelected.delete(subject);
    } else {
      newSelected.add(subject);
    }
    setSelectedSubjects(newSelected);
  };

  const handleSelectAll = () => {
    if (viewMode === "subject") {
      if (selectedSubjects.size === subjects.length) {
        setSelectedSubjects(new Set());
      } else {
        setSelectedSubjects(new Set(subjects));
      }
    } else if (viewMode === "location") {
      if (selectedLocations.size === locations.length) {
        setSelectedLocations(new Set());
      } else {
        setSelectedLocations(new Set(locations));
      }
    }
  };

  const handleLocationToggle = (location: string) => {
    const newSelected = new Set(selectedLocations);
    if (newSelected.has(location)) {
      newSelected.delete(location);
    } else {
      newSelected.add(location);
    }
    setSelectedLocations(newSelected);
  };

  // ===== DRAG & DROP HANDLERS =====
  const handleDragStart = (e: React.DragEvent, event: ScheduleEvent) => {
    setDraggingEvent(event);
    e.dataTransfer.effectAllowed = "move";
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggingEvent(null);
    setDragOverDay(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
  };

  const handleDragOver = (e: React.DragEvent, dayIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDay(dayIndex);
  };

  const handleDragLeave = () => {
    setDragOverDay(null);
  };

  const handleDrop = async (e: React.DragEvent, targetDay: Dayjs) => {
    e.preventDefault();
    setDragOverDay(null);

    if (!draggingEvent) return;

    const newDateStr = targetDay.format("YYYY-MM-DD");
    const oldDateStr = draggingEvent.date;

    if (newDateStr === oldDateStr) {
      setDraggingEvent(null);
      return;
    }

    // Luôn hỏi người dùng muốn di chuyển tất cả hay chỉ ngày này
    setPendingAction({ event: draggingEvent, targetDate: targetDay });
    setConfirmModalType('drag');
    setConfirmModalVisible(true);
    setDraggingEvent(null);
  };

  // Di chuyển lịch cho tất cả các tuần (cập nhật thứ trong lịch gốc)
  const moveScheduleAllWeeks = async (event: ScheduleEvent, targetDate: Dayjs) => {
    try {
      const newDayOfWeek = targetDate.day() === 0 ? 8 : targetDate.day() + 1;
      const oldDayOfWeek = event.schedule["Thứ"];
      
      const classRef = ref(database, `datasheet/Lớp_học/${event.class.id}`);
      const currentSchedules = event.class["Lịch học"] || [];
      
      // Cập nhật thứ trong lịch học của lớp
      const updatedSchedules = currentSchedules.map((s: any) => {
        if (s["Thứ"] === oldDayOfWeek && 
            s["Giờ bắt đầu"] === event.schedule["Giờ bắt đầu"] &&
            s["Giờ kết thúc"] === event.schedule["Giờ kết thúc"]) {
          return {
            ...s,
            "Thứ": newDayOfWeek,
          };
        }
        return s;
      });
      
      await update(classRef, { "Lịch học": updatedSchedules });
      
      // Xóa tất cả các lịch bù liên quan đến thứ cũ của lớp này
      const entriesToDelete: string[] = [];
      timetableEntries.forEach((entry) => {
        if (entry["Class ID"] === event.class.id && 
            (entry["Thứ"] === oldDayOfWeek || entry["Thay thế thứ"] === oldDayOfWeek)) {
          entriesToDelete.push(entry.id);
        }
      });
      
      for (const entryId of entriesToDelete) {
        const entryRef = ref(database, `datasheet/Thời_khoá_biểu/${entryId}`);
        await remove(entryRef);
      }
      
      const oldDayName = ["", "", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"][oldDayOfWeek];
      const newDayName = ["", "", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"][newDayOfWeek];
      message.success(`Đã đổi lịch từ ${oldDayName} sang ${newDayName} cho tất cả các tuần`);
    } catch (error) {
      console.error("Error moving schedule for all weeks:", error);
      message.error("Có lỗi xảy ra khi di chuyển lịch");
    }
  };

  // Di chuyển lịch chỉ cho ngày này (tạo lịch bù)
  const moveScheduleThisDateOnly = async (event: ScheduleEvent, targetDate: Dayjs) => {
    const newDateStr = targetDate.format("YYYY-MM-DD");
    const oldDateStr = event.date;
    const newDayOfWeek = targetDate.day() === 0 ? 8 : targetDate.day() + 1;
    const oldDayOfWeek = event.schedule["Thứ"];

    try {
      const timetableData: Omit<TimetableEntry, "id"> = {
        "Class ID": event.class.id,
        "Mã lớp": event.class["Mã lớp"] || "",
        "Tên lớp": event.class["Tên lớp"] || "",
        "Ngày": newDateStr,
        "Thứ": newDayOfWeek,
        "Giờ bắt đầu": event.schedule["Giờ bắt đầu"],
        "Giờ kết thúc": event.schedule["Giờ kết thúc"],
        "Phòng học": event.class["Phòng học"] || "",
      };

      // Thêm thông tin ngày gốc bị thay thế
      if (!event.isCustomSchedule) {
        (timetableData as any)["Thay thế ngày"] = oldDateStr;
        (timetableData as any)["Thay thế thứ"] = oldDayOfWeek;
      }

      if (event.scheduleId) {
        // Lấy thông tin thay thế cũ nếu có
        const existingEntry = Array.from(timetableEntries.values()).find(
          entry => entry.id === event.scheduleId
        );
        if (existingEntry && existingEntry["Thay thế ngày"]) {
          (timetableData as any)["Thay thế ngày"] = existingEntry["Thay thế ngày"];
          (timetableData as any)["Thay thế thứ"] = existingEntry["Thay thế thứ"];
        }

        // Xóa entry cũ và tạo mới
        const oldEntryRef = ref(database, `datasheet/Thời_khoá_biểu/${event.scheduleId}`);
        await remove(oldEntryRef);
      }

      const timetableRef = ref(database, "datasheet/Thời_khoá_biểu");
      const newEntryRef = push(timetableRef);
      await set(newEntryRef, timetableData);

      message.success(`Đã di chuyển lịch từ ${oldDateStr} sang ${newDateStr}`);
    } catch (error) {
      console.error("Error moving schedule:", error);
      message.error("Có lỗi xảy ra khi di chuyển lịch học");
    }
  };

  // Xử lý khi người dùng xác nhận loại sửa đổi
  const handleConfirmAction = async (updateAll: boolean) => {
    setConfirmModalVisible(false);
    
    if (!pendingAction) return;
    
    if (confirmModalType === 'edit') {
      if (updateAll) {
        await saveScheduleAllWeeks(pendingAction.event, pendingAction.newValues);
      } else {
        await saveScheduleThisDateOnly(pendingAction.event, pendingAction.newValues);
      }
    } else if (confirmModalType === 'drag' && pendingAction.targetDate) {
      if (updateAll) {
        await moveScheduleAllWeeks(pendingAction.event, pendingAction.targetDate);
      } else {
        await moveScheduleThisDateOnly(pendingAction.event, pendingAction.targetDate);
      }
    }
    
    setPendingAction(null);
  };

  // Lưu lịch cho tất cả các tuần (cập nhật lịch gốc của lớp)
  const saveScheduleAllWeeks = async (event: ScheduleEvent, values: any) => {
    try {
      const classRef = ref(database, `datasheet/Lớp_học/${event.class.id}`);
      const currentSchedules = event.class["Lịch học"] || [];
      const dayOfWeek = event.schedule["Thứ"];
      
      // Cập nhật lịch học trong mảng Lịch học của lớp
      const updatedSchedules = currentSchedules.map((s: any) => {
        if (s["Thứ"] === dayOfWeek && 
            s["Giờ bắt đầu"] === event.schedule["Giờ bắt đầu"] &&
            s["Giờ kết thúc"] === event.schedule["Giờ kết thúc"]) {
          return {
            "Thứ": dayOfWeek,
            "Giờ bắt đầu": values["Giờ bắt đầu"].format("HH:mm"),
            "Giờ kết thúc": values["Giờ kết thúc"].format("HH:mm"),
          };
        }
        return s;
      });
      
      await update(classRef, { "Lịch học": updatedSchedules });
      
      // Xóa tất cả các lịch bù cùng thứ của lớp này (vì đã cập nhật lịch gốc)
      const entriesToDelete: string[] = [];
      timetableEntries.forEach((entry) => {
        if (entry["Class ID"] === event.class.id && entry["Thứ"] === dayOfWeek) {
          entriesToDelete.push(entry.id);
        }
      });
      
      for (const entryId of entriesToDelete) {
        const entryRef = ref(database, `datasheet/Thời_khoá_biểu/${entryId}`);
        await remove(entryRef);
      }
      
      message.success("Đã cập nhật lịch cho tất cả các tuần");
      setIsEditModalOpen(false);
      setEditingEvent(null);
      editForm.resetFields();
    } catch (error) {
      console.error("Error saving schedule for all weeks:", error);
      message.error("Có lỗi xảy ra khi lưu lịch học");
    }
  };

  // Lưu lịch chỉ cho ngày này (tạo/cập nhật lịch bù)
  const saveScheduleThisDateOnly = async (event: ScheduleEvent, values: any) => {
    try {
      const dateStr = event.date;
      const eventDate = dayjs(event.date);
      const dayOfWeek = eventDate.day() === 0 ? 8 : eventDate.day() + 1;

      const timetableData: Omit<TimetableEntry, "id"> = {
        "Class ID": event.class.id,
        "Mã lớp": event.class["Mã lớp"] || "",
        "Tên lớp": event.class["Tên lớp"] || "",
        "Ngày": dateStr,
        "Thứ": dayOfWeek,
        "Giờ bắt đầu": values["Giờ bắt đầu"].format("HH:mm"),
        "Giờ kết thúc": values["Giờ kết thúc"].format("HH:mm"),
        "Phòng học": values["Phòng học"] || "",
        "Ghi chú": values["Ghi chú"] || "",
      };

      if (event.scheduleId) {
        // Cập nhật lịch bù hiện có
        const entryRef = ref(database, `datasheet/Thời_khoá_biểu/${event.scheduleId}`);
        await set(entryRef, timetableData);
        message.success("Đã cập nhật lịch học bù");
      } else {
        // Tạo lịch bù mới
        const timetableRef = ref(database, "datasheet/Thời_khoá_biểu");
        const newEntryRef = push(timetableRef);
        await set(newEntryRef, timetableData);
        message.success("Đã tạo lịch học bù cho ngày này");
      }

      setIsEditModalOpen(false);
      setEditingEvent(null);
      editForm.resetFields();
    } catch (error) {
      console.error("Error saving schedule:", error);
      message.error("Có lỗi xảy ra khi lưu lịch học");
    }
  };

  // ===== EDIT SCHEDULE HANDLERS =====
  const handleEditSchedule = (event: ScheduleEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingEvent(event);
    editForm.setFieldsValue({
      "Giờ bắt đầu": event.schedule["Giờ bắt đầu"] ? dayjs(event.schedule["Giờ bắt đầu"], "HH:mm") : null,
      "Giờ kết thúc": event.schedule["Giờ kết thúc"] ? dayjs(event.schedule["Giờ kết thúc"], "HH:mm") : null,
      "Phòng học": event.class["Phòng học"] || "",
      "Ghi chú": event.schedule["Ghi chú"] || "",
    });
    setIsEditModalOpen(true);
  };

  const handleSaveSchedule = async () => {
    if (!editingEvent) return;
    
    try {
      const values = await editForm.validateFields();
      
      // Nếu đây là lịch bù (có scheduleId), update trực tiếp không cần hỏi
      if (editingEvent.isCustomSchedule && editingEvent.scheduleId) {
        await saveScheduleThisDateOnly(editingEvent, values);
        return;
      }
      
      // Nếu là lịch mặc định, hỏi người dùng muốn sửa tất cả hay chỉ ngày này
      setPendingAction({ event: editingEvent, newValues: values });
      setConfirmModalType('edit');
      setConfirmModalVisible(true);
    } catch (error) {
      console.error("Validation error:", error);
    }
  };

  const handleDeleteSchedule = async () => {
    if (!editingEvent || !editingEvent.scheduleId) {
      message.warning("Không thể xóa lịch mặc định");
      return;
    }

    try {
      const entryRef = ref(database, `datasheet/Thời_khoá_biểu/${editingEvent.scheduleId}`);
      await remove(entryRef);
      message.success("Đã xóa lịch học bù");
      setIsEditModalOpen(false);
      setEditingEvent(null);
      editForm.resetFields();
    } catch (error) {
      console.error("Error deleting schedule:", error);
      message.error("Có lỗi xảy ra khi xóa lịch học");
    }
  };

  if (myClasses.length === 0 && viewMode === "subject")
    return (
      <WrapperContent title="Lịch dạy tổng hợp" isLoading={loading}>
        <Empty description="Bạn chưa được phân công lớp học nào" />
      </WrapperContent>
    );

  return (
    <WrapperContent title="Lịch dạy tổng hợp" isLoading={loading}>
      <div 
        style={{ 
          display: "flex", 
          gap: "16px", 
          height: isFullscreen ? "calc(100vh - 100px)" : "calc(100vh - 200px)",
          position: isFullscreen ? "fixed" : "relative",
          top: isFullscreen ? "0" : "auto",
          left: isFullscreen ? "0" : "auto",
          right: isFullscreen ? "0" : "auto",
          bottom: isFullscreen ? "0" : "auto",
          zIndex: isFullscreen ? 1000 : "auto",
          backgroundColor: isFullscreen ? "#fff" : "transparent",
          padding: isFullscreen ? "20px" : "0",
        }}
      >
        {/* Sidebar */}
        <div
          style={{
            width: showFilter ? "280px" : "0px",
            flexShrink: 0,
            display: showFilter ? "flex" : "none",
            flexDirection: "column",
            gap: "16px",
            maxHeight: "100%",
            overflowY: showFilter ? "auto" : "hidden",
            transition: "width 0.3s ease, opacity 0.3s ease",
            opacity: showFilter ? 1 : 0,
          }}
        >
          {/* Mini Calendar */}
          <Card size="small" style={{ padding: "8px" }}>
            <AntCalendar
              fullscreen={false}
              value={currentWeekStart}
              onChange={(date) => setCurrentWeekStart(date.startOf("isoWeek"))}
            />
          </Card>

          {/* View Mode Selection */}
          <Card size="small" title="Bộ lọc lịch">
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "6px" }}>
                Chế độ xem:
              </div>
              <Select
                style={{ width: "100%" }}
                value={viewMode}
                onChange={(value) => {
                  setViewMode(value);
                  setSelectedSubjects(new Set());
                  setSelectedLocations(new Set());
                }}
                options={[
                  { value: "subject", label: "📚 Lịch phân môn" },
                  { value: "all", label: "📅 Lịch tổng hợp" },
                  { value: "location", label: "📍 Lịch theo phòng" },
                ]}
              />
            </div>

            {/* Subject Filter - Only show in subject mode */}
            {viewMode === "subject" && subjects.length > 0 && (
              <>
                <div style={{ marginBottom: "8px", paddingBottom: "8px", borderTop: "1px solid #f0f0f0", paddingTop: "8px" }}>
                  <Checkbox
                    checked={selectedSubjects.size === subjects.length}
                    indeterminate={selectedSubjects.size > 0 && selectedSubjects.size < subjects.length}
                    onChange={handleSelectAll}
                  >
                    <strong>
                      {selectedSubjects.size === 0
                        ? "Chọn tất cả"
                        : `Đã chọn ${selectedSubjects.size}/${subjects.length}`}
                    </strong>
                  </Checkbox>
                </div>

                <div style={{ maxHeight: "350px", overflowY: "auto" }}>
                  <Space direction="vertical" style={{ width: "100%" }} size="small">
                    {subjects.map((subject) => (
                      <Checkbox
                        key={subject}
                        checked={selectedSubjects.has(subject)}
                        onChange={() => handleSubjectToggle(subject)}
                        style={{ width: "100%" }}
                      >
                        <span style={{ fontSize: "13px" }}>
                          {subjectMap[subject] || subject}
                        </span>
                      </Checkbox>
                    ))}
                  </Space>
                </div>
              </>
            )}

            {viewMode === "subject" && subjects.length === 0 && (
              <Empty
                description="Không có môn học"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ margin: "20px 0" }}
              />
            )}

            {/* Location Filter */}
            {viewMode === "location" && locations.length > 0 && (
              <>
                <div style={{ marginBottom: "8px", paddingBottom: "8px", borderTop: "1px solid #f0f0f0", paddingTop: "8px" }}>
                  <Checkbox
                    checked={selectedLocations.size === locations.length}
                    indeterminate={selectedLocations.size > 0 && selectedLocations.size < locations.length}
                    onChange={handleSelectAll}
                  >
                    <strong>
                      {selectedLocations.size === 0
                        ? "Chọn tất cả"
                        : `Đã chọn ${selectedLocations.size}/${locations.length}`}
                    </strong>
                  </Checkbox>
                </div>

                <div style={{ maxHeight: "350px", overflowY: "auto" }}>
                  <Space direction="vertical" style={{ width: "100%" }} size="small">
                    {locations.map((roomId) => (
                      <Checkbox
                        key={roomId}
                        checked={selectedLocations.has(roomId)}
                        onChange={() => handleLocationToggle(roomId)}
                        style={{ width: "100%" }}
                      >
                        <span style={{ fontSize: "13px" }}>
                          {getRoomName(roomId)}
                        </span>
                      </Checkbox>
                    ))}
                  </Space>
                </div>
              </>
            )}

            {viewMode === "location" && locations.length === 0 && (
              <Empty
                description="Không có phòng học"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ margin: "20px 0" }}
              />
            )}
          </Card>
        </div>

        {/* Main Calendar View */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Week Navigation */}
          <Card style={{ marginBottom: "16px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Button icon={<LeftOutlined />} onClick={goToPreviousWeek}>
                Tuần trước
              </Button>
              <Space>
                <CalendarOutlined />
                <span style={{ fontSize: 16, fontWeight: "bold" }}>
                  Tuần {currentWeekStart.isoWeek()} -{" "}
                  {currentWeekStart.format("MMMM YYYY")}
                </span>
                <span style={{ color: "#999" }}>
                  ({currentWeekStart.format("DD/MM")} -{" "}
                  {currentWeekStart.add(6, "day").format("DD/MM")})
                </span>
              </Space>
              <Space>
                {expandedDay && (
                  <Button
                    onClick={() => setExpandedDay(null)}
                    title="Quay lại xem tất cả các ngày"
                  >
                    ← Xem tất cả
                  </Button>
                )}
                <Button
                  icon={showFilter ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
                  onClick={() => setShowFilter(!showFilter)}
                  title={showFilter ? "Ẩn bộ lọc" : "Hiện bộ lọc"}
                >
                  {showFilter ? "Ẩn bộ lọc" : "Hiện bộ lọc"}
                </Button>
                <Button
                  icon={isFullscreen ? <CompressOutlined /> : <ExpandOutlined />}
                  onClick={() => {
                    setIsFullscreen(!isFullscreen);
                    if (!isFullscreen) {
                      document.documentElement.requestFullscreen?.();
                    } else {
                      document.exitFullscreen?.();
                    }
                  }}
                  title={isFullscreen ? "Thu nhỏ" : "Mở rộng toàn màn hình"}
                >
                  {isFullscreen ? "Thu nhỏ" : "Toàn màn hình"}
                </Button>
                <Button onClick={goToToday}>Hôm nay</Button>
                <Button icon={<RightOutlined />} onClick={goToNextWeek}>
                  Tuần sau
                </Button>
              </Space>
            </div>
          </Card>

          {/* Main Calendar View */}
          {/* Schedule Grid - Hourly View */}
          <div style={{ flex: 1, overflow: "hidden", backgroundColor: "#fafbfc", border: "1px solid #e8e9ea", borderRadius: "8px", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", width: "100%", flex: 1, minWidth: 0, overflow: "auto" }}>
              {/* Time Column */}
              <div style={{ width: "60px", flexShrink: 0, borderRight: "1px solid #e8e9ea", backgroundColor: "#f5f6f7" }}>
                {/* Empty header cell */}
                <div style={{ 
                  height: "60px", 
                  borderBottom: "1px solid #f0f0f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  color: "#999"
                }}>
                  GMT+07
                </div>
                {/* Hour labels */}
                {HOUR_SLOTS.map((slot) => (
                  <div
                    key={slot.hour}
                    style={{
                      height: "60px",
                      borderBottom: "1px solid #f0f0f0",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "flex-end",
                      paddingRight: "8px",
                      paddingTop: "4px",
                      fontSize: "11px",
                      color: "#666",
                    }}
                  >
                    {slot.label}
                  </div>
                ))}
              </div>

              {/* Day Columns */}
              {weekDays
                .filter((day) => !expandedDay || day.isSame(expandedDay, "day"))
                .map((day, dayIndex) => {
                const dayEvents = getEventsForDate(day);
                const positionedEvents = groupOverlappingEvents(dayEvents);
                const isDragOver = dragOverDay === dayIndex;
                const isTodayColumn = isToday(day);
                const isExpanded = expandedDay && day.isSame(expandedDay, "day");

                return (
                  <div
                    key={dayIndex}
                    ref={(el) => {
                      if (el) {
                        dayRefs.current.set(dayIndex, el);
                      } else {
                        dayRefs.current.delete(dayIndex);
                      }
                    }}
                    style={{
                      flex: isExpanded ? "1 1 100%" : "1 1 0%",
                      minWidth: isExpanded ? "100%" : "0",
                      width: isExpanded ? "100%" : "auto",
                      maxWidth: isExpanded ? "100%" : "none",
                      borderRight: (dayIndex < 6 && !isExpanded) ? "1px solid #e8e9ea" : "none",
                      position: "relative",
                      scrollMargin: "0 20px",
                      transition: "all 0.3s ease",
                      flexShrink: isExpanded ? 0 : 1,
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverDay(dayIndex);
                    }}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverDay(null);
                      if (draggingEvent) {
                        handleDrop(e, day);
                      }
                    }}
                  >
                    {/* Day Header */}
                    <div
                      onClick={() => {
                        if (expandedDay && day.isSame(expandedDay, "day")) {
                          setExpandedDay(null);
                        } else {
                          setExpandedDay(day);
                        }
                      }}
                      style={{
                        height: "60px",
                        borderBottom: "1px solid #e8e9ea",
                        backgroundColor: isTodayColumn ? "#e6f7ff" : isExpanded ? "#e6f7ff" : "#f5f6f7",
                        borderTop: (isTodayColumn || isExpanded) ? "3px solid #1890ff" : "none",
                        boxShadow: (isTodayColumn || isExpanded) ? "0 2px 8px rgba(24, 144, 255, 0.15)" : "none",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "sticky",
                        top: 0,
                        zIndex: 10,
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        if (!isExpanded && !isTodayColumn) {
                          e.currentTarget.style.backgroundColor = "#f0f0f0";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isExpanded && !isTodayColumn) {
                          e.currentTarget.style.backgroundColor = "#f5f6f7";
                        }
                      }}
                    >
                      <div style={{ fontSize: "12px", color: "#666", textTransform: "capitalize", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                        {day.format("dddd")}
                        {isExpanded && (
                          <Tag color="blue" style={{ fontSize: "10px", margin: 0 }}>
                            Đã mở rộng
                          </Tag>
                        )}
                      </div>
                      <div style={{ 
                        fontSize: "20px", 
                        fontWeight: "bold",
                        color: (isToday(day) || isExpanded) ? "#1890ff" : "#333",
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: (isToday(day) || isExpanded) ? "#1890ff" : "transparent",
                        ...((isToday(day) || isExpanded) && { color: "white" })
                      }}>
                        {day.format("D")}
                      </div>
                      {isExpanded && (
                        <div style={{ fontSize: "10px", color: "#1890ff", marginTop: "4px", fontWeight: "500" }}>
                          Click để quay lại
                        </div>
                      )}
                    </div>

                    {/* Hour Grid with Events */}
                    <div
                      style={{
                        position: "relative",
                        height: `${HOUR_SLOTS.length * 60}px`,
                        backgroundColor: isDragOver ? "#e6f7ff" : isTodayColumn ? "#f0f8ff" : "#fafbfc",
                      }}
                    >
                      {/* Hour lines */}
                      {HOUR_SLOTS.map((slot, idx) => (
                        <div
                          key={slot.hour}
                          style={{
                            position: "absolute",
                            top: idx * 60,
                            left: 0,
                            right: 0,
                            height: "60px",
                            borderBottom: "1px solid #f5f5f5",
                          }}
                        />
                      ))}

                      {/* Current time indicator */}
                      {isToday(day) && (() => {
                        const now = dayjs();
                        const currentHour = now.hour();
                        const currentMin = now.minute();
                        if (currentHour >= 6 && currentHour < 23) {
                          const topPosition = (currentHour - 6) * 60 + currentMin;
                          return (
                            <div
                              style={{
                                position: "absolute",
                                top: topPosition,
                                left: 0,
                                right: 0,
                                height: "2px",
                                backgroundColor: "#ff4d4f",
                                zIndex: 5,
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  left: -4,
                                  top: -4,
                                  width: "10px",
                                  height: "10px",
                                  borderRadius: "50%",
                                  backgroundColor: "#ff4d4f",
                                }}
                              />
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Events */}
                      {positionedEvents.map(({ event, column, totalColumns }, idx) => {
                        const { top, height } = getEventStyle(event);
                        const eventKey = `${event.class.id}_${event.date}_${event.schedule["Thứ"]}`;
                        const isDragging = draggingEvent?.class.id === event.class.id && draggingEvent?.date === event.date;
                        
                        // Calculate width and left position for overlapping events
                        const gap = 4;
                        const width = `calc((100% - ${(totalColumns - 1) * gap}px) / ${totalColumns})`;
                        const left = `calc(${column} * ((100% - ${(totalColumns - 1) * gap}px) / ${totalColumns} + ${gap}px))`;

                        // Màu sắc theo GIÁO VIÊN
                        const colorScheme = getTeacherColor(
                          event.class["Teacher ID"] || "",
                          event.class["Giáo viên chủ nhiệm"] || ""
                        );

                        return (
                          <div
                            key={`${eventKey}_${idx}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, event)}
                            onDragEnd={handleDragEnd}
                            style={{
                              position: "absolute",
                              top: top,
                              left: left,
                              width: width,
                              minWidth: 0,
                              maxWidth: width,
                              height: Math.max(height, 70),
                              backgroundColor: colorScheme.bg,
                              borderLeft: `4px solid ${colorScheme.border}`,
                              borderRadius: "4px",
                              padding: "6px 4px 6px 8px",
                              fontSize: "12px",
                              overflow: "hidden",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "flex-start",
                              boxSizing: "border-box",
                              cursor: "pointer",
                              opacity: isDragging ? 0.5 : 1,
                              zIndex: 2,
                              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
                              e.currentTarget.style.zIndex = "15";
                              e.currentTarget.style.transform = "translateY(-1px)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
                              e.currentTarget.style.zIndex = "2";
                              e.currentTarget.style.transform = "translateY(0)";
                            }}
                            onClick={() => navigate(`/workspace/classes/${event.class.id}/history`)}
                          >
                            <Popover
                              content={
                                <div style={{ maxWidth: "250px" }}>
                                  <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
                                    {event.class["Tên lớp"]}
                                  </div>
                                  <div style={{ fontSize: "12px", marginBottom: "4px" }}>
                                    🕐 {event.schedule["Giờ bắt đầu"]} - {event.schedule["Giờ kết thúc"]}
                                  </div>
                                  <div style={{ fontSize: "12px", marginBottom: "4px" }}>
                                    👨‍🏫 {event.class["Giáo viên chủ nhiệm"]}
                                  </div>
                                  {event.class["Phòng học"] && (
                                    <div style={{ fontSize: "12px", marginBottom: "4px" }}>
                                      📍 {getRoomName(event.class["Phòng học"])}
                                    </div>
                                  )}
                                  <div style={{ marginTop: "8px" }}>
                                    <Space size={4}>
                                      <Button size="small" type="primary" onClick={(e) => { e.stopPropagation(); handleEditSchedule(event, e); }}>
                                        <EditOutlined /> Sửa lịch
                                      </Button>
                                    </Space>
                                  </div>
                                </div>
                              }
                              trigger="hover"
                              placement="right"
                            >
                              <div style={{ 
                                height: "100%", 
                                display: "flex", 
                                flexDirection: "column", 
                                gap: "3px", 
                                justifyContent: "flex-start",
                                minHeight: "60px",
                              }}>
                                {/* Hàng 1: Tên lớp viết tắt - Tên giáo viên */}
                                <div style={{ 
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  flexShrink: 0,
                                  lineHeight: "1.3",
                                }}>
                                  <div style={{ 
                                    fontWeight: "bold", 
                                    color: colorScheme.text, 
                                    fontSize: height < 70 ? "12px" : "13px", 
                                    whiteSpace: "nowrap",
                                  }}>
                                    {formatShortClassName(event.class["Tên lớp"], event.class["Môn học"])}
                                  </div>
                                  {event.class["Giáo viên chủ nhiệm"] && (
                                    <div style={{ 
                                      color: colorScheme.text, 
                                      fontSize: height < 70 ? "9px" : "10px", 
                                      opacity: 0.85, 
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      flex: 1,
                                    }}>
                                      {event.class["Giáo viên chủ nhiệm"]}
                                    </div>
                                  )}
                                </div>
                                
                                {/* Hàng 2: Phòng học viết tắt - Lịch học (giờ) */}
                                <div style={{ 
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  flexShrink: 0,
                                  lineHeight: "1.3",
                                }}>
                                  {getRoomName(event.class["Phòng học"]) && (
                                    <div style={{ 
                                      color: colorScheme.text, 
                                      fontSize: height < 70 ? "10px" : "11px", 
                                      opacity: 0.9, 
                                      whiteSpace: "nowrap",
                                      fontWeight: "500",
                                    }}>
                                      {abbreviateRoomName(getRoomName(event.class["Phòng học"]))}
                                    </div>
                                  )}
                                  <div style={{ 
                                    color: colorScheme.text, 
                                    fontSize: height < 70 ? "9px" : "10px", 
                                    opacity: 0.85, 
                                    whiteSpace: "nowrap",
                                    flex: 1,
                                  }}>
                                    {event.schedule["Giờ bắt đầu"]} - {event.schedule["Giờ kết thúc"]}
                                  </div>
                                </div>
                                
                                {/* Tag Đã sửa */}
                                {event.isCustomSchedule && height > 70 && (
                                  <Tag color="orange" style={{ 
                                    fontSize: "8px", 
                                    marginTop: "2px", 
                                    padding: "1px 4px", 
                                    alignSelf: "flex-start",
                                    lineHeight: "1.2",
                                  }}>
                                    Đã sửa
                                  </Tag>
                                )}
                              </div>
                            </Popover>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Modal - Hỏi sửa tất cả hay chỉ ngày này */}
      <Modal
        title={confirmModalType === 'edit' ? "Chọn loại cập nhật" : "Chọn loại di chuyển"}
        open={confirmModalVisible}
        onCancel={() => {
          setConfirmModalVisible(false);
          setPendingAction(null);
        }}
        footer={null}
        width={500}
      >
        <div style={{ padding: "16px 0" }}>
          {pendingAction && (
            <div style={{ marginBottom: "20px", padding: "12px", backgroundColor: "#f5f5f5", borderRadius: "8px" }}>
              <div><strong>Lớp:</strong> {pendingAction.event.class["Tên lớp"]}</div>
              <div><strong>Thời gian:</strong> {pendingAction.event.schedule["Giờ bắt đầu"]} - {pendingAction.event.schedule["Giờ kết thúc"]}</div>
              {confirmModalType === 'drag' && pendingAction.targetDate && (
                <div style={{ marginTop: "8px", color: "#1890ff" }}>
                  <strong>Di chuyển từ:</strong> {dayjs(pendingAction.event.date).format("dddd, DD/MM/YYYY")}
                  <br />
                  <strong>Đến:</strong> {pendingAction.targetDate.format("dddd, DD/MM/YYYY")}
                </div>
              )}
            </div>
          )}
          
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <Button 
              type="primary" 
              size="large" 
              block 
              onClick={() => handleConfirmAction(true)}
              style={{ height: "auto", padding: "16px", textAlign: "left" }}
            >
              <div>
                <div style={{ fontWeight: "bold", fontSize: "15px" }}>
                  {confirmModalType === 'edit' ? "📅 Sửa tất cả các tuần" : "📅 Di chuyển tất cả các tuần"}
                </div>
                <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "4px" }}>
                  {confirmModalType === 'edit' 
                    ? "Cập nhật lịch gốc của lớp. Thay đổi sẽ áp dụng cho tất cả các tuần."
                    : "Thay đổi thứ học cố định của lớp. Từ tuần này trở đi lớp sẽ học vào thứ mới."
                  }
                </div>
              </div>
            </Button>
            
            <Button 
              size="large" 
              block 
              onClick={() => handleConfirmAction(false)}
              style={{ height: "auto", padding: "16px", textAlign: "left" }}
            >
              <div>
                <div style={{ fontWeight: "bold", fontSize: "15px" }}>
                  {confirmModalType === 'edit' ? "📌 Chỉ sửa ngày này" : "📌 Chỉ di chuyển ngày này"}
                </div>
                <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "4px" }}>
                  {confirmModalType === 'edit' 
                    ? "Tạo lịch học bù riêng cho ngày này. Các tuần khác giữ nguyên."
                    : "Tạo lịch học bù cho ngày mới. Các tuần khác vẫn học theo lịch cũ."
                  }
                </div>
              </div>
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Schedule Modal */}
      <Modal
        title={`Chỉnh sửa lịch dạy - ${editingEvent?.class["Tên lớp"] || ""}`}
        open={isEditModalOpen}
        onCancel={() => {
          setIsEditModalOpen(false);
          setEditingEvent(null);
          editForm.resetFields();
        }}
        footer={[
          editingEvent?.scheduleId && (
            <Button key="delete" danger onClick={handleDeleteSchedule}>
              Xóa lịch bù
            </Button>
          ),
          <Button key="cancel" onClick={() => {
            setIsEditModalOpen(false);
            setEditingEvent(null);
            editForm.resetFields();
          }}>
            Hủy
          </Button>,
          <Button key="save" type="primary" onClick={handleSaveSchedule}>
            Lưu
          </Button>,
        ]}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label="Lớp học">
            <Input value={editingEvent?.class["Tên lớp"]} disabled />
          </Form.Item>
          <Form.Item label="Môn học">
            <Input value={subjectMap[editingEvent?.class["Môn học"] || ""] || editingEvent?.class["Môn học"]} disabled />
          </Form.Item>
          <Form.Item label="Giáo viên">
            <Input value={editingEvent?.class["Giáo viên chủ nhiệm"]} disabled />
          </Form.Item>
          
          <Space style={{ width: "100%" }}>
            <Form.Item
              name="Giờ bắt đầu"
              label="Giờ bắt đầu"
              rules={[{ required: true, message: "Vui lòng chọn giờ bắt đầu" }]}
              style={{ flex: 1 }}
            >
              <TimePicker format="HH:mm" style={{ width: "100%" }} />
            </Form.Item>
            
            <Form.Item
              name="Giờ kết thúc"
              label="Giờ kết thúc"
              rules={[{ required: true, message: "Vui lòng chọn giờ kết thúc" }]}
              style={{ flex: 1 }}
            >
              <TimePicker format="HH:mm" style={{ width: "100%" }} />
            </Form.Item>
          </Space>
          
          <Form.Item
            name="Phòng học"
            label="Phòng học"
          >
            <Select 
              placeholder="Chọn phòng học" 
              allowClear
              options={Array.from(rooms.values()).map((room) => ({
                label: `${room["Tên phòng"]} - ${room["Địa điểm"]}`,
                value: room.id,
              }))}
            />
          </Form.Item>
          
          <Form.Item
            name="Ghi chú"
            label="Ghi chú"
          >
            <Input.TextArea rows={2} placeholder="Thêm ghi chú cho lịch học này" />
          </Form.Item>
        </Form>
      </Modal>
    </WrapperContent>
  );
};

export default TeacherSchedule;
