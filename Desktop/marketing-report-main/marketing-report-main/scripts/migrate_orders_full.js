
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const DATA_URL = 'https://n-api-gamma.vercel.app/sheet/F3/data';

// Helper to clean currency/number
const cleanNumber = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    // Remove non-numeric chars except dot/minus
    return Number(val.replace(/[^0-9.-]+/g, '')) || 0;
};

// Helper for dates
const parseDate = (val) => {
    if (!val) return null;
    try {
        const d = new Date(val);
        if (isNaN(d.getTime())) return null; // Invalid date
        return d.toISOString();
    } catch {
        return null; // Fallback
    }
};

async function migrate() {
    console.log('Fetching data from Google Sheet API:', DATA_URL);

    try {
        const response = await fetch(DATA_URL);
        if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);

        const json = await response.json();
        const rows = json.rows || json.data || [];

        if (!Array.isArray(rows)) {
            console.error('Invalid data format:', json);
            return;
        }

        console.log(`Fetched ${rows.length} rows. Mapping and upserting...`);

        // Map data
        const mappedRecords = rows.map(r => {
            // NOTE: r key names are from Google Sheet (Vietnamese)
            return {
                order_code: r["Mã đơn hàng"], // Unique Key

                // Customer Info
                customer_name: r["Name*"],
                customer_phone: r["Phone*"],
                customer_address: r["Add"],
                city: r["City"],
                state: r["State"],
                country: r["Khu vực"], // Mapping 'Khu vực' to 'country'
                zipcode: r["Zipcode"],

                // Order Info
                product: r["Mặt hàng"],
                total_amount_vnd: cleanNumber(r["Tổng tiền VNĐ"]),
                payment_method: r["Hình thức thanh toán"],
                tracking_code: r["Mã Tracking"],
                shipping_fee: cleanNumber(r["Phí ship nội địa Mỹ (usd)"]),

                // Staff
                marketing_staff: r["Nhân viên Sale"], // Approx logic
                sale_staff: r["Nhân viên Sale"],
                team: r["Team"],
                delivery_staff: r["NV Vận đơn"],

                // Status & Notes
                delivery_status: r["Trạng thái giao hàng"],
                payment_status: r["Trạng thái thu tiền"],
                note: r["Ghi chú"],
                reason: r["Lý do"],

                // Dates
                order_date: parseDate(r["Ngày lên đơn"]) || parseDate(r["Ngày đóng hàng"]), // Fallback logic
                created_at: parseDate(r["Ngày đóng hàng"]) || new Date().toISOString(),

                // New/Detail Columns
                goods_amount: cleanNumber(r["Giá bán"]),
                shipping_unit: r["Đơn vị vận chuyển"],
                accountant_confirm: r["Kế toán xác nhận thu tiền về"],

                check_result: r["Kết quả Check"],
                vandon_note: r["Ghi chú của VĐ"],
                item_name_1: r["Tên mặt hàng 1"],
                item_qty_1: r["Số lượng mặt hàng 1"], // Keep as text or number? Schema likely text or mixed
                item_name_2: r["Tên mặt hàng 2"],
                item_qty_2: r["Số lượng mặt hàng 2"],
                gift_item: r["Quà tặng"],
                gift_qty: r["Số lượng quà kèm"],

                // Round 2 Columns
                delivery_status_nb: r["Trạng thái giao hàng NB"],
                payment_currency: r["Loại tiền thanh toán"],
                estimated_delivery_date: parseDate(r["Thời gian giao dự kiến"]),
                warehouse_fee: cleanNumber(r["Phí xử lý đơn đóng hàng-Lưu kho(usd)"]),
                note_caps: r["GHI CHÚ"],
                accounting_check_date: parseDate(r["Ngày Kế toán đối soát với FFM lần 2"]),
                reconciled_amount: cleanNumber(r["Số tiền của đơn hàng đã về TK Cty"])
            };
        }).filter(r => r.order_code); // Ensure primary key exists

        console.log(`Prepared ${mappedRecords.length} valid records to upsert.`);

        // Batch upsert
        const BATCH_SIZE = 100;
        for (let i = 0; i < mappedRecords.length; i += BATCH_SIZE) {
            const batch = mappedRecords.slice(i, i + BATCH_SIZE);
            const { error } = await supabase.from('orders').upsert(batch, { onConflict: 'order_code' });

            if (error) {
                console.error(`Batch ${i} error:`, error);
            } else {
                console.log(`Upserted batch ${i} - ${i + batch.length}`);
            }
        }

        console.log('Full Migration Complete ✅');

    } catch (err) {
        console.error('Migration failed:', err);
    }
}

migrate();
