import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-detect credentials
let supabaseUrl = '';
let supabaseKey = '';

// Try to get service role key first (bypasses RLS), otherwise use anon key
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const clientPath = path.join(__dirname, 'src', 'services', 'supabaseClient.js');
try {
    const content = fs.readFileSync(clientPath, 'utf8');
    const urlMatch = content.match(/VITE_SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
    const keyMatch = content.match(/VITE_SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/);

    if (urlMatch) supabaseUrl = urlMatch[1];
    if (keyMatch && !SUPABASE_SERVICE_ROLE_KEY) supabaseKey = keyMatch[1];
} catch (e) { }

if (!supabaseUrl || !supabaseKey) {
    if (fs.existsSync(path.join(__dirname, '.env'))) {
        const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
        const urlLine = env.split('\n').find(x => x.includes('VITE_SUPABASE_URL'));
        const keyLine = env.split('\n').find(x => x.includes('VITE_SUPABASE_ANON_KEY'));
        const serviceKeyLine = env.split('\n').find(x => x.includes('SUPABASE_SERVICE_ROLE_KEY'));
        
        if (urlLine) supabaseUrl = urlLine.split('=')[1].trim();
        if (keyLine && !SUPABASE_SERVICE_ROLE_KEY) supabaseKey = keyLine.split('=')[1].trim();
        if (serviceKeyLine) supabaseKey = serviceKeyLine.split('=')[1].trim();
    }
}

// Use fallback values if not found
if (!supabaseUrl) {
    supabaseUrl = 'https://gsjhsmxyxjyiqovauyrp.supabase.co';
}
if (!supabaseKey) {
    supabaseKey = SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy';
}

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
    console.log('🗑️  Bắt đầu xóa toàn bộ dữ liệu trong bảng orders...');
    console.log('⚠️  CẢNH BÁO: Thao tác này sẽ xóa TẤT CẢ dữ liệu trong bảng orders!');
    
    try {
        // Đếm số lượng records trước khi xóa
        const { count: beforeCount, error: countError } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            console.error('❌ Lỗi khi đếm records:', countError.message);
            throw countError;
        }

        console.log(`📊 Số lượng đơn hàng hiện tại: ${beforeCount || 0}`);

        if (beforeCount === 0) {
            console.log('ℹ️  Bảng orders đã trống. Không có gì để xóa.');
            process.exit(0);
        }

        // Phương pháp 1: Thử xóa tất cả bằng cách sử dụng hack
        console.log('🔄 Đang thử xóa tất cả...');
        const { error: deleteAllError } = await supabase
            .from('orders')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Hack để xóa tất cả

        if (deleteAllError) {
            console.log('⚠️  Phương pháp 1 thất bại, đang thử xóa theo batch...', deleteAllError.message);
            
            // Phương pháp 2: Xóa theo batch
            const { data: allRecords, error: fetchError } = await supabase
                .from('orders')
                .select('id')
                .limit(100000);

            if (fetchError) {
                console.error('❌ Lỗi khi lấy danh sách orders:', fetchError.message);
                throw fetchError;
            }

            if (allRecords && allRecords.length > 0) {
                console.log(`📋 Tìm thấy ${allRecords.length} đơn hàng. Đang xóa theo batch...`);
                const ids = allRecords.map(r => r.id);

                // Xóa theo batch
                const batchSize = 1000;
                let deletedCount = 0;

                for (let i = 0; i < ids.length; i += batchSize) {
                    const batch = ids.slice(i, i + batchSize);
                    const { error: batchError } = await supabase
                        .from('orders')
                        .delete()
                        .in('id', batch);

                    if (batchError) {
                        console.error(`❌ Lỗi khi xóa batch ${Math.floor(i / batchSize) + 1}:`, batchError.message);
                        throw batchError;
                    }

                    deletedCount += batch.length;
                    console.log(`✅ Đã xóa batch ${Math.floor(i / batchSize) + 1}: ${batch.length} đơn hàng (Tổng: ${deletedCount}/${ids.length})`);
                }

                console.log(`\n✅ Hoàn thành! Đã xóa ${deletedCount} đơn hàng.`);
            } else {
                console.log('ℹ️  Không tìm thấy đơn hàng nào để xóa.');
            }
        } else {
            console.log(`\n✅ Hoàn thành! Đã xóa tất cả ${beforeCount} đơn hàng.`);
        }

        // Xác nhận lại bằng cách đếm
        const { count: afterCount, error: verifyError } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true });

        if (verifyError) {
            console.warn('⚠️  Không thể xác minh kết quả:', verifyError.message);
        } else {
            console.log(`📊 Số lượng đơn hàng sau khi xóa: ${afterCount || 0}`);
        }

    } catch (error) {
        console.error('❌ Lỗi:', error.message);
        console.error('Chi tiết:', error);
        process.exit(1);
    }
})();
