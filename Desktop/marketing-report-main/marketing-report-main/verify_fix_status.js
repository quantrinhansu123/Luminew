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

async function verifyFix() {
    console.log('--- Verifying Cleanup ---');

    // Fetch recent orders again
    const { data: orders, error } = await supabase
        .from('orders')
        .select('order_code, order_date, created_at')
        .order('created_at', { ascending: false })
        .limit(2000);

    if (error) {
        console.error('Error:', error);
        return;
    }

    let remainingSwaps = 0;

    orders.forEach(o => {
        if (!o.order_date || !o.created_at) return;

        const [oY, oM, oD] = o.order_date.split('-').map(Number);
        const cDate = new Date(o.created_at);
        const cM = cDate.getMonth() + 1;
        const cD = cDate.getDate();

        // Check for swaps again
        if (oD === cM && oM === cD && oD !== oM) {
            remainingSwaps++;
            console.log(`[STILL WRONG] ${o.order_code}: ${o.order_date} (Created Month/Day: ${cM}/${cD})`);
        }
    });

    if (remainingSwaps === 0) {
        console.log('✅ CLEANUP VERIFIED: No swapped dates found in sample!');
    } else {
        console.log(`⚠️ CLEANUP INCOMPLETE: Found ${remainingSwaps} records still swapped.`);
    }
}

verifyFix();
