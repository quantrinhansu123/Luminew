import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Inline config to ensure script runs standalone
const MENU_CONFIG = {
    sale: { teams: ['Sale', 'KD', 'SALE', 'Kinh doanh'] },
    delivery: { teams: ['Vận đơn', 'Vận Đơn', 'Van don', 'Kho', 'Warehouse'] },
    marketing: { teams: ['MKT', 'MARKETING', 'Marketing', 'Truyền thông'] },
    rnd: { teams: ['R&D', 'RD', 'R&D Team', 'RnD'] },
    finance: { teams: ['Kế toán', 'Tài chính', 'Finance', 'Accounting'] }, // Fixed: duplicates 'KT' removed
    hr: { teams: ['HCNS', 'HR', 'Nhân sự', 'Hành chính', 'Human Resources'] },
    cskh: { teams: ['CSKH', 'Customer Service', 'Chăm sóc khách hàng', 'CS'] }
};

async function auditMenuAccess() {
    console.log('=== AUDITING USER MENU ACCESS ===\n');

    const { data: users, error } = await supabase
        .from('users')
        .select('id, email, name, team, department, role')
        .order('team');

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    const report = {
        total_users: users.length,
        access_map: {},
        no_access: [],
        multi_access: [],
        admins: []
    };

    users.forEach(u => {
        // 1. Admins/Leaders see everything
        if (u.role === 'admin' || u.role === 'leader') {
            report.admins.push(`${u.name} (${u.team}) - Role: ${u.role}`);
            return;
        }

        const userTeam = (u.team || '').trim();
        const normalizedTeam = userTeam.toLowerCase();

        // Check which menus they qualify for
        const matches = [];
        Object.keys(MENU_CONFIG).forEach(key => {
            const allowedTeams = MENU_CONFIG[key].teams;
            const isMatch = allowedTeams.some(t => normalizedTeam.includes(t.toLowerCase()));
            if (isMatch) matches.push(key);
        });

        if (matches.length === 0) {
            report.no_access.push(`${u.name} (Team: "${userTeam}")`);
        } else if (matches.length > 1) {
            report.multi_access.push(`${u.name} (Team: "${userTeam}") -> Matches: [${matches.join(', ')}]`);
        } else {
            const key = matches[0];
            if (!report.access_map[key]) report.access_map[key] = [];
            report.access_map[key].push(`${u.name} (Team: "${userTeam}")`);
        }
    });

    // PRINT REPORT
    console.log(`checked ${users.length} users.\n`);

    console.log('--- 👑 ADMINS / LEADERS (Full Access) ---');
    report.admins.forEach(u => console.log(`  ${u}`));

    console.log('\n--- ✅ SINGLE TEAM ACCESS (Correct) ---');
    for (const [key, list] of Object.entries(report.access_map)) {
        console.log(`\n📂 MENU: ${key.toUpperCase()} (${list.length} users)`);
        // Show first 5 and summary
        list.slice(0, 10).forEach(u => console.log(`  - ${u}`));
        if (list.length > 10) console.log(`  ... and ${list.length - 10} more`);
    }

    console.log('\n\n--- ⚠️ MULTIPLE MENU ACCESS (Ambiguous Team Name) ---');
    if (report.multi_access.length === 0) console.log('  None. Good!');
    else report.multi_access.forEach(u => console.log(`  ${u}`));

    console.log('\n\n--- ❌ NO MENU ACCESS (Team name not in config) ---');
    if (report.no_access.length === 0) console.log('  None. Everyone has access.');
    else {
        console.log('  These users see NO special menus (only General/Home):');
        report.no_access.forEach(u => console.log(`  - ${u}`));
    }
}

auditMenuAccess();
