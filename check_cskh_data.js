/**
 * Script kiểm tra dữ liệu trong cột CSKH của Supabase
 * 
 * Usage:
 *   node check_cskh_data.js [options]
 * 
 * Options:
 *   --team <team>     Filter theo team (Sale, RD, etc.)
 *   --month <YYYY-MM> Filter theo tháng
 *   --date <YYYY-MM-DD> Filter theo ngày cụ thể
 *   --summary         Chỉ hiển thị tổng quan
 *   --detail          Hiển thị chi tiết từng đơn
 * 
 * Examples:
 *   node check_cskh_data.js
 *   node check_cskh_data.js --team Sale --month 2026-01
 *   node check_cskh_data.js --summary
 *   node check_cskh_data.js --detail --team Sale
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

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  team: null,
  month: null,
  date: null,
  summary: false,
  detail: false
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--team' && args[i + 1]) {
    options.team = args[i + 1];
    i++;
  } else if (args[i] === '--month' && args[i + 1]) {
    options.month = args[i + 1];
    i++;
  } else if (args[i] === '--date' && args[i + 1]) {
    options.date = args[i + 1];
    i++;
  } else if (args[i] === '--summary') {
    options.summary = true;
  } else if (args[i] === '--detail') {
    options.detail = true;
  }
}

// Main function
async function checkCSKHData() {
  try {
    console.log('🔍 Đang kiểm tra dữ liệu cột CSKH...\n');

    // Build query
    let query = supabase.from('orders').select('order_code, order_date, sale_staff, cskh, team, accountant_confirm');

    // Apply filters
    if (options.team) {
      query = query.eq('team', options.team);
      console.log(`📋 Filter theo Team: ${options.team}`);
    }

    if (options.month) {
      const [year, month] = options.month.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      query = query.gte('order_date', startDate.toISOString().split('T')[0]);
      query = query.lte('order_date', endDate.toISOString().split('T')[0]);
      console.log(`📅 Filter theo Tháng: ${options.month}`);
    }

    if (options.date) {
      query = query.eq('order_date', options.date);
      console.log(`📅 Filter theo Ngày: ${options.date}`);
    }

    // Execute query
    const { data: orders, error } = await query.order('order_date', { ascending: false });

    if (error) throw error;

    if (!orders || orders.length === 0) {
      console.log('ℹ️  Không tìm thấy đơn hàng nào thỏa điều kiện.');
      return;
    }

    console.log(`📦 Tổng số đơn hàng: ${orders.length}\n`);

    // Analyze CSKH data
    const stats = {
      total: orders.length,
      hasCSKH: 0,
      noCSKH: 0,
      emptyCSKH: 0,
      cskhList: new Map(), // Map để đếm số đơn của mỗi CSKH
      saleIsCSKH: 0, // Đơn mà Sale cũng là CSKH
      saleNotCSKH: 0, // Đơn mà Sale không phải CSKH
      byTeam: new Map(),
      byMonth: new Map()
    };

    // Get CSKH staff list for comparison
    const { data: cskhStaff } = await supabase
      .from('users')
      .select('name')
      .eq('department', 'CSKH');

    const cskhStaffNames = new Set(cskhStaff?.map(u => u.name).filter(Boolean) || []);

    orders.forEach(order => {
      const cskh = order.cskh?.toString().trim() || '';
      const sale = order.sale_staff?.toString().trim() || '';
      const team = order.team || 'N/A';
      const orderDate = order.order_date ? new Date(order.order_date) : null;
      const monthKey = orderDate ? `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}` : 'N/A';

      // Count by CSKH status
      if (cskh && cskh !== '') {
        stats.hasCSKH++;
        stats.cskhList.set(cskh, (stats.cskhList.get(cskh) || 0) + 1);
      } else {
        stats.noCSKH++;
        stats.emptyCSKH++;
      }

      // Count Sale vs CSKH
      if (cskh && sale && cskh === sale) {
        stats.saleIsCSKH++;
      } else if (cskh && sale && cskh !== sale) {
        stats.saleNotCSKH++;
      }

      // Count by team
      stats.byTeam.set(team, (stats.byTeam.get(team) || 0) + 1);

      // Count by month
      stats.byMonth.set(monthKey, (stats.byMonth.get(monthKey) || 0) + 1);
    });

    // Display summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 THỐNG KÊ CỘT CSKH');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`📦 Tổng số đơn: ${stats.total.toLocaleString('vi-VN')}`);
    console.log(`✅ Có CSKH: ${stats.hasCSKH.toLocaleString('vi-VN')} (${((stats.hasCSKH / stats.total) * 100).toFixed(2)}%)`);
    console.log(`❌ Không có CSKH: ${stats.noCSKH.toLocaleString('vi-VN')} (${((stats.noCSKH / stats.total) * 100).toFixed(2)}%)`);
    console.log(`   └─ Trống/rỗng: ${stats.emptyCSKH.toLocaleString('vi-VN')}\n`);

    console.log('👥 Phân bổ CSKH:');
    if (stats.cskhList.size > 0) {
      const sortedCSKH = Array.from(stats.cskhList.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20); // Top 20

      sortedCSKH.forEach(([name, count]) => {
        const isValid = cskhStaffNames.has(name) ? '✅' : '⚠️ ';
        console.log(`   ${isValid} ${name}: ${count.toLocaleString('vi-VN')} đơn`);
      });

      if (stats.cskhList.size > 20) {
        console.log(`   ... và ${stats.cskhList.size - 20} CSKH khác`);
      }
    } else {
      console.log('   (Không có dữ liệu)');
    }

    console.log('\n🔄 So sánh Sale vs CSKH:');
    console.log(`   Sale tự chăm (Sale = CSKH): ${stats.saleIsCSKH.toLocaleString('vi-VN')} đơn`);
    console.log(`   Đơn được chia (Sale ≠ CSKH): ${stats.saleNotCSKH.toLocaleString('vi-VN')} đơn`);

    console.log('\n📊 Phân bổ theo Team:');
    Array.from(stats.byTeam.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([team, count]) => {
        console.log(`   ${team}: ${count.toLocaleString('vi-VN')} đơn`);
      });

    console.log('\n📅 Phân bổ theo Tháng:');
    Array.from(stats.byMonth.entries())
      .sort()
      .slice(-12) // 12 tháng gần nhất
      .forEach(([month, count]) => {
        console.log(`   ${month}: ${count.toLocaleString('vi-VN')} đơn`);
      });

    // Check for invalid CSKH names
    console.log('\n⚠️  CSKH không hợp lệ (không có trong danh sách CSKH):');
    const invalidCSKH = Array.from(stats.cskhList.keys())
      .filter(name => !cskhStaffNames.has(name));
    
    if (invalidCSKH.length > 0) {
      invalidCSKH.forEach(name => {
        console.log(`   ❌ "${name}": ${stats.cskhList.get(name)} đơn`);
      });
    } else {
      console.log('   ✅ Tất cả CSKH đều hợp lệ');
    }

    // Display detail if requested
    if (options.detail && !options.summary) {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('📋 CHI TIẾT ĐƠN HÀNG');
      console.log('═══════════════════════════════════════════════════════════\n');

      const ordersWithoutCSKH = orders.filter(o => !o.cskh || o.cskh.toString().trim() === '');
      const ordersWithCSKH = orders.filter(o => o.cskh && o.cskh.toString().trim() !== '');

      if (ordersWithoutCSKH.length > 0) {
        console.log(`❌ Đơn KHÔNG có CSKH (${ordersWithoutCSKH.length} đơn):`);
        ordersWithoutCSKH.slice(0, 50).forEach(order => {
          console.log(`   - ${order.order_code} | ${order.order_date} | Sale: ${order.sale_staff || 'N/A'} | Team: ${order.team || 'N/A'}`);
        });
        if (ordersWithoutCSKH.length > 50) {
          console.log(`   ... và ${ordersWithoutCSKH.length - 50} đơn khác`);
        }
        console.log('');
      }

      if (ordersWithCSKH.length > 0) {
        console.log(`✅ Đơn CÓ CSKH (${ordersWithCSKH.length} đơn - hiển thị 50 đầu):`);
        ordersWithCSKH.slice(0, 50).forEach(order => {
          const sale = order.sale_staff?.toString().trim() || '';
          const cskh = order.cskh?.toString().trim() || '';
          const match = sale && cskh && sale === cskh ? '👤' : '🔄';
          console.log(`   ${match} ${order.order_code} | ${order.order_date} | Sale: ${sale || 'N/A'} | CSKH: ${cskh} | Team: ${order.team || 'N/A'}`);
        });
        if (ordersWithCSKH.length > 50) {
          console.log(`   ... và ${ordersWithCSKH.length - 50} đơn khác`);
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ Hoàn tất kiểm tra!');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run
checkCSKHData();
