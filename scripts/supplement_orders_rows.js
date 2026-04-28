
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

const CSV_FILE = 'backup_20260413_104222/orders_rows.csv';

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

async function supplementOrdersRows() {
    try {
        console.log(`📖 Đang đọc file CSV: ${CSV_FILE}...`);
        const content = fs.readFileSync(CSV_FILE, 'utf8');
        const allRows = parseCSV(content);
        const headers = allRows[0];
        const orders = [];

        for (let i = 1; i < allRows.length; i++) {
            const values = allRows[i];
            if (values.length < headers.length) continue;
            
            const obj = {};
            headers.forEach((h, idx) => {
                let val = values[idx] === undefined || values[idx] === '' ? null : values[idx];
                // Xử lý kiểu dữ liệu số
                if (['total_amount_vnd', 'shipping_fee', 'goods_amount', 'reconciled_amount', 'general_fee', 'flight_fee', 'account_rental_fee', 'quantity_1', 'quantity_2', 'gift_quantity', 'sale_price', 'exchange_rate', 'total_vnd', 'shipping_cost', 'base_price', 'reconciled_vnd', 'warehouse_fee', 'order_count_actual', 'tong_tien_vnd', 'van_don_line_total_vnd', 'item_qty_1', 'item_qty_2', 'item_qty_3', 'gift_qty', 'luu_kho_usd'].includes(h)) {
                    val = val ? parseFloat(val.toString().replace(/,/g, '')) : 0;
                    if (isNaN(val)) val = 0;
                }
                obj[h] = val;
            });
            orders.push(obj);
        }

        console.log(`✅ Đã xử lý ${orders.length} đơn hàng.`);

        const BATCH_SIZE = 50;
        for (let i = 0; i < orders.length; i += BATCH_SIZE) {
            const batch = orders.slice(i, i + BATCH_SIZE);
            console.log(`📡 Đang đẩy lô ${i / BATCH_SIZE + 1} (${i} - ${Math.min(i + BATCH_SIZE, orders.length)})...`);
            
            // Đẩy vào bảng chính
            const { error: error1 } = await supabase.from('orders').upsert(batch, { onConflict: 'order_code' });
            if (error1) console.error(`❌ Lỗi tại bảng orders lô ${i / BATCH_SIZE + 1}:`, error1.message);

            // Tự động đẩy đơn HCM vào bảng HCM
            const hcmBatch = batch.filter(o => o.team === 'HCM');
            if (hcmBatch.length > 0) {
                const { error: error2 } = await supabase.from('order_code_hcm').upsert(hcmBatch, { onConflict: 'order_code' });
                if (error2) console.error(`❌ Lỗi tại bảng orders_hcm lô ${i / BATCH_SIZE + 1}:`, error2.message);
            }
        }

        console.log('🚀 HOÀN THÀNH đẩy dữ liệu từ file rows.');
    } catch (err) { console.error('❌ Lỗi:', err.message); }
}

supplementOrdersRows();
