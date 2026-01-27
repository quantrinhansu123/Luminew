
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

function getRoleFromDepartment(team, position) {
    const t = (team || '').toLowerCase();
    const p = (position || '').toLowerCase();

    // 1. Check Leaders first
    if (p.includes('leader') || p.includes('quản lý') || p.includes('trưởng phòng') || p.includes('manager')) {
        return 'leader';
    }

    // 2. Map Departments
    if (t.includes('mkt') || t.includes('marketing') || t.includes('truyền thông')) return 'marketing';
    if (t.includes('sale') || t.includes('kd') || t.includes('kinh doanh')) return 'sale';
    if (t.includes('cskh') || t.includes('khách hàng')) return 'cskh';
    if (t.includes('vận đơn') || t.includes('kho') || t.includes('delivery')) return 'delivery';
    if (t.includes('r&d') || t.includes('rd') || t.includes('nghiên cứu')) return 'rnd';
    if (t.includes('kế toán') || t.includes('tài chính') || t.includes('finance')) return 'finance';
    if (t.includes('hr') || t.includes('hcns') || t.includes('nhân sự') || t.includes('hành chính')) return 'hr';

    return 'user';
}

async function autoSync() {
    console.log('--- AUTO SYNC ROLES START ---');

    const { data: users, error } = await supabase.from('users').select('*');
    if (error) { console.error(error); return; }

    let updatedCount = 0;

    for (const u of users) {
        // Skip Admins (manual only)
        if (u.role === 'admin') continue;

        const suggestedRole = getRoleFromDepartment(u.team || u.department, u.position);

        // Only update if different
        if (u.role !== suggestedRole) {
            console.log(`Updating ${u.email}: ${u.role} -> ${suggestedRole} (Team: ${u.team})`);

            const { error: upError } = await supabase
                .from('users')
                .update({ role: suggestedRole })
                .eq('id', u.id);

            if (upError) console.error(`Failed to update ${u.email}:`, upError);
            else updatedCount++;
        }
    }

    console.log(`\n--- SYNC COMPLETE. Updated ${updatedCount} users. ---`);
}

autoSync();
