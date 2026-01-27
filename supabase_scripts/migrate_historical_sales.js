// migrate_historical_sales.js
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_ANON_KEY; // Using Anon key needed for RLS or use Service Role if you have it
// Ideally, use SERVICE_ROLE_KEY for admin tasks, but ANON might work if RLS allows public insert (which we enabled for dev)

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const EXTERNAL_API_Url = 'https://n-api-gamma.vercel.app/report/generate?tableName=Báo cáo sale';

// Helper to format date YYYY-MM-DD
const formatDate = (date) => date.toISOString().split('T')[0];

const migrate = async () => {
    console.log('--- STARTING MIGRATION ---');

    // Define range: From beginning of year or last 6 months?
    // Let's take last 90 days to be safe/quick first, or whole year if possible.
    // The user said "dữ liệu cũ", implying all relevant history.
    // Let's try fetching a large range.
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 6); // Last 6 months

    const url = `${EXTERNAL_API_Url}&startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}`;
    console.log(`Fetching from: ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
        const json = await response.json();

        let rawData = json.data || [];
        console.log(`Fetched ${rawData.length} records.`);

        if (rawData.length === 0) {
            console.log('No data found.');
            return;
        }

        // Transform data
        const batchSize = 100;
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < rawData.length; i += batchSize) {
            const batch = rawData.slice(i, i + batchSize);
            const payload = batch
                .filter(item => item['Tên'] && item['Email']) // Basic validation
                .map(item => ({
                    // Mapping fields
                    name: item['Tên'],
                    email: item['Email'],
                    team: item['Team'],
                    branch: item['Chi nhánh'] || item['chi nhánh'],
                    date: item['Ngày'], // CAUTION: Format must be YYYY-MM-DD. API usually returns valid date string?
                    shift: item['Ca'],
                    product: item['Sản phẩm'],
                    market: item['Thị trường'],

                    // Metrics
                    mess_count: Number(item['Số Mess']) || 0,
                    response_count: Number(item['Phản hồi']) || 0,
                    order_count: Number(item['Đơn Mess']) || 0,
                    revenue_mess: Number(item['Doanh số Mess']) || 0,

                    // Additional fields if present in DB schema
                    // Note: sales_reports schema I created has columns for "Actual" data too, 
                    // but manual reports (the source of truth for this migration) only provide these inputs.

                    // Metadata to distinguish
                    created_at: new Date().toISOString()
                    // We might want a 'source' column, but schema doesn't have it yet. 
                    // We can rely on 'updated_at' timestamp or just assume all are reports.
                }));

            if (payload.length === 0) continue;

            const { error } = await supabase.from('sales_reports').insert(payload);

            if (error) {
                console.error('Error inserting batch:', error);
                failCount += payload.length;
            } else {
                successCount += payload.length;
                console.log(`Inserted batch ${i / batchSize + 1} (${payload.length} records)`);
            }
        }

        console.log(`--- MIGRATION COMPLETE ---`);
        console.log(`Success: ${successCount}`);
        console.log(`Failed: ${failCount}`);

    } catch (err) {
        console.error('Migration failed:', err);
    }
};

migrate();
