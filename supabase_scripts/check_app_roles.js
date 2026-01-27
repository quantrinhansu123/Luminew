import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkRoles() {
    console.log('--- Checking app_roles Schema ---');
    const { data: roles, error } = await supabase
        .from('app_roles')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('First role record:', JSON.stringify(roles[0], null, 2));
    }
}

checkRoles();
