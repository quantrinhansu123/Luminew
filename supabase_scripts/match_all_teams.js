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

async function matchAllTeams() {
    console.log('🔄 Bắt đầu khớp team cho tất cả users...\n');

    // Bước 1: Lấy tất cả users từ bảng users
    console.log('📥 Đang lấy danh sách users từ bảng users...');
    const { data: users, error: usersError } = await supabase
        .from('users')
        .select('email, team, name, department, position')
        .order('email');

    if (usersError) {
        console.error('❌ Lỗi khi lấy users:', usersError.message);
        return;
    }

    console.log(`✅ Đã lấy ${users.length} users\n`);

    // Bước 2: Lấy dữ liệu từ bảng human_resources để khớp team
    console.log('📥 Đang lấy dữ liệu từ bảng human_resources...');
    const { data: hrData, error: hrError } = await supabase
        .from('human_resources')
        .select('email, Team, "Bộ phận", "Vị trí", "Họ Và Tên"');

    if (hrError) {
        console.error('❌ Lỗi khi lấy human_resources:', hrError.message);
        console.log('⚠️  Sẽ chỉ cập nhật từ dữ liệu JSON đã có\n');
    } else {
        console.log(`✅ Đã lấy ${hrData?.length || 0} records từ human_resources\n`);
    }

    // Tạo map email -> team từ human_resources
    const hrTeamMap = {};
    if (hrData) {
        hrData.forEach(hr => {
            if (hr.email && hr.Team) {
                hrTeamMap[hr.email.toLowerCase().trim()] = hr.Team;
            }
        });
    }

    // Dữ liệu JSON bổ sung
    const jsonTeamMap = {
        'biquan2812@gmail.com': 'MKT - Đức Anh 1',
        'vanhoa28052000@gmail.com': 'Đã nghỉ',
        'myt189753@gmail.com': 'Đã nghỉ',
        'anhphung916@gmail.com': 'HN-MKT',
        'dungdungdong1409@gmail.com': 'Vận đơn - Hảo',
        'pquy05211@gmail.com': 'Vận đơn - Quý',
        'hienhien07082001@gmail.com': 'HCM-Sale Đêm'
    };

    // Merge các nguồn dữ liệu (ưu tiên JSON, sau đó HR)
    const allTeamMap = { ...hrTeamMap, ...jsonTeamMap };

    console.log(`📋 Đã có ${Object.keys(allTeamMap).length} email có team từ các nguồn\n`);

    let updatedCount = 0;
    let noChangeCount = 0;
    let noTeamFoundCount = 0;
    const updates = [];
    const noTeamEmails = [];

    // Duyệt qua từng user và cập nhật team
    for (const user of users) {
        const emailLower = user.email?.toLowerCase().trim();
        const newTeam = allTeamMap[emailLower];
        const currentTeam = user.team || null;

        if (!newTeam) {
            noTeamFoundCount++;
            noTeamEmails.push({
                email: user.email,
                name: user.name,
                currentTeam: currentTeam,
                department: user.department,
                position: user.position
            });
            continue;
        }

        if (currentTeam === newTeam) {
            noChangeCount++;
            continue;
        }

        // Cần cập nhật
        console.log(`🔄 Cập nhật: ${user.email}`);
        console.log(`   Tên: ${user.name || 'N/A'}`);
        console.log(`   Team cũ: ${currentTeam || '(trống)'}`);
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
                oldTeam: currentTeam,
                newTeam: newTeam
            });
        }
    }

    // Hiển thị kết quả
    console.log('\n' + '='.repeat(80));
    console.log('📊 KẾT QUẢ CẬP NHẬT');
    console.log('='.repeat(80));
    console.log(`✅ Đã cập nhật: ${updatedCount} users`);
    console.log(`⏭️  Không thay đổi: ${noChangeCount} users`);
    console.log(`❌ Không tìm thấy team: ${noTeamFoundCount} users`);
    console.log(`📋 Tổng số users: ${users.length}`);

    if (updates.length > 0) {
        console.log('\n📝 Chi tiết các user đã cập nhật:');
        console.log('-'.repeat(80));
        updates.forEach(u => {
            console.log(`Email: ${u.email}`);
            console.log(`Tên: ${u.name || 'N/A'}`);
            console.log(`Team: ${u.oldTeam || '(trống)'} → ${u.newTeam}`);
            console.log('-'.repeat(80));
        });
    }

    if (noTeamEmails.length > 0) {
        console.log(`\n⚠️  Các email không tìm thấy team (hiển thị 20 đầu tiên):`);
        console.log('Email'.padEnd(35) + ' | Tên'.padEnd(25) + ' | Team hiện tại'.padEnd(20) + ' | Bộ phận');
        console.log('-'.repeat(80));
        noTeamEmails.slice(0, 20).forEach(u => {
            console.log(
                (u.email || 'N/A').padEnd(35) + ' | ' +
                (u.name || 'N/A').substring(0, 23).padEnd(25) + ' | ' +
                (u.currentTeam || '(trống)').substring(0, 18).padEnd(20) + ' | ' +
                (u.department || 'N/A')
            );
        });
        if (noTeamEmails.length > 20) {
            console.log(`\n... và ${noTeamEmails.length - 20} email khác`);
        }
    }

    console.log('\n✅ Hoàn thành!');
}

matchAllTeams().catch(error => {
    console.error('❌ Lỗi:', error);
    process.exit(1);
});
