import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import usePermissions from '../hooks/usePermissions';

/** Team HCM — Đức Anh (khớp cột `Team` trên detail_reports). */
export const XEM_BAO_CAO_MKT_HCM_TEAM = 'MKT - Đức Anh';

/**
 * @param {object} props
 * @param {boolean} [props.embedded]
 * @param {string[] | null} [props.iframeAllowedTeams] — nếu có: iframe kèm ?allowedTeams=... (không ghép location.search)
 * @param {string} [props.iframeTitle]
 */
export default function XemBaoCaoMKTLegacy({
  embedded = false,
  iframeAllowedTeams = null,
  iframeTitle = 'Xem báo cáo MKT (viewNsMoiNhanh.html)',
} = {}) {
  const location = useLocation();
  const { canView } = usePermissions();

  const usesIframeTeamFilter =
    iframeAllowedTeams != null && Array.isArray(iframeAllowedTeams) && iframeAllowedTeams.length > 0;

  const hasAccess = usesIframeTeamFilter
    ? canView('MKT_VIEW_HCM') || canView('MKT_VIEW')
    : canView('MKT_VIEW');

  const iframeSrc = useMemo(() => {
    const base = '/viewNsMoiNhanh.html';
    if (usesIframeTeamFilter) {
      const qs = new URLSearchParams();
      iframeAllowedTeams.forEach((t) => qs.append('allowedTeams', t));
      return `${base}?${qs.toString()}`;
    }
    return `${base}${location.search || ''}`;
  }, [iframeAllowedTeams, location.search, usesIframeTeamFilter]);

  if (!hasAccess) {
    const codes = usesIframeTeamFilter ? 'MKT_VIEW_HCM hoặc MKT_VIEW' : 'MKT_VIEW';
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        Bạn không có quyền truy cập trang này ({codes}).
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
