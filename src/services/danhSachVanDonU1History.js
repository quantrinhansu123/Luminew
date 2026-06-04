import { supabase } from '../supabase/config';

export function normalizeTrangThaiChia(val) {
  return String(val ?? '').trim();
}

export function isTrangThaiU1(val) {
  return normalizeTrangThaiChia(val).toUpperCase() === 'U1';
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

/**
 * Ghi một dòng lịch sử khi trạng thái chia thay đổi.
 * Không throw — lỗi chỉ log console.
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

  const payload = {
    danh_sach_van_don_id: recordId ?? null,
    ho_va_ten: String(hoVaTen).trim(),
    chi_nhanh: chiNhanh || null,
    trang_thai_cu: normalizeTrangThaiChia(fromStatus) || null,
    trang_thai_moi: normalizeTrangThaiChia(toStatus) || null,
    hanh_dong: action,
    changed_by: changedBy || readVanDonActorLabel(),
    ghi_chu: note || null,
  };

  try {
    const { error } = await supabase.from('danh_sach_van_don_u1_history').insert([payload]);
    if (error) {
      console.warn('[danhSachVanDonU1History] insert failed:', error.message);
      return { ok: false, error };
    }
    return { ok: true };
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
    const wantHcm = branchFilter.toUpperCase().includes('HCM');
    const wantHn =
      branchFilter.toLowerCase().includes('hà nội') ||
      branchFilter.toLowerCase().includes('ha noi') ||
      branchFilter.toUpperCase() === 'HN';
    rows = rows.filter((r) => {
      const b = String(r.chi_nhanh || '').toLowerCase();
      if (wantHcm) return b.includes('hcm') || b.includes('ho chi minh');
      if (wantHn) return b.includes('hà nội') || b.includes('ha noi') || b === 'hn';
      return String(r.chi_nhanh || '') === branchFilter;
    });
  }

  return rows;
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
