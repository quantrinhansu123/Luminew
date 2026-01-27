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

async function verifyLogic() {
    console.log('--- Verifying Fix Logic using Created_At ---');
    console.log('Fetching records where Day/Month might be swapped relative to Created_At...');

    // Fetch a batch of orders
    // We want to see cases where order_date Day matches created_at Month
    const { data: orders, error } = await supabase
        .from('orders')
        .select('order_code, order_date, created_at')
        .order('created_at', { ascending: false })
        .limit(1000);

    if (error) {
        console.error('Error:', error);
        return;
    }

    let detectedSwaps = 0;

    console.log('\n--- EXAMPLES OF DETECTED SWAPS ---');
    console.log('(Logic: Stored Day == Created Month AND Stored Month != Created Month)');
    console.log('---------------------------------------------------------------');
    console.log('Code        | Stored Date (Wrong?) | Created At (Truth) | Proposed Fix');
    console.log('---------------------------------------------------------------');

    orders.forEach(o => {
        if (!o.order_date || !o.created_at) return;

        // Parse Stored Order Date
        const [oY, oM, oD] = o.order_date.split('-').map(Number); // Stored: YYYY-MM-DD

        // Parse System Created At
        const cDate = new Date(o.created_at);
        const cY = cDate.getFullYear();
        const cM = cDate.getMonth() + 1; // 1-12
        const cD = cDate.getDate();

        // THE CHECK:
        // If Stored Day (oD) is same as Created Month (cM)
        // AND Stored Month (oM) is NOT same as Created Month (cM)
        // AND Stored Month (oM) is close to Created Day (cD) (optional, but good indicator)

        // Example: Stored 2026-02-05 (Feb 5). Created 2026-05-02 (May 2).
        // oD=5, oM=2. cD=2, cM=5.
        // Match: oM (2) == cD (2) AND oD (5) == cM (5). PERFECT SWAP.

        if (oD === cM && oM === cD) {
            const proposedFix = `${oY}-${String(oD).padStart(2, '0')}-${String(oM).padStart(2, '0')}`;

            console.log(`${o.order_code.padEnd(11)} | ${o.order_date.padEnd(20)} | ${o.created_at.split('T')[0].padEnd(18)} | ${proposedFix} (Swap!)`);
            detectedSwaps++;
        }
    });

    if (detectedSwaps === 0) {
        console.log('No perfect swaps found in this sample batch.');
    } else {
        console.log(`\nFound ${detectedSwaps} clearly swapped records in 1000 samples.`);
    }
}

verifyLogic();
