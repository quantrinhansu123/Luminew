import { ChevronDown, ChevronRight, Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import * as rbacService from '../../services/rbacService';

const PermissionTree = ({ roleCode, onPermissionChange }) => {
    const [permissions, setPermissions] = useState([]);
    const [expandedModules, setExpandedModules] = useState({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (roleCode) {
            loadPermissions();
        }
    }, [roleCode]);

    const loadPermissions = async () => {
        setLoading(true);
        try {
            const data = await rbacService.getPagePermissions(roleCode);
            setPermissions(data);

            // Auto-expand all modules on load
            const expanded = {};
            Object.keys(rbacService.MODULE_PAGES).forEach(moduleCode => {
                expanded[moduleCode] = true;
            });
            setExpandedModules(expanded);
        } catch (error) {
            console.error('Error loading page permissions:', error);
            toast.error('Lỗi tải quyền: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleModule = (moduleCode) => {
        setExpandedModules(prev => ({
            ...prev,
            [moduleCode]: !prev[moduleCode]
        }));
    };

    const getPagePermission = (pageCode) => {
        return permissions.find(p => p.page_code === pageCode) || {
            role_code: roleCode,
            page_code: pageCode,
            can_view: false
        };
    };

    const handlePermissionChange = async (pageCode, action, value) => {
        // Chỉ cho phép thay đổi can_view
        if (action !== 'can_view') return;
        
        const existing = getPagePermission(pageCode);
        // Đảm bảo có đầy đủ thông tin cần thiết
        const updated = { 
            role_code: roleCode,
            page_code: pageCode,
            can_view: value,
            can_edit: false, // Luôn false vì chỉ cho phép xem
            can_delete: false // Luôn false vì chỉ cho phép xem
        };

        // Update local state optimistically
        const newPerms = permissions.filter(p => p.page_code !== pageCode);
        newPerms.push(updated);
        setPermissions(newPerms);

        try {
            await rbacService.upsertPagePermission(updated);
        } catch (error) {
            console.error('Error updating permission:', error);
            toast.error('Lỗi lưu quyền: ' + (error.message || 'Unknown error'));
            // Reload on error
            loadPermissions();
        }
    };

    const toggleAllActions = async (moduleCode, action) => {
        // Chỉ cho phép toggle can_view
        if (action !== 'can_view') return;
        
        const module = rbacService.MODULE_PAGES[moduleCode];
        if (!module) return;

        // Check if all pages in this module have this action enabled
        const allEnabled = module.pages.every(page => {
            const perm = getPagePermission(page.code);
            return perm[action];
        });

        // Toggle all to opposite
        const newValue = !allEnabled;

        // Update all pages in module - đảm bảo có đầy đủ thông tin
        const updates = module.pages.map(page => {
            const existing = getPagePermission(page.code);
            return { 
                role_code: roleCode,
                page_code: page.code,
                can_view: newValue,
                can_edit: false, // Luôn false vì chỉ cho phép xem
                can_delete: false // Luôn false vì chỉ cho phép xem
            };
        });

        // Update local state optimistically
        setPermissions(prev => {
            const filtered = prev.filter(p => !module.pages.some(page => page.code === p.page_code));
            return [...filtered, ...updates];
        });

        // Save to database - sử dụng từng cái một với delay để tránh lỗi RLS
        try {
            for (let i = 0; i < updates.length; i++) {
                await rbacService.upsertPagePermission(updates[i]);
                // Thêm delay nhỏ giữa các requests để tránh rate limit
                if (i < updates.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            toast.success(`Đã cập nhật thành công ${updates.length} quyền`);
        } catch (err) {
            console.error('Lỗi cập nhật hàng loạt:', err);
            const errorMsg = err.message || 'Unknown error';
            // Kiểm tra nếu là lỗi RLS
            if (errorMsg.includes('row-level security') || errorMsg.includes('RLS')) {
                toast.error('Lỗi quyền truy cập. Vui lòng chạy script SQL để fix RLS policy trong Supabase.');
            } else {
                toast.error('Lỗi cập nhật hàng loạt: ' + errorMsg);
            }
            // Reload on error
            loadPermissions();
        }
    };

    if (loading) {
        return <div className="text-center py-8 text-gray-500">Đang tải...</div>;
    }

    return (
        <div className="space-y-2">
            {Object.entries(rbacService.MODULE_PAGES).map(([moduleCode, module]) => {
                const isExpanded = expandedModules[moduleCode];

                return (
                    <div key={moduleCode} className="border rounded-lg overflow-hidden">
                        {/* Module Header */}
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
                            <div className="flex items-center justify-between p-3">
                                <button
                                    onClick={() => toggleModule(moduleCode)}
                                    className="flex items-center gap-2 flex-1 text-left font-semibold text-gray-800 hover:text-blue-600"
                                >
                                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                    <span>{module.name}</span>
                                    <span className="text-xs text-gray-500 ml-2">({module.pages.length} trang)</span>
                                </button>

                                {/* Quick Actions for entire module - Chỉ hiển thị Xem */}
                                <div className="flex items-center gap-4 text-xs">
                                    <button
                                        onClick={() => toggleAllActions(moduleCode, 'can_view')}
                                        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-100 text-blue-700"
                                        title="Chọn/bỏ tất cả Xem"
                                    >
                                        <Eye size={14} /> Tất cả
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Pages List */}
                        {isExpanded && (
                            <div className="divide-y bg-white">
                                {module.pages.map(page => {
                                    const perm = getPagePermission(page.code);

                                    return (
                                        <div key={page.code} className="flex items-center justify-between p-3 hover:bg-gray-50">
                                            <div className="flex-1">
                                                <div className="font-medium text-gray-800">{page.name}</div>
                                                <div className="text-xs text-gray-500">{page.path}</div>
                                            </div>

                                            <div className="flex items-center gap-6">
                                                {/* View - Chỉ cho phép check/uncheck Xem */}
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        checked={perm.can_view}
                                                        onChange={e => handlePermissionChange(page.code, 'can_view', e.target.checked)}
                                                        className="w-4 h-4 text-blue-600 rounded"
                                                    />
                                                    <span className="text-sm text-gray-600 group-hover:text-blue-600 flex items-center gap-1">
                                                        <Eye size={14} /> Xem
                                                    </span>
                                                </label>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default PermissionTree;
