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

async function analyze() {
    console.log('--- Analyzing Date Mismatches ---');

    // Fetch all orders (subset for analysis if too large, but let's try 2000)
    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, order_code, order_date, created_at')
        .limit(2000)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error:', error);
        return;
    }

    let potentialSwaps = 0;
    let matchCount = 0;
    let samples = [];

    orders.forEach(o => {
        if (!o.order_date || !o.created_at) return;

        // Parse order_date (YYYY-MM-DD from 'date' column)
        const [oY, oM, oD] = o.order_date.split('-').map(Number);

        // Parse created_at (ISO String)
        const cDate = new Date(o.created_at);
        const cY = cDate.getFullYear();
        const cM = cDate.getMonth() + 1;
        const cD = cDate.getDate();

        // Check if Day/Month are swapped
        // Logic: If order_date Day == created_at Month AND order_date Month == created_at Day
        // And they are DIFFERENT (meaning a swap actually changes the date)
        if (oD === cM && oM === cD && oD !== oM) {
            potentialSwaps++;
            if (samples.length < 5) samples.push({
                code: o.order_code,
                order_date: o.order_date,
                created_at_fmt: `${cY}-${cM}-${cD}`,
                reason: `Day ${oD} matches Month ${cM}, Month ${oM} matches Day ${cD}`
            });
        }

        // Simple match (same date)
        if (oD === cD && oM === cM) {
            matchCount++;
        }
    });

    console.log(`Analyzed ${orders.length} latest orders.`);
    console.log(`Matched Dates (Correct): ${matchCount}`);
    console.log(`Potential Swaps Detected: ${potentialSwaps}`);

    if (potentialSwaps > 0) {
        console.log('\n--- Sample Swaps ---');
        console.table(samples);
    }
}

analyze();
