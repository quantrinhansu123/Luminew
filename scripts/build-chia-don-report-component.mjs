/**
 * Tạo component báo cáo phân bổ từ modal AdminTools (một lần).
 * node scripts/build-chia-don-report-component.mjs
 */
import fs from 'fs';

const modalLines = fs.readFileSync('scripts/_modal_extract.txt', 'utf8').split(/\r?\n/);
// Bỏ {isStatsModalOpen && ( và )}
const inner = modalLines.slice(1, -1).join('\n')
  .replace(/className="fixed inset-0 z-\[9999\][^"]*"/, 'className="flex min-h-[100dvh] w-full flex-col bg-gray-50"')
  .replace(/onClick=\{\(\) => setIsStatsModalOpen\(false\)\}/g, 'onClick={onClose}');

const component = `import {
  AlertCircle,
  BarChart3,
  CheckCircle,
  GitBranch,
  GitMerge,
  LayoutGrid,
  List,
  Package,
  PlayCircle,
  RefreshCw,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '../../supabase/config';
import {
  buildVanDonU1StaffOrderFromRows,
  chiTietChiaKeyLabelVi,
  collectChiTietChiaKeysForRows,
  fetchOrderRowsWithChiTietForReportRange,
  fetchPagedSupabaseSelect,
  formatChiTietChiaReportCell,
  matchHistorySessionsToChiDetailClusters,
  normalizeHistoryBranchKey,
  normalizeNameKeyForStaffSort,
  resolveAssignListForHistorySession,
  sortStatsEntriesByVanDonOrder,
} from '../../utils/chiaDonVanDonReport';

const defaultStartDate = () =>
  new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().slice(0, 10);
const defaultEndDate = () => new Date().toISOString().slice(0, 10);

/**
 * Báo cáo Phân bổ Đơn hàng — view đầy đủ (trước đây modal trong Admin Tools).
 */
export default function BaoCaoPhanBoDonHangReport({ onClose }) {
  const [historyChiaDon, setHistoryChiaDon] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStartDate, setHistoryStartDate] = useState(defaultStartDate);
  const [historyEndDate, setHistoryEndDate] = useState(defaultEndDate);
  const [staffStatsReportByBranch, setStaffStatsReportByBranch] = useState({ HCM: {}, 'Hà Nội': {} });
  const [successSessionCountByBranch, setSuccessSessionCountByBranch] = useState({ HCM: 0, 'Hà Nội': 0 });
  const [successTotalOrdersByBranch, setSuccessTotalOrdersByBranch] = useState({ HCM: 0, 'Hà Nội': 0 });
  const [chiaDonVanDonStaffOrder, setChiaDonVanDonStaffOrder] = useState({ HCM: [], 'Hà Nội': [] });
  const [chiTietFromOrdersLookup, setChiTietFromOrdersLookup] = useState({});
  const [chiaReportMergedChiTietRows, setChiaReportMergedChiTietRows] = useState([]);
  const [staffReasonPopover, setStaffReasonPopover] = useState(null);

  const handleLoadHistoryChiaDon = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const startDate = new Date(\`\${historyStartDate}T00:00:00+07:00\`);
      const endDate = new Date(\`\${historyEndDate}T23:59:59.999+07:00\`);

      const { data, error } = await fetchPagedSupabaseSelect(
        'history_chia_don',
        '*',
        (q) => q.gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString()),
        { orderColumn: 'created_at', ascending: false }
      );

      if (error) throw error;

      setHistoryChiaDon(data || []);

      const byBranch = { HCM: {}, 'Hà Nội': {} };
      const sessionCount = { HCM: 0, 'Hà Nội': 0 };
      const totalOrders = { HCM: 0, 'Hà Nội': 0 };
      const isSuccess = (raw) => String(raw || '').trim().toLowerCase() === 'success';

      (data || [])
        .filter((s) => isSuccess(s.status))
        .forEach((session) => {
          const br = normalizeHistoryBranchKey(session.branch);
          if (!br) return;
          sessionCount[br] += 1;
          totalOrders[br] += Number(session.total_orders) || 0;
          const stats = session.staff_stats || {};
          Object.entries(stats).forEach(([name, count]) => {
            byBranch[br][name] = (byBranch[br][name] || 0) + (Number(count) || 0);
          });
        });

      setStaffStatsReportByBranch(byBranch);
      setSuccessSessionCountByBranch(sessionCount);
      setSuccessTotalOrdersByBranch(totalOrders);
    } catch (err) {
      console.error('❌ [Lịch sử chia đơn] Lỗi:', err);
      toast.error('Lỗi khi tải lịch sử chia đơn');
    } finally {
      setHistoryLoading(false);
    }
  }, [historyStartDate, historyEndDate]);

  useEffect(() => {
    handleLoadHistoryChiaDon();
  }, [handleLoadHistoryChiaDon]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const merged = await fetchOrderRowsWithChiTietForReportRange(historyStartDate, historyEndDate);
        if (cancelled) return;
        setChiaReportMergedChiTietRows(Array.isArray(merged) ? merged : []);
        if (!historyChiaDon?.length) {
          setChiTietFromOrdersLookup({});
          return;
        }
        const clusters = clusterChiTietOrderRowsMerged(merged || []);
        const mapObj = {};
        matchHistorySessionsToChiDetailClusters(historyChiaDon, clusters).forEach((list, hid) => {
          mapObj[String(hid)] = list;
        });
        if (!cancelled) setChiTietFromOrdersLookup(mapObj);
      } catch (e) {
        if (!cancelled) {
          console.warn('[Báo cáo I.] Prefetch chi_tiet_chia:', e);
          setChiTietFromOrdersLookup({});
          setChiaReportMergedChiTietRows([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [historyChiaDon, historyStartDate, historyEndDate]);

  return (
${inner.split('\n').map((l) => '    ' + l).join('\n')}
  );
}
`;

// Fix missing import clusterChiTietOrderRowsMerged in component - add to import
const fixed = component.replace(
  '  resolveAssignListForHistorySession,',
  '  clusterChiTietOrderRowsMerged,\n  resolveAssignListForHistorySession,'
);

fs.mkdirSync('src/components/chiaDonVanDon', { recursive: true });
fs.writeFileSync('src/components/chiaDonVanDon/BaoCaoPhanBoDonHangReport.jsx', fixed);
console.log('Wrote BaoCaoPhanBoDonHangReport.jsx');
