
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

// State machine CSV parser
function parseCSV(content) {
    const rows = [];
    let currentRow = [];
    let currentField = "";
    let inQuotes = false;

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                currentField += '"';
                i++; // Skip next quote
            } else if (char === '"') {
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                currentRow.push(currentField.trim());
                currentField = "";
            } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                currentRow.push(currentField.trim());
                rows.push(currentRow);
                currentRow = [];
                currentField = "";
                if (char === '\r') i++; // Skip \n
            } else {
                currentField += char;
            }
        }
    }
    if (currentRow.length > 0 || currentField !== "") {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
    }
    return rows;
}

async function supplementOrders() {
    try {
        console.log(`📖 Đang đọc file CSV: ${CSV_FILE}...`);
        const content = fs.readFileSync(CSV_FILE, 'utf8');
        
        console.log('🔄 Đang phân tách CSV bằng State Machine...');
        const allRows = parseCSV(content);
        const headers = allRows[0];
        const orders = [];

        for (let i = 1; i < allRows.length; i++) {
            const values = allRows[i];
            if (values.length < headers.length) continue; 
            
            const obj = {};
            headers.forEach((h, idx) => {
                let val = values[idx];
                if (val === undefined || val === '') val = null;
                
                if (['total_amount_vnd', 'shipping_fee', 'goods_amount', 'reconciled_amount', 'general_fee', 'flight_fee', 'account_rental_fee', 'quantity_1', 'quantity_2', 'gift_quantity', 'sale_price', 'exchange_rate', 'total_vnd', 'shipping_cost', 'base_price', 'reconciled_vnd', 'warehouse_fee', 'order_count_actual', 'tong_tien_vnd', 'van_don_line_total_vnd'].includes(h)) {
                    val = val ? parseFloat(val.toString().replace(/,/g, '')) : 0;
                    if (isNaN(val)) val = 0;
                }
                obj[h] = val;
            });
            orders.push(obj);
        }

        console.log(`✅ Đã xử lý ${orders.length} đơn hàng từ CSV.`);

        const BATCH_SIZE = 50;
        for (let i = 0; i < orders.length; i += BATCH_SIZE) {
            const batch = orders.slice(i, i + BATCH_SIZE);
            console.log(`📡 Đang bổ sung lô ${i / BATCH_SIZE + 1} (${i} - ${Math.min(i + BATCH_SIZE, orders.length)})...`);
            
            const { error } = await supabase
                .from('orders')
                .upsert(batch, { onConflict: 'order_code' });

            if (error) {
                console.error(`❌ Lỗi tại lô ${i / BATCH_SIZE + 1}:`, error.message);
                // In ra mã đơn hàng lỗi để debug nếu cần
                // console.log('Mã đơn hàng đầu lô:', batch[0].order_code);
            }
        }

        console.log('🚀 HOÀN THÀNH bổ sung đơn hàng từ CSV.');
    } catch (err) {
        console.error('❌ Lỗi thực thi:', err.message);
    }
}

supplementOrders();
