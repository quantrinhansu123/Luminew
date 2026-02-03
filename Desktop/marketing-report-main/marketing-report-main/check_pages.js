
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://gsjhsmxyxjyiqovauyrp.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy';

console.log('URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPages() {
    console.log('Checking marketing_pages...');
    // Force fetch headers to verify connection
    const { data, error } = await supabase.from('marketing_pages').select('*').limit(3);

    if (error) {
        console.error('Error fetching pages:', error);
    } else {
        console.log('Data fetched successfully.');
        if (data && data.length > 0) {
            console.log('First Page Object Keys:', Object.keys(data[0]));
            console.log('First Page Data:', JSON.stringify(data[0], null, 2));
        } else {
            console.log('No pages found.');
        }
    }
}

checkPages();
