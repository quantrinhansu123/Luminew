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

async function fixDateSwaps() {
    console.log('--- STARTING DATE FIX (SWAP REVERSAL) ---');

    // Fetch records
    // We fetch a larger batch to ensure we cover enough ground.
    // In a real production run on massive data, we'd paginate. 
    // Here 5000 is likely enough for the user's recent problematic imports.
    const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5000);

    if (error) {
        console.error('Error fetching orders:', error);
        return;
    }

    console.log(`Fetched ${orders.length} orders. Scanning for swaps...`);

    let fixCount = 0;
    let failCount = 0;

    for (const o of orders) {
        if (!o.order_date || !o.created_at) continue;

        const [oY, oM, oD] = o.order_date.split('-').map(Number); // Stored
        const cDate = new Date(o.created_at);
        const cM = cDate.getMonth() + 1;
        const cD = cDate.getDate();

        // LOGIC: Strong Swap Detection
        // Stored Day == Created Month AND Stored Month == Created Day
        // AND Stored Day != Stored Month (ignore 1/1, 2/2)
        if (oD === cM && oM === cD && oD !== oM) {

            // Construct Correct Date: Swap Day and Month
            // New Day = oM
            // New Month = oD
            const correctDate = `${oY}-${String(oD).padStart(2, '0')}-${String(oM).padStart(2, '0')}`;

            console.log(`[FIX] Code: ${o.order_code} | Wrong: ${o.order_date} | Created: ${o.created_at.split('T')[0]} -> Fixed: ${correctDate}`);

            const { error: updateError } = await supabase
                .from('orders')
                .update({ order_date: correctDate })
                .eq('id', o.id);

            if (updateError) {
                console.error(`Failed to update ${o.order_code}:`, updateError.message);
                failCount++;
            } else {
                fixCount++;
            }
        }
    }

    console.log('--- FIX COMPLETE ---');
    console.log(`Total Scanned: ${orders.length}`);
    console.log(`Fixed: ${fixCount}`);
    console.log(`Failed: ${failCount}`);
}

fixDateSwaps();
