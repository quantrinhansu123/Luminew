
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
const BACKUP_FILE = 'backup_20260413_104222/orders_20260413_104222.json';

async function restoreData() {
    try {
        console.log(`📖 Đang đọc file: ${BACKUP_FILE}...`);
        const rawData = fs.readFileSync(BACKUP_FILE, 'utf8');
        const list = JSON.parse(rawData);
        console.log(`✅ Đã tải ${list.length} đơn hàng Hà nội từ backup.`);

        const BATCH_SIZE = 50;
        for (let i = 0; i < list.length; i += BATCH_SIZE) {
            const batch = list.slice(i, i + BATCH_SIZE);
            console.log(`📡 Đang đẩy lô ${i / BATCH_SIZE + 1} (${i} - ${Math.min(i + BATCH_SIZE, list.length)})...`);
            
            const { error } = await supabase
                .from('orders')
                .upsert(batch, { onConflict: 'order_code' });

            if (error) {
                console.error(`❌ Lỗi tại lô ${i / BATCH_SIZE + 1}:`, error.message);
            }
        }

        console.log('🚀 HOÀN THÀNH! Dữ liệu Đơn hàng Hà nội đã được khôi phục.');
    } catch (err) {
        console.error('❌ Lỗi thực thi:', err.message);
    }
}

restoreData();
