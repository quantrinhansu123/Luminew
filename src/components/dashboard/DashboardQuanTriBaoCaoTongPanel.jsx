import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../supabase/config';
import { aggregateVanHanhSlice, formatPct, formatSlVi } from '../../utils/baoCaoVanDonMarketMatrix';
import { isGiaoHangHistogramSyntheticKey } from '../../utils/baoCaoVanDonFormat';

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

const normalizeYmd = (value) => {
  if (!value) return '';
  const s = String(value).trim();
  if (!s) return '';
  if (s.includes('T')) return s.slice(0, 10);
  return s.slice(0, 10);
};

const meaningfulTrim = (value) =>
  String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .trim();

function sqlCoalesceNumbers(...vals) {
  for (const v of vals) {
    if (v == null || v === '') continue;
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

function resolveVanDonDisplayTotalVnd(row) {
  if (row?.van_don_line_total_vnd != null && row.van_don_line_total_vnd !== '') {
    const v = Number(row.van_don_line_total_vnd);
    if (!Number.isNaN(v)) return v;
  }
  const rawTong = row?.tong_tien_vnd ?? row?.tong_tien_VND;
  if (rawTong != null && rawTong !== '' && !Number.isNaN(Number(rawTong))) {
    const tn = Number(rawTong);
    if (tn !== 0) return tn;
  }
  return sqlCoalesceNumbers(row?.total_amount_vnd, row?.sale_price, row?.goods_amount, 0);
}

const paymentLabelForOrder = (order) => {
  const d = String(order?.payment_status_detail ?? '').trim();
  if (d) return d;
  return String(order?.payment_status ?? '').trim();
};

const paymentLabelIsCoBillOnly = (label) => {
  const s = String(label ?? '').trim().toLowerCase();
  if (!s) return false;
  if (s.includes('1 phần') && s.includes('bill')) return false;
  return s.includes('có bill');
};

function mapOrderRowToVirtual(row) {
  const deliveryLabelRaw = String(row?.delivery_status_nb ?? row?.delivery_status ?? '').trim();
  const deliveryLabel = deliveryLabelRaw || '(Trống)';
  const safeDeliveryLabel = isGiaoHangHistogramSyntheticKey(deliveryLabel) ? '(Trống)' : deliveryLabel;
  const paymentLabelRaw = paymentLabelForOrder(row);
  const paymentLabel = paymentLabelRaw || '(Trống)';
  const tongTienVnd = Number(row?.total_amount_vnd) || 0;
  const tongTienCoMaRaw = row?.tong_tien_vnd ?? row?.tong_tien_VND;
  const tongTienCoMa = resolveVanDonDisplayTotalVnd(row);
  const dsTongTienVnd =
    tongTienCoMaRaw != null && tongTienCoMaRaw !== '' && !Number.isNaN(Number(tongTienCoMaRaw))
      ? Number(tongTienCoMaRaw)
      : 0;
  const trackingCount = meaningfulTrim(row?.tracking_code) !== '' ? 1 : 0;
  const shippingUnitNorm = meaningfulTrim(row?.shipping_unit);
  const lenVhCount = shippingUnitNorm !== '' ? 1 : 0;
  const ngay = normalizeYmd(row?.order_date) || normalizeYmd(row?.created_at);
  const checkResult = String(row?.check_result ?? '').trim() || '(Trống)';
  return {
    _source: 'orders',
    id: row?.id || row?.order_code || `${ngay}-${Math.random().toString(36).slice(2, 8)}`,
    _ket_qua_check: { [checkResult]: 1 },
    _trang_thai_giao_hang: {
      [safeDeliveryLabel]: 1,
      'Mã Tracking': trackingCount,
      'Lên vận hành': lenVhCount,
    },
    _trang_thai_thanh_toan: { [paymentLabel]: 1 },
    _tien_trang_thai_thanh_toan: { [paymentLabel]: paymentLabelIsCoBillOnly(paymentLabel) ? tongTienVnd : 0 },
    _tong_tien_vnd: tongTienCoMa,
    _ds_tong_tien_vnd: dsTongTienVnd,
    'khu vực': String(row?.country ?? '').trim() || 'Không xác định',
    'Ngày lên đơn': ngay,
  };
}

export default function DashboardQuanTriBaoCaoTongPanel({ globalFrom, globalTo }) {
  const [granularity, setGranularity] = useState('day');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [diag, setDiag] = useState({ checked: false, totalCount: null, maxNgay: null });

  const load = useCallback(async () => {
    if (!globalFrom || !globalTo) return;
    if (globalFrom > globalTo) {
      setError('Từ ngày phải ≤ Đến ngày.');
      return;
    }
    setLoading(true);
    setError(null);
    setDiag({ checked: false, totalCount: null, maxNgay: null });
    try {
      const all = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data, error: qErr } = await supabase
          .from('orders')
          .select(
            'id, order_code, order_date, created_at, country, delivery_status_nb, delivery_status, check_result, payment_status, payment_status_detail, total_amount_vnd, tong_tien_vnd, van_don_line_total_vnd, sale_price, goods_amount, tracking_code, shipping_unit'
          )
          .gte('order_date', globalFrom)
          .lte('order_date', globalTo)
          .order('order_date', { ascending: true })
          .range(from, to);
        if (qErr) throw qErr;
        const batch = data || [];
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }
      setRows(all.map(mapOrderRowToVirtual));

      // Nếu không có lỗi nhưng 0 dòng: tự chẩn đoán xem bảng có data (trong RLS scope) không.
      if (all.length === 0) {
        try {
          const [{ count }, maxRes] = await Promise.all([
            supabase.from('orders').select('id', { count: 'exact', head: true }),
            supabase.from('orders').select('order_date').order('order_date', { ascending: false }).limit(1),
          ]);
          const maxNgay =
            (Array.isArray(maxRes?.data) ? maxRes.data[0]?.order_date : maxRes?.data?.order_date) || null;
          setDiag({
            checked: true,
            totalCount: typeof count === 'number' ? count : null,
            maxNgay: maxNgay ? String(maxNgay).slice(0, 10) : null,
          });
        } catch (e2) {
          setDiag({ checked: true, totalCount: null, maxNgay: null });
          console.warn('[DashboardQuanTriBaoCaoTongPanel] diag failed:', e2);
        }
      }
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Không tải được orders');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [globalFrom, globalTo]);

  useEffect(() => {
    load();
  }, [load]);

  const grand = useMemo(() => aggregateVanHanhSlice(rows), [rows]);

  const bucketRows = useMemo(() => {
    const map = new Map();
    for (const v of rows) {
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
  }, [rows, granularity]);

  const granLabel =
    granularity === 'day' ? 'Theo ngày' : granularity === 'week' ? 'Theo tuần (Thứ Hai)' : 'Theo tháng';

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-auto bg-slate-50/80 p-3 text-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-800 sm:text-base">Báo cáo tổng (vận đơn / orders)</h2>
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
                    <div className="font-medium">Không có đơn trong khoảng ngày đã chọn.</div>
                    {diag.checked && (
                      <div className="mt-1 text-[11px] text-slate-500">
                        {diag.totalCount === 0
                          ? 'Trong phạm vi quyền hiện tại, bảng orders đang trống (hoặc RLS chặn toàn bộ).'
                          : `Trong phạm vi quyền hiện tại: tổng dòng ≈ ${diag.totalCount ?? '—'}; ngày mới nhất = ${diag.maxNgay ?? '—'}.`}
                        <div className="mt-0.5">
                          Gợi ý: thử chỉnh “Khoảng ngày” ở Dashboard cho khớp ngày mới nhất của vận đơn.
                        </div>
                      </div>
                    )}
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
        Nguồn: Supabase <code className="rounded bg-slate-200 px-0.5">orders</code> · Tối đa {MAX_PAGES * PAGE_SIZE} dòng
        / lần tải · Đã tải: <span className="font-semibold">{rows.length}</span> dòng.
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
