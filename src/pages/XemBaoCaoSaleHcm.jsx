import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import usePermissions from '../hooks/usePermissions';

/** View cũ HCM — tách biệt React HN (`NhanSuSaleLumiMoiView`). */
export const SALE_HCM_LEGACY_HTML = '/nhanSuSaleLumiMoi-HCM.html';

/**
 * `/xem-bao-cao-sale-hcm` — iframe `nhanSuSaleLumiMoi-HCM.html` (sale_report_hcm).
 * Không dùng view React mới của `/xem-bao-cao-sale` (HN).
 */
export default function XemBaoCaoSaleHcm({ embedded = false } = {}) {
  const { canView } = usePermissions();
  const [searchParams] = useSearchParams();
  const hasAccess = ['SALE_VIEW_HCM', 'DASHBOARD_QUAN_TRI', 'FINANCE_DASHBOARD'].some((code) =>
    canView(code)
  );

  const iframeSrc = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set('v', '20260817ds');
    const idFromQuery = String(searchParams.get('id') || '').trim();
    const idFromStorage =
      typeof window !== 'undefined' ? String(localStorage.getItem('idAppsheet') || '').trim() : '';
    const id = idFromQuery || idFromStorage;
    if (id) qs.set('id', id);
    return `${SALE_HCM_LEGACY_HTML}?${qs.toString()}`;
  }, [searchParams]);

  if (!hasAccess) {
    return (
      <div className="p-8 text-center font-bold text-red-600">
        Bạn không có quyền truy cập trang này (SALE_VIEW_HCM).
      </div>
    );
  }

  return (
    <div
      className={`w-full overflow-hidden bg-[#f8f9fa] ${
        embedded ? 'h-screen' : 'h-[calc(100vh-64px)]'
      }`}
    >
      <iframe
        src={iframeSrc}
        className="h-full w-full border-none"
        title="Xem báo cáo Sale HCM (nhanSuSaleLumiMoi-HCM)"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
