import { useEffect, useMemo, useState } from 'react';

import {
  resolveUserVanDonBranchFromRoster,
  userIsInVanDonU1Roster,
} from '../utils/chiaDonVanDonReport';
import { supabase } from '../supabase/config';
import usePermissions from './usePermissions';

const ADMIN_ROLE_CODES = new Set(['admin', 'administrator', 'super_admin']);

function readLoginIdentities() {
  const username = String(localStorage.getItem('username') || '').trim();
  const email = String(localStorage.getItem('userEmail') || '').trim();
  return [...new Set([username, email].filter(Boolean))];
}

/** Admin / ADMIN_TOOLS hoặc NV U1 trong `danh_sach_van_don` (được phân đơn). */
export default function usePhanBoDonHangAccess() {
  const { canView, loading: permsLoading, role } = usePermissions();
  const [u1Match, setU1Match] = useState(false);
  const [userBranch, setUserBranch] = useState(null);
  const [rosterLoading, setRosterLoading] = useState(true);

  const loginIdentities = useMemo(() => readLoginIdentities(), []);
  const isAdminRole = ADMIN_ROLE_CODES.has(String(role || '').trim().toLowerCase());
  const hasAdminTools = canView('ADMIN_TOOLS');
  const isAdminView = isAdminRole || hasAdminTools;

  useEffect(() => {
    if (isAdminView) {
      setU1Match(false);
      setUserBranch(null);
      setRosterLoading(false);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      setRosterLoading(true);
      try {
        const identities = new Set(loginIdentities);

        const email = String(localStorage.getItem('userEmail') || '').trim();
        if (email) {
          const { data: userRow } = await supabase
            .from('users')
            .select('name, username')
            .eq('email', email)
            .maybeSingle();
          if (userRow?.name) identities.add(String(userRow.name).trim());
          if (userRow?.username) identities.add(String(userRow.username).trim());
        }

        const { data, error } = await supabase
          .from('danh_sach_van_don')
          .select('ho_va_ten, trang_thai_chia, chi_nhanh');

        if (cancelled) return;

        if (error) {
          console.warn('[usePhanBoDonHangAccess] danh_sach_van_don:', error.message);
          setU1Match(false);
          setUserBranch(null);
        } else {
          const idList = [...identities];
          setU1Match(userIsInVanDonU1Roster(data, idList));
          setUserBranch(resolveUserVanDonBranchFromRoster(data, idList));
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[usePhanBoDonHangAccess]', err);
          setU1Match(false);
          setUserBranch(null);
        }
      } finally {
        if (!cancelled) setRosterLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdminView, loginIdentities]);

  const canAccess = isAdminView || (u1Match && !!userBranch);
  const loading = permsLoading || rosterLoading;

  return { canAccess, loading, isVanDonU1: u1Match, isAdminView, userBranch };
}
