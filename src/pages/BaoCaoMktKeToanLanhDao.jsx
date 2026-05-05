import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import usePermissions from '../hooks/usePermissions';
import { useUserDepartment } from '../hooks/useUserDepartment';
import { isExecutiveDashboardAudience } from '../utils/executiveAccess';

function useMktKeToanLanhDaoAccess() {
  const { canView, loading: permLoading, role: dbRoleCode } = usePermissions();
  const { department, loading: deptLoading } = useUserDepartment();

  const allowed = useMemo(() => {
    if (
      canView('MKT_VIEW') ||
      canView('MKT_VIEW_HCM') ||
      canView('MKT_INPUT') ||
      canView('MKT_INPUT_HCM') ||
      canView('FINANCE_DASHBOARD') ||
      canView('DASHBOARD_QUAN_TRI')
    ) {
      return true;
    }
    return isExecutiveDashboardAudience(department, dbRoleCode);
  }, [canView, department, dbRoleCode]);

  return { allowed, loading: permLoading || deptLoading };
}

function buildLinks(isHcm) {
  if (isHcm) {
    return [
      { to: '/xem-bao-cao-mkt-hcm', label: 'Xem báo cáo MKT (HCM)', external: false },
      { to: '/bao-cao-chi-tiet-hcm', label: 'Báo cáo chi tiết đơn (HCM)', external: false },
      { to: '/danh-sach-bao-cao-tay-mkt-hcm', label: 'Danh sách báo cáo tay MKT (HCM)', external: false },
      { to: '/bao-cao-marketing-hcm', label: 'Nhập báo cáo MKT (HCM)', external: false },
    ];
  }
  return [
    { to: '/xem-bao-cao-mkt', label: 'Xem báo cáo MKT (tổng hợp)', external: false },
    { to: '/bao-cao-chi-tiet', label: 'Báo cáo chi tiết đơn', external: false },
    { to: '/danh-sach-bao-cao-tay-mkt', label: 'Danh sách báo cáo tay MKT', external: false },
    { to: '/bao-cao-marketing', label: 'Nhập báo cáo MKT', external: false },
  ];
}

const SHARED_LINKS = [
  { to: '/hieu-qua-mkt', label: 'Hiệu quả Marketing', external: false },
  { to: '/bao-cao-hieu-suat-kpi', label: 'Báo cáo hiệu suất KPI', external: false },
  { to: '/bao-cao-van-don', label: 'Báo cáo vận đơn', external: false },
  { to: '/finance-dashboard', label: 'Finance Manager (tài chính)', external: false },
  { to: '/dashboard-quan-tri', label: 'Dashboard quản trị (Sale / MKT / CSKH / VH)', external: false },
];

export default function BaoCaoMktKeToanLanhDao() {
  const [searchParams] = useSearchParams();
  const isHcm = searchParams.get('chi_nhanh') === 'hcm';
  const { allowed, loading } = useMktKeToanLanhDaoAccess();

  const branchLinks = useMemo(() => [...buildLinks(isHcm), ...SHARED_LINKS], [isHcm]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 text-center text-slate-600">Đang kiểm tra quyền…</div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 text-center text-red-600">
        Bạn không có quyền xem trang này. Cần quyền xem/nhập MKT, Finance, Dashboard quản trị, hoặc nhóm lãnh
        đạo/BGĐ.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Về trang chủ
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Báo cáo MKT</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">
            Kế toán &amp; Lãnh đạo
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Trang tổng hợp nhanh các báo cáo liên quan Marketing — dùng cho đối soát, tổng hợp và ra quyết định.
            Chọn chi nhánh bằng tham số URL <code className="rounded bg-slate-100 px-1">?chi_nhanh=hcm</code> khi cần
            luồng HCM.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              to="/bao-cao-mkt-ke-toan-lanh-dao"
              className={`rounded-full px-3 py-1 text-xs font-semibold ${!isHcm ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
            >
              Hà Nội / mặc định
            </Link>
            <Link
              to="/bao-cao-mkt-ke-toan-lanh-dao?chi_nhanh=hcm"
              className={`rounded-full px-3 py-1 text-xs font-semibold ${isHcm ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
            >
              HCM
            </Link>
          </div>

          <ul className="mt-8 space-y-2">
            {branchLinks.map(({ to, label }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 transition hover:border-amber-300 hover:bg-amber-50"
                >
                  <span>{label}</span>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-8 text-xs text-slate-500">
            Gợi ý: có thể ghim URL này trên Dashboard quản trị hoặc gửi trực tiếp cho Kế toán / Ban Giám đốc.
          </p>
        </div>
      </div>
    </div>
  );
}
