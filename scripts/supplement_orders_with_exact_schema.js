
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

// Danh sách các cột dựa trên Schema bạn cung cấp
const VALID_COLUMNS = [
    'id', 'order_code', 'order_date', 'customer_name', 'customer_phone', 'customer_address', 'city', 'state', 'zipcode', 'country', 'product', 'total_amount_vnd', 'payment_method', 'tracking_code', 'shipping_fee', 'marketing_staff', 'sale_staff', 'team', 'delivery_status', 'payment_status', 'note', 'created_at', 'updated_at', 'cskh', 'delivery_staff', 'goods_amount', 'reconciled_amount', 'general_fee', 'flight_fee', 'account_rental_fee', 'shipping_unit', 'accountant_confirm', 'payment_status_detail', 'reason', 'order_time', 'area', 'product_name_1', 'quantity_1', 'product_name_2', 'quantity_2', 'gift', 'gift_quantity', 'sale_price', 'payment_type', 'exchange_rate', 'total_vnd', 'payment_method_text', 'shipping_cost', 'base_price', 'reconciled_vnd', 'creator_name', 'check_result', 'delivery_status_nb', 'carrier', 'shift', 'cskh_status', 'customer_type', 'blacklist_status', 'note_sale', 'note_ffm', 'created_by', 'page_name', 'vandon_note', 'item_name_1', 'item_qty_2', 'gift_item', 'gift_qty', 'payment_currency', 'estimated_delivery_date', 'warehouse_fee', 'note_caps', 'accounting_check_date', 'last_modified_by', 'time_dayon', 'payment_bill', 'payment_image', 'ngaydonghang', 'trangthaiffm', 'thoigiangiaohangffm', 'ngayupbill', 'ngay_chia_van_don', 'thu_tu_chia', 'tracking_check_date', 'log', 'canh_bao', 'luu_kho_usd', 'order_count_actual', 'lydo', 'tong_tien_vnd', 'van_don_line_total_vnd'
];

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

async function supplementOrdersWithSchema() {
    try {
        console.log(`📖 Đang đọc file CSV: ${CSV_FILE}...`);
        const content = fs.readFileSync(CSV_FILE, 'utf8');
        const allRows = parseCSV(content);
        const csvHeaders = allRows[0];
        const orders = [];

        for (let i = 1; i < allRows.length; i++) {
            const values = allRows[i];
            if (values.length < csvHeaders.length) continue;
            
            const obj = {};
            csvHeaders.forEach((h, idx) => {
                // CHỈ XỬ LÝ CỘT CÓ TRONG SCHEMA
                if (!VALID_COLUMNS.includes(h)) return;

                let val = values[idx] === undefined || values[idx] === '' ? null : values[idx];
                
                // Xử lý kiểu số
                if (['total_amount_vnd', 'goods_amount', 'reconciled_amount', 'general_fee', 'flight_fee', 'account_rental_fee', 'quantity_1', 'quantity_2', 'gift_quantity', 'sale_price', 'exchange_rate', 'total_vnd', 'shipping_cost', 'base_price', 'reconciled_vnd', 'warehouse_fee', 'order_count_actual', 'tong_tien_vnd', 'van_don_line_total_vnd', 'thu_tu_chia'].includes(h)) {
                    val = val ? parseFloat(val.toString().replace(/,/g, '')) : 0;
                    if (isNaN(val)) val = 0;
                }
                
                // Xử lý JSON (cột log)
                if (h === 'log') {
                    try {
                        val = val ? JSON.parse(val) : [];
                    } catch (e) {
                        val = [];
                    }
                }
                
                obj[h] = val;
            });
            orders.push(obj);
        }

        console.log(`✅ Đã chuẩn hóa ${orders.length} đơn hàng theo Schema.`);

        const BATCH_SIZE = 50;
        for (let i = 0; i < orders.length; i += BATCH_SIZE) {
            const batch = orders.slice(i, i + BATCH_SIZE);
            console.log(`📡 Đẩy lô ${i / BATCH_SIZE + 1}...`);
            
            await supabase.from('orders').upsert(batch, { onConflict: 'order_code' });
            
            const hcmBatch = batch.filter(o => o.team === 'HCM');
            if (hcmBatch.length > 0) {
                await supabase.from('order_code_hcm').upsert(hcmBatch, { onConflict: 'order_code' });
            }
        }

        console.log('🚀 HOÀN THÀNH! Dữ liệu đã khớp hoàn toàn với Schema hiện tại.');
    } catch (err) { console.error('❌ Lỗi:', err.message); }
}

supplementOrdersWithSchema();
