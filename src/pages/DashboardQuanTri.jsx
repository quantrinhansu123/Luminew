import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import usePermissions from '../hooks/usePermissions';
import { useUserDepartment } from '../hooks/useUserDepartment';
import { supabase } from '../supabase/config';
import {
  DASHBOARD_GLOBAL_DATE_MESSAGE_TYPE,
  readDashboardGlobalDateRange,
  writeDashboardGlobalDateRange,
} from '../utils/dashboardGlobalDateRange';
import { isExecutiveDashboardAudience } from '../utils/executiveAccess';
import { getLastNDaysRangeLocal } from '../utils/nhanSuSaleLumiMoiLogic';
import DashboardQuanTriBaoCaoTongPanel from '../components/dashboard/DashboardQuanTriBaoCaoTongPanel';
import DashboardQuanTriBaoCaoCeoPanel from '../components/dashboard/DashboardQuanTriBaoCaoCeoPanel';

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

const IFRAME_BLANK = 'about:blank';

/** Tab Radix value → key nội bộ cho map src iframe */
const TAB_VALUE_TO_KEY = {
  sale: 'sale',
  mkt: 'mkt',
  cskh: 'cskh',
  'van-hanh': 'vh',
};

function scheduleIdleWork(fn, timeoutMs = 2500) {
  if (typeof requestIdleCallback !== 'undefined') {
    const id = requestIdleCallback(() => fn(), { timeout: timeoutMs });
    return () => cancelIdleCallback(id);
  }
  const t = setTimeout(fn, 64);
  return () => clearTimeout(t);
}

export default function DashboardQuanTri() {
  const { allowed, loading } = useDashboardQuanTriAllowed();
  const fallbackRange = useMemo(() => getLastNDaysRangeLocal(3), []);
  const storedGlobal = useMemo(() => readDashboardGlobalDateRange(), []);
  const [globalFrom, setGlobalFrom] = useState(() => storedGlobal?.from ?? fallbackRange.startDateStr);
  const [globalTo, setGlobalTo] = useState(() => storedGlobal?.to ?? fallbackRange.endDateStr);
  // Ưu tiên hiện tab "Báo cáo tổng" trước để tránh cảm giác "trắng" khi iframe bị chặn/redirect.
  const [activeTab, setActiveTab] = useState('tong-hop');
  const iframeSaleRef = useRef(null);
  const iframeMktRef = useRef(null);
  const iframeCskhRef = useRef(null);
  const iframeVhRef = useRef(null);
  const didAutoPickRangeRef = useRef(false);

  useLayoutEffect(() => {
    writeDashboardGlobalDateRange(globalFrom, globalTo);
  }, [globalFrom, globalTo]);

  /**
   * Nếu chưa có stored range: tự pick khoảng ngày theo dữ liệu mới nhất trong DB.
   * Tránh tình trạng mặc định 3 ngày gần nhất theo máy nhưng DB chưa có data → dashboard trống.
   */
  useEffect(() => {
    if (didAutoPickRangeRef.current) return;
    if (storedGlobal?.from && storedGlobal?.to) return;
    didAutoPickRangeRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const [saleMax, vanDonMax] = await Promise.all([
          supabase.from('sales_reports').select('date').order('date', { ascending: false }).limit(1),
          supabase.from('bao_cao_van_don').select('ngay').order('ngay', { ascending: false }).limit(1),
        ]);
        if (cancelled) return;

        const saleYmd = (Array.isArray(saleMax?.data) ? saleMax.data[0]?.date : saleMax?.data?.date) || null;
        const vdYmd = (Array.isArray(vanDonMax?.data) ? vanDonMax.data[0]?.ngay : vanDonMax?.data?.ngay) || null;

        const toYmd = String(saleYmd || vdYmd || '').slice(0, 10);
        if (!toYmd || toYmd.length < 10) return;

        const d = new Date(Number(toYmd.slice(0, 4)), Number(toYmd.slice(5, 7)) - 1, Number(toYmd.slice(8, 10)));
        if (Number.isNaN(d.getTime())) return;
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        start.setDate(start.getDate() - 2); // 3 days window
        const pad2 = (n) => String(n).padStart(2, '0');
        const fromYmd = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`;

        setGlobalFrom(fromYmd);
        setGlobalTo(toYmd);
      } catch {
        // ignore: fallbackRange đã set sẵn
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storedGlobal?.from, storedGlobal?.to]);

  useEffect(() => {
    const payload = { type: DASHBOARD_GLOBAL_DATE_MESSAGE_TYPE, from: globalFrom, to: globalTo };
    [iframeSaleRef, iframeMktRef, iframeCskhRef, iframeVhRef].forEach((r) => {
      try {
        r.current?.contentWindow?.postMessage(payload, '*');
      } catch {
        /* ignore */
      }
    });
  }, [globalFrom, globalTo]);

  const saleIframeSrc = useMemo(() => {
    const q = new URLSearchParams({ dashboard_from: globalFrom, dashboard_to: globalTo });
    return `/xem-bao-cao-sale?${q}`;
  }, [globalFrom, globalTo]);
  const cskhIframeSrc = useMemo(() => {
    const q = new URLSearchParams({ dashboard_from: globalFrom, dashboard_to: globalTo });
    return `/xem-bao-cao-cskh?${q}`;
  }, [globalFrom, globalTo]);
  const vanHanhIframeSrc = useMemo(() => {
    const q = new URLSearchParams({ from_date: globalFrom, to_date: globalTo });
    return `/bao-cao-van-hanh?${q}`;
  }, [globalFrom, globalTo]);
  const mktIframeSrc = useMemo(() => {
    const q = new URLSearchParams({ dashboard_from: globalFrom, dashboard_to: globalTo });
    return `/viewNsMoiNhanh.html?${q}`;
  }, [globalFrom, globalTo]);

  const urlsByKey = useMemo(
    () => ({
      sale: saleIframeSrc,
      mkt: mktIframeSrc,
      cskh: cskhIframeSrc,
      vh: vanHanhIframeSrc,
    }),
    [saleIframeSrc, mktIframeSrc, cskhIframeSrc, vanHanhIframeSrc]
  );

  const [iframeSrcByKey, setIframeSrcByKey] = useState(() => ({
    sale: IFRAME_BLANK,
    mkt: IFRAME_BLANK,
    cskh: IFRAME_BLANK,
    vh: IFRAME_BLANK,
  }));

  /** Ưu tiên tab đang xem: gán src thật trước khi paint nội dung. */
  useLayoutEffect(() => {
    const k = TAB_VALUE_TO_KEY[activeTab];
    if (!k) return;
    setIframeSrcByKey((prev) => ({
      ...prev,
      [k]: urlsByKey[k],
    }));
  }, [activeTab, urlsByKey]);

  /** Các tab còn lại: tải ngầm khi trình duyệt rảnh (sau tab đang mở). */
  useEffect(() => {
    let cancelled = false;
    const cancelSchedule = scheduleIdleWork(() => {
      if (cancelled) return;
      setIframeSrcByKey({
        sale: urlsByKey.sale,
        mkt: urlsByKey.mkt,
        cskh: urlsByKey.cskh,
        vh: urlsByKey.vh,
      });
    });
    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [urlsByKey]);

  const onTabChange = useCallback((value) => {
    setActiveTab(value);
    const k = TAB_VALUE_TO_KEY[value];
    if (k) {
      setIframeSrcByKey((prev) => ({
        ...prev,
        [k]: urlsByKey[k],
      }));
    }
  }, [urlsByKey]);

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
        Bạn không có quyền truy cập Dashboard quản trị (cần quyền lãnh đạo, nhóm Leader/Ban Giám đốc, hoặc đồng thời SALE_VIEW và MKT_VIEW).
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-2.75rem)] flex-col bg-slate-100">
      <header className="shrink-0 border-b border-slate-200 bg-white px-2 py-1 sm:px-3">
        <h1 className="text-sm font-semibold text-slate-900 sm:text-base">Dashboard quản trị</h1>
      </header>
      <Tabs value={activeTab} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-1">
        <div className="flex shrink-0 flex-wrap items-end gap-2">
          <TabsList className="grid h-auto min-w-0 max-w-6xl flex-1 grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-100/90 p-1 shadow-sm sm:grid-cols-3 md:grid-cols-6">
            <TabsTrigger value="sale" className="rounded-md border border-transparent py-1.5 text-xs font-semibold text-slate-600 shadow-none transition-all data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:text-sm">
              Báo cáo Sale
            </TabsTrigger>
            <TabsTrigger value="mkt" className="rounded-md border border-transparent py-1.5 text-xs font-semibold text-slate-600 shadow-none transition-all data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:text-sm">
              Báo cáo MKT
            </TabsTrigger>
            <TabsTrigger value="cskh" className="rounded-md border border-transparent py-1.5 text-xs font-semibold text-slate-600 shadow-none transition-all data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:text-sm">
              Báo cáo CSKH
            </TabsTrigger>
            <TabsTrigger value="van-hanh" className="rounded-md border border-transparent py-1.5 text-xs font-semibold text-slate-600 shadow-none transition-all data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:text-sm">
              Báo cáo vận hành
            </TabsTrigger>
            <TabsTrigger value="tong-hop" className="rounded-md border border-transparent py-1.5 text-xs font-semibold text-slate-600 shadow-none transition-all data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:text-sm">
              Báo cáo tổng
            </TabsTrigger>
            <TabsTrigger value="ceo" className="rounded-md border border-transparent py-1.5 text-xs font-semibold text-slate-600 shadow-none transition-all data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:text-sm">
              Báo cáo CEO
            </TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Khoảng ngày</span>
            <label className="flex items-center gap-1 text-xs text-slate-700">
              <span className="whitespace-nowrap">Từ</span>
              <input type="date" value={globalFrom} onChange={(e) => setGlobalFrom(e.target.value)} className="h-8 rounded border border-slate-200 px-1.5 text-xs text-slate-900" />
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-700">
              <span className="whitespace-nowrap">Đến</span>
              <input type="date" value={globalTo} onChange={(e) => setGlobalTo(e.target.value)} className="h-8 rounded border border-slate-200 px-1.5 text-xs text-slate-900" />
            </label>
          </div>
        </div>
        <div className="mt-1.5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <TabsContent value="sale" className="m-0 flex min-h-0 flex-1 flex-col p-0 outline-none ring-0 focus-visible:ring-0 data-[state=inactive]:hidden">
            <iframe ref={iframeSaleRef} title="Báo cáo Sale" src={iframeSrcByKey.sale} className="block min-h-[50vh] w-full flex-1 border-0 bg-white" />
          </TabsContent>
          <TabsContent value="mkt" className="m-0 flex min-h-0 flex-1 flex-col p-0 outline-none ring-0 focus-visible:ring-0 data-[state=inactive]:hidden">
            <iframe ref={iframeMktRef} title="Báo cáo MKT" src={iframeSrcByKey.mkt} className="block min-h-[50vh] w-full flex-1 border-0 bg-white" />
          </TabsContent>
          <TabsContent value="cskh" className="m-0 flex min-h-0 flex-1 flex-col p-0 outline-none ring-0 focus-visible:ring-0 data-[state=inactive]:hidden">
            <iframe ref={iframeCskhRef} title="Báo cáo CSKH" src={iframeSrcByKey.cskh} className="block min-h-[50vh] w-full flex-1 border-0 bg-white" />
          </TabsContent>
          <TabsContent value="van-hanh" className="m-0 flex min-h-0 flex-1 flex-col p-0 outline-none ring-0 focus-visible:ring-0 data-[state=inactive]:hidden">
            <iframe ref={iframeVhRef} title="Báo cáo vận hành" src={iframeSrcByKey.vh} className="block min-h-[50vh] w-full flex-1 border-0 bg-white" />
          </TabsContent>
          <TabsContent value="tong-hop" className="m-0 flex min-h-0 flex-1 flex-col p-0 outline-none ring-0 focus-visible:ring-0 data-[state=inactive]:hidden">
            <DashboardQuanTriBaoCaoTongPanel globalFrom={globalFrom} globalTo={globalTo} />
          </TabsContent>
          <TabsContent value="ceo" className="m-0 flex min-h-0 flex-1 flex-col p-0 outline-none ring-0 focus-visible:ring-0 data-[state=inactive]:hidden">
            <DashboardQuanTriBaoCaoCeoPanel globalFrom={globalFrom} globalTo={globalTo} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
