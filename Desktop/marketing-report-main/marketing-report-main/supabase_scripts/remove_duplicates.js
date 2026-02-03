import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function removeDuplicates() {
    const email = 'admin@marketing.com';
    console.log(`Checking for duplicates for: ${email}`);

    // 1. Get all users with this email
    const { data: users, error: fetchError } = await supabase
        .from('users')
        .select('id, created_at')
        .eq('email', email)
        .order('created_at', { ascending: false });

    if (fetchError) {
        console.error('Error fetching users:', fetchError);
        return;
    }

    console.log(`Found ${users.length} users with email ${email}`);

    if (users.length > 1) {
        // Keep the first one (most recent due to order by created_at desc), delete others
        const [keepUser, ...deleteUsers] = users;
        console.log(`Keeping user ID: ${keepUser.id} (created: ${keepUser.created_at})`);

        const idsToDelete = deleteUsers.map(u => u.id);
        console.log(`Deleting duplicates: ${idsToDelete.join(', ')}`);

        const { error: deleteError } = await supabase
            .from('users')
            .delete()
            .in('id', idsToDelete);

        if (deleteError) {
            console.error('Error deleting duplicates:', deleteError);
        } else {
            console.log('Successfully deleted duplicate accounts.');
        }
    } else {
        console.log('No duplicates found.');
    }
}

removeDuplicates();
