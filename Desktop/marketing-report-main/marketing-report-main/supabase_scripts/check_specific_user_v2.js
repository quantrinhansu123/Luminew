import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkUser() {
    console.log('--- Checking User by Email ---');
    const targetEmail = 'trankhai11012000@gmail.com';

    const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', targetEmail);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log(`Fetch success. Found ${users.length} users with email '${targetEmail}':`);
        users.forEach(u => {
            console.log(JSON.stringify({
                id: u.id,
                email: u.email,
                role: u.role,
                team: u.team,
                department: u.department,
                created_at: u.created_at
            }, null, 2));
        });
    }
}

checkUser();
