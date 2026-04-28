import { Navigate, useLocation } from 'react-router-dom';
import XemBaoCaoMKTLegacy from './XemBaoCaoMKTLegacy';

export default function XemBaoCaoMKTRnD() {
  const location = useLocation();
  const params = new URLSearchParams(location.search || '');
  if (!params.get('team') || params.get('rdProductsOnly') !== '1') {
    params.set('team', 'RD');
    params.set('rdProductsOnly', '1');
    return <Navigate to={`${location.pathname}?${params.toString()}`} replace />;
  }

  return (
    <XemBaoCaoMKTLegacy
      accessPermissionCode="RND_VIEW"
      iframeTitle="Xem báo cáo MKT R&D (viewNsMoiNhanh.html)"
    />
  );
}
