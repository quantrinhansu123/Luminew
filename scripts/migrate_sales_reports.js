/**
 * Script để migrate dữ liệu từ Google Sheets sang Supabase
 * Chạy một lần duy nhất để chuyển dữ liệu cũ
 * 
 * Cách chạy:
 * 1. Mở terminal
 * 2. cd vào thư mục project
 * 3. node scripts/migrate_sales_reports.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const API_HOST = 'https://n-api-gamma.vercel.app';
const SHEET_NAME = 'Báo cáo sale';

// Supabase credentials - Lấy từ .env file
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Lỗi: VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY không được tìm thấy trong .env file');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function migrateData() {
    console.log('🚀 Bắt đầu migrate dữ liệu từ Google Sheets sang Supabase...\n');

    try {
        // 1. Fetch dữ liệu từ Google Sheets API
        console.log('📥 Đang tải dữ liệu từ Google Sheets...');
        const response = await fetch(`${API_HOST}/report/generate?tableName=${encodeURIComponent(SHEET_NAME)}`);
        const result = await response.json();

        if (!result.data || result.data.length === 0) {
            console.log('⚠️  Không có dữ liệu để migrate');
            return;
        }

        const apiData = result.data;
        console.log(`✅ Đã tải ${apiData.length} records từ Google Sheets\n`);

        // 2. Transform dữ liệu từ Google Sheets format sang Supabase format
        console.log('🔄 Đang chuyển đổi format dữ liệu...');
        const transformedData = apiData
            .filter(r => r['Tên'] && String(r['Tên']).trim() !== '')
            .map(r => ({
                name: (r['Tên'] || '').trim(),
                email: (r['Email'] || '').trim(),
                team: (r['Team'] || '').trim(),
                branch: (r['Chi nhánh'] || r['chi nhánh'] || '').trim() || 'Không xác định',
                position: (r['Chức vụ'] || '').trim(),

                date: r['Ngày'],
                shift: r['Ca'],
                product: r['Sản phẩm'],
                market: r['Thị trường'],

                // Số liệu báo cáo
                mess_count: Number(r['Số Mess']) || 0,
                response_count: Number(r['Phản hồi']) || 0,
                order_count: Number(r['Đơn Mess']) || 0,
                revenue_mess: Number(r['Doanh số Mess']) || 0,

                // Số liệu thực tế
                order_count_actual: Number(r['Số đơn thực tế']) || 0,
                revenue_actual: Number(r['Doanh thu chốt thực tế']) || 0,
                revenue_go_actual: Number(r['Doanh số đi thực tế']) || 0,
                order_cancel_count_actual: Number(r['Số đơn hoàn hủy thực tế']) || 0,
                revenue_cancel_actual: Number(r['Doanh số hoàn hủy thực tế']) || 0,
                revenue_after_cancel_actual: Number(r['Doanh số sau hoàn hủy thực tế']) || 0,

                // Số liệu khác
                revenue_go: Number(r['Doanh số đi']) || 0,
                order_cancel_count: Number(r['Số đơn Hoàn huỷ']) || 0,
                revenue_cancel: Number(r['Doanh số hoàn huỷ']) || 0,
                order_success_count: Number(r['Số đơn thành công']) || 0,
                revenue_success: Number(r['Doanh số thành công']) || 0,

                created_by: 'migration_script'
            }));

        console.log(`✅ Đã transform ${transformedData.length} records\n`);

        // 3. Insert dữ liệu vào Supabase (batch insert)
        console.log('💾 Đang insert dữ liệu vào Supabase...');
        const BATCH_SIZE = 100;
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < transformedData.length; i += BATCH_SIZE) {
            const batch = transformedData.slice(i, i + BATCH_SIZE);

            const { data, error } = await supabase
                .from('sales_reports')
                .insert(batch);

            if (error) {
                console.error(`❌ Lỗi batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
                errorCount += batch.length;
            } else {
                successCount += batch.length;
                console.log(`✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} records`);
            }
        }

        // 4. Tóm tắt kết quả
        console.log('\n==========================================');
        console.log('📊 KẾT QUẢ MIGRATION:');
        console.log('==========================================');
        console.log(`✅ Thành công: ${successCount} records`);
        console.log(`❌ Lỗi: ${errorCount} records`);
        console.log(`📈 Tổng cộng: ${transformedData.length} records`);
        console.log('==========================================\n');

        if (errorCount === 0) {
            console.log('🎉 Migration hoàn tất thành công!');
        } else {
            console.log('⚠️  Migration hoàn tất với một số lỗi. Vui lòng kiểm tra lại.');
        }

    } catch (error) {
        console.error('❌ Lỗi migration:', error);
        process.exit(1);
    }
}

// Chạy migration
migrateData();
