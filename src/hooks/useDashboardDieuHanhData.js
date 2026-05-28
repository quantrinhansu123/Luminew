import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase/config';
import { dedupeMktDetailReportRows } from '../services/mktRecalcSoDonThucTeFromOrders';
import {
  normalizeMktHcmDetailReportRow,
  normalizeMktHnDetailReportRow,
} from '../utils/mktNormalizeDetailReportRows';
import {
  MAX_PAGES,
  MKT_DATE_COL,
  PAGE_SIZE,
  buildLastFourPeriodBuckets,
  buildDashboardModel,
  mapMktRow,
  mapOrderToMktActualRow,
  mapOrderToVanDonRow,
  mapSalesReportRow,
  mapUserRow,
  mapVanDonSummaryRow,
} from '../utils/dashboardDieuHanhMetrics';

const MKT_HN_ALLOWED_TEAMS = ['HN-MKT', 'Team Test'];
const MKT_HCM_ALLOWED_TEAMS = ['MKT - Đức Anh'];

function tableMissing(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache');
}

async function fetchPagedQuery(buildQuery) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

function mktRowHasName(row) {
  return Boolean(String(row?.['Tên'] ?? row?.ten ?? row?.name ?? '').trim());
}

function clearMktActuals(row) {
  return {
    ...row,
    orders: 0,
    ordersForCloseRate: 0,
    revenue: 0,
    revenueForAdsRate: 0,
    cancelOrders: 0,
  };
}

async function loadMktTable(tableName, from, to, allowedTeams = []) {
  try {
    return await fetchPagedQuery(() => {
      let q = supabase
        .from(tableName)
        .select('*')
        .gte(MKT_DATE_COL, from)
        .lte(MKT_DATE_COL, to);
      if (allowedTeams.length === 1) q = q.eq('Team', allowedTeams[0]);
      else if (allowedTeams.length > 1) q = q.in('Team', allowedTeams);
      return q.order(MKT_DATE_COL, { ascending: true });
    });
  } catch (error) {
    if (tableMissing(error)) return { __missing: true, rows: [] };
    throw error;
  }
}

async function loadVanDonTable(from, to) {
  try {
    return await fetchPagedQuery(() =>
      supabase
        .from('bao_cao_van_don')
        .select(
          'id,ngay,nhan_vien,san_pham,thi_truong,trang_thai_giao_hang,ket_qua_check,trang_thai_thanh_toan,tien_trang_thai_thanh_toan'
        )
        .gte('ngay', from)
        .lte('ngay', to)
        .order('ngay', { ascending: true })
    );
  } catch (error) {
    if (tableMissing(error)) return { __missing: true, rows: [] };
    throw error;
  }
}

async function loadSalesReportsTable(from, to) {
  try {
    return await fetchPagedQuery(() =>
      supabase
        .from('sales_reports')
        .select('*')
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true })
    );
  } catch (error) {
    if (tableMissing(error)) return { __missing: true, rows: [] };
    throw error;
  }
}

async function loadUsersTable() {
  try {
    return await fetchPagedQuery(() => supabase.from('users').select('*').order('name', { ascending: true }));
  } catch (error) {
    if (tableMissing(error)) return { __missing: true, rows: [] };
    throw error;
  }
}

async function loadOrdersTable(tableName, from, to) {
  const baseSelect =
    'id,order_code,order_date,created_at,country,marketing_staff,product,product_name_1,delivery_staff,delivery_status_nb,delivery_status,check_result,payment_status,payment_status_detail,total_amount_vnd,total_vnd,tong_tien_vnd,van_don_line_total_vnd,sale_price,goods_amount,tracking_code,shipping_unit,reconciled_vnd,reconciled_amount,payment_bill,payment_image,ngayupbill,team,shift';
  const selectCandidates = [baseSelect];

  let lastError = null;
  for (const selectStr of selectCandidates) {
    try {
      return await fetchPagedQuery(() => {
        let q = supabase
          .from(tableName)
          .select(selectStr)
          .gte('order_date', from)
          .lte('order_date', to);

        if (String(tableName || '').trim() === 'orders') {
          q = q.or('team.is.null,team.neq.HCM');
        }

        return q.order('order_date', { ascending: true });
      });
    } catch (error) {
      lastError = error;
      if (!tableMissing(error)) throw error;
    }
  }
  if (tableMissing(lastError)) return { __missing: true, rows: [] };
  throw lastError;
}

export default function useDashboardDieuHanhData({ activeTab = 'company', periodMode = 'month', from, to, branch, market, product, department, team, person, enabled = true }) {
  const [mktRows, setMktRows] = useState([]);
  const [vanDonRows, setVanDonRows] = useState([]);
  const [salesRows, setSalesRows] = useState([]);
  const [usersRows, setUsersRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);

  const loadData = useCallback(async () => {
    if (!enabled || !from || !to) return;
    setLoading(true);
    setErrors([]);
    try {
      const historyFrom = buildLastFourPeriodBuckets(periodMode, from, to)[0]?.start || from;
      const shouldLoadPeopleData = activeTab !== 'company';
      const loadJobs = [
        ['detail_reports', loadMktTable('detail_reports', historyFrom, to, MKT_HN_ALLOWED_TEAMS)],
        ['marketing_report_hcm', loadMktTable('marketing_report_hcm', historyFrom, to, MKT_HCM_ALLOWED_TEAMS)],
        ['orders', loadOrdersTable('orders', historyFrom, to)],
        ['order_code_hcm', loadOrdersTable('order_code_hcm', historyFrom, to)],
      ];
      if (shouldLoadPeopleData) {
        loadJobs.push(
          ['sales_reports', loadSalesReportsTable(historyFrom, to)],
          ['users', loadUsersTable()]
        );
      }

      const settledJobs = await Promise.allSettled(loadJobs.map(([, job]) => job));

      const nextErrors = [];
      const unwrap = (res, label) => {
        if (res.status === 'rejected') {
          nextErrors.push(`${label}: ${res.reason?.message || String(res.reason)}`);
          return [];
        }
        if (res.value?.__missing) {
          nextErrors.push(`${label}: chưa có bảng hoặc chưa reload schema`);
          return [];
        }
        return Array.isArray(res.value) ? res.value : res.value?.rows || [];
      };
      const rowsByLabel = new Map(loadJobs.map(([label], index) => [label, unwrap(settledJobs[index], label)]));

      const hn = rowsByLabel.get('detail_reports') || [];
      const hcm = rowsByLabel.get('marketing_report_hcm') || [];
      const ordersHn = rowsByLabel.get('orders') || [];
      const ordersHcm = rowsByLabel.get('order_code_hcm') || [];
      const salesReports = rowsByLabel.get('sales_reports') || [];
      const users = rowsByLabel.get('users') || [];

      const hnMktRows = dedupeMktDetailReportRows(
        hn.map(normalizeMktHnDetailReportRow).filter(mktRowHasName)
      );
      const hcmMktRows = dedupeMktDetailReportRows(
        hcm.map(normalizeMktHcmDetailReportRow).filter(mktRowHasName)
      );

      const mappedMkt = [
        ...hnMktRows.map((r) => mapMktRow(r, 'hn')).filter(Boolean).map(clearMktActuals),
        ...hcmMktRows.map((r) => mapMktRow(r, 'hcm')).filter(Boolean).map(clearMktActuals),
        ...ordersHn.map((r) => mapOrderToMktActualRow(r, 'hn')).filter(Boolean),
        ...ordersHcm.map((r) => mapOrderToMktActualRow(r, 'hcm')).filter(Boolean),
      ];

      let mappedVd = [
        ...ordersHn.map((r) => mapOrderToVanDonRow(r, 'hn')).filter(Boolean),
        ...ordersHcm.map((r) => mapOrderToVanDonRow(r, 'hcm')).filter(Boolean),
      ];
      if (mappedVd.length === 0) {
        const [vanDonSummaryRes] = await Promise.allSettled([loadVanDonTable(historyFrom, to)]);
        const vdSummary = unwrap(vanDonSummaryRes, 'bao_cao_van_don');
        mappedVd = vdSummary.map(mapVanDonSummaryRow).filter(Boolean);
        if (mappedVd.length > 0) {
          nextErrors.push('Vận đơn: đang dùng fallback bao_cao_van_don nên chưa tách được Hà Nội/Hồ Chí Minh.');
        }
      }

      setMktRows(mappedMkt);
      setVanDonRows(mappedVd);
      setSalesRows(salesReports.map(mapSalesReportRow).filter(Boolean));
      setUsersRows(users.map(mapUserRow).filter(Boolean));
      setErrors(nextErrors);
    } catch (error) {
      setErrors([error?.message || 'Không tải được dữ liệu Dashboard điều hành.']);
      setMktRows([]);
      setVanDonRows([]);
      setSalesRows([]);
      setUsersRows([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, enabled, from, periodMode, to]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const model = useMemo(
    () => buildDashboardModel({ mktRows, vanDonRows, salesRows, usersRows, branch, market, product, department, team, person, from, to, periodMode }),
    [branch, department, from, market, mktRows, periodMode, person, product, salesRows, team, to, usersRows, vanDonRows]
  );

  return {
    loading,
    errors,
    reload: loadData,
    rawCounts: {
      mkt: mktRows.length,
      delivery: vanDonRows.length,
      sales: salesRows.length,
      users: usersRows.length,
    },
    ...model,
  };
}
