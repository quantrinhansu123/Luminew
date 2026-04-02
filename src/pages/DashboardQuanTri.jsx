import { useMemo } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import usePermissions from '../hooks/usePermissions';

function useDashboardQuanTriAllowed() {
  const { canView } = usePermissions();
  return useMemo(() => {
    const userRole = (localStorage.getItem('userRole') || '').toLowerCase();
    const isAdminOrLeadership = ['admin', 'leader', 'director', 'boss', 'manager'].includes(userRole);
    return isAdminOrLeadership || (canView('SALE_VIEW') && canView('MKT_VIEW'));
  }, [canView]);
}

export default function DashboardQuanTri() {
  const allowed = useDashboardQuanTriAllowed();

  if (!allowed) {
    return (
      <div className="p-8 text-center text-red-600 font-medium">
        Bạn không có quyền truy cập Dashboard quản trị (cần quyền lãnh đạo hoặc đồng thời SALE_VIEW và MKT_VIEW).
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-100">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-slate-900">Dashboard quản trị</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Báo cáo Sale và MKT (HTML nhúng). Tab &quot;Báo cáo vận hành&quot; mở cùng route{' '}
          <code className="rounded bg-slate-100 px-1 text-xs">/bao-cao-van-hanh</code>.
        </p>
      </header>

      <Tabs defaultValue="sale" className="flex flex-1 flex-col min-h-0 px-3 pb-3 pt-2">
        <TabsList className="grid h-auto w-full max-w-4xl shrink-0 grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-100/90 p-1.5 shadow-sm">
          <TabsTrigger
            value="sale"
            className="rounded-lg border border-transparent py-3 text-sm font-semibold text-slate-600 shadow-none transition-all data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-md"
          >
            Báo cáo Sale
          </TabsTrigger>
          <TabsTrigger
            value="mkt"
            className="rounded-lg border border-transparent py-3 text-sm font-semibold text-slate-600 shadow-none transition-all data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-md"
          >
            Báo cáo MKT
          </TabsTrigger>
          <TabsTrigger
            value="van-hanh"
            className="rounded-lg border border-transparent py-3 text-sm font-semibold text-slate-600 shadow-none transition-all data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-md"
          >
            Báo cáo vận hành
          </TabsTrigger>
        </TabsList>

        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <TabsContent
            value="sale"
            className="m-0 flex min-h-0 flex-1 flex-col p-0 outline-none ring-0 focus-visible:ring-0 data-[state=inactive]:hidden"
          >
            <iframe
              title="Báo cáo Sale — nhanSuSaleLumiMoi.html"
              src="/nhanSuSaleLumiMoi.html"
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
