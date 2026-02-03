import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function fixRoles() {
    console.log('=== FIXING USER ROLES ===\n');

    // Fix 1: MKT users should have role='marketing', not 'admin'
    console.log('1. Fixing MKT users with admin role...');
    const { data: mktUsers, error: mktError } = await supabase
        .from('users')
        .select('id, email, name, team, role')
        .in('team', ['MKT', 'MARKETING'])
        .eq('role', 'admin');

    if (mktError) {
        console.error('Error fetching MKT users:', mktError);
    } else if (mktUsers.length > 0) {
        console.log(`Found ${mktUsers.length} MKT users with admin role:`);
        mktUsers.forEach(u => console.log(`  - ${u.name} (${u.email})`));

        const mktIds = mktUsers.map(u => u.id);
        const { error: updateError } = await supabase
            .from('users')
            .update({ role: 'marketing' })
            .in('id', mktIds);

        if (updateError) {
            console.error('Error updating MKT users:', updateError);
        } else {
            console.log(`✅ Updated ${mktUsers.length} MKT users to role='marketing'`);
        }
    } else {
        console.log('No MKT users with admin role found.');
    }

    // Fix 2: Ensure only specific users have admin role
    console.log('\n2. Checking admin role assignments...');
    const { data: adminUsers, error: adminError } = await supabase
        .from('users')
        .select('id, email, name, department, team, position')
        .eq('role', 'admin');

    if (adminError) {
        console.error('Error fetching admin users:', adminError);
    } else {
        console.log(`Found ${adminUsers.length} users with admin role:`);
        adminUsers.forEach(u => {
            const isLegit = u.email.includes('admin') || u.department === 'Ban Giám Đốc' || u.position?.toLowerCase().includes('giám đốc');
            const status = isLegit ? '✅' : '⚠️ ';
            console.log(`  ${status} ${u.name} (${u.email}) - ${u.department} - ${u.position}`);
        });
    }

    console.log('\n✅ Role fix completed!');
}

fixRoles();
