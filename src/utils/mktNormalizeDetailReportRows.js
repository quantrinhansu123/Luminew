/**
 * Chuẩn hóa dòng báo cáo MKT — bám sát `normalizeDetailReportRow` trong
 * `public/viewNsMoiNhanh.html` (HN) và `public/viewNsMoiNhanh-HCM.html` (HCM).
 */

/** Đếm đơn/mess: chuỗi "1.500" (VN) → 1500 */
export function parseIntegerVi(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  const s = String(v).trim().replace(/\./g, '').replace(/,/g, '');
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Giống HCM `parseMktCountInt` */
export function parseMktCountInt(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  return parseIntegerVi(v);
}

/**
 * Parse tiền — bám `parseMoneyNumber` trong viewNsMoiNhanh.html
 * (không được Number("1.500") trước vì JS coi là 1.5).
 */
export function parseMoneyNumber(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim();
  const compact = s.replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})+$/.test(compact)) {
    const n = Number(compact.replace(/\./g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  const direct = Number(compact.replace(',', '.'));
  if (Number.isFinite(direct)) return direct;
  const stripped = s.replace(/\./g, '').replace(/,/g, '');
  const n = Number(stripped);
  if (Number.isFinite(n)) return n;
  const digitsOnly = s.replace(/[^\d-]/g, '');
  const n2 = Number(digitsOnly);
  return Number.isFinite(n2) ? n2 : 0;
}

/** `detail_reports` (HN) — giống viewNsMoiNhanh.html */
export function normalizeMktHnDetailReportRow(item) {
  if (!item || typeof item !== 'object') return {};
  return {
    ...item,
    Ngày: item.ngay || item.Ngày || '',
    Team: item.team || item.Team || '',
    Tên: item.ten || item.Tên || '',
    Email: item.email || item.Email || '',
    Sản_phẩm: item.san_pham || item.Sản_phẩm || '',
    Thị_trường: item.thi_truong || item.Thị_trường || '',
    CPQC: parseMoneyNumber(
      item.CPQC ??
        item.cpqc ??
        item.CPOC ??
        item.cpoc ??
        item['CPQC theo TKQC'] ??
        item.cpqc_theo_tkqc ??
        0
    ),
    Số_Mess_Cmt: parseIntegerVi(item.so_mess_cmt ?? item['Số_Mess_Cmt'] ?? 0),
    'Số đơn': parseIntegerVi(item['Số đơn'] ?? item.so_don ?? 0),
    'Số đơn thực tế': parseIntegerVi(item['Số đơn thực tế'] ?? item.so_don_thuc_te ?? 0),
    'Doanh số': item['Doanh số'] ?? item.doanh_so ?? 0,
    'Doanh số TT':
      item.doanh_so_tt ??
      item['Doanh số TT'] ??
      item['Doanh thu chốt thực tế'] ??
      item.doanh_thu_chot_thuc_te ??
      item.revenue_actual ??
      0,
    'Doanh thu chốt thực tế':
      item['Doanh thu chốt thực tế'] ?? item.doanh_thu_chot_thuc_te ?? 0,
    'Số đơn hoàn hủy': parseIntegerVi(
      item['Số đơn hoàn hủy'] ??
        item['Số đơn hoàn huỷ'] ??
        item.so_don_hoan_huy ??
        item.so_don_hoan_huy_tt ??
        item.order_cancel_count ??
        0
    ),
    'Số đơn hoàn hủy thực tế': parseIntegerVi(
      item['Số đơn hoàn hủy thực tế'] ??
        item['Số đơn hoàn huỷ thực tế'] ??
        item.so_don_hoan_huy_thuc_te ??
        item.order_cancel_count_actual ??
        0
    ),
    'Doanh số hoàn hủy thực tế': item['Doanh số hoàn hủy thực tế'] ?? 0,
    'DS sau hoàn hủy': item['DS sau hoàn hủy'] ?? 0,
    'Doanh số sau hoàn hủy thực tế': item['Doanh số sau hoàn hủy thực tế'] ?? 0,
    'Doanh số sau ship': item['Doanh số sau ship'] ?? 0,
    'Doanh số TC': item['Doanh số TC'] ?? 0,
    KPIs: item.KPIs ?? item.kpis ?? 0,
    ca: item.ca || '',
    id_NS: item.id_NS || '',
    'Chức vụ': item.department || item['Chức vụ'] || '',
  };
}

/** `marketing_report_hcm` — giống viewNsMoiNhanh-HCM.html (trước overlay + dedupe) */
export function normalizeMktHcmDetailReportRow(item) {
  if (!item || typeof item !== 'object') return {};
  const donTT = parseMktCountInt(
    item['Số đơn thực tế'] ??
      item['Số_đơn_thực_tế'] ??
      item.so_don_thuc_te ??
      item.order_count_actual ??
      0
  );
  const soDonNhapTay = parseMktCountInt(item['Số đơn'] ?? item.so_don ?? item.order_count ?? 0);
  return {
    ...item,
    Ngày: item.Ngày || item.ngay || item.date || '',
    Team: item.Team || item.team || '',
    Tên: item.Tên || item.ten || item.name || '',
    Email: item.Email || item.email || '',
    Sản_phẩm: item.Sản_phẩm || item['Sản phẩm'] || item.san_pham || item.product || '',
    Thị_trường: item.Thị_trường || item['Thị trường'] || item.thi_truong || item.market || '',
    CPQC: parseMoneyNumber(
      item.CPQC ??
        item.cpqc ??
        item.CPOC ??
        item.cpoc ??
        item['CPQC theo TKQC'] ??
        item.cpqc_theo_tkqc ??
        0
    ),
    Số_Mess_Cmt: parseIntegerVi(
      item['Số Mess'] ??
        item['Số_Mess'] ??
        item['Số_Mess_Cmt'] ??
        item['Số Mess Cmt'] ??
        item.so_mess ??
        item.so_mess_cmt ??
        item.mess_count ??
        0
    ),
    'Số đơn': soDonNhapTay,
    'Số đơn thực tế': donTT,
    'Doanh số': item['Doanh số'] || item.doanh_so || item.revenue || 0,
    'Doanh số TT':
      item.doanh_so_tt ??
      item['Doanh số TT'] ??
      item['Doanh thu chốt thực tế'] ??
      item.doanh_thu_chot_thuc_te ??
      item.revenue_actual ??
      0,
    'Doanh thu chốt thực tế':
      item['Doanh thu chốt thực tế'] || item.doanh_thu_chot_thuc_te || item.revenue_actual || 0,
    'Số đơn hoàn hủy': parseMktCountInt(
      item['Số đơn hoàn hủy'] ??
        item['Số đơn hoàn huỷ'] ??
        item.so_don_hoan_huy ??
        item.order_cancel_count ??
        0
    ),
    'Số đơn hoàn hủy thực tế': parseMktCountInt(
      item['Số đơn hoàn hủy thực tế'] ??
        item['Số đơn hoàn huỷ thực tế'] ??
        item.so_don_hoan_huy_thuc_te ??
        item.order_cancel_count_actual ??
        0
    ),
    'Doanh số hoàn hủy thực tế':
      item['Doanh số hoàn hủy thực tế'] || item.doanh_so_hoan_huy_thuc_te || item.revenue_cancel_actual || 0,
    'DS sau hoàn hủy': item['DS sau hoàn hủy'] || item.ds_sau_hoan_huy || 0,
    'Doanh số sau hoàn hủy thực tế':
      item['Doanh số sau hoàn hủy thực tế'] || item.doanh_so_sau_hoan_huy_thuc_te || 0,
    'Doanh số sau ship': item['Doanh số sau ship'] || item.doanh_so_sau_ship || 0,
    'Doanh số TC': item['Doanh số TC'] || item.doanh_so_tc || 0,
    KPIs: item.KPIs || item.kpis || 0,
    ca: item.ca || item.Ca || item.shift || '',
    id_NS: item.id_NS || item.id_ns || item.id_NS || '',
    'Chức vụ': item['Chức vụ'] || item.chuc_vu || item['Vị trí'] || item.position || '',
  };
}
