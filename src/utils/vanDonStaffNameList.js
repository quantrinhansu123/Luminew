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

function vanDonStaffMatchesBranch(vanDonBranch, branchPieces) {
  if (vanDonBranch === 'all') return true;
  const parts = (branchPieces || []).map((x) => String(x ?? '').trim()).filter(Boolean);
  if (vanDonBranch === 'hcm') {
    return parts.some((p) => isHcmBranchLabel(p));
  }
  if (vanDonBranch === 'hanoi') {
    if (parts.length === 0) return false;
    const joined = parts.join(' ');
    if (isHcmBranchLabel(joined)) return false;
    return parts.some((p) => isHanoiBranchTeamLabel(p));
  }
  return true;
}

/**
 * Danh sách tên NV vận đơn (users + danh_sach_van_don).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ vanDonBranch?: 'hanoi' | 'hcm' | 'all' }} [options] — mặc định `all`.
 */
export async function fetchVanDonStaffNameList(supabaseClient, options = {}) {
  const vanDonBranch = options.vanDonBranch || 'all';
  const names = new Set();

  let usersRes = await supabaseClient
    .from('users')
    .select('name, department, team, branch, chi_nhanh')
    .not('name', 'is', null)
    .order('name', { ascending: true });
  if (usersRes.error) {
    const msg = String(usersRes.error.message || '').toLowerCase();
    const missingChi =
      msg.includes('chi_nhanh') && (msg.includes('does not exist') || msg.includes('could not find'));
    if (missingChi) {
      usersRes = await supabaseClient
        .from('users')
        .select('name, department, team, branch')
        .not('name', 'is', null)
        .order('name', { ascending: true });
    } else {
      const missingBr =
        msg.includes('branch') && (msg.includes('does not exist') || msg.includes('could not find'));
      if (missingBr) {
        usersRes = await supabaseClient
          .from('users')
          .select('name, department, team, chi_nhanh')
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
    if (!isBoPhanVanDon(u.department)) return;
    const n = String(u.name || '').trim();
    if (!n) return;
    if (!vanDonStaffMatchesBranch(vanDonBranch, [u.team, u.branch, u.chi_nhanh])) return;
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
      if (vanDonBranch !== 'all' && !dsvdHasChiNhanh) return;
      if (!vanDonStaffMatchesBranch(vanDonBranch, [r.chi_nhanh])) return;
      names.add(n);
    });
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
}
