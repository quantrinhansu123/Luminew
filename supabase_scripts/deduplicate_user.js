
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function deduplicate() {
    const email = 'trankhai11012000@gmail.com';
    console.log(`Checking duplicates for: ${email}`);

    // 1. Get all duplicates
    const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .order('created_at', { ascending: true }); // Keep oldest (original)? Or keep newest (latest update)? Usually keep newest if sync script ran multiple times.

    if (error) {
        console.error(error);
        return;
    }

    console.log(`Found ${users.length} records.`);

    if (users.length <= 1) {
        console.log("No duplicates found. Nothing to do.");
        return;
    }

    // Strategy: Keep the one with the most data, or the latest one.
    // Let's assume the latest one is the valid one from the latest sync.
    // Actually, wait. If we have multiple, maybe one has a Role and one doesn't?
    // Let's keep the one that looks "best".

    // Sort by having role first, then by created_at desc
    users.sort((a, b) => {
        // Priority 1: Has role
        const roleA = a.role && a.role !== 'user' ? 1 : 0;
        const roleB = b.role && b.role !== 'user' ? 1 : 0;
        if (roleA !== roleB) return roleB - roleA; // Higher score first

        // Priority 2: Latest created_at
        return new Date(b.created_at) - new Date(a.created_at);
    });

    const winner = users[0];
    const losers = users.slice(1);

    console.log(`\nWINNER: ID ${winner.id} (Role: ${winner.role}, Created: ${winner.created_at})`);
    console.log(`LOSERS to delete: ${losers.length}`);

    for (const loser of losers) {
        console.log(`Deleting ID ${loser.id}...`);
        const { error: delError } = await supabase.from('users').delete().eq('id', loser.id);
        if (delError) console.error(`Failed to delete ${loser.id}:`, delError);
        else console.log(`Deleted ${loser.id} successfully.`);
    }

    console.log("\nDeduplication complete!");
}

deduplicate();
