import { supabase } from '../supabase/config';

export function normalizeTrangThaiChia(val) {
  return String(val ?? '').trim();
}

export function isTrangThaiU1(val) {
  return normalizeTrangThaiChia(val).toUpperCase() === 'U1';
}

export function isTrangThaiU2(val) {
  return normalizeTrangThaiChia(val).toUpperCase() === 'U2';
}

/** U1 hoặc U2 — đang trong vòng chia đơn. */
export function isTrangThaiDangChia(val) {
  const s = normalizeTrangThaiChia(val).toUpperCase();
  return s === 'U1' || s === 'U2';
}

/** bat_u1 | tat_u1 | doi_trang_thai */
export function resolveU1HistoryAction(fromStatus, toStatus) {
  const from = normalizeTrangThaiChia(fromStatus);
  const to = normalizeTrangThaiChia(toStatus);
  if (from === to) return null;
  const fromU1 = isTrangThaiU1(from);
  const toU1 = isTrangThaiU1(to);
  if (!fromU1 && toU1) return 'bat_u1';
  if (fromU1 && !toU1) return 'tat_u1';
  return 'doi_trang_thai';
}

export function u1HistoryActionLabel(action) {
  switch (action) {
    case 'bat_u1':
      return 'Bật U1';
    case 'tat_u1':
      return 'Tắt U1';
    case 'doi_trang_thai':
      return 'Đổi trạng thái';
    default:
      return action || '—';
  }
}

export function readVanDonActorLabel() {
  const username = String(localStorage.getItem('username') || '').trim();
  const email = String(localStorage.getItem('userEmail') || '').trim();
  return username || email || 'hệ thống';
}

/** UUID hoặc số — khớp cột uuid/text/bigint trên lịch sử U1. */
function normalizeHistoryRecordId(recordId) {
  if (recordId == null || recordId === '') return null;
  const raw = String(recordId).trim();
  if (!raw) return null;
  // UUID (production danh_sach_van_don.id)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return raw;
  }
  // bigint / int dạng chuỗi số
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isSafeInteger(n)) return n;
    return raw;
  }
  return raw;
}

function isRecordIdTypeError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    msg.includes('invalid input syntax for type bigint') ||
    msg.includes('invalid input syntax for type uuid') ||
    msg.includes('danh_sach_van_don_id')
  );
}

/**
 * Ghi một dòng lịch sử khi trạng thái chia thay đổi.
 * Không throw — lỗi chỉ log console.
 * Nếu lệch kiểu id (uuid vs bigint), thử lại không kèm record id để vẫn lưu được thao tác.
 */
export async function logDanhSachVanDonU1Change({
  recordId,
  hoVaTen,
  chiNhanh,
  fromStatus,
  toStatus,
  changedBy,
  note,
}) {
  const action = resolveU1HistoryAction(fromStatus, toStatus);
  if (!action || !hoVaTen) return { ok: false, skipped: true };

  const basePayload = {
    ho_va_ten: String(hoVaTen).trim(),
    chi_nhanh: chiNhanh || null,
    trang_thai_cu: normalizeTrangThaiChia(fromStatus) || null,
    trang_thai_moi: normalizeTrangThaiChia(toStatus) || null,
    hanh_dong: action,
    changed_by: changedBy || readVanDonActorLabel(),
    ghi_chu: note || null,
  };

  const normalizedId = normalizeHistoryRecordId(recordId);
  const attempts = normalizedId != null
    ? [
        { ...basePayload, danh_sach_van_don_id: normalizedId },
        basePayload,
      ]
    : [basePayload];

  try {
    let lastError = null;
    for (let i = 0; i < attempts.length; i += 1) {
      const { error } = await supabase.from('danh_sach_van_don_u1_history').insert([attempts[i]]);
      if (!error) {
        if (i > 0) {
          console.warn(
            '[danhSachVanDonU1History] insert ok without danh_sach_van_don_id (column type mismatch?). Run migration fix_u1_history_record_id_uuid.'
          );
        }
        return { ok: true, withoutRecordId: i > 0 };
      }
      lastError = error;
      if (i === 0 && attempts.length > 1 && isRecordIdTypeError(error)) {
        console.warn('[danhSachVanDonU1History] insert with record id failed, retrying without id:', error.message);
        continue;
      }
      console.warn('[danhSachVanDonU1History] insert failed:', error.message);
      return { ok: false, error };
    }
    console.warn('[danhSachVanDonU1History] insert failed:', lastError?.message);
    return { ok: false, error: lastError };
  } catch (err) {
    console.warn('[danhSachVanDonU1History] insert exception:', err);
    return { ok: false, error: err };
  }
}

export async function fetchDanhSachVanDonU1History({
  startDate,
  endDate,
  branchFilter,
  hoVaTen,
  limit = 500,
} = {}) {
  let query = supabase
    .from('danh_sach_van_don_u1_history')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(limit);

  if (startDate) {
    query = query.gte('changed_at', `${startDate}T00:00:00+07:00`);
  }
  if (endDate) {
    query = query.lte('changed_at', `${endDate}T23:59:59.999+07:00`);
  }
  if (hoVaTen) {
    query = query.ilike('ho_va_ten', `%${String(hoVaTen).trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = data || [];
  if (branchFilter) {
    rows = rows.filter((r) => historyRowMatchesBranch(r, normalizeBranchFilterKey(branchFilter)));
  }

  return rows;
}

/** Chuẩn hóa filter chi nhánh về key báo cáo: HCM | Hà Nội | nguyên gốc. */
function normalizeBranchFilterKey(branchFilter) {
  const raw = String(branchFilter || '').trim();
  if (!raw) return '';
  const ascii = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (ascii.includes('hcm') || ascii.includes('ho chi minh') || ascii === 'tphcm') return 'HCM';
  if (ascii.includes('ha noi') || ascii === 'hn' || ascii.includes('hanoi')) return 'Hà Nội';
  return raw;
}

/** Khớp chi nhánh lịch sử với key báo cáo (HCM | Hà Nội). */
export function historyRowMatchesBranch(row, branchKey) {
  if (!branchKey) return true;
  const b = String(row?.chi_nhanh || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (branchKey === 'HCM') {
    return b.includes('hcm') || b.includes('ho chi minh') || b === 'tphcm';
  }
  if (branchKey === 'Hà Nội') {
    return b.includes('ha noi') || b === 'hn' || b.includes('hanoi');
  }
  return String(row?.chi_nhanh || '') === branchKey;
}

export function formatU1HistoryDateKey(changedAt) {
  if (!changedAt) return '—';
  try {
    return new Date(changedAt).toLocaleDateString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function formatU1HistoryDateTime(changedAt) {
  if (!changedAt) return '—';
  try {
    return new Date(changedAt).toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function formatU1HistoryTimeOnly(changedAt) {
  if (!changedAt) return '—';
  try {
    return new Date(changedAt).toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function buildU1HistoryStaffSummary(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const name = String(row.ho_va_ten || '').trim();
    if (!name) continue;
    if (!map.has(name)) {
      map.set(name, { name, bat: 0, tat: 0, other: 0, total: 0 });
    }
    const s = map.get(name);
    s.total += 1;
    if (row.hanh_dong === 'bat_u1') s.bat += 1;
    else if (row.hanh_dong === 'tat_u1') s.tat += 1;
    else s.other += 1;
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export function groupU1HistoryByDate(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = formatU1HistoryDateKey(row.changed_at);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()].sort((a, b) => {
    const ta = a[1][0]?.changed_at ? new Date(a[1][0].changed_at).getTime() : 0;
    const tb = b[1][0]?.changed_at ? new Date(b[1][0].changed_at).getTime() : 0;
    return tb - ta;
  });
}
