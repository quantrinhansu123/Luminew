import { ChevronDown, ChevronRight, Eye } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import * as rbacService from '../../services/rbacService';

const REQUIRED_PAGE_OVERRIDES = {
    MODULE_SALE: [
        { code: 'SALE_VIEW_HCM', name: 'Xem báo cáo Sale HCM', path: '/xem-bao-cao-sale-hcm' }
    ]
};

const PermissionTree = ({ roleCode, onPermissionChange }) => {
    const [permissions, setPermissions] = useState([]);
    const [expandedModules, setExpandedModules] = useState({});
    const [loading, setLoading] = useState(false);
    const [customPages, setCustomPages] = useState([]);
    const [newPageCode, setNewPageCode] = useState('');
    const [newPageName, setNewPageName] = useState('');
    const [newPagePath, setNewPagePath] = useState('');

    const CUSTOM_PAGES_STORAGE_KEY = 'rbac_custom_page_codes';

    useEffect(() => {
        try {
            const raw = localStorage.getItem(CUSTOM_PAGES_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return;
            const sanitized = parsed
                .map((p) => ({
                    code: String(p?.code || '').trim(),
                    name: String(p?.name || '').trim(),
                    path: String(p?.path || '').trim()
                }))
                .filter((p) => p.code);
            setCustomPages(sanitized);
        } catch (e) {
            console.warn('Không đọc được custom page codes:', e);
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(CUSTOM_PAGES_STORAGE_KEY, JSON.stringify(customPages));
        } catch (e) {
            console.warn('Không lưu được custom page codes:', e);
        }
    }, [customPages]);

    const dynamicModulePages = useMemo(() => {
        const staticModules = rbacService.MODULE_PAGES || {};
        const modulesWithRequired = Object.entries(staticModules).reduce((acc, [moduleCode, module]) => {
            const basePages = Array.isArray(module?.pages) ? module.pages : [];
            const requiredPages = REQUIRED_PAGE_OVERRIDES[moduleCode] || [];
            const mergedPages = [...basePages];
            requiredPages.forEach((requiredPage) => {
                if (!mergedPages.some((p) => p.code === requiredPage.code)) {
                    mergedPages.push(requiredPage);
                }
            });
            acc[moduleCode] = {
                ...module,
                pages: mergedPages
            };
            return acc;
        }, {});

        const knownCodes = new Set(
            Object.values(modulesWithRequired)
                .flatMap((m) => (m?.pages || []).map((p) => p.code))
                .filter(Boolean)
        );

        const orphanFromDb = (permissions || [])
            .map((p) => String(p?.page_code || '').trim())
            .filter((code) => code && !knownCodes.has(code))
            .map((code) => ({ code, name: code, path: '(tự phát hiện từ DB)' }));

        const customEntries = (customPages || []).map((p) => ({
            code: p.code,
            name: p.name || p.code,
            path: p.path || '(tùy chỉnh)'
        }));

        const mergedCustomPages = [...orphanFromDb, ...customEntries]
            .filter((p) => p.code)
            .reduce((acc, cur) => {
                if (!acc.some((x) => x.code === cur.code)) acc.push(cur);
                return acc;
            }, []);

        if (mergedCustomPages.length === 0) return modulesWithRequired;

        return {
            ...modulesWithRequired,
            MODULE_CUSTOM: {
                name: 'QUYỀN TÙY CHỈNH / VIEW MỚI',
                pages: mergedCustomPages
            }
        };
    }, [permissions, customPages]);

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
            Object.keys(dynamicModulePages).forEach(moduleCode => {
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

    const handleAddCustomPage = () => {
        const code = String(newPageCode || '').trim().toUpperCase();
        if (!code) {
            toast.warn('Vui lòng nhập page_code');
            return;
        }
        const name = String(newPageName || '').trim();
        const path = String(newPagePath || '').trim();

        setCustomPages((prev) => {
            const next = [...prev];
            const idx = next.findIndex((p) => p.code === code);
            if (idx >= 0) {
                next[idx] = { ...next[idx], name: name || next[idx].name, path: path || next[idx].path };
            } else {
                next.push({ code, name, path });
            }
            return next;
        });

        setNewPageCode('');
        setNewPageName('');
        setNewPagePath('');
        toast.success(`Đã thêm page_code: ${code}`);
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
            <div className="border rounded-lg p-3 bg-amber-50 border-amber-200">
                <div className="text-sm font-semibold text-amber-900 mb-2">
                    Thêm quyền cho view mới (không cần sửa code)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input
                        type="text"
                        value={newPageCode}
                        onChange={(e) => setNewPageCode(e.target.value)}
                        placeholder="page_code (vd: ORDERS_DANH_SACH_VAN_DON_HCM)"
                        className="px-3 py-2 border rounded text-sm md:col-span-2"
                    />
                    <input
                        type="text"
                        value={newPageName}
                        onChange={(e) => setNewPageName(e.target.value)}
                        placeholder="Tên hiển thị (tùy chọn)"
                        className="px-3 py-2 border rounded text-sm"
                    />
                    <input
                        type="text"
                        value={newPagePath}
                        onChange={(e) => setNewPagePath(e.target.value)}
                        placeholder="Path (tùy chọn, vd: /danh-sach-van-don-hcm)"
                        className="px-3 py-2 border rounded text-sm"
                    />
                </div>
                <div className="mt-2">
                    <button
                        type="button"
                        onClick={handleAddCustomPage}
                        className="px-3 py-1.5 rounded bg-amber-600 text-white text-sm hover:bg-amber-700"
                    >
                        Thêm vào Matrix
                    </button>
                </div>
            </div>

            {Object.entries(dynamicModulePages).map(([moduleCode, module]) => {
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
