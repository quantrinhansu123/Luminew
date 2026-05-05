import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../supabase/config';
import { aggregateVanHanhSlice, formatPct, formatSlVi } from '../../utils/baoCaoVanDonMarketMatrix';

const PAGE_SIZE = 1000;
const MAX_PAGES = 80;

function parseYmd(s) {
  const p = String(s || '').slice(0, 10);
  const [y, m, d] = p.split('-').map((x) => Number(x));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Thứ Hai đầu tuần (local) — gom «theo tuần». */
function mondayOfWeekYmd(ymd) {
  const d = parseYmd(ymd);
  if (!d) return '—';
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  const y = mon.getFullYear();
  const mo = String(mon.getMonth() + 1).padStart(2, '0');
  const dd = String(mon.getDate()).padStart(2, '0');
  return `${y}-${mo}-${dd}`;
}

function bucketKeyForRow(ngayRaw, granularity) {
  const ymd =
    typeof ngayRaw === 'string'
      ? ngayRaw.slice(0, 10)
      : ngayRaw instanceof Date
        ? ngayRaw.toISOString().slice(0, 10)
        : '';
  if (!ymd || ymd.length < 10) return 'Không rõ';
  if (granularity === 'day') return ymd;
  if (granularity === 'month') return ymd.slice(0, 7);
  return mondayOfWeekYmd(ymd);
}

function mapBaoCaoVanDonRowToVirtual(row) {
  const ymd = typeof row.ngay === 'string' ? row.ngay.slice(0, 10) : '';
  const amt = Number(row.tong_tien_vnd ?? row.tong_tien_VND ?? 0) || 0;
  return {
    _source: 'bao_cao',
    id: row.id,
    _ket_qua_check: row.ket_qua_check,
    _trang_thai_giao_hang: row.trang_thai_giao_hang,
    _trang_thai_thanh_toan: row.trang_thai_thanh_toan,
    _tien_trang_thai_thanh_toan: row.tien_trang_thai_thanh_toan ?? {},
    _tong_tien_vnd: amt,
    'khu vực': String(row.thi_truong ?? '').trim() || 'Không xác định',
    'Ngày lên đơn': ymd,
  };
}

export default function DashboardQuanTriBaoCaoTongPanel({ globalFrom, globalTo }) {
  const [granularity, setGranularity] = useState('day');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!globalFrom || !globalTo) return;
    if (globalFrom > globalTo) {
      setError('Từ ngày phải ≤ Đến ngày.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const all = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data, error: qErr } = await supabase
          .from('bao_cao_van_don')
          .select(
            'id, ngay, thi_truong, ket_qua_check, trang_thai_giao_hang, trang_thai_thanh_toan, tien_trang_thai_thanh_toan, tong_tien_vnd'
          )
          .gte('ngay', globalFrom)
          .lte('ngay', globalTo)
          .order('ngay', { ascending: true })
          .range(from, to);
        if (qErr) throw qErr;
        const batch = data || [];
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }
      setRows(all);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Không tải được bao_cao_van_don');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [globalFrom, globalTo]);

  useEffect(() => {
    load();
  }, [load]);

  const virtualRows = useMemo(() => rows.map(mapBaoCaoVanDonRowToVirtual), [rows]);

  const grand = useMemo(() => aggregateVanHanhSlice(virtualRows), [virtualRows]);

  const bucketRows = useMemo(() => {
    const map = new Map();
    for (const v of virtualRows) {
      const rawNgay = v['Ngày lên đơn'];
      const bk = bucketKeyForRow(rawNgay, granularity);
      if (!map.has(bk)) map.set(bk, []);
      map.get(bk).push(v);
    }
    const keys = [...map.keys()].sort((a, b) => a.localeCompare(b, 'vi'));
    return keys.map((k) => ({
      key: k,
      m: aggregateVanHanhSlice(map.get(k) || []),
    }));
  }, [virtualRows, granularity]);

  const granLabel =
    granularity === 'day' ? 'Theo ngày' : granularity === 'week' ? 'Theo tuần (Thứ Hai)' : 'Theo tháng';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-slate-50/80 p-3 text-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-800 sm:text-base">Báo cáo tổng (vận đơn / bao_cao_van_don)</h2>
          <p className="text-[11px] text-slate-600 sm:text-xs">
            Gom theo kết quả histogram trên dòng báo cáo — đồng bộ logic với tab «Thống kê đơn» Báo cáo vận hành. Tỷ lệ
            thu = đơn có bill đủ / Giao thành công.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Tải lại
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase text-slate-500">Chu kỳ gom</span>
        {[
          { id: 'day', label: 'Theo ngày' },
          { id: 'week', label: 'Theo tuần' },
          { id: 'month', label: 'Theo tháng' },
        ].map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGranularity(g.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              granularity === g.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {error && <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">{error}</div>}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard
          label="Tổng đơn (histogram)"
          value={formatSlVi(grand.tongLenDon)}
          sub={globalFrom && globalTo ? `${globalFrom} → ${globalTo}` : 'Cả kỳ'}
        />
        <StatCard label="Tỷ lệ OK / tổng" value={formatPct(grand.ok, grand.tongLenDon)} sub="Cả kỳ" />
        <StatCard label="Tỷ lệ huỷ (kq check) / tổng" value={formatPct(grand.huyCheck, grand.tongLenDon)} sub="Cả kỳ" />
        <StatCard label="Tỷ lệ thu / đơn TC" value={formatPct(grand.donCoBill, grand.giaoTC)} sub="Vận đơn — bill đủ / Giao TC" />
      </div>

      {loading && rows.length === 0 ? (
        <p className="text-center text-sm text-slate-500">Đang tải dữ liệu…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[720px] w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100">
                <th className="px-2 py-2 font-semibold">Kỳ ({granLabel})</th>
                <th className="px-2 py-2 text-right font-semibold">Tổng SL</th>
                <th className="px-2 py-2 text-right font-semibold">OK</th>
                <th className="px-2 py-2 text-right font-semibold">Huỷ check</th>
                <th className="px-2 py-2 text-right font-semibold">Đẩy VH</th>
                <th className="px-2 py-2 text-right font-semibold">Giao TC</th>
                <th className="px-2 py-2 text-right font-semibold">Có bill</th>
                <th className="px-2 py-2 text-right font-semibold">% Huỷ/Tổng</th>
                <th className="px-2 py-2 text-right font-semibold">% Thu/TC</th>
              </tr>
            </thead>
            <tbody>
              {bucketRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                    Không có dòng bao_cao_van_don trong khoảng ngày đã chọn.
                  </td>
                </tr>
              ) : (
                bucketRows.map(({ key, m }) => (
                  <tr key={key} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-2 py-1.5 font-medium tabular-nums">{key}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatSlVi(m.tongLenDon)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatSlVi(m.ok)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatSlVi(m.huyCheck)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatSlVi(m.donDayVanHanh)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatSlVi(m.giaoTC)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatSlVi(m.donCoBill)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatPct(m.huyCheck, m.tongLenDon)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatPct(m.donCoBill, m.giaoTC)}</td>
                  </tr>
                ))
              )}
              {bucketRows.length > 0 && (
                <tr className="bg-amber-50 font-semibold">
                  <td className="px-2 py-2">Cả kỳ</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatSlVi(grand.tongLenDon)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatSlVi(grand.ok)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatSlVi(grand.huyCheck)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatSlVi(grand.donDayVanHanh)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatSlVi(grand.giaoTC)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatSlVi(grand.donCoBill)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatPct(grand.huyCheck, grand.tongLenDon)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatPct(grand.donCoBill, grand.giaoTC)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2 text-[10px] text-slate-500">
        Nguồn: Supabase <code className="rounded bg-slate-200 px-0.5">bao_cao_van_don</code> · Tối đa {MAX_PAGES * PAGE_SIZE} dòng
        / lần tải.
      </p>
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-base font-bold tabular-nums text-slate-900">{value}</div>
      {sub ? <div className="text-[10px] text-slate-500">{sub}</div> : null}
    </div>
  );
}
