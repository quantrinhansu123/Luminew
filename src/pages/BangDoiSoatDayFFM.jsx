import { ChevronDown, Database, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import usePermissions from "../hooks/usePermissions";
import * as API from "../services/api";

/** Không hiển thị (theo yêu cầu đối soát). */
const HIDDEN_COLUMNS = new Set(["id", "batch_id", "order_code"]);

const FFM_PUSH_LOG_LABELS = {
  carrier: "Đơn vị FFM",
  pushed_by: "Người chuẩn bị đẩy",
  status: "Trạng thái",
  pushed_at: "Thời điểm đẩy",
  created_at: "Thời gian tạo",
  updated_at: "Cập nhật",
  inserted_at: "Thời gian ghi",
  product: "Mặt hàng",
  country: "Thị trường",
  chi_nhanh: "Chi nhánh",
  shipping_unit: "Đơn vị vận chuyển",
  total_amount_vnd: "Tổng tiền VNĐ",
  "Mặt hàng": "Mặt hàng",
  "Khu vực": "Thị trường",
  "Đơn vị vận chuyển": "Đơn vị vận chuyển",
  "Tổng tiền VNĐ": "Tổng tiền VNĐ",
};

const PREFERRED_COL_ORDER = [
  "carrier",
  "pushed_by",
  "status",
  "pushed_at",
  "created_at",
  "inserted_at",
  "updated_at",
  "product",
  "Mặt hàng",
  "country",
  "Khu vực",
  "chi_nhanh",
  "shipping_unit",
  "Đơn vị vận chuyển",
  "total_amount_vnd",
  "Tổng tiền VNĐ",
];

const EMPTY_TOKEN = "__EMPTY__";

/** Nhóm ngày + lọc Từ/Đến ngày: theo cột `pushed_at` (ffm_push_logs / ffm_push_logs_hcm). */
function getRowDayKey(row) {
  const raw =
    row?.pushed_at ??
    row?.created_at ??
    row?.inserted_at ??
    row?.updated_at ??
    row?.push_date ??
    row?.["Ngày đẩy đơn"] ??
    row?.["Ngày Kế toán đối soát với FFM lần 2"];
  if (raw == null || raw === "") return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function getProduct(row) {
  return String(row?.product ?? row?.["Mặt hàng"] ?? row?.mat_hang ?? "").trim();
}

function getMarket(row) {
  return String(row?.country ?? row?.["Khu vực"] ?? row?.khu_vuc ?? row?.market ?? "").trim();
}

function getShipping(row) {
  return String(
    row?.shipping_unit ?? row?.["Đơn vị vận chuyển"] ?? row?.don_vi_van_chuyen ?? row?.["Đơn_vị_vận_chuyển"] ?? ""
  ).trim();
}

function getRevenue(row) {
  const v = row?.total_amount_vnd ?? row?.["Tổng tiền VNĐ"] ?? row?.total_amount;
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[^\d.-]/g, "").replace(/^-/, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatMoneyVnd(n) {
  return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
}

function formatCell(key, val) {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Có" : "Không";
  if (typeof val === "object") return JSON.stringify(val);
  const s = String(val);
  if (
    (key === "pushed_at" ||
      key === "created_at" ||
      key === "updated_at" ||
      key === "inserted_at" ||
      key === "push_date") &&
    s
  ) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString("vi-VN");
  }
  if (
    key === "total_amount_vnd" ||
    key === "Tổng tiền VNĐ" ||
    key === "total_amount"
  ) {
    const n = getRevenue({ [key]: val });
    if (n !== 0 || val === 0) return formatMoneyVnd(n);
  }
  return s;
}

function collectVisibleColumnKeys(rows) {
  const set = new Set();
  rows.forEach((r) => {
    if (r && typeof r === "object") {
      Object.keys(r).forEach((k) => {
        if (!HIDDEN_COLUMNS.has(k)) set.add(k);
      });
    }
  });
  const preferred = PREFERRED_COL_ORDER.filter((k) => set.has(k));
  const rest = [...set].filter((k) => !PREFERRED_COL_ORDER.includes(k)).sort();
  return [...preferred, ...rest];
}

function distinctOptions(rows, getter) {
  const m = new Map();
  rows.forEach((r) => {
    const v = getter(r);
    const key = v === "" ? EMPTY_TOKEN : v;
    if (!m.has(key)) m.set(key, v === "" ? "(Trống)" : v);
  });
  return [...m.entries()]
    .sort((a, b) => String(a[1]).localeCompare(String(b[1]), "vi"))
    .map(([value, label]) => ({ value, label }));
}

function rowMatchesMultiSelect(selected, getter) {
  if (!selected || selected.length === 0) return true;
  const v = getter();
  const token = v === "" ? EMPTY_TOKEN : v;
  return selected.includes(token);
}

const PIVOT_MARKET_BG = ["bg-violet-100/90", "bg-orange-100/90", "bg-cyan-100/80", "bg-amber-50", "bg-pink-100/80", "bg-teal-50"];

function pivotMarketRowClass(market) {
  let h = 0;
  const s = String(market);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return PIVOT_MARKET_BG[Math.abs(h) % PIVOT_MARKET_BG.length];
}

function formatPivotDayHeader(dayKey) {
  if (dayKey === "_unknown") return "Không rõ ngày";
  const d = new Date(dayKey + "T12:00:00");
  return Number.isNaN(d.getTime()) ? dayKey : d.toLocaleDateString("vi-VN");
}

/** Bảng chữ thập: Thị trường × Sản phẩm × ngày (đếm đơn). */
function buildPivotMatrix(rows) {
  const datesSet = new Set();
  const tree = new Map();
  rows.forEach((r) => {
    const m = getMarket(r) || "(Trống)";
    const p = getProduct(r) || "(Trống)";
    const d = getRowDayKey(r) || "_unknown";
    datesSet.add(d);
    if (!tree.has(m)) tree.set(m, new Map());
    const pm = tree.get(m);
    if (!pm.has(p)) pm.set(p, new Map());
    const dm = pm.get(p);
    dm.set(d, (dm.get(d) || 0) + 1);
  });
  const dates = [...datesSet].sort((a, b) => {
    if (a === "_unknown") return 1;
    if (b === "_unknown") return -1;
    return b.localeCompare(a);
  });
  const colTotals = {};
  dates.forEach((day) => {
    colTotals[day] = rows.filter((r) => (getRowDayKey(r) || "_unknown") === day).length;
  });
  const markets = [...tree.keys()].sort((a, b) => a.localeCompare(b, "vi"));
  const marketGroups = markets.map((market) => {
    const pm = tree.get(market);
    const products = [...pm.keys()].sort((a, b) => a.localeCompare(b, "vi"));
    return {
      market,
      products: products.map((product) => {
        const dm = pm.get(product);
        const byDate = {};
        dates.forEach((day) => {
          byDate[day] = dm.get(day) || 0;
        });
        return { product, byDate };
      }),
    };
  });
  return { dates, colTotals, marketGroups };
}

function FilterCheckboxDropdown({ label, options, value, onChange, menuKey, openMenu, setOpenMenu }) {
  const wrapRef = useRef(null);
  const isOpen = openMenu === menuKey;

  useEffect(() => {
    if (!isOpen) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [isOpen, setOpenMenu]);

  const toggleToken = (token) => {
    if (value.includes(token)) onChange(value.filter((v) => v !== token));
    else onChange([...value, token]);
  };

  const summary =
    value.length === 0
      ? "Tất cả"
      : value.length <= 2
        ? value.map((v) => options.find((o) => o.value === v)?.label ?? v).join(", ")
        : `${value.length} mục đã chọn`;

  return (
    <div className="relative flex flex-col gap-1" ref={wrapRef}>
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <button
        type="button"
        onClick={() => setOpenMenu(isOpen ? null : menuKey)}
        className="flex items-center justify-between gap-2 min-w-[168px] max-w-[240px] px-3 py-2 text-left text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <span className="truncate text-gray-800" title={summary}>
          {summary}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-[150] w-[min(300px,90vw)] max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">Không có lựa chọn</div>
          ) : (
            options.map(({ value: optVal, label: optLabel }) => (
              <label
                key={optVal}
                className="flex items-start gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={value.includes(optVal)}
                  onChange={() => toggleToken(optVal)}
                  className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="break-words leading-snug">{optLabel}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BangDoiSoatDayFFMInner({
  logsTable = "ffm_push_logs",
  ordersTable = "orders",
  pageTitle = "Bảng đối soát đẩy FFM",
  sourceTableLabel = "ffm_push_logs",
  ordersTableLabel = "orders",
  /** Một mã quyền (mặc định) */
  permissionCode = "ORDERS_LIST",
  /** Nếu có: đủ một trong các mã là được (ưu tiên hơn `permissionCode` khi length > 0) */
  permissionCodes = null,
} = {}) {
  const { canView } = usePermissions();
  const allowed = useMemo(() => {
    if (Array.isArray(permissionCodes) && permissionCodes.length > 0) {
      return permissionCodes.some((c) => canView(c));
    }
    return canView(permissionCode);
  }, [canView, permissionCode, permissionCodes]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selProduct, setSelProduct] = useState([]);
  const [selMarket, setSelMarket] = useState([]);
  const [selShipping, setSelShipping] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [openFilterMenu, setOpenFilterMenu] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await API.fetchFfmPushLogsForReconciliation({ logsTable });
      setRows(data);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Không tải được dữ liệu");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [logsTable]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSyncFromOrders = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await API.syncFfmPushLogsFromOrders({ logsTable, ordersTable });
      const parts = [
        `Đã quét ${r.scanned} dòng log`,
        r.needCount === 0
          ? "— không có dòng thiếu snapshot."
          : `— ${r.needCount} dòng thiếu dữ liệu`,
        r.updated > 0 ? `Cập nhật ${r.updated} dòng từ bảng orders.` : "",
        r.missingOrder > 0 ? `Không tìm thấy đơn: ${r.missingOrder} dòng.` : "",
        r.skippedNoPatch > 0 ? `Bỏ qua ${r.skippedNoPatch} (orders không có giá trị tương ứng).` : "",
        r.failed > 0 ? `Lỗi cập nhật: ${r.failed}.` : "",
      ].filter(Boolean);
      toast.success(parts.join(" "), { position: "top-right", autoClose: 6000 });
      await load();
    } catch (e) {
      console.error(e);
      toast.error("Đồng bộ thất bại: " + (e?.message || ""), { position: "top-right", autoClose: 5000 });
    } finally {
      setSyncing(false);
    }
  }, [load, logsTable, ordersTable]);

  const filterOptions = useMemo(
    () => ({
      products: distinctOptions(rows, getProduct),
      markets: distinctOptions(rows, getMarket),
      shippings: distinctOptions(rows, getShipping),
    }),
    [rows]
  );

  const filteredRows = useMemo(() => {
    let data = rows;
    const q = search.trim().toLowerCase();
    if (q) {
      data = data.filter((r) => {
        const blob = Object.entries(r || {})
          .filter(([k]) => !HIDDEN_COLUMNS.has(k))
          .map(([, v]) => (v == null ? "" : String(v)))
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      });
    }
    data = data.filter((r) => {
      const day = getRowDayKey(r);
      if (dateFrom && (!day || day < dateFrom)) return false;
      if (dateTo && (!day || day > dateTo)) return false;
      return true;
    });
    data = data.filter((r) => rowMatchesMultiSelect(selProduct, () => getProduct(r)));
    data = data.filter((r) => rowMatchesMultiSelect(selMarket, () => getMarket(r)));
    data = data.filter((r) => rowMatchesMultiSelect(selShipping, () => getShipping(r)));
    return data;
  }, [rows, search, dateFrom, dateTo, selProduct, selMarket, selShipping]);

  const checkboxFilterActive =
    selProduct.length > 0 || selMarket.length > 0 || selShipping.length > 0;

  const pivotMatrix = useMemo(() => {
    if (!checkboxFilterActive || filteredRows.length === 0) return null;
    return buildPivotMatrix(filteredRows);
  }, [filteredRows, checkboxFilterActive]);

  const grandCount = filteredRows.length;
  const grandRevenue = useMemo(
    () => filteredRows.reduce((s, r) => s + getRevenue(r), 0),
    [filteredRows]
  );

  const groupedByDay = useMemo(() => {
    const map = new Map();
    filteredRows.forEach((r) => {
      const day = getRowDayKey(r) || "_unknown";
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(r);
    });
    const keys = [...map.keys()].sort((a, b) => {
      if (a === "_unknown") return 1;
      if (b === "_unknown") return -1;
      return b.localeCompare(a);
    });
    return keys.map((day) => {
      const list = map.get(day);
      const count = list.length;
      const revenue = list.reduce((s, r) => s + getRevenue(r), 0);
      return { day, list, count, revenue };
    });
  }, [filteredRows]);

  const columns = useMemo(() => collectVisibleColumnKeys(filteredRows.length ? filteredRows : rows), [rows, filteredRows]);

  const resetFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSelProduct([]);
    setSelMarket([]);
    setSelShipping([]);
    setSearch("");
    setOpenFilterMenu(null);
  };

  if (!allowed) {
    const hint =
      Array.isArray(permissionCodes) && permissionCodes.length > 0
        ? permissionCodes.join(" hoặc ")
        : permissionCode;
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        Bạn không có quyền truy cập trang này ({hint}).
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="bg-white shadow-sm sticky top-0 z-20 border-b border-gray-200">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <h1 className="text-xl font-bold text-gray-900">{pageTitle}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="search"
                  placeholder="Tìm trong bảng..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                Làm mới
              </button>
              <button
                type="button"
                onClick={handleSyncFromOrders}
                disabled={loading || syncing}
                title={`Điền Sản phẩm, Thị trường, Chi nhánh, Tổng tiền VNĐ từ bảng ${ordersTableLabel} theo order_code (chỉ ô đang trống)`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
              >
                <Database className={`w-4 h-4 ${syncing ? "animate-pulse" : ""}`} />
                {syncing ? "Đang đồng bộ…" : "Đồng bộ từ đơn hàng"}
              </button>
            </div>
          </div>

          <div className="pb-4 flex flex-wrap gap-4 items-end border-b border-gray-100">
            <div className="flex flex-wrap gap-3 items-end">
              <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                Từ ngày
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                Đến ngày
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                />
              </label>
              <p className="text-[11px] text-gray-500 max-w-[220px] leading-snug m-0 self-end pb-1">
                Lọc và nhóm theo ngày dựa trên cột <code className="bg-gray-100 px-0.5 rounded">pushed_at</code>
                {` `}(nếu trống mới dùng các cột thời gian khác).
              </p>
            </div>
            <FilterCheckboxDropdown
              label="Sản phẩm"
              options={filterOptions.products}
              value={selProduct}
              onChange={setSelProduct}
              menuKey="product"
              openMenu={openFilterMenu}
              setOpenMenu={setOpenFilterMenu}
            />
            <FilterCheckboxDropdown
              label="Thị trường"
              options={filterOptions.markets}
              value={selMarket}
              onChange={setSelMarket}
              menuKey="market"
              openMenu={openFilterMenu}
              setOpenMenu={setOpenFilterMenu}
            />
            <FilterCheckboxDropdown
              label="Đơn vị vận chuyển"
              options={filterOptions.shippings}
              value={selShipping}
              onChange={setSelShipping}
              menuKey="shipping"
              openMenu={openFilterMenu}
              setOpenMenu={setOpenFilterMenu}
            />
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Xóa lọc
            </button>
            <p className="w-full text-[11px] text-gray-400 m-0 basis-full">
              Sản phẩm, Thị trường, ĐVC: bấm sổ xuống và tick chọn (để trống = tất cả). Khi đã tick ít nhất một mục, bảng tổng hợp Thị trường × Sản phẩm × ngày hiện bên dưới.
            </p>
          </div>

          <div className="py-3 flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-gray-500">Tổng số đơn (sau lọc):</span>{" "}
              <span className="font-bold text-blue-700 tabular-nums">{grandCount.toLocaleString("vi-VN")}</span>
            </div>
            <div>
              <span className="text-gray-500">Tổng doanh số:</span>{" "}
              <span className="font-bold text-emerald-700 tabular-nums">{formatMoneyVnd(grandRevenue)}</span>
            </div>
            <p className="text-xs text-gray-500 w-full m-0">
              Nguồn: <code className="bg-gray-100 px-1 rounded">{sourceTableLabel}</code>
              {ordersTableLabel !== sourceTableLabel && (
                <span className="ml-1">
                  · Đồng bộ snapshot từ <code className="bg-gray-100 px-1 rounded">{ordersTableLabel}</code>
                </span>
              )}
              {rows.length > 0 && (
                <span className="ml-2">
                  · Đã tải {rows.length} dòng · Hiển thị theo nhóm ngày (ẩn cột ID, mã lô, mã đơn)
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">{error}</div>
        )}
        {loading && rows.length === 0 ? (
          <div className="py-20 text-center text-gray-500">Đang tải…</div>
        ) : (
          <>
            {checkboxFilterActive && (
              <section className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden mb-6">
                <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-sm font-bold text-gray-800 m-0">
                    Bảng tổng hợp (theo tick bộ lọc)
                  </h2>
                  <p className="text-xs text-gray-500 m-0 mt-0.5">
                    Hàng <strong>Tổng</strong> = số đơn theo từng ngày; ô trong bảng = số đơn theo Thị trường + Sản phẩm + ngày (
                    <code className="bg-gray-100 px-0.5 rounded">pushed_at</code>).
                  </p>
                </div>
                {filteredRows.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm">
                    Đã chọn bộ lọc nhưng không có dòng phù hợp.
                  </div>
                ) : (
                  pivotMatrix && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-emerald-600 text-white">
                            <th className="text-left font-bold px-3 py-2.5 border border-emerald-700 whitespace-nowrap min-w-[100px]">
                              Thị trường
                            </th>
                            <th className="text-left font-bold px-3 py-2.5 border border-emerald-700 whitespace-nowrap min-w-[140px]">
                              Sản phẩm
                            </th>
                            {pivotMatrix.dates.map((day) => (
                              <th
                                key={day}
                                className="text-center font-bold px-3 py-2.5 border border-emerald-700 whitespace-nowrap tabular-nums min-w-[88px]"
                              >
                                {formatPivotDayHeader(day)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-lime-400 font-bold text-gray-900">
                            <td className="px-3 py-2 border border-gray-300" colSpan={2}>
                              Tổng
                            </td>
                            {pivotMatrix.dates.map((day) => (
                              <td
                                key={day}
                                className="text-center px-3 py-2 border border-gray-300 tabular-nums"
                              >
                                {(pivotMatrix.colTotals[day] ?? 0).toLocaleString("vi-VN")}
                              </td>
                            ))}
                          </tr>
                          {pivotMatrix.marketGroups.flatMap(({ market, products }) => {
                            const bg = pivotMarketRowClass(market);
                            return products.map(({ product, byDate }, pIdx) => (
                              <tr key={`${market}-${product}`} className={bg}>
                                {pIdx === 0 ? (
                                  <td
                                    className="align-top px-3 py-2 border border-gray-300 font-semibold text-gray-800 whitespace-nowrap"
                                    rowSpan={products.length}
                                  >
                                    {market}
                                  </td>
                                ) : null}
                                <td className="px-3 py-2 border border-gray-300 text-gray-800">{product}</td>
                                {pivotMatrix.dates.map((day) => (
                                  <td
                                    key={day}
                                    className="text-center px-3 py-2 border border-gray-300 tabular-nums text-gray-900"
                                  >
                                    {(byDate[day] ?? 0).toLocaleString("vi-VN")}
                                  </td>
                                ))}
                              </tr>
                            ));
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </section>
            )}

            {groupedByDay.length === 0 && !checkboxFilterActive ? (
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500 italic">
                {rows.length === 0 ? "Chưa có dữ liệu." : "Không có dòng khớp bộ lọc."}
              </div>
            ) : groupedByDay.length > 0 ? (
              groupedByDay.map(({ day, list, count, revenue }) => (
                <section
                  key={day}
                  className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden"
                >
                  <div className="bg-slate-100 px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200">
                    <h2 className="text-base font-bold text-slate-800 m-0">
                      {day === "_unknown"
                        ? "Không xác định ngày"
                        : new Date(day + "T12:00:00").toLocaleDateString("vi-VN")}
                    </h2>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span>
                        <span className="text-gray-600">Số đơn:</span>{" "}
                        <strong className="text-blue-700 tabular-nums">{count.toLocaleString("vi-VN")}</strong>
                      </span>
                      <span>
                        <span className="text-gray-600">Doanh số:</span>{" "}
                        <strong className="text-emerald-700 tabular-nums">{formatMoneyVnd(revenue)}</strong>
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-auto max-h-[min(480px,55vh)] overflow-y-auto">
                    <table className="min-w-full text-sm border-collapse">
                      <thead className="bg-gray-50 sticky top-0 z-[1]">
                        <tr>
                          {columns.map((col) => (
                            <th
                              key={col}
                              className="text-left font-semibold text-gray-700 px-3 py-2 border-b border-gray-200 whitespace-nowrap"
                            >
                              {FFM_PUSH_LOG_LABELS[col] || col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((row, idx) => (
                          <tr
                            key={`${day}-${idx}-${getProduct(row)}-${getMarket(row)}`}
                            className="hover:bg-gray-50/80"
                          >
                            {columns.map((col) => (
                              <td key={col} className="px-3 py-2 border-b border-gray-100 align-top max-w-[320px]">
                                <span className="break-words">{formatCell(col, row[col])}</span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** Hà Nội / mặc định: `ffm_push_logs` + đồng bộ từ `orders`. */
export default function BangDoiSoatDayFFM() {
  return <BangDoiSoatDayFFMInner />;
}

/** HCM: `ffm_push_logs_hcm` + đồng bộ từ `order_code_hcm`. */
export function BangDoiSoatDayFFMHcm() {
  return (
    <BangDoiSoatDayFFMInner
      logsTable="ffm_push_logs_hcm"
      ordersTable="order_code_hcm"
      pageTitle="Bảng đối soát đẩy FFM (HCM)"
      sourceTableLabel="ffm_push_logs_hcm"
      ordersTableLabel="order_code_hcm"
      permissionCodes={[
        "ORDERS_FFM_RECONCILE_HCM",
        "ORDERS_FFM_RECONCILE",
        "ORDERS_LIST_HCM",
      ]}
    />
  );
}
