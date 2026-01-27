const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);

async function check() {
    try {
        console.log('Checking sales_reports table...');
        const { data, error, count } = await supabase
            .from('sales_reports')
            .select('*', { count: 'exact' })
            .limit(1);

        if (error) {
            console.error('Error:', error.message);
            return;
        }

        console.log('Record count:', count);
        if (data && data[0]) {
            console.log('Available columns:', Object.keys(data[0]));
            console.log('Sample record:', data[0]);
        } else {
            console.log('Table is empty.');
        }
    } catch (e) {
        console.error('Failed to connect:', e.message);
    }
}

check();
