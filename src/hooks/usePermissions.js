import { useEffect, useState } from 'react';
import { supabase } from '../supabase/config';

// Cache to prevent repetitive fetching
let cachedPermissions = null;
let cachedRole = null;
let cachedTeam = null; // Add team to cache
let cachedEmail = null; // Add email to cache key
let permissionPromise = null;

const CACHE_DURATION = 1 * 60 * 1000; // Reduce to 1 minute
let lastFetchTime = 0;

export const usePermissions = () => {
    // Initial state: only use cache if email matches (can't check sync perfectly, but effective for re-renders)
    // For safety, start empty/loading unless we are sure.
    // Ideally, we depend on the effect to set it.
    const [permissions, setPermissions] = useState([]);
    const [role, setRole] = useState(null);
    const [team, setTeam] = useState(null); // Add team state
    const [loading, setLoading] = useState(true);

    const userEmail = localStorage.getItem('userEmail');

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
                // Double check if the promise result matches current user (unlikely to change mid-flight but good practice)
                // Actually, if a promise is inflight for User A, and we switch to User B, we shouldn't use it.
                // But for simplicity, we assume one active session.
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

                    const userRoleCode = userData?.role;
                    const userTeam = userData?.team; // Get team

                    if (!userRoleCode) {
                        // Default to no role
                        return { permissions: [], role: null, team: null }; // Add team
                    }

                    // 2. Get Permissions for Role
                    const { data: permData, error: pError } = await supabase
                        .from('app_page_permissions')
                        .select('*')
                        .eq('role_code', userRoleCode);

                    if (pError) console.error("Error fetching permissions", pError);

                    const finalPerms = permData || [];

                    // Update Cache
                    cachedPermissions = finalPerms;
                    cachedRole = userRoleCode;
                    cachedTeam = userTeam; // Cache team
                    cachedEmail = userEmail;
                    lastFetchTime = Date.now();

                    return { permissions: finalPerms, role: userRoleCode, team: userTeam }; // Return team
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
            setLoading(false);
        };

        fetchPermissions();
    }, [userEmail]);

    // --- CHECKER FUNCTIONS ---

    const canView = (pageCode) => {
        // Legacy Admin Bypass
        const legacyRole = localStorage.getItem('userRole');
        if (legacyRole === 'admin') return true;

        if (role === 'ADMIN') return true; // Admin bypass

        // If the pageCode is actually a module code (e.g., checking if module is visible)
        // We might want to return true if ANY page in the module is visible, or check specifically.
        // For now, assume strict page code checking.

        const p = permissions.find(x => x.page_code === pageCode);
        if (p) return !!p.can_view;



        return false;
    };

    const canEdit = (pageCode) => {
        if (role === 'ADMIN') return true;
        const p = permissions.find(x => x.page_code === pageCode);
        return !!p?.can_edit;
    };

    const canDelete = (pageCode) => {
        if (role === 'ADMIN') return true;
        const p = permissions.find(x => x.page_code === pageCode);
        return !!p?.can_delete;
    };

    const getAllowedColumns = (pageCode) => {
        if (role === 'ADMIN') return ['*'];
        const p = permissions.find(x => x.page_code === pageCode);
        if (!p) return []; // No permission entry means access denied generally
        return p.allowed_columns || []; // JSON array
    };

    const isColumnAllowed = (pageCode, columnName) => {
        if (role === 'ADMIN') return true;
        const cols = getAllowedColumns(pageCode);
        if (cols.includes('*')) return true;
        return cols.includes(columnName);
    };

    return {
        role,
        team,
        loading,
        canView,
        canEdit,
        canDelete,
        getAllowedColumns,
        isColumnAllowed,
        refreshPermissions: () => { lastFetchTime = 0; } // Force refresh
    };
};

export default usePermissions;
