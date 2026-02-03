import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Vui lòng cấu hình VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trong file .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Mapping department -> team (nếu team trống)
const departmentToTeamMap = {
    'MKT': 'MKT',
    'Sale': 'Sale',
    'Vận Đơn': 'Vận Đơn',
    'CSKH': 'CSKH',
    'HR': 'HR',
    'Kế toán': 'Kế toán',
    'R&D': 'R&D',
    'Content': 'Content'
};

async function syncTeamsFromDepartment() {
    console.log('🔄 Đồng bộ team từ department cho các users chưa có team...\n');

    // Lấy tất cả users
    console.log('📥 Đang lấy danh sách users...');
    const { data: users, error: usersError } = await supabase
        .from('users')
        .select('email, team, name, department, position')
        .order('email');

    if (usersError) {
        console.error('❌ Lỗi khi lấy users:', usersError.message);
        return;
    }

    console.log(`✅ Đã lấy ${users.length} users\n`);

    let updatedCount = 0;
    let noChangeCount = 0;
    let noDepartmentCount = 0;
    const updates = [];
    const noDepartmentEmails = [];

    for (const user of users) {
        // Nếu đã có team, bỏ qua
        if (user.team && user.team.trim() !== '') {
            noChangeCount++;
            continue;
        }

        // Nếu không có department, bỏ qua
        if (!user.department || user.department.trim() === '') {
            noDepartmentCount++;
            noDepartmentEmails.push({
                email: user.email,
                name: user.name,
                department: user.department,
                position: user.position
            });
            continue;
        }

        // Lấy team từ department
        const newTeam = departmentToTeamMap[user.department] || user.department;

        console.log(`🔄 Cập nhật: ${user.email}`);
        console.log(`   Tên: ${user.name || 'N/A'}`);
        console.log(`   Department: ${user.department}`);
        console.log(`   Team mới: ${newTeam}`);

        const { data, error } = await supabase
            .from('users')
            .update({ team: newTeam })
            .eq('email', user.email)
            .select();

        if (error) {
            console.error(`   ❌ Lỗi: ${error.message}\n`);
        } else {
            console.log(`   ✅ Đã cập nhật thành công\n`);
            updatedCount++;
            updates.push({
                email: user.email,
                name: user.name,
                department: user.department,
                newTeam: newTeam
            });
        }
    }

    // Hiển thị kết quả
    console.log('\n' + '='.repeat(80));
    console.log('📊 KẾT QUẢ');
    console.log('='.repeat(80));
    console.log(`✅ Đã cập nhật: ${updatedCount} users`);
    console.log(`⏭️  Đã có team: ${noChangeCount} users`);
    console.log(`❌ Không có department: ${noDepartmentCount} users`);
    console.log(`📋 Tổng số users: ${users.length}`);

    if (updates.length > 0) {
        console.log('\n📝 Chi tiết các user đã cập nhật:');
        console.log('-'.repeat(80));
        updates.forEach(u => {
            console.log(`Email: ${u.email}`);
            console.log(`Tên: ${u.name || 'N/A'}`);
            console.log(`Department: ${u.department}`);
            console.log(`Team mới: ${u.newTeam}`);
            console.log('-'.repeat(80));
        });
    }

    if (noDepartmentEmails.length > 0 && noDepartmentEmails.length <= 10) {
        console.log(`\n⚠️  Các email không có department:`);
        noDepartmentEmails.forEach(u => {
            console.log(`   - ${u.email} (${u.name || 'N/A'})`);
        });
    }

    // Hiển thị thống kê team
    console.log('\n📊 Thống kê team sau khi cập nhật:');
    const { data: allUsers, error: statsError } = await supabase
        .from('users')
        .select('team');

    if (!statsError && allUsers) {
        const teamStats = {};
        allUsers.forEach(u => {
            const team = u.team || '(trống)';
            teamStats[team] = (teamStats[team] || 0) + 1;
        });

        console.log('-'.repeat(80));
        Object.entries(teamStats)
            .sort((a, b) => b[1] - a[1])
            .forEach(([team, count]) => {
                console.log(`   ${team.padEnd(30)} : ${count} users`);
            });
    }

    console.log('\n✅ Hoàn thành!');
}

syncTeamsFromDepartment().catch(error => {
    console.error('❌ Lỗi:', error);
    process.exit(1);
});
