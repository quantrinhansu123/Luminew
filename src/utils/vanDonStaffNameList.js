/** Khớp bộ phận Vận đơn trên users.department. */
function isBoPhanVanDon(dept) {
  const raw = (dept ?? '').toString().trim();
  if (!raw) return false;
  if (isDepartmentResigned(raw)) return false;
  const compact = raw.toLowerCase().replace(/\s+/g, ' ');
  if (compact.includes('vận đơn') || compact.includes('van đơn')) return true;
  const ascii = raw.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ');
  if (ascii.includes('van don')) return true;
  if (ascii === 'logistics' || ascii.startsWith('logistics ')) return true;
  return false;
}

/** Chi nhánh Hà Nội trên chuỗi team / chi_nhanh (không HCM).
 *  Team trống / null → true (mặc định "không phải HCM" = cho phép hiển thị trong view HN).
 *  Trước đây trống → false → đơn bị loại khỏi danh sách đơn nhưng vẫn hiện ở báo cáo chi tiết.
 */
export function isHanoiBranchTeamLabel(teamRaw) {
  const raw = String(teamRaw ?? '').trim();
  if (!raw) return true; // Team trống → coi là không phải HCM → hiển thị
  const ascii = raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  if (
    ascii.includes('hcm') ||
    ascii.includes('ho chi minh') ||
    ascii.includes('tp.hcm') ||
    ascii.includes('tp hcm')
  ) {
    return false;
  }
  // Team có giá trị nhưng không chứa HCM → coi là HN (cho phép hiển thị)
  return true;
}

function isHcmBranchLabel(raw) {
  const ascii = String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  return (
    ascii.includes('hcm') ||
    ascii.includes('ho chi minh') ||
    ascii.includes('tp.hcm') ||
    ascii.includes('tp hcm')
  );
}

function isExplicitHanoiBranchLabel(raw) {
  const ascii = String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!ascii || isHcmBranchLabel(ascii)) return false;
  return (
    ascii.includes('ha noi') ||
    ascii.includes('hanoi') ||
    ascii === 'hn' ||
    ascii.startsWith('hn ') ||
    ascii.startsWith('hn-') ||
    ascii.startsWith('hn_')
  );
}

function normalizePersonNameKey(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.\-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function asciiLabel(raw) {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Bộ phận / team / vị trí đánh dấu nhân sự đã nghỉ (users). */
function isDepartmentResigned(deptRaw) {
  const a = asciiLabel(deptRaw);
  if (!a) return false;
  return a === 'nghi' || a === 'da nghi' || a.startsWith('da nghi');
}

/** Nhân sự đã nghỉ: department/team/position «Đã nghỉ»/«Nghỉ», hoặc dsvd trang_thai_chia = Nghỉ. */
function isVanDonStaffResigned(...fields) {
  for (const raw of fields) {
    const a = asciiLabel(raw);
    if (!a) continue;
    if (a === 'nghi' || a === 'da nghi' || a.startsWith('da nghi') || a.includes('da nghi')) {
      return true;
    }
    if (a === 'inactive' || a === 'disabled' || a === 'terminated' || a === 'off') return true;
  }
  return false;
}

function vanDonStaffMatchesBranch(vanDonBranch, branchPieces) {
  if (vanDonBranch === 'all') return true;
  const parts = (branchPieces || []).map((x) => String(x ?? '').trim()).filter(Boolean);
  if (vanDonBranch === 'hcm') {
    return parts.some((p) => isHcmBranchLabel(p));
  }
  if (vanDonBranch === 'hanoi') {
    // users: ưu tiên branch/chi_nhanh; team kiểu «Vận đơn - Hảo» không đủ để suy HN
    const branchFields = parts.filter((p) => {
      const a = asciiLabel(p);
      return (
        a.includes('ha noi') ||
        a.includes('hanoi') ||
        a === 'hn' ||
        a.startsWith('hn ') ||
        a.includes('hcm') ||
        a.includes('ho chi minh')
      );
    });
    const check = branchFields.length > 0 ? branchFields : parts;
    if (check.length === 0) return false;
    if (check.some((p) => isHcmBranchLabel(p))) return false;
    return check.some((p) => isExplicitHanoiBranchLabel(p));
  }
  return true;
}

/**
 * Danh sách tên NV vận đơn (users bộ phận Vận đơn + danh_sach_van_don).
 * Loại nhân sự đã nghỉ (users.department/team/position = Đã nghỉ|Nghỉ; dsvd trang_thai_chia = Nghỉ).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ vanDonBranch?: 'hanoi' | 'hcm' | 'all' }} [options]
 */
export async function fetchVanDonStaffNameList(supabaseClient, options = {}) {
  const vanDonBranch = options.vanDonBranch || 'all';
  const names = new Set();
  const resignedNameKeys = new Set();

  // --- users: bộ phận Vận đơn, loại đã nghỉ ---
  let usersRes = await supabaseClient
    .from('users')
    .select('name, department, team, branch, position, employment_status')
    .not('name', 'is', null)
    .order('name', { ascending: true });
  if (usersRes.error) {
    const msg = String(usersRes.error.message || '').toLowerCase();
    const missing =
      (msg.includes('does not exist') || msg.includes('could not find')) &&
      (msg.includes('position') ||
        msg.includes('employment_status') ||
        msg.includes('branch') ||
        msg.includes('team'));
    if (missing) {
      usersRes = await supabaseClient
        .from('users')
        .select('name, department, team, branch')
        .not('name', 'is', null)
        .order('name', { ascending: true });
    }
    if (usersRes.error) {
      usersRes = await supabaseClient
        .from('users')
        .select('name, department')
        .not('name', 'is', null)
        .order('name', { ascending: true });
    }
  }
  if (usersRes.error) throw usersRes.error;
  (usersRes.data || []).forEach((u) => {
    const n = String(u.name || '').trim();
    if (!n) return;
    if (
      isVanDonStaffResigned(u.department, u.team, u.position, u.employment_status)
    ) {
      resignedNameKeys.add(normalizePersonNameKey(n));
      return;
    }
    if (!isBoPhanVanDon(u.department)) return;
    if (!vanDonStaffMatchesBranch(vanDonBranch, [u.branch, u.team])) return;
    names.add(n);
  });

  // --- danh_sach_van_don: bổ sung master, loại Nghỉ ---
  let dsvdHasChiNhanh = true;
  let dsvdRes = await supabaseClient
    .from('danh_sach_van_don')
    .select('ho_va_ten, chi_nhanh, trang_thai_chia')
    .not('ho_va_ten', 'is', null);
  if (dsvdRes.error) {
    const m = String(dsvdRes.error.message || '').toLowerCase();
    if (m.includes('trang_thai_chia') && (m.includes('does not exist') || m.includes('could not find'))) {
      dsvdRes = await supabaseClient
        .from('danh_sach_van_don')
        .select('ho_va_ten, chi_nhanh')
        .not('ho_va_ten', 'is', null);
    } else if (m.includes('chi_nhanh') && (m.includes('does not exist') || m.includes('could not find'))) {
      dsvdHasChiNhanh = false;
      dsvdRes = await supabaseClient
        .from('danh_sach_van_don')
        .select('ho_va_ten, trang_thai_chia')
        .not('ho_va_ten', 'is', null);
    }
  }
  if (dsvdRes.error) {
    console.warn('danh_sach_van_don (ho_va_ten NV vận đơn):', dsvdRes.error);
  } else {
    (dsvdRes.data || []).forEach((r) => {
      const n = String(r.ho_va_ten || '').trim();
      if (!n) return;
      if (isVanDonStaffResigned(r.trang_thai_chia)) {
        resignedNameKeys.add(normalizePersonNameKey(n));
        return;
      }
      if (vanDonBranch !== 'all' && !dsvdHasChiNhanh) return;
      if (!vanDonStaffMatchesBranch(vanDonBranch, [r.chi_nhanh])) return;
      names.add(n);
    });
  }

  for (const n of [...names]) {
    if (resignedNameKeys.has(normalizePersonNameKey(n))) names.delete(n);
  }

  return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
}
