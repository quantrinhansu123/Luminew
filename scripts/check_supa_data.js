
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkData() {
    console.log('Connecting to Supabase...');
    console.log('URL:', supabaseUrl);

    const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('❌ Error checking orders:', error);
        return;
    }

    console.log(`✅ Connection successful!`);
    console.log(`📊 Total existing orders in Supabase: ${count}`);
}

checkData();
