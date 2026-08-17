import {
  AlertCircle,
  BarChart3,
  CheckCircle,
  Clock,
  GitBranch,
  GitMerge,
  History,
  Info,
  LayoutGrid,
  Package,
  PlayCircle,
  RefreshCw,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import {
  buildU1HistoryStaffSummary,
  fetchDanhSachVanDonU1History,
  formatU1HistoryTimeOnly,
  groupU1HistoryByDate,
  historyRowMatchesBranch,
  u1HistoryActionLabel,
} from '../../services/danhSachVanDonU1History';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '../../supabase/config';
import {
  buildPhanBoBranchReportModel,
  buildPhanBoSummaryFlatRows,
  buildVanDonU1StaffOrderFromRows,
  chiTietChiaKeyLabelVi,
  fetchOrderRowsWithChiTietForReportRange,
  fetchPagedSupabaseSelect,
  formatChiTietChiaReportCell,
  matchHistorySessionsToChiDetailClusters,
  normalizeHistoryBranchKey,
  normalizeNameKeyForStaffSort,
  parseHistoryChiaDonStoredJson,
  parseStaffStatsForReport,
  PHAN_BO_DETAIL_ROW_LIMIT,
  clusterChiTietOrderRowsMerged,
} from '../../utils/chiaDonVanDonReport';

const defaultStartDate = () =>
  new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().slice(0, 10);
const defaultEndDate = () => new Date().toISOString().slice(0, 10);

const HISTORY_SELECT =
  'id, branch, created_at, status, staff_stats, total_orders, performed_by, phien_chia';

const ALL_BRANCH_KEYS = ['HCM', 'Hà Nội'];

function displayPhienField(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

function buildStaffLowCountReasons({ name, count, maxCount, nkTarget, activeBranchModel }) {
  const reasons = [];
  const diff = maxCount - count;

  const sessionsParticipated = new Set();
  activeBranchModel.flatDetailRows.forEach((r) => {
    if (normalizeNameKeyForStaffSort(r.row?.delivery_staff) === nkTarget) {
      sessionsParticipated.add(r.sessionOrdinal);
    }
  });
  const allSessions = new Set(activeBranchModel.flatDetailRows.map((r) => r.sessionOrdinal));
  const missedSessions = [...allSessions].filter((s) => !sessionsParticipated.has(s));
  if (missedSessions.length > 0) {
    reasons.push({
      icon: '🚫',
      title: 'Vắng mặt ở một số phiên',
                    detail: `Không tham gia phiên: ${missedSessions.map((s) => `Vòng ${s}`).join(', ')}. Có thể do trạng thái không phải U1/U2 hoặc chưa được bật tại thời điểm chia.`,
      severity: 'high',
    });
  }

  const myRows = activeBranchModel.flatDetailRows.filter(
    (r) => normalizeNameKeyForStaffSort(r.row?.delivery_staff) === nkTarget
  );
  const firstTurn = myRows[0];
  if (firstTurn) {
    const queue = firstTurn.row?.chi_tiet_chia?.queue_before || firstTurn.row?.queue_before;
    if (Array.isArray(queue)) {
      const myPos = queue.findIndex((q) => String(q || '').trim().toLowerCase() === name.toLowerCase());
      if (myPos > 0) {
        reasons.push({
          icon: '📍',
          title: 'Đứng sau trong hàng đợi',
          detail: `Vị trí xuất phát: #${myPos + 1}/${queue.length} trong hàng đợi. Những người đứng trước nhận đơn trước theo luân phiên.`,
          severity: 'low',
        });
      }
    }
  }

  if (diff === 1 && reasons.length === 0) {
    reasons.push({
      icon: '⚖️',
      title: 'Chênh lệch do chia lẻ (bình thường)',
      detail: `Tổng đơn không chia đều cho ${activeBranchModel.staffEntries.length} người → một số người nhận thêm 1 đơn. Phiên sau hệ thống tự cân bằng.`,
      severity: 'low',
    });
  }

  if (reasons.length === 0 && diff > 1) {
    reasons.push({
      icon: '🔍',
      title: 'Có thể do eligibility lệch',
      detail: `Chênh ${diff} đơn. Một số đơn chỉ khớp với ít người → những người đó nhận nhiều hơn.`,
      severity: 'medium',
    });
  }

  return reasons;
}

/**
 * @param {object} props
 * @param {() => void} props.onClose
 * @param {string[] | null} [props.allowedBranchKeys] null = admin xem tất cả chi nhánh
 */
export default function BaoCaoPhanBoDonHangReport({ onClose, allowedBranchKeys = null }) {
  const [historyChiaDon, setHistoryChiaDon] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStartDate, setHistoryStartDate] = useState(() => defaultStartDate());
  const [historyEndDate, setHistoryEndDate] = useState(() => defaultEndDate());
  const [staffStatsReportByBranch, setStaffStatsReportByBranch] = useState({ HCM: {}, 'Hà Nội': {} });
  const [successSessionCountByBranch, setSuccessSessionCountByBranch] = useState({ HCM: 0, 'Hà Nội': 0 });
  const [successTotalOrdersByBranch, setSuccessTotalOrdersByBranch] = useState({ HCM: 0, 'Hà Nội': 0 });
  const [chiaDonVanDonStaffOrder, setChiaDonVanDonStaffOrder] = useState({ HCM: [], 'Hà Nội': [] });
  const [chiTietFromOrdersLookup, setChiTietFromOrdersLookup] = useState({});
  const [chiaReportMergedChiTietRows, setChiaReportMergedChiTietRows] = useState([]);
  const [staffReasonPopover, setStaffReasonPopover] = useState(null);
  const [activeBranch, setActiveBranch] = useState('HCM');
  const [showAllDetailRows, setShowAllDetailRows] = useState(false);
  const [showStaffTurnTags, setShowStaffTurnTags] = useState(false);
  const [orderRowCount, setOrderRowCount] = useState(0);
  const [u1HistoryRows, setU1HistoryRows] = useState([]);
  const [u1HistoryStaffFilter, setU1HistoryStaffFilter] = useState('');
  const [u1HistoryTableMissing, setU1HistoryTableMissing] = useState(false);

  const handleRefreshAll = useCallback(async () => {
    setHistoryLoading(true);
    setShowAllDetailRows(false);
    setStaffReasonPopover(null);
    try {
      const startDate = new Date(`${historyStartDate}T00:00:00+07:00`);
      const endDate = new Date(`${historyEndDate}T23:59:59.999+07:00`);

      const [historyRes, merged] = await Promise.all([
        fetchPagedSupabaseSelect(
          'history_chia_don',
          HISTORY_SELECT,
          (q) => q.gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString()),
          { orderColumn: 'created_at', ascending: false, maxPages: 50 }
        ),
        fetchOrderRowsWithChiTietForReportRange(historyStartDate, historyEndDate),
      ]);

      if (historyRes.error) throw historyRes.error;

      const data = historyRes.data || [];
      setHistoryChiaDon(data);
      setChiaReportMergedChiTietRows(Array.isArray(merged) ? merged : []);
      setOrderRowCount(Array.isArray(merged) ? merged.length : 0);

      const byBranch = { HCM: {}, 'Hà Nội': {} };
      const sessionCount = { HCM: 0, 'Hà Nội': 0 };
      const totalOrders = { HCM: 0, 'Hà Nội': 0 };
      const isSuccess = (raw) => String(raw || '').trim().toLowerCase() === 'success';

      data
        .filter((s) => isSuccess(s.status))
        .forEach((session) => {
          const br = normalizeHistoryBranchKey(session.branch);
          if (!br) return;
          sessionCount[br] += 1;
          totalOrders[br] += Number(session.total_orders) || 0;
          const stats = parseStaffStatsForReport(session.staff_stats);
          Object.entries(stats).forEach(([name, count]) => {
            byBranch[br][name] = (byBranch[br][name] || 0) + (Number(count) || 0);
          });
        });

      setStaffStatsReportByBranch(byBranch);
      setSuccessSessionCountByBranch(sessionCount);
      setSuccessTotalOrdersByBranch(totalOrders);

      if (data.length > 0) {
        const clusters = clusterChiTietOrderRowsMerged(merged || []);
        const mapObj = {};
        matchHistorySessionsToChiDetailClusters(data, clusters).forEach((list, hid) => {
          mapObj[String(hid)] = list;
        });
        setChiTietFromOrdersLookup(mapObj);
      } else {
        setChiTietFromOrdersLookup({});
      }

      try {
        const u1Rows = await fetchDanhSachVanDonU1History({
          startDate: historyStartDate,
          endDate: historyEndDate,
          limit: 1000,
        });
        setU1HistoryRows(u1Rows);
        setU1HistoryTableMissing(false);
      } catch (u1Err) {
        const u1Msg = String(u1Err?.message || '');
        setU1HistoryRows([]);
        setU1HistoryTableMissing(u1Msg.includes('danh_sach_van_don_u1_history'));
        if (!u1Msg.includes('danh_sach_van_don_u1_history')) {
          console.warn('[Báo cáo phân bổ] Lịch sử U1:', u1Err);
        }
      }
    } catch (err) {
      console.error('❌ [Báo cáo phân bổ] Lỗi:', err);
      toast.error('Lỗi khi tải báo cáo phân bổ');
      setChiTietFromOrdersLookup({});
      setChiaReportMergedChiTietRows([]);
      setOrderRowCount(0);
      setU1HistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyStartDate, historyEndDate]);

  useEffect(() => {
    handleRefreshAll();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('danh_sach_van_don')
          .select('ho_va_ten, chi_nhanh, trang_thai_chia')
          .order('ho_va_ten', { ascending: true });
        if (cancelled) return;
        if (error) {
          console.error('❌ [Báo cáo chia đơn] Không tải thứ tự U1:', error);
          return;
        }
        setChiaDonVanDonStaffOrder(buildVanDonU1StaffOrderFromRows(data || []));
      } catch (e) {
        if (!cancelled) console.error('❌ [Báo cáo chia đơn] Exception tải U1:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const summaryFlatRows = useMemo(
    () => buildPhanBoSummaryFlatRows(staffStatsReportByBranch, chiaDonVanDonStaffOrder),
    [staffStatsReportByBranch, chiaDonVanDonStaffOrder]
  );

  const branchReportModels = useMemo(
    () =>
      ALL_BRANCH_KEYS.map((branchKey) =>
        buildPhanBoBranchReportModel({
          branchKey,
          historyChiaDon,
          chiTietFromOrdersLookup,
          chiaReportMergedChiTietRows,
          chiaDonVanDonStaffOrder,
        })
      ),
    [historyChiaDon, chiTietFromOrdersLookup, chiaReportMergedChiTietRows, chiaDonVanDonStaffOrder]
  );

  const visibleBranchKeys = useMemo(() => {
    if (!allowedBranchKeys || allowedBranchKeys.length === 0) return ALL_BRANCH_KEYS;
    return ALL_BRANCH_KEYS.filter((k) => allowedBranchKeys.includes(k));
  }, [allowedBranchKeys]);

  const visibleBranchModels = useMemo(
    () => branchReportModels.filter((m) => visibleBranchKeys.includes(m.key)),
    [branchReportModels, visibleBranchKeys]
  );

  useEffect(() => {
    if (visibleBranchKeys.length >= 1 && !visibleBranchKeys.includes(activeBranch)) {
      setActiveBranch(visibleBranchKeys[0]);
      setShowAllDetailRows(false);
      setStaffReasonPopover(null);
    }
  }, [visibleBranchKeys, activeBranch]);

  useEffect(() => {
    setU1HistoryStaffFilter('');
  }, [activeBranch]);

  const u1HistoryForBranch = useMemo(
    () => u1HistoryRows.filter((r) => historyRowMatchesBranch(r, activeBranch)),
    [u1HistoryRows, activeBranch]
  );

  const u1HistoryStaffOptions = useMemo(() => {
    const names = new Set(u1HistoryForBranch.map((r) => String(r.ho_va_ten || '').trim()).filter(Boolean));
    (chiaDonVanDonStaffOrder?.[activeBranch] || []).forEach((n) => names.add(String(n).trim()));
    return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [u1HistoryForBranch, chiaDonVanDonStaffOrder, activeBranch]);

  const u1HistoryFiltered = useMemo(() => {
    if (!u1HistoryStaffFilter) return u1HistoryForBranch;
    return u1HistoryForBranch.filter((r) => String(r.ho_va_ten || '').trim() === u1HistoryStaffFilter);
  }, [u1HistoryForBranch, u1HistoryStaffFilter]);

  const u1StaffSummary = useMemo(() => buildU1HistoryStaffSummary(u1HistoryForBranch), [u1HistoryForBranch]);

  const u1HistoryByDate = useMemo(() => groupU1HistoryByDate(u1HistoryFiltered), [u1HistoryFiltered]);

  const activeBranchModel =
    visibleBranchModels.find((m) => m.key === activeBranch) || visibleBranchModels[0];

  const visibleDetailRows = useMemo(() => {
    const rows = activeBranchModel?.flatDetailRows || [];
    if (showAllDetailRows || rows.length <= PHAN_BO_DETAIL_ROW_LIMIT) return rows;
    return rows.slice(0, PHAN_BO_DETAIL_ROW_LIMIT);
  }, [activeBranchModel, showAllDetailRows]);

  const hiddenDetailCount =
    (activeBranchModel?.flatDetailRows?.length || 0) - visibleDetailRows.length;

  const summaryByBranch = useMemo(
    () => ({
      HCM: summaryFlatRows.filter((r) => r.branchKey === 'HCM'),
      'Hà Nội': summaryFlatRows.filter((r) => r.branchKey === 'Hà Nội'),
    }),
    [summaryFlatRows]
  );

  const summaryBranchPanels = [
    {
      key: 'HCM',
      label: 'HCM',
      countBg: 'bg-orange-50 text-orange-800',
      sessionCount: Number(successSessionCountByBranch?.HCM) || 0,
      orderCount: Number(successTotalOrdersByBranch?.HCM) || 0,
    },
    {
      key: 'Hà Nội',
      label: 'Hà Nội',
      countBg: 'bg-indigo-50 text-indigo-900',
      sessionCount: Number(successSessionCountByBranch?.['Hà Nội']) || 0,
      orderCount: Number(successTotalOrdersByBranch?.['Hà Nội']) || 0,
    },
  ];

  const activeSummaryPanel = summaryBranchPanels.find((p) => p.key === activeBranch) || summaryBranchPanels[0];
  const activeSummaryRows = summaryByBranch[activeBranch] || [];

  const staffMaxCount =
    activeBranchModel?.staffEntries?.length > 0
      ? Math.max(...activeBranchModel.staffEntries.map(([, c]) => c))
      : 0;

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-slate-100">
      <div className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="rounded-lg bg-blue-50 p-1.5">
              <BarChart3 className="h-5 w-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-slate-900 sm:text-lg">Báo cáo phân bổ đơn hàng</h1>
              <p className="hidden text-[11px] text-slate-500 sm:block">Phiên chia đơn · sản lượng NV U1</p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Từ</span>
              <input
                type="date"
                value={historyStartDate}
                onChange={(e) => setHistoryStartDate(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 px-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Đến</span>
              <input
                type="date"
                value={historyEndDate}
                onChange={(e) => setHistoryEndDate(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 px-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={historyLoading}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
            >
              {historyLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Tải
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {!historyLoading && (
              <span className="hidden text-[11px] text-slate-400 lg:inline">
                {orderRowCount.toLocaleString('vi-VN')} đơn chi tiết
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Đóng"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {historyLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/60 backdrop-blur-[1px]">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        )}

        <div className="mx-auto max-w-[1600px] space-y-4">
          {visibleBranchKeys.length > 1 ? (
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {visibleBranchModels.map((m) => {
                const isActive = activeBranch === m.key;
                const activeCls =
                  m.key === 'HCM' ? 'bg-orange-600 text-white shadow-sm' : 'bg-indigo-600 text-white shadow-sm';
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => {
                      setActiveBranch(m.key);
                      setShowAllDetailRows(false);
                      setStaffReasonPopover(null);
                    }}
                    className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors sm:text-sm ${
                      isActive ? activeCls : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {m.key}
                    <span className={`ml-1.5 font-normal ${isActive ? 'text-white/85' : 'text-slate-400'}`}>
                      {m.total} phiên · {m.flatDetailRows.length} dòng
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            visibleBranchKeys[0] && (
              <div
                className={`inline-flex items-center rounded-xl border px-4 py-2 text-sm font-bold shadow-sm ${
                  visibleBranchKeys[0] === 'HCM'
                    ? 'border-orange-200 bg-orange-50 text-orange-800'
                    : 'border-indigo-200 bg-indigo-50 text-indigo-900'
                }`}
              >
                Chi nhánh: {visibleBranchKeys[0]}
                {activeBranchModel && (
                  <span className="ml-2 text-xs font-normal opacity-75">
                    {activeBranchModel.total} phiên · {activeBranchModel.flatDetailRows.length} dòng
                  </span>
                )}
              </div>
            )
          )}

          {activeBranchModel && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'Phiên thành công', value: activeSummaryPanel?.sessionCount ?? 0 },
                  { label: 'Tổng đơn', value: activeSummaryPanel?.orderCount ?? 0 },
                  { label: 'Dòng chi tiết', value: activeBranchModel.flatDetailRows.length },
                  { label: 'NV có đơn', value: activeBranchModel.staffEntries.length },
                ].map((kpi) => (
                  <div key={kpi.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{kpi.label}</p>
                    <p className="text-xl font-bold tabular-nums text-slate-900">{kpi.value}</p>
                  </div>
                ))}
              </div>

              <details open className="group rounded-xl border border-slate-200 bg-white shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <History className="h-4 w-4 text-indigo-600" />
                    Lịch sử bật/tắt U1 · {activeBranch}
                  </span>
                  <span className="text-[11px] text-slate-400 group-open:hidden">Mở bảng</span>
                </summary>
                <div className="space-y-4 border-t border-slate-100 p-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <p className="text-[11px] text-slate-500">
                      Khoảng ngày: <strong>{historyStartDate}</strong> → <strong>{historyEndDate}</strong> (theo
                      bộ lọc trên)
                    </p>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Nhân sự
                      </span>
                      <select
                        value={u1HistoryStaffFilter}
                        onChange={(e) => setU1HistoryStaffFilter(e.target.value)}
                        className="h-9 min-w-[200px] rounded-lg border border-slate-200 px-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      >
                        <option value="">Tất cả nhân sự</option>
                        {u1HistoryStaffOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {u1HistoryTableMissing ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Chưa có bảng <code className="font-mono">danh_sach_van_don_u1_history</code> trên Supabase.
                      Chạy migration <code className="font-mono">20260604120000_danh_sach_van_don_u1_history.sql</code>.
                    </p>
                  ) : (
                    <>
                      <div>
                        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
                          <UserCheck className="h-3.5 w-3.5" />
                          Tổng hợp theo nhân sự
                        </h3>
                        <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-48 overflow-y-auto">
                          <table className="w-full text-left text-[11px]">
                            <thead className="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
                              <tr>
                                <th className="px-3 py-2">Nhân sự</th>
                                <th className="px-3 py-2 text-center text-green-700">Bật U1</th>
                                <th className="px-3 py-2 text-center text-amber-700">Tắt U1</th>
                                <th className="px-3 py-2 text-center">Khác</th>
                                <th className="px-3 py-2 text-right">Tổng</th>
                              </tr>
                            </thead>
                            <tbody>
                              {u1StaffSummary.length > 0 ? (
                                u1StaffSummary.map((s) => (
                                  <tr
                                    key={s.name}
                                    className={`border-t border-slate-50 hover:bg-slate-50/80 ${
                                      u1HistoryStaffFilter === s.name ? 'bg-indigo-50/60' : ''
                                    }`}
                                  >
                                    <td className="px-3 py-1.5 font-medium text-slate-800">
                                      <button
                                        type="button"
                                        className="text-left hover:text-indigo-700 hover:underline"
                                        onClick={() =>
                                          setU1HistoryStaffFilter(
                                            u1HistoryStaffFilter === s.name ? '' : s.name
                                          )
                                        }
                                      >
                                        {s.name}
                                      </button>
                                    </td>
                                    <td className="px-3 py-1.5 text-center font-bold text-green-700">{s.bat}</td>
                                    <td className="px-3 py-1.5 text-center font-bold text-amber-700">{s.tat}</td>
                                    <td className="px-3 py-1.5 text-center text-slate-500">{s.other}</td>
                                    <td className="px-3 py-1.5 text-right font-bold tabular-nums">{s.total}</td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={5} className="px-3 py-4 text-center italic text-slate-400">
                                    Không có thao tác U1 trong khoảng ngày
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div>
                        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
                          <Clock className="h-3.5 w-3.5" />
                          Chi tiết theo ngày
                          {u1HistoryStaffFilter ? (
                            <span className="font-normal normal-case text-indigo-600">· {u1HistoryStaffFilter}</span>
                          ) : null}
                        </h3>
                        {u1HistoryByDate.length > 0 ? (
                          <div className="space-y-3 max-h-[min(42vh,420px)] overflow-y-auto">
                            {u1HistoryByDate.map(([dateLabel, dayRows]) => (
                              <div key={dateLabel} className="rounded-lg border border-slate-200 overflow-hidden">
                                <div className="bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
                                  {dateLabel}
                                  <span className="ml-2 font-normal text-slate-400">({dayRows.length} thao tác)</span>
                                </div>
                                <table className="w-full text-left text-[11px]">
                                  <thead className="border-b border-slate-100 text-[10px] font-bold uppercase text-slate-400">
                                    <tr>
                                      <th className="px-3 py-1.5">Giờ</th>
                                      <th className="px-3 py-1.5">Nhân sự</th>
                                      <th className="px-3 py-1.5 text-center">Trước</th>
                                      <th className="px-3 py-1.5 text-center">Sau</th>
                                      <th className="px-3 py-1.5">Thao tác</th>
                                      <th className="px-3 py-1.5">Người thực hiện</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {dayRows.map((row) => (
                                      <tr key={row.id} className="hover:bg-slate-50/80">
                                        <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">
                                          {formatU1HistoryTimeOnly(row.changed_at)}
                                        </td>
                                        <td className="px-3 py-1.5 font-medium text-slate-800">{row.ho_va_ten}</td>
                                        <td className="px-3 py-1.5 text-center text-slate-500">
                                          {row.trang_thai_cu || '—'}
                                        </td>
                                        <td className="px-3 py-1.5 text-center font-semibold">
                                          {row.trang_thai_moi || '—'}
                                        </td>
                                        <td className="px-3 py-1.5">
                                          <span
                                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                              row.hanh_dong === 'bat_u1'
                                                ? 'bg-green-100 text-green-800'
                                                : row.hanh_dong === 'tat_u1'
                                                  ? 'bg-amber-100 text-amber-800'
                                                  : 'bg-slate-100 text-slate-600'
                                            }`}
                                          >
                                            {u1HistoryActionLabel(row.hanh_dong)}
                                          </span>
                                        </td>
                                        <td className="px-3 py-1.5 text-slate-500">{row.changed_by || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs italic text-slate-400">
                            {u1HistoryStaffFilter
                              ? `Không có lịch sử cho ${u1HistoryStaffFilter} trong khoảng ngày đã chọn.`
                              : 'Không có lịch sử bật/tắt U1 trong khoảng ngày đã chọn.'}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </details>

              <details open className="group rounded-xl border border-slate-200 bg-white shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <UserCheck className="h-4 w-4 text-blue-600" />
                    Tổng hợp sản lượng · {activeBranch}
                  </span>
                  <span className="text-[11px] text-slate-400 group-open:hidden">Mở bảng</span>
                </summary>
                <div className="max-h-56 overflow-y-auto border-t border-slate-100">
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
                      <tr>
                        <th className="w-10 px-2 py-2 text-center">#</th>
                        <th className="px-2 py-2">Nhân sự U1</th>
                        <th className="w-16 px-2 py-2 text-right">Tổng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSummaryRows.length > 0 ? (
                        activeSummaryRows.map((r) => (
                          <tr key={r.name} className="border-t border-slate-50 hover:bg-slate-50/80">
                            <td className="px-2 py-1.5 text-center font-mono text-slate-400">{r.stt}</td>
                            <td className="px-2 py-1.5 font-medium text-slate-800">{r.name}</td>
                            <td className="px-2 py-1.5 text-right">
                              <span
                                className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${activeSummaryPanel?.countBg}`}
                              >
                                {r.count}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-center italic text-slate-400">
                            Chưa có phiên thành công
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </details>

              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                {activeBranchModel.total > 0 ? (
                  <div className="flex flex-col gap-6 p-4 sm:p-5">
                    {/* I — Chi tiết trình tự chia */}
                    <section className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700">
                          <GitMerge className="h-3.5 w-3.5 text-blue-600" />
                          Chi tiết trình tự chia
                        </h2>
                        {hiddenDetailCount > 0 && (
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-amber-700 underline"
                            onClick={() => setShowAllDetailRows(true)}
                          >
                            +{hiddenDetailCount} dòng nữa
                          </button>
                        )}
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-[min(44vh,500px)] overflow-y-auto">
                        <table className="w-full border-collapse text-left">
                          <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
                            <tr>
                              <th className="w-11 border-r px-2 py-2 text-center">Phiên</th>
                              <th className="min-w-[120px] border-r px-2 py-2">Thời điểm</th>
                              <th className="min-w-[88px] border-r px-2 py-2">Chạy bởi</th>
                              <th className="w-9 border-r px-2 py-2 text-center">#</th>
                              <th className="min-w-[110px] border-r px-3 py-2">Mã đơn</th>
                              <th className="min-w-[130px] border-r px-3 py-2">NV vận đơn</th>
                              {activeBranchModel.chiTietColKeys.map((ck) => (
                                <th key={ck} className="min-w-[88px] border-r px-3 py-2 last:border-r-0">
                                  {chiTietChiaKeyLabelVi(ck)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {visibleDetailRows.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={activeBranchModel.chiaTietTableColSpan}
                                  className="bg-slate-50/50 px-3 py-6 text-center text-[11px] italic leading-relaxed text-slate-500"
                                >
                                  Không có đơn có cột <strong>chi_tiet_chia</strong> trong khoảng ngày đã chọn — mở
                                  rộng ngày và bấm Tải, hoặc chạy chia đơn / Điền STT.
                                </td>
                              </tr>
                            ) : (
                              visibleDetailRows.map((fr, gi) => {
                                const nv = String(fr.row.delivery_staff || '').trim();
                                return (
                                  <tr
                                    key={`${fr.sessionOrdinal}-${fr.orderIndexInSession}-${fr.row.order_code}-${gi}`}
                                    className="transition-colors hover:bg-blue-50/40"
                                  >
                                    <td className="border-r bg-slate-50/50 px-2 py-1.5 text-center font-mono font-bold text-slate-700">
                                      {fr.sessionOrdinal}
                                    </td>
                                    <td className="border-r px-2 py-1.5 text-[10px] whitespace-nowrap text-slate-800">
                                      {fr.timeStr}
                                    </td>
                                    <td className="border-r px-2 py-1.5 text-[10px] font-medium text-slate-800">
                                      {fr.performer || 'Admin'}
                                    </td>
                                    <td className="border-r bg-slate-50/30 px-2 py-1.5 text-center font-mono text-slate-500">
                                      {gi + 1}
                                    </td>
                                    <td className="border-r px-3 py-1.5 font-mono font-bold text-blue-700">
                                      {fr.row.order_code}
                                    </td>
                                    <td className="border-r px-3 py-1.5 font-bold text-slate-900">{nv || '—'}</td>
                                    {activeBranchModel.chiTietColKeys.map((ck) => {
                                      const cell = fr.row.chi_tiet_chia?.[ck];
                                      const stepQueue =
                                        ck === 'queue_before' && Array.isArray(cell) ? cell : null;
                                      return (
                                        <td key={ck} className="border-r px-3 py-1.5 align-top last:border-r-0">
                                          {stepQueue ? (
                                            <div className="flex flex-wrap items-center gap-1">
                                              {stepQueue.map((q, qi) => {
                                                const active =
                                                  String(q || '')
                                                    .trim()
                                                    .toLowerCase() === nv.toLowerCase();
                                                return (
                                                  <React.Fragment key={qi}>
                                                    <span
                                                      className={`rounded border px-1.5 py-0.5 text-[9px] leading-none ${
                                                        active
                                                          ? 'border-blue-600 bg-blue-600 font-bold text-white'
                                                          : 'border-slate-200 bg-slate-50 text-slate-500'
                                                      }`}
                                                    >
                                                      {q}
                                                    </span>
                                                    {qi < stepQueue.length - 1 && (
                                                      <span className="text-[10px] text-slate-300">›</span>
                                                    )}
                                                  </React.Fragment>
                                                );
                                              })}
                                            </div>
                                          ) : (
                                            <span className="break-words text-slate-800">
                                              {formatChiTietChiaReportCell(ck, cell)}
                                            </span>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                      {hiddenDetailCount > 0 && (
                        <p className="text-[10px] text-amber-700">
                          Hiển thị {visibleDetailRows.length}/{activeBranchModel.flatDetailRows.length} dòng.
                        </p>
                      )}
                    </section>

                    {/* II — Thống kê nhân sự */}
                    <section className="space-y-2 border-t border-slate-100 pt-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700">
                          <LayoutGrid className="h-3.5 w-3.5 text-blue-600" />
                          Thống kê nhân sự
                        </h2>
                        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-500">
                          <input
                            type="checkbox"
                            checked={showStaffTurnTags}
                            onChange={(e) => setShowStaffTurnTags(e.target.checked)}
                            className="rounded border-slate-300"
                          />
                          Hiện nhãn lượt (Vn-m)
                        </label>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-slate-200 max-h-[min(40vh,420px)] overflow-y-auto">
                        <table className="w-full border-collapse text-left">
                          <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
                            <tr>
                              <th className="w-12 border-r px-3 py-2 text-center">STT</th>
                              <th className="border-r px-3 py-2">Nhân sự</th>
                              <th className="px-3 py-2 text-right">Sản lượng</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {activeBranchModel.staffEntries.map(([name, count], si) => {
                              const nkTarget = normalizeNameKeyForStaffSort(name);
                              const myTurns = activeBranchModel.flatDetailRows
                                .filter(
                                  (r) =>
                                    normalizeNameKeyForStaffSort(r.row?.delivery_staff) === nkTarget
                                )
                                .map((r) => `V${r.sessionOrdinal}-${r.orderIndexInSession}`);
                              const isLowCount = count < staffMaxCount && staffMaxCount - count >= 1;
                              const popoverKey = `${activeBranchModel.key}::${name}`;
                              const isPopoverOpen = staffReasonPopover === popoverKey;
                              const reasons = isPopoverOpen
                                ? buildStaffLowCountReasons({
                                    name,
                                    count,
                                    maxCount: staffMaxCount,
                                    nkTarget,
                                    activeBranchModel,
                                  })
                                : [];

                              return (
                                <tr
                                  key={name}
                                  className={`transition-colors ${isPopoverOpen ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                                >
                                  <td className="border-r px-3 py-2 text-center text-slate-400">{si + 1}</td>
                                  <td className="border-r px-3 py-2">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="font-bold text-slate-800">{name}</span>
                                      {isLowCount && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setStaffReasonPopover(isPopoverOpen ? null : popoverKey)
                                          }
                                          className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${
                                            isPopoverOpen
                                              ? 'border-amber-500 bg-amber-500 text-white'
                                              : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                          }`}
                                        >
                                          <Info className="h-2.5 w-2.5" />
                                          {isPopoverOpen ? 'Ẩn' : `−${staffMaxCount - count}?`}
                                        </button>
                                      )}
                                    </div>
                                    {showStaffTurnTags && myTurns.length > 0 && (
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {myTurns.map((t, ti) => (
                                          <span
                                            key={`${si}-${ti}-${t}`}
                                            className="rounded border border-blue-100 bg-blue-50 px-1 text-[8px] leading-tight text-blue-500"
                                          >
                                            {t}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {isPopoverOpen && (
                                      <div className="mt-2 rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-3 shadow-sm">
                                        <div className="mb-2 flex items-center justify-between">
                                          <h6 className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-800">
                                            <AlertCircle className="h-3 w-3" />
                                            Vì sao ít hơn {staffMaxCount - count} đơn?
                                          </h6>
                                          <button
                                            type="button"
                                            onClick={() => setStaffReasonPopover(null)}
                                            className="text-amber-400 hover:text-amber-600"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                        <div className="space-y-2">
                                          {reasons.length > 0 ? (
                                            reasons.map((r, ri) => (
                                              <div
                                                key={ri}
                                                className={`rounded border p-2 text-[10px] leading-relaxed ${
                                                  r.severity === 'high'
                                                    ? 'border-red-200 bg-red-50 text-red-800'
                                                    : r.severity === 'medium'
                                                      ? 'border-amber-200 bg-amber-50/80 text-amber-900'
                                                      : 'border-green-200 bg-green-50 text-green-800'
                                                }`}
                                              >
                                                <div className="mb-0.5 flex items-center gap-1 font-bold">
                                                  <span>{r.icon}</span>
                                                  <span>{r.title}</span>
                                                </div>
                                                <p>{r.detail}</p>
                                              </div>
                                            ))
                                          ) : (
                                            <p className="text-[10px] text-green-700">
                                              Không phát hiện bất thường — chênh lệch trong phạm vi bình thường.
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                  <td
                                    className={`px-3 py-2 text-right font-black ${isLowCount ? 'text-amber-600' : 'text-blue-700'}`}
                                  >
                                    {count}
                                    {isLowCount && (
                                      <div className="mt-0.5 text-[8px] font-normal text-amber-500">
                                        (−{staffMaxCount - count})
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    {/* III — Carry-over */}
                    <details className="border-t border-dashed border-slate-200 pt-4">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-indigo-600 [&::-webkit-details-marker]:hidden">
                        <GitBranch className="h-3.5 w-3.5" />
                        Carry-over giữa các phiên
                      </summary>
                      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                        <table className="w-full border-collapse text-left">
                          <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase text-slate-500">
                            <tr>
                              <th className="w-10 border-r px-2 py-1.5 text-center">Phiên</th>
                              <th className="border-r px-2 py-1.5">Người cuối (trước)</th>
                              <th className="border-r px-2 py-1.5">Bắt đầu từ</th>
                              <th className="px-2 py-1.5 text-center">Tiếp theo (dự kiến)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-[10px]">
                            {activeBranchModel.sessions.map((s, idx) => {
                              let phienData = {};
                              try {
                                const raw = parseHistoryChiaDonStoredJson(s.phien_chia);
                                const key = activeBranchModel.key === 'Hà Nội' ? 'hanoi' : 'hcm';
                                phienData = raw?.[key] || {};
                              } catch {
                                /* ignore */
                              }
                              if (!phienData.bat_dau_phien_tu && !phienData.nguoi_cuoi_vong_truoc) return null;
                              return (
                                <tr key={s.id || idx} className="hover:bg-indigo-50/30">
                                  <td className="border-r bg-slate-50/30 px-2 py-1.5 text-center font-bold text-slate-600">
                                    {idx + 1}
                                  </td>
                                  <td className="border-r px-2 py-1.5 text-slate-700">
                                    {displayPhienField(phienData.nguoi_cuoi_vong_truoc) ? (
                                      <span className="flex items-center gap-1">
                                        <CheckCircle className="h-3 w-3 text-emerald-500" />
                                        {displayPhienField(phienData.nguoi_cuoi_vong_truoc)}
                                      </span>
                                    ) : (
                                      <span className="italic text-slate-300">Bắt đầu mới</span>
                                    )}
                                  </td>
                                  <td className="border-r px-2 py-1.5 font-bold text-blue-700">
                                    <span className="flex items-center gap-1">
                                      <PlayCircle className="h-3 w-3" />
                                      {displayPhienField(phienData.bat_dau_phien_tu) || '—'}
                                    </span>
                                  </td>
                                  <td className="px-2 py-1.5 text-center font-medium text-purple-600">
                                    {displayPhienField(phienData.goi_y_nhan_luot_tiep_theo) || '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </details>

                    {/* IV — NV vắng mặt */}
                    <details className="border-t border-dashed border-slate-200 pt-4">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-red-500 [&::-webkit-details-marker]:hidden">
                        <AlertCircle className="h-3.5 w-3.5" />
                        NV vắng mặt ({activeBranchModel.absentStaff?.length || 0})
                      </summary>
                      <div className="mt-3">
                        {activeBranchModel.absentStaff?.length > 0 ? (
                          <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
                            <div className="flex flex-wrap gap-2">
                              {activeBranchModel.absentStaff.map((name) => (
                                <div
                                  key={name}
                                  className="flex items-center gap-2 rounded border border-red-200 bg-white px-3 py-1 shadow-sm"
                                >
                                  <span className="text-xs font-bold text-slate-700">{name}</span>
                                  <span className="rounded-full bg-red-100 px-1.5 text-[10px] font-black uppercase text-red-600">
                                    Vắng
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="rounded-lg border border-green-100 bg-green-50/50 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-green-600">
                            Toàn bộ nhân sự đều tham gia
                          </p>
                        )}
                      </div>
                    </details>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Package className="mb-3 h-12 w-12 text-slate-200" />
                    <p className="text-sm font-bold uppercase tracking-wide text-slate-400">
                      Không có dữ liệu lịch sử
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
