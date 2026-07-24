/** Khớp bộ phận Vận đơn trên users.department. */
function isBoPhanVanDon(dept) {
  const raw = (dept ?? '').toString().trim();
  if (!raw) return false;
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

function asciiLabel(raw) {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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

/**
 * Trạng thái nghỉ việc trên bảng `users`
 * (department / position / team / employment_status = Nghỉ, Đã nghỉ, Nghỉ việc…).
 */
function isUserNghiViecStatus(...fields) {
  for (const raw of fields) {
    const a = asciiLabel(raw);
    if (!a) continue;
    if (a.includes('nghi viec')) return true;
    if (a === 'nghi' || a === 'da nghi' || a.startsWith('da nghi')) return true;
    if (a === 'inactive' || a === 'terminated') return true;
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
    // users: ưu tiên branch; team kiểu «Vận đơn - Hảo» không đủ để suy HN
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
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{
 *   vanDonBranch?: 'hanoi' | 'hcm' | 'all',
 *   excludeNghiViec?: boolean
 * }} [options]
 * - `excludeNghiViec`: bỏ nhân sự nghỉ việc theo bảng `users` (bộ lọc tab Đơn nhắc hộ /van-don).
 */
export async function fetchVanDonStaffNameList(supabaseClient, options = {}) {
  const vanDonBranch = options.vanDonBranch || 'all';
  const excludeNghiViec = options.excludeNghiViec === true;
  const names = new Set();
  const nghiViecNameKeys = new Set();

  let usersRes = await supabaseClient
    .from('users')
    .select('name, department, team, branch, position, employment_status')
    .not('name', 'is', null)
    .order('name', { ascending: true });
  if (usersRes.error) {
    const msg = String(usersRes.error.message || '').toLowerCase();
    const missingExtra =
      (msg.includes('does not exist') || msg.includes('could not find')) &&
      (msg.includes('employment_status') || msg.includes('position') || msg.includes('branch'));
    if (missingExtra) {
      usersRes = await supabaseClient
        .from('users')
        .select('name, department, team, branch')
        .not('name', 'is', null)
        .order('name', { ascending: true });
    }
    if (usersRes.error) {
      const msg2 = String(usersRes.error.message || '').toLowerCase();
      const missingBr =
        msg2.includes('branch') && (msg2.includes('does not exist') || msg2.includes('could not find'));
      if (missingBr) {
        usersRes = await supabaseClient
          .from('users')
          .select('name, department, team')
          .not('name', 'is', null)
          .order('name', { ascending: true });
      } else {
        usersRes = await supabaseClient
          .from('users')
          .select('name, department')
          .not('name', 'is', null)
          .order('name', { ascending: true });
      }
    }
  }
  if (usersRes.error) throw usersRes.error;
  (usersRes.data || []).forEach((u) => {
    const n = String(u.name || '').trim();
    if (!n) return;
    // Chỉ lấy trạng thái nghỉ việc từ bảng users
    if (
      excludeNghiViec &&
      isUserNghiViecStatus(u.employment_status, u.department, u.position, u.team)
    ) {
      nghiViecNameKeys.add(normalizePersonNameKey(n));
      return;
    }
    if (!isBoPhanVanDon(u.department)) return;
    if (!vanDonStaffMatchesBranch(vanDonBranch, [u.branch, u.team])) return;
    names.add(n);
  });

  let dsvdHasChiNhanh = true;
  let dsvdRes = await supabaseClient
    .from('danh_sach_van_don')
    .select('ho_va_ten, chi_nhanh')
    .not('ho_va_ten', 'is', null);
  if (dsvdRes.error) {
    const m = String(dsvdRes.error.message || '').toLowerCase();
    if (m.includes('chi_nhanh') && (m.includes('does not exist') || m.includes('could not find'))) {
      dsvdHasChiNhanh = false;
      dsvdRes = await supabaseClient.from('danh_sach_van_don').select('ho_va_ten').not('ho_va_ten', 'is', null);
    }
  }
  if (dsvdRes.error) {
    console.warn('danh_sach_van_don (ho_va_ten NV vận đơn):', dsvdRes.error);
  } else {
    (dsvdRes.data || []).forEach((r) => {
      const n = String(r.ho_va_ten || '').trim();
      if (!n) return;
      if (excludeNghiViec && nghiViecNameKeys.has(normalizePersonNameKey(n))) return;
      if (vanDonBranch !== 'all' && !dsvdHasChiNhanh) return;
      if (!vanDonStaffMatchesBranch(vanDonBranch, [r.chi_nhanh])) return;
      names.add(n);
    });
  }

  if (excludeNghiViec) {
    for (const n of [...names]) {
      if (nghiViecNameKeys.has(normalizePersonNameKey(n))) names.delete(n);
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
}
