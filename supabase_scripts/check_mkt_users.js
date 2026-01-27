import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkMKTUsers() {
    console.log('--- Checking MKT Users ---');
    const { data: users, error } = await supabase
        .from('users')
        .select('id, email, name, team, role')
        .eq('team', 'MKT')
        .limit(5);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log(`Found ${users.length} MKT users:`);
        users.forEach((u, i) => {
            console.log(`${i + 1}. ${u.name} (${u.email}) - Role: ${u.role}`);
        });
    }
}

checkMKTUsers();
