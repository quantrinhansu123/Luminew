import { DROPDOWN_OPTIONS } from '../types';

/** Chuẩn hóa để so khớp nhãn (ẩn lựa chọn không phân biệt hoa/thường, dấu). */
function ffmGridDeliveryStatusNormKey(s) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  try {
    return t.normalize('NFC').toLocaleLowerCase('vi');
  } catch {
    return t.toLowerCase();
  }
}

/**
 * Các trạng thái không hiển thị trong `<select>` ô «Trạng thái giao hàng» trên lưới FFM
 * (vẫn xuất hiện nếu đúng là giá trị đang có của ô — xem `ffmGridDeliveryStatusSelectOptions`).
 */
const FFM_GRID_DELIVERY_STATUS_HIDDEN = new Set(
  [
    'Chưa Giao',
    'Hủy',
    'chờ check',
    'chở check',
    'Giao không thành công',
    'Bom_Thất Lạc',
    'Giao Thành Công',
    'Giao hàng thành công',
  ].map(ffmGridDeliveryStatusNormKey)
);

function isFfmGridDeliveryStatusHiddenOption(val) {
  const k = ffmGridDeliveryStatusNormKey(val);
  if (!k) return false;
  return FFM_GRID_DELIVERY_STATUS_HIDDEN.has(k);
}

/**
 * Giá trị «Trạng thái giao hàng» (FFM order management) dùng cho lọc — khớp ô trên lưới.
 * mapSupabaseOrderToApp ghi cả `delivery_status` và «Trạng thái giao hàng»; một số dòng có thể chỉ đủ một khóa.
 */
export function getFfmOrderMgmtDeliveryStatusForRow(row) {
  if (!row || typeof row !== 'object') return '';
  const v = row.delivery_status ?? row['Trạng thái giao hàng'] ?? '';
  return String(v ?? '').trim();
}

/**
 * Giá trị dùng để **lọc** theo «Trạng thái giao hàng»: nếu có `delivery_status` trong pending (chưa lưu),
 * dùng `originalValue` để dòng vẫn khớp bộ lọc đang bật cho đến khi Xác nhận lưu.
 */
export function getFfmOrderMgmtDeliveryStatusForFilter(row, orderId, pendingChanges) {
  const oid = orderId != null && String(orderId).trim() !== '' ? String(orderId) : null;
  if (oid && pendingChanges && typeof pendingChanges.get === 'function') {
    const pend = pendingChanges.get(oid)?.get('delivery_status');
    if (pend) {
      return String(pend.originalValue ?? '').trim();
    }
  }
  return getFfmOrderMgmtDeliveryStatusForRow(row);
}

/** So khớp lọc dropdown / MultiSelect (tránh lệch NHẬN vs Nhận, v.v.). */
export function ffmOrderMgmtDeliveryStatusesMatch(cellVal, filterVal) {
  const a = String(cellVal ?? '').trim();
  const b = String(filterVal ?? '').trim();
  if (a === b) return true;
  try {
    return (
      a.normalize('NFC').toLocaleLowerCase('vi') === b.normalize('NFC').toLocaleLowerCase('vi')
    );
  } catch {
    return a.toLowerCase() === b.toLowerCase();
  }
}

/**
 * Dropdown lọc tiêu đề cột «Trạng thái giao hàng»: hiển thị đầy đủ giá trị
 * (preset + mọi distinct trong dữ liệu), KHÔNG áp tập ẩn của ô edit.
 * `rows` nên là `ffmEnrichedRowsForFilter` (đã trộn pending).
 */
export function getFfmDeliveryStatusFilterDropdownOptions(rows) {
  const preset = (DROPDOWN_OPTIONS['Trạng thái giao hàng'] || []).filter(
    (o) => o != null && String(o).trim() !== ''
  );
  const fromData = new Set();
  for (const row of rows || []) {
    const v = getFfmOrderMgmtDeliveryStatusForRow(row);
    if (v) fromData.add(v);
  }
  const ordered = [];
  const seen = new Set();
  for (const p of preset) {
    if (!seen.has(p)) {
      seen.add(p);
      ordered.push(p);
    }
  }
  const extras = [...fromData].filter((v) => !seen.has(v));
  extras.sort((a, b) => String(a).localeCompare(String(b), 'vi'));
  return [...ordered, ...extras];
}

/**
 * `<select>` trong ô lưới «Trạng thái giao hàng»: fix cứng 4 lựa chọn.
 * Nếu ô đang có giá trị nằm ngoài 4 tùy chọn, thêm vào để `<select>` không mất giá trị hiện tại.
 */
export const FFM_GRID_DELIVERY_STATUS_FIXED_OPTIONS = ['', 'NHÃN', 'ĐANG GIAO', 'ĐÃ GIAO', 'HOÀN'];

export function ffmGridDeliveryStatusSelectOptions(_enrichedRows, currentVal) {
  const fixed = [...FFM_GRID_DELIVERY_STATUS_FIXED_OPTIONS];
  const raw = currentVal == null ? '' : String(currentVal).trim();
  // Thêm giá trị hiện tại nếu không nằm trong danh sách cố định (dữ liệu cũ)
  if (raw !== '' && !fixed.some((o) => String(o) === raw)) {
    fixed.push(raw);
  }
  return fixed;
}
