import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.log('Missing Supabase env vars!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function diagnose() {
    console.log('--- DIAGNOSIS START ---');
    console.log('Checking orders around 2026-01-10...');

    const dates = ['2026-01-09', '2026-01-10', '2026-01-11'];

    for (const d of dates) {
        const { count, error } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('order_date', d);

        if (error) console.error(`Error checking ${d}:`, error.message);
        else console.log(`Date ${d}: Found ${count} records.`);
    }

    // Fetch samples for 2026-01-10
    console.log('\nFetching generic sample for 2026-01-10...');
    const { data, error } = await supabase
        .from('orders')
        .select('order_code, order_date, created_at')
        .eq('order_date', '2026-01-10')
        .limit(5);

    if (error) {
        console.error('Error fetching samples:', error);
    } else {
        console.log('Samples:', data);
    }

    // Check if there are any orders with timestamps in order_date (if it was text but looks like date)
    // Actually column is date type, so it won't have time.

    // Check for potential whitespace by using a like query if possible (Note: .like() might not work on date type but worth a try implicitly if cast works, otherwise it errors)
    // We'll skip like for now.

    console.log('--- DIAGNOSIS END ---');
}

diagnose();
