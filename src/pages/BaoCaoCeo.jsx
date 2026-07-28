import { useEffect, useMemo, useState } from 'react';
import usePermissions from '../hooks/usePermissions';
import { useUserDepartment } from '../hooks/useUserDepartment';
import { isExecutiveDashboardAudience } from '../utils/executiveAccess';
import { getLastNDaysRangeLocal } from '../utils/nhanSuSaleLumiMoiLogic';
import {
  readDashboardGlobalDateRange,
  writeDashboardGlobalDateRange,
} from '../utils/dashboardGlobalDateRange';
import DashboardQuanTriBaoCaoCeoPanel from '../components/dashboard/DashboardQuanTriBaoCaoCeoPanel';

function useBaoCaoCeoAllowed() {
  const { canView, loading: permLoading, role: dbRoleCode } = usePermissions();
  const { department, loading: deptLoading } = useUserDepartment();
  return useMemo(() => {
    const userRole = (localStorage.getItem('userRole') || '').toLowerCase();
    const isAdminOrLeadership = ['admin', 'leader', 'director', 'boss', 'manager', 'administrator', 'super_admin'].includes(userRole);
    const allowed =
      isAdminOrLeadership ||
      canView('BAO_CAO_CEO') ||
      (canView('SALE_VIEW') && canView('MKT_VIEW')) ||
      isExecutiveDashboardAudience(department, dbRoleCode);
    return { allowed, loading: permLoading || deptLoading };
  }, [canView, department, dbRoleCode, permLoading, deptLoading]);
}

export default function BaoCaoCeo() {
  const { allowed, loading } = useBaoCaoCeoAllowed();
  const fallbackRange = useMemo(() => getLastNDaysRangeLocal(3), []);
  const storedGlobal = useMemo(() => readDashboardGlobalDateRange(), []);
  const [from, setFrom] = useState(() => storedGlobal?.from ?? fallbackRange.startDateStr);
  const [to, setTo] = useState(() => storedGlobal?.to ?? fallbackRange.endDateStr);

  useEffect(() => {
    writeDashboardGlobalDateRange(from, to);
  }, [from, to]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-600">
        Đang kiểm tra quyền…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="p-8 text-center font-medium text-red-600">
        Bạn không có quyền truy cập Báo cáo CEO (cần quyền lãnh đạo, nhóm Leader/Ban Giám đốc, hoặc đồng thời SALE_VIEW và
        MKT_VIEW).
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] min-h-0 w-full min-w-0 overflow-x-hidden box-border">
      <DashboardQuanTriBaoCaoCeoPanel
        globalFrom={from}
        globalTo={to}
        onChangeFrom={setFrom}
        onChangeTo={setTo}
      />
    </div>
  );
}

