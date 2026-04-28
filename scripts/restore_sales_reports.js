
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Thiếu Supabase credentials!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadToTable(tableName, filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️ Không tìm thấy file: ${filePath}, bỏ qua.`);
            return;
        }

        console.log(`📖 Đang đọc file: ${filePath}...`);
        const rawData = fs.readFileSync(filePath, 'utf8');
        const list = JSON.parse(rawData);
        console.log(`✅ Đã tải ${list.length} bản ghi cho bảng ${tableName}.`);

        const BATCH_SIZE = 100;
        for (let i = 0; i < list.length; i += BATCH_SIZE) {
            const batch = list.slice(i, i + BATCH_SIZE);
            console.log(`📡 [${tableName}] Đang đẩy lô ${i / BATCH_SIZE + 1} (${i} - ${Math.min(i + BATCH_SIZE, list.length)})...`);
            
            const { error } = await supabase
                .from(tableName)
                .upsert(batch, { onConflict: 'id' });

            if (error) {
                console.error(`❌ [${tableName}] Lỗi tại lô ${i / BATCH_SIZE + 1}:`, error.message);
            }
        }
        console.log(`🚀 [${tableName}] HOÀN THÀNH!`);
    } catch (err) {
        console.error(`❌ [${tableName}] Lỗi thực thi:`, err.message);
    }
}

async function restoreSaleReports() {
    // Restore Hà Nội
    await uploadToTable('sales_reports', 'backup_20260413_104222/sales_reports_20260413_104222.json');
    
    // Restore HCM
    await uploadToTable('sale_report_hcm', 'backup_20260413_104222/sale_report_hcm_20260413_104222.json');
}

restoreSaleReports();
