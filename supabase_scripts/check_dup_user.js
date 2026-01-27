
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function checkDup() {
    const { data: users, error } = await supabase
        .from('users')
        .select('*');

    if (error) console.error(error);
    else {
        console.log(`Found ${users.length} users:`);
        users.forEach(u => console.log(`- Name: ${u.first_name || u.name || u.full_name}, Email: ${u.email}, Role: ${u.role}, Team: ${u.team}`));
    }
}

checkDup();
