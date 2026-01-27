
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env from parent directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Fetching one row from sales_reports...');
    const { data, error } = await supabase
        .from('sales_reports')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log('Columns found:', Object.keys(data[0]));
    } else {
        console.log('Table is empty, cannot infer columns from data.');
        // Try inserting a dummy row with just required fields to see if it fails? 
        // No, better to try to list columns another way if possible, or just fail.
    }
}

checkSchema();
