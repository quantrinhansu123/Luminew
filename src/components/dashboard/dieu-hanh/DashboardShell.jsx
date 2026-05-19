import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import FilterBar from './FilterBar';
import './dashboardDieuHanh.css';

export default function DashboardShell({ children, errors, filterProps, loading }) {
  return (
    <div className="lumi-dieu-hanh min-h-screen px-3 py-3 sm:px-4 lg:px-5">
      <div className="mx-auto max-w-[1560px]">
        <div className="lumi-dieu-hanh-topbar sticky top-0 z-20 mb-3 flex flex-col gap-3 rounded-lg px-3 py-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="lumi-dieu-hanh-logo flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-black">LUMI</div>
            <div className="min-w-0">
              <Link to="/" className="mb-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#69768c] hover:text-[#2864d9]">
                <ArrowLeft className="h-3.5 w-3.5" />
                Home
              </Link>
              <h1 className="truncate text-base font-black tracking-normal text-[#202534]">
                Dashboard <span className="bg-gradient-to-r from-[#44c5b6] via-[#2fb5d6] to-[#2864d9] bg-clip-text text-transparent">điều hành</span>
              </h1>
            </div>
          </div>
          <FilterBar {...filterProps} loading={loading} />
        </div>

        {errors?.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            {errors.map((err) => (
              <div key={err}>{err}</div>
            ))}
          </div>
        )}

        {children}

        {loading && (
          <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-lg">
            Đang tải Dashboard điều hành...
          </div>
        )}
      </div>
    </div>
  );
}
