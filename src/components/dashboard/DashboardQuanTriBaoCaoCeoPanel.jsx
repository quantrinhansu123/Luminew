import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../supabase/config';
import { formatCurrency, formatNumber, filterRawData } from '../../utils/nhanSuSaleLumiMoiLogic';
import { aggregateVanHanhSlice, formatPct, formatSlVi } from '../../utils/baoCaoVanDonMarketMatrix';
import { dedupeMktDetailReportRows } from '../../services/mktRecalcSoDonThucTeFromOrders';

const PAGE_SIZE = 1000;
const MAX_PAGES = 80;
const CEO_DEFAULT_SHIFT = 'Hết ca';
// Bộ lọc Ca đang ẩn; mặc định tính theo tất cả ca để khớp báo cáo MKT.

function normalizePickValue(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeShiftLabel(value) {
  const s = normalizePickValue(value);
  const l = s.toLowerCase();
  if (!l) return '';
  // Ca gộp legacy: coi như "Hết ca" để tránh cộng trùng khi lọc theo ca.
  // (Khớp quy ước recalc MKT: ca trống/gộp ưu tiên gom về Hết ca.)
  const hasHet = l.includes('het ca') || l.includes('hết ca');
  const hasGiua = l.includes('giua ca') || l.includes('giữa ca');
  if (hasHet && hasGiua) return 'Hết ca';
  if (l === 'het ca' || l === 'hết ca') return 'Hết ca';
  if (l === 'giua ca' || l === 'giữa ca') return 'Giữa ca';
  // fallback: giữ nguyên nhưng chuẩn hoá kiểu Title-case đơn giản cho bớt lệch
  return s;
}

// CEO MKT: đọc trực tiếp bảng MKT (HN + HCM). Các cột tiếng Việt cần quote đúng key.
const MKT_DATE_COL = '"Ngày"';
// HN (`detail_reports`): scope giống trang Báo cáo MKT (không áp dụng cho HCM).
const MKT_DETAIL_REPORTS_SCOPE_OR =
  'department.is.null,department.eq.MKT,department.neq.RD,Team.ilike.test';
const MKT_REPORTS_SELECT_BASE = [
  'id',
  '"Ngày"',
  'ca',
  '"Tên"',
  '"Team"',
  '"Sản_phẩm"',
  '"Thị_trường"',
  '"Số_Mess_Cmt"',
  '"CPQC"',
  '"Số đơn"',
  '"Doanh số"',
].join(',');

// Một số DB dùng tên khác nhau cho “doanh số TT” (vd. “Doanh số đi thực tế”).
// Không được select cột không tồn tại — PostgREST sẽ 400. Vì vậy ta thử nhiều candidates.
const MKT_REPORTS_SELECT_CANDIDATES = [
  '*',
  `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh số TT","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
  `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh thu chốt thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
  `${MKT_REPORTS_SELECT_BASE},"Số đơn TT","Doanh số TT","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
  `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh số thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
  `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh số đi thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
  `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
  MKT_REPORTS_SELECT_BASE,
];

function selectCandidatesForTable(tableName) {
  const t = String(tableName || '').trim();
  if (t === 'detail_reports') {
    return [
      `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh số đi thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      MKT_REPORTS_SELECT_BASE,
    ];
  }
  if (t === 'marketing_report_hcm') {
    // Bảng HCM hay lệch schema: fallback cực "defensive" để tránh 400.
    const baseNoDims = ['id', '"Ngày"', 'ca', '"Team"', '"Số đơn"', '"Doanh số"'].join(',');
    const baseBare = ['id', '"Ngày"', 'ca', '"Team"'].join(',');
    return [
      '*',
      // try full KPI first
      `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh số TT","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh thu chốt thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${MKT_REPORTS_SELECT_BASE},"Số đơn TT","Doanh số TT","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh số thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Doanh số đi thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${MKT_REPORTS_SELECT_BASE},"Số đơn thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      // drop dim columns that are most likely to differ
      `${baseNoDims},"Số đơn thực tế","Doanh số TT","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${baseNoDims},"Số đơn thực tế","Doanh thu chốt thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${baseNoDims},"Số đơn TT","Doanh số TT","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${baseNoDims},"Số đơn thực tế","Doanh số thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${baseNoDims},"Số đơn thực tế","Doanh số đi thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      `${baseNoDims},"Số đơn thực tế","Số đơn hoàn hủy","Doanh số hoàn hủy thực tế"`,
      // minimal safe
      baseNoDims,
      baseBare,
    ];
  }
  return MKT_REPORTS_SELECT_CANDIDATES;
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function getFirstDefined(row, keys) {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return null;
}

function parseNumberLoose(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value).trim();
  if (!raw) return 0;
  const negative = raw.startsWith('-');
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return 0;
  const n = Number((negative ? '-' : '') + digits);
  return Number.isFinite(n) ? n : 0;
}

function normalizeYmd(value) {
  if (!value) return '';
  const s = String(value).trim();
  if (!s) return '';
  if (s.includes('T')) return s.slice(0, 10);
  return s.slice(0, 10);
}

function sqlCoalesceNumbers(...vals) {
  for (const v of vals) {
    if (v == null || v === '') continue;
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

function resolveOrderDisplayTotalVnd(row) {
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

function paymentLabelForOrder(order) {
  const d = String(order?.payment_status_detail ?? '').trim();
  if (d) return d;
  return String(order?.payment_status ?? '').trim();
}

function paymentLabelIsCoBillOnly(label) {
  const s = String(label ?? '').trim().toLowerCase();
  if (!s) return false;
  if (s.includes('1 phần') && s.includes('bill')) return false;
  return s.includes('có bill');
}

function orderHasBillEvidence(row) {
  if (!row || typeof row !== 'object') return false;
  const up = String(row.ngayupbill ?? row['Ngày up bill'] ?? '').trim();
  const img = String(row.payment_image ?? row['Payment Image'] ?? '').trim();
  const pb = String(row.payment_bill ?? row['Payment Bill'] ?? '').trim();
  return Boolean(up || img || pb);
}

function resolveReconciledVnd(row) {
  const v1 = row?.reconciled_vnd;
  if (v1 != null && v1 !== '' && Number.isFinite(Number(v1))) return Number(v1);
  const v2 = row?.reconciled_amount;
  if (v2 != null && v2 !== '' && Number.isFinite(Number(v2))) return Number(v2);
  const v3 = row?.total_amount_vnd;
  if (v3 != null && v3 !== '' && Number.isFinite(Number(v3))) return Number(v3);
  return 0;
}

function mapOrderRowToVanDonVirtual(row, branchLabel) {
  if (!row || typeof row !== 'object') return null;
  const ngay = normalizeYmd(row?.order_date) || normalizeYmd(row?.created_at);
  const __ceo_branch = String(branchLabel || '').toUpperCase() === 'HCM' ? 'HCM' : 'HN';
  const checkResult = String(row?.check_result ?? '').trim() || '(Trống)';
  const deliveryStatus = String(row?.delivery_status_nb ?? row?.delivery_status ?? '').trim() || '(Trống)';
  const paymentLabelRaw = paymentLabelForOrder(row) || '(Trống)';
  const hasBill = orderHasBillEvidence(row) || paymentLabelIsCoBillOnly(paymentLabelRaw);
  const paymentLabel = hasBill ? 'Có bill' : paymentLabelRaw;
  const tracking = String(row?.tracking_code ?? '').trim();
  const shippingUnit = String(row?.shipping_unit ?? '').trim();
  const lenVh = shippingUnit ? 1 : 0;
  const amt = resolveOrderDisplayTotalVnd(row);
  const recVnd = resolveReconciledVnd(row);

  const giaoHang = {
    [deliveryStatus]: 1,
    'Mã Tracking': tracking ? 1 : 0,
    'Lên vận hành': lenVh,
  };
  if (/mgt/i.test(shippingUnit)) {
    giaoHang.MGT = 1;
  }

  return {
    _source: 'orders',
    id: row?.id || row?.order_code || `${ngay}-${Math.random().toString(36).slice(2, 8)}`,
    __ceo_branch,
    _ket_qua_check: { [checkResult]: 1 },
    _trang_thai_giao_hang: giaoHang,
    _trang_thai_thanh_toan: { [paymentLabel]: 1 },
    _tien_trang_thai_thanh_toan: { [paymentLabel]: hasBill ? recVnd : 0 },
    _tong_tien_vnd: amt,
    _len_vh_don_vi: lenVh,
    'khu vực': String(row?.country ?? '').trim() || 'Không xác định',
    'Ngày lên đơn': ngay,
  };
}

function mapMktReportRowToVirtual(row, source) {
  if (!row || typeof row !== 'object') return null;
  // PostgREST trả key theo đúng tên cột (không có dấu quote trong key).
  const ngay = String(getFirstDefined(row, ['Ngày']) ?? '').slice(0, 10);
  const ca = normalizeShiftLabel(getFirstDefined(row, ['ca']) ?? '');
  const team = normalizePickValue(getFirstDefined(row, ['Team']) ?? '');
  const sanPham = normalizePickValue(getFirstDefined(row, ['Sản_phẩm']) ?? '');
  const thiTruong = normalizePickValue(getFirstDefined(row, ['Thị_trường']) ?? '');
  const soMessCmt = parseNumberLoose(getFirstDefined(row, ['Số_Mess_Cmt', 'Số Mess', 'So_Mess_Cmt']) ?? 0);
  const cpqc = parseNumberLoose(getFirstDefined(row, ['CPQC', 'Cpqc', 'cpqc']) ?? 0);
  const soDonTay = parseNumberLoose(getFirstDefined(row, ['Số đơn', 'Số_đơn', 'So don', 'So_don']) ?? 0);
  const doanhSoTay = parseNumberLoose(
    getFirstDefined(row, ['Doanh số', 'Doanh_số', 'Doanh so', 'Doanh_so']) ?? 0
  );

  // TT: ưu tiên cột TT nếu có; không có thì fallback theo “tay”.
  const soDonTT = parseNumberLoose(
    getFirstDefined(row, ['Số đơn thực tế', 'Số đơn TT', 'So don thuc te', 'So don tt', 'So don TT']) ?? NaN
  );
  const dsTT = parseNumberLoose(
    getFirstDefined(row, [
      // Ưu tiên DS chốt TT (đã trừ huỷ) đúng nghĩa
      'Doanh số TT',
      'Doanh thu chốt thực tế',
      'Doanh thu chot thuc te',
      'Doanh số thực tế',
      // Fallback legacy label
      'DS chốt',
      'DS chot',
      'Doanh so thuc te',
    ]) ?? NaN
  );
  const soDonHuyTT = parseNumberLoose(
    getFirstDefined(row, ['Số đơn hoàn hủy', 'Số đơn hủy', 'So don huy']) ?? 0
  );
  const dsHuyTT = parseNumberLoose(
    getFirstDefined(row, ['Doanh số hoàn hủy thực tế', 'Doanh số hủy TT', 'Doanh so huy thuc te']) ?? 0
  );

  const soDonThucTe = Number.isFinite(soDonTT) && soDonTT !== 0 ? soDonTT : soDonTay;
  const doanhThuChotThucTe = Number.isFinite(dsTT) && dsTT !== 0 ? dsTT : doanhSoTay;

  return {
    __ceo_source: source, // 'hn' | 'hcm'
    ngay,
    ca,
    team,
    sanPham,
    thiTruong,
    soMessCmt,
    cpqc,
    soDonTay,
    doanhSoTay,
    soDonThucTe,
    doanhThuChotThucTe,
    soDonHoanHuyThucTe: soDonHuyTT,
    doanhSoHoanHuyThucTe: dsHuyTT,
  };
}

function emptyAgg(label) {
  return {
    label,
    mess: 0,
    cpqc: 0,
    soDonTay: 0,
    doanhSoTay: 0,
    soDonTT: 0,
    doanhSoTT: 0,
  };
}

function addRow(agg, r) {
  agg.mess += Number(r.soMessCmt || 0);
  agg.cpqc += Number(r.cpqc || 0);
  agg.soDonTay += Number(r.soDonTay || 0);
  agg.doanhSoTay += Number(r.doanhSoTay || 0);
  agg.soDonTT += Number(r.soDonThucTe || 0);
  agg.doanhSoTT += Number(r.doanhThuChotThucTe || 0);
}

function addAgg(dst, src) {
  dst.mess += Number(src.mess || 0);
  dst.cpqc += Number(src.cpqc || 0);
  dst.soDonTay += Number(src.soDonTay || 0);
  dst.doanhSoTay += Number(src.doanhSoTay || 0);
  dst.soDonTT += Number(src.soDonTT || 0);
  dst.doanhSoTT += Number(src.doanhSoTT || 0);
}

function pct(n, d) {
  if (!d) return '0.00%';
  return `${((Number(n || 0) / Number(d || 0)) * 100).toFixed(2)}%`;
}

function moneyDiv(n, d) {
  const nn = Number(n || 0);
  const dd = Number(d || 0);
  if (!dd) return 0;
  return nn / dd;
}

function warnStyle(kind) {
  if (kind === 'bad') return { background: '#fde2e2', color: '#991b1b', fontWeight: 700 };
  if (kind === 'warn') return { background: '#fef3c7', color: '#92400e', fontWeight: 700 };
  if (kind === 'good') return { background: '#dcfce7', color: '#166534', fontWeight: 700 };
  return null;
}

function cpOverDsKind(cp, ds) {
  if (!Number(ds || 0)) return null;
  const r = moneyDiv(cp, ds);
  if (r >= 0.35) return 'bad';
  if (r >= 0.25) return 'warn';
  return 'good';
}

function chotKind(soDon, mess) {
  if (!Number(mess || 0)) return null;
  const r = moneyDiv(soDon, mess);
  if (r < 0.02) return 'bad';
  if (r < 0.03) return 'warn';
  return 'good';
}

export default function DashboardQuanTriBaoCaoCeoPanel({ globalFrom, globalTo, onChangeFrom, onChangeTo }) {
  const [rowsHn, setRowsHn] = useState([]);
  const [rowsHcm, setRowsHcm] = useState([]);
  const [rowsOrdersHn, setRowsOrdersHn] = useState([]);
  const [rowsOrdersHcm, setRowsOrdersHcm] = useState([]);
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
  const lastAllOptionsRef = useState(() => ({ shifts: [], teams: [], products: [], markets: [] }));

  const toggleInList = (list, value) => {
    const v = normalizePickValue(value);
    const next = new Set((list || []).map((x) => normalizePickValue(x)).filter(Boolean));
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return Array.from(next.values());
  };

  const uniqueSorted = (arr, pick) => {
    const s = new Set();
    (arr || []).forEach((x) => {
      const v = normalizePickValue(pick(x));
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
      const isMissingColumnErr = (err) => {
        const code = String(err?.code || '');
        const msg = String(err?.message || '').toLowerCase();
        const status = Number(err?.status || err?.statusCode || 0);
        // PostgREST hay trả 400 cho lỗi select sai cột; supabase-js đôi khi không set code/message rõ ràng.
        if (status === 400) return true;
        return code === '42703' || msg.includes('does not exist') || msg.includes('could not find');
      };

      const loadTable = async (tableName) => {
        const all = [];
        let lastErr = null;

        // Retry với select ngắn hơn nếu thiếu cột
        const candidates = selectCandidatesForTable(tableName);
        for (const selectStr of candidates) {
          try {
            all.length = 0;
            for (let page = 0; page < MAX_PAGES; page += 1) {
              const from = page * PAGE_SIZE;
              const to = from + PAGE_SIZE - 1;
              let q = supabase
                .from(tableName)
                .select(selectStr)
                // PostgREST: cột tiếng Việt / chữ hoa cần quote trong filter key, nếu không sẽ 400.
                .gte(MKT_DATE_COL, globalFrom)
                .lte(MKT_DATE_COL, globalTo);

              // Đồng bộ scope giống trang Báo cáo MKT HN (detail_reports).
              if (String(tableName || '').trim() === 'detail_reports') {
                q = q.or(MKT_DETAIL_REPORTS_SCOPE_OR);
              }

              const { data, error: qErr } = await q
                .order(MKT_DATE_COL, { ascending: true })
                .range(from, to);
              if (qErr) throw qErr;
              const batch = data || [];
              all.push(...batch);
              if (batch.length < PAGE_SIZE) break;
            }
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            if (!isMissingColumnErr(e)) break;
          }
        }

        if (lastErr) throw lastErr;
        return all;
      };

      const loadOrdersTable = async (tableName) => {
        const all = [];
        for (let page = 0; page < MAX_PAGES; page += 1) {
          const from = page * PAGE_SIZE;
          const to = from + PAGE_SIZE - 1;
          let q = supabase
            .from(tableName)
            .select(
              'id, order_code, order_date, created_at, country, delivery_status_nb, delivery_status, check_result, payment_status, payment_status_detail, total_amount_vnd, tong_tien_vnd, van_don_line_total_vnd, sale_price, goods_amount, tracking_code, shipping_unit, reconciled_vnd, reconciled_amount, payment_bill, payment_image, ngayupbill'
            )
            .gte('order_date', globalFrom)
            .lte('order_date', globalTo);

          // Đồng bộ logic trang Vận đơn Hà Nội: loại riêng chi nhánh HCM khỏi bảng `orders`.
          if (String(tableName || '').trim() === 'orders') {
            q = q.or('team.is.null,team.neq.HCM');
          }

          const { data, error: qErr } = await q
            .order('order_date', { ascending: true })
            .range(from, to);
          if (qErr) throw qErr;
          const batch = data || [];
          all.push(...batch);
          if (batch.length < PAGE_SIZE) break;
        }
        return all;
      };

      const [hn, hcm, ordersHn, ordersHcm] = await Promise.all([
        loadTable('detail_reports'),
        loadTable('marketing_report_hcm'),
        loadOrdersTable('orders'),
        loadOrdersTable('order_code_hcm'),
      ]);
      setRowsHn(hn);
      setRowsHcm(hcm);
      setRowsOrdersHn(ordersHn);
      setRowsOrdersHcm(ordersHcm);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Không tải được detail_reports / marketing_report_hcm');
      setRowsHn([]);
      setRowsHcm([]);
      setRowsOrdersHn([]);
      setRowsOrdersHcm([]);
    } finally {
      setLoading(false);
    }
  }, [globalFrom, globalTo]);

  useEffect(() => {
    load();
  }, [load]);

  const mappedAll = useMemo(() => {
    const out = [];
    // Khử trùng giống trang Báo cáo MKT để tránh cộng trùng số liệu (trùng key/ngày+tên+sp+tt+ca).
    const hnDeduped = dedupeMktDetailReportRows(rowsHn || []);
    const hcmDeduped = dedupeMktDetailReportRows(rowsHcm || []);
    for (const r of hnDeduped) {
      const m = mapMktReportRowToVirtual(r, 'hn');
      if (m) out.push(m);
    }
    for (const r of hcmDeduped) {
      const m = mapMktReportRowToVirtual(r, 'hcm');
      if (m) out.push(m);
    }
    return out;
  }, [rowsHn, rowsHcm]);

  const bucketFromRow = useCallback((r) => {
    const src = String(r?.__ceo_source || '').toLowerCase();
    if (src === 'hcm') return 'hcm';
    if (src === 'hn') return 'hn';
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
      shifts: filterOptions.shifts.includes(CEO_DEFAULT_SHIFT) ? [CEO_DEFAULT_SHIFT] : [...filterOptions.shifts],
      teams: [...filterOptions.teams],
      products: [...filterOptions.products],
      markets: [...filterOptions.markets],
    });
    didInitFiltersRef[1](true);
  }, [filterOptions.products, filterOptions.markets, filterOptions.shifts, filterOptions.teams, didInitFiltersRef]);

  // Khi options thay đổi sau khi đã init: giữ các value còn tồn tại, và auto-add value mới (để vẫn "tất cả").
  useEffect(() => {
    if (!didInitFiltersRef[0]) return;
    const prevAll = lastAllOptionsRef[0] || { shifts: [], teams: [], products: [], markets: [] };
    setFilters((prev) => {
      const reconcile = (prevSelected, allOptions, prevAllOptions) => {
        const allNorm = (allOptions || []).map((x) => normalizePickValue(x)).filter(Boolean);
        const allSet = new Set(allNorm);
        const prevSelNorm = (prevSelected || []).map((x) => normalizePickValue(x)).filter(Boolean);
        const kept = prevSelNorm.filter((x) => allSet.has(x));
        const wasAll = (prevAllOptions || []).length > 0 && prevSelNorm.length === (prevAllOptions || []).length;
        if (!wasAll) return kept;
        const keptSet = new Set(kept);
        const added = allNorm.filter((x) => !keptSet.has(x));
        return [...kept, ...added];
      };
      const next = {
        shifts: reconcile(prev.shifts, filterOptions.shifts, prevAll.shifts),
        teams: reconcile(prev.teams, filterOptions.teams, prevAll.teams),
        products: reconcile(prev.products, filterOptions.products, prevAll.products),
        markets: reconcile(prev.markets, filterOptions.markets, prevAll.markets),
      };
      if (
        arraysEqual(prev.shifts, next.shifts) &&
        arraysEqual(prev.teams, next.teams) &&
        arraysEqual(prev.products, next.products) &&
        arraysEqual(prev.markets, next.markets)
      ) {
        return prev;
      }
      return next;
    });
    lastAllOptionsRef[1]({
      shifts: (filterOptions.shifts || []).map((x) => normalizePickValue(x)).filter(Boolean),
      teams: (filterOptions.teams || []).map((x) => normalizePickValue(x)).filter(Boolean),
      products: (filterOptions.products || []).map((x) => normalizePickValue(x)).filter(Boolean),
      markets: (filterOptions.markets || []).map((x) => normalizePickValue(x)).filter(Boolean),
    });
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
      return {
        ...a,
        tiLeChot: moneyDiv(a.soDonTay, a.mess),
        tiLeChotTT: moneyDiv(a.soDonTT, a.mess),
        giaMess: moneyDiv(a.cpqc, a.mess),
        cps: moneyDiv(a.cpqc, a.soDonTT),
        cpDs: moneyDiv(a.cpqc, a.doanhSoTT),
        giaTbDon: moneyDiv(a.doanhSoTT, a.soDonTT),
      };
    };

    return [finalize(total), finalize(hcm), finalize(hn)];
  }, [mappedFiltered, bucketFromRow]);

  const vanDonOrdersMapped = useMemo(() => {
    const out = [];
    for (const r of rowsOrdersHn || []) {
      const m = mapOrderRowToVanDonVirtual(r, 'HN');
      if (m) out.push(m);
    }
    for (const r of rowsOrdersHcm || []) {
      const m = mapOrderRowToVanDonVirtual(r, 'HCM');
      if (m) out.push(m);
    }
    return out;
  }, [rowsOrdersHn, rowsOrdersHcm]);

  const vanDonByBranch = useMemo(() => {
    const by = { HCM: [], HN: [] };
    for (const r of vanDonOrdersMapped) {
      const b = String(r?.__ceo_branch || 'HN').toUpperCase() === 'HCM' ? 'HCM' : 'HN';
      by[b].push(r);
    }
    const rows = [
      { label: 'HCM', m: aggregateVanHanhSlice(by.HCM) },
      { label: 'HN', m: aggregateVanHanhSlice(by.HN) },
    ];
    const total = aggregateVanHanhSlice(vanDonOrdersMapped);
    return { rows, total };
  }, [vanDonOrdersMapped]);

  // Đã bỏ phần bảng theo ngày theo yêu cầu.

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
            <input
              type="date"
              value={globalFrom || ''}
              disabled={typeof onChangeFrom !== 'function'}
              onChange={(e) => onChangeFrom?.(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Đến ngày:
            <input
              type="date"
              value={globalTo || ''}
              disabled={typeof onChangeTo !== 'function'}
              onChange={(e) => onChangeTo?.(e.target.value)}
              style={inputStyle}
            />
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
                  <th>Số Mess</th>
                  <th>CPQC</th>
                  <th>DS Chốt (TT)</th>
                  <th>Tỉ lệ chốt</th>
                  <th>Tỉ lệ chốt (TT)</th>
                  <th>Giá Mess</th>
                  <th>CPS</th>
                  <th>%CP/DS</th>
                  <th>Giá TB Đơn</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((a) => (
                  <tr key={a.label} className={a.label === 'Tổng' ? 'total-row' : ''}>
                    <td className={a.label === 'Tổng' ? 'total-label' : 'text-left'}>{a.label}</td>
                    <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatNumber(a.mess)}</td>
                    <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatCurrency(a.cpqc)}</td>
                    <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatCurrency(a.doanhSoTT)}</td>
                    <td style={warnStyle(chotKind(a.soDonTay, a.mess))} className={a.label === 'Tổng' ? 'total-value' : ''}>
                      {pct(a.soDonTay, a.mess)}
                    </td>
                    <td style={warnStyle(chotKind(a.soDonTT, a.mess))} className={a.label === 'Tổng' ? 'total-value' : ''}>
                      {pct(a.soDonTT, a.mess)}
                    </td>
                    <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatCurrency(a.giaMess)}</td>
                    <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatCurrency(a.cps)}</td>
                    <td style={warnStyle(cpOverDsKind(a.cpqc, a.doanhSoTT))} className={a.label === 'Tổng' ? 'total-value' : ''}>
                      {pct(a.cpqc, a.doanhSoTT)}
                    </td>
                    <td className={a.label === 'Tổng' ? 'total-value' : ''}>{formatCurrency(a.giaTbDon)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 18 }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Vận đơn (orders)</h3>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
              Đã tải: <strong>{rowsOrdersHn.length}</strong> (HN: <code>orders</code>) +{' '}
              <strong>{rowsOrdersHcm.length}</strong> (HCM: <code>order_code_hcm</code>) — theo <code>order_date</code>,{' '}
              {globalFrom} → {globalTo}
            </div>

            <div className="table-responsive-container">
              <table>
                <thead>
                  <tr>
                    <th className="text-left">Khu vực</th>
                    <th>Tổng đơn</th>
                    <th>OK</th>
                    <th>Huỷ</th>
                    <th>Sau huỷ</th>
                    <th>Lên VH</th>
                    <th>Có mã</th>
                    <th>Đang giao</th>
                    <th>Giao TC</th>
                    <th>Có bill</th>
                    <th>%Thu/TC</th>
                    <th>Tổng tiền (VND)</th>
                    <th>Tiền đã thu (bill)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="total-row">
                    <td className="total-label text-left">Tổng</td>
                    <td className="total-value">{formatSlVi(vanDonByBranch.total.tongLenDon)}</td>
                    <td className="total-value">{formatSlVi(vanDonByBranch.total.ok)}</td>
                    <td className="total-value">{formatSlVi(vanDonByBranch.total.huyCheck)}</td>
                    <td className="total-value">{formatSlVi(vanDonByBranch.total.sauHuy)}</td>
                    <td className="total-value">{formatSlVi(vanDonByBranch.total.donDayVanHanh)}</td>
                    <td className="total-value">{formatSlVi(vanDonByBranch.total.coMa)}</td>
                    <td className="total-value">{formatSlVi(vanDonByBranch.total.dangGiao)}</td>
                    <td className="total-value">{formatSlVi(vanDonByBranch.total.giaoTC)}</td>
                    <td className="total-value">{formatSlVi(vanDonByBranch.total.donCoBill)}</td>
                    <td className="total-value">{formatPct(vanDonByBranch.total.donCoBill, vanDonByBranch.total.giaoTC)}</td>
                    <td className="total-value">{formatCurrency(vanDonByBranch.total.tongLenDonAmount)}</td>
                    <td className="total-value">{formatCurrency(vanDonByBranch.total.donCoBillAmount)}</td>
                  </tr>
                  {vanDonByBranch.rows.map(({ label, m }) => (
                    <tr key={label}>
                      <td className="text-left">{label}</td>
                      <td>{formatSlVi(m.tongLenDon)}</td>
                      <td>{formatSlVi(m.ok)}</td>
                      <td>{formatSlVi(m.huyCheck)}</td>
                      <td>{formatSlVi(m.sauHuy)}</td>
                      <td>{formatSlVi(m.donDayVanHanh)}</td>
                      <td>{formatSlVi(m.coMa)}</td>
                      <td>{formatSlVi(m.dangGiao)}</td>
                      <td>{formatSlVi(m.giaoTC)}</td>
                      <td>{formatSlVi(m.donCoBill)}</td>
                      <td>{formatPct(m.donCoBill, m.giaoTC)}</td>
                      <td>{formatCurrency(m.tongLenDonAmount)}</td>
                      <td>{formatCurrency(m.donCoBillAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
    </div>
  );
}

function mergeKeepAndAddNew(prevSelected, allOptions) {
  const normAll = (allOptions || []).map((x) => normalizePickValue(x)).filter(Boolean);
  const allSet = new Set(normAll);
  const kept = (prevSelected || []).map((x) => normalizePickValue(x)).filter((x) => allSet.has(x));
  const keptSet = new Set(kept);
  const added = normAll.filter((x) => !keptSet.has(x));
  return [...kept, ...added];
}

const labelStyle = { display: 'block', margin: '12px 0', fontSize: '0.95em', color: 'var(--text-medium)', fontWeight: 500 };
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', margin: '6px 0 12px', border: '1px solid var(--border-color)', borderRadius: 6, fontWeight: 500, fontSize: '0.95em' };
const selectStyle = { ...inputStyle, background: '#f3f4f6' };

function FilterHeader({ title }) {
  return <h3 style={{ marginTop: 16 }}>{title}</h3>;
}

function CheckboxList({ values, selected, allChecked, onToggleAll, onToggle, emptyLabel }) {
  const selectedSet = new Set((selected || []).map((x) => normalizePickValue(x)).filter(Boolean));
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
              <input
                type="checkbox"
                style={{ marginRight: 6 }}
                checked={selectedSet.has(normalizePickValue(v))}
                onChange={() => onToggle(v)}
              />
              {v}
            </label>
          ))
        )}
      </div>
    </div>
  );
}

