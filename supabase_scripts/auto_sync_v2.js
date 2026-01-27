
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ ERROR: Missing Supabase URL or Key in .env file");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const LOG_FILE = 'sync_log.txt';

function log(msg) {
    console.log(msg);
    fs.appendFileSync(LOG_FILE, msg + '\n');
}

function getRoleFromDepartment(team, position) {
    // Normalize to handle potential unicode differences
    const t = (team || '').toLowerCase().normalize("NFC");
    const p = (position || '').toLowerCase().normalize("NFC");

    if (p.includes('leader') || p.includes('quản lý') || p.includes('trưởng phòng') || p.includes('manager')) return 'leader';

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
    fs.writeFileSync(LOG_FILE, '--- SYNC START ---\n');
    log('Fetching users...');

    const { data: users, error } = await supabase.from('users').select('*');
    if (error) { log('Error fetching users: ' + error.message); return; }

    log(`Found ${users.length} users.`);
    let updatedCount = 0;

    for (const u of users) {
        if (u.role === 'admin') continue;

        const teamSource = u.team || u.department || '';
        const suggestedRole = getRoleFromDepartment(teamSource, u.position);

        log(`User: ${u.email} | Team: "${teamSource}" | CurrentRole: ${u.role} | Suggested: ${suggestedRole}`);

        if (u.role !== suggestedRole) {
            log(`=> Updating ${u.email} to ${suggestedRole}`);

            // Try updating
            const { error: upError } = await supabase
                .from('users')
                .update({ role: suggestedRole })
                .eq('id', u.id);

            if (upError) {
                log(`   FAILED: ${upError.message}`);
            } else {
                log(`   SUCCESS.`);
                updatedCount++;
            }
        }
    }

    log(`--- SYNC COMPLETE. Updated ${updatedCount} users. ---`);
}

autoSync();
