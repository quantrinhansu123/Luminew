/**
 * Script chạy toàn bộ quy trình phân bổ CSKH (Chia Full)
 * 
 * Usage:
 *   node run_chia_full_cskh.js <team> <month>
 * 
 * Example:
 *   node run_chia_full_cskh.js Sale 2026-01
 *   node run_chia_full_cskh.js RD 2026-01
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Supabase configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://gsjhsmxyxjyiqovauyrp.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Lỗi: Thiếu thông tin Supabase. Vui lòng kiểm tra .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('❌ Usage: node run_chia_full_cskh.js <team> <month>');
  console.error('   Example: node run_chia_full_cskh.js Sale 2026-01');
  process.exit(1);
}

const selectedTeam = args[0]; // 'Sale' or 'RD'
const selectedMonth = args[1]; // 'YYYY-MM'

console.log('🚀 Bắt đầu quy trình phân bổ CSKH (Chia Full)');
console.log(`   Team: ${selectedTeam}`);
console.log(`   Tháng: ${selectedMonth}`);
console.log('');

// Helper function: Lấy tháng từ order_date (format: YYYY-MM)
const getMonthKey = (orderDate) => {
  if (!orderDate) return null;
  const date = new Date(orderDate);
  if (isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

function normalizeDeptBranchCompare(str) {
  return String(str ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function userDepartmentIsCSKH(dept) {
  const d = normalizeDeptBranchCompare(dept);
  if (!d) return false;
  return d === 'cskh' || d.includes('cskh');
}

function userBranchMatchesOrderTeam(branchOrTeam, orderTeamFilter) {
  const b = normalizeDeptBranchCompare(branchOrTeam);
  const t = normalizeDeptBranchCompare(orderTeamFilter);
  if (!t || !b) return false;

  const isOrderHcm =
    t === 'hcm' ||
    t.includes('hcm') ||
    t.includes('hồ chí minh') ||
    t.includes('ho chi minh') ||
    t.includes('tp.hcm') ||
    t.includes('tp hcm');
  const isOrderHanoi =
    t.includes('hà nội') ||
    t.includes('ha noi') ||
    t === 'hn' ||
    t.includes('hanoi');

  if (isOrderHcm) {
    return (
      b === 'hcm' ||
      b.includes('hcm') ||
      b.includes('hồ chí minh') ||
      b.includes('ho chi minh') ||
      b.includes('tp.hcm') ||
      b.includes('tp hcm') ||
      b.includes('sài gòn') ||
      b.includes('sai gon')
    );
  }
  if (isOrderHanoi) {
    return b.includes('hà nội') || b.includes('ha noi') || b === 'hn' || b.includes('hanoi');
  }
  return b === t || b.includes(t) || t.includes(b);
}

/** CSKH từ users: department chứa CSKH + branch/team khớp team đơn (vd. Sale, Hà Nội, HCM). */
async function loadCSKHStaffForBranch(orderTeamBranch) {
  const branchKey = String(orderTeamBranch ?? '').trim();
  if (!branchKey) {
    throw new Error('Thiếu team/chi nhánh để tải danh sách CSKH');
  }
  try {
    const { data, error } = await supabase
      .from('users')
      .select('name, email, department, position, branch, team')
      .order('name', { ascending: true });

    if (error) throw error;

    const staffNames = (data || [])
      .filter((u) => {
        if (!userDepartmentIsCSKH(u.department)) return false;
        const br = u.branch ?? u.team ?? '';
        return userBranchMatchesOrderTeam(br, branchKey);
      })
      .map((u) => u.name)
      .filter(Boolean);

    console.log(`✅ Đã tải ${staffNames.length} nhân sự CSKH (chi nhánh / team khớp "${branchKey}")`);
    return staffNames;
  } catch (error) {
    console.error('❌ Lỗi khi tải danh sách nhân sự CSKH:', error.message);
    throw error;
  }
}

// Phân bổ đơn hàng
async function handlePhanBoDonHang(staffList) {
  try {
    // Parse selectedMonth để filter đơn hàng
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    console.log(`📅 Lọc đơn hàng từ ${startDate.toISOString().split('T')[0]} đến ${endDate.toISOString().split('T')[0]}`);

    // Lấy tất cả đơn hàng thỏa điều kiện
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('team', selectedTeam)
      .eq('accountant_confirm', 'Đã thu tiền')
      .gte('order_date', startDate.toISOString().split('T')[0])
      .lte('order_date', endDate.toISOString().split('T')[0]);

    if (ordersError) throw ordersError;

    console.log(`📦 Tìm thấy ${orders?.length || 0} đơn hàng thỏa điều kiện`);

    // Filter: Chỉ chia các đơn có cột CSKH trống
    const eligibleOrders = orders?.filter(order => {
      const hasCSKH = order.cskh && order.cskh.toString().trim() !== '';
      return !hasCSKH;
    }) || [];

    console.log(`📋 Có ${eligibleOrders.length} đơn hàng cần phân bổ (CSKH trống)`);

    // Đếm số đơn hiện tại của mỗi nhân viên THEO TỪNG THÁNG
    const counter = {};
    staffList.forEach(name => {
      counter[name] = {};
    });

    // Đếm đơn đã có CSKH (không phải Sale tự chăm) - theo tháng
    orders?.forEach(order => {
      const cskh = order.cskh?.toString().trim();
      const sale = order.sale_staff?.toString().trim();
      const monthKey = getMonthKey(order.order_date);
      
      if (cskh && staffList.includes(cskh) && cskh !== sale && monthKey) {
        counter[cskh][monthKey] = (counter[cskh][monthKey] || 0) + 1;
      }
    });

    // Xử lý đơn Sale tự chăm
    const waitingRows = [];
    const updates = [];

    eligibleOrders.forEach(order => {
      const sale = order.sale_staff?.toString().trim();
      
      // Nếu Sale là CSKH -> tự chăm
      if (sale && staffList.includes(sale)) {
        updates.push({
          order_code: order.order_code,
          cskh: sale
        });
      } else {
        waitingRows.push(order);
      }
    });

    console.log(`👤 Đơn Sale tự chăm: ${updates.length}`);
    console.log(`⏳ Đơn cần chia: ${waitingRows.length}`);

    // Chia đều các đơn còn lại - THEO THÁNG của Ngày lên đơn
    waitingRows.forEach(order => {
      const monthKey = getMonthKey(order.order_date);
      if (!monthKey) {
        console.warn(`⚠️  Đơn ${order.order_code} không có order_date hợp lệ`);
        return;
      }

      let selectedName = null;
      let minVal = Infinity;

      staffList.forEach(name => {
        // Đếm số đơn của nhân viên này trong tháng này
        const val = counter[name][monthKey] || 0;
        if (val < minVal) {
          minVal = val;
          selectedName = name;
        }
      });

      if (selectedName) {
        updates.push({
          order_code: order.order_code,
          cskh: selectedName
        });
        // Tăng counter cho tháng này
        counter[selectedName][monthKey] = (counter[selectedName][monthKey] || 0) + 1;
      }
    });

    console.log(`✅ Tổng cộng ${updates.length} đơn sẽ được cập nhật`);

    // Cập nhật database
    if (updates.length > 0) {
      const CHUNK_SIZE = 50;
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const chunk = updates.slice(i, i + CHUNK_SIZE);
        const updatePromises = chunk.map(update => 
          supabase
            .from('orders')
            .update({ cskh: update.cskh })
            .eq('order_code', update.order_code)
        );
        
        const results = await Promise.all(updatePromises);
        results.forEach(result => {
          if (result.error) {
            errorCount++;
            console.error(`❌ Lỗi cập nhật ${chunk.find(u => u.order_code === result.data?.[0]?.order_code)?.order_code}:`, result.error.message);
          } else {
            successCount++;
          }
        });

        console.log(`📊 Đã xử lý ${Math.min(i + CHUNK_SIZE, updates.length)}/${updates.length} đơn...`);
      }

      const message = `✅ Phân bổ đơn hàng thành công!\n\n` +
        `- Tổng đơn đã xử lý: ${updates.length}\n` +
        `- Thành công: ${successCount}\n` +
        `- Lỗi: ${errorCount}\n` +
        `- Đơn Sale tự chăm: ${updates.filter(u => orders?.find(o => o.order_code === u.order_code)?.sale_staff === u.cskh).length}\n` +
        `- Đơn được chia mới: ${updates.length - updates.filter(u => orders?.find(o => o.order_code === u.order_code)?.sale_staff === u.cskh).length}\n` +
        `- Nhân sự CSKH: ${staffList.length} người`;

      console.log('\n' + message);
      return { success: true, message, updatesCount: updates.length };
    } else {
      console.log('ℹ️  Không có đơn nào cần cập nhật');
      return { success: true, message: 'Không có đơn nào cần phân bổ', updatesCount: 0 };
    }
  } catch (error) {
    console.error('❌ Lỗi trong handlePhanBoDonHang:', error.message);
    throw error;
  }
}

// Main function
async function main() {
  try {
    // 1. Load CSKH staff (theo team đơn — cùng logic AdminTools)
    const staffList = await loadCSKHStaffForBranch(selectedTeam);
    if (staffList.length === 0) {
      throw new Error(
        `Không có nhân sự CSKH cho team/chi nhánh "${selectedTeam}". Kiểm tra users.department (CSKH) và branch/team.`
      );
    }

    // 2. Phân bổ đơn hàng
    const result = await handlePhanBoDonHang(staffList);

    console.log('\n🎉 Hoàn tất quy trình phân bổ CSKH!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    process.exit(1);
  }
}

// Run
main();
