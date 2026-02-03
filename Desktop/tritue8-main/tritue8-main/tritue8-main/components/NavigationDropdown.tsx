import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { useAppNavigation } from "../hooks/useAppNavigation";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

interface NavigationDropdownProps {
  currentView:
    | "landing"
    | "schedule"
    | "students"
    | "teachers"
    | "admin-calendar"
    | "attendance"
    | "invoice";
}

interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  action: () => void;
  adminOnly?: boolean;
}

const VIEW_LABELS: Record<string, string> = {
  schedule: "Study Schedule",
  students: "Students",
  teachers: "Teachers",
  "admin-calendar": "Admin Calendar",
  invoice: "Create Invoices",
  attendance: "Attendance",
};

const NavigationDropdown: React.FC<NavigationDropdownProps> = ({
  currentView,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { userProfile } = useAuth();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const {
    navigateToLanding,
    navigateToSchedule,
    navigateToStudents,
    navigateToTeachers,
    navigateToAdminCalendar,
    navigateToAttendance,
  } = useAppNavigation();

  const isAdmin = useMemo(() => userProfile?.role === "admin", [userProfile]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleNavigation = useCallback((action: () => void) => {
    action();
    setIsOpen(false);
  }, []);

  const menuItems: MenuItem[] = useMemo(
    () => [
      {
        id: "home",
        label: "Home",
        action: navigateToLanding,
      },
      {
        id: "schedule",
        label: "Study Schedule",
        action: navigateToSchedule,
      },
      {
        id: "students",
        label: "Students",
        action: navigateToStudents,
      },
      {
        id: "teachers",
        label: "Teachers",
        action: navigateToTeachers,
        adminOnly: true,
      },
      {
        id: "attendance",
        label: "📋 Attendance",
        action: navigateToAttendance,
      },
      // {
      //   id: "admin-calendar",
      //   label: "📅 Admin Calendar",
      //   action: navigateToAdminCalendar,
      //   adminOnly: true,
      // },
      {
        id: "invoice",
        label: "Create Invoices",
        action: () => navigate("/invoice"),
        adminOnly: true,
      },
    ],
    [
      navigateToLanding,
      navigateToSchedule,
      navigateToStudents,
      navigateToTeachers,
      navigateToAttendance,
      navigateToAdminCalendar,
      navigate,
    ]
  );

  const filteredMenuItems = useMemo(
    () =>
      menuItems.filter((item) => {
        // Don't show current view in dropdown
        if (item.id === currentView) return false;
        // Show home always
        if (item.id === "home") return true;
        // Filter admin-only items
        if (item.adminOnly && !isAdmin) return false;
        return true;
      }),
    [menuItems, currentView, isAdmin]
  );

  const currentViewLabel = VIEW_LABELS[currentView] || "Navigation";

  return (
    <div className="fixed top-24 right-4 z-9999" ref={dropdownRef}>
      {/* Dropdown Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-linear-to-r from-[#36797f] to-[#36797f] text-white px-4 py-3 rounded-lg font-bold shadow-2xl hover:opacity-90 transition-all flex items-center gap-2 min-w-[200px] justify-between"
        title="Navigation Menu"
      >
        <span className="text-black">{currentViewLabel}</span>
        <svg
          className={`w-5 h-5 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-[200px] bg-white rounded-lg shadow-2xl border-2 border-gray-200 overflow-hidden animate-fadeIn">
          {filteredMenuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigation(item.action)}
              className="w-full px-4 py-3 bg-white text-gray-800 hover:bg-blue-50 font-semibold transition flex items-center gap-2 border-b border-gray-200 last:border-b-0"
              title={item.label}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default NavigationDropdown;
