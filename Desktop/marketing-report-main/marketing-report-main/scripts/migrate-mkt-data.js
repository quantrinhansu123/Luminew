import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Use encodeURI to handle spaces in query parameters
const DATA_URL = encodeURI('https://n-api-gamma.vercel.app/report/generate?tableName=Báo cáo MKT');

async function migrate() {
    console.log('Fetching data from:', DATA_URL);
    try {
        const response = await fetch(DATA_URL);
        const json = await response.json();

        if (!json.success || !Array.isArray(json.data)) {
            console.error('Invalid data format received:', json);
            return;
        }

        const records = json.data;
        console.log(`Fetched ${records.length} records. Preparing to insert...`);

        const formattedRecords = records.map(r => {
            // Parse date
            let dateVal = null;
            if (r['Ngày']) {
                const rawDate = r['Ngày'];
                if (typeof rawDate === 'string' && rawDate.includes('/')) {
                    const parts = rawDate.split('/');
                    if (parts.length === 3) {
                        const p0 = parseInt(parts[0], 10);
                        const p1 = parseInt(parts[1], 10);
                        const p2 = parseInt(parts[2], 10);

                        // Helper: YYYY-MM-DD
                        const fmt = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

                        // Auto-detect format
                        if (p0 > 12) {
                            // Definitely DD/MM/YYYY (13/08/2025)
                            dateVal = fmt(p2, p1, p0);
                        } else if (p1 > 12) {
                            // Definitely MM/DD/YYYY (08/13/2025)
                            dateVal = fmt(p2, p0, p1);
                        } else {
                            // Ambiguous (01/02/2025). Default to MM/DD/YYYY as per observed error (10/17 was MM/DD)
                            dateVal = fmt(p2, p0, p1);
                        }
                    }
                } else if (typeof rawDate === 'string' && rawDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    dateVal = rawDate;
                }
            }

            // Clean numeric fields
            const numeric = (val) => {
                if (typeof val === 'number') return val;
                if (!val) return 0;
                // Remove commas and other non-numeric chars except dot/minus
                const n = Number(String(val).replace(/,/g, ''));
                return isNaN(n) ? 0 : n;
            };

            return {
                id: r.id,
                "Tên": r["Tên"],
                "Email": r["Email"],
                "Ngày": dateVal,
                "ca": r.ca,
                "Sản_phẩm": r["Sản_phẩm"],
                "Thị_trường": r["Thị_trường"],
                "Team": r["Team"],
                "CPQC": numeric(r["CPQC"]),
                "Số_Mess_Cmt": numeric(r["Số_Mess_Cmt"]),
                "Số đơn": numeric(r["Số đơn"]),

                // Mapping fields based on logic
                "Doanh số": numeric(r["Doanh số"]), // Usually 'DS chốt' in Legacy View logic, but here raw data has 'Doanh số'

                "DS sau hoàn hủy": numeric(r["DS sau hoàn hủy"]),
                "Số đơn hoàn hủy": numeric(r["Số đơn hoàn hủy"]),
                "Doanh số sau ship": numeric(r["Doanh số sau ship"]),
                "Doanh số TC": numeric(r["Doanh số TC"]),
                "KPIs": numeric(r["KPIs"]),

                "Số đơn thực tế": numeric(r["Số đơn thực tế"]),
                "Doanh thu chốt thực tế": numeric(r["Doanh thu chốt thực tế"]),
                "Doanh số hoàn hủy thực tế": numeric(r["Doanh số hoàn hủy thực tế"]),
                "Số đơn hoàn hủy thực tế": numeric(r["Số đơn hoàn hủy thực tế"]),
                "Doanh số sau hoàn hủy thực tế": numeric(r["Doanh số sau hoàn hủy thực tế"]),
                "Doanh số đi thực tế": numeric(r["Doanh số đi thực tế"]),

                "TKQC": r["TKQC"],
                "id_NS": r["id_NS"],
                "CPQC theo TKQC": numeric(r["CPQC theo TKQC"]),
                "Báo cáo theo Page": r["Báo cáo theo Page"],
                "Trạng thái": r["Trạng thái"],
                "Cảnh báo": r["Cảnh báo"]
            };
        });

        // Upsert in batches using concurrent requests for speed? No, sequential batches to avoid rate limits
        const batchSize = 100; // Supabase handles sizable batches well
        for (let i = 0; i < formattedRecords.length; i += batchSize) {
            const batch = formattedRecords.slice(i, i + batchSize);
            const { error } = await supabase.from('detail_reports').upsert(batch);

            if (error) {
                console.error(`Error inserting batch ${i}:`, error);
            } else {
                console.log(`Inserted batch ${i} - ${Math.min(i + batchSize, formattedRecords.length)}`);
            }
        }

        console.log('Migration complete!');

    } catch (err) {
        console.error('Migration failed:', err);
    }
}

migrate();
