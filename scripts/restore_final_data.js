
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

        const { error } = await supabase
            .from(tableName)
            .upsert(list, { onConflict: 'id' });

        if (error) {
            console.error(`❌ [${tableName}] Lỗi:`, error.message);
        } else {
            console.log(`🚀 [${tableName}] HOÀN THÀNH!`);
        }
    } catch (err) {
        console.error(`❌ [${tableName}] Lỗi thực thi:`, err.message);
    }
}

async function restoreFinal() {
    await uploadToTable('du_an', 'backup_20260413_104222/du_an_20260413_104222.json');
    await uploadToTable('tkqc', 'backup_20260413_104222/tkqc_20260413_104222.json');
}

restoreFinal();
