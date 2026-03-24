/**
 * Logic trích từ nhanSuSaleLumiMoi.html (giữ nguyên công thức / lọc / gom nhóm).
 */

export const NSSL_API_BASE = 'https://n-api-gamma.vercel.app';
/** KPI Sale — trong app (KPisale.html trên github.io bị CORS + timeout khi gọi n-api-rouge). */
export const NSSL_KPI_EMBED_PATH = '/embed/bao-cao-hieu-suat-kpi';
/** Trang trong app — thay Vandonsale.html (getAll ~7MB hay lỗi JSON: cắt nửa / chuỗi chưa escape). */
export const NSSL_VAN_DON_EMBED_PATH = '/embed/bao-cao-van-don';
export const NSSL_IFRAME_THU_CONG = 'https://nguyenbatyads37.github.io/static-html-show-data/baoCaoThuCong.html';

/** URL iframe Vận đơn Sale (same-origin để dùng session + API phân trang). */
export function buildVanDonEmbedUrl(idAppsheet) {
  if (typeof window === 'undefined') return NSSL_VAN_DON_EMBED_PATH;
  const base = `${window.location.origin}${NSSL_VAN_DON_EMBED_PATH}`;
  return idAppsheet ? `${base}?id=${encodeURIComponent(String(idAppsheet))}` : base;
}

/** URL iframe KPIs Sale (same-origin). */
export function buildKpiEmbedUrl(idAppsheet) {
  if (typeof window === 'undefined') return NSSL_KPI_EMBED_PATH;
  const base = `${window.location.origin}${NSSL_KPI_EMBED_PATH}`;
  return idAppsheet ? `${base}?id=${encodeURIComponent(String(idAppsheet))}` : base;
}

export function formatCurrency(value) {
  return Number(value || 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

export function formatPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '0.00%';
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

export function formatDateDisplay(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return String(dateValue ?? '');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function mapApiToRawRows(apiData) {
  return apiData
    .filter(
      (r) =>
        r['Tên'] &&
        String(r['Tên']).trim() !== '' &&
        r['Team'] &&
        String(r['Team']).trim() !== ''
    )
    .map((r) => ({
      chucVu: (r['Chức vụ'] || '').trim(),
      ten: (r['Tên'] || '').trim(),
      email: (r['Email'] || '').trim(),
      team: (r['Team'] || '').trim(),
      chiNhanh: (r['Chi nhánh'] || r['chi nhánh'] || '').trim() || 'Không xác định',
      ngay: r['Ngày'],
      ca: r['Ca'],
      sanPham: r['Sản phẩm'],
      thiTruong: r['Thị trường'],
      soMessCmt: Number(r['Số Mess']) || 0,
      soDon: Number(r['Đơn Mess']) || 0,
      dsChot: Number(r['Doanh số Mess']) || 0,
      phanHoi: Number(r['Phản hồi']) || 0,
      doanhSoDi: Number(r['Doanh số đi']) || 0,
      soDonHuy: Number(r['Số đơn Hoàn huỷ']) || 0,
      doanhSoHuy: Number(r['Doanh số hoàn huỷ']) || 0,
      soDonThanhCong: Number(r['Số đơn thành công']) || 0,
      doanhSoThanhCong: Number(r['Doanh số thành công']) || 0,
      soDonThucTe: Number(r['Số đơn thực tế']) || 0,
      doanhThuChotThucTe: Number(r['Doanh thu chốt thực tế']) || 0,
      doanhSoDiThucTe: Number(r['Doanh số đi thực tế']) || 0,
      soDonHoanHuyThucTe: Number(r['Số đơn hoàn hủy thực tế']) || 0,
      doanhSoHoanHuyThucTe: Number(r['Doanh số hoàn hủy thực tế']) || 0,
      doanhSoSauHoanHuyThucTe: Number(r['Doanh số sau hoàn hủy thực tế']) || 0,
    }));
}

const initialSummary = () => ({
  mess: 0,
  don: 0,
  chot: 0,
  phanHoi: 0,
  doanhSoDi: 0,
  soDonHuy: 0,
  doanhSoHuy: 0,
  soDonThanhCong: 0,
  doanhSoThanhCong: 0,
  soDonThucTe: 0,
  doanhThuChotThucTe: 0,
  doanhSoDiThucTe: 0,
  soDonHoanHuyThucTe: 0,
  doanhSoHoanHuyThucTe: 0,
  doanhSoSauHoanHuyThucTe: 0,
});

export function summarizeAndSortSalesData(data) {
  const summaryData = {};
  const tmpl = initialSummary();

  data.forEach((r) => {
    const name = r.ten;
    if (!summaryData[name]) {
      summaryData[name] = {
        chiNhanh: r.chiNhanh,
        team: r.team,
        ...initialSummary(),
      };
    }
    summaryData[name].mess += r.soMessCmt;
    summaryData[name].don += r.soDon;
    summaryData[name].chot += r.dsChot;
    summaryData[name].phanHoi += r.phanHoi;
    summaryData[name].soDonThucTe += r.soDonThucTe;
    summaryData[name].doanhThuChotThucTe += r.doanhThuChotThucTe;
    summaryData[name].soDonHoanHuyThucTe += r.soDonHoanHuyThucTe;
    summaryData[name].doanhSoHoanHuyThucTe += r.doanhSoHoanHuyThucTe;
    summaryData[name].doanhSoDi += r.doanhSoDi;
    summaryData[name].soDonHuy += r.soDonHuy;
    summaryData[name].doanhSoHuy += r.doanhSoHuy;
    summaryData[name].soDonThanhCong += r.soDonThanhCong;
    summaryData[name].doanhSoThanhCong += r.doanhSoThanhCong;
  });

  const flatList = Object.keys(summaryData)
    .map((name) => ({ name, ...summaryData[name] }))
    .sort(
      (a, b) =>
        a.team.localeCompare(b.team) || b.chot - a.chot || a.name.localeCompare(b.name)
    );

  const total = flatList.reduce((acc, item) => {
    Object.keys(tmpl).forEach((key) => {
      acc[key] += item[key];
    });
    return acc;
  }, initialSummary());

  return { flatList, total };
}

/** Lọc rawData theo restricted + ngày + checkbox (giống applyFilters HTML) */
export function filterRawData({
  rawData,
  isRestrictedView,
  allowedBranch,
  allowedTeam,
  allowedNames,
  startDateStr,
  endDateStr,
  productAll,
  selectedProducts,
  caAll,
  selectedShifts,
  teamAll,
  selectedTeams,
  marketAll,
  selectedMarkets,
}) {
  const startDate = startDateStr ? new Date(startDateStr) : null;
  if (startDate) startDate.setHours(0, 0, 0, 0);
  const endDate = endDateStr ? new Date(endDateStr) : null;
  if (endDate) endDate.setHours(23, 59, 59, 999);

  return rawData.filter((r) => {
    if (isRestrictedView) {
      if (allowedBranch) {
        const recordBranch = (r.chiNhanh || '').trim();
        if (recordBranch.toLowerCase() !== allowedBranch.toLowerCase()) return false;
      }
      if (allowedTeam) {
        const recordTeam = (r.team || '').trim();
        if (recordTeam !== allowedTeam) return false;
      }
      if (allowedNames.length > 0 && !allowedNames.includes(r.ten)) return false;
    }
    const recordDate = new Date(r.ngay);
    recordDate.setHours(12, 0, 0, 0);
    const isDateOk =
      (!startDate || recordDate >= startDate) && (!endDate || recordDate <= endDate);
    const isProductOk =
      productAll || (selectedProducts && selectedProducts.includes(r.sanPham));
    const isMarketOk =
      marketAll || (selectedMarkets && selectedMarkets.includes(r.thiTruong));
    const isShiftOk =
      caAll || (selectedShifts && selectedShifts.includes(String(r.ca)));
    const isTeamOk =
      teamAll || (selectedTeams && selectedTeams.includes(String(r.team)));
    return isDateOk && isProductOk && isMarketOk && isShiftOk && isTeamOk;
  });
}

export function filterRawForRestrictedPopulate(rawData, isRestrictedView, allowedBranch, allowedTeam, allowedNames) {
  if (!isRestrictedView) return rawData;
  return rawData.filter((r) => {
    if (allowedBranch) {
      const recordBranch = (r.chiNhanh || '').trim();
      return recordBranch.toLowerCase() === allowedBranch.toLowerCase();
    }
    if (allowedTeam) {
      const recordTeam = (r.team || '').trim();
      return recordTeam === allowedTeam;
    }
    if (allowedNames.length > 0) return allowedNames.includes(r.ten);
    return false;
  });
}

export function uniqueSorted(data, key) {
  return [...new Set(data.map((r) => r[key]).filter(Boolean))].sort();
}
