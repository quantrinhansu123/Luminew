import { useEffect, useMemo } from 'react';
import usePermissions from '../hooks/usePermissions';
import { MKT_HN_LEGACY_PERSONNEL_SCOPE_KEY } from './XemBaoCaoMKTLegacy';
import {
  MKT_HCM_LEGACY_PERSONNEL_SCOPE_KEY,
  MKT_HCM_PERSONNEL_MSG_TYPE,
} from './XemBaoCaoMKTHcm';

function writeSkipPersonnelScope(storageKey) {
  const payload = JSON.stringify({
    v: 1,
    skipPersonnelFilter: true,
    allowedNames: [],
    ts: Date.now(),
    source: 'xem-bao-cao-mkt-hn-hcm',
  });
  try {
    localStorage.setItem(storageKey, payload);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(storageKey, payload);
  } catch {
    /* ignore */
  }
}

/**
 * View riêng: báo cáo MKT HN/HCM — 1 bảng, lọc Chi nhánh, bộ lọc thanh ngang trên.
 * Route: `/xem-bao-cao-mkt-hn-hcm`
 */
export default function XemBaoCaoMktHnHcm() {
  const { canView } = usePermissions();
  const hasAccess = ['MKT_VIEW', 'MKT_VIEW_HCM', 'MKT_INPUT', 'DASHBOARD_QUAN_TRI', 'FINANCE_DASHBOARD'].some(
    (code) => canView(code)
  );

  useEffect(() => {
    writeSkipPersonnelScope(MKT_HN_LEGACY_PERSONNEL_SCOPE_KEY);
    writeSkipPersonnelScope(MKT_HCM_LEGACY_PERSONNEL_SCOPE_KEY);
  }, []);

  const iframeSrc = useMemo(() => {
    const q = new URLSearchParams();
    q.set('dual', '1');
    q.set('topBar', '1');
    return `/viewNsMoiNhanh.html?${q.toString()}`;
  }, []);

  const onIframeLoad = (e) => {
    const w = e.currentTarget?.contentWindow;
    if (!w) return;
    try {
      w.postMessage(
        {
          source: 'luminew-host',
          type: MKT_HCM_PERSONNEL_MSG_TYPE,
          v: 1,
          skipPersonnelFilter: true,
          allowedNames: [],
          ts: Date.now(),
        },
        '*'
      );
    } catch {
      /* ignore */
    }
  };

  if (!hasAccess) {
    return (
      <div className="p-8 text-center font-bold text-red-600">
        Bạn không có quyền truy cập trang này (MKT_VIEW / MKT_VIEW_HCM).
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] w-full overflow-hidden bg-[#f4f7fb]">
      <iframe
        src={iframeSrc}
        className="h-full w-full border-0"
        title="Báo cáo MKT HN / HCM"
        onLoad={onIframeLoad}
      />
    </div>
  );
}
