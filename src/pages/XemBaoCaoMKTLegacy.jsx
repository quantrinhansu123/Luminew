import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import usePermissions from '../hooks/usePermissions';

export default function XemBaoCaoMKTLegacy({ embedded = false }) {
  const location = useLocation();
  const { canView } = usePermissions();

  const iframeSrc = useMemo(() => {
    return `/viewNsMoiNhanh.html${location.search || ''}`;
  }, [location.search]);

  if (!canView('MKT_VIEW')) {
    return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này (MKT_VIEW).</div>;
  }

  return (
    <div
      className={`w-full overflow-hidden bg-white ${embedded ? 'h-screen' : 'h-[calc(100vh-64px)]'}`}
    >
      <iframe
        src={iframeSrc}
        className="w-full h-full border-none"
        title="Xem báo cáo MKT (viewNsMoiNhanh.html)"
      />
    </div>
  );
}
