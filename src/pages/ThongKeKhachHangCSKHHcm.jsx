import { Download, RefreshCw, Search, TrendingUp, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import usePermissions from '../hooks/usePermissions';
import { supabase } from '../supabase/config';
import { formatLocalYmd, mergeUniqueRowsById, orderRangeToCreatedAtIsoBounds } from '../utils/dateParsing';
import '../styles/selection.css';

const ORDERS_TABLE = 'order_code_hcm';
const PAGE_SIZE = 1000;
const SELECT_COLUMNS =
  'id, order_code, order_date, created_at, customer_name, customer_phone, product, product_name_1, product_name_2, country, total_amount_vnd';

/** Người đã có 1 trong các quyền CSKH HCM hiện có thì xem được luôn; CSKH_STATS_HCM để phân quyền riêng sau này. */
const ACCESS_PERMISSION_CODES = ['CSKH_STATS_HCM', 'CSKH_LIST_HCM', 'CSKH_VIEW_HCM', 'CSKH_PAID_HCM'];

/** "Mua lại" = tổng số lần mua (kể cả lần đầu) >= 2, thống nhất cho cả 4 bảng bên dưới. */
const REPEAT_THRESHOLD = 2;

const TABS = [
  { id: 'list', label: 'Danh sách mua lại' },
  { id: 'market', label: 'Theo thị trường' },
  { id: 'product', label: 'Theo sản phẩm' },
  { id: 'overview', label: 'Tổng quan' },
];

function normKey(s) {
  return String(s ?? '').trim().toLowerCase();
}

function normPhoneKey(phone) {
  return String(phone ?? '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
}

/** Định danh khách hàng: ưu tiên SĐT (đã chuẩn hóa), fallback theo tên nếu thiếu SĐT. */
function customerKeyFor(row) {
  const phoneKey = normPhoneKey(row.customer_phone);
  if (phoneKey) return `p:${phoneKey}`;
  const nameKey = normKey(row.customer_name);
  return nameKey ? `n:${nameKey}` : null;
}

function formatCurrency(n) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v);
}

function formatPercent(n) {
  return `${(Number(n) * 100 || 0).toFixed(1)}%`;
}

function exportSheetToExcel(sheetName, header, bodyRows, filePrefix) {
  if (!bodyRows.length) {
    toast.warning('Không có dữ liệu để xuất Excel theo bộ lọc hiện tại.');
    return;
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([header, ...bodyRows]);
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filePrefix}_${stamp}.xlsx`);
  toast.success(`Đã tải Excel: ${bodyRows.length.toLocaleString('vi-VN')} dòng (theo bộ lọc).`);
}

async function fetchAllRows(buildQuery) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    from += chunk.length;
  }
  return all;
}

async function fetchOrdersInRange(startDate, endDate) {
  const bounds = orderRangeToCreatedAtIsoBounds(startDate, endDate);
  const byOrderDate = await fetchAllRows(() =>
    supabase
      .from(ORDERS_TABLE)
      .select(SELECT_COLUMNS)
      .gte('order_date', startDate)
      .lte('order_date', endDate)
      .order('order_date', { ascending: false })
  );
  const byCreatedAt =
    bounds.start && bounds.end
      ? await fetchAllRows(() =>
          supabase
            .from(ORDERS_TABLE)
            .select(SELECT_COLUMNS)
            .is('order_date', null)
            .gte('created_at', bounds.start)
            .lte('created_at', bounds.end)
            .order('created_at', { ascending: false })
        )
      : [];
  return mergeUniqueRowsById(byOrderDate, byCreatedAt);
}

/**
 * Gộp 1 lần quét toàn bộ orders đã lọc thành 4 tầng số liệu:
 * - overall: mỗi KH (toàn bộ SP + thị trường)
 * - byMarket: mỗi KH trong 1 thị trường (mọi SP)
 * - byProduct: mỗi KH mua 1 SP (mọi thị trường)
 * - byProductMarket: mỗi KH mua 1 SP tại 1 thị trường — chi tiết nhất, dùng cho bảng "Danh sách mua lại"
 */
function buildAggregates(rows) {
  const overall = new Map();
  const byMarket = new Map();
  const byProduct = new Map();
  const byProductMarket = new Map();

  for (const row of rows) {
    const custKey = customerKeyFor(row);
    if (!custKey) continue;
    const name = row.customer_name || '';
    const phone = row.customer_phone || '';
    const product = String(row.product ?? '').trim() || '(Không rõ)';
    const market = String(row.country ?? '').trim() || '(Không rõ)';
    const amount = Number(row.total_amount_vnd) || 0;

    let o = overall.get(custKey);
    if (!o) {
      o = { custKey, name, phone, orderCount: 0, totalAmount: 0 };
      overall.set(custKey, o);
    }
    o.orderCount += 1;
    o.totalAmount += amount;
    if (!o.name && name) o.name = name;
    if (!o.phone && phone) o.phone = phone;

    const mKey = `${custKey}||${market}`;
    let m = byMarket.get(mKey);
    if (!m) {
      m = { custKey, market, orderCount: 0, totalAmount: 0 };
      byMarket.set(mKey, m);
    }
    m.orderCount += 1;
    m.totalAmount += amount;

    const pKey = `${custKey}||${product}`;
    let p = byProduct.get(pKey);
    if (!p) {
      p = { custKey, product, orderCount: 0, totalAmount: 0 };
      byProduct.set(pKey, p);
    }
    p.orderCount += 1;
    p.totalAmount += amount;

    const pmKey = `${custKey}||${product}||${market}`;
    let pm = byProductMarket.get(pmKey);
    if (!pm) {
      pm = { custKey, name, phone, product, market, orderCount: 0, totalAmount: 0 };
      byProductMarket.set(pmKey, pm);
    }
    pm.orderCount += 1;
    pm.totalAmount += amount;
    if (!pm.name && name) pm.name = name;
    if (!pm.phone && phone) pm.phone = phone;
  }

  return { overall, byMarket, byProduct, byProductMarket };
}

function MultiSelectDropdown({ label, options, selected, onChange, open, onToggle }) {
  return (
    <div className="min-w-[190px] relative z-30">
      <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{label}</label>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-[#F37021]"
      >
        <span className="truncate">
          {selected.length === 0 ? 'Tất cả' : selected.length === 1 ? selected[0] : `Đã chọn ${selected.length}`}
        </span>
        <span className="ml-2">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <div className="p-2">
            <div className="flex items-center justify-between mb-2 pb-2 border-b">
              <span className="text-xs font-semibold text-gray-700">Chọn {label.toLowerCase()}:</span>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onChange([...options])}
                  className="text-xs text-green-600 hover:text-green-800"
                >
                  Chọn tất cả
                </button>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Bỏ chọn
                </button>
              </div>
            </div>
            {options.length === 0 && (
              <div className="text-xs text-gray-400 px-2 py-2">Không có dữ liệu</div>
            )}
            {options.map((opt) => {
              const checked = selected.includes(opt);
              return (
                <label key={opt} className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) onChange([...selected, opt]);
                      else onChange(selected.filter((v) => v !== opt));
                    }}
                    className="w-4 h-4 text-[#F37021] border-gray-300 rounded focus:ring-[#F37021]"
                  />
                  <span className="ml-2 text-sm text-gray-700 truncate">{opt}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ReportTable({ title, columns, rows, loading, emptyText, renderRow, colSpan, onExport }) {
  const hasRows = rows.length > 0;
  return (
    <div className="bg-white border border-gray-300 rounded-lg shadow-sm mb-6 overflow-hidden">
      {title && (
        <div className="bg-[#F37021] text-white font-bold uppercase tracking-wide py-2 px-3 text-sm flex items-center justify-between gap-2">
          <span className="flex-1 text-center">{title}</span>
          {onExport && (
            <button
              type="button"
              onClick={onExport}
              disabled={loading || !hasRows}
              title="Tải Excel theo bộ lọc hiện tại"
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed normal-case tracking-normal"
            >
              <Download className="w-3.5 h-3.5" />
              Tải Excel
            </button>
          )}
        </div>
      )}
      <div className="overflow-x-auto" data-cskh-grid-root>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-orange-50">
              {columns.map((c) => (
                <th
                  key={c}
                  className="px-3 py-2 text-left text-xs font-bold text-gray-700 uppercase whitespace-nowrap border border-gray-300"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={colSpan || columns.length} className="px-3 py-6 text-center text-sm text-gray-400 border border-gray-300">
                  Đang tải dữ liệu...
                </td>
              </tr>
            )}
            {!loading && !hasRows && (
              <tr>
                <td colSpan={colSpan || columns.length} className="px-3 py-6 text-center text-sm text-gray-400 border border-gray-300">
                  {emptyText}
                </td>
              </tr>
            )}
            {!loading && rows.map(renderRow)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ThongKeKhachHangCSKHHcm() {
  const { canView } = usePermissions();
  const hasAccess = ACCESS_PERMISSION_CODES.some((code) => canView(code));

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return formatLocalYmd(d);
  });
  const [endDate, setEndDate] = useState(() => formatLocalYmd(new Date()));
  const [rawRows, setRawRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterProduct, setFilterProduct] = useState([]);
  const [filterMarket, setFilterMarket] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('list');

  const loadData = async () => {
    setLoading(true);
    try {
      const rows = await fetchOrdersInRange(startDate, endDate);
      setRawRows(rows);
    } catch (e) {
      console.error('[ThongKeKhachHangCSKHHcm] fetch error', e);
      toast.error('Lỗi tải dữ liệu thống kê KH: ' + (e?.message || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasAccess) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, hasAccess]);

  const productOptions = useMemo(() => {
    const set = new Set();
    rawRows.forEach((r) => {
      const v = String(r.product ?? '').trim();
      if (v) set.add(v);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [rawRows]);

  const marketOptions = useMemo(() => {
    const set = new Set();
    rawRows.forEach((r) => {
      const v = String(r.country ?? '').trim();
      if (v) set.add(v);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [rawRows]);

  const filteredRows = useMemo(() => {
    return rawRows.filter((r) => {
      if (filterProduct.length > 0 && !filterProduct.includes(String(r.product ?? '').trim())) return false;
      if (filterMarket.length > 0 && !filterMarket.includes(String(r.country ?? '').trim())) return false;
      return true;
    });
  }, [rawRows, filterProduct, filterMarket]);

  const aggregates = useMemo(() => buildAggregates(filteredRows), [filteredRows]);

  const searchLower = search.trim().toLowerCase();
  const matchesSearch = (name, phone) =>
    !searchLower || String(name).toLowerCase().includes(searchLower) || String(phone).toLowerCase().includes(searchLower);

  // Bảng 1: Tổng danh sách khách hàng mua lại (theo KH × Sản phẩm × Thị trường)
  const section1Rows = useMemo(() => {
    const rows = [];
    for (const pm of aggregates.byProductMarket.values()) {
      if (pm.orderCount < REPEAT_THRESHOLD) continue;
      if (!matchesSearch(pm.name, pm.phone)) continue;
      const overall = aggregates.overall.get(pm.custKey);
      rows.push({
        key: `${pm.custKey}||${pm.product}||${pm.market}`,
        name: pm.name || '(Không rõ)',
        phone: pm.phone,
        product: pm.product,
        market: pm.market,
        lanMua: pm.orderCount,
        tongDon: overall?.orderCount || 0,
        tongDoanhThu: overall?.totalAmount || 0,
      });
    }
    return rows.sort(
      (a, b) => b.lanMua - a.lanMua || b.tongDoanhThu - a.tongDoanhThu || a.name.localeCompare(b.name, 'vi')
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aggregates, searchLower]);

  // Bảng 2: Tổng theo thị trường
  const section2Rows = useMemo(() => {
    const byMarket = new Map();
    for (const m of aggregates.byMarket.values()) {
      let e = byMarket.get(m.market);
      if (!e) {
        e = { market: m.market, tongKH: 0, muaLai: 0, doanhThuMuaLai: 0 };
        byMarket.set(m.market, e);
      }
      e.tongKH += 1;
      if (m.orderCount >= REPEAT_THRESHOLD) {
        e.muaLai += 1;
        e.doanhThuMuaLai += m.totalAmount;
      }
    }
    return [...byMarket.values()]
      .map((e) => ({ ...e, tyLeMuaLai: e.tongKH > 0 ? e.muaLai / e.tongKH : 0 }))
      .sort((a, b) => b.tongKH - a.tongKH || a.market.localeCompare(b.market, 'vi'));
  }, [aggregates]);

  // Bảng 3: Tổng theo sản phẩm
  const section3Rows = useMemo(() => {
    const byProduct = new Map();
    for (const p of aggregates.byProduct.values()) {
      let e = byProduct.get(p.product);
      if (!e) {
        e = { product: p.product, tongKH: 0, muaLai: 0, lan2: 0, lan3: 0, tu4: 0, doanhThu: 0 };
        byProduct.set(p.product, e);
      }
      e.tongKH += 1;
      e.doanhThu += p.totalAmount;
      if (p.orderCount === 2) e.lan2 += 1;
      else if (p.orderCount === 3) e.lan3 += 1;
      else if (p.orderCount >= 4) e.tu4 += 1;
      if (p.orderCount >= REPEAT_THRESHOLD) e.muaLai += 1;
    }
    return [...byProduct.values()].sort((a, b) => b.tongKH - a.tongKH || a.product.localeCompare(b.product, 'vi'));
  }, [aggregates]);

  // Khối tổng quan cuối trang
  const kpi = useMemo(() => {
    let tongKH = 0;
    let muaLai = 0;
    let lan2 = 0;
    let lan3 = 0;
    let tu4 = 0;
    let doanhThuMuaLai = 0;
    for (const o of aggregates.overall.values()) {
      tongKH += 1;
      if (o.orderCount === 2) lan2 += 1;
      else if (o.orderCount === 3) lan3 += 1;
      else if (o.orderCount >= 4) tu4 += 1;
      if (o.orderCount >= REPEAT_THRESHOLD) {
        muaLai += 1;
        doanhThuMuaLai += o.totalAmount;
      }
    }
    return { tongKH, muaLai, tyLe: tongKH > 0 ? muaLai / tongKH : 0, lan2, lan3, tu4, doanhThuMuaLai };
  }, [aggregates]);

  const exportListExcel = useCallback(() => {
    exportSheetToExcel(
      'Danh_sach_mua_lai',
      ['STT', 'Tên KH', 'SĐT', 'Sản phẩm', 'Thị trường', 'Lần mua', 'Tổng đơn', 'Tổng doanh thu'],
      section1Rows.map((r, idx) => [
        idx + 1,
        r.name,
        r.phone || '',
        r.product,
        r.market,
        r.lanMua,
        r.tongDon,
        r.tongDoanhThu,
      ]),
      `ThongKeKH_HCM_DanhSach_${startDate}_${endDate}`
    );
  }, [section1Rows, startDate, endDate]);

  const exportMarketExcel = useCallback(() => {
    exportSheetToExcel(
      'Theo_thi_truong',
      ['Thị trường', 'Tổng KH', 'KH mua lại', 'Tỷ lệ mua lại (%)', 'Doanh thu mua lại'],
      section2Rows.map((r) => [
        r.market,
        r.tongKH,
        r.muaLai,
        Number(((r.tyLeMuaLai || 0) * 100).toFixed(1)),
        r.doanhThuMuaLai,
      ]),
      `ThongKeKH_HCM_ThiTruong_${startDate}_${endDate}`
    );
  }, [section2Rows, startDate, endDate]);

  const exportProductExcel = useCallback(() => {
    exportSheetToExcel(
      'Theo_san_pham',
      ['Sản phẩm', 'Tổng KH', 'KH mua lại', 'Lần 2', 'Lần 3', '≥4 lần', 'Doanh thu'],
      section3Rows.map((r) => [r.product, r.tongKH, r.muaLai, r.lan2, r.lan3, r.tu4, r.doanhThu]),
      `ThongKeKH_HCM_SanPham_${startDate}_${endDate}`
    );
  }, [section3Rows, startDate, endDate]);

  const exportOverviewExcel = useCallback(() => {
    exportSheetToExcel(
      'Tong_quan',
      ['Chỉ tiêu', 'Giá trị'],
      [
        ['Tổng khách hàng', kpi.tongKH],
        ['Khách mua lại', kpi.muaLai],
        ['Tỷ lệ mua lại (%)', Number(((kpi.tyLe || 0) * 100).toFixed(1))],
        ['Khách mua lần 2', kpi.lan2],
        ['Khách mua lần 3', kpi.lan3],
        ['Khách mua ≥4 lần', kpi.tu4],
        ['Doanh thu khách mua lại', kpi.doanhThuMuaLai],
      ],
      `ThongKeKH_HCM_TongQuan_${startDate}_${endDate}`
    );
  }, [kpi, startDate, endDate]);

  if (!hasAccess) {
    return (
      <div className="p-8 text-center font-bold text-red-600">
        Bạn không có quyền truy cập trang này (CSKH_STATS_HCM).
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp className="w-6 h-6 text-[#F37021]" />
        <h1 className="text-xl font-bold text-gray-800">Thống Kê KH-HCM</h1>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Khách hàng mua lại (từ {REPEAT_THRESHOLD} lần) theo Sản phẩm &amp; Thị trường — dữ liệu từ {ORDERS_TABLE}
      </p>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Từ ngày</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Đến ngày</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
            />
          </div>

          <MultiSelectDropdown
            label="Sản phẩm"
            options={productOptions}
            selected={filterProduct}
            onChange={setFilterProduct}
            open={openDropdown === 'product'}
            onToggle={() => setOpenDropdown((v) => (v === 'product' ? null : 'product'))}
          />
          <MultiSelectDropdown
            label="Thị trường"
            options={marketOptions}
            selected={filterMarket}
            onChange={setFilterMarket}
            open={openDropdown === 'market'}
            onToggle={() => setOpenDropdown((v) => (v === 'market' ? null : 'market'))}
          />

          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tìm khách hàng</label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tên hoặc SĐT..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37021]"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#F37021] text-white rounded-lg text-sm font-semibold hover:bg-[#d95f16] disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Đang tải...' : 'Làm mới'}
          </button>

          {(filterProduct.length > 0 || filterMarket.length > 0 || search) && (
            <button
              type="button"
              onClick={() => {
                setFilterProduct([]);
                setFilterMarket([]);
                setSearch('');
              }}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-red-600"
            >
              <X className="w-4 h-4" /> Xóa lọc
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg border border-b-0 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'bg-white border-gray-200 text-[#F37021]'
                : 'bg-gray-50 border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'list' && (
      <ReportTable
        title="Tổng danh sách khách hàng mua lại"
        columns={['STT', 'Tên KH', 'Sản phẩm', 'Thị trường', 'Lần mua', 'Tổng đơn', 'Tổng doanh thu']}
        rows={section1Rows}
        loading={loading}
        onExport={exportListExcel}
        emptyText={`Không có khách hàng nào mua lại từ ${REPEAT_THRESHOLD} lần trong khoảng thời gian / bộ lọc đã chọn.`}
        renderRow={(r, idx) => (
          <tr key={r.key} className="hover:bg-orange-50/40">
            <td className="px-3 py-2 text-sm text-gray-500 border border-gray-200">{idx + 1}</td>
            <td className="px-3 py-2 text-sm font-medium text-gray-800 border border-gray-200">
              {r.name}
              <div className="text-xs font-normal text-gray-400">{r.phone}</div>
            </td>
            <td className="px-3 py-2 text-sm text-gray-700 border border-gray-200">{r.product}</td>
            <td className="px-3 py-2 text-sm text-gray-700 border border-gray-200">{r.market}</td>
            <td className="px-3 py-2 text-sm font-bold text-[#F37021] text-center border border-gray-200">{r.lanMua}</td>
            <td className="px-3 py-2 text-sm text-gray-700 text-center border border-gray-200">{r.tongDon}</td>
            <td className="px-3 py-2 text-sm text-gray-700 text-right border border-gray-200">{formatCurrency(r.tongDoanhThu)}</td>
          </tr>
        )}
      />
      )}

      {activeTab === 'market' && (
      <ReportTable
        title="Bảng tổng theo thị trường"
        columns={['Thị trường', 'Tổng KH', 'KH mua lại', 'Tỷ lệ mua lại', 'Doanh thu mua lại']}
        rows={section2Rows}
        loading={loading}
        onExport={exportMarketExcel}
        emptyText="Không có dữ liệu trong khoảng thời gian / bộ lọc đã chọn."
        renderRow={(r) => (
          <tr key={r.market} className="hover:bg-orange-50/40">
            <td className="px-3 py-2 text-sm font-medium text-gray-800 border border-gray-200">{r.market}</td>
            <td className="px-3 py-2 text-sm text-gray-700 text-center border border-gray-200">{r.tongKH}</td>
            <td className="px-3 py-2 text-sm font-bold text-[#F37021] text-center border border-gray-200">{r.muaLai}</td>
            <td className="px-3 py-2 text-sm text-gray-700 text-center border border-gray-200">{formatPercent(r.tyLeMuaLai)}</td>
            <td className="px-3 py-2 text-sm text-gray-700 text-right border border-gray-200">{formatCurrency(r.doanhThuMuaLai)}</td>
          </tr>
        )}
      />
      )}

      {activeTab === 'product' && (
      <ReportTable
        title="Bảng tổng theo sản phẩm"
        columns={['Sản phẩm', 'Tổng KH', 'KH mua lại', 'Lần 2', 'Lần 3', '≥4 lần', 'Doanh thu']}
        rows={section3Rows}
        loading={loading}
        onExport={exportProductExcel}
        emptyText="Không có dữ liệu trong khoảng thời gian / bộ lọc đã chọn."
        renderRow={(r) => (
          <tr key={r.product} className="hover:bg-orange-50/40">
            <td className="px-3 py-2 text-sm font-medium text-gray-800 border border-gray-200">{r.product}</td>
            <td className="px-3 py-2 text-sm text-gray-700 text-center border border-gray-200">{r.tongKH}</td>
            <td className="px-3 py-2 text-sm font-bold text-[#F37021] text-center border border-gray-200">{r.muaLai}</td>
            <td className="px-3 py-2 text-sm text-gray-700 text-center border border-gray-200">{r.lan2}</td>
            <td className="px-3 py-2 text-sm text-gray-700 text-center border border-gray-200">{r.lan3}</td>
            <td className="px-3 py-2 text-sm text-gray-700 text-center border border-gray-200">{r.tu4}</td>
            <td className="px-3 py-2 text-sm text-gray-700 text-right border border-gray-200">{formatCurrency(r.doanhThu)}</td>
          </tr>
        )}
      />
      )}

      {activeTab === 'overview' && (
      <ReportTable
        title="Tổng quan mua lại"
        columns={['', 'Giá trị']}
        colSpan={2}
        rows={[
          { label: 'Tổng khách hàng', value: kpi.tongKH.toLocaleString('vi-VN') },
          { label: 'Khách mua lại', value: kpi.muaLai.toLocaleString('vi-VN') },
          { label: 'Tỷ lệ mua lại', value: formatPercent(kpi.tyLe) },
          { label: 'Khách mua lần 2', value: kpi.lan2.toLocaleString('vi-VN') },
          { label: 'Khách mua lần 3', value: kpi.lan3.toLocaleString('vi-VN') },
          { label: 'Khách mua ≥4 lần', value: kpi.tu4.toLocaleString('vi-VN') },
          { label: 'Doanh thu khách mua lại', value: formatCurrency(kpi.doanhThuMuaLai) },
        ]}
        loading={loading}
        onExport={exportOverviewExcel}
        emptyText=""
        renderRow={(r) => (
          <tr key={r.label} className="hover:bg-orange-50/40">
            <td className="px-3 py-2 text-sm text-gray-700 border border-gray-200 w-64">{r.label}</td>
            <td className="px-3 py-2 text-sm font-bold text-gray-800 border border-gray-200">{r.value}</td>
          </tr>
        )}
      />
      )}
    </div>
  );
}
