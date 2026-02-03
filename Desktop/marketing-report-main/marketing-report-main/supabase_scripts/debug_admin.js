import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function debugAdmin() {
    console.log('--- START DEBUG ---');
    const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', 'admin@marketing.com');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log(`Found ${users.length} users with email admin@marketing.com`);
        users.forEach((u, i) => {
            console.log(`User ${i + 1}: ID=${u.id}, Created=${u.created_at}, Role=${u.role}`);
        });
    }
    console.log('--- END DEBUG ---');
}

debugAdmin();
