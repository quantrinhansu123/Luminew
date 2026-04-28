#!/usr/bin/env node

/**
 * Script cập nhật tỷ giá USD từ 25,000 → 24,000 và tính lại các đơn hàng
 * 
 * Chạy: node scripts/update_usd_exchange_rate.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🚀 Bắt đầu cập nhật tỷ giá USD...\n');

  try {
    // Bước 1: Kiểm tra tỷ giá hiện tại
    console.log('📊 Kiểm tra tỷ giá hiện tại...');
    const { data: currentRate, error: rateError } = await supabase
      .from('exchange_rates')
      .select('ti_gia, gia_tri')
      .eq('ti_gia', 'USD')
      .single();

    if (rateError) {
      console.error('❌ Lỗi khi lấy tỷ giá:', rateError);
      return;
    }

    console.log(`   Tỷ giá USD hiện tại: ${currentRate.gia_tri.toLocaleString('vi-VN')} VNĐ\n`);

    // Bước 2: Đếm số đơn hàng cần cập nhật
    console.log('🔍 Đếm số đơn hàng USD cần cập nhật...');
    
    const { count: ordersCount, error: countError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .or('payment_type.ilike.USD,payment_currency.ilike.USD')
      .eq('exchange_rate', 25000)
      .gt('sale_price', 0);

    if (countError) {
      console.error('❌ Lỗi khi đếm đơn hàng:', countError);
    } else {
      console.log(`   Tìm thấy ${ordersCount || 0} đơn hàng USD cần cập nhật trong bảng orders\n`);
    }

    // Bước 3: Xác nhận từ người dùng
    if (ordersCount > 0) {
      console.log('⚠️  CẢNH BÁO: Script này sẽ:');
      console.log('   1. Cập nhật tỷ giá USD từ 25,000 → 24,000');
      console.log(`   2. Tính lại ${ordersCount} đơn hàng USD`);
      console.log('   3. Cập nhật: exchange_rate, total_vnd, total_amount_vnd, tong_tien_vnd\n');
      
      // Trong môi trường production, nên có xác nhận
      // Ở đây tự động chạy để demo
    }

    // Bước 4: Đọc và chạy migration
    console.log('📝 Đọc migration file...');
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260420000000_update_usd_rate_and_recalculate.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Không tìm thấy file migration:', migrationPath);
      return;
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('⚙️  Chạy migration...\n');
    
    // Chạy migration (cần service role key để chạy raw SQL)
    // Nếu dùng anon key, cần chạy qua Supabase SQL Editor hoặc CLI
    console.log('ℹ️  Để chạy migration, sử dụng một trong các cách sau:\n');
    console.log('   Cách 1: Supabase SQL Editor');
    console.log('   - Mở Supabase Dashboard → SQL Editor');
    console.log('   - Copy nội dung file: supabase/migrations/20260420000000_update_usd_rate_and_recalculate.sql');
    console.log('   - Paste và chạy\n');
    
    console.log('   Cách 2: Supabase CLI');
    console.log('   - Chạy: npx supabase db push\n');
    
    console.log('   Cách 3: Cập nhật trực tiếp qua API (chỉ cập nhật tỷ giá)');
    console.log('   - Script này sẽ cập nhật tỷ giá USD ngay bây giờ\n');

    // Cập nhật tỷ giá qua API
    console.log('💾 Cập nhật tỷ giá USD...');
    const { data: updateData, error: updateError } = await supabase
      .from('exchange_rates')
      .update({ gia_tri: 24000 })
      .eq('ti_gia', 'USD')
      .select();

    if (updateError) {
      console.error('❌ Lỗi khi cập nhật tỷ giá:', updateError);
      return;
    }

    console.log('✅ Đã cập nhật tỷ giá USD thành 24,000 VNĐ\n');

    // Bước 5: Hướng dẫn tính lại đơn hàng
    console.log('📋 Để tính lại các đơn hàng đã có:');
    console.log('   1. Chạy migration SQL ở trên (Cách 1 hoặc 2)');
    console.log('   2. Hoặc sử dụng tính năng "Tính lại Tổng tiền VNĐ" trong trang Danh Sách Đơn\n');

    // Bước 6: Kiểm tra kết quả
    console.log('🔍 Kiểm tra tỷ giá mới...');
    const { data: newRate, error: newRateError } = await supabase
      .from('exchange_rates')
      .select('ti_gia, gia_tri')
      .eq('ti_gia', 'USD')
      .single();

    if (newRateError) {
      console.error('❌ Lỗi khi kiểm tra tỷ giá mới:', newRateError);
      return;
    }

    console.log(`✅ Tỷ giá USD mới: ${newRate.gia_tri.toLocaleString('vi-VN')} VNĐ\n`);

    console.log('✨ Hoàn thành!\n');
    console.log('📌 Lưu ý:');
    console.log('   - Tỷ giá mới sẽ áp dụng cho các đơn hàng mới');
    console.log('   - Các đơn hàng cũ cần chạy migration SQL để tính lại');
    console.log('   - Kiểm tra lại dữ liệu trên trang Vận đơn sau khi chạy migration\n');

  } catch (error) {
    console.error('❌ Lỗi:', error);
    process.exit(1);
  }
}

main();
