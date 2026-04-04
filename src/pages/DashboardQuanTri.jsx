import { useMemo } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import usePermissions from '../hooks/usePermissions';
import { useUserDepartment } from '../hooks/useUserDepartment';
import { isExecutiveDashboardAudience } from '../utils/executiveAccess';

function useDashboardQuanTriAllowed() {
  const { canView, loading: permLoading, role: dbRoleCode } = usePermissions();
  const { department, loading: deptLoading } = useUserDepartment();
  const gate = useMemo(() => {
    const userRole = (localStorage.getItem('userRole') || '').toLowerCase();
    const isAdminOrLeadership = ['admin', 'leader', 'director', 'boss', 'manager', 'administrator', 'super_admin'].includes(userRole);
    const allowed =
      isAdminOrLeadership ||
      (canView('SALE_VIEW') && canView('MKT_VIEW')) ||
      isExecutiveDashboardAudience(department, dbRoleCode);
    return { allowed, loading: permLoading || deptLoading };
  }, [canView, department, dbRoleCode, permLoading, deptLoading]);

  return gate;
}

export default function DashboardQuanTri() {
  const { allowed, loading } = useDashboardQuanTriAllowed();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-600">
        Đang kiểm tra quyền…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="p-8 text-center text-red-600 font-medium">
        Bạn không có quyền truy cập Dashboard quản trị (cần quyền lãnh đạo, nhóm Leader/Ban Giám đốc, hoặc đồng thời SALE_VIEW và MKT_VIEW).
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-2.75rem)] flex-col bg-slate-100">
      <header className="shrink-0 border-b border-slate-200 bg-white px-2 py-1 sm:px-3">
        <h1 className="text-sm font-semibold text-slate-900 sm:text-base">Dashboard quản trị</h1>
      </header>

      <Tabs defaultValue="sale" className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-1">
        <TabsList className="grid h-auto w-full max-w-5xl shrink-0 grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-100/90 p-1 shadow-sm sm:grid-cols-4">
          <TabsTrigger
            value="sale"
            className="rounded-md border border-transparent py-1.5 text-xs font-semibold text-slate-600 shadow-none transition-all data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:text-sm"
          >
            Báo cáo Sale
          </TabsTrigger>
          <TabsTrigger
            value="mkt"
            className="rounded-md border border-transparent py-1.5 text-xs font-semibold text-slate-600 shadow-none transition-all data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:text-sm"
          >
            Báo cáo MKT
          </TabsTrigger>
          <TabsTrigger
            value="cskh"
            className="rounded-md border border-transparent py-1.5 text-xs font-semibold text-slate-600 shadow-none transition-all data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:text-sm"
          >
            Báo cáo CSKH
          </TabsTrigger>
          <TabsTrigger
            value="van-hanh"
            className="rounded-md border border-transparent py-1.5 text-xs font-semibold text-slate-600 shadow-none transition-all data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:text-sm"
          >
            Báo cáo vận hành
          </TabsTrigger>
        </TabsList>

        <div className="mt-1.5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <TabsContent
            value="sale"
            className="m-0 flex min-h-0 flex-1 flex-col p-0 outline-none ring-0 focus-visible:ring-0 data-[state=inactive]:hidden"
          >
            <iframe
              title="Báo cáo Sale — /xem-bao-cao-sale"
              src="/xem-bao-cao-sale"
              className="block min-h-[50vh] w-full flex-1 border-0 bg-white"
            />
          </TabsContent>
          <TabsContent
            value="mkt"
            className="m-0 flex min-h-0 flex-1 flex-col p-0 outline-none ring-0 focus-visible:ring-0 data-[state=inactive]:hidden"
          >
            <iframe
              title="Báo cáo MKT — viewNsMoiNhanh.html"
              src="/viewNsMoiNhanh.html"
              className="block min-h-[50vh] w-full flex-1 border-0 bg-white"
            />
          </TabsContent>
          <TabsContent
            value="cskh"
            className="m-0 flex min-h-0 flex-1 flex-col p-0 outline-none ring-0 focus-visible:ring-0 data-[state=inactive]:hidden"
          >
            <iframe
              title="Báo cáo CSKH — /xem-bao-cao-cskh"
              src="/xem-bao-cao-cskh"
              className="block min-h-[50vh] w-full flex-1 border-0 bg-white"
            />
          </TabsContent>
          <TabsContent
            value="van-hanh"
            className="m-0 flex min-h-0 flex-1 flex-col p-0 outline-none ring-0 focus-visible:ring-0 data-[state=inactive]:hidden"
          >
            <iframe
              title="Báo cáo vận hành — /bao-cao-van-hanh"
              src="/bao-cao-van-hanh"
              className="block min-h-[50vh] w-full flex-1 border-0 bg-white"
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
