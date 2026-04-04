import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase/config';
import { normalizePermissionCode } from '../utils/permissionCodes';

// Cache to prevent repetitive fetching
let cachedPermissions = null;
let cachedRole = null;
let cachedTeam = null; // Add team to cache
let cachedEmail = null; // Add email to cache key
let permissionPromise = null;

const CACHE_DURATION = 5 * 1000; // Keep cache very short so new grants appear quickly
let lastFetchTime = 0;

const PERMISSIONS_INVALIDATE_EVENT = 'luminew-permissions-invalidate';

/** Xóa cache module + báo mọi tab/hook refetch (sau khi admin sửa matrix hoặc gán role). */
export function dispatchPermissionsInvalidate() {
    lastFetchTime = 0;
    cachedPermissions = null;
    cachedRole = null;
    cachedTeam = null;
    cachedEmail = null;
    permissionPromise = null;
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(PERMISSIONS_INVALIDATE_EVENT));
    }
}

function findPermissionRow(permissions, pageCode) {
    const key = normalizePermissionCode(pageCode);
    return permissions.find((x) => normalizePermissionCode(x.page_code) === key);
}

const normKey = (s) => String(s ?? '').trim().toLowerCase();

/**
 * Matrix lưu theo app_roles.code; nếu users.role đang là tên hiển thị hoặc khác hoa/thường
 * thì .eq('role_code', users.role) trả về rỗng dù đã tick quyền.
 */
async function fetchPermissionsForRole(supabase, rawRoleFromUser) {
    const userRoleCode = String(rawRoleFromUser ?? '').trim();
    if (!userRoleCode) {
        return { permissions: [], resolvedRoleCode: null };
    }

    const fetchByCode = async (code) => {
        const { data, error } = await supabase
            .from('app_page_permissions')
            .select('*')
            .eq('role_code', code);
        if (error) console.error('Error fetching permissions', error);
        return data || [];
    };

    let perms = await fetchByCode(userRoleCode);
    if (perms.length > 0) {
        return { permissions: perms, resolvedRoleCode: userRoleCode };
    }

    const { data: roles, error: rolesErr } = await supabase.from('app_roles').select('code,name');
    if (rolesErr || !roles?.length) {
        return { permissions: [], resolvedRoleCode: userRoleCode };
    }

    const nk = normKey(userRoleCode);
    const matched = roles.find(
        (r) => normKey(r.code) === nk || normKey(r.name) === nk
    );
    const canonical = matched?.code ? String(matched.code).trim() : null;
    if (canonical && canonical !== userRoleCode) {
        perms = await fetchByCode(canonical);
        if (perms.length > 0) {
            return { permissions: perms, resolvedRoleCode: canonical };
        }
    }

    // Đúng nhóm nhưng chưa cấu hình dòng nào trong matrix → vẫn trả canonical để UI/RLS nhất quán
    return { permissions: perms, resolvedRoleCode: canonical || userRoleCode };
}

export const usePermissions = () => {
    const [permissions, setPermissions] = useState([]);
    const [role, setRole] = useState(null);
    const [team, setTeam] = useState(null); // Add team state
    const [loading, setLoading] = useState(true);
    const [cacheBust, setCacheBust] = useState(0);

    const userEmail = localStorage.getItem('userEmail');

    useEffect(() => {
        const bump = () => setCacheBust((v) => v + 1);
        window.addEventListener(PERMISSIONS_INVALIDATE_EVENT, bump);
        return () => window.removeEventListener(PERMISSIONS_INVALIDATE_EVENT, bump);
    }, []);

    useEffect(() => {
        if (!userEmail) {
            setLoading(false);
            return;
        }

        const fetchPermissions = async () => {
            // 0. Check if cache is valid AND belongs to current user
            const isCacheValid = cachedPermissions &&
                (Date.now() - lastFetchTime < CACHE_DURATION) &&
                cachedEmail === userEmail; // CRITICAL FIX

            if (isCacheValid) {
                setPermissions(cachedPermissions);
                setRole(cachedRole);
                setTeam(cachedTeam); // Set team from cache
                setLoading(false);
                return;
            }

            // Deduplicate requests
            if (permissionPromise) {
                const data = await permissionPromise;
                setPermissions(data.permissions);
                setRole(data.role);
                setTeam(data.team); // Set team from promise
                setLoading(false);
                return;
            }

            permissionPromise = (async () => {
                try {
                    // 1. Get User Role and Team from 'users' table (Source of Truth)
                    const { data: userData, error: urError } = await supabase
                        .from('users')
                        .select('role, team') // Add team
                        .eq('email', userEmail)
                        .maybeSingle();

                    if (urError) {
                        console.error("Error fetching user data", urError);
                    }

                    const userRoleCode = String(userData?.role ?? '').trim();
                    const userTeam = userData?.team; // Get team

                    if (!userRoleCode) {
                        return { permissions: [], role: null, team: null };
                    }

                    const { permissions: finalPerms, resolvedRoleCode } = await fetchPermissionsForRole(
                        supabase,
                        userRoleCode
                    );

                    // Update Cache
                    cachedPermissions = finalPerms;
                    cachedRole = resolvedRoleCode;
                    cachedTeam = userTeam; // Cache team
                    cachedEmail = userEmail;
                    lastFetchTime = Date.now();

                    return { permissions: finalPerms, role: resolvedRoleCode, team: userTeam };
                } catch (e) {
                    console.error("Permission load error", e);
                    return { permissions: [], role: null, team: null };
                } finally {
                    permissionPromise = null;
                }
            })();

            const result = await permissionPromise;
            setPermissions(result.permissions);
            setRole(result.role);
            setTeam(result.team);
            setLoading(false);
        };

        fetchPermissions();

        // Force refresh permissions when user returns to app/tab.
        const handleWindowFocus = () => {
            lastFetchTime = 0;
            fetchPermissions();
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                lastFetchTime = 0;
                fetchPermissions();
            }
        };
        window.addEventListener('focus', handleWindowFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('focus', handleWindowFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [userEmail, cacheBust]);

    // --- CHECKER FUNCTIONS ---

    const hasAdminBypass = () => {
        const legacyRole = (localStorage.getItem('userRole') || '').toLowerCase();
        const roleFromDbLower = (role || '').toLowerCase();
        return (
            legacyRole === 'admin' ||
            roleFromDbLower === 'admin' ||
            roleFromDbLower === 'administrator' ||
            roleFromDbLower === 'super_admin' ||
            role === 'ADMIN' ||
            role === 'ADMINISTRATOR' ||
            role === 'SUPER_ADMIN'
        );
    };

    const canView = (pageCode) => {
        // Strict RBAC: chỉ admin/super_admin bypass, còn lại bám app_page_permissions
        if (hasAdminBypass()) return true;

        const p = findPermissionRow(permissions, pageCode);
        if (p) return !!p.can_view;

        return false;
    };

    const canEdit = (pageCode) => {
        if (hasAdminBypass()) return true;
        
        const p = findPermissionRow(permissions, pageCode);
        return !!p?.can_edit;
    };

    const canDelete = (pageCode) => {
        if (hasAdminBypass()) return true;
        
        const p = findPermissionRow(permissions, pageCode);
        return !!p?.can_delete;
    };

    const getAllowedColumns = (pageCode) => {
        if (hasAdminBypass()) return ['*'];
        
        const p = findPermissionRow(permissions, pageCode);
        if (!p) return []; // No permission entry means access denied generally
        return p.allowed_columns || []; // JSON array
    };

    const isColumnAllowed = (pageCode, columnName) => {
        if (hasAdminBypass()) return true;
        
        const cols = getAllowedColumns(pageCode);
        if (cols.includes('*')) return true;
        return cols.includes(columnName);
    };

    const refreshPermissions = useCallback(() => {
        dispatchPermissionsInvalidate();
    }, []);

    return {
        role,
        team,
        loading,
        permissions,
        canView,
        canEdit,
        canDelete,
        getAllowedColumns,
        isColumnAllowed,
        refreshPermissions
    };
};

export default usePermissions;
