import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import usePermissions from '../hooks/usePermissions';
import * as rbacService from '../services/rbacService';

/** Khớp iframe `viewNsMoiNhanh-HCM.html` — phạm vi nhân sự (selected_personnel + leader/self qua getSelectedPersonnel). */
export const MKT_HCM_LEGACY_PERSONNEL_SCOPE_KEY = 'luminew.mktHcmLegacy.scope';

/** Team HCM — Đức Anh (khớp cột `Team` trên detail_reports). */
export const XEM_BAO_CAO_MKT_HCM_TEAM = 'MKT - Đức Anh';

/**
 * @param {object} props
 * @param {boolean} [props.embedded]
 * @param {string} [props.legacyHtmlPath] — đường dẫn file legacy trong public (vd. `/viewNsMoiNhanh-HCM.html`)
 * @param {string[] | null} [props.iframeAllowedTeams] — nếu có: iframe kèm ?allowedTeams=... (không ghép location.search)
 * @param {string} [props.iframeTitle]
 */
export default function XemBaoCaoMKTLegacy({
  embedded = false,
  legacyHtmlPath = '/viewNsMoiNhanh.html',
  iframeAllowedTeams = null,
  iframeTitle = 'Xem báo cáo MKT (viewNsMoiNhanh.html)',
} = {}) {
  const location = useLocation();
  const { canView, role } = usePermissions();

  const usesIframeTeamFilter =
    iframeAllowedTeams != null && Array.isArray(iframeAllowedTeams) && iframeAllowedTeams.length > 0;

  const hasAccess = usesIframeTeamFilter ? canView('MKT_VIEW_HCM') : canView('MKT_VIEW');

  const [hcmPersonnelGate, setHcmPersonnelGate] = useState(() => !usesIframeTeamFilter);

  useEffect(() => {
    if (!usesIframeTeamFilter) {
      setHcmPersonnelGate(true);
      return undefined;
    }

    let cancelled = false;

    const writeHcmScope = async () => {
      const roleFromHook = (role || '').toUpperCase();
      const roleFromStorage = (localStorage.getItem('userRole') || '').toLowerCase();
      let userObj = null;
      try {
        const userJson = localStorage.getItem('user');
        userObj = userJson ? JSON.parse(userJson) : null;
      } catch {
        userObj = null;
      }
      const roleFromUserObj = (userObj?.role || '').toLowerCase();
      const roleFromHookLower = (roleFromHook || '').toLowerCase();

      const isAdmin =
        roleFromHookLower === 'admin' ||
        roleFromHookLower === 'super_admin' ||
        roleFromHookLower === 'finance' ||
        roleFromStorage === 'admin' ||
        roleFromStorage === 'super_admin' ||
        roleFromStorage === 'finance' ||
        roleFromUserObj === 'admin' ||
        roleFromUserObj === 'super_admin' ||
        roleFromUserObj === 'finance';

      let skipPersonnelFilter = isAdmin;
      let allowedNames = [];

      if (!skipPersonnelFilter) {
        const userEmail = (localStorage.getItem('userEmail') || '').toLowerCase().trim();
        if (userEmail) {
          try {
            const personnelMap = await rbacService.getSelectedPersonnel([userEmail]);
            const personnelNames = personnelMap[userEmail] || [];
            allowedNames = personnelNames.filter((name) => {
              const nameStr = String(name).trim();
              return nameStr.length > 0 && !nameStr.includes('@');
            });
          } catch (e) {
            console.error('[XemBaoCaoMKTLegacy] getSelectedPersonnel:', e);
            allowedNames = [];
          }
        }
      }

      if (cancelled) return;

      try {
        sessionStorage.setItem(
          MKT_HCM_LEGACY_PERSONNEL_SCOPE_KEY,
          JSON.stringify({
            v: 1,
            skipPersonnelFilter,
            allowedNames,
            ts: Date.now(),
          })
        );
      } catch (e) {
        console.error('[XemBaoCaoMKTLegacy] sessionStorage scope:', e);
      }
      setHcmPersonnelGate(true);
    };

    setHcmPersonnelGate(false);
    writeHcmScope();

    return () => {
      cancelled = true;
    };
  }, [usesIframeTeamFilter, role]);

  const iframeSrc = useMemo(() => {
    const base = legacyHtmlPath;
    if (usesIframeTeamFilter) {
      const qs = new URLSearchParams();
      iframeAllowedTeams.forEach((t) => qs.append('allowedTeams', t));
      return `${base}?${qs.toString()}`;
    }
    return `${base}${location.search || ''}`;
  }, [iframeAllowedTeams, legacyHtmlPath, location.search, usesIframeTeamFilter]);

  if (!hasAccess) {
    const codes = usesIframeTeamFilter ? 'MKT_VIEW_HCM' : 'MKT_VIEW';
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        Bạn không có quyền truy cập trang này ({codes}).
      </div>
    );
  }

  if (usesIframeTeamFilter && !hcmPersonnelGate) {
    return (
      <div
        className={`w-full flex items-center justify-center bg-white text-gray-600 ${
          embedded ? 'h-screen' : 'h-[calc(100vh-64px)]'
        }`}
      >
        Đang tải phạm vi nhân sự…
      </div>
    );
  }

  return (
    <div
      className={`w-full overflow-hidden bg-white ${embedded ? 'h-screen' : 'h-[calc(100vh-64px)]'}`}
    >
      <iframe
        src={iframeSrc}
        className="w-full h-full border-none"
        title={iframeTitle}
      />
    </div>
  );
}
