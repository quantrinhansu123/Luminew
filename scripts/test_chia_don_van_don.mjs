/**
 * Test giả lập thuật toán chia đơn vận đơn (cân bằng tải + vòng).
 *
 * Mục tiêu:
 * - Không cần Supabase
 * - Tạo dữ liệu giả đủ "phức tạp": lệch tải nền theo ngày VN, eligible=0/1, mismatch team, carry-over.
 *
 * Chạy:
 *   node scripts/test_chia_don_van_don.mjs
 */

import { yyyyMmDdVietNam } from '../src/services/chiaDonVanDon.js';

function ultraNormalize(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.\-_/]/g, ' ')
    .replace(/\s+/g, '')
    .trim();
}

function isTeamBranchMatch(orderTeamRaw, staffChiNhanhRaw) {
  const orderTeam = orderTeamRaw?.toString().trim() || '';
  const staffChiNhanh = staffChiNhanhRaw?.toString().trim() || '';
  const normalizedOrderTeam = ultraNormalize(orderTeam);
  const normalizedStaffChiNhanh = ultraNormalize(staffChiNhanh);

  const orderIsHCM =
    normalizedOrderTeam === 'hcm' ||
    normalizedOrderTeam === 'tphcm' ||
    normalizedOrderTeam === 'hochiminh' ||
    normalizedOrderTeam.includes('hcm');
  const staffIsHCM =
    normalizedStaffChiNhanh === 'hcm' ||
    normalizedStaffChiNhanh === 'tphcm' ||
    normalizedStaffChiNhanh === 'hochiminh' ||
    normalizedStaffChiNhanh.includes('hcm');

  const orderIsHanoi =
    normalizedOrderTeam === 'hanoi' ||
    normalizedOrderTeam === 'hn' ||
    normalizedOrderTeam.includes('hanoi');
  const staffIsHanoi =
    normalizedStaffChiNhanh === 'hanoi' ||
    normalizedStaffChiNhanh === 'hn' ||
    normalizedStaffChiNhanh.includes('hanoi');

  return (orderIsHCM && staffIsHCM) || (orderIsHanoi && staffIsHanoi);
}

/**
 * Giả lập phần smartDistribute (bản đã chỉnh: cân bằng tải + vòng).
 * @param {Array<{name:string, chi_nhanh:string}>} staffListWithBranch
 * @param {Array<{order_code:string, team?:string, order_date?:string}>} pendingOrders
 * @param {Array<{delivery_staff?:string, ngay_chia_van_don?:string, thu_tu_chia?:number, team?:string, id?:number}>} allDBOrders
 * @param {string} branchName
 */
function simulateSmartDistribute(staffListWithBranch, pendingOrders, allDBOrders, branchName) {
  const staffList = staffListWithBranch.map((s) => String(s.name || '').trim());
  const staffSet = new Set(staffList);

  // 1) carry-over: tìm người nhận gần nhất trong lịch sử (theo ngày chia + stt)
  const globalLastAssigned = [...allDBOrders]
    .filter((o) => {
      const ds = o.delivery_staff?.toString().trim();
      return ds && staffSet.has(ds);
    })
    .sort((a, b) => {
      const dateA = a.ngay_chia_van_don ? new Date(a.ngay_chia_van_don) : new Date(0);
      const dateB = b.ngay_chia_van_don ? new Date(b.ngay_chia_van_don) : new Date(0);
      if (dateB.getTime() !== dateA.getTime()) return dateB.getTime() - dateA.getTime();
      const sttA = Number(a.thu_tu_chia) || 0;
      const sttB = Number(b.thu_tu_chia) || 0;
      if (sttB !== sttA) return sttB - sttA;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });

  const lastAssignedPerson =
    globalLastAssigned.length > 0 ? globalLastAssigned[0].delivery_staff?.toString().trim() : null;
  const lastAssignedIndex = lastAssignedPerson ? staffList.indexOf(lastAssignedPerson) : -1;
  const startIndex = lastAssignedIndex >= 0 ? (lastAssignedIndex + 1) % staffListWithBranch.length : 0;

  // 2) tải nền: số đơn đã nhận trong ngày VN
  const todayStrVn = yyyyMmDdVietNam();
  const baseLoadByStaff = Object.fromEntries(staffList.map((n) => [n, 0]));
  for (const o of allDBOrders) {
    const ds = o.delivery_staff?.toString().trim();
    const ngay = o.ngay_chia_van_don?.toString().slice(0, 10);
    if (ds && staffSet.has(ds) && ngay === todayStrVn) baseLoadByStaff[ds] += 1;
  }

  // 3) chuẩn bị đơn theo thứ tự thời gian để ổn định
  const remainingOrders = [...pendingOrders].sort((a, b) => {
    const ta = a.order_date ? new Date(a.order_date).getTime() : 0;
    const tb = b.order_date ? new Date(b.order_date).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return String(a.order_code || '').localeCompare(String(b.order_code || ''));
  });

  // 4) chạy chia: quota theo phiên + vòng
  const sessionAssignedByStaff = Object.fromEntries(staffList.map((n) => [n, 0]));
  let nextIndex = startIndex;
  const result = [];
  const notDivided = [];

  // Quota tính theo số đơn có thể chia (eligible>0)
  const effectiveOrders = [];
  for (const order of remainingOrders) {
    let orderTeam = order.team?.toString().trim() || '';
    if (!orderTeam) orderTeam = branchName === 'HCM' ? 'HCM' : branchName === 'Hà Nội' ? 'Hà Nội' : '';
    let eligibleCount = 0;
    for (const staff of staffListWithBranch) {
      if (isTeamBranchMatch(orderTeam, staff.chi_nhanh)) eligibleCount += 1;
    }
    if (eligibleCount > 0) effectiveOrders.push(order);
    else notDivided.push({ ...order, reason: `eligible=0 (team="${orderTeam}")` });
  }

  const N = effectiveOrders.length;
  const M = staffListWithBranch.length;
  const q = M > 0 ? Math.floor(N / M) : 0;
  const r = M > 0 ? N % M : 0;

  const rosterAtStart = staffListWithBranch.map((s) => String(s?.name || '').trim());
  const rotatedRoster = [];
  for (let i = 0; i < rosterAtStart.length; i++) {
    rotatedRoster.push(rosterAtStart[(startIndex + i) % rosterAtStart.length]);
  }
  const capByStaff = {};
  rotatedRoster.forEach((name, idx) => {
    capByStaff[name] = q + (idx < r ? 1 : 0);
  });
  const overflowByStaff = Object.fromEntries(staffList.map((n) => [n, 0]));
  let quotaBrokenCount = 0;

  for (const order of effectiveOrders) {
    let orderTeam = order.team?.toString().trim() || '';
    if (!orderTeam) orderTeam = branchName === 'HCM' ? 'HCM' : branchName === 'Hà Nội' ? 'Hà Nội' : '';

    const eligible = [];
    for (let attempt = 0; attempt < staffListWithBranch.length; attempt++) {
      const idx = (nextIndex + attempt) % staffListWithBranch.length;
      const staff = staffListWithBranch[idx];
      if (isTeamBranchMatch(orderTeam, staff.chi_nhanh)) eligible.push({ idx, staff });
    }

    // eligible=0 đã được loại khỏi effectiveOrders ở bước pre-pass

    let chosen = eligible.find((cand) => {
      const name = String(cand.staff.name || '').trim();
      return (capByStaff[name] || 0) > 0;
    });

    if (!chosen) {
      quotaBrokenCount += 1;
      let best = null;
      let bestOv = Infinity;
      for (const cand of eligible) {
        const name = String(cand.staff.name || '').trim();
        const ov = overflowByStaff[name] || 0;
        if (ov < bestOv) {
          bestOv = ov;
          best = cand;
        }
      }
      chosen = best || eligible[0];
    }

    const chosenName = String(chosen.staff.name || '').trim();
    result.push({
      order_code: order.order_code,
      team: orderTeam,
      assigned: chosenName,
      loadBefore: (baseLoadByStaff[chosenName] || 0) + (sessionAssignedByStaff[chosenName] || 0),
      eligible: eligible.map((e) => String(e.staff.name || '').trim()),
    });

    if ((capByStaff[chosenName] || 0) > 0) capByStaff[chosenName] -= 1;
    else overflowByStaff[chosenName] = (overflowByStaff[chosenName] || 0) + 1;
    sessionAssignedByStaff[chosenName] += 1;

    // "Xuống cuối hàng" để tie-break vẫn theo vòng
    const staffItem = staffListWithBranch.splice(chosen.idx, 1)[0];
    staffListWithBranch.push(staffItem);
    nextIndex = chosen.idx % staffListWithBranch.length;
  }

  const counts = Object.fromEntries(staffList.map((n) => [n, 0]));
  for (const r of result) counts[r.assigned] += 1;
  const max = Math.max(...Object.values(counts));
  const min = Math.min(...Object.values(counts));

  return {
    branchName,
    todayStrVn,
    startIndex,
    lastAssignedPerson,
    baseLoadByStaff,
    sessionAssignedByStaff,
    counts,
    spread: { min, max, diff: max - min },
    result,
    notDivided,
    quota: { q, r, quotaBrokenCount },
  };
}

function section(title) {
  console.log('\n' + '═'.repeat(80));
  console.log(title);
  console.log('═'.repeat(80));
}

function printSummary(out) {
  console.log(`Branch: ${out.branchName}`);
  console.log(`Ngày VN: ${out.todayStrVn}`);
  console.log(`Carry-over (người cuối gần nhất): ${out.lastAssignedPerson || '(none)'} | startIndex=${out.startIndex}`);
  console.log('Tải nền (trong ngày VN):', out.baseLoadByStaff);
  console.log('Kết quả chia (đếm trong phiên):', out.counts);
  console.log('Spread (min/max/diff):', out.spread);
  if (out.quota) console.log('Quota (q/r/broken):', out.quota);
  if (out.notDivided.length) console.log(`Không chia được: ${out.notDivided.length} đơn (eligible=0)`);
}

function printDetails(out, limit = 30) {
  console.log(`\nChi tiết ${Math.min(limit, out.result.length)}/${out.result.length} đơn:`);
  for (const r of out.result.slice(0, limit)) {
    console.log(
      `- ${r.order_code} | team=${r.team} | -> ${r.assigned} | loadBefore=${r.loadBefore} | eligible=[${r.eligible.join(
        ', '
      )}]`
    );
  }
  if (out.notDivided.length) {
    console.log(`\nKhông chia được ${Math.min(limit, out.notDivided.length)}/${out.notDivided.length} đơn:`);
    for (const r of out.notDivided.slice(0, limit)) {
      console.log(`- ${r.order_code} | team=${r.team || '(null)'} | ${r.reason}`);
    }
  }
}

// ---------------------- MULTI-SESSION / DATA GENERATOR ----------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function pad3(n) {
  return String(n).padStart(3, '0');
}

function makeOrderCode(prefix, sessionNo, idx) {
  return `${prefix}-S${pad3(sessionNo)}-${pad3(idx)}`;
}

function generatePendingOrders({
  rng,
  branchName,
  sessionNo,
  nOrders,
  eligible0Rate = 0.05,
  eligible1Rate = 0.2,
  emptyTeamRate = 0.05,
}) {
  const teamsHcm = ['HCM', 'TP.HCM', 'Hồ Chí Minh'];
  const teamsHn = ['Hà Nội', 'Hanoi', 'hn'];
  const wrongTeams = ['Đà Nẵng', 'Cần Thơ', 'Japan', 'SG', ''];
  const goodTeams = branchName === 'HCM' ? teamsHcm : teamsHn;
  const otherTeams = branchName === 'HCM' ? teamsHn : teamsHcm;

  const orders = [];
  for (let i = 1; i <= nOrders; i++) {
    const roll = rng();
    let team = '';

    if (roll < eligible0Rate) {
      // eligible=0: team lạ hoặc team của chi nhánh còn lại
      team = rng() < 0.5 ? pick(rng, wrongTeams) : pick(rng, otherTeams);
    } else if (roll < eligible0Rate + eligible1Rate) {
      // eligible=1 (mô phỏng): gán team "good" nhưng ta sẽ lọc eligible ở ngoài bằng cách
      // đặt team về dạng chuẩn rồi giảm eligible staff thông qua roster mutation theo session.
      team = pick(rng, goodTeams);
    } else if (roll < eligible0Rate + eligible1Rate + emptyTeamRate) {
      team = '';
    } else {
      team = pick(rng, goodTeams);
    }

    orders.push({
      order_code: makeOrderCode(branchName === 'HCM' ? 'HCM' : 'HN', sessionNo, i),
      team,
      order_date: yyyyMmDdVietNam(),
    });
  }
  return orders;
}

function seedDbLoads({ rng, branchName, staffNames, baseMin = 0, baseMax = 12 }) {
  const todayVn = yyyyMmDdVietNam();
  const out = [];
  let id = 1;
  let stt = 1;
  for (const name of staffNames) {
    const n = baseMin + Math.floor(rng() * (baseMax - baseMin + 1));
    for (let i = 0; i < n; i++) {
      out.push({
        id: id++,
        team: branchName,
        delivery_staff: name,
        ngay_chia_van_don: todayVn,
        thu_tu_chia: stt++,
      });
    }
  }
  return out;
}

function applySessionResultToDb(allDbOrders, sessionResult) {
  const todayVn = yyyyMmDdVietNam();
  let nextId = Math.max(0, ...allDbOrders.map((o) => Number(o.id) || 0)) + 1;
  let nextStt = Math.max(0, ...allDbOrders.map((o) => Number(o.thu_tu_chia) || 0)) + 1;
  for (const r of sessionResult.result) {
    allDbOrders.push({
      id: nextId++,
      team: sessionResult.branchName,
      delivery_staff: r.assigned,
      ngay_chia_van_don: todayVn,
      thu_tu_chia: nextStt++,
    });
  }
}

function runMultiSessionSimulation({ seed = 20260504, sessions = 12 }) {
  const rng = mulberry32(seed);
  const todayVn = yyyyMmDdVietNam();

  // roster biến động theo phiên: mô phỏng bật/tắt U1 hoặc thiếu người
  const rosterHcmFull = [
    { name: 'Anh A', chi_nhanh: 'HCM' },
    { name: 'Bình B', chi_nhanh: 'TP.HCM' },
    { name: 'Châu C', chi_nhanh: 'Hồ Chí Minh' },
    { name: 'Đạt D', chi_nhanh: 'HCM' },
  ];
  const rosterHnFull = [
    { name: 'Em E', chi_nhanh: 'Hanoi' },
    { name: 'Dũng D', chi_nhanh: 'Hà Nội' },
    { name: 'Giang G', chi_nhanh: 'HN' },
  ];

  const dbHcm = seedDbLoads({
    rng,
    branchName: 'HCM',
    staffNames: rosterHcmFull.map((s) => s.name),
    baseMin: 0,
    baseMax: 10,
  });
  const dbHn = seedDbLoads({
    rng,
    branchName: 'Hà Nội',
    staffNames: rosterHnFull.map((s) => s.name),
    baseMin: 0,
    baseMax: 8,
  });

  section(`MULTI-SESSION SIMULATION (${sessions} phiên) — ngày VN ${todayVn}`);

  for (let s = 1; s <= sessions; s++) {
    // biến động roster: mỗi phiên có thể vắng 0-1 người
    const hcmRoster = structuredClone(rosterHcmFull);
    const hnRoster = structuredClone(rosterHnFull);

    if (rng() < 0.35 && hcmRoster.length > 2) hcmRoster.splice(Math.floor(rng() * hcmRoster.length), 1);
    if (rng() < 0.35 && hnRoster.length > 2) hnRoster.splice(Math.floor(rng() * hnRoster.length), 1);

    // biến động số đơn
    const nHcm = 10 + Math.floor(rng() * 50); // 10..59
    const nHn = 8 + Math.floor(rng() * 35); // 8..42

    // biến động tỷ lệ eligible=0/1
    const eligible0Rate = 0.03 + rng() * 0.12; // 3%..15%
    const eligible1Rate = 0.05 + rng() * 0.35; // 5%..40%

    const pendingHcm = generatePendingOrders({
      rng,
      branchName: 'HCM',
      sessionNo: s,
      nOrders: nHcm,
      eligible0Rate,
      eligible1Rate,
      emptyTeamRate: 0.05,
    });
    const pendingHn = generatePendingOrders({
      rng,
      branchName: 'Hà Nội',
      sessionNo: s,
      nOrders: nHn,
      eligible0Rate,
      eligible1Rate,
      emptyTeamRate: 0.05,
    });

    const outHcm = simulateSmartDistribute(structuredClone(hcmRoster), pendingHcm, dbHcm, 'HCM');
    const outHn = simulateSmartDistribute(structuredClone(hnRoster), pendingHn, dbHn, 'Hà Nội');

    const diffHcm = outHcm.spread.diff;
    const diffHn = outHn.spread.diff;
    const ndHcm = outHcm.notDivided.length;
    const ndHn = outHn.notDivided.length;

    console.log(
      `\nPhiên ${pad3(s)} | HCM: orders=${outHcm.result.length}/${nHcm} diff=${diffHcm} notDiv=${ndHcm} roster=${Object.keys(
        outHcm.counts
      ).length} | HN: orders=${outHn.result.length}/${nHn} diff=${diffHn} notDiv=${ndHn} roster=${Object.keys(outHn.counts).length}`
    );

    // in nhanh top lệch nếu quá lớn
    const warn = [];
    if (diffHcm > 1) warn.push(`HCM(diff=${diffHcm})`);
    if (diffHn > 1) warn.push(`HN(diff=${diffHn})`);
    if (warn.length) {
      console.log(`  ⚠️ Lệch > 1: ${warn.join(', ')} | eligible0Rate≈${eligible0Rate.toFixed(2)} eligible1Rate≈${eligible1Rate.toFixed(2)}`);
    }

    // apply kết quả phiên vào DB để session sau có tải nền/carry-over biến động
    applySessionResultToDb(dbHcm, outHcm);
    applySessionResultToDb(dbHn, outHn);
  }
}

// ---------------------- DATA GIẢ (CÓ ĐIỀU KIỆN PHỨC TẠP) ----------------------

const todayVn = yyyyMmDdVietNam();

// U1 HCM/HN (chi_nhanh là dữ liệu từ danh_sach_van_don)
const staffHcm = [
  { name: 'Anh A', chi_nhanh: 'HCM' },
  { name: 'Bình B', chi_nhanh: 'TP.HCM' },
  { name: 'Châu C', chi_nhanh: 'Hồ Chí Minh' },
];
const staffHn = [
  { name: 'Dũng D', chi_nhanh: 'Hà Nội' },
  { name: 'Em E', chi_nhanh: 'Hanoi' },
];

// Lịch sử trong DB (để tạo tải nền + carry-over)
const allDbOrdersHcm = [
  // Tải nền lệch: Anh A đã có nhiều đơn hôm nay
  { id: 1, team: 'HCM', delivery_staff: 'Anh A', ngay_chia_van_don: todayVn, thu_tu_chia: 10 },
  { id: 2, team: 'HCM', delivery_staff: 'Anh A', ngay_chia_van_don: todayVn, thu_tu_chia: 11 },
  { id: 3, team: 'HCM', delivery_staff: 'Anh A', ngay_chia_van_don: todayVn, thu_tu_chia: 12 },
  { id: 4, team: 'HCM', delivery_staff: 'Bình B', ngay_chia_van_don: todayVn, thu_tu_chia: 13 },
  // carry-over: đơn gần nhất thuộc Châu C (để startIndex = sau Châu C)
  { id: 5, team: 'HCM', delivery_staff: 'Châu C', ngay_chia_van_don: todayVn, thu_tu_chia: 99 },
];

const allDbOrdersHn = [
  { id: 6, team: 'Hà Nội', delivery_staff: 'Dũng D', ngay_chia_van_don: todayVn, thu_tu_chia: 7 },
  { id: 7, team: 'Hà Nội', delivery_staff: 'Dũng D', ngay_chia_van_don: todayVn, thu_tu_chia: 8 },
];

// Đơn cần chia (giả lập đã lọc delivery_staff trống, loại JP…)
const pendingHcm = [
  { order_code: 'HCM-001', team: 'HCM', order_date: todayVn },
  { order_code: 'HCM-002', team: 'TP.HCM', order_date: todayVn },
  { order_code: 'HCM-003', team: 'Hồ Chí Minh', order_date: todayVn },
  // team lạ → eligible=0
  { order_code: 'HCM-004', team: 'Đà Nẵng', order_date: todayVn },
  // team trống → sẽ gán mặc định theo branchName
  { order_code: 'HCM-005', team: '', order_date: todayVn },
  { order_code: 'HCM-006', team: 'HCM', order_date: todayVn },
];

const pendingHn = [
  { order_code: 'HN-001', team: 'Hà Nội', order_date: todayVn },
  { order_code: 'HN-002', team: 'Hanoi', order_date: todayVn },
  // eligible=0
  { order_code: 'HN-003', team: 'HCM', order_date: todayVn },
  { order_code: 'HN-004', team: '', order_date: todayVn },
  { order_code: 'HN-005', team: 'hn', order_date: todayVn },
];

// ---------------------- RUN ----------------------

section('TEST HCM (cân bằng tải + vòng)');
{
  // clone arrays để test không mutate dữ liệu gốc
  const out = simulateSmartDistribute(
    structuredClone(staffHcm),
    structuredClone(pendingHcm),
    structuredClone(allDbOrdersHcm),
    'HCM'
  );
  printSummary(out);
  printDetails(out);
}

section('TEST HÀ NỘI (cân bằng tải + vòng)');
{
  const out = simulateSmartDistribute(
    structuredClone(staffHn),
    structuredClone(pendingHn),
    structuredClone(allDbOrdersHn),
    'Hà Nội'
  );
  printSummary(out);
  printDetails(out);
}

runMultiSessionSimulation({ seed: 20260504, sessions: 15 });

