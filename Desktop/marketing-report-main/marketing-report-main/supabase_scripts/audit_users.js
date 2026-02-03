import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function auditUsers() {
    console.log('=== COMPREHENSIVE USER AUDIT ===\n');

    // Get ALL users
    const { data: users, error } = await supabase
        .from('users')
        .select('id, email, name, department, team, position, role')
        .order('team', { ascending: true });

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Total users: ${users.length}\n`);

    // Group by team
    const byTeam = {};
    const byRole = {};
    const problemUsers = [];

    users.forEach(u => {
        // Group by team
        const team = u.team || 'NO_TEAM';
        if (!byTeam[team]) byTeam[team] = [];
        byTeam[team].push(u);

        // Group by role
        const role = u.role || 'NO_ROLE';
        if (!byRole[role]) byRole[role] = [];
        byRole[role].push(u);

        // Detect problems:
        // 1. MKT team but role = 'admin' (should be 'marketing')
        if ((team === 'MKT' || team === 'MARKETING') && role === 'admin') {
            problemUsers.push({
                ...u,
                issue: 'MKT user with admin role'
            });
        }

        // 2. Admin role but not in admin department
        if (role === 'admin' && u.department !== 'Ban Giám Đốc' && !u.email.includes('admin')) {
            problemUsers.push({
                ...u,
                issue: 'Admin role but not in leadership department'
            });
        }
    });

    // Report by Team
    console.log('--- BY TEAM ---');
    Object.keys(byTeam).sort().forEach(team => {
        console.log(`\n${team}: ${byTeam[team].length} users`);
        byTeam[team].slice(0, 3).forEach(u => {
            console.log(`  - ${u.name} (${u.email}): role=${u.role}, dept=${u.department}`);
        });
        if (byTeam[team].length > 3) {
            console.log(`  ... and ${byTeam[team].length - 3} more`);
        }
    });

    // Report by Role
    console.log('\n\n--- BY ROLE ---');
    Object.keys(byRole).sort().forEach(role => {
        console.log(`\n${role}: ${byRole[role].length} users`);
        byRole[role].slice(0, 3).forEach(u => {
            console.log(`  - ${u.name} (${u.email}): team=${u.team}, dept=${u.department}`);
        });
        if (byRole[role].length > 3) {
            console.log(`  ... and ${byRole[role].length - 3} more`);
        }
    });

    // Report problems
    console.log('\n\n--- PROBLEMS DETECTED ---');
    if (problemUsers.length === 0) {
        console.log('No problems detected!');
    } else {
        console.log(`Found ${problemUsers.length} users with issues:\n`);
        problemUsers.forEach((u, i) => {
            console.log(`${i + 1}. ${u.name} (${u.email})`);
            console.log(`   Team: ${u.team}, Dept: ${u.department}, Role: ${u.role}`);
            console.log(`   Issue: ${u.issue}\n`);
        });
    }

    // Save to file
    const report = {
        totalUsers: users.length,
        byTeam,
        byRole,
        problemUsers,
        timestamp: new Date().toISOString()
    };

    fs.writeFileSync('user_audit_report.json', JSON.stringify(report, null, 2));
    console.log('\n📄 Full report saved to: user_audit_report.json');
}

auditUsers();
