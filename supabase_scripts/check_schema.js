const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);

async function checkSchema() {
    console.log('--- Checking Users ---');
    const { data: users, error: userError } = await supabase.from('users').select('*').limit(1);
    if (userError) console.error(userError);
    else if (users.length) console.log('Users Keys:', Object.keys(users[0]));
    else console.log('No users found');

    console.log('--- Checking Orders ---');
    const { data: orders, error: orderError } = await supabase.from('orders').select('*').limit(1);
    if (orderError) console.error(orderError);
    else if (orders.length) console.log('Orders Keys:', Object.keys(orders[0]));
    else console.log('No orders found');

    console.log('--- Checking Detail Reports ---');
    const { data: reports, error: reportError } = await supabase.from('detail_reports').select('*').limit(1);
    if (reportError) console.error(reportError);
    else if (reports.length) console.log('Detail Reports Keys:', Object.keys(reports[0]));
    else console.log('No reports found');
}

checkSchema();
