import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import usePermissions from '../hooks/usePermissions';

export default function XemBaoCaoMKTLegacy() {
  const location = useLocation();
  const { canView } = usePermissions();

  const iframeSrc = useMemo(() => {
    return `/viewNsMoiNhanh.html${location.search || ''}`;
  }, [location.search]);

  if (!canView('MKT_VIEW')) {
    return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này (MKT_VIEW).</div>;
  }

  return (
    <div className="w-full h-[calc(100vh-64px)] overflow-hidden bg-white">
      <iframe
        src={iframeSrc}
        className="w-full h-full border-none"
        title="Xem Bao Cao MKT Legacy"
      />
    </div>
  );
}
