import React, { useState, useEffect } from 'react';
import { UserRole, MenuPermission } from '../types';
import { getMenuPermissions, saveMenuPermissions, loadMenuPermissions } from '../utils/permissionUtils';
import { fetchPersonnel } from '../services/dataService';

interface MenuPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  menuId: string;
  menuLabel: string;
}

export const MenuPermissionModal: React.FC<MenuPermissionModalProps> = ({ 
  isOpen, 
  onClose, 
  menuId, 
  menuLabel 
}) => {
  const [allowedRoles, setAllowedRoles] = useState<UserRole[]>([]);
  const [allowedDepartments, setAllowedDepartments] = useState<string[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      // Load permissions từ Firebase trước
      loadMenuPermissions().then(() => {
        const permissions = getMenuPermissions();
        const menuPermission = permissions.find(p => p.menuId === menuId);
        setAllowedRoles(menuPermission?.allowedRoles || []);
        setAllowedDepartments(menuPermission?.allowedDepartments || []);
      });
      
      // Load danh sách departments từ personnel
      fetchPersonnel().then(personnel => {
        const departments = Array.from(new Set(personnel.map(p => p.department).filter(Boolean))) as string[];
        setAvailableDepartments(departments.sort());
      });
    }
  }, [isOpen, menuId]);

  const handleRoleToggle = (role: UserRole) => {
    setAllowedRoles(prev => {
      if (prev.includes(role)) {
        return prev.filter(r => r !== role);
      } else {
        return [...prev, role];
      }
    });
  };

  const handleDepartmentToggle = (department: string) => {
    setAllowedDepartments(prev => {
      if (prev.includes(department)) {
        return prev.filter(d => d !== department);
      } else {
        return [...prev, department];
      }
    });
  };

  const handleSave = async () => {
    const permissions = getMenuPermissions();
    const existingIndex = permissions.findIndex(p => p.menuId === menuId);
    
    const newPermission: MenuPermission = {
      menuId,
      allowedRoles,
      // Nếu có chọn employee nhưng không chọn department nào, set thành mảng rỗng để không employee nào có quyền
      // Nếu không chọn employee, thì không cần allowedDepartments
      allowedDepartments: allowedRoles.includes('employee') 
        ? (allowedDepartments.length > 0 ? allowedDepartments : [])
        : undefined
    };

    if (existingIndex >= 0) {
      permissions[existingIndex] = newPermission;
    } else {
      permissions.push(newPermission);
    }

    await saveMenuPermissions(permissions);
    // Trigger custom event để Sidebar re-render
    window.dispatchEvent(new Event('menuPermissionsUpdated'));
    onClose();
    // Reload page để cập nhật menu
    window.location.reload();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md m-4 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">
          Phân quyền Menu (菜单权限): {menuLabel}
        </h2>
        
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allowedRoles.includes('admin')}
              onChange={() => handleRoleToggle('admin')}
              className="w-5 h-5 text-brand-navy"
              disabled // Admin luôn có quyền
            />
            <label className="text-sm font-medium text-gray-700">Admin (管理员)</label>
            <span className="text-xs text-gray-500">(Luôn có quyền)</span>
          </div>
          
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allowedRoles.includes('partner')}
              onChange={() => handleRoleToggle('partner')}
              className="w-5 h-5 text-brand-navy"
            />
            <label className="text-sm font-medium text-gray-700">Đối tác (合作伙伴) (Partner)</label>
          </div>
          
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allowedRoles.includes('employee')}
              onChange={() => handleRoleToggle('employee')}
              className="w-5 h-5 text-brand-navy"
            />
            <label className="text-sm font-medium text-gray-700">Nhân viên (员工) (Employee)</label>
          </div>
        </div>

        {/* Phân quyền theo Phòng ban (chỉ hiện khi đã chọn Nhân viên) */}
        {allowedRoles.includes('employee') && (
          <div className="mb-6 border-t pt-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">
              Phân quyền theo Phòng ban (部门权限) (Áp dụng cho Nhân viên)
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {availableDepartments.length === 0 ? (
                <p className="text-xs text-gray-500">Chưa có phòng ban nào (暂无部门)</p>
              ) : (
                availableDepartments.map((dept) => (
                  <div key={dept} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={allowedDepartments.includes(dept)}
                      onChange={() => handleDepartmentToggle(dept)}
                      className="w-4 h-4 text-brand-navy"
                    />
                    <label className="text-sm text-gray-700">{dept}</label>
                  </div>
                ))
              )}
            </div>
            {allowedRoles.includes('employee') && allowedDepartments.length === 0 && (
              <p className="text-xs text-orange-600 mt-2">
                ⚠️ Lưu ý: Nếu không chọn phòng ban nào, KHÔNG nhân viên nào có thể truy cập menu này. Vui lòng chọn ít nhất một phòng ban.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50"
          >
            Hủy (取消)
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-brand-navy text-white rounded hover:bg-brand-darkNavy"
          >
            Lưu (保存)
          </button>
        </div>
      </div>
    </div>
  );
};

