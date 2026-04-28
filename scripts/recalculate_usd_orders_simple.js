#!/usr/bin/env node

/**
 * Script đơn giản để tính lại các đơn hàng USD từ 25,000 → 24,000
 * Cập nhật từng đơn một qua API (không cần service role key)
 * 
 * Chạy: node scripts/recalculate_usd_orders_simple.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const OLD_RATE = 25000;
const NEW_RATE = 24000;

async function updateExchangeRate() {
  console.log('💾 Cập nhật tỷ giá USD trong bảng exchange_rates...');
  
  const { data, error } = await supabase
    .from('exchange_rates')
    .update({ gia_tri: NEW_RATE })
    .eq('ti_gia', 'USD')
    .select();

  if (error) {
    console.error('❌ Lỗi:', error);
    return false;
  }

  console.log(`✅ Đã cập nhật tỷ giá USD: ${OLD_RATE.toLocaleString()} → ${NEW_RATE.toLocaleString()} VNĐ\n`);
  return true;
}

async function recalculateOrders() {
  console.log('🔍 Tìm các đơn hàng USD cần tính lại...');
  
  // Lấy các đơn hàng USD có exchange_rate = 25000
  const { data: orders, error: fetchError } = await supabase
    .from('orders')
    .select('id, order_code, sale_price, exchange_rate, total_vnd, total_amount_vnd, tong_tien_vnd, payment_type, payment_currency')
    .or('payment_type.ilike.USD,payment_currency.ilike.USD')
    .eq('exchange_rate', OLD_RATE)
    .gt('sale_price', 0)
    .order('id', { ascending: true });

  if (fetchError) {
    console.error('❌ Lỗi khi lấy đơn hàng:', fetchError);
    return;
  }

  if (!orders || orders.length === 0) {
    console.log('ℹ️  Không tìm thấy đơn hàng nào cần cập nhật\n');
    return;
  }

  console.log(`📦 Tìm thấy ${orders.length} đơn hàng cần tính lại\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const newTotalVnd = order.sale_price * NEW_RATE;
    
    // Tính toán các giá trị mới
    const updates = {
      exchange_rate: NEW_RATE,
      total_vnd: newTotalVnd,
    };

    // Cập nhật total_amount_vnd nếu nó bằng sale_price × 25000
    if (order.total_amount_vnd === order.sale_price * OLD_RATE) {
      updates.total_amount_vnd = newTotalVnd;
    }

    // Cập nhật tong_tien_vnd nếu nó bằng sale_price × 25000
    if (order.tong_tien_vnd === order.sale_price * OLD_RATE) {
      updates.tong_tien_vnd = newTotalVnd;
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', order.id);

    if (updateError) {
      console.error(`❌ Lỗi cập nhật đơn ${order.order_code}:`, updateError.message);
      errorCount++;
    } else {
      successCount++;
      if (successCount % 10 === 0) {
        console.log(`   Đã xử lý ${successCount}/${orders.length} đơn...`);
      }
    }
  }

  console.log(`\n✅ Hoàn thành!`);
  console.log(`   - Thành công: ${successCount} đơn`);
  if (errorCount > 0) {
    console.log(`   - Lỗi: ${errorCount} đơn`);
  }
  console.log();
}

async function recalculateOrderCodeHcm() {
  // Kiểm tra xem bảng order_code_hcm có tồn tại không
  const { data: tables, error: tableError } = await supabase
    .from('order_code_hcm')
    .select('id')
    .limit(1);

  if (tableError) {
    console.log('ℹ️  Bảng order_code_hcm không tồn tại hoặc không có quyền truy cập\n');
    return;
  }

  console.log('🔍 Tìm các đơn hàng USD trong order_code_hcm...');
  
  const { data: orders, error: fetchError } = await supabase
    .from('order_code_hcm')
    .select('id, order_code, sale_price, exchange_rate, total_vnd, total_amount_vnd, tong_tien_vnd, payment_type, payment_currency')
    .or('payment_type.ilike.USD,payment_currency.ilike.USD')
    .eq('exchange_rate', OLD_RATE)
    .gt('sale_price', 0)
    .order('id', { ascending: true });

  if (fetchError) {
    console.error('❌ Lỗi khi lấy đơn hàng HCM:', fetchError);
    return;
  }

  if (!orders || orders.length === 0) {
    console.log('ℹ️  Không tìm thấy đơn hàng HCM nào cần cập nhật\n');
    return;
  }

  console.log(`📦 Tìm thấy ${orders.length} đơn hàng HCM cần tính lại\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const newTotalVnd = order.sale_price * NEW_RATE;
    
    const updates = {
      exchange_rate: NEW_RATE,
      total_vnd: newTotalVnd,
    };

    if (order.total_amount_vnd === order.sale_price * OLD_RATE) {
      updates.total_amount_vnd = newTotalVnd;
    }

    if (order.tong_tien_vnd === order.sale_price * OLD_RATE) {
      updates.tong_tien_vnd = newTotalVnd;
    }

    const { error: updateError } = await supabase
      .from('order_code_hcm')
      .update(updates)
      .eq('id', order.id);

    if (updateError) {
      console.error(`❌ Lỗi cập nhật đơn HCM ${order.order_code}:`, updateError.message);
      errorCount++;
    } else {
      successCount++;
      if (successCount % 10 === 0) {
        console.log(`   Đã xử lý ${successCount}/${orders.length} đơn HCM...`);
      }
    }
  }

  console.log(`\n✅ Hoàn thành order_code_hcm!`);
  console.log(`   - Thành công: ${successCount} đơn`);
  if (errorCount > 0) {
    console.log(`   - Lỗi: ${errorCount} đơn`);
  }
  console.log();
}

async function main() {
  console.log('🚀 Bắt đầu cập nhật tỷ giá USD và tính lại đơn hàng\n');
  console.log(`   Tỷ giá cũ: ${OLD_RATE.toLocaleString('vi-VN')} VNĐ`);
  console.log(`   Tỷ giá mới: ${NEW_RATE.toLocaleString('vi-VN')} VNĐ\n`);

  try {
    // Bước 1: Cập nhật tỷ giá
    const rateUpdated = await updateExchangeRate();
    if (!rateUpdated) {
      console.error('❌ Không thể cập nhật tỷ giá. Dừng script.');
      return;
    }

    // Bước 2: Tính lại đơn hàng trong bảng orders
    await recalculateOrders();

    // Bước 3: Tính lại đơn hàng trong bảng order_code_hcm (nếu có)
    await recalculateOrderCodeHcm();

    console.log('✨ Hoàn thành tất cả!\n');
    console.log('📌 Lưu ý:');
    console.log('   - Kiểm tra lại dữ liệu trên trang Vận đơn');
    console.log('   - Các đơn mới sẽ tự động dùng tỷ giá 24,000 VNĐ');
    console.log('   - Cột van_don_line_total_vnd sẽ tự động cập nhật do là generated column\n');

  } catch (error) {
    console.error('❌ Lỗi:', error);
    process.exit(1);
  }
}

main();
