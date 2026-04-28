
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

const CSV_FILE = 'backup_20260413_104222/data ngày 14 - Sheet1.csv';

// Bản đồ ánh xạ Cột Tiếng Việt -> Database
const MAPPING = {
    "Mã đơn hàng": "order_code",
    "Ngày lên đơn": "order_date",
    "Name*": "customer_name",
    "Phone*": "customer_phone",
    "Add": "customer_address",
    "City": "city",
    "State": "state",
    "Zipcode": "zipcode",
    "Mặt hàng": "product",
    "Tên mặt hàng 1": "product_name_1",
    "Số lượng mặt hàng 1": "quantity_1",
    "Tên mặt hàng 2": "product_name_2",
    "Số lượng mặt hàng 2": "quantity_2",
    "Quà tặng": "gift",
    "Số lượng quà kèm": "gift_quantity",
    "Giá bán": "sale_price",
    "Loại tiền thanh toán": "payment_currency",
    "Tổng tiền VNĐ": "total_amount_vnd",
    "Hình thức thanh toán": "payment_method",
    "Ghi chú": "note",
    "Nhân viên Sale": "sale_staff",
    "Nhân viên Marketing": "marketing_staff",
    "Kết quả Check": "check_result",
    "Giá gốc": "base_price",
    "Cảnh báo Blacklist, Trùng đơn": "canh_bao",
    "Khu vực": "country",
    "Team": "team"
};

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

async function uploadDate14() {
    try {
        console.log(`📖 Đang xử lý file dữ liệu ngày 14...`);
        const content = fs.readFileSync(CSV_FILE, 'utf8');
        const allRows = parseCSV(content);
        const headers = allRows[0];
        const orders = [];

        for (let i = 1; i < allRows.length; i++) {
            const values = allRows[i];
            if (values.length < headers.length) continue;
            
            const obj = {};
            headers.forEach((h, idx) => {
                const dbKey = MAPPING[h];
                if (!dbKey) return;

                let val = values[idx] === undefined || values[idx] === '' ? null : values[idx];
                
                // Xử lý Ngày tháng (từ 4/14/2026 sang 2026-04-14)
                if (dbKey === 'order_date' && val) {
                    const parts = val.split('/');
                    if (parts.length === 3) {
                        const month = parts[0].padStart(2, '0');
                        const day = parts[1].padStart(2, '0');
                        const year = parts[2];
                        val = `${year}-${month}-${day}`;
                    }
                }

                // Xử lý kiểu số (Xóa dấu phẩy, chuyển float)
                if (['total_amount_vnd', 'quantity_1', 'quantity_2', 'gift_quantity', 'sale_price', 'base_price'].includes(dbKey)) {
                    val = val ? parseFloat(val.toString().replace(/,/g, '').replace(/"/g, '')) : 0;
                }
                
                obj[dbKey] = val;
            });
            orders.push(obj);
        }

        console.log(`✅ Đã bóc tách ${orders.length} đơn hàng ngày 14.`);

        for (let i = 0; i < orders.length; i += 50) {
            const batch = orders.slice(i, i + 50);
            await supabase.from('orders').upsert(batch, { onConflict: 'order_code' });
            
            const hcmBatch = batch.filter(o => o.team === 'HCM');
            if (hcmBatch.length > 0) {
                await supabase.from('order_code_hcm').upsert(hcmBatch, { onConflict: 'order_code' });
            }
        }

        console.log('🚀 HOÀN THÀNH đẩy dữ liệu ngày 14!');
    } catch (err) { console.error('❌ Lỗi:', err.message); }
}

uploadDate14();
