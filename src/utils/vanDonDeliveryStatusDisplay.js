import { isVanDonSemanticEmpty } from './vanDonSemanticEmpty';

/**
 * Chuẩn hoá nhãn trạng thái giao cho lưới Vận đơn: bộ FFM (`delivery_status`) dùng NHÃN/ĐANG GIAO/ĐÃ GIAO/HOÀN,
 * bộ NB (`delivery_status_nb`) dùng cùng nội dung nghiệp vụ với cách viết khác (vd. «Giao Thành Công»).
 * Hàm này chỉ dùng khi hiển thị / chọn trên cột NB — không tự ghi DB.
 */
export function normalizeVanDonNbDeliveryStatusDisplay(raw) {
  if (raw == null) return '';
  const s = String(raw).replace(/[\u00a0\u200b\ufeff]/g, '').trim();
  if (s === '') return '';
  const key = s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  const fromFfm = new Map([
    ['đã giao', 'Giao Thành Công'],
    ['đang giao', 'Đang Giao'],
    ['hoàn', 'Hoàn'],
    ['nhãn', 'NHÃN'],
  ]);
  if (fromFfm.has(key)) return fromFfm.get(key);
  return s;
}

/** Giá trị hiển thị cột trạng thái NB: ưu tiên `delivery_status_nb`, sau đó cột gộp + `delivery_status`. */
export function resolveVanDonDeliveryStatusForNbColumn(row) {
  if (!row) return '';
  const nb = row['Trạng thái giao hàng NB'] ?? row.delivery_status_nb;
  if (!isVanDonSemanticEmpty(nb)) return String(nb).trim();
  const merged = row['Trạng thái giao hàng'];
  if (!isVanDonSemanticEmpty(merged)) return String(merged).trim();
  const ffm = row.delivery_status;
  if (!isVanDonSemanticEmpty(ffm)) return String(ffm).trim();
  return '';
}
