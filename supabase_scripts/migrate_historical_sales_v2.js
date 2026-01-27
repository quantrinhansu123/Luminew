// migrate_historical_sales_v2.js
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const EXTERNAL_API_Url = 'https://n-api-gamma.vercel.app/report/generate?tableName=Báo cáo sale';

const migrate = async () => {
    console.log('--- STARTING FULL MIGRATION ---');

    // Fetching last 6 months
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 6);

    const formatDate = (date) => date.toISOString().split('T')[0];
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

        // --- CLEAR EXISTING DATA (Optional but recommended for clean sync if user wants "full") ---
        // console.log('Clearing old data from sales_reports...');
        // await supabase.from('sales_reports').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        // Transform data with ALL fields
        const batchSize = 100;
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < rawData.length; i += batchSize) {
            const batch = rawData.slice(i, i + batchSize);
            const payload = batch
                .filter(item => item['Tên'] && item['Ngày'])
                .map(item => {
                    // Helper to parse date MM/DD/YYYY to YYYY-MM-DD
                    let reportDate = item['Ngày'];
                    if (reportDate && reportDate.includes('/')) {
                        const [m, d, y] = reportDate.split('/');
                        reportDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                    }

                    return {
                        name: item['Tên'],
                        email: item['Email'],
                        position: item['Chức vụ'],
                        team: item['Team'],
                        branch: item['Chi nhánh'] || item['chi nhánh'],
                        date: reportDate,
                        shift: item['Ca'],
                        product: item['Sản phẩm'],
                        market: item['Thị trường'],
                        status: item['Trạng thái'],
                        id_ns: item['id_NS'],
                        id_mess: item['id số mess'],
                        id_response: item['id phản hồi'],

                        // Metrics - Manual
                        mess_count: parseInt(item['Số Mess']) || 0,
                        response_count: parseInt(item['Phản hồi']) || 0,
                        order_count: parseInt(item['Đơn Mess']) || 0,
                        revenue_mess: parseFloat(item['Doanh số Mess']) || 0,

                        // Metrics - Actuals (From the API report itself)
                        order_count_actual: parseInt(item['Số đơn thực tế']) || 0,
                        revenue_actual: parseFloat(item['Doanh thu chốt thực tế']) || 0,
                        revenue_go_actual: parseFloat(item['Doanh số đi thực tế']) || 0,
                        order_cancel_count_actual: parseInt(item['Số đơn hoàn hủy thực tế']) || 0,
                        revenue_cancel_actual: parseFloat(item['Doanh số hoàn hủy thực tế']) || 0,
                        revenue_after_cancel_actual: parseFloat(item['Doanh số sau hoàn hủy thực tế']) || 0,

                        // Other Metrics
                        revenue_go: parseFloat(item['Doanh số đi']) || 0,
                        order_cancel_count: parseInt(item['Số đơn Hoàn huỷ']) || 0,
                        revenue_cancel: parseFloat(item['Doanh số hoàn huỷ']) || 0,
                        order_success_count: parseInt(item['Số đơn thành công']) || 0,
                        revenue_success: parseFloat(item['Doanh số thành công']) || 0,

                        // Customers
                        new_customer: parseInt(item['Khách mới']) || 0,
                        old_customer: parseInt(item['Khách cũ']) || 0,
                        cross_sale: parseInt(item['Bán chéo']) || 0,
                        customer_classification: item['Phân loại KH'],

                        created_at: new Date().toISOString()
                    };
                });

            if (payload.length === 0) continue;

            const { error } = await supabase.from('sales_reports').insert(payload);

            if (error) {
                console.error(`Error inserting batch ${i / batchSize + 1}:`, error.message);
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
        console.error('Migration failed:', err.message);
    }
};

migrate();
