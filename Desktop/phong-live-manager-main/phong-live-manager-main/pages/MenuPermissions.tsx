import React, { useState, useEffect } from 'react';
import { MenuPermissionModal } from '../components/MenuPermissionModal';
import { getMenuPermissions, loadMenuPermissions } from '../utils/permissionUtils';
import { ReportType } from '../types';
import { isAdmin } from '../utils/permissionUtils';

const MENU_ITEMS = [
  { id: ReportType.DASHBOARD, label: 'Dashboard (仪表板)' },
  { id: ReportType.LIVE_ADS, label: 'Quản lý Live (直播管理)' },
  { id: 'live_report_detail', label: 'Chi tiết Báo Cáo Live (直播报告详情)' },
  { id: ReportType.VIDEO_PARAM, label: 'Quản lý Video & KPI (视频和KPI管理)' },
  { id: ReportType.STORE_MGR, label: 'Quản lý Cửa Hàng (店铺管理)' },
  { id: 'store_overview', label: 'Tổng Quan Cửa Hàng (店铺总览)' },
  { id: ReportType.PERSONNEL, label: 'Nhân sự (人事)' },
  { id: ReportType.CPQC, label: 'CPQC (成本管理)' },
  { id: ReportType.SALARY_REPORT, label: 'Báo Cáo Lương (工资报告)' },
];

export const MenuPermissions: React.FC = () => {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [selectedMenu, setSelectedMenu] = useState<{ id: string; label: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPermissions();
  }, []);

  const loadPermissions = async () => {
    setIsLoading(true);
    await loadMenuPermissions();
    setPermissions(getMenuPermissions());
    setIsLoading(false);
  };

  // Check if user is logged in and is admin
  const currentUser = localStorage.getItem('currentUser');
  if (!currentUser) {
    window.location.hash = '#/login';
    return null;
  }

  if (!isAdmin()) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-red-600 text-center">
          <p className="text-xl font-bold mb-2">Không có quyền truy cập (无权访问)</p>
          <p className="text-sm">Chỉ Admin mới có thể quản lý phân quyền menu (只有管理员可以管理菜单权限)</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Đang tải dữ liệu... (正在加载数据...)</div>
      </div>
    );
  }

  const getPermissionInfo = (menuId: string) => {
    const permission = permissions.find(p => p.menuId === menuId);
    if (!permission) {
      return { roles: [], departments: [] };
    }
    return {
      roles: permission.allowedRoles || [],
      departments: permission.allowedDepartments || []
    };
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 uppercase">Quản Lý Phân Quyền Menu (菜单权限管理)</h2>
        <p className="text-sm text-gray-600 mt-2">
          Quản lý quyền truy cập các menu cho từng role và phòng ban (管理每个角色和部门的菜单访问权限)
        </p>
      </div>

      <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-bold text-gray-800">Danh Sách Menu (菜单列表)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy text-white border-b">
              <tr>
                <th className="px-6 py-3 text-left">Menu (菜单)</th>
                <th className="px-6 py-3 text-left">Role được phép (允许的角色)</th>
                <th className="px-6 py-3 text-left">Phòng ban được phép (允许的部门)</th>
                <th className="px-6 py-3 text-center">Thao tác (操作)</th>
              </tr>
            </thead>
            <tbody>
              {MENU_ITEMS.map((menu) => {
                const { roles, departments } = getPermissionInfo(menu.id);
                return (
                  <tr key={menu.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4 font-bold text-gray-800">{menu.label}</td>
                    <td className="px-6 py-4">
                      {roles.length === 0 ? (
                        <span className="text-red-600 text-xs">Chưa cấp quyền (未授权)</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {roles.map((role: string) => (
                            <span
                              key={role}
                              className={`px-2 py-1 rounded text-xs font-medium border ${
                                role === 'admin' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                                role === 'partner' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                                'bg-green-100 text-green-800 border-green-200'
                              }`}
                            >
                              {role === 'admin' ? 'Admin' : role === 'partner' ? 'Đối tác' : 'Nhân viên'}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {roles.includes('employee') ? (
                        departments.length === 0 ? (
                          <span className="text-orange-600 text-xs">Không có phòng ban nào (无部门)</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {departments.map((dept: string) => (
                              <span
                                key={dept}
                                className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200"
                              >
                                {dept}
                              </span>
                            ))}
                          </div>
                        )
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setSelectedMenu(menu)}
                        className="px-4 py-2 bg-brand-navy text-white rounded hover:bg-brand-darkNavy text-sm font-medium"
                      >
                        Cấu hình (配置)
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedMenu && (
        <MenuPermissionModal
          isOpen={!!selectedMenu}
          onClose={() => {
            setSelectedMenu(null);
            loadPermissions();
          }}
          menuId={selectedMenu.id}
          menuLabel={selectedMenu.label}
        />
      )}
    </div>
  );
};


