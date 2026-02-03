import React, { useState, useMemo, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { ReportType } from '../types';
import { getCurrentUserRole, canAccessMenu, isAdmin, getCurrentUserDepartment, loadMenuPermissions } from '../utils/permissionUtils';

const MENU_ITEMS = [
  { id: ReportType.DASHBOARD, label: 'Dashboard (仪表板)', path: '/' },
  { id: ReportType.LIVE_ADS, label: 'Quản lý Live (直播管理)', path: '/live-reports' },
  { id: 'live_report_detail', label: 'Chi tiết Báo Cáo Live (直播报告详情)', path: '/live-report-detail' },
  { id: ReportType.VIDEO_PARAM, label: 'Quản lý Video & KPI (视频和KPI管理)', path: '/video-report' },
  { id: ReportType.STORE_MGR, label: 'Quản lý Cửa Hàng (店铺管理)', path: '/stores' },
  { id: 'store_overview', label: 'Tổng Quan Cửa Hàng (店铺总览)', path: '/store-overview' },
  { id: ReportType.PERSONNEL, label: 'Nhân sự (人事)', path: '/personnel' },
  { id: ReportType.CPQC, label: 'CPQC (成本管理)', path: '/cpqc' },
  { id: ReportType.SALARY_REPORT, label: 'Báo Cáo Lương (工资报告)', path: '/salary-report' },
  { id: 'menu_permissions', label: 'Phân Quyền Menu (菜单权限)', path: '/menu-permissions' },
];

export const Sidebar: React.FC = () => {
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [menuPermissionsCache, setMenuPermissionsCache] = useState<any>(null);
  const userRole = getCurrentUserRole();
  const userDepartment = getCurrentUserDepartment();

  // Load menu permissions từ Firebase khi component mount
  useEffect(() => {
    loadMenuPermissions()
      .then(() => {
        setPermissionsLoaded(true);
        // Trigger re-render bằng cách update cache state
        setMenuPermissionsCache(localStorage.getItem('menuPermissions'));
      })
      .catch(err => {
        console.error('Error loading menu permissions:', err);
        setPermissionsLoaded(true); // Vẫn set true để không block UI
      });
  }, []);

  // Listen for storage changes (khi permissions được update từ modal)
  useEffect(() => {
    const handleStorageChange = () => {
      setMenuPermissionsCache(localStorage.getItem('menuPermissions'));
    };
    window.addEventListener('storage', handleStorageChange);
    // Also listen for custom event khi save permissions
    window.addEventListener('menuPermissionsUpdated', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('menuPermissionsUpdated', handleStorageChange);
    };
  }, []);

  // Filter menu items dựa trên quyền (bao gồm cả role và department)
  const visibleMenuItems = useMemo(() => {
    if (!permissionsLoaded) {
      return []; // Không hiển thị menu nào cho đến khi permissions được load
    }
    return MENU_ITEMS.filter(item => {
      // Menu "Phân Quyền Menu" chỉ hiển thị cho Admin
      if (item.id === 'menu_permissions') {
        return isAdmin();
      }
      return canAccessMenu(item.id, userRole, userDepartment);
    });
  }, [userRole, userDepartment, permissionsLoaded, menuPermissionsCache]);

  return (
    <aside className="w-64 bg-white border-r border-gray-200 h-screen flex flex-col fixed left-0 top-0 z-50">
      <div className="h-16 flex items-center justify-center border-b border-brand-navy bg-brand-navy">
        <h1 className="text-white font-bold text-xl uppercase tracking-wider">Quản Lý Phòng Live (直播间和短视频的数据)</h1>
      </div>
      <nav className="flex-1 overflow-y-auto py-4">
        {visibleMenuItems.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-gray-500 mb-2">Không có menu nào được cấp quyền</p>
            <p className="text-xs text-gray-400">Vui lòng liên hệ Admin để được cấp quyền truy cập</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {visibleMenuItems.map((item) => (
            <li key={item.id}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center px-6 py-3 text-sm font-medium transition-colors ${isActive
                    ? 'bg-blue-50 text-brand-navy border-r-4 border-brand-navy'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
          </ul>
        )}
      </nav>
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="mb-2">
          <p className="text-xs text-gray-500 font-bold uppercase">Người dùng (用户)</p>
          <p className="text-sm font-medium text-gray-800 truncate">{localStorage.getItem('currentUser') || 'Unknown'}</p>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem('currentUser');
            localStorage.removeItem('currentUserId');
            localStorage.removeItem('currentUserRole');
            localStorage.removeItem('currentUserDepartment');
            localStorage.removeItem('currentUserPosition');
            window.location.reload();
          }}
          className="w-full text-xs text-brand-navy hover:text-blue-800 font-medium py-1 text-left"
        >
          Đăng xuất (登出)
        </button>
        <div className="text-xs text-gray-400 text-center mt-2 pt-2 border-t border-gray-200">
          © 2025 Quản Lý Phòng Live (直播间和短视频的数据)
        </div>
      </div>
    </aside>
  );
};