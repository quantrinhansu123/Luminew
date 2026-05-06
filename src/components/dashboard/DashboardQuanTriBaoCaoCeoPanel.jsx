import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../supabase/config';
import {
  canonicalBranchKey,
  formatCurrency,
  formatNumber,
  mapSupabaseSalesReportRow,
  filterRawData,
  rowCanonicalBranchKey,
} from '../../utils/nhanSuSaleLumiMoiLogic';

const PAGE_SIZE = 1000;
const MAX_PAGES = 80;

// Tránh select revenue_mess: một số DB chưa có column này (PGRST204).
const SALES_REPORTS_SELECT = [
  'name',
  'email',
  'team',
  'branch',
  'position',
  'date',
  'shift',
  'product',
  'market',
  'mess_count',
  'response_count',
  'order_count',
  'revenue_actual',
  'revenue_go_actual',
  'order_cancel_count_actual',
  'revenue_cancel_actual',
].join(',');

function emptyAgg(label) {
  return {
    label,
    mess: 0,
    phanHoi: 0,
    soDon: 0,
    doanhThuTT: 0,
    soDonHuyTT: 0,
    doanhSoHuyTT: 0,
  };
}

function addRow(agg, r) {
  agg.mess += Number(r.soMessCmt || 0);
  agg.phanHoi += Number(r.phanHoi || 0);
  agg.soDon += Number(r.soDonThucTe || 0);
  agg.doanhThuTT += Number(r.doanhThuChotThucTe || 0);
  agg.soDonHuyTT += Number(r.soDonHoanHuyThucTe || 0);
  agg.doanhSoHuyTT += Number(r.doanhSoHoanHuyThucTe || 0);
}

function addAgg(dst, src) {
  dst.mess += Number(src.mess || 0);
  dst.phanHoi += Number(src.phanHoi || 0);
  dst.soDon += Number(src.soDon || 0);
  dst.doanhThuTT += Number(src.doanhThuTT || 0);
  dst.soDonHuyTT += Number(src.soDonHuyTT || 0);
  dst.doanhSoHuyTT += Number(src.doanhSoHuyTT || 0);
}

function pct(n, d) {
  if (!d) return '0.00%';
  return `${((Number(n || 0) / Number(d || 0)) * 100).toFixed(2)}%`;
}

export default function DashboardQuanTriBaoCaoCeoPanel({ globalFrom, globalTo }) {
  const [rowsHn, setRowsHn] = useState([]);
  const [rowsHcm, setRowsHcm] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState({
    shifts: [],
    teams: [],
    products: [],
    markets: [],
  });
  const [branchPick, setBranchPick] = useState('all'); // all | hcm | hn
  const didInitFiltersRef = useState(false);

  const toggleInList = (list, value) => {
    const v = String(value || '').trim();
    const next = new Set((list || []).map((x) => String(x)));
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return Array.from(next.values());
  };

  const uniqueSorted = (arr, pick) => {
    const s = new Set();
    (arr || []).forEach((x) => {
      const v = String(pick(x) || '').trim();
      if (v) s.add(v);
    });
    return Array.from(s.values()).sort((a, b) => a.localeCompare(b, 'vi'));
  };

  const load = useCallback(async () => {
    if (!globalFrom || !globalTo) return;
    if (globalFrom > globalTo) {
      setError('Từ ngày phải ≤ Đến ngày.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const loadTable = async (tableName) => {
        const all = [];
        for (let page = 0; page < MAX_PAGES; page += 1) {
          const from = page * PAGE_SIZE;
          const to = from + PAGE_SIZE - 1;
          const { data, error: qErr } = await supabase
            .from(tableName)
            .select(SALES_REPORTS_SELECT)
            .gte('date', globalFrom)
            .lte('date', globalTo)
            .order('date', { ascending: true })
            .range(from, to);
          if (qErr) throw qErr;
          const batch = data || [];
          all.push(...batch);
          if (batch.length < PAGE_SIZE) break;
        }
        return all;
      };

      const [hn, hcm] = await Promise.all([
        loadTable('sales_reports'),
        loadTable('sale_report_hcm'),
      ]);
      setRowsHn(hn);
      setRowsHcm(hcm);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Không tải được sales_reports / sale_report_hcm');
      setRowsHn([]);
      setRowsHcm([]);
    } finally {
      setLoading(false);
    }
  }, [globalFrom, globalTo]);

  useEffect(() => {
    load();
  }, [load]);

  const mappedAll = useMemo(() => {
    const out = [];
    for (const r of rowsHn) {
      const m = mapSupabaseSalesReportRow(r);
      if (m) out.push({ ...m, __ceo_source: 'hn' });
    }
    for (const r of rowsHcm) {
      const m = mapSupabaseSalesReportRow(r);
      if (m) out.push({ ...m, __ceo_source: 'hcm' });
    }
    return out;
  }, [rowsHn, rowsHcm]);

  const bucketFromRow = useCallback((r) => {
    const src = String(r?.__ceo_source || '').toLowerCase();
    if (src === 'hcm') return 'hcm';
    if (src === 'hn') return 'hn';
    // Fallback (cũ) nếu thiếu source
    const k = rowCanonicalBranchKey(r) || canonicalBranchKey(r?.team) || '';
    if (k === 'BR_HCM') return 'hcm';
    if (k === 'BR_HN') return 'hn';
    return 'other';
  }, []);

  const filterOptions = useMemo(() => {
    return {
      products: uniqueSorted(mappedAll, (r) => r.sanPham),
      markets: uniqueSorted(mappedAll, (r) => r.thiTruong),
      shifts: uniqueSorted(mappedAll, (r) => r.ca),
      teams: uniqueSorted(mappedAll, (r) => r.team),
    };
  }, [mappedAll]);

  // Init filter giống kiểu "Tất cả" của tab báo cáo chi tiết MKT: mặc định tick hết option có sẵn.
  useEffect(() => {
    if (didInitFiltersRef[0]) return;
    if (
      filterOptions.products.length === 0 &&
      filterOptions.markets.length === 0 &&
      filterOptions.shifts.length === 0 &&
      filterOptions.teams.length === 0
    ) {
      return;
    }
    setFilters({
      shifts: [...filterOptions.shifts],
      teams: [...filterOptions.teams],
      products: [...filterOptions.products],
      markets: [...filterOptions.markets],
    });
    didInitFiltersRef[1](true);
  }, [filterOptions.products, filterOptions.markets, filterOptions.shifts, filterOptions.teams, didInitFiltersRef]);

  // Khi options thay đổi sau khi đã init: giữ các value còn tồn tại, và auto-add value mới (để vẫn "tất cả").
  useEffect(() => {
    if (!didInitFiltersRef[0]) return;
    setFilters((prev) => ({
      shifts: mergeKeepAndAddNew(prev.shifts, filterOptions.shifts),
      teams: mergeKeepAndAddNew(prev.teams, filterOptions.teams),
      products: mergeKeepAndAddNew(prev.products, filterOptions.products),
      markets: mergeKeepAndAddNew(prev.markets, filterOptions.markets),
    }));
  }, [filterOptions.products, filterOptions.markets, filterOptions.shifts, filterOptions.teams, didInitFiltersRef]);

  const allSelected = useMemo(() => {
    // Nếu allOptions rỗng => coi như "Tất cả" (không lọc theo nhóm đó) để tránh lọc sạch dữ liệu.
    const eqAll = (sel, all) => all.length === 0 || sel.length === all.length;
    return {
      shifts: eqAll(filters.shifts, filterOptions.shifts),
      teams: eqAll(filters.teams, filterOptions.teams),
      products: eqAll(filters.products, filterOptions.products),
      markets: eqAll(filters.markets, filterOptions.markets),
    };
  }, [filters, filterOptions]);

  const mappedFiltered = useMemo(() => {
    const productAll = allSelected.products;
    const marketAll = allSelected.markets;
    const caAll = allSelected.shifts;
    const teamAll = allSelected.teams;
    let base = filterRawData({
      rawData: mappedAll,
      isRestrictedView: false,
      allowedBranch: null,
      allowedTeam: null,
      allowedNames: [],
      allowedUserEmail: null,
      allowedPersonnelNames: null,
      startDateStr: globalFrom,
      endDateStr: globalTo,
      productAll,
      selectedProducts: productAll ? null : filters.products,
      caAll,
      selectedShifts: caAll ? null : filters.shifts,
      teamAll,
      selectedTeams: teamAll ? null : filters.teams,
      marketAll,
      selectedMarkets: marketAll ? null : filters.markets,
      nameAll: true,
      selectedNames: null,
      boPhanPick: '',
      chucVuPick: '',
    });
    if (branchPick === 'hcm') {
      base = base.filter((r) => bucketFromRow(r) === 'hcm');
    } else if (branchPick === 'hn') {
      base = base.filter((r) => bucketFromRow(r) === 'hn');
    }
    return base;
  }, [mappedAll, globalFrom, globalTo, filters, allSelected, branchPick, bucketFromRow]);

  const summary = useMemo(() => {
    const hcm = emptyAgg('HCM');
    const hn = emptyAgg('HN');

    for (const r of mappedFiltered) {
      const b = bucketFromRow(r);
      if (b === 'hcm') addRow(hcm, r);
      else if (b === 'hn') addRow(hn, r);
    }

    // Tổng = HCM + HN (đúng yêu cầu CEO; bỏ qua các dòng khác/không phân loại).
    const total = emptyAgg('Tổng');
    addAgg(total, hcm);
    addAgg(total, hn);

    const finalize = (a) => {
      const soDonSauHuy = a.soDon - a.soDonHuyTT;
      const dsSauHuy = a.doanhThuTT - a.doanhSoHuyTT;
      return {
        ...a,
        soDonSauHuy,
        dsSauHuy,
        rateChot: a.mess ? a.soDon / a.mess : 0,
        rateSauHuy: a.mess ? soDonSauHuy / a.mess : 0,
        tiLeHuy: a.soDon ? a.soDonHuyTT / a.soDon : 0,
      };
    };

    return [finalize(total), finalize(hcm), finalize(hn)];
  }, [mappedFiltered, bucketFromRow]);

  const dailyBreakdown = useMemo(() => {
    const byDay = new Map();
    for (const r of mappedFiltered) {
      const day = String(r.ngay || '').slice(0, 10);
      if (!day) continue;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(r);
    }

    const days = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a, 'vi'));
    const blocks = days.map((day) => {
      const rows = byDay.get(day) || [];
      const hcm = emptyAgg('HCM');
      const hn = emptyAgg('HN');
      for (const r of rows) {
        const b = bucketFromRow(r);
        if (b === 'hcm') addRow(hcm, r);
        else if (b === 'hn') addRow(hn, r);
      }
      const total = emptyAgg('Tổng');
      addAgg(total, hcm);
      addAgg(total, hn);
      const finalize = (a) => {
        const soDonSauHuy = a.soDon - a.soDonHuyTT;
        const dsSauHuy = a.doanhThuTT - a.doanhSoHuyTT;
        return {
          ...a,
          soDonSauHuy,
          dsSauHuy,
          rateChot: a.mess ? a.soDon / a.mess : 0,
          rateSauHuy: a.mess ? soDonSauHuy / a.mess : 0,
          tiLeHuy: a.soDon ? a.soDonHuyTT / a.soDon : 0,
        };
      };
      return { day, rows: [finalize(total), finalize(hcm), finalize(hn)] };
    });

    return blocks;
  }, [mappedFiltered, bucketFromRow]);

  return (
    <div className="h-full min-h-0 overflow-auto">
      {/* Dashboard quản trị bọc TabsContent bằng overflow-hidden; tab CEO cần tự tạo vùng scroll. */}
      <div className="bao-cao-sale-container" style={{ minHeight: 'auto', padding: 12 }}>
        {loading && <div className="loading-overlay">Đang tải dữ liệu...</div>}

        <div className="report-container">
          <div
            className="sidebar"
            style={{
              width: '250px',
              minWidth: '250px',
              top: 12,
              maxHeight: 'calc(100vh - 140px)',
              overscrollBehavior: 'contain',
            }}
          >
          <FilterHeader title="Bộ lọc" />

          <label style={labelStyle}>
            Chọn nhánh:
            <select
              value={branchPick}
              onChange={(e) => setBranchPick(e.target.value)}
              style={selectStyle}
            >
              <option value="all">-- Chọn nhánh --</option>
              <option value="all">Tổng</option>
              <option value="hcm">HCM</option>
              <option value="hn">HN</option>
            </select>
          </label>

          <label style={labelStyle}>
            Từ ngày:
            <input type="date" value={globalFrom || ''} disabled style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Đến ngày:
            <input type="date" value={globalTo || ''} disabled style={inputStyle} />
          </label>

          {error && (
            <div style={{ marginBottom: '10px', padding: '8px', border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: '6px', fontSize: '12px' }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: '10px' }}>
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition flex items-center gap-2"
              title="Tải lại dữ liệu theo khoảng ngày trên Dashboard"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Tải lại
            </button>
          </div>

          <FilterHeader title="Sản phẩm" />
          <CheckboxList
            values={filterOptions.products}
            selected={filters.products}
            allChecked={allSelected.products}
            onToggleAll={(checked) => setFilters((prev) => ({ ...prev, products: checked ? [...filterOptions.products] : [] }))}
            onToggle={(v) => setFilters((prev) => ({ ...prev, products: toggleInList(prev.products, v) }))}
            emptyLabel="Chưa có giá trị Sản phẩm trong dữ liệu đã tải"
          />

          <FilterHeader title="Thị trường" />
          <CheckboxList
            values={filterOptions.markets}
            selected={filters.markets}
            allChecked={allSelected.markets}
            onToggleAll={(checked) => setFilters((prev) => ({ ...prev, markets: checked ? [...filterOptions.markets] : [] }))}
            onToggle={(v) => setFilters((prev) => ({ ...prev, markets: toggleInList(prev.markets, v) }))}
            emptyLabel="Chưa có giá trị Thị trường trong dữ liệu đã tải"
          />

          <FilterHeader title="Ca" />
          <CheckboxList
            values={filterOptions.shifts}
            selected={filters.shifts}
            allChecked={allSelected.shifts}
            onToggleAll={(checked) => setFilters((prev) => ({ ...prev, shifts: checked ? [...filterOptions.shifts] : [] }))}
            onToggle={(v) => setFilters((prev) => ({ ...prev, shifts: toggleInList(prev.shifts, v) }))}
            emptyLabel="Chưa có giá trị Ca trong dữ liệu đã tải"
          />

          <FilterHeader title="Team" />
          <CheckboxList
            values={filterOptions.teams}
            selected={filters.teams}
            allChecked={allSelected.teams}
            onToggleAll={(checked) => setFilters((prev) => ({ ...prev, teams: checked ? [...filterOptions.teams] : [] }))}
            onToggle={(v) => setFilters((prev) => ({ ...prev, teams: toggleInList(prev.teams, v) }))}
            emptyLabel="Chưa có giá trị Team trong dữ liệu đã tải"
          />
          </div>

          <div className="main-detailed">
          <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h2>BÁO CÁO CEO</h2>
            <div style={{ fontSize: '12px', color: '#666' }}>
              Tải được: <strong>{rowsHn.length}</strong> (HN) + <strong>{rowsHcm.length}</strong> (HCM)
            </div>
          </div>

          <div className="table-responsive-container">
            <table>
              <thead>
                <tr>
                  <th className="text-left">Khu vực</th>
                  <th>Mess</th>
                  <th>Phản hồi</th>
                  <th>Số đơn (TT)</th>
                  <th>% Chốt (Đơn/Mess)</th>
                  <th>Doanh thu (TT)</th>
                  <th>Đơn huỷ (TT)</th>
                  <th>% Huỷ (Huỷ/Đơn)</th>
                  <th>Đơn sau huỷ</th>
                  <th>% Sau huỷ (Sau huỷ/Mess)</th>
                  <th>DS sau huỷ</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((a) => (
                  <tr key={a.label} className={a.label === 'Tổng' ? 'total-row' : ''}>
                    <td className={a.label === 'Tổng' ? 'total-label' : 'text-left'}>{a.label}</td>
                    <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatNumber(a.mess)}</td>
                    <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatNumber(a.phanHoi)}</td>
                    <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatNumber(a.soDon)}</td>
                    <td className={a.label === 'Tổng' ? 'total-value' : ''}>{pct(a.soDon, a.mess)}</td>
                    <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatCurrency(a.doanhThuTT)}</td>
                    <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatNumber(a.soDonHuyTT)}</td>
                    <td className={a.label === 'Tổng' ? 'total-value' : ''}>{pct(a.soDonHuyTT, a.soDon)}</td>
                    <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatNumber(a.soDonSauHuy)}</td>
                    <td className={a.label === 'Tổng' ? 'total-value' : ''}>{pct(a.soDonSauHuy, a.mess)}</td>
                    <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatCurrency(a.dsSauHuy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>


          <div className="daily-breakdown">
            <h3>Chia theo ngày</h3>
            {dailyBreakdown.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#777' }}>Không có dữ liệu theo khoảng ngày đã chọn.</div>
            ) : (
              dailyBreakdown.map((block) => (
                <div key={block.day} className="table-responsive-container" style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#2E4617', marginBottom: '8px' }}>
                    Ngày {block.day}
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th className="text-left">Khu vực</th>
                        <th>Mess</th>
                        <th>Phản hồi</th>
                        <th>Số đơn (TT)</th>
                        <th>% Chốt</th>
                        <th>Doanh thu (TT)</th>
                        <th>Đơn huỷ (TT)</th>
                        <th>% Huỷ</th>
                        <th>Đơn sau huỷ</th>
                        <th>% Sau huỷ</th>
                        <th>DS sau huỷ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((a) => (
                        <tr key={`${block.day}-${a.label}`} className={a.label === 'Tổng' ? 'total-row' : ''}>
                          <td className={a.label === 'Tổng' ? 'total-label' : 'text-left'}>{a.label}</td>
                          <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatNumber(a.mess)}</td>
                          <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatNumber(a.phanHoi)}</td>
                          <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatNumber(a.soDon)}</td>
                          <td className={a.label === 'Tổng' ? 'total-value' : ''}>{pct(a.soDon, a.mess)}</td>
                          <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatCurrency(a.doanhThuTT)}</td>
                          <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatNumber(a.soDonHuyTT)}</td>
                          <td className={a.label === 'Tổng' ? 'total-value' : ''}>{pct(a.soDonHuyTT, a.soDon)}</td>
                          <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatNumber(a.soDonSauHuy)}</td>
                          <td className={a.label === 'Tổng' ? 'total-value' : ''}>{pct(a.soDonSauHuy, a.mess)}</td>
                          <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatCurrency(a.dsSauHuy)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

function mergeKeepAndAddNew(prevSelected, allOptions) {
  const allSet = new Set((allOptions || []).map((x) => String(x)));
  const kept = (prevSelected || []).map((x) => String(x)).filter((x) => allSet.has(x));
  const keptSet = new Set(kept);
  const added = (allOptions || []).map((x) => String(x)).filter((x) => !keptSet.has(x));
  return [...kept, ...added];
}

const labelStyle = { display: 'block', margin: '12px 0', fontSize: '0.95em', color: 'var(--text-medium)', fontWeight: 500 };
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', margin: '6px 0 12px', border: '1px solid var(--border-color)', borderRadius: 6, fontWeight: 500, fontSize: '0.95em' };
const selectStyle = { ...inputStyle, background: '#f3f4f6' };

function FilterHeader({ title }) {
  return <h3 style={{ marginTop: 16 }}>{title}</h3>;
}

function CheckboxList({ values, selected, allChecked, onToggleAll, onToggle, emptyLabel }) {
  return (
    <div style={{ marginTop: 8 }}>
      <label style={{ display: 'block', marginBottom: 8, fontSize: 12, cursor: 'pointer' }}>
        <input type="checkbox" style={{ marginRight: 6 }} checked={allChecked} onChange={(e) => onToggleAll(e.target.checked)} />
        Tất cả
      </label>
      <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 6, padding: 8, background: '#fff' }}>
        {values.length === 0 ? (
          <div style={{ fontSize: 12, color: '#999' }}>{emptyLabel}</div>
        ) : (
          values.map((v) => (
            <label key={v} style={{ display: 'block', marginBottom: 6, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" style={{ marginRight: 6 }} checked={(selected || []).includes(v)} onChange={() => onToggle(v)} />
              {v}
            </label>
          ))
        )}
      </div>
    </div>
  );
}

