import { RefreshCw } from 'lucide-react';
import { BRANCHES, DEPARTMENTS } from '../../../utils/dashboardDieuHanhMetrics';
import SearchableFilterSelect from './SearchableFilterSelect';

export default function FilterBar({
  activeTab,
  periodMode,
  setPeriodMode,
  periodKey,
  setPeriodKey,
  periodOptions,
  branch,
  setBranch,
  market,
  setMarket,
  marketOptions,
  product,
  setProduct,
  productOptions,
  department,
  setDepartment,
  person,
  setPerson,
  personOptions,
  from,
  setFrom,
  to,
  setTo,
  onReload,
  loading,
}) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-[#e2eaf4] bg-white/85 p-2 shadow-sm md:grid-cols-6 xl:grid-cols-8">
      <label className="text-[10px] font-black uppercase tracking-wide text-[#2864d9]">
        Chu kỳ
        <select value={periodMode} onChange={(e) => setPeriodMode(e.target.value)} className="mt-1 h-8 w-full rounded-md border px-2 text-xs">
          <option value="week">Tuần</option>
          <option value="month">Tháng</option>
        </select>
      </label>

      <label className="text-[10px] font-black uppercase tracking-wide text-[#2864d9]">
        {periodMode === 'week' ? 'Chọn tuần' : 'Chọn tháng'}
        <select value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} className="mt-1 h-8 w-full rounded-md border px-2 text-xs">
          {periodOptions.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </label>

      <SearchableFilterSelect
        label="Chi nhánh"
        value={branch}
        onChange={setBranch}
        options={BRANCHES}
        allLabel="Tổng"
        placeholder="Tìm chi nhánh..."
      />

      <SearchableFilterSelect
        label="Khu vực"
        value={market}
        onChange={setMarket}
        options={marketOptions}
        placeholder="Tìm khu vực..."
      />

      <SearchableFilterSelect
        label="Mặt hàng"
        value={product}
        onChange={setProduct}
        options={productOptions}
        placeholder="Tìm mặt hàng..."
      />

      {activeTab !== 'company' && (
        <SearchableFilterSelect
          label="Bộ phận"
          value={department}
          onChange={setDepartment}
          options={DEPARTMENTS}
          placeholder="Tìm bộ phận..."
        />
      )}

      {activeTab === 'individual' && (
        <SearchableFilterSelect
          label="Cá nhân"
          value={person}
          onChange={setPerson}
          options={personOptions}
          placeholder="Tìm cá nhân..."
        />
      )}

      <label className="hidden text-[10px] font-black uppercase tracking-wide text-[#2864d9]">
        Từ ngày
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-8 w-full rounded-md border px-2 text-xs" />
      </label>
      <label className="hidden text-[10px] font-black uppercase tracking-wide text-[#2864d9]">
        Đến ngày
        <div className="mt-1 flex gap-2">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border px-2 text-xs" />
          <button
            type="button"
            onClick={onReload}
            disabled={loading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-r from-[#2864d9] to-[#55dbe8] text-white shadow-sm hover:brightness-105 disabled:bg-slate-400"
            title="Tải lại dữ liệu"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </label>
      <div className="flex items-end">
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-[#2864d9] to-[#55dbe8] px-3 text-xs font-black text-white shadow-sm hover:brightness-105 disabled:bg-slate-400"
          title="Tải lại dữ liệu"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Tải lại
        </button>
      </div>
    </div>
  );
}
