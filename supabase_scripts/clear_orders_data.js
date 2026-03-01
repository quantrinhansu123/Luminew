/**
 * Script để xóa tất cả dữ liệu trong bảng orders
 * ⚠️ CẢNH BÁO: Không thể khôi phục sau khi chạy!
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    console.error('Please set them in .env file');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function clearOrdersData() {
    try {
        console.log('⚠️  CẢNH BÁO: Script này sẽ xóa TẤT CẢ dữ liệu trong bảng orders!');
        console.log('⚠️  Không thể khôi phục sau khi chạy!');
        console.log('');

        // Kiểm tra số lượng records trước khi xóa
        console.log('📊 Đang kiểm tra số lượng records...');
        const { count: totalBefore, error: countError } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            console.error('❌ Lỗi khi đếm records:', countError);
            return;
        }

        console.log(`📊 Tổng số orders trước khi xóa: ${totalBefore || 0}`);
        console.log('');

        if (totalBefore === 0) {
            console.log('✅ Bảng orders đã trống, không cần xóa.');
            return;
        }

        // Xác nhận từ người dùng
        console.log('⚠️  Bạn có chắc chắn muốn xóa TẤT CẢ dữ liệu?');
        console.log('⚠️  Nhập "YES" để xác nhận:');
        
        // Trong môi trường thực tế, bạn có thể dùng readline để nhận input
        // Ở đây tôi sẽ dùng process.argv để nhận tham số
        const args = process.argv.slice(2);
        const confirm = args[0];

        if (confirm !== 'YES') {
            console.log('❌ Hủy bỏ. Không có dữ liệu nào bị xóa.');
            console.log('💡 Để xóa, chạy: node clear_orders_data.js YES');
            return;
        }

        console.log('');
        console.log('🗑️  Đang xóa dữ liệu...');

        // Xóa tất cả records
        // Lưu ý: Supabase không hỗ trợ TRUNCATE qua REST API
        // Phải xóa từng batch hoặc dùng SQL trực tiếp
        
        // Cách 1: Xóa từng batch (an toàn hơn, có thể theo dõi tiến trình)
        const BATCH_SIZE = 1000;
        let deletedCount = 0;
        let hasMore = true;
        
        while (hasMore) {
            // Lấy một batch IDs để xóa
            const { data: batch, error: fetchError } = await supabase
                .from('orders')
                .select('id')
                .limit(BATCH_SIZE);
            
            if (fetchError) {
                console.error('❌ Lỗi khi lấy batch:', fetchError);
                break;
            }
            
            if (!batch || batch.length === 0) {
                hasMore = false;
                break;
            }
            
            // Xóa batch này
            const ids = batch.map(row => row.id);
            const { error: deleteError } = await supabase
                .from('orders')
                .delete()
                .in('id', ids);
            
            if (deleteError) {
                console.error('❌ Lỗi khi xóa batch:', deleteError);
                break;
            }
            
            deletedCount += batch.length;
            console.log(`🗑️  Đã xóa ${deletedCount}/${totalBefore} records...`);
            
            if (batch.length < BATCH_SIZE) {
                hasMore = false;
            }
        }

            if (deleteError) {
                console.error('❌ Lỗi khi xóa batch:', deleteError);
                console.log('');
                console.log('💡 Nếu lỗi permission, hãy chạy SQL script trực tiếp trong Supabase SQL Editor:');
                console.log('   TRUNCATE TABLE public.orders;');
                return;
            }
        }

        // Kiểm tra lại sau khi xóa
        const { count: totalAfter, error: countAfterError } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true });

        if (countAfterError) {
            console.error('❌ Lỗi khi kiểm tra sau khi xóa:', countAfterError);
            return;
        }

        console.log(`✅ Đã xóa thành công!`);
        console.log(`📊 Tổng số orders sau khi xóa: ${totalAfter || 0}`);
        console.log(`📊 Đã xóa: ${(totalBefore || 0) - (totalAfter || 0)} records`);

    } catch (error) {
        console.error('❌ Lỗi:', error);
    }
}

// Chạy script
clearOrdersData();
