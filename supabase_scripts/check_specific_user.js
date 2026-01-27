import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkUser() {
    console.log('--- Checking User Trần Quốc Khải ---');
    const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .ilike('name', '%Quốc Khải%');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log(`Found ${users.length} users:`);
        users.forEach((u) => {
            console.log(JSON.stringify(u, null, 2));
        });
    }
}

checkUser();
