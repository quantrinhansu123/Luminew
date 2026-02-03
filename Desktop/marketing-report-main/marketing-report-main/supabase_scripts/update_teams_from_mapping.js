import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

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

// ============================================
// THÊM MAPPING EMAIL -> TEAM VÀO ĐÂY
// ============================================
const emailToTeamMapping = {
    // Ví dụ:
    // 'email1@example.com': 'Team 1',
    // 'email2@example.com': 'Team 2',
    
    // Dữ liệu từ JSON trước đó
    'biquan2812@gmail.com': 'MKT - Đức Anh 1',
    'vanhoa28052000@gmail.com': 'Đã nghỉ',
    'myt189753@gmail.com': 'Đã nghỉ',
    'anhphung916@gmail.com': 'HN-MKT',
    'dungdungdong1409@gmail.com': 'Vận đơn - Hảo',
    'pquy05211@gmail.com': 'Vận đơn - Quý',
    'hienhien07082001@gmail.com': 'HCM-Sale Đêm',
    
    // THÊM CÁC EMAIL KHÁC VÀO ĐÂY:
    // 'email@example.com': 'Team Name',
};

async function updateTeamsFromMapping() {
    console.log('🔄 Cập nhật team từ mapping...\n');
    console.log(`📋 Đã có ${Object.keys(emailToTeamMapping).length} email trong mapping\n`);

    if (Object.keys(emailToTeamMapping).length === 0) {
        console.log('⚠️  Không có mapping nào. Vui lòng thêm email -> team vào file này.');
        return;
    }

    // Lấy tất cả users
    const { data: users, error: usersError } = await supabase
        .from('users')
        .select('email, team, name, id')
        .in('email', Object.keys(emailToTeamMapping))
        .order('email');

    if (usersError) {
        console.error('❌ Lỗi khi lấy users:', usersError.message);
        return;
    }

    console.log(`✅ Tìm thấy ${users.length} users trong database\n`);

    let updatedCount = 0;
    let noChangeCount = 0;
    let notFoundCount = 0;
    const updates = [];
    const notFoundEmails = [];

    // Kiểm tra các email trong mapping nhưng không có trong DB
    const foundEmails = users.map(u => u.email?.toLowerCase().trim());
    Object.keys(emailToTeamMapping).forEach(email => {
        if (!foundEmails.includes(email.toLowerCase().trim())) {
            notFoundEmails.push(email);
        }
    });

    if (notFoundEmails.length > 0) {
        console.log('⚠️  Các email trong mapping nhưng không có trong database:');
        notFoundEmails.forEach(email => {
            console.log(`   - ${email} → Team: ${emailToTeamMapping[email]}`);
        });
        console.log('');
    }

    // Cập nhật team
    for (const user of users) {
        const emailLower = user.email?.toLowerCase().trim();
        const expectedTeam = emailToTeamMapping[emailLower] || emailToTeamMapping[user.email];
        const currentTeam = user.team || null;

        if (!expectedTeam) {
            continue;
        }

        if (currentTeam === expectedTeam) {
            noChangeCount++;
            continue;
        }

        console.log(`🔄 Cập nhật: ${user.email}`);
        console.log(`   Tên: ${user.name || 'N/A'}`);
        console.log(`   Team cũ: ${currentTeam || '(trống)'}`);
        console.log(`   Team mới: ${expectedTeam}`);

        const { data, error } = await supabase
            .from('users')
            .update({ team: expectedTeam })
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
                newTeam: expectedTeam
            });
        }
    }

    // Hiển thị kết quả
    console.log('\n' + '='.repeat(80));
    console.log('📊 KẾT QUẢ');
    console.log('='.repeat(80));
    console.log(`✅ Đã cập nhật: ${updatedCount} users`);
    console.log(`⏭️  Không thay đổi: ${noChangeCount} users`);
    console.log(`❌ Không tìm thấy trong DB: ${notFoundCount} users`);
    console.log(`📋 Tổng số email trong mapping: ${Object.keys(emailToTeamMapping).length}`);

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

    console.log('\n✅ Hoàn thành!');
    console.log('\n💡 Tip: Để thêm mapping mới, chỉnh sửa biến emailToTeamMapping trong file này.');
}

updateTeamsFromMapping().catch(error => {
    console.error('❌ Lỗi:', error);
    process.exit(1);
});
