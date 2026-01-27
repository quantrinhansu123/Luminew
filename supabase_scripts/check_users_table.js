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

async function checkUsersTable() {
    console.log('🔍 Kiểm tra bảng users...\n');

    // Lấy tất cả users
    const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .order('email');

    if (error) {
        console.error('❌ Lỗi khi lấy dữ liệu:', error.message);
        return;
    }

    console.log(`✅ Đã lấy ${users.length} users từ bảng users\n`);

    // Hiển thị cấu trúc (các cột)
    if (users.length > 0) {
        console.log('📋 Các cột trong bảng users:');
        console.log(Object.keys(users[0]).join(', '));
        console.log('');
    }

    // Hiển thị dữ liệu chi tiết
    console.log('='.repeat(120));
    console.log('📊 DỮ LIỆU TRONG BẢNG USERS');
    console.log('='.repeat(120));
    console.log(
        'Email'.padEnd(35) + ' | ' +
        'Tên'.padEnd(25) + ' | ' +
        'Team'.padEnd(25) + ' | ' +
        'Department'.padEnd(20) + ' | ' +
        'Position'
    );
    console.log('-'.repeat(120));

    users.forEach(user => {
        console.log(
            (user.email || 'N/A').padEnd(35) + ' | ' +
            (user.name || 'N/A').substring(0, 23).padEnd(25) + ' | ' +
            (user.team || '(trống)').substring(0, 23).padEnd(25) + ' | ' +
            (user.department || 'N/A').substring(0, 18).padEnd(20) + ' | ' +
            (user.position || 'N/A')
        );
    });

    // Thống kê team
    console.log('\n' + '='.repeat(120));
    console.log('📊 THỐNG KÊ TEAM');
    console.log('='.repeat(120));
    
    const teamStats = {};
    const noTeamCount = users.filter(u => !u.team || u.team.trim() === '').length;
    
    users.forEach(user => {
        const team = user.team || '(trống)';
        teamStats[team] = (teamStats[team] || 0) + 1;
    });

    console.log(`Tổng số users: ${users.length}`);
    console.log(`Users có team: ${users.length - noTeamCount}`);
    console.log(`Users không có team: ${noTeamCount}\n`);

    console.log('Phân bố theo team:');
    console.log('-'.repeat(60));
    Object.entries(teamStats)
        .sort((a, b) => b[1] - a[1])
        .forEach(([team, count]) => {
            const percentage = ((count / users.length) * 100).toFixed(1);
            console.log(`   ${team.padEnd(40)} : ${count.toString().padStart(3)} users (${percentage}%)`);
        });

    // Kiểm tra các email từ JSON
    console.log('\n' + '='.repeat(120));
    console.log('🔍 KIỂM TRA CÁC EMAIL TỪ JSON');
    console.log('='.repeat(120));
    
    const jsonEmails = [
        'biquan2812@gmail.com',
        'vanhoa28052000@gmail.com',
        'myt189753@gmail.com',
        'anhphung916@gmail.com',
        'dungdungdong1409@gmail.com',
        'pquy05211@gmail.com',
        'hienhien07082001@gmail.com'
    ];

    const expectedTeams = {
        'biquan2812@gmail.com': 'MKT - Đức Anh 1',
        'vanhoa28052000@gmail.com': 'Đã nghỉ',
        'myt189753@gmail.com': 'Đã nghỉ',
        'anhphung916@gmail.com': 'HN-MKT',
        'dungdungdong1409@gmail.com': 'Vận đơn - Hảo',
        'pquy05211@gmail.com': 'Vận đơn - Quý',
        'hienhien07082001@gmail.com': 'HCM-Sale Đêm'
    };

    console.log('Email'.padEnd(35) + ' | Team trong DB'.padEnd(25) + ' | Team mong đợi'.padEnd(25) + ' | Trạng thái');
    console.log('-'.repeat(120));

    jsonEmails.forEach(email => {
        const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
        const expectedTeam = expectedTeams[email];
        const actualTeam = user?.team || '(không tìm thấy)';
        const status = user && user.team === expectedTeam ? '✅ Đúng' : '❌ Sai';

        console.log(
            email.padEnd(35) + ' | ' +
            actualTeam.substring(0, 23).padEnd(25) + ' | ' +
            expectedTeam.substring(0, 23).padEnd(25) + ' | ' +
            status
        );
    });

    console.log('\n✅ Hoàn thành!');
}

checkUsersTable().catch(error => {
    console.error('❌ Lỗi:', error);
    process.exit(1);
});
