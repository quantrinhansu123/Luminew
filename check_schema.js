import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSchema() {
    console.log('Checking schema for "orders"...');
    // Fetch one record and print its keys
    const { data, error } = await supabase.from('orders').select('*').limit(1);
    if (error) {
        console.error(error);
        return;
    }
    if (data && data.length > 0) {
        console.log('Keys:', Object.keys(data[0]).sort().join(', '));
    } else {
        console.log('No data found to infer schema.');
    }
}

checkSchema();
