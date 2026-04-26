import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Báo cáo vận đơn nhân viên — phiên bản tích hợp SPA.
 *
 * Logic nghiệp vụ vẫn nằm trong các file HTML tĩnh (public/baocao-vandon-nv/*):
 * - Dữ liệu: đơn lẻ (bảng orders) qua /api/baocaoVandonNvData, map sang cột giống sheet F3.
 * - Khác trang /bao-cao-van-don: BaoCaoVanDon dùng bảng bao_cao_van_don (tổng hợp theo ngày/NV/SP/TT).
 *
 * Tab = iframe same-origin → giữ nguyên biểu đồ/lọc đã có; tránh fork hàng nghìn dòng vanilla JS.
 */
const TAB_IDS = ['tong-ket', 'ceo', 'chi-tiet', 'bo-phan', 'kpi'];
const DEFAULT_TAB = 'tong-ket';

const IFRAME_SRC = {
  'tong-ket': '/baocao-vandon-nv/baocaotongketvandontab1.html',
  ceo: '/baocao-vandon-nv/vandonCEO.html',
  'chi-tiet': '/baocao-vandon-nv/chitietvandon.html',
  'bo-phan': '/baocao-vandon-nv/Baocaovandontab3.html',
  kpi: '/baocao-vandon-nv/KPIVandon.html?view=vandon',
};

export default function BaoCaoVanDonNhanVien() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = TAB_IDS.includes(tabParam) ? tabParam : DEFAULT_TAB;

  const onTabChange = useCallback(
    (value) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', value);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const tabLabels = useMemo(
    () => ({
      'tong-ket': 'Tổng kết',
      ceo: 'Vận đơn CEO',
      'chi-tiet': 'Chi tiết vận đơn',
      'bo-phan': 'Sản phẩm & khu vực',
      kpi: 'KPI vận đơn',
    }),
    []
  );

  return (
    <div className="flex h-[calc(100vh-2.75rem)] flex-col bg-slate-100">
      <header className="shrink-0 border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-base font-semibold text-slate-900">Báo cáo vận đơn nhân viên</h1>
          <Link
            to="/bao-cao-van-don"
            className="rounded-md bg-emerald-50 px-2.5 py-1 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
          >
            Báo cáo vận đơn (Supabase, bảng tổng hợp)
          </Link>
        </div>
        <p className="mt-1 max-w-4xl text-xs leading-snug text-slate-600">
          Các tab dưới là báo cáo theo <strong>từng đơn</strong> (orders), cùng kiểu dữ liệu F3. Dev: chạy{' '}
          <code className="rounded bg-slate-100 px-1">npm run dev:full</code> để API proxy tới cổng 3002.
        </p>
      </header>

      <Tabs value={activeTab} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-1">
        <TabsList className="grid h-auto min-h-0 w-full max-w-5xl shrink-0 grid-cols-2 flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-100/90 p-1 shadow-sm sm:grid-cols-3 lg:grid-cols-5">
          {TAB_IDS.map((id) => (
            <TabsTrigger
              key={id}
              value={id}
              className="rounded-md border border-transparent py-1.5 text-xs font-semibold text-slate-600 shadow-none data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:text-sm"
            >
              {tabLabels[id]}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-1.5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {TAB_IDS.map((id) => (
            <TabsContent
              key={id}
              value={id}
              className="m-0 flex min-h-0 flex-1 flex-col p-0 outline-none data-[state=inactive]:hidden"
            >
              <iframe
                title={tabLabels[id]}
                src={IFRAME_SRC[id]}
                className="block min-h-[50vh] w-full flex-1 border-0 bg-white"
              />
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}
