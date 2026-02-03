
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

console.log('Script starting...');

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) console.log('No URL');
if (!supabaseKey) console.log('No Key');

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('Connecting...');
    const { data, error } = await supabase.from('sales_reports').select('date').limit(3);
    if (error) {
        console.error(error);
    } else {
        console.log('Data:', data);
    }
}

run();
