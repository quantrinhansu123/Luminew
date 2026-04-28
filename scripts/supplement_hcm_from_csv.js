
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
const supabase = createClient(supabaseUrl, supabaseKey);

const CSV_FILE = 'backup_20260413_104222/DataF3_20260414_062916.csv';

function parseCSV(content) {
    const rows = []; let currentRow = []; let currentField = ""; let inQuotes = false;
    for (let i = 0; i < content.length; i++) {
        const char = content[i]; const nextChar = content[i + 1];
        if (inQuotes) {
            if (char === '"' && nextChar === '"') { currentField += '"'; i++; }
            else if (char === '"') inQuotes = false;
            else currentField += char;
        } else {
            if (char === '"') inQuotes = true;
            else if (char === ',') { currentRow.push(currentField.trim()); currentField = ""; }
            else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                currentRow.push(currentField.trim()); rows.push(currentRow);
                currentRow = []; currentField = ""; if (char === '\r') i++;
            } else currentField += char;
        }
    }
    if (currentRow.length > 0 || currentField !== "") { currentRow.push(currentField.trim()); rows.push(currentRow); }
    return rows;
}

async function supplementHCM() {
    try {
        console.log(`📖 Đang bóc tách đơn HCM từ file: ${CSV_FILE}...`);
        const content = fs.readFileSync(CSV_FILE, 'utf8');
        const allRows = parseCSV(content);
        const headers = allRows[0];
        const hcmOrders = [];

        for (let i = 1; i < allRows.length; i++) {
            const values = allRows[i];
            if (values.length < headers.length) continue;
            
            const obj = {};
            headers.forEach((h, idx) => {
                let val = values[idx] === undefined || values[idx] === '' ? null : values[idx];
                if (['total_amount_vnd', 'shipping_fee', 'goods_amount', 'reconciled_amount', 'general_fee', 'flight_fee', 'account_rental_fee', 'quantity_1', 'quantity_2', 'gift_quantity', 'sale_price', 'exchange_rate', 'total_vnd', 'shipping_cost', 'base_price', 'reconciled_vnd', 'warehouse_fee', 'order_count_actual', 'tong_tien_vnd', 'van_don_line_total_vnd'].includes(h)) {
                    val = val ? parseFloat(val.toString().replace(/,/g, '')) : 0;
                    if (isNaN(val)) val = 0;
                }
                obj[h] = val;
            });

            // CHỈ LẤY ĐƠN HCM
            if (obj.team === 'HCM') {
                hcmOrders.push(obj);
            }
        }

        console.log(`✅ Tìm thấy ${hcmOrders.length} đơn hàng miền Nam.`);

        const BATCH_SIZE = 100;
        for (let i = 0; i < hcmOrders.length; i += BATCH_SIZE) {
            const batch = hcmOrders.slice(i, i + BATCH_SIZE);
            console.log(`📡 Đang đẩy lô HCM ${i / BATCH_SIZE + 1}...`);
            const { error } = await supabase.from('order_code_hcm').upsert(batch, { onConflict: 'order_code' });
            if (error) console.error(`❌ Lỗi lô ${i / BATCH_SIZE + 1}:`, error.message);
        }

        console.log('🚀 HOÀN THÀNH bổ sung đơn hàng cho miền Nam.');
    } catch (err) { console.error('❌ Lỗi:', err.message); }
}

supplementHCM();
