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

async function checkDateFormats() {
    console.log('Checking order_date values for 2026-01-10 (and potentially 2026-10-01) in Supabase...');

    // Check distinct formats in general first
    const { data, error } = await supabase
        .from('orders')
        .select('order_date')
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    console.log(`Fetched ${data.length} recent records.`);

    // Analyze formats
    const formats = new Set();
    const samples = [];
    const dateCounts = {};

    data.forEach(row => {
        const d = row.order_date;
        if (!d) return;

        let type = 'UNKNOWN';
        if (d.includes('T')) type = 'ISO';
        else if (d.match(/^\d{4}-\d{2}-\d{2}$/)) type = 'YYYY-MM-DD';
        else if (d.includes('/')) type = 'SLASH';

        formats.add(type);
        samples.push(d);

        // Count specific dates to see if 2026-01-10 exists
        // Normalize for counting
        let normalized = d;
        if (d.includes('T')) normalized = d.split('T')[0];
        // If SLASH DD/MM/YYYY
        if (d.includes('/')) {
            // Just count raw for now
            normalized = d;
        }

        dateCounts[normalized] = (dateCounts[normalized] || 0) + 1;
    });

    console.log('--- Date Formats Found ---');
    formats.forEach(f => console.log(f));

    console.log('\n--- Sample Values (First 10) ---');
    samples.slice(0, 10).forEach(s => console.log(s));

    console.log('\n--- Specific Date Counts (Looking for 2026-01-10) ---');
    // Log any key containing '2026' and '01' and '10'
    Object.keys(dateCounts).forEach(k => {
        if (k.includes('01') && k.includes('10')) {
            console.log(`${k}: ${dateCounts[k]} records`);
        }
    });
}

checkDateFormats();
