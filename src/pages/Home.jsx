import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  CalendarCheck,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  DollarSign,
  Edit3,
  FileText,
  LayoutGrid,
  ListTodo,
  LogOut,
  MapPin,
  Megaphone,
  Menu,
  Package,
  PlusCircle,
  Search,
  Settings,
  ShoppingCart,
  Table2,
  Target,
  Truck,
  TrendingUp,
  UserPlus,
  Users,
  XCircle
} from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChangePasswordModal } from "../components/modals/ChangePasswordModal";
import FfmMgtHcmIcon from "../components/icons/FfmMgtHcmIcon";
import FfmReconcileHcmIcon from "../components/icons/FfmReconcileHcmIcon";
import VanHanhHcmIcon from "../components/icons/VanHanhHcmIcon";

import { usePermissions } from "../hooks/usePermissions";
import { useUserDepartment } from "../hooks/useUserDepartment";
import { supabase } from "../supabase/config";
import { isExecutiveDashboardAudience } from "../utils/executiveAccess";

function Home() {
  const navigate = useNavigate();
  const { canView, loading: permsLoading, role: dbRoleCode } = usePermissions();
  const { department: userDepartment } = useUserDepartment();
  const [userRole, setUserRole] = useState("user");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const [expandedMenus, setExpandedMenus] = useState({});
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null); // Track selected group

  const toggleMenu = (id) => {
    setExpandedMenus(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userTeam');
    navigate('/dang-nhap');
  };

  useEffect(() => {
    // Fix: Normalize role to lowercase to match config keys
    const rawRole = localStorage.getItem("userRole") || "user";
    setUserRole(rawRole.toLowerCase());
  }, []);

  const allMenuItems = [
    {
      id: "home",
      label: "Menu chức năng",
      icon: <div className="w-5 h-5 bg-green-500 rounded flex items-center justify-center"><div className="grid grid-cols-2 gap-0.5 w-3 h-3"><div className="bg-white rounded-sm"></div><div className="bg-white rounded-sm"></div><div className="bg-white rounded-sm"></div><div className="bg-white rounded-sm"></div></div></div>,
      path: "/",
      active: location.pathname === "/" || location.pathname === "/trang-chu",
    },
    {
      id: "dashboard",
      label: "Dashboard điều hành",
      icon: <BarChart3 className="w-5 h-5" />,
      path: "#",
      adminOnly: true,
      allowDirectorDept: true,
      subItems: [
        {
          id: "dashboard-growth",
          label: "Dashboard Tăng trưởng",
          icon: <TrendingUp className="w-4 h-4" />,
          path: "https://redirect.zalo.me/v3/verifyv2/pc?token=P6BqnjfrMGXk3lx3rnrRPsWD_gdV7LDYO0Ft-uiMM6Gt1FsbWXaDF3KEhlRQ45yqPWpm-pTZP0&continue=https%3A%2F%2Fdashboard-lumiquantri.vercel.app%2F",
          isExternal: true,
        },
        {
          id: "dashboard-kpi",
          label: "Dashboard KPI",
          icon: <Target className="w-4 h-4" />,
          path: "https://redirect.zalo.me/v3/verifyv2/pc?token=P6BqnjfrMGXk3lx3rnrRPsWD_gdV7LDYO0Ft-uiMM6Gt1FsbWXaDF3KEhlRQ45yqPWpm-pTZP0&continue=https%3A%2F%2Fdashboard-lumiquantri.vercel.app%2F",
          isExternal: true,
        },
        {
          id: "dashboard-okr",
          label: "Dashboard OKR",
          icon: <Award className="w-4 h-4" />,
          path: "https://redirect.zalo.me/v3/verifyv2/pc?token=P6BqnjfrMGXk3lx3rnrRPsWD_gdV7LDYO0Ft-uiMM6Gt1FsbWXaDF3KEhlRQ45yqPWpm-pTZP0&continue=https%3A%2F%2Fdashboard-lumiquantri.vercel.app%2F",
          isExternal: true,
        },
        {
          id: "dashboard-cancel",
          label: "Dashboard Đơn hủy",
          icon: <XCircle className="w-4 h-4" />,
          path: "#",
          disabled: true, // Custom flag if needed, or just path #
        },
        {
          id: "dashboard-ops",
          label: "Dashboard Vận hành",
          icon: <Activity className="w-4 h-4" />,
          path: "https://dashboard-psi-six-69.vercel.app/",
          isExternal: true,
        },
        {
          id: "dashboard-quan-tri",
          label: "Dashboard quản trị",
          icon: <LayoutGrid className="w-4 h-4" />,
          path: "/dashboard-quan-tri",
          adminOnly: true,
          allowDirectorDept: true,
        },
      ],
    },
    {
      id: "crm",
      label: "CSKH & CRM",
      icon: <Users className="w-5 h-5" />,
      path: "#",
      // permission: 'MODULE_CSKH', // Optional: Hide entire group if no child is visible
      subItems: [
        {
          id: "crm-list",
          label: "Danh sách đơn",
          icon: <Users className="w-4 h-4" />,
          path: "/quan-ly-cskh",
          permission: 'CSKH_LIST',
        },
        {
          id: "crm-list-hcm",
          label: "Danh sách đơn CSKH HCM",
          icon: <MapPin className="w-4 h-4" />,
          path: "/quan-ly-cskh-hcm",
          permission: 'CSKH_LIST_HCM',
        },
        {
          id: "crm-paid",
          label: "Đơn đã thu tiền/cần CS",
          icon: <FileText className="w-4 h-4" />,
          path: "/don-chia-cskh",
          permission: 'CSKH_PAID',
        },
        {
          id: "crm-paid-hcm",
          label: "Đơn đã thu tiền/cần CS (HCM)",
          icon: <MapPin className="w-4 h-4" />,
          path: "/don-chia-cskh-hcm",
          permission: 'CSKH_PAID_HCM',
        },
        {
          id: "crm-new-order",
          label: "Nhập đơn mới",
          icon: <PlusCircle className="w-4 h-4" />,
          path: "/nhap-don",
          permission: 'CSKH_NEW_ORDER',
        },
        {
          id: "crm-new-order-hcm",
          label: "Nhập đơn HCM",
          icon: <PlusCircle className="w-4 h-4" />,
          path: "/nhap-don?view=hcm",
          permission: 'CSKH_NEW_ORDER_HCM',
        },
        {
          id: "crm-input-report",
          label: "Nhập báo cáo",
          icon: <Edit3 className="w-4 h-4" />,
          path: "/nhap-bao-cao-cskh",
          permission: 'CSKH_INPUT',
        },
        {
          id: "crm-input-report-hcm",
          label: "Nhập báo cáo CSKH HCM",
          icon: <Edit3 className="w-4 h-4" />,
          path: "/nhap-bao-cao-cskh-hcm",
          permission: 'CSKH_INPUT_HCM',
        },
        {
          id: "crm-view-report",
          label: "Xem báo cáo Sale",
          icon: <BarChart3 className="w-4 h-4" />,
          path: "/xem-bao-cao-cskh",
          permission: 'CSKH_VIEW',
        },
        {
          id: "crm-view-report-hcm",
          label: "Xem báo cáo CSKH HCM",
          icon: <BarChart3 className="w-4 h-4" />,
          path: "/xem-bao-cao-cskh-hcm",
          permission: 'CSKH_VIEW_HCM',
        },
        {
          id: "crm-manual-cskh",
          label: "Ds báo cáo tay CSKH",
          icon: <Database className="w-4 h-4" />,
          path: "/danh-sach-bao-cao-tay-cskh",
          permissionAny: ['CSKH_VIEW', 'CSKH_MANUAL'],
        },
        {
          id: "crm-manual-cskh-hcm",
          label: "Ds báo cáo tay CSKH HCM",
          icon: <Database className="w-4 h-4" />,
          path: "/danh-sach-bao-cao-tay-cskh-hcm",
          permission: 'CSKH_MANUAL_HCM',
        },
        {
          id: "crm-history",
          label: "Lịch sử thay đổi",
          icon: <ClipboardList className="w-4 h-4" />,
          path: "/lich-su-cskh",
          permission: 'CSKH_HISTORY',
        },
      ],
    },
    {
      id: "sale",
      label: "Quản lý Sale",
      icon: <ShoppingCart className="w-5 h-5" />,
      path: "#",
      subItems: [
        {
          id: "order-list",
          label: "Danh sách đơn",
          icon: <ClipboardList className="w-4 h-4" />,
          path: "/danh-sach-don",
          permission: 'SALE_ORDERS',
        },
        {
          id: "order-list-hcm",
          label: "Danh sách đơn HCM",
          icon: <ClipboardList className="w-4 h-4" />,
          path: "/danh-sach-don-hcm",
          permission: 'SALE_ORDERS_HCM',
        },
        {
          id: "new-order",
          label: "Nhập đơn mới",
          icon: <PlusCircle className="w-4 h-4" />,
          path: "/nhap-don",
          permission: 'SALE_NEW_ORDER', // Note: reused path but permission specific to module
        },
        {
          id: "new-order-hcm",
          label: "Nhập đơn HCM",
          icon: <PlusCircle className="w-4 h-4" />,
          path: "/nhap-don?view=hcm",
          permission: 'SALE_NEW_ORDER_HCM',
        },
        {
          id: "sale-report",
          label: "Sale nhập báo cáo",
          icon: <TrendingUp className="w-4 h-4" />,
          path: "/sale-nhap-bao-cao",
          permission: 'SALE_INPUT',
        },
        {
          id: "sale-report-hcm",
          label: "Sale nhập báo cáo HCM",
          icon: <TrendingUp className="w-4 h-4" />,
          path: "/sale-nhap-bao-cao-hcm",
          permission: 'SALE_INPUT_HCM',
        },
        {
          id: "view-sale-report",
          label: "Xem báo cáo Sale",
          icon: <BarChart3 className="w-4 h-4" />,
          path: "/xem-bao-cao-sale",
          permission: 'SALE_VIEW',
        },
        {
          id: "view-sale-report-hcm",
          label: "Xem báo cáo Sale HCM",
          icon: <BarChart3 className="w-4 h-4" />,
          path: "/xem-bao-cao-sale-hcm",
          permission: 'SALE_VIEW_HCM',
        },
        {
          id: "sale-manual-report",
          label: "Danh sách báo cáo tay",
          icon: <Database className="w-4 h-4" />,
          path: "/danh-sach-bao-cao-tay",
          permission: 'SALE_MANUAL',
        },
        {
          id: "sale-manual-report-hcm",
          label: "Danh sách báo cáo tay HCM",
          icon: <Database className="w-4 h-4" />,
          path: "/danh-sach-bao-cao-tay-hcm",
          permission: 'SALE_MANUAL_HCM',
        },
        {
          id: "sale-history",
          label: "Lịch sử thay đổi",
          icon: <ClipboardList className="w-4 h-4" />,
          path: "/lich-su-sale-order",
          permission: 'SALE_HISTORY',
        },
      ],
    },
    {
      id: "delivery",
      label: "Quản lý giao hàng",
      icon: <Package className="w-5 h-5" />,
      path: "#",
      subItems: [
        {
          id: "delivery-list",
          label: "Quản lý vận đơn",
          icon: <ClipboardList className="w-4 h-4" />,
          path: "/van-don",
          permission: 'ORDERS_LIST',
        },
        {
          id: "delivery-list-hcm",
          label: "Vận đơn HCM",
          icon: <Truck className="w-4 h-4" />,
          path: "/van-don-hcm",
          permission: 'ORDERS_LIST_HCM',
        },
        {
          id: "delivery-danh-sach",
          label: "Danh sách vận đơn",
          icon: <ListTodo className="w-4 h-4" />,
          path: "/danh-sach-van-don",
          permission: 'ORDERS_DANH_SACH_VAN_DON',
        },
        {
          id: "delivery-danh-sach-hcm",
          label: "Danh sách vận đơn HCM",
          icon: <ListTodo className="w-4 h-4" />,
          path: "/danh-sach-van-don-hcm",
          permission: 'ORDERS_DANH_SACH_VAN_DON_HCM',
        },
        {
          id: "delivery-report",
          label: "Báo cáo vận đơn",
          icon: <BarChart3 className="w-4 h-4" />,
          path: "/bao-cao-van-don",
          permission: 'ORDERS_REPORT',
        },
        {
          id: "delivery-report-legacy-tabs",
          label: "Báo cáo vận đơn nhân viên",
          icon: <Table2 className="w-4 h-4" />,
          path: "/baocao-vandon-nv/index.html",
          isExternal: true,
          permission: 'ORDERS_REPORT',
        },
        {
          id: "delivery-report-legacy-tabs-hcm",
          label: "Báo cáo vận đơn nhân viên HCM",
          icon: <Table2 className="w-4 h-4" />,
          path: "/baocao-vandon-nv/index.html?region=hcm",
          isExternal: true,
          permissionAny: ['ORDERS_REPORT', 'ORDERS_LIST_HCM'],
        },
        {
          id: "delivery-bc-van-hanh",
          label: "Báo cáo vận hành",
          icon: <Activity className="w-4 h-4" />,
          path: "/bao-cao-van-hanh",
          permission: 'ORDERS_REPORT_OPERATION',
        },
        {
          id: "delivery-bc-van-hanh-hcm",
          label: "Báo cáo vận hành HCM",
          icon: <VanHanhHcmIcon className="w-4 h-4" />,
          path: "/bao-cao-van-hanh-hcm",
          permissionAny: ['ORDERS_REPORT_OPERATION_HCM', 'ORDERS_LIST_HCM'],
        },
        {
          id: "delivery-daily-report",
          label: "Dữ liệu báo cáo hàng ngày",
          icon: <Database className="w-4 h-4" />,
          path: "/danh-sach-bao-cao-van-don",
          permission: 'ORDERS_REPORT_DAILY_DATA',
        },
        {
          id: "ffm-push-reconcile",
          label: "Bảng đối soát đẩy FFM",
          icon: <Table2 className="w-4 h-4" />,
          path: "/bang-doi-soat-day-ffm",
          permission: 'ORDERS_FFM_RECONCILE',
        },
        {
          id: "ffm-push-reconcile-hcm",
          label: "Bảng đối soát đẩy FFM (HCM)",
          icon: <FfmReconcileHcmIcon className="w-4 h-4" />,
          path: "/bang-doi-soat-day-ffm-hcm",
          permissionAny: ['ORDERS_FFM_RECONCILE_HCM', 'ORDERS_FFM_RECONCILE', 'ORDERS_LIST_HCM'],
        },
        {
          id: "ffm-mgt",
          label: "ffm_MGT",
          icon: <ClipboardList className="w-4 h-4" />,
          path: "/ffm_MGT",
          permission: 'ORDERS_FFM_MGT',
        },
        {
          id: "ffm-mgt-hcm",
          label: "ffm_MGT-hcm",
          icon: <FfmMgtHcmIcon className="w-4 h-4" />,
          path: "/ffm_MGT-hcm",
          permission: 'ORDERS_FFM_MGT_HCM',
        },
        {
          id: "ffm-tt",
          label: "FFM_TT",
          icon: <Truck className="w-4 h-4" />,
          path: "/ffm_TT",
          permission: 'ORDERS_FFM_TT',
        },
        {
          id: "dien-bill",
          label: "Điền bill",
          icon: <FileText className="w-4 h-4" />,
          path: "/dien-bill",
          permission: 'ORDERS_DIEN_BILL',
        },
      ],
    },
    {
      id: "marketing",
      label: "Quản lý Marketing",
      icon: <Megaphone className="w-5 h-5" />,
      path: "#",
      subItems: [
        {
          id: "mkt-input",
          label: "Nhập báo cáo",
          icon: <TrendingUp className="w-4 h-4" />,
          path: "/bao-cao-marketing",
          permission: 'MKT_INPUT',
        },
        {
          id: "mkt-input-hcm",
          label: "Nhập báo cáo HCM",
          icon: <TrendingUp className="w-4 h-4" />,
          path: "/bao-cao-marketing-hcm",
          permission: 'MKT_INPUT_HCM',
        },
        {
          id: "mkt-view",
          label: "Xem báo cáo MKT",
          icon: <BarChart3 className="w-4 h-4" />,
          path: "/xem-bao-cao-mkt",
          permission: 'MKT_VIEW',
        },
        {
          id: "mkt-view-hcm",
          label: "Xem báo cáo MKT HCM",
          icon: <BarChart3 className="w-4 h-4" />,
          path: "/xem-bao-cao-mkt-hcm",
          permission: 'MKT_VIEW_HCM',
        },
        {
          id: "mkt-view-rd",
          label: "Xem báo cáo MKT R&D",
          icon: <BarChart3 className="w-4 h-4" />,
          path: "/xem-bao-cao-mkt-rd",
          permission: 'MKT_VIEW',
        },
        {
          id: "mkt-detail",
          label: "Báo cáo chi tiết đơn",
          icon: <ClipboardList className="w-4 h-4" />,
          path: "/bao-cao-chi-tiet",
          permission: 'MKT_ORDERS',
        },
        {
          id: "mkt-detail-hcm",
          label: "Báo cáo chi tiết đơn HCM",
          icon: <ClipboardList className="w-4 h-4" />,
          path: "/bao-cao-chi-tiet-hcm",
          permission: 'MKT_ORDERS_HCM',
        },
        {
          id: "mkt-pages",
          label: "Danh sách Page",
          icon: <ListTodo className="w-4 h-4" />,
          path: "/danh-sach-page",
          permission: 'MKT_PAGES',
        },
        {
          id: "mkt-manual",
          label: "Ds báo cáo tay",
          icon: <Database className="w-4 h-4" />,
          path: "/danh-sach-bao-cao-tay-mkt",
          permission: 'MKT_MANUAL',
        },
        {
          id: "mkt-manual-hcm",
          label: "Ds báo cáo tay HCM",
          icon: <Database className="w-4 h-4" />,
          path: "/danh-sach-bao-cao-tay-mkt-hcm",
          permission: 'MKT_MANUAL_HCM',
        },
      ],
    },
    {
      id: "rnd",
      label: "Quản lý R&D",
      icon: <Activity className="w-5 h-5" />,
      path: "#",
      subItems: [
        {
          id: "rnd-input",
          label: "Nhập báo cáo",
          icon: <TrendingUp className="w-4 h-4" />,
          path: "/bao-cao-rd",
          permission: 'RND_INPUT',
        },
        {
          id: "rnd-view",
          label: "Xem báo cáo R&D",
          icon: <BarChart3 className="w-4 h-4" />,
          path: "/xem-bao-cao-rd",
          permission: 'RND_VIEW',
        },
        {
          id: "rnd-view-mkt",
          label: "Xem báo cáo MKT R&D",
          icon: <BarChart3 className="w-4 h-4" />,
          path: "/xem-bao-cao-mkt-rd",
          permission: 'RND_VIEW',
        },
        {
          id: "rnd-orders",
          label: "Danh sách đơn",
          icon: <ClipboardList className="w-4 h-4" />,
          path: "/bao-cao-chi-tiet-rd",
          permission: 'RND_ORDERS',
        },
        {
          id: "rnd-pages",
          label: "Danh sách Page",
          icon: <ListTodo className="w-4 h-4" />,
          path: "/danh-sach-page-rd",
          permission: 'RND_PAGES',
        },
        {
          id: "rnd-manual",
          label: "Ds báo cáo tay",
          icon: <Database className="w-4 h-4" />,
          path: "/danh-sach-bao-cao-tay-rd",
          permission: 'RND_MANUAL',
        },
        {
          id: "rnd-new-order",
          label: "Nhập đơn mới",
          icon: <TrendingUp className="w-4 h-4" />,
          path: "/nhap-don",
          permission: 'RND_NEW_ORDER',
        },
        {
          id: "rnd-new-order-hcm",
          label: "Nhập đơn HCM",
          icon: <TrendingUp className="w-4 h-4" />,
          path: "/nhap-don?view=hcm",
          permission: 'RND_NEW_ORDER_HCM',
        },
        {
          id: "rnd-history",
          label: "Lịch sử thay đổi",
          icon: <ClipboardList className="w-4 h-4" />,
          path: "/lich-su-sale-order",
          permission: 'RND_HISTORY',
        },
      ],
    },
    {
      id: "hr",
      label: "Quản lý nhân sự",
      icon: <Users className="w-5 h-5" />,
      path: "#",
      subItems: [
        {
          id: "hr-checkin",
          label: "Điểm danh (Chấm công)",
          icon: <Camera className="w-4 h-4" />,
          path: "/cham-cong",
        },
        {
          id: "hr-attendance-admin",
          label: "Quản lý chấm công",
          icon: <ListTodo className="w-4 h-4" />,
          path: "/quan-ly-cham-cong",
          permissionAny: ['HR_ACCESS', 'HR_DASHBOARD', 'HR_LIST'],
        },
        {
          id: "hr-management",
          label: "Bảng tin nội bộ",
          icon: <Users className="w-4 h-4" />,
          path: "/nhan-su",
          permissionAny: ['HR_DASHBOARD', 'HR_ACCESS', 'HR_LIST'],
          // adminOnly: true, // Allow HR team
        },
        {
          id: "hr-records",
          label: "Hồ sơ nhân sự",
          icon: <ClipboardList className="w-4 h-4" />,
          path: "https://hrlumi.vercel.app/employees",
          isExternal: true,
          permissionAny: ['HR_DASHBOARD', 'HR_ACCESS', 'HR_LIST'],
          // adminOnly: true,
        },
        {
          id: "hr-recruitment",
          label: "Tuyển dụng",
          icon: <UserPlus className="w-4 h-4" />,
          path: "https://hrlumi.vercel.app/recruitment",
          isExternal: true,
          permissionAny: ['HR_DASHBOARD', 'HR_ACCESS', 'HR_LIST'],
          // adminOnly: true,
        },
        {
          id: "hr-salary",
          label: "Bậc lương & thăng tiến",
          icon: <DollarSign className="w-4 h-4" />,
          path: "https://hrlumi.vercel.app/salary",
          isExternal: true,
          permissionAny: ['HR_DASHBOARD', 'HR_ACCESS', 'HR_LIST'],
          // adminOnly: true,
        },
        {
          id: "hr-competency",
          label: "Năng lực nhân sự",
          icon: <Award className="w-4 h-4" />,
          path: "https://hrlumi.vercel.app/competency",
          isExternal: true,
          permissionAny: ['HR_DASHBOARD', 'HR_ACCESS', 'HR_LIST'],
          // adminOnly: true,
        },
        {
          id: "hr-kpi",
          label: "KPI",
          icon: <Target className="w-4 h-4" />,
          path: "https://hrlumi.vercel.app/kpi",
          isExternal: true,
          permissionAny: ['HR_DASHBOARD', 'HR_ACCESS', 'HR_LIST'],
          // adminOnly: true,
        },
        {
          id: "hr-tasks",
          label: "Giao việc",
          icon: <ListTodo className="w-4 h-4" />,
          path: "https://hrlumi.vercel.app/tasks",
          isExternal: true,
          permissionAny: ['HR_DASHBOARD', 'HR_ACCESS', 'HR_LIST'],
          // adminOnly: true,
        },
        {
          id: "hr-attendance",
          label: "Chấm công & lương",
          icon: <CalendarCheck className="w-4 h-4" />,
          path: "https://hrlumi.vercel.app/attendance",
          isExternal: true,
          permissionAny: ['HR_DASHBOARD', 'HR_ACCESS', 'HR_LIST'],
          // adminOnly: true,
        },
        // Removed Honor (Tôn vinh) item
      ],
    },
    {
      id: "finance",
      label: "Quản lý tài chính",
      icon: <DollarSign className="w-5 h-5" />,
      path: "#",
      subItems: [
        {
          id: "finance-master",
          label: "Tài chính nền tảng",
          icon: <DollarSign className="w-4 h-4" />,
          path: "https://lumi-finance-manager.vercel.app/#/master-data",
          isExternal: true,
          permissionAny: ['FINANCE_DASHBOARD', 'FINANCE_MASTER'],
        },
        {
          id: "finance-revenue",
          label: "Quản lý thu",
          icon: <TrendingUp className="w-4 h-4" />,
          path: "https://lumi-finance-manager.vercel.app/#/revenue",
          isExternal: true,
          permissionAny: ['FINANCE_DASHBOARD', 'FINANCE_REVENUE'],
        },
        {
          id: "finance-cost",
          label: "Quản lý chi",
          icon: <DollarSign className="w-4 h-4" />,
          path: "https://lumi-finance-manager.vercel.app/#/cost",
          isExternal: true,
          permissionAny: ['FINANCE_DASHBOARD', 'FINANCE_COST'],
        },
        {
          id: "finance-ledger",
          label: "Sổ quỹ & Dòng tiền",
          icon: <DollarSign className="w-4 h-4" />,
          path: "https://lumi-finance-manager.vercel.app/#/ledger",
          isExternal: true,
          permissionAny: ['FINANCE_DASHBOARD', 'FINANCE_LEDGER'],
        },
        {
          id: "finance-reports",
          label: "Báo cáo quản trị",
          icon: <BarChart3 className="w-4 h-4" />,
          path: "https://lumi-finance-manager.vercel.app/#/management-reports",
          isExternal: true,
          permissionAny: ['FINANCE_DASHBOARD', 'FINANCE_REPORTS'],
        },
        {
          id: "finance-f3",
          label: "Dữ liệu F3",
          icon: <Menu className="w-4 h-4" />,
          path: "/du-lieu-f3",
          permissionAny: ['FINANCE_DASHBOARD', 'FINANCE_F3'],
        },
        {
          id: "finance-f3-hcm",
          label: "Dữ liệu F3 (HCM)",
          icon: <Menu className="w-4 h-4" />,
          path: "/du-lieu-f3-hcm",
          permissionAny: ['FINANCE_DASHBOARD', 'FINANCE_F3'],
        },
        {
          id: "finance-doi-soat",
          label: "Đối soát bill cước",
          icon: <DollarSign className="w-4 h-4" />,
          path: "/doi-soat-bill-cuoc",
          permissionAny: ['FINANCE_DASHBOARD', 'FINANCE_ACCESS', 'FINANCE_DOI_SOAT_BILL'],
        },
        {
          id: "finance-doi-soat-hcm",
          label: "Đối soát bill cước (HCM)",
          icon: <DollarSign className="w-4 h-4" />,
          path: "/doi-soat-bill-cuoc-hcm",
          permissionAny: ['FINANCE_DASHBOARD', 'FINANCE_ACCESS', 'FINANCE_DOI_SOAT_BILL'],
        },
      ],
    },

    {
      id: "settings",
      label: "Cài đặt hệ thống",
      icon: <Settings className="w-5 h-5" />,
      path: "#",
      adminOnly: true,
      subItems: [
        {
          id: "admin-tools",
          label: "Công cụ quản trị & Chốt ca",
          icon: <Settings className="w-4 h-4" />,
          path: "/admin-tools",
        },
        {
          id: "mkt-alerts-admin",
          label: "Quản lý cảnh báo MKT",
          icon: <AlertTriangle className="w-4 h-4" />,
          path: "/admin/mkt-alerts",
        },
        {
          id: "change-logs",
          label: "Lịch sử thay đổi",
          icon: <ClipboardList className="w-4 h-4" />,
          path: "/lich-su-thay-doi",
        },
      ]
    },
  ];

  const allContentSections = [
    {
      title: "DASHBOARD ĐIỀU HÀNH",
      items: [
        {
          title: "Dashboard Tăng trưởng",
          icon: <TrendingUp className="w-8 h-8" />,
          color: "bg-orange-500",
          path: "https://redirect.zalo.me/v3/verifyv2/pc?token=P6BqnjfrMGXk3lx3rnrRPsWD_gdV7LDYO0Ft-uiMM6Gt1FsbWXaDF3KEhlRQ45yqPWpm-pTZP0&continue=https%3A%2F%2Fdashboard-lumiquantri.vercel.app%2F",
          status: "Mở ứng dụng",
          isExternal: true,
          adminOnly: true,
          allowDirectorDept: true,
        },
        {
          title: "Dashboard KPI",
          icon: <Target className="w-8 h-8" />,
          color: "bg-blue-600",
          path: "https://redirect.zalo.me/v3/verifyv2/pc?token=P6BqnjfrMGXk3lx3rnrRPsWD_gdV7LDYO0Ft-uiMM6Gt1FsbWXaDF3KEhlRQ45yqPWpm-pTZP0&continue=https%3A%2F%2Fdashboard-lumiquantri.vercel.app%2F",
          status: "Mở ứng dụng",
          isExternal: true,
          adminOnly: true,
          allowDirectorDept: true,
        },
        {
          title: "Dashboard OKR",
          icon: <Award className="w-8 h-8" />,
          color: "bg-indigo-600",
          path: "https://redirect.zalo.me/v3/verifyv2/pc?token=P6BqnjfrMGXk3lx3rnrRPsWD_gdV7LDYO0Ft-uiMM6Gt1FsbWXaDF3KEhlRQ45yqPWpm-pTZP0&continue=https%3A%2F%2Fdashboard-lumiquantri.vercel.app%2F",
          status: "Mở ứng dụng",
          isExternal: true,
          adminOnly: true,
          allowDirectorDept: true,
        },
        {
          title: "Dashboard Đơn hủy",
          icon: <XCircle className="w-8 h-8" />,
          color: "bg-red-600",
          path: "#",
          status: "Sắp ra mắt",
          adminOnly: true,
          allowDirectorDept: true,
        },
        {
          title: "Dashboard Vận hành",
          icon: <Activity className="w-8 h-8" />,
          color: "bg-teal-600",
          path: "https://dashboard-psi-six-69.vercel.app/",
          status: "Mở ứng dụng",
          isExternal: true,
          adminOnly: true,
          allowDirectorDept: true,
        },
        {
          title: "Dashboard quản trị",
          icon: <LayoutGrid className="w-8 h-8" />,
          color: "bg-violet-600",
          path: "/dashboard-quan-tri",
          status: "Mở ứng dụng",
          adminOnly: true,
          allowDirectorDept: true,
        },
      ],
    },
    {
      title: "CSKH & CRM",
      items: [
        {
          title: "Danh sách đơn",
          icon: <Users className="w-8 h-8" />,
          color: "bg-blue-500",
          path: "/quan-ly-cskh",
          status: "Mở ứng dụng",
          permission: 'CSKH_LIST',
        },
        {
          title: "Danh sách đơn CSKH HCM",
          icon: <MapPin className="w-8 h-8" />,
          color: "bg-teal-700",
          path: "/quan-ly-cskh-hcm",
          status: "order_code_hcm",
          permission: 'CSKH_LIST_HCM',
        },
        {
          title: "Đơn đã thu tiền/cần CS",
          icon: <FileText className="w-8 h-8" />,
          color: "bg-cyan-500",
          path: "/don-chia-cskh",
          status: "Mở ứng dụng",
          permission: 'CSKH_PAID',
        },
        {
          title: "Đơn đã thu tiền/cần CS (HCM)",
          icon: <MapPin className="w-8 h-8" />,
          color: "bg-teal-600",
          path: "/don-chia-cskh-hcm",
          status: "order_code_hcm",
          permission: 'CSKH_PAID_HCM',
        },
        {
          title: "Nhập đơn mới",
          icon: <PlusCircle className="w-8 h-8" />,
          color: "bg-green-500",
          path: "/nhap-don",
          status: "Mở ứng dụng",
          permission: 'CSKH_NEW_ORDER',
        },
        {
          title: "Nhập đơn HCM",
          icon: <PlusCircle className="w-8 h-8" />,
          color: "bg-green-600",
          path: "/nhap-don?view=hcm",
          status: "Mở ứng dụng",
          permission: 'CSKH_NEW_ORDER_HCM',
        },
        {
          title: "Nhập báo cáo",
          icon: <Edit3 className="w-8 h-8" />,
          color: "bg-blue-500",
          path: "/nhap-bao-cao-cskh",
          status: "Mở ứng dụng",
          permission: 'CSKH_INPUT',
        },
        {
          title: "Nhập báo cáo CSKH HCM",
          icon: <Edit3 className="w-8 h-8" />,
          color: "bg-teal-600",
          path: "/nhap-bao-cao-cskh-hcm",
          status: "Ghi sale_report_hcm",
          permission: 'CSKH_INPUT_HCM',
        },
        {
          title: "Ds báo cáo tay",
          icon: <Database className="w-8 h-8" />,
          color: "bg-cyan-600",
          path: "/danh-sach-bao-cao-tay-cskh",
          status: "Mở ứng dụng",
          permissionAny: ['CSKH_VIEW', 'CSKH_MANUAL'],
        },
        {
          title: "Ds báo cáo tay CSKH HCM",
          icon: <Database className="w-8 h-8" />,
          color: "bg-teal-600",
          path: "/danh-sach-bao-cao-tay-cskh-hcm",
          status: "HCM-Sale Đêm, CSKH-HCM, HCM",
          permission: 'CSKH_MANUAL_HCM',
        },
        {
          title: "Xem báo cáo CSKH",
          icon: <BarChart3 className="w-8 h-8" />,
          color: "bg-orange-600",
          path: "/xem-bao-cao-cskh",
          status: "Mở ứng dụng",
          permission: 'CSKH_VIEW',
        },
        {
          title: "Xem báo cáo CSKH HCM",
          icon: <BarChart3 className="w-8 h-8" />,
          color: "bg-orange-700",
          path: "/xem-bao-cao-cskh-hcm",
          status: "HCM-Sale Đêm, CSKH-HCM, HCM",
          permission: 'CSKH_VIEW_HCM',
        },
        {
          title: "Lịch sử thay đổi",
          icon: <ClipboardList className="w-8 h-8" />,
          color: "bg-gray-600",
          path: "/lich-su-cskh",
          status: "Mở ứng dụng",
          permission: 'CSKH_HISTORY',
        },
      ],
    },
    {
      title: "QUẢN LÝ SALE & ORDER",
      items: [
        {
          title: "Danh sách đơn",
          icon: <ClipboardList className="w-8 h-8" />,
          color: "bg-purple-500",
          path: "/danh-sach-don",
          status: "Mở ứng dụng",
          permission: 'SALE_ORDERS',
        },
        {
          title: "Danh sách đơn HCM",
          icon: <ClipboardList className="w-8 h-8" />,
          color: "bg-purple-600",
          path: "/danh-sach-don-hcm",
          status: "Mở ứng dụng",
          permission: 'SALE_ORDERS_HCM',
        },
        {
          title: "Nhập đơn mới",
          icon: <PlusCircle className="w-8 h-8" />,
          color: "bg-purple-500", // Matched existing file
          path: "/nhap-don",
          status: "Mở ứng dụng",
          permission: 'SALE_NEW_ORDER',
        },
        {
          title: "Nhập đơn HCM",
          icon: <PlusCircle className="w-8 h-8" />,
          color: "bg-purple-600",
          path: "/nhap-don?view=hcm",
          status: "Mở ứng dụng",
          permission: 'SALE_NEW_ORDER_HCM',
        },
        {
          title: "Sale nhập báo cáo",
          icon: <TrendingUp className="w-8 h-8" />,
          color: "bg-blue-600",
          path: "/sale-nhap-bao-cao",
          status: "Mở ứng dụng",
          permission: 'SALE_INPUT',
        },
        {
          title: "Sale nhập báo cáo HCM",
          icon: <TrendingUp className="w-8 h-8" />,
          color: "bg-teal-600",
          path: "/sale-nhap-bao-cao-hcm",
          status: "Mở ứng dụng",
          permission: 'SALE_INPUT_HCM',
        },
        {
          title: "Xem báo cáo Sale",
          icon: <BarChart3 className="w-8 h-8" />,
          color: "bg-orange-600",
          path: "/xem-bao-cao-sale",
          status: "Mở ứng dụng",
          permission: 'SALE_VIEW',
        },
        {
          title: "Xem báo cáo Sale HCM",
          icon: <BarChart3 className="w-8 h-8" />,
          color: "bg-amber-700",
          path: "/xem-bao-cao-sale-hcm",
          status: "sale_report_hcm",
          permission: 'SALE_VIEW_HCM',
        },
        {
          title: "Ds báo cáo tay",
          icon: <Database className="w-8 h-8" />,
          color: "bg-cyan-600",
          path: "/danh-sach-bao-cao-tay",
          status: "Mở ứng dụng",
          permission: 'SALE_MANUAL',
        },
        {
          title: "Ds báo cáo tay HCM",
          icon: <Database className="w-8 h-8" />,
          color: "bg-teal-700",
          path: "/danh-sach-bao-cao-tay-hcm",
          status: "sale_report_hcm",
          permission: 'SALE_MANUAL_HCM',
        },
        {
          title: "Lịch sử thay đổi",
          icon: <ClipboardList className="w-8 h-8" />,
          color: "bg-gray-600",
          path: "/lich-su-sale-order",
          status: "Mở ứng dụng",
          permission: 'SALE_HISTORY',
        },
      ],
    },
    {
      title: "QUẢN LÝ GIAO HÀNG",
      items: [
        {
          title: "Quản lý vận đơn",
          icon: <Package className="w-8 h-8" />,
          color: "bg-[#F37021]",
          path: "/van-don",
          status: "Mở ứng dụng",
          permission: 'ORDERS_LIST',
        },
        {
          title: "Vận đơn HCM",
          icon: <Truck className="w-8 h-8" />,
          color: "bg-[#0f766e]",
          path: "/van-don-hcm",
          status: "Mở ứng dụng",
          permission: 'ORDERS_LIST_HCM',
        },
        {
          title: "Danh sách vận đơn",
          icon: <ListTodo className="w-8 h-8" />,
          color: "bg-blue-500",
          path: "/danh-sach-van-don",
          status: "Mở ứng dụng",
          permission: 'ORDERS_DANH_SACH_VAN_DON',
        },
        {
          title: "Danh sách vận đơn HCM",
          icon: <ListTodo className="w-8 h-8" />,
          color: "bg-cyan-600",
          path: "/danh-sach-van-don-hcm",
          status: "Chi nhánh HCM",
          permission: 'ORDERS_DANH_SACH_VAN_DON_HCM',
        },
        {
          title: "Báo cáo vận đơn",
          icon: <BarChart3 className="w-8 h-8" />,
          color: "bg-teal-500",
          path: "/bao-cao-van-don",
          status: "Mở ứng dụng",
          permission: 'ORDERS_REPORT',
        },
        {
          title: "Báo cáo vận đơn (tab cũ)",
          icon: <Table2 className="w-8 h-8" />,
          color: "bg-cyan-700",
          path: "/baocao-vandon-nv/index.html",
          status: "Hà Nội (mặc định)",
          isExternal: true,
          permission: 'ORDERS_REPORT',
        },
        {
          title: "Báo cáo vận đơn nhân viên HCM",
          icon: <Table2 className="w-8 h-8" />,
          color: "bg-teal-700",
          path: "/baocao-vandon-nv/index.html?region=hcm",
          status: "Chi nhánh HCM",
          isExternal: true,
          permissionAny: ['ORDERS_REPORT', 'ORDERS_LIST_HCM'],
        },
        {
          title: "Báo cáo vận hành",
          icon: <Activity className="w-8 h-8" />,
          color: "bg-amber-500",
          path: "/bao-cao-van-hanh",
          status: "Mở ứng dụng",
          permission: 'ORDERS_REPORT_OPERATION',
        },
        {
          title: "Báo cáo vận hành HCM",
          icon: <VanHanhHcmIcon className="w-8 h-8" />,
          color: "bg-emerald-700",
          path: "/bao-cao-van-hanh-hcm",
          status: "Chi nhánh HCM",
          permissionAny: ['ORDERS_REPORT_OPERATION_HCM', 'ORDERS_LIST_HCM'],
        },
        {
          title: "Dữ liệu báo cáo hàng ngày",
          icon: <Database className="w-8 h-8" />,
          color: "bg-purple-500",
          path: "/danh-sach-bao-cao-van-don",
          status: "Mở ứng dụng",
          permission: 'ORDERS_REPORT_DAILY_DATA',
        },
        {
          title: "ffm_MGT",
          icon: <ClipboardList className="w-8 h-8" />,
          color: "bg-indigo-500",
          path: "/ffm_MGT",
          status: "Mở ứng dụng",
          permission: 'ORDERS_FFM_MGT',
        },
        {
          title: "ffm_MGT-hcm",
          icon: <FfmMgtHcmIcon className="w-8 h-8" />,
          color: "bg-indigo-600",
          path: "/ffm_MGT-hcm",
          status: "Mở ứng dụng",
          permission: 'ORDERS_FFM_MGT_HCM',
        },
        {
          title: "FFM_TT",
          icon: <Truck className="w-8 h-8" />,
          color: "bg-violet-500",
          path: "/ffm_TT",
          status: "Mở ứng dụng",
          permission: 'ORDERS_FFM_TT',
        },
        {
          title: "Điền bill",
          icon: <FileText className="w-8 h-8" />,
          color: "bg-emerald-500",
          path: "/dien-bill",
          status: "Mở ứng dụng",
          permission: 'ORDERS_DIEN_BILL',
        },
        {
          title: "Bảng đối soát đẩy FFM",
          icon: <Table2 className="w-8 h-8" />,
          color: "bg-slate-600",
          path: "/bang-doi-soat-day-ffm",
          status: "Mở ứng dụng",
          permission: 'ORDERS_FFM_RECONCILE',
        },
        {
          title: "Bảng đối soát đẩy FFM (HCM)",
          icon: <FfmReconcileHcmIcon className="w-8 h-8" />,
          color: "bg-slate-700",
          path: "/bang-doi-soat-day-ffm-hcm",
          status: "Mở ứng dụng",
          permissionAny: ['ORDERS_FFM_RECONCILE_HCM', 'ORDERS_FFM_RECONCILE', 'ORDERS_LIST_HCM'],
        },
      ],
    },
    {
      title: "QUẢN LÝ MARKETING",
      items: [
        {
          title: "Nhập báo cáo",
          icon: <TrendingUp className="w-8 h-8" />,
          color: "bg-green-500",
          path: "/bao-cao-marketing",
          status: "Mở ứng dụng",
          permission: 'MKT_INPUT',
        },
        {
          title: "Nhập báo cáo HCM",
          icon: <TrendingUp className="w-8 h-8" />,
          color: "bg-emerald-600",
          path: "/bao-cao-marketing-hcm",
          status: "Mở ứng dụng",
          permission: 'MKT_INPUT_HCM',
        },
        {
          title: "Xem báo cáo MKT",
          icon: <BarChart3 className="w-8 h-8" />,
          color: "bg-orange-500",
          path: "/xem-bao-cao-mkt",
          status: "Mở ứng dụng",
          permission: 'MKT_VIEW',
        },
        {
          title: "Xem báo cáo MKT HCM",
          icon: <BarChart3 className="w-8 h-8" />,
          color: "bg-amber-600",
          path: "/xem-bao-cao-mkt-hcm",
          status: "Team MKT - Đức Anh",
          permission: 'MKT_VIEW_HCM',
        },
        {
          title: "Báo cáo chi tiết đơn",
          icon: <ClipboardList className="w-8 h-8" />,
          color: "bg-blue-500",
          path: "/bao-cao-chi-tiet",
          status: "bảng orders",
          permission: 'MKT_ORDERS',
        },
        {
          title: "Báo cáo chi tiết đơn HCM",
          icon: <ClipboardList className="w-8 h-8" />,
          color: "bg-sky-600",
          path: "/bao-cao-chi-tiet-hcm",
          status: "bảng order_code_hcm",
          permission: 'MKT_ORDERS_HCM',
        },
        {
          title: "Danh sách Page",
          icon: <ListTodo className="w-8 h-8" />,
          color: "bg-purple-600",
          path: "/danh-sach-page",
          status: "Mở ứng dụng",
          permission: 'MKT_PAGES',
        },
        {
          title: "Ds báo cáo tay",
          icon: <Database className="w-8 h-8" />,
          color: "bg-teal-600",
          path: "/danh-sach-bao-cao-tay-mkt",
          status: "Mở ứng dụng",
          permission: 'MKT_MANUAL',
        },
        {
          title: "Ds báo cáo tay HCM",
          icon: <Database className="w-8 h-8" />,
          color: "bg-cyan-700",
          path: "/danh-sach-bao-cao-tay-mkt-hcm",
          status: "marketing_report_hcm",
          permission: 'MKT_MANUAL_HCM',
        },
        {
          title: "Xem báo cáo MKT R&D",
          icon: <BarChart3 className="w-8 h-8" />,
          color: "bg-indigo-600",
          path: "/xem-bao-cao-mkt-rd",
          status: "Mở ứng dụng",
          permission: 'MKT_VIEW',
        },
      ],
    },
    {
      title: "QUẢN LÝ R&D",
      items: [
        // --- R&D SPECIFIC ---
        {
          title: "Nhập báo cáo",
          icon: <TrendingUp className="w-7 h-7" />,
          color: "bg-gradient-to-br from-pink-500 to-rose-600",
          path: "/bao-cao-rd",
          status: "Mở ứng dụng",
          permission: 'RND_INPUT',
        },
        {
          title: "Xem báo cáo R&D",
          icon: <BarChart3 className="w-7 h-7" />,
          color: "bg-gradient-to-br from-pink-500 to-rose-600",
          path: "/xem-bao-cao-rd",
          status: "Mở ứng dụng",
          permission: 'RND_VIEW',
        },
        {
          title: "Xem báo cáo MKT R&D",
          icon: <BarChart3 className="w-7 h-7" />,
          color: "bg-gradient-to-br from-pink-500 to-rose-600",
          path: "/xem-bao-cao-mkt-rd",
          status: "Mở ứng dụng",
          permission: 'RND_VIEW',
        },
        {
          title: "Danh sách đơn",
          icon: <ClipboardList className="w-7 h-7" />,
          color: "bg-gradient-to-br from-purple-500 to-pink-600",
          path: "/bao-cao-chi-tiet-rd",
          status: "Mở ứng dụng",
          permission: 'RND_ORDERS',
        },
        {
          title: "Danh sách Page",
          icon: <ListTodo className="w-7 h-7" />,
          color: "bg-gradient-to-br from-orange-400 to-pink-500",
          path: "/danh-sach-page-rd",
          status: "Mở ứng dụng",
          permission: 'RND_PAGES',
        },
        {
          title: "Ds báo cáo tay",
          icon: <Database className="w-7 h-7" />,
          color: "bg-gradient-to-br from-teal-500 to-cyan-600",
          path: "/danh-sach-bao-cao-tay-rd",
          status: "Mở ứng dụng",
          permission: 'RND_MANUAL',
        },
        {
          title: "Nhập đơn mới",
          icon: <TrendingUp className="w-7 h-7" />,
          color: "bg-gradient-to-br from-green-500 to-emerald-600",
          path: "/nhap-don",
          status: "Mở ứng dụng",
          permission: 'RND_NEW_ORDER',
        },
        {
          title: "Nhập đơn HCM",
          icon: <TrendingUp className="w-7 h-7" />,
          color: "bg-gradient-to-br from-green-600 to-emerald-700",
          path: "/nhap-don?view=hcm",
          status: "Mở ứng dụng",
          permission: 'RND_NEW_ORDER_HCM',
        },
        {
          title: "Lịch sử thay đổi",
          icon: <ClipboardList className="w-7 h-7" />,
          color: "bg-gray-600",
          path: "/lich-su-sale-order",
          status: "Mở ứng dụng",
          permission: 'RND_HISTORY',
        },

        // --- SALE DUPLICATES FOR R&D ---
        {
          title: "Sale: Danh sách đơn",
          icon: <ClipboardList className="w-8 h-8" />,
          color: "bg-purple-500",
          path: "/danh-sach-don?team=RD",
          status: "Mở ứng dụng",
          permission: 'RND_ORDERS',
        },
        {
          title: "Sale: Nhập đơn mới",
          icon: <PlusCircle className="w-8 h-8" />,
          color: "bg-purple-500",
          path: "/nhap-don?team=RD",
          status: "Mở ứng dụng",
          permission: 'RND_NEW_ORDER',
        },
        {
          title: "Sale: Nhập báo cáo",
          icon: <TrendingUp className="w-8 h-8" />,
          color: "bg-blue-600",
          path: "/sale-nhap-bao-cao?team=RD",
          status: "Mở ứng dụng",
          permission: 'RND_INPUT',
        },
        {
          title: "Sale: Xem báo cáo",
          icon: <BarChart3 className="w-8 h-8" />,
          color: "bg-orange-600",
          path: "/xem-bao-cao-sale?team=RD",
          status: "Mở ứng dụng",
          permission: 'RND_VIEW',
        },
        {
          title: "Sale: Ds báo cáo tay",
          icon: <Database className="w-8 h-8" />,
          color: "bg-cyan-600",
          path: "/danh-sach-bao-cao-tay?team=RD",
          status: "Mở ứng dụng",
          permission: 'RND_MANUAL',
        },

        // --- MARKETING DUPLICATES FOR R&D ---
        {
          title: "MKT: Nhập báo cáo",
          icon: <TrendingUp className="w-8 h-8" />,
          color: "bg-green-500",
          path: "/bao-cao-marketing?team=RD",
          status: "Mở ứng dụng",
          permission: 'RND_INPUT',
          allowedTeamKeys: ['rnd'],
        },
        {
          title: "MKT: Xem báo cáo",
          icon: <BarChart3 className="w-8 h-8" />,
          color: "bg-orange-500",
          path: "/xem-bao-cao-mkt?team=RD",
          status: "Mở ứng dụng",
          permission: 'RND_VIEW',
          allowedTeamKeys: ['rnd'],
        },
        {
          title: "MKT: Danh sách đơn",
          icon: <ClipboardList className="w-8 h-8" />,
          color: "bg-blue-500",
          path: "/bao-cao-chi-tiet?team=RD",
          status: "Mở ứng dụng",
          permission: 'RND_ORDERS',
          allowedTeamKeys: ['rnd'],
        },
        {
          title: "MKT: Danh sách Page",
          icon: <ListTodo className="w-8 h-8" />,
          color: "bg-purple-600",
          path: "/danh-sach-page?team=RD",
          status: "Mở ứng dụng",
          permission: 'RND_PAGES',
          allowedTeamKeys: ['rnd'],
        },
        {
          title: "MKT: Ds báo cáo tay",
          icon: <Database className="w-8 h-8" />,
          color: "bg-teal-600",
          path: "/danh-sach-bao-cao-tay-mkt?team=RD",
          status: "Mở ứng dụng",
          permission: 'RND_MANUAL',
          allowedTeamKeys: ['rnd'],
        },
      ],
    },
    {
      title: "QUẢN LÝ NHÂN SỰ",
      items: [
        {
          title: "Điểm danh (Chấm công)",
          icon: <Camera className="w-8 h-8" />,
          color: "bg-green-500",
          path: "/cham-cong",
          status: "Mở ứng dụng",
        },
        {
          title: "Quản lý chấm công",
          icon: <ListTodo className="w-8 h-8" />,
          color: "bg-emerald-600",
          path: "/quan-ly-cham-cong",
          status: "Dành cho HR/Admin",
          permissionAny: ['HR_ACCESS', 'HR_DASHBOARD', 'HR_LIST'],
        },
        {
          title: "Bảng tin nội bộ",
          icon: <Users className="w-8 h-8" />,
          color: "bg-pink-500",
          path: "/nhan-su",
          status: "Mở ứng dụng",
          permissionAny: ['HR_ACCESS', 'HR_DASHBOARD', 'HR_LIST'],
        },
        {
          title: "Hồ sơ nhân sự",
          icon: <ClipboardList className="w-8 h-8" />,
          color: "bg-pink-600",
          path: "https://hrlumi.vercel.app/employees",
          status: "Mở ứng dụng",
          isExternal: true,
          permissionAny: ['HR_ACCESS', 'HR_DASHBOARD', 'HR_LIST'],
        },
        {
          title: "Tuyển dụng",
          icon: <UserPlus className="w-8 h-8" />,
          color: "bg-pink-600",
          path: "https://hrlumi.vercel.app/recruitment",
          status: "Mở ứng dụng",
          isExternal: true,
          permissionAny: ['HR_ACCESS', 'HR_DASHBOARD', 'HR_LIST'],
        },
        {
          title: "Bậc lương & thăng tiến",
          icon: <DollarSign className="w-8 h-8" />,
          color: "bg-pink-600",
          path: "https://hrlumi.vercel.app/salary",
          status: "Mở ứng dụng",
          isExternal: true,
          permissionAny: ['HR_ACCESS', 'HR_DASHBOARD', 'HR_LIST'],
        },
        {
          title: "Năng lực nhân sự",
          icon: <Award className="w-8 h-8" />,
          color: "bg-pink-600",
          path: "https://hrlumi.vercel.app/competency",
          status: "Mở ứng dụng",
          isExternal: true,
          permissionAny: ['HR_ACCESS', 'HR_DASHBOARD', 'HR_LIST'],
        },
        {
          title: "KPI",
          icon: <Target className="w-8 h-8" />,
          color: "bg-pink-600",
          path: "https://hrlumi.vercel.app/kpi",
          status: "Mở ứng dụng",
          isExternal: true,
          permissionAny: ['HR_ACCESS', 'HR_DASHBOARD', 'HR_LIST'],
        },
        {
          title: "Giao việc",
          icon: <ListTodo className="w-8 h-8" />,
          color: "bg-pink-600",
          path: "https://hrlumi.vercel.app/tasks",
          status: "Mở ứng dụng",
          isExternal: true,
          permissionAny: ['HR_ACCESS', 'HR_DASHBOARD', 'HR_LIST'],
        },
        {
          title: "Chấm công & lương",
          icon: <CalendarCheck className="w-8 h-8" />,
          color: "bg-pink-600",
          path: "https://hrlumi.vercel.app/attendance",
          status: "Mở ứng dụng",
          isExternal: true,
          permissionAny: ['HR_ACCESS', 'HR_DASHBOARD', 'HR_LIST'],
        },
        // Removed Honor card
      ],
    },
    {
      title: "QUẢN LÝ TÀI CHÍNH",
      items: [
        {
          title: "Quản lý tài chính",
          icon: <DollarSign className="w-8 h-8" />,
          color: "bg-purple-500",
          path: "#",
          status: "Sắp ra mắt",
          comingSoon: true,
          permission: 'FINANCE_ACCESS',
        },
        {
          title: "Quản lý tài chính nền tảng",
          icon: <DollarSign className="w-8 h-8" />,
          color: "bg-teal-600",
          path: "https://lumi-finance-manager.vercel.app/#/master-data",
          status: "Mở ứng dụng",
          isExternal: true,
          permissionAny: ['FINANCE_ACCESS', 'FINANCE_MASTER'],
        },
        {
          title: "Quản lý thu",
          icon: <TrendingUp className="w-8 h-8" />,
          color: "bg-green-600",
          path: "https://lumi-finance-manager.vercel.app/#/revenue",
          status: "Mở ứng dụng",
          isExternal: true,
          permissionAny: ['FINANCE_ACCESS', 'FINANCE_REVENUE'],
        },
        {
          title: "Quản lý chi",
          icon: <DollarSign className="w-8 h-8" />,
          color: "bg-red-600",
          path: "https://lumi-finance-manager.vercel.app/#/cash-balance",
          status: "Mở ứng dụng",
          isExternal: true,
          permissionAny: ['FINANCE_ACCESS', 'FINANCE_COST'],
        },
        {
          title: "Sổ quỹ & Dòng tiền",
          icon: <DollarSign className="w-8 h-8" />,
          color: "bg-blue-600",
          path: "https://lumi-finance-manager.vercel.app/#/report",
          status: "Mở ứng dụng",
          isExternal: true,
          permissionAny: ['FINANCE_ACCESS', 'FINANCE_LEDGER'],
        },
        {
          title: "Báo cáo tài chính quản trị",
          icon: <BarChart3 className="w-8 h-8" />,
          color: "bg-orange-600",
          path: "https://lumi-finance-manager.vercel.app/#/management-reports",
          status: "Mở ứng dụng",
          isExternal: true,
          permissionAny: ['FINANCE_ACCESS', 'FINANCE_REPORTS'],
        },
        {
          title: "Dữ liệu F3",
          icon: <Menu className="w-8 h-8" />,
          color: "bg-indigo-600",
          path: "/du-lieu-f3",
          status: "Mở ứng dụng",
          permissionAny: ['FINANCE_ACCESS', 'FINANCE_F3'],
        },
        {
          title: "Dữ liệu F3 (HCM)",
          icon: <Menu className="w-8 h-8" />,
          color: "bg-indigo-700",
          path: "/du-lieu-f3-hcm",
          status: "Mở ứng dụng",
          permissionAny: ['FINANCE_ACCESS', 'FINANCE_F3'],
        },
        {
          title: "Đối soát bill cước",
          icon: <DollarSign className="w-8 h-8" />,
          color: "bg-purple-600",
          path: "/doi-soat-bill-cuoc",
          status: "Mở ứng dụng",
          permissionAny: ['FINANCE_ACCESS', 'FINANCE_DASHBOARD', 'FINANCE_DOI_SOAT_BILL'],
        },
        {
          title: "Đối soát bill cước (HCM)",
          icon: <DollarSign className="w-8 h-8" />,
          color: "bg-purple-700",
          path: "/doi-soat-bill-cuoc-hcm",
          status: "Mở ứng dụng",
          permissionAny: ['FINANCE_ACCESS', 'FINANCE_DASHBOARD', 'FINANCE_DOI_SOAT_BILL'],
        },
      ],
    },

    {
      title: "CÀI ĐẶT HỆ THỐNG",
      items: [
        {
          title: "Công cụ quản trị",
          icon: <Settings className="w-8 h-8" />,
          color: "bg-gray-600",
          path: "/admin-tools",
          status: "Mở ứng dụng",
          adminOnly: true,
        },
        {
          title: "Quản lý cảnh báo MKT",
          icon: <AlertTriangle className="w-8 h-8" />,
          color: "bg-orange-600",
          path: "/admin/mkt-alerts",
          status: "Mở ứng dụng",
          adminOnly: true,
        },
        {
          title: "Lịch sử thay đổi",
          icon: <ClipboardList className="w-8 h-8" />,
          color: "bg-gray-600",
          path: "/lich-su-thay-doi",
          status: "Mở ứng dụng",
          adminOnly: true,
        },

      ],
    },
  ];

  // --- RECURSIVE PERMISSION FILTERING ---

  // Strict RBAC: chỉ admin mới bypass toàn bộ; Giám đốc / Leader-BGD (department hoặc mã role DB) xem full Dashboard điều hành
  const isAdminOrLeadership = ['admin', 'administrator', 'super_admin'].includes((userRole || '').toLowerCase());
  const executiveDashboardAccess = isExecutiveDashboardAudience(userDepartment, dbRoleCode);

  // Helper to check if an item (or any of its children) is visible
  const isItemVisible = (item) => {
    // 1. Admin Bypass - admins see everything
    if (isAdminOrLeadership) return true;

    // 2. Check adminOnly flag (ngoại lệ: allowDirectorDept + đối tượng điều hành BGĐ/Leader)
    if (item.adminOnly && !(item.allowDirectorDept && executiveDashboardAccess)) return false;

    // 3. Removed Team restrictions

    // 3b. Một trong nhiều quyền (tùy chọn trên từng menu item)
    if (item.permissionAny && Array.isArray(item.permissionAny) && item.permissionAny.length > 0) {
      return item.permissionAny.some((code) => canView(code));
    }

    // 4. Check explicit permission if present for leaf node
    if (item.permission) {
      return canView(item.permission);
    }

    // 5. If it has sub-items, check if AT LEAST ONE sub-item is visible
    if (item.subItems && item.subItems.length > 0) {
      // Filter subItems first to see what remains
      const visibleSubItems = item.subItems.filter(sub => isItemVisible(sub));
      return visibleSubItems.length > 0;
    }

    // 6. Default safe fallback: if no permission stricture defined, show it (or hide it? strict vs loose)
    // For this system, let's look at legacy behavior. Previous behavior was loose unless restricted.
    // However, for new RBAC, modules should be hidden if empty. 

    // For top-level items without permission (like 'home'), show them.
    // For items without children and without permission specified, show them unless adminOnly was checked above.
    return true;
  };

  // Mapping between section titles and menu item ids
  const sectionToMenuIdMap = {
    "DASHBOARD ĐIỀU HÀNH": "dashboard",
    "CSKH & CRM": "crm",
    "QUẢN LÝ SALE & ORDER": "sale",
    "QUẢN LÝ GIAO HÀNG": "delivery",
    "QUẢN LÝ MARKETING": "marketing",
    "QUẢN LÝ R&D": "rnd",
    "QUẢN LÝ NHÂN SỰ": "hr",
    "QUẢN LÝ TÀI CHÍNH": "finance",
    "CÀI ĐẶT HỆ THỐNG": "settings"
  };

  // Reverse mapping: menu item id to section title
  const menuIdToSectionTitleMap = Object.fromEntries(
    Object.entries(sectionToMenuIdMap).map(([title, id]) => [id, title])
  );

  // Filter Menu Items
  let filteredMenuItems = allMenuItems
    .map(item => {
      // Clone item to avoid mutating original
      const newItem = { ...item };
      if (newItem.subItems) {
        newItem.subItems = newItem.subItems.filter(sub => isItemVisible(sub));
      }
      return newItem;
    })
    .filter(item => {
      // Keep if visible AND (no children OR has visible children)
      if (item.subItems && item.subItems.length === 0) return false;
      return isItemVisible(item);
    });

  // Filter sidebar by selected group
  if (selectedGroup) {
    const menuId = sectionToMenuIdMap[selectedGroup];
    if (menuId) {
      filteredMenuItems = filteredMenuItems.filter(item => item.id === menuId || item.id === "home");
    }
  }

  // Filter Dashboard Cards (Sections) - use useMemo to recalculate when selectedGroup or searchQuery changes
  const filteredSections = useMemo(() => {
    let sections = allContentSections
      .map(section => {
        // Filter items in section
        const visibleItems = section.items.filter(item => {
          const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
          return isItemVisible(item) && matchesSearch;
        });
        return { ...section, items: visibleItems };
      })
      .filter(section => section.items.length > 0);

    // Filter sections by selected group
    if (selectedGroup) {
      sections = sections.filter(section => {
        const matches = section.title === selectedGroup;
        console.log(`🔍 Comparing: "${section.title}" === "${selectedGroup}" = ${matches}`);
        return matches;
      });
      console.log('🔍 Filtering sections by:', selectedGroup);
      console.log('📋 Filtered sections:', sections.map(s => s.title));
    }

    return sections;
  }, [selectedGroup, searchQuery, isAdminOrLeadership, executiveDashboardAccess, canView, userDepartment, dbRoleCode]);

  // --- NEWS FEED LOGIC ---
  const [news, setNews] = useState([]);
  const [isAddNewsOpen, setIsAddNewsOpen] = useState(false);
  const [newPost, setNewPost] = useState({ title: '', content: '', type: 'normal', image_url: '' });
  const [newsLoading, setNewsLoading] = useState(false);
  const [imageFile, setImageFile] = useState(null);

  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    const { data, error } = await supabase
      .from('news')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (!error && data) {
      setNews(data);
    }
  };

  const handleImageUpload = async (file) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${fileName}`;

      const { data, error } = await supabase.storage
        .from('news-images')
        .upload(filePath, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('news-images')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  };

  const handleAddNews = async () => {
    if (userRole !== 'hr') return alert("Bạn không có quyền đăng tin");
    if (!newPost.title) return alert("Vui lòng nhập tiêu đề");
    setNewsLoading(true);
    try {
      let finalImageUrl = newPost.image_url;

      // Upload image file if provided
      if (imageFile) {
        finalImageUrl = await handleImageUpload(imageFile);
      }

      const { error } = await supabase.from('news').insert([{
        ...newPost,
        image_url: finalImageUrl,
        created_by: userRole // simplified
      }]);
      if (error) throw error;
      alert("Đăng tin thành công!");
      setIsAddNewsOpen(false);
      setNewPost({ title: '', content: '', type: 'normal', image_url: '' });
      setImageFile(null);
      fetchNews();
    } catch (e) {
      alert("Lỗi đăng tin: " + e.message);
    } finally {
      setNewsLoading(false);
    }
  };

  // Helper to render card
  const renderCard = (item, index) => {
    if (item.isExternal) {
      return (
        <div
          key={index}
          onClick={() => navigate(`/external-view?url=${encodeURIComponent(item.path)}`)}
          className={`group relative bg-white rounded-xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 p-6 border border-gray-100 hover:border-gray-200 cursor-pointer ${item.comingSoon ? "opacity-75" : ""}`}
        >
          <div className="flex items-start gap-4">
            <div className={`${item.color} text-white p-3.5 rounded-2xl shadow-lg shadow-gray-200 group-hover:scale-110 transition-transform duration-300 flex-shrink-0`}>
              {item.icon}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <h3 className="text-base font-bold text-gray-800 mb-1 group-hover:text-pink-600 transition-colors">
                {item.title}
              </h3>
              <p className={`text-xs font-medium ${item.comingSoon ? "text-gray-400" : "text-gray-500"}`}>
                {item.status}
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <Link
        key={index}
        to={item.path}
        className={`group relative bg-white rounded-xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 p-6 border border-gray-100 hover:border-gray-200 ${item.comingSoon ? "opacity-75" : ""}`}
      >
        <div className="flex items-start gap-4">
          <div className={`${item.color} text-white p-3.5 rounded-2xl shadow-lg shadow-gray-200 group-hover:scale-110 transition-transform duration-300 flex-shrink-0`}>
            {item.icon}
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <h3 className="text-base font-bold text-gray-800 mb-1 group-hover:text-pink-600 transition-colors">
              {item.title}
            </h3>
            <p className={`text-xs font-medium ${item.comingSoon ? "text-gray-400" : "text-gray-500"}`}>
              {item.status}
            </p>
          </div>
        </div>
      </Link>
    );
  };


  if (permsLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-t-green-600 border-green-200 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Đang tải phân quyền...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div
        className={`bg-white border-r border-gray-200 transition-all duration-300 ${sidebarCollapsed ? "w-16" : "w-64"
          } flex flex-col sticky top-0 h-screen`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-end">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4 text-gray-600" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            )}
          </button>
        </div>


        {/* Menu Items */}
        <nav className="flex-1 overflow-y-auto p-2">


          {filteredMenuItems.map((item) => {
            const isExpanded = expandedMenus[item.id];
            return (
              <div key={item.id}>
                <div
                  onClick={(e) => {
                    if (item.subItems) {
                      e.preventDefault(); // Prevent navigation for parent items with submenus
                      toggleMenu(item.id);
                      
                      // Set selectedGroup khi click vào menu item trong sidebar
                      const sectionTitle = menuIdToSectionTitleMap[item.id];
                      if (sectionTitle) {
                        console.log('🖱️ Sidebar click - menuId:', item.id, '→ sectionTitle:', sectionTitle);
                        setSelectedGroup(selectedGroup === sectionTitle ? null : sectionTitle);
                        // Scroll to top khi filter
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    } else if (item.id === "home") {
                      // Click vào "Menu chức năng" thì hiển thị tất cả
                      setSelectedGroup(null);
                    }
                  }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors cursor-pointer ${item.active
                    ? "bg-green-500 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                    } ${sidebarCollapsed ? "justify-center" : ""}`}
                >
                  <span className={item.active ? "text-white" : "text-gray-600"}>
                    {item.icon}
                  </span>
                  {!sidebarCollapsed && (
                    <span className="flex-1 text-sm font-medium">{item.label}</span>
                  )}
                  {!sidebarCollapsed && item.subItems && (
                    isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )
                  )}
                </div>
                {!sidebarCollapsed && item.subItems && isExpanded && (
                  <div className="ml-4 mt-1 space-y-1">
                    {item.subItems.filter(subItem => {
                      if (
                        subItem.adminOnly &&
                        !isAdminOrLeadership &&
                        !(subItem.allowDirectorDept && executiveDashboardAccess)
                      ) {
                        return false;
                      }
                      if (subItem.permissionAny?.length) {
                        if (!subItem.permissionAny.some((c) => canView(c))) return false;
                      } else if (subItem.permission && !canView(subItem.permission)) return false;
                      return true;
                    }).map((subItem) => (
                      subItem.isExternal ? (
                        <div
                          key={subItem.id}
                          onClick={() => navigate(`/external-view?url=${encodeURIComponent(subItem.path)}`)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 cursor-pointer"
                        >
                          {subItem.icon}
                          <span>{subItem.label}</span>
                        </div>
                      ) : (
                        <Link
                          key={subItem.id}
                          to={subItem.path}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                        >
                          {subItem.icon}
                          <span>{subItem.label}</span>
                        </Link>
                      )
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50 flex flex-col h-screen">
        {/* Top Bar - sticky */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-30 px-6 py-3 flex items-center justify-between shadow-sm">
          {/* Search Bar */}
          <div className="relative w-96 hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Tìm kiếm ứng dụng..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-medium text-gray-700 placeholder:font-normal"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-4">
            {/* Debug Info */}
            <div className="hidden md:flex flex-col items-end text-xs text-gray-400">
              <span className="font-mono">Role: {userRole}</span>
              <span className="font-mono">Team: {localStorage.getItem('userTeam')}</span>
            </div>

            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 hover:bg-gray-100 p-2 rounded-lg transition-colors border border-gray-100"
              >
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
                  {(localStorage.getItem('username') || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="text-left hidden md:block">
                  <p className="text-sm font-bold text-gray-700">
                    {localStorage.getItem('username') || 'User'}
                  </p>
                  <p className="text-xs text-gray-500 capitalize font-medium">
                    {userRole}
                  </p>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>

              {/* Dropdown Menu */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-200">
                  <button
                    onClick={() => setIsChangePasswordOpen(true)}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    Đổi mật khẩu
                  </button>
                  <div className="border-t border-gray-100 my-1"></div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-8 w-full">
          {/* Bảng tin Section */}
          <div className="mb-12">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-red-600">Bảng tin</h1>
              {userRole === 'hr' && (
                <button onClick={() => setIsAddNewsOpen(true)} className="text-sm bg-red-50 text-red-600 px-3 py-1 rounded hover:bg-red-100 flex items-center gap-1">
                  <PlusCircle size={16} /> Đăng tin
                </button>
              )}
            </div>

            {/* News Add Modal */}
            {isAddNewsOpen && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-lg w-full max-w-md">
                  <h3 className="text-lg font-bold mb-4">Đăng tin mới</h3>
                  <select
                    className="w-full border p-2 rounded mb-3"
                    value={newPost.type}
                    onChange={e => setNewPost({ ...newPost, type: e.target.value })}
                  >
                    <option value="normal">Tin thường</option>
                    <option value="featured">Tin nổi bật (Có ảnh lớn)</option>
                  </select>

                  {newPost.type === 'featured' && (
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Ảnh tin</label>
                      <input
                        type="file"
                        accept="image/*"
                        className="w-full border p-2 rounded mb-2"
                        onChange={e => {
                          const file = e.target.files[0];
                          if (file) {
                            setImageFile(file);
                            setNewPost({ ...newPost, image_url: '' });
                          }
                        }}
                      />
                      {imageFile && (
                        <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200">
                          <p className="text-xs text-gray-600">📎 {imageFile.name}</p>
                          <button
                            onClick={() => setImageFile(null)}
                            className="text-xs text-red-500 hover:underline mt-1"
                          >
                            Xóa
                          </button>
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-2">Hoặc dán link ảnh:</div>
                      <input
                        className="w-full border p-2 rounded mt-1"
                        placeholder="https://..."
                        value={newPost.image_url}
                        onChange={e => {
                          setNewPost({ ...newPost, image_url: e.target.value });
                          setImageFile(null);
                        }}
                        disabled={!!imageFile}
                      />

                      {/* Image Preview */}
                      {(imageFile || newPost.image_url) && (
                        <div className="mt-2 w-full h-32 bg-gray-100 rounded border border-dashed border-gray-300 flex items-center justify-center overflow-hidden">
                          <img
                            src={imageFile ? URL.createObjectURL(imageFile) : newPost.image_url}
                            alt="Preview"
                            className="h-full w-full object-contain"
                            onError={(e) => e.target.style.display = 'none'}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <input
                    className="w-full border p-2 rounded mb-3"
                    placeholder="Tiêu đề tin..."
                    value={newPost.title}
                    onChange={e => setNewPost({ ...newPost, title: e.target.value })}
                  />

                  <textarea
                    className="w-full border p-2 rounded mb-3"
                    placeholder="Nội dung tóm tắt..."
                    rows={3}
                    value={newPost.content}
                    onChange={e => setNewPost({ ...newPost, content: e.target.value })}
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setIsAddNewsOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Hủy</button>
                    <button onClick={handleAddNews} disabled={newsLoading} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                      {newsLoading ? 'Đang đăng...' : 'Đăng tin'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {news.length === 0 ? (
              <div className="bg-white p-6 rounded shadow text-center text-gray-500">Chưa có tin tức nào. Hãy bấm "Đăng tin" để tạo mới.</div>
            ) : (
              <div className="flex flex-col lg:flex-row gap-6 items-start">
                {/* Find Featured News (First 'featured' or just first item) */}
                {(() => {
                  const featured = news.find(n => n.type === 'featured') || news[0];
                  const others = news.filter(n => n.id !== featured.id).slice(0, 5);

                  return (
                    <>
                      {/* Block 1: Featured Image + Title */}
                      <div className="flex-1 lg:w-1/3 flex flex-col">
                        <div className="bg-black/5 border border-red-200 rounded-lg h-64 flex items-center justify-center shadow-sm overflow-hidden group relative">
                          {featured.image_url ? (
                            <img
                              src={featured.image_url}
                              alt="Cover"
                              className="w-full h-full object-contain p-1 transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center text-gray-400 bg-gray-100 w-full h-full">
                              <Megaphone size={32} className="mb-2 opacity-50" />
                              <span className="text-xs">(Chưa có ảnh)</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Block 2: Detailed Content for Featured (or Second Item) */}
                      <div className="flex-1 lg:w-1/3 bg-white border border-red-200 rounded-lg p-4 h-64 shadow-sm relative overflow-y-auto">
                        <h3 className="text-lg font-bold text-red-600 mb-2 sticky top-0 bg-white pb-2 border-b border-red-100">Nội dung</h3>
                        <h3 className="font-bold text-base text-gray-800 mb-2">{featured.title}</h3>
                        <div className="text-gray-600 text-sm whitespace-pre-wrap leading-relaxed">
                          {featured.content.length > 200 ? (
                            <>
                              {featured.content.slice(0, 200)}...
                              <Link to={`/news/${featured.id}`} className="text-red-500 hover:underline font-medium ml-1">
                                xem thêm
                              </Link>
                            </>
                          ) : (
                            featured.content
                          )}
                        </div>
                      </div>

                      {/* Block 3: Latest/Other News */}
                      <div className="flex-1 lg:w-1/3 bg-white border border-red-200 rounded-lg p-4 h-64 shadow-sm relative overflow-y-auto">
                        <h3 className="text-lg font-bold text-red-600 mb-4 sticky top-0 bg-white pb-2 border-b border-red-100">Tin tức khác</h3>
                        <ul className="space-y-3">
                          {others.map(item => (
                            <li key={item.id} className="border-b border-gray-50 pb-2 last:border-0 hover:bg-gray-50 p-2 rounded transition cursor-pointer">
                              <Link to={`/news/${item.id}`} className="block">
                                <div className="font-medium text-gray-800 text-sm mb-1 hover:text-red-600 transition-colors">
                                  {item.title}
                                </div>
                                {/* Optional: Add date back if user wants, but currently keeping it minimal as requested */}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  );
                })()}

              </div>
            )}
          </div>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500 rounded flex items-center justify-center">
                  <div className="grid grid-cols-2 gap-1 w-6 h-6">
                    <div className="bg-white rounded-sm"></div>
                    <div className="bg-white rounded-sm"></div>
                    <div className="bg-white rounded-sm"></div>
                    <div className="bg-white rounded-sm"></div>
                  </div>
                </div>
                <h1 className="text-2xl font-bold text-gray-900">Menu chức năng</h1>
              </div>
              {selectedGroup && (
                <button
                  onClick={() => {
                    setSelectedGroup(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  Hiển thị tất cả
                </button>
              )}
            </div>
          </div>

          {(() => {
            console.log('🎨 Rendering sections. selectedGroup:', selectedGroup);
            console.log('📊 Total sections to render:', filteredSections.length);
            console.log('📋 Section titles:', filteredSections.map(s => s.title));
            return null;
          })()}
          {filteredSections.map((section, sectionIndex) => (
            section.items.length > 0 && (
              <div key={sectionIndex} className="mb-8">
                <h2 
                  className={`text-sm font-bold uppercase mb-4 cursor-pointer transition-colors ${
                    selectedGroup === section.title 
                      ? "text-red-600 underline" 
                      : "text-gray-700 hover:text-red-500"
                  }`}
                  onClick={() => {
                    // Toggle: nếu đã chọn thì bỏ chọn, nếu chưa chọn thì chọn
                    const newSelectedGroup = selectedGroup === section.title ? null : section.title;
                    console.log('🖱️ Clicked on section:', section.title);
                    console.log('📌 Setting selectedGroup to:', newSelectedGroup);
                    setSelectedGroup(newSelectedGroup);
                    
                    // Tự động expand menu item tương ứng trong sidebar
                    if (newSelectedGroup) {
                      const menuId = sectionToMenuIdMap[newSelectedGroup];
                      console.log('🔗 Mapped menuId:', menuId);
                      if (menuId && !expandedMenus[menuId]) {
                        setExpandedMenus(prev => ({ ...prev, [menuId]: true }));
                      }
                      // Scroll to top khi filter
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                >
                  {section.title}
                  {selectedGroup === section.title && " ✓"}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {section.items.map((item, itemIndex) => renderCard(item, itemIndex))}
                </div>
              </div>
            )
          ))}
        </div>
      </div>
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div >
  );
}

export default Home;
