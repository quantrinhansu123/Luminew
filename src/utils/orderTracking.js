/**
 * Lấy mã tracking từ một dòng orders (Supabase / import).
 * Một số nguồn dùng tên cột khác nhau.
 */
export function resolveTrackingFromOrder(item) {
  if (!item || typeof item !== 'object') return '';
  const pick = (v) => {
    if (v == null) return '';
    const s = String(v).trim();
    if (s === '' || s.toLowerCase() === 'null' || s === 'undefined') return '';
    return s;
  };
  const candidates = [
    item.tracking_code,
    item.ma_tracking,
    item.Tracking_Code,
    item.trackingCode,
    item.tracking,
    item['Mã Tracking'],
    item['Mã_Tracking'],
    item['Mã tracking'],
    item.Ma_Tracking,
    item.maTracking,
  ];
  for (const v of candidates) {
    const p = pick(v);
    if (p) return p;
  }
  return '';
}
